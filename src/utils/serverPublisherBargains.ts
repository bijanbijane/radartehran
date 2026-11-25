import type { Express, Request, Response, NextFunction } from 'express'; import { isValidFirestoreDocId, isValidIranMobilePhone, sanitizeInput } from './security'; import { resolveCityParamOrReject, validateCityNeighborhoodOwnership } from './geo/cityGeospatialResolver'; import { resolveCityIdForNeighborhood } from '../data/multiCityData'; import { verifyAdminApiAuthorization, verifyFirebaseUserAuthorization, } from './serverAdminAndTelegramSecurity'; import { pushAuditLog, registerPublisherPersistenceHooks, saveDiskPersistedCache, serverSideBuyerLeads } from './serverMarketPulseEngine'; import { checkAccountQuota, checkRateLimit, getClientIp, recordAbuseSignal } from './serverDeliveryAndAbuseGuard'; import { validateListingStateTransition, appendListingPriceHistory, type ListingLifecycleState, type ListingPriceHistoryEntry, } from './listingLifecycleAndPlatformSecurity'; import { normalizeOrGenerateCorrelationId, buildCanonicalApiErrorResponse, buildUserDataPortabilityExport, resolveListingContactDisclosure, globalBackendLifecycle, reconcileUserBuyerAlertsInFirestore, } from './identityLifecycleAndBackendGovernance'; import { executeDurableAccountDeletion } from './accountDeletionExecutor'; import { validateDataCorrectionSubmission } from './buyerAlertsAndCommunityTrust'; import { ensureBucketLoaded, objectStoreIndex, persistObjectStoreIndexNow } from './serverObjectStorageHelpers'; import { formatAreaShort, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export interface ServerPublishedBargainRecord { id: string; ownerUid: string; cityId: string; hoodId: number; hoodName: string; title: string; street: string;
  sqm: number; displayAreaText?: string; dealType: 'خرید' | 'اجاره'; priceMillions: number; priceText: string; priceIntlText?: string; discountPercent: number; buyerProfitText: string; lifecycleState: ListingLifecycleState; contactPhone?: string; contactVisibility: 'publicly_visible' | 'reveal_on_action' | 'authorized_only' | 'not_available'; priceHistory: ListingPriceHistoryEntry[]; createdAtIso: string;
  updatedAtIso: string; expiresAtIso: string; } export interface ServerDataCorrectionRecord { id: string; cityId: string; neighborhoodId: number;
  neighborhoodName: string; category: string; currentDisplayedValue: string; proposedCorrectedValue: string; evidenceNote: string; reporterUid: string | null; status: 'pending_review' | 'approved' | 'rejected'; createdAtIso: string; reviewedAtIso: string | null; }
export const serverPublishedBargains = new Map<string, ServerPublishedBargainRecord>(); export const serverDataCorrections: ServerDataCorrectionRecord[] = [];
const MAX_PUBLISHED_BARGAINS_TOTAL = 500; const MAX_PUBLISHED_BARGAINS_PER_OWNER = 25;
registerPublisherPersistenceHooks({
  exportState: () => ({ bargains: Array.from(serverPublishedBargains.values()).slice(0, MAX_PUBLISHED_BARGAINS_TOTAL).map((b) => ({ ...b, contactPhone: undefined, contactVisibility: 'not_available' })), corrections: serverDataCorrections.slice(0, 200) }),
  importState: ({ bargains, corrections }) => {
    if (Array.isArray(bargains)) { for (const raw of bargains) { if (raw && typeof raw === 'object' && typeof (raw as ServerPublishedBargainRecord).id === 'string' && typeof (raw as ServerPublishedBargainRecord).ownerUid === 'string') { const rec = raw as ServerPublishedBargainRecord; if (!serverPublishedBargains.has(rec.id)) serverPublishedBargains.set(rec.id, { ...rec, contactPhone: undefined, contactVisibility: rec.contactVisibility === 'not_available' ? 'not_available' : 'not_available' }); } } }
    if (Array.isArray(corrections)) { for (const raw of corrections) { if (raw && typeof raw === 'object' && typeof (raw as ServerDataCorrectionRecord).id === 'string' && !serverDataCorrections.some((c) => c.id === (raw as ServerDataCorrectionRecord).id)) serverDataCorrections.push(raw as ServerDataCorrectionRecord); } if (serverDataCorrections.length > 200) serverDataCorrections.length = 200; }
  },
});
const safeAsync = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response) => {
  void fn(req, res).catch(() => { if (!res.headersSent) res.status(500).json({ status: 'error', code: 'INTERNAL_SERVER_ERROR' }); });
};
const registeredPublisherApps = new WeakSet<Express>();
export function registerPublisherAndPlatformRoutes(app: Express): void { if (registeredPublisherApps.has(app)) return; registeredPublisherApps.add(app); globalBackendLifecycle.markReady();
  app.use((req: Request, res: Response, next: NextFunction) => { const corrId = normalizeOrGenerateCorrelationId(
      req.headers['x-correlation-id'] as string | undefined, ); res.setHeader('X-Correlation-Id', corrId); (req as Request & { correlationId?: string }).correlationId = corrId;
    if (req.path !== '/api/health/readiness' && req.path !== '/api/health/liveness' && globalBackendLifecycle.onRequestStart()) {
      let done = false;
      const finish = () => { if (!done) { done = true; globalBackendLifecycle.onRequestEnd(); } };
      res.once('finish', finish); res.once('close', finish);
    }
    next(); });
  app.get('/api/health/liveness', (_req: Request, res: Response) => { res.setHeader('Cache-Control', 'no-store'); res.status(200).json({ ok: true,
      probe: 'liveness', state: globalBackendLifecycle.getState(), uptimeSeconds: Math.round(process.uptime()), });
  }); app.get('/api/health/readiness', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store'); const accepting = globalBackendLifecycle.isAcceptingTraffic();
    res.status(accepting ? 200 : 503).json({
      ok: accepting, probe: 'readiness', state: globalBackendLifecycle.getState(), activeRequests: globalBackendLifecycle.getActiveRequestsCount(),
      services: {
        firebase: { configured: true, databaseEngine: 'Cloud Firestore' },
        cloudDatabase: { d1Ready: accepting, objectStorageReady: accepting },
      },
    });
  });
  app.get('/api/my-bargains', safeAsync(async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyFirebaseUserAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) {
      recordAbuseSignal(getClientIp(req), 'auth_failure'); const err = buildCanonicalApiErrorResponse({
        code: 'AUTH_REQUIRED', category: 'authentication',
        messageFa: 'برای مشاهده آگهی‌های ثبت‌شده خود ابتدا وارد حساب کاربری شوید.',
        correlationId: (req as Request & { correlationId?: string }).correlationId,
      });
      res.status(err.httpStatus).json(err.body); return;
    }
    const items = Array.from(serverPublishedBargains.values())
      .filter((item) => item.ownerUid === auth.uid && item.lifecycleState !== 'archived')
      .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
    res.status(200).json({ status: 'ok', items });
  }));
  app.post('/api/my-bargains', safeAsync(async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyFirebaseUserAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { recordAbuseSignal(getClientIp(req), 'auth_failure'); res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'ورود به حساب الزامی است.' }); return; }
    const rawId = sanitizeInput(req.body?.id || `brg_${Date.now()}`, 80);
    if (!isValidFirestoreDocId(rawId)) { res.status(400).json({ status: 'error', code: 'INVALID_BARGAIN_ID', message: 'شناسه آگهی معتبر نیست.' }); return; }
    const title = sanitizeInput(req.body?.title || '', 120);
    const street = sanitizeInput(req.body?.street || '', 120);
    const sqm = Math.round(Number(req.body?.sqm) || 0);
    const priceMillions = Number(req.body?.priceMillions) || 0;
    const dealType: 'خرید' | 'اجاره' = req.body?.dealType === 'اجاره' ? 'اجاره' : 'خرید';
    const hoodId = Math.trunc(Number(req.body?.hoodId ?? 1));
    const cityCheck = resolveCityParamOrReject(req.body?.cityId, { allowOmittedDefault: 'tehran' });
    if (!cityCheck.ok) { res.status(400).json({ status: 'error', code: cityCheck.code, message: cityCheck.messageFa }); return; }
    const cityId = cityCheck.cityId;
    if (!cityCheck.wasOmitted && hoodId >= 1 && hoodId <= 999) {
      const ownership = validateCityNeighborhoodOwnership(cityId, hoodId, resolveCityIdForNeighborhood);
      if (!ownership.ok) { res.status(400).json({ status: 'error', code: ownership.code, message: ownership.messageFa }); return; }
    }
    const rawPhone = sanitizeInput(req.body?.contactPhone || '', 20);
    if (title.length < 3 || hoodId < 1 || hoodId > 999 || sqm < 15 || sqm > 5000 || priceMillions <= 0 || priceMillions > 10_000_000 || (rawPhone && !isValidIranMobilePhone(rawPhone))) {
      res.status(400).json({ status: 'error', code: 'INVALID_BARGAIN_PAYLOAD', message: 'مشخصات عنوان، متراژ، قیمت یا شماره تماس آگهی معتبر نیست.' });
      return;
    }
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const existing = serverPublishedBargains.get(rawId);
    if (existing && existing.ownerUid !== auth.uid) { recordAbuseSignal(getClientIp(req), 'auth_failure'); res.status(403).json({ status: 'error', code: 'FORBIDDEN_OWNER_MISMATCH' }); return; }
    if (!existing) {
      const ownerCount = Array.from(serverPublishedBargains.values()).filter((b) => b.ownerUid === auth.uid && b.lifecycleState !== 'archived').length;
      if (ownerCount >= MAX_PUBLISHED_BARGAINS_PER_OWNER || serverPublishedBargains.size >= MAX_PUBLISHED_BARGAINS_TOTAL) {
        res.status(429).json({ status: 'error', code: 'LISTING_QUOTA_EXCEEDED', message: 'سقف مجاز ثبت آگهی فعال برای حساب کاربری تکمیل شده است.' });
        return;
      }
    }
    const priceHistory = appendListingPriceHistory(existing?.priceHistory || [], priceMillions, dealType, auth.uid, nowIso);
    const areaUnit: AreaUnit = req.body?.areaUnit === 'sqft' ? 'sqft' : 'sqm';
    const intlCurrency: IntlCurrencyCode = ['IRT', 'USD', 'EUR', 'AED'].includes(String(req.body?.intlCurrency)) ? (req.body.intlCurrency as IntlCurrencyCode) : 'USD';
    const record: ServerPublishedBargainRecord = {
      id: rawId, ownerUid: auth.uid, cityId, hoodId,
      hoodName: sanitizeInput(req.body?.hoodName || 'تهران', 80), title, street, sqm,
      displayAreaText: formatAreaShort(sqm, areaUnit), dealType, priceMillions,
      priceText: sanitizeInput(req.body?.priceText || `${priceMillions} میلیون تومان`, 80),
      priceIntlText: formatMillionTomanAsIntlCurrency(priceMillions, intlCurrency),
      discountPercent: Math.max(0, Math.min(60, Number(req.body?.discountPercent) || 0)),
      buyerProfitText: sanitizeInput(req.body?.buyerProfitText || '', 80),
      lifecycleState: 'published', contactPhone: rawPhone,
      contactVisibility: 'reveal_on_action', priceHistory,
      createdAtIso: existing?.createdAtIso || nowIso, updatedAtIso: nowIso, expiresAtIso: expiresIso,
    };
    serverPublishedBargains.set(rawId, record);
    saveDiskPersistedCache();
    pushAuditLog('INFO', `ثبت/همگام‌سازی آگهی شکار #${rawId} در سرور Express انجام شد.`);
    res.status(200).json({ status: 'ok', item: record });
  }));
  app.patch('/api/my-bargains/:id', safeAsync(async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyFirebaseUserAuthorization(
      req.headers as Record<string, string | string[] | undefined>,
    );
    const adminAuth = await verifyAdminApiAuthorization(
      req.headers as Record<string, string | string[] | undefined>,
      process.env,
      { requirePrimaryBootstrapAdmin: true, disallowStaticToken: true },
    );
    if (!auth.authorized && !adminAuth.authorized) {
      res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED' });
      return;
    }
    const id = sanitizeInput(req.params.id, 80);
    const existing = serverPublishedBargains.get(id);
    if (!existing) {
      res.status(404).json({ status: 'error', code: 'BARGAIN_NOT_FOUND', message: 'آگهی یافت نشد.' });
      return;
    }
    const isOwner = Boolean(auth.uid && existing.ownerUid === auth.uid);
    if (!isOwner && !adminAuth.authorized) {
      res.status(403).json({
        status: 'error',
        code: 'FORBIDDEN_NOT_OWNER',
        message: 'شما مجاز به ویرایش آگهی کاربر دیگر نیستید.',
      });
      return;
    }
    const requestedState = req.body?.lifecycleState as ListingLifecycleState | undefined;
    if (requestedState) {
      const check = validateListingStateTransition(
        existing.lifecycleState,
        requestedState,
        adminAuth.authorized ? 'admin' : 'owner',
        existing.dealType,
      );
      if (!check.allowed) {
        res.status(400).json({ status: 'error', code: 'INVALID_STATE_TRANSITION', message: check.reasonFa });
        return;
      }
      existing.lifecycleState = requestedState;
    }
    const areaUnit: AreaUnit = req.body?.areaUnit === 'sqft' ? 'sqft' : 'sqm';
    const intlCurrency: IntlCurrencyCode = ['IRT', 'USD', 'EUR', 'AED'].includes(String(req.body?.intlCurrency)) ? (req.body.intlCurrency as IntlCurrencyCode) : 'USD';
    if (typeof req.body?.title === 'string' && req.body.title.trim().length >= 3) {
      existing.title = sanitizeInput(req.body.title, 120);
    }
    if (typeof req.body?.street === 'string') {
      existing.street = sanitizeInput(req.body.street, 120);
    }
    if (Number.isFinite(Number(req.body?.sqm)) && Number(req.body.sqm) >= 15 && Number(req.body.sqm) <= 5000) {
      existing.sqm = Math.round(Number(req.body.sqm));
      existing.displayAreaText = formatAreaShort(existing.sqm, areaUnit);
    }
    if (Number.isFinite(Number(req.body?.priceMillions)) && Number(req.body.priceMillions) > 0 && Number(req.body.priceMillions) <= 10_000_000) {
      existing.priceMillions = Number(req.body.priceMillions);
      existing.priceText = typeof req.body?.priceText === 'string' && req.body.priceText.trim()
        ? sanitizeInput(req.body.priceText, 80)
        : `${existing.priceMillions} میلیون تومان`;
      existing.priceIntlText = formatMillionTomanAsIntlCurrency(existing.priceMillions, intlCurrency);
      existing.priceHistory = appendListingPriceHistory(existing.priceHistory, existing.priceMillions, existing.dealType, auth.uid || 'admin');
    }
    existing.updatedAtIso = new Date().toISOString();
    serverPublishedBargains.set(id, existing);
    saveDiskPersistedCache();
    res.status(200).json({ status: 'ok', item: existing });
  }));
  app.delete('/api/my-bargains/:id', safeAsync(async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyFirebaseUserAuthorization(
      req.headers as Record<string, string | string[] | undefined>,
    );
    const adminAuth = await verifyAdminApiAuthorization(
      req.headers as Record<string, string | string[] | undefined>,
      process.env,
      { requirePrimaryBootstrapAdmin: true, disallowStaticToken: true },
    );
    if (!auth.authorized && !adminAuth.authorized) {
      res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED' });
      return;
    }
    const id = sanitizeInput(req.params.id, 80);
    const existing = serverPublishedBargains.get(id);
    if (!existing) {
      res.status(404).json({ status: 'error', code: 'BARGAIN_NOT_FOUND' });
      return;
    }
    if (existing.ownerUid !== auth.uid && !adminAuth.authorized) {
      res.status(403).json({ status: 'error', code: 'FORBIDDEN_NOT_OWNER' });
      return;
    }
    serverPublishedBargains.delete(id);
    saveDiskPersistedCache();
    await ensureBucketLoaded();
    let mediaMutated = false;
    for (const obj of objectStoreIndex) { if (obj.bargainId === id) { obj.deletionState = 'pending_delete'; mediaMutated = true; } }
    if (mediaMutated) await persistObjectStoreIndexNow().catch(() => {});
    pushAuditLog('INFO', `حذف آگهی شکار #${id} توسط مالک/ادمین انجام شد.`);
    res.status(200).json({ status: 'ok', deletedId: id });
  }));
  app.post('/api/bargains/:id/reveal-contact', safeAsync(async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const ip = getClientIp(req);
    if (!checkRateLimit(ip, 'call_track', 15, 10 * 60 * 1000)) {
      res.status(429).json({ status: 'error', code: 'CONTACT_REVEAL_RATE_LIMIT' });
      return;
    }
    const id = sanitizeInput(req.params.id, 80);
    const item = serverPublishedBargains.get(id);
    if (!item || item.lifecycleState !== 'published') {
      res.status(404).json({ status: 'error', code: 'LISTING_UNAVAILABLE' });
      return;
    }
    const auth = await verifyFirebaseUserAuthorization(
      req.headers as Record<string, string | string[] | undefined>,
    );
    if (auth.uid && !checkAccountQuota(auth.uid, 'contact_reveal', 20, 15 * 60 * 1000)) {
      res.status(429).json({ status: 'error', code: 'ACCOUNT_QUOTA_EXCEEDED' });
      return;
    }
    const disclosure = resolveListingContactDisclosure({
      rawPhone: item.contactPhone,
      policy: item.contactVisibility,
      explicitRevealRequested: true,
      isAuthenticated: auth.authorized,
    });
    res.status(200).json({ status: 'ok', disclosure });
  }));
  app.post('/api/data-corrections', safeAsync(async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const ip = getClientIp(req);
    if (!checkRateLimit(ip, 'lead', 10, 10 * 60 * 1000)) {
      res.status(429).json({ status: 'error', code: 'CORRECTION_RATE_LIMIT_EXCEEDED' });
      return;
    }
    const auth = await verifyFirebaseUserAuthorization(req.headers as Record<string, string | string[] | undefined>);
    const cityCheck = resolveCityParamOrReject(req.body?.cityId, { allowOmittedDefault: 'tehran' });
    if (!cityCheck.ok) { res.status(400).json({ status: 'error', code: cityCheck.code, message: cityCheck.messageFa }); return; }
    const cityId = cityCheck.cityId;
    const hoodId = Number(req.body?.neighborhoodId ?? req.body?.hoodId);
    if (!cityCheck.wasOmitted && Number.isInteger(hoodId) && hoodId >= 1) {
      const ownership = validateCityNeighborhoodOwnership(cityId, hoodId, resolveCityIdForNeighborhood);
      if (!ownership.ok) { res.status(400).json({ status: 'error', code: ownership.code, message: ownership.messageFa }); return; }
    }
    const hoodName = sanitizeInput(req.body?.neighborhoodName || req.body?.hoodName || '', 80);
    const field = req.body?.category || req.body?.field || 'buyPerSqm';
    const currentDisplayedValue = sanitizeInput(String(req.body?.currentDisplayedValue ?? ''), 120);
    const rawProposedValue = sanitizeInput(String(req.body?.proposedCorrectedValue ?? req.body?.rawProposedValue ?? ''), 120);
    const evidenceNote = sanitizeInput(req.body?.evidenceNote || req.body?.reasonFa || '', 600);
    const check = validateDataCorrectionSubmission({
      cityId, hoodId, hoodName, field, currentDisplayedValue, rawProposedValue,
      reasonFa: evidenceNote || 'گزارش اصلاح داده محله', evidenceNoteFa: evidenceNote,
    });
    if (!check.valid) {
      res.status(400).json({ status: 'error', code: 'INVALID_CORRECTION_REPORT', message: check.errorMessageFa });
      return;
    }
    const record: ServerDataCorrectionRecord = {
      id: `corr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      cityId, neighborhoodId: hoodId, neighborhoodName: hoodName, category: String(field),
      currentDisplayedValue, proposedCorrectedValue: String(check.normalizedProposedValue),
      evidenceNote, reporterUid: auth.authorized && auth.uid ? auth.uid : null, status: 'pending_review',
      createdAtIso: new Date().toISOString(), reviewedAtIso: null,
    };
    serverDataCorrections.unshift(record);
    if (serverDataCorrections.length > 200) serverDataCorrections.length = 200;
    pushAuditLog('INFO', `ثبت گزارش اصلاح داده محله ${record.neighborhoodName} (${record.category})`);
    saveDiskPersistedCache();
    res.status(200).json({ status: 'ok', report: record });
  }));
  app.get('/api/account/export-data', safeAsync(async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyFirebaseUserAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED' }); return; }
    const ownListings = Array.from(serverPublishedBargains.values()).filter((b) => b.ownerUid === auth.uid);
    const firestoreLeads = await reconcileUserBuyerAlertsInFirestore(auth.uid, 'export', req.headers.authorization);
    const seenAlertKeys = new Set(firestoreLeads.flatMap((l) => [`${l.id || ''}_${l.hoodId}`, `${l.hoodId}_${l.dealType || ''}_${l.maxBudgetText || ''}`]));
    const ownBuyerLeads = [...firestoreLeads, ...serverSideBuyerLeads.filter((l) => l.submittedByUid === auth.uid).filter((l) => !seenAlertKeys.has(`${l.id || ''}_${l.hoodId}`) && !seenAlertKeys.has(`${l.hoodId}_${l.dealType || ''}_${l.maxBudgetText || ''}`))];
    for (const fl of firestoreLeads) { if (!serverSideBuyerLeads.some((m) => m.submittedByUid === auth.uid && m.hoodId === fl.hoodId && m.dealType === fl.dealType)) serverSideBuyerLeads.unshift(fl); }
    if (serverSideBuyerLeads.length > 200) serverSideBuyerLeads.length = 200;
    const ownCorrections = serverDataCorrections.filter((c) => c.reporterUid === auth.uid);
    const ownMediaObjects = objectStoreIndex.filter((o) => o.ownerUid === auth.uid && String(o.deletionState) !== 'deleted').map((o) => ({ id: o.id, bargainId: o.bargainId, mimeType: o.mimeType, createdAtIso: o.createdAtIso }));
    const unavailableSources = !req.headers.authorization && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? ['buyer_alerts_firestore'] : [];
    const envelope = buildUserDataPortabilityExport({ ownerUid: auth.uid, publishedListings: ownListings, savedAlerts: ownBuyerLeads, unavailableSources, sources: [
      { id: 'server_published_bargains', origin: 'server', available: true, count: ownListings.length },
      { id: 'server_buyer_alerts', origin: 'server', available: unavailableSources.length === 0, count: ownBuyerLeads.length },
      { id: 'server_data_corrections', origin: 'server', available: true, count: ownCorrections.length },
      { id: 'server_media_objects', origin: 'server', available: true, count: ownMediaObjects.length },
    ] });
    res.status(200).json({ status: 'ok', exportData: { ...envelope, buyerLeads: ownBuyerLeads, dataCorrections: ownCorrections, mediaObjects: ownMediaObjects } });
  }));
  app.post('/api/account/delete', safeAsync(async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyFirebaseUserAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED' }); return; }
    if (req.body?.confirmDelete !== true) { res.status(400).json({ status: 'error', code: 'EXPLICIT_CONFIRMATION_REQUIRED', message: 'تأیید صریح حذف حساب کاربری الزامی است.' }); return; }
    await reconcileUserBuyerAlertsInFirestore(auth.uid, 'delete', req.headers.authorization);
    for (let i = serverSideBuyerLeads.length - 1; i >= 0; i--) { if (serverSideBuyerLeads[i].submittedByUid === auth.uid) serverSideBuyerLeads.splice(i, 1); }
    const ownedBargainIdsHint = Array.isArray(req.body?.ownedBargainIds) ? req.body.ownedBargainIds.filter((id: unknown): id is string => typeof id === 'string').slice(0, 50) : undefined;
    const deletionResult = await executeDurableAccountDeletion({ uid: auth.uid, rawAuthHeaderOrToken: req.headers.authorization, ownedBargainIdsHint, serverPublishedBargains, serverSideBuyerLeads, serverDataCorrections, saveDiskPersistedCache, objectStoreIndex, persistObjectStoreIndexNow });
    pushAuditLog('INFO', `درخواست حذف حساب کاربری اجرا شد (${deletionResult.status}؛ رسانه حذف‌شده: ${deletionResult.deletedMediaCount}).`);
    res.status(200).json(deletionResult);
  }));
}
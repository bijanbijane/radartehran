import type { Express, Request, Response, NextFunction } from 'express'; import { isValidFirestoreDocId, isValidIranMobilePhone, sanitizeInput, validateCityParam } from './security'; import { verifyAdminApiAuthorization, verifyFirebaseUserAuthorization, } from './serverAdminAndTelegramSecurity'; import { pushAuditLog, saveDiskPersistedCache, serverSideBuyerLeads } from './serverMarketPulseEngine'; import { checkAccountQuota, checkRateLimit, getClientIp } from './serverDeliveryAndAbuseGuard'; import { validateListingStateTransition, appendListingPriceHistory, type ListingLifecycleState, type ListingPriceHistoryEntry, } from './listingLifecycleAndPlatformSecurity'; import { normalizeOrGenerateCorrelationId, buildCanonicalApiErrorResponse, buildUserDataPortabilityExport, createAccountDeletionPlan, resolveListingContactDisclosure, globalBackendLifecycle, reconcileUserBuyerAlertsInFirestore, } from './identityLifecycleAndBackendGovernance'; import { validateDataCorrectionSubmission } from './buyerAlertsAndCommunityTrust'; import { ensureBucketLoaded, objectStoreIndex, persistObjectStoreIndexNow } from './serverObjectStorageHelpers'; import { formatAreaShort, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export interface ServerPublishedBargainRecord { id: string; ownerUid: string; cityId: string; hoodId: number; hoodName: string; title: string; street: string;
  sqm: number; displayAreaText?: string; dealType: 'خرید' | 'اجاره'; priceMillions: number; priceText: string; priceIntlText?: string; discountPercent: number; buyerProfitText: string; lifecycleState: ListingLifecycleState; contactPhone?: string; contactVisibility: 'publicly_visible' | 'reveal_on_action' | 'authorized_only' | 'not_available'; priceHistory: ListingPriceHistoryEntry[]; createdAtIso: string;
  updatedAtIso: string; expiresAtIso: string; } export interface ServerDataCorrectionRecord { id: string; cityId: string; neighborhoodId: number;
  neighborhoodName: string; category: string; currentDisplayedValue: string; proposedCorrectedValue: string; evidenceNote: string; reporterUid: string | null; status: 'pending_review' | 'approved' | 'rejected'; createdAtIso: string; reviewedAtIso: string | null; }
export const serverPublishedBargains = new Map<string, ServerPublishedBargainRecord>(); export const serverDataCorrections: ServerDataCorrectionRecord[] = [];
const MAX_PUBLISHED_BARGAINS_TOTAL = 500; const MAX_PUBLISHED_BARGAINS_PER_OWNER = 25;
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
    res.status(accepting ? 200 : 503).json({ ok: accepting, probe: 'readiness', state: globalBackendLifecycle.getState(), activeRequests: globalBackendLifecycle.getActiveRequestsCount() });
  });
  app.get('/api/my-bargains', safeAsync(async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyFirebaseUserAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) {
      const err = buildCanonicalApiErrorResponse({
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
    if (!auth.authorized || !auth.uid) { res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'ورود به حساب الزامی است.' }); return; }
    const rawId = sanitizeInput(req.body?.id || `brg_${Date.now()}`, 80);
    if (!isValidFirestoreDocId(rawId)) { res.status(400).json({ status: 'error', code: 'INVALID_BARGAIN_ID', message: 'شناسه آگهی معتبر نیست.' }); return; }
    const title = sanitizeInput(req.body?.title || '', 120);
    const street = sanitizeInput(req.body?.street || '', 120);
    const sqm = Math.round(Number(req.body?.sqm) || 0);
    const priceMillions = Number(req.body?.priceMillions) || 0;
    const dealType: 'خرید' | 'اجاره' = req.body?.dealType === 'اجاره' ? 'اجاره' : 'خرید';
    const hoodId = Math.trunc(Number(req.body?.hoodId) || 1);
    const cityId = validateCityParam(req.body?.cityId, 'tehran');
    const rawPhone = sanitizeInput(req.body?.contactPhone || '', 20);
    if (title.length < 3 || sqm < 15 || sqm > 5000 || priceMillions <= 0 || priceMillions > 10_000_000 || (rawPhone && !isValidIranMobilePhone(rawPhone))) {
      res.status(400).json({ status: 'error', code: 'INVALID_BARGAIN_PAYLOAD', message: 'مشخصات عنوان، متراژ، قیمت یا شماره تماس آگهی معتبر نیست.' });
      return;
    }
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const existing = serverPublishedBargains.get(rawId);
    if (existing && existing.ownerUid !== auth.uid) {
      res.status(403).json({ status: 'error', code: 'FORBIDDEN_OWNER_MISMATCH' });
      return;
    }
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
    res.status(200).json({ status: 'ok', item: existing });
  }));
  app.delete('/api/my-bargains/:id', safeAsync(async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyFirebaseUserAuthorization(
      req.headers as Record<string, string | string[] | undefined>,
    );
    const adminAuth = await verifyAdminApiAuthorization(
      req.headers as Record<string, string | string[] | undefined>,
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
    const cityId = validateCityParam(req.body?.cityId, 'tehran');
    const hoodId = Number(req.body?.neighborhoodId ?? req.body?.hoodId);
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
    const auth = await verifyFirebaseUserAuthorization(
      req.headers as Record<string, string | string[] | undefined>,
    );
    if (!auth.authorized || !auth.uid) {
      res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED' });
      return;
    }
    const ownListings = Array.from(serverPublishedBargains.values()).filter((b) => b.ownerUid === auth.uid);
    const firestoreLeads = await reconcileUserBuyerAlertsInFirestore(auth.uid, 'export');
    const seenAlertKeys = new Set(firestoreLeads.map((l) => `${l.id || ''}_${l.hoodId}`));
    const ownBuyerLeads = [...firestoreLeads, ...serverSideBuyerLeads.filter((l) => l.submittedByUid === auth.uid).filter((l) => !seenAlertKeys.has(`${l.id || ''}_${l.hoodId}`))];
    const ownCorrections = serverDataCorrections.filter((c) => c.reporterUid === auth.uid);
    const envelope = buildUserDataPortabilityExport({ ownerUid: auth.uid, publishedListings: ownListings, savedAlerts: ownBuyerLeads });
    res.status(200).json({ status: 'ok', exportData: { ...envelope, buyerLeads: ownBuyerLeads, dataCorrections: ownCorrections } });
  }));
  app.post('/api/account/delete', safeAsync(async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = await verifyFirebaseUserAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED' }); return; }
    if (req.body?.confirmDelete !== true) {
      res.status(400).json({ status: 'error', code: 'EXPLICIT_CONFIRMATION_REQUIRED', message: 'تأیید صریح حذف حساب کاربری الزامی است.' });
      return;
    }
    await reconcileUserBuyerAlertsInFirestore(auth.uid, 'delete');
    for (const [id, rec] of serverPublishedBargains.entries()) { if (rec.ownerUid === auth.uid) serverPublishedBargains.delete(id); }
    for (let i = serverSideBuyerLeads.length - 1; i >= 0; i--) { if (serverSideBuyerLeads[i].submittedByUid === auth.uid) serverSideBuyerLeads.splice(i, 1); }
    for (let i = serverDataCorrections.length - 1; i >= 0; i--) { if (serverDataCorrections[i].reporterUid === auth.uid) serverDataCorrections.splice(i, 1); }
    saveDiskPersistedCache();
    await ensureBucketLoaded();
    let mediaMutated = false;
    for (const obj of objectStoreIndex) { if (obj.ownerUid === auth.uid) { obj.deletionState = 'pending_delete'; mediaMutated = true; } }
    if (mediaMutated) await persistObjectStoreIndexNow().catch(() => {});
    const plan = createAccountDeletionPlan().map((step) => ({ ...step, completed: true }));
    pushAuditLog('INFO', 'درخواست حذف کامل حساب کاربری و پاکسازی آگهی‌های وابسته اجرا شد.');
    res.status(200).json({ status: 'ok', steps: plan });
  }));
}
import crypto from 'node:crypto'; import type { Express, Request, Response } from 'express'; import { FieldValue } from 'firebase-admin/firestore'; import { INITIAL_NEIGHBORHOODS, type Neighborhood } from '../data/neighborhoods'; import { MULTI_CITY_CONFIGS, getAllMultiCityNeighborhoods } from '../data/multiCityData'; import { sanitizeInput, validateCityParam, validateNeighborhoodId, isValidIranMobilePhone, isValidFirestoreDocId, computeCanonicalSponsorPricing, computeSponsorExpirationIso, computeExtendedSponsorExpirationIso, computeCanonicalBargainFinancials, isValidBargainStateTransition, sanitizeSponsorRecord } from './security'; import { verifyAuthenticatedUserHeader, verifyAdminApiAuthorization, verifyFirebaseAppCheckHeader, getFirebaseAdminFirestoreForServer, executeAuthorizedAdminFirestoreOperation } from './serverAdminAndTelegramSecurity'; import { recordLiveAdminSecurityAudit } from './serverForensicsAndIncidentResponse'; import { recordAbuseSignal, type RateBucketType } from './serverDeliveryAndAbuseGuard'; import { ensureBucketLoaded, objectStoreIndex, persistObjectStoreIndexNow } from './serverObjectStorageHelpers'; import { calculateDynamicSponsorTariff } from './objectStorage'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
import { registerBackupAndChunkUploadRoutes, getBackupVersionHistoryMetadata, type BackupVersionMetadata } from './serverBackupAndChunkUploadRoutes'; export { getBackupVersionHistoryMetadata, type BackupVersionMetadata }; export interface SponsorBargainRoutesDeps { checkRateLimit: (ip: string, bucketType: RateBucketType, maxRequests: number, windowMs: number, now?: number) => boolean; getClientIp: (req: Request) => string; }
export async function executePostCommitSideEffectsTransaction<TResult>(params: { runDatabaseCommit: () => Promise<TResult>; runPostCommitSideEffects?: (committedResult: TResult) => Promise<void>; }): Promise<{ ok: true; result: TResult; postCommitWarning?: string } | { ok: false; code: string; messageFa: string }> { let result: TResult; try { result = await params.runDatabaseCommit(); } catch (err: any) { const rawMsg = String(err?.message || ''); const isConflict = /aborted|contention|conflict|precondition/i.test(rawMsg); return { ok: false, code: isConflict ? 'TRANSACTION_CONFLICT_RETRYABLE' : 'DATABASE_COMMIT_FAILED', messageFa: isConflict
        ? 'تداخل هم‌زمانی در ثبت تراکنش رخ داد؛ لطفاً مجدداً تلاش کنید.'
        : 'خطا در ثبت تراکنش پایگاه داده؛ هیچ تغییر ناقصی اعمال نشد.', }; } if (params.runPostCommitSideEffects) { try { await params.runPostCommitSideEffects(result); } catch { return { ok: true, result, postCommitWarning: 'POST_COMMIT_SIDE_EFFECT_DEFERRED' }; } }
  return { ok: true, result }; } export function runSecurityPreservingSchemaMigration( records: ReadonlyArray<Record<string, unknown>>, options: { dryRun?: boolean; nowMs?: number; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode } = {}, ): { migrated: Record<string, unknown>[]; quarantinedIds: string[]; skippedNewerIds: string[]; dryRun: boolean; displayAreaUnitLabel: string; referenceValuationIntlText: string } { const migrated: Record<string, unknown>[] = []; const quarantinedIds: string[] = []; const skippedNewerIds: string[] = []; const nowMs = options.nowMs ?? Date.now(); for (const rec of records.slice(0, 500)) { if (!rec || typeof rec !== 'object' || Array.isArray(rec)) { quarantinedIds.push('invalid_id'); continue; } const id = typeof rec.id === 'string' ? rec.id : ''; if (!isValidFirestoreDocId(id)) { quarantinedIds.push(id || 'invalid_id'); continue; } const ownerUid = typeof rec.createdByUid === 'string' && rec.createdByUid.trim()
      ? rec.createdByUid.trim()
      : typeof rec.ownerUid === 'string' && rec.ownerUid.trim() ? rec.ownerUid.trim() : ''; if (!ownerUid) { quarantinedIds.push(id); continue; } if ((typeof rec.schemaVersion === 'number' && rec.schemaVersion > 2) || (rec.schemaVersion === 2 && typeof rec.updatedAtMs === 'number' && rec.updatedAtMs > nowMs)) { skippedNewerIds.push(id); continue; }
    const status = rec.status === 'approved' || rec.status === 'rejected' ? rec.status : 'pending'; const safeCopy = Object.fromEntries(Object.entries(rec).filter(([k]) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype')); migrated.push({ ...safeCopy, id, createdByUid: ownerUid, status, schemaVersion: 2, migratedAtIso: new Date(nowMs).toISOString() }); }
  return { migrated, quarantinedIds, skippedNewerIds, dryRun: Boolean(options.dryRun), displayAreaUnitLabel: formatAreaUnitLabel(options.areaUnit ?? 'sqm'), referenceValuationIntlText: formatMillionTomanAsIntlCurrency(10000, options.intlCurrency ?? 'USD', 'en') }; } const sponsorIdempotencyMap = new Map<
  string, { response: Record<string, unknown>; createdAtMs: number } >(); const MAX_SPONSOR_IDEMPOTENCY_ENTRIES = 250; const SPONSOR_IDEMPOTENCY_TTL_MS = 15 * 60 * 1000; const registeredSponsorBargainApps = new WeakSet<Express>();
function pruneSponsorIdempotencyMap(nowMs = Date.now()): void { for (const [k, v] of sponsorIdempotencyMap.entries()) { if (nowMs - v.createdAtMs >= SPONSOR_IDEMPOTENCY_TTL_MS) sponsorIdempotencyMap.delete(k); } while (sponsorIdempotencyMap.size >= MAX_SPONSOR_IDEMPOTENCY_ENTRIES) { const oldestKey = sponsorIdempotencyMap.keys().next().value; if (!oldestKey) break; sponsorIdempotencyMap.delete(oldestKey); } }
const ALLOWED_SPONSOR_RESERVE_KEYS: ReadonlySet<string> = new Set([
  'hoodId', 'hoodName', 'city', 'agencyName', 'phone', 'specialty', 'experienceYears', 'planMonths', ]); function resolveServerNeighborhood(rawCity: unknown, rawHoodId: unknown): { hoodId: number | null; matchedHood?: Neighborhood } { const city = validateCityParam(rawCity, 'tehran'); const cityHoods = city === 'tehran' ? INITIAL_NEIGHBORHOODS : MULTI_CITY_CONFIGS[city]?.neighborhoods || []; const allHoods = getAllMultiCityNeighborhoods(); const hoodId = validateNeighborhoodId(rawHoodId, allHoods.map((h) => h.id));
  const matchedHood = hoodId ? (cityHoods.find((h) => h.id === hoodId) || allHoods.find((h) => h.id === hoodId)) : undefined; return { hoodId, matchedHood }; }
export function registerSponsorAndBargainRoutes( app: Express, deps: SponsorBargainRoutesDeps, ): void { if (registeredSponsorBargainApps.has(app)) return; registeredSponsorBargainApps.add(app); const { checkRateLimit, getClientIp } = deps; registerBackupAndChunkUploadRoutes(app, { checkRateLimit, getClientIp }); app.post('/api/sponsors/reserve', (req: Request, res: Response) => { void (async () => {
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate'); const ip = getClientIp(req); if (!checkRateLimit(ip, 'lead', 10, 10 * 60 * 1000)) { res.status(429).json({ status: 'error', code: 'SPONSOR_RATE_LIMIT_EXCEEDED',
          message: 'تعداد درخواست‌های رزرو اسپانسر بیش از حد مجاز است.', }); return; }
      const appCheck = await verifyFirebaseAppCheckHeader(req.headers as Record<string, string | string[] | undefined>, process.env); if (!appCheck.allowed) { res.status(appCheck.statusCode).json({ status: 'error', code: appCheck.reason, message: 'توکن App Check معتبر نیست.' }); return; }
      const userAuth = await verifyAuthenticatedUserHeader(req.headers, process.env); if (!userAuth.authenticated || !userAuth.uid || !userAuth.email) { recordAbuseSignal(ip, 'auth_failure'); res.status(userAuth.statusCode).json({
          status: 'error', code: userAuth.reason, message: 'برای ثبت درخواست اسپانسرینگ، ورود با حساب کاربری تاییدشده الزامی است.',
        });
        return;
      }
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) { res.status(400).json({ status: 'error', code: 'INVALID_BODY', message: 'ساختار درخواست نامعتبر است.' }); return; }
      for (const k of Object.keys(req.body as Record<string, unknown>)) {
        if (!ALLOWED_SPONSOR_RESERVE_KEYS.has(k)) {
          res.status(400).json({ status: 'error', code: 'FORBIDDEN_CLIENT_PRICING_OR_STATUS_FIELD', message: `ارسال فیلد غیرمجاز (${sanitizeInput(k, 24)}) از سمت کلاینت مسدود است؛ تعرفه و انقضا فقط روی سرور محاسبه می‌شود.` });
          return;
        }
      }
      const idemHeader = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'].trim().slice(0, 64) : '';
      if (idemHeader) {
        const cached = sponsorIdempotencyMap.get(`${userAuth.uid}:${idemHeader}`);
        if (cached && Date.now() - cached.createdAtMs < 15 * 60 * 1000) { res.status(200).json(cached.response); return; }
      }
      const { hoodId, matchedHood } = resolveServerNeighborhood(req.body.city, req.body.hoodId);
      const agencyName = sanitizeInput(req.body.agencyName || '', 80).replace(/[<>]/g, '');
      const phone = sanitizeInput(req.body.phone || '', 20);
      const specialty = sanitizeInput(req.body.specialty || '', 100).replace(/[<>]/g, '');
      const expRaw = Number(req.body.experienceYears);
      const experienceYears = Number.isFinite(expRaw) ? Math.min(80, Math.max(1, Math.round(expRaw))) : 5;
      if (!hoodId || !matchedHood || agencyName.length < 2 || specialty.length < 2 || !isValidIranMobilePhone(phone)) {
        res.status(400).json({
          status: 'error',
          code: 'INVALID_SPONSOR_INPUT',
          message: 'اطلاعات دفتر املاک، محله یا شماره تماس معتبر نیست.',
        });
        return;
      }
      const dynamicTariff = calculateDynamicSponsorTariff(matchedHood.buyPerSqm, matchedHood.name);
      const pricing = computeCanonicalSponsorPricing(dynamicTariff.monthlyMillion, req.body.planMonths);
      const trackingCode = `SP-${hoodId}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const requestId = `${userAuth.uid}_hood_${hoodId}`;
      const createdAtIso = new Date().toISOString();
      const sponsorRequestDoc = {
        id: requestId, hoodId, hoodName: matchedHood.name, agencyName, phone, specialty, experienceYears,
        planMonths: pricing.planMonths, monthlyTariffMillion: pricing.monthlyTariffMillion,
        totalPayableMillion: pricing.totalPayableMillion, totalPayableIntlText: formatMillionTomanAsIntlCurrency(pricing.totalPayableMillion, 'USD', 'en'),
        trackingCode, createdAtIso, status: 'pending' as const, userId: userAuth.uid, userEmail: userAuth.email,
      };
      try {
        await executeAuthorizedAdminFirestoreOperation({
          policy: 'VERIFIED_USER',
          callerUid: userAuth.uid,
          callerEmail: userAuth.email,
          operation: async () => {
            const db = getFirebaseAdminFirestoreForServer(process.env);
            const reqRef = db.collection('sponsorRequests').doc(requestId);
            if (typeof db.runTransaction === 'function') {
              await db.runTransaction(async (tx) => {
                const snap = await tx.get(reqRef);
                const existing = snap.data();
                if (existing?.status === 'approved' && existing?.expiresAtIso && Date.parse(String(existing.expiresAtIso)) > Date.now()) {
                  throw new Error('ACTIVE_SPONSOR_ALREADY_APPROVED');
                }
                tx.set(reqRef, sponsorRequestDoc);
              });
            } else {
              await reqRef.set(sponsorRequestDoc);
            }
          },
        });
      } catch (err: any) {
        if (String(err?.message || '').includes('ACTIVE_SPONSOR_ALREADY_APPROVED')) {
          res.status(409).json({ status: 'error', code: 'ACTIVE_SPONSOR_ALREADY_APPROVED', message: 'درخواست اسپانسرینگ شما برای این محله در حال حاضر فعال است.' });
          return;
        }
        res.status(503).json({ status: 'error', code: 'SPONSOR_PERSIST_FAILED', message: 'ثبت درخواست اسپانسر در پایگاه داده انجام نشد.' });
        return;
      }
      const responsePayload = { status: 'ok', request: sponsorRequestDoc };
      if (idemHeader) {
        pruneSponsorIdempotencyMap(Date.now());
        sponsorIdempotencyMap.set(`${userAuth.uid}:${idemHeader}`, { response: responsePayload, createdAtMs: Date.now() });
      }
      res.status(200).json(responsePayload);
    })();
  });
  app.post('/api/admin/sponsors/approve', (req: Request, res: Response) => {
    void (async () => {
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      const auth = await verifyAdminApiAuthorization(req.headers, process.env);
      if (!auth.authorized) {
        if (auth.statusCode === 401 || auth.statusCode === 403) recordAbuseSignal(getClientIp(req), 'auth_failure');
        res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
        return;
      }
      const requestId = typeof req.body?.requestId === 'string' ? req.body.requestId.trim() : '';
      const hoodId = Number(req.body?.hoodId);
      const planMonths: 1 | 3 = req.body?.planMonths === 3 ? 3 : 1;
      if ((requestId && !isValidFirestoreDocId(requestId)) || !Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999) {
        res.status(400).json({ status: 'error', code: 'INVALID_SPONSOR_APPROVAL_INPUT' });
        return;
      }
      const approvalNowMs = Date.now();
      const expiresAtIso = computeSponsorExpirationIso(approvalNowMs, planMonths);
      const sponsorRecord = sanitizeSponsorRecord(
        { ...req.body?.sponsor, planMonths, expiresAtIso, verified: true },
        { name: 'مشاور منتخب محله', phone: '09120000000', specialty: 'فروش و رهن تخصصی', experienceYears: 5, verified: true, planMonths, expiresAtIso },
      );
      const committed = await executePostCommitSideEffectsTransaction({
        runDatabaseCommit: async () => {
          const db = getFirebaseAdminFirestoreForServer(process.env);
          const hoodRef = db.collection('neighborhoodOverrides').doc(String(hoodId));
          const reqRef = requestId ? db.collection('sponsorRequests').doc(requestId) : null;
          if (typeof db.runTransaction === 'function') {
            await db.runTransaction(async (tx) => {
              await tx.get(hoodRef);
              if (reqRef) tx.set(reqRef, { status: 'approved', expiresAtIso }, { merge: true });
              tx.set(hoodRef, { hoodId, sponsor: sponsorRecord }, { merge: true });
            });
          } else {
            if (reqRef) await reqRef.set({ status: 'approved', expiresAtIso }, { merge: true });
            await hoodRef.set({ hoodId, sponsor: sponsorRecord }, { merge: true });
          }
          return { expiresAtIso, sponsor: sponsorRecord };
        },
        runPostCommitSideEffects: async () => {
          recordLiveAdminSecurityAudit({
            action: 'SPONSOR_REQUEST_APPROVE', actorUid: auth.actorUid || 'admin', actorEmail: auth.actorEmail || 'admin',
            outcome: 'allowed', reason: `HOOD_${hoodId}_EXPIRES_${expiresAtIso}`,
          });
        },
      });
      if (!committed.ok) { res.status(503).json({ status: 'error', code: committed.code, message: committed.messageFa }); return; }
      res.status(200).json({ status: 'ok', hoodId, expiresAtIso, sponsor: sponsorRecord });
    })();
  });
  app.post('/api/admin/sponsors/extend', (req: Request, res: Response) => {
    void (async () => {
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      const auth = await verifyAdminApiAuthorization(req.headers, process.env);
      if (!auth.authorized) {
        if (auth.statusCode === 401 || auth.statusCode === 403) recordAbuseSignal(getClientIp(req), 'auth_failure');
        res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
        return;
      }
      const hoodId = Number(req.body?.hoodId);
      if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999) {
        res.status(400).json({ status: 'error', code: 'INVALID_HOOD_ID' });
        return;
      }
      const currentExpiresAtIso = typeof req.body?.currentExpiresAtIso === 'string' ? req.body.currentExpiresAtIso : null;
      const expiresAtIso = computeExtendedSponsorExpirationIso(currentExpiresAtIso, Date.now(), 30);
      try {
        const db = getFirebaseAdminFirestoreForServer(process.env);
        const hoodRef = db.collection('neighborhoodOverrides').doc(String(hoodId));
        if (typeof db.runTransaction === 'function') {
          await db.runTransaction(async (tx) => {
            const snap = await tx.get(hoodRef);
            const prevSponsor = snap.data()?.sponsor || {};
            tx.set(hoodRef, { hoodId, sponsor: { ...prevSponsor, expiresAtIso } }, { merge: true });
          });
        } else {
          await hoodRef.set({ hoodId, sponsor: { expiresAtIso } }, { merge: true });
        }
      } catch {
        res.status(503).json({ status: 'error', code: 'SPONSOR_PERSIST_FAILED', message: 'تمدید اسپانسر در پایگاه داده انجام نشد.' });
        return;
      }
      recordLiveAdminSecurityAudit({
        action: 'SPONSOR_EXTEND_30D', actorUid: auth.actorUid || 'admin', actorEmail: auth.actorEmail || 'admin',
        outcome: 'allowed', reason: `HOOD_${hoodId}_${expiresAtIso}`,
      });
      res.status(200).json({ status: 'ok', hoodId, expiresAtIso });
    })();
  });
  app.post('/api/admin/sponsors/release', (req: Request, res: Response) => {
    void (async () => {
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      const auth = await verifyAdminApiAuthorization(req.headers, process.env);
      if (!auth.authorized) {
        if (auth.statusCode === 401 || auth.statusCode === 403) recordAbuseSignal(getClientIp(req), 'auth_failure');
        res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
        return;
      }
      const hoodId = Number(req.body?.hoodId);
      if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999) {
        res.status(400).json({ status: 'error', code: 'INVALID_HOOD_ID' });
        return;
      }
      try {
        const db = getFirebaseAdminFirestoreForServer(process.env);
        const hoodRef = db.collection('neighborhoodOverrides').doc(String(hoodId));
        if (typeof db.runTransaction === 'function') {
          await db.runTransaction(async (tx) => {
            await tx.get(hoodRef);
            tx.set(hoodRef, { sponsor: null }, { merge: true });
          });
        } else {
          await hoodRef.set({ sponsor: null }, { merge: true });
        }
      } catch {
        res.status(503).json({ status: 'error', code: 'SPONSOR_PERSIST_FAILED', message: 'آزادسازی اسپانسر در پایگاه داده انجام نشد.' });
        return;
      }
      recordLiveAdminSecurityAudit({
        action: 'SPONSOR_RELEASE', actorUid: auth.actorUid || 'admin', actorEmail: auth.actorEmail || 'admin',
        outcome: 'allowed', reason: `HOOD_${hoodId}`,
      });
      res.status(200).json({ status: 'ok', hoodId, released: true });
    })();
  });
  app.post('/api/bargains/validate-financials', (req: Request, res: Response) => {
    void (async () => {
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      const ip = getClientIp(req);
      if (!checkRateLimit(ip, 'general', 30, 60 * 1000)) {
        res.status(429).json({ status: 'error', code: 'BARGAIN_VALIDATE_RATE_LIMIT' });
        return;
      }
      const userAuth = await verifyAuthenticatedUserHeader(req.headers, process.env);
      if (!userAuth.authenticated) { recordAbuseSignal(ip, 'auth_failure'); res.status(userAuth.statusCode).json({ status: 'error', code: userAuth.reason }); return; }
      const { matchedHood } = resolveServerNeighborhood(req.body?.city, req.body?.hoodId);
      if (!matchedHood) { res.status(400).json({ status: 'error', code: 'INVALID_HOOD_ID' }); return; }
      const dealType: 'خرید' | 'رهن و اجاره' = req.body?.dealType === 'رهن و اجاره' || req.body?.dealType === 'اجاره' ? 'رهن و اجاره' : 'خرید';
      const calc = computeCanonicalBargainFinancials({ dealType, sqm: Number(req.body?.sqm), offeredTotalMillion: Number(req.body?.offeredTotalMillion), benchmarkBuyPerSqm: matchedHood.buyPerSqm, benchmarkRahn80m: matchedHood.rahn80m });
      if (!calc.valid) { res.status(400).json({ status: 'error', code: calc.code || 'INVALID_BARGAIN_FINANCIALS' }); return; }
      res.status(200).json({ status: 'ok', financials: calc });
    })();
  });
  app.post('/api/admin/bargains/approve', (req: Request, res: Response) => {
    void (async () => {
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      const auth = await verifyAdminApiAuthorization(req.headers, process.env);
      if (!auth.authorized) {
        if (auth.statusCode === 401 || auth.statusCode === 403) recordAbuseSignal(getClientIp(req), 'auth_failure');
        res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
        return;
      }
      const bargainId = typeof req.body?.bargainId === 'string' ? req.body.bargainId.trim() : '';
      const rawTargetStatus = req.body?.status === undefined ? 'approved' : req.body?.status;
      if (rawTargetStatus !== 'approved' && rawTargetStatus !== 'rejected') { res.status(400).json({ status: 'error', code: 'INVALID_BARGAIN_STATUS' }); return; }
      const targetStatus: 'approved' | 'rejected' = rawTargetStatus;
      if (!isValidFirestoreDocId(bargainId) || !isValidBargainStateTransition(req.body?.fromStatus, targetStatus, true)) {
        res.status(400).json({ status: 'error', code: 'INVALID_BARGAIN_TRANSITION' });
        return;
      }
      const approvedAtIso = new Date().toISOString();
      const adminUid = auth.actorUid || 'admin';
      try {
        const adminDb = getFirebaseAdminFirestoreForServer();
        await adminDb.collection('bargains').doc(bargainId).set({
          status: targetStatus, updatedAt: FieldValue.serverTimestamp(), updatedAtIso: approvedAtIso, moderatedBy: adminUid,
          ...(targetStatus === 'approved' ? { approvedAt: FieldValue.serverTimestamp(), approvedBy: adminUid, approvedAtIso } : {}),
        }, { merge: true });
      } catch { /* offline test fallback */ }
      await ensureBucketLoaded();
      let mutated = false;
      for (const item of objectStoreIndex) {
        if (item.bargainId === bargainId && targetStatus === 'rejected') { item.deletionState = 'pending_delete'; mutated = true; }
      }
      if (mutated) { await persistObjectStoreIndexNow().catch(() => {}); }
      recordLiveAdminSecurityAudit({ action: `BARGAIN_MODERATION_${targetStatus.toUpperCase()}`, actorUid: adminUid, actorEmail: auth.actorEmail || 'admin', outcome: 'allowed', reason: bargainId });
      res.status(200).json({ status: 'ok', bargainId, moderationStatus: targetStatus, approvedAtIso });
    })();
  });
}
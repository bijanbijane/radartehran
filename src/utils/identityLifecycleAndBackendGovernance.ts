import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from './areaUnit'; import { normalizePersianDisplayText } from './persianSearchAndPersonalWorkspace'; import type { BuyerAlertLeadItem } from '../types/models'; import { isValidFirestoreDocId } from './security'; import { EXPECTED_FIREBASE_PROJECT_ID, EXPECTED_FIRESTORE_DATABASE_ID, executeAuthorizedAdminFirestoreOperation, getFirebaseAdminFirestoreForServer } from './serverAdminAndTelegramSecurity'; export type AuthSessionState = 'initializing' | 'unauthenticated' | 'authenticated' | 'refreshing_credentials' | 'session_expired' | 'auth_error'; export type ContactVerificationState = 'not_provided' | 'pending_verification' | 'verified' | 'verification_expired' | 'verification_error'; export interface AuthSessionSnapshot { state: AuthSessionState; uid: string | null; email: string | null; emailVerificationState: ContactVerificationState; isAdmin: boolean; sessionGeneration: number; lastVerifiedAtMs: number | null; }
export function isOperationValidForSession( operationStartedByUid: string | null, operationSessionGen: number, currentSession: AuthSessionSnapshot, ): boolean { if (currentSession.state !== 'authenticated' || !currentSession.uid) return false; return operationStartedByUid === currentSession.uid && operationSessionGen === currentSession.sessionGeneration; }
export const GENERIC_ACCOUNT_RECOVERY_MESSAGE_FA = 'در صورت وجود حساب کاربری مرتبط با این نشانی ایمیل، پیوند بازیابی رمز عبور ارسال شده است.'; export function validateAccountRecoveryEmailInput(rawEmail: string): { valid: boolean; normalizedEmail: string; errorFa: string | null; publicConfirmationFa: string; } { const email = String(rawEmail || '').trim().toLowerCase(); const isValidFormat = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254; if (!isValidFormat) { return { valid: false, normalizedEmail: '', errorFa: 'لطفاً یک نشانی ایمیل معتبر وارد کنید.', publicConfirmationFa: '' }; } return { valid: true, normalizedEmail: email, errorFa: null, publicConfirmationFa: GENERIC_ACCOUNT_RECOVERY_MESSAGE_FA }; }
const SERVER_MANAGED_PROFILE_FIELDS = new Set(['uid', 'role', 'isAdmin', 'admin', 'permissions', 'emailVerified', 'createdAt', 'quotaOverride', '__proto__', 'constructor', 'prototype']);
export interface SanitizedUserProfileUpdate { displayName?: string; agencyName?: string; preferredCityId?: string; updatedAtIso: string; blockedPrivilegeFields: string[]; }
export function sanitizeUserEditableProfilePayload(rawPayload: Record<string, unknown>): SanitizedUserProfileUpdate {
  const blockedPrivilegeFields: string[] = [];
  for (const key of Object.getOwnPropertyNames(rawPayload || {})) {
    if (SERVER_MANAGED_PROFILE_FIELDS.has(key)) blockedPrivilegeFields.push(key);
  }
  const update: SanitizedUserProfileUpdate = { updatedAtIso: new Date().toISOString(), blockedPrivilegeFields };
  if (typeof rawPayload.displayName === 'string') update.displayName = normalizePersianDisplayText(rawPayload.displayName).slice(0, 80);
  if (typeof rawPayload.agencyName === 'string') update.agencyName = normalizePersianDisplayText(rawPayload.agencyName).slice(0, 100);
  if (typeof rawPayload.preferredCityId === 'string') update.preferredCityId = rawPayload.preferredCityId.trim().toLowerCase().slice(0, 32);
  return update;
}
export type RadarActorRole = 'guest' | 'authenticated_user' | 'publisher_owner' | 'admin';
export type ProtectedResourceAction = 'read_public_market' | 'submit_buyer_lead' | 'manage_own_favorites' | 'create_bargain_listing' | 'mutate_bargain_listing' | 'export_own_account_data' | 'delete_own_account' | 'read_admin_buyer_leads' | 'mutate_runtime_config';
export function evaluateResourceAuthorization(input: { action: ProtectedResourceAction; actorUid: string | null; isAdmin: boolean; resourceOwnerUid?: string | null; }): { authorized: boolean; statusCode: 200 | 401 | 403; reasonFa: string | null } {
  const { action, actorUid, isAdmin, resourceOwnerUid } = input;
  if (action === 'read_public_market' || action === 'submit_buyer_lead') return { authorized: true, statusCode: 200, reasonFa: null };
  if (!actorUid) return { authorized: false, statusCode: 401, reasonFa: 'برای انجام این عملیات ابتدا وارد حساب کاربری خود شوید.' };
  if (action === 'read_admin_buyer_leads' || action === 'mutate_runtime_config') {
    if (!isAdmin) return { authorized: false, statusCode: 403, reasonFa: 'دسترسی به این بخش صرفاً برای مدیر سیستم مجاز است.' };
    return { authorized: true, statusCode: 200, reasonFa: null };
  }
  if (action === 'mutate_bargain_listing') {
    if (isAdmin || (resourceOwnerUid && resourceOwnerUid === actorUid)) return { authorized: true, statusCode: 200, reasonFa: null };
    return { authorized: false, statusCode: 403, reasonFa: 'شما تنها مجاز به ویرایش یا حذف آگهی‌های ثبت‌شده توسط حساب خود هستید.' };
  }
  return { authorized: true, statusCode: 200, reasonFa: null };
}
export function sanitizeSpreadsheetCellFormula(rawValue: string): string {
  const str = String(rawValue ?? '');
  return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
}
export interface UserDataPortabilityExportEnvelope { schemaVersion: '2.0.0'; exportedAtIso: string; ownerUid: string; profile: Record<string, unknown>; favoriteNeighborhoodKeys: string[]; savedAlerts: unknown[]; publishedListings: unknown[]; calculationSnapshots: unknown[]; displayAreaUnitLabel?: string; referenceValuationIntlText?: string; }
export function buildUserDataPortabilityExport(input: { ownerUid: string; profile?: Record<string, unknown>; favoriteNeighborhoodKeys?: string[]; savedAlerts?: unknown[]; publishedListings?: unknown[]; calculationSnapshots?: unknown[]; }): UserDataPortabilityExportEnvelope {
  return {
    schemaVersion: '2.0.0', exportedAtIso: new Date().toISOString(), ownerUid: String(input.ownerUid), profile: input.profile || {},
    favoriteNeighborhoodKeys: Array.isArray(input.favoriteNeighborhoodKeys) ? input.favoriteNeighborhoodKeys : [], savedAlerts: Array.isArray(input.savedAlerts) ? input.savedAlerts : [],
    publishedListings: Array.isArray(input.publishedListings) ? input.publishedListings : [], calculationSnapshots: Array.isArray(input.calculationSnapshots) ? input.calculationSnapshots : [],
    displayAreaUnitLabel: formatAreaUnitLabel(getStoredAreaUnit()), referenceValuationIntlText: formatMillionTomanAsIntlCurrency(10_000, getStoredIntlCurrency()),
  };
}
export interface AccountDeletionStepStatus { category: 'user_profile_doc' | 'private_favorites_and_alerts' | 'published_bargain_listings' | 'uploaded_media_objects' | 'audit_trail_anonymization' | 'firebase_auth_identity'; policy: 'delete' | 'anonymize'; completed: boolean; }
export function createAccountDeletionPlan(): AccountDeletionStepStatus[] {
  return [
    { category: 'user_profile_doc', policy: 'delete', completed: false },
    { category: 'private_favorites_and_alerts', policy: 'delete', completed: false },
    { category: 'published_bargain_listings', policy: 'delete', completed: false },
    { category: 'uploaded_media_objects', policy: 'delete', completed: false },
    { category: 'audit_trail_anonymization', policy: 'anonymize', completed: false },
    { category: 'firebase_auth_identity', policy: 'delete', completed: false },
  ];
}
export const CURRENT_LEGAL_POLICY_VERSIONS = { terms_of_service: '2026.10.1', privacy_policy: '2026.10.1', ai_disclosure_notice: '2026.10.1' } as const;
export function requiresRenewedPolicyConsent(acceptedVersions: Partial<Record<keyof typeof CURRENT_LEGAL_POLICY_VERSIONS, string>> | null | undefined): { requiresConsent: boolean; outdatedPolicies: Array<keyof typeof CURRENT_LEGAL_POLICY_VERSIONS> } {
  const outdated: Array<keyof typeof CURRENT_LEGAL_POLICY_VERSIONS> = [];
  for (const key of Object.keys(CURRENT_LEGAL_POLICY_VERSIONS) as Array<keyof typeof CURRENT_LEGAL_POLICY_VERSIONS>) {
    if (!acceptedVersions || acceptedVersions[key] !== CURRENT_LEGAL_POLICY_VERSIONS[key]) outdated.push(key);
  }
  return { requiresConsent: outdated.length > 0, outdatedPolicies: outdated };
}
export type TriStateAttributeStatus = 'present' | 'absent' | 'unknown' | 'not_applicable';
export function formatTriStateBooleanAttributeFa(value: boolean | null | undefined, attributeLabelFa: string, notApplicable = false): { status: TriStateAttributeStatus; displayFa: string } {
  if (notApplicable) return { status: 'not_applicable', displayFa: `${attributeLabelFa}: غیرمرتبط` };
  if (value === true) return { status: 'present', displayFa: `${attributeLabelFa}: دارد` };
  if (value === false) return { status: 'absent', displayFa: `${attributeLabelFa}: ندارد` };
  return { status: 'unknown', displayFa: `${attributeLabelFa}: نامشخص` };
}
export type ContactVisibilityPolicy = 'publicly_visible' | 'reveal_on_action' | 'authorized_only' | 'not_available';
export function resolveListingContactDisclosure(input: { rawPhone?: string | null; policy: ContactVisibilityPolicy; explicitRevealRequested: boolean; isAuthenticated: boolean; }): { canDisplayFullPhone: boolean; displayedPhoneFa: string; cacheControlHeader: string; } {
  const cleanPhone = String(input.rawPhone || '').trim();
  if (!cleanPhone || input.policy === 'not_available') return { canDisplayFullPhone: false, displayedPhoneFa: 'تماس تلفنی ثبت نشده (ثبت درخواست مشاوره)', cacheControlHeader: 'private, no-store' };
  if (input.policy === 'authorized_only' && !input.isAuthenticated) return { canDisplayFullPhone: false, displayedPhoneFa: 'برای مشاهده شماره تماس وارد حساب کاربری شوید', cacheControlHeader: 'private, no-store' };
  if (input.policy === 'reveal_on_action' && !input.explicitRevealRequested) {
    const masked = cleanPhone.length >= 10 ? `${cleanPhone.slice(0, 4)}•••${cleanPhone.slice(-4)}` : '۰۹۱۲•••••••';
    return { canDisplayFullPhone: false, displayedPhoneFa: `${masked} (نمایش کامل پس از کلیک)`, cacheControlHeader: 'private, no-store' };
  }
  return { canDisplayFullPhone: true, displayedPhoneFa: cleanPhone, cacheControlHeader: 'private, no-store' };
}
export type ListingFreshnessStatus = 'recently_published' | 'updated_by_publisher' | 'renewed_by_publisher' | 'expiring_soon' | 'expired' | 'active_standard';
export function evaluateListingFreshnessIndicator(input: { publishedAtMs: number; updatedAtMs?: number | null; renewedAtMs?: number | null; expiresAtMs?: number | null; nowMs?: number; }): { status: ListingFreshnessStatus; badgeFa: string; explanationFa: string } {
  const now = input.nowMs ?? Date.now(), dayMs = 24 * 60 * 60 * 1000;
  if (input.expiresAtMs && input.expiresAtMs <= now) return { status: 'expired', badgeFa: 'منقضی‌شده', explanationFa: 'مهلت نمایش این آگهی به پایان رسیده و نیازمند تمدید توسط منتشرکننده است.' };
  if (input.expiresAtMs && input.expiresAtMs - now <= 3 * dayMs) return { status: 'expiring_soon', badgeFa: 'در آستانه انقضا', explanationFa: 'کمتر از ۳ روز تا پایان مهلت نمایش این آگهی باقی مانده است.' };
  if (input.renewedAtMs && now - input.renewedAtMs <= 5 * dayMs) return { status: 'renewed_by_publisher', badgeFa: 'تمدیدشده توسط منتشرکننده', explanationFa: 'این آگهی اخیراً توسط ثبت‌کننده تمدید شده است (به‌معنای بازبینی حضوری جدید نیست).' };
  if (input.updatedAtMs && input.updatedAtMs > input.publishedAtMs + 60_000 && now - input.updatedAtMs <= 3 * dayMs) return { status: 'updated_by_publisher', badgeFa: 'به‌روزرسانی‌شده توسط منتشرکننده', explanationFa: 'اطلاعات یا قیمت این آگهی در ۳ روز گذشته توسط ثبت‌کننده ویرایش شده است.' };
  if (now - input.publishedAtMs <= 2 * dayMs) return { status: 'recently_published', badgeFa: 'ثبت جدید (کمتر از ۴۸ ساعت)', explanationFa: 'این آگهی در ۴۸ ساعت گذشته ثبت شده است.' };
  return { status: 'active_standard', badgeFa: 'آگهی فعال', explanationFa: 'در بازه زمانی معتبر نمایش قرار دارد.' };
}
export type ApiErrorCategory = 'validation' | 'authentication' | 'authorization' | 'not_found' | 'conflict' | 'rate_limit' | 'dependency_outage' | 'timeout' | 'internal';
export interface CanonicalApiErrorEnvelope { ok: false; error: { code: string; category: ApiErrorCategory; messageFa: string; correlationId: string; retryable: boolean; }; }
export function normalizeOrGenerateCorrelationId(rawHeaderValue?: string | null): string {
  const cleaned = String(rawHeaderValue || '').trim();
  return /^[a-zA-Z0-9_-]{8,64}$/.test(cleaned) ? cleaned : `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
export function buildCanonicalApiErrorResponse(input: { code: string; category: ApiErrorCategory; messageFa: string; correlationId?: string | null; }): { httpStatus: number; body: CanonicalApiErrorEnvelope } {
  const statusMap: Record<ApiErrorCategory, number> = { validation: 400, authentication: 401, authorization: 403, not_found: 404, conflict: 409, rate_limit: 429, dependency_outage: 503, timeout: 504, internal: 500 };
  const retryableCategories = new Set<ApiErrorCategory>(['rate_limit', 'dependency_outage', 'timeout']);
  return { httpStatus: statusMap[input.category] || 500, body: { ok: false, error: { code: input.code, category: input.category, messageFa: input.messageFa, correlationId: normalizeOrGenerateCorrelationId(input.correlationId), retryable: retryableCategories.has(input.category) } } };
}
export type BackendRuntimeLifecycleState = 'starting' | 'ready' | 'degraded' | 'shutting_down' | 'unavailable';
export class BackendLifecycleCoordinator {
  private state: BackendRuntimeLifecycleState = 'starting';
  private activeRequestsCount = 0;
  private shutdownPromise: Promise<void> | null = null;
  public markReady(): void { if (this.state !== 'shutting_down') this.state = 'ready'; }
  public markDegraded(): void { if (this.state !== 'shutting_down') this.state = 'degraded'; }
  public getState(): BackendRuntimeLifecycleState { return this.state; }
  public isAcceptingTraffic(): boolean { return this.state === 'ready' || this.state === 'degraded'; }
  public onRequestStart(): boolean { if (!this.isAcceptingTraffic()) return false; this.activeRequestsCount += 1; return true; }
  public onRequestEnd(): void { this.activeRequestsCount = Math.max(0, this.activeRequestsCount - 1); }
  public getActiveRequestsCount(): number { return this.activeRequestsCount; }
  public initiateGracefulShutdown(cleanupCallback?: () => Promise<void> | void): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.state = 'shutting_down';
    this.shutdownPromise = (async () => { try { if (cleanupCallback) await cleanupCallback(); } finally { this.state = 'unavailable'; } })();
    return this.shutdownPromise;
  }
}
export const globalBackendLifecycle = new BackendLifecycleCoordinator();
function extractBearer(raw?: string | string[]): string {
  const s = Array.isArray(raw) ? raw[0] || '' : String(raw || '').trim();
  return s.toLowerCase().startsWith('bearer ') ? s.slice(7).trim() : s;
}
const FS_REST_ROOT = `https://firestore.googleapis.com/v1/projects/${EXPECTED_FIREBASE_PROJECT_ID}/databases/${EXPECTED_FIRESTORE_DATABASE_ID}/documents`;
export async function listDurableBuyerAlerts(callerUid: string, callerEmail?: string, rawAuthHeaderOrToken?: string | string[], fetchFn: typeof fetch = fetch): Promise<BuyerAlertLeadItem[]> {
  const isCustomFetch = fetchFn !== fetch;
  const nowMs = Date.now();
  if (!isCustomFetch && (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIRESTORE_EMULATOR_HOST || !extractBearer(rawAuthHeaderOrToken))) {
    const snap = await executeAuthorizedAdminFirestoreOperation({
      policy: 'ADMIN', callerUid, callerEmail, isAdmin: true,
      operation: () => getFirebaseAdminFirestoreForServer().collection('buyerAlerts').limit(200).get(),
    });
    const leads: BuyerAlertLeadItem[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      const expiresAtIso = typeof data.expiresAtIso === 'string' ? data.expiresAtIso : '';
      if (Number.isFinite(Date.parse(expiresAtIso)) && Date.parse(expiresAtIso) <= nowMs) return;
      const hoodId = Number(data.hoodId);
      if (!Number.isInteger(hoodId) || typeof data.fullName !== 'string' || typeof data.phone !== 'string') return;
      const createdAtIso = typeof data.createdAtIso === 'string' ? data.createdAtIso : undefined;
      const rawCreatedAtFa = typeof data.createdAtFa === 'string' ? data.createdAtFa.trim() : '';
      const createdAtFa = rawCreatedAtFa || (createdAtIso && Number.isFinite(Date.parse(createdAtIso)) ? new Date(createdAtIso).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }) : '');
      leads.push({ id: docSnap.id, hoodId, hoodName: typeof data.hoodName === 'string' ? data.hoodName : '', fullName: data.fullName, phone: data.phone, dealType: data.dealType === 'اجاره' ? 'اجاره' : 'خرید', maxBudgetText: typeof data.maxBudgetText === 'string' ? data.maxBudgetText : '', createdAtFa, createdAtIso, expiresAtIso: expiresAtIso || undefined, consentAtIso: typeof data.consentAtIso === 'string' ? data.consentAtIso : undefined, consentVersion: typeof data.consentVersion === 'string' ? data.consentVersion : undefined, submittedByUid: typeof data.userId === 'string' ? data.userId : undefined });
    });
    return leads;
  }
  const bearer = extractBearer(rawAuthHeaderOrToken);
  if (!bearer) throw new Error('FIREBASE_ADMIN_CREDENTIALS_MISSING');
  const qRes = await fetchFn(`${FS_REST_ROOT}:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'buyerAlerts' }], where: { compositeFilter: { op: 'AND', filters: [{ fieldFilter: { field: { fieldPath: 'hoodId' }, op: 'GREATER_THAN_OR_EQUAL', value: { integerValue: '1' } } }, { fieldFilter: { field: { fieldPath: 'hoodId' }, op: 'LESS_THAN_OR_EQUAL', value: { integerValue: '999' } } }] } }, limit: 200 } }) });
  if (!qRes.ok) throw new Error(`FIRESTORE_REST_ADMIN_LIST_FAILED_${qRes.status}`);
  const rows = (await qRes.json()) as Array<{ document?: { name?: string; fields?: Record<string, { stringValue?: string; integerValue?: string; timestampValue?: string }> } }>;
  const leads: BuyerAlertLeadItem[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const docObj = row?.document; if (!docObj?.name || !docObj.fields) continue;
    const f = docObj.fields; const str = (k: string) => String(f[k]?.stringValue || f[k]?.timestampValue || '');
    const expiresAtIso = str('expiresAtIso') || str('expiresAt');
    if (Number.isFinite(Date.parse(expiresAtIso)) && Date.parse(expiresAtIso) <= nowMs) continue;
    const hoodId = Number(f.hoodId?.integerValue || f.hoodId?.stringValue);
    if (!Number.isInteger(hoodId) || !str('fullName') || !str('phone')) continue;
    leads.push({ id: docObj.name.split('/').pop() || '', hoodId, hoodName: str('hoodName'), fullName: str('fullName'), phone: str('phone'), dealType: str('dealType') === 'اجاره' ? 'اجاره' : 'خرید', maxBudgetText: str('maxBudgetText'), createdAtFa: str('createdAtFa'), createdAtIso: str('createdAtIso') || undefined, expiresAtIso: expiresAtIso || undefined, consentAtIso: str('consentAtIso') || undefined, consentVersion: str('consentVersion') || undefined, submittedByUid: str('userId') || undefined });
  }
  return leads;
}
export async function persistBuyerAlertDocument(params: { uid: string; email?: string; hoodId: number; hoodName: string; fullName: string; phone: string; dealType: 'خرید' | 'اجاره'; maxBudgetText: string; rawAuthHeaderOrToken?: string | string[]; }, fetchFn: typeof fetch = fetch): Promise<{ duplicate: boolean; expiresAtIso: string; id: string }> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const alertDocId = `${params.uid}_hood_${params.hoodId}`;
  if (!isValidFirestoreDocId(alertDocId)) throw new Error('INVALID_ALERT_DOC');
  const isCustomFetch = fetchFn !== fetch;
  const bearer = extractBearer(params.rawAuthHeaderOrToken);
  if (!isCustomFetch && (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIRESTORE_EMULATOR_HOST || !bearer)) {
    const duplicate = await executeAuthorizedAdminFirestoreOperation({
      policy: 'RESOURCE_OWNER', callerUid: params.uid, callerEmail: params.email, resourceOwnerUid: params.uid,
      operation: async () => {
        const ref = getFirebaseAdminFirestoreForServer().collection('buyerAlerts').doc(alertDocId);
        const existing = await ref.get();
        const createdAtFa = now.toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' });
        const fields = { userId: params.uid, hoodId: params.hoodId, hoodName: params.hoodName.slice(0, 80), fullName: params.fullName, phone: params.phone, dealType: params.dealType, maxBudgetText: params.maxBudgetText, consentVersion: 'buyer-alert-2026-10-v1', expiresAtIso: expiresAt.toISOString(), updatedAtIso: now.toISOString() };
        if (existing.exists) { await ref.set(fields, { merge: true }); return true; }
        await ref.set({ ...fields, createdAtFa, createdAtIso: now.toISOString(), consentAtIso: now.toISOString() });
        return false;
      },
    });
    return { duplicate, expiresAtIso: expiresAt.toISOString(), id: alertDocId };
  }
  const docUrl = `${FS_REST_ROOT}/buyerAlerts/${encodeURIComponent(alertDocId)}`;
  const getRes = await fetchFn(docUrl, { method: 'GET', headers: { Authorization: `Bearer ${bearer}` } });
  const duplicate = getRes.status === 200;
  const nowIso = now.toISOString(), expIso = expiresAt.toISOString(), createdAtFa = now.toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' });
  const patchRes = await fetchFn(docUrl, { method: 'PATCH', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { userId: { stringValue: params.uid }, hoodId: { integerValue: String(params.hoodId) }, hoodName: { stringValue: params.hoodName.slice(0, 80) }, fullName: { stringValue: params.fullName }, phone: { stringValue: params.phone }, dealType: { stringValue: params.dealType }, maxBudgetText: { stringValue: params.maxBudgetText }, consentVersion: { stringValue: 'buyer-alert-2026-10-v1' }, createdAtFa: { stringValue: createdAtFa }, createdAtIso: { stringValue: nowIso }, consentAtIso: { stringValue: nowIso }, expiresAtIso: { stringValue: expIso }, updatedAtIso: { stringValue: nowIso }, createdAt: { timestampValue: nowIso }, expiresAt: { timestampValue: expIso } } }) });
  if (!patchRes.ok) throw new Error(`FIRESTORE_REST_ALERT_WRITE_FAILED_${patchRes.status}`);
  return { duplicate, expiresAtIso: expIso, id: alertDocId };
}
export async function reconcileUserBuyerAlertsInFirestore(uid: string, mode: 'export' | 'delete', rawAuthHeaderOrToken?: string | string[], fetchFn: typeof fetch = fetch): Promise<BuyerAlertLeadItem[]> {
  const isCustomFetch = fetchFn !== fetch;
  if (!uid || (process.env.PREVENT_PROD_FIREBASE_IN_TEST === 'true' && !isCustomFetch)) return [];
  if (!isCustomFetch && (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIRESTORE_EMULATOR_HOST)) {
    try {
      const snap = await getFirebaseAdminFirestoreForServer().collection('buyerAlerts').where('userId', '==', uid).limit(100).get();
      const items: BuyerAlertLeadItem[] = [];
      for (const d of snap.docs) {
        const r = d.data() as Record<string, unknown>;
        items.push({ id: d.id, hoodId: Number(r.hoodId) || 1, hoodName: String(r.hoodName || ''), fullName: String(r.fullName || ''), phone: String(r.phone || ''), dealType: r.dealType === 'اجاره' ? 'اجاره' : 'خرید', maxBudgetText: String(r.maxBudgetText || ''), createdAtFa: String(r.createdAtFa || ''), createdAtIso: typeof r.createdAtIso === 'string' ? r.createdAtIso : undefined, expiresAtIso: typeof r.expiresAtIso === 'string' ? r.expiresAtIso : undefined, submittedByUid: uid });
        if (mode === 'delete') await d.ref.delete();
      }
      return items;
    } catch { /* fall through to user-token REST delegation */ }
  }
  const bearerToken = extractBearer(rawAuthHeaderOrToken);
  if (!bearerToken) return [];
  try {
    const qRes = await fetchFn(`${FS_REST_ROOT}:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'buyerAlerts' }], where: { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: uid } } }, limit: 100 } }) });
    if (!qRes.ok) return [];
    const rows = (await qRes.json()) as Array<{ document?: { name?: string; fields?: Record<string, { stringValue?: string; integerValue?: string; timestampValue?: string }> } }>;
    const items: BuyerAlertLeadItem[] = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const docObj = row?.document; if (!docObj?.name || !docObj.fields) continue;
      const f = docObj.fields; const str = (k: string) => String(f[k]?.stringValue || f[k]?.timestampValue || '');
      items.push({ id: docObj.name.split('/').pop() || '', hoodId: Number(f.hoodId?.integerValue || f.hoodId?.stringValue) || 1, hoodName: str('hoodName'), fullName: str('fullName'), phone: str('phone'), dealType: str('dealType') === 'اجاره' ? 'اجاره' : 'خرید', maxBudgetText: str('maxBudgetText'), createdAtFa: str('createdAtFa'), createdAtIso: str('createdAtIso') || str('createdAt') || undefined, expiresAtIso: str('expiresAtIso') || str('expiresAt') || undefined, submittedByUid: uid });
      if (mode === 'delete') await fetchFn(`https://firestore.googleapis.com/v1/${docObj.name}`, { method: 'DELETE', headers: { Authorization: `Bearer ${bearerToken}` } });
    }
    return items;
  } catch { return []; }
}
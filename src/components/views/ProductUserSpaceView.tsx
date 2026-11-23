import React, { useCallback, useEffect, useRef, useState } from 'react';
import { User, LogIn, LogOut, CheckCircle2, SlidersHorizontal, ArrowLeftRight, Download, Trash2 } from 'lucide-react';
import type { AuthUserSnapshot } from '../../platform/auth';
import { getAuthClient } from '../../platform/auth';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import { getNeighborhoodMarketReport, getNeighborhoodTrafficInfo, toPersianNum } from '../../data/neighborhoods';
import { type CityId, getAllMultiCityNeighborhoods } from '../../data/multiCityData';
import { formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { SearchHistory } from '../SearchHistory';
import { AccountSubSectionsPanel } from '../navigation/AccountSubSectionsPanel';
import type { AccountSubTabId, ModuleSubTabId, SavedMapViewItem } from '../../navigation/registry/route.types';
import {
  ACCOUNT_WORKSPACE_UPDATED_EVENT,
  isStorageKeyForUid,
  resolveEffectiveUid,
  setActiveAccountScopeUid,
} from '../../features/account/services/accountStorageScope';
import { generateStableAccountId } from '../../features/account/services/accountSettingsStorageService';
import { downloadJsonPayloadFile } from '../../features/account/services/accountExportDownloadService';
import {
  buildAccountExportDownloadPayload,
  executeAccountDeletionFlow,
  requestAccountServerExport,
} from '../../features/account/services/accountActionService';
import type { AccountDeleteLayerStatus, AccountWorkspaceSnapshot } from '../../features/account/types/account.types';
import { loadAccountWorkspaceSnapshot, recordDataRequest, removeSavedPropertyById } from '../../features/account/services/accountWorkspaceService';
import { AccountOverviewDashboard } from '../../features/account/components/AccountOverviewDashboard';
import { AccountSavedItemsPanel } from '../../features/account/components/AccountSavedItemsPanel';
import { AccountFavoriteNeighborhoodsSection } from '../../features/account/components/AccountFavoriteNeighborhoodsSection';
import { explainNeighborhoodRecommendation } from '../useEvaluatedNeighborhoods';
export interface ProductUserSpaceViewProps {
  currentUser: AuthUserSnapshot | null; onGoogleSignIn: () => void; onSignOut: () => void;
  favoriteHoodIds: number[]; onToggleFavorite: (id: number) => void;
  evaluatedNeighborhoods: EvaluatedNeighborhood[]; nationwideEvaluatedNeighborhoods?: EvaluatedNeighborhood[];
  activeCity?: CityId; selectedHood?: EvaluatedNeighborhood; activeSubTab?: AccountSubTabId;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void; onOpenInspector: (hood: EvaluatedNeighborhood) => void;
  onOpenShortlistMatrix?: () => void; onNavigateView?: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  onOpenBuyerAlertModal: () => void; visitedHomesCount: number; onOpenVisitedModal: () => void;
  mode: 'rent' | 'buy'; deposit: number; monthlyRent: number; buyTotalBudget: number; targetSqm: number;
  totalRahnEquivalent?: number; useLoanBooster?: boolean; onOpenBudgetFilter: () => void;
  onRestoreSavedView?: (view: SavedMapViewItem) => void;
}
export function ProductUserSpaceView(p: ProductUserSpaceViewProps): React.ReactElement {
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [radarLocale] = useRadarLocale();
  const [busyAction, setBusyAction] = useState<'export' | 'delete' | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneChallengeId, setPhoneChallengeId] = useState<string | null>(null);
  const [phoneAuthBusy, setPhoneAuthBusy] = useState(false);
  const [phoneAuthMessage, setPhoneAuthMessage] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [privacyNotice, setPrivacyNotice] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [deleteLayers, setDeleteLayers] = useState<AccountDeleteLayerStatus | null>(null);
  const [dataRequestRevision, setDataRequestRevision] = useState(0);
  const effectiveUid = resolveEffectiveUid(p.currentUser?.uid ?? null);
  const effectiveDisplayName = p.currentUser?.displayName ?? null;
  const syncKey = `${effectiveUid}|${effectiveDisplayName ?? ''}|${p.visitedHomesCount}`;
  const lastSyncKeyRef = useRef(syncKey);
  const downloadCancelRef = useRef<(() => void) | null>(null);
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState<AccountWorkspaceSnapshot>(() => {
    setActiveAccountScopeUid(p.currentUser?.uid ?? null);
    return loadAccountWorkspaceSnapshot({ callerUid: effectiveUid, displayName: effectiveDisplayName, visitedHomesCount: p.visitedHomesCount });
  });
  const refreshWorkspace = useCallback(() => {
    setActiveAccountScopeUid(p.currentUser?.uid ?? null);
    setWorkspaceSnapshot(loadAccountWorkspaceSnapshot({ callerUid: effectiveUid, displayName: effectiveDisplayName, visitedHomesCount: p.visitedHomesCount }));
  }, [p.currentUser?.uid, effectiveUid, effectiveDisplayName, p.visitedHomesCount]);
  useEffect(() => { if (lastSyncKeyRef.current !== syncKey) { lastSyncKeyRef.current = syncKey; refreshWorkspace(); } }, [syncKey, refreshWorkspace]);
  useEffect(() => {
    const onStorage = (ev: StorageEvent) => { if (!ev.key || isStorageKeyForUid(ev.key, effectiveUid)) refreshWorkspace(); };
    const onEvent = (ev: Event) => { if (!(ev as CustomEvent<{ uid?: string }>)?.detail?.uid || (ev as CustomEvent<{ uid?: string }>).detail.uid === effectiveUid) refreshWorkspace(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener(ACCOUNT_WORKSPACE_UPDATED_EVENT, onEvent);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(ACCOUNT_WORKSPACE_UPDATED_EVENT, onEvent); };
  }, [effectiveUid, refreshWorkspace]);
  useEffect(() => () => { if (downloadCancelRef.current) downloadCancelRef.current(); }, []);
  const isEn = radarLocale === 'en';
  const currentTab: AccountSubTabId = p.activeSubTab || 'overview';
  const refHood = p.selectedHood || p.evaluatedNeighborhoods[0];
  const refDealSqm = refHood ? aggregateNeighborhoodMarketMetrics(refHood.id, refHood.name, refHood.buyPerSqm, buildNeighborhoodListingSamples(refHood)).estimatedDealPricePerSqm : 0;
  const effectiveBuyBudget = p.buyTotalBudget + (p.useLoanBooster ? 1200 : 0);
  const effectiveRahnPower = p.totalRahnEquivalent ?? (p.deposit + Math.round((p.monthlyRent * 100) / 3) + (p.useLoanBooster ? 400 : 0));
  const allMultiCityHoods = getAllMultiCityNeighborhoods();
  const safeSqm = Math.max(25, Number(p.targetSqm) || 80);
  const favoriteHoods = p.favoriteHoodIds.map((id) => {
    const ev = p.evaluatedNeighborhoods.find((h) => h.id === id) || p.nationwideEvaluatedNeighborhoods?.find((h) => h.id === id);
    if (ev) return ev;
    const raw = allMultiCityHoods.find((h) => h.id === id);
    if (!raw) return null;
    const ratio = p.mode === 'rent' ? Math.round(raw.rahn80m * (safeSqm / 80)) / Math.max(1, effectiveRahnPower) : (raw.buyPerSqm * safeSqm) / Math.max(1, effectiveBuyBudget);
    return { ...raw, baseBuyPerSqm: raw.buyPerSqm, overallScore: Math.round(((raw.air + raw.powerWater + raw.internet + raw.metro + raw.security + raw.flatTerrain) / 6) * 10) / 10, status: ratio <= 1.0 ? ('green' as const) : ratio <= 1.15 ? ('yellow' as const) : ('red' as const), diffPercent: Math.round((ratio - 1) * 100), distKm: null, trafficInfo: getNeighborhoodTrafficInfo(raw), marketReport: getNeighborhoodMarketReport(raw) } satisfies EvaluatedNeighborhood;
  }).filter((h): h is EvaluatedNeighborhood => Boolean(h));
  const topFavScore = favoriteHoods.length > 0 ? Math.max(...favoriteHoods.map((h) => h.overallScore)) : undefined;
  const favExplainById = new Map(favoriteHoods.map((hood) => [hood.id, explainNeighborhoodRecommendation(hood, { mode: p.mode, topReferenceScore: topFavScore })]));
  const favDealSqmById = new Map(favoriteHoods.map((hood) => [hood.id, aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, buildNeighborhoodListingSamples(hood)).estimatedDealPricePerSqm]));
  const budgetFx = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(p.mode === 'buy' ? effectiveBuyBudget : effectiveRahnPower, intlCurrency, radarLocale)})` : '';
  const avgShortlistScore = favoriteHoods.length > 0 ? (favoriteHoods.reduce((acc, h) => acc + h.overallScore, 0) / favoriteHoods.length).toFixed(1) : null;
  const handleExportAccountData = async (includeLocalWorkspace = false): Promise<boolean> => {
    if (!p.currentUser || busyAction) return false;
    setBusyAction('export'); setPrivacyNotice(null); setDeleteLayers(null);
    const scope = includeLocalWorkspace ? 'combined_account_and_workspace' : 'server_account';
    const requestId = generateStableAccountId('dreq');
    try {
      const serverRes = await requestAccountServerExport({ currentUser: p.currentUser, expectedUid: p.currentUser.uid });
      if (serverRes.ok === false) {
        const failRes = serverRes as Extract<typeof serverRes, { ok: false }>;
        recordDataRequest('export', 'failed', { uid: effectiveUid, requestId, scope, errorCode: failRes.code, retentionNotesFa: failRes.messageFa });
        setDataRequestRevision((r) => r + 1); refreshWorkspace();
        setPrivacyNotice({ kind: 'error', text: failRes.messageFa });
        return false;
      }
      recordDataRequest('export', 'ready', { uid: effectiveUid, requestId, scope });
      const built = buildAccountExportDownloadPayload({ serverData: serverRes.data, uid: p.currentUser.uid, includeLocalWorkspace });
      if (downloadCancelRef.current) downloadCancelRef.current();
      const dl = downloadJsonPayloadFile(built.payload, { scope: built.scope });
      downloadCancelRef.current = dl.cancelRevokeTimer ?? null;
      if (!dl.ok) {
        recordDataRequest('export', 'failed', { uid: effectiveUid, requestId, scope: built.scope, errorCode: dl.code, retentionNotesFa: dl.messageFa });
        setDataRequestRevision((r) => r + 1); refreshWorkspace();
        setPrivacyNotice({ kind: 'error', text: dl.messageFa || 'دانلود فایل خروجی در مرورگر انجام نشد.' });
        return false;
      }
      const partialMsg = built.isPartialExport ? ` (هشدار: خروجی جزئی؛ منابع غیرقابل‌دسترس: ${built.unavailableSources.join('، ')})` : '';
      recordDataRequest('export', 'completed', { uid: effectiveUid, requestId, scope: built.scope, retentionNotesFa: `فایل خروجی ${built.scope === 'combined_account_and_workspace' ? 'سرور + فضای محلی' : 'سرور'} با تفکیک منشأ آماده و دانلود شد${partialMsg}.` });
      setDataRequestRevision((r) => r + 1); refreshWorkspace();
      setPrivacyNotice({ kind: 'info', text: `فایل JSON اطلاعات حساب آماده و دانلود شد${partialMsg}.` });
      return true;
    } finally { setBusyAction(null); }
  };
  const handleConfirmAccountDelete = async () => {
    if (!p.currentUser || busyAction) return;
    setBusyAction('delete'); setPrivacyNotice(null); setDeleteLayers(null);
    const requestId = generateStableAccountId('dreq');
    try {
      const res = await executeAccountDeletionFlow({ currentUser: p.currentUser, idempotencyKey: requestId });
      if (res.ok === false && !res.data) {
        const failRes = res as Extract<typeof res, { ok: false }>;
        recordDataRequest('delete', 'failed', { uid: effectiveUid, requestId, errorCode: failRes.code, retentionNotesFa: failRes.messageFa });
        setDataRequestRevision((r) => r + 1); refreshWorkspace();
        setPrivacyNotice({ kind: 'error', text: failRes.messageFa });
        return;
      }
      if (!res.data) return;
      const failCode = res.ok === false ? (res as Extract<typeof res, { ok: false }>).code : undefined;
      setDeleteLayers(res.data);
      recordDataRequest('delete', res.data.requestStatus, { uid: effectiveUid, requestId, errorCode: failCode, retentionNotesFa: res.data.messageFa });
      setDataRequestRevision((r) => r + 1); refreshWorkspace();
      setConfirmDeleteOpen(false);
      setPrivacyNotice({ kind: res.ok ? 'info' : 'error', text: res.data.messageFa });
      if (res.data.requiresSignOut) p.onSignOut();
    } finally { setBusyAction(null); }
  };
  const handleRequestPhoneCode = async () => {
    if (phoneAuthBusy) return;
    setPhoneAuthBusy(true);
    setPhoneAuthMessage(null);
    try {
      const result = await getAuthClient().requestPhoneCode(phoneInput);
      setPhoneChallengeId(result.challengeId);
      setPhoneCode('');
      setPhoneAuthMessage(isEn ? 'Verification code sent by SMS.' : 'کد تأیید پیامکی ارسال شد.');
    } catch (error) {
      const code = error instanceof Error ? error.message : 'SMS_SEND_FAILED';
      const messages: Record<string, string> = {
        INVALID_PHONE_NUMBER: 'شماره موبایل معتبر ایران وارد کنید.',
        PHONE_OTP_RATE_LIMITED: 'تعداد درخواست کد برای این شماره یا شبکه بیش از حد مجاز است. بعداً دوباره تلاش کنید.',
        SMS_PROVIDER_NOT_CONFIGURED: 'درگاه پیامک هنوز در Cloudflare پیکربندی نشده است.',
        SMS_GATEWAY_REJECTED: 'درگاه پیامک درخواست را نپذیرفت. تنظیمات سرویس پیامک باید بررسی شود.',
      };
      setPhoneAuthMessage(messages[code] || (isEn ? 'Could not send the verification code.' : 'ارسال کد تأیید انجام نشد.'));
    } finally {
      setPhoneAuthBusy(false);
    }
  };

  const handleVerifyPhoneCode = async () => {
    if (!phoneChallengeId || phoneAuthBusy) return;
    setPhoneAuthBusy(true);
    setPhoneAuthMessage(null);
    try {
      const user = await getAuthClient().verifyPhoneCode(phoneChallengeId, phoneCode);
      if (!user) throw new Error('PHONE_SESSION_NOT_CREATED');
      setPhoneChallengeId(null);
      setPhoneInput('');
      setPhoneCode('');
      setPhoneAuthMessage(isEn ? 'You are signed in.' : 'ورود با شماره موبایل انجام شد.');
    } catch (error) {
      const code = error instanceof Error ? error.message : 'PHONE_AUTH_FAILED';
      const messages: Record<string, string> = {
        INVALID_OTP_INPUT: 'کد واردشده معتبر نیست.',
        OTP_INVALID: 'کد تأیید اشتباه است.',
        OTP_CHALLENGE_EXPIRED: 'مهلت کد تمام شده است. کد تازه درخواست کنید.',
        OTP_CHALLENGE_ALREADY_USED_OR_LOCKED: 'این کد دیگر قابل استفاده نیست. کد تازه درخواست کنید.',
        IDENTITY_ALREADY_LINKED_TO_ANOTHER_ACCOUNT: 'این شماره به حساب کاربری دیگری متصل است.',
        PHONE_SESSION_NOT_CREATED: 'نشست کاربری ایجاد نشد. دوباره تلاش کنید.',
      };
      setPhoneAuthMessage(messages[code] || (isEn ? 'Phone verification failed.' : 'تأیید شماره موبایل انجام نشد.'));
    } finally {
      setPhoneAuthBusy(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 space-y-7 animate-fadeIn" data-testid="product-userspace-view">
      <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex flex-col gap-4 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-lg shadow-sm">
              {p.currentUser?.displayName ? p.currentUser.displayName.charAt(0).toUpperCase() : <User className="w-6 h-6 stroke-[2]" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-slate-900 dark:text-white">{p.currentUser?.displayName || (isEn ? 'Guest User Account' : 'حساب کاربری مهمان')}</h1>
                {(p.currentUser?.emailVerified || p.currentUser?.phoneNumber) && (
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10.5px] font-bold border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle2 className="w-3 h-3" /><span>{isEn ? 'Verified' : 'تأییدشده'}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{p.currentUser?.email || (isEn ? 'Sign in to sync saved neighborhoods and price alerts across devices.' : 'برای همگام‌سازی ابری منتخب‌ها و دریافت هشدارهای هوشمند وارد شوید.')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {p.currentUser ? (
              <>
                <button type="button" onClick={() => void handleExportAccountData(false)} disabled={busyAction !== null} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"><Download className="w-3.5 h-3.5" /><span>دانلود اطلاعات حساب من</span></button>
                <button type="button" onClick={() => setConfirmDeleteOpen((v) => !v)} disabled={busyAction !== null} className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /><span>حذف کامل حساب کاربری</span></button>
                <button type="button" onClick={p.onSignOut} className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"><LogOut className="w-3.5 h-3.5" /><span>{isEn ? 'Sign Out' : 'خروج از حساب'}</span></button>
              </>
            ) : (
              <div className="w-full sm:w-[min(100%,420px)] flex flex-col gap-3">
                <button type="button" onClick={p.onGoogleSignIn} className="w-full px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"><LogIn className="w-3.5 h-3.5" /><span>{isEn ? 'Continue with Google' : 'ورود با حساب گوگل'}</span></button>
                <div className="flex items-center gap-2 text-[11px] text-slate-400"><span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" /><span>{isEn ? 'OR PHONE NUMBER' : 'یا شماره موبایل'}</span><span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" /></div>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phoneInput}
                    onChange={(event) => setPhoneInput(event.target.value)}
                    placeholder={isEn ? '+98 912 000 0000' : 'شماره موبایل؛ مثال ۰۹۱۲۱۲۳۴۵۶۷'}
                    aria-label={isEn ? 'Iranian mobile number' : 'شماره موبایل'}
                    className="min-w-0 flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-xs outline-none focus:ring-2 focus:ring-emerald-500/30"
                    disabled={phoneAuthBusy}
                  />
                  <button type="button" onClick={() => void handleRequestPhoneCode()} disabled={phoneAuthBusy || phoneInput.trim().length < 10} className="shrink-0 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer">{phoneAuthBusy ? '...' : isEn ? 'Send code' : 'ارسال کد'}</button>
                </div>
                {phoneChallengeId && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={10}
                      value={phoneCode}
                      onChange={(event) => setPhoneCode(event.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder={isEn ? 'SMS verification code' : 'کد پیامک‌شده'}
                      aria-label={isEn ? 'SMS verification code' : 'کد پیامک‌شده'}
                      className="min-w-0 flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-xs outline-none focus:ring-2 focus:ring-emerald-500/30"
                      disabled={phoneAuthBusy}
                    />
                    <button type="button" onClick={() => void handleVerifyPhoneCode()} disabled={phoneAuthBusy || phoneCode.length < 4} className="shrink-0 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold disabled:opacity-50 cursor-pointer">{isEn ? 'Verify' : 'تأیید'}</button>
                  </div>
                )}
                {phoneAuthMessage && <p role="status" aria-live="polite" className="text-[11px] text-slate-600 dark:text-slate-300">{phoneAuthMessage}</p>}
              </div>
            )}
          </div>
        </div>
        {confirmDeleteOpen && p.currentUser && (
          <div className="p-3.5 rounded-2xl bg-rose-50/90 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <span className="text-rose-800 dark:text-rose-200 font-bold">آیا از حذف دائمی حساب کاربری، آگهی‌ها، هشدارهای خرید و فایل‌های رسانه خود اطمینان دارید؟</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void handleConfirmAccountDelete()} disabled={busyAction === 'delete'} className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black cursor-pointer disabled:opacity-50">تأیید نهایی حذف حساب</button>
              <button type="button" onClick={() => setConfirmDeleteOpen(false)} className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-bold cursor-pointer">انصراف</button>
            </div>
          </div>
        )}
        {deleteLayers && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap gap-2 text-[11px] font-bold">
            <span>حذف داده‌های سرور: {deleteLayers.serverDeletion === 'completed' ? 'کامل' : 'جزئی'}</span>
            <span>· پاکسازی محلی حساب ({deleteLayers.removedLocalKeysCount} کلید): {deleteLayers.localCleanup === 'completed' ? 'انجام شد' : 'ناموفق'}</span>
            <span>· وضعیت هویت و نشست Cloudflare: {deleteLayers.authDeletion === 'completed' || deleteLayers.authDeletion === 'not_required' ? 'حذف شد' : deleteLayers.authDeletion === 'requires_reauth' ? 'نیازمند ورود مجدد' : 'ناموفق'}</span>
          </div>
        )}
        {privacyNotice && <p role={privacyNotice.kind === 'error' ? 'alert' : 'status'} className={`text-xs font-bold ${privacyNotice.kind === 'error' ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{privacyNotice.text}</p>}
      </div>
      {currentTab !== 'overview' && currentTab !== 'favorites' && (
        <AccountSubSectionsPanel
          activeSubTab={currentTab} currentUser={p.currentUser} evaluatedNeighborhoods={p.evaluatedNeighborhoods} mode={p.mode}
          visitedHomesCount={p.visitedHomesCount} onOpenVisitedModal={p.onOpenVisitedModal} onOpenBuyerAlertModal={p.onOpenBuyerAlertModal}
          onOpenBudgetFilter={p.onOpenBudgetFilter} onNavigateView={p.onNavigateView} onSelectNeighborhood={p.onSelectNeighborhood}
          onRestoreSavedView={p.onRestoreSavedView} onExportAccountData={handleExportAccountData}
          onRequestDeleteAccount={() => setConfirmDeleteOpen(true)} busyAction={busyAction} dataRequestRevision={dataRequestRevision}
        />
      )}
      {currentTab === 'overview' && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">{isEn ? 'Your Active Budget:' : 'مبنای بودجه شما:'}</span>
            <strong className="text-sm font-black text-slate-900 dark:text-white tabular-nums mt-0.5 block">{p.mode === 'buy' ? `${toPersianNum(effectiveBuyBudget)} م خرید${p.useLoanBooster ? ' (با وام)' : ''}` : `${toPersianNum(p.deposit)}م / ${toPersianNum(p.monthlyRent)}م (رهن معادل: ${toPersianNum(effectiveRahnPower)}م)`}<span className="text-[10px] font-normal text-slate-500">{budgetFx}</span></strong>
          </div>
          <button type="button" onClick={p.onOpenBudgetFilter} aria-label="تنظیم بودجه" className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"><SlidersHorizontal className="w-4 h-4" /></button>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">{isEn ? 'Property Visit Log:' : 'دفترچه بازدیدها:'}</span>
            <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5 block">{toPersianNum(p.visitedHomesCount)} {isEn ? 'recorded visits' : 'ملک ثبت‌شده'}</strong>
          </div>
          <button type="button" onClick={p.onOpenVisitedModal} aria-label={isEn ? 'Open property visit log' : 'مشاهده دفترچه بازدیدها'} className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition cursor-pointer">{isEn ? 'Open Log' : 'مشاهده'}</button>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">{isEn ? 'Under-Market Alerts:' : 'پایش فایل‌های زیر قیمت:'}</span>
            <strong className="text-sm font-black text-slate-900 dark:text-white mt-0.5 block">{isEn ? 'Smart Deal Alert' : 'پیامک هوشمند شکار'}</strong>
          </div>
          <button type="button" onClick={p.onOpenBuyerAlertModal} aria-label={isEn ? 'Configure under-market deal alert' : 'ثبت و تنظیم هشدار خرید'} className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold transition cursor-pointer hover:opacity-90">{isEn ? 'Configure' : 'ثبت هشدار'}</button>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">{isEn ? 'Shortlist Average:' : 'میانگین امتیاز منتخب‌ها:'}</span>
            <strong className="text-sm font-black text-slate-900 dark:text-white tabular-nums mt-0.5 block">{avgShortlistScore ? `${toPersianNum(avgShortlistScore)} / ۱۰` : (isEn ? 'No saves' : 'بدون منتخب')}</strong>
          </div>
          {favoriteHoods.length >= 2 && p.onOpenShortlistMatrix ? (
            <button type="button" onClick={p.onOpenShortlistMatrix} aria-label="مقایسه ماتریسی منتخب‌ها" className="p-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 transition cursor-pointer"><ArrowLeftRight className="w-4 h-4" /></button>
          ) : (
            <span className="text-[11px] text-slate-400 tabular-nums">{toPersianNum(favoriteHoods.length)} محله</span>
          )}
        </div>
      </div>}

      {currentTab === 'overview' && (
        <AccountOverviewDashboard snapshot={workspaceSnapshot} favoriteHoodsCount={favoriteHoods.length} visitedHomesCount={p.visitedHomesCount} onNavigateView={p.onNavigateView} onSwitchAccountTab={(tab) => p.onNavigateView?.('userspace', tab)} />
      )}

      {currentTab === 'overview' && <SearchHistory variant="chips" title="آخرین محله‌های جست‌وجوشده" evaluatedNeighborhoods={p.evaluatedNeighborhoods} mode={p.mode} onSelectNeighborhood={(_name, matched) => { if (matched) { p.onSelectNeighborhood(matched); p.onNavigateView?.('map'); } }} className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />}

      {currentTab === 'favorites' && (
        <AccountSavedItemsPanel
          modeTab="properties_only" savedProperties={workspaceSnapshot.savedProperties} savedSearches={workspaceSnapshot.savedSearches}
          savedMapViews={workspaceSnapshot.savedMapViews} savedMarketAnalyses={workspaceSnapshot.savedMarketAnalyses}
          evaluatedNeighborhoods={p.evaluatedNeighborhoods} dealMode={p.mode}
          onRemoveSavedProperty={(id) => { removeSavedPropertyById(id, effectiveUid); refreshWorkspace(); }}
          onCreateSearchWatchlist={() => {}} onChangeSearchCadence={() => {}} onDeleteSearchWatchlist={() => {}}
          onDeleteSavedMapView={() => {}} onDeleteSavedMarketAnalysis={() => {}}
          onOpenBudgetFilter={p.onOpenBudgetFilter} onSelectNeighborhood={p.onSelectNeighborhood} onNavigateView={p.onNavigateView}
        />
      )}

      {(currentTab === 'overview' || currentTab === 'favorites') && (
        <>
          {refHood && (
            <div className="text-[11px] text-slate-500 px-1 tabular-nums">
              محله مرجع فعال ({refHood.name}): برآورد سناریو v6.4 (غیرثبتی) هر متر {toPersianNum(refDealSqm)} میلیون تومان
            </div>
          )}
          <AccountFavoriteNeighborhoodsSection
            favoriteHoods={favoriteHoods} evaluatedNeighborhoods={p.evaluatedNeighborhoods} selectedHood={p.selectedHood} activeCity={p.activeCity}
            mode={p.mode} isEn={isEn} areaUnit={areaUnit} intlCurrency={intlCurrency} radarLocale={radarLocale} avgShortlistScore={avgShortlistScore}
            topFavScore={topFavScore} explainByHoodId={favExplainById} dealSqmByHoodId={favDealSqmById}
            renderCardHeader={(hood, isSelected, isOtherCity, cityLabel, explain) => (
              <div role="button" tabIndex={0} onClick={() => p.onSelectNeighborhood(hood)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelectNeighborhood(hood); } }} className="cursor-pointer">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-black text-slate-900 dark:text-white text-sm">{isOtherCity ? `${cityLabel} · محله ${hood.name}` : `محله ${hood.name}`}</h3>
                  {isSelected && <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">فعال روی نقشه</span>}
                </div>
                <span className="text-[11px] text-slate-400">{hood.zone} · امتیاز {toPersianNum(hood.overallScore)}/۱۰ {explain.nonCompensatoryWarningsFa[0] ? <strong className="text-amber-600 dark:text-amber-400">· ⚠ {explain.nonCompensatoryWarningsFa[0]}</strong> : null}</span>
              </div>
            )}
            onToggleFavorite={p.onToggleFavorite} onSelectNeighborhood={p.onSelectNeighborhood} onOpenInspector={p.onOpenInspector}
            onOpenShortlistMatrix={p.onOpenShortlistMatrix} onNavigateView={(v) => p.onNavigateView?.(v)}
          />
        </>
      )}
    </div>
  );
}

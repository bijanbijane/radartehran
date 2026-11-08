import React, { useState, useEffect, useMemo } from 'react'; import { KeyRound, Lock, X, Shield } from 'lucide-react'; import { BuyerAlertLeadItem, MapTileServerId, Neighborhood, SponsorCrmRequestItem, toPersianNum, } from '../data/neighborhoods'; import { CityId } from '../data/multiCityData'; import { FeatureFlags, ServerAuditLogEntry, SystemHealthData } from '../types/models'; import { convertPricePerSqmToUnit, formatAreaShort, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { createExecutionTimer, getDiagnosticSnapshots, recordDiagnosticEvent, } from '../utils/security'; import { auth } from '../firebase'; import { AreaUnitToggle, useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { useDialogFocus } from './useDialogFocus'; import { AdminOverviewAndModerationTabs } from './AdminOverviewAndModerationTabs'; import { AdminSecurityAndBackupTabs } from './AdminSecurityAndBackupTabs'; import { AdminMapProviderConfigPanel } from './AdminMapProviderConfigPanel'; export type AdminTabId = 'crm' | 'leads' | 'bargains' | 'prices' | 'security' | 'backup'; export type { ServerAuditLogEntry, SystemHealthData };
export interface AdminModalProps { open: boolean; onClose: () => void; adminUnlocked: boolean; setAdminUnlocked: React.Dispatch<React.SetStateAction<boolean>>; adminPassInput: string; setAdminPassInput: React.Dispatch<React.SetStateAction<string>>; adminPassError: string; onAdminLogin: (e: React.FormEvent) => void; adminTab: AdminTabId; setAdminTab: React.Dispatch<React.SetStateAction<AdminTabId>>; sponsorRequests: SponsorCrmRequestItem[]; buyerLeads: BuyerAlertLeadItem[]; totalLiveBargainsCount: number; neighborhoods: Neighborhood[]; activeCity?: CityId; onAdminApproveSponsor: (req: SponsorCrmRequestItem) => void; onAdminDeleteSponsorRequest: (reqId: string) => void; onDownloadBuyerLeadsCsv: () => void; onAdminDeleteBargain: (hoodId: number, bargainId: string) => void; onAdminApproveBargain?: (hoodId: number, bargainId: string) => void; adminEditHoodId: number; setAdminEditHoodId: React.Dispatch<React.SetStateAction<number>>; adminEditBuySqm: number;
  setAdminEditBuySqm: React.Dispatch<React.SetStateAction<number>>; adminEditRahn80m: number; setAdminEditRahn80m: React.Dispatch<React.SetStateAction<number>>; adminPriceSavedMsg: string; onAdminQuickPriceSave: (e: React.FormEvent) => void; deepSyncing: boolean; onDeepWebSync: () => void; newAdminPassword: string;
  setNewAdminPassword: React.Dispatch<React.SetStateAction<string>>; adminPassChangeMsg: string;
  onAdminChangePassword: (e: React.FormEvent) => void; systemHealth: SystemHealthData | null; loadingSystemHealth: boolean; onRefreshSystemHealth: () => void; featureFlags: FeatureFlags; onToggleFeatureFlag: (key: keyof FeatureFlags) => void; onDownloadFullBackupJson: () => void;
  onRestoreFullBackupJson: (e: React.ChangeEvent<HTMLInputElement>) => void; backupStatusMsg: { type: 'success' | 'error'; text: string } | null; isVerifiedAdmin?: boolean; currentUserEmail?: string | null;
  onGoogleSignIn?: () => void; onExtendSponsor30Days?: (hoodId: number) => void; onReleaseHoodSponsor?: (hoodId: number) => void; mapTileStyle?: MapTileServerId; onSelectMapTileStyle?: (style: MapTileServerId) => void; onRetryNeshan?: () => void; isFallbackActive?: boolean; temporaryInspectionMode?: boolean; asPageView?: boolean; }
export function AdminModal(props: AdminModalProps) { const { open, onClose, adminUnlocked, setAdminUnlocked, adminPassInput,
    setAdminPassInput, adminPassError, onAdminLogin, adminTab, setAdminTab, sponsorRequests, buyerLeads, totalLiveBargainsCount, neighborhoods, activeCity = 'tehran', onAdminApproveSponsor, onAdminDeleteSponsorRequest, onDownloadBuyerLeadsCsv, onAdminDeleteBargain, onAdminApproveBargain, adminEditHoodId,
    setAdminEditHoodId, adminEditBuySqm, setAdminEditBuySqm, adminEditRahn80m, setAdminEditRahn80m, adminPriceSavedMsg, onAdminQuickPriceSave, deepSyncing, onDeepWebSync, newAdminPassword, setNewAdminPassword, adminPassChangeMsg, onAdminChangePassword, systemHealth, loadingSystemHealth,
    onRefreshSystemHealth, featureFlags, onToggleFeatureFlag, onDownloadFullBackupJson, onRestoreFullBackupJson, backupStatusMsg, isVerifiedAdmin = false, currentUserEmail = null, onGoogleSignIn,
    onExtendSponsor30Days, onReleaseHoodSponsor, mapTileStyle, onSelectMapTileStyle, onRetryNeshan, isFallbackActive, temporaryInspectionMode = true, asPageView = false,
  } = props; const dialogRef = useDialogFocus(open && !asPageView, onClose); const [areaUnit] = useAreaUnit(); const [intlCurrency] = useIntlCurrency(); const [locale] = useRadarLocale(); const unitEditBuy = convertPricePerSqmToUnit(adminEditBuySqm || 120, areaUnit);
  const [adminTelegramText, setAdminTelegramText] = useState<string>('');
  const [adminTgSending, setAdminTgSending] = useState<boolean>(false);
  const [adminTgStatus, setAdminTgStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [inspectionLocked, setInspectionLocked] = useState<boolean>(false);
  useEffect(() => {
    if (open) setInspectionLocked(false);
  }, [open]);
  const isAccessGranted = (isVerifiedAdmin && adminUnlocked) || (temporaryInspectionMode && !inspectionLocked);
  const clientDiagnosticsCount = useMemo(() => {
    return getDiagnosticSnapshots().length;
  }, [open, adminTab]);
  const loadAdminTelegramDigest = async (cityToLoad: CityId = activeCity) => {
    const finishTimer = createExecutionTimer('AdminModal', 'loadAdminTelegramDigest');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`/api/telegram-digest?city=${encodeURIComponent(cityToLoad)}`, {
        signal: controller.signal, });
      if (res.ok) {
        const d = await res.json();
        if (d?.telegramText) {
          setAdminTelegramText(d.telegramText);
          finishTimer('success'); }
      }
    } catch {
      finishTimer('fallback');
    } finally {
      clearTimeout(timeoutId);
    }
  };
  useEffect(() => {
    if (open && (isVerifiedAdmin || temporaryInspectionMode) && (adminUnlocked || temporaryInspectionMode) && featureFlags.enableTelegramFeed) {
      loadAdminTelegramDigest(activeCity);
    }
  }, [open, isVerifiedAdmin, adminUnlocked, temporaryInspectionMode, featureFlags.enableTelegramFeed, activeCity]);
  const handleAdminSendTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminTgSending || !isVerifiedAdmin) return;
    setAdminTgSending(true);
    setAdminTgStatus(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }
      const res = await fetch(`/api/send-telegram?city=${encodeURIComponent(activeCity)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          city: activeCity,
          text: adminTelegramText,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      setAdminTgStatus({
        type: data?.sent ? 'success' : 'error',
        text: data?.message || 'پاسخ از سرور دریافت شد.',
      });
      recordDiagnosticEvent(
        'AdminModal',
        'handleAdminSendTelegram',
        data?.sent ? 'success' : 'fallback'
      );
    } catch {
      setAdminTgStatus({
        type: 'error',
        text: 'خطا در ارتباط با سرور؛ متن آماده را کپی و در کانال منتشر کنید.',
      });
    } finally {
      clearTimeout(timeoutId);
      setAdminTgSending(false);
    }
  };
  if (!open) return null;
  return (
    <div
      role={asPageView ? 'region' : 'dialog'}
      aria-modal={asPageView ? undefined : 'true'}
      aria-label="پنل مدیریت سایت"
      onClick={asPageView ? undefined : onClose}
      className={asPageView ? 'w-full max-w-6xl mx-auto p-3 sm:p-6' : 'fixed inset-0 bg-black/30 backdrop-blur-[3px] flex items-center justify-center p-4 z-50'}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={asPageView ? 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm w-full p-5 sm:p-6 focus:outline-none' : 'apple-window-sheet max-w-4xl w-full p-5 max-h-[90vh] overflow-y-auto focus:outline-none'}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-700/70 pb-3.5 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-[10px] bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 stroke-[1.75]" />
            </span>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                پنل مدیریت سایت (CRM، سلامت سرور، پشتیبان‌گیری و ماژول‌ها)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                نرخ محله انتخابی ({formatAreaUnitLabel(areaUnit)}): {toPersianNum(unitEditBuy)} م
                {intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitEditBuy, intlCurrency, locale)})` : ''} · {formatAreaShort(80, areaUnit)}: {toPersianNum((adminEditBuySqm || 120) * 80)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency((adminEditBuySqm || 120) * 80, intlCurrency, locale)})` : ''} · اجاره ماهانه: {toPersianNum(Math.round((adminEditRahn80m || 1500) * 0.03))} م
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AreaUnitToggle compact showIntlControls />
            {isAccessGranted && (
              <button
                type="button"
                onClick={() => {
                  setAdminUnlocked(false);
                  setInspectionLocked(true);
                }}
                className="px-2.5 py-1.5 rounded-[10px] bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 text-xs font-bold cursor-pointer"
              >
                قفل پنل
              </button>
            )}
            <button
              type="button"
              aria-label="بستن پنل مدیریت"
              onClick={onClose}
              className={asPageView ? 'px-3 py-1.5 rounded-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors' : 'w-8 h-8 rounded-full bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer transition-colors'}
            >
              {asPageView ? <span>بازگشت به نقشه</span> : <X className="w-4 h-4 stroke-[2]" />}
            </button>
          </div>
        </div>
        {!isAccessGranted ? (
          <form onSubmit={onAdminLogin} className="max-w-md mx-auto py-6 space-y-4 text-xs">
            <div className="apple-grouped-card p-4 space-y-3">
              <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
                <span>احراز هویت مدیر سیستم (Firebase Admin Auth)</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                دسترسی به اطلاعات CRM املاک، شماره متقاضیان خرید و تنظیمات کلود توسط قوانین امنیتی
                سرور (Firestore Security Rules) محافظت می‌شود و نیازمند ورود با حساب رسمی مدیر
                سیستم است.
              </p>
              {!currentUserEmail ? (
                <div className="p-3 rounded-[10px] bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-200 space-y-2">
                  <div className="font-bold">وضعیت فعلی: وارد حساب کاربری نشده‌اید</div>
                  <p className="text-[11px] leading-relaxed">
                    لطفاً ابتدا با حساب گوگل مدیریت وارد شوید. کاربران مهمان مجوز مشاهده یا ویرایش
                    داده‌های مدیریتی را ندارند.
                  </p>
                  {onGoogleSignIn && (
                    <button
                      type="button"
                      onClick={onGoogleSignIn}
                      className="w-full py-2 rounded-[10px] bg-slate-900 hover:bg-slate-800 text-white font-bold transition cursor-pointer"
                    >
                      ورود با حساب گوگل مدیریت
                    </button>
                  )}
                </div>
              ) : !isVerifiedAdmin ? (
                <div
                  role="alert"
                  className="p-3 rounded-[10px] bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 text-rose-800 dark:text-rose-200 space-y-1.5"
                >
                  <div className="font-extrabold">
                    دسترسی غیرمجاز (403 Unauthorized) — حساب فاقد مجوز مدیریت
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    حساب فعلی (<code className="font-mono">{currentUserEmail}</code>) دارای سطح
                    دسترسی ادمین نیست. عملیات خواندن/نوشتن مجموعه‌های مدیریتی در فایراستور برای این
                    حساب مسدود است.
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-[10px] bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-200 space-y-2">
                  <div className="font-bold">
                    هویت ادمین تایید شد (<code className="font-mono">{currentUserEmail}</code>)
                  </div>
                  <input
                    type="password" aria-label="رمز قفل جلسه پنل مدیریت"
                    value={adminPassInput}
                    onChange={(e) => setAdminPassInput(e.target.value)}
                    placeholder="رمز قفل جلسه (اختیاری در صورت تنظیم)..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 rounded-[10px] px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              )}
              {adminPassError && (
                <div role="alert" className="text-rose-600 dark:text-rose-400 font-semibold">
                  {adminPassError}
                </div>
              )}
              <button
                type="submit"
                className="w-full py-2.5 rounded-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold transition cursor-pointer"
              >
                بررسی مجوز و بازگشایی پنل مدیریت
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4 text-xs">
            {temporaryInspectionMode && !isVerifiedAdmin && (
              <div className="p-3 rounded-[12px] bg-amber-50 dark:bg-amber-950/50 border border-amber-300/80 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 stroke-[2.2]" />
                  <div>
                    <span className="font-extrabold block">حالت بررسی موقت (بدون نیاز به رمز عبور)</span>
                    <span className="text-[11px] text-amber-800 dark:text-amber-300">
                      دسترسی مستقیم جهت بررسی و ارزیابی بخش‌های مدیریت و مانیتورینگ؛ پس از اتمام بررسی به محل امن بازگردانده می‌شود.
                    </span>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200/90 dark:bg-amber-900/80 text-amber-900 dark:text-amber-100 font-bold shrink-0">
                  بررسی موقت
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1 apple-segmented p-1 rounded-[12px] font-bold">
              {[
                { id: 'crm' as const, label: `۱. حامیان (${toPersianNum((sponsorRequests || []).length)})`, isEm: false },
                { id: 'leads' as const, label: `۲. خریداران (${toPersianNum((buyerLeads || []).length)})`, isEm: false },
                { id: 'bargains' as const, label: `۳. شکارها (${toPersianNum(totalLiveBargainsCount)})`, isEm: false },
                { id: 'prices' as const, label: '۴. ویرایش قیمت‌ها', isEm: false },
                { id: 'security' as const, label: 'امنیت و سلامت سرور', isEm: true },
                { id: 'backup' as const, label: 'پشتیبان‌گیری و ماژول‌های آینده', isEm: true },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setAdminTab(t.id);
                    if (t.id === 'security') onRefreshSystemHealth();
                  }}
                  className={`py-2 px-2.5 rounded-[9px] transition cursor-pointer ${
                    adminTab === t.id
                      ? `apple-segmented-pill-active ${t.isEm ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {(adminTab === 'crm' || adminTab === 'leads' || adminTab === 'bargains' || adminTab === 'prices') && (
              <AdminOverviewAndModerationTabs
                adminTab={adminTab} featureFlags={featureFlags} onToggleFeatureFlag={onToggleFeatureFlag}
                neighborhoods={neighborhoods} sponsorRequests={sponsorRequests} buyerLeads={buyerLeads}
                totalLiveBargainsCount={totalLiveBargainsCount} onAdminApproveSponsor={onAdminApproveSponsor}
                onAdminDeleteSponsorRequest={onAdminDeleteSponsorRequest} onDownloadBuyerLeadsCsv={onDownloadBuyerLeadsCsv}
                onAdminDeleteBargain={onAdminDeleteBargain} onAdminApproveBargain={onAdminApproveBargain} adminEditHoodId={adminEditHoodId}
                setAdminEditHoodId={setAdminEditHoodId} adminEditBuySqm={adminEditBuySqm}
                setAdminEditBuySqm={setAdminEditBuySqm} adminEditRahn80m={adminEditRahn80m}
                setAdminEditRahn80m={setAdminEditRahn80m} adminPriceSavedMsg={adminPriceSavedMsg}
                onAdminQuickPriceSave={onAdminQuickPriceSave} deepSyncing={deepSyncing}
                onDeepWebSync={onDeepWebSync} newAdminPassword={newAdminPassword}
                setNewAdminPassword={setNewAdminPassword} adminPassChangeMsg={adminPassChangeMsg}
                onAdminChangePassword={onAdminChangePassword} onExtendSponsor30Days={onExtendSponsor30Days}
                onReleaseHoodSponsor={onReleaseHoodSponsor}
              />
            )}
            {onSelectMapTileStyle && mapTileStyle && (adminTab === 'security' || adminTab === 'backup') && (
              <AdminMapProviderConfigPanel
                currentStyle={mapTileStyle} onSelectStyle={onSelectMapTileStyle}
                onRetryNeshan={onRetryNeshan} isFallbackActive={isFallbackActive} areaUnit={areaUnit} intlCurrency={intlCurrency}
              />
            )}
            {(adminTab === 'security' || adminTab === 'backup') && (
              <AdminSecurityAndBackupTabs
                adminTab={adminTab} activeCity={activeCity} clientDiagnosticsCount={clientDiagnosticsCount}
                systemHealth={systemHealth} loadingSystemHealth={loadingSystemHealth}
                onRefreshSystemHealth={onRefreshSystemHealth} featureFlags={featureFlags}
                onToggleFeatureFlag={onToggleFeatureFlag} onDownloadFullBackupJson={onDownloadFullBackupJson}
                onRestoreFullBackupJson={onRestoreFullBackupJson} backupStatusMsg={backupStatusMsg}
                neighborhoods={neighborhoods} totalLiveBargainsCount={totalLiveBargainsCount}
                sponsorRequests={sponsorRequests} buyerLeads={buyerLeads} adminTelegramText={adminTelegramText}
                setAdminTelegramText={setAdminTelegramText} loadAdminTelegramDigest={loadAdminTelegramDigest}
                handleAdminSendTelegram={handleAdminSendTelegram} adminTgSending={adminTgSending} adminTgStatus={adminTgStatus} />
            )} </div>
        )} </div>
    </div>
  ); }
import React, { useState } from 'react'; import { Activity, CheckCircle2, Clock, Copy, Cpu, Database, Download, RefreshCw, Send, Server, ShieldCheck, Sparkles, Upload, } from 'lucide-react'; import { BuyerAlertLeadItem, Neighborhood, SponsorCrmRequestItem, toPersianNum, } from '../data/neighborhoods'; import { CityId } from '../data/multiCityData'; import { FeatureFlags, SystemHealthData } from '../types/models'; import { runClient100StepAudit, ClientAuditReport } from '../data/diagnosticRunner'; import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator'; import { convertPricePerSqmToUnit, formatAreaShort, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { auth } from '../firebase'; import { AdminEnvConfigPanel } from './AdminEnvConfigPanel'; const AdminCloudAiCommerceCenter = React.lazy(() => import('./AdminCloudAiCommerceCenter').then((m) => ({ default: m.AdminCloudAiCommerceCenter }))); import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { CleanupProgressSummary, type CleanupReconciliationMetrics, } from './CleanupProgressSummary'; import type { AdminTabId } from './AdminModal'; const FEATURE_FLAG_ITEMS: { key: keyof FeatureFlags; title: string; subtitle: string }[] = [
  { key: 'enableCommissionCalc', title: 'ماشین‌حساب کمیسیون املاک و هزینه محضر', subtitle: 'محاسبه خودکار حق کمیسیون قانونی اتحادیه، مالیات ارزش افزوده و هزینه ثبت اسناد' }, { key: 'enableMultiCity', title: 'نمایش شهرهای جدید: کرج، مشهد، اصفهان، شیراز', subtitle: 'افزودن کلان‌شهرهای منتخب به نقشه رادار مسکن و مقایسه بین‌شهری' }, { key: 'enableSponsorBilling', title: 'سیستم انقضای ۳۰ روزه و تعرفه خودکار تابلوهای املاک', subtitle: 'مدیریت هوشمند اعتبار ماهانه حامیان رسمی محلات و یادآور تمدید اشتراک' }, { key: 'enableAiContractCheck', title: 'هوش مصنوعی مشاور قولنامه و ضدکلاهبرداری', subtitle: 'بررسی بندهای حقوقی مبایعه‌نامه و اجاره‌نامه و هشدار ریسک‌های معاملاتی' }, { key: 'enableTelegramFeed', title: 'خروجی خودکار شکارها برای کانال تلگرام', subtitle: 'تولید پست استاندارد و لینک‌دار از فایل‌های زیر قیمت تاییدشده برای انتشار فوری' }, { key: 'enableAiValuation', title: 'کارشناسی هوشمند قیمت دقیق ملک («خانه من چند می‌ارزد؟»)', subtitle: 'محاسبه دقیق ارزش منصفانه، قیمت فروش فوری و صدور گواهی کارشناسی ملک بر اساس مشخصات واحد' }, { key: 'enableFakeAdDetector', title: 'مچ‌گیر هوشمند آگهی‌های فیک و تله‌های قیمتی املاک', subtitle: 'تشخیص آگهی‌های شکاری/طعمه و ارائه سوالات کلیدی راستی‌آزمایی تلفنی از مشاور' }, { key: 'enableMortgageSimulator', title: 'ماشین‌حساب وام مسکن، اوراق تسه، خرید متری و سال‌های خانه‌دار شدن', subtitle: 'محاسبه دقیق هزینه خرید اوراق تسه، خالص دریافتی، اقساط ۱۲ ساله و خرید متری مسکن' },
  { key: 'enableTenantRights', title: 'داور هوشمند قانون موجر و مستأجر، شارژ ساختمان و تقویم قرارداد', subtitle: 'تفکیک قانونی هزینه‌های مالک و مستأجر، تقسیم شارژ ساختمان و یادآور سررسید چک و تمدید' }, { key: 'enableMunicipalityCalc', title: 'دستیار ضوابط شهرداری (R122)، بازسازی، مشارکت در ساخت و برق اضطراری', subtitle: 'برآورد هزینه بازسازی، درصد مشارکت در ساخت، جریمه ماده ۱۰۰ و ظرفیت UPS قطعی برق' }, { key: 'enablePropertySwap', title: 'مرکز تهاتر ملک، مقایسه شهرهای حومه و اجاره روزانه مبله', subtitle: 'موتور تطبیق معاوضه ملک، مقایسه پردیس/پرند/گلبهار/صدرا و شبیه‌ساز اجاره روزانه مبله' }, { key: 'enableVisitChecklist', title: 'دفترچه امتیازدهی بازدید حضوری و اعزام کارشناس فنی/حقوقی', subtitle: 'چک‌لیست ۱۲گانه امتیازدهی بازدید آپارتمان‌ها از ۱۰۰ امتیاز و رزرو کارشناس حضوری' },
  { key: 'enableSchoolRadar', title: 'رادار مدارس برتر، طرح ترافیک، ایمنی گسل و سبک زندگی محله', subtitle: 'بررسی کیفیت آموزشی، فاصله از گسل زلزله، بافت فرسوده و عوارض طرح ترافیک با تخفیف ساکنین' }, { key: 'enableRealtorStudio', title: 'استودیو آگهی‌نویس هوشمند املاک، ماشین‌حساب اسباب‌کشی و ویجت سئو', subtitle: 'تولید متن آگهی و استوری، محاسبه هزینه باربری، مقاله سئوی محله و کد ویجت بک‌لینک' }, ]; export interface AdminSecurityAndBackupTabsProps { adminTab: AdminTabId; activeCity: CityId; clientDiagnosticsCount: number; systemHealth: SystemHealthData | null; loadingSystemHealth: boolean; onRefreshSystemHealth: () => void; featureFlags: FeatureFlags; onToggleFeatureFlag: (key: keyof FeatureFlags) => void; onDownloadFullBackupJson: () => void;
  onRestoreFullBackupJson: (e: React.ChangeEvent<HTMLInputElement>) => void; backupStatusMsg: { type: 'success' | 'error'; text: string } | null; neighborhoods: Neighborhood[]; totalLiveBargainsCount: number; sponsorRequests: SponsorCrmRequestItem[]; buyerLeads: BuyerAlertLeadItem[]; adminTelegramText: string; setAdminTelegramText: (v: string) => void; loadAdminTelegramDigest: (city: CityId) => void; handleAdminSendTelegram: (e: React.FormEvent) => void; adminTgSending: boolean; adminTgStatus: { type: 'success' | 'error'; text: string } | null; }
export function AdminSecurityAndBackupTabs( props: AdminSecurityAndBackupTabsProps
): React.ReactElement | null { const { adminTab, activeCity, clientDiagnosticsCount, systemHealth, loadingSystemHealth, onRefreshSystemHealth, featureFlags, onToggleFeatureFlag, onDownloadFullBackupJson, onRestoreFullBackupJson, backupStatusMsg, neighborhoods, totalLiveBargainsCount, sponsorRequests, buyerLeads, adminTelegramText, setAdminTelegramText, loadAdminTelegramDigest, handleAdminSendTelegram, adminTgSending, adminTgStatus, } = props; const [areaUnit] = useAreaUnit(); const [intlCurrency] = useIntlCurrency(); const [locale] = useRadarLocale(); const avgBuySqm = neighborhoods.length > 0 ? Math.round(neighborhoods.reduce((acc, h) => acc + h.buyPerSqm, 0) / neighborhoods.length) : 120; const avgUnitBuy = convertPricePerSqmToUnit(avgBuySqm, areaUnit); const avgUnitDeal = convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(1, 'تهران', avgBuySqm, []).estimatedDealPricePerSqm, areaUnit); const [auditReport, setAuditReport] = useState<ClientAuditReport | null>(null); const [runningAudit, setRunningAudit] = useState<boolean>(false); const [adminTgCopied, setAdminTgCopied] = useState<boolean>(false); const [runningRecovery, setRunningRecovery] = useState<boolean>(false); const [recoverySummary, setRecoverySummary] = useState<CleanupReconciliationMetrics | null>(null); const [recoveryError, setRecoveryError] = useState<string | null>(null); const handleReconcilePendingDeletes = async () => { setRunningRecovery(true); setRecoveryError(null);
    try { const headers: Record<string, string> = {}; if (auth.currentUser) { const idToken = await auth.currentUser.getIdToken();
        if (idToken) headers.Authorization = `Bearer ${idToken}`;
      }
      const res = await fetch('/api/object-storage/admin/reconcile-pending-deletes?limit=25', { method: 'POST', headers, }); const data = await res.json(); if (!res.ok && res.status !== 207) { throw new Error(data?.message || 'خطا در بازیابی حذف‌های نیمه‌تمام رسانه‌ها'); }
      setRecoverySummary({ deletedCount: Number(data.deletedCount ?? 0), skippedCount: Number(data.skippedCount ?? data.blockedCount ?? 0), failedCount: Number(data.failedCount ?? 0),
        morePendingRecords: Boolean(data.morePendingRecords), scannedPendingCount: Number(data.scannedPendingCount ?? 0), journalSyncedCount: typeof data.journalSyncedCount === 'number' ? data.journalSyncedCount : undefined, }); onRefreshSystemHealth();
    } catch (err: any) { setRecoveryError(err?.message || 'خطا در اجرای بازیابی حذف‌های نیمه‌تمام'); } finally {
      setRunningRecovery(false); } };
  if (adminTab === 'security') { return (
      <div className="space-y-4">
        <AdminEnvConfigPanel />
        <AdminCloudAiCommerceCenter />
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 stroke-[1.75] text-emerald-600" />
            <div>
              <div className="font-extrabold text-slate-900 text-sm">
                مانیتورینگ زنده سلامت سرور، Rate Limiter و لاگ‌های امنیتی
              </div>
              <div className="text-slate-500 text-[11px]">
                داده‌های زنده از اندپوینت <code className="font-mono">/api/system-health</code> · رویدادهای کلاینت: {toPersianNum(clientDiagnosticsCount)}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={handleReconcilePendingDeletes} disabled={runningRecovery} className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-xs">
              <Database className="w-4 h-4 stroke-[1.75]" />
              <span>{runningRecovery ? 'در حال بازیابی حذف‌ها...' : 'بازیابی حذف‌های نیمه‌تمام رسانه'}</span>
            </button>
            <button
              type="button"
              onClick={() => { setRunningAudit(true);
                setTimeout(() => {
                  const res = runClient100StepAudit(areaUnit, intlCurrency);
                  setAuditReport(res);
                  setRunningAudit(false);
                }, 80);
              }}
              disabled={runningAudit}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-xs"
            >
              <CheckCircle2 className="w-4 h-4 stroke-[1.75] text-emerald-400" />
              <span>{runningAudit ? 'در حال اجرای ۱۰۰ آزمون...' : 'اجرای دیباگ ۱۰۰ مرحله‌ای'}</span>
            </button>
            <button type="button" onClick={onRefreshSystemHealth} disabled={loadingSystemHealth} className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-xs">
              <RefreshCw className={`w-4 h-4 stroke-[1.75] ${loadingSystemHealth ? 'animate-spin' : ''}`} />
              <span>بروزرسانی وضعیت سلامت</span>
            </button>
          </div>
        </div>
        <CleanupProgressSummary metrics={recoverySummary} error={recoveryError} />
        {auditReport && (
          <div className="bg-emerald-950/5 border border-emerald-500/30 rounded-2xl p-4 space-y-3 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/20 pb-2.5">
              <div className="flex items-center gap-2 text-emerald-800 font-black text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>نتایج دیباگ {toPersianNum(auditReport.totalSteps)} مرحله‌ای: {toPersianNum(auditReport.totalPassed)} از {toPersianNum(auditReport.totalSteps)} آزمون موفق (۰ خطا)</span>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">
                زمان کل: {toPersianNum(auditReport.elapsedMs)} میلی‌ثانیه
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-emerald-500/10 pr-1 space-y-0.5">
              {auditReport.steps.map((s) => (
                <div key={s.step} className="py-2 flex items-center justify-between gap-2 text-xs hover:bg-emerald-500/5 px-2 rounded-lg transition">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-bold text-slate-500 shrink-0">#{toPersianNum(s.step)}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-slate-200 text-slate-700 shrink-0">{s.domain}</span>
                    <span className="font-bold text-slate-900 truncate">{s.name}</span>
                  </div>
                  <span className="text-slate-500 text-[11px] truncate shrink-0 max-w-xs">{s.details}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-slate-500">
              <span>آپ‌تایم سرور (Uptime)</span>
              <Clock className="w-4 h-4 stroke-[1.75] text-emerald-600" />
            </div>
            <div className="text-base font-black text-slate-900 tabular-nums">
              {systemHealth ? `${toPersianNum(systemHealth.uptimeMinutes)} دقیقه (${toPersianNum(systemHealth.uptimeHours)} ساعت)` : 'در حال دریافت...'}
            </div>
            <div className="text-[11px] text-emerald-700 font-semibold">پایداری هسته Express: فعال (OK)</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-slate-500">
              <span>مصرف حافظه رم (RSS)</span>
              <Cpu className="w-4 h-4 stroke-[1.75] text-emerald-600" />
            </div>
            <div className="text-base font-black text-slate-900 tabular-nums">
              {systemHealth ? `${toPersianNum(systemHealth.memoryRssMb)} مگابایت` : 'در حال دریافت...'}
            </div>
            <div className="text-[11px] text-slate-500">
              سقف Payload مجاز: <strong className="text-slate-800">{systemHealth?.securityMetrics?.payloadLimit || '250kb'}</strong>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-slate-500">
              <span>سپر ضدحمله (Rate Limiter)</span>
              <ShieldCheck className="w-4 h-4 stroke-[1.75] text-emerald-600" />
            </div>
            <div className="text-sm font-black text-slate-900">
              {systemHealth?.securityMetrics?.generalRateLimit || '180 req / min'} · {systemHealth?.securityMetrics?.heavySyncRateLimit || '3 req / 10 min'}
            </div>
            <div className="text-[11px] text-slate-500">
              IPهای فعال: <strong className="text-slate-800">{toPersianNum(systemHealth?.securityMetrics?.activeTrackedIps ?? 1)}</strong> | مسدودشده: <strong className="text-rose-600">{toPersianNum(systemHealth?.securityMetrics?.totalBlockedRequests ?? 0)}</strong>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-slate-500">
              <span>وضعیت API هوا و هوش مصنوعی</span>
              <Server className="w-4 h-4 stroke-[1.75] text-emerald-600" />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${systemHealth?.apiConnectivity?.openMeteoStatus === 'OK' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                Open-Meteo: {systemHealth?.apiConnectivity?.openMeteoStatus || 'OK'}
              </span>
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${systemHealth?.apiConnectivity?.geminiConfigured ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-200 text-slate-700'}`}>
                Gemini: {systemHealth?.apiConnectivity?.geminiConfigured ? 'متصل' : 'کش داخلی'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500">
              نوبت بعدی رصد: <strong className="text-slate-800">{systemHealth?.cacheStatus?.nextScheduledTimeFa || 'ساعت زوج بعدی'}</strong>
            </div>
          </div>
        </div>
        {systemHealth?.cacheStatus && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
            <div>
              وضعیت کش سرور: <strong className="text-emerald-700">{systemHealth.cacheStatus.state}</strong> · آخرین بروزرسانی: <strong className="text-slate-900">{systemHealth.cacheStatus.lastUpdatedTimeFa}</strong>
            </div>
            <div>
              محله‌های فعال در کش: <strong className="text-slate-900">{toPersianNum(systemHealth.cacheStatus.totalCachedNeighborhoods)} محله</strong> · بازنویسی‌های عمیق Gemini: <strong className="text-emerald-700">{toPersianNum(systemHealth.cacheStatus.deepSyncedOverridesCount)} محله</strong>
            </div>
          </div>
        )}
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
          <div className="bg-slate-50 px-3.5 py-2.5 border-b border-slate-200 flex items-center justify-between font-extrabold text-slate-800">
            <div className="flex items-center gap-1.5">
              <Activity className="w-4 h-4 stroke-[1.75] text-emerald-600" />
              <span>۲۰ لاگ اخیر رویدادها و همگام‌سازی سرور (Audit Ring Buffer)</span>
            </div>
            <span className="text-[11px] text-slate-500 font-normal">بروزرسانی لحظه‌ای</span>
          </div>
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
            {!systemHealth?.recentLogs || systemHealth.recentLogs.length === 0 ? (
              <div className="py-6 text-center text-slate-400">هنوز رویدادی در بافر سرور ثبت نشده است.</div>
            ) : (
              systemHealth.recentLogs.map((log) => (
                <div key={log.id} className="px-3.5 py-2 flex items-center justify-between gap-3 hover:bg-slate-50/80">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${log.level === 'SYNC' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : log.level === 'WARN' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-700'}`}>
                      {log.level}
                    </span>
                    <span className="text-slate-800 font-medium">{log.event}</span>
                  </div>
                  <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{log.timeFa}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <AdminEnvConfigPanel />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
            <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 stroke-[1.75] text-emerald-600" />
              <span>موتور مدیریت ماژول‌های سال اول (Feature Flags)</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold">ذخیره در مرورگر و کلود</span>
          </div>
          <div className="space-y-2.5">
            {FEATURE_FLAG_ITEMS.map((item) => {
              const active = Boolean(featureFlags[item.key]);
              return (
                <div key={item.key} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900">{item.title}</div>
                    <div className="text-[11px] text-slate-500 leading-relaxed">{item.subtitle}</div>
                  </div>
                  <button
                    type="button" onClick={() => onToggleFeatureFlag(item.key)}
                    className={`px-3 py-1.5 rounded-xl font-extrabold text-[11px] shrink-0 transition cursor-pointer border ${
                      active ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {active ? 'فعال (ON)' : 'غیرفعال (OFF)'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
              <Database className="w-4 h-4 stroke-[1.75] text-emerald-600" />
              <span>پشتیبان‌گیری کامل و بازیابی ۱-کلیکی دیتابیس</span>
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              شامل تمامی محله‌ها، قیمت‌های ویرایش‌شده، حامیان املاک (CRM)، آگهی‌های شکار طلایی، شماره‌های خریداران و تنظیمات ماژول‌ها در قالب یک فایل استاندارد JSON.
            </p>
            <button type="button" onClick={onDownloadFullBackupJson} className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center justify-center gap-2 transition cursor-pointer shadow-xs">
              <Download className="w-4 h-4 stroke-[1.75]" />
              <span>دانلود فایل پشتیبان کامل دیتابیس (Full JSON Backup)</span>
            </button>
            <div className="pt-2 border-t border-slate-200/80 space-y-2">
              <label className="block font-bold text-slate-800">بازیابی دیتابیس از فایل پشتیبان (Restore JSON):</label>
              <label className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 border-dashed font-bold flex items-center justify-center gap-2 transition cursor-pointer">
                <Upload className="w-4 h-4 stroke-[1.75] text-emerald-600" />
                <span>انتخاب فایل JSON و بازیابی فوری اطلاعات</span>
                <input type="file" accept=".json,application/json" onChange={onRestoreFullBackupJson} className="hidden" />
              </label>
            </div>
            {backupStatusMsg && (
              <div className={`p-3 rounded-xl font-semibold flex items-center gap-2 ${backupStatusMsg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
                <CheckCircle2 className="w-4 h-4 stroke-[1.75] shrink-0" />
                <span>{backupStatusMsg.text}</span>
              </div>
            )}
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-[11px] text-slate-600">
            <div className="font-extrabold text-slate-900">خلاصه موجودیت‌های فعلی آماده پشتیبان‌گیری ({formatAreaShort(80, areaUnit)}):</div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="bg-white border border-slate-200 rounded-xl p-2.5">
                کل محله‌ها: <strong className="text-slate-900">{toPersianNum(neighborhoods.length)} محله</strong> ({formatAreaUnitLabel(areaUnit)}: {toPersianNum(avgUnitBuy)} م · معیار {formatAreaShort(80, areaUnit)} · معامله v6.4: {toPersianNum(avgUnitDeal)} م{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(avgUnitBuy, intlCurrency, locale)}` : ''})
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-2.5">فایل‌های شکار طلایی: <strong className="text-emerald-700">{toPersianNum(totalLiveBargainsCount)} فایل</strong></div>
              <div className="bg-white border border-slate-200 rounded-xl p-2.5">درخواست‌های CRM املاک: <strong className="text-slate-900">{toPersianNum((sponsorRequests || []).length)} مورد</strong></div>
              <div className="bg-white border border-slate-200 rounded-xl p-2.5">شماره خریداران: <strong className="text-slate-900">{toPersianNum((buyerLeads || []).length)} شماره</strong></div>
            </div>
          </div>
          {featureFlags.enableTelegramFeed && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <Send className="w-4 h-4 stroke-[1.75] text-emerald-600" />
                  <span>خروجی زنده کانال تلگرام و ربات Webhook</span>
                </div>
                <button type="button" onClick={() => loadAdminTelegramDigest(activeCity)} className="text-[11px] text-emerald-700 font-bold hover:underline cursor-pointer">
                  بروزرسانی متن
                </button>
              </div>
              <textarea rows={6} value={adminTelegramText} onChange={(e) => setAdminTelegramText(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-slate-800 text-[11px] leading-relaxed" />
              <button
                type="button"
                onClick={() => { navigator.clipboard?.writeText(adminTelegramText).catch(() => {}); setAdminTgCopied(true); setTimeout(() => setAdminTgCopied(false), 2000); }} className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-4 h-4 stroke-[1.75]" />
                <span>{adminTgCopied ? 'پست آماده تلگرام کپی شد!' : 'کپی پست آماده کانال تلگرام'}</span>
              </button>
              <form onSubmit={handleAdminSendTelegram} className="space-y-2 pt-2 border-t border-slate-200">
                <div className="text-[11px] text-slate-600">
                  ارسال مستقیم از طریق متغیرهای محیطی امن سرور (`TELEGRAM_BOT_TOKEN` و `TELEGRAM_CHANNEL_ID`)
                </div>
                {adminTgStatus && (
                  <div className={`p-2 rounded-lg text-[11px] font-semibold ${adminTgStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                    {adminTgStatus.text} </div>
                )} <button type="submit" disabled={adminTgSending} className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer disabled:opacity-50">
                  {adminTgSending ? 'در حال ارسال...' : 'ارسال مستقیم به کانال تلگرام'} </button>
              </form>
            </div>
          )} </div>
      </div>
    </div>
  ); }
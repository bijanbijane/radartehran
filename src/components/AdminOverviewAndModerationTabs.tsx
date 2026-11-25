import React from 'react';
import { CheckCircle2, Download, Edit3, KeyRound, Sparkles, Trash2 } from 'lucide-react';
import { BuyerAlertLeadItem, Neighborhood, SponsorCrmRequestItem, toPersianNum } from '../data/neighborhoods';
import {
  aggregateNeighborhoodMarketMetrics,
  aggregateMarketMetricsForHood,
  aggregateMarketMetricsForScalars,
  buildNeighborhoodListingSamples,
} from '../data/realMarketPriceAggregator';
import { FeatureFlags } from '../types/models';
import { classifyFeedbackTone } from '../utils/forms/formInputHelpers';
import { AdminMonetizationCard } from './AdminMonetizationCard';
import { NumericDraftInput } from './ui/NumericDraftInput';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';
import type { AdminTabId } from './AdminModal';

export interface AdminOverviewAndModerationTabsProps {
  adminTab: AdminTabId;
  featureFlags: FeatureFlags;
  onToggleFeatureFlag: (key: keyof FeatureFlags) => void;
  neighborhoods: Neighborhood[];
  sponsorRequests: SponsorCrmRequestItem[];
  buyerLeads: BuyerAlertLeadItem[];
  totalLiveBargainsCount: number;
  onAdminApproveSponsor: (req: SponsorCrmRequestItem) => void;
  onAdminDeleteSponsorRequest: (reqId: string) => void;
  onDownloadBuyerLeadsCsv: () => void;
  onAdminDeleteBargain: (hoodId: number, bargainId: string) => void;
  onAdminApproveBargain?: (hoodId: number, bargainId: string) => void;
  adminEditHoodId: number;
  setAdminEditHoodId: React.Dispatch<React.SetStateAction<number>>;
  adminEditBuySqm: number;
  setAdminEditBuySqm: React.Dispatch<React.SetStateAction<number>>;
  adminEditRahn80m: number;
  setAdminEditRahn80m: React.Dispatch<React.SetStateAction<number>>;
  adminPriceSavedMsg: string;
  setAdminPriceSavedMsg?: React.Dispatch<React.SetStateAction<string>>;
  onAdminQuickPriceSave: (e: React.FormEvent) => void;
  deepSyncing: boolean;
  onDeepWebSync: () => void;
  newAdminPassword: string;
  setNewAdminPassword: React.Dispatch<React.SetStateAction<string>>;
  adminPassChangeMsg: string;
  setAdminPassChangeMsg?: React.Dispatch<React.SetStateAction<string>>;
  onAdminChangePassword: (e: React.FormEvent) => void;
  onExtendSponsor30Days?: (hoodId: number) => void;
  onReleaseHoodSponsor?: (hoodId: number) => void;
  isVerifiedAdmin?: boolean;
}

export function AdminOverviewAndModerationTabs(
  props: AdminOverviewAndModerationTabsProps
): React.ReactElement | null {
  const {
    adminTab, featureFlags, onToggleFeatureFlag, neighborhoods, sponsorRequests,
    buyerLeads, totalLiveBargainsCount, onAdminApproveSponsor,
    onAdminDeleteSponsorRequest, onDownloadBuyerLeadsCsv, onAdminDeleteBargain, onAdminApproveBargain,
    adminEditHoodId, setAdminEditHoodId, adminEditBuySqm, setAdminEditBuySqm,
    adminEditRahn80m, setAdminEditRahn80m, adminPriceSavedMsg, setAdminPriceSavedMsg,
    onAdminQuickPriceSave, deepSyncing, onDeepWebSync, newAdminPassword,
    setNewAdminPassword, adminPassChangeMsg, setAdminPassChangeMsg, onAdminChangePassword,
    onExtendSponsor30Days, onReleaseHoodSponsor, isVerifiedAdmin,
  } = props;
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();
  const fxTag = (millionVal: number) =>
    intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(millionVal, intlCurrency, radarLocale)})` : '';

  React.useEffect(() => {
    if (neighborhoods.length === 0) return;
    const currentMatch = neighborhoods.find((n) => n.id === adminEditHoodId) || neighborhoods[0];
    if (currentMatch.id !== adminEditHoodId) {
      setAdminEditHoodId(currentMatch.id);
    }
    setAdminEditBuySqm(Number(currentMatch.baseBuyPerSqm ?? currentMatch.buyPerSqm));
    setAdminEditRahn80m(Number(currentMatch.rahn80m));
  }, [adminTab, neighborhoods]);

  if (adminTab === 'crm') {
    return (
      <div className="space-y-3">
        <AdminMonetizationCard
          enableSponsorBilling={featureFlags.enableSponsorBilling}
          onToggleSponsorBilling={() => onToggleFeatureFlag('enableSponsorBilling')}
          neighborhoods={neighborhoods}
          onExtendSponsor30Days={onExtendSponsor30Days}
          onReleaseHoodSponsor={onReleaseHoodSponsor}
          isVerifiedAdmin={isVerifiedAdmin}
        />
        {(sponsorRequests || []).length === 0 ? (
          <div className="text-center py-6 text-slate-400">درخواستی در لیست CRM ثبت نشده است.</div>
        ) : (
          <div className="space-y-2.5">
            {(sponsorRequests || []).map((req) => {
              const remainingDays = req.expiresAtIso
                ? Math.max(0, Math.ceil((new Date(req.expiresAtIso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
                : (req.planMonths || 1) * 30;
              const planMonths = req.planMonths || 1;
              const totalPayable =
                req.totalPayableMillion ??
                (planMonths === 3 ? Math.round(req.monthlyTariffMillion * 3 * 0.8 * 10) / 10 : req.monthlyTariffMillion);

              return (
                <div key={req.id} className="bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-[var(--color-text-primary)] text-sm">{req.agencyName}</span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">محله {req.hoodName}</span>
                      {featureFlags.enableSponsorBilling && (
                        <>
                          <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] tabular-nums ${remainingDays > 7 ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'}`}>
                            {toPersianNum(remainingDays)} روز اعتبار باقی‌مانده
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-[var(--color-bg-elevated)] text-slate-800 dark:text-[var(--color-text-primary)] font-bold text-[11px]">
                            {planMonths === 3 ? 'طرح ۳ ماهه (۲۰٪ تخفیف)' : 'طرح ۱ ماهه'}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-slate-600 dark:text-[var(--color-text-secondary)]">
                      شماره تماس: <strong className="text-slate-900 dark:text-[var(--color-text-primary)] tabular-nums">{req.phone}</strong> · تخصص: {req.specialty}
                    </div>
                    {featureFlags.enableSponsorBilling && (
                      <div className="text-[11px] text-slate-500 dark:text-[var(--color-text-muted)] flex items-center gap-3 flex-wrap">
                        <span>مبلغ صورتحساب: <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">{toPersianNum(totalPayable)} میلیون تومان{fxTag(totalPayable)}</strong></span>
                        <span>کد پیگیری واریز: <code className="font-mono text-slate-800 dark:text-[var(--color-text-primary)] bg-white dark:bg-[var(--color-bg-surface)] px-1.5 py-0.5 rounded border border-slate-200 dark:border-[var(--color-border-strong)]">{req.trackingCode || 'TR-PENDING'}</code></span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => onAdminApproveSponsor(req)} className="px-3 py-2 rounded-xl bg-[var(--color-brand-600)] hover:bg-emerald-500 text-white font-bold transition cursor-pointer">
                      تایید و انتشار
                    </button>
                    <button type="button" onClick={() => onAdminDeleteSponsorRequest(req.id)} className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 font-bold transition cursor-pointer">
                      حذف
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (adminTab === 'leads') {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-2xl p-3">
          <span className="text-slate-700 dark:text-[var(--color-text-primary)]">
            لیست شماره موبایل متقاضیان فایل‌های زیر قیمت ({toPersianNum((buyerLeads || []).length)} نفر):
          </span>
          <button type="button" onClick={onDownloadBuyerLeadsCsv} className="px-3.5 py-2 rounded-xl bg-[var(--color-brand-600)] hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 transition cursor-pointer">
            <Download className="w-4 h-4 stroke-[1.75]" />
            <span>دانلود فایل CSV</span>
          </button>
        </div>

        <div className="border border-slate-200 dark:border-[var(--color-border-strong)] rounded-2xl overflow-x-auto">
          <div className="min-w-[540px]">
            <div className="grid grid-cols-5 bg-slate-50 dark:bg-[var(--color-bg-muted)] py-2.5 px-3 font-bold text-slate-700 dark:text-[var(--color-text-primary)] border-b border-slate-200 dark:border-[var(--color-border-strong)]">
              <div>نام خریدار</div>
              <div>شماره موبایل</div>
              <div>محله هدف</div>
              <div>نوع و بودجه</div>
              <div className="text-left">زمان ثبت</div>
            </div>
            {(buyerLeads || []).length === 0 ? (
              <div className="py-6 text-center text-slate-400 bg-white dark:bg-[var(--color-bg-surface)]">هنوز شماره‌ای در لیست هشدار خریداران ثبت نشده است.</div>
            ) : (
              (buyerLeads || []).map((lead) => (
                <div key={lead.id} className="grid grid-cols-5 items-center py-2.5 px-3 border-b border-slate-100 dark:border-[var(--color-border-subtle)] last:border-none bg-white dark:bg-[var(--color-bg-surface)]">
                  <div className="font-bold text-slate-900 dark:text-[var(--color-text-primary)] truncate">{lead.fullName}</div>
                  <div className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums" dir="ltr">{lead.phone}</div>
                  <div className="text-slate-800 dark:text-[var(--color-text-primary)] font-semibold truncate">{lead.hoodName}</div>
                  <div className="text-slate-600 dark:text-[var(--color-text-secondary)] truncate">{lead.dealType} — {lead.maxBudgetText}</div>
                  <div className="text-left text-slate-400 text-[11px]">{lead.createdAtFa}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  if (adminTab === 'bargains') {
    return (
      <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1">
        {totalLiveBargainsCount === 0 ? (
          <div className="py-6 text-center text-slate-400 bg-slate-50 dark:bg-[var(--color-bg-muted)] rounded-2xl border border-slate-200 dark:border-[var(--color-border-strong)]">هیچ آگهی شکاری در حال حاضر ثبت نشده است.</div>
        ) : (
          neighborhoods.map((n) =>
            (n.bargains || []).map((b) => (
              <div key={`${n.id}-${b.id}`} className="bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">محله {n.name}</span>
                    <span className="font-bold text-slate-900 dark:text-[var(--color-text-primary)]">{b.title}</span>
                    {b.status === 'pending' && <span className="px-2 py-0.5 rounded text-xs bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold">در انتظار تأیید</span>}
                  </div>
                  <div className="text-slate-500 dark:text-[var(--color-text-muted)] mt-1">{b.type} · {formatAreaShort(b.sqm, areaUnit)} · {b.priceText}</div>
                </div>
                <div className="flex items-center gap-2">
                  {b.status === 'pending' && onAdminApproveBargain && (
                    <button type="button" onClick={() => onAdminApproveBargain(n.id, b.id)} className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1 transition cursor-pointer">
                      <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.75]" />
                      <span>تأیید آگهی</span>
                    </button>
                  )}
                  <button type="button" onClick={() => onAdminDeleteBargain(n.id, b.id)} className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 font-bold flex items-center gap-1 transition cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5 stroke-[1.75]" />
                    <span>حذف آگهی</span>
                  </button>
                </div>
              </div>
            ))
          )
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <form onSubmit={onAdminQuickPriceSave} className="bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-2xl p-4 space-y-3">
        <div className="font-bold text-slate-900 dark:text-[var(--color-text-primary)] flex items-center gap-1.5">
          <Edit3 className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" />
          <span>ویرایش دستی قیمت خرید و رهن محله‌ها</span>
        </div>
        <div>
          <label className="block text-slate-600 dark:text-[var(--color-text-secondary)] mb-1">انتخاب محله:</label>
          <select aria-label="انتخاب محله جهت ویرایش قیمت"
            value={adminEditHoodId}
            onChange={(e) => {
              const nextId = Number(e.target.value);
              setAdminPriceSavedMsg?.('');
              setAdminEditHoodId(nextId);
              const found = neighborhoods.find((n) => n.id === nextId);
              if (found) {
                setAdminEditBuySqm(Number(found.baseBuyPerSqm ?? found.buyPerSqm));
                setAdminEditRahn80m(Number(found.rahn80m));
              }
            }}
            className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-xl px-3 py-2 text-slate-900 dark:text-[var(--color-text-primary)] font-bold"
          >
            {neighborhoods.map((n) => (
              <option key={n.id} value={n.id}>محله {n.name} ({n.zone}) — {toPersianNum(convertPricePerSqmToUnit((n as any).baseBuyPerSqm ?? n.buyPerSqm, areaUnit))} {areaUnit === 'sqft' ? 'م/ft²' : 'م'} (سناریو v6.4 (غیرثبتی): {toPersianNum(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(n.id, n.name, (n as any).baseBuyPerSqm ?? n.buyPerSqm, buildNeighborhoodListingSamples(n)).estimatedDealPricePerSqm, areaUnit))} م){fxTag(convertPricePerSqmToUnit((n as any).baseBuyPerSqm ?? n.buyPerSqm, areaUnit))} · کل {formatAreaShort(80, areaUnit)}: {toPersianNum(((((n as any).baseBuyPerSqm ?? n.buyPerSqm) * 80) / 1000).toFixed(1))} میلیارد</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-600 dark:text-[var(--color-text-secondary)] mb-1">میانگین هر متر خرید (میلیون · سناریو v6.4 (غیرثبتی): {toPersianNum(convertPricePerSqmToUnit(aggregateMarketMetricsForScalars(adminEditHoodId, neighborhoods.find((n) => n.id === adminEditHoodId)?.name || 'تهران', adminEditBuySqm).estimatedDealPricePerSqm, areaUnit))} م · کل {formatAreaShort(80, areaUnit)}: {toPersianNum(((adminEditBuySqm * 80) / 1000).toFixed(1))} میلیارد){areaUnit === 'sqft' ? ` ≈ ${toPersianNum(convertPricePerSqmToUnit(adminEditBuySqm, 'sqft'))} م/ft²` : ''}{fxTag(convertPricePerSqmToUnit(adminEditBuySqm, areaUnit))}:</label>
            <NumericDraftInput aria-label="میانگین هر متر خرید محله" min={10} max={5000} fallback={130} value={adminEditBuySqm} onValueChange={(v) => { setAdminPriceSavedMsg?.(''); setAdminEditBuySqm(v); }} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-xl px-3 py-2 text-emerald-700 dark:text-emerald-400 font-bold tabular-nums" />
          </div>
          <div>
            <label className="block text-slate-600 dark:text-[var(--color-text-secondary)] mb-1">رهن کامل {formatAreaShort(80, areaUnit)} (میلیون){fxTag(adminEditRahn80m)}: <span className="text-[10.5px] text-slate-500 dark:text-[var(--color-text-muted)]">(اجاره ماهانه: {toPersianNum(Math.round(adminEditRahn80m * 0.03))} م{fxTag(Math.round(adminEditRahn80m * 0.03))})</span></label>
            <NumericDraftInput aria-label="رهن کامل ۸۰ متری محله" min={0} max={100000} fallback={1400} value={adminEditRahn80m} onValueChange={(v) => { setAdminPriceSavedMsg?.(''); setAdminEditRahn80m(v); }} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-xl px-3 py-2 text-slate-900 dark:text-[var(--color-text-primary)] font-bold tabular-nums" />
          </div>
        </div>
        {adminPriceSavedMsg && (() => {
          const tone = classifyFeedbackTone(adminPriceSavedMsg);
          return (
            <div
              role={tone === 'error' ? 'alert' : 'status'}
              className={`p-2.5 rounded-xl border font-semibold ${
                tone === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200'
                  : tone === 'info'
                    ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800/60 text-sky-800 dark:text-sky-200'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-200'
              }`}
            >
              {adminPriceSavedMsg}
            </div>
          );
        })()}
        <button type="submit" className="w-full py-2.5 rounded-xl bg-[var(--color-brand-600)] hover:bg-emerald-500 text-white font-bold transition cursor-pointer">
          ذخیره فوری قیمت محله
        </button>
      </form>

      <div className="space-y-4">
        <div className="bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-2xl p-4 space-y-3">
          <div className="font-bold text-slate-900 dark:text-[var(--color-text-primary)] flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" />
            <span>اجرای دستی رصد عمیق ۲ ساعته</span>
          </div>
          <button type="button" onClick={onDeepWebSync} disabled={deepSyncing} className="w-full py-2.5 rounded-xl bg-[var(--color-brand-600)] hover:bg-emerald-500 text-white font-bold transition cursor-pointer disabled:opacity-50">
            {deepSyncing ? 'در حال بروزرسانی عمیق رادار...' : 'اجرای فوری رصد عمیق بازار، هوا و ترافیک'}
          </button>
        </div>

        <form onSubmit={onAdminChangePassword} className="bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-2xl p-4 space-y-2.5">
          <div className="font-bold text-slate-900 dark:text-[var(--color-text-primary)] flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" />
            <span>قفل موقت نشست فعلی پنل مدیریت (در حافظه مرورگر)</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-[var(--color-text-muted)]">احراز هویت اصلی از طریق Google Auth انجام می‌شود؛ این رمز صرفاً برای قفل صفحه‌نمایش در همین نشست فعال است و روی سرور ذخیره نمی‌شود.</p>
          <div className="flex gap-2">
            <input type="password" aria-label="رمز قفل نشست فعلی پنل مدیریت" aria-invalid={classifyFeedbackTone(adminPassChangeMsg) === 'error'} value={newAdminPassword} onChange={(e) => { setAdminPassChangeMsg?.(''); setNewAdminPassword(e.target.value); }} placeholder="رمز قفل نشست (حداقل ۴ کاراکتر)..." className="flex-1 bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-xl px-3 py-2 text-slate-900 dark:text-[var(--color-text-primary)]" />
            <button type="submit" className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer">تنظیم قفل</button>
          </div>
          {adminPassChangeMsg && (() => {
            const tone = classifyFeedbackTone(adminPassChangeMsg);
            return (
              <div
                role={tone === 'error' ? 'alert' : 'status'}
                className={`font-semibold ${
                  tone === 'error'
                    ? 'text-rose-700 dark:text-rose-400'
                    : tone === 'info'
                      ? 'text-sky-700 dark:text-sky-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {adminPassChangeMsg}
              </div>
            );
          })()}
        </form>
      </div>
    </div>
  );
}

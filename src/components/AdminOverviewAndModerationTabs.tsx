import React from 'react';
import { CheckCircle2, Download, Edit3, KeyRound, Sparkles, Trash2 } from 'lucide-react';
import { BuyerAlertLeadItem, Neighborhood, SponsorCrmRequestItem, toPersianNum } from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator';
import { FeatureFlags } from '../types/models';
import { clampNumber } from '../utils/security';
import { AdminMonetizationCard } from './AdminMonetizationCard';
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
  onAdminQuickPriceSave: (e: React.FormEvent) => void;
  deepSyncing: boolean;
  onDeepWebSync: () => void;
  newAdminPassword: string;
  setNewAdminPassword: React.Dispatch<React.SetStateAction<string>>;
  adminPassChangeMsg: string;
  onAdminChangePassword: (e: React.FormEvent) => void;
  onExtendSponsor30Days?: (hoodId: number) => void;
  onReleaseHoodSponsor?: (hoodId: number) => void;
}

export function AdminOverviewAndModerationTabs(
  props: AdminOverviewAndModerationTabsProps
): React.ReactElement | null {
  const {
    adminTab, featureFlags, onToggleFeatureFlag, neighborhoods, sponsorRequests,
    buyerLeads, totalLiveBargainsCount, onAdminApproveSponsor,
    onAdminDeleteSponsorRequest, onDownloadBuyerLeadsCsv, onAdminDeleteBargain, onAdminApproveBargain,
    adminEditHoodId, setAdminEditHoodId, adminEditBuySqm, setAdminEditBuySqm,
    adminEditRahn80m, setAdminEditRahn80m, adminPriceSavedMsg,
    onAdminQuickPriceSave, deepSyncing, onDeepWebSync, newAdminPassword,
    setNewAdminPassword, adminPassChangeMsg, onAdminChangePassword,
    onExtendSponsor30Days, onReleaseHoodSponsor,
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
                <div key={req.id} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">{req.agencyName}</span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">محله {req.hoodName}</span>
                      {featureFlags.enableSponsorBilling && (
                        <>
                          <span className={`px-2 py-0.5 rounded-md font-extrabold text-[11px] tabular-nums ${remainingDays > 7 ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'}`}>
                            {toPersianNum(remainingDays)} روز اعتبار باقی‌مانده
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-[11px]">
                            {planMonths === 3 ? 'طرح ۳ ماهه (۲۰٪ تخفیف)' : 'طرح ۱ ماهه'}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-slate-600 dark:text-slate-300">
                      شماره تماس: <strong className="text-slate-900 dark:text-slate-100 tabular-nums">{req.phone}</strong> · تخصص: {req.specialty}
                    </div>
                    {featureFlags.enableSponsorBilling && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-3 flex-wrap">
                        <span>مبلغ صورتحساب: <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">{toPersianNum(totalPayable)} میلیون تومان{fxTag(totalPayable)}</strong></span>
                        <span>کد پیگیری واریز: <code className="font-mono text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">{req.trackingCode || 'TR-PENDING'}</code></span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => onAdminApproveSponsor(req)} className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition cursor-pointer">
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
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-3">
          <span className="text-slate-700 dark:text-slate-200">
            لیست شماره موبایل متقاضیان فایل‌های زیر قیمت ({toPersianNum((buyerLeads || []).length)} نفر):
          </span>
          <button type="button" onClick={onDownloadBuyerLeadsCsv} className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 transition cursor-pointer">
            <Download className="w-4 h-4 stroke-[1.75]" />
            <span>دانلود فایل CSV</span>
          </button>
        </div>

        <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-x-auto">
          <div className="min-w-[540px]">
            <div className="grid grid-cols-5 bg-slate-50 dark:bg-slate-800 py-2.5 px-3 font-extrabold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
              <div>نام خریدار</div>
              <div>شماره موبایل</div>
              <div>محله هدف</div>
              <div>نوع و بودجه</div>
              <div className="text-left">زمان ثبت</div>
            </div>
            {(buyerLeads || []).length === 0 ? (
              <div className="py-6 text-center text-slate-400 bg-white dark:bg-slate-900">هنوز شماره‌ای در لیست هشدار خریداران ثبت نشده است.</div>
            ) : (
              (buyerLeads || []).map((lead) => (
                <div key={lead.id} className="grid grid-cols-5 items-center py-2.5 px-3 border-b border-slate-100 dark:border-slate-800 last:border-none bg-white dark:bg-slate-900">
                  <div className="font-bold text-slate-900 dark:text-slate-100 truncate">{lead.fullName}</div>
                  <div className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums" dir="ltr">{lead.phone}</div>
                  <div className="text-slate-800 dark:text-slate-200 font-semibold truncate">{lead.hoodName}</div>
                  <div className="text-slate-600 dark:text-slate-300 truncate">{lead.dealType} — {lead.maxBudgetText}</div>
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
          <div className="py-6 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">هیچ آگهی شکاری در حال حاضر ثبت نشده است.</div>
        ) : (
          neighborhoods.map((n) =>
            (n.bargains || []).map((b) => (
              <div key={`${n.id}-${b.id}`} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">محله {n.name}</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{b.title}</span>
                    {b.status === 'pending' && <span className="px-2 py-0.5 rounded text-xs bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold">در انتظار تأیید</span>}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 mt-1">{b.type} · {formatAreaShort(b.sqm, areaUnit)} · {b.priceText}</div>
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
      <form onSubmit={onAdminQuickPriceSave} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3">
        <div className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
          <Edit3 className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
          <span>ویرایش دستی قیمت خرید و رهن محله‌ها</span>
        </div>
        <div>
          <label className="block text-slate-600 dark:text-slate-300 mb-1">انتخاب محله:</label>
          <select aria-label="انتخاب محله جهت ویرایش قیمت"
            value={adminEditHoodId}
            onChange={(e) => {
              const nextId = Number(e.target.value);
              setAdminEditHoodId(nextId);
              const found = neighborhoods.find((n) => n.id === nextId);
              if (found) {
                setAdminEditBuySqm(Number(found.baseBuyPerSqm ?? found.buyPerSqm));
                setAdminEditRahn80m(Number(found.rahn80m));
              }
            }}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 font-bold"
          >
            {neighborhoods.map((n) => (
              <option key={n.id} value={n.id}>محله {n.name} ({n.zone}) — {toPersianNum(convertPricePerSqmToUnit((n as any).baseBuyPerSqm ?? n.buyPerSqm, areaUnit))} {areaUnit === 'sqft' ? 'م/ft²' : 'م'} (معامله v6.4: {toPersianNum(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(n.id, n.name, (n as any).baseBuyPerSqm ?? n.buyPerSqm, []).estimatedDealPricePerSqm, areaUnit))} م){fxTag(convertPricePerSqmToUnit((n as any).baseBuyPerSqm ?? n.buyPerSqm, areaUnit))} · کل {formatAreaShort(80, areaUnit)}: {toPersianNum(((((n as any).baseBuyPerSqm ?? n.buyPerSqm) * 80) / 1000).toFixed(1))} میلیارد</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-600 dark:text-slate-300 mb-1">میانگین هر متر خرید (میلیون · معامله v6.4: {toPersianNum(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(adminEditHoodId, 'تهران', adminEditBuySqm, []).estimatedDealPricePerSqm, areaUnit))} م · کل {formatAreaShort(80, areaUnit)}: {toPersianNum(((adminEditBuySqm * 80) / 1000).toFixed(1))} میلیارد){areaUnit === 'sqft' ? ` ≈ ${toPersianNum(convertPricePerSqmToUnit(adminEditBuySqm, 'sqft'))} م/ft²` : ''}{fxTag(convertPricePerSqmToUnit(adminEditBuySqm, areaUnit))}:</label>
            <input type="number" aria-label="میانگین هر متر خرید محله" min={10} max={5000} value={adminEditBuySqm} onChange={(e) => setAdminEditBuySqm(clampNumber(e.target.value, 10, 5000, 130))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-emerald-700 dark:text-emerald-400 font-extrabold tabular-nums" />
          </div>
          <div>
            <label className="block text-slate-600 dark:text-slate-300 mb-1">رهن کامل {formatAreaShort(80, areaUnit)} (میلیون){fxTag(adminEditRahn80m)}: <span className="text-[10.5px] text-slate-500 dark:text-slate-400">(اجاره ماهانه: {toPersianNum(Math.round(adminEditRahn80m * 0.03))} م{fxTag(Math.round(adminEditRahn80m * 0.03))})</span></label>
            <input type="number" aria-label="رهن کامل ۸۰ متری محله" min={0} max={100000} value={adminEditRahn80m} onChange={(e) => setAdminEditRahn80m(clampNumber(e.target.value, 0, 100000, 1400))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 font-extrabold tabular-nums" />
          </div>
        </div>
        {adminPriceSavedMsg && (
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-200 font-semibold">{adminPriceSavedMsg}</div>
        )}
        <button type="submit" className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold transition cursor-pointer">
          ذخیره فوری قیمت محله
        </button>
      </form>

      <div className="space-y-4">
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3">
          <div className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
            <span>اجرای دستی رصد عمیق ۲ ساعته</span>
          </div>
          <button type="button" onClick={onDeepWebSync} disabled={deepSyncing} className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold transition cursor-pointer disabled:opacity-50">
            {deepSyncing ? 'در حال بروزرسانی عمیق رادار...' : 'اجرای فوری رصد عمیق بازار، هوا و ترافیک'}
          </button>
        </div>

        <form onSubmit={onAdminChangePassword} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-2.5">
          <div className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
            <span>تغییر رمز عبور پنل مدیریت</span>
          </div>
          <div className="flex gap-2">
            <input type="password" aria-label="رمز عبور جدید پنل مدیریت" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} placeholder="رمز عبور جدید..." className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100" />
            <button type="submit" className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold cursor-pointer">تغییر رمز</button>
          </div>
          {adminPassChangeMsg && <div className="text-emerald-700 dark:text-emerald-400 font-semibold">{adminPassChangeMsg}</div>}
        </form>
      </div>
    </div>
  );
}

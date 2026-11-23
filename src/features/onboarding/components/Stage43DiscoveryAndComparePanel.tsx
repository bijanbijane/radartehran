/** @file src/features/onboarding/components/Stage43DiscoveryAndComparePanel.tsx — PRM-01..13 & PRM-32 */
import React, { useState } from 'react';
import {
  SERVICE_CATEGORIES_FA,
  filterAndSortMarketplaceProviders,
  type MarketplaceProviderRecord,
  type ServiceCategoryId,
} from '../services/proMarketplaceEngine';

interface Props {
  providers: MarketplaceProviderRecord[];
  onStartDirectRequest: (provider: MarketplaceProviderRecord) => void;
}

export const Stage43DiscoveryAndComparePanel: React.FC<Props> = ({ providers, onStartDirectRequest }) => {
  const [category, setCategory] = useState<ServiceCategoryId | 'all'>('all');
  const [districtQuery, setDistrictQuery] = useState<string>('');
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(false);
  const [compareIds, setCompareIds] = useState<string[]>(['prv-niazi', 'prv-pars']);

  const { organic, sponsored } = filterAndSortMarketplaceProviders({
    providers,
    category,
    districtQuery,
    verifiedOnly,
  });

  const comparedProviders = providers.filter((p) => compareIds.includes(p.providerId));
  const toggleCompare = (id: string) => {
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev));
  };

  return (
    <div className="space-y-3 text-xs text-slate-200" data-testid="stage43-discovery-compare" dir="rtl">
      {/* PRM-02 & PRM-08 Filter Controls */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 flex flex-wrap items-center gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value as ServiceCategoryId | 'all')} aria-label="دسته خدمت" className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white">
          <option value="all">همه دسته‌های خدمات</option>
          {SERVICE_CATEGORIES_FA.map((c) => <option key={c.id} value={c.id}>{c.titleFa}</option>)}
        </select>
        <input type="text" value={districtQuery} onChange={(e) => setDistrictQuery(e.target.value)} placeholder="منطقه (مثلاً سعادت‌آباد، پونک)..." className="flex-1 min-w-[160px] rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white" />
        <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
          <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="accent-emerald-500" />
          <span>فقط دارای مدرک یا هویت تأییدشده</span>
        </label>
      </div>

      {/* PRM-32 Sponsored Separation */}
      {sponsored.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 space-y-1.5">
          <div className="text-[11px] font-bold text-amber-300">جایگاه تبلیغاتی (تفکیک‌شده از نتایج ارگانیک · تأیید صلاحیت محسوب نمی‌شود)</div>
          {sponsored.map((p) => (
            <div key={p.providerId} className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-200">
              <span>{p.displayNameFa} — {p.verifiedCredentialLabelFa}</span>
              <span className="rounded border border-amber-500/40 px-2 py-0.5 text-[10px] text-amber-200">تبلیغاتی</span>
            </div>
          ))}
        </div>
      )}

      {/* PRM-04 Organic Providers & Services */}
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        {organic.map((p) => (
          <div key={p.providerId} className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold text-white">{p.displayNameFa} ({p.providerTypeFa})</div>
                <div className="text-[10.5px] text-slate-400">پوشش: {p.coverageDistrictsFa.join(' · ')}</div>
              </div>
              <span className="rounded border border-cyan-500/40 bg-cyan-950/40 px-2 py-0.5 text-[10.5px] text-cyan-200">
                امتیاز {p.rating}/5 ({p.reviewCount} نظر)
              </span>
            </div>
            <div className="text-[11px] text-emerald-300">وضعیت اعتبار: {p.verifiedCredentialLabelFa}</div>
            {p.services.map((s) => (
              <div key={s.serviceId} className="rounded border border-slate-800 bg-slate-900 p-2 text-[10.5px] space-y-0.5 text-slate-300">
                <div className="font-bold text-slate-100">خدمت: {s.titleFa}</div>
                <div>مدل قیمت: {s.pricingModel} ({s.declaredPriceM ?? 0} م‌تومان · {s.unitLabelFa})</div>
                <div className="text-amber-300">محدودیت: {s.limitationsFa}</div>
              </div>
            ))}
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid={`req-direct-${p.providerId}`} onClick={() => onStartDirectRequest(p)} className="rounded bg-[var(--color-brand-600)] px-2.5 py-1 text-[11px] font-bold text-white">
                ثبت درخواست مستقیم
              </button>
              <button type="button" onClick={() => toggleCompare(p.providerId)} className="rounded border border-slate-700 px-2.5 py-1 text-[11px] text-slate-200">
                {compareIds.includes(p.providerId) ? 'حذف از مقایسه' : 'افزودن به مقایسه'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* PRM-13 Provider Comparison Matrix */}
      {comparedProviders.length >= 2 && (
        <div data-testid="stage43-provider-compare" className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 space-y-2">
          <div className="font-bold text-white">مقایسه هم‌ارز ارائه‌دهندگان (PRM-13 — تفکیک تفاوت‌ها بدون اعلام برنده جعلی)</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {comparedProviders.map((cp) => (
              <div key={cp.providerId} className="rounded border border-slate-800 bg-slate-900 p-2 text-[11px] text-slate-300 space-y-0.5">
                <div className="font-bold text-white">{cp.displayNameFa}</div>
                <div>اعتبار: {cp.verifiedCredentialLabelFa}</div>
                <div>تعداد نظر و امتیاز: {cp.rating}/5 از {cp.reviewCount} نظر</div>
                <div>مدل قیمت خدمت: {cp.services[0]?.pricingModel} ({cp.services[0]?.declaredPriceM} م‌تومان)</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/** @file src/features/services/components/ServiceProviderPortalTab.tsx — Provider Onboarding & 4-Track Verification Portal */
import React, { useState } from 'react';
import { Award, CheckCircle2, ShieldCheck } from 'lucide-react';
import { type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { CANONICAL_SERVICE_DEFINITIONS } from '../services/serviceTaxonomyAndVerification';
import {
  CANONICAL_CATEGORY_LABELS_FA,
  type ProviderOnboardingSubmission,
  type ServiceCanonicalCategory,
  type ServiceCoverageScope,
  type ServicePricingMode,
} from '../types/service.types';

export interface ServiceProviderPortalTabProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  submissions: ProviderOnboardingSubmission[];
  onSubmitOnboarding: (
    payload: Omit<ProviderOnboardingSubmission, 'submissionId' | 'moderationStatus' | 'moderatorNoteFa' | 'createdAtIso'>,
  ) => void;
}

const MODERATION_STATUS_FA: Record<ProviderOnboardingSubmission['moderationStatus'], string> = {
  pending: 'در انتظار بررسی مدارک',
  verified: 'تأیید و منتشرشده در دایرکتوری',
  revision_required: 'نیازمند اصلاح مدارک',
  rejected: 'ردشده',
  suspended: 'تعلیق‌شده',
};

export const ServiceProviderPortalTab: React.FC<ServiceProviderPortalTabProps> = ({
  evaluatedNeighborhoods,
  selectedHood,
  submissions,
  onSubmitOnboarding,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [entityKind, setEntityKind] = useState<'specialist' | 'agency' | 'company'>('specialist');
  const [canonicalCategory, setCanonicalCategory] = useState<ServiceCanonicalCategory>('legal');
  const [neighborhoodId, setNeighborhoodId] = useState(selectedHood.id);
  const [phone, setPhone] = useState('');
  const [specialtyFa, setSpecialtyFa] = useState('');
  const [pricingMode, setPricingMode] = useState<ServicePricingMode>('starting_from');
  const [priceDisplayFa, setPriceDisplayFa] = useState('شروع از ۲ میلیون تومان');
  const [coverageScope, setCoverageScope] = useState<ServiceCoverageScope>('citywide');
  const [licenseClaimedFa, setLicenseClaimedFa] = useState('');
  const [portfolioSummaryFa, setPortfolioSummaryFa] = useState('');
  const [error, setError] = useState('');
  const [savedOk, setSavedOk] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (displayName.trim().length < 3) { setError('نام متخصص یا مجموعه را وارد کنید.'); return; }
    if (!/^09\d{9}$/.test(phone.trim())) { setError('شماره تماس معتبر با 09 وارد کنید.'); return; }
    if (specialtyFa.trim().length < 10) { setError('شرح دقیق خدمت تخصصی را وارد کنید.'); return; }
    const hood = evaluatedNeighborhoods.find((h) => h.id === neighborhoodId) || selectedHood;
    const def = CANONICAL_SERVICE_DEFINITIONS.find((d) => d.category === canonicalCategory) || CANONICAL_SERVICE_DEFINITIONS[0];

    onSubmitOnboarding({
      ownerUserId: 'local-user',
      displayName: displayName.trim(),
      entityKind,
      canonicalCategory,
      serviceId: def.serviceId,
      neighborhoodId: hood.id,
      neighborhoodName: hood.name,
      zone: hood.zone,
      phone: phone.trim(),
      specialtyFa: specialtyFa.trim(),
      pricingMode,
      priceDisplayFa: priceDisplayFa.trim(),
      coverageScope,
      coveredAreaNames: coverageScope === 'citywide' ? ['کل تهران', hood.name] : [hood.name],
      remoteAvailable: coverageScope !== 'office_only',
      licenseClaimedFa: licenseClaimedFa.trim(),
      portfolioSummaryFa: portfolioSummaryFa.trim(),
    });
    setDisplayName('');
    setPhone('');
    setSpecialtyFa('');
    setError('');
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 3000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs" data-testid="service-provider-portal">
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-7 p-5 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3.5"
      >
        <div className="border-b border-[#DCE3DF] dark:border-slate-800 pb-3">
          <h2 className="text-base font-black text-[#182522] dark:text-white flex items-center gap-1.5">
            <Award className="w-4 h-4 text-[#176B63]" />
            <span>ثبت پروفایل متخصص / ارائه‌دهنده خدمات ملکی</span>
          </h2>
          <p className="text-[11px] text-[#586760] mt-1">
            ثبت‌نام هیچ برچسب «تأییدشده» خودکاری ایجاد نمی‌کند؛ احراز هویت، کسب‌وکار، پروانه تخصصی و نمونه‌کار در صف ممیزی بررسی می‌شوند.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="font-bold block mb-1">نام متخصص یا شرکت</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700" placeholder="مثال: گروه مهندسی و بازرسی پارس" />
          </div>
          <div>
            <label className="font-bold block mb-1">نوع شخصیت</label>
            <select value={entityKind} onChange={(e) => setEntityKind(e.target.value as 'specialist' | 'agency' | 'company')} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700">
              <option value="specialist">متخصص مستقل</option>
              <option value="company">شرکت / دفتر فنی یا حقوقی</option>
              <option value="agency">دفتر مشاوره املاک</option>
            </select>
          </div>
          <div>
            <label className="font-bold block mb-1">رسته تخصصی</label>
            <select value={canonicalCategory} onChange={(e) => setCanonicalCategory(e.target.value as ServiceCanonicalCategory)} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700">
              {(Object.keys(CANONICAL_CATEGORY_LABELS_FA) as Array<ServiceCanonicalCategory | 'all'>)
                .filter((k): k is ServiceCanonicalCategory => k !== 'all')
                .map((cat) => (
                  <option key={cat} value={cat}>{CANONICAL_CATEGORY_LABELS_FA[cat]}</option>
                ))}
            </select>
          </div>
          <div>
            <label className="font-bold block mb-1">محله استقرار دفتر</label>
            <select value={neighborhoodId} onChange={(e) => setNeighborhoodId(Number(e.target.value))} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700">
              {evaluatedNeighborhoods.map((h) => (
                <option key={h.id} value={h.id}>محله {h.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold block mb-1">شماره تماس پاسخ‌گو</label>
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 tabular-nums" placeholder="09120000000" />
          </div>
          <div>
            <label className="font-bold block mb-1">گستره پوشش خدمت</label>
            <select value={coverageScope} onChange={(e) => setCoverageScope(e.target.value as ServiceCoverageScope)} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700">
              <option value="local">محله‌ای</option>
              <option value="citywide">کل شهر</option>
              <option value="remote">غیرحضوری / سراسری</option>
              <option value="office_only">فقط در محل دفتر</option>
            </select>
          </div>
          <div>
            <label className="font-bold block mb-1">مدل تعرفه</label>
            <select value={pricingMode} onChange={(e) => setPricingMode(e.target.value as ServicePricingMode)} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700">
              <option value="fixed">قیمت مقطوع</option>
              <option value="starting_from">شروع قیمت از</option>
              <option value="per_unit">بر اساس متراژ/واحد</option>
              <option value="negotiable">توافقی</option>
              <option value="inspection_required">پس از بازدید حضوری</option>
            </select>
          </div>
          <div>
            <label className="font-bold block mb-1">عنوان تعرفه نمایشی</label>
            <input type="text" value={priceDisplayFa} onChange={(e) => setPriceDisplayFa(e.target.value)} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700" />
          </div>
        </div>

        <div>
          <label className="font-bold block mb-1">شرح خدمت قابل ارائه و دامنه تخصص</label>
          <textarea rows={2} value={specialtyFa} onChange={(e) => setSpecialtyFa(e.target.value)} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700" placeholder="مثال: بازبینی قراردادهای خرید و پیش‌فروش به همراه چک‌لیست تعهدات سند..." />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="font-bold block mb-1">شماره پروانه / کانون / نظام مهندسی (اختیاری)</label>
            <input type="text" value={licenseClaimedFa} onChange={(e) => setLicenseClaimedFa(e.target.value)} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 tabular-nums" placeholder="فقط پس از بررسی نمایش داده می‌شود" />
          </div>
          <div>
            <label className="font-bold block mb-1">خلاصه نمونه‌کار یا سوابق قابل استناد</label>
            <input type="text" value={portfolioSummaryFa} onChange={(e) => setPortfolioSummaryFa(e.target.value)} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700" />
          </div>
        </div>

        {error && <div className="p-2.5 rounded-[8px] bg-rose-50 text-[#B3261E] font-bold">{error}</div>}
        {savedOk && (
          <div className="p-2.5 rounded-[8px] bg-[#EAF3F0] text-[#14534E] font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> پرونده شما در صف ممیزی و تأیید ۴گانه رادار ثبت شد.
          </div>
        )}

        <button type="submit" className="w-full py-2.5 rounded-[10px] bg-[#176B63] hover:bg-[#14534E] text-white font-bold cursor-pointer">
          ارسال پرونده برای بررسی و انتشار
        </button>
      </form>

      <aside className="lg:col-span-5 space-y-3">
        <div className="p-4 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-2">
          <strong className="text-sm font-black text-[#182522] dark:text-white flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#176B63]" />
            <span>پرونده‌های ثبت‌شده شما ({submissions.length})</span>
          </strong>
          {submissions.length === 0 ? (
            <p className="text-[#586760] py-4">هنوز پرونده ارائه‌دهنده‌ای از این حساب ارسال نشده است.</p>
          ) : (
            <div className="space-y-2">
              {submissions.map((s) => (
                <div key={s.submissionId} className="p-3 rounded-[10px] bg-[#F8F9FA] dark:bg-slate-800/80 border border-[#DCE3DF] dark:border-slate-700 space-y-1">
                  <div className="flex items-center justify-between font-bold text-[#182522] dark:text-white">
                    <span>{s.displayName}</span>
                    <span className="text-[#176B63]">{MODERATION_STATUS_FA[s.moderationStatus]}</span>
                  </div>
                  <p className="text-[10.5px] text-[#586760]">{CANONICAL_CATEGORY_LABELS_FA[s.canonicalCategory]} · {s.moderatorNoteFa}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

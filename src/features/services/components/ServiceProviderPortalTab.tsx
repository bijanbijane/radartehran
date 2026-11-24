/** @file src/features/services/components/ServiceProviderPortalTab.tsx — Provider Onboarding & 4-Track Verification Portal */
import React, { useEffect, useRef, useState } from 'react';
import { Award, CheckCircle2, ShieldCheck } from 'lucide-react';
import { type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import {
  isValidNormalizedIranianMobile,
  normalizeIranianMobileInput,
} from '../../../utils/forms/formInputHelpers';
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
  const [invalidField, setInvalidField] = useState<'displayName' | 'phone' | 'priceDisplayFa' | 'specialtyFa' | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
  }, []);

  useEffect(() => {
    if (evaluatedNeighborhoods.length === 0) return;
    if (!evaluatedNeighborhoods.some((h) => h.id === neighborhoodId)) {
      setNeighborhoodId(selectedHood.id);
    }
  }, [evaluatedNeighborhoods, neighborhoodId, selectedHood.id]);

  const clearStatus = () => {
    if (error) setError('');
    if (invalidField) setInvalidField(null);
    if (savedOk) setSavedOk(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (displayName.trim().length < 3) {
      setInvalidField('displayName');
      setError('نام متخصص یا مجموعه را با حداقل ۳ کاراکتر وارد کنید.');
      return;
    }
    const normalizedPhone = normalizeIranianMobileInput(phone);
    if (!isValidNormalizedIranianMobile(normalizedPhone)) {
      setInvalidField('phone');
      setError('شماره تماس معتبر با 09 وارد کنید.');
      return;
    }
    if ((pricingMode === 'fixed' || pricingMode === 'starting_from' || pricingMode === 'per_unit') && priceDisplayFa.trim().length < 3) {
      setInvalidField('priceDisplayFa');
      setError('برای این مدل تعرفه، عنوان یا مبلغ پایه نمایشی را وارد کنید.');
      return;
    }
    if (specialtyFa.trim().length < 10) {
      setInvalidField('specialtyFa');
      setError('شرح دقیق خدمت تخصصی را حداقل در ۱۰ کاراکتر وارد کنید.');
      return;
    }
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
      phone: normalizedPhone,
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
    setLicenseClaimedFa('');
    setPortfolioSummaryFa('');
    setInvalidField(null);
    setError('');
    setSavedOk(true);
    if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => {
      setSavedOk(false);
      savedTimerRef.current = null;
    }, 3000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs" data-testid="service-provider-portal">
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-7 p-5 rounded-[14px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-3.5"
      >
        <div className="border-b border-[var(--color-border-subtle)] dark:border-slate-800 pb-3">
          <h2 className="text-base font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
            <Award className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>ثبت پروفایل متخصص / ارائه‌دهنده خدمات ملکی</span>
          </h2>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
            ثبت‌نام هیچ برچسب «تأییدشده» خودکاری ایجاد نمی‌کند؛ احراز هویت، کسب‌وکار، پروانه تخصصی و نمونه‌کار در صف ممیزی بررسی می‌شوند.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="font-bold block mb-1">نام متخصص یا شرکت</label>
            <input type="text" aria-invalid={invalidField === 'displayName'} value={displayName} onChange={(e) => { setDisplayName(e.target.value); clearStatus(); }} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700" placeholder="مثال: گروه مهندسی و بازرسی پارس" />
          </div>
          <div>
            <label className="font-bold block mb-1">نوع شخصیت</label>
            <select value={entityKind} onChange={(e) => { setEntityKind(e.target.value as 'specialist' | 'agency' | 'company'); clearStatus(); }} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700">
              <option value="specialist">متخصص مستقل</option>
              <option value="company">شرکت / دفتر فنی یا حقوقی</option>
              <option value="agency">دفتر مشاوره املاک</option>
            </select>
          </div>
          <div>
            <label className="font-bold block mb-1">رسته تخصصی</label>
            <select value={canonicalCategory} onChange={(e) => { setCanonicalCategory(e.target.value as ServiceCanonicalCategory); clearStatus(); }} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700">
              {(Object.keys(CANONICAL_CATEGORY_LABELS_FA) as Array<ServiceCanonicalCategory | 'all'>)
                .filter((k): k is ServiceCanonicalCategory => k !== 'all')
                .map((cat) => (
                  <option key={cat} value={cat}>{CANONICAL_CATEGORY_LABELS_FA[cat]}</option>
                ))}
            </select>
          </div>
          <div>
            <label className="font-bold block mb-1">محله استقرار دفتر</label>
            <select value={neighborhoodId} onChange={(e) => { setNeighborhoodId(Number(e.target.value)); clearStatus(); }} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700">
              {evaluatedNeighborhoods.map((h) => (
                <option key={h.id} value={h.id}>محله {h.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold block mb-1">شماره تماس پاسخ‌گو</label>
            <input type="text" aria-invalid={invalidField === 'phone'} value={phone} onChange={(e) => { setPhone(e.target.value); clearStatus(); }} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 tabular-nums" placeholder="09120000000" />
          </div>
          <div>
            <label className="font-bold block mb-1">گستره پوشش خدمت</label>
            <select value={coverageScope} onChange={(e) => { setCoverageScope(e.target.value as ServiceCoverageScope); clearStatus(); }} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700">
              <option value="local">محله‌ای</option>
              <option value="citywide">کل شهر</option>
              <option value="remote">غیرحضوری / سراسری</option>
              <option value="office_only">فقط در محل دفتر</option>
            </select>
          </div>
          <div>
            <label className="font-bold block mb-1">مدل تعرفه</label>
            <select value={pricingMode} onChange={(e) => { setPricingMode(e.target.value as ServicePricingMode); clearStatus(); }} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700">
              <option value="fixed">قیمت مقطوع</option>
              <option value="starting_from">شروع قیمت از</option>
              <option value="per_unit">بر اساس متراژ/واحد</option>
              <option value="negotiable">توافقی</option>
              <option value="inspection_required">پس از بازدید حضوری</option>
            </select>
          </div>
          <div>
            <label className="font-bold block mb-1">عنوان تعرفه نمایشی</label>
            <input type="text" aria-invalid={invalidField === 'priceDisplayFa'} value={priceDisplayFa} onChange={(e) => { setPriceDisplayFa(e.target.value); clearStatus(); }} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700" />
          </div>
        </div>

        <div>
          <label className="font-bold block mb-1">شرح خدمت قابل ارائه و دامنه تخصص</label>
          <textarea rows={2} aria-invalid={invalidField === 'specialtyFa'} value={specialtyFa} onChange={(e) => { setSpecialtyFa(e.target.value); clearStatus(); }} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700" placeholder="مثال: بازبینی قراردادهای خرید و پیش‌فروش به همراه چک‌لیست تعهدات سند..." />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="font-bold block mb-1">شماره پروانه / کانون / نظام مهندسی (اختیاری)</label>
            <input type="text" value={licenseClaimedFa} onChange={(e) => { setLicenseClaimedFa(e.target.value); clearStatus(); }} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 tabular-nums" placeholder="فقط پس از بررسی نمایش داده می‌شود" />
          </div>
          <div>
            <label className="font-bold block mb-1">خلاصه نمونه‌کار یا سوابق قابل استناد</label>
            <input type="text" value={portfolioSummaryFa} onChange={(e) => { setPortfolioSummaryFa(e.target.value); clearStatus(); }} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700" />
          </div>
        </div>

        {error && <div role="alert" className="p-2.5 rounded-[8px] bg-rose-50 dark:bg-rose-950/40 text-[#B3261E] dark:text-rose-200 font-bold">{error}</div>}
        {savedOk && (
          <div role="status" className="p-2.5 rounded-[8px] bg-[#EAF3F0] dark:bg-emerald-950/40 text-[var(--color-brand-700)] dark:text-emerald-200 font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> پرونده شما در صف ممیزی و تأیید ۴گانه رادار ثبت شد.
          </div>
        )}

        <button type="submit" className="w-full py-2.5 rounded-[10px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white font-bold cursor-pointer">
          ارسال پرونده برای بررسی و انتشار
        </button>
      </form>

      <aside className="lg:col-span-5 space-y-3">
        <div className="p-4 rounded-[14px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-2">
          <strong className="text-sm font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>پرونده‌های ثبت‌شده شما ({submissions.length})</span>
          </strong>
          {submissions.length === 0 ? (
            <p className="text-[var(--color-text-muted)] py-4">هنوز پرونده ارائه‌دهنده‌ای از این حساب ارسال نشده است.</p>
          ) : (
            <div className="space-y-2">
              {submissions.map((s) => (
                <div key={s.submissionId} className="p-3 rounded-[10px] bg-[#F8F9FA] dark:bg-slate-800/80 border border-[var(--color-border-subtle)] dark:border-slate-700 space-y-1">
                  <div className="flex items-center justify-between font-bold text-[var(--color-text-primary)] dark:text-white">
                    <span>{s.displayName}</span>
                    <span className="text-[var(--color-brand-600)]">{MODERATION_STATUS_FA[s.moderationStatus]}</span>
                  </div>
                  <p className="text-[10.5px] text-[var(--color-text-muted)]">{CANONICAL_CATEGORY_LABELS_FA[s.canonicalCategory]} · {s.moderatorNoteFa}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

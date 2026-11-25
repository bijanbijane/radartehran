/** @file src/components/views/LegalDocumentView.tsx — Dedicated Routed Privacy Policy & Terms of Use Pages (/legal/privacy, /legal/terms) */
import React from 'react';
import { ShieldCheck, Scale, FileText, ArrowRight, ArrowLeft } from 'lucide-react';
import type { PrimaryViewId } from '../../utils/areaUnit';
import type { ModuleSubTabId } from '../../navigation/registry/route.types';
import { useRadarLocale } from '../AreaUnitToggle';
import { RadarLink } from '../ui/RadarPrimitives';

export interface LegalDocumentViewProps {
  documentKind: 'privacy' | 'terms';
  onNavigateView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
}

export const LegalDocumentView: React.FC<LegalDocumentViewProps> = ({
  documentKind,
  onNavigateView,
}) => {
  const [locale] = useRadarLocale();
  const isEn = locale === 'en';
  const isPrivacy = documentKind === 'privacy';
  const BackIcon = isEn ? ArrowLeft : ArrowRight;

  const navigateLegal = (kind: 'privacy' | 'terms') => {
    const path = kind === 'privacy' ? '/legal/privacy' : '/legal/terms';
    if (typeof window !== 'undefined' && window.location.pathname !== path) {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    onNavigateView('knowledge', kind === 'privacy' ? 'legal_privacy' : 'legal_terms');
  };

  return (
    <article
      dir={isEn ? 'ltr' : 'rtl'}
      data-testid={isPrivacy ? 'legal-privacy-page' : 'legal-terms-page'}
      className="w-full max-w-[72ch] mx-auto px-4 sm:px-6 py-8 space-y-6 animate-fadeIn"
    >
      <div className="space-y-4 border-b border-[var(--color-border-subtle)] pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-sm font-bold text-[var(--color-brand-fg)]">
            {isPrivacy ? <ShieldCheck className="w-4 h-4" aria-hidden="true" /> : <Scale className="w-4 h-4" aria-hidden="true" />}
            <span>{isEn ? 'Transparency & Legal Center' : 'مرکز شفافیت و اسناد حقوقی'}</span>
          </div>
          <div role="group" aria-label={isEn ? 'Legal documents' : 'اسناد حقوقی'} className="flex items-center gap-2">
            <RadarLink
              href="/legal/privacy"
              aria-current={isPrivacy ? 'page' : undefined}
              onNavigate={() => navigateLegal('privacy')}
              className={`min-h-[44px] md:min-h-[36px] px-3.5 py-1.5 rounded-[8px] text-sm font-bold transition cursor-pointer inline-flex items-center ${
                isPrivacy
                  ? 'bg-[var(--color-brand-600)] text-white'
                  : 'border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'
              }`}
            >
              {isEn ? 'Privacy Policy' : 'سیاست حریم خصوصی'}
            </RadarLink>
            <RadarLink
              href="/legal/terms"
              aria-current={!isPrivacy ? 'page' : undefined}
              onNavigate={() => navigateLegal('terms')}
              className={`min-h-[44px] md:min-h-[36px] px-3.5 py-1.5 rounded-[8px] text-sm font-bold transition cursor-pointer inline-flex items-center ${
                !isPrivacy
                  ? 'bg-[var(--color-brand-600)] text-white'
                  : 'border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'
              }`}
            >
              {isEn ? 'Terms of Use' : 'قوانین و شرایط استفاده'}
            </RadarLink>
          </div>
        </div>

        <h1 className="text-2xl sm:text-[28px] font-bold leading-[1.35] text-[var(--color-text-primary)]">
          {isPrivacy
            ? (isEn ? 'Privacy Policy & Data Protection' : 'سیاست حریم خصوصی و حفاظت از داده‌ها')
            : (isEn ? 'Terms of Use & Analytical Disclaimer' : 'قوانین استفاده و سلب مسئولیت تحلیلی')}
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] leading-8">
          {isPrivacy
            ? (isEn
              ? 'RadarTehran collects only the minimum data needed to remember your saved neighborhoods, search filters, and optional account preferences.'
              : 'رادارتهران تنها حداقل اطلاعات لازم برای ذخیره محله‌های منتخب، فیلترهای بودجه و تنظیمات اختیاری حساب کاربری شما را نگهداری می‌کند.')
            : (isEn
              ? 'By accessing RadarTehran maps, market indices, and valuation calculators, you agree to treat displayed figures as analytical estimates rather than official legal appraisals.'
              : 'استفاده از نقشه، شاخص‌های بازار و ابزارهای ارزش‌گذاری رادارتهران به معنای پذیرش ماهیت تحلیلی و غیراسنادی برآوردهای نمایش‌داده‌شده است.')}
        </p>
      </div>

      <div className="space-y-4">
        {isPrivacy ? (
          <>
            <section className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 space-y-2.5">
              <h2 className="text-base font-bold text-[var(--color-text-primary)]">
                {isEn ? '1. Local Browser Preferences' : '۱. ذخیره‌سازی محلی در مرورگر'}
              </h2>
              <p className="text-sm leading-7 text-[var(--color-text-secondary)]">
                {isEn
                  ? 'Favorites, map theme, active city, and visit checklists are stored locally in your browser unless you explicitly sign in to sync across devices.'
                  : 'محله‌های منتخب، حالت نمایش روز/شب، شهر فعال و یادداشت‌های بازدید در حافظه محلی مرورگر شما نگهداری می‌شوند و بدون ورود اختیاری به حساب کاربری ارسال نمی‌شوند.'}
              </p>
            </section>
            <section className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 space-y-2.5">
              <h2 className="text-base font-bold text-[var(--color-text-primary)]">
                {isEn ? '2. Account Sign-In & Control' : '۲. حساب کاربری و کنترل داده‌ها'}
              </h2>
              <p className="text-sm leading-7 text-[var(--color-text-secondary)]">
                {isEn
                  ? 'We never sell user phone numbers, emails, or saved searches to third-party brokers. You may export or clear your personal saved data at any time from Account Settings.'
                  : 'شماره تماس، ایمیل یا جست‌وجوهای ذخیره‌شده کاربران به هیچ نهاد یا آژانس ثالثی فروخته نمی‌شود و در هر زمان از بخش تنظیمات حساب قابل پاک‌سازی است.'}
              </p>
            </section>
            <section className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 space-y-2.5">
              <h2 className="text-base font-bold text-[var(--color-text-primary)]">
                {isEn ? '3. Sanitized URLs & Sharing' : '۳. پاک‌سازی پارامترهای حساس در لینک‌ها'}
              </h2>
              <p className="text-sm leading-7 text-[var(--color-text-secondary)]">
                {isEn
                  ? 'Shared links automatically strip sensitive parameters (phone, email, tokens) and preserve only non-identifying city, neighborhood, and budget range context.'
                  : 'لینک‌های اشتراک‌گذاری به‌صورت خودکار پارامترهای حساس (شماره تماس، ایمیل و توکن) را حذف می‌کنند و صرفاً اطلاعات عمومی شهر، محله و بازه بودجه را منتقل می‌کنند.'}
              </p>
            </section>
            <section className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 space-y-2.5">
              <h2 className="text-base font-bold text-[var(--color-text-primary)]">
                {isEn ? '4. Community Contributions' : '۴. مشارکت‌های عمومی و گزارش داده'}
              </h2>
              <p className="text-sm leading-7 text-[var(--color-text-secondary)]">
                {isEn
                  ? 'Price claims and neighborhood corrections are aggregated anonymously to improve statistical accuracy without exposing private contract parties.'
                  : 'گزارش‌های قیمتی و اصلاحات محله به‌صورت ناشناس و تجمیعی برای ارتقای دقت شاخص‌ها به کار می‌روند و اطلاعات طرفین معامله منتشر نمی‌شود.'}
              </p>
            </section>
          </>
        ) : (
          <>
            <section className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 space-y-2.5">
              <h2 className="text-base font-bold text-[var(--color-text-primary)]">
                {isEn ? '1. Analytical Estimates Only' : '۱. ماهیت تحلیلی برآوردها'}
              </h2>
              <p className="text-sm leading-7 text-[var(--color-text-secondary)]">
                {isEn
                  ? 'Hedonic estimates, asking medians, and negotiation scenarios are informational benchmarks and do not substitute for licensed official property appraisals or legal counsel.'
                  : 'برآوردهای هدونیک، میانه نرخ اعلامی و سناریوهای مذاکره صرفاً شاخص تحلیلی جهت شفافیت تصمیم هستند و جایگزین کارشناسی رسمی دادگستری یا مشاوره حقوقی نیستند.'}
              </p>
            </section>
            <section className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 space-y-2.5">
              <h2 className="text-base font-bold text-[var(--color-text-primary)]">
                {isEn ? '2. Independent Verification' : '۲. ضرورت راستی‌آزمایی حضوری و ثبتی'}
              </h2>
              <p className="text-sm leading-7 text-[var(--color-text-secondary)]">
                {isEn
                  ? 'Before signing any binding sale or lease contract, buyers and tenants must verify title deeds, municipal zoning permits, and physical property conditions independently.'
                  : 'پیش از امضای هرگونه مبایعه‌نامه یا اجاره‌نامه، استعلام رسمی سند مالکیت، پایان کار شهرداری و بازدید فنی ملک بر عهده طرفین معامله است.'}
              </p>
            </section>
            <section className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 space-y-2.5">
              <h2 className="text-base font-bold text-[var(--color-text-primary)]">
                {isEn ? '3. Acceptable Community Conduct' : '۳. اصول مشارکت در جامعه کاربران'}
              </h2>
              <p className="text-sm leading-7 text-[var(--color-text-secondary)]">
                {isEn
                  ? 'Deliberate price manipulation, spam listings, or sharing private third-party personal data in community discussions is prohibited.'
                  : 'ثبت قیمت‌های جعلی برای دست‌کاری بازار، انتشار آگهی اسپم یا افشای اطلاعات شخصی دیگران در بخش جامعه کاربران مجاز نیست.'}
              </p>
            </section>
            <section className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 space-y-2.5">
              <h2 className="text-base font-bold text-[var(--color-text-primary)]">
                {isEn ? '4. Methodology Transparency' : '۴. شفافیت منابع و روش‌شناسی'}
              </h2>
              <p className="text-sm leading-7 text-[var(--color-text-secondary)]">
                {isEn
                  ? 'Full statistical definitions, IQR outlier filtering rules, and confidence badges are published openly in the Data Methodology section.'
                  : 'تعاریف آماری، نحوه حذف آگهی‌های پرت (IQR) و شاخص اعتبارسنجی داده‌ها به‌صورت شفاف در صفحه روش‌شناسی داده منتشر شده است.'}
              </p>
            </section>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[var(--color-border-subtle)]">
        <RadarLink
          href="/knowledge/methodology"
          onNavigate={() => onNavigateView('knowledge', 'methodology')}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-[10px] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-sm font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)] cursor-pointer"
        >
          <FileText className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" />
          <span>{isEn ? 'Read Data Methodology' : 'مطالعه روش‌شناسی داده'}</span>
        </RadarLink>
        <RadarLink
          href="/"
          onNavigate={() => onNavigateView('home')}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-[10px] bg-[var(--color-brand-600)] text-white text-sm font-bold hover:opacity-95 cursor-pointer"
        >
          <BackIcon className="w-4 h-4" aria-hidden="true" />
          <span>{isEn ? 'Back to Home' : 'بازگشت به صفحه نخست'}</span>
        </RadarLink>
      </div>
    </article>
  );
};

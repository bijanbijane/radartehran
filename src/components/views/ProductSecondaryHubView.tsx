/** @file src/components/views/ProductSecondaryHubView.tsx — Real Services, Knowledge, Contributions & 404 Views */
import React from 'react';
import { BookOpen, Briefcase, Calculator, Compass, FileCheck, Hammer, Home, Map as MapIcon, MessageSquarePlus, Scale, ShieldAlert, Sparkles } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../data/neighborhoods';
import { convertPricePerSqmToUnit, formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import type { SuperModuleTabId } from '../FutureSuperModulesModal';
import type { ExpansionModalType } from '../ExpansionModulesModal';

export interface ProductSecondaryHubViewProps {
  viewKind: 'services' | 'knowledge' | 'contributions' | 'not_found';
  selectedHood: EvaluatedNeighborhood;
  onNavigateView: (view: PrimaryViewId) => void;
  onOpenHedonic: () => void;
  onOpenListingVerifier: () => void;
  onOpenExpansionModal: (t: ExpansionModalType) => void;
  onOpenSuperModule: (t: SuperModuleTabId) => void;
  onOpenAgencySubmit: () => void;
  onOpenResidentVoteTab: () => void;
  onOpenPulseModal: () => void;
  onOpenSeoDrawer: () => void;
}

export const ProductSecondaryHubView: React.FC<ProductSecondaryHubViewProps> = (p) => {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();
  const unitPrice = convertPricePerSqmToUnit(p.selectedHood.buyPerSqm, areaUnit);
  const fxSample = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitPrice, intlCurrency, radarLocale)})` : '';

  if (p.viewKind === 'not_found') {
    return (
      <div data-testid="product-not-found-view" className="w-full max-w-3xl mx-auto px-4 py-12 text-center space-y-5 animate-fadeIn">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-xl">
          ۴۰۴
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">مسیر یا صفحه درخواستی یافت نشد</h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
          نشانی واردشده در ساختار فعلی رادار تهران تعریف نشده یا جابه‌جا شده است. می‌توانید به نقشه تعاملی، صفحه نخست یا لیست محله‌ها بازگردید.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
          <button type="button" onClick={() => p.onNavigateView('map')} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer">
            <MapIcon className="w-4 h-4" /><span>بازگشت به نقشه زنده</span>
          </button>
          <button type="button" onClick={() => p.onNavigateView('home')} className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
            <Home className="w-4 h-4" /><span>صفحه نخست</span>
          </button>
          <button type="button" onClick={() => p.onNavigateView('discover')} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer">
            فهرست محله‌ها
          </button>
        </div>
      </div>
    );
  }

  if (p.viewKind === 'services') {
    return (
      <div data-testid="product-services-view" className="w-full max-w-5xl mx-auto px-4 py-6 space-y-6 animate-fadeIn">
        <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
          <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 mb-1">
            <Briefcase className="w-3.5 h-3.5" /><span>خدمات تخصصی و حقوقی معامله · همگام با محله {p.selectedHood.name}</span>
          </span>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">خدمات کارشناسی، قرارداد و بازدید ملکی</h1>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">نرخ پایه مرجع در محله {p.selectedHood.name}: {toPersianNum(unitPrice)} م{fxSample}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <button type="button" onClick={p.onOpenHedonic} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-600 text-start space-y-2 cursor-pointer transition">
            <Calculator className="w-5 h-5 text-emerald-600" />
            <div className="text-sm font-black text-slate-900 dark:text-white">کارشناسی قیمت و ارزش‌گذاری هدونیک</div>
            <p className="text-slate-500 leading-relaxed">برآورد قیمت عادلانه و کف فروش فوری بر اساس سن بنا، طبقه، پارکینگ و وضعیت سند.</p>
          </button>
          <button type="button" onClick={p.onOpenListingVerifier} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-600 text-start space-y-2 cursor-pointer transition">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
            <div className="text-sm font-black text-slate-900 dark:text-white">آنتی‌ویروس و بررسی حباب آگهی</div>
            <p className="text-slate-500 leading-relaxed">تحلیل فوری متن یا لینک آگهی دیوار برای شناسایی قیمت‌های طعمه، فیک یا غیرواقعی.</p>
          </button>
          <button type="button" onClick={() => p.onOpenExpansionModal('contract')} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-600 text-start space-y-2 cursor-pointer transition">
            <Scale className="w-5 h-5 text-indigo-600" />
            <div className="text-sm font-black text-slate-900 dark:text-white">مشاوره حقوقی و سپر اتاق قرارداد</div>
            <p className="text-slate-500 leading-relaxed">کنترل بندهای فسخ، خیارات، زمان‌بندی چک‌های صیادی و نرخ کمیسیون قانونی اتحادیه.</p>
          </button>
          <button type="button" onClick={() => p.onOpenSuperModule('municipality')} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-600 text-start space-y-2 cursor-pointer transition">
            <Hammer className="w-5 h-5 text-amber-600" />
            <div className="text-sm font-black text-slate-900 dark:text-white">ضوابط ساخت‌وساز R122 و چک‌لیست بازدید</div>
            <p className="text-slate-500 leading-relaxed">بررسی تراکم مجاز، جرایم ماده ۱۰۰ و چک‌لیست فنی بازدید حضوری ساختمان.</p>
          </button>
        </div>
      </div>
    );
  }

  if (p.viewKind === 'knowledge') {
    const tocItems = [
      { id: 'kb-epistemic-split', label: '۱. تفکیک قیمت اعلامی و سناریوی v6.4' },
      { id: 'kb-iqr-cleaning', label: '۲. پاک‌سازی داده‌های پرت با روش آماری IQR' },
      { id: 'kb-hedonic-weights', label: '۳. وزن‌دهی مدل هدونیک و تعدیل سن بنا' },
      { id: 'kb-evidence-coverage', label: '۴. شاخص پوشش نمونه و شفافیت داده' },
    ];
    return (
      <div data-testid="product-knowledge-view" className="w-full max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fadeIn">
        <div className="border-b border-[#DCE3DF] dark:border-slate-800 pb-4">
          <span className="text-[13px] font-medium text-[#176B63] dark:text-emerald-400 flex items-center gap-1.5 mb-1">
            <BookOpen className="w-4 h-4" /><span>مرجع دانش بازار مسکن و شفافیت روش‌شناسی رادار</span>
          </span>
          <h1 className="text-[24px] sm:text-[30px] font-bold text-[#182522] dark:text-white leading-[1.5]">دانش، گزارش‌ها و معرفت‌شناسی داده</h1>
        </div>

        {/* Mobile Collapsible Table of Contents */}
        <details className="lg:hidden rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 p-3.5 text-sm">
          <summary className="font-semibold text-[#182522] dark:text-white cursor-pointer">فهرست سرفصل‌های روش‌شناسی</summary>
          <ul className="mt-2.5 space-y-1.5 border-t border-[#DCE3DF] dark:border-slate-800 pt-2">
            {tocItems.map((t) => (
              <li key={t.id}><a href={`#${t.id}`} className="block py-1 text-[#176B63] dark:text-emerald-400 font-medium hover:underline">{t.label}</a></li>
            ))}
          </ul>
        </details>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Editorial Reading Column (8 cols, max 740px measure, 16px body, 1.8 line-height) */}
          <div className="lg:col-span-8 space-y-5">
            <article id="kb-epistemic-split" className="p-5 sm:p-6 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3">
              <h2 className="text-[20px] font-semibold text-[#182522] dark:text-white leading-[1.5]">
                تفکیک دقیق «قیمت اعلامی»، «سناریوی مذاکره <bdi dir="ltr">v6.4</bdi>» و «بازه آماری <bdi dir="ltr">IQR</bdi>»
              </h2>
              <p className="editorial-prose text-[#34433E] dark:text-slate-300">
                در ایران آمار رسمی ثبت معاملات به‌صورت عمومی در لحظه منتشر نمی‌شود. رادار تهران برای پرهیز از گمراه‌سازی خریدار، عدد میانه آگهی‌های مشاهده‌شده را از خروجی سناریویی مذاکره (<bdi dir="ltr">v6.4</bdi> — غیرثبتی) و بازه بین‌چارکی (<bdi dir="ltr">IQR</bdi> پس از حذف داده‌های پرت) به‌طور شفاف تفکیک می‌کند.
              </p>
            </article>
            <article id="kb-iqr-cleaning" className="p-5 sm:p-6 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3">
              <h2 className="text-[18px] font-semibold text-[#182522] dark:text-white leading-[1.55]">پاک‌سازی داده‌های پرت و آگهی‌های طعمه</h2>
              <p className="editorial-prose text-[#34433E] dark:text-slate-300">
                آگهی‌های با انحراف غیرمتعارف پایین یا بالا با فیلتر چارک اول و سوم (<bdi dir="ltr">Tukey Fences</bdi>) کنار گذاشته می‌شوند تا قیمت‌های فیک یا طعمه میانه محله را تخریب نکنند.
              </p>
            </article>
            <article id="kb-hedonic-weights" className="p-5 sm:p-6 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3">
              <h2 className="text-[18px] font-semibold text-[#182522] dark:text-white leading-[1.55]">ضرایب مدل ارزش‌گذاری هدونیک محله {p.selectedHood.name}</h2>
              <p className="editorial-prose text-[#34433E] dark:text-slate-300 tabular-nums">
                مدل هدونیک قیمت پایه محله ({toPersianNum(unitPrice)} میلیون تومان{fxSample}) را بر اساس سن بنا، طبقه، آسانسور، پارکینگ، نورگیری و قدرالسهم زمین تعدیل می‌کند تا بازه منصفانه و کف فروش سریع به‌دست آید.
              </p>
            </article>
            <article id="kb-evidence-coverage" className="p-5 sm:p-6 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3">
              <h2 className="text-[18px] font-semibold text-[#182522] dark:text-white leading-[1.55]">شاخص پوشش نمونه و پرهیز از قطعیت کاذب</h2>
              <p className="editorial-prose text-[#34433E] dark:text-slate-300">
                عدد پوشش نمونه در کارنامه هر محله تنها نشان‌دهنده تعداد آگهی‌های همتاسازی‌شده معتبر در بازه اخیر است و هرگز به‌عنوان احتمال قطعی یا گواهی رسمی معامله نمایش داده نمی‌شود.
              </p>
            </article>
          </div>

          {/* Sticky Table of Contents Sidebar (4 cols) */}
          <aside aria-label="فهرست مطالب دانشنامه" className="hidden lg:block lg:col-span-4 lg:sticky lg:top-24 space-y-4">
            <div className="p-4 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3 text-sm">
              <div className="font-semibold text-[#182522] dark:text-white">فهرست سرفصل‌های روش‌شناسی</div>
              <nav aria-label="سرفصل‌های مقاله" className="space-y-1.5 border-t border-[#DCE3DF] dark:border-slate-800 pt-2.5 text-[14px]">
                {tocItems.map((t) => (
                  <a key={t.id} href={`#${t.id}`} className="block px-2.5 py-1.5 rounded-[9px] text-[#34433E] dark:text-slate-300 hover:bg-[#EAF3F0] dark:hover:bg-emerald-950/50 hover:text-[#14534E] dark:hover:text-emerald-300 font-medium transition">
                    {t.label}
                  </a>
                ))}
              </nav>
              <div className="pt-2 border-t border-[#DCE3DF] dark:border-slate-800 space-y-2 text-[14px]">
                <button type="button" onClick={p.onOpenPulseModal} className="w-full px-3.5 py-2 rounded-[9px] bg-[#176B63] hover:bg-[#14534E] text-white font-medium cursor-pointer transition">باز کردن گزارش کامل نبض بازار</button>
                <button type="button" onClick={p.onOpenSeoDrawer} className="w-full px-3.5 py-2 rounded-[9px] border border-[#C5D0CA] dark:border-slate-700 text-[#182522] dark:text-white font-medium cursor-pointer flex items-center justify-center gap-1.5"><Compass className="w-4 h-4" /><span>فهرست شناسنامه تمام محله‌ها</span></button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="product-contributions-view" className="w-full max-w-5xl mx-auto px-4 py-6 space-y-6 animate-fadeIn">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 mb-1">
          <MessageSquarePlus className="w-3.5 h-3.5" /><span>مشارکت میدانی ساکنان و شفاف‌سازی قیمت واقعی</span>
        </span>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">مشارکت در داده و راستی‌آزمایی محله {p.selectedHood.name}</h1>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <button type="button" onClick={p.onOpenAgencySubmit} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-600 text-start space-y-2 cursor-pointer transition">
          <Sparkles className="w-5 h-5 text-emerald-600" />
          <div className="text-sm font-black text-slate-900 dark:text-white">ثبت فایل زیر قیمت یا مشاهده قیمتی</div>
          <p className="text-slate-500 leading-relaxed">ارسال فایل واقعی یا قیمت معامله برای افزوده‌شدن به لایه شکارهای محله {p.selectedHood.name}.</p>
        </button>
        <button type="button" onClick={p.onOpenResidentVoteTab} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-600 text-start space-y-2 cursor-pointer transition">
          <FileCheck className="w-5 h-5 text-sky-600" />
          <div className="text-sm font-black text-slate-900 dark:text-white">رأی‌دهی به کیفیت سکونت ساکنان</div>
          <p className="text-slate-500 leading-relaxed">امتیازدهی میدانی به کیفیت هوا، قطعی آب و برق، آنتن‌دهی، مترو و امنیت شبانه محله.</p>
        </button>
      </div>
    </div>
  );
};

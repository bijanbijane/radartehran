import React, { useState, useMemo } from 'react';
import {
  Calculator, Building2, Scale, ShieldAlert, Sparkles, FileCheck, Hammer,
  GraduationCap, ArrowLeftRight, ChevronRight, ArrowUpRight, ClipboardCheck, Coins, Share2, Search, X,
  Compass, Network, Hourglass, Briefcase, Activity, PieChart, Wallet, Split, Award
} from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import { toPersianNum } from '../../data/neighborhoods';
import type { FeatureFlags } from '../../types/models';
import type { ExpansionModalType } from '../ExpansionModulesModal';
import type { SuperModuleTabId } from '../FutureSuperModulesModal';
import { convertPricePerSqmToUnit, formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { matchesPersianSearch } from '../../utils/security';
import { Stage2MasterWidget, type Stage2ActiveTab } from '../stage2/Stage2MasterWidget';

export interface ProductToolsViewProps {
  evaluatedNeighborhoods?: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  onSelectNeighborhood?: (hood: EvaluatedNeighborhood) => void;
  onOpenInspector?: (hood: EvaluatedNeighborhood) => void;
  onOpenHedonic: () => void;
  onOpenSuperModule: (tab: SuperModuleTabId) => void;
  onOpenExpansionModal: (t: ExpansionModalType) => void;
  onOpenReverseBudget: () => void;
  onOpenCompare: () => void;
  featureFlags: FeatureFlags;
  activeCity?: string;
}

export function ProductToolsView(p: ProductToolsViewProps): React.ReactElement {
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [radarLocale] = useRadarLocale();
  const isEn = radarLocale === 'en';
  const [toolQuery, setToolQuery] = useState<string>('');
  const [activeCat, setActiveCat] = useState<'all' | 'financial' | 'legal' | 'urban' | 'decision'>('all');
  const [showEmbeddedLab, setShowEmbeddedLab] = useState<boolean>(false);
  const [activeDecisionTab, setActiveDecisionTab] = useState<Stage2ActiveTab>('DECISION_SYNTHESIS');
  const labContainerRef = React.useRef<HTMLDivElement>(null);

  const openDecisionTool = (tabId: Stage2ActiveTab) => {
    setActiveDecisionTab(tabId);
    setShowEmbeddedLab(true);
    setTimeout(() => {
      labContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const unitBuy = convertPricePerSqmToUnit(p.selectedHood.buyPerSqm, areaUnit);
  const unitDeal = convertPricePerSqmToUnit(
    aggregateNeighborhoodMarketMetrics(p.selectedHood.id, p.selectedHood.name, p.selectedHood.buyPerSqm, buildNeighborhoodListingSamples(p.selectedHood)).estimatedDealPricePerSqm,
    areaUnit
  );
  const dealFx = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitDeal, intlCurrency, radarLocale)})` : '';

  const toolCategories = useMemo(() => [
    {
      id: 'decision' as const,
      category: isEn ? 'CASPER Decision Science & Game Theory' : 'نظریه بازی‌ها، تصمیم‌گیری و سرایت فضایی (CASPER)',
      items: [
        { id: 'casper_decision_synthesis', title: 'سنتز جامع کیفیت تصمیم، سقف خروج و آمادگی معامله (Executive Deal Readiness)', desc: 'حکم نهایی ورود به معامله، ارزیابی ماتریس ۶گانه، تعیین سقف ترک جلسه و سناریوی افتتاحیه چانه‌زنی', icon: Award, action: () => openDecisionTool('DECISION_SYNTHESIS') },
        { id: 'casper_regret', title: 'ماتریس کمینه‌ساز بیشینه پشیمانی ساواج (Savage Minimax Regret)', desc: `شبیه‌سازی بازده ثروت نهایی ۳۶ ماهه در برابر ۳ رژیم جهش ارزی، رکود تورمی و ثبات در محله ${p.selectedHood.name}`, icon: Compass, action: () => openDecisionTool('PARETO_REGRET') },
        { id: 'casper_lemon', title: 'شاخص عدم تقارن اطلاعاتی و بازار لیموها (Akerlof Lemon Index)', desc: 'سنجش برتری اطلاعاتی فروشنده، نرخ آگهی‌های طعمه و فرمولاسیون چانه‌زنی ضد زیان‌گریزی کانمن (λ=۲٫۲۵)', icon: Network, action: () => openDecisionTool('SPATIAL_CONTAGION') },
        { id: 'casper_real_options', title: 'اختیارات واقعی و نیمه‌عمر نقدشوندگی (Dixit-Pindyck Real Options)', desc: 'محاسبه ارزش ریاضی اختیار تعویق در معامله، تابع بقای فروش مسکن و بتای سرریز دلار، طلا و تورم عمومی', icon: Hourglass, action: () => openDecisionTool('REAL_OPTIONS') },
        { id: 'casper_urban_affordability', title: 'هزینه کل اقتصادی سکونت و مرز تردد آلونسو-میلز (TCOH & Isochrone)', desc: 'تنش استطاعت مسکن (PIR/RIR)، ارزش اتلاف وقت در ترافیک، استهلاک رفت‌وآمد و نقطه سربه‌سر آربیتراژ سکونت', icon: Briefcase, action: () => openDecisionTool('URBAN_AFFORDABILITY') },
        { id: 'casper_monte_carlo', title: 'شبیه‌ساز ۱٬۰۰۰ سناریوی مونت‌کارلو جهش-نفوذ مرتون و ارزش در معرض خطر (Merton VaR)', desc: 'توزیع احتمالاتی بازده واقعی در برابر شوک ارزی، محاسبه سقف زیان در سطح اطمینان ۹۵٪ و ضریب سورتینو', icon: Activity, action: () => openDecisionTool('MONTE_CARLO_VAR') },
        { id: 'casper_housing_cycle', title: 'رادار چرخه‌های ادواری مسکن و فرسایش حباب (Housing Cycle Radar)', desc: 'تشخیص فازهای ۴گانه رکود، رونق، اشباع و کف‌سازی همراه با راهبرد اختصاصی خانه‌اولی‌ها و ارتقادهندگان', icon: PieChart, action: () => openDecisionTool('HOUSING_CYCLE') },
        { id: 'casper_macro_portfolio', title: 'بهینه‌ساز سبد دارایی مارکوویتز، طلا و دلار (Markowitz Portfolio & Gold Arbitrage)', desc: 'محاسبه وزن بهینه مسکن، سکه، دلار و درآمد ثابت ۳۰٪، مرز کارا و تحلیل سودآوری تبدیل طلا به ملک', icon: Wallet, action: () => openDecisionTool('MACRO_PORTFOLIO') },
        { id: 'casper_rent_vs_buy', title: 'مدل تعادلی خرید در برابر «اجاره + سرمایه‌گذاری مازاد» (Rent vs. Buy NPV Arbitrage)', desc: 'به چالش کشیدن باور سنتی «اجاره‌نشینی یعنی هدر دادن پول»، محاسبه ارزش فعلی خالص، استهلاک و نرخ بی‌تفاوتی', icon: Split, action: () => openDecisionTool('RENT_VS_BUY') },
      ],
    },
    {
      id: 'financial' as const,
      category: isEn ? 'Valuation & Financial Calculators' : 'قیمت‌گذاری و ارزیابی مالی',
      items: [
        { id: 'hedonic', title: 'کارشناسی هوشمند ارزش ملک (Hedonic)', desc: `محاسبه ارزش منصفانه و قیمت فروش فوری واحد در محله ${p.selectedHood.name} با در نظر گرفتن سن بنا، طبقه و امکانات`, icon: Calculator, action: p.onOpenHedonic },
        { id: 'reverse_budget', title: 'کاشف معکوس بودجه مسکن', desc: '«با بودجه من کجای شهر می‌توانم خانه بخرم؟» تطبیق فوری متراژ و قدرت خرید', icon: Sparkles, action: p.onOpenReverseBudget },
        { id: 'commission', title: 'ماشین‌حساب کمیسیون املاک و هزینه محضر', desc: 'محاسبه دقیق حق‌الزحمه قانونی مشاور، ۹٪ ارزش افزوده و هزینه ثبت در دفترخانه اسناد رسمی', icon: Scale, action: () => p.onOpenExpansionModal('commission') },
        { id: 'mortgage', title: 'شبیه‌ساز اوراق تسه، وام مسکن و خرید متری', desc: 'محاسبه هزینه خرید برگه تسهیلات، اقساط ۱۲ ساله بانک مسکن و مدل سرمایه‌گذاری متری', icon: Building2, action: () => p.onOpenSuperModule('mortgage') },
        { id: 'tax_inheritance', title: 'محاسبه مالیات نقل‌وانتقال ۱۴۰۵، ارث و مهریه‌یار', desc: 'فرمول ماده ۵۹ مالیات مستقیم، محاسبه سهم‌الارث طبقات، مالیات بر خانه‌های خالی و مهریه ملکی', icon: Coins, action: () => p.onOpenSuperModule('tax_inheritance') },
      ],
    },
    {
      id: 'legal' as const,
      category: isEn ? 'Legal Security & Contract Verification' : 'امنیت حقوقی و راستی‌آزمایی قراردادها',
      items: [
        { id: 'fake_ad', title: 'مچ‌گیر هوشمند آگهی‌های فیک و قیمت طعمه', desc: 'تشخیص آگهی‌های غیرواقعی، راستی‌آزمایی تله‌های قیمتی و تولید سوالات کلیدی استعلام تلفنی', icon: ShieldAlert, action: () => p.onOpenSuperModule('fake_detector') },
        { id: 'contract', title: 'مشاور حقوقی هوشمند قولنامه و مبایعه‌نامه', desc: 'بررسی بندهای حقوقی، شروط فسخ، خیارات غبن، نحوه پرداخت چک‌ها و جلوگیری از کلاهبرداری', icon: FileCheck, action: () => p.onOpenExpansionModal('contract') },
        { id: 'tenant_rights', title: 'داور هوشمند روابط موجر و مستأجر', desc: 'تفکیک قانونی هزینه‌های اساسی و جاری ساختمان، فرمول شارژ و تقویم حقوقی قرارداد', icon: Scale, action: () => p.onOpenSuperModule('tenant_rights') },
        { id: 'visit_checklist', title: 'چک‌لیست هوشمند کارشناسی بازدید و عیب‌یابی ملک', desc: 'ماتریس ۵۰ نقطه‌ای بررسی نم و رطوبت، فشار آب، پارکینگ، تاسیسات موتورخانه و فرهنگ ساختمان', icon: ClipboardCheck, action: () => p.onOpenSuperModule('visit_checklist') },
      ],
    },
    {
      id: 'urban' as const,
      category: isEn ? 'Swap, Zoning (R122), Schools & Realtor Studio' : 'معاوضه، ساخت، ضوابط، تولید محتوا و سبک زندگی',
      items: [
        { id: 'swap', title: 'مرکز تهاتر ملک و مقایسه شهرهای حومه', desc: 'موتور تطبیق معاوضه و ارزیابی اقتصادی شهرهای جدید اطراف کلان‌شهرها', icon: ArrowLeftRight, action: () => p.onOpenSuperModule('swap_suburb') },
        { id: 'municipality', title: 'دستیار ضوابط شهرداری (R122) و بازسازی', desc: 'محاسبه تراکم مجاز، درصد مشارکت در ساخت، جریمه ماده ۱۰۰ و برآورد هزینه نوسازی واحد', icon: Hammer, action: () => p.onOpenSuperModule('municipality') },
        { id: 'school_radar', title: 'رادار مدارس برتر، ایمنی گسل و سبک زندگی', desc: 'فاصله تا پهنه‌های گسلی، کیفیت آموزشی مدارس اطراف و دسترسی معابر', icon: GraduationCap, action: () => p.onOpenSuperModule('school_traffic') },
        { id: 'realtor_studio', title: 'استودیو هوش مصنوعی آگهی‌نویسی و استوری ملکی', desc: 'تولید متن جذاب و استاندارد برای دیوار و شیپور با فرمت استوری و بدون کلیشه‌های تکراری', icon: Share2, action: () => p.onOpenSuperModule('realtor_studio') },
      ],
    },
  ], [isEn, p]);

  const filteredCategories = useMemo(() => {
    const q = toolQuery.trim();
    return toolCategories
      .filter((c) => activeCat === 'all' || c.id === activeCat)
      .map((c) => ({
        ...c,
        items: q ? c.items.filter((it) => matchesPersianSearch(it.title, q) || matchesPersianSearch(it.desc, q)) : c.items,
      }))
      .filter((c) => c.items.length > 0);
  }, [toolCategories, activeCat, toolQuery]);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-6 animate-fadeIn" data-testid="product-tools-view">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-emerald-600 dark:text-emerald-400 block mb-1">
            {isEn ? 'Technical & Legal Calculators · Connected to Live Map' : 'محاسبات فنی و حقوقی · متصل به نقشه زنده'}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            {isEn ? 'Real Estate Transaction Toolkit' : 'جعبه‌ابزار هوشمند معاملات مسکن'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            مجموعه ۱۳ ابزار کارشناسی، شبیه‌ساز مالی، ارزیابی ریسک حقوقی و راستی‌آزمایی معاملات ملک
          </p>
        </div>
        <div className="p-3 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs space-y-2 min-w-[260px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">محله هدف محاسبات (قابل تغییر از نقشه):</span>
            {p.onOpenInspector && (
              <button type="button" onClick={() => p.onOpenInspector?.(p.selectedHood)} className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 hover:underline flex items-center gap-0.5 cursor-pointer">
                <span>کارنامه</span><ArrowUpRight className="w-3 h-3" />
              </button>
            )}
          </div>
          {p.evaluatedNeighborhoods && p.onSelectNeighborhood ? (
            <select
              aria-label="انتخاب محله هدف محاسبات"
              value={p.selectedHood.id}
              onChange={(e) => {
                const found = p.evaluatedNeighborhoods?.find((h) => h.id === Number(e.target.value));
                if (found) p.onSelectNeighborhood?.(found);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 font-black text-slate-900 dark:text-white text-xs focus:outline-none cursor-pointer"
            >
              {p.evaluatedNeighborhoods.map((h) => (
                <option key={h.id} value={h.id}>محله {h.name} {h.zone ? `· ${h.zone}` : ''}</option>
              ))}
            </select>
          ) : (
            <strong className="font-black text-emerald-700 dark:text-emerald-300 block">محله {p.selectedHood.name} {p.selectedHood.zone ? `· ${p.selectedHood.zone}` : ''}</strong>
          )}
          <div className="flex items-center justify-between text-[11px] tabular-nums pt-0.5">
            <span className="text-slate-600 dark:text-slate-300">اعلامی: <strong>{toPersianNum(unitBuy)} م</strong> · معامله v6.4: <strong className="text-emerald-700 dark:text-emerald-400">{toPersianNum(unitDeal)} م{dealFx}</strong></span>
            <button type="button" onClick={p.onOpenCompare} className="text-[10.5px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer">مقایسه دو محله</button>
          </div>
        </div>
      </div>

      {/* Instant Tool Filter & Category Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input type="text" aria-label={isEn ? 'Search calculators' : 'جستجوی سریع ابزار'} value={toolQuery} onChange={(e) => setToolQuery(e.target.value)} placeholder={isEn ? 'Search calculators (e.g. mortgage, tax, commission, R122)...' : 'جستجوی سریع ابزار (مثلاً: وام، مالیات، کمیسیون، قولنامه، R122)...'} className="w-full pr-9 pl-7 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600" />
          {toolQuery && <button type="button" aria-label="پاک کردن جستجوی ابزار" onClick={() => setToolQuery('')} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <div className="flex items-center gap-1 overflow-x-auto text-xs">
          {[
            { id: 'all' as const, label: isEn ? 'All (22)' : 'همه ابزارها (۲۲)' },
            { id: 'decision' as const, label: isEn ? 'Game Theory & Decision (9)' : 'نظریه بازی و پارتو (۹)' },
            { id: 'financial' as const, label: isEn ? 'Financial (5)' : 'مالی و قیمت (۵)' },
            { id: 'legal' as const, label: isEn ? 'Legal (4)' : 'حقوقی و بازدید (۴)' },
            { id: 'urban' as const, label: isEn ? 'Urban & Swap (4)' : 'ساخت و تهاتر (۴)' },
          ].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveCat(tab.id)} className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition cursor-pointer ${activeCat === tab.id ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {showEmbeddedLab && (
        <div ref={labContainerRef} className="rounded-2xl border-2 border-indigo-500/40 p-4 bg-indigo-50/20 dark:bg-indigo-950/20 space-y-3 scroll-mt-20">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
              <Compass className="w-4 h-4 text-indigo-600" />
              <span>محیط تعاملی آزمایشگاه تصمیم‌یار و نظریه بازی‌های کسپر (CASPER Decision Lab)</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowEmbeddedLab(false)}
              className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white px-2 py-1 rounded-md bg-white dark:bg-slate-800 border cursor-pointer"
            >
              بستن پنل آزمایشگاه ✕
            </button>
          </div>
          <Stage2MasterWidget
            hoodId={p.selectedHood.id}
            hoodName={p.selectedHood.name}
            cityId={p.activeCity || 'tehran'}
            basePriceSqm={p.selectedHood.buyPerSqm}
            intlCurrency={intlCurrency}
            hood={p.selectedHood}
            initialTab={activeDecisionTab}
            onTabChange={(tab) => setActiveDecisionTab(tab)}
            onSelectCompareHood={(targetName) => {
              const match = p.evaluatedNeighborhoods?.find((h) => h.name === targetName);
              if (match) p.onSelectNeighborhood?.(match);
            }}
          />
        </div>
      )}

      <div className="space-y-8">
        {filteredCategories.map((cat) => (
          <section key={cat.id} className="space-y-3.5">
            <h2 className="text-xs font-bold text-slate-400 flex items-center gap-2 uppercase tracking-wider">
              <span>{cat.category}</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cat.items.map((tool) => {
                const IconC = tool.icon;
                return (
                  <button key={tool.id} type="button" onClick={tool.action} className="p-5 rounded-2xl text-start w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-600 dark:hover:border-emerald-400 hover:shadow-md transition cursor-pointer flex items-start gap-4 group focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none">
                    <span className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 group-hover:bg-emerald-600 group-hover:text-white dark:group-hover:bg-emerald-500 dark:group-hover:text-slate-950 transition shrink-0">
                      <IconC className="w-5 h-5 stroke-[2]" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h3 className="font-extrabold text-slate-900 dark:text-white text-sm transition truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400">{tool.title}</h3>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-[-2px] group-hover:text-emerald-600 transition shrink-0" />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{tool.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * @file src/features/tools/services/toolsCatalogEngine.ts
 * @description Stages 194–197: Static tool catalog descriptors, dynamic counts, dev-only UI Lab guard,
 * targetSqm sanitization, and Contract-Room Shield initial price & input validation helpers.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Activity, ArrowLeftRight, Award, Briefcase, Building2, Calculator, ClipboardCheck,
  Coins, Compass, FileCheck, GraduationCap, Hammer, Hourglass, Network, PieChart,
  Scale, Share2, ShieldAlert, Sparkles, Split, Wallet,
} from 'lucide-react';
import type { Stage2ActiveTab } from '../../../components/stage2/Stage2MasterWidget';
import type { ExpansionModalType } from '../../../components/ExpansionModulesModal';
import type { SuperModuleTabId } from '../../../components/FutureSuperModulesModal';
import { validateSqmAmount } from '../../../utils/security';
import { normalizeDigitsToAscii } from '../../../utils/forms/formInputHelpers';

export type ToolCategoryId = 'decision' | 'financial' | 'legal' | 'urban';

export type ToolDispatchTarget =
  | { kind: 'decision'; tab: Stage2ActiveTab }
  | { kind: 'verifier' }
  | { kind: 'contract_shield' }
  | { kind: 'hedonic' }
  | { kind: 'reverse_budget' }
  | { kind: 'compare' }
  | { kind: 'expansion'; modal: ExpansionModalType }
  | { kind: 'super'; tab: SuperModuleTabId };

export interface StaticToolDescriptor {
  id: string;
  title: string;
  baseDesc: string;
  hoodDescTemplate?: (hoodName: string) => string;
  icon: LucideIcon;
  target: ToolDispatchTarget;
  hidden?: boolean;
  experimental?: boolean;
}

export interface StaticToolCategory {
  id: ToolCategoryId;
  categoryFa: string;
  categoryEn: string;
  items: ReadonlyArray<StaticToolDescriptor>;
}

export interface BuiltToolItem {
  id: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  target: ToolDispatchTarget;
}

export interface BuiltToolCategory {
  id: ToolCategoryId;
  category: string;
  items: BuiltToolItem[];
}

export interface ToolCategoryCounts {
  total: number;
  byCategory: Record<ToolCategoryId, number>;
}

export const CONTRACT_SHIELD_MIN_MILLION = 500;
export const CONTRACT_SHIELD_MAX_MILLION = 2_000_000;
export const DEFAULT_CONTRACT_TARGET_SQM = 80;
export const DEFAULT_CONTRACT_FALLBACK_MILLION = 12_000;

export const STATIC_TOOL_CATEGORIES: ReadonlyArray<StaticToolCategory> = [
  {
    id: 'decision',
    categoryEn: 'Smart Deal Readiness & Market Risk',
    categoryFa: 'تصمیم‌یار خرید، چانه‌زنی و سنجش ریسک بازار',
    items: [
      { id: 'casper_decision_synthesis', title: 'خلاصه تصمیم خرید، سقف قیمت و راهنمای چانه‌زنی (Executive Deal Readiness)', baseDesc: 'حکم نهایی ورود به معامله، ارزیابی ۶ شاخص کلیدی، تعیین سقف ترک جلسه و پیشنهاد قیمت شروع مذاکره', icon: Award, target: { kind: 'decision', tab: 'DECISION_SYNTHESIS' } },
      { id: 'casper_regret', title: 'مقایسه محله‌های جایگزین و کمترین ریسک پشیمانی (Savage Minimax Regret)', baseDesc: 'شبیه‌سازی ارزش ۳ ساله دارایی در ۳ وضعیت جهش ارزی، رکود تورمی و ثبات', hoodDescTemplate: (h) => `شبیه‌سازی ارزش ۳ ساله دارایی در ۳ وضعیت جهش ارزی، رکود تورمی و ثبات در محله ${h}`, icon: Compass, target: { kind: 'decision', tab: 'PARETO_REGRET' } },
      { id: 'casper_lemon', title: 'تشخیص حباب آگهی‌ها و فرمول چانه‌زنی قیمت (Akerlof Lemon Index)', baseDesc: 'سنجش ریسک آگهی‌های غیرواقعی یا طعمه و محاسبه تخفیف منطقی پای میز مذاکره (λ=۲٫۲۵)', icon: Network, target: { kind: 'decision', tab: 'SPATIAL_CONTAGION' } },
      { id: 'casper_real_options', title: 'بررسی زمان مناسب خرید و سرعت فروش ملک (Dixit-Pindyck Real Options)', baseDesc: 'مقایسه خرید فوری یا صبر کردن، تخمین مدت‌زمان فروش ملک و اثر دلار و طلا بر مسکن', icon: Hourglass, target: { kind: 'decision', tab: 'REAL_OPTIONS' } },
      { id: 'casper_urban_affordability', title: 'هزینه واقعی زندگی و رفت‌وآمد در محله (TCOH & Isochrone)', baseDesc: 'محاسبه نسبت قیمت به درآمد، هزینه اتلاف وقت در ترافیک، استهلاک خودرو و مقایسه با محله‌های نزدیک محل کار', icon: Briefcase, target: { kind: 'decision', tab: 'URBAN_AFFORDABILITY' } },
      { id: 'casper_monte_carlo', title: 'شبیه‌سازی ۱٬۰۰۰ حالت آینده قیمت و ریسک افت سرمایه (Merton VaR)', baseDesc: 'پیش‌بینی بازده واقعی ملک در برابر نوسان دلار و محاسبه حداکثر ریسک افت سرمایه با اطمینان ۹۵٪', icon: Activity, target: { kind: 'decision', tab: 'MONTE_CARLO_VAR' } },
      { id: 'casper_housing_cycle', title: 'تشخیص وضعیت فعلی بازار مسکن: رکود یا رونق؟ (Housing Cycle Radar)', baseDesc: 'شناسایی فاز فعلی بازار (رکود، رونق، اشباع یا کف قیمتی) همراه با پیشنهاد عملی برای خانه‌اولی‌ها و سرمایه‌گذاران', icon: PieChart, target: { kind: 'decision', tab: 'HOUSING_CYCLE' } },
      { id: 'casper_macro_portfolio', title: 'مقایسه سود مسکن با طلا، دلار و سود بانکی (Markowitz Portfolio & Gold Arbitrage)', baseDesc: 'پیشنهاد ترکیب بهینه سرمایه بین ملک، طلا، دلار و صندوق درآمد ثابت و بررسی به‌صرفه بودن تبدیل طلا به مسکن', icon: Wallet, target: { kind: 'decision', tab: 'MACRO_PORTFOLIO' } },
      { id: 'casper_rent_vs_buy', title: 'مقایسه دقیق «خرید خانه» یا «اجاره‌نشینی + سرمایه‌گذاری» (Rent vs. Buy NPV Arbitrage)', baseDesc: 'مقایسه مالی ۵ ساله بین خرید ملک یا اجاره‌نشینی و سرمایه‌گذاری الباقی پول با احتساب هزینه تعمیرات و استهلاک', icon: Split, target: { kind: 'decision', tab: 'RENT_VS_BUY' } },
    ],
  },
  {
    id: 'financial',
    categoryEn: 'Valuation & Financial Calculators',
    categoryFa: 'قیمت‌گذاری و ارزیابی مالی',
    items: [
      { id: 'deal_verifier', title: 'آنتی‌ویروس و کارشناسی فوری آگهی‌های دیوار (Deal Verifier)', baseDesc: 'الصاق متن یا لینک آگهی، کشف حباب قیمت، تله‌های سندی و سناریوی چانه‌زنی با مشاور املاک', icon: ShieldAlert, target: { kind: 'verifier' } },
      { id: 'hedonic', title: 'کارشناسی هوشمند ارزش ملک (Hedonic)', baseDesc: 'محاسبه ارزش منصفانه و قیمت فروش فوری واحد با در نظر گرفتن سن بنا، طبقه و امکانات', hoodDescTemplate: (h) => `محاسبه ارزش منصفانه و قیمت فروش فوری واحد در محله ${h} با در نظر گرفتن سن بنا، طبقه و امکانات`, icon: Calculator, target: { kind: 'hedonic' } },
      { id: 'reverse_budget', title: 'کاشف معکوس بودجه مسکن', baseDesc: '«با بودجه من کجای شهر می‌توانم خانه بخرم؟» تطبیق فوری متراژ و قدرت خرید', icon: Sparkles, target: { kind: 'reverse_budget' } },
      { id: 'commission', title: 'ماشین‌حساب کمیسیون املاک و هزینه محضر', baseDesc: 'محاسبه دقیق حق‌الزحمه قانونی مشاور، ۹٪ ارزش افزوده و هزینه ثبت در دفترخانه اسناد رسمی', icon: Scale, target: { kind: 'expansion', modal: 'commission' } },
      { id: 'mortgage', title: 'شبیه‌ساز اوراق تسه، وام مسکن و خرید متری', baseDesc: 'محاسبه هزینه خرید برگه تسهیلات، اقساط ۱۲ ساله بانک مسکن و مدل سرمایه‌گذاری متری', icon: Building2, target: { kind: 'super', tab: 'mortgage' } },
      { id: 'tax_inheritance', title: 'محاسبه مالیات نقل‌وانتقال ۱۴۰۵، ارث و مهریه‌یار', baseDesc: 'فرمول ماده ۵۹ مالیات مستقیم، محاسبه سهم‌الارث طبقات، مالیات بر خانه‌های خالی و مهریه ملکی', icon: Coins, target: { kind: 'super', tab: 'tax_inheritance' } },
    ],
  },
  {
    id: 'legal',
    categoryEn: 'Legal Security & Contract Verification',
    categoryFa: 'امنیت حقوقی و راستی‌آزمایی قراردادها',
    items: [
      { id: 'contract_shield', title: 'سپر و دستیار زنده اتاق قرارداد (Contract-Room Shield)', baseDesc: 'تقویم امن چک‌ها (قرارداد/تحویل/سند)، وجه التزام متقارن روزانه و پاتک به شگردهای روانی مشاور', icon: Scale, target: { kind: 'contract_shield' } },
      { id: 'fake_ad', title: 'مچ‌گیر هوشمند آگهی‌های فیک و قیمت طعمه', baseDesc: 'تشخیص آگهی‌های غیرواقعی، راستی‌آزمایی تله‌های قیمتی و تولید سوالات کلیدی استعلام تلفنی', icon: ShieldAlert, target: { kind: 'super', tab: 'fake_detector' } },
      { id: 'contract', title: 'مشاور حقوقی هوشمند قولنامه و مبایعه‌نامه', baseDesc: 'بررسی بندهای حقوقی، شروط فسخ، خیارات غبن، نحوه پرداخت چک‌ها و جلوگیری از کلاهبرداری', icon: FileCheck, target: { kind: 'expansion', modal: 'contract' } },
      { id: 'tenant_rights', title: 'داور هوشمند روابط موجر و مستأجر', baseDesc: 'تفکیک قانونی هزینه‌های اساسی و جاری ساختمان، فرمول شارژ و تقویم حقوقی قرارداد', icon: Scale, target: { kind: 'super', tab: 'tenant_rights' } },
      { id: 'visit_checklist', title: 'چک‌لیست هوشمند کارشناسی بازدید و عیب‌یابی ملک', baseDesc: 'ماتریس ۵۰ نقطه‌ای بررسی نم و رطوبت، فشار آب، پارکینگ، تاسیسات موتورخانه و فرهنگ ساختمان', icon: ClipboardCheck, target: { kind: 'super', tab: 'visit_checklist' } },
    ],
  },
  {
    id: 'urban',
    categoryEn: 'Swap, Urban Zoning, Schools & Realtor Studio',
    categoryFa: 'معاوضه، ساخت، ضوابط شهری و سبک زندگی',
    items: [
      { id: 'swap', title: 'مرکز تهاتر ملک و مقایسه شهرهای حومه', baseDesc: 'موتور تطبیق معاوضه و ارزیابی اقتصادی شهرهای جدید اطراف کلان‌شهرها', icon: ArrowLeftRight, target: { kind: 'super', tab: 'swap_suburb' } },
      { id: 'municipality', title: 'دستیار ضوابط شهرداری، تراکم و بازسازی', baseDesc: 'محاسبه تراکم مجاز، درصد مشارکت در ساخت، جریمه ماده ۱۰۰ و برآورد هزینه نوسازی واحد', icon: Hammer, target: { kind: 'super', tab: 'municipality' } },
      { id: 'school_radar', title: 'رادار مدارس برتر، ایمنی گسل و سبک زندگی', baseDesc: 'فاصله تا پهنه‌های گسلی، کیفیت آموزشی مدارس اطراف و دسترسی معابر', icon: GraduationCap, target: { kind: 'super', tab: 'school_traffic' } },
      { id: 'realtor_studio', title: 'استودیو هوش مصنوعی آگهی‌نویسی و استوری ملکی', baseDesc: 'تولید متن جذاب و استاندارد برای دیوار و شیپور با فرمت استوری و بدون کلیشه‌های تکراری', icon: Share2, target: { kind: 'super', tab: 'realtor_studio' } },
    ],
  },
];

export function isRadarUiLabAvailable(isDevEnv = Boolean(import.meta.env?.DEV)): boolean {
  return isDevEnv === true;
}

export function formatToolDescriptionForHood(item: Pick<StaticToolDescriptor, 'baseDesc' | 'hoodDescTemplate'>, hoodName: string): string {
  const cleanName = hoodName.trim();
  if (item.hoodDescTemplate && cleanName) return item.hoodDescTemplate(cleanName);
  return item.baseDesc;
}

export function buildToolCategoriesForHood(params: {
  isEn: boolean;
  hoodName: string;
  categories?: ReadonlyArray<StaticToolCategory>;
  includeHidden?: boolean;
  includeExperimental?: boolean;
}): BuiltToolCategory[] {
  const source = params.categories ?? STATIC_TOOL_CATEGORIES;
  return source
    .map((cat) => {
      const visibleItems = cat.items
        .filter((it) => (params.includeHidden || !it.hidden) && (params.includeExperimental || !it.experimental))
        .map((it) => ({
          id: it.id,
          title: it.title,
          desc: formatToolDescriptionForHood(it, params.hoodName),
          icon: it.icon,
          target: it.target,
        }));
      return {
        id: cat.id,
        category: params.isEn ? cat.categoryEn : cat.categoryFa,
        items: visibleItems,
      };
    })
    .filter((cat) => cat.items.length > 0);
}

export function computeToolCategoryCounts(categories: ReadonlyArray<Pick<BuiltToolCategory, 'id' | 'items'>>): ToolCategoryCounts {
  const byCategory: Record<ToolCategoryId, number> = {
    decision: 0,
    financial: 0,
    legal: 0,
    urban: 0,
  };
  let total = 0;
  for (const cat of categories) {
    byCategory[cat.id] = cat.items.length;
    total += cat.items.length;
  }
  return { total, byCategory };
}

export function sanitizeContractTargetSqm(targetSqm: unknown, fallbackSqm = DEFAULT_CONTRACT_TARGET_SQM): number {
  if (typeof targetSqm !== 'number' || !Number.isFinite(targetSqm) || targetSqm <= 0) {
    return validateSqmAmount(fallbackSqm, DEFAULT_CONTRACT_TARGET_SQM);
  }
  return validateSqmAmount(targetSqm, DEFAULT_CONTRACT_TARGET_SQM);
}

export function calculateContractInitialTotalMillion(buyPerSqm: unknown, targetSqm: unknown): number {
  if (typeof buyPerSqm !== 'number' || !Number.isFinite(buyPerSqm) || buyPerSqm <= 0) {
    return DEFAULT_CONTRACT_FALLBACK_MILLION;
  }
  const safeSqm = sanitizeContractTargetSqm(targetSqm);
  const rawTotal = Math.round(buyPerSqm * safeSqm);
  return Math.max(CONTRACT_SHIELD_MIN_MILLION, Math.min(CONTRACT_SHIELD_MAX_MILLION, rawTotal));
}

export function validateContractTotalMillion(rawInput: string | number): {
  valid: boolean;
  value: number | null;
  errorFa: string | null;
} {
  const rawText = typeof rawInput === 'number' ? (Number.isFinite(rawInput) ? String(rawInput) : '') : String(rawInput ?? '').trim();
  const text = normalizeDigitsToAscii(rawText).replace(/[,٬\s_]/g, '');
  if (!text) {
    return { valid: false, value: null, errorFa: 'لطفاً مبلغ کل معامله را بر حسب میلیون تومان وارد کنید.' };
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return { valid: false, value: null, errorFa: 'مبلغ کل باید عدد صحیح معتبر بر حسب میلیون تومان باشد.' };
  }
  if (parsed < CONTRACT_SHIELD_MIN_MILLION) {
    return { valid: false, value: null, errorFa: `حداقل مبلغ مجاز معامله ${CONTRACT_SHIELD_MIN_MILLION.toLocaleString('fa-IR')} میلیون تومان است.` };
  }
  if (parsed > CONTRACT_SHIELD_MAX_MILLION) {
    return { valid: false, value: null, errorFa: `حداکثر مبلغ مجاز معامله ${CONTRACT_SHIELD_MAX_MILLION.toLocaleString('fa-IR')} میلیون تومان است.` };
  }
  return { valid: true, value: parsed, errorFa: null };
}

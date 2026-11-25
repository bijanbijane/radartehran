/** @file src/navigation/url/routePageMeta.ts — Pure Per-Route Document Title & Meta Description Resolver (F-05) */
import type { ModuleSubTabId, RouteDestinationId } from '../registry/route.types';

export interface RoutePageMetaInput {
  viewId: RouteDestinationId;
  subTab?: ModuleSubTabId;
  cityNameFa: string;
  brandFa: string;
  selectedHoodName?: string;
}

export interface ResolvedRoutePageMeta {
  title: string;
  description: string;
}

const MARKET_META_FA: Record<string, { title: string; desc: string }> = {
  overview: { title: 'نمای کلی و نبض بازار مسکن', desc: 'شاخص‌های کلان قیمت اعلامی و برآورد معامله، روندها و توزیع قیمت مسکن' },
  prices: { title: 'شاخص قیمت خرید آپارتمان', desc: 'تحلیل میانگین و میانه قیمت هر متر مربع خرید آپارتمان و فاصله از معامله' },
  rent: { title: 'تحلیل بازار رهن و اجاره', desc: 'بررسی نرخ رهن کامل، اجاره ماهانه و بازده اجاره‌داری در محله‌ها' },
  supply: { title: 'عرضه، موجودی و حجم آگهی‌ها', desc: 'پایش حجم عرضه معتبر، پالایش فایل‌های پرت و شدت رقابت بازار' },
  compare: { title: 'مقایسه شاخص‌های بازار مناطق', desc: 'مقایسه قیمت، عرضه و بازده میان مناطق و محله‌های شهر' },
  reports: { title: 'گزارش‌های دوره‌ای بازار مسکن', desc: 'گزارش‌های تحلیلی روند قیمت، چرخه بازار و شکاف معامله' },
};

const PROPERTIES_META_FA: Record<string, { title: string; desc: string }> = {
  all: { title: 'جست‌وجوی املاک و آگهی‌ها', desc: 'جست‌وجوی آگهی‌های خرید و رهن آپارتمان با برآورد منصفانه و مقایسه با میانگین محله' },
  buy: { title: 'آگهی‌های خرید و فروش آپارتمان', desc: 'فایل‌های فروش مسکونی با سنجش فاصله قیمت از میانگین محله' },
  rent: { title: 'آگهی‌های رهن و اجاره آپارتمان', desc: 'فایل‌های رهن کامل و اجاره ماهانه با تطبیق بودجه' },
  commercial: { title: 'املاک تجاری و مغازه', desc: 'آگهی‌های خرید و اجاره مغازه و واحد تجاری با تحلیل موقعیت' },
  office: { title: 'املاک اداری و دفتر کار', desc: 'آگهی‌های سند اداری و موقعیت اداری با دسترسی مترو و ترافیک' },
};

const TOOLS_META_FA: Record<string, { title: string; desc: string }> = {
  all: { title: 'ابزارها و محاسبه‌گرهای هوشمند مسکن', desc: 'ارزش‌گذاری هوشمند ملک، سنجش آگهی، بودجه‌سنج معکوس، مقایسه و محاسبه‌گرهای معامله' },
  valuation: { title: 'ارزش‌گذاری هدونیک ملک', desc: 'محاسبه دقیق ارزش منصفانه آپارتمان بر اساس محله، متراژ، سال ساخت و امکانات' },
  budget_fit: { title: 'بودجه‌سنج معکوس و کشف محله', desc: 'پیشنهاد بهترین محله‌ها و متراژ قابل خرید یا رهن متناسب با بودجه شما' },
  verifier: { title: 'سنجش سلامت و قیمت آگهی', desc: 'بررسی واقعی‌بودن قیمت آگهی، کشف حباب قیمتی و هشدار ریسک معامله' },
  compare_areas: { title: 'مقایسه تحلیلی دو محله', desc: 'مقایسه کنار هم دو محله بر اساس قیمت متری، رهن، مترو، هوا و ترافیک' },
  compare_props: { title: 'مقایسه کنار هم دو ملک', desc: 'مقایسه فنی و قیمتی دو واحد ملکی برای تصمیم‌گیری دقیق‌تر' },
  calculators: { title: 'محاسبه‌گرهای وام، کمیسیون و رهن', desc: 'محاسبه اقساط وام مسکن، کمیسیون مشاور املاک، تبدیل رهن به اجاره و هزینه‌های سند' },
};

const SERVICES_META_FA: Record<string, { title: string; desc: string }> = {
  all: { title: 'خدمات تخصصی مسکن و کارشناسی', desc: 'درخواست کارشناسی قیمت، بازدید حضوری، مشاوره حقوقی قرارداد و ارتباط با کارشناسان محله' },
  valuation: { title: 'کارشناسی رسمی قیمت و ارزش‌گذاری', desc: 'درخواست برآورد تخصصی قیمت ملک و بررسی انطباق با معاملات واقعی' },
  consulting: { title: 'مشاوره حقوقی و امنیت قرارداد', desc: 'بررسی مبایعه‌نامه، چک‌ها، تعهدات سند و سپر اتاق قرارداد' },
  inspection: { title: 'کارشناسی فنی و بازدید حضوری ملک', desc: 'چک‌لیست ۵۰ نقطه‌ای بازدید، بررسی سازه، تأسیسات و ضوابط شهرداری' },
  agencies: { title: 'مشاوران و کارشناسان محله', desc: 'ارتباط با مشاوران و کارشناسان متخصص هر محله با سوابق شفاف' },
};

const COMMUNITY_META_FA: Record<string, { title: string; desc: string }> = {
  overview: { title: 'جامعه کاربران و مشارکت‌های محلی', desc: 'تجربه ساکنین، پرسش و پاسخ تخصصی و گزارش‌های میدانی محله‌ها' },
  discussions: { title: 'گفت‌وگوهای محلی ساکنین', desc: 'تبادل تجربه واقعی ساکنین و خریداران درباره محله‌ها و معاملات' },
  questions: { title: 'پرسش و پاسخ تخصصی مسکن', desc: 'طرح پرسش‌های حقوقی، فنی و قیمتی و دریافت پاسخ‌های منبع‌دار' },
  topics: { title: 'موضوعات تخصصی جامعه مسکن', desc: 'دسته‌بندی موضوعی بحث‌های حقوقی، شهری، مترو و بازار مسکن' },
  neighborhoods: { title: 'انجمن محله‌محور ساکنین', desc: 'گزارش‌ها و گفت‌وگوهای تفکیک‌شده بر اساس هر محله' },
  submit: { title: 'ثبت مشارکت و اصلاح داده بازار', desc: 'ارسال اصلاحیه نقشه، گزارش قیمت معامله و پالایش آگهی‌های پرت' },
  research: { title: 'پیشنهادهای پژوهشی و اولویت گزارش‌ها', desc: 'رأی‌گیری و پیشنهاد موضوعات پژوهشی جدید برای تحلیل بازار مسکن' },
  members: { title: 'اعضای جامعه و اعتبار چندمحوری', desc: 'آشنایی با مشارکت‌کنندگان فعال و سیستم اعتبارسنجی شفاف اعضا' },
  guidelines: { title: 'آیین‌نامه و قوانین جامعه کاربران', desc: 'اصول رفتار حرفه‌ای، معیارهای راستی‌آزمایی و حریم خصوصی در انجمن' },
};

const ACCOUNT_META_FA: Record<string, { title: string; desc: string }> = {
  overview: { title: 'داشبورد حساب کاربری من', desc: 'نمای یکپارچه علاقه‌مندی‌ها، جست‌وجوهای ذخیره‌شده، اعلان‌ها و فعالیت‌ها' },
  profile: { title: 'پروفایل و نقش‌های کاربری', desc: 'مدیریت نام نمایشی، نقش‌های فعال و تغییر نمای فضای کاری' },
  favorites: { title: 'محله‌ها و املاک ذخیره‌شده', desc: 'فهرست منتخب محله‌ها و آگهی‌های نشان‌شده برای پیگیری و مقایسه' },
  saved_searches: { title: 'جست‌وجوهای ذخیره‌شده', desc: 'مدیریت فیلترهای ذخیره‌شده خرید و رهن و اجرای سریع جست‌وجو' },
  saved_views: { title: 'نماهای ذخیره‌شده نقشه', desc: 'دسترسی سریع به کادرها و لایه‌های تحلیلی ذخیره‌شده روی نقشه' },
  activity: { title: 'بازدیدها و تاریخچه فعالیت', desc: 'یادداشت‌های بازدید میدانی و تاریخچه بررسی محله‌ها و آگهی‌ها' },
  contributions: { title: 'مشارکت‌ها و فایل‌های من', desc: 'پیگیری وضعیت آگهی‌های ثبت‌شده، اصلاحات داده و گزارش‌های ارسالی' },
  community: { title: 'تنظیمات و فعالیت جامعه من', desc: 'مدیریت موضوعات دنبال‌شده، پاسخ‌ها و امتیاز اعتبار در انجمن' },
  notifications: { title: 'اعلان‌ها و هشدارهای قیمت', desc: 'مرکز اعلان‌های تغییر قیمت، فایل‌های جدید زیر عرف و وضعیت درخواست‌ها' },
  settings: { title: 'تنظیمات، نمایش و حریم خصوصی', desc: 'تنظیمات زبان، واحد اندازه‌گیری، حریم خصوصی، نشست‌ها و خروجی داده' },
};

export function resolveRoutePageMeta(input: RoutePageMetaInput): ResolvedRoutePageMeta {
  const { viewId, subTab, cityNameFa, brandFa, selectedHoodName } = input;
  const hoodClause = selectedHoodName ? ` — محله ${selectedHoodName}` : '';

  switch (viewId) {
    case 'home':
      return {
        title: `${brandFa} | نقشه قیمت مسکن، محله‌ها و تحلیل بازار ${cityNameFa}`,
        description: `بررسی هوشمند قیمت خرید و رهن آپارتمان، کیفیت هوا، مترو و ارزیابی آگهی‌های مسکن در ${cityNameFa}.`,
      };
    case 'map':
      return {
        title: `نقشه تعاملی قیمت مسکن ${cityNameFa}${hoodClause} | ${brandFa}`,
        description: `نقشه هوشمند قیمت متری، رهن و اجاره، دسترسی مترو و شاخص کیفیت هوا در محله‌های ${cityNameFa}.`,
      };
    case 'discover':
      if (subTab === 'registry') {
        return {
          title: `مرجع جغرافیایی محله‌ها و تقسیمات ایران | ${brandFa}`,
          description: `فهرست رسمی محله‌های شهری، شهرها و استان‌های ایران در رجیستری جغرافیایی ${brandFa}.`,
        };
      }
      if (selectedHoodName) {
        return {
          title: `محله ${selectedHoodName} (${cityNameFa}) — قیمت مسکن، رهن و کارنامه | ${brandFa}`,
          description: `کارنامه کامل محله ${selectedHoodName} در ${cityNameFa}: قیمت خرید و رهن، دسترسی مترو، ترافیک، کیفیت هوا و تحلیل بازار.`,
        };
      }
      return {
        title: `محله‌های ${cityNameFa} و مقایسه قیمت مسکن | ${brandFa}`,
        description: `جست‌وجو، فیلتر و مقایسه کارنامه محله‌های ${cityNameFa} بر اساس قیمت خرید، رهن، مترو و کیفیت هوا.`,
      };
    case 'intelligence': {
      const m = MARKET_META_FA[subTab || 'overview'] || MARKET_META_FA.overview;
      return {
        title: `${m.title} ${cityNameFa} | ${brandFa}`,
        description: `${m.desc} در ${cityNameFa}.`,
      };
    }
    case 'properties': {
      const p = PROPERTIES_META_FA[subTab || 'all'] || PROPERTIES_META_FA.all;
      return {
        title: `${p.title} ${cityNameFa} | ${brandFa}`,
        description: `${p.desc} در ${cityNameFa}.`,
      };
    }
    case 'tools': {
      const t = TOOLS_META_FA[subTab || 'all'] || TOOLS_META_FA.all;
      return {
        title: `${t.title} | ${brandFa}`,
        description: `${t.desc} در ${brandFa}.`,
      };
    }
    case 'services': {
      const s = SERVICES_META_FA[subTab || 'all'] || SERVICES_META_FA.all;
      return {
        title: `${s.title} | ${brandFa}`,
        description: `${s.desc} در ${brandFa}.`,
      };
    }
    case 'knowledge':
      if (subTab === 'legal_privacy') {
        return {
          title: `حریم خصوصی و حفاظت از داده | ${brandFa}`,
          description: `سیاست حریم خصوصی، نحوه ذخیره‌سازی محلی تنظیمات و کنترل داده‌های کاربری در سامانه ${brandFa}.`,
        };
      }
      if (subTab === 'legal_terms') {
        return {
          title: `قوانین و شرایط استفاده | ${brandFa}`,
          description: `شرایط استفاده، ماهیت تحلیلی برآوردها و اصول مشارکت در سامانه شفافیت بازار مسکن ${brandFa}.`,
        };
      }
      if (subTab === 'guide') {
        return {
          title: `راهنمای خرید، رهن و کار با نقشه مسکن | ${brandFa}`,
          description: `راهنمای عملی برای شروع سریع بر اساس بودجه، خوانش نقشه قیمت‌ها و چک‌لیست ارزیابی آگهی در ${brandFa}.`,
        };
      }
      if (subTab === 'methodology') {
        return {
          title: `روش‌شناسی داده و برآورد قیمت مسکن | ${brandFa}`,
          description: `شفافیت آماری، حذف داده‌های پرت و نحوه محاسبه شاخص‌های اعلامی و هدونیک در ${brandFa}.`,
        };
      }
      if (subTab === 'glossary') {
        return {
          title: `واژه‌نامه تخصصی مسکن و معاملات | ${brandFa}`,
          description: `تعریف ساده و دقیق اصطلاحات بازار مسکن، رهن کامل، هدونیک، بافت فرسوده و قراردادها در ${brandFa}.`,
        };
      }
      return {
        title: `مرکز دانش، راهنما و روش‌شناسی مسکن | ${brandFa}`,
        description: `مقالات تحلیلی، راهنمای خرید و اجاره و شفافیت روش‌شناسی داده‌های بازار مسکن در ${brandFa}.`,
      };
    case 'contributions': {
      const c = COMMUNITY_META_FA[subTab || 'overview'] || COMMUNITY_META_FA.overview;
      return {
        title: `${c.title} | ${brandFa}`,
        description: `${c.desc} در ${cityNameFa}.`,
      };
    }
    case 'userspace': {
      const a = ACCOUNT_META_FA[subTab || 'overview'] || ACCOUNT_META_FA.overview;
      return {
        title: `${a.title} | ${brandFa}`,
        description: `${a.desc} در ${brandFa}.`,
      };
    }
    case 'admin':
      return {
        title: `مدیریت سامانه | ${brandFa}`,
        description: `کنسول مدیریت و پایش سامانه ${brandFa}.`,
      };
    default:
      return {
        title: `صفحه یافت نشد | ${brandFa}`,
        description: `مسیر درخواستی در سامانه ${brandFa} یافت نشد.`,
      };
  }
}

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
      return {
        title: `محله‌های ${cityNameFa} و مقایسه قیمت مسکن | ${brandFa}`,
        description: `جست‌وجو، فیلتر و مقایسه کارنامه محله‌های ${cityNameFa} بر اساس قیمت خرید، رهن، مترو و کیفیت هوا.`,
      };
    case 'intelligence':
      return {
        title: `تحلیل و نبض بازار مسکن ${cityNameFa} | ${brandFa}`,
        description: `شاخص‌های کلان قیمت اعلامی و برآورد معامله، روندها و توزیع قیمت مسکن در ${cityNameFa}.`,
      };
    case 'properties':
      return {
        title: `املاک و آگهی‌های ${cityNameFa} | ${brandFa}`,
        description: `جست‌وجوی آگهی‌های خرید و رهن آپارتمان در ${cityNameFa} با برآورد منصفانه و مقایسه با میانگین محله.`,
      };
    case 'tools':
      return {
        title: `ابزارها و محاسبه‌گرهای هوشمند مسکن | ${brandFa}`,
        description: `ارزش‌گذاری هوشمند ملک، بررسی صحت آگهی، بودجه‌سنج معکوس، محاسبه وام و سپر قرارداد در ${brandFa}.`,
      };
    case 'services':
      return {
        title: `خدمات تخصصی مسکن و کارشناسی | ${brandFa}`,
        description: `درخواست کارشناسی قیمت، بازدید حضوری، مشاوره حقوقی قرارداد و ارتباط با کارشناسان محله در ${brandFa}.`,
      };
    case 'knowledge':
      return {
        title: `مرکز دانش، راهنما و روش‌شناسی مسکن | ${brandFa}`,
        description: `مقالات تحلیلی، راهنمای خرید و اجاره و شفافیت روش‌شناسی داده‌های بازار مسکن در ${brandFa}.`,
      };
    case 'contributions':
      return {
        title: `جامعه کاربران و مشارکت‌های محلی | ${brandFa}`,
        description: `تجربه ساکنین، پرسش و پاسخ تخصصی و گزارش‌های میدانی محله‌های ${cityNameFa} در ${brandFa}.`,
      };
    case 'userspace':
      return {
        title: `حساب کاربری من | ${brandFa}`,
        description: `مدیریت محله‌های ذخیره‌شده، یادداشت‌های بازدید، اعلان‌ها و تنظیمات حساب کاربری در ${brandFa}.`,
      };
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

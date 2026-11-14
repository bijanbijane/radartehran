/** @file src/design-system/visualDirection.ts — RT-UI-VIS-001 Visual Direction Contracts (Pure TS, zero React) */
import type { RouteDestinationId } from '../navigation/registry/route.types';

export type VisualIdentityPillarId =
  | 'editorial_intelligence'
  | 'map_first_utility'
  | 'data_driven'
  | 'controlled_premium_discovery'
  | 'modular_enterprise';

export type SurfaceLevelId = 0 | 1 | 2 | 3;
export type DensityProfileId = 'low' | 'medium' | 'high';

export interface VisualIdentityPillar {
  id: VisualIdentityPillarId;
  nameEn: string;
  nameFa: string;
  roleFa: string;
}

export interface SurfaceLayerSpec {
  level: SurfaceLevelId;
  nameEn: string;
  nameFa: string;
  usageFa: string;
  elevationRule: string;
}

export interface DensityProfileSpec {
  id: DensityProfileId;
  nameFa: string;
  cardGapPx: number;
  cellPaddingPx: number;
  targetViews: readonly RouteDestinationId[];
}

export const RADAR_VISUAL_DIRECTION: readonly VisualIdentityPillar[] = [
  {
    id: 'editorial_intelligence',
    nameEn: 'Editorial Intelligence',
    nameFa: 'خوانایی تحلیلی و تیترگذاری خبری-دقیق',
    roleFa: 'متن تحلیلی و گزارش‌های بازار با فاصله تنفس کافی و سلسله‌مراتب تایپوگرافی دقیق',
  },
  {
    id: 'map_first_utility',
    nameEn: 'Map-first Utility',
    nameFa: 'کاربری فضایی و ابزارهای سریع نقشه',
    roleFa: 'کنترل‌های چابک روی نقشه بدون پوشاندن دید جغرافیایی و لایه‌های رنگی',
  },
  {
    id: 'data_driven',
    nameEn: 'Data-driven Clarity',
    nameFa: 'شفافیت آماری و ارقام هم‌تراز',
    roleFa: 'اعداد با tabular-nums، برچسب‌های معرفت‌شناختی دقیق و عدم تزئین غیرضروری',
  },
  {
    id: 'controlled_premium_discovery',
    nameEn: 'Controlled Premium Discovery',
    nameFa: 'کشف مدرن و کنترل‌شده ملک',
    roleFa: 'کارت‌های سبک و ساختارمند بدون شلوغی پلتفرم‌های آگهی تبلیغاتی',
  },
  {
    id: 'modular_enterprise',
    nameEn: 'Modular Enterprise Governance',
    nameFa: 'ماژولار بودن حرفه‌ای پنل عملیاتی',
    roleFa: 'تفکیک کامل پوسته عمومی از ساختار عملیاتی و جدول‌محور محیط مدیریت',
  },
] as const;

export const SURFACE_HIERARCHY: readonly SurfaceLayerSpec[] = [
  {
    level: 0,
    nameEn: 'Canvas Background',
    nameFa: 'سطح پایه صفحه و بوم نقشه',
    usageFa: 'پس‌زمینه کل سند و بوم جغرافیایی پایه',
    elevationRule: 'بدون سایه و بدون حاشیه',
  },
  {
    level: 1,
    nameEn: 'Content Section',
    nameFa: 'بخش‌های محتوایی جداشده با فاصله',
    usageFa: 'تفکیک با فضای خالی و خط نازک، بدون باکس کردن اجباری همه بلوک‌ها',
    elevationRule: 'خط جداکننده ظریف 1px یا فاصله S6–S8',
  },
  {
    level: 2,
    nameEn: 'Elevated Container / Card',
    nameFa: 'کارت‌ها، پنل کارنامه و ابزارهای انتخاب‌شده',
    usageFa: 'کانتینرهای ضروری حاوی شاخص یا اقدام کاربری',
    elevationRule: 'مرز ظریف 1px یا سایه ملایم — پرهیز از ترکیب همزمان کادر ضخیم و سایه سنگین',
  },
  {
    level: 3,
    nameEn: 'Floating Popover / Overlay',
    nameFa: 'منوها، فیلترهای شناور نقشه و مودال‌ها',
    usageFa: 'سطوح موقت روی محتوا یا نقشه',
    elevationRule: 'پس‌زمینه نیمه‌مات کنترل‌شده، حاشیه دقیق و z-index سلسله‌مراتبی',
  },
] as const;

export const CONTROLLED_GEOMETRY_TOKENS = {
  controlRadiusPx: 8,
  cardRadiusPx: 12,
  panelRadiusPx: 16,
  strictBorderWidthPx: 1,
  forbidUniformPillButtons: true,
} as const;

export const DENSITY_PROFILES: readonly DensityProfileSpec[] = [
  {
    id: 'low',
    nameFa: 'تراکم کم (محتوایی و خواندنی)',
    cardGapPx: 24,
    cellPaddingPx: 20,
    targetViews: ['knowledge', 'services', 'contributions', 'not_found'],
  },
  {
    id: 'medium',
    nameFa: 'تراکم متعادل (اکتشاف، نقشه و املاک)',
    cardGapPx: 16,
    cellPaddingPx: 16,
    targetViews: ['home', 'map', 'discover', 'properties', 'tools', 'userspace'],
  },
  {
    id: 'high',
    nameFa: 'تراکم بالا (داده‌محور و عملیاتی)',
    cardGapPx: 12,
    cellPaddingPx: 12,
    targetViews: ['intelligence', 'admin'],
  },
] as const;

export const VISUAL_DIRECTION_ACCEPTANCE_CRITERIA: readonly { id: string; titleFa: string }[] = [
  { id: 'VIS-01', titleFa: 'جهت بصری کل محصول با عنوان Editorial × Map-first × Data-driven تثبیت شده باشد' },
  { id: 'VIS-02', titleFa: 'نقشه از UI جدا باشد و شلوغی رابط کاربری دید جغرافیایی را خراب نکند' },
  { id: 'VIS-03', titleFa: 'رابط کاربری حالت شیشه‌ای افراطی یا گرادیانت نمایشی نداشته باشد' },
  { id: 'VIS-04', titleFa: 'تمامی بخش‌ها از قانون ۴ سطح پس‌زمینه و کانتینر (Level 0 تا 3) تبعیت کنند' },
  { id: 'VIS-05', titleFa: 'تایپوگرافی دقیق فارسی، فاصله‌گذاری مناسب تیترها و هم‌ترازی عددی tabular-nums رعایت شود' },
  { id: 'VIS-06', titleFa: 'رنگ نقشه، رنگ داده و رنگ وضعیت‌های تاییدی/هشدار با هم تداخل معنایی نداشته باشند' },
  { id: 'VIS-07', titleFa: 'در چگالی کارت‌ها، استفاده از باکس‌های تودرتو و برچسب‌های اضافه حذف شده باشد' },
  { id: 'VIS-08', titleFa: 'سقف خوانایی محتوای تحلیلی با تراکم Low/Medium/High متناسب هر صفحه تعریف شده باشد' },
  { id: 'VIS-09', titleFa: 'آیکون‌های رابط کاربری سبک یکدست (Outline Lucide) و بدون ایموجی تزئینی درون دکمه‌ها باشند' },
  { id: 'VIS-10', titleFa: 'تمامی کارت‌ها و کنترل‌ها از هندسه متناسب و ملایم (Controlled Soft Geometry) پیروی کنند' },
  { id: 'VIS-11', titleFa: 'مقایسه بین دو محله و داده‌ها بدون شلوغ‌کاری جدولی خوانا باشد' },
  { id: 'VIS-12', titleFa: 'کاربر با نگاه اول تمایز بین قیمت اعلامی و سناریوی تخمینی v6.4 را تشخیص دهد' },
  { id: 'VIS-13', titleFa: 'فیلترها و ابزارهای روی نقشه تنها در صورت نیاز باز شده و حاشیه نقشه را اشغال نکنند' },
  { id: 'VIS-14', titleFa: 'حالت تاریک و روشن کنتراست استاندارد WCAG را در متون و برچسب‌های روی نقشه حفظ کند' },
  { id: 'VIS-15', titleFa: 'هویت بصری محیط عمومی از ساختار عملیاتی و جدول‌محور پنل مدیریت متمایز بماند' },
] as const;

export function resolveDensityProfileForView(viewId: RouteDestinationId): DensityProfileSpec {
  return (
    DENSITY_PROFILES.find((p) => p.targetViews.includes(viewId)) ||
    DENSITY_PROFILES.find((p) => p.id === 'medium')!
  );
}

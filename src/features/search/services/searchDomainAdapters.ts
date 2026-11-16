/**
 * RT-UI-SEARCH-001 | Multi-Domain Search Source Adapters & Canonical Index Documents
 * 6 Independent Domain Adapters with Visibility, Multi-City & Location Precision Enforcement
 */

import { MULTI_CITY_CONFIGS, type CityId } from '../../../data/multiCityData';
import { LocationPrecision, SearchDocument, SearchRankingPolicy, SearchScope } from '../models/search.types';
import { extractValidDistrictNumber } from './searchNormalizerAndPlanner';

export const DEFAULT_RANKING_POLICIES: Record<SearchScope, SearchRankingPolicy> = {
  ALL: { version: 'v27.1.0-global', scope: 'ALL', weights: { textualRelevance: 0.32, exactEntityMatch: 0.24, spatialProximity: 0.12, freshness: 0.10, qualityAndVerification: 0.12, structuredFilterMatch: 0.10 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  PROPERTIES: { version: 'v27.1.0-properties', scope: 'PROPERTIES', weights: { textualRelevance: 0.22, exactEntityMatch: 0.18, spatialProximity: 0.18, freshness: 0.14, qualityAndVerification: 0.12, structuredFilterMatch: 0.16 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  LISTINGS: { version: 'v27.1.0-listings', scope: 'LISTINGS', weights: { textualRelevance: 0.22, exactEntityMatch: 0.18, spatialProximity: 0.16, freshness: 0.18, qualityAndVerification: 0.10, structuredFilterMatch: 0.16 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  NEIGHBORHOODS: { version: 'v27.1.0-neighborhoods', scope: 'NEIGHBORHOODS', weights: { textualRelevance: 0.30, exactEntityMatch: 0.35, spatialProximity: 0.15, freshness: 0.05, qualityAndVerification: 0.10, structuredFilterMatch: 0.05 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  MARKET: { version: 'v27.1.0-market', scope: 'MARKET', weights: { textualRelevance: 0.28, exactEntityMatch: 0.26, spatialProximity: 0.10, freshness: 0.18, qualityAndVerification: 0.12, structuredFilterMatch: 0.06 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  VALUATION: { version: 'v27.1.0-valuation', scope: 'VALUATION', weights: { textualRelevance: 0.30, exactEntityMatch: 0.25, spatialProximity: 0.10, freshness: 0.10, qualityAndVerification: 0.15, structuredFilterMatch: 0.10 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  SERVICES: { version: 'v27.1.0-services', scope: 'SERVICES', weights: { textualRelevance: 0.26, exactEntityMatch: 0.20, spatialProximity: 0.16, freshness: 0.08, qualityAndVerification: 0.22, structuredFilterMatch: 0.08 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  PROVIDERS: { version: 'v27.1.0-providers', scope: 'PROVIDERS', weights: { textualRelevance: 0.24, exactEntityMatch: 0.20, spatialProximity: 0.18, freshness: 0.08, qualityAndVerification: 0.24, structuredFilterMatch: 0.06 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  KNOWLEDGE: { version: 'v27.1.0-knowledge', scope: 'KNOWLEDGE', weights: { textualRelevance: 0.34, exactEntityMatch: 0.24, spatialProximity: 0.06, freshness: 0.12, qualityAndVerification: 0.18, structuredFilterMatch: 0.06 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  COMMUNITY: { version: 'v27.1.0-community', scope: 'COMMUNITY', weights: { textualRelevance: 0.32, exactEntityMatch: 0.20, spatialProximity: 0.08, freshness: 0.14, qualityAndVerification: 0.20, structuredFilterMatch: 0.06 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  MAP: { version: 'v27.1.0-map', scope: 'MAP', weights: { textualRelevance: 0.20, exactEntityMatch: 0.20, spatialProximity: 0.35, freshness: 0.10, qualityAndVerification: 0.08, structuredFilterMatch: 0.07 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  ACCOUNT: { version: 'v27.1.0-account', scope: 'ACCOUNT', weights: { textualRelevance: 0.40, exactEntityMatch: 0.30, spatialProximity: 0.05, freshness: 0.15, qualityAndVerification: 0.05, structuredFilterMatch: 0.05 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
};

export const INITIAL_SEARCH_DOCUMENTS: SearchDocument[] = [
  {
    id: 'doc-prop-saadat-105', sourceId: 'prop-saadat-105', sourceVersion: 3, indexSchemaVersion: '1.0',
    entityType: 'LISTING', scope: 'PROPERTIES', cityId: 'tehran',
    titleFa: 'آپارتمان ۱۰۵ متری ۲خوابه نوساز در سعادت‌آباد (مروارید)',
    subtitleFa: 'منطقه ۲ تهران · سعادت‌آباد · ۲خوابه · پارکینگ و آسانسور · سند تک‌برگ',
    summaryFa: 'واحد مسکونی خوش‌نقشه با نورگیر جنوبی در سعادت‌آباد، دسترسی عالی به بلوار فرهنگ و بزرگراه یادگار امام.',
    urlPath: '/discover?city=tehran&hood=5', neighborhoodId: 'saadat-abad', neighborhoodName: 'سعادت‌آباد', districtNumber: 2,
    priceMillionToman: 14900, pricePerSqmMillionToman: 141.9, dealPricePerSqmMillionToman: 133.4, hedonicValuationPerSqmMillionToman: 136.0,
    areaSqm: 105, bedrooms: 2, buildingAgeYears: 1, transactionType: 'BUY', propertyType: 'APARTMENT',
    lat: 35.7812, lng: 51.3758, locationPrecision: 'APPROXIMATE', visibility: 'PUBLIC', verified: true,
    qualityScore: 94, popularityScore: 89, freshnessTimestamp: '2026-04-12T10:00:00Z',
    tags: ['آپارتمان', '۲خوابه', 'سعادت‌آباد', 'نوساز', 'خانه', 'خرید'],
  },
  {
    id: 'doc-prop-record-saadat-parcel', sourceId: 'parcel-saadat-204', sourceVersion: 2, indexSchemaVersion: '1.0',
    entityType: 'PROPERTY', scope: 'PROPERTIES', cityId: 'tehran',
    titleFa: 'پرونده ثبتی ساختمان مسکونی مروارید سعادت‌آباد (پلاک ثبتی ۲۰۴)',
    subtitleFa: 'پرونده پایه ملک (بدون آگهی فعال) · سعادت‌آباد · منطقه ۲ · ۵ طبقه ۲ واحدی',
    summaryFa: 'اطلاعات کالبدی، سال ساخت، اسکلت بتنی و سابقه ارزش‌گذاری هدونیک ساختمان مروارید در سعادت‌آباد.',
    urlPath: '/valuation?city=tehran&hood=5', neighborhoodId: 'saadat-abad', neighborhoodName: 'سعادت‌آباد', districtNumber: 2,
    priceMillionToman: 14200, pricePerSqmMillionToman: 135.2, dealPricePerSqmMillionToman: 131.0, hedonicValuationPerSqmMillionToman: 134.5,
    areaSqm: 105, bedrooms: 2, buildingAgeYears: 3, transactionType: 'BUY', propertyType: 'APARTMENT',
    lat: 35.7825, lng: 51.3741, locationPrecision: 'NEIGHBORHOOD_BOUNDARY', visibility: 'PUBLIC', verified: true,
    qualityScore: 91, popularityScore: 78, freshnessTimestamp: '2026-04-10T09:00:00Z',
    tags: ['پرونده ملک', 'آپارتمان', 'سعادت‌آباد', '۲خوابه', 'خانه'],
  },
  {
    id: 'doc-prop-punak-88', sourceId: 'prop-punak-88', sourceVersion: 1, indexSchemaVersion: '1.0',
    entityType: 'LISTING', scope: 'PROPERTIES', cityId: 'tehran',
    titleFa: 'آپارتمان ۸۸ متری ۲خوابه در پونک (زیر ۱۰ میلیارد)',
    subtitleFa: 'منطقه ۵ تهران · پونک · ۲خوابه · فول امکانات · مناسب سرمایه‌گذاری',
    summaryFa: 'واحد ۸۸ متری خوش‌نقشه در اشرفی اصفهانی پونک با نقدشوندگی بالا و قیمت رقابتی نسبت به میانگین منطقه ۵.',
    urlPath: '/discover?city=tehran&hood=13', neighborhoodId: 'punak', neighborhoodName: 'پونک', districtNumber: 5,
    priceMillionToman: 8950, pricePerSqmMillionToman: 101.7, dealPricePerSqmMillionToman: 96.2, hedonicValuationPerSqmMillionToman: 98.0,
    areaSqm: 88, bedrooms: 2, buildingAgeYears: 6, transactionType: 'BUY', propertyType: 'APARTMENT',
    lat: 35.7631, lng: 51.3315, locationPrecision: 'APPROXIMATE', visibility: 'PUBLIC', verified: true,
    qualityScore: 90, popularityScore: 92, freshnessTimestamp: '2026-04-12T12:00:00Z',
    tags: ['آپارتمان', '۲خوابه', 'پونک', 'منطقه ۵', 'خانه', 'خرید'],
  },
  {
    id: 'doc-prop-vanak-office-120', sourceId: 'prop-vanak-office-120', sourceVersion: 2, indexSchemaVersion: '1.0',
    entityType: 'LISTING', scope: 'PROPERTIES', cityId: 'tehran',
    titleFa: 'واحد اداری ۱۲۰ متری سند اداری در میدان ونک (ملاصدرا)',
    subtitleFa: 'منطقه ۳ تهران · ونک · سند اداری رسمی · ۲ پارکینگ سندی · رهن کامل یا فروش',
    summaryFa: 'دفتر کار رسمی با زیرساخت شبکه، اتاق کنفرانس و دسترسی مستقیم به مترو و پایانه ونک.',
    urlPath: '/discover?city=tehran&hood=7', neighborhoodId: 'vanak', neighborhoodName: 'ونک', districtNumber: 3,
    priceMillionToman: 21600, pricePerSqmMillionToman: 180.0, dealPricePerSqmMillionToman: 171.0, hedonicValuationPerSqmMillionToman: 174.0,
    areaSqm: 120, bedrooms: 3, buildingAgeYears: 4, transactionType: 'FULL_MORTGAGE', propertyType: 'OFFICE',
    lat: 35.7575, lng: 51.4099, locationPrecision: 'APPROXIMATE', visibility: 'PUBLIC', verified: true,
    qualityScore: 89, popularityScore: 84, freshnessTimestamp: '2026-04-11T15:00:00Z',
    tags: ['اداری', 'دفتر کار', 'ونک', 'رهن کامل', 'منطقه ۳'],
  },
  {
    id: 'doc-prop-tehranpars-kolangi', sourceId: 'prop-tehranpars-kolangi', sourceVersion: 1, indexSchemaVersion: '1.0',
    entityType: 'LISTING', scope: 'PROPERTIES', cityId: 'tehran',
    titleFa: 'ملک کلنگی ۲۴۰ متری بر ۱۰ شمالی در تهران‌پارس شرقی',
    subtitleFa: 'منطقه ۴ تهران · تهران‌پارس · پهنه R122 · مناسب ساخت و مشارکت',
    summaryFa: 'ملک تخریبی و کلنگی با دستور نقشه ۵ طبقه مسکونی در فلکه اول تهران‌پارس.',
    urlPath: '/discover?city=tehran&hood=11', neighborhoodId: 'tehranpars', neighborhoodName: 'تهران‌پارس', districtNumber: 4,
    priceMillionToman: 28500, pricePerSqmMillionToman: 118.7, dealPricePerSqmMillionToman: 112.0, hedonicValuationPerSqmMillionToman: 115.0,
    areaSqm: 240, bedrooms: 3, buildingAgeYears: 28, transactionType: 'BUY', propertyType: 'OLD_HOUSE',
    lat: 35.7362, lng: 51.5291, locationPrecision: 'APPROXIMATE', visibility: 'PUBLIC', verified: true,
    qualityScore: 86, popularityScore: 81, freshnessTimestamp: '2026-04-09T11:00:00Z',
    tags: ['کلنگی', 'ملک تخریبی', 'مناسب ساخت', 'تهران‌پارس', 'منطقه ۴'],
  },
  {
    id: 'doc-hood-saadat-abad', sourceId: 'hood-saadat-abad', sourceVersion: 4, indexSchemaVersion: '1.0',
    entityType: 'NEIGHBORHOOD', scope: 'NEIGHBORHOODS', cityId: 'tehran',
    titleFa: 'شناسنامه جامع محله سعادت‌آباد (منطقه ۲ تهران)',
    subtitleFa: 'منطقه ۲ تهران · شاخص نقدشوندگی ۸۸/۱۰۰ · میانگین قیمت ۱۴۲ میلیون/مترمربع',
    summaryFa: 'بررسی کامل بافت شهری، دسترسی بزرگراهی، مراکز درمانی، مدارس، ریسک لرزه‌ای و روند قیمت آپارتمان در سعادت‌آباد.',
    urlPath: '/discover?city=tehran&hood=5', neighborhoodId: 'saadat-abad', neighborhoodName: 'سعادت‌آباد', districtNumber: 2,
    pricePerSqmMillionToman: 142.0, dealPricePerSqmMillionToman: 133.5, hedonicValuationPerSqmMillionToman: 136.0,
    lat: 35.7819, lng: 51.3749, locationPrecision: 'NEIGHBORHOOD_BOUNDARY', visibility: 'PUBLIC', verified: true,
    qualityScore: 98, popularityScore: 96, freshnessTimestamp: '2026-04-12T08:00:00Z',
    tags: ['محله سعادت‌آباد', 'سعادت‌آباد', 'منطقه ۲', 'شناسنامه محله', 'غرب تهران'],
  },
  {
    id: 'doc-hood-niavaran', sourceId: 'hood-niavaran', sourceVersion: 3, indexSchemaVersion: '1.0',
    entityType: 'NEIGHBORHOOD', scope: 'NEIGHBORHOODS', cityId: 'tehran',
    titleFa: 'شناسنامه جامع و تاریخچه محله نیاوران (منطقه ۱ تهران)',
    subtitleFa: 'منطقه ۱ تهران · شاخص کیفیت محیطی ۹۴/۱۰۰ · میانگین قیمت ۲۱۸ میلیون/مترمربع',
    summaryFa: 'تحلیل بافت تاریخی و باغ‌شهر نیاوران، شیب توپوگرافی، پهنه گسل شمال تهران و بازار املاک لوکس منطقه ۱.',
    urlPath: '/discover?city=tehran&hood=1', neighborhoodId: 'niavaran', neighborhoodName: 'نیاوران', districtNumber: 1,
    pricePerSqmMillionToman: 218.0, dealPricePerSqmMillionToman: 204.9, hedonicValuationPerSqmMillionToman: 210.0,
    lat: 35.8169, lng: 51.4712, locationPrecision: 'NEIGHBORHOOD_BOUNDARY', visibility: 'PUBLIC', verified: true,
    qualityScore: 97, popularityScore: 94, freshnessTimestamp: '2026-04-11T10:00:00Z',
    tags: ['نیاوران', 'محله نیاوران', 'تاریخچه محله نیاوران', 'منطقه ۱', 'شمال تهران'],
  },
  {
    id: 'doc-market-district-5', sourceId: 'mkt-district-5', sourceVersion: 5, indexSchemaVersion: '1.0',
    entityType: 'MARKET_INDEX', scope: 'MARKET', cityId: 'tehran',
    titleFa: 'میانگین قیمت آپارتمان و شاخص نقدشوندگی در منطقه ۵ تهران (پونک، جنت‌آباد، شهران)',
    subtitleFa: 'پایش بازار منطقه ۵ · قیمت پیشنهادی: ۹۸.۵ میلیون/مترمربع · قیمت معامله سناریویی: ۹۲.۶ میلیون/مترمربع',
    summaryFa: 'گزارش تحلیلی شکاف قیمت پیشنهادی و معامله، حجم تقاضای مصرفی ۲خوابه و بازده اجاره در محله‌های منطقه ۵.',
    urlPath: '/market-trends?city=tehran&district=5', neighborhoodId: 'punak', neighborhoodName: 'پونک', districtNumber: 5,
    pricePerSqmMillionToman: 98.5, dealPricePerSqmMillionToman: 92.6, hedonicValuationPerSqmMillionToman: 94.8,
    lat: 35.7580, lng: 51.3200, locationPrecision: 'DISTRICT_BOUNDARY', visibility: 'PUBLIC', verified: true,
    qualityScore: 96, popularityScore: 93, freshnessTimestamp: '2026-04-12T14:00:00Z',
    tags: ['میانگین قیمت آپارتمان در منطقه ۵', 'منطقه ۵', 'شاخص بازار', 'پونک', 'روند قیمت'],
  },
  {
    id: 'doc-valuation-engine-hedonic', sourceId: 'val-engine-hedonic', sourceVersion: 2, indexSchemaVersion: '1.0',
    entityType: 'VALUATION_TOOL', scope: 'VALUATION',
    titleFa: 'ابزار ارزش‌گذاری هدونیک و تخمین بازه منصفانه قیمت ملک در تهران',
    subtitleFa: 'موتور ارزش‌گذاری رادار · تفکیک قیمت پیشنهادی، معامله سناریویی و فروش سریع',
    summaryFa: 'برآورد ارزش ملک بر پایه متراژ، سن بنا، طبقه، امکانات، ضریب محله و نمونه‌های مقایسه‌ای با نمایش سطح اطمینان.',
    urlPath: '/valuation', locationPrecision: 'NONE', visibility: 'PUBLIC', verified: true,
    qualityScore: 99, popularityScore: 95, freshnessTimestamp: '2026-04-12T07:00:00Z',
    tags: ['ارزش‌گذاری', 'تخمین قیمت ملک', 'هدونیک', 'برآورد ارزش', 'فروش سریع'],
  },
  {
    id: 'doc-service-official-appraiser', sourceId: 'srv-official-appraiser-1', sourceVersion: 2, indexSchemaVersion: '1.0',
    entityType: 'SERVICE_PROVIDER', scope: 'SERVICES', cityId: 'tehran',
    titleFa: 'مهندس کسری بهرامی — کارشناس رسمی دادگستری و ارزیابی ملک (مناطق ۱ تا ۵)',
    subtitleFa: 'متخصص تاییدشده · پروانه کانون کارشناسان رسمی · پوشش خدماتی: مناطق ۱، ۲، ۳ و ۵ تهران',
    summaryFa: 'ارائه گزارش رسمی ارزیابی ملک، تعیین قدرالسهم، کارشناسی املاک کلنگی و داوری قراردادهای مشارکت در ساخت.',
    urlPath: '/services?category=valuation', neighborhoodId: 'saadat-abad', neighborhoodName: 'سعادت‌آباد', districtNumber: 2,
    lat: 35.7795, lng: 51.3802, locationPrecision: 'DISTRICT_BOUNDARY', visibility: 'PUBLIC', verified: true,
    qualityScore: 95, popularityScore: 91, freshnessTimestamp: '2026-04-11T16:00:00Z',
    tags: ['کارشناس رسمی ارزیابی ملک', 'کارشناس ارزیابی', 'کارشناس رسمی دادگستری', 'خدمات ملکی', 'سعادت‌آباد'],
  },
  {
    id: 'doc-knowledge-niavaran-history', sourceId: 'kb-niavaran-history', sourceVersion: 2, indexSchemaVersion: '1.0',
    entityType: 'ARTICLE', scope: 'KNOWLEDGE', cityId: 'tehran',
    titleFa: 'تاریخچه محله نیاوران و تحول کالبدی باغ‌شهرهای شمیران (۱۲۸۰ تا ۱۴۰۵)',
    subtitleFa: 'مرکز دانش و پژوهش رادار تهران · مطالعه شهری و تاریخی · منطقه ۱ تهران',
    summaryFa: 'بررسی روند شکل‌گیری هسته تاریخی نیاوران، قنات‌ها، باغ‌های ثبت‌شده و تاثیر بلندمرتبه‌سازی بر خرداقلیم شمال تهران.',
    urlPath: '/knowledge?slug=niavaran-urban-history', neighborhoodId: 'niavaran', neighborhoodName: 'نیاوران', districtNumber: 1,
    lat: 35.8170, lng: 51.4710, locationPrecision: 'NEIGHBORHOOD_BOUNDARY', visibility: 'PUBLIC', verified: true,
    qualityScore: 96, popularityScore: 89, freshnessTimestamp: '2026-04-08T10:00:00Z',
    tags: ['تاریخچه محله نیاوران', 'نیاوران', 'شمیران', 'دانشنامه محله', 'پژوهش شهری'],
  },
  {
    id: 'doc-community-mosha-deed-qa', sourceId: 'comm-qa-mosha-deed', sourceVersion: 3, indexSchemaVersion: '1.0',
    entityType: 'COMMUNITY_QUESTION', scope: 'COMMUNITY',
    titleFa: 'پرسش‌های کاربران درباره سند مشاع، تفکیک آپارتمان و ریسک‌های حقوقی معامله',
    subtitleFa: 'جامعه کاربران رادار تهران · ۱۸ پاسخ تخصصی (۳ پاسخ تاییدشده وکیل ملکی)',
    summaryFa: 'بررسی تجربه‌های واقعی خریداران و پاسخ متخصصان حقوقی درباره تفاوت سند شش‌دانگ تک‌برگ، سند مشاع و قولنامه‌ای.',
    urlPath: '/contributions?topic=mosha-deed', locationPrecision: 'NONE', visibility: 'PUBLIC', verified: true,
    qualityScore: 93, popularityScore: 90, freshnessTimestamp: '2026-04-12T09:30:00Z',
    tags: ['پرسش‌های کاربران درباره سند مشاع', 'سند مشاع', 'پرسش', 'حقوقی ملک', 'جامعه کاربران'],
  },
  {
    id: 'doc-private-owner-draft-999', sourceId: 'draft-owner-999', sourceVersion: 1, indexSchemaVersion: '1.0',
    entityType: 'SAVED_ITEM', scope: 'ACCOUNT',
    titleFa: 'یادداشت شخصی و پیش‌نویس ارزش‌گذاری محرمانه کاربر', subtitleFa: 'فضای شخصی کاربر · فقط قابل مشاهده برای مالک',
    summaryFa: 'این رکورد شخصی است و هرگز نباید در جست‌وجوی عمومی سایر کاربران ظاهر شود.',
    urlPath: '/account/saved-searches', locationPrecision: 'EXACT_AUTHORIZED', visibility: 'OWNER_ONLY', ownerUserId: 'usr-owner-1',
    verified: true, qualityScore: 80, popularityScore: 50, freshnessTimestamp: '2026-04-12T10:00:00Z', tags: ['محرمانه', 'پیش‌نویس شخصی'],
  },
  {
    id: 'doc-admin-internal-audit-log', sourceId: 'admin-audit-001', sourceVersion: 1, indexSchemaVersion: '1.0',
    entityType: 'METHODOLOGY', scope: 'KNOWLEDGE',
    titleFa: 'گزارش ممیزی امنیتی داخلی ادمین و لاگ تخلفات', subtitleFa: 'محدود به مدیران سیستم (ADMIN_ONLY)',
    summaryFa: 'مستند داخلی عملیات حاکمیت که نباید به کاربران عادی نمایش داده شود.',
    urlPath: '/admin/search', locationPrecision: 'NONE', visibility: 'ADMIN_ONLY',
    verified: true, qualityScore: 90, popularityScore: 40, freshnessTimestamp: '2026-04-12T10:00:00Z', tags: ['ممیزی امنیتی', 'ادمین'],
  },
  {
    id: 'doc-deleted-tombstone-listing', sourceId: 'prop-deleted-404', sourceVersion: 4, indexSchemaVersion: '1.0',
    entityType: 'LISTING', scope: 'PROPERTIES', cityId: 'tehran',
    titleFa: 'آگهی حذف‌شده آپارتمان در سعادت‌آباد', subtitleFa: 'حذف‌شده', summaryFa: 'این آگهی با Tombstone حذف شده است.',
    urlPath: '/discover', locationPrecision: 'NONE', visibility: 'DELETED',
    verified: false, qualityScore: 10, popularityScore: 10, freshnessTimestamp: '2026-04-01T00:00:00Z', tags: ['سعادت‌آباد', 'حذف‌شده'],
  },
];

export function buildMultiCitySearchDocuments(): SearchDocument[] {
  const docs: SearchDocument[] = [];
  const otherCities: CityId[] = ['karaj', 'mashhad', 'isfahan', 'shiraz'];
  for (const cityId of otherCities) {
    const cfg = MULTI_CITY_CONFIGS[cityId];
    for (const hood of cfg.neighborhoods.slice(0, 8)) {
      const district = extractValidDistrictNumber(hood.zone);
      const hoodKey = `${cityId}-${hood.id}`;
      const dealSqm = Number((hood.buyPerSqm * 0.94).toFixed(1));
      const hedonicSqm = Number((hood.buyPerSqm * 0.96).toFixed(1));
      docs.push({
        id: `doc-hood-${hoodKey}`, sourceId: `hood-${hoodKey}`, sourceVersion: 2, indexSchemaVersion: '1.0',
        entityType: 'NEIGHBORHOOD', scope: 'NEIGHBORHOODS', cityId,
        titleFa: `شناسنامه جامع محله ${hood.name} (${cfg.nameFa})`,
        subtitleFa: `${cfg.nameFa} · ${hood.zone.split('(')[0].trim()} · میانگین قیمت ${hood.buyPerSqm} میلیون/مترمربع`,
        summaryFa: hood.pros,
        urlPath: `/discover?city=${cityId}&hood=${hood.id}`,
        neighborhoodId: hoodKey, neighborhoodName: hood.name, ...(district !== undefined ? { districtNumber: district } : {}),
        pricePerSqmMillionToman: hood.buyPerSqm, dealPricePerSqmMillionToman: dealSqm, hedonicValuationPerSqmMillionToman: hedonicSqm,
        lat: hood.lat, lng: hood.lng, locationPrecision: 'NEIGHBORHOOD_BOUNDARY', visibility: 'PUBLIC', verified: true,
        qualityScore: 95, popularityScore: 90, freshnessTimestamp: '2026-04-12T10:00:00Z',
        tags: [hood.name, `محله ${hood.name}`, cfg.nameFa, 'شناسنامه محله', 'خرید', 'آپارتمان'],
      });
      const bargain = hood.bargains?.[0];
      const sqm = bargain?.sqm || 100;
      const totalMillion = Math.round(hood.buyPerSqm * sqm);
      docs.push({
        id: `doc-prop-${hoodKey}-1`, sourceId: `prop-${hoodKey}-1`, sourceVersion: 2, indexSchemaVersion: '1.0',
        entityType: 'LISTING', scope: 'PROPERTIES', cityId,
        titleFa: bargain?.title || `آپارتمان ${sqm} متری ۲خوابه در ${hood.name} (${cfg.nameFa})`,
        subtitleFa: `${cfg.nameFa} · ${hood.name} · ۲خوابه · پارکینگ و آسانسور`,
        summaryFa: `${bargain?.street || hood.name} — ${bargain?.buyerProfitText || hood.pros.slice(0, 90)}`,
        urlPath: `/discover?city=${cityId}&hood=${hood.id}`,
        neighborhoodId: hoodKey, neighborhoodName: hood.name, ...(district !== undefined ? { districtNumber: district } : {}),
        priceMillionToman: totalMillion, pricePerSqmMillionToman: hood.buyPerSqm, dealPricePerSqmMillionToman: dealSqm, hedonicValuationPerSqmMillionToman: hedonicSqm,
        areaSqm: sqm, bedrooms: 2, buildingAgeYears: 2, transactionType: 'BUY', propertyType: 'APARTMENT',
        lat: hood.lat, lng: hood.lng, locationPrecision: 'APPROXIMATE', visibility: 'PUBLIC', verified: true,
        qualityScore: 92, popularityScore: 88, freshnessTimestamp: '2026-04-12T11:00:00Z',
        tags: ['آپارتمان', '۲خوابه', hood.name, cfg.nameFa, 'نوساز', 'خانه', 'خرید'],
      });
    }
  }
  return docs;
}

export const ALL_CITY_SEARCH_DOCUMENTS: SearchDocument[] = [
  ...INITIAL_SEARCH_DOCUMENTS,
  ...buildMultiCitySearchDocuments(),
];

export function sanitizeDocumentLocationForCaller(
  doc: SearchDocument,
  caller: { userId?: string; isAdmin?: boolean }
): SearchDocument {
  if (doc.locationPrecision === 'EXACT_AUTHORIZED') {
    const isAuthorized = Boolean(caller.isAdmin || (caller.userId && doc.ownerUserId === caller.userId));
    if (!isAuthorized) {
      return {
        ...doc,
        lat: doc.lat ? Math.round(doc.lat * 100) / 100 : undefined,
        lng: doc.lng ? Math.round(doc.lng * 100) / 100 : undefined,
        locationPrecision: 'APPROXIMATE' as LocationPrecision,
      };
    }
  }
  return doc;
}

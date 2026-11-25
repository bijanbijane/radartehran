/** @fileoverview Layer 0 & Layer 1: Multi-City Expansion Dataset, Official Commission & Notary Calculator, and 10-Point Legal Checklist */
import { Neighborhood, INITIAL_NEIGHBORHOODS, WORK_HUBS } from './neighborhoods';
import { NORTH_AND_WEST_IRAN_NEIGHBORHOODS, EAST_AND_NORTHEAST_IRAN_NEIGHBORHOODS } from './iranNorthWestEastHoods';
import { CENTRAL_AND_ZAGROS_IRAN_NEIGHBORHOODS, SOUTH_AND_PERSIAN_GULF_IRAN_NEIGHBORHOODS } from './iranCentralSouthHoods'; import { KARAJ_ALBORZ_EXTENDED_NEIGHBORHOODS, MASHHAD_KHORASAN_EXTENDED_NEIGHBORHOODS, ISFAHAN_PROVINCE_EXTENDED_NEIGHBORHOODS, SHIRAZ_FARS_EXTENDED_NEIGHBORHOODS } from './metropolitanExtendedHoods'; import type { CityId, CityConfig } from '../types/models'; import { isValidCityId, isNeighborhood } from '../types/models'; import { clampNumber, createExecutionTimer, recordDiagnosticEvent } from '../utils/security'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit'; export type { CityId, CityConfig };
export const MULTI_CITY_CONFIGS: Record<CityId, CityConfig> = { tehran: { id: 'tehran', nameFa: 'تهران', center: [35.735, 51.395], defaultZoom: 12, neighborhoods: INITIAL_NEIGHBORHOODS, workHubs: WORK_HUBS, }, karaj: { id: 'karaj', nameFa: 'کرج', center: [35.8327, 50.9915], defaultZoom: 12, workHubs: [
      { id: 'none', name: 'بدون فیلتر محل کار', lat: null, lng: null }, { id: 'karaj_azadegan', name: 'میدان آزادگان / طالقانی', lat: 35.8350, lng: 50.9920 }, { id: 'karaj_jahanshahr', name: 'جهانشهر / شهدا', lat: 35.8230, lng: 50.9850 }, { id: 'karaj_mehrshahr', name: 'مهرشهر / گلشهر', lat: 35.8050, lng: 50.9250 }, { id: 'karaj_industrial', name: 'شهرک صنعتی بهارستان / سیمین‌دشت', lat: 35.8450, lng: 50.8800 }, ], neighborhoods: [
      { id: 101, name: 'عظیمیه', zone: 'شمال کرج (منطقه ۱ - میدان مهران، اسبی، کاج، گلستان، بعثت، بام کرج و طالقانی شمالی)', lat: 35.8442, lng: 51.0068, radius: 1100, buyPerSqm: 115, rahn80m: 1350, air: 8.8, powerWater: 8.9, internet: 8.7, metro: 6.2, security: 9.2, flatTerrain: 5.4, pros: 'هوای کوهستانی پاک بام کرج، سازه‌های برند و لوکس، بلوار شریعتی و اسبی (میدان مهران، میدان اسبی، بلوار کاج، گلستان، بعثت، طالقانی شمالی، نیک‌نژادی، پاسداران، پامچال، مریم و میدان بهارستان)', cons: 'شیب خیابان‌های شمالی و ترافیک آخر هفته میدان مهران و طالقانی', sponsor: { name: 'دپارتمان املاک رویال عظیمیه', phone: '026-32508810', specialty: 'آپارتمان‌های برند و پنت‌هاوس‌های میدان مهران، اسبی و گلستان', experienceYears: 16 }, trafficInfo: { liveStatus: 'تردد نیمه‌سنگین در بلوار شریعتی و میدان مهران', liveSeverity: 'semi', peakHours: '۱۸:۰۰ تا ۲۱:۰۰', seasonalAnalysis: 'ترافیک تفریحی پنجشنبه‌شب‌ها در محور بام کرج و جاده چالوس', bottlenecks: 'میدان طالقانی، میدان مهران، بلوار کاج', trafficScore: 7.2 }, bargains: [{ id: 'krj-az-1', title: '۱۱۵ متری ۲ خواب کلیدنخورده، فرعی دنج گلستان، سند تک‌برگ', type: 'خرید', sqm: 115, priceText: 'متری ۹۸ میلیون تومان (کل: ۱۱.۲۷ میلیارد)', discountPercent: 15, buyerProfitText: '۱.۹۵ میلیارد تومان زیر میانگین عظیمیه', street: 'عظیمیه، گلستان‌های مهران' }] },
      { id: 102, name: 'مهرشهر', zone: 'جنوب غرب کرج (منطقه ۴ و ۱۲ - چهارباندی، فاز ۱ تا ۴، بلوار ارم، کوی مهر، کاخ شمس و کیانمهر)', lat: 35.7885, lng: 50.9035, radius: 1300, buyPerSqm: 105, rahn80m: 1200, air: 9.3, powerWater: 8.6, internet: 8.5, metro: 6.8, security: 9.0, flatTerrain: 9.2, pros: 'باغ‌شهر سرسبز با چنارهای کهنسال، بلوار شهرداری (چهارباندی)، باغات سیب، آرامش بی‌نظیر (فاز ۱، ۲، ۳ و ۴ مهرشهر، خیابان‌های ۱۰۰ تا ۱۱۵، بلوار ارم، بلوار دانش، کوی مهر، کاخ مروارید، زنبق و کیانمهر)', cons: 'فاصله نسبتاً بیشتر تا مرکز اداری کرج', sponsor: { name: 'مسکن باغ‌شهر مهرشهر', phone: '026-33409211', specialty: 'فاز ۱، ۲ و ۳ مهرشهر، چهارباندی و کوی مهر', experienceYears: 19 }, trafficInfo: { liveStatus: 'تردد روان در فاز ۱ تا ۳ و بلوار شهرداری', liveSeverity: 'smooth', peakHours: '۱۸:۳۰ تا ۲۰:۳۰', seasonalAnalysis: 'آرام و روان در تمام فصول به جز شب‌های تعطیل در بلوار چهارباندی', bottlenecks: 'ورودی اتوبان تهران-کرج، بلوار ارم', trafficScore: 8.4 }, bargains: [{ id: 'krj-mhr-1', title: 'واحد ۱۲۰ متری رو به آفتاب در فاز ۱ مهرشهر، مشجر', type: 'خرید', sqm: 120, priceText: 'متری ۸۹ میلیون تومان (کل: ۱۰.۶۸ میلیارد)', discountPercent: 15, buyerProfitText: '۱.۹۲ میلیارد تومان سود خریدار نسبت به فاز ۱', street: 'مهرشهر، خیابان ۱۱۱ چهارباندی' }] },
      { id: 103, name: 'گوهردشت', zone: 'شمال غرب کرج (منطقه ۷ - رجایی‌شهر، فلکه اول تا سوم، رستاخیز، داریوش، انقلاب و موذن)', lat: 35.8548, lng: 50.9712, radius: 1150, buyPerSqm: 98, rahn80m: 1120, air: 8.5, powerWater: 8.8, internet: 9.0, metro: 7.4, security: 8.7, flatTerrain: 8.5, pros: 'خیابان‌بندی شطرنجی منظم فازهای ۱، ۲ و ۳، قطب تجاری و خرید کرج (رجایی‌شهر، فلکه اول تا سوم، بلوار رستاخیز، بلوار انقلاب، داریوش، بلوار موذن، خیابان آزادی، اشتراکی، باغستان و پارک نبوت)', cons: 'شلوغی خیابان اصلی آزادی (گوهردشت) در ساعات عصرگاهی', sponsor: { name: 'املاک بزرگ رستاخیز گوهردشت', phone: '026-34421050', specialty: 'آپارتمان‌های فاز ۱ و ۲ و بلوار رستاخیز و داریوش', experienceYears: 15 }, trafficInfo: { liveStatus: 'ترافیک نیمه‌سنگین در خیابان اصلی گوهردشت و فلکه اول', liveSeverity: 'semi', peakHours: '۱۷:۳۰ تا ۲۱:۰۰', seasonalAnalysis: 'پرتردد در ایام خرید آخر سال و عصرها', bottlenecks: 'فلکه اول گوهردشت، سه راه گوهردشت', trafficScore: 6.7 }, bargains: [{ id: 'krj-goh-1', title: '۹۵ متری ۲ خواب فاز ۲ گوهردشت، پارکینگ و انباری سندی', type: 'خرید', sqm: 95, priceText: 'متری ۸۳ میلیون تومان (کل: ۷.۸۸ میلیارد)', discountPercent: 15, buyerProfitText: '۱.۴۲ میلیارد تومان زیر قیمت میانگین گوهردشت', street: 'گوهردشت، خیابان پنجم فاز ۲' }] },
      { id: 104, name: 'جهانشهر', zone: 'مرکز اعیانی کرج (منطقه ۸ - باغ فاتح، بلوار مولانا، کسری، بهارستان، هلال احمر و استانداری)', lat: 35.8331, lng: 50.9854, radius: 1000, buyPerSqm: 112, rahn80m: 1300, air: 8.7, powerWater: 9.1, internet: 8.9, metro: 7.5, security: 9.3, flatTerrain: 8.8, pros: 'باغ فاتح و خیابان‌های سرسبز با چنارهای کهنسال، کلینیک‌های برتر، اصالت بالا (باغ فاتح، بلوار مولانا، کسری، بهارستان، میدان هلال احمر، میدان جمهوری، استانداری، حاجی‌آباد، بلوار ماه‌ان و چهارصد دستگاه)', cons: 'محدودیت پارک حاشیه‌ای در اطراف میدان هلال احمر و کسری', sponsor: { name: 'دپارتمان املاک کسری جهانشهر', phone: '026-34407720', specialty: 'بلوار مولانا، کسری، میدان هلال احمر و دور باغ فاتح', experienceYears: 18 }, trafficInfo: { liveStatus: 'تردد روان در بلوار مولانا و میدان جمهوری', liveSeverity: 'smooth', peakHours: '۱۷:۰۰ تا ۲۰:۰۰', seasonalAnalysis: 'متعادل در تمام طول سال', bottlenecks: 'بلوار طالقانی شمالی، میدان شهدا', trafficScore: 7.6 }, bargains: [{ id: 'krj-jah-1', title: '۱۰۰ متری نوساز، دید مستقیم باغ فاتح، لابی مجلل', type: 'خرید', sqm: 100, priceText: 'متری ۹۵ میلیون تومان (کل: ۹.۵ میلیارد)', discountPercent: 15, buyerProfitText: '۱.۷ میلیارد تومان زیر قیمت کارشناسی جهانشهر', street: 'جهانشهر، بلوار مولانا' }] },
      { id: 105, name: 'گلشهر', zone: 'غرب کرج (منطقه ۵ و ۶ - گلشهر ویلا، درختی، مهرویلا، ۴۵ متری گلزار، انوشیروان و دهقان‌ویلا)', lat: 35.8225, lng: 50.9355, radius: 1100, buyPerSqm: 72, rahn80m: 820, air: 8.0, powerWater: 8.4, internet: 8.6, metro: 9.4, security: 8.2, flatTerrain: 9.0, pros: 'دسترسی مستقیم به ایستگاه متروی گلشهر (خط ۵ تهران-کرج) و اتوبان، بلوار درختی، مهرویلا، ۴۵ متری گلزار، انوشیروان، پونه، کتویی‌زاده، دهقان‌ویلا اول و دوم، میانجاده و حصارک با قیمت اقتصادی', cons: 'تراکم جمعیتی بالاتر در برخی خیابان‌های شرقی', sponsor: { name: 'مسکن مترو گلشهر ویلا', phone: '026-33514400', specialty: 'درختی، مهرویلا، ۴۵ متری گلزار و گلشهر ویلا', experienceYears: 14 }, trafficInfo: { liveStatus: 'ترافیک نیمه‌سنگین اطراف ایستگاه مترو و ۴۵ متری گلزار', liveSeverity: 'semi', peakHours: '۰۷:۰۰ تا ۰۹:۰۰ و ۱۷:۳۰ تا ۲۰:۰۰', seasonalAnalysis: 'تردد بالای مسافران شاغل در تهران در ساعات صبح و عصر', bottlenecks: 'چهارراه گلزار، ورودی مترو گلشهر', trafficScore: 6.9 }, bargains: [{ id: 'krj-gol-1', title: '۸۵ متری ۲ خواب در خیابان درختی، ۵ دقیقه تا مترو', type: 'خرید', sqm: 85, priceText: 'متری ۶۱ میلیون تومان (کل: ۵.۱۸ میلیارد)', discountPercent: 15, buyerProfitText: '۹۳۵ میلیون تومان سود خرید زیر قیمت گلشهر', street: 'گلشهر، خیابان درختی' }] },
      { id: 106, name: 'فردیس', zone: 'جنوب کرج (شهرستان فردیس - فلکه اول تا پنجم، بلوار شهدا، قریشی، شهرک ناز و منظریه)', lat: 35.7246, lng: 50.9882, radius: 1200, buyPerSqm: 58, rahn80m: 680, air: 7.6, powerWater: 8.1, internet: 8.3, metro: 6.5, security: 8.0, flatTerrain: 9.3, pros: 'کانال و خیابان‌های فلکه اول تا پنجم تجاری و پررونق، بلوار شهدا، قریشی شمالی و جنوبی، شهرک ناز، منظریه، شهرک وحدت، خیابان سرحدی، مشکین‌دشت، خوشنام و بودجه خرید و رهن اقتصادی برای زوج‌های جوان', cons: 'شلوغی بلوار شهدای فردیس در ساعات پایانی شب', sponsor: { name: 'املاک مرکزی فلکه سوم فردیس', phone: '026-36503210', specialty: 'واحدهای وام‌دار و سنددار شاخه اصلی، قریشی و شهرک ناز', experienceYears: 12 }, trafficInfo: { liveStatus: 'ترافیک عصرگاهی در بلوار اصلی بین فلکه دوم تا پنجم', liveSeverity: 'semi', peakHours: '۱۸:۰۰ تا ۲۱:۳۰', seasonalAnalysis: 'پرتردد در شب‌های خرید', bottlenecks: 'پل فردیس، فلکه سوم', trafficScore: 6.5 }, bargains: [{ id: 'krj-far-1', title: '۷۵ متری وام‌دار در بلوار قریشی شمالی، نوساز', type: 'خرید', sqm: 75, priceText: 'متری ۴۹ میلیون تومان (کل: ۳.۶۷ میلیارد)', discountPercent: 16, buyerProfitText: '۶۷۵ میلیون تومان زیر میانگین فردیس', street: 'فردیس، بلوار قریشی شمالی' }] },
      ...KARAJ_ALBORZ_EXTENDED_NEIGHBORHOODS,
      ...NORTH_AND_WEST_IRAN_NEIGHBORHOODS,
    ],
  },
  mashhad: {
    id: 'mashhad',
    nameFa: 'مشهد',
    center: [36.2972, 59.6067],
    defaultZoom: 12,
    workHubs: [
      { id: 'none', name: 'بدون فیلتر محل کار', lat: null, lng: null },
      { id: 'mhd_sajjad', name: 'بلوار سجاد / آزادی', lat: 36.3200, lng: 59.5450 },
      { id: 'mhd_ahmadabad', name: 'احمدآباد / طالقانی', lat: 36.2950, lng: 59.5750 },
      { id: 'mhd_haram', name: 'حرم مطهر / مرکز شهر', lat: 36.2880, lng: 59.6150 },
      { id: 'mhd_industrial', name: 'شهرک صنعتی توس', lat: 36.4250, lng: 59.4350 },
    ],
    neighborhoods: [
      { id: 201, name: 'سجاد', zone: 'شمال غرب مشهد (منطقه ۱ - ملک‌آباد، بزرگمهر، حامد، بهارستان، امین، یاسمن و گلریز)', lat: 36.3208, lng: 59.5469, radius: 1150, buyPerSqm: 135, rahn80m: 1550, air: 8.6, powerWater: 9.2, internet: 9.1, metro: 8.4, security: 9.4, flatTerrain: 9.1, pros: 'لوکس‌ترین بلوار مسکونی و تجاری مشهد، خیابان‌های عریض بهارستان، حامد، بزرگمهر، امین، یاسمن، گلریز، نیلوفر، پامچال، چهارراه خیام، باغ ملک‌آباد و فلسطین با امنیت و پرستیژ ممتاز', cons: 'قیمت بالای خرید و رهن نسبت به میانگین مشهد', sponsor: { name: 'کارگزاری املاک vip سجاد', phone: '051-37624000', specialty: 'پنت‌هاوس و آپارتمان‌های برند حامد، بزرگمهر و بهارستان', experienceYears: 20 }, trafficInfo: { liveStatus: 'ترافیک نیمه‌سنگین در چهارراه خیام و بزرگمهر', liveSeverity: 'semi', peakHours: '۱۸:۰۰ تا ۲۱:۰۰', seasonalAnalysis: 'افزایش تردد در ایام تعطیلات تابستانی و نوروز', bottlenecks: 'چهارراه بزرگمهر، میدان آزادی', trafficScore: 7.4 }, bargains: [{ id: 'msh-saj-1', title: '۱۲۵ متری صفر کلیدنخورده در حامد جنوبی، متریال برند', type: 'خرید', sqm: 125, priceText: 'متری ۱۱۴ میلیون تومان (کل: ۱۴.۲۵ میلیارد)', discountPercent: 16, buyerProfitText: '۲.۶۲ میلیارد تومان زیر قیمت میانگین بلوار سجاد', street: 'مشهد، بلوار سجاد، حامد جنوبی' }] },
      { id: 202, name: 'وکیل‌آباد', zone: 'غرب مشهد (منطقه ۹ و ۱۱ - هاشمیه، هفت‌تیر، صیاد شیرازی، کوثر، هنرستان، اقبال و پیروزی)', lat: 36.3326, lng: 59.4981, radius: 1300, buyPerSqm: 108, rahn80m: 1250, air: 9.1, powerWater: 8.9, internet: 8.8, metro: 9.6, security: 9.0, flatTerrain: 8.7, pros: 'دسترسی سرتاسری به خط ۱ قطار شهری مشهد، هوای مطبوع ییلاقات طرقبه و شاندیز (بلوار وکیل‌آباد، هاشمیه، کوثر، هفت‌تیر، هنرستان، سامانیه، صیاد شیرازی، پیروزی، دانشجو، فارغ‌التحصیلان، دندانپزشکان، اقبال، باهنر و لادن)', cons: 'ترافیک ورودی پل نمایشگاه در روزهای تعطیل', sponsor: { name: 'مسکن سراسری هاشمیه و وکیل‌آباد', phone: '051-38819900', specialty: 'واحدهای هفت‌تیر، هاشمیه، هنرستان و صیاد شیرازی', experienceYears: 17 }, trafficInfo: { liveStatus: 'تردد روان در محور وکیل‌آباد با پوشش کامل قطار شهری', liveSeverity: 'smooth', peakHours: '۱۷:۳۰ تا ۲۰:۳۰', seasonalAnalysis: 'روان در طول هفته؛ شلوغ‌تر در مسیر طرقبه روزهای جمعه', bottlenecks: 'میدان آزادی، پل نمایشگاه', trafficScore: 8.2 }, bargains: [{ id: 'msh-vak-1', title: '۱۰۰ متری ۲ خواب در بلوار هفت‌تیر، ۳ دقیقه تا ایستگاه مترو', type: 'خرید', sqm: 100, priceText: 'متری ۹۲ میلیون تومان (کل: ۹.۲ میلیارد)', discountPercent: 15, buyerProfitText: '۱.۶ میلیارد تومان سود خرید زیر قیمت منطقه', street: 'مشهد، بلوار وکیل‌آباد، بلوار هفت‌تیر' }] },
      { id: 203, name: 'الهیه', zone: 'شمال غرب مشهد (منطقه ۱۲ - رحمانیه، محمدیه، مجیدیه، سجادیه، امیریه، صادقیه و اقدسیه)', lat: 36.3745, lng: 59.4765, radius: 1350, buyPerSqm: 74, rahn80m: 840, air: 8.9, powerWater: 8.6, internet: 8.7, metro: 6.4, security: 8.5, flatTerrain: 9.3, pros: 'نوسازترین قطب شهرسازی مدرن مشهد (بلوار رحمانیه، محمدیه، مجیدیه، سجادیه، امیریه، صادقیه، اقدسیه، نقویه، عصمتیه، مهدیه و فرمانیه) با رشد سرمایه‌گذاری پرشتاب و سند تک‌برگ تفکیکی', cons: 'فاصله از ایستگاه‌های فعلی خط ۱ مترو', sponsor: { name: 'کارگزاری املاک برند الهیه', phone: '051-35241100', specialty: 'آپارتمان‌های برند رحمانیه، محمدیه و امیریه', experienceYears: 12 }, trafficInfo: { liveStatus: 'تردد کاملاً روان در بلوارهای عریض محمدیه و رحمانیه', liveSeverity: 'smooth', peakHours: '۱۸:۰۰ تا ۲۰:۰۰', seasonalAnalysis: 'خیابان‌های ۲۰ و ۳۰ متری استاندارد بدون گره ترافیکی', bottlenecks: 'میدان ولیعصر و ورودی بزرگراه میثاق', trafficScore: 8.8 }, bargains: [{ id: 'msh-ela-1', title: '۹۵ متری برند در رحمانیه، روف‌گاردن و لابی مجلل', type: 'خرید', sqm: 95, priceText: 'متری ۶۲ میلیون تومان (کل: ۵.۸۹ میلیارد)', discountPercent: 16, buyerProfitText: '۱.۱۴ میلیارد تومان زیر قیمت رحمانیه', street: 'مشهد، شهرک غرب الهیه، بلوار رحمانیه' }] },
      { id: 204, name: 'احمدآباد', zone: 'مرکز مشهد (منطقه ۱ - ملاصدرا، بعثت، کلاهدوز، راهنمایی، رضا، ابوذر و سناباد)', lat: 36.2948, lng: 59.5692, radius: 1050, buyPerSqm: 122, rahn80m: 1420, air: 7.9, powerWater: 9.3, internet: 9.2, metro: 9.5, security: 9.1, flatTerrain: 9.0, pros: 'قلب پزشکی، تجاری و اصیل مشهد (احمدآباد، ملک‌آباد، بعثت، ملاصدرا، خیابان رضا، ابوذر غفاری، راهنمایی، کلاهدوز، سناباد، آبکوه و طالقانی) با دسترسی به ایستگاه‌های مترو شریعتی و طالقانی', cons: 'محدودیت طرح ترافیک و شلوغی مطب‌های پزشکی در عصرها', sponsor: { name: 'املاک مرکزی ملاصدرا و بعثت', phone: '051-38442210', specialty: 'واحدهای مسکونی و اداری ملاصدرا، بعثت، کلاهدوز و رضا', experienceYears: 22 }, trafficInfo: { liveStatus: 'ترافیک نیمه‌سنگین عصرگاهی در کلاهدوز و ملاصدرا', liveSeverity: 'semi', peakHours: '۱۶:۳۰ تا ۲۰:۳۰', seasonalAnalysis: 'پرتردد در ساعات کاری کلینیک‌ها و مراکز تجاری', bottlenecks: 'میدان تقی‌آباد (شریعتی)، سه‌راه راهنمایی', trafficScore: 6.4 }, bargains: [{ id: 'msh-ahm-1', title: '۱۱۰ متری بازسازی کامل در خیابان بعثت، فرعی بسیار دنج', type: 'خرید', sqm: 110, priceText: 'متری ۱۰۳ میلیون تومان (کل: ۱۱.۳۳ میلیارد)', discountPercent: 16, buyerProfitText: '۲.۰۹ میلیارد تومان زیر میانگین احمدآباد', street: 'مشهد، احمدآباد، خیابان بعثت' }] },
      { id: 205, name: 'کوهسنگی', zone: 'جنوب غرب مرکز مشهد (منطقه ۸ - بلوار بهشتی، الندشت، جهان‌آرا، نامجو و حکیم نظامی)', lat: 36.2782, lng: 59.5625, radius: 1100, buyPerSqm: 104, rahn80m: 1180, air: 8.8, powerWater: 9.0, internet: 8.8, metro: 9.0, security: 9.1, flatTerrain: 8.4, pros: 'همجواری با پارک بزرگ و تاریخی کوهسنگی، ایستگاه مترو خط ۲، آب‌وهوای خنک و بافت فرهنگی اصیل (کوهسنگی، بلوار شهید بهشتی، الندشت، جهان‌آرا، نامجو، رودکی، حکیم نظامی، زیست‌خاور، پاستور و دانشگاه)', cons: 'شلوغی اطراف ورودی پارک کوهسنگی در شب‌های تابستان', sponsor: { name: 'مسکن پارک کوهسنگی', phone: '051-38527100', specialty: 'خیابان‌های کوهسنگی، بهشتی، الندشت و جهان‌آرا', experienceYears: 16 }, trafficInfo: { liveStatus: 'تردد روان در طول بلوار کوهسنگی و خیابان بهشتی', liveSeverity: 'smooth', peakHours: '۱۸:۰۰ تا ۲۱:۳۰', seasonalAnalysis: 'ترافیک تفریحی ملایم در شب‌های تابستان', bottlenecks: 'میدان الندشت، انتهای پارک کوهسنگی', trafficScore: 7.9 }, bargains: [{ id: 'msh-kuh-1', title: '۹۰ متری خوش‌نقشه در خیابان بهشتی، نزدیک مترو کوهسنگی', type: 'خرید', sqm: 90, priceText: 'متری ۸۸ میلیون تومان (کل: ۷.۹۲ میلیارد)', discountPercent: 15, buyerProfitText: '۱.۴۴ میلیارد تومان زیر قیمت منطقه', street: 'مشهد، خیابان کوهسنگی، بلوار شهید بهشتی' }] },
      { id: 206, name: 'قاسم‌آباد', zone: 'شمال غرب مشهد (منطقه ۱۰ - شهرک غرب، فلاحی، شاهد، شریعتی، اندیشه، امامیه و مخابرات)', lat: 36.3585, lng: 59.5062, radius: 1250, buyPerSqm: 64, rahn80m: 730, air: 8.4, powerWater: 8.5, internet: 8.6, metro: 7.2, security: 8.3, flatTerrain: 9.2, pros: 'بافت شهری کامل و منظم (شهرک غرب مشهد، بلوار فلاحی، شاهد، شریعتی، اندیشه، حجاب، امامیه، استاد یوسفی، ادیب، حسابی، مروارید و چهارراه مخابرات) با مراکز خرید پرتعداد و نقدشوندگی عالی', cons: 'ترافیک عصرگاهی در بلوار شاهد و چهارراه مخابرات', sponsor: { name: 'املاک مرکزی شهرک غرب (قاسم‌آباد)', phone: '051-36628000', specialty: 'بلوار فلاحی، شاهد، استاد یوسفی و شریعتی', experienceYears: 15 }, trafficInfo: { liveStatus: 'تردد نیمه‌سنگین در چهارراه مخابرات و بلوار شریعتی', liveSeverity: 'semi', peakHours: '۱۸:۰۰ تا ۲۱:۰۰', seasonalAnalysis: 'متعادل در طول سال', bottlenecks: 'چهارراه مخابرات، پل فلاحی', trafficScore: 7.1 }, bargains: [{ id: 'msh-ghs-1', title: '۸۵ متری ۲ خواب در بلوار فلاحی، سند شش‌دانگ آماده وام', type: 'خرید', sqm: 85, priceText: 'متری ۵۴ میلیون تومان (کل: ۴.۵۹ میلیارد)', discountPercent: 16, buyerProfitText: '۸۵۰ میلیون تومان سود خریدار', street: 'مشهد، شهرک غرب (قاسم‌آباد)، بلوار فلاحی' }] },
      ...MASHHAD_KHORASAN_EXTENDED_NEIGHBORHOODS,
      ...EAST_AND_NORTHEAST_IRAN_NEIGHBORHOODS,
    ],
  },
  isfahan: {
    id: 'isfahan',
    nameFa: 'اصفهان',
    center: [32.6539, 51.6660],
    defaultZoom: 12,
    workHubs: [
      { id: 'none', name: 'بدون محدودیت تردد (کار در منزل / آزاد)', lat: null, lng: null },
      { id: 'isf_chaharbagh', name: 'چهارباغ بالا و دروازه شیراز (میدان آزادی)', lat: 32.6265, lng: 51.6662 },
      { id: 'isf_sepahan', name: 'شهرک علمی و تحقیقاتی و سپاهان‌شهر', lat: 32.5590, lng: 51.6620 },
      { id: 'isf_bazar', name: 'میدان نقش جهان و مرکز تجاری چهارباغ عباسی', lat: 32.6577, lng: 51.6775 },
      { id: 'isf_industrial', name: 'شهرک صنعتی جی و مورچه‌خورت', lat: 32.6620, lng: 51.7850 },
    ],
    neighborhoods: [
      { id: 301, name: 'مرداویج', zone: 'جنوب زاینده‌رود (منطقه ۶ - فارابی، ملاصدرا، استقلال، شیخ کلینی، کارگر و چهارباغ بالا)', lat: 32.6175, lng: 51.6652, radius: 1050, buyPerSqm: 145, rahn80m: 1680, air: 8.6, powerWater: 9.2, internet: 9.1, metro: 8.8, security: 9.5, flatTerrain: 9.2, pros: 'اعیانی‌ترین محله اصفهان، خیابان‌های مشجر فارابی شمالی و جنوبی، استقلال، ملاصدرا، شیخ کلینی، کارگر، عمار، رسالت، چهارباغ بالا، دروازه شیراز (میدان آزادی) و دانشگاه اصفهان', cons: 'قیمت بسیار بالا نسبت به سایر مناطق اصفهان', sponsor: { name: 'دپارتمان املاک چهارباغ و مرداویج', phone: '031-36684000', specialty: 'آپارتمان‌های لوکس مرداویج، ملاصدرا و چهارباغ بالا', experienceYears: 19 }, trafficInfo: { liveStatus: 'تردد روان در خیابان‌های داخلی مرداویج و شیخ کلینی', liveSeverity: 'smooth', peakHours: '۱۷:۳۰ تا ۲۰:۳۰', seasonalAnalysis: 'بسیار آرام و منظم در تمام فصول', bottlenecks: 'میدان آزادی (دروازه شیراز)', trafficScore: 8.3 }, bargains: [{ id: 'isf-mar-1', title: '۱۳۰ متری جنوبی تک‌واحدی در مرداویج، ویوی مشجر', type: 'خرید', sqm: 130, priceText: 'متری ۱۲۳ میلیون تومان (کل: ۱۵.۹۹ میلیارد)', discountPercent: 15, buyerProfitText: '۲.۸۶ میلیارد تومان زیر میانگین مرداویج', street: 'اصفهان، مرداویج، خیابان فارابی شمالی' }] },
      { id: 302, name: 'جلفا', zone: 'جنوب مرکز اصفهان (منطقه ۵ - خاقانی، نظر میانی و غربی، توحید، حکیم نظامی، مهرداد و وانک)', lat: 32.6368, lng: 51.6558, radius: 1000, buyPerSqm: 132, rahn80m: 1520, air: 8.4, powerWater: 9.0, internet: 8.9, metro: 8.2, security: 9.4, flatTerrain: 9.4, pros: 'محله تاریخی و فرهنگی بی‌نظیر با سنگ‌فرش‌ها، کافه‌های دنج، کلیسای وانک، خیابان خاقانی، نظر شرقی، میانی و غربی، توحید، حکیم نظامی، مهرداد، محتشم کاشانی، شریعتی و سنگ‌تراش‌ها', cons: 'شلوغی گردشگران در روزهای تعطیل و محدودیت پارک خودرو در خاقانی', sponsor: { name: 'املاک عمارت جلفا و خاقانی', phone: '031-36248800', specialty: 'واحدهای خاص خاقانی، نظر میانی، توحید و مهرداد', experienceYears: 21 }, trafficInfo: { liveStatus: 'ترافیک نیمه‌سنگین در خیابان حکیم نظامی و نظر میانی', liveSeverity: 'semi', peakHours: '۱۸:۰۰ تا ۲۱:۳۰', seasonalAnalysis: 'تردد بالای گردشگران در بهار و پاییز', bottlenecks: 'چهارراه حکیم نظامی، خیابان خاقانی', trafficScore: 6.9 }, bargains: [{ id: 'isf-jol-1', title: '۱۰۵ متری ۲ خواب در خیابان خاقانی، بازسازی مدرن و شیک', type: 'خرید', sqm: 105, priceText: 'متری ۱۱۲ میلیون تومان (کل: ۱۱.۷۶ میلیارد)', discountPercent: 15, buyerProfitText: '۲.۱ میلیارد تومان زیر قیمت میانگین جلفا', street: 'اصفهان، جلفا، خیابان خاقانی' }] },
      { id: 303, name: 'بوستان سعدی', zone: 'حاشیه جنوبی زاینده‌رود (منطقه ۵ - پل مارنان، پل فلزی، آیینه‌خانه، مطهری، وحید و باغ دریاچه)', lat: 32.6412, lng: 51.6485, radius: 950, buyPerSqm: 138, rahn80m: 1580, air: 8.9, powerWater: 9.1, internet: 8.8, metro: 7.8, security: 9.4, flatTerrain: 9.5, pros: 'دسترسی مستقیم به پارک ساحلی زاینده‌رود، پل مارنان، پل فلزی، بلوار آیینه‌خانه، مطهری، وحید، باغ دریاچه، سهروردی و ملت با فضای سبز کم‌نظیر و آرامش فوق‌العاده', cons: 'کمیابی فایل‌های نوساز متراژ کوچک', sponsor: { name: 'مشاورین املاک ساحل زاینده‌رود', phone: '031-36271122', specialty: 'آپارتمان‌های دید رودخانه، بوستان سعدی و پل مارنان', experienceYears: 17 }, trafficInfo: { liveStatus: 'تردد روان در خیابان بوستان سعدی و مطهری', liveSeverity: 'smooth', peakHours: '۱۸:۰۰ تا ۲۰:۳۰', seasonalAnalysis: 'ترافیک ملایم تفریحی در روزهای جاری بودن زاینده‌رود', bottlenecks: 'پل مارنان، پل فلزی', trafficScore: 8.1 }, bargains: [{ id: 'isf-boo-1', title: '۱۱۵ متری ۲ خواب، ۲ قدمی پارک ساحلی بوستان سعدی', type: 'خرید', sqm: 115, priceText: 'متری ۱۱۷ میلیون تومان (کل: ۱۳.۴۵ میلیارد)', discountPercent: 15, buyerProfitText: '۲.۴۱ میلیارد تومان سود خریدار', street: 'اصفهان، حاشیه زاینده‌رود، بوستان سعدی' }] },
      { id: 304, name: 'شیخ صدوق', zone: 'جنوب اصفهان (منطقه ۶ - شیخ صدوق شمالی و جنوبی، میر، نیکبخت، مصلی، سعادت‌آباد و کاخ)', lat: 32.6254, lng: 51.6762, radius: 1100, buyPerSqm: 126, rahn80m: 1450, air: 8.5, powerWater: 9.1, internet: 9.0, metro: 8.6, security: 9.2, flatTerrain: 9.3, pros: 'خیابان‌های شیخ صدوق شمالی و جنوبی، خیابان میر، نیکبخت، مصلی، آب ۲۵۰، چهارراه وکلا، سعادت‌آباد، کاخ سعادت‌آباد، ملاصدرا شرقی و رستوران‌ها و مراکز خرید برند', cons: 'ترافیک عصرگاهی در تقاطع شیخ صدوق و نیکبخت', sponsor: { name: 'املاک نگین شیخ صدوق', phone: '031-36619500', specialty: 'شیخ صدوق شمالی، جنوبی، خیابان میر و نیکبخت', experienceYears: 16 }, trafficInfo: { liveStatus: 'ترافیک نیمه‌سنگین در چهارراه شیخ صدوق و میر', liveSeverity: 'semi', peakHours: '۱۷:۳۰ تا ۲۱:۰۰', seasonalAnalysis: 'متعادل در طول سال', bottlenecks: 'چهارراه نیکبخت، پل شیخ صدوق', trafficScore: 7.3 }, bargains: [{ id: 'isf-shk-1', title: '۱۰۰ متری نوساز در شیخ صدوق شمالی، فول امکانات هوشمند', type: 'خرید', sqm: 100, priceText: 'متری ۱۰۷ میلیون تومان (کل: ۱۰.۷ میلیارد)', discountPercent: 15, buyerProfitText: '۱.۹ میلیارد تومان زیر میانگین شیخ صدوق', street: 'اصفهان، خیابان شیخ صدوق شمالی' }] },
      { id: 305, name: 'خانه اصفهان', zone: 'شمال غرب اصفهان (منطقه ۸ - پنج‌طبقه، گلخانه، نوبهار، ماه‌فرخی، سپاه، رزمندگان و ملک‌شهر)', lat: 32.7124, lng: 51.6442, radius: 1200, buyPerSqm: 84, rahn80m: 960, air: 8.5, powerWater: 8.8, internet: 8.9, metro: 8.5, security: 8.9, flatTerrain: 9.5, pros: 'شهرسازی مهندسی و خیابان‌های عریض و دنج (میدان پنج‌طبقه، میدان گلخانه، نوبهار، ماه‌فرخی، سپاه، بلوار رزمندگان، شهرک ملک‌شهر، خیابان مطهری، رباط سوم و جابر انصاری)', cons: 'فاصله تا مناطق جنوبی رودخانه در ساعات پیک', sponsor: { name: 'دپارتمان املاک خانه اصفهان', phone: '031-34412000', specialty: 'خیابان گلخانه، نوبهار، ماه‌فرخی و پنج‌طبقه', experienceYears: 15 }, trafficInfo: { liveStatus: 'تردد کاملاً روان در بلوار گلخانه و میدان پنج‌طبقه', liveSeverity: 'smooth', peakHours: '۱۸:۰۰ تا ۲۰:۳۰', seasonalAnalysis: 'خیابان‌های عریض با ترافیک بسیار روان', bottlenecks: 'ورودی بزرگراه ردانی‌پور', trafficScore: 8.6 }, bargains: [{ id: 'isf-kha-1', title: '۹۵ متری ۲ خواب در خیابان گلخانه، نورگیر جنوبی', type: 'خرید', sqm: 95, priceText: 'متری ۷۱ میلیون تومان (کل: ۶.۷۴ میلیارد)', discountPercent: 15, buyerProfitText: '۱.۲۳ میلیارد تومان زیر میانگین خانه اصفهان', street: 'اصفهان، خانه اصفهان، خیابان گلخانه' }] },
      { id: 306, name: 'سپاهان‌شهر', zone: 'جنوب اصفهان (منطقه ۵ - بلوار غدیر، شاهد، توحید، قائم، سیتی‌سنتر و بهارستان)', lat: 32.5592, lng: 51.6748, radius: 1300, buyPerSqm: 78, rahn80m: 890, air: 8.8, powerWater: 8.7, internet: 8.9, metro: 8.0, security: 9.0, flatTerrain: 9.4, pros: 'شهرک مدرن و یکپارچه بدون بن‌بست تنگ؛ سیتی‌سنتر اصفهان (بزرگ‌ترین مجتمع خرید)، هوای پاک، بلوار غدیر، بلوار شاهد، خیابان توحید، قائم، فارابی و بافت ویلایی کوی راه حق و بهارستان', cons: 'فاصله حدود ۱۵ دقیقه‌ای تا مرکز تاریخی اصفهان', sponsor: { name: 'املاک نگین سپاهان‌شهر', phone: '031-36507700', specialty: 'بلوار غدیر، شاهد، توحید و سیتی‌سنتر سپاهان‌شهر', experienceYears: 14 }, trafficInfo: { liveStatus: 'تردد بسیار روان در بلوار غدیر و شاهد', liveSeverity: 'smooth', peakHours: '۱۸:۳۰ تا ۲۰:۳۰', seasonalAnalysis: 'روان‌ترین ترافیک شهری در کلان‌شهر اصفهان', bottlenecks: 'تقاطع اتوبان دستگردی و سیتی‌سنتر', trafficScore: 9.1 }, bargains: [{ id: 'isf-sep-1', title: '۱۰۰ متری نوساز در بلوار غدیر، نزدیک سیتی‌سنتر', type: 'خرید', sqm: 100, priceText: 'متری ۶۶ میلیون تومان (کل: ۶.۶ میلیارد)', discountPercent: 15, buyerProfitText: '۱.۲ میلیارد تومان سود خریدار', street: 'اصفهان، سپاهان‌شهر، بلوار غدیر' }] },
      ...ISFAHAN_PROVINCE_EXTENDED_NEIGHBORHOODS,
      ...CENTRAL_AND_ZAGROS_IRAN_NEIGHBORHOODS,
    ],
  },
  shiraz: {
    id: 'shiraz',
    nameFa: 'شیراز',
    center: [29.5918, 52.5837],
    defaultZoom: 12,
    workHubs: [
      { id: 'none', name: 'بدون محدودیت تردد (کار در منزل / آزاد)', lat: null, lng: null },
      { id: 'shz_zand', name: 'بلوار زند، ملاصدرا و نمازی (قطب اداری و پزشکی)', lat: 29.6245, lng: 52.5235 },
      { id: 'shz_eram', name: 'قطب دانشگاهی ارم و میدان علم', lat: 29.6312, lng: 52.5180 },
      { id: 'shz_maal', name: 'بلوار معالی‌آباد و میرزای شیرازی (قطب تجاری)', lat: 29.6695, lng: 52.4682 },
      { id: 'shz_industrial', name: 'شهرک صنعتی بزرگ شیراز و منطقه ویژه اقتصادی', lat: 29.4750, lng: 52.5610 },
    ],
    neighborhoods: [
      { id: 401, name: 'قصرالدشت', zone: 'شمال غرب شیراز (منطقه ۱ و ۶ - زرگری، چمران، وکلا، میرزای شیرازی، شاهد و همت شمالی)', lat: 29.6442, lng: 52.4955, radius: 1250, buyPerSqm: 138, rahn80m: 1600, air: 9.5, powerWater: 9.1, internet: 8.9, metro: 8.8, security: 9.4, flatTerrain: 8.7, pros: 'ریه تنفسی شیراز با باغات انار و سرو کهنسال، کوچه‌باغ‌های رویایی، بلوار شاهد، میرزای شیرازی، زرگری، بلوار چمران، وکلا، ایمانی، قم‌آباد، مهدی‌آباد و همت شمالی', cons: 'محدودیت ساخت‌وساز در بافت باغات و قیمت بالا', sponsor: { name: 'هلدینگ املاک باغ‌شهر قصرالدشت', phone: '071-36264000', specialty: 'مجموعه‌های لوکس قصرالدشت، زرگری، چمران و وکلا', experienceYears: 20 }, trafficInfo: { liveStatus: 'تردد روان تا نیمه‌سنگین در بلوار شاهد و چمران', liveSeverity: 'smooth', peakHours: '۱۸:۰۰ تا ۲۱:۰۰', seasonalAnalysis: 'آرام و خنک با پوشش ایستگاه‌های مترو شاهد و قصرالدشت', bottlenecks: 'میدان قصرالدشت، تقاطع زرگری', trafficScore: 8.0 }, bargains: [{ id: 'shz-ghs-1', title: '۱۲۰ متری ۲ خواب با تراس رو به باغ‌های قصرالدشت', type: 'خرید', sqm: 120, priceText: 'متری ۱۱۷ میلیون تومان (کل: ۱۴.۰۴ میلیارد)', discountPercent: 15, buyerProfitText: '۲.۵۲ میلیارد تومان زیر میانگین قصرالدشت', street: 'شیراز، قصرالدشت، خیابان میرزای شیرازی' }] },
      { id: 402, name: 'معالی‌آباد', zone: 'شمال غرب شیراز (منطقه ۶ - دوستان، پزشکان، رهبرماه، گلدشت، بهشت، تاچارا و احسان)', lat: 29.6695, lng: 52.4682, radius: 1150, buyPerSqm: 124, rahn80m: 1440, air: 9.1, powerWater: 9.0, internet: 9.2, metro: 9.4, security: 9.1, flatTerrain: 9.0, pros: 'پرجنب‌وجوش‌ترین بلوار مدرن شیراز، مجتمع تجاری آفتاب، ایستگاه مترو میرزای شیرازی و دکتر شریعتی (بلوار معالی‌آباد، خیابان دوستان، پزشکان، رهبرماه، گلدشت ۱ و ۲، بهشت، تاچارا، صنایع و میدان احسان)', cons: 'ترافیک شبانه بلوار معالی‌آباد در شب‌های آخر هفته', sponsor: { name: 'دپارتمان املاک آفتاب معالی‌آباد', phone: '071-36341100', specialty: 'خیابان رهبر، پزشکان، دوستان و گلدشت معالی‌آباد', experienceYears: 16 }, trafficInfo: { liveStatus: 'ترافیک نیمه‌سنگین عصرگاهی در بلوار معالی‌آباد و پل معالی‌آباد', liveSeverity: 'semi', peakHours: '۱۸:۳۰ تا ۲۲:۰۰', seasonalAnalysis: 'پاتوق پیاده‌روی و خرید شبانه شیراز', bottlenecks: 'پل معالی‌آباد، میدان احسان', trafficScore: 7.0 }, bargains: [{ id: 'shz-maa-1', title: '۱۰۵ متری در خیابان دوستان معالی‌آباد، ۱ دقیقه تا مترو', type: 'خرید', sqm: 105, priceText: 'متری ۱۰۵ میلیون تومان (کل: ۱۱.۰۲ میلیارد)', discountPercent: 15, buyerProfitText: '۱.۹۹ میلیارد تومان سود خریدار', street: 'شیراز، بلوار معالی‌آباد، خیابان دوستان' }] },
      { id: 403, name: 'فرهنگ‌شهر', zone: 'غرب شیراز (منطقه ۶ - بلوار رجایی، کسایی، سجادیه، ایمان شمالی و جنوبی و احسان)', lat: 29.6548, lng: 52.4565, radius: 1200, buyPerSqm: 108, rahn80m: 1250, air: 9.0, powerWater: 8.9, internet: 9.0, metro: 7.6, security: 9.0, flatTerrain: 9.1, pros: 'بلوار شهید رجایی بسیار عریض و استاندارد، خیابان شهید کسایی، سجادیه، ایمان شمالی و جنوبی، میدان احسان، قدوسی غربی، بلوار بعثت و کوی اساتید با دسترسی سریع به بزرگراه حسینی الهاشمی', cons: 'فاصله نسبی از ایستگاه‌های مترو خط ۱', sponsor: { name: 'املاک بزرگ فرهنگ‌شهر (رجایی)', phone: '071-36318500', specialty: 'آپارتمان‌های شخصی‌ساز بلوار رجایی، کسایی و سجادیه', experienceYears: 15 }, trafficInfo: { liveStatus: 'تردد روان در بلوار شهید رجایی و کسایی', liveSeverity: 'smooth', peakHours: '۱۸:۰۰ تا ۲۰:۳۰', seasonalAnalysis: 'خیابان‌بندی عریض با تردد روان در تمام فصول', bottlenecks: 'میدان احسان، تقاطع تاچارا', trafficScore: 8.4 }, bargains: [{ id: 'shz-far-1', title: '۱۱۰ متری ۲ خواب در فرهنگ‌شهر، نورگیر جنوبی، سند ملکی', type: 'خرید', sqm: 110, priceText: 'متری ۹۲ میلیون تومان (کل: ۱۰.۱۲ میلیارد)', discountPercent: 15, buyerProfitText: '۱.۷۶ میلیارد تومان زیر میانگین فرهنگ‌شهر', street: 'شیراز، فرهنگ‌شهر، خیابان شهید کسایی' }] },
      { id: 404, name: 'ستارخان', zone: 'شمال مرکز شیراز (منطقه ۱ - رادفر، کوی دنا، صوراسرافیل، فلکه سنگی، قدوسی شرقی و مطهری)', lat: 29.6345, lng: 52.5012, radius: 1050, buyPerSqm: 128, rahn80m: 1480, air: 8.8, powerWater: 9.1, internet: 9.1, metro: 8.0, security: 9.3, flatTerrain: 8.8, pros: 'کافه‌ها و رستوران‌های لوکس بلوار ستارخان، خیابان رادفر، کوی دنا، صوراسرافیل، فلکه سنگی، بلوار قدوسی شرقی و غربی، مطهری شمالی، تلخداش و پاسداران با ارزش ملکی فوق‌العاده', cons: 'ترافیک شبانه در بلوار ستارخان', sponsor: { name: 'کارگزاری املاک ستارخان شیراز', phone: '071-36289000', specialty: 'بلوار ستارخان، رادفر، کوی دنا و قدوسی', experienceYears: 18 }, trafficInfo: { liveStatus: 'ترافیک نیمه‌سنگین شبانه در بلوار ستارخان', liveSeverity: 'semi', peakHours: '۱۹:۰۰ تا ۲۲:۳۰', seasonalAnalysis: 'مقصد اصلی کافه‌گردی و رستوران‌گردی شیراز', bottlenecks: 'چهارراه زرگری، فلکه سنگی', trafficScore: 7.2 }, bargains: [{ id: 'shz-sat-1', title: '۱۱۵ متری نوساز در فرعی دنج ستارخان، سند ملکی', type: 'خرید', sqm: 115, priceText: 'متری ۱۰۹ میلیون تومان (کل: ۱۲.۵۳ میلیارد)', discountPercent: 15, buyerProfitText: '۲.۱۸ میلیارد تومان زیر میانگین ستارخان', street: 'شیراز، بلوار ستارخان، کوی دنا' }] },
      { id: 405, name: 'عفیف‌آباد', zone: 'مرکز اعیانی شیراز (منطقه ۱ - باغ تاریخی عفیف‌آباد، ستاره فارس، خلدبرین، ملاصدرا، زرهی و ارم)', lat: 29.6258, lng: 52.5068, radius: 1000, buyPerSqm: 132, rahn80m: 1520, air: 8.9, powerWater: 9.2, internet: 9.0, metro: 8.5, security: 9.4, flatTerrain: 9.2, pros: 'همجواری با باغ عفیف‌آباد، مجتمع ستاره فارس، خیابان خلدبرین، بلوار ملاصدرا، خیابان بعثت، بلوار زرهی، خیابان پاسداران، بلوار ارم، خاکشناسی و میدان نمازی با اصالت و نقدشوندگی بسیار بالا', cons: 'شلوغی خیابان عفیف‌آباد در ساعات اوج خرید', sponsor: { name: 'املاک باغ عفیف‌آباد و قوام', phone: '071-36275500', specialty: 'عفیف‌آباد، خلدبرین، ملاصدرا و بلوار زرهی', experienceYears: 22 }, trafficInfo: { liveStatus: 'ترافیک نیمه‌سنگین اطراف مجتمع ستاره فارس', liveSeverity: 'semi', peakHours: '۱۷:۳۰ تا ۲۱:۳۰', seasonalAnalysis: 'پرتردد در ایام نوروز و اردیبهشت شیراز', bottlenecks: 'تقاطع زرهی، میدان مطهری', trafficScore: 7.1 }, bargains: [{ id: 'shz-afi-1', title: '۱۰۰ متری ۲ خواب روبه‌روی باغ عفیف‌آباد، بازسازی لوکس', type: 'خرید', sqm: 100, priceText: 'متری ۱۱۲ میلیون تومان (کل: ۱۱.۲ میلیارد)', discountPercent: 15, buyerProfitText: '۲ میلیارد تومان سود خریدار', street: 'شیراز، خیابان عفیف‌آباد روبه‌روی باغ' }] },
      { id: 406, name: 'شهر جدید صدرا', zone: 'شمال غرب شیراز (شهر جدید صدرا - فاز ۱ و ۲، بلوار مولانا، پاسداران، دانش، حافظ، گویم و قلات)', lat: 29.7985, lng: 52.4752, radius: 1400, buyPerSqm: 54, rahn80m: 620, air: 9.4, powerWater: 8.3, internet: 8.5, metro: 6.2, security: 8.4, flatTerrain: 7.4, pros: 'هوای پاک کوهستانی، بیمارستان پیوند اعضا ابوعلی سینا، فاز ۱ و ۲ صدرا (بلوار مولانا، پاسداران، دانش، حافظ، بوستان)، دانشگاه آزاد صدرا، گویم، دوکوهک، ییلاق قلات و قیمت بسیار مناسب برای خانه‌اول‌ها', cons: 'فاصله حدود ۲۰ دقیقه‌ای تا مرکز شهر شیراز', sponsor: { name: 'املاک مرکزی فاز ۱ و ۲ صدرا', phone: '071-36412000', specialty: 'بلوار مولانا، دانش، پاسداران و فاز ۲ صدرا', experienceYears: 13 }, trafficInfo: { liveStatus: 'تردد روان در بلوار مولانا و پاسداران صدرا', liveSeverity: 'smooth', peakHours: '۰۷:۱۵ تا ۰۸:۴۵ و ۱۷:۳۰ تا ۱۹:۳۰', seasonalAnalysis: 'تردد روان؛ شلوغ‌تر در محور بزرگراه در ساعات کارمندی', bottlenecks: 'ورودی دوکوهک و بزرگراه صدرا', trafficScore: 8.5 }, bargains: [{ id: 'shz-sad-1', title: '۹۰ متری نوساز در بلوار مولانا فاز ۱ صدرا، سند تک‌برگ', type: 'خرید', sqm: 90, priceText: 'متری ۴۵ میلیون تومان (کل: ۴.۰۵ میلیارد)', discountPercent: 17, buyerProfitText: '۸۱۰ میلیون تومان زیر میانگین فاز ۱ صدرا', street: 'شیراز، شهر جدید صدرا، فاز ۱، بلوار مولانا' }] },
      ...SHIRAZ_FARS_EXTENDED_NEIGHBORHOODS,
      ...SOUTH_AND_PERSIAN_GULF_IRAN_NEIGHBORHOODS,
    ],
  },
};
/**
 * Returns a validated `CityConfig` for the requested city ID, falling back safely to Tehran.
 * @param cityId Candidate city identifier.
 * @returns Validated `CityConfig` object.
 */
export function getValidatedCityConfig(cityId: unknown): CityConfig {
  try {
    if (isValidCityId(cityId) && MULTI_CITY_CONFIGS[cityId]) {
      return MULTI_CITY_CONFIGS[cityId];
    }
    return MULTI_CITY_CONFIGS.tehran;
  } catch {
    return MULTI_CITY_CONFIGS.tehran;
  }
}
/**
 * Aggregates and validates the 265 legacy market records currently wired into Radar's five regional hubs. This is not the canonical national registry; IRNI is the source for all canonical geography.
 * @returns Array of all valid `Neighborhood` objects across the 5 regional hubs.
 */
let cachedAllMultiCityNeighborhoods: Neighborhood[] | null = null;

export function getAllMultiCityNeighborhoods(): Neighborhood[] {
  if (cachedAllMultiCityNeighborhoods) {
    // Keep callers from mutating the shared cache while avoiding repeated
    // validation, de-duplication, and traversal of all nationwide records.
    return cachedAllMultiCityNeighborhoods.slice();
  }
  try {
    const result: Neighborhood[] = [];
    const seenIds = new Set<number>();
    const cityKeys: CityId[] = ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'];
    for (const key of cityKeys) {
      const list = MULTI_CITY_CONFIGS[key]?.neighborhoods || [];
      for (const item of list) {
        if (isNeighborhood(item) && !seenIds.has(item.id)) {
          seenIds.add(item.id);
          result.push(item);
        }
      }
    }
    cachedAllMultiCityNeighborhoods = result;
    return result.slice();
  } catch {
    return INITIAL_NEIGHBORHOODS.slice();
  }
}
export function resolveCityIdForNeighborhood(hoodId: number): CityId {
  if ((hoodId >= 100 && hoodId <= 199) || (hoodId >= 600 && hoodId <= 699)) return 'karaj';
  if ((hoodId >= 200 && hoodId <= 299) || (hoodId >= 700 && hoodId <= 776) || (hoodId >= 778 && hoodId <= 799)) return 'mashhad';
  if ((hoodId >= 300 && hoodId <= 399) || (hoodId >= 800 && hoodId <= 887) || (hoodId >= 889 && hoodId <= 899)) return 'isfahan';
  if ((hoodId >= 400 && hoodId <= 499) || (hoodId >= 900 && hoodId <= 998)) return 'shiraz';
  return 'tehran';
}
export interface CommissionCalculationResult {
  dealType: 'buy' | 'rent';
  baseCommissionEachSideToman: number;
  vatEachSideToman: number;
  totalCommissionEachSideToman: number;
  transferTaxSellerToman: number;
  notaryFeeTotalToman: number;
  buyerNotaryShareToman: number;
  sellerNotaryShareToman: number;
  totalBuyerPayableToman: number;
  totalSellerPayableToman: number;
}
export function calculateOfficialCommissionAndNotary(params: {
  dealType: 'buy' | 'rent';
  buyTotalMillion: number;
  depositMillion: number;
  monthlyRentMillion: number;
}): CommissionCalculationResult {
  const endTimer = createExecutionTimer('Calculator', 'calculateOfficialCommissionAndNotary');
  try {
    const dealType = params?.dealType === 'rent' ? 'rent' : 'buy';
    const buyTotalMillion = clampNumber(params?.buyTotalMillion, 100, 500000, 8500);
    const depositMillion = clampNumber(params?.depositMillion, 10, 100000, 1200);
    const monthlyRentMillion = clampNumber(params?.monthlyRentMillion, 0, 5000, 25);
    if (dealType === 'buy') {
      const totalPriceToman = Math.max(100, buyTotalMillion) * 1_000_000;
      const tier1 = Math.min(totalPriceToman, 500_000_000) * 0.005;
      const tier2 = Math.max(0, totalPriceToman - 500_000_000) * 0.0025;
      const baseCommissionEachSideToman = Math.round(tier1 + tier2);
      const vatEachSideToman = Math.round(baseCommissionEachSideToman * 0.1);
      const totalCommissionEachSideToman = baseCommissionEachSideToman + vatEachSideToman;
      const transferTaxSellerToman = Math.round(totalPriceToman * 0.002);
      const notaryFeeTotalToman = Math.round(totalPriceToman * 0.0018);
      const buyerNotaryShareToman = Math.round(notaryFeeTotalToman * 0.5);
      const sellerNotaryShareToman = notaryFeeTotalToman - buyerNotaryShareToman;
      endTimer('success');
      return {
        dealType: 'buy', baseCommissionEachSideToman, vatEachSideToman, totalCommissionEachSideToman, transferTaxSellerToman,
        notaryFeeTotalToman, buyerNotaryShareToman, sellerNotaryShareToman,
        totalBuyerPayableToman: totalCommissionEachSideToman + buyerNotaryShareToman,
        totalSellerPayableToman: totalCommissionEachSideToman + transferTaxSellerToman + sellerNotaryShareToman,
      };
    }
    const equivalentMonthlyRentMillion = monthlyRentMillion + depositMillion * 0.03;
    const baseCommissionEachSideToman = Math.round(equivalentMonthlyRentMillion * 0.25 * 1_000_000);
    const vatEachSideToman = Math.round(baseCommissionEachSideToman * 0.1);
    const totalCommissionEachSideToman = baseCommissionEachSideToman + vatEachSideToman;
    endTimer('success');
    return {
      dealType: 'rent', baseCommissionEachSideToman, vatEachSideToman, totalCommissionEachSideToman,
      transferTaxSellerToman: 0, notaryFeeTotalToman: 0, buyerNotaryShareToman: 0, sellerNotaryShareToman: 0,
      totalBuyerPayableToman: totalCommissionEachSideToman, totalSellerPayableToman: totalCommissionEachSideToman,
    };
  } catch {
    endTimer('fallback');
    recordDiagnosticEvent('Calculator', 'Commission calculation fallback triggered', 'fallback');
    return {
      dealType: 'buy', baseCommissionEachSideToman: 22500000, vatEachSideToman: 2250000, totalCommissionEachSideToman: 24750000,
      transferTaxSellerToman: 17000000, notaryFeeTotalToman: 15300000, buyerNotaryShareToman: 7650000, sellerNotaryShareToman: 7650000,
      totalBuyerPayableToman: 32400000, totalSellerPayableToman: 49400000,
    };
  }
}
export interface AntiFraudChecklistItem { id: string; title: string; detail: string; weight: number; }
export const ANTI_FRAUD_CHECKLIST_ITEMS: AntiFraudChecklistItem[] = [
  { id: 'sabt_man', title: 'استعلام اصالت سند تک‌برگ در سامانه «ثبت من» (سازمان ثبت اسناد)', detail: 'بررسی شناسه یکتای سند و اطمینان از عدم بازداشت یا در رهن نبودن ملک قبل از هرگونه پرداخت.', weight: 10 },
  { id: 'national_id_match', title: 'تطبیق کد ملی و شناسنامه فروشنده با نام درج‌شده در سند رسمی', detail: 'هرگز بیعانه را به حساب فردی غیر از مالک رسمی (یا وکیل قانونی با وکالت‌نامه معتبر) واریز نکنید.', weight: 10 },
  { id: 'poa_check', title: 'تصدیق اصالت وکالت‌نامه بلاعزل در سایت رسمی ssaa.ir (در معاملات وکالتی)', detail: 'بررسی عدم عزل وکیل، حدود اختیارات فروش و اخذ ثمن در متن وکالت‌نامه محضری.', weight: 10 },
  { id: 'khodnevis_code', title: 'ثبت همزمان قرارداد در سامانه «خودنویس» یا «کاتب» و دریافت کد رهگیری هولوگرام‌دار', detail: 'طبق قانون الزام به ثبت رسمی معاملات اموال غیرمنقول، قولنامه‌های دستی فاقد کد رهگیری ریسک حقوقی بالایی دارند.', weight: 10 },
  { id: 'penalty_clause', title: 'تعیین دقیق «وجه التزام روزانه» و «خسارت عدم حضور در محضر» برای هر دو طرف', detail: 'مبلغ خسارت تاخیر تحویل یا عدم تنظیم سند باید بازدارنده و متوازن برای خریدار و فروشنده درج شود.', weight: 10 },
  { id: 'check_sayadi', title: 'ثبت تمامی چک‌های ثمن معامله در سامانه «صیاد» به نام شخص مالک با درج کد رهگیری قرارداد', detail: 'خودداری کامل از تحویل چک حامل یا سفیدامضا و درج شماره سریال چک‌های صیادی در متن مبایعه‌نامه.', weight: 10 },
  { id: 'parking_storage_exact', title: 'قید شدن شماره قطعی و متراژ پارکینگ و انباری مطابق صورت‌مجلس تفکیکی', detail: 'جلوگیری از ابهام «پارکینگ مزاحم» یا «پارکینگ مشاعی» با ذکر موقعیت دقیق در سند.', weight: 10 },
  { id: 'staged_payment', title: 'تنظیم جدول پرداخت مرحله‌ای (حداکثر ۲۰ تا ۳۰٪ در زمان مبایعه‌نامه، مابقی در تحویل و محضر)', detail: 'عدم پرداخت بیش از ۵۰٪ ثمن معامله پیش از تحویل کلید یا انتقال رسمی سند در دفترخانه.', weight: 10 },
  { id: 'municipal_clearance', title: 'شرط تسویه‌حساب کامل مفاصاحساب شهرداری، دارایی، شارژ ساختمان و قبوض تا روز تحویل', detail: 'تعهد کتبی فروشنده جهت ارائه پایانکار معتبر و عدم خلافی شهرداری پیش از تاریخ دفترخانه.', weight: 10 },
  { id: 'agency_license', title: 'استعلام پروانه کسب معتبر دفتر املاک در سامانه اتحادیه و مهر و امضای صاحب جواز', detail: 'اطمینان از اینکه قرارداد توسط شخص صاحب پروانه کسب املاک (نه صرفاً مشاور) مهر و امضا شده است.', weight: 10 },
];
export function formatMultiCityCommissionIntlSummary(buyTotalMillion = 8500, unit: AreaUnit = 'sqm', currency: IntlCurrencyCode = 'USD'): { displayAreaUnitLabel: string; referenceValuationIntlText: string } {
  return { displayAreaUnitLabel: formatAreaUnitLabel(unit), referenceValuationIntlText: formatMillionTomanAsIntlCurrency(buyTotalMillion, currency) };
}

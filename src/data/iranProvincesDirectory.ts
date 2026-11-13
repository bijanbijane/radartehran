/** @file src/data/iranProvincesDirectory.ts — Official Directory of All 31 Iranian Provinces */
import { CityId } from '../types/models'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit'; export type IranRegionGroup = 'capital' | 'north_west' | 'east_northeast' | 'central_zagros' | 'south_gulf';
export interface IranProvinceConfig { id: string; nameFa: string; capitalFa: string; regionGroup: IranRegionGroup; regionGroupFa: string; targetCityId: CityId; center: [number, number]; defaultZoom: number; sampleHoodId: number; majorCities: string[]; descriptionFa: string; }
export const IRAN_REGION_GROUPS: { id: IranRegionGroup; labelFa: string; badgeColor: string }[] = [
  { id: 'capital', labelFa: 'تهران و پایتخت', badgeColor: 'bg-blue-100 text-blue-800' }, { id: 'north_west', labelFa: 'شمال و شمال‌غرب', badgeColor: 'bg-emerald-100 text-emerald-800' }, { id: 'east_northeast', labelFa: 'شرق و شمال‌شرق', badgeColor: 'bg-amber-100 text-amber-800' }, { id: 'central_zagros', labelFa: 'مرکز و زاگرس', badgeColor: 'bg-purple-100 text-purple-800' }, { id: 'south_gulf', labelFa: 'جنوب و خلیج‌فارس', badgeColor: 'bg-rose-100 text-rose-800' }, ]; export const ALL_31_IRAN_PROVINCES: IranProvinceConfig[] = [
  { id: 'tehran', nameFa: 'تهران', capitalFa: 'تهران', regionGroup: 'capital', regionGroupFa: 'تهران و پایتخت', targetCityId: 'tehran', center: [35.735, 51.395], defaultZoom: 12,
    sampleHoodId: 5, // پونک
    majorCities: ['تهران', 'شمیرانات', 'ری', 'پردیس', 'دماوند', 'شهریار', 'اسلامشهر', 'اندیشه', 'رباط‌کریم'], descriptionFa: 'کلان‌شهر پایتخت و شهرستان‌های تابعه (۸۰ محله و شهر ثبت‌شده)', }, { id: 'alborz', nameFa: 'البرز', capitalFa: 'کرج', regionGroup: 'capital', regionGroupFa: 'تهران و پایتخت', targetCityId: 'karaj', center: [35.8327, 50.9915], defaultZoom: 12,
    sampleHoodId: 101, // عظیمیه
    majorCities: ['کرج', 'فردیس', 'مهرشهر', 'گوهردشت', 'هشتگرد', 'نظرآباد', 'طالقان'], descriptionFa: 'استان البرز، قطب دوم جمعیتی و حومه صنعتی پایتخت', }, { id: 'east_azerbaijan', nameFa: 'آذربایجان شرقی', capitalFa: 'تبریز', regionGroup: 'north_west', regionGroupFa: 'شمال و شمال‌غرب', targetCityId: 'karaj', center: [38.0800, 46.2919], defaultZoom: 12,
    sampleHoodId: 126, // ولیعصر تبریز (126..130)
    majorCities: ['تبریز', 'مراغه', 'مرند', 'میانه', 'سهند', 'اهر', 'بناب'], descriptionFa: 'قطب صنعتی و تجاری شمال‌غرب ایران، تبریز کهن (پوشش کامل ولیعصر، ائل‌گلی، رشدیه، مرزداران، آبرسان، سهند، مراغه و مرند)', }, { id: 'gilan', nameFa: 'گیلان', capitalFa: 'رشت', regionGroup: 'north_west', regionGroupFa: 'شمال و شمال‌غرب', targetCityId: 'karaj', center: [37.2808, 49.5832], defaultZoom: 12,
    sampleHoodId: 131, // گلسار رشت (131..135)
    majorCities: ['رشت', 'بندرانزلی', 'لاهیجان', 'لنگرود', 'آستارا', 'تالش', 'فومن'], descriptionFa: 'استان سرسبز گیلان، شهر خلاق خوراک و سواحل کاسپین (گلسار، منظریه، معلم رشت، لاهیجان، انزلی و آستارا)', }, { id: 'mazandaran', nameFa: 'مازندران', capitalFa: 'ساری', regionGroup: 'north_west', regionGroupFa: 'شمال و شمال‌غرب', targetCityId: 'karaj', center: [36.5659, 53.0586], defaultZoom: 12,
    sampleHoodId: 136, // فرهنگ و قارن ساری (136..140)
    majorCities: ['ساری', 'بابل', 'آمل', 'قائم‌شهر', 'چالوس', 'نوشهر', 'بابلسر', 'رامسر', 'تنکابن'], descriptionFa: 'قطب گردشگری و املاک ساحلی و ویلایی شمال کشور (ساری، بابل، آمل، چالوس، نمک‌آبرود، متل‌قو، رامسر و تنکابن)', }, { id: 'west_azerbaijan', nameFa: 'آذربایجان غربی', capitalFa: 'ارومیه', regionGroup: 'north_west', regionGroupFa: 'شمال و شمال‌غرب', targetCityId: 'karaj', center: [37.5527, 45.0761], defaultZoom: 12,
    sampleHoodId: 141, // بلوار امین و دانشکده ارومیه (141..143)
    majorCities: ['ارومیه', 'خوی', 'بوکان', 'مهاباد', 'میاندوآب', 'سلماس'], descriptionFa: 'مرکز باغ‌شهر ارومیه و شاهراه مرزی ایران و ترکیه (بلوار امین، دانشکده، مولوی، خوی، مهاباد و بوکان)', }, { id: 'kermanshah', nameFa: 'کرمانشاه', capitalFa: 'کرمانشاه', regionGroup: 'north_west', regionGroupFa: 'شمال و شمال‌غرب', targetCityId: 'karaj', center: [34.3277, 47.0778], defaultZoom: 12,
    sampleHoodId: 144, // نوبهار و کسری کرمانشاه (144..145)
    majorCities: ['کرمانشاه', 'اسلام‌آباد غرب', 'کنگاور', 'جوانرود', 'پاوه'], descriptionFa: 'مرکز تمدن و تجارت غرب کشور و شاهراه زاگرس (نوبهار، فردوسی، کسری، الهیه و اسلام‌آباد غرب)', }, { id: 'hamedan', nameFa: 'همدان', capitalFa: 'همدان', regionGroup: 'north_west', regionGroupFa: 'شمال و شمال‌غرب', targetCityId: 'karaj', center: [34.7989, 48.5150], defaultZoom: 12,
    sampleHoodId: 146, // سعیدیه و استادان همدان (146..147)
    majorCities: ['همدان', 'ملایر', 'نهاوند', 'تویسرکان', 'اسدآباد'], descriptionFa: 'پایتخت تاریخ و تمدن ایران‌زمین در دامنه الوند (سعیدیه، استادان، مهدیه، بوعلی همدان، ملایر و نهاوند)', }, { id: 'qazvin', nameFa: 'قزوین', capitalFa: 'قزوین', regionGroup: 'north_west', regionGroupFa: 'شمال و شمال‌غرب', targetCityId: 'karaj', center: [36.2797, 50.0049], defaultZoom: 12,
    sampleHoodId: 148, // ملاصدرا، پونک و خیام قزوین (148..149)
    majorCities: ['قزوین', 'الوند', 'تاکستان', 'محمدیه', 'آبیک'], descriptionFa: 'چهارراه ترانزیتی و شهر تاریخی و صنعتی قزوین (ملاصدرا، پونک، خیام، مهرگان، محمدیه و تاکستان)', }, { id: 'zanjan', nameFa: 'زنجان', capitalFa: 'زنجان', regionGroup: 'north_west', regionGroupFa: 'شمال و شمال‌غرب', targetCityId: 'karaj', center: [36.6744, 48.4844], defaultZoom: 12,
    sampleHoodId: 150, // کوچه‌مشکی و شهرک کارمندان زنجان (150..151)
    majorCities: ['زنجان', 'ابهر', 'خرمدره', 'قیدار'], descriptionFa: 'شهر ملی مس و چاقو، کریدور اتصال به شمال‌غرب (کوچه‌مشکی، شهرک کارمندان، گلشهر کاظمیه، ابهر و خرمدره)', }, { id: 'ardabil', nameFa: 'اردبیل', capitalFa: 'اردبیل', regionGroup: 'north_west', regionGroupFa: 'شمال و شمال‌غرب', targetCityId: 'karaj', center: [38.2498, 48.2933], defaultZoom: 12,
    sampleHoodId: 152, // شهرک آزادی و شورابیل اردبیل (152..153)
    majorCities: ['اردبیل', 'پارس‌آباد', 'مشگین‌شهر', 'سرعین', 'خلخال'], descriptionFa: 'دیار شیخ صفی‌الدین و قطب چشمه‌های آبگرم سرعین (شهرک آزادی، شورابیل، کارشناسان، سرعین و مشگین‌شهر)', }, { id: 'kurdistan', nameFa: 'کردستان', capitalFa: 'سنندج',
    regionGroup: 'north_west', regionGroupFa: 'شمال و شمال‌غرب',
    targetCityId: 'karaj', center: [35.3219, 46.9862],
    defaultZoom: 12,
    sampleHoodId: 154, // آبیدر، شبلی و بهاران سنندج (154..155)
    majorCities: ['سنندج', 'سقز', 'مریوان', 'بانه', 'قروه'],
    descriptionFa: 'شهر خلاق موسیقی، آبیدر سرافراز و بازارهای مرزی (آبیدر، شبلی، مبارک‌آباد، بهاران سنندج، سقز، مریوان و بانه)', },
  { id: 'khorasan_razavi',
    nameFa: 'خراسان رضوی', capitalFa: 'مشهد',
    regionGroup: 'east_northeast', regionGroupFa: 'شرق و شمال‌شرق',
    targetCityId: 'mashhad', center: [36.2972, 59.6067],
    defaultZoom: 12,
    sampleHoodId: 201, // سجاد مشهد (201..225)
    majorCities: ['مشهد', 'نیشابور', 'سبزوار', 'تربت حیدریه', 'قوچان', 'طرقبه و شاندیز', 'گلبهار'],
    descriptionFa: 'دومین کلان‌شهر مذهبی و گردشگری ایران (پوشش کامل مناطق ۱۳گانه مشهد، طرقبه، شاندیز، گلبهار، نیشابور و سبزوار)', },
  { id: 'golestan',
    nameFa: 'گلستان', capitalFa: 'گرگان',
    regionGroup: 'east_northeast', regionGroupFa: 'شرق و شمال‌شرق',
    targetCityId: 'mashhad', center: [36.8427, 54.4439],
    defaultZoom: 12,
    sampleHoodId: 226, // ناهارخوران و عدالت گرگان (226..228)
    majorCities: ['گرگان', 'گنبدکاووس', 'علی‌آباد کتول', 'بندر ترکمن', 'کردکوی'],
    descriptionFa: 'سرزمین جنگل‌های هیرکانی و دشت‌های ترکمن‌صحرا (ناهارخوران، عدالت، گلشهر گرگان، گنبدکاووس و علی‌آباد)', },
  {
    id: 'north_khorasan',
    nameFa: 'خراسان شمالی',
    capitalFa: 'بجنورد',
    regionGroup: 'east_northeast',
    regionGroupFa: 'شرق و شمال‌شرق',
    targetCityId: 'mashhad',
    center: [37.4747, 57.3290],
    defaultZoom: 12,
    sampleHoodId: 229, // امیریه و طالقانی بجنورد (229..231)
    majorCities: ['بجنورد', 'شیروان', 'اسفراین', 'جاجرم'],
    descriptionFa: 'باب‌الرضا، شهر فرهنگ‌های گوناگون خراسان شمالی (امیریه، طالقانی، گلستان‌شهر بجنورد، شیروان و اسفراین)',
  },
  {
    id: 'south_khorasan',
    nameFa: 'خراسان جنوبی',
    capitalFa: 'بیرجند',
    regionGroup: 'east_northeast',
    regionGroupFa: 'شرق و شمال‌شرق',
    targetCityId: 'mashhad',
    center: [32.8663, 59.2211],
    defaultZoom: 12,
    sampleHoodId: 232, // سجادشهر و معلم بیرجند (232..234)
    majorCities: ['بیرجند', 'قائن', 'فردوس', 'طبس'],
    descriptionFa: 'پایتخت یاقوت سرخ و طلای سرخ ایران (سجادشهر، معلم، توحید بیرجند، قائن، طبس و فردوس)',
  },
  {
    id: 'semnan',
    nameFa: 'سمنان',
    capitalFa: 'سمنان',
    regionGroup: 'east_northeast',
    regionGroupFa: 'شرق و شمال‌شرق',
    targetCityId: 'mashhad',
    center: [35.5769, 53.3953],
    defaultZoom: 12,
    sampleHoodId: 235, // باغ فردوس و گلشهر سمنان (235..237)
    majorCities: ['سمنان', 'شاهرود', 'دامغان', 'گرمسار', 'مهدی‌شهر'],
    descriptionFa: 'شاهراه ارتباطی پایتخت با مشهدالرضا (باغ فردوس و گلشهر سمنان، شاهرود، دامغان و گرمسار)',
  },
  {
    id: 'sistan_baluchestan',
    nameFa: 'سیستان و بلوچستان',
    capitalFa: 'زاهدان',
    regionGroup: 'east_northeast',
    regionGroupFa: 'شرق و شمال‌شرق',
    targetCityId: 'mashhad',
    center: [29.4963, 60.8629],
    defaultZoom: 12,
    sampleHoodId: 238, // دانشگاه و بزرگمهر زاهدان (238..240)
    majorCities: ['زاهدان', 'چابهار', 'زابل', 'ایرانشهر', 'سراوان'],
    descriptionFa: 'دروازه تجارت اقیانوسی ایران و سواحل مکران (دانشگاه و معلم زاهدان، منطقه آزاد چابهار، زابل و ایرانشهر)',
  },
  {
    id: 'isfahan',
    nameFa: 'اصفهان',
    capitalFa: 'اصفهان',
    regionGroup: 'central_zagros',
    regionGroupFa: 'مرکز و زاگرس',
    targetCityId: 'isfahan',
    center: [32.6539, 51.6660],
    defaultZoom: 12,
    sampleHoodId: 301, // مرداویج اصفهان (301..325, 344..345)
    majorCities: ['اصفهان', 'کاشان', 'شاهین‌شهر', 'سپاهان‌شهر', 'نجف‌آباد', 'خمینی‌شهر', 'فولادشهر', 'بهارستان'],
    descriptionFa: 'نصف جهان، پایتخت فرهنگی ایران (پوشش کامل مناطق ۱۵گانه اصفهان، کاشان، شاهین‌شهر، فولادشهر، گلپایگان و شهرضا)',
  },
  {
    id: 'qom',
    nameFa: 'قم',
    capitalFa: 'قم',
    regionGroup: 'central_zagros',
    regionGroupFa: 'مرکز و زاگرس',
    targetCityId: 'isfahan',
    center: [34.6401, 50.8764],
    defaultZoom: 12,
    sampleHoodId: 326, // سالاریه و صفائیه قم (326..328)
    majorCities: ['قم', 'پردیسان', 'جعفریه', 'کهک'],
    descriptionFa: 'دومین قطب گردشگری زیارتی کشور همجوار با پایتخت (سالاریه، صفائیه، بلوار امین، زنبیل‌آباد، پردیسان و حرم)',
  },
  {
    id: 'yazd',
    nameFa: 'یزد',
    capitalFa: 'یزد',
    regionGroup: 'central_zagros',
    regionGroupFa: 'مرکز و زاگرس',
    targetCityId: 'isfahan',
    center: [31.8974, 54.3569],
    defaultZoom: 12,
    sampleHoodId: 329, // صفائیه یزد (329..331)
    majorCities: ['یزد', 'میبد', 'اردکان', 'بافق', 'مهریز'],
    descriptionFa: 'نخستین شهر خشتی جهان ثبت‌شده در یونسکو (صفائیه، بلوار دانشگاه، قاسم‌آباد، آزادشهر یزد، میبد و اردکان)',
  },
  {
    id: 'markazi',
    nameFa: 'مرکزی',
    capitalFa: 'اراک',
    regionGroup: 'central_zagros',
    regionGroupFa: 'مرکز و زاگرس',
    targetCityId: 'isfahan',
    center: [34.0954, 49.7013],
    defaultZoom: 12,
    sampleHoodId: 332, // جهان‌پناه و شریعتی اراک (332..334)
    majorCities: ['اراک', 'ساوه', 'خمین', 'محلات', 'دلیجان'],
    descriptionFa: 'پایتخت صنایع مادر ایران و گل و گیاه محلات (جهان‌پناه، عباس‌آباد، هپکو اراک، ساوه، محلات و خمین)',
  },
  {
    id: 'lorestan',
    nameFa: 'لرستان',
    capitalFa: 'خرم‌آباد',
    regionGroup: 'central_zagros',
    regionGroupFa: 'مرکز و زاگرس',
    targetCityId: 'isfahan',
    center: [33.4878, 48.3558],
    defaultZoom: 12,
    sampleHoodId: 335, // کیو و شهدای خرم‌آباد (335..337)
    majorCities: ['خرم‌آباد', 'بروجرد', 'دورود', 'الیگودرز', 'کوهدشت'],
    descriptionFa: 'سرزمین آبشارها و قلعه فلک‌الافلاک (دریاچه کیو، گلدشت خرم‌آباد، تختی بروجرد، دورود و الیگودرز)',
  },
  {
    id: 'chaharmahal',
    nameFa: 'چهارمحال و بختیاری',
    capitalFa: 'شهرکرد',
    regionGroup: 'central_zagros',
    regionGroupFa: 'مرکز و زاگرس',
    targetCityId: 'isfahan',
    center: [32.3256, 50.8644],
    defaultZoom: 12,
    sampleHoodId: 338, // کاشانی و میرآب شهرکرد (338..340)
    majorCities: ['شهرکرد', 'بروجن', 'فرخشهر', 'فارسان', 'سامان'],
    descriptionFa: 'بام ایران، سرچشمه زاینده‌رود و کارون (کاشانی، میرآب، منظریه شهرکرد، بروجن، فرخشهر و سامان)',
  },
  {
    id: 'ilam',
    nameFa: 'ایلام',
    capitalFa: 'ایلام',
    regionGroup: 'central_zagros',
    regionGroupFa: 'مرکز و زاگرس',
    targetCityId: 'isfahan',
    center: [33.6374, 46.4227],
    defaultZoom: 12,
    sampleHoodId: 341, // سعدی و تختی ایلام (341..343)
    majorCities: ['ایلام', 'دهلران', 'ایوان', 'آبدانان', 'مهران'],
    descriptionFa: 'عروس زاگرس و دروازه اصلی عتبات عالیات (سعدی، سیدالشهدا، مصلی ایلام، دهلران، ایوان و مهران)',
  },
  { id: 'fars', nameFa: 'فارس', capitalFa: 'شیراز', regionGroup: 'south_gulf', regionGroupFa: 'جنوب و خلیج‌فارس', targetCityId: 'shiraz', center: [29.5918, 52.5837], defaultZoom: 12, sampleHoodId: 401, majorCities: ['شیراز', 'صدرا', 'مرودشت', 'جهرم', 'فسا', 'کازرون', 'لار'], descriptionFa: 'مهد تمدن پارس، پایتخت شعر و ادب و قطب پزشکی جنوب کشور (پوشش کامل مناطق ۱۱گانه شیراز، صدرا، مرودشت، جهرم و لار)' },
  { id: 'khuzestan', nameFa: 'خوزستان', capitalFa: 'اهواز', regionGroup: 'south_gulf', regionGroupFa: 'جنوب و خلیج‌فارس', targetCityId: 'shiraz', center: [31.3183, 48.6706], defaultZoom: 12, sampleHoodId: 426, majorCities: ['اهواز', 'آبادان', 'دزفول', 'خرمشهر', 'ماهشهر', 'بهبهان'], descriptionFa: 'قلب تپنده انرژی و صنایع ایران در ساحل کارون (کیانپارس، زیتون کارمندی، گلستان اهواز، دزفول، آبادان و ماهشهر)' },
  { id: 'hormozgan', nameFa: 'هرمزگان', capitalFa: 'بندرعباس', regionGroup: 'south_gulf', regionGroupFa: 'جنوب و خلیج‌فارس', targetCityId: 'shiraz', center: [27.1832, 56.2666], defaultZoom: 12, sampleHoodId: 431, majorCities: ['بندرعباس', 'کیش', 'قشم', 'میناب', 'بندرلنگه'], descriptionFa: 'پایتخت دریایی ایران و جزایر نگین خلیج‌فارس (گلشهر، رسالت و سورو بندرعباس، جزیره کیش و جزیره قشم)' },
  { id: 'kerman', nameFa: 'کرمان', capitalFa: 'کرمان', regionGroup: 'south_gulf', regionGroupFa: 'جنوب و خلیج‌فارس', targetCityId: 'shiraz', center: [30.2839, 57.0788], defaultZoom: 12, sampleHoodId: 435, majorCities: ['کرمان', 'سیرجان', 'رفسنجان', 'جیرفت', 'بم'], descriptionFa: 'بزرگ‌ترین استان پهناور جنوب‌شرق، قطب معادن و پسته (هزارویک‌شب، جمهوری، باغملی کرمان، سیرجان، رفسنجان و جیرفت)' },
  { id: 'bushehr', nameFa: 'بوشهر', capitalFa: 'بوشهر', regionGroup: 'south_gulf', regionGroupFa: 'جنوب و خلیج‌فارس', targetCityId: 'shiraz', center: [28.9234, 50.8203], defaultZoom: 12, sampleHoodId: 439, majorCities: ['بوشهر', 'برازجان', 'کنگان', 'عسلویه', 'گناوه'], descriptionFa: 'طولانی‌ترین نوار ساحلی خلیج‌فارس و پایتخت انرژی (سنگی، بهمنی، عالی‌شهر بوشهر، برازجان، گناوه و کنگان)' },
  { id: 'kohgiluyeh', nameFa: 'کهگیلویه و بویراحمد', capitalFa: 'یاسوج', regionGroup: 'south_gulf', regionGroupFa: 'جنوب و خلیج‌فارس', targetCityId: 'shiraz', center: [30.6684, 51.5876], defaultZoom: 12, sampleHoodId: 442, majorCities: ['یاسوج', 'دوگنبدان (گچساران)', 'دهدشت', 'سی‌سخت'], descriptionFa: 'پایتخت طبیعت ایران در دل دنا و زاگرس (سالم‌آباد، راهنمایی یاسوج، گچساران، دهدشت و سی‌سخت)' },
];
export function findProvinceById(provinceId: string): IranProvinceConfig | undefined {
  return ALL_31_IRAN_PROVINCES.find((p) => p.id === provinceId);
}
export function findProvinceForHood(hoodId: number): IranProvinceConfig | undefined {
  if (hoodId >= 1 && hoodId <= 99) return ALL_31_IRAN_PROVINCES[0];
  if (hoodId >= 101 && hoodId <= 125) return ALL_31_IRAN_PROVINCES[1];
  if (hoodId >= 126 && hoodId <= 130) return ALL_31_IRAN_PROVINCES[2];
  if (hoodId >= 131 && hoodId <= 135) return ALL_31_IRAN_PROVINCES[3];
  if (hoodId >= 136 && hoodId <= 140) return ALL_31_IRAN_PROVINCES[4];
  if (hoodId >= 141 && hoodId <= 143) return ALL_31_IRAN_PROVINCES[5];
  if (hoodId >= 144 && hoodId <= 145) return ALL_31_IRAN_PROVINCES[6];
  if (hoodId >= 146 && hoodId <= 147) return ALL_31_IRAN_PROVINCES[7];
  if (hoodId >= 148 && hoodId <= 149) return ALL_31_IRAN_PROVINCES[8];
  if (hoodId >= 150 && hoodId <= 151) return ALL_31_IRAN_PROVINCES[9];
  if (hoodId >= 152 && hoodId <= 153) return ALL_31_IRAN_PROVINCES[10];
  if (hoodId >= 154 && hoodId <= 155) return ALL_31_IRAN_PROVINCES[11];
  if (hoodId >= 201 && hoodId <= 225) return ALL_31_IRAN_PROVINCES[12];
  if (hoodId >= 226 && hoodId <= 228) return ALL_31_IRAN_PROVINCES[13];
  if (hoodId >= 229 && hoodId <= 231) return ALL_31_IRAN_PROVINCES[14];
  if (hoodId >= 232 && hoodId <= 234) return ALL_31_IRAN_PROVINCES[15];
  if (hoodId >= 235 && hoodId <= 237) return ALL_31_IRAN_PROVINCES[16];
  if (hoodId >= 238 && hoodId <= 240) return ALL_31_IRAN_PROVINCES[17];
  if ((hoodId >= 301 && hoodId <= 325) || hoodId === 344 || hoodId === 345) return ALL_31_IRAN_PROVINCES[18];
  if (hoodId >= 326 && hoodId <= 328) return ALL_31_IRAN_PROVINCES[19];
  if (hoodId >= 329 && hoodId <= 331) return ALL_31_IRAN_PROVINCES[20];
  if (hoodId >= 332 && hoodId <= 334) return ALL_31_IRAN_PROVINCES[21];
  if (hoodId >= 335 && hoodId <= 337) return ALL_31_IRAN_PROVINCES[22];
  if (hoodId >= 338 && hoodId <= 340) return ALL_31_IRAN_PROVINCES[23];
  if (hoodId >= 341 && hoodId <= 343) return ALL_31_IRAN_PROVINCES[24];
  if (hoodId >= 401 && hoodId <= 425) return ALL_31_IRAN_PROVINCES[25];
  if (hoodId >= 426 && hoodId <= 430) return ALL_31_IRAN_PROVINCES[26];
  if (hoodId >= 431 && hoodId <= 434) return ALL_31_IRAN_PROVINCES[27];
  if (hoodId >= 435 && hoodId <= 438) return ALL_31_IRAN_PROVINCES[28];
  if (hoodId >= 439 && hoodId <= 441) return ALL_31_IRAN_PROVINCES[29];
  if (hoodId >= 442 && hoodId <= 445) return ALL_31_IRAN_PROVINCES[30];
  return undefined;
}
export const DIVAR_CITY_ID_BY_PROVINCE: Record<string, string> = {
  tehran: '1', alborz: '2', khorasan_razavi: '3', isfahan: '4', east_azerbaijan: '5',
  fars: '6', khuzestan: '7', qom: '8', kermanshah: '9', west_azerbaijan: '10',
  sistan_baluchestan: '11', gilan: '12', kerman: '13', hamedan: '14', markazi: '15',
  yazd: '16', ardabil: '17', hormozgan: '18', qazvin: '19', zanjan: '20',
  golestan: '21', mazandaran: '22', bushehr: '25', lorestan: '27', kurdistan: '28',
  ilam: '32', south_khorasan: '34', semnan: '35', chaharmahal: '36', kohgiluyeh: '38',
  north_khorasan: '39',
};
export function resolveDivarCityId(city: CityId | string = 'tehran', hoodId?: number): string {
  if (typeof hoodId === 'number' && hoodId >= 1) {
    const prov = findProvinceForHood(hoodId);
    if (prov && DIVAR_CITY_ID_BY_PROVINCE[prov.id]) return DIVAR_CITY_ID_BY_PROVINCE[prov.id];
  }
  if (DIVAR_CITY_ID_BY_PROVINCE[city]) return DIVAR_CITY_ID_BY_PROVINCE[city];
  if (city === 'karaj') return '2';
  if (city === 'mashhad') return '3';
  if (city === 'isfahan') return '4';
  if (city === 'shiraz') return '6';
  return '1';
}
export function formatProvinceDirectoryIntlSummary(referenceMillion = 9500, unit: AreaUnit = 'sqm', currency: IntlCurrencyCode = 'USD'): { displayAreaUnitLabel: string; referenceValuationIntlText: string } {
  return { displayAreaUnitLabel: formatAreaUnitLabel(unit), referenceValuationIntlText: formatMillionTomanAsIntlCurrency(referenceMillion, currency) };
}
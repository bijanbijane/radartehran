/**
 * @file server/modules/property-services/propertyServicesCategories.ts
 * @description Configurable, extensible catalog of real-estate services across 5 core groups + future specializations.
 */

import type { ServiceCategoryDefinition, ServiceGroupType } from './propertyServicesTypes';

export const CANONICAL_SERVICE_CATEGORIES: ReadonlyArray<ServiceCategoryDefinition> = [
  // --- Group A: Construction and Building ---
  {
    id: 'cat_gen_contractor',
    group: 'construction_building',
    titleFa: 'پیمانکاری عمومی و مدیریت پیمان',
    descriptionFa: 'پیمانکاران عمومی، مدیریت پیمان و اجرای کامل پروژه‌های ساختمانی از تخریب تا کلیدتحویل',
    keywordsFa: ['پیمانکار', 'مجری', 'مدیریت پیمان', 'ساخت و ساز', 'اسکلت'],
    requiresProfessionalLicense: true,
    isActive: true,
  },
  {
    id: 'cat_architect',
    group: 'construction_building',
    titleFa: 'مهندسی معماری و طراحی نقشه',
    descriptionFa: 'طراحی فاز ۱ و ۲ معماری، اخذ جواز ساخت، پروانه شهرداری و نقشه‌های مصوب',
    keywordsFa: ['معمار', 'نقشه کشی', 'طراحی پلان', 'پروانه شهرداری'],
    requiresProfessionalLicense: true,
    isActive: true,
  },
  {
    id: 'cat_structural_eng',
    group: 'construction_building',
    titleFa: 'مهندسی سازه و محاسبات ایستایی',
    descriptionFa: 'محاسبه بارهای ثقلی و لرزه‌ای، بهینه‌سازی آهن‌آلات و دفترچه‌های محاسباتی رسمی',
    keywordsFa: ['محاسب', 'مهندس سازه', 'طراحی اسکلت', 'نظام مهندسی'],
    requiresProfessionalLicense: true,
    isActive: true,
  },
  {
    id: 'cat_civil_supervisor',
    group: 'construction_building',
    titleFa: 'مهندسی ناظر و نظارت مقیم کارگاهی',
    descriptionFa: 'ناظران پایه یک، دو و سه سازمان نظام مهندسی، کنترل گزارش‌های مرحله‌ای شهرداری',
    keywordsFa: ['ناظر', 'نظارت ساختمان', 'گزارش خلاف', 'پایانکار'],
    requiresProfessionalLicense: true,
    isActive: true,
  },
  {
    id: 'cat_concrete_foundation',
    group: 'construction_building',
    titleFa: 'اجرای فونداسیون و اسکلت بتنی',
    descriptionFa: 'آرماتوربندی، بتن‌ریزی با پمپ، دال و سقف‌های وافل، یوبوت و تیرچه بلوک',
    keywordsFa: ['بتن ریزی', 'فونداسیون', 'وافل', 'قالب بندی'],
    requiresProfessionalLicense: false,
    isActive: true,
  },
  {
    id: 'cat_facade',
    group: 'construction_building',
    titleFa: 'طراحی و اجرای نمای ساختمان',
    descriptionFa: 'اجرای نمای رومی، کلاسیک، مدرن، سنگ، آجرنسوز، ترمووود و شیشه کرتین‌وال با شاسی‌کشی مهندسی',
    keywordsFa: ['نما', 'سنگ نما', 'شاسی کشی', 'نمای رومی', 'کرتین وال'],
    requiresProfessionalLicense: false,
    isActive: true,
  },

  // --- Group B: Renovation and Interior Work ---
  {
    id: 'cat_interior_design',
    group: 'renovation_interior',
    titleFa: 'طراحی دکوراسیون و معماری داخلی',
    descriptionFa: 'طراحی سه بعدی (3D Max/Revit)، بازسازی صفر تا صد منازل مسکونی و فضاهای اداری',
    keywordsFa: ['طراحی داخلی', 'دکوراسیون', 'چیدمان', 'رندر'],
    requiresProfessionalLicense: false,
    isActive: true,
  },
  {
    id: 'cat_cabinet_maker',
    group: 'renovation_interior',
    titleFa: 'کابینت‌سازی، کمد دیواری و نجاری مدرن',
    descriptionFa: 'ساخت و نصب کابینت‌های های‌گلاس، انزو، ممبران، روکش چوب، کمد دیواری و تی‌وی‌وال',
    keywordsFa: ['کابینت', 'های گلاس', 'ام دی اف', 'کمد دیواری'],
    requiresProfessionalLicense: false,
    isActive: true,
  },
  {
    id: 'cat_painting_plaster',
    group: 'renovation_interior',
    titleFa: 'نقاشی ساختمان، گچ‌کاری و پتینه‌کاری',
    descriptionFa: 'رنگ‌آمیزی روغنی، پلاستیک، اکرلیک، گچ‌بری مدرن و سنتی، اجرای پتینه و ورق طلا',
    keywordsFa: ['نقاشی', 'رنگ روغنی', 'اکرلیک', 'پتینه', 'گچبری'],
    requiresProfessionalLicense: false,
    isActive: true,
  },
  {
    id: 'cat_tile_flooring',
    group: 'renovation_interior',
    titleFa: 'کاشی‌کاری، سرامیک، پارکت و لمینت',
    descriptionFa: 'نصب اسلب‌های سایز بزرگ، سرامیک پرسلان، سنگ‌کاری کف و اجرای پارکت چوبی و لمینت',
    keywordsFa: ['کاشی', 'سرامیک', 'اسلب', 'پارکت', 'لمینت'],
    requiresProfessionalLicense: false,
    isActive: true,
  },
  {
    id: 'cat_door_window',
    group: 'renovation_interior',
    titleFa: 'درب ضدسرقت، پنجره دوجداره و شیشه سکوریت',
    descriptionFa: 'تولید و نصب پنجره‌های عایق صدا و گردوغبار UPVC و آلومینیوم ترمال‌بریک و درب‌های امنیتی',
    keywordsFa: ['پنجره دوجداره', 'یو پی وی سی', 'درب ضد سرقت', 'شیشه سکوریت'],
    requiresProfessionalLicense: false,
    isActive: true,
  },

  // --- Group C: Building Repairs and Maintenance ---
  {
    id: 'cat_electrician',
    group: 'repairs_maintenance',
    titleFa: 'برق‌کاری، تابلو برق و هوشمندسازی ساختمان',
    descriptionFa: 'عیب‌یابی اتصالی، سیم‌کشی ساختمانی، مونتاژ تابلو برق، آیفون تصویری و اتوماسیون روشنایی',
    keywordsFa: ['برقکار', 'اتصالی', 'تابلو برق', 'آیفون', 'هوشمندسازی'],
    requiresProfessionalLicense: true,
    isActive: true,
  },
  {
    id: 'cat_plumber',
    group: 'repairs_maintenance',
    titleFa: 'لوله‌کشی، تاسیسات آب، گاز و فاضلاب',
    descriptionFa: 'لوله‌کشی پنج‌لایه، نشت‌یابی تخصصی با دستگاه، نصب شیرآلات، فرنگی و رفع نم و رطوبت',
    keywordsFa: ['لوله کش', 'نشت یابی', 'شیرآلات', 'تاسیسات', 'گازکشی'],
    requiresProfessionalLicense: true,
    isActive: true,
  },
  {
    id: 'cat_hvac_technician',
    group: 'repairs_maintenance',
    titleFa: 'تعمیر و سرویس پکیج، چیلر و موتورخانه',
    descriptionFa: 'سرویس دوره‌ای پکیج‌های دیواری، مشعل موتورخانه، چیلر جذبی و تراکمی، اسپلیت و داکت‌اسپلیت',
    keywordsFa: ['پکیج', 'موتورخانه', 'کولر گازی', 'چیلر', 'داکت اسپلیت'],
    requiresProfessionalLicense: true,
    isActive: true,
  },
  {
    id: 'cat_elevator_service',
    group: 'repairs_maintenance',
    titleFa: 'سرویس، نگهداری و استاندارد ادواری آسانسور',
    descriptionFa: 'بیمه و بازرسی ماهانه آسانسورهای هیدرولیک و کششی، رفع خرابی گیربکس، سیم‌بکسل و اخذ گواهی استاندارد',
    keywordsFa: ['آسانسور', 'سرویس آسانسور', 'استاندارد', 'بالابر'],
    requiresProfessionalLicense: true,
    isActive: true,
  },

  // --- Group D: Building Materials and Equipment ---
  {
    id: 'cat_mat_cement_block',
    group: 'materials_equipment',
    titleFa: 'تامین سیمان، گچ، آجر، بلوک و مصالح پایه',
    descriptionFa: 'عرضه مستقیم مصالح پایه از کارخانه، بلوک‌های سبک هبلکس و لیکا با گواهی استاندارد ملی',
    keywordsFa: ['سیمان', 'گچ', 'بلوک هبلکس', 'ماسه', 'آجر'],
    requiresProfessionalLicense: false,
    isActive: true,
  },
  {
    id: 'cat_mat_steel_beam',
    group: 'materials_equipment',
    titleFa: 'آهن‌آلات، میلگرد، تیرآهن و ورق فلزی',
    descriptionFa: 'فروش روز میلگرد آجدار، تیرآهن‌های سبک و سنگین، نبشی و قوطی صنعتی همراه با باسکول معتبر',
    keywordsFa: ['میلگرد', 'تیرآهن', 'آهن آلات', 'پروفیل'],
    requiresProfessionalLicense: false,
    isActive: true,
  },
  {
    id: 'cat_equip_rental',
    group: 'materials_equipment',
    titleFa: 'اجاره ابزارآلات و ماشین‌آلات ساختمانی',
    descriptionFa: 'کرایه بالابر، هیلتی، بتونیر، داربست فلزی، کمپرسور باد و تجهیزات تخصصی تخریب',
    keywordsFa: ['اجاره ابزار', 'هیلتی', 'بتونیر', 'بالابر ساختمانی', 'داربست'],
    requiresProfessionalLicense: false,
    isActive: true,
  },

  // --- Group E: Property and Real-Estate Professional Services ---
  {
    id: 'cat_property_inspection',
    group: 'property_professional',
    titleFa: 'کارشناسی فنی و ارزیابی سلامت ساختمان قبل از خرید',
    descriptionFa: 'تست رطوبت‌سنجی، عیوب پنهان تاسیسات، اسکن حرارتی اتلاف انرژی، و تطبیق نقشه‌های مصوب با وضع موجود',
    keywordsFa: ['کارشناسی ملک', 'سلامت ساختمان', 'عیوب پنهان', 'تست تاسیسات'],
    requiresProfessionalLicense: true,
    isActive: true,
  },
  {
    id: 'cat_official_valuation',
    group: 'property_professional',
    titleFa: 'کارشناس رسمی دادگستری و ارزیابی قیمت املاک',
    descriptionFa: 'ارزیابی رسمی وثیقه‌های بانکی، ارث، دعاوی حقوقی، تحدید حدود و قیمت‌گذاری کارشناسی رسمی',
    keywordsFa: ['کارشناس رسمی', 'ارزیابی دادگستری', 'قیمت گذاری رسمی', 'وثیقه'],
    requiresProfessionalLicense: true,
    isActive: true,
  },
  {
    id: 'cat_surveying_geomatics',
    group: 'property_professional',
    titleFa: 'نقشه‌برداری ثبتی، تحدید حدود و تهیه نقشه UTM',
    descriptionFa: 'تهیه نقشه‌های استاندارد کاداستر، اخذ سند تک‌برگ، مساحی اراضی و جانمایی پلاک ثبتی',
    keywordsFa: ['نقشه برداری', 'یو تی ام', 'UTM', 'تحدید حدود', 'سند تک برگ'],
    requiresProfessionalLicense: true,
    isActive: true,
  },
  {
    id: 'cat_moving_freight',
    group: 'property_professional',
    titleFa: 'باربری، اسباب‌کشی و حمل تخصصی اثاثیه',
    descriptionFa: 'حمل تخصصی پیانو، گاوصندوق، بسته‌بندی پنج‌لایه حباب‌دار و کارگران مجرب با بیمه‌نامه معتبر',
    keywordsFa: ['باربری', 'اسباب کشی', 'اثاث کشی', 'حمل پیانو', 'بسته بندی'],
    requiresProfessionalLicense: false,
    isActive: true,
  },
];

export class ServiceCategoryRegistry {
  private readonly categories = new Map<string, ServiceCategoryDefinition>();

  constructor() {
    for (const cat of CANONICAL_SERVICE_CATEGORIES) {
      this.categories.set(cat.id, cat);
    }
  }

  public getCategory(id: string): ServiceCategoryDefinition | null {
    return this.categories.get(id) || null;
  }

  public listCategories(filter?: { group?: ServiceGroupType; requiresLicense?: boolean }): ServiceCategoryDefinition[] {
    let list = Array.from(this.categories.values()).filter((c) => c.isActive);
    if (filter?.group) {
      list = list.filter((c) => c.group === filter.group);
    }
    if (filter?.requiresLicense !== undefined) {
      list = list.filter((c) => c.requiresProfessionalLicense === filter.requiresLicense);
    }
    return list;
  }

  /**
   * Extensible registry: register a new or specialized category at runtime.
   */
  public registerCustomCategory(cat: ServiceCategoryDefinition): void {
    this.categories.set(cat.id, cat);
  }
}

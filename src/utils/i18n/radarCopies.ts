export type SupportedRadarLocale = 'fa' | 'en';
export type PlannedRadarLocale = 'ar' | 'tr';

export interface RadarTopBarCopy {
  searchPlaceholder: string;
  filterBtnLabel: string;
  toolsBtnLabel: string;
}

export interface RadarGlobalNavCopy {
  home: string;
  discover: string;
  intelligence: string;
  properties: string;
  tools: string;
  more: string;
  userspace: string;
  map: string;
  searchPlaceholder: string;
  admin: string;
}

export interface RadarBottomNavCopy {
  mapLabel: string;
  filterLabel: string;
  suggestLabel: string;
  compareLabel: string;
  toolsLabel: string;
  submitLabel: string;
}

export interface RadarInspectorCopy {
  headerTitle: string;
  scorecardTab: string;
  marketTab: string;
  bargainsTabPrefix: string;
  reviewsTab: string;
  voteTab: string;
  hedonicCta: string;
}

export interface RadarLegendCopy {
  legendBtnLabel: string;
  legendHeaderTitle: string;
  metroPillLabel: string;
  trafficPillLabel: string;
  greenTitle: string;
  yellowTitle: string;
  redTitle: string;
  commuteRingsLabel: string;
  directConnectionLabel: string;
}

export interface RadarCompareCopy {
  modalTitle: string;
  inlineTitle: string;
  metricHeader: string;
  swapBtnLabel: string;
  printBtnLabel: string;
}

const TOP_BAR_COPY: Record<SupportedRadarLocale, RadarTopBarCopy> = {
  fa: {
    searchPlaceholder: 'جست‌وجوی محله یا شهر...',
    filterBtnLabel: 'فیلتر بودجه',
    toolsBtnLabel: 'ابزارها',
  },
  en: {
    searchPlaceholder: 'Search neighborhood or city...',
    filterBtnLabel: 'Budget Filter',
    toolsBtnLabel: 'Tools',
  },
};

const GLOBAL_NAV_COPY: Record<SupportedRadarLocale, RadarGlobalNavCopy> = {
  fa: {
    home: 'خانه',
    discover: 'محله‌ها',
    intelligence: 'بازار',
    properties: 'املاک',
    tools: 'ابزارها',
    more: 'بیشتر',
    userspace: 'حساب کاربری',
    map: 'نقشه',
    searchPlaceholder: 'جست‌وجوی محله، ملک یا گزارش...',
    admin: 'مدیریت سیستم',
  },
  en: {
    home: 'Home',
    discover: 'Explore',
    intelligence: 'Market',
    properties: 'Listings',
    tools: 'Tools',
    more: 'More',
    userspace: 'Account',
    map: 'Map',
    searchPlaceholder: 'Search neighborhoods, deals, reports...',
    admin: 'Admin',
  },
};

const BOTTOM_NAV_COPY: Record<SupportedRadarLocale, RadarBottomNavCopy> = {
  fa: {
    mapLabel: 'نقشه',
    filterLabel: 'فیلتر بودجه',
    suggestLabel: 'پیشنهادها',
    compareLabel: 'مقایسه',
    toolsLabel: 'ابزارها',
    submitLabel: 'ثبت ملک',
  },
  en: {
    mapLabel: 'Map',
    filterLabel: 'Budget',
    suggestLabel: 'Matches',
    compareLabel: 'Compare',
    toolsLabel: 'Tools',
    submitLabel: 'List Deal',
  },
};

const INSPECTOR_COPY: Record<SupportedRadarLocale, RadarInspectorCopy> = {
  fa: {
    headerTitle: 'کارنامه و راهنمای محله',
    scorecardTab: 'کارنامه',
    marketTab: 'بازار و نمودار',
    bargainsTabPrefix: 'فایل‌های زیر قیمت',
    reviewsTab: 'نظرات ساکنان',
    voteTab: 'امکانات',
    hedonicCta: 'ماشین‌حساب هوشمند قیمت‌گذاری ملک (Hedonic)',
  },
  en: {
    headerTitle: 'Neighborhood Scorecard & Insights',
    scorecardTab: 'Scorecard',
    marketTab: 'Market & Charts',
    bargainsTabPrefix: 'Under-Market Deals',
    reviewsTab: 'Resident Reviews',
    voteTab: 'Infrastructure',
    hedonicCta: 'Hedonic Property Valuation Calculator',
  },
};

const LEGEND_COPY: Record<SupportedRadarLocale, RadarLegendCopy> = {
  fa: {
    legendBtnLabel: 'راهنمای نقشه',
    legendHeaderTitle: 'راهنمای رنگ‌ها و لایه‌های نقشه',
    metroPillLabel: 'مترو',
    trafficPillLabel: 'طرح ترافیک',
    greenTitle: 'سبز (مناسب بودجه)',
    yellowTitle: 'زرد (مرزی / قابل مذاکره)',
    redTitle: 'قرمز (فراتر از بودجه)',
    commuteRingsLabel: 'نمایش حلقه‌های فاصله مستقیم',
    directConnectionLabel: 'اتصال مستقیم مرکز محله به محل کار',
  },
  en: {
    legendBtnLabel: 'Map Legend',
    legendHeaderTitle: 'Map Colors & Spatial Layers',
    metroPillLabel: 'Metro',
    trafficPillLabel: 'Traffic Zone',
    greenTitle: 'Green (Within Budget)',
    yellowTitle: 'Yellow (Stretch / Negotiable)',
    redTitle: 'Red (Above Budget)',
    commuteRingsLabel: 'Straight-line Distance Rings',
    directConnectionLabel: 'Direct Line from Center to Work Hub',
  },
};

const COMPARE_COPY: Record<SupportedRadarLocale, RadarCompareCopy> = {
  fa: {
    modalTitle: 'مقایسه رخ‌به‌رخ دو محله',
    inlineTitle: 'مقایسه رودرروی محله‌ها',
    metricHeader: 'شاخص مقایسه',
    swapBtnLabel: 'جابه‌جایی',
    printBtnLabel: 'چاپ / PDF',
  },
  en: {
    modalTitle: 'Side-by-Side Neighborhood Comparison',
    inlineTitle: 'Compare Neighborhoods',
    metricHeader: 'Metric',
    swapBtnLabel: 'Swap',
    printBtnLabel: 'Print / PDF',
  },
};

function normLocale(locale?: string): SupportedRadarLocale {
  return locale === 'en' ? 'en' : 'fa';
}

export function getRadarTopBarCopy(locale: string = 'fa'): RadarTopBarCopy {
  return TOP_BAR_COPY[normLocale(locale)];
}

export function getRadarGlobalNavCopy(locale: string = 'fa'): RadarGlobalNavCopy {
  return GLOBAL_NAV_COPY[normLocale(locale)];
}

export function getRadarBottomNavCopy(locale: string = 'fa'): RadarBottomNavCopy {
  return BOTTOM_NAV_COPY[normLocale(locale)];
}

export function getRadarInspectorCopy(locale: string = 'fa'): RadarInspectorCopy {
  return INSPECTOR_COPY[normLocale(locale)];
}

export function getRadarLegendCopy(locale: string = 'fa'): RadarLegendCopy {
  return LEGEND_COPY[normLocale(locale)];
}

export function getRadarCompareCopy(locale: string = 'fa'): RadarCompareCopy {
  return COMPARE_COPY[normLocale(locale)];
}

export function getLocaleDirection(locale: string = 'fa'): 'rtl' | 'ltr' {
  return normLocale(locale) === 'en' ? 'ltr' : 'rtl';
}

export function detectLocaleFromEnvironment(options?: {
  urlSearch?: string;
  savedPreference?: string | null;
  navigatorLanguages?: readonly string[];
  enableAutoBrowserDetect?: boolean;
}): SupportedRadarLocale {
  if (options?.urlSearch) {
    const m = /[?&]lang=([a-zA-Z-]+)/.exec(options.urlSearch);
    if (m) {
      const code = m[1].slice(0, 2).toLowerCase();
      if (code === 'fa' || code === 'en') return code;
    }
  }
  if (options?.savedPreference) {
    const saved = options.savedPreference.trim().slice(0, 2).toLowerCase();
    if (saved === 'fa' || saved === 'en') return saved;
  }
  if (options?.enableAutoBrowserDetect && Array.isArray(options?.navigatorLanguages)) {
    for (const candidate of options.navigatorLanguages) {
      const code = String(candidate || '').trim().slice(0, 2).toLowerCase();
      if (code === 'fa' || code === 'en') return code;
    }
  }
  return 'fa';
}

export function getRadarCopy(locale: string = 'fa'): Record<string, string> {
  const l = normLocale(locale);
  return {
    ...TOP_BAR_COPY[l],
    ...GLOBAL_NAV_COPY[l],
    ...BOTTOM_NAV_COPY[l],
    ...INSPECTOR_COPY[l],
    ...LEGEND_COPY[l],
    ...COMPARE_COPY[l],
  };
}

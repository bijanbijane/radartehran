/**
 * Stage 13 — Tehran Radar Comprehensive Frontend Roadmap
 * Spec ID: RT-FE-PERFORMANCE-ARCHITECTURE-013
 * Frontend Performance & Resource Optimization Architecture (FPA-001..FPA-031,
 * 8 Performance Domains, 4 Page Groups, Core Web Vitals, Leaflet/Adaptive Profile & FPA-OUT-001..038)
 */

export const RT_FE_PERFORMANCE_ARCHITECTURE_013_SPEC_ID = 'RT-FE-PERFORMANCE-ARCHITECTURE-013' as const;

export const RT_FE_FPA_8_DOMAINS = [
  { id: '01', nameEn: 'Application Loading', titleFa: 'بارگذاری اولیه، Code Splitting و Lazy Loading' },
  { id: '02', nameEn: 'Rendering Performance', titleFa: 'بهینه‌سازی رندر React 19، انزوای کامپوننت و ثبات Layout' },
  { id: '03', nameEn: 'Data Performance', titleFa: 'کارایی API، انتقال انتخابی داده، Cache و پردازش بهینه' },
  { id: '04', nameEn: 'Map & Visualization', titleFa: 'بهینه‌سازی Leaflet، Clustering، Canvas و Downsampling نمودار' },
  { id: '05', nameEn: 'Resource Management', titleFa: 'مدیریت حافظه، جلوگیری از Leak، زمان‌بندی Main Thread و Workerها' },
  { id: '06', nameEn: 'Delivery Performance', titleFa: 'تحویل منابع در Cloudflare CDN، Edge Cache و فشرده‌سازی' },
  { id: '07', nameEn: 'Performance Observability', titleFa: 'پایش Core Web Vitals، آزمون آزمایشگاهی، RUM و بودجه عملکرد' },
  { id: '08', nameEn: 'Performance Governance', titleFa: 'استانداردها، CI Performance Gates و جلوگیری از Regression' },
] as const;

export const RT_FE_FPA_4_PAGE_GROUPS = [
  { group: 'A', priority: 'critical', titleFa: 'صفحات حیاتی و پرتراکنش', examplesFa: 'خانه، نقشه اصلی، جست‌وجو، شناسنامه ملک، محله، داشبورد بازار، ارزش‌گذاری' },
  { group: 'B', priority: 'high', titleFa: 'صفحات تخصصی تحلیلی', examplesFa: 'حمل‌ونقل، جمعیت، عرضه و تقاضا، ساخت‌وساز، گزارش‌ها و پژوهش‌های محله' },
  { group: 'C', priority: 'normal', titleFa: 'صفحات مدیریتی و عملیاتی', examplesFa: 'پنل مدیریت، جداول بزرگ، مدیریت منابع و آگهی‌ها، نظارت عملیاتی' },
  { group: 'D', priority: 'low', titleFa: 'صفحات محتوایی کم‌تراکنش', examplesFa: 'راهنما، درباره سامانه، مستندات و صفحات توضیحی با حداقل JS' },
] as const;

export const RT_FE_FPA_CWV_TARGETS = {
  lcpMaxMs: 2500,
  inpMaxMs: 200,
  clsMax: 0.1,
  longTaskThresholdMs: 50,
} as const;

export const RT_FE_FPA_31_UNITS = Array.from({ length: 31 }, (_, idx) => {
  const num = String(idx + 1).padStart(3, '0');
  const titles = [
    'اصول بنیادین معماری عملکرد', 'معماری کلان ۸بخشی عملکرد فرانت‌اند', 'طبقه‌بندی ۴گانه اهمیت عملکردی صفحات',
    'بارگذاری اولیه برنامه و Critical Path', 'معماری Code Splitting (Route / Feature / Component)', 'معماری Lazy Loading و خطای Chunk',
    'بهینه‌سازی Bundle و Dependency Registry', 'بهینه‌سازی رندر React 19 و انزوای کامپوننت', 'مدیریت DOM، Virtualization و جلوگیری از Layout Shift',
    'بهینه‌سازی تصاویر، فرمت AVIF/WebP و R2 Delivery', 'معماری بهینه‌سازی نقشه Leaflet و GeoJSON', 'بهینه‌سازی نمودارها، Downsampling و Aggregation',
    'معماری Web Workers و قرارداد پیام خارج از Main Thread', 'مدیریت حافظه، Object URL و آزمون نشست طولانی', 'مدیریت CPU، زمان‌بندی Main Thread و Long Tasks',
    'مدیریت شبکه، Request Budget و Debounce/Throttle', 'معماری CDN و Edge Delivery در Cloudflare', 'مدیریت بهینه فونت Vazirmatn و آیکون‌های SVG',
    'معماری PWA، Service Worker و ناسازگاری نسخه‌ها', 'استاندارد Core Web Vitals (LCP, INP, CLS)', 'معماری Performance Budget و مدیریت تخطی',
    'معماری پایش عملکرد (Lab, Field, System)', 'عملکرد در دستگاه‌های ضعیف و Adaptive Rendering', 'معماری انیمیشن‌های کم‌هزینه و Reduced Motion',
    'مدیریت فایل، پیش‌نمایش و Export خارج از Main Thread', 'هماهنگی ۶لایه Cache عملکردی', 'طبقه‌بندی خطاهای عملکردی (Chunk/Timeout/Memory)',
    'معماری ۸گانه آزمون عملکرد و Long Session', 'جلوگیری از Performance Regression و CI Gate', 'ساختار فایل‌های اجرایی عملکرد (src/performance)',
    'نقش‌ها، مسئولیت‌ها و چرخه حوادث عملکردی',
  ];
  return { id: `FPA-${num}`, titleFa: titles[idx] ?? `FPA-${num}` };
});

export const RT_FE_FPA_DELIVERABLES_38 = Array.from({ length: 38 }, (_, idx) => {
  const num = String(idx + 1).padStart(3, '0');
  const titles = [
    'Frontend Performance Charter', 'Page Performance Classification', 'Performance Registry', 'Initial Loading Architecture',
    'Critical Rendering Path', 'Code Splitting Strategy', 'Lazy Loading Policy', 'Bundle Optimization Specification',
    'Dependency Registry', 'React Rendering Optimization Standard', 'Component Isolation Policy', 'DOM & Layout Optimization Standard',
    'Virtualization Architecture', 'Image Optimization Pipeline', 'Font & Icon Loading Policy', 'Map Performance Architecture',
    'GeoJSON Optimization Specification', 'Chart Performance Architecture', 'Web Worker Architecture', 'Memory Management Policy',
    'Main Thread Scheduling Standard', 'Network Performance Budget', 'CDN & Edge Delivery Architecture', 'PWA Performance Strategy',
    'Core Web Vitals Standard', 'Performance Budget Registry', 'Performance Monitoring Specification', 'Adaptive Rendering Policy',
    'Animation Performance Standard', 'File Processing Performance Policy', 'Cache Performance Coordination', 'Performance Error Recovery Policy',
    'Performance Testing Specification', 'Performance Regression Prevention', 'CI Performance Gate Specification', 'Performance Ownership Matrix',
    'Performance Optimization Roadmap', 'Performance Architecture Documentation',
  ];
  return { id: `FPA-OUT-${num}`, titleFa: titles[idx] ?? `FPA-OUT-${num}` };
});

/**
 * Evaluates Core Web Vitals & Long-Task compliance against Stage 13 targets (FPA-020 / FPA-021).
 */
export function evaluatePagePerformanceBudget(metrics: {
  lcpMs: number;
  inpMs: number;
  cls: number;
  longTaskCount: number;
}): {
  withinBudget: boolean;
  failingMetrics: string[];
  grade: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'BUDGET_VIOLATION';
} {
  const failingMetrics: string[] = [];
  if (metrics.lcpMs > RT_FE_FPA_CWV_TARGETS.lcpMaxMs) failingMetrics.push('LCP');
  if (metrics.inpMs > RT_FE_FPA_CWV_TARGETS.inpMaxMs) failingMetrics.push('INP');
  if (metrics.cls > RT_FE_FPA_CWV_TARGETS.clsMax) failingMetrics.push('CLS');
  if (metrics.longTaskCount > 3) failingMetrics.push('LONG_TASKS');

  const grade =
    failingMetrics.length === 0 ? 'GOOD' : failingMetrics.length === 1 ? 'NEEDS_IMPROVEMENT' : 'BUDGET_VIOLATION';
  return { withinBudget: failingMetrics.length === 0, failingMetrics, grade };
}

/**
 * Resolves Adaptive Feature Mode & Leaflet rendering strategy based on device capability & zoom (FPA-011 / FPA-023).
 */
export function resolveAdaptiveRenderingProfile(input: {
  deviceMemoryGb: number;
  reducedMotion: boolean;
  markerCount: number;
  zoomLevel: number;
}): {
  adaptiveMode: 'Full' | 'Balanced' | 'Lite';
  markerStrategy: 'individual' | 'cluster' | 'canvas' | 'aggregated';
  geometrySimplification: 'high_detail' | 'medium_simplified' | 'coarse_simplified';
  animationsEnabled: boolean;
} {
  const adaptiveMode: 'Full' | 'Balanced' | 'Lite' =
    input.deviceMemoryGb <= 2 || input.reducedMotion
      ? 'Lite'
      : input.deviceMemoryGb <= 4
        ? 'Balanced'
        : 'Full';

  const markerStrategy: 'individual' | 'cluster' | 'canvas' | 'aggregated' =
    input.zoomLevel <= 10
      ? 'aggregated'
      : input.markerCount > 400
        ? 'canvas'
        : input.markerCount > 60 || input.zoomLevel <= 13
          ? 'cluster'
          : 'individual';

  const geometrySimplification =
    input.zoomLevel <= 11
      ? 'coarse_simplified'
      : input.zoomLevel <= 14
        ? 'medium_simplified'
        : 'high_detail';

  return {
    adaptiveMode,
    markerStrategy,
    geometrySimplification,
    animationsEnabled: !input.reducedMotion && adaptiveMode !== 'Lite',
  };
}

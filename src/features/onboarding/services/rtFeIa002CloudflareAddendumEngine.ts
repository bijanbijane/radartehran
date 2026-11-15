/**
 * RT-FE-IA-002-CF-001: متمم معماری اطلاعات و مسیریابی برای استقرار روی Cloudflare
 * (Cloudflare Workers Static Assets + React SPA + Edge API Proxy & Security Alignment)
 */

export const RT_FE_IA_002_CF_001_SPEC_ID = 'RT-FE-IA-002-CF-001' as const;

export type CfRoutingOwnerLayer = 'cloudflare_static_assets' | 'cloudflare_worker_plus_react_router' | 'cloudflare_worker_edge_proxy';

export interface CfDualRoutingRow {
  pathPattern: string;
  requestType: string;
  handlingLayer: CfRoutingOwnerLayer;
  expectedBehaviorFa: string;
}

export const CF_DUAL_ROUTING_TABLE_10: readonly CfDualRoutingRow[] = [
  { pathPattern: '/', requestType: 'صفحه اصلی', handlingLayer: 'cloudflare_worker_plus_react_router', expectedBehaviorFa: 'تحویل index.html و رندر صفحه اصلی' },
  { pathPattern: '/map', requestType: 'صفحه نقشه', handlingLayer: 'cloudflare_worker_plus_react_router', expectedBehaviorFa: 'تحویل index.html و فعال‌سازی مسیر نقشه' },
  { pathPattern: '/properties', requestType: 'لیست املاک', handlingLayer: 'cloudflare_worker_plus_react_router', expectedBehaviorFa: 'تحویل index.html و بارگذاری ماژول املاک' },
  { pathPattern: '/properties/:id', requestType: 'صفحه جزئیات ملک', handlingLayer: 'cloudflare_worker_plus_react_router', expectedBehaviorFa: 'تحویل index.html و واکشی داده ملک از API' },
  { pathPattern: '/neighborhoods/:id', requestType: 'صفحه محله', handlingLayer: 'cloudflare_worker_plus_react_router', expectedBehaviorFa: 'تحویل index.html و واکشی داده محله' },
  { pathPattern: '/account/profile', requestType: 'حساب کاربری', handlingLayer: 'cloudflare_worker_plus_react_router', expectedBehaviorFa: 'تحویل index.html و بررسی ورود کاربر در Route Guard' },
  { pathPattern: '/admin', requestType: 'پنل مدیریت', handlingLayer: 'cloudflare_worker_plus_react_router', expectedBehaviorFa: 'تحویل index.html و بررسی نقش مدیر' },
  { pathPattern: '/assets/*', requestType: 'فایل‌های استاتیک', handlingLayer: 'cloudflare_static_assets', expectedBehaviorFa: 'تحویل مستقیم فایل بدون اجرای React Router' },
  { pathPattern: '/api/*', requestType: 'درخواست API', handlingLayer: 'cloudflare_worker_edge_proxy', expectedBehaviorFa: 'هدایت به بک‌اند یا سرویس API با run_worker_first' },
  { pathPattern: '/robots.txt', requestType: 'فایل عمومی', handlingLayer: 'cloudflare_static_assets', expectedBehaviorFa: 'تحویل مستقیم فایل' },
];

export interface CfEnvironmentIsolationProfile {
  envKey: 'dev' | 'staging' | 'production';
  workerName: string;
  domainPattern: string;
  apiBaseUrlVar: string;
  explicitBindingsNoteFa: string;
  secretsAllowedInViteBundle: false;
}

export const CF_ISOLATED_ENVIRONMENTS_3: readonly CfEnvironmentIsolationProfile[] = [
  {
    envKey: 'dev',
    workerName: 'radar-frontend-dev',
    domainPattern: 'localhost:3000 / radar-frontend-dev.workers.dev',
    apiBaseUrlVar: 'https://dev-api.example.com',
    explicitBindingsNoteFa: 'تمام متغیرها و اتصال‌ها (Bindings) صراحتاً در بخش env.dev تعریف می‌شوند (بدون ارث‌بری خودکار)',
    secretsAllowedInViteBundle: false,
  },
  {
    envKey: 'staging',
    workerName: 'radar-frontend-staging',
    domainPattern: 'staging.<DOMAIN>',
    apiBaseUrlVar: 'https://staging-api.example.com',
    explicitBindingsNoteFa: 'محیط آزمایشی ایزوله از داده واقعی؛ تعریف صریح vars و bindings در env.staging',
    secretsAllowedInViteBundle: false,
  },
  {
    envKey: 'production',
    workerName: 'radar-frontend-production',
    domainPattern: '<DOMAIN>',
    apiBaseUrlVar: 'https://api.example.com',
    explicitBindingsNoteFa: 'محیط عملیاتی با upload_source_maps: true، بدون افشای کلید محرمانه در متغیرهای VITE_*',
    secretsAllowedInViteBundle: false,
  },
];

export interface CfCacheTierRule {
  resourceCategoryFa: string;
  pathMatch: string;
  cacheControlHeader: string;
  rationaleFa: string;
}

export const CF_CACHE_POLICIES_8: readonly CfCacheTierRule[] = [
  { resourceCategoryFa: 'فایل اصلی برنامه (index.html)', pathMatch: '/index.html', cacheControlHeader: 'public, max-age=0, must-revalidate', rationaleFa: 'دریافت فوری نسخه جدید پس از هر انتشار و جلوگیری از عدم تطابق نسخه' },
  { resourceCategoryFa: 'باندل‌های جاوااسکریپت هش‌شده', pathMatch: '/assets/*.js', cacheControlHeader: 'public, max-age=31536000, immutable', rationaleFa: 'نام فایل با تغییر محتوا عوض می‌شود؛ کش طولانی‌مدت ایمن است' },
  { resourceCategoryFa: 'فایل‌های استایل هش‌شده', pathMatch: '/assets/*.css', cacheControlHeader: 'public, max-age=31536000, immutable', rationaleFa: 'کش یک‌ساله با هش محتوایی' },
  { resourceCategoryFa: 'فونت‌ها', pathMatch: '/assets/*.woff2', cacheControlHeader: 'public, max-age=31536000, immutable', rationaleFa: 'حذف بارگذاری تکراری فونت فارسی در مرورگر' },
  { resourceCategoryFa: 'آیکن‌ها و تصاویر ثابت', pathMatch: '/favicon.ico, /icons/*', cacheControlHeader: 'public, max-age=86400', rationaleFa: 'کش میان‌مدت با قابلیت به‌روزرسانی روزانه' },
  { resourceCategoryFa: 'پاسخ‌های عمومی API', pathMatch: '/api/public/*', cacheControlHeader: 'public, max-age=60, s-maxage=120', rationaleFa: 'کش کوتاه‌مدت کنترل‌شده در لبه شبکه' },
  { resourceCategoryFa: 'پاسخ‌های شخصی کاربر', pathMatch: '/api/account/*', cacheControlHeader: 'private, no-store', rationaleFa: 'منع کامل کش عمومی برای داده‌های شخصی کاربر' },
  { resourceCategoryFa: 'پاسخ‌های پنل مدیریت', pathMatch: '/api/admin/*', cacheControlHeader: 'private, no-store', rationaleFa: 'منع کامل کش برای عملیات حساس مدیریتی' },
];

export interface CfSecurityHeaderSpec {
  headerName: string;
  recommendedValue: string;
  purposeFa: string;
  appliedOn: 'static_headers_file' | 'worker_and_static';
}

export const CF_SECURITY_HEADERS_5: readonly CfSecurityHeaderSpec[] = [
  { headerName: 'X-Content-Type-Options', recommendedValue: 'nosniff', purposeFa: 'جلوگیری از حدس زدن نادرست نوع فایل توسط مرورگر', appliedOn: 'worker_and_static' },
  { headerName: 'X-Frame-Options', recommendedValue: 'DENY', purposeFa: 'جلوگیری از بارگذاری غیرمجاز سایت داخل iframe بیگانه', appliedOn: 'worker_and_static' },
  { headerName: 'Referrer-Policy', recommendedValue: 'strict-origin-when-cross-origin', purposeFa: 'کنترل ارسال اطلاعات ارجاع بین دامنه‌ها', appliedOn: 'worker_and_static' },
  { headerName: 'Permissions-Policy', recommendedValue: 'geolocation=(self), camera=(), microphone=()', purposeFa: 'محدودسازی دسترسی به امکانات حساس مرورگر', appliedOn: 'worker_and_static' },
  { headerName: 'Content-Security-Policy', recommendedValue: "default-src 'self'; connect-src 'self' https:; img-src 'self' data: https:;", purposeFa: 'محدودسازی منابع مجاز اسکریپت، استایل و شبکه', appliedOn: 'worker_and_static' },
];

export interface CfRedirectMatrixRow {
  redirectTypeFa: string;
  implementationLayer: 'cloudflare_edge' | 'react_router_client';
  reasonFa: string;
}

export const CF_REDIRECT_MATRIX_6: readonly CfRedirectMatrixRow[] = [
  { redirectTypeFa: 'تغییر دامنه (www به دامنه اصلی)', implementationLayer: 'cloudflare_edge', reasonFa: 'انجام تغییر مسیر پیش از بارگذاری برنامه در لبه شبکه' },
  { redirectTypeFa: 'هدایت HTTP به HTTPS', implementationLayer: 'cloudflare_edge', reasonFa: 'الزام امنیتی در سطح لبه شبکه' },
  { redirectTypeFa: 'مسیرهای قدیمی عمومی (/property/:id به /properties/:id)', implementationLayer: 'cloudflare_edge', reasonFa: 'حفظ سئو و سرعت پاسخ با کد 301 یا اجرای مکمل در کلاینت' },
  { redirectTypeFa: 'هدایت کاربر واردنشده به صفحه ورود (/auth/login)', implementationLayer: 'react_router_client', reasonFa: 'وابسته به وضعیت نشست کاربر و حفظ redirect پس از ورود' },
  { redirectTypeFa: 'هدایت کاربر فاقد مجوز به /403', implementationLayer: 'react_router_client', reasonFa: 'وابسته به نقش و مجوز کاربر در Access Guard' },
  { redirectTypeFa: 'تغییر مسیرهای داخلی رابط کاربری', implementationLayer: 'react_router_client', reasonFa: 'تجربه کاربری بدون رفرش کامل صفحه' },
];

export interface CfWorkerEdgeSimulationInput {
  requestUrl: string;
  configuredApiOrigin?: string;
  userSuppliedTargetOverride?: string;
  clientBuildVersion?: string;
  edgeActiveBuildVersion?: string;
}

export interface CfWorkerEdgeSimulationResult {
  pathname: string;
  handledBy: 'worker_api_proxy' | 'worker_edge_redirect' | 'static_asset_immutable' | 'spa_index_html_fallback';
  statusCode: number;
  contentType: 'application/json' | 'text/html' | 'application/javascript' | 'text/plain';
  cacheControl: string;
  proxiedUpstreamUrl: string | null;
  openProxyBlocked: boolean;
  directDataBindingExposedToBrowser: false;
  versionSkewDetected: boolean;
  versionSkewAction: 'NONE' | 'PROMPT_SAFE_RELOAD_ON_CHUNK_MISS';
  summaryFa: string;
}

/**
 * Simulates the Cloudflare Frontend Worker (`worker/index.ts`) request handling rules (`CF-IA-001`..`CF-IA-015`).
 */
export function simulateCloudflareWorkerRequest(input: CfWorkerEdgeSimulationInput): CfWorkerEdgeSimulationResult {
  const parsed = new URL(input.requestUrl, 'https://radar.tehran.ir');
  const pathname = parsed.pathname;
  const fixedOrigin = (input.configuredApiOrigin ?? 'https://api.example.com').replace(/\/+$/, '');
  const openProxyBlocked = Boolean(
    input.userSuppliedTargetOverride || parsed.searchParams.has('targetUrl') || parsed.searchParams.has('proxyHost'),
  );
  const versionSkewDetected = Boolean(
    input.clientBuildVersion &&
      input.edgeActiveBuildVersion &&
      input.clientBuildVersion !== input.edgeActiveBuildVersion,
  );

  // 1. Edge Redirect for legacy singular path `/property/:id` -> `/properties/:id`
  const legacyPropertyMatch = pathname.match(/^\/property\/([^/]+)$/);
  if (legacyPropertyMatch) {
    return {
      pathname,
      handledBy: 'worker_edge_redirect',
      statusCode: 301,
      contentType: 'text/plain',
      cacheControl: 'public, max-age=3600',
      proxiedUpstreamUrl: `/properties/${legacyPropertyMatch[1]}${parsed.search}`,
      openProxyBlocked,
      directDataBindingExposedToBrowser: false,
      versionSkewDetected,
      versionSkewAction: 'NONE',
      summaryFa: `تغییر مسیر لبه (301) از ${pathname} به /properties/${legacyPropertyMatch[1]}`,
    };
  }

  // 2. API Proxy (`run_worker_first: ["/api/*"]`) — NEVER returns index.html
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    const isInvalidApiRoute = pathname === '/api/invalid' || pathname.startsWith('/api/unknown');
    const isPrivateScope = pathname.startsWith('/api/account') || pathname.startsWith('/api/admin');
    return {
      pathname,
      handledBy: 'worker_api_proxy',
      statusCode: isInvalidApiRoute ? 404 : 200,
      contentType: 'application/json',
      cacheControl: isPrivateScope ? 'private, no-store' : 'public, max-age=60, s-maxage=120',
      proxiedUpstreamUrl: `${fixedOrigin}${pathname}${parsed.search}`,
      openProxyBlocked,
      directDataBindingExposedToBrowser: false,
      versionSkewDetected,
      versionSkewAction: 'NONE',
      summaryFa: isInvalidApiRoute
        ? 'خطای استاندارد JSON (404) از لایه Worker؛ هرگز index.html برای /api/* برگردانده نمی‌شود.'
        : `هدایت امن درخواست API به مقصد ثابت سرور (${fixedOrigin}) بدون افشای توکن در لاگ.`,
    };
  }

  // 3. Static Assets (`/assets/*`, `/robots.txt`, `/favicon.ico`)
  if (pathname.startsWith('/assets/') || pathname === '/robots.txt' || pathname === '/favicon.ico') {
    const isHashedBundle = pathname.startsWith('/assets/') && (pathname.endsWith('.js') || pathname.endsWith('.css') || pathname.endsWith('.woff2'));
    return {
      pathname,
      handledBy: 'static_asset_immutable',
      statusCode: versionSkewDetected && isHashedBundle ? 404 : 200,
      contentType: pathname.endsWith('.js') ? 'application/javascript' : 'text/plain',
      cacheControl: isHashedBundle ? 'public, max-age=31536000, immutable' : 'public, max-age=86400',
      proxiedUpstreamUrl: null,
      openProxyBlocked,
      directDataBindingExposedToBrowser: false,
      versionSkewDetected,
      versionSkewAction: versionSkewDetected && isHashedBundle ? 'PROMPT_SAFE_RELOAD_ON_CHUNK_MISS' : 'NONE',
      summaryFa:
        versionSkewDetected && isHashedBundle
          ? 'شناسایی عدم تطابق نسخه (Version Skew) هنگام دریافت باندل قدیمی؛ هدایت ایمن به بارگذاری مجدد نسخه جدید.'
          : 'تحویل مستقیم فایل استاتیک از لبه شبکه Cloudflare بدون اجرای React Router.',
    };
  }

  // 4. SPA Fallback (`not_found_handling: "single-page-application"`)
  return {
    pathname,
    handledBy: 'spa_index_html_fallback',
    statusCode: 200,
    contentType: 'text/html',
    cacheControl: 'public, max-age=0, must-revalidate',
    proxiedUpstreamUrl: null,
    openProxyBlocked,
    directDataBindingExposedToBrowser: false,
    versionSkewDetected,
    versionSkewAction: versionSkewDetected ? 'PROMPT_SAFE_RELOAD_ON_CHUNK_MISS' : 'NONE',
    summaryFa: 'تحویل index.html با کش صفر (must-revalidate) و سپردن تحلیل مسیر به React Router در مرورگر.',
  };
}

export function validateVitePublicEnvSafety(envKeys: readonly string[]): {
  safe: boolean;
  forbiddenSecretKeys: string[];
} {
  const forbiddenSecretKeys = envKeys.filter(
    (key) => key.startsWith('VITE_') && /(SECRET|PRIVATE|TOKEN|PASSWORD|ADMIN_KEY|SERVICE_ROLE)/i.test(key),
  );
  return {
    safe: forbiddenSecretKeys.length === 0,
    forbiddenSecretKeys,
  };
}

export const CF_REQUIREMENTS_15: readonly { id: string; titleFa: string; priority: 'ضروری' | 'بالا' }[] = [
  { id: 'CF-IA-001', titleFa: 'مسیریابی تک‌صفحه‌ای (single-page-application) روی Cloudflare Workers Static Assets', priority: 'ضروری' },
  { id: 'CF-IA-002', titleFa: 'پشتیبانی بازکردن مستقیم تمام مسیرهای معتبر (/map، /properties/:id، /account/*، /admin/*)', priority: 'ضروری' },
  { id: 'CF-IA-003', titleFa: 'عدم تحویل index.html برای مسیرهای /api/* (برگشت پاسخ JSON)', priority: 'ضروری' },
  { id: 'CF-IA-004', titleFa: 'تحویل مستقیم فایل‌های استاتیک (/assets/*) بدون اجرای React Router', priority: 'ضروری' },
  { id: 'CF-IA-005', titleFa: 'منع کش طولانی‌مدت برای index.html (max-age=0, must-revalidate)', priority: 'ضروری' },
  { id: 'CF-IA-006', titleFa: 'کش طولانی‌مدت یک‌ساله (immutable) برای فایل‌های دارای هش نسخه', priority: 'ضروری' },
  { id: 'CF-IA-007', titleFa: 'جداسازی کامل محیط‌های dev، staging و production با Bindings صریح', priority: 'ضروری' },
  { id: 'CF-IA-008', titleFa: 'منع قرار دادن کلیدهای محرمانه در متغیرهای فرانت‌اند (VITE_*)', priority: 'ضروری' },
  { id: 'CF-IA-009', titleFa: 'منع دسترسی مستقیم مرورگر به منابع داخلی Cloudflare (D1, KV, R2)', priority: 'ضروری' },
  { id: 'CF-IA-010', titleFa: 'ثبت هدرهای امنیتی هم برای فایل‌های استاتیک (_headers) و هم پاسخ‌های Worker', priority: 'ضروری' },
  { id: 'CF-IA-011', titleFa: 'پشتیبانی از تغییر مسیرهای قدیمی در سطح لبه یا کلاینت', priority: 'بالا' },
  { id: 'CF-IA-012', titleFa: 'مدیریت خطای بارگذاری ماژول در زمان انتشار نسخه جدید (Version Skew)', priority: 'ضروری' },
  { id: 'CF-IA-013', titleFa: 'امکان بازگشت سریع (Rollback) به نسخه قبلی بدون تغییر ساختار مسیرها', priority: 'ضروری' },
  { id: 'CF-IA-014', titleFa: 'تولید و بارگذاری Source Map برای خطایابی محیط عملیاتی', priority: 'بالا' },
  { id: 'CF-IA-015', titleFa: 'تطابق کامل جدول مسیرهای فرانت‌اند با رفتار لبه شبکه Cloudflare', priority: 'ضروری' },
];

export const CF_TEST_SCENARIOS_14: readonly { id: string; scenarioFa: string; expectedResultFa: string }[] = [
  { id: 'CF-T01', scenarioFa: 'باز کردن مستقیم / در مرورگر', expectedResultFa: 'صفحه اصلی بدون خطا نمایش داده شود' },
  { id: 'CF-T02', scenarioFa: 'باز کردن مستقیم /map و رفرش صفحه', expectedResultFa: 'صفحه نقشه بدون خطای 404 بارگذاری شود' },
  { id: 'CF-T03', scenarioFa: 'باز کردن مستقیم /properties/PR-1024', expectedResultFa: 'index.html تحویل شود و صفحه ملک نمایش داده شود' },
  { id: 'CF-T04', scenarioFa: 'باز کردن مستقیم /account/profile بدون ورود', expectedResultFa: 'برنامه بارگذاری شود و کاربر به /auth/login هدایت گردد' },
  { id: 'CF-T05', scenarioFa: 'باز کردن مستقیم /admin با کاربر عادی', expectedResultFa: 'برنامه بارگذاری شود و صفحه /403 نمایش داده شود' },
  { id: 'CF-T06', scenarioFa: 'فراخوانی /api/health', expectedResultFa: 'پاسخ JSON از Worker یا بک‌اند برگردد، نه index.html' },
  { id: 'CF-T07', scenarioFa: 'فراخوانی مسیر نامعتبر /api/invalid', expectedResultFa: 'خطای استاندارد API (404 JSON) برگردد، نه صفحه HTML' },
  { id: 'CF-T08', scenarioFa: 'بارگذاری فایل /assets/app-hash.js', expectedResultFa: 'فایل مستقیم با هدر کش immutable تحویل شود' },
  { id: 'CF-T09', scenarioFa: 'بررسی هدر کش index.html', expectedResultFa: 'مقدار must-revalidate و max-age=0 برقرار باشد' },
  { id: 'CF-T10', scenarioFa: 'باز کردن مسیر قدیمی /property/PR-1024', expectedResultFa: 'تغییر مسیر به /properties/PR-1024 انجام شود' },
  { id: 'CF-T11', scenarioFa: 'باز کردن مسیر نامعتبر /unknown-page', expectedResultFa: 'صفحه 404 استاندارد برنامه نمایش داده شود' },
  { id: 'CF-T12', scenarioFa: 'انتشار نسخه جدید در حین باز بودن برنامه در مرورگر', expectedResultFa: 'در صورت خطای بارگذاری ماژول، پیام مناسب یا بارگذاری مجدد ایمن انجام شود' },
  { id: 'CF-T13', scenarioFa: 'بررسی کد نهایی جاوااسکریپت', expectedResultFa: 'هیچ کلید محرمانه‌ای در باندل وجود نداشته باشد' },
  { id: 'CF-T14', scenarioFa: 'بررسی محیط staging و production', expectedResultFa: 'هر محیط به آدرس API مخصوص خود متصل باشد' },
];

export const CF_DELIVERABLES_12: readonly { id: string; titleFa: string }[] = [
  { id: 'CF-OUT-01', titleFa: 'الگوی رسمی استقرار فرانت‌اند رادار تهران روی Cloudflare Workers' },
  { id: 'CF-OUT-02', titleFa: 'جدول تفکیک مسیریابی لبه شبکه و مسیریابی داخل مرورگر' },
  { id: 'CF-OUT-03', titleFa: 'ساختار استاندارد فایل‌ها و پوشه‌های مرتبط با Cloudflare' },
  { id: 'CF-OUT-04', titleFa: 'الگوی استاندارد تنظیمات Wrangler برای محیط‌های مختلف' },
  { id: 'CF-OUT-05', titleFa: 'سیاست مدیریت محیط‌های dev، staging و production' },
  { id: 'CF-OUT-06', titleFa: 'سیاست کش فایل‌های استاتیک، index.html و مسیرهای API' },
  { id: 'CF-OUT-07', titleFa: 'ضوابط امنیتی هدرها و مسیرهای حساس در لبه شبکه' },
  { id: 'CF-OUT-08', titleFa: 'جدول تصمیم‌گیری تغییر مسیر در لبه شبکه یا داخل فرانت‌اند' },
  { id: 'CF-OUT-09', titleFa: 'فرایند انتشار، پیش‌نمایش، کنترل نسخه و بازگشت سریع' },
  { id: 'CF-OUT-10', titleFa: 'فهرست آزمون‌های الزامی استقرار و مسیریابی روی Cloudflare' },
  { id: 'CF-OUT-11', titleFa: 'فهرست خطاهای رایج استقرار SPA روی Cloudflare و روش پیشگیری' },
  { id: 'CF-OUT-12', titleFa: 'معیارهای پذیرش نهایی هم‌راستاسازی مرحله دوم با Cloudflare' },
];

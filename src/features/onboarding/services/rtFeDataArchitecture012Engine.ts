/**
 * Stage 12 — Tehran Radar Comprehensive Frontend Roadmap
 * Spec ID: RT-FE-DATA-ARCHITECTURE-012
 * Frontend Data Architecture & State Management (5 State Tiers, Query Key Normalizer,
 * Tag-Based Cache Invalidation, Version Conflict, Optimistic Gate, Privacy Telemetry & RT-DATA-OUT-001..025)
 */

export * from './rtFeDataArchitecture012Specs';

export const RT_FE_DATA_ARCHITECTURE_012_SPEC_ID = 'RT-FE-DATA-ARCHITECTURE-012' as const;

export const RT_FE_FDA_STATE_CLASSIFICATION_5 = [
  { tier: 'SERVER STATE', examplesFa: 'مشخصات ملک، داده محله، آگهی‌ها، معاملات، شاخص‌های بازار، گزارش‌ها', storageFa: 'TanStack Query / Repository Cache' },
  { tier: 'CLIENT STATE', examplesFa: 'تب فعال، بازبودن Sidebar/Modal، حالت نمایش نقشه/فهرست، Tooltip', storageFa: 'React State / Feature Context' },
  { tier: 'URL STATE', examplesFa: 'شناسه محله، فیلتر قیمت، نوع ملک، محدوده نقشه، مرتب‌سازی، صفحه', storageFa: 'URL Search Params / Router' },
  { tier: 'FORM STATE', examplesFa: 'فرم ثبت ملک، ثبت آگهی و ویرایش پروفایل (۱۰ وضعیت + پیش‌نویس ایمن)', storageFa: 'Form Boundary State' },
  { tier: 'DERIVED STATE', examplesFa: 'میانگین قیمت هر متر، تعداد نتایج فیلترشده، نسبت معامله به آگهی', storageFa: 'Pure Selectors / Memoized ViewModels' },
] as const;

export interface FdaCachePolicySpec {
  dataCategoryFa: string;
  staleTimeMs: number;
  gcTimeMs: number;
  persistAllowed: boolean;
  invalidateOnMutation: boolean;
  publicCacheSafe: boolean;
}

export const RT_FE_FDA_CACHE_POLICIES_9: readonly FdaCachePolicySpec[] = [
  { dataCategoryFa: 'اطلاعات ثابت جغرافیایی', staleTimeMs: 3_600_000, gcTimeMs: 86_400_000, persistAllowed: true, invalidateOnMutation: false, publicCacheSafe: true },
  { dataCategoryFa: 'مشخصات عمومی محله', staleTimeMs: 300_000, gcTimeMs: 1_800_000, persistAllowed: false, invalidateOnMutation: true, publicCacheSafe: true },
  { dataCategoryFa: 'اطلاعات ساختمان و ملک', staleTimeMs: 120_000, gcTimeMs: 900_000, persistAllowed: false, invalidateOnMutation: true, publicCacheSafe: true },
  { dataCategoryFa: 'آگهی‌های فعال بازار', staleTimeMs: 45_000, gcTimeMs: 300_000, persistAllowed: false, invalidateOnMutation: true, publicCacheSafe: true },
  { dataCategoryFa: 'قیمت‌های بازار و شاخص‌ها', staleTimeMs: 180_000, gcTimeMs: 900_000, persistAllowed: false, invalidateOnMutation: true, publicCacheSafe: true },
  { dataCategoryFa: 'داده‌های زنده و عملیاتی', staleTimeMs: 5_000, gcTimeMs: 60_000, persistAllowed: false, invalidateOnMutation: true, publicCacheSafe: false },
  { dataCategoryFa: 'اطلاعات حساب کاربر (خصوصی)', staleTimeMs: 0, gcTimeMs: 120_000, persistAllowed: false, invalidateOnMutation: true, publicCacheSafe: false },
  { dataCategoryFa: 'وضعیت عملیات حساس', staleTimeMs: 0, gcTimeMs: 0, persistAllowed: false, invalidateOnMutation: true, publicCacheSafe: false },
  { dataCategoryFa: 'خروجی گزارش‌های نسخه‌بندی‌شده', staleTimeMs: 3_600_000, gcTimeMs: 21_600_000, persistAllowed: true, invalidateOnMutation: false, publicCacheSafe: true },
] as const;

export type FdaCacheTag =
  | `property:${string}`
  | `building:${string}`
  | `neighborhood:${string}`
  | `listing:${string}`
  | `market:${string}`
  | `report:${string}`;

export const RT_FE_FDA_32_UNITS = Array.from({ length: 32 }, (_, idx) => {
  const num = String(idx + 1).padStart(3, '0');
  const titles = [
    'معماری کلان جریان داده و ۱۰ تضمین اصلی', 'تفکیک ۶لایه مسئولیت (UI تا Infrastructure)',
    'طبقه‌بندی ۵گانه State (Server/Client/URL/Form/Derived)', 'چرخه ۱۰وضعیتی Form State و بازیابی پیش‌نویس',
    'مسیر اجباری مصرف داده (Hook → Query → Repo → API)', 'API Client مرکزی و ۱۴ مسئولیت ارتباطی',
    'قرارداد Base URL، محیط‌های ۴گانه و ممنوعیت Secret در VITE_*', 'قرارداد ApiResponse<T> و ApiErrorResponse بدون افشای جزئیات',
    'ساختار Feature Data Layer و پرهیز از تشریفات اضافه', 'انتخاب TanStack Query برای Server State و Zod برای Runtime',
    'ساختار استاندارد Query Key بدون توکن و نرمال‌سازی فیلترها', 'مدیریت Cache با staleTime / gcTime / Invalidation در ۹ دسته',
    'همگام‌سازی بین‌ماژولی و DataDependency Registry', 'کنترل Concurrency و Race Condition با AbortSignal',
    'استاندارد Offset و Cursor Pagination با بازنشانی فیلتر', 'معماری داده نقشه (MapViewportQuery و ۴ سطح Zoom)',
    'مدیریت داده‌های تحلیلی و AnalyticalIndicator نسخه‌مند', 'اعتبارسنجی Runtime پاسخ Backend و مهاجرت Schema',
    'مدل ۱۱وضعیتی داده و تفکیک Empty از Error و Partial', 'سیاست ۶گانه Retry و Timeout و ممنوعیت تکرار 401/403',
    'مدیریت Mutation و تفکیک Optimistic Update با Rollback', 'تعارض نسخه (VersionedEntity 409) و Idempotency Key',
    'جداسازی کش عمومی/کاربری/حساس و پاک‌سازی در Logout', 'رفتار Offline و شبکه ناپایدار بدون ثبت تکراری',
    'جریان امن فایل (Upload Auth → R2 → Verify → Metadata)', 'استقلال فرانت‌اند از Cloudflare Workers / D1 / KV / R2 / Queues',
    'DataTelemetryEvent فنی بدون کلیدفشاری، توکن و متن فرم خصوصی', 'ساختار پوشه‌های app/data و features/* و shared/data',
    'استاندارد TypeScript strict و تفکیک DTO از Domain Model', 'راهبرد آزمون ۵سطحی و ۲۴ سناریوی اجباری',
    'نقشه اجرای تدریجی ۲۰گامی مرحله دوازدهم', 'خروجی‌های ۲۵گانه RT-DATA-OUT و معیارهای پذیرش',
  ];
  return { id: `FDA-${num}`, titleFa: titles[idx] ?? `FDA-${num}` };
});

export const RT_FE_FDA_DELIVERABLES_38 = Array.from({ length: 38 }, (_, idx) => {
  const num = String(idx + 1).padStart(3, '0');
  const titles = [
    'منشور معماری داده فرانت‌اند', 'Data Flow Architecture', 'State Classification Model', 'Data Access Layer Architecture',
    'Central API Client Contract', 'API Request & Response Standard', 'Error Contract', 'Correlation ID Standard',
    'Data Contract Registry', 'Runtime Validation Specification', 'DTO / Domain / View Model Standard', 'Domain Service Architecture',
    'Query Manager Architecture', 'Query Key Registry', 'Cache Policy Registry', 'Cache Invalidation Architecture',
    'Mutation Manager Architecture', 'Optimistic Update Policy', 'Idempotency & Duplicate Prevention Standard', 'Data Conflict Management Model',
    'Concurrency Management Specification', 'Pagination & Infinite Query Standard', 'Map Data Architecture', 'Dashboard Data Architecture',
    'Form Data & Draft Architecture', 'Offline Data Policy', 'Data Synchronization Architecture', 'Error Recovery Policy',
    'Authentication Data Integration', 'Cloudflare Data Integration Contract', 'Derived Data Architecture', 'Data Telemetry Specification',
    'Data Security Standard', 'Feature Data Boundary Standard', 'Data Testing Specification', 'Data Performance Budget',
    'Data Layer Implementation Roadmap', 'Data Architecture Documentation',
  ];
  return { id: `FDA-OUT-${num}`, titleFa: titles[idx] ?? `FDA-OUT-${num}` };
});

/** Computes targeted cache tags to invalidate after an entity mutation without wiping the entire cache (§12.10). */
export function resolveMutationCacheInvalidationTags(
  mutatedEntityType: 'property' | 'building' | 'neighborhood' | 'listing',
  entityId: string,
  relatedNeighborhoodId?: string,
): { primaryTag: FdaCacheTag; dependentTags: FdaCacheTag[]; wipesEntireCache: false } {
  const primaryTag: FdaCacheTag = `${mutatedEntityType}:${entityId}`;
  const dependentTags: FdaCacheTag[] = [];
  if (mutatedEntityType === 'property') {
    dependentTags.push(`listing:${entityId}`, `market:${relatedNeighborhoodId ?? 'tehran'}`);
  } else if (mutatedEntityType === 'listing') {
    dependentTags.push(`property:${entityId}`);
  }
  if (relatedNeighborhoodId) {
    dependentTags.push(`neighborhood:${relatedNeighborhoodId}`);
  }
  return { primaryTag, dependentTags, wipesEntireCache: false };
}

/** Evaluates version-based optimistic concurrency control for entity updates (§12.19). */
export function evaluateVersionedEntityConflict(
  clientExpectedVersion: number,
  serverCurrentVersion: number,
): { conflictDetected: boolean; status: 'COMMIT_ALLOWED' | 'CONFLICT_409_PRESERVE_DRAFT'; actionFa: string } {
  if (clientExpectedVersion !== serverCurrentVersion) {
    return {
      conflictDetected: true,
      status: 'CONFLICT_409_PRESERVE_DRAFT',
      actionFa: `تعارض نسخه تشخیص داده شد (نسخه کلاینت ${clientExpectedVersion} در برابر نسخه سرور ${serverCurrentVersion})؛ حفظ تغییرات کاربر و نمایش مقایسه دو نسخه.`,
    };
  }
  return {
    conflictDetected: false,
    status: 'COMMIT_ALLOWED',
    actionFa: `نسخه رکورد (${serverCurrentVersion}) منطبق است؛ ثبت تغییر و ارتقای نسخه به ${serverCurrentVersion + 1}.`,
  };
}

/** Normalizes query keys deterministically and strips auth tokens/secrets from cache keys (§12.8). */
export function normalizeQueryFilterKey(
  domain: 'neighborhoods' | 'properties' | 'listings' | 'analytics',
  rawFilters: Record<string, string | number | boolean | null | undefined>,
  userScopeId?: string | null,
): { queryKeyTuple: readonly unknown[]; strippedSensitiveKeys: string[] } {
  const forbiddenKeys = new Set(['token', 'authtoken', 'access_token', 'authorization', 'password', 'secret']);
  const strippedSensitiveKeys: string[] = [];
  const normalizedEntries: Array<[string, string | number | boolean]> = [];

  for (const key of Object.keys(rawFilters).sort()) {
    const lower = key.toLowerCase();
    if (forbiddenKeys.has(lower)) {
      strippedSensitiveKeys.push(key);
      continue;
    }
    const val = rawFilters[key];
    if (val !== undefined && val !== null && val !== '') {
      normalizedEntries.push([key, val]);
    }
  }
  const normalizedObj = Object.fromEntries(normalizedEntries);
  const queryKeyTuple = userScopeId
    ? ([domain, 'user', userScopeId, 'list', normalizedObj] as const)
    : ([domain, 'public', 'list', normalizedObj] as const);

  return { queryKeyTuple, strippedSensitiveKeys };
}

/** Enforces two-tier mutation rule separating optimistic UI toggles from backend-confirmed operations (§12.18). */
export function evaluateOptimisticUpdateEligibility(
  mutationKind: 'bookmark_toggle' | 'ui_preference' | 'listing_publish' | 'transaction_submit' | 'official_price_change' | 'specialist_verify',
): { optimisticAllowed: boolean; requiresBackendConfirmation: boolean; requiresIdempotencyKey: boolean; reasonFa: string } {
  if (mutationKind === 'bookmark_toggle' || mutationKind === 'ui_preference') {
    return {
      optimisticAllowed: true,
      requiresBackendConfirmation: false,
      requiresIdempotencyKey: false,
      reasonFa: 'تعامل سبک و برگشت‌پذیر؛ به‌روزرسانی خوش‌بینانه با حفظ Snapshot و Rollback در صورت خطا مجاز است.',
    };
  }
  return {
    optimisticAllowed: false,
    requiresBackendConfirmation: true,
    requiresIdempotencyKey: true,
    reasonFa: 'عملیات حساس با اثر مالی/حقوقی/تأیید؛ نمایش موفقیت پیش از تأیید قطعی Backend ممنوع و Idempotency Key الزامی است.',
  };
}

/** Strips forbidden PII/keystroke/token fields from DataTelemetryEvent payloads (§12.24). */
export function sanitizeDataTelemetryEvent(raw: {
  eventName: string;
  feature: string;
  operation: string;
  durationMs?: number;
  status: 'success' | 'failure' | 'cancelled';
  appVersion: string;
  extraPayload?: Record<string, unknown>;
}): { safeEvent: Record<string, unknown>; blockedFields: string[] } {
  const blocked = ['password', 'token', 'formText', 'keystrokes', 'mouseTrack', 'paymentCard', 'exactGps'];
  const blockedFields = Object.keys(raw.extraPayload ?? {}).filter((k) => blocked.includes(k));
  return {
    safeEvent: {
      eventName: raw.eventName,
      timestamp: new Date().toISOString(),
      feature: raw.feature,
      operation: raw.operation,
      durationMs: raw.durationMs,
      status: raw.status,
      appVersion: raw.appVersion,
    },
    blockedFields,
  };
}

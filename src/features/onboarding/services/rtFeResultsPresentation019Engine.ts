/**
 * Stage 19 — Executable Result Formatter, ResultSet Integrity, Selection Model,
 * Column Preferences & Comparison Guard Engine
 * Spec ID: RT-FE-RESULTS-PRESENTATION-019
 */

export * from './rtFeResultsPresentation019Specs';

export type ValueAvailabilityState = 'present' | 'missing' | 'invalid' | 'processing' | 'confidential' | 'unverified';

export interface FormattedFieldOutput {
  rawValue: number | string | null | undefined;
  displayText: string;
  unitLabel: string;
  availability: ValueAvailabilityState;
  isZero: boolean;
}

/**
 * Formats numbers & currencies without mutating rawValue and strictly distinguishes
 * real zero (0) from missing/confidential/invalid states (§19.18.1 & §19.19.1).
 */
export function formatResultFieldValue(input: {
  rawValue: number | null | undefined;
  fieldType: 'number' | 'currency_irr_to_irt' | 'area' | 'percentage';
  availability?: ValueAvailabilityState;
}): FormattedFieldOutput {
  const status = input.availability ?? (input.rawValue === null || input.rawValue === undefined ? 'missing' : 'present');
  if (status !== 'present' || input.rawValue === null || input.rawValue === undefined || Number.isNaN(input.rawValue)) {
    const labels: Record<ValueAvailabilityState, string> = {
      present: 'داده ناموجود',
      missing: 'داده ناموجود',
      invalid: 'مقدار نامعتبر',
      processing: 'در حال پردازش',
      confidential: 'محرمانه (نیازمند مجوز)',
      unverified: 'تأییدنشده',
    };
    return {
      rawValue: input.rawValue,
      displayText: labels[status],
      unitLabel: '—',
      availability: status === 'present' ? 'missing' : status,
      isZero: false,
    };
  }
  const isZero = input.rawValue === 0;
  if (input.fieldType === 'currency_irr_to_irt') {
    const toman = Math.round(input.rawValue / 10);
    return {
      rawValue: input.rawValue,
      displayText: `${toman.toLocaleString('fa-IR')} تومان`,
      unitLabel: 'تومان (تبدیل از ریال خام)',
      availability: 'present',
      isZero,
    };
  }
  if (input.fieldType === 'area') {
    return {
      rawValue: input.rawValue,
      displayText: `${input.rawValue.toLocaleString('fa-IR')} متر مربع`,
      unitLabel: 'متر مربع',
      availability: 'present',
      isZero,
    };
  }
  if (input.fieldType === 'percentage') {
    return {
      rawValue: input.rawValue,
      displayText: `${input.rawValue.toLocaleString('fa-IR')}٪`,
      unitLabel: 'درصد',
      availability: 'present',
      isZero,
    };
  }
  return {
    rawValue: input.rawValue,
    displayText: input.rawValue.toLocaleString('fa-IR'),
    unitLabel: 'واحد عددی',
    availability: 'present',
    isZero,
  };
}

/** Guards ResultSet against mixing results from stale queries or leaking private columns (§19.6.2 & §19.5.1). */
export function evaluateResultSetIntegrity(input: {
  activeQueryId: string;
  incomingQueryId: string;
  completeness: 'complete' | 'partial' | 'unknown';
  isPublicContext: boolean;
  exposedFields: string[];
}): { accepted: boolean; leakedPrivateFields: string[]; completenessBannerFa: string } {
  const privateFields = ['ownerPhone', 'nationalId', 'adminNotes', 'internalRiskFlag'];
  const leakedPrivateFields = input.isPublicContext
    ? input.exposedFields.filter((f) => privateFields.includes(f))
    : [];

  if (input.activeQueryId !== input.incomingQueryId) {
    return {
      accepted: false,
      leakedPrivateFields,
      completenessBannerFa: 'بسته نتایج متعلق به Query قبلی است و برای جلوگیری از اختلاط نتایج رد شد (§۱۹.۶.۲).',
    };
  }
  if (leakedPrivateFields.length > 0) {
    return {
      accepted: false,
      leakedPrivateFields,
      completenessBannerFa: `نشت فیلدهای خصوصی (${leakedPrivateFields.join(', ')}) در نمای عمومی مسدود شد (§۱۹.۵.۱).`,
    };
  }
  const banner =
    input.completeness === 'complete'
      ? 'مجموعه نتایج کامل و هم‌تراز با Query فعال است.'
      : 'مجموعه نتایج ناقص (Partial) است و هرگز به‌عنوان کامل نمایش داده نمی‌شود (§۱۹.۲۳.۱).';
  return { accepted: true, leakedPrivateFields: [], completenessBannerFa: banner };
}

export type SelectionState =
  | { mode: 'explicit'; ids: string[] }
  | { mode: 'all_matching'; queryId: string; excludedIds: string[] };

/** Evaluates explicit page selection vs query-wide selection and server permission requirement (§19.15). */
export function evaluateSelectionModel(input: {
  selection: SelectionState;
  pageTotal: number;
  queryTotal: number;
  bulkActionLimit?: number;
}): { effectiveCount: number; scopeLabelFa: string; requiresBulkConfirmation: boolean; backendRevalidationRequired: true } {
  const limit = input.bulkActionLimit ?? 100;
  if (input.selection.mode === 'explicit') {
    const count = input.selection.ids.length;
    return {
      effectiveCount: count,
      scopeLabelFa: `انتخاب صریح صفحه (${count} از ${input.pageTotal} رکورد صفحه فعلی — معادل کل ${input.queryTotal} نتیجه نیست).`,
      requiresBulkConfirmation: count > limit,
      backendRevalidationRequired: true,
    };
  }
  const effectiveCount = Math.max(0, input.queryTotal - input.selection.excludedIds.length);
  return {
    effectiveCount,
    scopeLabelFa: `انتخاب کل مجموعه نتایج Query («${input.selection.queryId}»: ${effectiveCount} رکورد پس از کسر مستثنی‌ها).`,
    requiresBulkConfirmation: effectiveCount > limit,
    backendRevalidationRequired: true,
  };
}

export interface ComparisonCandidate {
  id: string;
  entityType: string;
  unit: string;
  period: string;
  value: number | null;
}

/** Validates semantic, unit & period parity before building Comparison View (§19.17.1). */
export function evaluateComparisonSet(items: ComparisonCandidate[]): {
  comparable: boolean;
  warningsFa: string[];
  reasonFa: string;
} {
  if (items.length < 2) {
    return { comparable: false, warningsFa: [], reasonFa: 'برای مقایسه حداقل ۲ موجودیت لازم است.' };
  }
  const entityTypes = new Set(items.map((i) => i.entityType));
  if (entityTypes.size > 1) {
    return { comparable: false, warningsFa: [], reasonFa: 'موجودیت‌های دارای نوع متفاوت قابل مقایسه کنار هم نیستند (§۱۹.۱۷.۱).' };
  }
  const units = new Set(items.map((i) => i.unit));
  if (units.size > 1) {
    return {
      comparable: false,
      warningsFa: ['عدم تطابق واحد اندازه‌گیری'],
      reasonFa: `خطای یکسانی واحد: مقایسه بین واحدهای متفاوت (${Array.from(units).join(' در برابر ')}) ممنوع است (§۱۹.۱۷.۱).`,
    };
  }
  const warningsFa: string[] = [];
  const periods = new Set(items.map((i) => i.period));
  if (periods.size > 1) {
    warningsFa.push(`تفاوت دوره زمانی (${Array.from(periods).join(' با ')}) باید شفاف علامت‌گذاری شود.`);
  }
  if (items.some((i) => i.value === null)) {
    warningsFa.push('مقدار ناموجود با برچسب مجزا نمایش داده می‌شود و هرگز به صفر تبدیل نمی‌شود.');
  }
  return {
    comparable: true,
    warningsFa,
    reasonFa: warningsFa.length > 0 ? warningsFa.join(' ') : 'مقایسه از نظر نوع، واحد و دوره زمانی کاملاً معتبر است.',
  };
}

/** Resolves table column preferences with priority User > Workspace > Default while filtering undefined columns (§19.12.2). */
export function resolveColumnPreferences(input: {
  registeredColumns: string[];
  featureDefault: string[];
  workspacePref?: string[];
  userPref?: string[];
}): { resolvedColumns: string[]; sourceLevel: 'user' | 'workspace' | 'feature_default'; droppedUndefined: string[] } {
  const chosen = input.userPref ?? input.workspacePref ?? input.featureDefault;
  const sourceLevel = input.userPref ? 'user' : input.workspacePref ? 'workspace' : 'feature_default';
  const regSet = new Set(input.registeredColumns);
  const resolvedColumns = chosen.filter((c) => regSet.has(c));
  const droppedUndefined = chosen.filter((c) => !regSet.has(c));
  return { resolvedColumns, sourceLevel, droppedUndefined };
}

/** Strips private record contents, user IDs & field values from Presentation Telemetry (§19.32). */
export function sanitizeResultsTelemetryEvent(raw: {
  event: 'view_switched' | 'table_sorted' | 'comparison_opened' | 'bulk_action_triggered';
  entityType: string;
  viewMode: string;
  activeColumnsCount: number;
  extra?: Record<string, unknown>;
}): { safeEvent: Record<string, unknown>; strippedSensitiveFields: string[] } {
  const forbidden = ['privateRecordContent', 'exactAddress', 'userId', 'sensitiveFieldValue', 'ownerPhone'];
  const strippedSensitiveFields = Object.keys(raw.extra ?? {}).filter((k) => forbidden.includes(k));
  return {
    safeEvent: {
      event: raw.event,
      entityType: raw.entityType,
      viewMode: raw.viewMode,
      activeColumnsCount: raw.activeColumnsCount,
      timestamp: new Date().toISOString(),
    },
    strippedSensitiveFields,
  };
}

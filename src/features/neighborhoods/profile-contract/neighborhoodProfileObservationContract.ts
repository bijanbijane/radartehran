const SHA256_HEX = /^[a-f0-9]{64}$/i;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
function isValidTimestamp(value: string | undefined): boolean {
  return Boolean(value && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value)));
}

export type ProfileObservationState = 'OBSERVED_VALUE' | 'OBSERVED_ZERO' | 'MISSING' | 'NOT_APPLICABLE' | 'SUPPRESSED' | 'UNAVAILABLE';
export type SourceAccessStatus = 'VERIFIED' | 'MANUAL_ONLY' | 'CONDITIONALLY_AVAILABLE' | 'ACCESS_NOT_VERIFIED' | 'RESTRICTED' | 'PROHIBITED';
export type SourceVariableCompatibility = 'VERIFIED_COMPATIBLE' | 'CONDITIONALLY_COMPATIBLE' | 'PARTIALLY_COMPATIBLE' | 'NOT_REVIEWED' | 'NOT_COMPATIBLE';
export type GeographicLevel = 'country' | 'province' | 'city' | 'district' | 'neighborhood' | 'non_administrative_spatial';

export interface NeighborhoodProfileObservation {
  readonly canonicalRecordId: string;
  readonly evidenceId: string;
  readonly sourceVariableMappingId: string;
  readonly variableId: string;
  readonly value: unknown;
  readonly state: ProfileObservationState;
  readonly unit: string | null;
  readonly sourceId: string;
  /** Declared values below are checked against trusted registries; they are never authoritative. */
  readonly sourceAccessStatus: SourceAccessStatus;
  readonly compatibility: SourceVariableCompatibility;
  readonly sourceGeographicLevel: GeographicLevel;
  readonly targetGeographicLevel: GeographicLevel;
  readonly sourceReference: string;
  readonly approvedCrosswalkReference?: string;
  readonly allocationMethodologyReference?: string;
  readonly metricRole: 'SALE_ASKING_PRICE' | 'RENT_ASKING' | 'RENTAL_DEPOSIT'
    | 'CONFIRMED_SALE_TRANSACTION' | 'CONFIRMED_RENT_CONTRACT' | 'DEPOSIT_CONVERSION' | 'OTHER';
  readonly observedAtIso: string;
  readonly referencePeriodEndIso?: string;
  readonly temporalType: 'STATIC' | 'PERIODIC' | 'DYNAMIC' | 'EVENT_BASED';
  readonly sourceVersion?: string;
  readonly sourceDatasetHash?: string;
}

export interface NeighborhoodProfileValidationContext {
  readonly variableDefinition: {
    readonly variableId: string;
    readonly dataType: 'string' | 'integer' | 'decimal' | 'boolean' | 'date' | 'datetime' | 'enum' | 'structured';
    readonly unit: string | null;
    readonly geographicLevel: GeographicLevel;
    readonly temporalType: 'STATIC' | 'PERIODIC' | 'DYNAMIC' | 'EVENT_BASED';
    readonly temporalSemantics: 'HISTORICAL_SNAPSHOT' | 'POINT_IN_TIME' | 'PERIOD_BASED' | 'EVENT_BASED' | 'CONTINUOUS';
    readonly minValue?: number;
    readonly maxValue?: number;
    readonly allowedValues?: readonly (string | number)[];
    readonly priceEconomicRole?: NeighborhoodProfileObservation['metricRole'];
    readonly freshnessPolicy?: { readonly maxAgeDays: number; readonly policyVersion: string };
  };
  readonly source: {
    readonly sourceId: string;
    readonly accessStatus: SourceAccessStatus;
    readonly publicRedistributionAllowed: boolean;
    readonly manualPermissionVerified: boolean;
    readonly role: 'LISTING_PORTAL' | 'OFFICIAL_TRANSACTION_REGISTRY' | 'OFFICIAL_STATISTICS' | 'GIS' | 'FIELD_SURVEY' | 'MODEL' | 'UNKNOWN';
  };
  readonly mapping: {
    readonly sourceVariableMappingId: string;
    readonly sourceId: string;
    readonly variableId: string;
    readonly compatibility: SourceVariableCompatibility;
    readonly sourceGeographicLevel: GeographicLevel;
    readonly methodologyReference?: string;
    readonly approvedCrosswalkReference?: string;
    readonly allocationMethodologyReference?: string;
  };
  readonly evidence: {
    readonly evidenceId: string;
    readonly sourceId: string;
    readonly lifecycleStatus: 'ACCESS_APPROVED' | 'RECEIVED' | 'REJECTED' | 'SUPERSEDED' | 'SOURCE_REMOVED';
    readonly rawHashVerified: boolean;
  };
  readonly canonicalRecord: {
    readonly canonicalRecordId: string;
    readonly sourceId: string;
    readonly sourceEvidenceIds: readonly string[];
    readonly sourceVariableMappingIds: readonly string[];
    readonly variableId: string;
    readonly value: unknown;
    readonly unit: string | null;
    readonly state: ProfileObservationState;
    readonly lifecycleStatus: 'ACTIVE' | 'SUPERSEDED' | 'REJECTED';
    readonly observedAtIso: string;
    readonly referencePeriodEndIso?: string;
    readonly sourceVersion?: string;
    readonly sourceDatasetHash?: string;
    readonly sourceDatasetHashVerified: boolean;
  };
}

export type ObservationEligibilityCode =
  | 'PUBLISHABLE' | 'MISSING_VALUE' | 'NOT_APPLICABLE' | 'SUPPRESSED' | 'UNAVAILABLE'
  | 'INVALID_ZERO_SEMANTICS' | 'SOURCE_PROHIBITED' | 'SOURCE_PERMISSION_MISSING'
  | 'SOURCE_NOT_REVIEWED' | 'SOURCE_VARIABLE_INCOMPATIBLE'
  | 'GEOGRAPHIC_RESOLUTION_MISMATCH' | 'CROSSWALK_EVIDENCE_MISSING'
  | 'SOURCE_REFERENCE_MISSING' | 'INVALID_TIMESTAMP' | 'FUTURE_OBSERVATION'
  | 'FRESHNESS_POLICY_MISSING' | 'STALE_OBSERVATION' | 'STATIC_SOURCE_VERSION_MISSING'
  | 'PRICE_ROLE_MISMATCH' | 'METHODOLOGY_MISSING' | 'ALLOCATED_ESTIMATE' | 'PARTIAL_EVIDENCE'
  | 'REFERENCE_CONTEXT_MISSING' | 'REFERENCE_MISMATCH' | 'VARIABLE_VALUE_INVALID'
  | 'VARIABLE_UNIT_MISMATCH' | 'VALUE_OUT_OF_RANGE' | 'ENUM_VALUE_NOT_ALLOWED';

export interface ObservationEligibilityResult {
  readonly publishable: boolean;
  readonly code: ObservationEligibilityCode;
  readonly displayState: ProfileObservationState | 'STALE' | 'UNDER_REVIEW' | 'ALLOCATED_ESTIMATE' | 'PARTIAL_EVIDENCE';
  readonly reasons: readonly string[];
  readonly geographicPrecision: 'EXACT' | 'ALLOCATED' | 'MISMATCH';
}
const LEVEL_ORDER: Record<GeographicLevel, number> = {
  non_administrative_spatial: 0, country: 1, province: 2, city: 3, district: 4, neighborhood: 5,
};
function observationFailure(code: ObservationEligibilityCode, displayState: ObservationEligibilityResult['displayState'], reason: string): ObservationEligibilityResult {
  return { publishable: false, code, displayState, reasons: [reason], geographicPrecision: 'MISMATCH' };
}
function isConfirmedPriceRoleCompatible(
  metricRole: NeighborhoodProfileObservation['metricRole'],
  sourceRole: NeighborhoodProfileValidationContext['source']['role'],
): boolean {
  if (sourceRole === 'LISTING_PORTAL') return ['SALE_ASKING_PRICE', 'RENT_ASKING', 'RENTAL_DEPOSIT'].includes(metricRole);
  if (metricRole === 'CONFIRMED_SALE_TRANSACTION' || metricRole === 'CONFIRMED_RENT_CONTRACT') {
    return sourceRole === 'OFFICIAL_TRANSACTION_REGISTRY';
  }
  if (metricRole === 'DEPOSIT_CONVERSION') return sourceRole === 'OFFICIAL_STATISTICS';
  return true;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function validateVariableValue(
  value: unknown,
  definition: NeighborhoodProfileValidationContext['variableDefinition'],
): ObservationEligibilityResult | null {
  if (value === null || value === undefined) {
    return observationFailure('VARIABLE_VALUE_INVALID', 'UNDER_REVIEW', 'برای مشاهده منتشرشدنی، مقدار کانونیک تهی نیست.');
  }
  const numeric = typeof value === 'number' && Number.isFinite(value);
  switch (definition.dataType) {
    case 'integer':
      if (!numeric || !Number.isSafeInteger(value)) return observationFailure('VARIABLE_VALUE_INVALID', 'UNDER_REVIEW', 'نوع مقدار با تعریف integer سازگار نیست.');
      break;
    case 'decimal':
      if (!numeric) return observationFailure('VARIABLE_VALUE_INVALID', 'UNDER_REVIEW', 'نوع مقدار با تعریف decimal سازگار نیست.');
      break;
    case 'string':
    case 'date':
    case 'datetime':
      if (typeof value !== 'string') return observationFailure('VARIABLE_VALUE_INVALID', 'UNDER_REVIEW', 'نوع مقدار با تعریف رشته‌ای یا زمانی سازگار نیست.');
      if (definition.dataType === 'date') {
        const parsed = new Date(value);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
          return observationFailure('VARIABLE_VALUE_INVALID', 'UNDER_REVIEW', 'تاریخ مشاهده در قالب ISO تقویمی معتبر نیست.');
        }
      }
      if (definition.dataType === 'datetime' && !isValidTimestamp(value)) {
        return observationFailure('VARIABLE_VALUE_INVALID', 'UNDER_REVIEW', 'تاریخ‌وساعت مشاهده معتبر نیست.');
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') return observationFailure('VARIABLE_VALUE_INVALID', 'UNDER_REVIEW', 'نوع مقدار با تعریف boolean سازگار نیست.');
      break;
    case 'enum':
      if ((typeof value !== 'string' && typeof value !== 'number')
        || !definition.allowedValues?.some((allowed) => Object.is(allowed, value))) {
        return observationFailure('ENUM_VALUE_NOT_ALLOWED', 'UNDER_REVIEW', 'مقدار در فهرست مجاز متغیر ثبت نشده است.');
      }
      break;
    case 'structured':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return observationFailure('VARIABLE_VALUE_INVALID', 'UNDER_REVIEW', 'مقدار ساختاریافته باید یک شیء معتبر باشد.');
      }
      break;
  }
  if (numeric && definition.minValue !== undefined && value < definition.minValue) {
    return observationFailure('VALUE_OUT_OF_RANGE', 'UNDER_REVIEW', 'مقدار کمتر از حداقل تعریف‌شده متغیر است.');
  }
  if (numeric && definition.maxValue !== undefined && value > definition.maxValue) {
    return observationFailure('VALUE_OUT_OF_RANGE', 'UNDER_REVIEW', 'مقدار بیشتر از حداکثر تعریف‌شده متغیر است.');
  }
  return null;
}

export function evaluateNeighborhoodProfileObservation(
  observation: NeighborhoodProfileObservation,
  evaluatedAt: Date,
  context?: NeighborhoodProfileValidationContext,
): ObservationEligibilityResult {
  if (observation.state === 'MISSING') return observationFailure('MISSING_VALUE', 'MISSING', 'مقدار مشاهده موجود نیست.');
  if (observation.state === 'NOT_APPLICABLE') return observationFailure('NOT_APPLICABLE', 'NOT_APPLICABLE', 'این متغیر برای این محله کاربرد ندارد.');
  if (observation.state === 'SUPPRESSED') return observationFailure('SUPPRESSED', 'SUPPRESSED', 'مقدار به دلیل سیاست محرمانگی منتشر نمی‌شود.');
  if (observation.state === 'UNAVAILABLE') return observationFailure('UNAVAILABLE', 'UNAVAILABLE', 'منبع یا مشاهده در دسترس نیست.');
  if (!context) return observationFailure('REFERENCE_CONTEXT_MISSING', 'UNDER_REVIEW', 'برای انتشار باید رجیستری مستقل متغیر، منبع، نگاشت، شاهد و رکورد کانونیک تزریق شود.');

  const { variableDefinition, source, mapping, evidence, canonicalRecord } = context;
  if (!Number.isFinite(evaluatedAt.getTime())) {
    return observationFailure('INVALID_TIMESTAMP', 'UNDER_REVIEW', 'زمان ارزیابی معتبر نیست.');
  }
  if (source.sourceId !== observation.sourceId || mapping.sourceId !== source.sourceId
    || mapping.variableId !== observation.variableId
    || mapping.sourceVariableMappingId !== observation.sourceVariableMappingId
    || variableDefinition.variableId !== observation.variableId
    || evidence.sourceId !== source.sourceId || evidence.evidenceId !== observation.evidenceId
    || canonicalRecord.canonicalRecordId !== observation.canonicalRecordId
    || canonicalRecord.sourceId !== source.sourceId
    || !canonicalRecord.sourceEvidenceIds.includes(evidence.evidenceId)
    || !canonicalRecord.sourceVariableMappingIds.includes(mapping.sourceVariableMappingId)
    || canonicalRecord.variableId !== variableDefinition.variableId) {
    return observationFailure('REFERENCE_MISMATCH', 'UNDER_REVIEW', 'ارجاعات مشاهده با رجیستری‌های مستقل منبع، نگاشت، شاهد یا رکورد کانونیک مطابقت ندارند.');
  }
  if (canonicalRecord.lifecycleStatus !== 'ACTIVE' || canonicalRecord.state !== observation.state
    || !valuesEqual(canonicalRecord.value, observation.value)) {
    return observationFailure('REFERENCE_MISMATCH', 'UNDER_REVIEW', 'مقدار یا وضعیت مشاهده با نسخه فعال رکورد کانونیک مطابقت ندارد.');
  }
  if (canonicalRecord.unit !== variableDefinition.unit || observation.unit !== variableDefinition.unit) {
    return observationFailure('VARIABLE_UNIT_MISMATCH', 'UNDER_REVIEW', 'واحد مشاهده با واحد فرهنگ داده و رکورد کانونیک یکسان نیست.');
  }
  if (!valuesEqual(canonicalRecord.observedAtIso, observation.observedAtIso)
    || !valuesEqual(canonicalRecord.referencePeriodEndIso ?? null, observation.referencePeriodEndIso ?? null)
    || !valuesEqual(canonicalRecord.sourceVersion ?? null, observation.sourceVersion ?? null)
    || !valuesEqual(canonicalRecord.sourceDatasetHash ?? null, observation.sourceDatasetHash ?? null)) {
    return observationFailure('REFERENCE_MISMATCH', 'UNDER_REVIEW', 'مرجع زمانی یا نسخه منبع در مشاهده با رکورد کانونیک ناسازگار است.');
  }
  if (observation.sourceAccessStatus !== source.accessStatus
    || observation.compatibility !== mapping.compatibility
    || observation.sourceGeographicLevel !== mapping.sourceGeographicLevel
    || observation.targetGeographicLevel !== variableDefinition.geographicLevel
    || observation.temporalType !== variableDefinition.temporalType
    || (observation.approvedCrosswalkReference ?? null) !== (mapping.approvedCrosswalkReference ?? null)
    || (observation.allocationMethodologyReference ?? null) !== (mapping.allocationMethodologyReference ?? null)) {
    return observationFailure('REFERENCE_MISMATCH', 'UNDER_REVIEW', 'ادعاهای منبع/جغرافیا/زمان در payload با رجیستری معتبر یکسان نیستند.');
  }
  if (!observation.sourceReference.trim()) {
    return observationFailure('SOURCE_REFERENCE_MISSING', 'UNDER_REVIEW', 'ارجاع انسانی/قابل بازیابی منبع ثبت نشده است.');
  }
  if (evidence.lifecycleStatus !== 'ACCESS_APPROVED' || evidence.rawHashVerified !== true) {
    return observationFailure('SOURCE_PERMISSION_MISSING', 'UNDER_REVIEW', 'شاهد خام هنوز از نظر مجوز یا تمامیت محتوا تأیید نشده است.');
  }
  if (!source.publicRedistributionAllowed) {
    return observationFailure('SOURCE_PERMISSION_MISSING', 'UNDER_REVIEW', 'مجوز دسترسی منبع، مجوز بازنشر عمومی داده را اثبات نمی‌کند.');
  }
  if (source.accessStatus === 'PROHIBITED' || source.accessStatus === 'RESTRICTED') {
    return observationFailure('SOURCE_PROHIBITED', 'UNDER_REVIEW', 'منبع ممنوع یا محدودشده است.');
  }
  if (source.accessStatus === 'ACCESS_NOT_VERIFIED' || source.accessStatus === 'CONDITIONALLY_AVAILABLE'
    || (source.accessStatus === 'MANUAL_ONLY' && !source.manualPermissionVerified)) {
    return observationFailure('SOURCE_PERMISSION_MISSING', 'UNDER_REVIEW', 'شرایط دسترسی و انتشار عمومی منبع احراز نشده است.');
  }
  if (mapping.compatibility === 'NOT_COMPATIBLE') {
    return observationFailure('SOURCE_VARIABLE_INCOMPATIBLE', 'UNDER_REVIEW', 'منبع با معنای متغیر سازگار نیست.');
  }
  if (mapping.compatibility === 'NOT_REVIEWED') {
    return observationFailure('SOURCE_NOT_REVIEWED', 'UNDER_REVIEW', 'نگاشت منبع به متغیر هنوز بازبینی نشده است.');
  }
  if (mapping.compatibility === 'CONDITIONALLY_COMPATIBLE' || mapping.compatibility === 'PARTIALLY_COMPATIBLE') {
    if (!mapping.methodologyReference?.trim()) {
      return observationFailure('METHODOLOGY_MISSING', 'UNDER_REVIEW', 'روش‌شناسی نگاشت مشروط/جزئی ثبت نشده است.');
    }
  }
  if ((observation.state === 'OBSERVED_ZERO' && observation.value !== 0)
    || (observation.state === 'OBSERVED_VALUE' && (observation.value === 0 || observation.value === null))) {
    return observationFailure('INVALID_ZERO_SEMANTICS', 'UNDER_REVIEW', 'مقدار صفر باید با وضعیت صریح OBSERVED_ZERO ثبت شود.');
  }
  const variableValueError = validateVariableValue(observation.value, variableDefinition);
  if (variableValueError) return variableValueError;

  if (variableDefinition.priceEconomicRole) {
    if (observation.metricRole !== variableDefinition.priceEconomicRole
      || !isConfirmedPriceRoleCompatible(variableDefinition.priceEconomicRole, source.role)) {
      return observationFailure('PRICE_ROLE_MISMATCH', 'UNDER_REVIEW', 'نقش اقتصادی منبع با نوع قیمت/معامله متغیر سازگار نیست.');
    }
  } else if (observation.metricRole !== 'OTHER') {
    return observationFailure('PRICE_ROLE_MISMATCH', 'UNDER_REVIEW', 'نقش قیمت برای متغیری تعریف شده که نقش اقتصادی مصوب ندارد.');
  }

  let geographicPrecision: ObservationEligibilityResult['geographicPrecision'] = 'EXACT';
  if (mapping.sourceGeographicLevel !== variableDefinition.geographicLevel) {
    const crosswalkApproved = Boolean(mapping.approvedCrosswalkReference?.trim()
      && mapping.allocationMethodologyReference?.trim() && mapping.methodologyReference?.trim());
    const sourceIsCoarser = LEVEL_ORDER[mapping.sourceGeographicLevel] < LEVEL_ORDER[variableDefinition.geographicLevel];
    if (!crosswalkApproved || !sourceIsCoarser) {
      return observationFailure('GEOGRAPHIC_RESOLUTION_MISMATCH', 'UNDER_REVIEW', 'تفکیک منبع برای سطح محله کافی نیست و نگاشت بالادستی مصوب وجود ندارد.');
    }
    geographicPrecision = 'ALLOCATED';
  }

  if (!isValidTimestamp(observation.observedAtIso)) {
    return observationFailure('INVALID_TIMESTAMP', 'UNDER_REVIEW', 'تاریخ واقعی مشاهده معتبر نیست.');
  }
  if (Date.parse(observation.observedAtIso) > evaluatedAt.getTime()) {
    return observationFailure('FUTURE_OBSERVATION', 'UNDER_REVIEW', 'زمان مشاهده در آینده قرار دارد.');
  }

  const semantics = variableDefinition.temporalSemantics;
  const temporalType = variableDefinition.temporalType;
  const semanticMatchesType =
    (temporalType === 'STATIC' && semantics === 'HISTORICAL_SNAPSHOT')
    || (temporalType === 'PERIODIC' && ['POINT_IN_TIME', 'PERIOD_BASED', 'EVENT_BASED', 'HISTORICAL_SNAPSHOT'].includes(semantics))
    || (temporalType === 'DYNAMIC' && ['POINT_IN_TIME', 'PERIOD_BASED', 'EVENT_BASED', 'CONTINUOUS'].includes(semantics))
    || (temporalType === 'EVENT_BASED' && semantics === 'EVENT_BASED');
  if (!semanticMatchesType) {
    return observationFailure('REFERENCE_MISMATCH', 'UNDER_REVIEW', 'نوع زمانی و معنای زمانی متغیر در فرهنگ داده با هم سازگار نیستند.');
  }

  if (temporalType === 'STATIC') {
    if (!canonicalRecord.sourceVersion?.trim() || !canonicalRecord.sourceDatasetHash
      || !SHA256_HEX.test(canonicalRecord.sourceDatasetHash) || !canonicalRecord.sourceDatasetHashVerified) {
      return observationFailure('STATIC_SOURCE_VERSION_MISSING', 'UNDER_REVIEW', 'داده ثابت باید نسخه و هش تأییدشده مجموعه‌داده منبع داشته باشد.');
    }
  } else {
    const policy = variableDefinition.freshnessPolicy;
    if (!policy || !Number.isFinite(policy.maxAgeDays) || policy.maxAgeDays <= 0
      || typeof policy.policyVersion !== 'string' || !policy.policyVersion.trim()) {
      return observationFailure('FRESHNESS_POLICY_MISSING', 'UNDER_REVIEW', 'سیاست تازگی نسخه‌دار در تعریف متغیر وجود ندارد.');
    }
    const anchor = semantics === 'PERIOD_BASED'
      ? canonicalRecord.referencePeriodEndIso
      : canonicalRecord.observedAtIso;
    if (!anchor || !isValidTimestamp(anchor)) {
      return observationFailure('INVALID_TIMESTAMP', 'UNDER_REVIEW', 'تاریخ مشاهده یا پایان دوره مرجع معتبر نیست.');
    }
    const ageMs = evaluatedAt.getTime() - Date.parse(anchor);
    if (ageMs < 0) return observationFailure('FUTURE_OBSERVATION', 'UNDER_REVIEW', 'تاریخ مرجع دوره در آینده قرار دارد.');
    if (ageMs > policy.maxAgeDays * 86_400_000) {
      return observationFailure('STALE_OBSERVATION', 'STALE', 'داده از آستانه تازگی مصوب متغیر عبور کرده است.');
    }
  }

  if (geographicPrecision === 'ALLOCATED') {
    return {
      publishable: true,
      code: 'ALLOCATED_ESTIMATE',
      displayState: 'ALLOCATED_ESTIMATE',
      reasons: ['داده فقط با برچسب برآورد تخصیصی منتشر شود؛ مشاهده مستقیم محله نیست و نباید با داده مستقیم ادغام شود.'],
      geographicPrecision,
    };
  }
  if (mapping.compatibility === 'PARTIALLY_COMPATIBLE') {
    return {
      publishable: true,
      code: 'PARTIAL_EVIDENCE',
      displayState: 'PARTIAL_EVIDENCE',
      reasons: ['داده با محدودیت روش‌شناختی قابل انتشار است و باید همراه هشدار محدودیت نمایش داده شود.'],
      geographicPrecision,
    };
  }
  return {
    publishable: true,
    code: 'PUBLISHABLE',
    displayState: observation.state,
    reasons: ['تعریف متغیر، منبع، نگاشت، مجوز بازنشر، شاهد کانونیک، جغرافیا و تازگی با مراجع مستقل تطبیق شدند.'],
    geographicPrecision,
  };
}

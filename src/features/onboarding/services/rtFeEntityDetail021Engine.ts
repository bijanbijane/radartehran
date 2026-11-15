/**
 * Stage 21 Engine — RT-FE-ENTITY-DETAIL-021
 * Pure TypeScript domain evaluators for Entity Identity, Shell Section Registry,
 * Property/Building/Neighborhood/Listing profiles, Field Provenance, History, Relationships & Privacy.
 */
import {
  RT_FE_ENTITY_DETAIL_021_SPEC_ID,
  RT_FE_STAGE22_BRIDGE_SPEC_ID,
  RT_ENTITY_DOMAINS_10,
  RT_ENTITY_LAYERS_10,
  RT_ENTITY_SECTION_REGISTRY_10,
  RT_ENTITY_HEADER_STATES_8,
  RT_ENTITY_PROVENANCE_STATUSES_7,
  RT_ENTITY_RELATIONSHIP_TYPES_10,
  RT_ENTITY_DELIVERABLES_31,
  type CoreEntityType,
} from './rtFeEntityDetail021Specs';

export {
  RT_FE_ENTITY_DETAIL_021_SPEC_ID,
  RT_FE_STAGE22_BRIDGE_SPEC_ID,
  RT_ENTITY_DOMAINS_10,
  RT_ENTITY_LAYERS_10,
  RT_ENTITY_SECTION_REGISTRY_10,
  RT_ENTITY_HEADER_STATES_8,
  RT_ENTITY_PROVENANCE_STATUSES_7,
  RT_ENTITY_RELATIONSHIP_TYPES_10,
  RT_ENTITY_DELIVERABLES_31,
};
export type { CoreEntityType };

export interface EntityIdentityInput {
  id: string;
  type: CoreEntityType;
  headerState: (typeof RT_ENTITY_HEADER_STATES_8)[number];
  queryParams?: Record<string, string>;
  redirectTargetId?: string;
  derivedFromMutableTitle?: boolean;
}

export function evaluateEntityIdentityAndUrl(input: EntityIdentityInput): {
  valid: boolean;
  canonicalUrl: string;
  pageBehaviorFa: string;
  issues: string[];
} {
  const issues: string[] = [];
  const trimmedId = input.id.trim();
  if (!trimmedId || input.derivedFromMutableTitle) {
    issues.push('شناسه موجودیت باید پایدار و مستقل از عنوان یا آدرس قابل تغییر باشد.');
  }
  if (/token|secret|phone|nationalid|email/i.test(trimmedId)) {
    issues.push('شناسه موجودیت نباید اطلاعات محرمانه یا هویتی را افشا کند.');
  }
  const secretQuery = Object.keys(input.queryParams ?? {}).some((k) =>
    /token|secret|phone|owner|private|password/i.test(k),
  );
  if (secretQuery) {
    issues.push('قراردادن اطلاعات خصوصی یا توکن در Query String ممنوع است.');
  }
  if (input.headerState === 'Merged' && (!input.redirectTargetId || !input.redirectTargetId.trim())) {
    issues.push('موجودیت ادغام‌شده (Merged) باید به شناسه مقصد معتبر و مجاز ارجاع داده شود.');
  }

  const canonicalUrl = `/${input.type}/${encodeURIComponent(trimmedId || 'invalid')}`;
  let pageBehaviorFa = 'نمایش عادی پروفایل در Shell استاندارد';
  if (input.headerState === 'Deleted') pageBehaviorFa = 'نمایش پیام کنترل‌شده حذف موجودیت بدون افشای داده خصوصی';
  else if (input.headerState === 'Restricted') pageBehaviorFa = 'اعلام محدودیت دسترسی و مسدودسازی داده‌های غیرمجاز';
  else if (input.headerState === 'Merged') pageBehaviorFa = `هدایت کنترل‌شده به موجودیت جایگزین (${input.redirectTargetId ?? 'نامشخص'})`;
  else if (input.headerState === 'Archived') pageBehaviorFa = 'نمایش در وضعیت آرشیو و غیرفعال‌سازی اقدامات تغییردهنده';

  return { valid: issues.length === 0, canonicalUrl, pageBehaviorFa, issues };
}

export function resolveEntitySectionsForType(params: {
  entityType: CoreEntityType;
  identityLoaded: boolean;
  permissions: string[];
  erroredSectionIds?: string[];
}): {
  canRenderBody: boolean;
  visibleSectionIds: string[];
  isolatedErrorSections: string[];
  blockedReasonFa?: string;
} {
  if (!params.identityLoaded) {
    return {
      canRenderBody: false,
      visibleSectionIds: [],
      isolatedErrorSections: [],
      blockedReasonFa: 'خطای بحرانی: تا پیش از دریافت هویت معتبر موجودیت، نمایش بخش‌های وابسته مجاز نیست (§۲۱.۲۲.۱).',
    };
  }
  const errored = new Set(params.erroredSectionIds ?? []);
  const matching = RT_ENTITY_SECTION_REGISTRY_10.filter(
    (s) =>
      s.entityTypes.includes(params.entityType) &&
      (!s.permission || params.permissions.includes(s.permission)),
  ).sort((a, b) => a.order - b.order);

  return {
    canRenderBody: true,
    visibleSectionIds: matching.filter((s) => !errored.has(s.id)).map((s) => s.id),
    isolatedErrorSections: matching.filter((s) => errored.has(s.id)).map((s) => s.id),
  };
}

export type TriStateAttribute =
  | { kind: 'value'; value: number }
  | { kind: 'missing' }
  | { kind: 'not_applicable' };

export function evaluatePropertyPresentationRules(params: {
  askingSalePrice?: number | null;
  askingRentPrice?: number | null;
  recordedTransactionPrice?: number | null;
  appraiserPrice?: number | null;
  modelValuationPrice?: number | null;
  regionalReferencePrice?: number | null;
  mergeAllIntoGenericPriceLabel?: boolean;
  elevator: TriStateAttribute;
}): {
  valid: boolean;
  distinctPriceCount: number;
  elevatorDisplayFa: string;
  issues: string[];
} {
  const issues: string[] = [];
  if (params.mergeAllIntoGenericPriceLabel) {
    issues.push('ادغام قیمت پیشنهادی، معامله، کارشناسی و برآورد مدل در یک برچسب عمومی «قیمت ملک» ممنوع است (§۲۱.۹.۶).');
  }
  const prices = [
    params.askingSalePrice,
    params.askingRentPrice,
    params.recordedTransactionPrice,
    params.appraiserPrice,
    params.modelValuationPrice,
    params.regionalReferencePrice,
  ].filter((p) => typeof p === 'number');

  let elevatorDisplayFa = 'آسانسور: نامشخص (داده موجود نیست)';
  if (params.elevator.kind === 'value') {
    elevatorDisplayFa =
      params.elevator.value === 0
        ? 'آسانسور ندارد (تأییدشده: ۰)'
        : `${params.elevator.value} دستگاه آسانسور`;
  } else if (params.elevator.kind === 'not_applicable') {
    elevatorDisplayFa = 'برای این نوع ملک کاربرد ندارد (Not Applicable)';
  }

  return {
    valid: issues.length === 0,
    distinctPriceCount: prices.length,
    elevatorDisplayFa,
    issues,
  };
}

export function evaluateBuildingAndListingBoundaries(params: {
  unitEditTargetsSharedBuildingSpec: boolean;
  exposeOwnerIdentityInUnitList: boolean;
  listingMatchedOnlyByAddressOrImage: boolean;
  proposedMatchStatus: 'confirmed' | 'probable' | 'rejected' | 'needs_review';
}): {
  allowed: boolean;
  resolvedMatchStatus: 'confirmed' | 'probable' | 'rejected' | 'needs_review';
  issues: string[];
} {
  const issues: string[] = [];
  let resolvedMatchStatus = params.proposedMatchStatus;
  if (params.unitEditTargetsSharedBuildingSpec) {
    issues.push('تغییر مشخصات یک واحد نباید به‌صورت خودکار مشخصات مشترک ساختمان (Building) را تغییر دهد (§۲۱.۱۰.۳).');
  }
  if (params.exposeOwnerIdentityInUnitList) {
    issues.push('نمایش عمومی اطلاعات هویتی مالکان یا ساکنان در فهرست واحدهای ساختمان ممنوع است (§۲۱.۱۰.۴).');
  }
  if (params.listingMatchedOnlyByAddressOrImage && params.proposedMatchStatus === 'confirmed') {
    resolvedMatchStatus = 'probable';
    issues.push('شباهت آدرس یا تصویر به‌تنهایی برای تطبیق قطعی آگهی با ملک کافی نیست و باید «تطبیق احتمالی» باشد (§۲۱.۹.۷).');
  }
  return { allowed: issues.length === 0, resolvedMatchStatus, issues };
}

export interface ProvenanceSample {
  fieldId: string;
  sourceId: string;
  value: string | number;
  status: (typeof RT_ENTITY_PROVENANCE_STATUSES_7)[number];
  methodExplanationFa?: string;
}

export function evaluateProvenanceAndRelationships(params: {
  fieldSamples: ProvenanceSample[];
  relationships: Array<{ relationType: string; status: 'confirmed' | 'probable' | 'unverified'; sourceId?: string }>;
}): {
  hasConflict: boolean;
  conflictValues: Array<string | number>;
  missingMethodExplanation: boolean;
  unbackedConfirmedRelations: number;
} {
  const uniqueValues = Array.from(new Set(params.fieldSamples.map((s) => s.value)));
  const hasConflict =
    uniqueValues.length > 1 || params.fieldSamples.some((s) => s.status === 'conflicting');

  const missingMethodExplanation = params.fieldSamples.some(
    (s) => s.status === 'estimated' && (!s.methodExplanationFa || !s.methodExplanationFa.trim()),
  );

  const unbackedConfirmedRelations = params.relationships.filter(
    (r) => r.status === 'confirmed' && (!r.sourceId || !r.sourceId.trim()),
  ).length;

  return {
    hasConflict,
    conflictValues: uniqueValues,
    missingMethodExplanation,
    unbackedConfirmedRelations,
  };
}

export function sanitizeEntityTelemetryEvent(params: {
  eventType: string;
  entityType: CoreEntityType;
  payload: Record<string, unknown>;
}): { sanitizedPayload: Record<string, unknown>; strippedKeys: string[] } {
  const blocked = new Set([
    'ownerIdentity', 'residentName', 'privateNote',
    'privateDocumentBody', 'exactUserLocation', 'psychologicalProfile',
  ]);
  const sanitizedPayload: Record<string, unknown> = {};
  const strippedKeys: string[] = [];
  for (const [k, v] of Object.entries(params.payload)) {
    if (blocked.has(k)) strippedKeys.push(k);
    else sanitizedPayload[k] = v;
  }
  return { sanitizedPayload, strippedKeys };
}

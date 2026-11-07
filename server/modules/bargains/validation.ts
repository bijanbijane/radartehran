import {
  normalizeFirestoreTimestamp,
  requireEnumValue,
  requireFiniteNumberInRange,
  requireNonEmptyString,
  requireSafeFirestoreId,
  sanitizeTextInput,
  UNTRUSTED_REQUEST_IDENTITY_FIELDS,
  type ValidationIssue,
  type ValidationResult,
} from '../core';
import type {
  BargainMediaAttachments,
  CreateBargainInput,
  ModerateBargainInput,
  UpdateBargainInput,
  WithdrawBargainInput,
} from './types';

const FORBIDDEN_CLIENT_BARGAIN_FIELDS: ReadonlySet<string> = new Set([
  ...UNTRUSTED_REQUEST_IDENTITY_FIELDS,
  'status',
  'fromStatus',
  'approvedAt',
  'approvedAtIso',
  'approvedBy',
  'moderatedBy',
  'moderatedByUid',
  'moderatedAtIso',
  'revision',
  'numericPrice',
  'priceMillionToman',
  'inferredPrice',
]);

function validateOptionalStringArray(
  raw: unknown,
  fieldName: string,
  maxItems: number,
  maxItemLength: number,
): ValidationResult<string[] | undefined> {
  if (raw === undefined || raw === null) return { ok: true, value: undefined, issues: [] };
  if (!Array.isArray(raw) || raw.length > maxItems) {
    return {
      ok: false,
      issues: [{ field: fieldName, code: 'INVALID_FORMAT', message: `${fieldName} must be an array of <= ${maxItems} strings.` }],
    };
  }
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (typeof item !== 'string') {
      return { ok: false, issues: [{ field: `${fieldName}[${i}]`, code: 'INVALID_TYPE', message: 'Must be a string.' }] };
    }
    const cleaned = sanitizeTextInput(item);
    if (!cleaned || cleaned.length > maxItemLength) {
      return { ok: false, issues: [{ field: `${fieldName}[${i}]`, code: 'STRING_TOO_LONG', message: `Must be 1..${maxItemLength} chars.` }] };
    }
    out.push(cleaned);
  }
  return { ok: true, value: out, issues: [] };
}

function validateMediaAttachments(record: Record<string, unknown>, issues: ValidationIssue[]): BargainMediaAttachments {
  const media: BargainMediaAttachments = {};
  if (record.imageUrl !== undefined && record.imageUrl !== null) {
    const res = requireNonEmptyString({ minLength: 4, maxLength: 600 })(record.imageUrl, 'imageUrl');
    if (!res.ok) issues.push(...res.issues);
    else media.imageUrl = res.value;
  }
  if (record.videoUrl !== undefined && record.videoUrl !== null) {
    const res = requireNonEmptyString({ minLength: 4, maxLength: 600 })(record.videoUrl, 'videoUrl');
    if (!res.ok) issues.push(...res.issues);
    else media.videoUrl = res.value;
  }
  if (record.objectStorageBucket !== undefined && record.objectStorageBucket !== null) {
    const res = requireNonEmptyString({ minLength: 2, maxLength: 120 })(record.objectStorageBucket, 'objectStorageBucket');
    if (!res.ok) issues.push(...res.issues);
    else media.objectStorageBucket = res.value;
  }
  const imgUrls = validateOptionalStringArray(record.imageUrls, 'imageUrls', 5, 600);
  if (!imgUrls.ok) issues.push(...imgUrls.issues);
  else if (imgUrls.value) media.imageUrls = imgUrls.value;

  const storageKeys = validateOptionalStringArray(record.objectStorageKeys, 'objectStorageKeys', 6, 240);
  if (!storageKeys.ok) issues.push(...storageKeys.issues);
  else if (storageKeys.value) media.objectStorageKeys = storageKeys.value;

  const storageIds = validateOptionalStringArray(record.objectStorageObjectIds, 'objectStorageObjectIds', 6, 80);
  if (!storageIds.ok) issues.push(...storageIds.issues);
  else if (storageIds.value) media.objectStorageObjectIds = storageIds.value;

  return media;
}

const ALLOWED_CREATE_KEYS: ReadonlySet<string> = new Set([
  'bargainId', 'hoodId', 'title', 'type', 'sqm', 'priceText', 'discountPercent',
  'buyerProfitText', 'street', 'expiresAtIso', 'imageUrl', 'imageUrls', 'videoUrl',
  'objectStorageBucket', 'objectStorageKeys', 'objectStorageObjectIds',
]);

export function validateCreateBargainInput(rawInput: unknown): ValidationResult<CreateBargainInput> {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return { ok: false, issues: [{ field: '$root', code: 'INVALID_TYPE', message: 'Request body must be a JSON object.' }] };
  }
  const rec = rawInput as Record<string, unknown>;
  const issues: ValidationIssue[] = [];

  for (const key of Object.keys(rec)) {
    if (FORBIDDEN_CLIENT_BARGAIN_FIELDS.has(key)) {
      issues.push({ field: key, code: 'UNTRUSTED_IDENTITY_FIELD', message: `Field "${key}" is server-managed.` });
    } else if (!ALLOWED_CREATE_KEYS.has(key)) {
      issues.push({ field: key, code: 'UNKNOWN_FIELD_REJECTED', message: `Unknown field "${key}" is not permitted.` });
    }
  }

  let bargainId: string | undefined;
  if (rec.bargainId !== undefined && rec.bargainId !== null) {
    const idRes = requireSafeFirestoreId()(rec.bargainId, 'bargainId');
    if (!idRes.ok) issues.push(...idRes.issues);
    else bargainId = idRes.value;
  }

  const hoodRes = requireFiniteNumberInRange({ min: 1, max: 999, integerOnly: true })(rec.hoodId, 'hoodId');
  const titleRes = requireNonEmptyString({ minLength: 3, maxLength: 160 })(rec.title, 'title');
  const typeRes = requireEnumValue(['خرید', 'اجاره'] as const)(rec.type, 'type');
  const sqmRes = requireFiniteNumberInRange({ min: 25, max: 1000 })(rec.sqm, 'sqm');
  const priceTextRes = requireNonEmptyString({ minLength: 3, maxLength: 160 })(rec.priceText, 'priceText');
  const discountRes = requireFiniteNumberInRange({ min: 10, max: 60 })(rec.discountPercent, 'discountPercent');
  const profitRes = requireNonEmptyString({ minLength: 3, maxLength: 160 })(rec.buyerProfitText, 'buyerProfitText');
  const streetRes = requireNonEmptyString({ minLength: 2, maxLength: 120 })(rec.street, 'street');

  for (const r of [hoodRes, titleRes, typeRes, sqmRes, priceTextRes, discountRes, profitRes, streetRes]) {
    if (!r.ok) issues.push(...r.issues);
  }

  let expiresAtIso: string | undefined;
  if (rec.expiresAtIso !== undefined && rec.expiresAtIso !== null) {
    const norm = normalizeFirestoreTimestamp(rec.expiresAtIso);
    if (!norm) issues.push({ field: 'expiresAtIso', code: 'INVALID_FORMAT', message: 'Invalid ISO-8601 timestamp.' });
    else expiresAtIso = norm.iso;
  }

  const media = validateMediaAttachments(rec, issues);
  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      ...(bargainId ? { bargainId } : {}),
      hoodId: hoodRes.value!,
      title: titleRes.value!,
      type: typeRes.value!,
      sqm: sqmRes.value!,
      priceText: priceTextRes.value!,
      discountPercent: discountRes.value!,
      buyerProfitText: profitRes.value!,
      street: streetRes.value!,
      ...(expiresAtIso ? { expiresAtIso } : {}),
      ...media,
    },
    issues: [],
  };
}

const ALLOWED_UPDATE_KEYS: ReadonlySet<string> = new Set([
  'expectedRevision', 'title', 'sqm', 'priceText', 'discountPercent', 'buyerProfitText',
  'street', 'expiresAtIso', 'imageUrl', 'imageUrls', 'videoUrl', 'objectStorageBucket',
  'objectStorageKeys', 'objectStorageObjectIds',
]);

export function validateUpdateBargainInput(rawInput: unknown): ValidationResult<UpdateBargainInput> {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return { ok: false, issues: [{ field: '$root', code: 'INVALID_TYPE', message: 'Request body must be a JSON object.' }] };
  }
  const rec = rawInput as Record<string, unknown>;
  const issues: ValidationIssue[] = [];

  for (const key of Object.keys(rec)) {
    if (FORBIDDEN_CLIENT_BARGAIN_FIELDS.has(key) || key === 'hoodId' || key === 'type') {
      issues.push({ field: key, code: 'UNTRUSTED_IDENTITY_FIELD', message: `Field "${key}" cannot be modified by client.` });
    } else if (!ALLOWED_UPDATE_KEYS.has(key)) {
      issues.push({ field: key, code: 'UNKNOWN_FIELD_REJECTED', message: `Unknown field "${key}" is not permitted.` });
    }
  }

  const revRes = requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true })(rec.expectedRevision, 'expectedRevision');
  if (!revRes.ok) issues.push(...revRes.issues);
  const out: UpdateBargainInput = { expectedRevision: revRes.value ?? 1 };

  const stringChecks: Array<['title' | 'priceText' | 'buyerProfitText' | 'street', number, number]> = [
    ['title', 3, 160],
    ['priceText', 3, 160],
    ['buyerProfitText', 3, 160],
    ['street', 2, 120],
  ];
  for (const [field, minL, maxL] of stringChecks) {
    if (rec[field] !== undefined) {
      const r = requireNonEmptyString({ minLength: minL, maxLength: maxL })(rec[field], field);
      if (!r.ok) issues.push(...r.issues);
      else out[field] = r.value;
    }
  }
  if (rec.sqm !== undefined) {
    const r = requireFiniteNumberInRange({ min: 25, max: 1000 })(rec.sqm, 'sqm');
    if (!r.ok) issues.push(...r.issues);
    else out.sqm = r.value;
  }
  if (rec.discountPercent !== undefined) {
    const r = requireFiniteNumberInRange({ min: 10, max: 60 })(rec.discountPercent, 'discountPercent');
    if (!r.ok) issues.push(...r.issues);
    else out.discountPercent = r.value;
  }
  if (rec.expiresAtIso !== undefined) {
    const norm = normalizeFirestoreTimestamp(rec.expiresAtIso);
    if (!norm) issues.push({ field: 'expiresAtIso', code: 'INVALID_FORMAT', message: 'Invalid ISO-8601 timestamp.' });
    else out.expiresAtIso = norm.iso;
  }

  Object.assign(out, validateMediaAttachments(rec, issues));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: out, issues: [] };
}

export function validateWithdrawBargainInput(rawInput: unknown): ValidationResult<WithdrawBargainInput> {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return { ok: false, issues: [{ field: '$root', code: 'INVALID_TYPE', message: 'Request body must be a JSON object.' }] };
  }
  const rec = rawInput as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  const revRes = requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true })(rec.expectedRevision, 'expectedRevision');
  if (!revRes.ok) issues.push(...revRes.issues);

  let reason: string | undefined;
  if (rec.reason !== undefined && rec.reason !== null) {
    const r = requireNonEmptyString({ minLength: 2, maxLength: 240 })(rec.reason, 'reason');
    if (!r.ok) issues.push(...r.issues);
    else reason = r.value;
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: { expectedRevision: revRes.value!, ...(reason ? { reason } : {}) }, issues: [] };
}

export function validateModerateBargainInput(rawInput: unknown): ValidationResult<ModerateBargainInput> {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return { ok: false, issues: [{ field: '$root', code: 'INVALID_TYPE', message: 'Request body must be a JSON object.' }] };
  }
  const rec = rawInput as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  if ('fromStatus' in rec) {
    issues.push({ field: 'fromStatus', code: 'UNTRUSTED_IDENTITY_FIELD', message: 'Client-supplied fromStatus is forbidden.' });
  }
  const statusRes = requireEnumValue(['approved', 'rejected'] as const)(rec.targetStatus ?? rec.status, 'targetStatus');
  if (!statusRes.ok) issues.push(...statusRes.issues);

  let expectedRevision: number | undefined;
  if (rec.expectedRevision !== undefined && rec.expectedRevision !== null) {
    const revRes = requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true })(rec.expectedRevision, 'expectedRevision');
    if (!revRes.ok) issues.push(...revRes.issues);
    else expectedRevision = revRes.value;
  }

  let rejectionReason: string | undefined;
  if (rec.rejectionReason !== undefined && rec.rejectionReason !== null) {
    const reasonRes = requireNonEmptyString({ minLength: 3, maxLength: 300 })(rec.rejectionReason, 'rejectionReason');
    if (!reasonRes.ok) issues.push(...reasonRes.issues);
    else rejectionReason = reasonRes.value;
  }
  if (statusRes.value === 'rejected' && !rejectionReason) {
    rejectionReason = 'Rejected by administrator moderation policy.';
  }
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: { targetStatus: statusRes.value!, ...(expectedRevision !== undefined ? { expectedRevision } : {}), ...(rejectionReason ? { rejectionReason } : {}) }, issues: [] };
}

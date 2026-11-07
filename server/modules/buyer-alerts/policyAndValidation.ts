import {
  normalizeFirestoreTimestamp,
  requireEnumValue,
  requireFiniteNumberInRange,
  requireNonEmptyString,
  sanitizeTextInput,
  UNTRUSTED_REQUEST_IDENTITY_FIELDS,
  type ValidationIssue,
  type ValidationResult,
} from '../core';
import type {
  BuyerAlertBusinessPolicy,
  ConsentEvidenceInput,
  ContactChannelDescriptor,
  ContactChannelType,
  CreateBuyerAlertInput,
  NeighborhoodDirectoryAdapter,
  SupportedCityId,
  UpdateBuyerAlertInput,
  WithdrawBuyerAlertInput,
} from './types';

export const DEFAULT_BUYER_ALERT_BUSINESS_POLICY: BuyerAlertBusinessPolicy = {
  multiplicityMode: 'single_per_city_hood',
  acceptedConsentVersions: ['buyer-alert-2026-10-v1', 'buyer-alert-2026-11-v2'],
  retentionDays: {
    defaultDays: 90,
    minDays: 7,
    maxDays: 90,
  },
  allowedContactChannels: ['ir_mobile', 'email', 'telegram'],
};

export function resolveBuyerAlertPolicy(
  override?: Partial<BuyerAlertBusinessPolicy>,
): BuyerAlertBusinessPolicy {
  return {
    multiplicityMode:
      override?.multiplicityMode ?? DEFAULT_BUYER_ALERT_BUSINESS_POLICY.multiplicityMode,
    acceptedConsentVersions:
      override?.acceptedConsentVersions ??
      DEFAULT_BUYER_ALERT_BUSINESS_POLICY.acceptedConsentVersions,
    retentionDays: {
      ...DEFAULT_BUYER_ALERT_BUSINESS_POLICY.retentionDays,
      ...(override?.retentionDays ?? {}),
    },
    allowedContactChannels:
      override?.allowedContactChannels ??
      DEFAULT_BUYER_ALERT_BUSINESS_POLICY.allowedContactChannels,
  };
}

/**
 * Validates that `(cityId, hoodId)` belongs strictly to the specified `cityId`
 * (never falling back across cities, preventing cross-city neighborhood collisions).
 */
export function createDefaultNeighborhoodDirectoryAdapter(
  catalogByCity?: Partial<Record<SupportedCityId, ReadonlyArray<{ id: number; name: string }>>>,
): NeighborhoodDirectoryAdapter {
  return {
    resolveCityNeighborhood(cityId: SupportedCityId, hoodId: number) {
      const cityHoods = catalogByCity?.[cityId];
      if (cityHoods) {
        const matched = cityHoods.find((h) => h.id === hoodId);
        return matched ? { cityId, hoodId: matched.id, hoodName: matched.name } : null;
      }
      if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999) return null;
      return { cityId, hoodId, hoodName: `محله ${hoodId} (${cityId})` };
    },
  };
}

const FORBIDDEN_CLIENT_ALERT_FIELDS: ReadonlySet<string> = new Set([
  ...UNTRUSTED_REQUEST_IDENTITY_FIELDS,
  'id',
  'alertId',
  'logicalScopeKey',
  'status',
  'revision',
  'createdAt',
  'createdAtIso',
  'updatedAt',
  'updatedAtIso',
  'expiresAt',
  'expiresAtIso',
  'consentAt',
  'consentAtIso',
  'submittedByUid',
]);

const IRAN_MOBILE_REGEX = /^09\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEGRAM_HANDLE_REGEX = /^@[A-Za-z0-9_]{5,32}$/;

function normalizeIranianMobile(raw: string): string {
  const digits = raw
    .trim()
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[\s()-]/g, '');
  if (digits.startsWith('+989') && digits.length === 13) return `0${digits.slice(3)}`;
  if (digits.startsWith('00989') && digits.length === 14) return `0${digits.slice(4)}`;
  if (digits.startsWith('989') && digits.length === 12) return `0${digits.slice(2)}`;
  return digits;
}

export function validateContactChannels(
  rawBody: Record<string, unknown>,
  policy: BuyerAlertBusinessPolicy,
  issues: ValidationIssue[],
): ContactChannelDescriptor[] {
  const rawChannels = rawBody.contactChannels;
  const legacyPhone = rawBody.phone;
  const channelsInput: unknown[] = Array.isArray(rawChannels)
    ? rawChannels
    : typeof legacyPhone === 'string'
      ? [{ channel: 'ir_mobile', value: legacyPhone, primary: true }]
      : [];

  if (channelsInput.length === 0 || channelsInput.length > 3) {
    issues.push({
      field: 'contactChannels',
      code: 'INVALID_FORMAT',
      message: 'Between 1 and 3 contact channels must be provided.',
    });
    return [];
  }

  const validated: ContactChannelDescriptor[] = [];
  for (let i = 0; i < channelsInput.length; i++) {
    const item = channelsInput[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      issues.push({
        field: `contactChannels[${i}]`,
        code: 'INVALID_TYPE',
        message: 'Contact channel entry must be an object.',
      });
      continue;
    }
    const obj = item as Record<string, unknown>;
    const chType = obj.channel as ContactChannelType;
    if (
      typeof chType !== 'string' ||
      !policy.allowedContactChannels.includes(chType)
    ) {
      issues.push({
        field: `contactChannels[${i}].channel`,
        code: 'INVALID_ENUM_VALUE',
        message: `Contact channel must be one of: ${policy.allowedContactChannels.join(', ')}.`,
      });
      continue;
    }
    const rawVal = typeof obj.value === 'string' ? sanitizeTextInput(obj.value) : '';
    if (chType === 'ir_mobile') {
      const normalized = normalizeIranianMobile(rawVal);
      if (!IRAN_MOBILE_REGEX.test(normalized)) {
        issues.push({
          field: `contactChannels[${i}].value`,
          code: 'INVALID_FORMAT',
          message: 'Iranian mobile number must match 09XXXXXXXXX (11 digits).',
        });
        continue;
      }
      validated.push({ channel: 'ir_mobile', value: normalized, primary: i === 0 });
    } else if (chType === 'email') {
      const lower = rawVal.toLowerCase();
      if (!EMAIL_REGEX.test(lower) || lower.length > 254) {
        issues.push({
          field: `contactChannels[${i}].value`,
          code: 'INVALID_FORMAT',
          message: 'Invalid contact email address.',
        });
        continue;
      }
      validated.push({ channel: 'email', value: lower, primary: i === 0 });
    } else if (chType === 'telegram') {
      if (!TELEGRAM_HANDLE_REGEX.test(rawVal)) {
        issues.push({
          field: `contactChannels[${i}].value`,
          code: 'INVALID_FORMAT',
          message: 'Telegram handle must start with @ and be 5..32 alphanumeric characters.',
        });
        continue;
      }
      validated.push({ channel: 'telegram', value: rawVal, primary: i === 0 });
    }
  }
  return validated;
}

export function validateExplicitConsentEvidence(
  rawBody: Record<string, unknown>,
  policy: BuyerAlertBusinessPolicy,
  issues: ValidationIssue[],
): ConsentEvidenceInput | null {
  const nested =
    rawBody.consentEvidence && typeof rawBody.consentEvidence === 'object'
      ? (rawBody.consentEvidence as Record<string, unknown>)
      : null;

  const privacyConsent = nested ? nested.privacyConsent : rawBody.privacyConsent;
  const consentVersion = nested ? nested.consentVersion : rawBody.consentVersion;
  const explicitUserAction = nested ? nested.explicitUserAction : rawBody.explicitUserAction;
  const acknowledgedRetentionDays = nested
    ? nested.acknowledgedRetentionDays
    : rawBody.acknowledgedRetentionDays;
  const clientAcceptedAtIso = nested ? nested.clientAcceptedAtIso : rawBody.clientAcceptedAtIso;

  if (privacyConsent !== true) {
    issues.push({
      field: 'consentEvidence.privacyConsent',
      code: 'REQUIRED_FIELD_MISSING',
      message: 'Explicit privacyConsent === true is required.',
    });
    return null;
  }

  if (
    typeof consentVersion !== 'string' ||
    !policy.acceptedConsentVersions.includes(consentVersion.trim())
  ) {
    issues.push({
      field: 'consentEvidence.consentVersion',
      code: 'INVALID_ENUM_VALUE',
      message: `consentVersion must be an accepted policy version (${policy.acceptedConsentVersions.join(', ')}).`,
    });
    return null;
  }

  if (
    explicitUserAction !== 'checkbox_checked' &&
    explicitUserAction !== 'modal_confirm_clicked'
  ) {
    issues.push({
      field: 'consentEvidence.explicitUserAction',
      code: 'REQUIRED_FIELD_MISSING',
      message:
        'privacyConsent is not accepted without explicitUserAction evidence ("checkbox_checked" | "modal_confirm_clicked").',
    });
    return null;
  }

  const retentionRes = requireFiniteNumberInRange({
    min: policy.retentionDays.minDays,
    max: policy.retentionDays.maxDays,
    integerOnly: true,
  })(acknowledgedRetentionDays ?? policy.retentionDays.defaultDays, 'acknowledgedRetentionDays');

  if (!retentionRes.ok) {
    issues.push(...retentionRes.issues);
    return null;
  }

  let normalizedClientIso: string | undefined;
  if (clientAcceptedAtIso !== undefined && clientAcceptedAtIso !== null) {
    const ts = normalizeFirestoreTimestamp(clientAcceptedAtIso);
    if (!ts) {
      issues.push({
        field: 'consentEvidence.clientAcceptedAtIso',
        code: 'INVALID_FORMAT',
        message: 'clientAcceptedAtIso must be a valid ISO timestamp.',
      });
      return null;
    }
    normalizedClientIso = ts.iso;
  }

  return {
    privacyConsent: true,
    consentVersion: consentVersion.trim(),
    explicitUserAction,
    acknowledgedRetentionDays: retentionRes.value!,
    ...(normalizedClientIso ? { clientAcceptedAtIso: normalizedClientIso } : {}),
  };
}

const ALLOWED_CREATE_KEYS: ReadonlySet<string> = new Set([
  'cityId',
  'city',
  'hoodId',
  'fullName',
  'phone',
  'contactChannels',
  'dealType',
  'maxBudgetText',
  'consentEvidence',
  'privacyConsent',
  'consentVersion',
  'explicitUserAction',
  'acknowledgedRetentionDays',
  'clientAcceptedAtIso',
  'requestedRetentionDays',
]);

export function validateCreateBuyerAlertInput(
  rawInput: unknown,
  policy: BuyerAlertBusinessPolicy,
): ValidationResult<CreateBuyerAlertInput> {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return {
      ok: false,
      issues: [{ field: '$root', code: 'INVALID_TYPE', message: 'Request body must be a JSON object.' }],
    };
  }
  const rec = rawInput as Record<string, unknown>;
  const issues: ValidationIssue[] = [];

  for (const key of Object.keys(rec)) {
    if (FORBIDDEN_CLIENT_ALERT_FIELDS.has(key)) {
      issues.push({
        field: key,
        code: 'UNTRUSTED_IDENTITY_FIELD',
        message: `Field "${key}" is server-managed and cannot be supplied by the client.`,
      });
    } else if (!ALLOWED_CREATE_KEYS.has(key)) {
      issues.push({
        field: key,
        code: 'UNKNOWN_FIELD_REJECTED',
        message: `Unknown field "${key}" is not allowed.`,
      });
    }
  }

  const rawCity = rec.cityId ?? rec.city;
  const cityRes = requireEnumValue(['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'] as const)(
    rawCity,
    'cityId',
  );
  const hoodRes = requireFiniteNumberInRange({ min: 1, max: 999, integerOnly: true })(
    rec.hoodId,
    'hoodId',
  );
  const nameRes = requireNonEmptyString({ minLength: 2, maxLength: 100 })(rec.fullName, 'fullName');
  const rawDeal = rec.dealType === 'رهن و اجاره' ? 'اجاره' : rec.dealType;
  const dealRes = requireEnumValue(['خرید', 'اجاره'] as const)(rawDeal, 'dealType');
  const budgetRes = requireNonEmptyString({ minLength: 2, maxLength: 120 })(
    rec.maxBudgetText,
    'maxBudgetText',
  );

  for (const r of [cityRes, hoodRes, nameRes, dealRes, budgetRes]) {
    if (!r.ok) issues.push(...r.issues);
  }

  const contactChannels = validateContactChannels(rec, policy, issues);
  const consentEvidence = validateExplicitConsentEvidence(rec, policy, issues);

  let requestedRetentionDays: number | undefined;
  if (rec.requestedRetentionDays !== undefined && rec.requestedRetentionDays !== null) {
    const retRes = requireFiniteNumberInRange({
      min: policy.retentionDays.minDays,
      max: policy.retentionDays.maxDays,
      integerOnly: true,
    })(rec.requestedRetentionDays, 'requestedRetentionDays');
    if (!retRes.ok) issues.push(...retRes.issues);
    else requestedRetentionDays = retRes.value;
  }

  if (issues.length > 0 || !consentEvidence) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      cityId: cityRes.value!,
      hoodId: hoodRes.value!,
      fullName: nameRes.value!,
      dealType: dealRes.value!,
      maxBudgetText: budgetRes.value!,
      contactChannels,
      consentEvidence,
      ...(requestedRetentionDays !== undefined ? { requestedRetentionDays } : {}),
    },
    issues: [],
  };
}

const ALLOWED_UPDATE_KEYS: ReadonlySet<string> = new Set([
  'expectedRevision',
  'fullName',
  'phone',
  'contactChannels',
  'dealType',
  'maxBudgetText',
]);

export function validateUpdateBuyerAlertInput(
  rawInput: unknown,
  policy: BuyerAlertBusinessPolicy,
): ValidationResult<UpdateBuyerAlertInput> {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return {
      ok: false,
      issues: [{ field: '$root', code: 'INVALID_TYPE', message: 'Request body must be a JSON object.' }],
    };
  }
  const rec = rawInput as Record<string, unknown>;
  const issues: ValidationIssue[] = [];

  for (const key of Object.keys(rec)) {
    if (
      FORBIDDEN_CLIENT_ALERT_FIELDS.has(key) ||
      key === 'cityId' ||
      key === 'city' ||
      key === 'hoodId'
    ) {
      issues.push({
        field: key,
        code: 'UNTRUSTED_IDENTITY_FIELD',
        message: `Field "${key}" is immutable or server-managed.`,
      });
    } else if (!ALLOWED_UPDATE_KEYS.has(key)) {
      issues.push({
        field: key,
        code: 'UNKNOWN_FIELD_REJECTED',
        message: `Unknown field "${key}" is not allowed.`,
      });
    }
  }

  const revRes = requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true })(
    rec.expectedRevision,
    'expectedRevision',
  );
  if (!revRes.ok) issues.push(...revRes.issues);

  const out: UpdateBuyerAlertInput = { expectedRevision: revRes.value ?? 1 };

  if (rec.fullName !== undefined) {
    const r = requireNonEmptyString({ minLength: 2, maxLength: 100 })(rec.fullName, 'fullName');
    if (!r.ok) issues.push(...r.issues);
    else out.fullName = r.value;
  }
  if (rec.dealType !== undefined) {
    const rawDeal = rec.dealType === 'رهن و اجاره' ? 'اجاره' : rec.dealType;
    const r = requireEnumValue(['خرید', 'اجاره'] as const)(rawDeal, 'dealType');
    if (!r.ok) issues.push(...r.issues);
    else out.dealType = r.value;
  }
  if (rec.maxBudgetText !== undefined) {
    const r = requireNonEmptyString({ minLength: 2, maxLength: 120 })(
      rec.maxBudgetText,
      'maxBudgetText',
    );
    if (!r.ok) issues.push(...r.issues);
    else out.maxBudgetText = r.value;
  }
  if (rec.contactChannels !== undefined || rec.phone !== undefined) {
    out.contactChannels = validateContactChannels(rec, policy, issues);
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: out, issues: [] };
}

export function validateWithdrawBuyerAlertInput(
  rawInput: unknown,
): ValidationResult<WithdrawBuyerAlertInput> {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return {
      ok: false,
      issues: [{ field: '$root', code: 'INVALID_TYPE', message: 'Request body must be a JSON object.' }],
    };
  }
  const rec = rawInput as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  const revRes = requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true })(
    rec.expectedRevision,
    'expectedRevision',
  );
  if (!revRes.ok) issues.push(...revRes.issues);

  let reason: string | undefined;
  if (rec.reason !== undefined && rec.reason !== null) {
    const r = requireNonEmptyString({ minLength: 2, maxLength: 240 })(rec.reason, 'reason');
    if (!r.ok) issues.push(...r.issues);
    else reason = r.value;
  }
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: { expectedRevision: revRes.value!, ...(reason ? { reason } : {}) }, issues: [] };
}

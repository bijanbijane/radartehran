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
  CancelSponsorReservationInput,
  ModerateSponsorReservationInput,
  OwnerSponsorReservationView,
  PublicSponsorPlacementProjection,
  SponsorPlanMonths,
  SponsorReservationStatus,
  SponsorSlotCatalogAdapter,
  SponsorSupportedCityId,
  StoredSponsorReservation,
  SubmitSponsorReservationInput,
  VerifiedPaymentEventInput,
} from './types';

export type SponsorTransitionActor = 'owner' | 'admin' | 'payment_verifier' | 'system_expiry';

const ALLOWED_SPONSOR_TRANSITIONS: Readonly<
  Record<
    SponsorTransitionActor,
    Readonly<Record<SponsorReservationStatus, readonly SponsorReservationStatus[]>>
  >
> = {
  owner: {
    pending_review: ['cancelled'],
    approved_awaiting_payment: ['cancelled'],
    active: ['cancelled'],
    rejected: [],
    cancelled: [],
    expired: [],
  },
  admin: {
    pending_review: ['approved_awaiting_payment', 'active', 'rejected'],
    approved_awaiting_payment: ['active', 'rejected'],
    active: ['rejected'],
    rejected: [],
    cancelled: [],
    expired: [],
  },
  payment_verifier: {
    pending_review: ['pending_review'],
    approved_awaiting_payment: ['active'],
    active: ['active'],
    rejected: [],
    cancelled: [],
    expired: [],
  },
  system_expiry: {
    pending_review: ['expired'],
    approved_awaiting_payment: ['expired'],
    active: ['expired'],
    rejected: [],
    cancelled: [],
    expired: [],
  },
};

export function validateSponsorLifecycleTransition(
  currentStatus: SponsorReservationStatus,
  targetStatus: SponsorReservationStatus,
  actor: SponsorTransitionActor,
): { allowed: boolean; reason?: string } {
  const allowedTargets = ALLOWED_SPONSOR_TRANSITIONS[actor]?.[currentStatus] ?? [];
  if (!allowedTargets.includes(targetStatus)) {
    return {
      allowed: false,
      reason: `Sponsor transition from "${currentStatus}" to "${targetStatus}" is not permitted for actor "${actor}".`,
    };
  }
  return { allowed: true };
}

/**
 * Computes canonical server-side sponsorship pricing (matching `firestore.rules` invariant:
 * 1 month = 1x monthlyTariffMillion; 3 months = 2.4x monthlyTariffMillion, i.e., 20% quarterly discount).
 */
export function computeCanonicalSponsorTariff(
  baseMonthlyMillion: number,
  rawPlanMonths: unknown,
): {
  planMonths: SponsorPlanMonths;
  monthlyTariffMillion: number;
  totalPayableMillion: number;
} {
  const planMonths: SponsorPlanMonths = rawPlanMonths === 3 ? 3 : 1;
  const safeMonthly = Math.max(1, Math.min(1000, Math.round(baseMonthlyMillion)));
  const totalPayableMillion =
    planMonths === 3 ? Math.round(safeMonthly * 24) / 10 : safeMonthly;
  return { planMonths, monthlyTariffMillion: safeMonthly, totalPayableMillion };
}

export function computePlacementExpirationTimestamp(
  nowEpochMs: number,
  planMonths: SponsorPlanMonths,
) {
  const durationMs = planMonths * 30 * 24 * 60 * 60 * 1000;
  return normalizeFirestoreTimestamp(nowEpochMs + durationMs)!;
}

export function isSponsorReservationExpired(
  doc: Pick<StoredSponsorReservation, 'status' | 'expiresAt'>,
  nowEpochMs: number,
): boolean {
  if (doc.status === 'expired') return true;
  if (!doc.expiresAt) return false;
  return nowEpochMs >= doc.expiresAt.epochMs;
}

export function createDefaultSponsorSlotCatalogAdapter(
  catalogByCity?: Partial<
    Record<
      SponsorSupportedCityId,
      ReadonlyArray<{ id: number; name: string; baseMonthlyTariffMillion?: number }>
    >
  >,
): SponsorSlotCatalogAdapter {
  return {
    resolveNeighborhoodSlot(cityId: SponsorSupportedCityId, hoodId: number) {
      const cityList = catalogByCity?.[cityId];
      if (cityList) {
        const found = cityList.find((h) => h.id === hoodId);
        if (!found) return null;
        return {
          cityId,
          hoodId: found.id,
          hoodName: found.name,
          baseMonthlyTariffMillion: found.baseMonthlyTariffMillion ?? 15,
        };
      }
      if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999) return null;
      return {
        cityId,
        hoodId,
        hoodName: `محله ${hoodId} (${cityId})`,
        baseMonthlyTariffMillion: 15,
      };
    },
  };
}

export function toOwnerSponsorReservationView(
  doc: StoredSponsorReservation,
): OwnerSponsorReservationView {
  return {
    id: doc.id,
    slotKey: doc.slotKey,
    ownerUid: doc.ownerUid,
    cityId: doc.cityId,
    hoodId: doc.hoodId,
    hoodName: doc.hoodName,
    agencyName: doc.agencyName,
    phone: doc.phone,
    specialty: doc.specialty,
    experienceYears: doc.experienceYears,
    planMonths: doc.planMonths,
    monthlyTariffMillion: doc.monthlyTariffMillion,
    totalPayableMillion: doc.totalPayableMillion,
    trackingCode: doc.trackingCode,
    status: doc.status,
    paymentStatus: doc.paymentStatus,
    ...(doc.paymentReferenceId ? { paymentReferenceId: doc.paymentReferenceId } : {}),
    revision: doc.revision,
    createdAtIso: doc.createdAt.iso,
    updatedAtIso: doc.updatedAt.iso,
    ...(doc.expiresAt ? { expiresAtIso: doc.expiresAt.iso } : {}),
    ...(doc.rejectionReason ? { rejectionReason: doc.rejectionReason } : {}),
  };
}

export function toPublicSponsorPlacementProjection(
  doc: StoredSponsorReservation | null | undefined,
  nowEpochMs: number,
): PublicSponsorPlacementProjection | null {
  if (!doc || doc.status !== 'active' || !doc.expiresAt) return null;
  if (isSponsorReservationExpired(doc, nowEpochMs)) return null;
  if (doc.paymentStatus !== 'paid_verified' && doc.paymentStatus !== 'waived_by_policy') {
    return null;
  }

  return {
    cityId: doc.cityId,
    hoodId: doc.hoodId,
    hoodName: doc.hoodName,
    agencyName: doc.agencyName,
    phone: doc.phone,
    specialty: doc.specialty,
    experienceYears: doc.experienceYears,
    planMonths: doc.planMonths,
    expiresAtIso: doc.expiresAt.iso,
  };
}

const FORBIDDEN_CLIENT_SPONSOR_FIELDS: ReadonlySet<string> = new Set([
  ...UNTRUSTED_REQUEST_IDENTITY_FIELDS,
  'id',
  'reservationId',
  'slotKey',
  'status',
  'fromStatus',
  'paymentStatus',
  'paid',
  'isPaid',
  'paymentReferenceId',
  'paidAt',
  'monthlyTariffMillion',
  'totalPayableMillion',
  'trackingCode',
  'expiresAt',
  'expiresAtIso',
  'approvedAt',
  'approvedByUid',
  'revision',
]);

const ALLOWED_SUBMIT_KEYS: ReadonlySet<string> = new Set([
  'cityId',
  'city',
  'hoodId',
  'agencyName',
  'phone',
  'specialty',
  'experienceYears',
  'planMonths',
]);

const IRAN_MOBILE_REGEX = /^09\d{9}$/;

export function validateSubmitSponsorInput(
  rawInput: unknown,
): ValidationResult<SubmitSponsorReservationInput> {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return {
      ok: false,
      issues: [{ field: '$root', code: 'INVALID_TYPE', message: 'Request body must be a JSON object.' }],
    };
  }
  const rec = rawInput as Record<string, unknown>;
  const issues: ValidationIssue[] = [];

  for (const key of Object.keys(rec)) {
    if (FORBIDDEN_CLIENT_SPONSOR_FIELDS.has(key)) {
      issues.push({
        field: key,
        code: 'UNTRUSTED_IDENTITY_FIELD',
        message: `Field "${key}" is server-managed (pricing, payment, and identity cannot be set by client).`,
      });
    } else if (!ALLOWED_SUBMIT_KEYS.has(key)) {
      issues.push({
        field: key,
        code: 'UNKNOWN_FIELD_REJECTED',
        message: `Unknown field "${key}" is not allowed.`,
      });
    }
  }

  const cityRes = requireEnumValue(['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'] as const)(
    rec.cityId ?? rec.city ?? 'tehran',
    'cityId',
  );
  const hoodRes = requireFiniteNumberInRange({ min: 1, max: 999, integerOnly: true })(
    rec.hoodId,
    'hoodId',
  );
  const agencyRes = requireNonEmptyString({ minLength: 2, maxLength: 120 })(
    rec.agencyName,
    'agencyName',
  );
  const specialtyRes = requireNonEmptyString({ minLength: 2, maxLength: 140 })(
    rec.specialty,
    'specialty',
  );
  const expRes = requireFiniteNumberInRange({ min: 1, max: 60, integerOnly: true })(
    rec.experienceYears,
    'experienceYears',
  );

  for (const r of [cityRes, hoodRes, agencyRes, specialtyRes, expRes]) {
    if (!r.ok) issues.push(...r.issues);
  }

  const rawPhone = typeof rec.phone === 'string' ? sanitizeTextInput(rec.phone).replace(/\s+/g, '') : '';
  if (!IRAN_MOBILE_REGEX.test(rawPhone)) {
    issues.push({
      field: 'phone',
      code: 'INVALID_FORMAT',
      message: 'phone must be a valid 11-digit Iranian mobile number (09XXXXXXXXX).',
    });
  }

  const rawPlan = rec.planMonths ?? 1;
  if (rawPlan !== 1 && rawPlan !== 3) {
    issues.push({
      field: 'planMonths',
      code: 'INVALID_ENUM_VALUE',
      message: 'planMonths must be 1 or 3.',
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      cityId: cityRes.value!,
      hoodId: hoodRes.value!,
      agencyName: agencyRes.value!.replace(/[<>]/g, ''),
      phone: rawPhone,
      specialty: specialtyRes.value!.replace(/[<>]/g, ''),
      experienceYears: expRes.value!,
      planMonths: rawPlan as SponsorPlanMonths,
    },
    issues: [],
  };
}

export function validateModerateSponsorInput(
  rawInput: unknown,
): ValidationResult<ModerateSponsorReservationInput> {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return {
      ok: false,
      issues: [{ field: '$root', code: 'INVALID_TYPE', message: 'Request body must be a JSON object.' }],
    };
  }
  const rec = rawInput as Record<string, unknown>;
  const issues: ValidationIssue[] = [];

  if ('fromStatus' in rec || 'paymentStatus' in rec || 'paid' in rec) {
    issues.push({
      field: 'fromStatus',
      code: 'UNTRUSTED_IDENTITY_FIELD',
      message: 'Client cannot supply fromStatus or paymentStatus in moderation requests.',
    });
  }

  const decisionRes = requireEnumValue(['approve', 'reject'] as const)(
    rec.decision ?? rec.action,
    'decision',
  );
  if (!decisionRes.ok) issues.push(...decisionRes.issues);

  let expectedRevision: number | undefined;
  if (rec.expectedRevision !== undefined && rec.expectedRevision !== null) {
    const revRes = requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true })(
      rec.expectedRevision,
      'expectedRevision',
    );
    if (!revRes.ok) issues.push(...revRes.issues);
    else expectedRevision = revRes.value;
  }

  let rejectionReason: string | undefined;
  if (rec.rejectionReason !== undefined && rec.rejectionReason !== null) {
    const r = requireNonEmptyString({ minLength: 3, maxLength: 300 })(
      rec.rejectionReason,
      'rejectionReason',
    );
    if (!r.ok) issues.push(...r.issues);
    else rejectionReason = r.value;
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      decision: decisionRes.value!,
      ...(expectedRevision !== undefined ? { expectedRevision } : {}),
      ...(rec.waivePaymentRequirement === true ? { waivePaymentRequirement: true } : {}),
      ...(rejectionReason ? { rejectionReason } : {}),
    },
    issues: [],
  };
}

export function validateCancelSponsorInput(
  rawInput: unknown,
): ValidationResult<CancelSponsorReservationInput> {
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

export function validateVerifiedPaymentEventInput(
  rawInput: unknown,
): ValidationResult<VerifiedPaymentEventInput> {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return {
      ok: false,
      issues: [{ field: '$root', code: 'INVALID_TYPE', message: 'Payment event must be a JSON object.' }],
    };
  }
  const rec = rawInput as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  const eventIdRes = requireSafeFirestoreId()(rec.eventId, 'eventId');
  const resIdRes = requireSafeFirestoreId()(rec.reservationId, 'reservationId');
  const amountRes = requireFiniteNumberInRange({ min: 0.1, max: 10_000 })(
    rec.amountMillionToman,
    'amountMillionToman',
  );
  const extRefRes = requireNonEmptyString({ minLength: 4, maxLength: 128 })(
    rec.externalReferenceId,
    'externalReferenceId',
  );
  const sigRes = requireNonEmptyString({ minLength: 8, maxLength: 512 })(
    rec.verificationSignature,
    'verificationSignature',
  );
  const tsNorm = normalizeFirestoreTimestamp(rec.occurredAtIso);

  for (const r of [eventIdRes, resIdRes, amountRes, extRefRes, sigRes]) {
    if (!r.ok) issues.push(...r.issues);
  }
  if (!tsNorm) {
    issues.push({
      field: 'occurredAtIso',
      code: 'INVALID_FORMAT',
      message: 'occurredAtIso must be a valid ISO timestamp.',
    });
  }
  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      eventId: eventIdRes.value!,
      reservationId: resIdRes.value!,
      amountMillionToman: amountRes.value!,
      externalReferenceId: extRefRes.value!,
      verificationSignature: sigRes.value!,
      occurredAtIso: tsNorm!.iso,
    },
    issues: [],
  };
}

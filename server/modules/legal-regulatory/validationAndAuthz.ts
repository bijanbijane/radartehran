import type { Request } from 'express';
import {
  verifyAdminApiAuthorization,
  verifyAuthenticatedUserHeader,
} from '../../../src/utils/serverAdminAndTelegramSecurity';
import {
  ComplianceRequirementRecord,
  GeographicJurisdictionScope,
  LegalRegulatoryActorContext,
  PublicComplianceRequirementView,
  PublicRegulatoryProvisionView,
  PublicRegulatorySourceView,
  RegulatoryProvisionRecord,
  RegulatorySourceRecord,
} from './types';

export type LegalRegulatoryErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT_OR_DUPLICATE'
  | 'CONCURRENT_MODIFICATION_CONFLICT'
  | 'INVALID_LIFECYCLE_TRANSITION'
  | 'AUTHORITATIVE_AI_VIOLATION'
  | 'CROSS_MODULE_WRITE_PROHIBITED'
  | 'PERSISTENCE_UNAVAILABLE';

export class LegalRegulatoryError extends Error {
  public readonly code: LegalRegulatoryErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: LegalRegulatoryErrorCode,
    message: string,
    statusCode = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'LegalRegulatoryError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const ISO_DATE_PREFIX_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2}))?$/;

export function assertNonEmptyText(value: unknown, fieldName: string, maxLength = 4000): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new LegalRegulatoryError('VALIDATION_ERROR', `Field '${fieldName}' must be a non-empty string.`, 400, {
      fieldName,
    });
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      `Field '${fieldName}' exceeds maximum length of ${maxLength} characters.`,
      400,
      { fieldName, maxLength },
    );
  }
  return trimmed;
}

export function assertValidIsoDate(value: unknown, fieldName: string): string {
  const str = assertNonEmptyText(value, fieldName, 64);
  if (!ISO_DATE_PREFIX_REGEX.test(str) || Number.isNaN(Date.parse(str))) {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      `Field '${fieldName}' must be a valid ISO-8601 date or timestamp string.`,
      400,
      { fieldName, providedValue: value },
    );
  }
  return str;
}

export function validateOptionalSourceUrl(urlValue: string | null | undefined): string | null {
  if (urlValue === undefined || urlValue === null || urlValue.trim() === '') {
    return null;
  }
  const trimmed = urlValue.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Unsupported protocol');
    }
    return trimmed;
  } catch {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      'verifiedOriginalSourceUrl must be a valid http/https URL or null.',
      400,
      { verifiedOriginalSourceUrl: urlValue },
    );
  }
}

export function validateDateWindow(
  effectiveFromIso: string,
  effectiveToIso?: string | null,
  repealedAtIso?: string | null,
): void {
  const fromMs = Date.parse(assertValidIsoDate(effectiveFromIso, 'effectiveFromIso'));
  if (effectiveToIso) {
    const toMs = Date.parse(assertValidIsoDate(effectiveToIso, 'effectiveToIso'));
    if (toMs < fromMs) {
      throw new LegalRegulatoryError(
        'VALIDATION_ERROR',
        'effectiveToIso cannot be earlier than effectiveFromIso.',
        400,
        { effectiveFromIso, effectiveToIso },
      );
    }
  }
  if (repealedAtIso) {
    const repealMs = Date.parse(assertValidIsoDate(repealedAtIso, 'repealedAtIso'));
    if (repealMs < fromMs) {
      throw new LegalRegulatoryError(
        'VALIDATION_ERROR',
        'repealedAtIso cannot be earlier than effectiveFromIso.',
        400,
        { effectiveFromIso, repealedAtIso },
      );
    }
  }
}

export function validateJurisdictionScopeStructure(scope: GeographicJurisdictionScope): void {
  if (!scope || scope.countryCode !== 'IR') {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      'jurisdictionScope.countryCode must be "IR".',
      400,
    );
  }
  if (scope.level === 'PROVINCIAL' && !scope.provinceId) {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      'PROVINCIAL jurisdiction scope requires provinceId.',
      400,
    );
  }
  if (
    (scope.level === 'CITY' ||
      scope.level === 'MUNICIPALITY_REGION' ||
      scope.level === 'DISTRICT' ||
      scope.level === 'NEIGHBORHOOD') &&
    !scope.cityId
  ) {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      `${scope.level} jurisdiction scope requires cityId.`,
      400,
    );
  }
  if (scope.level === 'DISTRICT' && (typeof scope.districtNumber !== 'number' || scope.districtNumber < 1)) {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      'DISTRICT jurisdiction scope requires a positive districtNumber.',
      400,
    );
  }
  if (scope.level === 'NEIGHBORHOOD' && (!scope.neighborhoodId || scope.neighborhoodId.trim() === '')) {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      'NEIGHBORHOOD jurisdiction scope requires neighborhoodId.',
      400,
    );
  }
  if (scope.level === 'DESIGNATED_ZONE' && (!scope.designatedZoneCode || scope.designatedZoneCode.trim() === '')) {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      'DESIGNATED_ZONE jurisdiction scope requires designatedZoneCode.',
      400,
    );
  }
}

export function normalizePaginationLimit(rawLimit?: number): number {
  if (rawLimit === undefined || rawLimit === null || Number.isNaN(Number(rawLimit))) {
    return 25;
  }
  const intLimit = Math.floor(Number(rawLimit));
  if (intLimit < 1) return 1;
  if (intLimit > 100) return 100;
  return intLimit;
}

export function assertAdminOrReviewerActor(
  actor: LegalRegulatoryActorContext,
  allowedRoles: Array<'LEGAL_REVIEWER' | 'REGULATORY_ADMIN'> = ['LEGAL_REVIEWER', 'REGULATORY_ADMIN'],
): void {
  if (!actor || !actor.isAuthenticated || !actor.actorId || actor.actorId.trim() === '') {
    throw new LegalRegulatoryError(
      'UNAUTHENTICATED',
      'Authentication is required to perform legal or regulatory mutations.',
      401,
    );
  }
  if (!allowedRoles.includes(actor.role as 'LEGAL_REVIEWER' | 'REGULATORY_ADMIN')) {
    throw new LegalRegulatoryError(
      'FORBIDDEN',
      `Actor '${actor.actorId}' with role '${actor.role}' is not authorized. Required one of: ${allowedRoles.join(', ')}.`,
      403,
    );
  }
}

export async function resolveActorContextFromExpressRequest(req: Request): Promise<LegalRegulatoryActorContext> {
  const headersMap = req.headers as Record<string, string | string[]>;
  const adminCheck = await verifyAdminApiAuthorization(headersMap);
  if (adminCheck.authorized) {
    const reviewerHeader = req.headers['x-legal-actor-id'];
    const actorId =
      typeof reviewerHeader === 'string' && reviewerHeader.trim().length > 0
        ? reviewerHeader.trim()
        : 'system-admin-key';
    return {
      actorId,
      role: 'REGULATORY_ADMIN',
      isAuthenticated: true,
    };
  }

  const userCheck = await verifyAuthenticatedUserHeader(headersMap);
  if (userCheck.authenticated && userCheck.uid) {
    const roleHeader = req.headers['x-legal-actor-role'];
    const isReviewer = roleHeader === 'LEGAL_REVIEWER' && adminCheck.authorized;
    return {
      actorId: userCheck.uid,
      role: isReviewer ? 'LEGAL_REVIEWER' : 'AUTHENTICATED_USER',
      isAuthenticated: true,
    };
  }

  return {
    actorId: 'anonymous-public-reader',
    role: 'PUBLIC_READER',
    isAuthenticated: false,
  };
}

export function isPrivilegedRegulatoryViewer(actor?: LegalRegulatoryActorContext): boolean {
  if (!actor || !actor.isAuthenticated) return false;
  return actor.role === 'REGULATORY_ADMIN' || actor.role === 'LEGAL_REVIEWER';
}

export function toPublicRegulatorySource(
  source: RegulatorySourceRecord,
  actor?: LegalRegulatoryActorContext,
): RegulatorySourceRecord | PublicRegulatorySourceView {
  if (isPrivilegedRegulatoryViewer(actor)) {
    return { ...source };
  }
  const {
    internalReviewerNotes: _notes,
    restrictedAuditMetadata: _audit,
    ...publicView
  } = source;
  return publicView;
}

export function toPublicRegulatoryProvision(
  provision: RegulatoryProvisionRecord,
  actor?: LegalRegulatoryActorContext,
): RegulatoryProvisionRecord | PublicRegulatoryProvisionView {
  if (isPrivilegedRegulatoryViewer(actor)) {
    return { ...provision };
  }
  const {
    internalReviewerNotes: _notes,
    restrictedAuditMetadata: _audit,
    ...publicView
  } = provision;
  return publicView;
}

export function toPublicComplianceRequirement(
  requirement: ComplianceRequirementRecord,
  actor?: LegalRegulatoryActorContext,
): ComplianceRequirementRecord | PublicComplianceRequirementView {
  if (isPrivilegedRegulatoryViewer(actor)) {
    return { ...requirement };
  }
  const { internalReviewerNotes: _notes, ...publicView } = requirement;
  return publicView;
}

import {
  AgencyBranchRecord,
  BrokerageActorContext,
  BrokerageOpsError,
  BrokerageOrganizationRecord,
  InternalCommissionAllocationRecord,
  NON_INFERRABLE_RESTRICTED_ACTIONS,
  OrganizationAgentAffiliationRecord,
  PermittedMandateAction,
  ProfessionalProfileRecord,
  ProfessionalQualificationRecord,
  RepresentationMandateRecord,
} from './types';

export function requireNonEmpty(value: string | undefined, field: string, maxLen = 1000): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    throw new BrokerageOpsError('VALIDATION_FAILED', `Field '${field}' is required and cannot be empty.`, 400);
  }
  if (trimmed.length > maxLen) {
    throw new BrokerageOpsError('VALIDATION_FAILED', `Field '${field}' exceeds ${maxLen} chars.`, 400);
  }
  return trimmed;
}

export function assertSameOrganizationAccess(
  actor: BrokerageActorContext,
  targetOrganizationId: string,
  requireAdminOrSupervisor = false
): void {
  if (actor.role === 'COMPLIANCE_VERIFIER' || actor.role === 'AUDITOR_READ_ONLY') {
    if (requireAdminOrSupervisor && actor.role === 'AUDITOR_READ_ONLY') {
      throw new BrokerageOpsError('INSUFFICIENT_PRIVILEGE', 'Read-only auditor cannot mutate organization records.', 403);
    }
    return;
  }
  if (!actor.organizationId || actor.organizationId !== targetOrganizationId) {
    throw new BrokerageOpsError(
      'CROSS_ORGANIZATION_ACCESS_DENIED',
      `Actor from organization '${actor.organizationId ?? 'none'}' cannot access organization '${targetOrganizationId}'.`,
      403
    );
  }
  if (
    requireAdminOrSupervisor &&
    actor.role !== 'ORG_ADMIN' &&
    actor.role !== 'BRANCH_MANAGER' &&
    actor.role !== 'SUPERVISOR'
  ) {
    throw new BrokerageOpsError(
      'INSUFFICIENT_PRIVILEGE',
      `Role '${actor.role}' lacks administrative or supervisory privileges in organization '${targetOrganizationId}'.`,
      403
    );
  }
}

export function assertBranchAccess(
  actor: BrokerageActorContext,
  branch: AgencyBranchRecord
): void {
  assertSameOrganizationAccess(actor, branch.parentOrganizationId, false);
  if (
    actor.role === 'BRANCH_MANAGER' &&
    actor.branchId &&
    actor.branchId !== branch.id
  ) {
    throw new BrokerageOpsError(
      'UNAUTHORIZED_BRANCH_ACCESS',
      `Branch manager for '${actor.branchId}' is not authorized to mutate branch '${branch.id}'.`,
      403
    );
  }
  if (
    actor.role !== 'ORG_ADMIN' &&
    actor.role !== 'BRANCH_MANAGER' &&
    actor.role !== 'SUPERVISOR' &&
    actor.role !== 'COMPLIANCE_VERIFIER'
  ) {
    throw new BrokerageOpsError(
      'UNAUTHORIZED_BRANCH_ACCESS',
      `Role '${actor.role}' cannot manage branch '${branch.id}'.`,
      403
    );
  }
}

export function evaluateQualificationEligibility(
  qualifications: ProfessionalQualificationRecord[],
  requiredCitySlug: string,
  asOfDateIso = new Date().toISOString()
): { hasActiveVerifiedQualificationInJurisdiction: boolean; reason: string } {
  const asOfMs = new Date(asOfDateIso).getTime();
  const normalizedCity = requiredCitySlug.trim().toLowerCase();

  for (const q of qualifications) {
    if (q.status !== 'VERIFIED') continue;
    // Never automatically apply one jurisdiction's license to another jurisdiction
    if (q.jurisdiction.citySlug.trim().toLowerCase() !== normalizedCity) continue;
    if (q.expirationDateIso && new Date(q.expirationDateIso).getTime() < asOfMs) {
      continue;
    }
    return {
      hasActiveVerifiedQualificationInJurisdiction: true,
      reason: `Verified qualification '${q.id}' active in '${normalizedCity}'.`,
    };
  }
  return {
    hasActiveVerifiedQualificationInJurisdiction: false,
    reason: `No active VERIFIED qualification found for jurisdiction '${normalizedCity}'.`,
  };
}

export function assertActiveAffiliationForAssignment(
  affiliation: OrganizationAgentAffiliationRecord | null,
  organizationId: string,
  branchId?: string
): void {
  if (!affiliation || affiliation.organizationId !== organizationId) {
    throw new BrokerageOpsError(
      'AFFILIATION_INACTIVE_OR_TERMINATED',
      `Professional has no affiliation with organization '${organizationId}'.`,
      403
    );
  }
  if (affiliation.affiliationStatus !== 'ACTIVE') {
    throw new BrokerageOpsError(
      'AFFILIATION_INACTIVE_OR_TERMINATED',
      `Professional affiliation '${affiliation.id}' is '${affiliation.affiliationStatus}' and retains no active permissions.`,
      403
    );
  }
  if (branchId && affiliation.branchId && affiliation.branchId !== branchId) {
    throw new BrokerageOpsError(
      'UNAUTHORIZED_BRANCH_ACCESS',
      `Professional is affiliated with branch '${affiliation.branchId}', not '${branchId}'.`,
      403
    );
  }
}

export function assertMandateActionPermitted(
  mandate: RepresentationMandateRecord,
  action: PermittedMandateAction,
  asOfDateIso = new Date().toISOString()
): void {
  const asOfMs = new Date(asOfDateIso).getTime();
  if (new Date(mandate.expirationDateIso).getTime() < asOfMs || mandate.status === 'EXPIRED' || mandate.status === 'TERMINATED') {
    throw new BrokerageOpsError(
      'MANDATE_EXPIRED_OR_INACTIVE',
      `Mandate '${mandate.id}' is expired or terminated and cannot authorize '${action}'.`,
      409
    );
  }
  if (mandate.status !== 'ACCEPTED_BY_CLIENT' && mandate.status !== 'VERIFIED_AGAINST_EVIDENCE') {
    throw new BrokerageOpsError(
      'CLIENT_ACCEPTANCE_REQUIRED',
      `Mandate '${mandate.id}' is in status '${mandate.status}'; client acceptance is required before exercising representation authority.`,
      403
    );
  }

  const scope = mandate.authorityScopes.find((s) => s.authorizedAction === action);
  if (!scope) {
    if (NON_INFERRABLE_RESTRICTED_ACTIONS.has(action)) {
      throw new BrokerageOpsError(
        'RESTRICTED_AUTHORITY_NOT_INFERRED',
        `Action '${action}' is never inferred from a general mandate and has not been explicitly granted.`,
        403
      );
    }
    throw new BrokerageOpsError(
      'OUTSIDE_MANDATE_AUTHORITY_SCOPE',
      `Action '${action}' is outside the recorded authority scope of mandate '${mandate.id}'.`,
      403
    );
  }

  if (NON_INFERRABLE_RESTRICTED_ACTIONS.has(action)) {
    if (scope.verificationStatus !== 'EXPLICITLY_VERIFIED' || scope.supportingEvidenceIds.length === 0) {
      throw new BrokerageOpsError(
        'RESTRICTED_AUTHORITY_NOT_INFERRED',
        `Restricted legal/financial action '${action}' requires EXPLICITLY_VERIFIED status and supportingEvidenceIds.`,
        403
      );
    }
  }
}

export function validateCommissionAllocations(
  allocations: Omit<InternalCommissionAllocationRecord, 'id' | 'commissionAgreementId'>[],
  totalCalculatedCommissionRials?: number
): void {
  if (allocations.length === 0) return;
  const methods = new Set(allocations.map((a) => a.allocationMethod));
  if (methods.size > 1) {
    throw new BrokerageOpsError(
      'INVALID_ALLOCATION_TOTAL',
      'All internal commission allocations on an agreement must use the same allocationMethod (PERCENTAGE or FIXED_AMOUNT).',
      400
    );
  }
  const method = allocations[0].allocationMethod;
  const sum = allocations.reduce((acc, item) => acc + item.percentageOrAmount, 0);
  if (method === 'PERCENTAGE') {
    // Must equal 100% exactly; no silent residual allocation
    if (Math.abs(sum - 100) > 0.001) {
      throw new BrokerageOpsError(
        'INVALID_ALLOCATION_TOTAL',
        `Percentage allocations must sum to exactly 100% (got ${sum}%). Residual amounts are never silently allocated.`,
        400
      );
    }
  } else {
    if (totalCalculatedCommissionRials !== undefined && Math.abs(sum - totalCalculatedCommissionRials) > 1) {
      throw new BrokerageOpsError(
        'INVALID_ALLOCATION_TOTAL',
        `Fixed-amount allocations (${sum}) must equal total calculated commission (${totalCalculatedCommissionRials}).`,
        400
      );
    }
  }
}

export function projectPublicProfessionalProfile(
  profile: ProfessionalProfileRecord
): Omit<ProfessionalProfileRecord, 'privateContactEmail'> {
  const { privateContactEmail: _omit, ...publicSafe } = profile;
  return publicSafe;
}

export function validateOrganizationMetadata(input: {
  displayName: string;
  contactPhone: string;
  contactEmail: string;
}): void {
  requireNonEmpty(input.displayName, 'displayName', 250);
  const phone = requireNonEmpty(input.contactPhone, 'contactPhone', 40);
  const email = requireNonEmpty(input.contactEmail, 'contactEmail', 150);
  if (!email.includes('@')) {
    throw new BrokerageOpsError('VALIDATION_FAILED', `Invalid email address '${email}'.`, 400);
  }
  if (phone.length < 5) {
    throw new BrokerageOpsError('VALIDATION_FAILED', `Invalid contactPhone '${phone}'.`, 400);
  }
}

export function assertExpectedVersion(actualVersion: number, expectedVersion?: number, entityId?: string): void {
  if (expectedVersion !== undefined && actualVersion !== expectedVersion) {
    throw new BrokerageOpsError(
      'CONCURRENCY_VERSION_CONFLICT',
      `Concurrency conflict on '${entityId ?? 'record'}': expected version ${expectedVersion}, actual version ${actualVersion}.`,
      409
    );
  }
}

export function assertOrgActiveForMandate(org: BrokerageOrganizationRecord): void {
  if (org.operatingStatus !== 'ACTIVE') {
    throw new BrokerageOpsError(
      'VALIDATION_FAILED',
      `Organization '${org.id}' is in status '${org.operatingStatus}' and cannot enter new active mandates.`,
      400
    );
  }
}

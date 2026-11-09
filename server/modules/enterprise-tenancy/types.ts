/**
 * @file server/modules/enterprise-tenancy/types.ts
 * @description Employee 74 — Enterprise Multi-Tenancy and Organizational Isolation (Phases 2 & 3).
 * Authoritative domain models for Tenants, Organizations, Memberships, Invitations,
 * Versioned Configurations, Provisioning Lifecycle, Trusted Tenant Context Resolution,
 * Tenant-Scoped Repositories, Cross-Module Entity Classifications, and Controlled Cross-Tenant Access.
 */

import type { EmployeeId, TenantOwnershipClassification } from '../platform-foundation/types';

export type TenantType =
  | 'INDIVIDUAL_BUSINESS'
  | 'BROKERAGE'
  | 'PROPERTY_MANAGEMENT'
  | 'DEVELOPER'
  | 'REAL_ESTATE_AGENCY'
  | 'ENTERPRISE'
  | 'INSTITUTION'
  | 'OTHER';

export type TenantLifecycleStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'CLOSING'
  | 'CLOSED'
  | 'ARCHIVED';

export type OrganizationType =
  | 'HEADQUARTERS'
  | 'BRANCH_OFFICE'
  | 'FRANCHISE_UNIT'
  | 'SUBSIDIARY'
  | 'DEPARTMENT'
  | 'PARTNER_ENTITY';

export type OrganizationLifecycleStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

export type MembershipLifecycleStatus =
  | 'INVITED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'EXPIRED';

export type InvitationLifecycleStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REVOKED'
  | 'EXPIRED';

export type TenantProvisioningStatus =
  | 'REQUESTED'
  | 'VALIDATING'
  | 'PROVISIONING'
  | 'READY'
  | 'FAILED'
  | 'COMPENSATING'
  | 'COMPENSATED';

export interface TenantRecord {
  tenantId: string;
  tenantCode: string;
  displayName: string;
  legalName?: string | null;
  tenantType: TenantType;
  status: TenantLifecycleStatus;
  primaryOrganizationId?: string | null;
  ownerUserId: string;
  defaultLocale: string;
  defaultTimezone: string;
  countryCode: string;
  configurationVersion: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  recordVersion: number;
}

export interface TenantConfiguration {
  tenantId: string;
  configurationVersion: number;
  displayPreferences: {
    rtlEnabled: boolean;
    areaUnitDefault: 'sqm' | 'sqft';
    currencyDisplayDefault: 'IRT' | 'USD' | 'EUR' | 'AED';
  };
  locale: string;
  timezone: string;
  enabledBusinessModules: string[];
  featureAvailability: Record<string, boolean>;
  allowedUserRoles: string[];
  organizationSettings: {
    allowSubOrganizations: boolean;
    maxHierarchyDepth: number;
    requireInvitationApproval: boolean;
  };
  notificationPreferenceReference: string | null;
  approvedBrandingMetadata: {
    brandDisplayName: string;
    logoObjectReference: string | null;
    primaryAccentHex: string;
  };
  operationalRestrictions: {
    maxConcurrentListings: number;
    maxActiveMembers: number;
    apiRateLimitPerMinute: number;
    exportsAllowed: boolean;
  };
  updatedAt: string;
  updatedBy: string;
}

export interface OrganizationRecord {
  organizationId: string;
  tenantId: string;
  organizationCode: string;
  displayName: string;
  legalName?: string | null;
  organizationType: OrganizationType;
  status: OrganizationLifecycleStatus;
  parentOrganizationId?: string | null;
  contactReference?: string | null;
  createdAt: string;
  updatedAt: string;
  recordVersion: number;
}

export interface TenantMembershipRecord {
  membershipId: string;
  tenantId: string;
  organizationId?: string | null;
  userId: string;
  membershipStatus: MembershipLifecycleStatus;
  membershipRoleReferences: string[];
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
  invitedBy: string;
  recordVersion: number;
}

export interface TenantInvitationRecord {
  invitationId: string;
  tenantId: string;
  organizationId?: string | null;
  invitedEmail: string;
  invitedUserId?: string | null;
  invitedBy: string;
  roleReferences: string[];
  invitationStatus: InvitationLifecycleStatus;
  tokenHash: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  recordVersion: number;
}

export interface TenantProvisioningRecord {
  provisioningId: string;
  idempotencyKey: string;
  tenantCode: string;
  tenantId: string | null;
  primaryOrganizationId: string | null;
  ownerMembershipId: string | null;
  status: TenantProvisioningStatus;
  requestedBy: string;
  failureReason: string | null;
  compensationStepsCompleted: string[];
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  recordVersion: number;
}

export interface TenantClosurePreconditionInput {
  hasUnsettledFinancialObligations?: boolean;
  hasOpenDisputes?: boolean;
  hasActiveLegalHold?: boolean;
  hasMandatoryStatutoryRetention?: boolean;
}

/**
 * Phase 3 — Trusted Tenant Context & Isolation Models
 */
export interface ResolvedTenantContext {
  tenantId: string;
  organizationId?: string | null;
  actorId: string;
  membershipId: string;
  effectiveRoles: string[];
  effectivePermissions: string[];
  tenantStatus: TenantLifecycleStatus;
  organizationStatus: OrganizationLifecycleStatus | 'NOT_SCOPED';
  authorizationVersion: number;
  resolvedAt: string;
}

export type AuthorizationScopeKind =
  | 'PLATFORM_SCOPE'
  | 'TENANT_SCOPE'
  | 'ORGANIZATION_SCOPE'
  | 'USER_SCOPE'
  | 'CONTROLLED_CROSS_TENANT_SCOPE';

export interface TenantPolicyEvaluationRequest {
  actorId: string;
  actorPlatformRole: 'primary_admin' | 'admin' | 'verified_user' | 'anonymous';
  action: string;
  resourceType: string;
  resourceId: string;
  targetTenantId: string | null;
  targetOrganizationId?: string | null;
  resourceOwnerUserId?: string | null;
  resourceClassification: TenantOwnershipClassification;
  resolvedTenantContext?: ResolvedTenantContext | null;
  crossTenantGrant?: ControlledCrossTenantAccessGrant | null;
}

export interface TenantPolicyEvaluationResult {
  allowed: boolean;
  scopeUsed: AuthorizationScopeKind | null;
  denialCode: string | null;
  denialReason: string | null;
  auditRequired: boolean;
}

export interface ControlledCrossTenantAccessGrant {
  grantId: string;
  actorId: string;
  explicitPermission:
    | 'platform:cross_tenant:admin'
    | 'compliance:cross_tenant:investigation'
    | 'support:cross_tenant:approved_case'
    | 'partner:cross_tenant:shared_deal';
  definedPurpose: string;
  sourceTenantId: string | null;
  targetTenantId: string;
  allowedEntityTypes: string[];
  allowedOperations: Array<'READ' | 'VERIFY_COMPLIANCE' | 'SUPPORT_DIAGNOSTIC'>;
  approvalReference: string;
  expiresAt: string;
  createdAt: string;
}

export interface CrossModuleEntityIsolationSpec {
  entityType: string;
  authoritativeOwnerEmployee: EmployeeId;
  authoritativeModuleCode: string;
  ownershipClass: TenantOwnershipClassification;
  requiresTenantScopeOnWrite: boolean;
  requiresOrganizationScope: boolean;
  publicReadAllowedWhenPublished: boolean;
  readPermission: string;
  mutationPermission: string;
  crossTenantAccessRules: Array<ControlledCrossTenantAccessGrant['explicitPermission']>;
  retentionOwner: EmployeeId;
  migrationStatus: 'MIGRATED_TENANT_SAFE' | 'GLOBAL_REFERENCE' | 'LEGACY_CONTROLLED';
}

export interface LegacyRecordTenantClassification {
  recordId: string;
  entityType: string;
  resolvedTenantId: string | null;
  classificationState: 'VERIFIED_TENANT' | 'USER_INDIVIDUAL_SCOPE' | 'UNASSIGNED_LEGACY_QUARANTINE';
  accessRestriction: 'NORMAL_SCOPED' | 'OWNER_AND_ADMIN_ONLY' | 'RESTRICTED_ADMIN_RECONCILIATION_ONLY';
  classifiedAt: string;
}

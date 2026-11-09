/**
 * @file server/modules/enterprise-tenancy/isolationAndContextEngine.ts
 * @description Phase 3 — Employee 74: Tenant-Aware Authorization, Data Isolation,
 * Cross-Module Enforcement, Tenant-Scoped Repositories, Controlled Cross-Tenant Access,
 * Tenant-Safe Cache & Search Scope, Background Job Tenant Context, and Legacy Migration Rules.
 */

import { randomUUID } from 'node:crypto';
import { PlatformApplicationError } from '../platform-foundation';
import { getDefaultEnterpriseTenancyStore, type EnterpriseTenancyStore } from './tenancyEngine';
import type {
  ControlledCrossTenantAccessGrant,
  CrossModuleEntityIsolationSpec,
  LegacyRecordTenantClassification,
  ResolvedTenantContext,
  TenantPolicyEvaluationRequest,
  TenantPolicyEvaluationResult,
} from './types';

const ROLE_TO_PERMISSIONS: Record<string, string[]> = {
  tenant_owner: [
    'tenant.read',
    'tenant.manage',
    'organization.read',
    'organization.manage',
    'membership.read',
    'membership.manage',
    'listing.read',
    'listing.write',
    'transaction.read',
    'transaction.write',
    'document.read',
    'document.write',
    'analytics.read',
    'billing.read',
  ],
  tenant_admin: [
    'tenant.read',
    'tenant.manage',
    'organization.read',
    'organization.manage',
    'membership.read',
    'membership.manage',
    'listing.read',
    'listing.write',
    'transaction.read',
    'transaction.write',
    'document.read',
    'document.write',
    'analytics.read',
  ],
  organization_admin: [
    'tenant.read',
    'organization.read',
    'organization.manage',
    'membership.read',
    'membership.manage',
    'listing.read',
    'listing.write',
    'document.read',
    'document.write',
  ],
  broker_manager: [
    'tenant.read',
    'organization.read',
    'listing.read',
    'listing.write',
    'transaction.read',
    'transaction.write',
    'document.read',
  ],
  listing_agent: ['tenant.read', 'organization.read', 'listing.read', 'listing.write'],
  analyst_viewer: ['tenant.read', 'listing.read', 'analytics.read'],
  billing_contact: ['tenant.read', 'billing.read'],
  compliance_liaison: ['tenant.read', 'document.read', 'compliance.read'],
};

/**
 * 3.5 & 3.6 — Authoritative Cross-Module Entity Ownership & Tenant Isolation Classification
 * covering Employees 53–73 without replacing their domain ownership.
 */
export const CROSS_MODULE_ENTITY_ISOLATION_MATRIX: readonly CrossModuleEntityIsolationSpec[] = [
  {
    entityType: 'REAL_ESTATE_DEAL_CASE',
    authoritativeOwnerEmployee: 'EMP_53',
    authoritativeModuleCode: 'real-estate-transactions',
    ownershipClass: 'TENANT_OWNED',
    requiresTenantScopeOnWrite: true,
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: false,
    readPermission: 'transaction.read',
    mutationPermission: 'transaction.write',
    crossTenantAccessRules: ['platform:cross_tenant:admin', 'compliance:cross_tenant:investigation', 'partner:cross_tenant:shared_deal'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'MIGRATED_TENANT_SAFE',
  },
  {
    entityType: 'FINANCIAL_LEDGER_ENTRY',
    authoritativeOwnerEmployee: 'EMP_54',
    authoritativeModuleCode: 'financial-ledger',
    ownershipClass: 'TENANT_OWNED',
    requiresTenantScopeOnWrite: true,
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: false,
    readPermission: 'billing.read',
    mutationPermission: 'ledger.write',
    crossTenantAccessRules: ['platform:cross_tenant:admin', 'compliance:cross_tenant:investigation'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'MIGRATED_TENANT_SAFE',
  },
  {
    entityType: 'RENTAL_LEASE_AGREEMENT',
    authoritativeOwnerEmployee: 'EMP_55',
    authoritativeModuleCode: 'rental-tenancy',
    ownershipClass: 'TENANT_OWNED',
    requiresTenantScopeOnWrite: true,
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: false,
    readPermission: 'transaction.read',
    mutationPermission: 'transaction.write',
    crossTenantAccessRules: ['platform:cross_tenant:admin', 'compliance:cross_tenant:investigation'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'MIGRATED_TENANT_SAFE',
  },
  {
    entityType: 'FACILITY_ASSET_WORK_ORDER',
    authoritativeOwnerEmployee: 'EMP_56',
    authoritativeModuleCode: 'property-facilities-management',
    ownershipClass: 'ORGANIZATION_OWNED',
    requiresTenantScopeOnWrite: true,
    requiresOrganizationScope: true,
    publicReadAllowedWhenPublished: false,
    readPermission: 'organization.read',
    mutationPermission: 'organization.manage',
    crossTenantAccessRules: ['platform:cross_tenant:admin'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'MIGRATED_TENANT_SAFE',
  },
  {
    entityType: 'BROKERAGE_AGENCY_ROSTER',
    authoritativeOwnerEmployee: 'EMP_57',
    authoritativeModuleCode: 'brokerage-agent-operations',
    ownershipClass: 'ORGANIZATION_OWNED',
    requiresTenantScopeOnWrite: true,
    requiresOrganizationScope: true,
    publicReadAllowedWhenPublished: true,
    readPermission: 'organization.read',
    mutationPermission: 'organization.manage',
    crossTenantAccessRules: ['platform:cross_tenant:admin'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'MIGRATED_TENANT_SAFE',
  },
  {
    entityType: 'PROPERTY_LISTING',
    authoritativeOwnerEmployee: 'EMP_58',
    authoritativeModuleCode: 'listing-lifecycle',
    ownershipClass: 'TENANT_OWNED',
    requiresTenantScopeOnWrite: false, // Supports both individual user-owned public bargains and tenant-owned brokerage listings
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: true,
    readPermission: 'listing.read',
    mutationPermission: 'listing.write',
    crossTenantAccessRules: ['platform:cross_tenant:admin', 'support:cross_tenant:approved_case'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'MIGRATED_TENANT_SAFE',
  },
  {
    entityType: 'HEDONIC_VALUATION_RECORD',
    authoritativeOwnerEmployee: 'EMP_59',
    authoritativeModuleCode: 'property-valuation',
    ownershipClass: 'SHARED_REFERENCE',
    requiresTenantScopeOnWrite: false,
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: true,
    readPermission: 'listing.read',
    mutationPermission: 'listing.write',
    crossTenantAccessRules: ['platform:cross_tenant:admin'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'GLOBAL_REFERENCE',
  },
  {
    entityType: 'NEIGHBORHOOD_MARKET_PULSE',
    authoritativeOwnerEmployee: 'EMP_60',
    authoritativeModuleCode: 'market-intelligence',
    ownershipClass: 'SHARED_REFERENCE',
    requiresTenantScopeOnWrite: false,
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: true,
    readPermission: 'analytics.read',
    mutationPermission: 'platform.manage',
    crossTenantAccessRules: ['platform:cross_tenant:admin'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'GLOBAL_REFERENCE',
  },
  {
    entityType: 'GEOSPATIAL_BOUNDARY_LAYER',
    authoritativeOwnerEmployee: 'EMP_61',
    authoritativeModuleCode: 'geospatial-intelligence',
    ownershipClass: 'SHARED_REFERENCE',
    requiresTenantScopeOnWrite: false,
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: true,
    readPermission: 'listing.read',
    mutationPermission: 'platform.manage',
    crossTenantAccessRules: ['platform:cross_tenant:admin'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'GLOBAL_REFERENCE',
  },
  {
    entityType: 'MASTER_DATA_CANONICAL_DICTIONARY',
    authoritativeOwnerEmployee: 'EMP_62',
    authoritativeModuleCode: 'data-governance-mdm',
    ownershipClass: 'PLATFORM_GLOBAL',
    requiresTenantScopeOnWrite: false,
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: true,
    readPermission: 'tenant.read',
    mutationPermission: 'platform.manage',
    crossTenantAccessRules: ['platform:cross_tenant:admin'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'GLOBAL_REFERENCE',
  },
  {
    entityType: 'DOCUMENT_RECORD_OBJECT',
    authoritativeOwnerEmployee: 'EMP_63',
    authoritativeModuleCode: 'document-records',
    ownershipClass: 'TENANT_OWNED',
    requiresTenantScopeOnWrite: true,
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: false,
    readPermission: 'document.read',
    mutationPermission: 'document.write',
    crossTenantAccessRules: ['platform:cross_tenant:admin', 'compliance:cross_tenant:investigation'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'MIGRATED_TENANT_SAFE',
  },
  {
    entityType: 'USER_PRIVACY_PREFERENCE_PROFILE',
    authoritativeOwnerEmployee: 'EMP_64',
    authoritativeModuleCode: 'user-privacy-profiles',
    ownershipClass: 'USER_OWNED',
    requiresTenantScopeOnWrite: false,
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: false,
    readPermission: 'profile.read',
    mutationPermission: 'profile.write',
    crossTenantAccessRules: ['platform:cross_tenant:admin', 'compliance:cross_tenant:investigation'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'MIGRATED_TENANT_SAFE',
  },
  {
    entityType: 'CONTRIBUTOR_TRUST_REPUTATION',
    authoritativeOwnerEmployee: 'EMP_65',
    authoritativeModuleCode: 'trust-reputation',
    ownershipClass: 'USER_OWNED',
    requiresTenantScopeOnWrite: false,
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: true,
    readPermission: 'listing.read',
    mutationPermission: 'platform.manage',
    crossTenantAccessRules: ['platform:cross_tenant:admin'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'MIGRATED_TENANT_SAFE',
  },
  {
    entityType: 'CUSTOMER_SUPPORT_CASE',
    authoritativeOwnerEmployee: 'EMP_66',
    authoritativeModuleCode: 'customer-support-cases',
    ownershipClass: 'TENANT_OWNED',
    requiresTenantScopeOnWrite: true,
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: false,
    readPermission: 'tenant.read',
    mutationPermission: 'tenant.manage',
    crossTenantAccessRules: ['platform:cross_tenant:admin', 'support:cross_tenant:approved_case'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'MIGRATED_TENANT_SAFE',
  },
  {
    entityType: 'SPONSOR_BILLING_SUBSCRIPTION',
    authoritativeOwnerEmployee: 'EMP_67',
    authoritativeModuleCode: 'marketplace-billing-payments',
    ownershipClass: 'TENANT_OWNED',
    requiresTenantScopeOnWrite: true,
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: false,
    readPermission: 'billing.read',
    mutationPermission: 'billing.write',
    crossTenantAccessRules: ['platform:cross_tenant:admin', 'compliance:cross_tenant:investigation'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'MIGRATED_TENANT_SAFE',
  },
  {
    entityType: 'BUYER_ALERT_NOTIFICATION_RULE',
    authoritativeOwnerEmployee: 'EMP_68',
    authoritativeModuleCode: 'notification-orchestration',
    ownershipClass: 'USER_OWNED',
    requiresTenantScopeOnWrite: false,
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: false,
    readPermission: 'profile.read',
    mutationPermission: 'profile.write',
    crossTenantAccessRules: ['platform:cross_tenant:admin'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'MIGRATED_TENANT_SAFE',
  },
  {
    entityType: 'SEARCH_DISCOVERY_PROJECTION',
    authoritativeOwnerEmployee: 'EMP_69',
    authoritativeModuleCode: 'search-discovery',
    ownershipClass: 'TENANT_OWNED',
    requiresTenantScopeOnWrite: false,
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: true,
    readPermission: 'listing.read',
    mutationPermission: 'listing.write',
    crossTenantAccessRules: ['platform:cross_tenant:admin'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'MIGRATED_TENANT_SAFE',
  },
  {
    entityType: 'EXTERNAL_INGESTION_SOURCE_BATCH',
    authoritativeOwnerEmployee: 'EMP_70',
    authoritativeModuleCode: 'external-data-ingestion',
    ownershipClass: 'PLATFORM_GLOBAL',
    requiresTenantScopeOnWrite: false,
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: false,
    readPermission: 'analytics.read',
    mutationPermission: 'platform.manage',
    crossTenantAccessRules: ['platform:cross_tenant:admin'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'GLOBAL_REFERENCE',
  },
  {
    entityType: 'FRAUD_RISK_ASSESSMENT',
    authoritativeOwnerEmployee: 'EMP_71',
    authoritativeModuleCode: 'fraud-risk-intelligence',
    ownershipClass: 'PLATFORM_GLOBAL',
    requiresTenantScopeOnWrite: false,
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: false,
    readPermission: 'compliance.read',
    mutationPermission: 'platform.manage',
    crossTenantAccessRules: ['platform:cross_tenant:admin', 'compliance:cross_tenant:investigation'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'GLOBAL_REFERENCE',
  },
  {
    entityType: 'LEGAL_HOLD_AND_RETENTION_POLICY',
    authoritativeOwnerEmployee: 'EMP_72',
    authoritativeModuleCode: 'regulatory-compliance-retention',
    ownershipClass: 'PLATFORM_GLOBAL',
    requiresTenantScopeOnWrite: false,
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: false,
    readPermission: 'compliance.read',
    mutationPermission: 'platform.manage',
    crossTenantAccessRules: ['platform:cross_tenant:admin', 'compliance:cross_tenant:investigation'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'GLOBAL_REFERENCE',
  },
  {
    entityType: 'API_CONSUMER_CREDENTIAL_GRANT',
    authoritativeOwnerEmployee: 'EMP_73',
    authoritativeModuleCode: 'api-governance-gateway',
    ownershipClass: 'TENANT_OWNED',
    requiresTenantScopeOnWrite: true,
    requiresOrganizationScope: false,
    publicReadAllowedWhenPublished: false,
    readPermission: 'tenant.read',
    mutationPermission: 'tenant.manage',
    crossTenantAccessRules: ['platform:cross_tenant:admin'],
    retentionOwner: 'EMP_72',
    migrationStatus: 'MIGRATED_TENANT_SAFE',
  },
];

export function getEntityIsolationSpec(entityType: string): CrossModuleEntityIsolationSpec {
  const clean = (entityType ?? '').trim().toUpperCase();
  const found = CROSS_MODULE_ENTITY_ISOLATION_MATRIX.find((s) => s.entityType === clean);
  if (!found) {
    throw new PlatformApplicationError({
      code: 'ENTITY_ISOLATION_SPEC_NOT_FOUND',
      category: 'NOT_FOUND',
      httpStatus: 404,
      owningModule: 'enterprise-multi-tenancy',
      message: `No entity isolation specification registered for '${clean}'.`,
    });
  }
  return found;
}

/**
 * 3.2 — Trusted Server-Side Tenant Context Resolver
 * Resolves tenant context strictly from authenticated actor identity and active server-side memberships.
 * Never accepts arbitrary tenant IDs from client payloads as proof of membership.
 */
export function resolveTrustedTenantContext(
  store: EnterpriseTenancyStore,
  input: {
    authenticatedActorId: string;
    requestedTenantId: string;
    requestedOrganizationId?: string | null;
    requireActiveTenant?: boolean;
  },
): ResolvedTenantContext {
  const actorId = (input.authenticatedActorId ?? '').trim();
  const tenantId = (input.requestedTenantId ?? '').trim();
  if (!actorId) {
    throw new PlatformApplicationError({
      code: 'AUTHENTICATION_REQUIRED',
      category: 'AUTHENTICATION',
      httpStatus: 401,
      owningModule: 'enterprise-multi-tenancy',
      message: 'Authenticated actorId is required to resolve tenant context.',
    });
  }
  if (!tenantId) {
    throw new PlatformApplicationError({
      code: 'TENANT_CONTEXT_REQUIRED',
      category: 'VALIDATION',
      httpStatus: 400,
      owningModule: 'enterprise-multi-tenancy',
      message: 'requestedTenantId is required.',
    });
  }

  const tenant = store.getTenantById(tenantId);
  if (input.requireActiveTenant !== false && tenant.status === 'SUSPENDED') {
    throw new PlatformApplicationError({
      code: 'TENANT_SUSPENDED',
      category: 'AUTHORIZATION',
      httpStatus: 403,
      owningModule: 'enterprise-multi-tenancy',
      message: `Tenant '${tenantId}' is SUSPENDED.`,
    });
  }
  if (
    input.requireActiveTenant !== false &&
    (tenant.status === 'CLOSED' || tenant.status === 'ARCHIVED')
  ) {
    throw new PlatformApplicationError({
      code: 'TENANT_CLOSED',
      category: 'AUTHORIZATION',
      httpStatus: 403,
      owningModule: 'enterprise-multi-tenancy',
      message: `Tenant '${tenantId}' is '${tenant.status}' and cannot accept ordinary mutations.`,
    });
  }

  const activeMemberships = store.getActiveMembershipsForUser(tenantId, actorId);
  if (activeMemberships.length === 0) {
    throw new PlatformApplicationError({
      code: 'MEMBERSHIP_REQUIRED',
      category: 'TENANT_ISOLATION',
      httpStatus: 403,
      owningModule: 'enterprise-multi-tenancy',
      message: `Actor '${actorId}' has no active membership in tenant '${tenantId}'.`,
    });
  }

  const reqOrgId = input.requestedOrganizationId?.trim() || null;
  let matchedMembership = activeMemberships[0];
  let orgStatus: ResolvedTenantContext['organizationStatus'] = 'NOT_SCOPED';

  if (reqOrgId) {
    const org = store.getOrganization(tenantId, reqOrgId);
    orgStatus = org.status;
    if (org.status !== 'ACTIVE') {
      throw new PlatformApplicationError({
        code: 'ORGANIZATION_SUSPENDED',
        category: 'AUTHORIZATION',
        httpStatus: 403,
        owningModule: 'enterprise-multi-tenancy',
        message: `Organization '${reqOrgId}' is not ACTIVE.`,
      });
    }
    const orgScopedOrTenantAdmin = activeMemberships.find(
      (m) =>
        m.organizationId === reqOrgId ||
        m.membershipRoleReferences.includes('tenant_owner') ||
        m.membershipRoleReferences.includes('tenant_admin'),
    );
    if (!orgScopedOrTenantAdmin) {
      throw new PlatformApplicationError({
        code: 'ORGANIZATION_SCOPE_MISMATCH',
        category: 'TENANT_ISOLATION',
        httpStatus: 403,
        owningModule: 'enterprise-multi-tenancy',
        message: `Actor '${actorId}' is not authorized for organization '${reqOrgId}' in tenant '${tenantId}'.`,
      });
    }
    matchedMembership = orgScopedOrTenantAdmin;
  }

  const roleSet = new Set<string>();
  const permSet = new Set<string>();
  for (const mem of activeMemberships) {
    if (!reqOrgId || !mem.organizationId || mem.organizationId === reqOrgId) {
      for (const r of mem.membershipRoleReferences) {
        roleSet.add(r);
        for (const p of ROLE_TO_PERMISSIONS[r] ?? []) {
          permSet.add(p);
        }
      }
    }
  }

  return {
    tenantId,
    organizationId: reqOrgId,
    actorId,
    membershipId: matchedMembership.membershipId,
    effectiveRoles: Array.from(roleSet),
    effectivePermissions: Array.from(permSet),
    tenantStatus: tenant.status,
    organizationStatus: orgStatus,
    authorizationVersion: tenant.configurationVersion + matchedMembership.recordVersion,
    resolvedAt: new Date().toISOString(),
  };
}

/**
 * 3.3 & 3.7 — Multi-Scope RBAC Policy Evaluator & Controlled Cross-Tenant Access
 * Never implements a universal bypassTenantCheck flag.
 */
export function evaluateTenantAwareAuthorizationPolicy(
  req: TenantPolicyEvaluationRequest,
  store: EnterpriseTenancyStore = getDefaultEnterpriseTenancyStore(),
): TenantPolicyEvaluationResult {
  // 1. Shared reference data or platform-global public reads
  if (req.resourceClassification === 'SHARED_REFERENCE' && req.action.endsWith('.read')) {
    return {
      allowed: true,
      scopeUsed: 'PLATFORM_SCOPE',
      denialCode: null,
      denialReason: null,
      auditRequired: false,
    };
  }

  // 2. User-owned individual scope
  if (req.resourceClassification === 'USER_OWNED') {
    if (req.actorId && req.resourceOwnerUserId && req.actorId === req.resourceOwnerUserId) {
      return {
        allowed: true,
        scopeUsed: 'USER_SCOPE',
        denialCode: null,
        denialReason: null,
        auditRequired: false,
      };
    }
  }

  // 3. Controlled Cross-Tenant Access Grant (requires explicit permission, purpose, non-expired grant, and audit)
  if (
    req.crossTenantGrant &&
    req.targetTenantId &&
    req.crossTenantGrant.targetTenantId === req.targetTenantId
  ) {
    const grant = req.crossTenantGrant;
    if (
      grant.actorId === req.actorId &&
      grant.definedPurpose.trim().length >= 5 &&
      Date.now() <= Date.parse(grant.expiresAt) &&
      grant.allowedEntityTypes.includes(req.resourceType)
    ) {
      store.recordAudit({
        actorId: req.actorId,
        action: `cross_tenant.${req.action}`,
        resourceType: 'CROSS_TENANT_ACCESS',
        resourceId: req.resourceId,
        tenantId: req.targetTenantId,
        organizationId: req.targetOrganizationId ?? null,
        correlationId: `corr_${grant.grantId}`,
        result: 'SUCCESS',
        details: {
          grantId: grant.grantId,
          explicitPermission: grant.explicitPermission,
          definedPurpose: grant.definedPurpose,
          approvalReference: grant.approvalReference,
        },
      });
      return {
        allowed: true,
        scopeUsed: 'CONTROLLED_CROSS_TENANT_SCOPE',
        denialCode: null,
        denialReason: null,
        auditRequired: true,
      };
    }
  }

  // 4. Platform administrator scope (for platform-global administration)
  if (
    (req.actorPlatformRole === 'primary_admin' || req.actorPlatformRole === 'admin') &&
    req.resourceClassification === 'PLATFORM_GLOBAL'
  ) {
    return {
      allowed: true,
      scopeUsed: 'PLATFORM_SCOPE',
      denialCode: null,
      denialReason: null,
      auditRequired: true,
    };
  }

  // 5. Tenant & Organization Scope Evaluation
  const ctx = req.resolvedTenantContext;
  if (!ctx || !req.targetTenantId) {
    return {
      allowed: false,
      scopeUsed: null,
      denialCode: 'TENANT_ACCESS_DENIED',
      denialReason: 'Missing resolved tenant context for tenant-scoped resource.',
      auditRequired: true,
    };
  }

  if (ctx.tenantId !== req.targetTenantId) {
    return {
      allowed: false,
      scopeUsed: null,
      denialCode: 'CROSS_TENANT_ISOLATION_VIOLATION',
      denialReason: `Resolved tenant '${ctx.tenantId}' cannot access resource in tenant '${req.targetTenantId}'.`,
      auditRequired: true,
    };
  }

  if (ctx.tenantStatus !== 'ACTIVE') {
    return {
      allowed: false,
      scopeUsed: null,
      denialCode: 'TENANT_SUSPENDED',
      denialReason: `Tenant '${ctx.tenantId}' is '${ctx.tenantStatus}'.`,
      auditRequired: true,
    };
  }

  if (
    req.resourceClassification === 'ORGANIZATION_OWNED' &&
    req.targetOrganizationId &&
    ctx.organizationId &&
    ctx.organizationId !== req.targetOrganizationId &&
    !ctx.effectiveRoles.includes('tenant_owner') &&
    !ctx.effectiveRoles.includes('tenant_admin')
  ) {
    return {
      allowed: false,
      scopeUsed: null,
      denialCode: 'ORGANIZATION_SCOPE_MISMATCH',
      denialReason: `Actor organization '${ctx.organizationId}' does not match target organization '${req.targetOrganizationId}'.`,
      auditRequired: true,
    };
  }

  if (!ctx.effectivePermissions.includes(req.action)) {
    return {
      allowed: false,
      scopeUsed: null,
      denialCode: 'PERMISSION_DENIED',
      denialReason: `Actor lacks permission '${req.action}' in tenant '${ctx.tenantId}'.`,
      auditRequired: true,
    };
  }

  return {
    allowed: true,
    scopeUsed: req.targetOrganizationId ? 'ORGANIZATION_SCOPE' : 'TENANT_SCOPE',
    denialCode: null,
    denialReason: null,
    auditRequired: false,
  };
}

/**
 * 3.4 — Tenant-Aware Scoped Repository Helper
 * Enforces compound `(tenantId, recordId)` and `(tenantId, organizationId)` indexing at the repository boundary
 * rather than loading all records and filtering in application memory.
 */
export interface TenantScopedEntityBase {
  id: string;
  tenantId: string;
  organizationId?: string | null;
  recordVersion: number;
  createdAt: string;
  updatedAt: string;
}

export class TenantScopedRepository<T extends TenantScopedEntityBase> {
  private readonly entityType: string;
  private readonly partitionIndex = new Map<string, Map<string, T>>();

  constructor(entityType: string) {
    this.entityType = entityType.trim().toUpperCase();
  }

  private getTenantPartition(tenantId: string): Map<string, T> {
    let partition = this.partitionIndex.get(tenantId);
    if (!partition) {
      partition = new Map<string, T>();
      this.partitionIndex.set(tenantId, partition);
    }
    return partition;
  }

  public put(ctx: ResolvedTenantContext, record: T): T {
    if (ctx.tenantStatus !== 'ACTIVE') {
      throw new PlatformApplicationError({
        code: 'TENANT_SUSPENDED',
        category: 'AUTHORIZATION',
        httpStatus: 403,
        owningModule: 'enterprise-multi-tenancy',
        message: `Cannot write '${this.entityType}' while tenant '${ctx.tenantId}' is '${ctx.tenantStatus}'.`,
      });
    }
    if (record.tenantId !== ctx.tenantId) {
      throw new PlatformApplicationError({
        code: 'TENANT_ACCESS_DENIED',
        category: 'TENANT_ISOLATION',
        httpStatus: 403,
        owningModule: 'enterprise-multi-tenancy',
        message: `Cross-tenant write blocked for '${this.entityType}': context='${ctx.tenantId}', record='${record.tenantId}'.`,
      });
    }
    if (
      record.organizationId &&
      ctx.organizationId &&
      record.organizationId !== ctx.organizationId &&
      !ctx.effectiveRoles.includes('tenant_owner') &&
      !ctx.effectiveRoles.includes('tenant_admin')
    ) {
      throw new PlatformApplicationError({
        code: 'ORGANIZATION_SCOPE_MISMATCH',
        category: 'TENANT_ISOLATION',
        httpStatus: 403,
        owningModule: 'enterprise-multi-tenancy',
        message: `Cross-organization write blocked for '${this.entityType}'.`,
      });
    }

    const partition = this.getTenantPartition(ctx.tenantId);
    const existing = partition.get(record.id);
    if (existing && record.recordVersion !== existing.recordVersion + 1) {
      throw new PlatformApplicationError({
        code: 'VERSION_CONFLICT',
        category: 'CONFLICT',
        httpStatus: 409,
        owningModule: 'enterprise-multi-tenancy',
        message: `Optimistic concurrency conflict on '${this.entityType}' ('${record.id}').`,
      });
    }
    partition.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  public getById(ctx: ResolvedTenantContext, id: string): T {
    const partition = this.partitionIndex.get(ctx.tenantId);
    const item = partition?.get(id);
    if (!item) {
      throw new PlatformApplicationError({
        code: 'TENANT_RESOURCE_NOT_FOUND',
        category: 'NOT_FOUND',
        httpStatus: 404,
        owningModule: 'enterprise-multi-tenancy',
        message: `Resource '${id}' (${this.entityType}) not found in tenant scope '${ctx.tenantId}'.`,
      });
    }
    if (
      item.organizationId &&
      ctx.organizationId &&
      item.organizationId !== ctx.organizationId &&
      !ctx.effectiveRoles.includes('tenant_owner') &&
      !ctx.effectiveRoles.includes('tenant_admin')
    ) {
      throw new PlatformApplicationError({
        code: 'ORGANIZATION_SCOPE_MISMATCH',
        category: 'TENANT_ISOLATION',
        httpStatus: 403,
        owningModule: 'enterprise-multi-tenancy',
        message: `Resource '${id}' belongs to another organization scope.`,
      });
    }
    return structuredClone(item);
  }

  public listScoped(ctx: ResolvedTenantContext, limit = 25): T[] {
    const partition = this.partitionIndex.get(ctx.tenantId);
    if (!partition) return [];
    const results: T[] = [];
    for (const item of partition.values()) {
      if (
        item.organizationId &&
        ctx.organizationId &&
        item.organizationId !== ctx.organizationId &&
        !ctx.effectiveRoles.includes('tenant_owner') &&
        !ctx.effectiveRoles.includes('tenant_admin')
      ) {
        continue;
      }
      results.push(structuredClone(item));
      if (results.length >= Math.min(100, Math.max(1, limit))) break;
    }
    return results;
  }
}

/**
 * 3.8 — Tenant-Safe Cache & Search Scope Builder
 * Prevents cross-tenant cache collisions and search-result leakage.
 */
export function buildTenantSafeScopePrefix(input: {
  namespace: string;
  tenantContext?: ResolvedTenantContext | null;
  isPublicReference?: boolean;
}): string {
  const ns = input.namespace.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (input.isPublicReference) {
    return `pub:${ns}:global`;
  }
  if (!input.tenantContext || !input.tenantContext.tenantId) {
    throw new PlatformApplicationError({
      code: 'TENANT_SCOPE_REQUIRED_FOR_PRIVATE_CACHE_OR_SEARCH',
      category: 'TENANT_ISOLATION',
      httpStatus: 403,
      owningModule: 'enterprise-multi-tenancy',
      message: `Namespace '${ns}' requires a verified tenantContext.`,
    });
  }
  const orgSegment = input.tenantContext.organizationId ?? 'root';
  return `ten:${input.tenantContext.tenantId}:org:${orgSegment}:av${input.tenantContext.authorizationVersion}:${ns}`;
}

/**
 * 3.9 — Background Operation Tenant Context Preparation & Verification
 * Ensures background jobs never trust arbitrary tenantId strings in payloads without verifying tenant state and actor/service authority.
 */
export function verifyBackgroundOperationTenantScope(
  store: EnterpriseTenancyStore,
  input: {
    claimedTenantId: string;
    initiatingActorId?: string | null;
    authorizedSystemService?: boolean;
  },
): { verifiedTenantId: string; tenantStatus: string; verifiedAt: string } {
  const tenant = store.assertTenantOperationalForBusiness(input.claimedTenantId);
  if (!input.authorizedSystemService) {
    if (!input.initiatingActorId) {
      throw new PlatformApplicationError({
        code: 'BACKGROUND_TENANT_ACTOR_REQUIRED',
        category: 'AUTHORIZATION',
        httpStatus: 403,
        owningModule: 'enterprise-multi-tenancy',
        message: 'Background tenant job requires either initiatingActorId membership or authorizedSystemService.',
      });
    }
    const mems = store.getActiveMembershipsForUser(tenant.tenantId, input.initiatingActorId);
    if (mems.length === 0) {
      throw new PlatformApplicationError({
        code: 'BACKGROUND_TENANT_MEMBERSHIP_INVALID',
        category: 'TENANT_ISOLATION',
        httpStatus: 403,
        owningModule: 'enterprise-multi-tenancy',
        message: `Initiating actor '${input.initiatingActorId}' is no longer an active member of tenant '${tenant.tenantId}'.`,
      });
    }
  }
  return {
    verifiedTenantId: tenant.tenantId,
    tenantStatus: tenant.status,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * 3.10 — Safe Legacy Record Tenant Classification
 * Never assigns ambiguous records to a fabricated default tenant or deletes them.
 */
export function classifyLegacyEntityTenantScope(
  store: EnterpriseTenancyStore,
  record: {
    recordId: string;
    entityType: string;
    explicitTenantId?: string | null;
    ownerUserId?: string | null;
  },
): LegacyRecordTenantClassification {
  const nowIso = new Date().toISOString();
  if (record.explicitTenantId) {
    try {
      const tenant = store.getTenantById(record.explicitTenantId);
      return {
        recordId: record.recordId,
        entityType: record.entityType,
        resolvedTenantId: tenant.tenantId,
        classificationState: 'VERIFIED_TENANT',
        accessRestriction: 'NORMAL_SCOPED',
        classifiedAt: nowIso,
      };
    } catch {
      return {
        recordId: record.recordId,
        entityType: record.entityType,
        resolvedTenantId: null,
        classificationState: 'UNASSIGNED_LEGACY_QUARANTINE',
        accessRestriction: 'RESTRICTED_ADMIN_RECONCILIATION_ONLY',
        classifiedAt: nowIso,
      };
    }
  }

  if (record.ownerUserId && record.ownerUserId.trim().length > 0) {
    return {
      recordId: record.recordId,
      entityType: record.entityType,
      resolvedTenantId: null,
      classificationState: 'USER_INDIVIDUAL_SCOPE',
      accessRestriction: 'OWNER_AND_ADMIN_ONLY',
      classifiedAt: nowIso,
    };
  }

  return {
    recordId: record.recordId,
    entityType: record.entityType,
    resolvedTenantId: null,
    classificationState: 'UNASSIGNED_LEGACY_QUARANTINE',
    accessRestriction: 'RESTRICTED_ADMIN_RECONCILIATION_ONLY',
    classifiedAt: nowIso,
  };
}

export function createControlledCrossTenantGrant(input: {
  actorId: string;
  explicitPermission: ControlledCrossTenantAccessGrant['explicitPermission'];
  definedPurpose: string;
  sourceTenantId?: string | null;
  targetTenantId: string;
  allowedEntityTypes: string[];
  allowedOperations: ControlledCrossTenantAccessGrant['allowedOperations'];
  approvalReference: string;
  ttlMinutes?: number;
}): ControlledCrossTenantAccessGrant {
  if (!input.definedPurpose || input.definedPurpose.trim().length < 5) {
    throw new PlatformApplicationError({
      code: 'INVALID_CROSS_TENANT_PURPOSE',
      category: 'VALIDATION',
      httpStatus: 400,
      owningModule: 'enterprise-multi-tenancy',
      message: 'Controlled cross-tenant access requires a definedPurpose of at least 5 characters.',
    });
  }
  if (!input.approvalReference || !input.approvalReference.trim()) {
    throw new PlatformApplicationError({
      code: 'MISSING_CROSS_TENANT_APPROVAL',
      category: 'AUTHORIZATION',
      httpStatus: 403,
      owningModule: 'enterprise-multi-tenancy',
      message: 'Controlled cross-tenant access requires an explicit approvalReference.',
    });
  }
  const nowMs = Date.now();
  return {
    grantId: `xgrant_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    actorId: input.actorId.trim(),
    explicitPermission: input.explicitPermission,
    definedPurpose: input.definedPurpose.trim(),
    sourceTenantId: input.sourceTenantId ?? null,
    targetTenantId: input.targetTenantId.trim(),
    allowedEntityTypes: input.allowedEntityTypes,
    allowedOperations: input.allowedOperations,
    approvalReference: input.approvalReference.trim(),
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + (input.ttlMinutes ?? 30) * 60 * 1000).toISOString(),
  };
}

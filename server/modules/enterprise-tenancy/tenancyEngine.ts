/**
 * @file server/modules/enterprise-tenancy/tenancyEngine.ts
 * @description Phase 2 — Employee 74: Enterprise Multi-Tenancy Core, Tenant Identity,
 * Organizations, Memberships, Invitations, Versioned Configuration, Lifecycle & Provisioning.
 */

import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { decodePaginationCursor, encodePaginationCursor, normalizePaginationParams } from '../core';
import { PlatformApplicationError } from '../platform-foundation';
import type {
  InvitationLifecycleStatus,
  OrganizationRecord,
  OrganizationType,
  TenantClosurePreconditionInput,
  TenantConfiguration,
  TenantInvitationRecord,
  TenantLifecycleStatus,
  TenantMembershipRecord,
  TenantProvisioningRecord,
  TenantRecord,
  TenantType,
} from './types';

const ALLOWED_TENANT_TYPES = new Set<TenantType>([
  'INDIVIDUAL_BUSINESS',
  'BROKERAGE',
  'PROPERTY_MANAGEMENT',
  'DEVELOPER',
  'REAL_ESTATE_AGENCY',
  'ENTERPRISE',
  'INSTITUTION',
  'OTHER',
]);

const ALLOWED_ORG_TYPES = new Set<OrganizationType>([
  'HEADQUARTERS',
  'BRANCH_OFFICE',
  'FRANCHISE_UNIT',
  'SUBSIDIARY',
  'DEPARTMENT',
  'PARTNER_ENTITY',
]);

const PRIVILEGED_PLATFORM_MODULES = new Set<string>([
  'infrastructure-security-crypto',
  'platform-integration-resilience',
  'regulatory-compliance-retention',
]);

const ALLOWED_TENANT_ROLES = new Set<string>([
  'tenant_owner',
  'tenant_admin',
  'organization_admin',
  'broker_manager',
  'listing_agent',
  'analyst_viewer',
  'billing_contact',
  'compliance_liaison',
]);

export interface TenancyAuditEvent {
  auditId: string;
  actorId: string;
  action: string;
  resourceType: 'TENANT' | 'ORGANIZATION' | 'MEMBERSHIP' | 'INVITATION' | 'PROVISIONING' | 'CONFIGURATION' | 'CROSS_TENANT_ACCESS';
  resourceId: string;
  tenantId: string | null;
  organizationId: string | null;
  correlationId: string;
  result: 'SUCCESS' | 'DENIED' | 'FAILED';
  details: Record<string, unknown>;
  timestamp: string;
}

export function hashInvitationToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function verifyInvitationTokenHash(rawToken: string, storedHashHex: string): boolean {
  const candidateHex = hashInvitationToken(rawToken);
  if (candidateHex.length !== storedHashHex.length) return false;
  return timingSafeEqual(Buffer.from(candidateHex, 'hex'), Buffer.from(storedHashHex, 'hex'));
}

export class EnterpriseTenancyStore {
  private tenants = new Map<string, TenantRecord>();
  private configurations = new Map<string, TenantConfiguration>();
  private organizations = new Map<string, OrganizationRecord>();
  private memberships = new Map<string, TenantMembershipRecord>();
  private invitations = new Map<string, TenantInvitationRecord>();
  private provisionings = new Map<string, TenantProvisioningRecord>();
  private invitationAcceptLocks = new Set<string>();
  private auditTrail: TenancyAuditEvent[] = [];

  public recordAudit(event: Omit<TenancyAuditEvent, 'auditId' | 'timestamp'>): TenancyAuditEvent {
    const entry: TenancyAuditEvent = {
      ...event,
      auditId: `ten_aud_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      timestamp: new Date().toISOString(),
    };
    this.auditTrail.push(entry);
    if (this.auditTrail.length > 1000) {
      this.auditTrail.splice(0, this.auditTrail.length - 1000);
    }
    return entry;
  }

  public listAuditTrail(tenantId?: string): TenancyAuditEvent[] {
    const all = tenantId
      ? this.auditTrail.filter((a) => a.tenantId === tenantId)
      : this.auditTrail;
    return all.slice(-200).map((a) => structuredClone(a));
  }

  // ============================================================================
  // 2.2 & 2.4 — Tenant Creation, Configuration & Lifecycle State Machine
  // ============================================================================

  public findTenantByCode(tenantCode: string): TenantRecord | null {
    const clean = (tenantCode ?? '').trim().toLowerCase();
    for (const t of this.tenants.values()) {
      if (t.tenantCode.toLowerCase() === clean) return structuredClone(t);
    }
    return null;
  }

  public getTenantById(tenantId: string): TenantRecord {
    const t = this.tenants.get((tenantId ?? '').trim());
    if (!t) {
      throw new PlatformApplicationError({
        code: 'TENANT_NOT_FOUND',
        category: 'NOT_FOUND',
        httpStatus: 404,
        owningModule: 'enterprise-multi-tenancy',
        message: `Tenant '${tenantId}' was not found.`,
      });
    }
    return structuredClone(t);
  }

  public listTenants(params?: {
    limit?: number;
    cursor?: string;
    status?: TenantLifecycleStatus;
  }): { items: TenantRecord[]; nextCursor: string | null } {
    const page = normalizePaginationParams(
      { limit: params?.limit, cursor: params?.cursor },
      { defaultLimit: 25, maxLimit: 100 },
    );
    const decoded = page.cursor ? decodePaginationCursor(page.cursor) : null;
    const all = Array.from(this.tenants.values())
      .filter((t) => (!params?.status ? true : t.status === params.status))
      .sort((a, b) => a.tenantId.localeCompare(b.tenantId));
    const filtered = decoded ? all.filter((t) => t.tenantId > decoded.docId) : all;
    const slice = filtered.slice(0, page.limit).map((t) => structuredClone(t));
    const hasMore = filtered.length > page.limit;
    const last = slice[slice.length - 1];
    return {
      items: slice,
      nextCursor:
        hasMore && last
          ? encodePaginationCursor({ sortValue: last.tenantId, docId: last.tenantId, direction: 'asc' })
          : null,
    };
  }

  public createTenant(
    input: {
      tenantId?: string;
      tenantCode: string;
      displayName: string;
      legalName?: string | null;
      tenantType: TenantType;
      ownerUserId: string;
      defaultLocale?: string;
      defaultTimezone?: string;
      countryCode?: string;
    },
    actor: { actorId: string; isPlatformAdmin: boolean; correlationId: string },
  ): TenantRecord {
    if (!actor.isPlatformAdmin) {
      this.recordAudit({
        actorId: actor.actorId,
        action: 'tenant.create',
        resourceType: 'TENANT',
        resourceId: input.tenantCode || 'unknown',
        tenantId: null,
        organizationId: null,
        correlationId: actor.correlationId,
        result: 'DENIED',
        details: { reason: 'PLATFORM_ADMIN_REQUIRED' },
      });
      throw new PlatformApplicationError({
        code: 'TENANT_ACCESS_DENIED',
        category: 'AUTHORIZATION',
        httpStatus: 403,
        owningModule: 'enterprise-multi-tenancy',
        message: 'Only authorized platform administrators can create tenant records.',
      });
    }

    const tenantCode = (input.tenantCode ?? '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,48}$/.test(tenantCode)) {
      throw new PlatformApplicationError({
        code: 'INVALID_TENANT_CODE',
        category: 'VALIDATION',
        httpStatus: 400,
        owningModule: 'enterprise-multi-tenancy',
        message: 'tenantCode must be 3–49 lowercase alphanumeric or hyphen characters.',
      });
    }
    if (this.findTenantByCode(tenantCode)) {
      throw new PlatformApplicationError({
        code: 'DUPLICATE_TENANT_CODE',
        category: 'CONFLICT',
        httpStatus: 409,
        owningModule: 'enterprise-multi-tenancy',
        message: `Tenant code '${tenantCode}' is already registered.`,
      });
    }
    if (!ALLOWED_TENANT_TYPES.has(input.tenantType)) {
      throw new PlatformApplicationError({
        code: 'INVALID_TENANT_TYPE',
        category: 'VALIDATION',
        httpStatus: 400,
        owningModule: 'enterprise-multi-tenancy',
        message: `Unsupported tenantType '${input.tenantType}'.`,
      });
    }
    if (!input.displayName || input.displayName.trim().length < 2) {
      throw new PlatformApplicationError({
        code: 'INVALID_TENANT_DISPLAY_NAME',
        category: 'VALIDATION',
        httpStatus: 400,
        owningModule: 'enterprise-multi-tenancy',
        message: 'displayName must be at least 2 characters.',
      });
    }
    if (!input.ownerUserId || !input.ownerUserId.trim()) {
      throw new PlatformApplicationError({
        code: 'INVALID_TENANT_OWNER_USER',
        category: 'VALIDATION',
        httpStatus: 400,
        owningModule: 'enterprise-multi-tenancy',
        message: 'ownerUserId is required.',
      });
    }

    const nowIso = new Date().toISOString();
    const tenantId = input.tenantId?.trim() || `ten_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const record: TenantRecord = {
      tenantId,
      tenantCode,
      displayName: input.displayName.trim(),
      legalName: input.legalName?.trim() ?? null,
      tenantType: input.tenantType,
      status: 'PENDING',
      primaryOrganizationId: null,
      ownerUserId: input.ownerUserId.trim(),
      defaultLocale: (input.defaultLocale ?? 'fa-IR').trim(),
      defaultTimezone: (input.defaultTimezone ?? 'Asia/Tehran').trim(),
      countryCode: (input.countryCode ?? 'IR').trim().toUpperCase(),
      configurationVersion: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: actor.actorId,
      updatedBy: actor.actorId,
      recordVersion: 1,
    };

    const initialConfig: TenantConfiguration = {
      tenantId,
      configurationVersion: 1,
      displayPreferences: {
        rtlEnabled: true,
        areaUnitDefault: 'sqm',
        currencyDisplayDefault: 'IRT',
      },
      locale: record.defaultLocale,
      timezone: record.defaultTimezone,
      enabledBusinessModules: ['listing-lifecycle', 'property-valuation', 'market-intelligence', 'search-discovery'],
      featureAvailability: {
        customBranding: true,
        multiBranchOrganizations: true,
        analyticalReports: true,
      },
      allowedUserRoles: ['tenant_owner', 'tenant_admin', 'organization_admin', 'listing_agent', 'analyst_viewer'],
      organizationSettings: {
        allowSubOrganizations: true,
        maxHierarchyDepth: 4,
        requireInvitationApproval: false,
      },
      notificationPreferenceReference: null,
      approvedBrandingMetadata: {
        brandDisplayName: record.displayName,
        logoObjectReference: null,
        primaryAccentHex: '#059669',
      },
      operationalRestrictions: {
        maxConcurrentListings: 500,
        maxActiveMembers: 100,
        apiRateLimitPerMinute: 240,
        exportsAllowed: true,
      },
      updatedAt: nowIso,
      updatedBy: actor.actorId,
    };

    this.tenants.set(tenantId, record);
    this.configurations.set(tenantId, initialConfig);

    // Automatically create owner membership in ACTIVE state
    const ownerMemId = `mem_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    this.memberships.set(ownerMemId, {
      membershipId: ownerMemId,
      tenantId,
      organizationId: null,
      userId: record.ownerUserId,
      membershipStatus: 'ACTIVE',
      membershipRoleReferences: ['tenant_owner', 'tenant_admin'],
      joinedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      invitedBy: actor.actorId,
      recordVersion: 1,
    });

    this.recordAudit({
      actorId: actor.actorId,
      action: 'tenant.create',
      resourceType: 'TENANT',
      resourceId: tenantId,
      tenantId,
      organizationId: null,
      correlationId: actor.correlationId,
      result: 'SUCCESS',
      details: { tenantCode, tenantType: record.tenantType, status: record.status },
    });

    return structuredClone(record);
  }

  public getTenantConfiguration(tenantId: string): TenantConfiguration {
    this.getTenantById(tenantId);
    const cfg = this.configurations.get(tenantId);
    if (!cfg) {
      throw new PlatformApplicationError({
        code: 'TENANT_CONFIGURATION_NOT_FOUND',
        category: 'NOT_FOUND',
        httpStatus: 404,
        owningModule: 'enterprise-multi-tenancy',
        message: `Configuration for tenant '${tenantId}' not found.`,
      });
    }
    return structuredClone(cfg);
  }

  public updateTenantConfiguration(
    tenantId: string,
    patch: {
      expectedRecordVersion?: number;
      locale?: string;
      timezone?: string;
      enabledBusinessModules?: string[];
      allowedUserRoles?: string[];
      operationalRestrictions?: Partial<TenantConfiguration['operationalRestrictions']>;
    },
    actor: { actorId: string; isPlatformAdmin: boolean; correlationId: string },
  ): { tenant: TenantRecord; configuration: TenantConfiguration } {
    const tenant = this.getTenantById(tenantId);
    this.assertCanManageTenant(tenant, actor.actorId, actor.isPlatformAdmin);

    if (
      patch.expectedRecordVersion !== undefined &&
      patch.expectedRecordVersion !== tenant.recordVersion
    ) {
      throw new PlatformApplicationError({
        code: 'VERSION_CONFLICT',
        category: 'CONFLICT',
        httpStatus: 409,
        owningModule: 'enterprise-multi-tenancy',
        message: `Tenant recordVersion conflict: expected ${patch.expectedRecordVersion}, actual ${tenant.recordVersion}.`,
      });
    }

    if (patch.enabledBusinessModules) {
      for (const modCode of patch.enabledBusinessModules) {
        if (PRIVILEGED_PLATFORM_MODULES.has(modCode) && !actor.isPlatformAdmin) {
          throw new PlatformApplicationError({
            code: 'PRIVILEGED_CAPABILITY_ESCALATION_DENIED',
            category: 'AUTHORIZATION',
            httpStatus: 403,
            owningModule: 'enterprise-multi-tenancy',
            message: `Tenant administrator cannot enable privileged platform capability '${modCode}'.`,
          });
        }
      }
    }

    if (patch.allowedUserRoles) {
      for (const role of patch.allowedUserRoles) {
        if (!ALLOWED_TENANT_ROLES.has(role)) {
          throw new PlatformApplicationError({
            code: 'INVALID_TENANT_ROLE_CONFIGURATION',
            category: 'VALIDATION',
            httpStatus: 400,
            owningModule: 'enterprise-multi-tenancy',
            message: `Role '${role}' is not an allowed tenant-scoped role.`,
          });
        }
      }
    }

    const existingCfg = this.getTenantConfiguration(tenantId);
    const nowIso = new Date().toISOString();
    const nextCfgVersion = existingCfg.configurationVersion + 1;

    const updatedCfg: TenantConfiguration = {
      ...existingCfg,
      configurationVersion: nextCfgVersion,
      locale: patch.locale?.trim() || existingCfg.locale,
      timezone: patch.timezone?.trim() || existingCfg.timezone,
      enabledBusinessModules: patch.enabledBusinessModules ?? existingCfg.enabledBusinessModules,
      allowedUserRoles: patch.allowedUserRoles ?? existingCfg.allowedUserRoles,
      operationalRestrictions: {
        ...existingCfg.operationalRestrictions,
        ...(patch.operationalRestrictions ?? {}),
      },
      updatedAt: nowIso,
      updatedBy: actor.actorId,
    };

    const updatedTenant: TenantRecord = {
      ...tenant,
      defaultLocale: updatedCfg.locale,
      defaultTimezone: updatedCfg.timezone,
      configurationVersion: nextCfgVersion,
      updatedAt: nowIso,
      updatedBy: actor.actorId,
      recordVersion: tenant.recordVersion + 1,
    };

    this.configurations.set(tenantId, updatedCfg);
    this.tenants.set(tenantId, updatedTenant);

    this.recordAudit({
      actorId: actor.actorId,
      action: 'tenant.configuration.update',
      resourceType: 'CONFIGURATION',
      resourceId: tenantId,
      tenantId,
      organizationId: null,
      correlationId: actor.correlationId,
      result: 'SUCCESS',
      details: { configurationVersion: nextCfgVersion },
    });

    return {
      tenant: structuredClone(updatedTenant),
      configuration: structuredClone(updatedCfg),
    };
  }

  public updateTenantDetails(
    tenantId: string,
    patch: {
      expectedRecordVersion?: number;
      displayName?: string;
      legalName?: string | null;
      defaultLocale?: string;
      defaultTimezone?: string;
    },
    actor: { actorId: string; isPlatformAdmin: boolean; correlationId: string },
  ): TenantRecord {
    const tenant = this.getTenantById(tenantId);
    this.assertCanManageTenant(tenant, actor.actorId, actor.isPlatformAdmin);

    if (
      patch.expectedRecordVersion === undefined ||
      patch.expectedRecordVersion !== tenant.recordVersion
    ) {
      throw new PlatformApplicationError({
        code: 'VERSION_CONFLICT',
        category: 'CONFLICT',
        httpStatus: 409,
        owningModule: 'enterprise-multi-tenancy',
        message: `Expected recordVersion ${patch.expectedRecordVersion ?? 'missing'} does not match current version ${tenant.recordVersion}.`,
      });
    }

    const nowIso = new Date().toISOString();
    const updated: TenantRecord = {
      ...tenant,
      displayName: patch.displayName ? patch.displayName.trim() : tenant.displayName,
      legalName: patch.legalName !== undefined ? patch.legalName : tenant.legalName,
      defaultLocale: patch.defaultLocale ? patch.defaultLocale.trim() : tenant.defaultLocale,
      defaultTimezone: patch.defaultTimezone ? patch.defaultTimezone.trim() : tenant.defaultTimezone,
      updatedAt: nowIso,
      updatedBy: actor.actorId,
      recordVersion: tenant.recordVersion + 1,
    };

    this.tenants.set(tenantId, updated);
    this.recordAudit({
      actorId: actor.actorId,
      action: 'tenant.update',
      resourceType: 'TENANT',
      resourceId: tenantId,
      tenantId,
      organizationId: null,
      correlationId: actor.correlationId,
      result: 'SUCCESS',
      details: { recordVersion: updated.recordVersion },
    });
    return structuredClone(updated);
  }

  public transitionTenantLifecycle(
    tenantId: string,
    operation: 'VALIDATE' | 'ACTIVATE' | 'SUSPEND' | 'REACTIVATE' | 'BEGIN_CLOSURE' | 'COMPLETE_CLOSURE' | 'ARCHIVE',
    actor: { actorId: string; isPlatformAdmin: boolean; correlationId: string },
    preconditions: TenantClosurePreconditionInput = {},
  ): TenantRecord {
    const tenant = this.getTenantById(tenantId);
    if (!actor.isPlatformAdmin && tenant.ownerUserId !== actor.actorId) {
      throw new PlatformApplicationError({
        code: 'TENANT_ACCESS_DENIED',
        category: 'AUTHORIZATION',
        httpStatus: 403,
        owningModule: 'enterprise-multi-tenancy',
        message: `Actor '${actor.actorId}' is not authorized to transition lifecycle of tenant '${tenantId}'.`,
      });
    }

    // Privileged transitions (ACTIVATE, SUSPEND, REACTIVATE, COMPLETE_CLOSURE, ARCHIVE) require platform admin
    if (
      (operation === 'ACTIVATE' ||
        operation === 'SUSPEND' ||
        operation === 'REACTIVATE' ||
        operation === 'COMPLETE_CLOSURE' ||
        operation === 'ARCHIVE') &&
      !actor.isPlatformAdmin
    ) {
      throw new PlatformApplicationError({
        code: 'TENANT_ACCESS_DENIED',
        category: 'AUTHORIZATION',
        httpStatus: 403,
        owningModule: 'enterprise-multi-tenancy',
        message: `Lifecycle operation '${operation}' requires platform administrator authority.`,
      });
    }

    let nextStatus: TenantLifecycleStatus = tenant.status;
    switch (operation) {
      case 'VALIDATE':
        if (tenant.status !== 'PENDING') {
          throw new PlatformApplicationError({
            code: 'INVALID_TENANT_STATE_TRANSITION',
            category: 'BUSINESS_RULE',
            httpStatus: 422,
            owningModule: 'enterprise-multi-tenancy',
            message: `Cannot validate tenant in status '${tenant.status}'.`,
          });
        }
        nextStatus = 'PENDING';
        break;
      case 'ACTIVATE':
        if (tenant.status !== 'PENDING') {
          throw new PlatformApplicationError({
            code: 'INVALID_TENANT_STATE_TRANSITION',
            category: 'BUSINESS_RULE',
            httpStatus: 422,
            owningModule: 'enterprise-multi-tenancy',
            message: `Only PENDING tenants can be activated (current: '${tenant.status}').`,
          });
        }
        nextStatus = 'ACTIVE';
        break;
      case 'SUSPEND':
        if (tenant.status !== 'ACTIVE') {
          throw new PlatformApplicationError({
            code: 'INVALID_TENANT_STATE_TRANSITION',
            category: 'BUSINESS_RULE',
            httpStatus: 422,
            owningModule: 'enterprise-multi-tenancy',
            message: `Only ACTIVE tenants can be suspended (current: '${tenant.status}').`,
          });
        }
        nextStatus = 'SUSPENDED';
        break;
      case 'REACTIVATE':
        if (tenant.status !== 'SUSPENDED') {
          throw new PlatformApplicationError({
            code: 'INVALID_TENANT_STATE_TRANSITION',
            category: 'BUSINESS_RULE',
            httpStatus: 422,
            owningModule: 'enterprise-multi-tenancy',
            message: `Only SUSPENDED tenants can be reactivated (current: '${tenant.status}').`,
          });
        }
        nextStatus = 'ACTIVE';
        break;
      case 'BEGIN_CLOSURE':
      case 'COMPLETE_CLOSURE': {
        // Coordinate with Employee 54 (financial obligations) and Employee 72 (legal holds & statutory retention)
        if (preconditions.hasActiveLegalHold) {
          throw new PlatformApplicationError({
            code: 'LEGAL_HOLD_ACTIVE',
            category: 'COMPLIANCE',
            httpStatus: 423,
            owningModule: 'regulatory-compliance-retention',
            message: `Tenant '${tenantId}' cannot be closed while an active Employee 72 legal hold is in effect.`,
          });
        }
        if (preconditions.hasUnsettledFinancialObligations || preconditions.hasOpenDisputes) {
          throw new PlatformApplicationError({
            code: 'TENANT_CLOSURE_OBLIGATIONS_ACTIVE',
            category: 'BUSINESS_RULE',
            httpStatus: 409,
            owningModule: 'enterprise-multi-tenancy',
            message: `Tenant '${tenantId}' has unsettled financial ledger obligations or open disputes and cannot close.`,
          });
        }
        if (operation === 'BEGIN_CLOSURE') {
          if (tenant.status !== 'ACTIVE' && tenant.status !== 'SUSPENDED') {
            throw new PlatformApplicationError({
              code: 'INVALID_TENANT_STATE_TRANSITION',
              category: 'BUSINESS_RULE',
              httpStatus: 422,
              owningModule: 'enterprise-multi-tenancy',
              message: `Tenant in status '${tenant.status}' cannot begin closure.`,
            });
          }
          nextStatus = 'CLOSING';
        } else {
          if (tenant.status !== 'CLOSING' && tenant.status !== 'ACTIVE' && tenant.status !== 'SUSPENDED') {
            throw new PlatformApplicationError({
              code: 'INVALID_TENANT_STATE_TRANSITION',
              category: 'BUSINESS_RULE',
              httpStatus: 422,
              owningModule: 'enterprise-multi-tenancy',
              message: `Tenant in status '${tenant.status}' cannot complete closure.`,
            });
          }
          nextStatus = 'CLOSED';
        }
        break;
      }
      case 'ARCHIVE':
        if (tenant.status !== 'CLOSED') {
          throw new PlatformApplicationError({
            code: 'INVALID_TENANT_STATE_TRANSITION',
            category: 'BUSINESS_RULE',
            httpStatus: 422,
            owningModule: 'enterprise-multi-tenancy',
            message: `Only CLOSED tenants can transition to ARCHIVED (current: '${tenant.status}').`,
          });
        }
        nextStatus = 'ARCHIVED';
        break;
    }

    const updated: TenantRecord = {
      ...tenant,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.actorId,
      recordVersion: tenant.recordVersion + 1,
    };

    this.tenants.set(tenantId, updated);
    this.recordAudit({
      actorId: actor.actorId,
      action: `tenant.lifecycle.${operation.toLowerCase()}`,
      resourceType: 'TENANT',
      resourceId: tenantId,
      tenantId,
      organizationId: null,
      correlationId: actor.correlationId,
      result: 'SUCCESS',
      details: { previousStatus: tenant.status, newStatus: nextStatus },
    });

    return structuredClone(updated);
  }

  /**
   * 2.4 — Enforces that a suspended/closed tenant cannot execute ordinary restricted business operations.
   */
  public assertTenantOperationalForBusiness(tenantId: string): TenantRecord {
    const tenant = this.getTenantById(tenantId);
    if (tenant.status === 'SUSPENDED') {
      throw new PlatformApplicationError({
        code: 'TENANT_SUSPENDED',
        category: 'AUTHORIZATION',
        httpStatus: 403,
        owningModule: 'enterprise-multi-tenancy',
        message: `Tenant '${tenantId}' is currently SUSPENDED; restricted business operations are blocked.`,
      });
    }
    if (tenant.status !== 'ACTIVE') {
      throw new PlatformApplicationError({
        code: 'TENANT_NOT_ACTIVE',
        category: 'BUSINESS_RULE',
        httpStatus: 422,
        owningModule: 'enterprise-multi-tenancy',
        message: `Tenant '${tenantId}' is in status '${tenant.status}' and cannot execute active business operations.`,
      });
    }
    return tenant;
  }

  // ============================================================================
  // 2.5 — Idempotent & Recoverable Tenant Provisioning Orchestration Service
  // ============================================================================

  public provisionTenant(
    input: {
      idempotencyKey: string;
      tenantCode: string;
      displayName: string;
      tenantType: TenantType;
      ownerUserId: string;
      primaryOrganizationCode: string;
      primaryOrganizationDisplayName: string;
      simulateFailureAtStep?: 'ORGANIZATION_CREATION' | null;
    },
    actor: { actorId: string; isPlatformAdmin: boolean; correlationId: string },
  ): TenantProvisioningRecord {
    const idemKey = (input.idempotencyKey ?? '').trim();
    if (!idemKey) {
      throw new PlatformApplicationError({
        code: 'MISSING_PROVISIONING_IDEMPOTENCY_KEY',
        category: 'VALIDATION',
        httpStatus: 400,
        owningModule: 'enterprise-multi-tenancy',
        message: 'Provisioning requires a non-empty idempotencyKey.',
      });
    }

    // Repeat-safe idempotency check: if already READY, return existing record; if FAILED/COMPENSATED, allow retry recovery
    const existing = this.provisionings.get(idemKey);
    if (existing && existing.status === 'READY') {
      return structuredClone(existing);
    }

    const nowIso = new Date().toISOString();
    const provRecord: TenantProvisioningRecord = existing
      ? {
          ...existing,
          status: 'VALIDATING',
          failureReason: null,
          attemptCount: existing.attemptCount + 1,
          updatedAt: nowIso,
          recordVersion: existing.recordVersion + 1,
        }
      : {
          provisioningId: `prov_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
          idempotencyKey: idemKey,
          tenantCode: input.tenantCode.trim().toLowerCase(),
          tenantId: null,
          primaryOrganizationId: null,
          ownerMembershipId: null,
          status: 'REQUESTED',
          requestedBy: actor.actorId,
          failureReason: null,
          compensationStepsCompleted: [],
          attemptCount: 1,
          createdAt: nowIso,
          updatedAt: nowIso,
          recordVersion: 1,
        };

    provRecord.status = 'PROVISIONING';
    this.provisionings.set(idemKey, provRecord);

    try {
      let tenant = this.findTenantByCode(input.tenantCode);
      if (!tenant) {
        tenant = this.createTenant(
          {
            tenantCode: input.tenantCode,
            displayName: input.displayName,
            tenantType: input.tenantType,
            ownerUserId: input.ownerUserId,
          },
          actor,
        );
      }
      provRecord.tenantId = tenant.tenantId;

      if (input.simulateFailureAtStep === 'ORGANIZATION_CREATION') {
        throw new Error('SIMULATED_PROVISIONING_FAILURE_AT_ORGANIZATION_STEP');
      }

      let primaryOrg = this.listOrganizations(tenant.tenantId).items.find(
        (o) => o.organizationCode.toLowerCase() === input.primaryOrganizationCode.trim().toLowerCase(),
      );
      if (!primaryOrg) {
        primaryOrg = this.createOrganization(
          tenant.tenantId,
          {
            organizationCode: input.primaryOrganizationCode,
            displayName: input.primaryOrganizationDisplayName,
            organizationType: 'HEADQUARTERS',
          },
          actor,
        );
      }
      provRecord.primaryOrganizationId = primaryOrg.organizationId;

      if (tenant.status === 'PENDING') {
        tenant = this.transitionTenantLifecycle(tenant.tenantId, 'ACTIVATE', actor);
      }
      const rawTenant = this.tenants.get(tenant.tenantId);
      if (rawTenant) {
        rawTenant.primaryOrganizationId = primaryOrg.organizationId;
        this.tenants.set(tenant.tenantId, rawTenant);
      }

      const ownerMembership = this.listMemberships(tenant.tenantId).items.find(
        (m) => m.userId === input.ownerUserId && m.membershipStatus === 'ACTIVE',
      );
      provRecord.ownerMembershipId = ownerMembership?.membershipId ?? null;
      provRecord.status = 'READY';
      provRecord.updatedAt = new Date().toISOString();
      provRecord.recordVersion += 1;
      this.provisionings.set(idemKey, provRecord);

      this.recordAudit({
        actorId: actor.actorId,
        action: 'tenant.provisioning.ready',
        resourceType: 'PROVISIONING',
        resourceId: provRecord.provisioningId,
        tenantId: tenant.tenantId,
        organizationId: primaryOrg.organizationId,
        correlationId: actor.correlationId,
        result: 'SUCCESS',
        details: { attemptCount: provRecord.attemptCount },
      });

      return structuredClone(provRecord);
    } catch (err) {
      provRecord.status = 'COMPENSATING';
      provRecord.failureReason = err instanceof Error ? err.message : 'Provisioning failed';
      if (provRecord.tenantId) {
        const createdTenant = this.tenants.get(provRecord.tenantId);
        if (createdTenant && createdTenant.status === 'PENDING') {
          provRecord.compensationStepsCompleted.push(`preserved_pending_tenant:${createdTenant.tenantId}`);
        }
      }
      provRecord.status = 'FAILED';
      provRecord.updatedAt = new Date().toISOString();
      provRecord.recordVersion += 1;
      this.provisionings.set(idemKey, provRecord);

      this.recordAudit({
        actorId: actor.actorId,
        action: 'tenant.provisioning.failed',
        resourceType: 'PROVISIONING',
        resourceId: provRecord.provisioningId,
        tenantId: provRecord.tenantId,
        organizationId: provRecord.primaryOrganizationId,
        correlationId: actor.correlationId,
        result: 'FAILED',
        details: { failureReason: provRecord.failureReason, attemptCount: provRecord.attemptCount },
      });

      return structuredClone(provRecord);
    }
  }

  // ============================================================================
  // 2.6 — Organization Management & Hierarchy Cycle Prevention
  // ============================================================================

  public getOrganization(tenantId: string, organizationId: string): OrganizationRecord {
    this.getTenantById(tenantId);
    const org = this.organizations.get((organizationId ?? '').trim());
    if (!org || org.tenantId !== tenantId) {
      throw new PlatformApplicationError({
        code: 'ORGANIZATION_SCOPE_MISMATCH',
        category: 'TENANT_ISOLATION',
        httpStatus: 404,
        owningModule: 'enterprise-multi-tenancy',
        message: `Organization '${organizationId}' does not exist in tenant '${tenantId}'.`,
      });
    }
    return structuredClone(org);
  }

  public listOrganizations(
    tenantId: string,
    params?: { limit?: number; cursor?: string },
  ): { items: OrganizationRecord[]; nextCursor: string | null } {
    this.getTenantById(tenantId);
    const page = normalizePaginationParams(
      { limit: params?.limit, cursor: params?.cursor },
      { defaultLimit: 25, maxLimit: 100 },
    );
    const decoded = page.cursor ? decodePaginationCursor(page.cursor) : null;
    const all = Array.from(this.organizations.values())
      .filter((o) => o.tenantId === tenantId)
      .sort((a, b) => a.organizationId.localeCompare(b.organizationId));
    const filtered = decoded ? all.filter((o) => o.organizationId > decoded.docId) : all;
    const slice = filtered.slice(0, page.limit).map((o) => structuredClone(o));
    const hasMore = filtered.length > page.limit;
    const last = slice[slice.length - 1];
    return {
      items: slice,
      nextCursor:
        hasMore && last
          ? encodePaginationCursor({
              sortValue: last.organizationId,
              docId: last.organizationId,
              direction: 'asc',
            })
          : null,
    };
  }

  public createOrganization(
    tenantId: string,
    input: {
      organizationId?: string;
      organizationCode: string;
      displayName: string;
      legalName?: string | null;
      organizationType: OrganizationType;
      parentOrganizationId?: string | null;
      contactReference?: string | null;
    },
    actor: { actorId: string; isPlatformAdmin: boolean; correlationId: string },
  ): OrganizationRecord {
    const tenant = this.getTenantById(tenantId);
    this.assertCanManageTenant(tenant, actor.actorId, actor.isPlatformAdmin);

    const orgCode = (input.organizationCode ?? '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{1,48}$/.test(orgCode)) {
      throw new PlatformApplicationError({
        code: 'INVALID_ORGANIZATION_CODE',
        category: 'VALIDATION',
        httpStatus: 400,
        owningModule: 'enterprise-multi-tenancy',
        message: 'organizationCode must be 2–49 lowercase alphanumeric, underscore or hyphen characters.',
      });
    }
    if (!ALLOWED_ORG_TYPES.has(input.organizationType)) {
      throw new PlatformApplicationError({
        code: 'INVALID_ORGANIZATION_TYPE',
        category: 'VALIDATION',
        httpStatus: 400,
        owningModule: 'enterprise-multi-tenancy',
        message: `Unsupported organizationType '${input.organizationType}'.`,
      });
    }

    for (const existing of this.organizations.values()) {
      if (existing.tenantId === tenantId && existing.organizationCode.toLowerCase() === orgCode) {
        throw new PlatformApplicationError({
          code: 'DUPLICATE_ORGANIZATION_CODE',
          category: 'CONFLICT',
          httpStatus: 409,
          owningModule: 'enterprise-multi-tenancy',
          message: `Organization code '${orgCode}' already exists in tenant '${tenantId}'.`,
        });
      }
    }

    const parentId = input.parentOrganizationId?.trim() || null;
    if (parentId) {
      const parentOrg = this.organizations.get(parentId);
      if (!parentOrg || parentOrg.tenantId !== tenantId) {
        throw new PlatformApplicationError({
          code: 'ORGANIZATION_SCOPE_MISMATCH',
          category: 'TENANT_ISOLATION',
          httpStatus: 403,
          owningModule: 'enterprise-multi-tenancy',
          message: `Parent organization '${parentId}' does not belong to tenant '${tenantId}'.`,
        });
      }
    }

    const nowIso = new Date().toISOString();
    const organizationId =
      input.organizationId?.trim() || `org_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    if (parentId === organizationId) {
      throw new PlatformApplicationError({
        code: 'INVALID_ORGANIZATION_HIERARCHY_CYCLE',
        category: 'VALIDATION',
        httpStatus: 400,
        owningModule: 'enterprise-multi-tenancy',
        message: 'An organization cannot be its own parent.',
      });
    }

    const record: OrganizationRecord = {
      organizationId,
      tenantId,
      organizationCode: orgCode,
      displayName: input.displayName.trim(),
      legalName: input.legalName?.trim() ?? null,
      organizationType: input.organizationType,
      status: 'ACTIVE',
      parentOrganizationId: parentId,
      contactReference: input.contactReference?.trim() ?? null,
      createdAt: nowIso,
      updatedAt: nowIso,
      recordVersion: 1,
    };

    this.organizations.set(organizationId, record);
    this.recordAudit({
      actorId: actor.actorId,
      action: 'organization.create',
      resourceType: 'ORGANIZATION',
      resourceId: organizationId,
      tenantId,
      organizationId,
      correlationId: actor.correlationId,
      result: 'SUCCESS',
      details: { organizationCode: orgCode, parentOrganizationId: parentId },
    });

    return structuredClone(record);
  }

  public updateOrganization(
    tenantId: string,
    organizationId: string,
    patch: {
      expectedRecordVersion?: number;
      displayName?: string;
      legalName?: string | null;
      parentOrganizationId?: string | null;
      status?: 'ACTIVE' | 'SUSPENDED';
    },
    actor: { actorId: string; isPlatformAdmin: boolean; correlationId: string },
  ): OrganizationRecord {
    const tenant = this.getTenantById(tenantId);
    const existing = this.getOrganization(tenantId, organizationId);
    this.assertCanManageOrganization(tenant, organizationId, actor.actorId, actor.isPlatformAdmin);

    if (
      patch.expectedRecordVersion === undefined ||
      patch.expectedRecordVersion !== existing.recordVersion
    ) {
      throw new PlatformApplicationError({
        code: 'VERSION_CONFLICT',
        category: 'CONFLICT',
        httpStatus: 409,
        owningModule: 'enterprise-multi-tenancy',
        message: `Organization recordVersion conflict: expected ${patch.expectedRecordVersion ?? 'missing'}, actual ${existing.recordVersion}.`,
      });
    }

    const nextParentId =
      patch.parentOrganizationId !== undefined
        ? patch.parentOrganizationId?.trim() || null
        : existing.parentOrganizationId ?? null;

    if (nextParentId) {
      if (nextParentId === organizationId) {
        throw new PlatformApplicationError({
          code: 'INVALID_ORGANIZATION_HIERARCHY_CYCLE',
          category: 'VALIDATION',
          httpStatus: 400,
          owningModule: 'enterprise-multi-tenancy',
          message: 'Organization hierarchy cycle detected (self-parent).',
        });
      }
      const parentOrg = this.organizations.get(nextParentId);
      if (!parentOrg || parentOrg.tenantId !== tenantId) {
        throw new PlatformApplicationError({
          code: 'ORGANIZATION_SCOPE_MISMATCH',
          category: 'TENANT_ISOLATION',
          httpStatus: 403,
          owningModule: 'enterprise-multi-tenancy',
          message: `Parent organization '${nextParentId}' does not belong to tenant '${tenantId}'.`,
        });
      }
      // Walk up ancestors to detect hierarchy cycle
      let cursor: string | null = parentOrg.parentOrganizationId ?? null;
      const visited = new Set<string>([organizationId, nextParentId]);
      while (cursor) {
        if (visited.has(cursor)) {
          throw new PlatformApplicationError({
            code: 'INVALID_ORGANIZATION_HIERARCHY_CYCLE',
            category: 'VALIDATION',
            httpStatus: 400,
            owningModule: 'enterprise-multi-tenancy',
            message: 'Organization hierarchy cycle detected.',
          });
        }
        visited.add(cursor);
        cursor = this.organizations.get(cursor)?.parentOrganizationId ?? null;
      }
    }

    const updated: OrganizationRecord = {
      ...existing,
      displayName: patch.displayName ? patch.displayName.trim() : existing.displayName,
      legalName: patch.legalName !== undefined ? patch.legalName : existing.legalName,
      parentOrganizationId: nextParentId,
      status: patch.status ?? existing.status,
      updatedAt: new Date().toISOString(),
      recordVersion: existing.recordVersion + 1,
    };

    this.organizations.set(organizationId, updated);
    this.recordAudit({
      actorId: actor.actorId,
      action: 'organization.update',
      resourceType: 'ORGANIZATION',
      resourceId: organizationId,
      tenantId,
      organizationId,
      correlationId: actor.correlationId,
      result: 'SUCCESS',
      details: { status: updated.status, recordVersion: updated.recordVersion },
    });

    return structuredClone(updated);
  }

  // ============================================================================
  // 2.2 & 2.8 — Tenant Memberships & Single-Use Hashed Invitations
  // ============================================================================

  public listMemberships(
    tenantId: string,
    params?: { limit?: number; cursor?: string; organizationId?: string },
  ): { items: TenantMembershipRecord[]; nextCursor: string | null } {
    this.getTenantById(tenantId);
    const page = normalizePaginationParams(
      { limit: params?.limit, cursor: params?.cursor },
      { defaultLimit: 25, maxLimit: 100 },
    );
    const decoded = page.cursor ? decodePaginationCursor(page.cursor) : null;
    const all = Array.from(this.memberships.values())
      .filter((m) => {
        if (m.tenantId !== tenantId) return false;
        if (params?.organizationId && m.organizationId !== params.organizationId) return false;
        return true;
      })
      .sort((a, b) => a.membershipId.localeCompare(b.membershipId));
    const filtered = decoded ? all.filter((m) => m.membershipId > decoded.docId) : all;
    const slice = filtered.slice(0, page.limit).map((m) => structuredClone(m));
    const hasMore = filtered.length > page.limit;
    const last = slice[slice.length - 1];
    return {
      items: slice,
      nextCursor:
        hasMore && last
          ? encodePaginationCursor({
              sortValue: last.membershipId,
              docId: last.membershipId,
              direction: 'asc',
            })
          : null,
    };
  }

  public createMembership(
    tenantId: string,
    input: {
      userId: string;
      organizationId?: string | null;
      membershipRoleReferences: string[];
    },
    actor: { actorId: string; isPlatformAdmin: boolean; correlationId: string },
  ): TenantMembershipRecord {
    const tenant = this.getTenantById(tenantId);
    const orgId = input.organizationId?.trim() || null;
    if (orgId) {
      this.getOrganization(tenantId, orgId);
      this.assertCanManageOrganization(tenant, orgId, actor.actorId, actor.isPlatformAdmin);
    } else {
      this.assertCanManageTenant(tenant, actor.actorId, actor.isPlatformAdmin);
    }

    const userId = (input.userId ?? '').trim();
    if (!userId) {
      throw new PlatformApplicationError({
        code: 'INVALID_MEMBERSHIP_USER',
        category: 'VALIDATION',
        httpStatus: 400,
        owningModule: 'enterprise-multi-tenancy',
        message: 'userId is required for membership.',
      });
    }

    const roles = (input.membershipRoleReferences ?? []).filter((r) => ALLOWED_TENANT_ROLES.has(r));
    if (roles.length === 0) {
      throw new PlatformApplicationError({
        code: 'INVALID_MEMBERSHIP_ROLES',
        category: 'VALIDATION',
        httpStatus: 400,
        owningModule: 'enterprise-multi-tenancy',
        message: 'At least one valid tenant role reference is required.',
      });
    }

    // Prevent duplicate active membership in the same (tenantId, organizationId) scope
    for (const existing of this.memberships.values()) {
      if (
        existing.tenantId === tenantId &&
        (existing.organizationId ?? null) === orgId &&
        existing.userId === userId &&
        existing.membershipStatus === 'ACTIVE'
      ) {
        throw new PlatformApplicationError({
          code: 'DUPLICATE_ACTIVE_MEMBERSHIP',
          category: 'CONFLICT',
          httpStatus: 409,
          owningModule: 'enterprise-multi-tenancy',
          message: `User '${userId}' already has an ACTIVE membership in scope (${tenantId}, ${orgId ?? 'tenant-root'}).`,
        });
      }
    }

    const nowIso = new Date().toISOString();
    const membershipId = `mem_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const record: TenantMembershipRecord = {
      membershipId,
      tenantId,
      organizationId: orgId,
      userId,
      membershipStatus: 'ACTIVE',
      membershipRoleReferences: roles,
      joinedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      invitedBy: actor.actorId,
      recordVersion: 1,
    };

    this.memberships.set(membershipId, record);
    this.recordAudit({
      actorId: actor.actorId,
      action: 'membership.create',
      resourceType: 'MEMBERSHIP',
      resourceId: membershipId,
      tenantId,
      organizationId: orgId,
      correlationId: actor.correlationId,
      result: 'SUCCESS',
      details: { userId, roles },
    });

    return structuredClone(record);
  }

  public updateMembership(
    tenantId: string,
    membershipId: string,
    patch: {
      expectedRecordVersion?: number;
      membershipRoleReferences?: string[];
      membershipStatus?: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
    },
    actor: { actorId: string; isPlatformAdmin: boolean; correlationId: string },
  ): TenantMembershipRecord {
    const tenant = this.getTenantById(tenantId);
    const existing = this.memberships.get((membershipId ?? '').trim());
    if (!existing || existing.tenantId !== tenantId) {
      throw new PlatformApplicationError({
        code: 'MEMBERSHIP_NOT_FOUND',
        category: 'NOT_FOUND',
        httpStatus: 404,
        owningModule: 'enterprise-multi-tenancy',
        message: `Membership '${membershipId}' not found in tenant '${tenantId}'.`,
      });
    }

    if (existing.organizationId) {
      this.assertCanManageOrganization(
        tenant,
        existing.organizationId,
        actor.actorId,
        actor.isPlatformAdmin,
      );
    } else {
      this.assertCanManageTenant(tenant, actor.actorId, actor.isPlatformAdmin);
    }

    if (
      patch.expectedRecordVersion === undefined ||
      patch.expectedRecordVersion !== existing.recordVersion
    ) {
      throw new PlatformApplicationError({
        code: 'VERSION_CONFLICT',
        category: 'CONFLICT',
        httpStatus: 409,
        owningModule: 'enterprise-multi-tenancy',
        message: `Membership recordVersion conflict: expected ${patch.expectedRecordVersion ?? 'missing'}, actual ${existing.recordVersion}.`,
      });
    }

    const updated: TenantMembershipRecord = {
      ...existing,
      membershipRoleReferences: patch.membershipRoleReferences ?? existing.membershipRoleReferences,
      membershipStatus: patch.membershipStatus ?? existing.membershipStatus,
      updatedAt: new Date().toISOString(),
      recordVersion: existing.recordVersion + 1,
    };

    this.memberships.set(membershipId, updated);
    this.recordAudit({
      actorId: actor.actorId,
      action: 'membership.update',
      resourceType: 'MEMBERSHIP',
      resourceId: membershipId,
      tenantId,
      organizationId: existing.organizationId ?? null,
      correlationId: actor.correlationId,
      result: 'SUCCESS',
      details: { status: updated.membershipStatus, recordVersion: updated.recordVersion },
    });

    return structuredClone(updated);
  }

  public createInvitation(
    tenantId: string,
    input: {
      invitedEmail: string;
      invitedUserId?: string | null;
      organizationId?: string | null;
      roleReferences: string[];
      expiresInMinutes?: number;
    },
    actor: { actorId: string; isPlatformAdmin: boolean; correlationId: string },
  ): { invitation: TenantInvitationRecord; oneTimeVerificationToken: string } {
    const tenant = this.getTenantById(tenantId);
    const orgId = input.organizationId?.trim() || null;
    if (orgId) {
      this.getOrganization(tenantId, orgId);
      this.assertCanManageOrganization(tenant, orgId, actor.actorId, actor.isPlatformAdmin);
    } else {
      this.assertCanManageTenant(tenant, actor.actorId, actor.isPlatformAdmin);
    }

    const email = (input.invitedEmail ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new PlatformApplicationError({
        code: 'INVALID_INVITATION_EMAIL',
        category: 'VALIDATION',
        httpStatus: 400,
        owningModule: 'enterprise-multi-tenancy',
        message: 'invitedEmail must be a valid email address.',
      });
    }

    const roles = (input.roleReferences ?? []).filter((r) => ALLOWED_TENANT_ROLES.has(r));
    if (roles.length === 0) {
      throw new PlatformApplicationError({
        code: 'INVALID_INVITATION_ROLES',
        category: 'VALIDATION',
        httpStatus: 400,
        owningModule: 'enterprise-multi-tenancy',
        message: 'Invitation requires at least one valid role reference.',
      });
    }

    // High-entropy random token; only SHA-256 hash is stored in the invitation record
    const rawToken = `tinv_${randomBytes(24).toString('hex')}`;
    const tokenHash = hashInvitationToken(rawToken);
    const nowMs = Date.now();
    const ttlMs = (input.expiresInMinutes ?? 60 * 24) * 60 * 1000;
    const nowIso = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + ttlMs).toISOString();

    const invitation: TenantInvitationRecord = {
      invitationId: `inv_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      tenantId,
      organizationId: orgId,
      invitedEmail: email,
      invitedUserId: input.invitedUserId?.trim() || null,
      invitedBy: actor.actorId,
      roleReferences: roles,
      invitationStatus: 'PENDING',
      tokenHash,
      expiresAt,
      acceptedAt: null,
      revokedAt: null,
      createdAt: nowIso,
      recordVersion: 1,
    };

    this.invitations.set(invitation.invitationId, invitation);
    this.recordAudit({
      actorId: actor.actorId,
      action: 'invitation.create',
      resourceType: 'INVITATION',
      resourceId: invitation.invitationId,
      tenantId,
      organizationId: orgId,
      correlationId: actor.correlationId,
      result: 'SUCCESS',
      details: { invitedEmail: email, expiresAt },
    });

    return {
      invitation: structuredClone(invitation),
      oneTimeVerificationToken: rawToken,
    };
  }

  public listInvitations(
    tenantId: string,
    params?: { limit?: number; cursor?: string },
  ): { items: TenantInvitationRecord[]; nextCursor: string | null } {
    this.getTenantById(tenantId);
    const page = normalizePaginationParams(
      { limit: params?.limit, cursor: params?.cursor },
      { defaultLimit: 25, maxLimit: 100 },
    );
    const decoded = page.cursor ? decodePaginationCursor(page.cursor) : null;
    const all = Array.from(this.invitations.values())
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => a.invitationId.localeCompare(b.invitationId));
    const filtered = decoded ? all.filter((i) => i.invitationId > decoded.docId) : all;
    const slice = filtered.slice(0, page.limit).map((i) => structuredClone(i));
    const hasMore = filtered.length > page.limit;
    const last = slice[slice.length - 1];
    return {
      items: slice,
      nextCursor:
        hasMore && last
          ? encodePaginationCursor({
              sortValue: last.invitationId,
              docId: last.invitationId,
              direction: 'asc',
            })
          : null,
    };
  }

  public revokeInvitation(
    tenantId: string,
    invitationId: string,
    actor: { actorId: string; isPlatformAdmin: boolean; correlationId: string },
  ): TenantInvitationRecord {
    const tenant = this.getTenantById(tenantId);
    const inv = this.invitations.get((invitationId ?? '').trim());
    if (!inv || inv.tenantId !== tenantId) {
      throw new PlatformApplicationError({
        code: 'INVITATION_NOT_FOUND',
        category: 'NOT_FOUND',
        httpStatus: 404,
        owningModule: 'enterprise-multi-tenancy',
        message: `Invitation '${invitationId}' not found in tenant '${tenantId}'.`,
      });
    }
    this.assertCanManageTenant(tenant, actor.actorId, actor.isPlatformAdmin);
    if (inv.invitationStatus !== 'PENDING') {
      throw new PlatformApplicationError({
        code: 'INVITATION_NOT_PENDING',
        category: 'CONFLICT',
        httpStatus: 409,
        owningModule: 'enterprise-multi-tenancy',
        message: `Invitation '${invitationId}' is in status '${inv.invitationStatus}' and cannot be revoked.`,
      });
    }
    const updated: TenantInvitationRecord = {
      ...inv,
      invitationStatus: 'REVOKED',
      revokedAt: new Date().toISOString(),
      recordVersion: inv.recordVersion + 1,
    };
    this.invitations.set(invitationId, updated);
    this.recordAudit({
      actorId: actor.actorId,
      action: 'invitation.revoke',
      resourceType: 'INVITATION',
      resourceId: invitationId,
      tenantId,
      organizationId: inv.organizationId ?? null,
      correlationId: actor.correlationId,
      result: 'SUCCESS',
      details: {},
    });
    return structuredClone(updated);
  }

  /**
   * 2.8 — Single-use, expiration-checked, concurrency-safe invitation acceptance.
   * Requires both authenticated user verification AND the raw cryptographic token (email alone never suffices).
   */
  public acceptInvitation(
    tenantId: string,
    invitationId: string,
    rawToken: string,
    authenticatedUser: { userId: string; verifiedEmail: string; correlationId: string },
  ): { invitation: TenantInvitationRecord; membership: TenantMembershipRecord } {
    this.assertTenantOperationalForBusiness(tenantId);
    const lockKey = `${tenantId}:${invitationId}`;
    if (this.invitationAcceptLocks.has(lockKey)) {
      throw new PlatformApplicationError({
        code: 'CONCURRENT_INVITATION_ACCEPTANCE',
        category: 'CONFLICT',
        httpStatus: 409,
        owningModule: 'enterprise-multi-tenancy',
        message: 'Concurrent acceptance of the same invitation was blocked.',
      });
    }

    this.invitationAcceptLocks.add(lockKey);
    try {
      const inv = this.invitations.get((invitationId ?? '').trim());
      if (!inv || inv.tenantId !== tenantId) {
        throw new PlatformApplicationError({
          code: 'INVITATION_NOT_FOUND',
          category: 'NOT_FOUND',
          httpStatus: 404,
          owningModule: 'enterprise-multi-tenancy',
          message: `Invitation '${invitationId}' not found in tenant '${tenantId}'.`,
        });
      }

      if (inv.invitationStatus === 'ACCEPTED') {
        throw new PlatformApplicationError({
          code: 'INVITATION_TOKEN_REPLAYED',
          category: 'SECURITY',
          httpStatus: 409,
          owningModule: 'enterprise-multi-tenancy',
          message: 'Invitation token has already been used.',
        });
      }

      if (inv.invitationStatus !== 'PENDING') {
        throw new PlatformApplicationError({
          code: 'INVITATION_INVALID_STATUS',
          category: 'BUSINESS_RULE',
          httpStatus: 422,
          owningModule: 'enterprise-multi-tenancy',
          message: `Invitation is '${inv.invitationStatus}' and cannot be accepted.`,
        });
      }

      if (Date.now() > Date.parse(inv.expiresAt)) {
        const expired: TenantInvitationRecord = {
          ...inv,
          invitationStatus: 'EXPIRED',
          recordVersion: inv.recordVersion + 1,
        };
        this.invitations.set(invitationId, expired);
        throw new PlatformApplicationError({
          code: 'INVITATION_EXPIRED',
          category: 'BUSINESS_RULE',
          httpStatus: 422,
          owningModule: 'enterprise-multi-tenancy',
          message: 'Invitation has expired.',
        });
      }

      if (!rawToken || !verifyInvitationTokenHash(rawToken, inv.tokenHash)) {
        throw new PlatformApplicationError({
          code: 'INVALID_INVITATION_TOKEN',
          category: 'AUTHENTICATION',
          httpStatus: 401,
          owningModule: 'enterprise-multi-tenancy',
          message: 'Invalid invitation verification token; email matching alone does not establish membership.',
        });
      }

      if (
        inv.invitedUserId &&
        inv.invitedUserId !== authenticatedUser.userId
      ) {
        throw new PlatformApplicationError({
          code: 'INVITATION_ACTOR_MISMATCH',
          category: 'AUTHORIZATION',
          httpStatus: 403,
          owningModule: 'enterprise-multi-tenancy',
          message: 'Authenticated user does not match the invitedUserId.',
        });
      }

      if (
        inv.invitedEmail.toLowerCase() !==
        (authenticatedUser.verifiedEmail ?? '').trim().toLowerCase()
      ) {
        throw new PlatformApplicationError({
          code: 'INVITATION_EMAIL_MISMATCH',
          category: 'AUTHORIZATION',
          httpStatus: 403,
          owningModule: 'enterprise-multi-tenancy',
          message: 'Authenticated user email does not match the invited email.',
        });
      }

      const nowIso = new Date().toISOString();
      const updatedInv: TenantInvitationRecord = {
        ...inv,
        invitationStatus: 'ACCEPTED',
        acceptedAt: nowIso,
        recordVersion: inv.recordVersion + 1,
      };
      this.invitations.set(invitationId, updatedInv);

      const membership = this.createMembership(
        tenantId,
        {
          userId: authenticatedUser.userId,
          organizationId: inv.organizationId ?? null,
          membershipRoleReferences: inv.roleReferences,
        },
        {
          actorId: inv.invitedBy,
          isPlatformAdmin: true,
          correlationId: authenticatedUser.correlationId,
        },
      );

      return {
        invitation: structuredClone(updatedInv),
        membership,
      };
    } finally {
      this.invitationAcceptLocks.delete(lockKey);
    }
  }

  // ============================================================================
  // Internal Authorization Helpers for Phase 2 & Phase 3
  // ============================================================================

  public getActiveMembershipsForUser(tenantId: string, userId: string): TenantMembershipRecord[] {
    const results: TenantMembershipRecord[] = [];
    for (const m of this.memberships.values()) {
      if (m.tenantId === tenantId && m.userId === userId && m.membershipStatus === 'ACTIVE') {
        results.push(structuredClone(m));
      }
    }
    return results;
  }

  public assertCanManageTenant(
    tenant: TenantRecord,
    actorId: string,
    isPlatformAdmin: boolean,
  ): void {
    if (isPlatformAdmin || tenant.ownerUserId === actorId) return;
    const activeMems = this.getActiveMembershipsForUser(tenant.tenantId, actorId);
    const hasTenantAdmin = activeMems.some(
      (m) =>
        m.membershipRoleReferences.includes('tenant_owner') ||
        m.membershipRoleReferences.includes('tenant_admin'),
    );
    if (!hasTenantAdmin) {
      throw new PlatformApplicationError({
        code: 'TENANT_ACCESS_DENIED',
        category: 'AUTHORIZATION',
        httpStatus: 403,
        owningModule: 'enterprise-multi-tenancy',
        message: `Actor '${actorId}' lacks tenant administrator authority for tenant '${tenant.tenantId}'.`,
      });
    }
  }

  public assertCanManageOrganization(
    tenant: TenantRecord,
    organizationId: string,
    actorId: string,
    isPlatformAdmin: boolean,
  ): void {
    if (isPlatformAdmin || tenant.ownerUserId === actorId) return;
    const activeMems = this.getActiveMembershipsForUser(tenant.tenantId, actorId);
    const canManage = activeMems.some(
      (m) =>
        m.membershipRoleReferences.includes('tenant_owner') ||
        m.membershipRoleReferences.includes('tenant_admin') ||
        (m.organizationId === organizationId &&
          m.membershipRoleReferences.includes('organization_admin')),
    );
    if (!canManage) {
      throw new PlatformApplicationError({
        code: 'ORGANIZATION_ACCESS_DENIED',
        category: 'AUTHORIZATION',
        httpStatus: 403,
        owningModule: 'enterprise-multi-tenancy',
        message: `Actor '${actorId}' is not authorized to manage organization '${organizationId}' in tenant '${tenant.tenantId}'.`,
      });
    }
  }
}

let defaultTenancyStore: EnterpriseTenancyStore | null = null;

export function getDefaultEnterpriseTenancyStore(): EnterpriseTenancyStore {
  if (!defaultTenancyStore) {
    defaultTenancyStore = new EnterpriseTenancyStore();
  }
  return defaultTenancyStore;
}

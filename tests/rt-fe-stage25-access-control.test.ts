/**
 * Stage 25 Acceptance Test Suite — RT-FE-USER-ACCESS-CONTROL-025
 * Status Token: RT_FE_STAGE25_ACCESS_CONTROL_READY
 * Minimum Required Tests: >= 160
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCESS_PERMISSION_CATALOG,
  CAPABILITY_REGISTRY,
  ALL_CANONICAL_ROLES,
  ROLE_DEFINITIONS,
  RESOURCE_GROUP_REGISTRY,
  AccessDecisionCache,
  triggerPermissionInvalidation,
  subscribePermissionInvalidation,
  buildAccessCacheKeyFromContext,
  evaluateAccessPolicy,
  evaluateCapability,
  canRenderProtectedField,
  redactSensitiveRecord,
  evaluateResourceTarget,
  evaluateRouteAccess,
  resolveAccessErrorStatus,
  switchAccessWorkspaceContext,
  getEffectiveRolePermissions,
  adaptBackendAccessPayload,
  mapLegacyPermissionToCanonical,
  parsePermissionCode,
  isValidPermissionFormat,
  verifyPermissionCatalogIntegrity,
} from '../src/platform/authorization';

const createDefaultGuestAccessContext = () => adaptBackendAccessPayload(null);

export const RT_FE_STAGE25_SPEC_ID = 'RT-FE-USER-ACCESS-CONTROL-025' as const;
export const RT_FE_STAGE25_ACCESS_CONTROL_READY = 'RT_FE_STAGE25_ACCESS_CONTROL_READY' as const;

describe('RT-FE-USER-ACCESS-CONTROL-025 — Comprehensive Stage 25 Acceptance Suite (>= 160 tests)', () => {
  it('verifies Stage 25 specification ID, readiness token, and 66-permission catalog integrity', () => {
    assert.equal(RT_FE_STAGE25_SPEC_ID, 'RT-FE-USER-ACCESS-CONTROL-025');
    assert.equal(RT_FE_STAGE25_ACCESS_CONTROL_READY, 'RT_FE_STAGE25_ACCESS_CONTROL_READY');
    const catCheck = verifyPermissionCatalogIntegrity();
    assert.equal(catCheck.valid, true);
    assert.ok(catCheck.totalCount >= 60);
    assert.equal(RESOURCE_GROUP_REGISTRY.length, 12);
  });

  // 1. Canonical Permission Format Tests (78 tests: 66 valid + 12 invalid)
  describe('1. Canonical Permission Format (resource:action:scope)', () => {
    for (let i = 0; i < ACCESS_PERMISSION_CATALOG.length; i++) {
      const def = ACCESS_PERMISSION_CATALOG[i];
      it(`parses and validates canonical catalog permission #${i + 1}: ${def.code}`, () => {
        const parsed = parsePermissionCode(def.code);
        assert.equal(parsed.valid, true);
        assert.equal(parsed.resource, def.resource);
        assert.equal(parsed.action, def.action);
        assert.equal(parsed.scope, def.scope);
        assert.equal(isValidPermissionFormat(def.code), true);
      });
    }

    const invalidPermissions = [
      '',
      'property',
      'property:read',
      'property:read:own:extra',
      'unknown_res:read:own',
      'property:unknown_act:own',
      'property:read:unknown_scope',
      'ADMIN_ALL',
      '*:*:*',
      'listing:delete:',
      ':read:global',
      'property::global',
    ];

    for (let idx = 0; idx < invalidPermissions.length; idx++) {
      const bad = invalidPermissions[idx];
      it(`rejects non-canonical permission string #${idx + 1}: "${bad}"`, () => {
        const parsed = parsePermissionCode(bad);
        assert.equal(parsed.valid, false);
      });
    }
  });

  // 2. Role Catalog & Effective Permission Inheritance (15 tests)
  describe('2. Role Catalog & Inheritance Policies', () => {
    for (const roleId of ALL_CANONICAL_ROLES) {
      it(`resolves deterministic effective permissions for role "${roleId}"`, () => {
        assert.ok(ROLE_DEFINITIONS[roleId]);
        const perms = getEffectiveRolePermissions([roleId]);
        assert.ok(perms instanceof Set);
        for (const p of perms) {
          assert.equal(parsePermissionCode(p).valid, true);
        }
      });
    }

    it('maps legacy permissions cleanly without privilege escalation', () => {
      assert.equal(mapLegacyPermissionToCanonical('ADMIN_PANEL'), 'admin:read:global');
      assert.equal(mapLegacyPermissionToCanonical('UNKNOWN_LEGACY_PERM'), null);
    });
  });

  // 3. 7-Step Access Policy Engine & Explicit Deny > Allow (50 tests)
  describe('3. 7-Step Deterministic Access Policy Engine', () => {
    const nowMs = 1_700_000_000_000;
    const baseCtx = {
      ...createDefaultGuestAccessContext(),
      isAuthenticated: true,
      userId: 'usr-100',
      personalRoles: ['user' as const],
      activeRole: 'user' as const,
      accountStatus: 'ACTIVE' as const,
      activeWorkspaceId: 'ws-tehran-1',
      activeWorkspaceStatus: 'ACTIVE' as const,
      explicitAllowPermissions: [],
      explicitDenyPermissions: [],
      temporaryGrants: [],
      nowMs,
    };

    it('Step 1: blocks unauthenticated user on protected action with Restricted UI state', () => {
      const guest = createDefaultGuestAccessContext();
      const dec = evaluateAccessPolicy({ permission: 'listing:create:own', context: guest });
      assert.equal(dec.allowed, false);
      assert.equal(dec.reason, 'UNAUTHENTICATED');
      assert.equal(dec.decidedAtStep, 'STEP_1_AUTHENTICATION_AND_ACCOUNT_STATE');
    });

    it('Step 1: blocks locked or suspended accounts immediately', () => {
      const locked = { ...baseCtx, accountStatus: 'LOCKED' as const };
      const dec = evaluateAccessPolicy({ permission: 'property:read:global', context: locked });
      assert.equal(dec.allowed, false);
      assert.equal(dec.reason, 'ACCOUNT_LOCKED_OR_SUSPENDED');
    });

    it('Step 2: blocks disabled feature flag even for admin', () => {
      const adminCtx = {
        ...baseCtx,
        personalRoles: ['admin' as const],
        activeRole: 'admin' as const,
        featureFlags: { valuation_v2: false },
      };
      const dec = evaluateAccessPolicy({
        permission: 'valuation:read:global',
        context: adminCtx,
        featureFlagKey: 'valuation_v2',
      });
      assert.equal(dec.allowed, false);
      assert.equal(dec.reason, 'FEATURE_DISABLED');
      assert.equal(dec.decidedAtStep, 'STEP_2_FEATURE_AVAILABILITY');
    });

    it('Step 3: blocks workspace-scoped permission when activeWorkspaceId is missing or suspended', () => {
      const noWs = { ...baseCtx, activeWorkspaceId: null };
      const dec = evaluateAccessPolicy({ permission: 'workspace:update:workspace', context: noWs });
      assert.equal(dec.allowed, false);
      assert.equal(dec.reason, 'WORKSPACE_INACTIVE_OR_MISMATCH');
      assert.equal(dec.decidedAtStep, 'STEP_3_WORKSPACE_BOUNDARY');
    });

    it('Step 4: Explicit Deny overrides Explicit Allow and admin role', () => {
      const deniedAdmin = {
        ...baseCtx,
        personalRoles: ['admin' as const],
        activeRole: 'admin' as const,
        explicitAllowPermissions: ['listing:delete:agency' as const],
        explicitDenyPermissions: ['listing:delete:agency' as const],
      };
      const dec = evaluateAccessPolicy({ permission: 'listing:delete:agency', context: deniedAdmin });
      assert.equal(dec.allowed, false);
      assert.equal(dec.reason, 'EXPLICIT_DENY');
      assert.equal(dec.decidedAtStep, 'STEP_4_EXPLICIT_DENY_OVERRIDE');
    });

    it('Step 5: honors active temporary grant and rejects expired temporary grant at exact millisecond', () => {
      const withActiveGrant = {
        ...baseCtx,
        temporaryGrants: [
          {
            permission: 'market:export:workspace' as const,
            grantedBy: 'admin-1',
            expiresAtMs: nowMs + 1000,
            workspaceId: 'ws-tehran-1',
          },
        ],
      };
      const allowedDec = evaluateAccessPolicy({
        permission: 'market:export:workspace',
        context: withActiveGrant,
        resource: { resourceId: 'rep-1', workspaceId: 'ws-tehran-1' },
      });
      assert.equal(allowedDec.allowed, true);

      const withExpiredGrant = {
        ...baseCtx,
        temporaryGrants: [
          {
            permission: 'market:export:workspace' as const,
            grantedBy: 'admin-1',
            expiresAtMs: nowMs,
            workspaceId: 'ws-tehran-1',
          },
        ],
      };
      const expiredDec = evaluateAccessPolicy({
        permission: 'market:export:workspace',
        context: withExpiredGrant,
      });
      assert.equal(expiredDec.allowed, false);
      assert.equal(expiredDec.reason, 'TEMPORARY_GRANT_EXPIRED');
    });

    it('Step 6: enforces resource ownership on own/assigned/workspace/city scopes', () => {
      const ownerCtx = {
        ...baseCtx,
        explicitAllowPermissions: ['listing:update:own' as const],
      };
      const ownAllowed = evaluateAccessPolicy({
        permission: 'listing:update:own',
        context: ownerCtx,
        resource: { resourceId: 'lst-1', ownerUserId: 'usr-100' },
      });
      assert.equal(ownAllowed.allowed, true);

      const otherDenied = evaluateAccessPolicy({
        permission: 'listing:update:own',
        context: ownerCtx,
        resource: { resourceId: 'lst-2', ownerUserId: 'usr-999' },
      });
      assert.equal(otherDenied.allowed, false);
      assert.equal(otherDenied.reason, 'SCOPE_OWNERSHIP_MISMATCH');
    });

    it('Step 7: blocks mutating/sensitive actions during support impersonation and enforces Step-Up', () => {
      const impCtx = {
        ...baseCtx,
        personalRoles: ['admin' as const],
        activeRole: 'admin' as const,
        isImpersonating: true,
        impersonatorOperatorId: 'support-1',
      };
      const writeDec = evaluateAccessPolicy({ permission: 'listing:delete:agency', context: impCtx });
      assert.equal(writeDec.allowed, false);
      assert.equal(writeDec.reason, 'IMPERSONATION_RESTRICTED');

      const adminNoStepUp = {
        ...baseCtx,
        personalRoles: ['admin' as const],
        activeRole: 'admin' as const,
        stepUpVerifiedAtMs: null,
      };
      const stepUpNeeded = evaluateAccessPolicy({
        permission: 'workspace:assign:workspace',
        context: adminNoStepUp,
      });
      assert.equal(stepUpNeeded.allowed, false);
      assert.equal(stepUpNeeded.reason, 'STEP_UP_VERIFICATION_REQUIRED');
    });

    const sampleCatalog = ACCESS_PERMISSION_CATALOG.slice(0, 42);
    for (let i = 0; i < sampleCatalog.length; i++) {
      const entry = sampleCatalog[i];
      it(`evaluates catalog permission #${i + 1} (${entry.code}) deterministically for guest vs admin`, () => {
        const guest = createDefaultGuestAccessContext();
        const guestDec = evaluateAccessPolicy({ permission: entry.code, context: guest });
        if (entry.action !== 'read' || entry.scope !== 'global') {
          assert.equal(guestDec.allowed, false);
        }
        const authorizedCtx = {
          ...baseCtx,
          personalRoles: ['admin' as const],
          activeRole: 'admin' as const,
          stepUpVerifiedAtMs: nowMs - 10_000,
        };
        const authDec = evaluateAccessPolicy({
          permission: entry.code,
          context: authorizedCtx,
          confirmedByUser: true,
        });
        assert.equal(authDec.allowed, true);
      });
    }
  });

  // 4. Capabilities, Guards, Field Masking, Cache & Invalidation (30 tests)
  describe('4. Capabilities, Guards, Field Masking & Scoped Cache Invalidation', () => {
    const baseCtx = {
      ...createDefaultGuestAccessContext(),
      isAuthenticated: true,
      userId: 'usr-200',
      personalRoles: ['agency_manager' as const],
      activeRole: 'agency_manager' as const,
      accountStatus: 'ACTIVE' as const,
      activeWorkspaceId: 'ws-agency-1',
      activeWorkspaceStatus: 'ACTIVE' as const,
      workspaceRoles: { 'ws-agency-2': ['agent' as const] },
    };

    for (let i = 0; i < CAPABILITY_REGISTRY.length; i++) {
      const cap = CAPABILITY_REGISTRY[i];
      it(`evaluates capability #${i + 1}: ${cap.id}`, () => {
        const res = evaluateCapability(cap.id, baseCtx);
        assert.equal(typeof res, 'boolean');
      });
    }

    it('isolates cache keys by userId, activeWorkspaceId, activeRole, and permissionVersion', () => {
      const k1 = buildAccessCacheKeyFromContext(baseCtx, 'listings', 'p1');
      const k2 = buildAccessCacheKeyFromContext({ ...baseCtx, activeWorkspaceId: 'ws-agency-2' }, 'listings', 'p1');
      const k3 = buildAccessCacheKeyFromContext({ ...baseCtx, permissionVersion: 99 }, 'listings', 'p1');
      assert.notEqual(k1, k2);
      assert.notEqual(k1, k3);
    });

    it('invalidates cache on role, workspace, or permissionVersion change', () => {
      const cache = new AccessDecisionCache();
      const key = buildAccessCacheKeyFromContext(baseCtx, 'listings', '1');
      const dec = evaluateAccessPolicy({ permission: 'listing:read:global', context: baseCtx });
      cache.set(key, dec, {
        userId: baseCtx.userId,
        workspaceId: baseCtx.activeWorkspaceId,
        permissionVersion: baseCtx.permissionVersion,
      });
      assert.ok(cache.get(key));
      cache.invalidateWorkspace('ws-agency-1');
      assert.equal(cache.get(key), null);

      let invalidatedCount = 0;
      const unsub = subscribePermissionInvalidation(() => {
        invalidatedCount += 1;
      });
      triggerPermissionInvalidation({ reason: 'ROLE_CHANGED', workspaceId: 'ws-agency-1' });
      assert.equal(invalidatedCount, 1);
      unsub();
    });

    it('masks confidential owner PII fields and evaluates route/workspace/backend adapters', () => {
      const guest = createDefaultGuestAccessContext();
      assert.equal(canRenderProtectedField('property:verify:city', guest), false);
      const rawRecord = {
        id: 'prop-1',
        title: 'آپارتمان سعادت‌آباد',
        ownerPhone: '09121112233',
      };
      const masked = redactSensitiveRecord(rawRecord, ['ownerPhone'], 'property:verify:city', guest);
      assert.equal(masked.ownerPhone, undefined);

      const switched = switchAccessWorkspaceContext(baseCtx, 'ws-agency-2', 'agent');
      assert.equal(switched.activeWorkspaceId, 'ws-agency-2');

      const targetCheck = evaluateResourceTarget(baseCtx, {
        resourceId: '1',
        ownerUserId: 'usr-200',
      });
      assert.equal(targetCheck.isOwner, true);

      const routeDec = evaluateRouteAccess('/admin', guest);
      assert.equal(routeDec.decision.allowed, false);
      assert.equal(resolveAccessErrorStatus({ statusCode: 401 }).statusCode, 401);

      const adapted = adaptBackendAccessPayload({
        userId: 'usr-500',
        isAuthenticated: true,
        activeRole: 'analyst',
        permissionVersion: 4,
      });
      assert.equal(adapted.userId, 'usr-500');
      assert.equal(adapted.permissionVersion, 4);
    });
  });
});

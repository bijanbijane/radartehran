import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RT_FE_NAVIGATION_WORKSPACE_014_SPEC_ID,
  RT_FE_STAGE15_BRIDGE_SPEC_ID,
  RT_NAV_SUBSYSTEMS_7,
  RT_NAV_GLOBAL_GROUPS_10,
  RT_NAV_WORKSPACES_7,
  RT_NAV_FAILURE_STATES_10,
  RT_NAV_MIGRATION_PHASES_7,
  RT_NAV_DELIVERABLES_33,
  RT_NAV_REGISTRY_SAMPLE,
  RT_NAV_COMMANDS_SAMPLE,
  RT_NAV_DISCOVERY_CATALOG_SAMPLE,
  resolveDeepLinkDestination,
  buildValidatedBreadcrumbs,
  searchDiscoveryAndEntities,
  transferWorkspaceContext,
  sanitizeNavigationTelemetryEvent,
} from '../services/rtFeNavigation014Engine';

describe('Tehran Radar Comprehensive Frontend Roadmap — Stage 14 (RT-FE-NAVIGATION-WORKSPACE-014)', () => {
  it('verifies 7 subsystems, 10 global groups, 7 workspaces, 10 failure states, 7 migration phases, 33 deliverables, and Stage 15 bridge', () => {
    assert.equal(RT_FE_NAVIGATION_WORKSPACE_014_SPEC_ID, 'RT-FE-NAVIGATION-WORKSPACE-014');
    assert.equal(RT_FE_STAGE15_BRIDGE_SPEC_ID, 'RT-FE-PAGE-COMPOSITION-015');
    assert.equal(RT_NAV_SUBSYSTEMS_7.length, 7);
    assert.equal(RT_NAV_GLOBAL_GROUPS_10.length, 10);
    assert.equal(RT_NAV_WORKSPACES_7.length, 7);
    assert.equal(RT_NAV_FAILURE_STATES_10.length, 10);
    assert.equal(RT_NAV_MIGRATION_PHASES_7.length, 7);
    assert.equal(RT_NAV_DELIVERABLES_33.length, 33);
    assert.equal(RT_NAV_DELIVERABLES_33[0]?.id, 'RT-NAV-OUT-001');
    assert.equal(RT_NAV_DELIVERABLES_33[32]?.id, 'RT-NAV-OUT-033');
    assert.ok(RT_NAV_REGISTRY_SAMPLE.every((item) => item.featureId.startsWith('FEAT-')));
    assert.ok(RT_NAV_COMMANDS_SAMPLE.length >= 5);
    assert.ok(RT_NAV_DISCOVERY_CATALOG_SAMPLE.length >= 5);
  });

  it('enforces Deep Link anti-open-redirect, zero-secret URL policy, and 403 vs 404 distinction', () => {
    assert.equal(
      resolveDeepLinkDestination({ rawUrl: '//evil.example/phish', isAuthenticated: true, userPermissions: [] }).status,
      'REJECTED_UNSAFE_URL',
    );
    assert.equal(
      resolveDeepLinkDestination({ rawUrl: 'javascript:alert(1)', isAuthenticated: true, userPermissions: [] }).status,
      'REJECTED_UNSAFE_URL',
    );
    assert.equal(
      resolveDeepLinkDestination({ rawUrl: '/market?token=jwt123', isAuthenticated: true, userPermissions: [] }).status,
      'REJECTED_UNSAFE_URL',
    );
    assert.equal(
      resolveDeepLinkDestination({ rawUrl: '/admin/audit', isAuthenticated: true, userPermissions: [] }).status,
      'FORBIDDEN_403',
    );
    assert.equal(
      resolveDeepLinkDestination({ rawUrl: '/admin/audit', isAuthenticated: true, userPermissions: ['admin.access'] }).status,
      'VALID',
    );
    assert.equal(
      resolveDeepLinkDestination({ rawUrl: '/unknown-page', isAuthenticated: true, userPermissions: [] }).status,
      'NOT_FOUND_404',
    );
    const legacy = resolveDeepLinkDestination({ rawUrl: '/property/PR-1024', isAuthenticated: true, userPermissions: [] });
    assert.equal(legacy.status, 'REDIRECT_SAFE');
    assert.equal(legacy.normalizedPath, '/properties/PR-1024');
    assert.equal(
      resolveDeepLinkDestination({ rawUrl: '/neighborhoods/saadat-abad', isAuthenticated: true, userPermissions: [] }).status,
      'VALID',
    );
  });

  it('builds server-verified breadcrumbs, separates discovery from entity search with Persian normalization + RBAC, transfers context cleanly, and strips telemetry PII', () => {
    const crumbs = buildValidatedBreadcrumbs({
      entityTitleFa: null,
      sectionLabelFa: 'محله‌ها',
      currentPageLabelFa: 'روند قیمت',
      sectionHref: '/neighborhoods',
    });
    assert.equal(crumbs.length, 4);
    assert.equal(crumbs[2]?.label, 'عنوان در انتظار تأیید داده');

    const nonAdmin = searchDiscoveryAndEntities('سعادت\u200cآباد', []);
    assert.ok(nonAdmin.entitiesAndReports.some((e) => e.id === 'hood-saadat'));
    assert.ok(nonAdmin.commands.some((c) => c.id === 'cmd-open-saadat'));

    const allNonAdmin = searchDiscoveryAndEntities('', []);
    assert.equal(allNonAdmin.commands.some((c) => c.id === 'cmd-admin-audit'), false);
    const allAdmin = searchDiscoveryAndEntities('', ['admin.access']);
    assert.equal(allAdmin.commands.some((c) => c.id === 'cmd-admin-audit'), true);

    const transfer = transferWorkspaceContext(
      { workspaceId: 'market', cityId: 'tehran', neighborhoodId: 'saadat-abad', propertyType: 'apartment', marketType: 'sale', contextVersion: 2 },
      'research',
      'PR-1024',
    );
    assert.equal(transfer.nextContext.workspaceId, 'research');
    assert.equal(transfer.nextContext.contextVersion, 3);
    assert.ok(transfer.preservedFields.includes('propertyRef:PR-1024'));
    assert.ok(transfer.resetFields.includes('marketType'));

    const telemetry = sanitizeNavigationTelemetryEvent({
      eventName: 'command.executed',
      sourceFeature: 'FEAT-MKT-003',
      targetFeature: 'FEAT-GEO-003',
      deviceCategory: 'desktop',
      extra: { searchQuery: 'سعادت', token: 'secret', exactGps: '35.7,51.4' },
    });
    assert.deepEqual(telemetry.strippedSensitiveFields.sort(), ['exactGps', 'searchQuery', 'token']);
    assert.equal('searchQuery' in telemetry.safeEvent, false);
  });
});

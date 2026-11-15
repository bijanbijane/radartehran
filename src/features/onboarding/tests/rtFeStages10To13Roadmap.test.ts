import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RT_FE_PAGE_TEMPLATES_010_SPEC_ID,
  RT_FE_INFORMATION_ARCHITECTURE_011_SPEC_ID,
  RT_FE_STAGE10_PAGE_TEMPLATES_10,
  RT_FE_IA011_16_CLASSIFICATIONS,
  RT_FE_IA011_57_ENTITIES,
  RT_FE_IA011_MISSING_DATA_STATES_8,
  RT_FE_IA011_CENTRAL_REGISTRIES_10,
  RT_FE_IA011_VISIBILITY_5,
  RT_FE_IA011_DELIVERABLES_35,
  normalizePersianSearchQuery,
  resolveConflictingAttributeObservations,
} from '../services/rtFeIaContent010And011Engine';
import {
  RT_FE_DATA_ARCHITECTURE_012_SPEC_ID,
  RT_DATA_RESPONSIBILITY_LAYERS_6,
  RT_DATA_STATE_CLASSIFICATION_5,
  RT_DATA_FORM_STATES_10,
  RT_DATA_UI_STATUS_MATRIX_11,
  RT_DATA_RETRY_POLICIES_6,
  RT_DATA_CLOUDFLARE_INTEGRATION_5,
  RT_DATA_EXECUTION_STEPS_20,
  RT_DATA_DELIVERABLES_25,
  RT_FE_FDA_STATE_CLASSIFICATION_5,
  RT_FE_FDA_CACHE_POLICIES_9,
  RT_FE_FDA_32_UNITS,
  RT_FE_FDA_DELIVERABLES_38,
  resolveMutationCacheInvalidationTags,
  evaluateVersionedEntityConflict,
  normalizeQueryFilterKey,
  evaluateOptimisticUpdateEligibility,
  sanitizeDataTelemetryEvent,
} from '../services/rtFeDataArchitecture012Engine';
import {
  RT_FE_PERFORMANCE_ARCHITECTURE_013_SPEC_ID,
  RT_FE_FPA_8_DOMAINS,
  RT_FE_FPA_4_PAGE_GROUPS,
  RT_FE_FPA_CWV_TARGETS,
  RT_FE_FPA_31_UNITS,
  RT_FE_FPA_DELIVERABLES_38,
  evaluatePagePerformanceBudget,
  resolveAdaptiveRenderingProfile,
} from '../services/rtFePerformance013Engine';
import {
  RT_FE_FEATURE_ARCHITECTURE_013_SPEC_ID,
  RT_FEAT_ARCHITECTURE_LEVELS_5,
  RT_FEAT_DOMAINS_8_51_FEATURES,
  RT_FEAT_INTERNAL_LAYERS_6,
  RT_FEAT_COMMUNICATION_PATTERNS_4,
  RT_FEAT_LIFECYCLE_STATUSES_7,
  RT_FEAT_TEAM_OWNERSHIP_8,
  RT_FEAT_MIGRATION_PHASES_6,
  RT_FEAT_EXECUTION_STEPS_36,
  RT_FEAT_DELIVERABLES_36,
  RT_FEAT_SAMPLE_DEPENDENCY_REGISTRY,
  RT_FEA_7_GROUPS_42_FEATURES,
  RT_FEA_ENTITY_OWNERSHIP_11,
  RT_FEA_EXTERNAL_ADAPTERS_7,
  RT_FEA_ERROR_BOUNDARIES_4,
  RT_FEA_DOCS_12,
  RT_FEA_EXECUTION_STEPS_24,
  RT_FEA_DELIVERABLES_27,
  RT_FE_STAGE14_BRIDGE_SPEC_ID,
  validateFeatureImportBoundary,
  detectFeatureDependencyCycles,
  evaluateFeatureAccessAndFlag,
  validateAgentTaskBoundary,
  evaluateContractChangeCompatibility,
  validateFeatureNamingStandard,
  evaluateEntityOwnershipMutation,
} from '../services/rtFeFeatureArchitecture013Engine';

describe('Tehran Radar Comprehensive Frontend Roadmap — Stages 10 to 13', () => {
  it('Stages 10 & 11 (RT-FE-PAGE-TEMPLATES-010 & RT-FE-INFORMATION-ARCHITECTURE-011): verifies templates, 57 entities, Persian normalization, and conflict resolver', () => {
    assert.equal(RT_FE_PAGE_TEMPLATES_010_SPEC_ID, 'RT-FE-PAGE-TEMPLATES-010');
    assert.equal(RT_FE_INFORMATION_ARCHITECTURE_011_SPEC_ID, 'RT-FE-INFORMATION-ARCHITECTURE-011');
    assert.equal(RT_FE_STAGE10_PAGE_TEMPLATES_10.length, 10);
    assert.equal(RT_FE_IA011_16_CLASSIFICATIONS.length, 16);
    assert.equal(RT_FE_IA011_57_ENTITIES.length, 57);
    assert.equal(RT_FE_IA011_MISSING_DATA_STATES_8.length, 8);
    assert.equal(RT_FE_IA011_CENTRAL_REGISTRIES_10.length, 10);
    assert.equal(RT_FE_IA011_VISIBILITY_5.length, 5);
    assert.equal(RT_FE_IA011_DELIVERABLES_35.length, 35);

    const searchNorm = normalizePersianSearchQuery('يوسف\u200cآباد ۱۲۰ متري');
    assert.equal(searchNorm.rawPreserved, 'يوسف\u200cآباد ۱۲۰ متري');
    assert.equal(searchNorm.normalizedQuery, 'یوسف آباد 120 متری');
    assert.equal(searchNorm.detectedIntent, 'geographic_or_term');
    assert.equal(normalizePersianSearchQuery('PR-۱۰۲۴').detectedIntent, 'entity_id');

    const resolved = resolveConflictingAttributeObservations([
      { sourceId: 'A', sourceTrustRank: 60, observedAtIso: '2026-11-10', value: 118, verified: false },
      { sourceId: 'B', sourceTrustRank: 95, observedAtIso: '2026-11-12', value: 115, verified: true },
    ]);
    assert.equal(resolved.hasConflict, true);
    assert.equal(resolved.preservedCount, 2);
    assert.equal(resolved.referenceValue, 115);
    assert.equal(resolved.resolutionStatus, 'RESOLVED_BY_VERIFIED_SOURCE');
  });

  it('Stage 12 (RT-FE-DATA-ARCHITECTURE-012): verifies 6 layers, 5 states, query key sanitizer, cache invalidation, version conflict, optimistic gatekeeper, and 25 deliverables', () => {
    assert.equal(RT_FE_DATA_ARCHITECTURE_012_SPEC_ID, 'RT-FE-DATA-ARCHITECTURE-012');
    assert.equal(RT_DATA_RESPONSIBILITY_LAYERS_6.length, 6);
    assert.equal(RT_DATA_STATE_CLASSIFICATION_5.length, 5);
    assert.equal(RT_DATA_FORM_STATES_10.length, 10);
    assert.equal(RT_DATA_UI_STATUS_MATRIX_11.length, 11);
    assert.equal(RT_DATA_RETRY_POLICIES_6.length, 6);
    assert.equal(RT_DATA_CLOUDFLARE_INTEGRATION_5.length, 5);
    assert.equal(RT_DATA_EXECUTION_STEPS_20.length, 20);
    assert.equal(RT_DATA_DELIVERABLES_25.length, 25);
    assert.equal(RT_FE_FDA_STATE_CLASSIFICATION_5.length, 5);
    assert.equal(RT_FE_FDA_CACHE_POLICIES_9.length, 9);
    assert.equal(RT_FE_FDA_32_UNITS.length, 32);
    assert.equal(RT_FE_FDA_DELIVERABLES_38.length, 38);

    const keyPlan = normalizeQueryFilterKey('properties', { maxPrice: 15000, authToken: 'jwt', password: 'pw', city: 'tehran' });
    assert.deepEqual(keyPlan.strippedSensitiveKeys.sort(), ['authToken', 'password']);

    const inv = resolveMutationCacheInvalidationTags('property', 'PR-1024', 'saadat-abad');
    assert.equal(inv.primaryTag, 'property:PR-1024');
    assert.equal(inv.wipesEntireCache, false);
    assert.ok(inv.dependentTags.includes('neighborhood:saadat-abad'));

    assert.equal(evaluateVersionedEntityConflict(3, 4).status, 'CONFLICT_409_PRESERVE_DRAFT');
    assert.equal(evaluateVersionedEntityConflict(4, 4).status, 'COMMIT_ALLOWED');

    assert.equal(evaluateOptimisticUpdateEligibility('bookmark_toggle').optimisticAllowed, true);
    assert.equal(evaluateOptimisticUpdateEligibility('transaction_submit').requiresBackendConfirmation, true);

    const telemetry = sanitizeDataTelemetryEvent({
      eventName: 'property_fetch',
      feature: 'properties',
      operation: 'getById',
      durationMs: 120,
      status: 'success',
      appVersion: '1.0.0',
      extraPayload: { password: '123', keystrokes: ['a'], token: 'abc' },
    });
    assert.equal(telemetry.blockedFields.length, 3);
    assert.equal('password' in telemetry.safeEvent, false);
  });

  it('Stage 13 (RT-FE-PERFORMANCE-ARCHITECTURE-013): verifies 8 domains, 4 page groups, CWV budget, adaptive Leaflet profile, 31 units, and 38 deliverables', () => {
    assert.equal(RT_FE_PERFORMANCE_ARCHITECTURE_013_SPEC_ID, 'RT-FE-PERFORMANCE-ARCHITECTURE-013');
    assert.equal(RT_FE_FPA_8_DOMAINS.length, 8);
    assert.equal(RT_FE_FPA_4_PAGE_GROUPS.length, 4);
    assert.equal(RT_FE_FPA_CWV_TARGETS.lcpMaxMs, 2500);
    assert.equal(RT_FE_FPA_31_UNITS.length, 31);
    assert.equal(RT_FE_FPA_DELIVERABLES_38.length, 38);

    const passBudget = evaluatePagePerformanceBudget({ lcpMs: 1800, inpMs: 120, cls: 0.04, longTaskCount: 1 });
    assert.equal(passBudget.withinBudget, true);
    assert.equal(passBudget.grade, 'GOOD');

    const failBudget = evaluatePagePerformanceBudget({ lcpMs: 3200, inpMs: 260, cls: 0.15, longTaskCount: 5 });
    assert.equal(failBudget.withinBudget, false);
    assert.equal(failBudget.grade, 'BUDGET_VIOLATION');

    const liteProfile = resolveAdaptiveRenderingProfile({ deviceMemoryGb: 2, reducedMotion: true, markerCount: 500, zoomLevel: 10 });
    assert.equal(liteProfile.adaptiveMode, 'Lite');
    assert.equal(liteProfile.markerStrategy, 'aggregated');
    assert.equal(liteProfile.animationsEnabled, false);
  });

  it('Stage 13 Modularization (RT-FE-FEATURE-ARCHITECTURE-013): verifies 51 features, cycle detection, import boundaries, flag/RBAC separation, agent boundaries, and 36 deliverables', () => {
    assert.equal(RT_FE_FEATURE_ARCHITECTURE_013_SPEC_ID, 'RT-FE-FEATURE-ARCHITECTURE-013');
    assert.equal(RT_FEAT_ARCHITECTURE_LEVELS_5.length, 5);
    assert.equal(RT_FEAT_DOMAINS_8_51_FEATURES.length, 8);
    const totalFeatures = RT_FEAT_DOMAINS_8_51_FEATURES.reduce((acc, g) => acc + g.features.length, 0);
    assert.equal(totalFeatures, 51);
    assert.equal(RT_FEAT_INTERNAL_LAYERS_6.length, 6);
    assert.equal(RT_FEAT_COMMUNICATION_PATTERNS_4.length, 4);
    assert.equal(RT_FEAT_LIFECYCLE_STATUSES_7.length, 7);
    assert.equal(RT_FEAT_TEAM_OWNERSHIP_8.length, 8);
    assert.equal(RT_FEAT_MIGRATION_PHASES_6.length, 6);
    assert.equal(RT_FEAT_EXECUTION_STEPS_36.length, 36);
    assert.equal(RT_FEAT_DELIVERABLES_36.length, 36);

    assert.equal(validateFeatureImportBoundary({ importerLayer: 'feature', importerFeature: 'valuation', importPath: '@/features/properties/public' }).allowed, true);
    assert.equal(validateFeatureImportBoundary({ importerLayer: 'feature', importerFeature: 'valuation', importPath: '@/features/properties/data/repositories/property.repository' }).ruleViolated, 'DIRECT_INTERNAL_IMPORT_FORBIDDEN');
    assert.equal(validateFeatureImportBoundary({ importerLayer: 'shared', importPath: '@/features/properties/public' }).ruleViolated, 'SHARED_MUST_NOT_DEPEND_ON_FEATURE');

    assert.equal(detectFeatureDependencyCycles(RT_FEAT_SAMPLE_DEPENDENCY_REGISTRY).hasCycle, false);
    const cyclic = detectFeatureDependencyCycles([
      ...RT_FEAT_SAMPLE_DEPENDENCY_REGISTRY,
      { sourceFeature: 'properties', targetFeature: 'valuation', dependencyType: 'contract', required: true, reason: 'Bad reverse edge' },
    ]);
    assert.equal(cyclic.hasCycle, true);
    assert.ok(cyclic.cyclePath.includes('valuation') && cyclic.cyclePath.includes('properties'));

    const adminBlocked = evaluateFeatureAccessAndFlag({ featureStatus: 'active', accessScope: 'administrative', flagEnabled: true, userAuthenticated: true, isAdmin: false });
    assert.equal(adminBlocked.accessible, false);
    assert.equal(adminBlocked.includedInPublicBundle, false);

    const agentBoundary = { allowedPaths: ['src/features/valuation/'], restrictedPaths: ['src/app/router/', 'src/shared/auth/'] };
    assert.equal(validateAgentTaskBoundary(agentBoundary, 'src/features/valuation/domain/rules.ts').permitted, true);
    assert.equal(validateAgentTaskBoundary(agentBoundary, 'src/app/router/routes.ts').permitted, false);

    assert.equal(evaluateContractChangeCompatibility({ removesPublicField: true, hasNewContractVersion: false }).allowedToMerge, false);
    assert.equal(evaluateContractChangeCompatibility({ addsOptionalField: true }).allowedToMerge, true);

    assert.equal(RT_FEA_7_GROUPS_42_FEATURES.reduce((n, g) => n + g.items.length, 0), 42);
    assert.equal(RT_FEA_ENTITY_OWNERSHIP_11.length, 11);
    assert.equal(RT_FEA_EXTERNAL_ADAPTERS_7.length, 7);
    assert.equal(RT_FEA_ERROR_BOUNDARIES_4.length, 4);
    assert.equal(RT_FEA_DOCS_12.length, 12);
    assert.equal(RT_FEA_EXECUTION_STEPS_24.length, 24);
    assert.equal(RT_FEA_DELIVERABLES_27.length, 27);
    assert.equal(RT_FE_STAGE14_BRIDGE_SPEC_ID, 'RT-FE-NAVIGATION-WORKSPACE-014');

    assert.equal(validateFeatureNamingStandard({ featureId: 'FEAT-PROP-001', folderName: 'market-intelligence', eventName: 'property.updated' }).valid, true);
    assert.equal(validateFeatureNamingStandard({ featureId: 'BAD', folderName: 'module1', eventName: 'badEvent' }).valid, false);
    assert.equal(evaluateEntityOwnershipMutation({ entity: 'Property', actingModule: 'Valuation', action: 'direct_repository_write' }).allowed, false);
    assert.equal(evaluateEntityOwnershipMutation({ entity: 'Property', actingModule: 'Valuation', action: 'read_via_contract' }).allowed, true);
  });
});

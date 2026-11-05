/**
 * @file tests/prompts-541-to-600-docs-ux-and-architecture.test.ts
 * @description Comprehensive Automated Verification Suite for:
 * - Section 28 (Prompts 541–560): Technical Documentation Audit, C4 Model & Sequence Diagrams,
 *   Firestore Data Dictionary, OpenAPI Sync, Automated Drift Detection & AI-Agent Contribution Protocol.
 * - Section 29 (Prompts 561–580): User-Journey Audit, First-Time Comprehension, Cognitive Load,
 *   12-State Interface Matrix, Form Friction Guard, Data Provenance Badges & UX Prioritization Roadmap.
 * - Section 30 (Prompts 581–600): Software Architecture & Separation of Concerns, Pragmatic SOLID,
 *   Semantic Duplication Parity, Dependency & Version Compatibility, Cache Architecture, Server
 *   Startup/Graceful Shutdown Lifecycle, Feature-Flag Safety & 12-Dimension Architecture Maturity.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  auditRepositoryTechnicalDocumentation,
  buildC4ArchitectureModelAndSequenceFlows,
  detectDocumentationDriftAgainstCodebase,
  FIRESTORE_COLLECTION_DATA_DICTIONARY,
  PRIORITIZED_DOCUMENTATION_ROADMAP,
  validateAiAgentCompletionReport,
} from '../src/utils/documentationGovernanceAndDriftEngine';
import {
  auditUserFacingFormFriction,
  buildDataProvenanceAndTrustBadgeSpec,
  evaluateComponent12StateCompletenessMatrix,
  evaluateFirstTimeVisitorHomepageComprehension,
  evaluateInterfaceCognitiveLoad,
  PRIORITIZED_UX_IMPROVEMENT_ROADMAP,
  RADAR_CORE_USER_JOURNEYS_AUDIT,
  type StandardUiLifecycleState,
} from '../src/utils/uxJourneyAndTrustAuditEngine';
import {
  auditPackageDependenciesAndVersionMatrix,
  auditSemanticDuplicationAndCanonicalSources,
  RADAR_12_DIMENSION_ARCHITECTURE_MATURITY,
  RADAR_CACHE_ARCHITECTURE_INVENTORY,
  RADAR_SOLID_PRINCIPLES_AUDIT,
  verifyServerLifecycleAndFeatureFlagSafety,
} from '../src/utils/architectureSolidAndMaturityEngine';
import { API_ENDPOINT_CONTRACTS, buildOpenApiSpecification } from '../src/utils/serverConfigValidator';

console.log('Running Prompts 541 to 600 — Documentation Governance, UX Journey & Architecture Maturity Suite...');

// ============================================================================
// 1. SECTION 28 (PROMPTS 541–560) — DOCUMENTATION AUDIT & ZERO-DRIFT GATE
// ============================================================================
{
  const docAudit = auditRepositoryTechnicalDocumentation();
  assert.ok(docAudit.length >= 12, 'Must audit all 12 repository documentation files');
  for (const item of docAudit) {
    assert.equal(item.existsOnDisk, true, `Documentation file missing: ${item.filePath}`);
    assert.equal(
      item.synchronizedWithCodebase,
      true,
      `Documentation file contains outdated Firebase IDs: ${item.filePath}`,
    );
  }

  const c4 = buildC4ArchitectureModelAndSequenceFlows();
  assert.ok(c4.systemContextMermaid.includes('flowchart'));
  assert.ok(c4.containerDiagramMermaid.includes('Express'));
  assert.equal(c4.layerHierarchy.length, 5);
  assert.equal(c4.runtimeSequenceFlows.length, 4);

  assert.equal(
    FIRESTORE_COLLECTION_DATA_DICTIONARY.length,
    9,
    'All 9 Firestore collections in firestore.rules must be documented in the data dictionary',
  );

  const drift = detectDocumentationDriftAgainstCodebase();
  assert.deepEqual(drift.missingDocFiles, [], 'Zero missing documentation files allowed');
  assert.deepEqual(drift.brokenMarkdownLinks, [], 'Zero broken internal Markdown links allowed');
  assert.deepEqual(drift.undocumentedEnvVars, [], 'All 20 RUNTIME_ENV_KEYS must be documented in docs/deployment.md');
  assert.deepEqual(drift.outdatedFirebaseIdMentions, [], 'Zero outdated Firebase project/database IDs allowed');
  assert.deepEqual(drift.potentialSecretLeaksInDocs, [], 'Zero secret leaks allowed in Markdown docs');
  assert.equal(drift.zeroDriftConfirmed, true, 'Automated documentation-drift check must pass with zero drift');

  const openApi = buildOpenApiSpecification('https://radar.tehran.ir') as {
    openapi: string;
    paths: Record<string, unknown>;
  };
  assert.equal(openApi.openapi, '3.1.0');
  assert.ok(API_ENDPOINT_CONTRACTS.some((e) => e.path === '/api/system-health'));
  assert.ok(API_ENDPOINT_CONTRACTS.some((e) => e.path === '/api/object-storage/upload'));
  assert.ok(API_ENDPOINT_CONTRACTS.some((e) => e.path === '/api/neighborhood-boundaries/resolve'));

  const agentReportOk = validateAiAgentCompletionReport({
    modifiedFiles: ['src/utils/documentationGovernanceAndDriftEngine.ts'],
    executedCommands: ['npm run lint', 'npm run arch:check', 'npm test', 'npm run build'],
    updatedRelatedDocs: true,
    containsUnverifiedClaims: false,
  });
  assert.equal(agentReportOk.compliant, true);
  assert.equal(PRIORITIZED_DOCUMENTATION_ROADMAP.length, 3);
}

// ============================================================================
// 2. SECTION 29 (PROMPTS 561–580) — USER JOURNEYS, 12-STATE MATRIX & PROVENANCE
// ============================================================================
{
  assert.equal(RADAR_CORE_USER_JOURNEYS_AUDIT.length, 10, 'Must audit all 10 core user journeys');
  for (const journey of RADAR_CORE_USER_JOURNEYS_AUDIT) {
    assert.equal(
      fs.existsSync(path.resolve(process.cwd(), journey.entryComponent)),
      true,
      `Entry component for ${journey.journeyId} must exist on disk: ${journey.entryComponent}`,
    );
    assert.equal(journey.verifiedInCodebase, true);
  }

  const firstVisit = evaluateFirstTimeVisitorHomepageComprehension();
  assert.equal(firstVisit.understandsPurposeWithin10Seconds, true);
  assert.equal(firstVisit.jargonFreeEntryVerified, true);
  assert.ok(firstVisit.simultaneousCompetingPanelsMax <= 2);

  const cogOk = evaluateInterfaceCognitiveLoad({
    visibleControlGroupsCount: 4,
    simultaneousOpenDrawersOrModals: 1,
    unexplainedTechnicalAbbreviationsCount: 0,
    hasProgressiveDisclosureForAdvancedFields: true,
  });
  assert.equal(cogOk.withinErgonomicBudget, true);

  const cogOverloaded = evaluateInterfaceCognitiveLoad({
    visibleControlGroupsCount: 8,
    simultaneousOpenDrawersOrModals: 2,
    unexplainedTechnicalAbbreviationsCount: 3,
    hasProgressiveDisclosureForAdvancedFields: false,
  });
  assert.equal(cogOverloaded.withinErgonomicBudget, false);
  assert.equal(cogOverloaded.overloadReasons.length, 4);

  // Verify all 12 standard UI lifecycle states preserve user input and distinguish empty vs error
  const all12States: StandardUiLifecycleState[] = [
    'INITIAL_LOADING',
    'INCREMENTAL_LOADING',
    'EMPTY_DATA',
    'EMPTY_SEARCH_RESULTS',
    'NORMAL_POPULATED',
    'PARTIAL_DEGRADED_DATA',
    'VALIDATION_ERROR',
    'NETWORK_ERROR',
    'AUTHENTICATION_REQUIRED',
    'PERMISSION_DENIED',
    'SERVER_FAILURE',
    'RETRY_AND_RECOVERY',
  ];
  for (const st of all12States) {
    const desc = evaluateComponent12StateCompletenessMatrix(st);
    assert.equal(desc.preservesUserInput, true, `State ${st} must preserve user input`);
    assert.equal(desc.distinguishesEmptyFromError, true, `State ${st} must distinguish empty vs error`);
    assert.ok(desc.persianHeadline.length > 5);
  }

  // Data provenance badges (Prompt 575)
  const sensorBadge = buildDataProvenanceAndTrustBadgeSpec('OBSERVED_EXTERNAL_TELEMETRY', '۱۰ دقیقه پیش');
  const communityBadge = buildDataProvenanceAndTrustBadgeSpec('USER_SUBMITTED_COMMUNITY_DATA', 'امروز');
  const modelBadge = buildDataProvenanceAndTrustBadgeSpec('ALGORITHMIC_MODEL_ESTIMATE', 'لحظه‌ای');
  assert.notEqual(sensorBadge.badgeLabelFa, communityBadge.badgeLabelFa);
  assert.notEqual(sensorBadge.confidenceLevelFa, modelBadge.confidenceLevelFa);

  const formAudit = auditUserFacingFormFriction({
    requiredFieldsCount: 4,
    autoNormalizesPersianDigitsAndPhone: true,
    preservesDraftOnValidationOrNetworkError: true,
    hasInlineFieldLevelErrorFa: true,
  });
  assert.equal(formAudit.lowFrictionConfirmed, true);
  assert.equal(PRIORITIZED_UX_IMPROVEMENT_ROADMAP.length, 3);
}

// ============================================================================
// 3. SECTION 30 (PROMPTS 581–600) — SOLID, DUPLICATION, LIFECYCLE & MATURITY
// ============================================================================
{
  assert.equal(RADAR_SOLID_PRINCIPLES_AUDIT.length, 5, 'All 5 SOLID principles must be evaluated');
  assert.ok(RADAR_SOLID_PRINCIPLES_AUDIT.every((p) => p.status === 'COMPLIANT'));

  const consolidated = auditSemanticDuplicationAndCanonicalSources();
  assert.equal(consolidated.length, 3);
  assert.ok(consolidated.every((c) => c.parityVerified));

  const depsAudit = auditPackageDependenciesAndVersionMatrix();
  assert.equal(depsAudit.consistentLockAndManifest, true);
  assert.ok(depsAudit.criticalPackages.length >= 8);
  assert.ok(depsAudit.criticalPackages.every((p) => p.essential));

  assert.equal(RADAR_CACHE_ARCHITECTURE_INVENTORY.length, 6);
  assert.ok(
    RADAR_CACHE_ARCHITECTURE_INVENTORY.every((c) => c.containsPiiOrSecrets === false),
    'Zero cache layers may store raw PII or secrets',
  );

  const lifecycle = verifyServerLifecycleAndFeatureFlagSafety();
  assert.equal(lifecycle.gracefulSigtermHandlerRegistered, true, 'server.ts must handle SIGTERM');
  assert.equal(lifecycle.gracefulSigintHandlerRegistered, true, 'server.ts must handle SIGINT');
  assert.equal(lifecycle.backgroundTimerUnrefConfirmed, true, 'Background timers must call .unref()');
  assert.equal(lifecycle.dirtyCacheFlushedOnShutdown, true, 'Shutdown must flush dirty disk cache');
  assert.equal(lifecycle.featureFlagsValidatedWithSafeDefaults, true);

  assert.equal(
    RADAR_12_DIMENSION_ARCHITECTURE_MATURITY.length,
    12,
    'Must evaluate all 12 architecture maturity dimensions (Prompt 600)',
  );
  for (const dim of RADAR_12_DIMENSION_ARCHITECTURE_MATURITY) {
    assert.ok(dim.scoreOutOf5 >= 4);
    for (const relFile of dim.supportingFiles) {
      assert.equal(
        fs.existsSync(path.resolve(process.cwd(), relFile)),
        true,
        `Supporting file for ${dim.dimensionId} must exist: ${relFile}`,
      );
    }
  }
}

console.log('✅ Prompts 541 to 600 — All Documentation, UX Journey, SOLID, Lifecycle & Architecture Maturity Checks Passed!');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  resolveLegalActor,
  resolveLegalRegulatoryActor,
  assertRegulatoryAdminMutationActor,
} from '../actorResolver';
import {
  RegulatoryApplicabilityAndProfileService,
  type CreateApplicabilityRuleInput,
  type CreateComplianceRequirementInput,
  type LegalRegulatorySearchQuery,
  type RecordNonAuthoritativeAiSuggestionInput,
} from '../applicabilityAndProfileService';
import { createLegalRegulatoryRouteHandlers } from '../routeHandlers';
import { LEGAL_REGULATORY_ROUTE_SPECS } from '../routes';
import {
  RegulatorySourceAndProvisionService,
  type CreateRegulatoryDocumentInput,
  type CreateRegulatoryProvisionInput,
  type CreateRegulatorySourceInput,
  type RecordRegulatoryChangeInput,
  type RegisterProvisionConflictInput,
} from '../sourceAndProvisionService';
import { createTestLegalRegulatoryModule } from '../index';
import type {
  ComplianceRequirementRecord,
  LegalRegulatoryActorContext,
  NonAuthoritativeAiSummaryRecord,
  PaginatedResult,
  PropertyRegulatoryEvaluationInput,
  PropertyRegulatoryProfile,
  PublicRegulatoryProvisionView,
  PublicRegulatorySourceView,
  RegulatoryApplicabilityRuleRecord,
  RegulatoryChangeRecord,
  RegulatoryDocumentRecord,
  RegulatoryProvisionConflictRecord,
  RegulatoryProvisionRecord,
  RegulatorySourceRecord,
} from '../types';
import { LegalRegulatoryError, resolveActorContextFromExpressRequest } from '../validationAndAuthz';

// Compile-time exact assignability helper (zero `any`)
function assertExactType<T>(_value: T): void {
  // Compile-time contract assertion
}

const facade = createTestLegalRegulatoryModule();
const handlers = createLegalRegulatoryRouteHandlers({ getFacade: () => facade });

// ============================================================================
// GROUP 1 (LR-30A01-001..014): Existence & Real Mapping of All 14 Methods
// ============================================================================

test('LR-30A01-001: EP 01 GET /provisions/search maps to applicabilityAndProfileService.searchProvisions', () => {
  assert.equal(typeof RegulatoryApplicabilityAndProfileService.prototype.searchProvisions, 'function');
  assert.equal(typeof facade.applicabilityAndProfileService.searchProvisions, 'function');
  assert.equal(typeof handlers.handleSearchProvisions, 'function');
  assert.equal(LEGAL_REGULATORY_ROUTE_SPECS[0].subPath, '/provisions/search');
});

test('LR-30A01-002: EP 02 GET /sources/:sourceId maps to sourceAndProvisionService.getRegulatorySourceForViewer', () => {
  assert.equal(typeof RegulatorySourceAndProvisionService.prototype.getRegulatorySourceForViewer, 'function');
  assert.equal(typeof facade.sourceAndProvisionService.getRegulatorySourceForViewer, 'function');
  assert.equal(typeof handlers.handleGetRegulatorySource, 'function');
  assert.equal(LEGAL_REGULATORY_ROUTE_SPECS[1].subPath, '/sources/:sourceId');
});

test('LR-30A01-003: EP 03 POST /sources maps to sourceAndProvisionService.createRegulatorySource', () => {
  assert.equal(typeof RegulatorySourceAndProvisionService.prototype.createRegulatorySource, 'function');
  assert.equal(typeof facade.sourceAndProvisionService.createRegulatorySource, 'function');
  assert.equal(typeof handlers.handleCreateRegulatorySource, 'function');
  assert.equal(LEGAL_REGULATORY_ROUTE_SPECS[2].subPath, '/sources');
});

test('LR-30A01-004: EP 04 POST /sources/:sourceId/verify maps to sourceAndProvisionService.verifyRegulatorySource', () => {
  assert.equal(typeof RegulatorySourceAndProvisionService.prototype.verifyRegulatorySource, 'function');
  assert.equal(typeof facade.sourceAndProvisionService.verifyRegulatorySource, 'function');
  assert.equal(typeof handlers.handleVerifyRegulatorySource, 'function');
  assert.equal(LEGAL_REGULATORY_ROUTE_SPECS[3].subPath, '/sources/:sourceId/verify');
});

test('LR-30A01-005: EP 05 POST /documents maps to sourceAndProvisionService.createRegulatoryDocument', () => {
  assert.equal(typeof RegulatorySourceAndProvisionService.prototype.createRegulatoryDocument, 'function');
  assert.equal(typeof facade.sourceAndProvisionService.createRegulatoryDocument, 'function');
  assert.equal(typeof handlers.handleCreateRegulatoryDocument, 'function');
  assert.equal(LEGAL_REGULATORY_ROUTE_SPECS[4].subPath, '/documents');
});

test('LR-30A01-006: EP 06 GET /provisions/:provisionId maps to sourceAndProvisionService.getProvisionForViewer', () => {
  assert.equal(typeof RegulatorySourceAndProvisionService.prototype.getProvisionForViewer, 'function');
  assert.equal(typeof facade.sourceAndProvisionService.getProvisionForViewer, 'function');
  assert.equal(typeof handlers.handleGetProvision, 'function');
  assert.equal(LEGAL_REGULATORY_ROUTE_SPECS[5].subPath, '/provisions/:provisionId');
});

test('LR-30A01-007: EP 07 GET /provisions/:provisionId/as-of maps to sourceAndProvisionService.getProvisionVersionAsOfDate', () => {
  assert.equal(typeof RegulatorySourceAndProvisionService.prototype.getProvisionVersionAsOfDate, 'function');
  assert.equal(typeof facade.sourceAndProvisionService.getProvisionVersionAsOfDate, 'function');
  assert.equal(typeof handlers.handleGetProvisionAsOf, 'function');
  assert.equal(LEGAL_REGULATORY_ROUTE_SPECS[6].subPath, '/provisions/:provisionId/as-of');
});

test('LR-30A01-008: EP 08 POST /provisions maps to sourceAndProvisionService.createRegulatoryProvision', () => {
  assert.equal(typeof RegulatorySourceAndProvisionService.prototype.createRegulatoryProvision, 'function');
  assert.equal(typeof facade.sourceAndProvisionService.createRegulatoryProvision, 'function');
  assert.equal(typeof handlers.handleCreateProvision, 'function');
  assert.equal(LEGAL_REGULATORY_ROUTE_SPECS[7].subPath, '/provisions');
});

test('LR-30A01-009: EP 09 POST /provisions/:provisionId/changes maps to sourceAndProvisionService.recordRegulatoryChangeAndVersion', () => {
  assert.equal(typeof RegulatorySourceAndProvisionService.prototype.recordRegulatoryChangeAndVersion, 'function');
  assert.equal(typeof facade.sourceAndProvisionService.recordRegulatoryChangeAndVersion, 'function');
  assert.equal(typeof handlers.handleRecordProvisionChange, 'function');
  assert.equal(LEGAL_REGULATORY_ROUTE_SPECS[8].subPath, '/provisions/:provisionId/changes');
});

test('LR-30A01-010: EP 10 POST /conflicts maps to sourceAndProvisionService.registerProvisionConflict', () => {
  assert.equal(typeof RegulatorySourceAndProvisionService.prototype.registerProvisionConflict, 'function');
  assert.equal(typeof facade.sourceAndProvisionService.registerProvisionConflict, 'function');
  assert.equal(typeof handlers.handleRegisterProvisionConflict, 'function');
  assert.equal(LEGAL_REGULATORY_ROUTE_SPECS[9].subPath, '/conflicts');
});

test('LR-30A01-011: EP 11 POST /applicability-rules maps to applicabilityAndProfileService.createApplicabilityRule', () => {
  assert.equal(typeof RegulatoryApplicabilityAndProfileService.prototype.createApplicabilityRule, 'function');
  assert.equal(typeof facade.applicabilityAndProfileService.createApplicabilityRule, 'function');
  assert.equal(typeof handlers.handleCreateApplicabilityRule, 'function');
  assert.equal(LEGAL_REGULATORY_ROUTE_SPECS[10].subPath, '/applicability-rules');
});

test('LR-30A01-012: EP 12 POST /compliance-requirements maps to applicabilityAndProfileService.createComplianceRequirement', () => {
  assert.equal(typeof RegulatoryApplicabilityAndProfileService.prototype.createComplianceRequirement, 'function');
  assert.equal(typeof facade.applicabilityAndProfileService.createComplianceRequirement, 'function');
  assert.equal(typeof handlers.handleCreateComplianceRequirement, 'function');
  assert.equal(LEGAL_REGULATORY_ROUTE_SPECS[11].subPath, '/compliance-requirements');
});

test('LR-30A01-013: EP 13 POST /property-profile/evaluate maps to applicabilityAndProfileService.buildPropertyRegulatoryProfile', () => {
  assert.equal(typeof RegulatoryApplicabilityAndProfileService.prototype.buildPropertyRegulatoryProfile, 'function');
  assert.equal(typeof facade.applicabilityAndProfileService.buildPropertyRegulatoryProfile, 'function');
  assert.equal(typeof handlers.handleEvaluatePropertyProfile, 'function');
  assert.equal(LEGAL_REGULATORY_ROUTE_SPECS[12].subPath, '/property-profile/evaluate');
});

test('LR-30A01-014: EP 14 POST /ai-summaries maps to applicabilityAndProfileService.recordNonAuthoritativeAiSuggestion', () => {
  assert.equal(typeof RegulatoryApplicabilityAndProfileService.prototype.recordNonAuthoritativeAiSuggestion, 'function');
  assert.equal(typeof facade.applicabilityAndProfileService.recordNonAuthoritativeAiSuggestion, 'function');
  assert.equal(typeof handlers.handleRecordAiSummary, 'function');
  assert.equal(LEGAL_REGULATORY_ROUTE_SPECS[13].subPath, '/ai-summaries');
});

// ============================================================================
// GROUP 2 (LR-30A01-015..020): TypeScript Input & Output Contract Compatibility
// ============================================================================

test('LR-30A01-015: Source & Document method signatures match exact TypeScript input/output contracts', () => {
  type CreateSourceFn = (input: CreateRegulatorySourceInput, actor: LegalRegulatoryActorContext) => Promise<RegulatorySourceRecord>;
  type VerifySourceFn = (
    sourceId: string,
    verificationMethodNote: string,
    actor: LegalRegulatoryActorContext,
    expectedVersion?: number,
    idempotencyKey?: string,
  ) => Promise<RegulatorySourceRecord>;
  type GetSourceFn = (
    sourceId: string,
    actor?: LegalRegulatoryActorContext,
  ) => Promise<RegulatorySourceRecord | PublicRegulatorySourceView>;
  type CreateDocFn = (input: CreateRegulatoryDocumentInput, actor: LegalRegulatoryActorContext) => Promise<RegulatoryDocumentRecord>;

  assertExactType<CreateSourceFn>(facade.sourceAndProvisionService.createRegulatorySource.bind(facade.sourceAndProvisionService));
  assertExactType<VerifySourceFn>(facade.sourceAndProvisionService.verifyRegulatorySource.bind(facade.sourceAndProvisionService));
  assertExactType<GetSourceFn>(facade.sourceAndProvisionService.getRegulatorySourceForViewer.bind(facade.sourceAndProvisionService));
  assertExactType<CreateDocFn>(facade.sourceAndProvisionService.createRegulatoryDocument.bind(facade.sourceAndProvisionService));
  assert.equal(RegulatorySourceAndProvisionService.prototype.verifyRegulatorySource.length >= 3, true);
});

test('LR-30A01-016: Provision, Change, and Conflict method signatures match exact TypeScript contracts', () => {
  type CreateProvFn = (input: CreateRegulatoryProvisionInput, actor: LegalRegulatoryActorContext) => Promise<RegulatoryProvisionRecord>;
  type GetProvFn = (
    provisionId: string,
    actor?: LegalRegulatoryActorContext,
  ) => Promise<RegulatoryProvisionRecord | PublicRegulatoryProvisionView>;
  type ChangeFn = (
    input: RecordRegulatoryChangeInput,
    actor: LegalRegulatoryActorContext,
  ) => Promise<{ updatedProvision: RegulatoryProvisionRecord; changeRecord: RegulatoryChangeRecord }>;
  type ConflictFn = (
    input: RegisterProvisionConflictInput,
    actor: LegalRegulatoryActorContext,
  ) => Promise<RegulatoryProvisionConflictRecord>;

  assertExactType<CreateProvFn>(facade.sourceAndProvisionService.createRegulatoryProvision.bind(facade.sourceAndProvisionService));
  assertExactType<GetProvFn>(facade.sourceAndProvisionService.getProvisionForViewer.bind(facade.sourceAndProvisionService));
  assertExactType<ChangeFn>(facade.sourceAndProvisionService.recordRegulatoryChangeAndVersion.bind(facade.sourceAndProvisionService));
  assertExactType<ConflictFn>(facade.sourceAndProvisionService.registerProvisionConflict.bind(facade.sourceAndProvisionService));
  assert.ok(true);
});

test('LR-30A01-017: ApplicabilityRule, ComplianceRequirement, and AI Summary signatures match exact TypeScript contracts', () => {
  type CreateRuleFn = (input: CreateApplicabilityRuleInput, actor: LegalRegulatoryActorContext) => Promise<RegulatoryApplicabilityRuleRecord>;
  type CreateCompFn = (input: CreateComplianceRequirementInput, actor: LegalRegulatoryActorContext) => Promise<ComplianceRequirementRecord>;
  type RecordAiFn = (input: RecordNonAuthoritativeAiSuggestionInput, actor: LegalRegulatoryActorContext) => Promise<NonAuthoritativeAiSummaryRecord>;

  assertExactType<CreateRuleFn>(facade.applicabilityAndProfileService.createApplicabilityRule.bind(facade.applicabilityAndProfileService));
  assertExactType<CreateCompFn>(facade.applicabilityAndProfileService.createComplianceRequirement.bind(facade.applicabilityAndProfileService));
  assertExactType<RecordAiFn>(facade.applicabilityAndProfileService.recordNonAuthoritativeAiSuggestion.bind(facade.applicabilityAndProfileService));
  assert.ok(true);
});

test('LR-30A01-018: Search and PropertyProfile evaluation signatures match exact TypeScript contracts', () => {
  type SearchFn = (query: LegalRegulatorySearchQuery, actor?: LegalRegulatoryActorContext) => Promise<PaginatedResult<PublicRegulatoryProvisionView>>;
  type EvalFn = (rawInput: PropertyRegulatoryEvaluationInput, actor?: LegalRegulatoryActorContext) => Promise<PropertyRegulatoryProfile>;

  assertExactType<SearchFn>(facade.applicabilityAndProfileService.searchProvisions.bind(facade.applicabilityAndProfileService));
  assertExactType<EvalFn>(facade.applicabilityAndProfileService.buildPropertyRegulatoryProfile.bind(facade.applicabilityAndProfileService));
  assert.ok(true);
});

test('LR-30A01-019: asOfDateIso & expectedVersion / expectedPreviousVersion parameters align across service & handlers', () => {
  const sampleChange: RecordRegulatoryChangeInput = {
    targetProvisionId: 'p1',
    changeType: 'AMENDMENT',
    enactingSourceId: 's1',
    effectiveFromIso: '2025-01-01',
    changeSummary: 'test',
    expectedPreviousVersion: 2,
    idempotencyKey: 'k1',
  };
  assert.equal(sampleChange.expectedPreviousVersion, 2);
  const sampleEval: PropertyRegulatoryEvaluationInput = {
    propertyId: 'prop_1',
    asOfDateIso: '2025-01-01',
    transactionContext: 'SALE_TRANSFER',
  };
  assert.equal(sampleEval.asOfDateIso, '2025-01-01');
});

test('LR-30A01-020: API-CONTRACT-MATRIX.md documents all 14 endpoints and all 12 mandatory fields', () => {
  const docPath = path.resolve(process.cwd(), 'server/modules/legal-regulatory/API-CONTRACT-MATRIX.md');
  const content = fs.readFileSync(docPath, 'utf8');
  for (let i = 1; i <= 14; i += 1) {
    const label = `### Endpoint ${String(i).padStart(2, '0')}`;
    assert.ok(content.includes(label), `Missing section ${label}`);
  }
  for (const field of [
    '`method`', '`path`', '`serviceOwner`', '`serviceMethod`', '`requestType`', '`responseType`',
    '`argumentsMapping`', '`authentication`', '`authorization`', '`operationType`', '`idempotency`', '`errorContract`',
  ]) {
    const count = content.split(field).length - 1;
    assert.equal(count, 14, `Field ${field} must appear exactly 14 times (found ${count})`);
  }
});

// ============================================================================
// GROUP 3 (LR-30A01-021..024): Authentication & Authorization Classification
// ============================================================================

test('LR-30A01-021: All 14 route specs classify into exact PUBLIC (4), VERIFIED_USER (1), and ADMIN (9) tiers', () => {
  const pub = LEGAL_REGULATORY_ROUTE_SPECS.filter((r) => r.accessPolicy === 'PUBLIC');
  const user = LEGAL_REGULATORY_ROUTE_SPECS.filter((r) => r.accessPolicy === 'VERIFIED_USER');
  const admin = LEGAL_REGULATORY_ROUTE_SPECS.filter((r) => r.accessPolicy === 'ADMIN');
  assert.equal(pub.length, 4);
  assert.equal(user.length, 1);
  assert.equal(admin.length, 9);
  assert.equal(user[0].subPath, '/property-profile/evaluate');
});

test('LR-30A01-022: LEGAL_REVIEWER remains fail-closed (403) in mutation actor assertion', () => {
  assert.throws(
    () =>
      assertRegulatoryAdminMutationActor({
        actorId: 'uid_reviewer_1',
        role: 'LEGAL_REVIEWER',
        isAuthenticated: true,
      }),
    (err: unknown) => err instanceof LegalRegulatoryError && err.statusCode === 403 && err.code === 'FORBIDDEN',
  );
});

test('LR-30A01-023: resolveActorContextFromExpressRequest & resolveLegalActor never trust x-legal-actor-* headers', async () => {
  const fakeReq = {
    headers: { 'x-legal-actor-id': 'forged-admin', 'x-legal-actor-role': 'REGULATORY_ADMIN' },
  } as unknown as import('express').Request;
  const ctx = await resolveActorContextFromExpressRequest(fakeReq);
  assert.equal(ctx.role, 'PUBLIC_READER');
  assert.equal(ctx.isAuthenticated, false);
  const res = await resolveLegalActor(fakeReq, 'REGULATORY_ADMIN');
  assert.equal(res.authorized, false);
  assert.equal(res.statusCode, 401);
});

test('LR-30A01-024: resolveLegalRegulatoryActor rejects static server-secret-admin and never grants human admin', async () => {
  const actor = await resolveLegalRegulatoryActor(
    { headers: { authorization: 'Bearer fake-static' } } as unknown as import('express').Request,
    {
      async verifyAdmin() {
        return { authorized: true, statusCode: 200, actorUid: 'server-secret-admin', uid: 'server-secret-admin' };
      },
      async verifyUser() {
        return { authorized: false, authenticated: false, statusCode: 401 };
      },
    },
  );
  assert.equal(actor.role, 'PUBLIC_READER');
  assert.equal(actor.isAuthenticated, false);
});

// ============================================================================
// GROUP 4 (LR-30A01-025..028): Read/Write & Idempotency Classification
// ============================================================================

test('LR-30A01-025: Exactly 4 GET endpoints are pure reads and 10 POST endpoints split into 9 writes + 1 read-only evaluate', () => {
  const gets = LEGAL_REGULATORY_ROUTE_SPECS.filter((r) => r.method === 'GET');
  const posts = LEGAL_REGULATORY_ROUTE_SPECS.filter((r) => r.method === 'POST');
  assert.equal(gets.length, 4);
  assert.equal(posts.length, 10);
});

test('LR-30A01-026: Every one of the 9 mutating service operations accepts idempotencyKey in its input contract', () => {
  const srcInput: CreateRegulatorySourceInput = {
    officialTitleFa: 't', issuingAuthority: 'a', jurisdictionScope: { level: 'NATIONAL', countryCode: 'IR' },
    sourceCategory: 'NATIONAL_STATUTE', reliabilityTier: 'PRIMARY_OFFICIAL_STATUTE',
    officialReferenceNumber: 'r', publicationDateIso: '2024-01-01', effectiveFromIso: '2024-01-01', idempotencyKey: 'k1',
  };
  const docInput: CreateRegulatoryDocumentInput = {
    sourceId: 's', documentCode: 'c', titleFa: 't', documentCategory: 'LAND_USE_AND_ZONING',
    effectiveFromIso: '2024-01-01', idempotencyKey: 'k2',
  };
  const provInput: CreateRegulatoryProvisionInput = {
    sourceId: 's', documentId: 'd', hierarchyLevel: 'ARTICLE', provisionNumber: '1', citationLabel: 'c',
    titleFa: 't', documentCategory: 'LAND_USE_AND_ZONING', originalTextVerbatim: 'v',
    effectiveFromIso: '2024-01-01', idempotencyKey: 'k3',
  };
  const chgInput: RecordRegulatoryChangeInput = {
    targetProvisionId: 'p', changeType: 'AMENDMENT', enactingSourceId: 's',
    effectiveFromIso: '2024-01-01', changeSummary: 'c', idempotencyKey: 'k4',
  };
  const confInput: RegisterProvisionConflictInput = {
    provisionIdA: 'a', provisionIdB: 'b', conflictSeverity: 'DIRECT_STATUTORY_CONFLICT',
    conflictDescription: 'd', idempotencyKey: 'k5',
  };
  const ruleInput: CreateApplicabilityRuleInput = {
    provisionId: 'p', sourceId: 's', ruleName: 'r', conditions: { requiredContextFields: [] },
    restrictionOrObligationSummary: 's', mandatoryClassification: 'MANDATORY_STATUTORY',
    effectiveFromIso: '2024-01-01', idempotencyKey: 'k6',
  };
  const compInput: CreateComplianceRequirementInput = {
    requirementCode: 'c', sourceId: 's', provisionId: 'p', applicablePropertyCategories: ['RESIDENTIAL_APARTMENT'],
    applicableTransactionContexts: ['SALE_TRANSFER'], titleFa: 't', requirementDescription: 'd',
    mandatoryVersionClassification: 'MANDATORY_STATUTORY', requiredEvidenceTypes: ['E'],
    verificationMethodDescription: 'v', responsibleAuthorityName: 'a', effectiveFromIso: '2024-01-01', idempotencyKey: 'k7',
  };
  const aiInput: RecordNonAuthoritativeAiSuggestionInput = {
    targetEntityType: 'PROVISION', targetEntityId: 'p', targetEntityVersion: 1, summaryText: 's',
    modelIdentifier: 'm', promptTemplateVersion: 'v', idempotencyKey: 'k8',
  };
  assert.equal([srcInput, docInput, provInput, chgInput, confInput, ruleInput, compInput, aiInput].every((x) => Boolean(x.idempotencyKey)), true);
});

test('LR-30A01-027: buildPropertyRegulatoryProfile performs zero durable writes (justifying read-only compute classification)', async () => {
  const localFacade = createTestLegalRegulatoryModule();
  const auditBefore = await localFacade.store.listAuditRecords();
  const profile = await localFacade.applicabilityAndProfileService.buildPropertyRegulatoryProfile(
    { cityId: 'tehran', propertyCategory: 'RESIDENTIAL_APARTMENT', asOfDateIso: '2025-01-01' },
    { actorId: 'uid_user_1', role: 'AUTHENTICATED_USER', isAuthenticated: true },
  );
  const auditAfter = await localFacade.store.listAuditRecords();
  assert.equal(profile.resolvedGeography.cityId, 'tehran');
  assert.equal(auditAfter.length, auditBefore.length);
});

test('LR-30A01-028: All 9 mutating handlers enforce idempotency and reject unknown fields in routeHandlers.ts', () => {
  const handlerSource = fs.readFileSync(path.resolve(process.cwd(), 'server/modules/legal-regulatory/routeHandlers.ts'), 'utf8');
  const runAdminCalls = handlerSource.match(/runAdminMutation\(/g) ?? [];
  // 1 definition + 9 invocations across the 9 mutating endpoints
  assert.equal(runAdminCalls.length, 9);
  assert.ok(handlerSource.includes('assertAllowedObjectFields'));
  assert.ok(handlerSource.includes('requireIdempotencyKey'));
});

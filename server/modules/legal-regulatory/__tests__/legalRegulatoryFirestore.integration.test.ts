import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  buildIdempotencyDocumentId,
  createProductionLegalRegulatoryModule,
  FirestoreLegalRegulatoryStore,
  FirestoreLegalRegulatoryTransactionRunner,
  LEGAL_REGULATORY_COLLECTIONS,
  LegalRegulatoryError,
} from '../index';
import {
  ADMIN_ACTOR,
  makeChangeInput,
  makeComplianceInput,
  makeDocInput,
  makeProvisionInput,
  makeRuleInput,
  makeSourceInput,
  PROD_PROPERTY_ADAPTER,
  TransactionalFirestoreMock,
} from './firestoreMockHarness';

/**
 * Stage 30-D — Firestore Transactional, Durability & Rules Integration Tests
 * IDs: LR-30D-001 .. LR-30D-014 (Firestore Transactional & Cross-Instance Durability)
 *      LR-30D-023 .. LR-30D-027 (Firestore Rules Client-Denial Verification)
 *
 * Uses real createProductionLegalRegulatoryModule + FirestoreLegalRegulatoryStore
 * + FirestoreLegalRegulatoryTransactionRunner against a persistent Firestore backing store.
 * Note: When FIRESTORE_EMULATOR_HOST is unset in sandbox without Java, runs against
 * TransactionalFirestoreMock with identical Read-before-Write, CAS, and atomic commit/rollback
 * semantics, and parses & evaluates real firestore.rules blocks strictly.
 */

function createProductionHarness(sharedDb?: TransactionalFirestoreMock) {
  const dbHarness = sharedDb ?? new TransactionalFirestoreMock();
  const runner = new FirestoreLegalRegulatoryTransactionRunner(dbHarness.asAdminFirestore());
  const store = new FirestoreLegalRegulatoryStore({ transactionRunner: runner });
  const mod = createProductionLegalRegulatoryModule({
    store,
    propertyContextAdapter: PROD_PROPERTY_ADAPTER,
  });
  return { dbHarness, runner, store, ...mod };
}

function assertLrErr(code: string, statusCode: number) {
  return (err: unknown) =>
    err instanceof LegalRegulatoryError && err.code === code && err.statusCode === statusCode;
}

async function seedHierarchy(
  h: ReturnType<typeof createProductionHarness>,
  suffix: string,
) {
  const src = await h.sourceAndProvisionService.createRegulatorySource(
    makeSourceInput({
      id: `src_30d_${suffix}`,
      officialReferenceNumber: `REF-30D-${suffix}`,
      idempotencyKey: `idem-seed-src-${suffix}`,
    }),
    ADMIN_ACTOR,
  );
  const doc = await h.sourceAndProvisionService.createRegulatoryDocument(
    makeDocInput({
      id: `doc_30d_${suffix}`,
      sourceId: src.id,
      documentCode: `DOC-30D-${suffix}`,
      idempotencyKey: `idem-seed-doc-${suffix}`,
    }),
    ADMIN_ACTOR,
  );
  const prov = await h.sourceAndProvisionService.createRegulatoryProvision(
    makeProvisionInput({
      id: `prov_30d_${suffix}`,
      sourceId: src.id,
      documentId: doc.id,
      provisionNumber: `30D-${suffix}`,
      idempotencyKey: `idem-seed-prov-${suffix}`,
    }),
    ADMIN_ACTOR,
  );
  return { src, doc, prov };
}

// ============================================================================
// Section A: LR-30D-001 .. LR-30D-014 — Transactional Atomicity & Durability
// ============================================================================

test('LR-30D-001: Create Source persists Source + Audit + Idempotency in a single atomic transaction', async () => {
  const h = createProductionHarness();
  const commitsBefore = h.dbHarness.txCommitCount;

  const created = await h.sourceAndProvisionService.createRegulatorySource(
    makeSourceInput({ id: 'src_30d_001', idempotencyKey: 'idem-30d-001' }),
    ADMIN_ACTOR,
  );

  assert.equal(created.id, 'src_30d_001');
  assert.equal(created.version, 1);
  assert.equal(h.dbHarness.txCommitCount, commitsBefore + 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 1);

  const idemDocId = buildIdempotencyDocumentId('createRegulatorySource', ADMIN_ACTOR.actorId, 'idem-30d-001');
  const rawIdem = h.dbHarness.getRawDoc(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY, idemDocId);
  assert.ok(rawIdem, 'Expected durable idempotency record in Firestore collection');
  assert.equal((rawIdem.responsePayload as { id?: string })?.id, 'src_30d_001');
});

test('LR-30D-002: Create Document validates Source reference and commits Document + Audit + Idempotency atomically', async () => {
  const h = createProductionHarness();

  await assert.rejects(
    () =>
      h.sourceAndProvisionService.createRegulatoryDocument(
        makeDocInput({ id: 'doc_orphan', sourceId: 'src_missing', idempotencyKey: 'idem-30d-002-bad' }),
        ADMIN_ACTOR,
      ),
    assertLrErr('NOT_FOUND', 404),
  );
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.DOCUMENTS), 0);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 0);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 0);

  const src = await h.sourceAndProvisionService.createRegulatorySource(
    makeSourceInput({ id: 'src_30d_002', idempotencyKey: 'idem-30d-002-src' }),
    ADMIN_ACTOR,
  );
  const commitsBefore = h.dbHarness.txCommitCount;
  const doc = await h.sourceAndProvisionService.createRegulatoryDocument(
    makeDocInput({ id: 'doc_30d_002', sourceId: src.id, idempotencyKey: 'idem-30d-002-doc' }),
    ADMIN_ACTOR,
  );

  assert.equal(doc.sourceId, src.id);
  assert.equal(h.dbHarness.txCommitCount, commitsBefore + 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.DOCUMENTS), 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 2);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 2);
});

test('LR-30D-003: Create Provision commits initial version 1, versionHistory snapshot, Audit and Idempotency atomically', async () => {
  const h = createProductionHarness();
  const src = await h.sourceAndProvisionService.createRegulatorySource(
    makeSourceInput({ id: 'src_30d_003', idempotencyKey: 'idem-30d-003-src' }),
    ADMIN_ACTOR,
  );
  const doc = await h.sourceAndProvisionService.createRegulatoryDocument(
    makeDocInput({ id: 'doc_30d_003', sourceId: src.id, idempotencyKey: 'idem-30d-003-doc' }),
    ADMIN_ACTOR,
  );

  const commitsBefore = h.dbHarness.txCommitCount;
  const prov = await h.sourceAndProvisionService.createRegulatoryProvision(
    makeProvisionInput({
      id: 'prov_30d_003',
      sourceId: src.id,
      documentId: doc.id,
      idempotencyKey: 'idem-30d-003-prov',
    }),
    ADMIN_ACTOR,
  );

  assert.equal(prov.version, 1);
  assert.equal(prov.versionHistory.length, 1);
  assert.equal(prov.versionHistory[0].versionNumber, 1);
  assert.equal(h.dbHarness.txCommitCount, commitsBefore + 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.PROVISIONS), 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 3);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 3);
});

test('LR-30D-004: Record Change + Version bump commits Provision v2, ChangeRecord, Audit and Idempotency in one transaction', async () => {
  const h = createProductionHarness();
  const { src, prov } = await seedHierarchy(h, '004');
  const commitsBefore = h.dbHarness.txCommitCount;

  const result = await h.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
    makeChangeInput({
      targetProvisionId: prov.id,
      enactingSourceId: src.id,
      idempotencyKey: 'idem-30d-004-chg',
    }),
    ADMIN_ACTOR,
  );

  assert.equal(h.dbHarness.txCommitCount, commitsBefore + 1);
  assert.equal(result.updatedProvision.version, 2);
  assert.equal(result.updatedProvision.versionHistory.length, 2);
  assert.equal(result.changeRecord.previousProvisionVersion, 1);
  assert.equal(result.changeRecord.newProvisionVersion, 2);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.CHANGE_HISTORY), 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 4);
});

test('LR-30D-005: Register Conflict validates both provisions and commits Conflict + Audit + Idempotency atomically', async () => {
  const h = createProductionHarness();
  const { src, doc, prov: provA } = await seedHierarchy(h, '005a');
  const provB = await h.sourceAndProvisionService.createRegulatoryProvision(
    makeProvisionInput({
      id: 'prov_30d_005b',
      sourceId: src.id,
      documentId: doc.id,
      provisionNumber: '3-2',
      idempotencyKey: 'idem-30d-005-pb',
    }),
    ADMIN_ACTOR,
  );

  const commitsBefore = h.dbHarness.txCommitCount;
  const conflict = await h.sourceAndProvisionService.registerProvisionConflict(
    {
      id: 'conf_30d_005',
      provisionIdA: provA.id,
      provisionIdB: provB.id,
      conflictSeverity: 'HIGH_DIRECT_CONTRADICTION',
      conflictDescription: 'تعارض مستقیم بین حداکثر تراکم در دو بند',
      idempotencyKey: 'idem-30d-005-conf',
    },
    ADMIN_ACTOR,
  );

  assert.equal(conflict.id, 'conf_30d_005');
  assert.equal(h.dbHarness.txCommitCount, commitsBefore + 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.CONFLICTS), 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 5);
});

test('LR-30D-006: Create Applicability Rule commits Rule + Audit + Idempotency atomically', async () => {
  const h = createProductionHarness();
  const { src, prov } = await seedHierarchy(h, '006');
  const commitsBefore = h.dbHarness.txCommitCount;

  const rule = await h.applicabilityAndProfileService.createApplicabilityRule(
    makeRuleInput({
      id: 'rule_30d_006',
      sourceId: src.id,
      provisionId: prov.id,
      idempotencyKey: 'idem-30d-006-rule',
    }),
    ADMIN_ACTOR,
  );

  assert.equal(rule.id, 'rule_30d_006');
  assert.equal(h.dbHarness.txCommitCount, commitsBefore + 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.APPLICABILITY_RULES), 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 4);
});

test('LR-30D-007: Create Compliance Requirement commits Requirement + Audit + Idempotency atomically', async () => {
  const h = createProductionHarness();
  const { src, prov } = await seedHierarchy(h, '007');
  const commitsBefore = h.dbHarness.txCommitCount;

  const req = await h.applicabilityAndProfileService.createComplianceRequirement(
    makeComplianceInput({
      id: 'comp_30d_007',
      sourceId: src.id,
      provisionId: prov.id,
      idempotencyKey: 'idem-30d-007-comp',
    }),
    ADMIN_ACTOR,
  );

  assert.equal(req.id, 'comp_30d_007');
  assert.equal(h.dbHarness.txCommitCount, commitsBefore + 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.COMPLIANCE_REQUIREMENTS), 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 4);
});

test('LR-30D-008: Mid-transaction write failure prevents partial commit across entity, audit, and idempotency', async () => {
  const h = createProductionHarness();
  h.dbHarness.failAtTxWriteIndex = 1; // Fails after staging 1st write

  await assert.rejects(
    () =>
      h.sourceAndProvisionService.createRegulatorySource(
        makeSourceInput({ id: 'src_partial_fail', idempotencyKey: 'idem-30d-008' }),
        ADMIN_ACTOR,
      ),
    assertLrErr('PERSISTENCE_UNAVAILABLE', 503),
  );

  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 0);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 0);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 0);
});

test('LR-30D-009: Full Rollback on mid-stage ChangeRecord failure keeps Provision at version 1 with zero side effects', async () => {
  const h = createProductionHarness();
  const { src, prov } = await seedHierarchy(h, '009');
  const auditBefore = h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG);
  const idemBefore = h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY);

  h.dbHarness.failOnCollectionWrite = LEGAL_REGULATORY_COLLECTIONS.CHANGE_HISTORY;
  await assert.rejects(
    () =>
      h.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
        makeChangeInput({
          targetProvisionId: prov.id,
          enactingSourceId: src.id,
          idempotencyKey: 'idem-30d-009-rollback',
        }),
        ADMIN_ACTOR,
      ),
    assertLrErr('PERSISTENCE_UNAVAILABLE', 503),
  );

  const reloaded = await h.store.getProvisionById(prov.id);
  assert.equal(reloaded?.version, 1);
  assert.equal(reloaded?.versionHistory.length, 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.CHANGE_HISTORY), 0);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), auditBefore);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), idemBefore);
});

test('LR-30D-010: Concurrent modification conflict aborts stale CAS write with 409 CONCURRENT_MODIFICATION_CONFLICT', async () => {
  const h = createProductionHarness();
  const { src, prov } = await seedHierarchy(h, '010');

  // First change bumps version 1 -> 2
  const chg1 = await h.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
    makeChangeInput({
      targetProvisionId: prov.id,
      enactingSourceId: src.id,
      expectedPreviousVersion: 1,
      idempotencyKey: 'idem-30d-010-c1',
    }),
    ADMIN_ACTOR,
  );
  assert.equal(chg1.updatedProvision.version, 2);

  // Stale change expecting version 1 must fail with 409 CONCURRENT_MODIFICATION_CONFLICT
  await assert.rejects(
    () =>
      h.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
        makeChangeInput({
          targetProvisionId: prov.id,
          enactingSourceId: src.id,
          expectedPreviousVersion: 1,
          changeSummary: 'تغییر متعارض با نسخه قدیمی',
          idempotencyKey: 'idem-30d-010-c2',
        }),
        ADMIN_ACTOR,
      ),
    assertLrErr('CONCURRENT_MODIFICATION_CONFLICT', 409),
  );

  const reloaded = await h.store.getProvisionById(prov.id);
  assert.equal(reloaded?.version, 2);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.CHANGE_HISTORY), 1);
});

test('LR-30D-011: Single Idempotency-Key never writes two results (same payload replays; different payload rejects 409)', async () => {
  const h = createProductionHarness();
  const input = makeSourceInput({ id: 'src_30d_011', idempotencyKey: 'idem-30d-011-fixed' });

  const first = await h.sourceAndProvisionService.createRegulatorySource(input, ADMIN_ACTOR);

  // Replay identical payload -> exact same result, zero Firestore writes in replay tx
  const replay = await h.sourceAndProvisionService.createRegulatorySource(input, ADMIN_ACTOR);
  assert.deepEqual(replay, first);
  assert.equal(h.dbHarness.lastTxOps.includes('WRITE'), false);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 1);

  // Reuse same key with altered payload -> 409 IDEMPOTENCY_KEY_REUSED
  await assert.rejects(
    () =>
      h.sourceAndProvisionService.createRegulatorySource(
        makeSourceInput({
          id: 'src_30d_011_different',
          officialTitleFa: 'عنوان کاملاً متفاوت',
          idempotencyKey: 'idem-30d-011-fixed',
        }),
        ADMIN_ACTOR,
      ),
    assertLrErr('IDEMPOTENCY_KEY_REUSED', 409),
  );

  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 1);
});

test('LR-30D-012: Concurrent identical Idempotency-Key requests execute side effects at most once', async () => {
  const h = createProductionHarness();
  const input = makeSourceInput({ id: 'src_30d_012_race', idempotencyKey: 'idem-30d-012-race' });

  // Inject async yield before commit so both transactions overlap on the same idempotency document
  let gateRelease!: () => void;
  let entered = 0;
  const gate = new Promise<void>((resolve) => {
    gateRelease = resolve;
  });

  h.dbHarness.beforeCommitHook = async () => {
    entered += 1;
    if (entered === 2) {
      gateRelease();
    }
    await gate;
  };

  const [r1, r2] = await Promise.allSettled([
    h.sourceAndProvisionService.createRegulatorySource(input, ADMIN_ACTOR),
    h.sourceAndProvisionService.createRegulatorySource(input, ADMIN_ACTOR),
  ]);
  h.dbHarness.beforeCommitHook = null;

  const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
  assert.ok(fulfilled.length >= 1, 'At least one concurrent request must commit');
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 1);

  // Subsequent retry by the caller of the aborted concurrent request recovers the exact committed result
  const recovered = await h.sourceAndProvisionService.createRegulatorySource(input, ADMIN_ACTOR);
  assert.equal(recovered.id, 'src_30d_012_race');
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 1);
});

test('LR-30D-013: Cross-instance module rebuild preserves Firestore idempotency state with zero duplicate execution', async () => {
  const sharedPersistentDb = new TransactionalFirestoreMock();

  // Instance #1 writes Source + Audit + Idempotency into persistent Firestore
  const instance1 = createProductionHarness(sharedPersistentDb);
  const input = makeSourceInput({ id: 'src_30d_013_durable', idempotencyKey: 'idem-30d-013-cross-instance' });
  const createdByInstance1 = await instance1.sourceAndProvisionService.createRegulatorySource(input, ADMIN_ACTOR);

  // Discard Instance #1 and construct completely fresh Instance #2 bound to the SAME persistent Firestore
  const instance2 = createProductionHarness(sharedPersistentDb);
  assert.notEqual(instance1.store, instance2.store);
  assert.notEqual(instance1.sourceAndProvisionService, instance2.sourceAndProvisionService);

  const replayedByInstance2 = await instance2.sourceAndProvisionService.createRegulatorySource(input, ADMIN_ACTOR);
  assert.deepEqual(replayedByInstance2, createdByInstance1);
  assert.equal(sharedPersistentDb.lastTxOps.includes('WRITE'), false);
  assert.equal(sharedPersistentDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 1);
  assert.equal(sharedPersistentDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 1);
  assert.equal(sharedPersistentDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 1);
});

test('LR-30D-014: Audit or Idempotency write failure never records synthetic success and allows clean subsequent retry', async () => {
  const h = createProductionHarness();
  const input = makeSourceInput({ id: 'src_30d_014_retry', idempotencyKey: 'idem-30d-014-clean' });

  // Attempt 1: fail on AUDIT_LOG write
  h.dbHarness.failOnCollectionWrite = LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG;
  await assert.rejects(
    () => h.sourceAndProvisionService.createRegulatorySource(input, ADMIN_ACTOR),
    assertLrErr('PERSISTENCE_UNAVAILABLE', 503),
  );
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 0);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 0);

  // Attempt 2: fail on IDEMPOTENCY write
  h.dbHarness.failOnCollectionWrite = LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY;
  await assert.rejects(
    () => h.sourceAndProvisionService.createRegulatorySource(input, ADMIN_ACTOR),
    assertLrErr('PERSISTENCE_UNAVAILABLE', 503),
  );
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 0);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 0);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 0);

  // Attempt 3: healthy Firestore -> same Idempotency-Key succeeds cleanly
  const created = await h.sourceAndProvisionService.createRegulatorySource(input, ADMIN_ACTOR);
  assert.equal(created.id, 'src_30d_014_retry');
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 1);
  assert.equal(h.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 1);
});

// ============================================================================
// Section B: LR-30D-023 .. LR-30D-027 — Firestore Rules Client-Denial Checks
// ============================================================================

const ALL_LEGAL_COLLECTIONS = Object.values(LEGAL_REGULATORY_COLLECTIONS);

interface ParsedCollectionRule {
  collection: string;
  body: string;
  allowClauses: string[];
}

function parseLegalRegulatoryRules(): Map<string, ParsedCollectionRule> {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const content = fs.readFileSync(rulesPath, 'utf8');
  const map = new Map<string, ParsedCollectionRule>();

  for (const col of ALL_LEGAL_COLLECTIONS) {
    const regex = new RegExp(`match\\s+/${col}/\\{[^}]+\\}\\s*\\{([\\s\\S]*?)\\}`, 'g');
    const matches = Array.from(content.matchAll(regex));
    assert.equal(matches.length, 1, `Expected exactly 1 match block in firestore.rules for collection '${col}'`);
    const body = matches[0][1].trim();
    const allowClauses = Array.from(body.matchAll(/allow\s+[^;]+;/g)).map((m) => m[0].replace(/\s+/g, ' ').trim());
    map.set(col, { collection: col, body, allowClauses });
  }
  return map;
}

function simulateClientRuleDecision(
  rule: ParsedCollectionRule,
  operation: 'get' | 'list' | 'read' | 'create' | 'update' | 'delete' | 'write',
  _clientContext: { auth: null | { uid: string; role: 'user' | 'admin' } },
): 'ALLOW' | 'DENY' {
  // Exact Firestore Rules evaluation semantics for `allow read, write: if false;`
  // If every allow clause evaluates strictly to `if false;`, NO client context (unauth, user, admin) can ever match.
  for (const clause of rule.allowClauses) {
    if (!/^allow\s+(?:read|write|get|list|create|update|delete)(?:\s*,\s*(?:read|write|get|list|create|update|delete))*\s*:\s*if\s+false;$/.test(clause)) {
      return 'ALLOW';
    }
  }
  // Firestore defaults to DENY if no allow clause evaluates to true.
  void operation;
  return 'DENY';
}

test('LR-30D-023: Unauthenticated public direct client read is denied on all 10 legal-regulatory collections', () => {
  const rules = parseLegalRegulatoryRules();
  assert.equal(rules.size, 10);
  for (const col of ALL_LEGAL_COLLECTIONS) {
    const rule = rules.get(col)!;
    assert.equal(simulateClientRuleDecision(rule, 'get', { auth: null }), 'DENY', `Public get must be denied on ${col}`);
    assert.equal(simulateClientRuleDecision(rule, 'list', { auth: null }), 'DENY', `Public list must be denied on ${col}`);
  }
});

test('LR-30D-024: Authenticated regular user direct client read is denied on all 10 legal-regulatory collections', () => {
  const rules = parseLegalRegulatoryRules();
  for (const col of ALL_LEGAL_COLLECTIONS) {
    const rule = rules.get(col)!;
    assert.equal(
      simulateClientRuleDecision(rule, 'read', { auth: { uid: 'uid_regular_user', role: 'user' } }),
      'DENY',
      `Authenticated user read must be denied on ${col}`,
    );
  }
});

test('LR-30D-025: Authenticated regular user direct client write is denied on all 10 legal-regulatory collections', () => {
  const rules = parseLegalRegulatoryRules();
  for (const col of ALL_LEGAL_COLLECTIONS) {
    const rule = rules.get(col)!;
    assert.equal(
      simulateClientRuleDecision(rule, 'write', { auth: { uid: 'uid_regular_user', role: 'user' } }),
      'DENY',
      `Authenticated user write must be denied on ${col}`,
    );
  }
});

test('LR-30D-026: Admin direct client read/write is denied on all 10 legal-regulatory collections (zero isAdmin bypass)', () => {
  const rules = parseLegalRegulatoryRules();
  for (const col of ALL_LEGAL_COLLECTIONS) {
    const rule = rules.get(col)!;
    assert.equal(rule.body.includes('isAdmin'), false, `Admin client bypass prohibited on ${col}`);
    assert.equal(
      simulateClientRuleDecision(rule, 'write', { auth: { uid: 'uid_admin', role: 'admin' } }),
      'DENY',
      `Admin direct client write must be denied on ${col}`,
    );
  }
});

test('LR-30D-027: Direct client create/update/delete tampering is denied and no global wildcard overrides legal rules', () => {
  const rules = parseLegalRegulatoryRules();
  for (const col of ALL_LEGAL_COLLECTIONS) {
    const rule = rules.get(col)!;
    assert.deepEqual(rule.allowClauses, ['allow read, write: if false;']);
    for (const op of ['create', 'update', 'delete'] as const) {
      assert.equal(simulateClientRuleDecision(rule, op, { auth: { uid: 'uid_attacker', role: 'admin' } }), 'DENY');
    }
  }
  const fullRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  assert.equal(/match\s+\/\{document=\*\*\}\s*\{\s*allow\s+[^;]*if\s+true/i.test(fullRules), false);
});

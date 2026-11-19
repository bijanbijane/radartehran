import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildIdempotencyDocumentId,
  computeCanonicalPayloadHash,
  createLegalRegulatoryModuleFacade,
  createProductionLegalRegulatoryModule,
  createTestLegalRegulatoryModule,
  DeterministicLegalRegulatoryStore,
  FirestoreLegalRegulatoryStore,
  FirestoreLegalRegulatoryTransactionRunner,
  LEGAL_REGULATORY_COLLECTIONS,
  LegalRegulatoryError,
  ReadOnlyInMemoryPropertyContextAdapter,
  sanitizeForFirestore,
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
  REVIEWER_ACTOR,
  TransactionalFirestoreMock,
} from './firestoreMockHarness';

function createWiredFirestoreHarness() {
  const mockDb = new TransactionalFirestoreMock();
  const runner = new FirestoreLegalRegulatoryTransactionRunner(mockDb.asAdminFirestore());
  const store = new FirestoreLegalRegulatoryStore({ transactionRunner: runner });
  const mod = createProductionLegalRegulatoryModule({
    store,
    propertyContextAdapter: PROD_PROPERTY_ADAPTER,
  });
  return { mockDb, runner, store, ...mod };
}

async function seedHierarchy(mod: ReturnType<typeof createWiredFirestoreHarness>, suffix = '01') {
  const src = await mod.sourceAndProvisionService.createRegulatorySource(
    makeSourceInput({ id: `src_${suffix}`, officialReferenceNumber: `REF-${suffix}` }),
    ADMIN_ACTOR,
  );
  const doc = await mod.sourceAndProvisionService.createRegulatoryDocument(
    makeDocInput({ id: `doc_${suffix}`, sourceId: src.id, documentCode: `DOC-${suffix}` }),
    ADMIN_ACTOR,
  );
  const prov = await mod.sourceAndProvisionService.createRegulatoryProvision(
    makeProvisionInput({ id: `prov_${suffix}`, sourceId: src.id, documentId: doc.id }),
    ADMIN_ACTOR,
  );
  return { src, doc, prov };
}

function assertLrError(code: string, statusCode: number) {
  return (err: unknown) =>
    err instanceof LegalRegulatoryError && err.code === code && err.statusCode === statusCode;
}

// ============================================================================
// LR-CORE-001..005: Fail-Closed & Fallback Removal (including Scenario F)
// ============================================================================

test('LR-CORE-001: FirestoreLegalRegulatoryStore has zero fallbackStore and zero DeterministicLegalRegulatoryStore import', () => {
  const store = new FirestoreLegalRegulatoryStore({ db: null });
  assert.equal('fallbackStore' in store, false);
  const srcText = fs.readFileSync(path.resolve(process.cwd(), 'server/modules/legal-regulatory/firestoreStore.ts'), 'utf8');
  assert.equal(srcText.includes('DeterministicLegalRegulatoryStore'), false);
  assert.equal(srcText.includes('fallbackStore'), false);
});

test('LR-CORE-002: [Scenario F] Read fails closed with 503 PERSISTENCE_UNAVAILABLE when PREVENT_PROD_FIREBASE_IN_TEST=true', async () => {
  const prev = process.env.PREVENT_PROD_FIREBASE_IN_TEST;
  const prevEmu = process.env.FIRESTORE_EMULATOR_HOST;
  process.env.PREVENT_PROD_FIREBASE_IN_TEST = 'true';
  delete process.env.FIRESTORE_EMULATOR_HOST;
  try {
    const store = new FirestoreLegalRegulatoryStore();
    await assert.rejects(() => store.listSources(), assertLrError('PERSISTENCE_UNAVAILABLE', 503));
  } finally {
    if (prev === undefined) delete process.env.PREVENT_PROD_FIREBASE_IN_TEST;
    else process.env.PREVENT_PROD_FIREBASE_IN_TEST = prev;
    if (prevEmu !== undefined) process.env.FIRESTORE_EMULATOR_HOST = prevEmu;
  }
});

test('LR-CORE-003: [Scenario F] Write fails closed with 503 PERSISTENCE_UNAVAILABLE and no Map fallback when db is null', async () => {
  const store = new FirestoreLegalRegulatoryStore({ db: null });
  const mod = createProductionLegalRegulatoryModule({ store, propertyContextAdapter: PROD_PROPERTY_ADAPTER });
  await assert.rejects(
    () => mod.sourceAndProvisionService.createRegulatorySource(makeSourceInput(), ADMIN_ACTOR),
    assertLrError('PERSISTENCE_UNAVAILABLE', 503),
  );
  await assert.rejects(() => store.listSources(), assertLrError('PERSISTENCE_UNAVAILABLE', 503));
});

test('LR-CORE-004: Fail-closed 503 when dbProvider returns null or throws initialization error', async () => {
  const storeNull = new FirestoreLegalRegulatoryStore({ dbProvider: () => null });
  await assert.rejects(() => storeNull.getSourceById('src_x'), assertLrError('PERSISTENCE_UNAVAILABLE', 503));

  const storeThrow = new FirestoreLegalRegulatoryStore({
    dbProvider: () => {
      throw new Error('ADC_MISSING');
    },
  });
  await assert.rejects(() => storeThrow.listProvisions(), assertLrError('PERSISTENCE_UNAVAILABLE', 503));
});

test('LR-CORE-005: Fail-closed 503 when Firestore read or runTransaction throws infrastructure outage error', async () => {
  const h = createWiredFirestoreHarness();
  h.mockDb.failNextReadError = new Error('DEADLINE_EXCEEDED');
  await assert.rejects(() => h.store.listSources(), assertLrError('PERSISTENCE_UNAVAILABLE', 503));

  h.mockDb.failNextTxError = new Error('UNAVAILABLE: backend reset');
  await assert.rejects(
    () => h.sourceAndProvisionService.createRegulatorySource(makeSourceInput(), ADMIN_ACTOR),
    assertLrError('PERSISTENCE_UNAVAILABLE', 503),
  );
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 0);
});

// ============================================================================
// LR-CORE-006..010: Transaction Runner & Read-before-Write Order
// ============================================================================

test('LR-CORE-006: FirestoreLegalRegulatoryTransactionRunner rejects null/missing AdminFirestore instance', () => {
  assert.throws(
    () => new FirestoreLegalRegulatoryTransactionRunner(null as never),
    assertLrError('PERSISTENCE_UNAVAILABLE', 503),
  );
});

test('LR-CORE-007: Transaction runner executes all tx.get reads strictly before any tx.set write', async () => {
  const h = createWiredFirestoreHarness();
  await h.sourceAndProvisionService.createRegulatorySource(
    makeSourceInput({ idempotencyKey: 'idem-rbw-1' }),
    ADMIN_ACTOR,
  );
  const firstWriteIdx = h.mockDb.lastTxOps.indexOf('WRITE');
  const lastReadIdx = h.mockDb.lastTxOps.lastIndexOf('READ');
  assert.ok(firstWriteIdx > 0, 'Expected writes to occur');
  assert.ok(lastReadIdx < firstWriteIdx, `Expected all READs before WRITEs, got ${h.mockDb.lastTxOps.join(',')}`);
});

test('LR-CORE-008: Unread CAS targets are read before write flush phase begins in Firestore transaction', async () => {
  const h = createWiredFirestoreHarness();
  const src = await h.sourceAndProvisionService.createRegulatorySource(makeSourceInput(), ADMIN_ACTOR);
  // Direct saveSource with expectedPreviousVersion=1 stages write without explicit user read first; runner must read before flush
  await h.store.saveSource({ ...src, version: 2, officialTitleFa: 'عنوان به‌روزشده' }, 1);
  const firstWriteIdx = h.mockDb.lastTxOps.indexOf('WRITE');
  const lastReadIdx = h.mockDb.lastTxOps.lastIndexOf('READ');
  assert.ok(lastReadIdx < firstWriteIdx);
  const saved = await h.store.getSourceById(src.id);
  assert.equal(saved?.version, 2);
});

test('LR-CORE-009: Runner enforces CAS check and aborts entire transaction on version mismatch', async () => {
  const h = createWiredFirestoreHarness();
  const src = await h.sourceAndProvisionService.createRegulatorySource(makeSourceInput(), ADMIN_ACTOR);
  await assert.rejects(
    () => h.store.saveSource({ ...src, version: 3 }, 99),
    assertLrError('CONCURRENT_MODIFICATION_CONFLICT', 409),
  );
  const reloaded = await h.store.getSourceById(src.id);
  assert.equal(reloaded?.version, 1);
});

test('LR-CORE-010: sanitizeForFirestore strips nested undefined fields without mutating nulls or primitives', () => {
  const cleaned = sanitizeForFirestore({
    a: 1,
    b: undefined,
    c: null,
    d: false,
    nested: { keep: 'ok', drop: undefined, arr: [{ x: 1, y: undefined }] },
  });
  assert.deepEqual(cleaned, { a: 1, c: null, d: false, nested: { keep: 'ok', arr: [{ x: 1 }] } });
});

// ============================================================================
// LR-CORE-011..016: Atomic Source, Verify Source, Audit & Idempotency
// ============================================================================

test('LR-CORE-011: createRegulatorySource commits Source + Audit + Idempotency in one single Firestore transaction', async () => {
  const h = createWiredFirestoreHarness();
  const beforeCommits = h.mockDb.txCommitCount;
  await h.sourceAndProvisionService.createRegulatorySource(
    makeSourceInput({ id: 'src_atomic_1', idempotencyKey: 'idem-src-1' }),
    ADMIN_ACTOR,
  );
  assert.equal(h.mockDb.txCommitCount, beforeCommits + 1);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 1);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 1);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 1);
});

test('LR-CORE-012: [Scenario A] Audit write failure rolls back Source and Idempotency completely', async () => {
  const h = createWiredFirestoreHarness();
  h.mockDb.failOnCollectionWrite = LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG;
  await assert.rejects(
    () =>
      h.sourceAndProvisionService.createRegulatorySource(
        makeSourceInput({ id: 'src_fail_audit', idempotencyKey: 'idem-fail-audit' }),
        ADMIN_ACTOR,
      ),
    assertLrError('PERSISTENCE_UNAVAILABLE', 503),
  );
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 0);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 0);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 0);
});

test('LR-CORE-013: [Scenario B] Idempotency write failure rolls back Source and Audit completely', async () => {
  const h = createWiredFirestoreHarness();
  h.mockDb.failOnCollectionWrite = LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY;
  await assert.rejects(
    () =>
      h.sourceAndProvisionService.createRegulatorySource(
        makeSourceInput({ id: 'src_fail_idem', idempotencyKey: 'idem-fail-idem' }),
        ADMIN_ACTOR,
      ),
    assertLrError('PERSISTENCE_UNAVAILABLE', 503),
  );
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 0);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 0);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 0);
});

test('LR-CORE-014: verifyRegulatorySource increments version + updates provenance + writes Audit atomically', async () => {
  const h = createWiredFirestoreHarness();
  const src = await h.sourceAndProvisionService.createRegulatorySource(makeSourceInput({ id: 'src_ver_1' }), ADMIN_ACTOR);
  const commitsBefore = h.mockDb.txCommitCount;
  const verified = await h.sourceAndProvisionService.verifyRegulatorySource(src.id, 'تطبیق با روزنامه رسمی', REVIEWER_ACTOR, 1);
  assert.equal(h.mockDb.txCommitCount, commitsBefore + 1);
  assert.equal(verified.version, 2);
  assert.equal(verified.verificationStatus, 'VERIFIED');
  assert.equal(verified.provenance.verifiedByReviewerId, REVIEWER_ACTOR.actorId);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 2);
});

test('LR-CORE-015: verifyRegulatorySource rejects stale expectedVersion with 409 and emits zero Audit', async () => {
  const h = createWiredFirestoreHarness();
  const src = await h.sourceAndProvisionService.createRegulatorySource(makeSourceInput({ id: 'src_ver_2' }), ADMIN_ACTOR);
  await assert.rejects(
    () => h.sourceAndProvisionService.verifyRegulatorySource(src.id, 'تطبیق', REVIEWER_ACTOR, 9),
    assertLrError('CONCURRENT_MODIFICATION_CONFLICT', 409),
  );
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 1);
});

test('LR-CORE-016: verifyRegulatorySource rollback on Audit failure leaves source unverified at v1', async () => {
  const h = createWiredFirestoreHarness();
  const src = await h.sourceAndProvisionService.createRegulatorySource(makeSourceInput({ id: 'src_ver_3' }), ADMIN_ACTOR);
  h.mockDb.failOnCollectionWrite = LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG;
  await assert.rejects(
    () => h.sourceAndProvisionService.verifyRegulatorySource(src.id, 'تطبیق', REVIEWER_ACTOR, 1),
    assertLrError('PERSISTENCE_UNAVAILABLE', 503),
  );
  const reloaded = await h.store.getSourceById(src.id);
  assert.equal(reloaded?.version, 1);
  assert.equal(reloaded?.verificationStatus, 'PENDING_VERIFICATION');
});

// ============================================================================
// LR-CORE-017..021: Atomic Document & Provision
// ============================================================================

test('LR-CORE-017: createRegulatoryDocument commits Document + Audit + Idempotency in a single transaction', async () => {
  const h = createWiredFirestoreHarness();
  await h.sourceAndProvisionService.createRegulatorySource(makeSourceInput({ id: 'src_d1' }), ADMIN_ACTOR);
  const commitsBefore = h.mockDb.txCommitCount;
  const doc = await h.sourceAndProvisionService.createRegulatoryDocument(
    makeDocInput({ id: 'doc_d1', sourceId: 'src_d1', idempotencyKey: 'idem-doc-1' }),
    ADMIN_ACTOR,
  );
  assert.equal(doc.version, 1);
  assert.equal(h.mockDb.txCommitCount, commitsBefore + 1);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.DOCUMENTS), 1);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 2);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 1);
});

test('LR-CORE-018: createRegulatoryDocument rolls back completely if Audit write fails', async () => {
  const h = createWiredFirestoreHarness();
  await h.sourceAndProvisionService.createRegulatorySource(makeSourceInput({ id: 'src_d2' }), ADMIN_ACTOR);
  h.mockDb.failOnCollectionWrite = LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG;
  await assert.rejects(
    () =>
      h.sourceAndProvisionService.createRegulatoryDocument(
        makeDocInput({ id: 'doc_d2', sourceId: 'src_d2', idempotencyKey: 'idem-doc-2' }),
        ADMIN_ACTOR,
      ),
    assertLrError('PERSISTENCE_UNAVAILABLE', 503),
  );
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.DOCUMENTS), 0);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 0);
});

test('LR-CORE-019: createRegulatoryProvision commits Provision v1 + initial snapshot + Audit + Idempotency atomically', async () => {
  const h = createWiredFirestoreHarness();
  await h.sourceAndProvisionService.createRegulatorySource(makeSourceInput({ id: 'src_p1' }), ADMIN_ACTOR);
  await h.sourceAndProvisionService.createRegulatoryDocument(makeDocInput({ id: 'doc_p1', sourceId: 'src_p1' }), ADMIN_ACTOR);
  const commitsBefore = h.mockDb.txCommitCount;
  const prov = await h.sourceAndProvisionService.createRegulatoryProvision(
    makeProvisionInput({ id: 'prov_p1', sourceId: 'src_p1', documentId: 'doc_p1', idempotencyKey: 'idem-prov-1' }),
    ADMIN_ACTOR,
  );
  assert.equal(prov.version, 1);
  assert.equal(prov.versionHistory.length, 1);
  assert.equal(h.mockDb.txCommitCount, commitsBefore + 1);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.PROVISIONS), 1);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 1);
});

test('LR-CORE-020: createRegulatoryProvision rejects attaching to a Document owned by a different Source', async () => {
  const h = createWiredFirestoreHarness();
  await h.sourceAndProvisionService.createRegulatorySource(makeSourceInput({ id: 'src_owner_a' }), ADMIN_ACTOR);
  await h.sourceAndProvisionService.createRegulatorySource(makeSourceInput({ id: 'src_owner_b' }), ADMIN_ACTOR);
  await h.sourceAndProvisionService.createRegulatoryDocument(makeDocInput({ id: 'doc_of_a', sourceId: 'src_owner_a' }), ADMIN_ACTOR);
  await assert.rejects(
    () =>
      h.sourceAndProvisionService.createRegulatoryProvision(
        makeProvisionInput({ id: 'prov_bad_link', sourceId: 'src_owner_b', documentId: 'doc_of_a' }),
        ADMIN_ACTOR,
      ),
    assertLrError('VALIDATION_ERROR', 400),
  );
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.PROVISIONS), 0);
});

test('LR-CORE-021: createRegulatoryProvision rolls back completely when Idempotency write fails', async () => {
  const h = createWiredFirestoreHarness();
  await h.sourceAndProvisionService.createRegulatorySource(makeSourceInput({ id: 'src_p2' }), ADMIN_ACTOR);
  await h.sourceAndProvisionService.createRegulatoryDocument(makeDocInput({ id: 'doc_p2', sourceId: 'src_p2' }), ADMIN_ACTOR);
  h.mockDb.failOnCollectionWrite = LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY;
  await assert.rejects(
    () =>
      h.sourceAndProvisionService.createRegulatoryProvision(
        makeProvisionInput({ id: 'prov_p2', sourceId: 'src_p2', documentId: 'doc_p2', idempotencyKey: 'idem-prov-2' }),
        ADMIN_ACTOR,
      ),
    assertLrError('PERSISTENCE_UNAVAILABLE', 503),
  );
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.PROVISIONS), 0);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 2);
});

// ============================================================================
// LR-CORE-022..027: Atomic Change Record & Versioning
// ============================================================================

test('LR-CORE-022: recordRegulatoryChangeAndVersion commits Provision v2 + ChangeRecord + Audit + Idempotency in 1 tx', async () => {
  const h = createWiredFirestoreHarness();
  const { src, prov } = await seedHierarchy(h, 'c1');
  const commitsBefore = h.mockDb.txCommitCount;
  const { updatedProvision, changeRecord } = await h.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
    makeChangeInput({
      targetProvisionId: prov.id,
      enactingSourceId: src.id,
      expectedPreviousVersion: 1,
      idempotencyKey: 'idem-chg-1',
    }),
    ADMIN_ACTOR,
  );
  assert.equal(h.mockDb.txCommitCount, commitsBefore + 1);
  assert.equal(updatedProvision.version, 2);
  assert.equal(updatedProvision.versionHistory.length, 2);
  assert.equal(updatedProvision.versionHistory[0].effectiveToIso, '2025-01-01');
  assert.equal(changeRecord.previousProvisionVersion, 1);
  assert.equal(changeRecord.newProvisionVersion, 2);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.CHANGE_HISTORY), 1);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 1);
});

test('LR-CORE-023: ChangeRecord write failure rolls back Provision version update and Audit (zero drift)', async () => {
  const h = createWiredFirestoreHarness();
  const { src, prov } = await seedHierarchy(h, 'c2');
  h.mockDb.failOnCollectionWrite = LEGAL_REGULATORY_COLLECTIONS.CHANGE_HISTORY;
  await assert.rejects(
    () =>
      h.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
        makeChangeInput({ targetProvisionId: prov.id, enactingSourceId: src.id, expectedPreviousVersion: 1, idempotencyKey: 'idem-chg-2' }),
        ADMIN_ACTOR,
      ),
    assertLrError('PERSISTENCE_UNAVAILABLE', 503),
  );
  const reloaded = await h.store.getProvisionById(prov.id);
  assert.equal(reloaded?.version, 1);
  assert.equal(reloaded?.versionHistory.length, 1);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.CHANGE_HISTORY), 0);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 0);
});

test('LR-CORE-024: Audit failure during change recording rolls back both Provision and ChangeRecord', async () => {
  const h = createWiredFirestoreHarness();
  const { src, prov } = await seedHierarchy(h, 'c3');
  h.mockDb.failOnCollectionWrite = LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG;
  await assert.rejects(
    () =>
      h.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
        makeChangeInput({ targetProvisionId: prov.id, enactingSourceId: src.id, expectedPreviousVersion: 1 }),
        ADMIN_ACTOR,
      ),
    assertLrError('PERSISTENCE_UNAVAILABLE', 503),
  );
  assert.equal((await h.store.getProvisionById(prov.id))?.version, 1);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.CHANGE_HISTORY), 0);
});

test('LR-CORE-025: Stale expectedPreviousVersion on recordRegulatoryChangeAndVersion fails 409 with zero orphan ChangeRecord', async () => {
  const h = createWiredFirestoreHarness();
  const { src, prov } = await seedHierarchy(h, 'c4');
  await assert.rejects(
    () =>
      h.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
        makeChangeInput({ targetProvisionId: prov.id, enactingSourceId: src.id, expectedPreviousVersion: 5 }),
        ADMIN_ACTOR,
      ),
    assertLrError('CONCURRENT_MODIFICATION_CONFLICT', 409),
  );
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.CHANGE_HISTORY), 0);
});

test('LR-CORE-026: Sequential amendments v1->v2->v3->v4 preserve contiguous versionHistory and ordered change records', async () => {
  const h = createWiredFirestoreHarness();
  const { src, prov } = await seedHierarchy(h, 'c5');
  for (let v = 1; v <= 3; v += 1) {
    await h.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
      makeChangeInput({
        targetProvisionId: prov.id,
        enactingSourceId: src.id,
        expectedPreviousVersion: v,
        effectiveFromIso: `202${4 + v}-01-01`,
        changeSummary: `اصلاحیه نسخه ${v + 1}`,
      }),
      ADMIN_ACTOR,
    );
  }
  const latest = await h.store.getProvisionById(prov.id);
  const changes = await h.store.listChangeRecordsForProvision(prov.id);
  assert.equal(latest?.version, 4);
  assert.equal(latest?.versionHistory.length, 4);
  assert.deepEqual(
    changes.map((c) => [c.previousProvisionVersion, c.newProvisionVersion]),
    [[1, 2], [2, 3], [3, 4]],
  );
});

test('LR-CORE-027: REPEAL change atomically transitions lifecycleStatus to REPEALED and sets repealedAtIso', async () => {
  const h = createWiredFirestoreHarness();
  const { src, prov } = await seedHierarchy(h, 'c6');
  const res = await h.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
    makeChangeInput({
      targetProvisionId: prov.id,
      enactingSourceId: src.id,
      changeType: 'REPEAL',
      expectedPreviousVersion: 1,
      effectiveFromIso: '2025-06-01',
      changeSummary: 'نسخ صریح ماده',
    }),
    ADMIN_ACTOR,
  );
  assert.equal(res.updatedProvision.lifecycleStatus, 'REPEALED');
  assert.equal(res.updatedProvision.repealedAtIso, '2025-06-01');
  const asOf = await h.sourceAndProvisionService.getProvisionVersionAsOfDate(prov.id, '2025-06-15');
  assert.equal(asOf.isInForceAtDate, false);
});

// ============================================================================
// LR-CORE-028..032: Conflict & Applicability Rule
// ============================================================================

test('LR-CORE-028: registerProvisionConflict commits Conflict + Audit + Idempotency atomically in 1 tx', async () => {
  const h = createWiredFirestoreHarness();
  const { src, doc, prov } = await seedHierarchy(h, 'cf1');
  const prov2 = await h.sourceAndProvisionService.createRegulatoryProvision(
    makeProvisionInput({ id: 'prov_cf2', sourceId: src.id, documentId: doc.id, provisionNumber: '3-2' }),
    ADMIN_ACTOR,
  );
  const commitsBefore = h.mockDb.txCommitCount;
  const conf = await h.sourceAndProvisionService.registerProvisionConflict(
    {
      id: 'conf_1',
      provisionIdA: prov.id,
      provisionIdB: prov2.id,
      conflictSeverity: 'MODERATE_AMBIGUITY',
      conflictDescription: 'تعارض در آستانه طبقه',
      idempotencyKey: 'idem-conf-1',
    },
    ADMIN_ACTOR,
  );
  assert.equal(conf.version, 1);
  assert.equal(h.mockDb.txCommitCount, commitsBefore + 1);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.CONFLICTS), 1);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 1);
});

test('LR-CORE-029: registerProvisionConflict rejects self-conflict and rolls back on Audit failure', async () => {
  const h = createWiredFirestoreHarness();
  const { src, doc, prov } = await seedHierarchy(h, 'cf2');
  await assert.rejects(
    () =>
      h.sourceAndProvisionService.registerProvisionConflict(
        { provisionIdA: prov.id, provisionIdB: prov.id, conflictSeverity: 'DIRECT_CONTRADICTION', conflictDescription: 'خودتعارض' },
        ADMIN_ACTOR,
      ),
    assertLrError('VALIDATION_ERROR', 400),
  );
  const prov2 = await h.sourceAndProvisionService.createRegulatoryProvision(
    makeProvisionInput({ id: 'prov_cf2_b', sourceId: src.id, documentId: doc.id, provisionNumber: '3-9' }),
    ADMIN_ACTOR,
  );
  h.mockDb.failOnCollectionWrite = LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG;
  await assert.rejects(
    () =>
      h.sourceAndProvisionService.registerProvisionConflict(
        { provisionIdA: prov.id, provisionIdB: prov2.id, conflictSeverity: 'DIRECT_CONTRADICTION', conflictDescription: 'تعارض' },
        ADMIN_ACTOR,
      ),
    assertLrError('PERSISTENCE_UNAVAILABLE', 503),
  );
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.CONFLICTS), 0);
});

test('LR-CORE-030: createApplicabilityRule commits Rule + Audit + Idempotency in a single transaction', async () => {
  const h = createWiredFirestoreHarness();
  const { src, prov } = await seedHierarchy(h, 'r1');
  const commitsBefore = h.mockDb.txCommitCount;
  const rule = await h.applicabilityAndProfileService.createApplicabilityRule(
    makeRuleInput({ id: 'rule_1', sourceId: src.id, provisionId: prov.id, idempotencyKey: 'idem-rule-1' }),
    ADMIN_ACTOR,
  );
  assert.equal(rule.version, 1);
  assert.equal(h.mockDb.txCommitCount, commitsBefore + 1);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.APPLICABILITY_RULES), 1);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 1);
});

test('LR-CORE-031: createApplicabilityRule rejects mismatched sourceId vs provision.sourceId', async () => {
  const h = createWiredFirestoreHarness();
  const { prov } = await seedHierarchy(h, 'r2');
  const otherSrc = await h.sourceAndProvisionService.createRegulatorySource(makeSourceInput({ id: 'src_other_r2' }), ADMIN_ACTOR);
  await assert.rejects(
    () =>
      h.applicabilityAndProfileService.createApplicabilityRule(
        makeRuleInput({ id: 'rule_bad', sourceId: otherSrc.id, provisionId: prov.id }),
        ADMIN_ACTOR,
      ),
    assertLrError('VALIDATION_ERROR', 400),
  );
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.APPLICABILITY_RULES), 0);
});

test('LR-CORE-032: createApplicabilityRule rolls back completely on Audit write failure', async () => {
  const h = createWiredFirestoreHarness();
  const { src, prov } = await seedHierarchy(h, 'r3');
  h.mockDb.failOnCollectionWrite = LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG;
  await assert.rejects(
    () =>
      h.applicabilityAndProfileService.createApplicabilityRule(
        makeRuleInput({ id: 'rule_rb', sourceId: src.id, provisionId: prov.id, idempotencyKey: 'idem-rule-rb' }),
        ADMIN_ACTOR,
      ),
    assertLrError('PERSISTENCE_UNAVAILABLE', 503),
  );
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.APPLICABILITY_RULES), 0);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 0);
});

// ============================================================================
// LR-CORE-033..037: Compliance Requirement, AI Suggestion & Audit
// ============================================================================

test('LR-CORE-033: createComplianceRequirement commits Requirement + Audit + Idempotency atomically in 1 tx', async () => {
  const h = createWiredFirestoreHarness();
  const { src, prov } = await seedHierarchy(h, 'cr1');
  const commitsBefore = h.mockDb.txCommitCount;
  const req = await h.applicabilityAndProfileService.createComplianceRequirement(
    makeComplianceInput({ id: 'comp_1', sourceId: src.id, provisionId: prov.id, idempotencyKey: 'idem-comp-1' }),
    ADMIN_ACTOR,
  );
  assert.equal(req.version, 1);
  assert.equal(h.mockDb.txCommitCount, commitsBefore + 1);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.COMPLIANCE_REQUIREMENTS), 1);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 1);
});

test('LR-CORE-034: createComplianceRequirement rejects mismatched sourceId vs provision.sourceId', async () => {
  const h = createWiredFirestoreHarness();
  const { prov } = await seedHierarchy(h, 'cr2');
  const otherSrc = await h.sourceAndProvisionService.createRegulatorySource(makeSourceInput({ id: 'src_other_cr2' }), ADMIN_ACTOR);
  await assert.rejects(
    () =>
      h.applicabilityAndProfileService.createComplianceRequirement(
        makeComplianceInput({ id: 'comp_bad', sourceId: otherSrc.id, provisionId: prov.id }),
        ADMIN_ACTOR,
      ),
    assertLrError('VALIDATION_ERROR', 400),
  );
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.COMPLIANCE_REQUIREMENTS), 0);
});

test('LR-CORE-035: createComplianceRequirement rolls back completely on Idempotency write failure', async () => {
  const h = createWiredFirestoreHarness();
  const { src, prov } = await seedHierarchy(h, 'cr3');
  h.mockDb.failOnCollectionWrite = LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY;
  await assert.rejects(
    () =>
      h.applicabilityAndProfileService.createComplianceRequirement(
        makeComplianceInput({ id: 'comp_rb', sourceId: src.id, provisionId: prov.id, idempotencyKey: 'idem-comp-rb' }),
        ADMIN_ACTOR,
      ),
    assertLrError('PERSISTENCE_UNAVAILABLE', 503),
  );
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.COMPLIANCE_REQUIREMENTS), 0);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 0);
});

test('LR-CORE-036: recordNonAuthoritativeAiSuggestion atomically writes AI summary + Provision v2 + Audit and rolls back on failure', async () => {
  const h = createWiredFirestoreHarness();
  const { prov } = await seedHierarchy(h, 'ai1');
  h.mockDb.failOnCollectionWrite = LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG;
  await assert.rejects(
    () =>
      h.applicabilityAndProfileService.recordNonAuthoritativeAiSuggestion(
        {
          targetEntityType: 'PROVISION',
          targetEntityId: prov.id,
          targetEntityVersion: 1,
          summaryText: 'خلاصه پیشنهادی غیرالزام‌آور',
          modelIdentifier: 'gemini-test',
          promptTemplateVersion: 'v1',
        },
        ADMIN_ACTOR,
      ),
    assertLrError('PERSISTENCE_UNAVAILABLE', 503),
  );
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AI_SUMMARIES), 0);
  assert.equal((await h.store.getProvisionById(prov.id))?.version, 1);

  const summary = await h.applicabilityAndProfileService.recordNonAuthoritativeAiSuggestion(
    {
      targetEntityType: 'PROVISION',
      targetEntityId: prov.id,
      targetEntityVersion: 1,
      summaryText: 'خلاصه پیشنهادی غیرالزام‌آور',
      modelIdentifier: 'gemini-test',
      promptTemplateVersion: 'v1',
    },
    ADMIN_ACTOR,
  );
  assert.equal(summary.isAuthoritative, false);
  assert.equal(summary.requiresHumanReview, true);
  assert.equal((await h.store.getProvisionById(prov.id))?.version, 2);
});

test('LR-CORE-037: Non-authoritative AI guard rejects attemptSetAuthoritative/attemptOverwriteOriginalLegalText with 422 and zero writes', async () => {
  const h = createWiredFirestoreHarness();
  const { prov } = await seedHierarchy(h, 'ai2');
  const auditsBefore = h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG);
  await assert.rejects(
    () =>
      h.applicabilityAndProfileService.recordNonAuthoritativeAiSuggestion(
        {
          targetEntityType: 'PROVISION',
          targetEntityId: prov.id,
          targetEntityVersion: 1,
          summaryText: 'تلاش برای ثبت رسمی',
          modelIdentifier: 'gemini-test',
          promptTemplateVersion: 'v1',
          attemptSetAuthoritative: true,
        },
        ADMIN_ACTOR,
      ),
    assertLrError('AUTHORITATIVE_AI_VIOLATION', 422),
  );
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AI_SUMMARIES), 0);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), auditsBefore);
});

// ============================================================================
// LR-CORE-038..041: Idempotency Hash, Schema v1 & Replay (Scenarios D & E)
// ============================================================================

test('LR-CORE-038: buildIdempotencyDocumentId uses 64-hex SHA-256 JSON boundary encoding (collision-resistant)', () => {
  const idA = buildIdempotencyDocumentId('op:a', 'actor', 'key');
  const idB = buildIdempotencyDocumentId('op', 'a:actor', 'key');
  const idC = buildIdempotencyDocumentId('op:a', 'actor', 'key');
  assert.match(idA, /^[0-9a-f]{64}$/);
  assert.notEqual(idA, idB);
  assert.equal(idA, idC);
});

test('LR-CORE-039: computeCanonicalPayloadHash is key-order invariant, preserves array order, and excludes undefined', () => {
  const h1 = computeCanonicalPayloadHash({ b: 2, a: 1, list: ['first', 'second'], opt: undefined });
  const h2 = computeCanonicalPayloadHash({ a: 1, b: 2, list: ['first', 'second'] });
  const h3 = computeCanonicalPayloadHash({ a: 1, b: 2, list: ['second', 'first'] });
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
});

test('LR-CORE-040: [Scenario D] Replay with identical key and payload returns same result with zero duplicate Audit', async () => {
  const h = createWiredFirestoreHarness();
  const payload = makeSourceInput({ id: 'src_replay_1', idempotencyKey: 'idem-replay-d' });
  const first = await h.sourceAndProvisionService.createRegulatorySource(payload, ADMIN_ACTOR);
  const auditsAfterFirst = h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG);
  const second = await h.sourceAndProvisionService.createRegulatorySource(payload, ADMIN_ACTOR);
  assert.deepEqual(second, first);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), auditsAfterFirst);

  const docId = buildIdempotencyDocumentId('createRegulatorySource', ADMIN_ACTOR.actorId, 'idem-replay-d');
  const storedIdem = h.mockDb.getRawDoc(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY, docId);
  assert.equal(storedIdem?.schemaVersion, 1);
  assert.equal(typeof storedIdem?.requestHash, 'string');
});

test('LR-CORE-041: [Scenario E] Reusing same idempotencyKey with different legal text throws 409 IDEMPOTENCY_KEY_REUSED without mutating prior data', async () => {
  const h = createWiredFirestoreHarness();
  const { src, prov } = await seedHierarchy(h, 'idem_e');
  const original = await h.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
    makeChangeInput({
      targetProvisionId: prov.id,
      enactingSourceId: src.id,
      newOriginalTextVerbatim: 'متن رسمی اول',
      expectedPreviousVersion: 1,
      idempotencyKey: 'idem-e-conflict',
    }),
    ADMIN_ACTOR,
  );
  await assert.rejects(
    () =>
      h.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
        makeChangeInput({
          targetProvisionId: prov.id,
          enactingSourceId: src.id,
          newOriginalTextVerbatim: 'متن رسمی دوم متفاوت',
          expectedPreviousVersion: 1,
          idempotencyKey: 'idem-e-conflict',
        }),
        ADMIN_ACTOR,
      ),
    assertLrError('IDEMPOTENCY_KEY_REUSED', 409),
  );
  const reloaded = await h.store.getProvisionById(prov.id);
  assert.equal(reloaded?.version, 2);
  assert.equal(reloaded?.originalTextVerbatim, original.updatedProvision.originalTextVerbatim);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.CHANGE_HISTORY), 1);
});

// ============================================================================
// LR-CORE-042..045: Concurrency (Scenario C), Factories, Rules/Blueprint & Scope
// ============================================================================

test('LR-CORE-042: [Scenario C] Two concurrent changes with expectedPreviousVersion=4 -> exactly 1 succeeds (v5, 1 ChangeRecord), other gets 409/abort', async () => {
  const h = createWiredFirestoreHarness();
  const { src, prov } = await seedHierarchy(h, 'conc4');
  // Advance provision cleanly from v1 -> v4
  for (let v = 1; v <= 3; v += 1) {
    await h.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
      makeChangeInput({
        targetProvisionId: prov.id,
        enactingSourceId: src.id,
        expectedPreviousVersion: v,
        effectiveFromIso: `202${4 + v}-01-01`,
        changeSummary: `گام ${v + 1}`,
      }),
      ADMIN_ACTOR,
    );
  }
  assert.equal((await h.store.getProvisionById(prov.id))?.version, 4);
  const changesBeforeRace = h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.CHANGE_HISTORY);

  // Interleave two concurrent transactions reading v4 before either commits using a barrier hook
  let arrived = 0;
  let releaseBarrier!: () => void;
  const barrier = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });
  h.mockDb.beforeCommitHook = async () => {
    arrived += 1;
    if (arrived === 2) {
      h.mockDb.beforeCommitHook = null;
      releaseBarrier();
    } else {
      await barrier;
    }
  };

  const results = await Promise.allSettled([
    h.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
      makeChangeInput({
        targetProvisionId: prov.id,
        enactingSourceId: src.id,
        expectedPreviousVersion: 4,
        effectiveFromIso: '2029-01-01',
        changeSummary: 'تغییر همزمان A',
      }),
      ADMIN_ACTOR,
    ),
    h.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
      makeChangeInput({
        targetProvisionId: prov.id,
        enactingSourceId: src.id,
        expectedPreviousVersion: 4,
        effectiveFromIso: '2029-02-01',
        changeSummary: 'تغییر همزمان B',
      }),
      REVIEWER_ACTOR,
    ),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1, 'Exactly one concurrent transaction must commit');
  assert.equal(rejected.length, 1, 'Second concurrent transaction must abort');
  assert.equal((await h.store.getProvisionById(prov.id))?.version, 5);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.CHANGE_HISTORY), changesBeforeRace + 1);

  // A subsequent retry with stale expectedPreviousVersion=4 must return explicit 409 CONCURRENT_MODIFICATION_CONFLICT
  await assert.rejects(
    () =>
      h.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
        makeChangeInput({
          targetProvisionId: prov.id,
          enactingSourceId: src.id,
          expectedPreviousVersion: 4,
          effectiveFromIso: '2029-03-01',
          changeSummary: 'تلاش مجدد با نسخه کهنه ۴',
        }),
        REVIEWER_ACTOR,
      ),
    assertLrError('CONCURRENT_MODIFICATION_CONFLICT', 409),
  );
  assert.equal((await h.store.getProvisionById(prov.id))?.version, 5);
  assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.CHANGE_HISTORY), changesBeforeRace + 1);
});

test('LR-CORE-043: DeterministicLegalRegulatoryStore mid-tx failure injection rolls back entity, ChangeRecord, and Audit atomically', async () => {
  const testStore = new DeterministicLegalRegulatoryStore();
  const mod = createTestLegalRegulatoryModule({ store: testStore });
  const src = await mod.sourceAndProvisionService.createRegulatorySource(makeSourceInput({ id: 'src_mem_1' }), ADMIN_ACTOR);
  const doc = await mod.sourceAndProvisionService.createRegulatoryDocument(
    makeDocInput({ id: 'doc_mem_1', sourceId: src.id }),
    ADMIN_ACTOR,
  );
  const prov = await mod.sourceAndProvisionService.createRegulatoryProvision(
    makeProvisionInput({ id: 'prov_mem_1', sourceId: src.id, documentId: doc.id }),
    ADMIN_ACTOR,
  );

  testStore.simulateNextTransactionFailureOnKind('AUDIT');
  await assert.rejects(
    () =>
      mod.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
        makeChangeInput({ targetProvisionId: prov.id, enactingSourceId: src.id, expectedPreviousVersion: 1, idempotencyKey: 'idem-mem-rb' }),
        ADMIN_ACTOR,
      ),
    assertLrError('PERSISTENCE_UNAVAILABLE', 503),
  );
  assert.equal((await testStore.getProvisionById(prov.id))?.version, 1);
  assert.equal((await testStore.listChangeRecordsForProvision(prov.id)).length, 0);
  // Failed transaction did NOT persist idempotencyKey, so retry with same key succeeds
  const retried = await mod.sourceAndProvisionService.recordRegulatoryChangeAndVersion(
    makeChangeInput({ targetProvisionId: prov.id, enactingSourceId: src.id, expectedPreviousVersion: 1, idempotencyKey: 'idem-mem-rb' }),
    ADMIN_ACTOR,
  );
  assert.equal(retried.updatedProvision.version, 2);
});

test('LR-CORE-044: Production and facade factories reject in-memory stores/adapters and enforce explicit dependencies', () => {
  assert.throws(
    () => createProductionLegalRegulatoryModule({ propertyContextAdapter: null as never }),
    assertLrError('VALIDATION_ERROR', 400),
  );
  assert.throws(
    () =>
      createProductionLegalRegulatoryModule({
        propertyContextAdapter: new ReadOnlyInMemoryPropertyContextAdapter([]),
      }),
    assertLrError('VALIDATION_ERROR', 400),
  );
  assert.throws(
    () =>
      createProductionLegalRegulatoryModule({
        store: new DeterministicLegalRegulatoryStore() as never,
        propertyContextAdapter: PROD_PROPERTY_ADAPTER,
      }),
    assertLrError('VALIDATION_ERROR', 400),
  );
  assert.throws(
    () => createLegalRegulatoryModuleFacade({ useInMemoryStore: true }),
    assertLrError('VALIDATION_ERROR', 400),
  );

  const defaultFacade = createLegalRegulatoryModuleFacade();
  assert.ok(defaultFacade.store instanceof FirestoreLegalRegulatoryStore);

  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(
      () => createLegalRegulatoryModuleFacade({ store: new DeterministicLegalRegulatoryStore() }),
      assertLrError('VALIDATION_ERROR', 400),
    );
    assert.throws(
      () =>
        createLegalRegulatoryModuleFacade({
          propertyContextAdapter: new ReadOnlyInMemoryPropertyContextAdapter([]),
        }),
      assertLrError('VALIDATION_ERROR', 400),
    );
  } finally {
    if (prevEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevEnv;
  }
});

test('LR-CORE-045: firestore.rules denies client access on all 10 collections, blueprint registers all 10, server.ts mounts once, and unifiedPlatformRoutes has zero parallel routes', () => {
  const root = process.cwd();
  const rulesText = fs.readFileSync(path.resolve(root, 'firestore.rules'), 'utf8');
  const blueprint = JSON.parse(fs.readFileSync(path.resolve(root, 'firebase-blueprint.json'), 'utf8')) as {
    firestore: Record<string, { schema: { $ref: string } }>;
    entities: Record<string, unknown>;
  };

  const allCollections = Object.values(LEGAL_REGULATORY_COLLECTIONS);
  assert.equal(allCollections.length, 10);
  for (const col of allCollections) {
    const rulePattern = new RegExp(`match\\s+/${col}/\\{docId\\}\\s*\\{\\s*allow\\s+read,\\s*write:\\s*if\\s+false;\\s*\\}`);
    assert.match(rulesText, rulePattern, `firestore.rules must explicitly deny client read/write for ${col}`);
    const bpPath = `/${col}/{docId}`;
    assert.ok(blueprint.firestore[bpPath], `firebase-blueprint.json must register ${bpPath}`);
    const refName = blueprint.firestore[bpPath].schema.$ref.replace('#/entities/', '');
    assert.ok(blueprint.entities[refName], `firebase-blueprint.json must define entity ${refName}`);
  }

  const serverText = fs.readFileSync(path.resolve(root, 'server.ts'), 'utf8');
  const unifiedText = fs.readFileSync(
    path.resolve(root, 'server/modules/platform-foundation/unifiedPlatformRoutes.ts'),
    'utf8',
  );
  const mountCalls = serverText.match(/registerLegalRegulatoryRoutes\(/g) ?? [];
  assert.equal(mountCalls.length, 1, 'server.ts must mount registerLegalRegulatoryRoutes exactly once');
  assert.equal(
    unifiedText.includes('/api/v1/legal-regulatory') ||
      unifiedText.includes('/api/legal-regulatory') ||
      unifiedText.includes('registerLegalRegulatoryRoutes'),
    false,
    'unifiedPlatformRoutes.ts must NOT define parallel legal-regulatory routes',
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FirestoreReadOnlyPropertyRegistryAdapter,
  ReadOnlyInMemoryPropertyContextAdapter,
  validatePropertyCharacteristicsSnapshot,
} from '../adapters';
import { FirestoreLegalRegulatoryStore } from '../firestoreStore';
import { FirestoreLegalRegulatoryTransactionRunner } from '../firestoreTransactionRunner';
import { createProductionLegalRegulatoryModule } from '../index';
import { LegalRegulatoryError } from '../validationAndAuthz';
import { PropertyRegistryService } from '../../property-registry/service';
import type { PropertyRegistryModuleDependencies, StoredPropertyAsset } from '../../property-registry/types';
import { TransactionalFirestoreMock } from './firestoreMockHarness';

const FIXED_NOW = () => new Date('2025-06-01T12:00:00.000Z');

async function seedCanonicalProperty(
  mockDb: TransactionalFirestoreMock,
  propertyId: string,
  ownerUid: string,
  overrides: Record<string, unknown> = {},
) {
  const doc: Record<string, unknown> = {
    id: propertyId,
    canonicalId: propertyId,
    ownerUid,
    ownerFullName: 'علی رضایی (محرمانه)',
    ownerPhone: '09120001122',
    ownerNationalId: '0012345678',
    deedNumber: 'DEED-SECRET-9988',
    category: 'residential_apartment',
    landUseCategory: 'RESIDENTIAL_TARAKOM_MOTAVASET',
    geographicRef: {
      provinceId: 'tehran',
      cityId: 'tehran',
      districtNumber: 2,
      neighborhoodCompositeId: 'سعادت‌آباد',
    },
    totalFloors: 6,
    landAreaSqm: 380,
    constructionYear: 1398,
    isWornOutTextureBaftFarsoodeh: false,
    isNearActiveFaultLine: false,
    exactLocationPrivate: {
      latitude: 35.7812,
      longitude: 51.3755,
      postalCode: '1997912345',
      exactUnitAddress: 'تهران، سعادت‌آباد، پلاک محرمانه ۲۲، واحد ۴',
    },
    ...overrides,
  };
  await mockDb.collection('property_registry_entities').doc(propertyId).set(doc);
  return doc;
}

function makeMockRegistryService(
  asset: StoredPropertyAsset | null,
  options?: {
    hasOwnership?: boolean;
    hasRep?: boolean;
    throwOnRead?: Error;
  },
) {
  const writeCalls: string[] = [];
  const deps = {
    repository: {
      async getAsset(id: string) {
        if (options?.throwOnRead) throw options.throwOnRead;
        return asset && asset.id === id ? structuredClone(asset) : null;
      },
      async getHistoryRecords() {
        return [];
      },
      async saveAsset() {
        writeCalls.push('saveAsset');
      },
      async saveHistoryRecord() {
        writeCalls.push('saveHistoryRecord');
      },
    },
    ownershipAuthorizationReader: {
      async isActorAuthorizedForProperty() {
        return Boolean(options?.hasOwnership || options?.hasRep);
      },
    },
  } as unknown as PropertyRegistryModuleDependencies;
  return { service: new PropertyRegistryService(deps), writeCalls };
}

function makeSamplePropertyEntity(id: string, createdByUid: string): StoredPropertyAsset {
  return {
    id,
    schemaVersion: 1,
    status: 'active',
    category: 'residential_apartment',
    title: 'واحد مسکونی تست',
    geographicRef: {
      cityId: 'tehran',
      districtId: 2,
      hoodId: 12,
    },
    exactLocationPrivate: {
      latitude: 35.7812,
      longitude: 51.3755,
      exactUnitAddress: 'آدرس محرمانه کامل',
      postalCode: '1997912345',
    },
    areaSqm: 145,
    landAreaSqm: 380,
    totalFloors: 6,
    constructionYear: 1398,
    provenance: {
      sourceType: 'user_submission',
      verificationStatus: 'verified',
      createdAtIso: '2024-01-01T00:00:00.000Z',
      updatedAtIso: '2024-01-01T00:00:00.000Z',
      recordedByUid: createdByUid,
    },
    createdAtIso: '2024-01-01T00:00:00.000Z',
    updatedAtIso: '2024-01-01T00:00:00.000Z',
    createdByUid,
  } as unknown as StoredPropertyAsset;
}

// ============================================================================
// STAGE 30-B UNIT & CONTRACT TESTS (LR-30B-001 .. LR-30B-018)
// ============================================================================

test('LR-30B-001: Authorized property owner reads canonical snapshot (FOUND)', async () => {
  const mockDb = new TransactionalFirestoreMock();
  await seedCanonicalProperty(mockDb, 'prop_b001', 'uid_owner_01');
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });

  const res = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_b001', actorId: 'uid_owner_01' });
  assert.equal(res.status, 'FOUND');
  assert.equal(res.snapshot.propertyId, 'prop_b001');
  assert.equal(res.snapshot.cityId, 'tehran');
  assert.equal(res.snapshot.districtNumber, 2);
  assert.equal(res.snapshot.propertyCategory, 'RESIDENTIAL_APARTMENT');
  assert.equal(res.snapshot.landUseCategory, 'RESIDENTIAL_TARAKOM_MOTAVASET');
  assert.equal(res.snapshot.floorsCount, 6);
  assert.equal(res.snapshot.plotAreaSqm, 380);
  assert.equal(typeof res.snapshot.buildingAgeYears, 'number');
});

test('LR-30B-002: Non-owner actor receives FORBIDDEN', async () => {
  const mockDb = new TransactionalFirestoreMock();
  await seedCanonicalProperty(mockDb, 'prop_b002', 'uid_owner_01');
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });

  const res = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_b002', actorId: 'uid_stranger_99' });
  assert.deepEqual(res, { status: 'FORBIDDEN' });
});

test('LR-30B-003: Unauthorized representative and backend admin UID without ownership receive FORBIDDEN (no blanket admin bypass)', async () => {
  const mockDb = new TransactionalFirestoreMock();
  await seedCanonicalProperty(mockDb, 'prop_b003', 'uid_owner_01', {
    authorizedRepresentatives: [{ actorUid: 'uid_revoked_rep', status: 'REVOKED', expiresAtIso: '2026-01-01T00:00:00.000Z' }],
  });
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });

  const revokedRes = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_b003', actorId: 'uid_revoked_rep' });
  assert.deepEqual(revokedRes, { status: 'FORBIDDEN' });

  const adminWithoutOwnership = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_b003', actorId: 'uid_admin_verified_01' });
  assert.deepEqual(adminWithoutOwnership, { status: 'FORBIDDEN' });
});

test('LR-30B-004: Missing propertyId returns NOT_FOUND', async () => {
  const mockDb = new TransactionalFirestoreMock();
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });

  const res = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_does_not_exist', actorId: 'uid_owner_01' });
  assert.deepEqual(res, { status: 'NOT_FOUND' });
});

test('LR-30B-005: Invalid propertyId (empty, traversal, >128 chars) throws 400 VALIDATION_ERROR', async () => {
  const mockDb = new TransactionalFirestoreMock();
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });

  for (const badId of ['', '   ', '../secret', 'a'.repeat(129)]) {
    await assert.rejects(
      () => adapter.getPropertyCharacteristicsById({ propertyId: badId, actorId: 'uid_owner_01' }),
      (err: unknown) => err instanceof LegalRegulatoryError && err.statusCode === 400 && err.code === 'VALIDATION_ERROR',
    );
  }
});

test('LR-30B-006: Firestore outage throws fail-closed 503 PERSISTENCE_UNAVAILABLE without memory fallback', async () => {
  const mockDb = new TransactionalFirestoreMock();
  mockDb.failNextReadError = new Error('FIRESTORE_INTERNAL_UNAVAILABLE_10.9.0.1');
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });

  await assert.rejects(
    () => adapter.getPropertyCharacteristicsById({ propertyId: 'prop_b006', actorId: 'uid_owner_01' }),
    (err: unknown) => err instanceof LegalRegulatoryError && err.statusCode === 503 && err.code === 'PERSISTENCE_UNAVAILABLE',
  );
});

test('LR-30B-007: Private coordinates, postalCode, exact address, and deedNumber are stripped from snapshot', async () => {
  const mockDb = new TransactionalFirestoreMock();
  await seedCanonicalProperty(mockDb, 'prop_b007', 'uid_owner_01');
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });

  const res = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_b007', actorId: 'uid_owner_01' });
  assert.equal(res.status, 'FOUND');
  const serialized = JSON.stringify(res.snapshot);
  assert.equal(serialized.includes('1997912345'), false);
  assert.equal(serialized.includes('35.7812'), false);
  assert.equal(serialized.includes('51.3755'), false);
  assert.equal(serialized.includes('پلاک محرمانه'), false);
  assert.equal(serialized.includes('DEED-SECRET-9988'), false);
});

test('LR-30B-008: Production module factory rejects in-memory PropertyContext adapter fail-closed', () => {
  const mockDb = new TransactionalFirestoreMock();
  const store = new FirestoreLegalRegulatoryStore({
    transactionRunner: new FirestoreLegalRegulatoryTransactionRunner(mockDb.asAdminFirestore()),
  });
  const memAdapter = new ReadOnlyInMemoryPropertyContextAdapter();

  assert.throws(
    () => createProductionLegalRegulatoryModule({ store, propertyContextAdapter: memAdapter }),
    (err: unknown) => err instanceof LegalRegulatoryError && err.statusCode === 400,
  );
});

test('LR-30B-009: Forged or system-token actorIds are strictly rejected with FORBIDDEN', async () => {
  const mockDb = new TransactionalFirestoreMock();
  await seedCanonicalProperty(mockDb, 'prop_b009', 'uid_owner_01');
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });

  for (const badActor of ['', 'anonymous', 'anonymous-public-reader', 'server-secret-admin', 'system-admin-key']) {
    const res = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_b009', actorId: badActor });
    assert.deepEqual(res, { status: 'FORBIDDEN' });
  }
});

test('LR-30B-010: Snapshot identity mismatch (canonicalId !== requested propertyId) throws 422 SNAPSHOT_INCONSISTENT', async () => {
  const mockDb = new TransactionalFirestoreMock();
  await seedCanonicalProperty(mockDb, 'prop_b010', 'uid_owner_01', { canonicalId: 'prop_different_999' });
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });

  await assert.rejects(
    () => adapter.getPropertyCharacteristicsById({ propertyId: 'prop_b010', actorId: 'uid_owner_01' }),
    (err: unknown) => err instanceof LegalRegulatoryError && err.statusCode === 422 && err.code === 'SNAPSHOT_INCONSISTENT',
  );
});

test('LR-30B-011: validatePropertyCharacteristicsSnapshot flags missing core fields and invalid attributes', () => {
  const incomplete = validatePropertyCharacteristicsSnapshot('prop_inc', { propertyId: 'prop_inc' });
  assert.equal(incomplete.identityValid, true);
  assert.equal(incomplete.attributesValid, true);
  assert.deepEqual(incomplete.missingCoreFields, ['geography', 'propertyCategory', 'plotAreaSqm', 'floorsCount']);

  const corrupt = validatePropertyCharacteristicsSnapshot('prop_bad', {
    propertyId: 'prop_bad',
    plotAreaSqm: -50,
    floorsCount: -2,
    districtNumber: 0,
  });
  assert.equal(corrupt.attributesValid, false);
  assert.ok(corrupt.issues.length >= 3);
});

test('LR-30B-012: PropertyRegistryService authorization error propagates cleanly as 503 PERSISTENCE_UNAVAILABLE', async () => {
  const { service } = makeMockRegistryService(null, { throwOnRead: new Error('BACKEND_STORAGE_OFFLINE') });
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ propertyRegistryService: service, nowFn: FIXED_NOW });

  await assert.rejects(
    () => adapter.getPropertyCharacteristicsById({ propertyId: 'prop_b012', actorId: 'uid_owner_01' }),
    (err: unknown) => err instanceof LegalRegulatoryError && err.statusCode === 503 && err.code === 'PERSISTENCE_UNAVAILABLE',
  );
});

test('LR-30B-013: Active non-expired representative grant allows read (FOUND)', async () => {
  const mockDb = new TransactionalFirestoreMock();
  await seedCanonicalProperty(mockDb, 'prop_b013', 'uid_owner_01', {
    authorizedRepresentatives: [
      { actorUid: 'uid_active_rep_01', status: 'ACTIVE', expiresAtIso: '2026-01-01T00:00:00.000Z' },
    ],
  });
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });

  const res = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_b013', actorId: 'uid_active_rep_01' });
  assert.equal(res.status, 'FOUND');
  assert.equal(res.snapshot.propertyId, 'prop_b013');
});

test('LR-30B-014: Expired representative grant is rejected with FORBIDDEN', async () => {
  const mockDb = new TransactionalFirestoreMock();
  await seedCanonicalProperty(mockDb, 'prop_b014', 'uid_owner_01', {
    authorizedRepresentatives: [
      { actorUid: 'uid_expired_rep_01', status: 'ACTIVE', expiresAtIso: '2025-05-01T00:00:00.000Z' },
    ],
  });
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });

  const res = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_b014', actorId: 'uid_expired_rep_01' });
  assert.deepEqual(res, { status: 'FORBIDDEN' });
});

test('LR-30B-015: Adapter prototype exposes zero write methods and PropertyRegistryService performs zero writes', async () => {
  const protoMethods = Object.getOwnPropertyNames(FirestoreReadOnlyPropertyRegistryAdapter.prototype);
  assert.equal(
    protoMethods.some((m) => /^(set|put|save|create|update|delete|write|remove|mutate|patch)/i.test(m)),
    false,
  );

  const entity = makeSamplePropertyEntity('prop_b015', 'uid_owner_01');
  const { service, writeCalls } = makeMockRegistryService(entity, { hasOwnership: true });
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ propertyRegistryService: service, nowFn: FIXED_NOW });
  const res = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_b015', actorId: 'uid_owner_01' });
  assert.equal(res.status, 'FOUND');
  assert.deepEqual(writeCalls, []);
});

test('LR-30B-016: Zero owner PII (ownerUid, ownerPhone, ownerFullName, ownerNationalId) leaks in snapshot', async () => {
  const mockDb = new TransactionalFirestoreMock();
  await seedCanonicalProperty(mockDb, 'prop_b016', 'uid_owner_secret_01');
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });

  const res = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_b016', actorId: 'uid_owner_secret_01' });
  assert.equal(res.status, 'FOUND');
  const serialized = JSON.stringify(res.snapshot);
  assert.equal(serialized.includes('uid_owner_secret_01'), false);
  assert.equal(serialized.includes('09120001122'), false);
  assert.equal(serialized.includes('علی رضایی'), false);
  assert.equal(serialized.includes('0012345678'), false);
});

test('LR-30B-017: PropertyRegistryService.authorizePropertyContextRead delegates ownership/rep checks cleanly without exposing exactLocation', async () => {
  const entity = makeSamplePropertyEntity('prop_b017', 'uid_creator_other');
  const { service: allowedSvc } = makeMockRegistryService(entity, { hasRep: true });
  const allowed = await allowedSvc.authorizePropertyContextRead({
    propertyId: 'prop_b017',
    actorId: 'uid_delegate_01',
    nowIso: '2025-06-01T12:00:00.000Z',
  });
  assert.equal(allowed.status, 'FOUND');
  assert.equal(JSON.stringify(allowed.snapshot).includes('1997912345'), false);
  assert.equal(JSON.stringify(allowed.snapshot).includes('آدرس محرمانه'), false);

  const { service: deniedSvc } = makeMockRegistryService(entity, { hasOwnership: false, hasRep: false });
  const denied = await deniedSvc.authorizePropertyContextRead({
    propertyId: 'prop_b017',
    actorId: 'uid_stranger_01',
    nowIso: '2025-06-01T12:00:00.000Z',
  });
  assert.deepEqual(denied, { status: 'FORBIDDEN', authorized: false, snapshot: null });
});

test('LR-30B-018: Failure during ownership_interests query fails closed with 503 PERSISTENCE_UNAVAILABLE', async () => {
  const mockDb = new TransactionalFirestoreMock();
  await seedCanonicalProperty(mockDb, 'prop_b018', 'uid_owner_01');
  const rawDb = mockDb.asAdminFirestore();
  const originalCollection = mockDb.collection.bind(mockDb);
  // Fail specifically when querying property_ownership_interests_v1
  (mockDb as unknown as { collection: (name: string) => unknown }).collection = (name: string) => {
    if (name === 'property_ownership_interests_v1') {
      return {
        where: () => ({
          limit: () => ({
            get: async () => {
              throw new Error('OWNERSHIP_COLLECTION_READ_TIMEOUT');
            },
          }),
        }),
      };
    }
    return originalCollection(name);
  };

  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: rawDb, nowFn: FIXED_NOW });
  await assert.rejects(
    () => adapter.getPropertyCharacteristicsById({ propertyId: 'prop_b018', actorId: 'uid_non_direct_owner' }),
    (err: unknown) => err instanceof LegalRegulatoryError && err.statusCode === 503 && err.code === 'PERSISTENCE_UNAVAILABLE',
  );
});

// ============================================================================
// STAGE 30-B EMULATOR / FIRESTORE EQUIVALENT SCENARIOS (LR-30B-EMU-001 .. 008)
// ============================================================================

test('LR-30B-EMU-001: Firestore ownership interest collection grants read to active co-owner', async () => {
  const mockDb = new TransactionalFirestoreMock();
  await seedCanonicalProperty(mockDb, 'prop_emu_01', 'uid_primary_owner');
  await mockDb.collection('property_ownership_interests_v1').doc('own_01').set({
    id: 'own_01',
    propertyId: 'prop_emu_01',
    partyRef: { partyId: 'uid_co_owner_02', partyType: 'NATURAL_PERSON' },
    status: 'ACTIVE',
    statusVector: { verificationStatus: 'VERIFIED' },
  });
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });
  const res = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_emu_01', actorId: 'uid_co_owner_02' });
  assert.equal(res.status, 'FOUND');
  assert.equal(res.snapshot.propertyId, 'prop_emu_01');
});

test('LR-30B-EMU-002: Non-owner with zero rights docs receives FORBIDDEN', async () => {
  const mockDb = new TransactionalFirestoreMock();
  await seedCanonicalProperty(mockDb, 'prop_emu_02', 'uid_primary_owner');
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });
  const res = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_emu_02', actorId: 'uid_unrelated' });
  assert.deepEqual(res, { status: 'FORBIDDEN' });
});

test('LR-30B-EMU-003: Active non-ownership right (power of attorney / representative) grants read', async () => {
  const mockDb = new TransactionalFirestoreMock();
  await seedCanonicalProperty(mockDb, 'prop_emu_03', 'uid_primary_owner');
  await mockDb.collection('property_non_ownership_rights_v1').doc('right_01').set({
    id: 'right_01',
    propertyId: 'prop_emu_03',
    beneficiaryParty: { partyId: 'uid_legal_rep_03' },
    status: 'ACTIVE',
    statusVector: { verificationStatus: 'VERIFIED' },
    expirationOrTerminationIso: '2026-12-31T00:00:00.000Z',
  });
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });
  const res = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_emu_03', actorId: 'uid_legal_rep_03' });
  assert.equal(res.status, 'FOUND');
});

test('LR-30B-EMU-004: Expired or rejected non-ownership right denies read (FORBIDDEN)', async () => {
  const mockDb = new TransactionalFirestoreMock();
  await seedCanonicalProperty(mockDb, 'prop_emu_04', 'uid_primary_owner');
  await mockDb.collection('property_non_ownership_rights_v1').doc('right_exp').set({
    id: 'right_exp',
    propertyId: 'prop_emu_04',
    beneficiaryParty: { partyId: 'uid_exp_rep_04' },
    status: 'ACTIVE',
    statusVector: { verificationStatus: 'VERIFIED' },
    expirationOrTerminationIso: '2024-01-01T00:00:00.000Z',
  });
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });
  const res = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_emu_04', actorId: 'uid_exp_rep_04' });
  assert.deepEqual(res, { status: 'FORBIDDEN' });
});

test('LR-30B-EMU-005: Missing property document across canonical & asset collections returns NOT_FOUND', async () => {
  const mockDb = new TransactionalFirestoreMock();
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });
  const res = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_emu_missing', actorId: 'uid_primary_owner' });
  assert.deepEqual(res, { status: 'NOT_FOUND' });
});

test('LR-30B-EMU-006: Runtime ownership revocation immediately revokes access on subsequent call', async () => {
  const mockDb = new TransactionalFirestoreMock();
  await seedCanonicalProperty(mockDb, 'prop_emu_06', 'uid_primary_owner');
  await mockDb.collection('property_ownership_interests_v1').doc('own_revoke').set({
    id: 'own_revoke',
    propertyId: 'prop_emu_06',
    partyRef: { partyId: 'uid_dynamic_owner' },
    status: 'ACTIVE',
    statusVector: { verificationStatus: 'VERIFIED' },
  });
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });
  const before = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_emu_06', actorId: 'uid_dynamic_owner' });
  assert.equal(before.status, 'FOUND');

  // Revoke ownership at runtime
  await mockDb.collection('property_ownership_interests_v1').doc('own_revoke').set({
    id: 'own_revoke',
    propertyId: 'prop_emu_06',
    partyRef: { partyId: 'uid_dynamic_owner' },
    status: 'TERMINATED',
    terminatedAtIso: '2025-06-01T11:59:00.000Z',
    statusVector: { verificationStatus: 'RELEASED' },
  });
  const after = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_emu_06', actorId: 'uid_dynamic_owner' });
  assert.deepEqual(after, { status: 'FORBIDDEN' });
});

test('LR-30B-EMU-007: Firestore disconnect fails closed with 503 PERSISTENCE_UNAVAILABLE', async () => {
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: null, nowFn: FIXED_NOW });
  await assert.rejects(
    () => adapter.getPropertyCharacteristicsById({ propertyId: 'prop_emu_07', actorId: 'uid_owner' }),
    (err: unknown) => err instanceof LegalRegulatoryError && err.statusCode === 503 && err.code === 'PERSISTENCE_UNAVAILABLE',
  );
});

test('LR-30B-EMU-008: Authorized read executes ZERO mutations on Property Registry documents', async () => {
  const mockDb = new TransactionalFirestoreMock();
  const seeded = await seedCanonicalProperty(mockDb, 'prop_emu_08', 'uid_owner_08');
  const beforeSnapshot = mockDb.getRawDoc('property_registry_entities', 'prop_emu_08');
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: mockDb.asAdminFirestore(), nowFn: FIXED_NOW });

  const res = await adapter.getPropertyCharacteristicsById({ propertyId: 'prop_emu_08', actorId: 'uid_owner_08' });
  assert.equal(res.status, 'FOUND');
  assert.equal(mockDb.txCommitCount, 0);
  assert.deepEqual(mockDb.getRawDoc('property_registry_entities', 'prop_emu_08'), beforeSnapshot);
  assert.deepEqual(beforeSnapshot, seeded);
});

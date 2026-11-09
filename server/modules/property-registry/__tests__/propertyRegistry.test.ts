import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  TransactionRunnerAdapter,
} from '../../core';
import {
  evaluateAssetDuplicateCandidate,
  validateListingToAssetMatch,
} from '../duplicateAndRelationshipEngine';
import {
  sanitizeAssetForPublicView,
  validateCreatePropertyAssetInput,
} from '../lifecycleAndValidation';
import { PropertyRegistryService } from '../service';
import type {
  BargainsListingConsumerAdapter,
  GeographyReferenceAdapter,
  PropertyRegistryRepositoryAdapter,
  StoredAssetHistoryRecord,
  StoredAssetListingLink,
  StoredBuilding,
  StoredBuildingUnit,
  StoredDuplicateMatchCandidate,
  StoredLandParcel,
  StoredPropertyAsset,
} from '../types';

class InMemoryPropertyRegistryRepository implements PropertyRegistryRepositoryAdapter {
  public assets = new Map<string, StoredPropertyAsset>();
  public buildings = new Map<string, StoredBuilding>();
  public units = new Map<string, StoredBuildingUnit>();
  public parcels = new Map<string, StoredLandParcel>();
  public links = new Map<string, StoredAssetListingLink>();
  public candidates = new Map<string, StoredDuplicateMatchCandidate>();
  public history: StoredAssetHistoryRecord[] = [];

  async saveAsset(asset: StoredPropertyAsset) { this.assets.set(asset.id, { ...asset }); }
  async getAsset(id: string) { return this.assets.get(id) ?? null; }
  async queryAssetsByNeighborhood(cityId: string, hoodId: number) {
    return Array.from(this.assets.values()).filter(
      (a) => a.geographicRef.cityId === cityId && a.geographicRef.hoodId === hoodId,
    );
  }
  async saveBuilding(building: StoredBuilding) { this.buildings.set(building.id, { ...building }); }
  async getBuilding(id: string) { return this.buildings.get(id) ?? null; }
  async saveUnit(unit: StoredBuildingUnit) { this.units.set(unit.id, { ...unit }); }
  async getUnitsByBuilding(buildingId: string) {
    return Array.from(this.units.values()).filter((u) => u.parentBuildingId === buildingId);
  }
  async saveParcel(parcel: StoredLandParcel) { this.parcels.set(parcel.id, { ...parcel }); }
  async getParcel(id: string) { return this.parcels.get(id) ?? null; }
  async saveListingLink(link: StoredAssetListingLink) { this.links.set(link.id, { ...link }); }
  async deleteListingLink(linkId: string) { this.links.delete(linkId); }
  async getListingLinksByAsset(assetId: string) {
    return Array.from(this.links.values()).filter((l) => l.assetId === assetId);
  }
  async saveDuplicateCandidate(cand: StoredDuplicateMatchCandidate) { this.candidates.set(cand.id, { ...cand }); }
  async getDuplicateCandidate(id: string) { return this.candidates.get(id) ?? null; }
  async saveHistoryRecord(record: StoredAssetHistoryRecord) { this.history.push({ ...record }); }
  async getHistoryRecords(assetId: string) {
    return this.history.filter((h) => h.assetId === assetId);
  }
}

function setupTestService(overrides?: {
  neighborhoodExists?: boolean;
  listingSummary?: { id: string; cityId: string; hoodId: number; sqm: number; floor?: number } | null;
}) {
  const repo = new InMemoryPropertyRegistryRepository();
  const txRunner: TransactionRunnerAdapter = {
    async runTransaction(fn) { return fn({ async get() { return { exists: false }; }, set() {}, update() {}, delete() {} }); },
  };
  const idempotencyStore: IdempotencyStoreAdapter = {
    async acquireLock(params) {
      return {
        state: 'ACQUIRED',
        record: {
          key: params.scopedKey,
          actorUid: params.actorUid,
          operation: params.operation,
          payloadHash: params.payloadHash,
          status: 'IN_PROGRESS',
          createdAtIso: new Date().toISOString(),
          updatedAtIso: new Date().toISOString(),
          expiresAtEpochMs: Date.now() + 60000,
        },
      };
    },
    async markCompleted() {},
    async releaseOnFailure() {},
  };
  const auditSink = { async writeAuditEvent() {} };
  const tokenVerifier: FirebaseTokenVerifierAdapter = {
    async verifyIdToken() { return { uid: 'user_u1', email_verified: true }; },
  };
  const adminStore: DelegatedAdminStoreAdapter = {
    async getDelegatedAdminByUid() { return null; },
  };

  const geographyAdapter: GeographyReferenceAdapter = {
    async verifyNeighborhoodExists(_city, hoodId) {
      if (overrides?.neighborhoodExists === false || hoodId === 999) {
        return { exists: false };
      }
      return { exists: true, hoodName: 'سعادت‌آباد' };
    },
  };

  const bargainsAdapter: BargainsListingConsumerAdapter = {
    async getListingSummary(id) {
      if (overrides?.listingSummary !== undefined) return overrides.listingSummary;
      return {
        id,
        cityId: 'tehran',
        hoodId: 10,
        sqm: 120,
        floor: 3,
      };
    },
  };

  const service = new PropertyRegistryService({
    tokenVerifier,
    adminStore,
    txRunner,
    idempotencyStore,
    auditSink,
    repository: repo,
    geographyAdapter,
    bargainsAdapter,
  });

  return { service, repo };
}

test('1. Property Asset creation, category validation & exact location privacy', async () => {
  const { service } = setupTestService();

  // 1a: Creating asset with non-existent neighborhood fails 404
  await assert.rejects(
    async () => {
      await service.createAsset({
        input: {
          category: 'residential_apartment',
          cityId: 'tehran',
          hoodId: 999, // Non-existent
          areaSqm: 120,
        },
        actorUid: 'user_u1',
      });
    },
    { message: /Neighborhood 999 in city "tehran" does not exist/ },
  );

  // 1b: Valid residential apartment creation
  const asset = await service.createAsset({
    input: {
      category: 'residential_apartment',
      cityId: 'tehran',
      hoodId: 10,
      areaSqm: 125,
      floorNumber: 3,
      totalFloors: 5,
      roomCount: 2,
      constructionYear: 1398,
      hasParking: true,
      hasElevator: true,
      postalCode: '1998765432',
      exactUnitAddress: 'پلاک ۲۲، زنگ ۴',
    },
    actorUid: 'user_u1',
  });

  assert.equal(asset.category, 'residential_apartment');
  assert.equal(asset.areaSqm, 125);
  assert.equal(asset.floorNumber, 3);
  assert.equal(asset.exactLocationPrivate?.postalCode, '1998765432');

  // 1c: Public view masks exact location and internal details
  const publicView = sanitizeAssetForPublicView(asset);
  assert.equal('exactLocationPrivate' in publicView, false);
  assert.equal('aliases' in publicView, false);
  assert.equal(publicView.areaSqm, 125);
  assert.equal(publicView.floorNumber, 3);
});

test('2. Building and Unit registry: multi-unit buildings and duplicate unit prevention', async () => {
  const { service } = setupTestService();

  // 2a: Create building
  const building = await service.createBuilding({
    input: {
      buildingType: 'residential',
      cityId: 'tehran',
      hoodId: 10,
      nameOrTitle: 'ساختمان الماس',
      totalFloors: 6,
      unitsCount: 12,
      constructionYear: 1400,
    },
    actorUid: 'admin_1',
  });
  assert.equal(building.nameOrTitle, 'ساختمان الماس');

  // 2b: Register unit in building
  const unit1 = await service.registerUnit({
    input: {
      parentBuildingId: building.id,
      unitNumberOrRef: 'واحد ۱۰۲',
      floor: 1,
      areaSqm: 110,
      usageType: 'residential',
      roomCount: 2,
    },
    actorUid: 'admin_1',
  });
  assert.equal(unit1.parentBuildingId, building.id);
  assert.equal(unit1.unitNumberOrRef, 'واحد ۱۰۲');

  // 2c: Registering duplicate unit in same building on same floor is rejected (409 Conflict)
  await assert.rejects(
    async () => {
      await service.registerUnit({
        input: {
          parentBuildingId: building.id,
          unitNumberOrRef: 'واحد ۱۰۲',
          floor: 1,
          areaSqm: 110,
          usageType: 'residential',
        },
        actorUid: 'admin_1',
      });
    },
    { message: /already exists in this building/ },
  );
});

test('3. Land Parcel registry and category validation invariants', async () => {
  const { service } = setupTestService();

  // 3a: Register land parcel
  const parcel = await service.registerLandParcel({
    input: {
      cityId: 'tehran',
      hoodId: 10,
      areaSqm: 450,
      landUseClassification: 'residential',
      zoningCode: 'R122',
      frontageMeters: 14,
    },
    actorUid: 'admin_1',
  });
  assert.equal(parcel.areaSqm, 450);
  assert.equal(parcel.landUseClassification, 'residential');

  // 3b: Validation rejects land parcel with apartment floor attributes
  const invalidLand = validateCreatePropertyAssetInput({
    category: 'land',
    cityId: 'tehran',
    hoodId: 10,
    areaSqm: 500,
    floorNumber: 2, // Contradictory: land has no apartment floor
  });
  assert.equal(invalidLand.ok, false);
  assert.equal(invalidLand.issues[0]?.field, 'category');
});

test('4. Duplicate candidate detection and non-destructive asset merging', async () => {
  const { service, repo } = setupTestService();

  // Create two similar assets in same neighborhood
  const assetPrimary = await service.createAsset({
    input: {
      category: 'residential_apartment',
      cityId: 'tehran',
      hoodId: 10,
      areaSqm: 120,
      floorNumber: 4,
      totalFloors: 5,
      constructionYear: 1399,
    },
    actorUid: 'user_u1',
  });

  const assetDuplicate = await service.createAsset({
    input: {
      category: 'residential_apartment',
      cityId: 'tehran',
      hoodId: 10,
      areaSqm: 121, // Within 1% difference
      floorNumber: 4, // Same floor
      totalFloors: 5,
      constructionYear: 1399,
    },
    actorUid: 'user_u2',
  });

  // 4a: Candidate detection scores similarity
  const evalRes = evaluateAssetDuplicateCandidate(assetPrimary, assetDuplicate);
  assert.equal(evalRes.isCandidate, true);
  assert.ok(evalRes.score >= 70);

  // 4b: Search duplicate candidates through service
  const candidates = await service.searchDuplicateCandidates(assetPrimary.id);
  assert.ok(candidates.length >= 1);
  const cand = candidates[0];

  // 4c: Admin approves merge: secondary is marked merged, primary gains alias
  const resolved = await service.resolveDuplicateCandidate({
    candidateId: cand.id,
    decision: 'approve_merge',
    primaryAssetId: assetPrimary.id,
    secondaryAssetId: assetDuplicate.id,
    actorUid: 'admin_reviewer',
  });
  assert.equal(resolved.status, 'approved_merged');

  const primaryAfter = await repo.getAsset(assetPrimary.id);
  const secondaryAfter = await repo.getAsset(assetDuplicate.id);

  assert.ok(primaryAfter?.aliases.includes(assetDuplicate.id));
  assert.equal(secondaryAfter?.status, 'merged');
  assert.equal(secondaryAfter?.mergedIntoAssetId, assetPrimary.id);
});

test('5. Listing-to-Asset linking, compatibility checks & unlinking', async () => {
  const { service, repo } = setupTestService();

  const asset = await service.createAsset({
    input: {
      category: 'residential_apartment',
      cityId: 'tehran',
      hoodId: 10,
      areaSqm: 120,
      floorNumber: 3,
    },
    actorUid: 'user_u1',
  });

  // 5a: Link compatible listing (120m², floor 3, hood 10)
  const link = await service.linkListingToAsset({
    assetId: asset.id,
    listingId: 'listing_bargain_101',
    actorUid: 'admin_1',
  });
  assert.equal(link.assetId, asset.id);
  assert.equal(link.listingId, 'listing_bargain_101');
  assert.equal(link.matchConfidence, 'high');

  // Verify link is stored
  const links = await repo.getListingLinksByAsset(asset.id);
  assert.equal(links.length, 1);

  // 5b: Incompatible area divergence rejection (>15% divergence)
  const incompatibleCheck = await validateListingToAssetMatch({
    asset,
    listingId: 'listing_huge',
    bargainsAdapter: {
      async getListingSummary(id) {
        return { id, cityId: 'tehran', hoodId: 10, sqm: 250 }; // 250m² vs 120m²
      },
    },
  });
  assert.equal(incompatibleCheck.compatible, false);
  assert.ok(incompatibleCheck.reason.includes('exceeds 15% threshold'));

  // 5c: Unlink listing from asset
  await service.unlinkListingFromAsset({
    assetId: asset.id,
    listingId: 'listing_bargain_101',
    actorUid: 'admin_1',
  });
  const linksAfter = await repo.getListingLinksByAsset(asset.id);
  assert.equal(linksAfter.length, 0);

  // History records exist for creation, link, and unlink
  const history = await service.getAssetHistory(asset.id);
  assert.ok(history.some((h) => h.changeType === 'created'));
  assert.ok(history.some((h) => h.changeType === 'listing_linked'));
  assert.ok(history.some((h) => h.changeType === 'listing_unlinked'));
});

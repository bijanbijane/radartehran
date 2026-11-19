import crypto from 'crypto';
import {
  CoreApiError,
  createStructuredAuditEvent,
} from '../core';
import {
  evaluateAssetDuplicateCandidate,
  validateListingToAssetMatch,
} from './duplicateAndRelationshipEngine';
import {
  sanitizeAssetForPublicView,
  validateCreateBuildingInput,
  validateCreatePropertyAssetInput,
  validateRegisterLandParcelInput,
  validateRegisterUnitInput,
  type CreateBuildingInput,
  type CreatePropertyAssetInput,
  type RegisterLandParcelInput,
  type RegisterUnitInput,
} from './lifecycleAndValidation';
import type {
  PropertyRegistryModuleDependencies,
  PublicPropertyAssetView,
  StoredAssetHistoryRecord,
  StoredAssetListingLink,
  StoredBuilding,
  StoredBuildingUnit,
  StoredDuplicateMatchCandidate,
  StoredLandParcel,
  StoredPropertyAsset,
} from './types';

export class PropertyRegistryService {
  constructor(private readonly deps: PropertyRegistryModuleDependencies) {}

  private nowIso(): string {
    return new Date(this.deps.nowFn ? this.deps.nowFn() : Date.now()).toISOString();
  }

  async createAsset(params: {
    input: CreatePropertyAssetInput;
    actorUid: string;
  }): Promise<StoredPropertyAsset> {
    const geoCheck = await this.deps.geographyAdapter.verifyNeighborhoodExists(
      params.input.cityId,
      params.input.hoodId,
    );
    if (!geoCheck.exists) {
      throw new CoreApiError(
        'NOT_FOUND',
        404,
        `Neighborhood ${params.input.hoodId} in city "${params.input.cityId}" does not exist.`,
      );
    }

    const nowIso = this.nowIso();
    const assetId = `ast_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const asset: StoredPropertyAsset = {
      id: assetId,
      category: params.input.category,
      subtype: params.input.subtype ?? 'standard',
      geographicRef: {
        cityId: params.input.cityId,
        hoodId: params.input.hoodId,
        districtId: params.input.districtId,
        streetText: params.input.streetText,
      },
      buildingId: params.input.buildingId,
      unitId: params.input.unitId,
      parcelId: params.input.parcelId,
      areaSqm: params.input.areaSqm,
      landAreaSqm: params.input.landAreaSqm,
      constructionYear: params.input.constructionYear,
      floorNumber: params.input.floorNumber,
      totalFloors: params.input.totalFloors,
      roomCount: params.input.roomCount,
      buildingCondition: params.input.buildingCondition,
      renovationStatus: params.input.renovationStatus,
      amenities: {
        hasParking: params.input.hasParking,
        hasElevator: params.input.hasElevator,
        hasStorage: params.input.hasStorage,
        hasBalcony: params.input.hasBalcony,
      },
      commercialCharacteristics: params.input.commercialPermitNumber || params.input.frontageMeters
        ? {
            commercialPermitNumber: params.input.commercialPermitNumber,
            frontageMeters: params.input.frontageMeters,
            ceilingHeightMeters: params.input.ceilingHeightMeters,
          }
        : undefined,
      status: 'active',
      aliases: [],
      provenance: {
        source: 'user_submission',
        verificationStatus: 'unverified',
        lastVerifiedAtIso: nowIso,
      },
      exactLocationPrivate: params.input.latitude || params.input.postalCode
        ? {
            latitude: params.input.latitude,
            longitude: params.input.longitude,
            postalCode: params.input.postalCode,
            exactUnitAddress: params.input.exactUnitAddress,
          }
        : undefined,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    await this.deps.repository.saveAsset(asset);

    await this.deps.repository.saveHistoryRecord({
      id: `hist_${crypto.randomUUID().slice(0, 8)}`,
      assetId,
      changeType: 'created',
      actorUid: params.actorUid,
      timestampIso: nowIso,
      newValues: { category: asset.category, areaSqm: asset.areaSqm },
      note: 'Canonical asset initialized.',
    });

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: { uid: params.actorUid, email: '', role: 'verified_user' },
        correlationId: `rt_ast_${assetId}`,
        action: 'property_registry.asset_created',
        targetCollection: 'propertyAssets',
        targetResourceId: assetId,
        outcome: 'SUCCESS',
        metadata: { category: asset.category, hoodId: asset.geographicRef.hoodId },
      }),
    );

    return asset;
  }

  async getAsset(id: string, viewer?: { isPrivileged: boolean }): Promise<StoredPropertyAsset | PublicPropertyAssetView> {
    const asset = await this.deps.repository.getAsset(id);
    if (!asset) {
      throw new CoreApiError('NOT_FOUND', 404, `Property asset "${id}" not found.`);
    }

    if (!viewer?.isPrivileged) {
      return sanitizeAssetForPublicView(asset);
    }
    return asset;
  }

  /**
   * Strictly read-only authorization and non-PII characteristic snapshot lookup for
   * cross-module legal-regulatory evaluation (Stage 30-B).
   * - Independently verifies (1) property existence and (2) registered ownership or
   *   active non-expired representative/delegated access for `actorId`.
   * - Never accepts headers/roles as ownership proof and never mutates any record.
   * - Omits exactLocationPrivate, postalCode, coordinates, exactUnitAddress, and owner PII.
   */
  async authorizePropertyContextRead(input: {
    propertyId: string;
    actorId: string;
    nowIso?: string;
  }): Promise<import('./types').PropertyContextReadAuthorizationResult> {
    const propertyId = typeof input?.propertyId === 'string' ? input.propertyId.trim() : '';
    const actorId = typeof input?.actorId === 'string' ? input.actorId.trim() : '';
    if (!propertyId || propertyId.length > 128 || /[/\s]/.test(propertyId) || propertyId.includes('..')) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid propertyId format.');
    }

    const asset = await this.deps.repository.getAsset(propertyId);
    if (!asset) {
      return { status: 'NOT_FOUND', authorized: false, snapshot: null };
    }
    if (asset.id !== propertyId) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        422,
        `Property Registry asset identity mismatch: requested "${propertyId}", loaded "${asset.id}".`,
      );
    }
    if (
      !actorId ||
      actorId === 'anonymous' ||
      actorId === 'anonymous-public-reader' ||
      actorId === 'server-secret-admin' ||
      actorId === 'system-admin-key'
    ) {
      return { status: 'FORBIDDEN', authorized: false, snapshot: null };
    }

    const nowIso = input.nowIso ?? this.nowIso();
    let authorized = false;

    if (this.deps.ownershipAuthorizationReader) {
      authorized = await this.deps.ownershipAuthorizationReader.isActorAuthorizedForProperty({
        propertyId,
        actorId,
        nowIso,
      });
    }

    if (!authorized && asset.status !== 'archived' && asset.status !== 'merged') {
      const history = await this.deps.repository.getHistoryRecords(propertyId);
      authorized = history.some((h) => h.changeType === 'created' && h.actorUid === actorId);
    }

    if (!authorized) {
      return { status: 'FORBIDDEN', authorized: false, snapshot: null };
    }

    const sanitized = sanitizeAssetForPublicView(asset);
    return {
      status: 'FOUND',
      authorized: true,
      snapshot: {
        propertyId: sanitized.id,
        category: sanitized.category,
        cityId: sanitized.geographicRef.cityId,
        districtNumber: sanitized.geographicRef.districtId,
        neighborhoodId: String(sanitized.geographicRef.hoodId),
        areaSqm: sanitized.areaSqm,
        landAreaSqm: sanitized.landAreaSqm,
        constructionYear: sanitized.constructionYear,
        totalFloors: sanitized.totalFloors,
        status: sanitized.status,
      },
    };
  }

  async createBuilding(params: {
    input: CreateBuildingInput;
    actorUid: string;
  }): Promise<StoredBuilding> {
    const nowIso = this.nowIso();
    const buildingId = `bld_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const building: StoredBuilding = {
      id: buildingId,
      buildingType: params.input.buildingType,
      geographicRef: {
        cityId: params.input.cityId,
        hoodId: params.input.hoodId,
        districtId: params.input.districtId,
        streetText: params.input.streetText,
      },
      nameOrTitle: params.input.nameOrTitle,
      totalFloors: params.input.totalFloors,
      unitsCount: params.input.unitsCount,
      constructionYear: params.input.constructionYear,
      structuralType: params.input.structuralType,
      commonFacilities: params.input.commonFacilities ?? [],
      completionStatus: params.input.completionStatus ?? 'completed',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    await this.deps.repository.saveBuilding(building);
    return building;
  }

  async registerUnit(params: {
    input: RegisterUnitInput;
    actorUid: string;
  }): Promise<StoredBuildingUnit> {
    const building = await this.deps.repository.getBuilding(params.input.parentBuildingId);
    if (!building) {
      throw new CoreApiError('NOT_FOUND', 404, `Parent building "${params.input.parentBuildingId}" not found.`);
    }

    // Prevent duplicate active unit registration in the same building
    const existingUnits = await this.deps.repository.getUnitsByBuilding(building.id);
    const isDup = existingUnits.some(
      (u) => u.unitNumberOrRef === params.input.unitNumberOrRef && u.floor === params.input.floor && u.status === 'active',
    );
    if (isDup) {
      throw new CoreApiError('CONFLICT', 409, `Unit "${params.input.unitNumberOrRef}" on floor ${params.input.floor} already exists in this building.`);
    }

    const nowIso = this.nowIso();
    const unitId = `unt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const unit: StoredBuildingUnit = {
      id: unitId,
      parentBuildingId: building.id,
      unitNumberOrRef: params.input.unitNumberOrRef,
      floor: params.input.floor,
      areaSqm: params.input.areaSqm,
      usageType: params.input.usageType,
      roomCount: params.input.roomCount,
      status: 'active',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    await this.deps.repository.saveUnit(unit);
    return unit;
  }

  async registerLandParcel(params: {
    input: RegisterLandParcelInput;
    actorUid: string;
  }): Promise<StoredLandParcel> {
    const nowIso = this.nowIso();
    const parcelId = `pcl_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const parcel: StoredLandParcel = {
      id: parcelId,
      geographicRef: {
        cityId: params.input.cityId,
        hoodId: params.input.hoodId,
        districtId: params.input.districtId,
      },
      areaSqm: params.input.areaSqm,
      landUseClassification: params.input.landUseClassification,
      zoningCode: params.input.zoningCode,
      developmentStatus: params.input.developmentStatus ?? 'vacant',
      frontageMeters: params.input.frontageMeters,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    await this.deps.repository.saveParcel(parcel);
    return parcel;
  }

  async searchDuplicateCandidates(assetId: string): Promise<StoredDuplicateMatchCandidate[]> {
    const source = await this.deps.repository.getAsset(assetId);
    if (!source) throw new CoreApiError('NOT_FOUND', 404, 'Asset not found.');

    const hoodAssets = await this.deps.repository.queryAssetsByNeighborhood(
      source.geographicRef.cityId,
      source.geographicRef.hoodId,
    );

    const candidates: StoredDuplicateMatchCandidate[] = [];
    const nowIso = this.nowIso();

    for (const target of hoodAssets) {
      if (target.id === source.id || target.status === 'merged') continue;
      const evalRes = evaluateAssetDuplicateCandidate(source, target);
      if (evalRes.isCandidate) {
        const cand: StoredDuplicateMatchCandidate = {
          id: `dup_${crypto.randomUUID().slice(0, 8)}`,
          sourceAssetId: source.id,
          targetAssetId: target.id,
          similarityScore: evalRes.score,
          matchReasons: evalRes.reasons,
          status: 'pending_review',
          createdAtIso: nowIso,
        };
        await this.deps.repository.saveDuplicateCandidate(cand);
        candidates.push(cand);
      }
    }

    return candidates;
  }

  async resolveDuplicateCandidate(params: {
    candidateId: string;
    decision: 'approve_merge' | 'reject_distinct';
    primaryAssetId: string;
    secondaryAssetId: string;
    actorUid: string;
  }): Promise<StoredDuplicateMatchCandidate> {
    const cand = await this.deps.repository.getDuplicateCandidate(params.candidateId);
    if (!cand) throw new CoreApiError('NOT_FOUND', 404, 'Candidate not found.');

    const primary = await this.deps.repository.getAsset(params.primaryAssetId);
    const secondary = await this.deps.repository.getAsset(params.secondaryAssetId);
    if (!primary || !secondary) throw new CoreApiError('NOT_FOUND', 404, 'Target assets not found.');

    const nowIso = this.nowIso();

    if (params.decision === 'approve_merge') {
      // Reversible, non-destructive merge: secondary marked merged, primary gains alias
      secondary.status = 'merged';
      secondary.mergedIntoAssetId = primary.id;
      secondary.updatedAtIso = nowIso;
      await this.deps.repository.saveAsset(secondary);

      if (!primary.aliases.includes(secondary.id)) {
        primary.aliases.push(secondary.id);
        primary.updatedAtIso = nowIso;
        await this.deps.repository.saveAsset(primary);
      }

      cand.status = 'approved_merged';
      cand.reviewedByUid = params.actorUid;
      cand.reviewedAtIso = nowIso;

      await this.deps.repository.saveHistoryRecord({
        id: `hist_${crypto.randomUUID().slice(0, 8)}`,
        assetId: primary.id,
        changeType: 'merged',
        actorUid: params.actorUid,
        timestampIso: nowIso,
        note: `Merged duplicate asset ${secondary.id} into primary asset.`,
      });
    } else {
      cand.status = 'rejected_distinct';
      cand.reviewedByUid = params.actorUid;
      cand.reviewedAtIso = nowIso;
    }

    await this.deps.repository.saveDuplicateCandidate(cand);
    return cand;
  }

  async linkListingToAsset(params: {
    assetId: string;
    listingId: string;
    actorUid: string;
  }): Promise<StoredAssetListingLink> {
    const asset = await this.deps.repository.getAsset(params.assetId);
    if (!asset) throw new CoreApiError('NOT_FOUND', 404, 'Asset not found.');

    const validation = await validateListingToAssetMatch({
      asset,
      listingId: params.listingId,
      bargainsAdapter: this.deps.bargainsAdapter,
    });

    if (!validation.compatible) {
      throw new CoreApiError('CONFLICT', 409, `Cannot link listing: ${validation.reason}`);
    }

    const nowIso = this.nowIso();
    const link: StoredAssetListingLink = {
      id: `link_${asset.id}_${params.listingId}`,
      assetId: asset.id,
      listingId: params.listingId,
      listingSourceModule: 'bargains',
      matchConfidence: validation.confidence,
      matchReason: validation.reason,
      verified: validation.confidence === 'high',
      linkedAtIso: nowIso,
      linkedByUid: params.actorUid,
    };

    await this.deps.repository.saveListingLink(link);

    await this.deps.repository.saveHistoryRecord({
      id: `hist_${crypto.randomUUID().slice(0, 8)}`,
      assetId: asset.id,
      changeType: 'listing_linked',
      actorUid: params.actorUid,
      timestampIso: nowIso,
      newValues: { listingId: params.listingId, matchConfidence: validation.confidence },
      note: `Linked listing ${params.listingId} to asset.`,
    });

    return link;
  }

  async unlinkListingFromAsset(params: {
    assetId: string;
    listingId: string;
    actorUid: string;
  }): Promise<void> {
    const linkId = `link_${params.assetId}_${params.listingId}`;
    await this.deps.repository.deleteListingLink(linkId);

    await this.deps.repository.saveHistoryRecord({
      id: `hist_${crypto.randomUUID().slice(0, 8)}`,
      assetId: params.assetId,
      changeType: 'listing_unlinked',
      actorUid: params.actorUid,
      timestampIso: this.nowIso(),
      note: `Unlinked listing ${params.listingId} from asset.`,
    });
  }

  async getAssetHistory(assetId: string): Promise<StoredAssetHistoryRecord[]> {
    return this.deps.repository.getHistoryRecords(assetId);
  }
}

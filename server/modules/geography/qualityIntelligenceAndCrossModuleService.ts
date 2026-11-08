/**
 * Employee 18 — Location Resolution, Address Privacy, POIs, Quality Auditor & Spatial Intelligence Service
 * (`server/modules/geography/qualityIntelligenceAndCrossModuleService.ts`)
 * Exclusive ownership: `server/modules/geography/`
 */

import { normalizePersianText } from './aliases';
import { calculateGeodesicDistanceMeters } from './geographySpatialEngine';
import { validateCoordinates } from './geographyNormalizer';
import {
  doBoundingBoxesOverlap,
  doGeoJsonPolygonsIntersect,
  isPointWithinGeoJsonGeometry,
  paginateGeoItems,
  validateGeoJsonGeometry,
} from './geometryCrsAndSpatialEngine';
import { CanonicalHierarchyAndGraphStore } from './hierarchyVersioningAndGraphEngine';
import type {
  BoundaryRecordV2,
  CanonicalEntityType,
  CanonicalGeographicEntityV2,
  EntityVerificationStatus,
  GeoJsonGeometry,
  GeographicQualityReport,
  GeographyAdminActor,
  GeographyEventPublisherAdapter,
  LocationResolutionRequest,
  LocationResolutionResponse,
  NeighborhoodSpatialAggregation,
  PaginatedGeoEnvelope,
  PointOfInterestRecord,
  PublicSafeAddressView,
  QuarantinedGeographicImportRecord,
  StructuredAddressReference,
} from './employee18Contracts';
import type { GeoBoundingBox, GeoPoint } from './types';

export class Employee18GeographyEngine {
  public readonly store: CanonicalHierarchyAndGraphStore;
  public readonly pointsOfInterest = new Map<string, PointOfInterestRecord>();
  public readonly quarantinedImports = new Map<string, QuarantinedGeographicImportRecord>();
  private readonly stagedApprovedBatches = new Map<
    string,
    {
      datasetId: string;
      datasetVersion: string;
      sourceReference: string;
      approved: boolean;
      candidates: Array<{
        id: string;
        entityType: CanonicalEntityType;
        displayNameFa: string;
        parentId?: string;
        center?: GeoPoint;
        geometry?: GeoJsonGeometry;
        verificationStatus: EntityVerificationStatus;
      }>;
    }
  >();

  constructor(eventPublisher?: GeographyEventPublisherAdapter) {
    this.store = new CanonicalHierarchyAndGraphStore(eventPublisher);
  }

  public getParentChain(entityId: string): CanonicalGeographicEntityV2[] {
    const chain: CanonicalGeographicEntityV2[] = [];
    const visited = new Set<string>();
    let current = this.store.entities.get(entityId);
    while (current?.parentId && !visited.has(current.parentId)) {
      visited.add(current.parentId);
      const parent = this.store.entities.get(current.parentId);
      if (!parent) break;
      chain.push(parent);
      current = parent;
    }
    return chain;
  }

  private belongsToCityScope(entity: CanonicalGeographicEntityV2, cityQuery: string): boolean {
    const normCity = normalizePersianText(cityQuery);
    const cleanCityId = cityQuery.startsWith('city:') ? cityQuery.toLowerCase() : `city:${cityQuery.toLowerCase()}`;
    if (entity.id === cleanCityId || normalizePersianText(entity.displayNameFa) === normCity) return true;
    for (const anc of this.getParentChain(entity.id)) {
      if (anc.id === cleanCityId || normalizePersianText(anc.displayNameFa) === normCity || anc.nameEn?.toLowerCase() === cityQuery.toLowerCase()) {
        return true;
      }
      if (cleanCityId === 'city:tehran' && anc.id === 'county:tehran_satellite') return true;
    }
    return false;
  }

  /** Section 10: Multi-modal Location Resolution Service with homonym ambiguity protection. */
  public resolveLocationReference(req: LocationResolutionRequest): LocationResolutionResponse {
    if (req.canonicalId) {
      const entity = this.store.entities.get(req.canonicalId) ?? null;
      if (!entity) {
        this.store.emit('GeographicResolutionFailed', undefined, { reason: 'CANONICAL_ID_NOT_FOUND', query: req.canonicalId });
        return { resolved: false, entity: null, parentHierarchy: [], matchType: 'unresolved', confidence: null, isAmbiguous: false, ambiguityCandidates: [] };
      }
      const target = entity.geographicStatus === 'merged' && entity.replacedByIds?.length === 1
        ? (this.store.entities.get(entity.replacedByIds[0]) ?? entity)
        : entity;
      return {
        resolved: true, entity: target, parentHierarchy: this.getParentChain(target.id),
        matchType: 'canonical_id', confidence: 1.0, isAmbiguous: false, ambiguityCandidates: [],
        sourceReference: target.sourceReference, verificationStatus: target.verificationStatus,
      };
    }

    if (req.administrativeCode) {
      const codeUpper = req.administrativeCode.trim().toUpperCase();
      for (const e of this.store.entities.values()) {
        if (e.administrativeCode?.toUpperCase() === codeUpper && e.geographicStatus === 'active') {
          return {
            resolved: true, entity: e, parentHierarchy: this.getParentChain(e.id),
            matchType: 'administrative_code', confidence: 1.0, isAmbiguous: false, ambiguityCandidates: [],
            sourceReference: e.sourceReference, verificationStatus: e.verificationStatus,
          };
        }
      }
    }

    if (req.coordinates) {
      const coordCheck = validateCoordinates(req.coordinates.lat, req.coordinates.lng);
      if (!coordCheck.valid || coordCheck.isPotentiallySwapped || !coordCheck.sanitizedPoint) {
        this.store.emit('GeographicResolutionFailed', undefined, { reason: coordCheck.error ?? 'SWAPPED_OR_INVALID_COORDINATES' });
        return {
          resolved: false, entity: null, parentHierarchy: [], matchType: 'unresolved',
          confidence: null, isAmbiguous: false, ambiguityCandidates: [],
          disambiguationRequiredReason: coordCheck.error ?? 'POTENTIALLY_SWAPPED_LAT_LNG',
        };
      }
      const pt = coordCheck.sanitizedPoint;
      for (const bnd of this.store.boundariesById.values()) {
        const ent = this.store.entities.get(bnd.entityId);
        if (!ent || ent.geographicStatus !== 'active' || ent.activeBoundaryId !== bnd.boundaryId) continue;
        if (isPointWithinGeoJsonGeometry(pt, bnd.geometry)) {
          return {
            resolved: true, entity: ent, parentHierarchy: this.getParentChain(ent.id),
            matchType: 'polygon_containment', confidence: 0.98, isAmbiguous: false, ambiguityCandidates: [],
            sourceReference: bnd.boundarySource, verificationStatus: bnd.verificationStatus,
          };
        }
      }
      let bestEnt: CanonicalGeographicEntityV2 | null = null;
      let bestDist = Infinity;
      for (const ent of this.store.entities.values()) {
        if (ent.entityType !== 'neighborhood' || ent.geographicStatus !== 'active' || !ent.center) continue;
        const d = calculateGeodesicDistanceMeters(pt, ent.center);
        if (d <= 1500 && d < bestDist) {
          bestDist = d;
          bestEnt = ent;
        }
      }
      if (bestEnt) {
        return {
          resolved: true, entity: bestEnt, parentHierarchy: this.getParentChain(bestEnt.id),
          matchType: 'approximate_radius', confidence: 0.75, isAmbiguous: false, ambiguityCandidates: [],
          sourceReference: bestEnt.sourceReference, verificationStatus: bestEnt.verificationStatus,
        };
      }
    }

    const targetName = req.neighborhoodNameOrAlias ?? req.structuredAddress?.neighborhoodId ?? req.cityNameOrId;
    if (targetName) {
      const normName = normalizePersianText(targetName);
      const matchedIds = this.store.normalizedAliasIndex.get(normName);
      if (matchedIds && matchedIds.size > 0) {
        let candidates = [...matchedIds]
          .map((id) => this.store.entities.get(id))
          .filter((e): e is CanonicalGeographicEntityV2 => Boolean(e && e.geographicStatus === 'active'));
        if (req.cityNameOrId && req.neighborhoodNameOrAlias) {
          candidates = candidates.filter((c) => this.belongsToCityScope(c, req.cityNameOrId!));
        }
        if (candidates.length === 1) {
          const winner = candidates[0];
          const isExact = normalizePersianText(winner.displayNameFa) === normName;
          return {
            resolved: true, entity: winner, parentHierarchy: this.getParentChain(winner.id),
            matchType: req.structuredAddress ? 'structured_address' : isExact ? 'exact_name' : 'alias_match',
            confidence: isExact ? 1.0 : 0.92, isAmbiguous: false, ambiguityCandidates: [],
            sourceReference: winner.sourceReference, verificationStatus: winner.verificationStatus,
          };
        }
        if (candidates.length > 1) {
          return {
            resolved: false, entity: null, parentHierarchy: [], matchType: 'unresolved',
            confidence: null, isAmbiguous: true, ambiguityCandidates: candidates,
            disambiguationRequiredReason: `Ambiguous geographic name "${targetName}" matches ${candidates.length} entities across cities; specify cityNameOrId.`,
          };
        }
      }
    }

    this.store.emit('GeographicResolutionFailed', undefined, { reason: 'NO_MATCHING_ENTITY' });
    return { resolved: false, entity: null, parentHierarchy: [], matchType: 'unresolved', confidence: null, isAmbiguous: false, ambiguityCandidates: [] };
  }

  /** Section 11 & 20: Public vs Private Address Separation and Coordinate Privacy Enforcement. */
  public toPublicSafeAddressView(address: StructuredAddressReference, caller?: { uid?: string; isAdmin?: boolean }): PublicSafeAddressView {
    const isAuthorized = Boolean(caller?.isAdmin) || Boolean(caller?.uid && address.ownerUid && caller.uid === address.ownerUid) || address.visibilityPolicy === 'AUTHORIZED_PRECISE_LOCATION';
    const allowStreet = isAuthorized || address.visibilityPolicy === 'PUBLIC_STREET_LEVEL';
    return {
      addressId: address.addressId, countryCode: address.countryCode, provinceId: address.provinceId,
      cityId: address.cityId, districtId: address.districtId, neighborhoodId: address.neighborhoodId,
      ...(allowStreet && address.mainRoad ? { mainRoad: address.mainRoad } : {}),
      ...(allowStreet && address.street ? { street: address.street } : {}),
      coordinatesExposed: isAuthorized && Boolean(address.preciseCoordinates),
      displayCoordinates: isAuthorized ? (address.preciseCoordinates ?? address.publicApproxCenter ?? null) : (address.publicApproxCenter ?? null),
      verificationStatus: address.verificationStatus,
    };
  }

  /** Section 12: Points of Interest registration (never mixed with property listings). */
  public registerPointOfInterest(params: {
    actor: GeographyAdminActor;
    poi: Omit<PointOfInterestRecord, 'createdAtIso' | 'updatedAtIso' | 'operationalStatus'> & { operationalStatus?: PointOfInterestRecord['operationalStatus'] };
  }): PointOfInterestRecord {
    this.store.requireAdminActor(params.actor);
    const { poi } = params;
    const coordCheck = validateCoordinates(poi.coordinates.lat, poi.coordinates.lng);
    if (!coordCheck.valid || coordCheck.isPotentiallySwapped || !coordCheck.sanitizedPoint) {
      throw new Error(`INVALID_POI_COORDINATES: ${coordCheck.error ?? 'Swapped lat/lng'}`);
    }
    if (!this.store.entities.has(poi.parentEntityId)) throw new Error(`POI_PARENT_NOT_FOUND: "${poi.parentEntityId}"`);
    const nowIso = new Date().toISOString();
    const record: PointOfInterestRecord = {
      ...poi, coordinates: coordCheck.sanitizedPoint,
      operationalStatus: poi.verificationStatus === 'verified_official' && poi.operationalStatus ? poi.operationalStatus : 'unknown_unverified',
      createdAtIso: nowIso, updatedAtIso: nowIso,
    };
    this.pointsOfInterest.set(record.poiId, record);
    return record;
  }

  /** Section 9 & 13: Paginated Spatial and Hierarchy Queries. */
  public queryEntitiesPaginated(params: {
    entityType?: CanonicalEntityType; parentId?: string; cityId?: string; boundingBox?: GeoBoundingBox;
    withinGeometry?: GeoJsonGeometry; nearPoint?: { point: GeoPoint; radiusMeters: number };
    minAreaSqMeters?: number; maxAreaSqMeters?: number; limit?: number; offset?: number;
  }): PaginatedGeoEnvelope<CanonicalGeographicEntityV2> {
    let list = [...this.store.entities.values()].filter((e) => e.geographicStatus === 'active');
    if (params.entityType) list = list.filter((e) => e.entityType === params.entityType);
    if (params.parentId) list = list.filter((e) => e.parentId === params.parentId);
    if (params.cityId) list = list.filter((e) => this.belongsToCityScope(e, params.cityId!));
    if (params.boundingBox) {
      const b = params.boundingBox;
      list = list.filter((e) => e.center && e.center.lat >= b.minLat && e.center.lat <= b.maxLat && e.center.lng >= b.minLng && e.center.lng <= b.maxLng);
    }
    if (params.withinGeometry) list = list.filter((e) => e.center && isPointWithinGeoJsonGeometry(e.center, params.withinGeometry!));
    if (params.nearPoint) {
      const { point, radiusMeters } = params.nearPoint;
      const check = validateCoordinates(point.lat, point.lng);
      if (!check.valid || check.isPotentiallySwapped) return paginateGeoItems([], params.limit, params.offset);
      list = list.filter((e) => e.center && calculateGeodesicDistanceMeters(point, e.center) <= radiusMeters);
    }
    if (params.minAreaSqMeters !== undefined || params.maxAreaSqMeters !== undefined) {
      list = list.filter((e) => {
        const bnd = e.activeBoundaryId ? this.store.boundariesById.get(e.activeBoundaryId) : undefined;
        if (!bnd || bnd.areaSqMeters === undefined) return false;
        if (params.minAreaSqMeters !== undefined && bnd.areaSqMeters < params.minAreaSqMeters) return false;
        if (params.maxAreaSqMeters !== undefined && bnd.areaSqMeters > params.maxAreaSqMeters) return false;
        return true;
      });
    }
    return paginateGeoItems(list, params.limit, params.offset);
  }

  /** Section 15: Controlled External Geographic Dataset Import with Quarantine & Approval Gate. */
  public stageExternalGeographicImport(params: {
    actor: GeographyAdminActor; datasetId: string; datasetVersion: string; sourceReference: string;
    candidates: Array<{
      id: string; entityType: CanonicalEntityType; displayNameFa: string; parentId?: string;
      center?: GeoPoint; geometry?: GeoJsonGeometry; verificationStatus?: EntityVerificationStatus;
    }>;
  }): { stagedBatchId: string; validStagedCount: number; quarantinedCount: number; quarantinedRecords: QuarantinedGeographicImportRecord[] } {
    this.store.requireAdminActor(params.actor);
    const stagedBatchId = `geobatch_${params.datasetId}_${params.datasetVersion}`;
    const seenBatchIds = new Set<string>();
    const validCandidates: typeof params.candidates = [];
    const quarantinedRecords: QuarantinedGeographicImportRecord[] = [];
    const nowIso = new Date().toISOString();

    for (const c of params.candidates) {
      let reasonCode: QuarantinedGeographicImportRecord['reasonCode'] | null = null;
      let details = '';
      if (seenBatchIds.has(c.id)) {
        reasonCode = 'DUPLICATE_ENTITY';
        details = `Duplicate entity ID "${c.id}" within import batch.`;
      } else seenBatchIds.add(c.id);

      if (!reasonCode) {
        const hCheck = this.store.validateHierarchyLink(c.entityType, c.parentId);
        if (!hCheck.ok) { reasonCode = 'PARENT_CHILD_CONFLICT'; details = hCheck.error ?? 'Invalid hierarchy parent.'; }
      }
      if (!reasonCode && c.geometry) {
        const gCheck = validateGeoJsonGeometry(c.geometry);
        if (!gCheck.valid) { reasonCode = 'INVALID_GEOMETRY'; details = gCheck.errors.join('; '); }
      }
      if (reasonCode) {
        const qRec: QuarantinedGeographicImportRecord = {
          quarantineId: `geoq_${stagedBatchId}_${c.id}`, candidateEntityId: c.id,
          sourceDatasetId: params.datasetId, datasetVersion: params.datasetVersion,
          reasonCode, details, rawCandidate: c as unknown as Record<string, unknown>,
          status: 'pending_review', createdAtIso: nowIso,
        };
        this.quarantinedImports.set(qRec.quarantineId, qRec);
        quarantinedRecords.push(qRec);
      } else validCandidates.push(c);
    }

    this.stagedApprovedBatches.set(stagedBatchId, {
      datasetId: params.datasetId, datasetVersion: params.datasetVersion, sourceReference: params.sourceReference,
      approved: false, candidates: validCandidates.map((c) => ({ ...c, verificationStatus: c.verificationStatus ?? 'reconciled_catalog' })),
    });
    this.store.emit('GeographicDatasetImported', undefined, { validStagedCount: validCandidates.length, quarantinedCount: quarantinedRecords.length }, params.datasetId);
    return { stagedBatchId, validStagedCount: validCandidates.length, quarantinedCount: quarantinedRecords.length, quarantinedRecords };
  }

  public approveAndCommitStagedImport(params: { actor: GeographyAdminActor; stagedBatchId: string; reason: string }): { committedCount: number } {
    this.store.requireAdminActor(params.actor);
    const batch = this.stagedApprovedBatches.get(params.stagedBatchId);
    if (!batch) throw new Error(`STAGED_BATCH_NOT_FOUND: "${params.stagedBatchId}"`);
    batch.approved = true;
    let committedCount = 0;
    const nowIso = new Date().toISOString();
    for (const c of batch.candidates) {
      const existing = this.store.entities.get(c.id);
      if (existing) {
        this.store.putEntityInternal({
          ...existing, displayNameFa: c.displayNameFa, parentId: c.parentId ?? existing.parentId,
          center: c.center ?? existing.center, sourceReference: batch.sourceReference,
          verificationStatus: c.verificationStatus, updatedAtIso: nowIso, version: existing.version + 1,
        });
      } else {
        this.store.createEntity({
          actor: params.actor,
          entity: {
            id: c.id, entityType: c.entityType, displayNameFa: c.displayNameFa, alternativeNames: [],
            parentId: c.parentId, sourceReference: batch.sourceReference, verificationStatus: c.verificationStatus,
            geographicStatus: 'active', isInformalOrMarketingName: false, center: c.center,
          },
          reason: params.reason,
        });
      }
      if (c.geometry) {
        this.store.upsertBoundary({
          actor: params.actor, entityId: c.id, geometry: c.geometry, boundarySource: batch.sourceReference,
          sourceVersion: batch.datasetVersion, verificationStatus: c.verificationStatus,
          boundaryClassification: c.verificationStatus === 'verified_official' ? 'official' : 'manually_reviewed',
          effectiveDateIso: nowIso, reason: params.reason,
        });
      }
      committedCount += 1;
    }
    this.store.emit('GeographicDatasetApproved', undefined, { stagedBatchId: params.stagedBatchId, committedCount }, batch.datasetId);
    return { committedCount };
  }

  /** Section 17: Geographic Data Quality Auditor. */
  public generateQualityReport(): GeographicQualityReport {
    const scopeNameMap = new Map<string, string[]>();
    const missingParents: { entityId: string; missingParentId: string }[] = [];
    const invalidLinks: GeographicQualityReport['invalidHierarchyLinks'][number][] = [];
    const orphans: string[] = [];
    const invalidCoords: string[] = [];
    let unverifiedCount = 0;

    for (const e of this.store.entities.values()) {
      if (e.verificationStatus === 'unverified') unverifiedCount += 1;
      if (e.entityType !== 'country' && !e.parentId) orphans.push(e.id);
      else if (e.parentId) {
        const p = this.store.entities.get(e.parentId);
        if (!p) missingParents.push({ entityId: e.id, missingParentId: e.parentId });
        else {
          const check = this.store.validateHierarchyLink(e.entityType, e.parentId);
          if (!check.ok) invalidLinks.push({ childId: e.id, childType: e.entityType, parentId: p.id, parentType: p.entityType });
        }
      }
      if (e.center) {
        const cCheck = validateCoordinates(e.center.lat, e.center.lng);
        if (!cCheck.valid || cCheck.isPotentiallySwapped) invalidCoords.push(e.id);
      }
      if (e.geographicStatus === 'active' && e.parentId) {
        const scopeKey = `${e.parentId}::${e.entityType}::${normalizePersianText(e.displayNameFa)}`;
        const arr = scopeNameMap.get(scopeKey) ?? [];
        arr.push(e.id);
        scopeNameMap.set(scopeKey, arr);
      }
    }

    const duplicateCanonicalNamesInScope: { parentId: string; nameFa: string; entityIds: readonly string[] }[] = [];
    for (const [key, ids] of scopeNameMap.entries()) {
      if (ids.length > 1) {
        const [parentId, , nameFa] = key.split('::');
        duplicateCanonicalNamesInScope.push({ parentId, nameFa, entityIds: ids });
      }
    }

    const activeBoundaries: BoundaryRecordV2[] = [];
    const invalidGeometryBoundaries: { boundaryId: string; errors: readonly string[] }[] = [];
    for (const b of this.store.boundariesById.values()) {
      const val = validateGeoJsonGeometry(b.geometry);
      if (!val.valid) invalidGeometryBoundaries.push({ boundaryId: b.boundaryId, errors: val.errors });
      const ent = this.store.entities.get(b.entityId);
      if (ent && ent.activeBoundaryId === b.boundaryId) activeBoundaries.push(b);
    }

    const unexpectedSameTypeBoundaryOverlaps: { entityA: string; entityB: string }[] = [];
    let legitimateCrossTypeOverlapsCount = 0;
    for (let i = 0; i < activeBoundaries.length; i++) {
      for (let j = i + 1; j < activeBoundaries.length; j++) {
        const bA = activeBoundaries[i];
        const bB = activeBoundaries[j];
        if (!doBoundingBoxesOverlap(bA.boundingBox, bB.boundingBox)) continue;
        if (doGeoJsonPolygonsIntersect(bA.geometry, bB.geometry)) {
          const entA = this.store.entities.get(bA.entityId)!;
          const entB = this.store.entities.get(bB.entityId)!;
          if (entA.entityType === entB.entityType) unexpectedSameTypeBoundaryOverlaps.push({ entityA: entA.id, entityB: entB.id });
          else legitimateCrossTypeOverlapsCount += 1;
        }
      }
    }

    const unresolvedAliases = [...this.store.aliases.values()].filter((a) => !this.store.entities.has(a.entityId)).map((a) => a.aliasId);
    return {
      reportId: `geoqual_${Date.now()}`, generatedAtIso: new Date().toISOString(), ruleVersion: 'v1.0.0-employee18',
      duplicateIdentifiers: [], duplicateCanonicalNamesInScope, missingParentReferences: missingParents,
      invalidHierarchyLinks: invalidLinks, orphanEntities: orphans, invalidCoordinatesEntities: invalidCoords,
      invalidGeometryBoundaries, unexpectedSameTypeBoundaryOverlaps, legitimateCrossTypeOverlapsCount,
      unresolvedAliases, unverifiedSourceEntityCount: unverifiedCount, staleDatasetEntities: [],
    };
  }

  /** Section 18: Neighborhood Spatial Intelligence (purely geographic/spatial, zero market valuation data). */
  public getNeighborhoodSpatialIntelligence(neighborhoodEntityId: string): NeighborhoodSpatialAggregation | null {
    const hood = this.store.entities.get(neighborhoodEntityId);
    if (!hood || hood.entityType !== 'neighborhood') return null;
    const districtIds = new Set<string>();
    if (hood.parentId?.startsWith('district:')) districtIds.add(hood.parentId);
    for (const rel of this.store.relationships) {
      if (rel.sourceEntityId === neighborhoodEntityId && rel.relationshipType === 'LOCATED_WITHIN' && rel.targetEntityId.startsWith('district:')) {
        districtIds.add(rel.targetEntityId);
      }
    }
    const activeBnd = hood.activeBoundaryId ? this.store.boundariesById.get(hood.activeBoundaryId) : undefined;
    const adjacentIds = this.store.relationships
      .filter((r) => r.sourceEntityId === neighborhoodEntityId && r.relationshipType === 'ADJACENT_TO')
      .map((r) => r.targetEntityId);

    const poiCounts: Record<string, number> = {};
    let nearestTransportDist: number | null = null;
    for (const poi of this.pointsOfInterest.values()) {
      const isChildOrNearby = poi.parentEntityId === neighborhoodEntityId || (hood.center && calculateGeodesicDistanceMeters(hood.center, poi.coordinates) <= 1500);
      if (isChildOrNearby) {
        poiCounts[poi.category] = (poiCounts[poi.category] ?? 0) + 1;
        if ((poi.category === 'metro_station' || poi.category === 'public_transport_station' || poi.category === 'bus_terminal') && hood.center) {
          const d = calculateGeodesicDistanceMeters(hood.center, poi.coordinates);
          if (nearestTransportDist === null || d < nearestTransportDist) nearestTransportDist = d;
        }
      }
    }
    return {
      neighborhoodEntityId, administrativeDistrictIds: [...districtIds],
      areaSqMeters: activeBnd?.areaSqMeters ?? null, boundaryClassification: activeBnd?.boundaryClassification ?? 'missing',
      nearbyPublicFacilitiesCountByCategory: poiCounts, nearestMetroOrTransportDistanceMeters: nearestTransportDist,
      adjacentNeighborhoodIds: adjacentIds, containsMarketValuationData: false,
    };
  }
}

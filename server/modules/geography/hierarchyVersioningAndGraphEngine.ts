/**
 * Employee 18 — Canonical Hierarchy, Versioning, Merge/Split, Boundaries & Relationship Graph Engine
 * (`server/modules/geography/hierarchyVersioningAndGraphEngine.ts`)
 * Exclusive ownership: `server/modules/geography/`
 */

import { ALL_31_IRAN_PROVINCES } from '../../../src/data/iranProvincesDirectory';
import { CANONICAL_ALIASES, normalizePersianText } from './aliases';
import { CANONICAL_CITIES } from './cities';
import { listAllCanonicalNeighborhoods } from './neighborhoods';
import { CANONICAL_PROVINCES } from './provinces';
import { validateGeoJsonGeometry } from './geometryCrsAndSpatialEngine';
import type {
  BoundaryClassification,
  BoundaryRecordV2,
  CanonicalEntityType,
  CanonicalGeographicEntityV2,
  EntityVerificationStatus,
  GeoJsonGeometry,
  GeographyAdminActor,
  GeographicAliasRecord,
  GeographicChangeHistoryEntry,
  GeographicChangeType,
  GeographicRelationshipEdge,
  GeographicRelationshipType,
  GeographyDomainEvent,
  GeographyDomainEventType,
  GeographyEventPublisherAdapter,
  SupportedCrsCode,
} from './employee18Contracts';

const ALLOWED_PARENT_TYPES: Readonly<Record<CanonicalEntityType, readonly CanonicalEntityType[]>> = {
  country: [],
  province: ['country'],
  county: ['province'],
  city: ['province', 'county'],
  municipal_district: ['city'],
  urban_zone: ['city', 'municipal_district'],
  neighborhood: ['city', 'municipal_district', 'urban_zone', 'county'],
  sub_neighborhood: ['neighborhood'],
  village: ['county', 'rural_district', 'province'],
  rural_district: ['county', 'province'],
  street_or_road: ['city', 'municipal_district', 'neighborhood', 'sub_neighborhood'],
  point_of_interest: ['city', 'municipal_district', 'neighborhood', 'sub_neighborhood'],
  custom_geographic_area: ['country', 'province', 'city', 'municipal_district'],
};

export function extractAllDistrictNumbersFromZone(zoneText: string): number[] {
  if (!zoneText) return [];
  const normalized = zoneText.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const blockMatch = normalized.match(/منطقه\s*([\d\sو،,]+)/);
  if (!blockMatch) return [];
  const nums = [...blockMatch[1].matchAll(/\d+/g)]
    .map((m) => parseInt(m[0], 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 50);
  return Array.from(new Set(nums));
}

export class CanonicalHierarchyAndGraphStore {
  public readonly entities = new Map<string, CanonicalGeographicEntityV2>();
  public readonly aliases = new Map<string, GeographicAliasRecord>();
  public readonly normalizedAliasIndex = new Map<string, Set<string>>();
  public readonly boundariesById = new Map<string, BoundaryRecordV2>();
  public readonly boundaryHistoryByEntity = new Map<string, BoundaryRecordV2[]>();
  public readonly relationships: GeographicRelationshipEdge[] = [];
  public readonly changeHistory: GeographicChangeHistoryEntry[] = [];
  public readonly emittedEvents: GeographyDomainEvent[] = [];

  constructor(private readonly eventPublisher?: GeographyEventPublisherAdapter) {
    this.seedFromExistingCanonicalCatalogs();
  }

  public emit(eventType: GeographyDomainEventType, entityId?: string, metadata: Record<string, unknown> = {}, datasetId?: string): void {
    const evt: GeographyDomainEvent = {
      eventId: `geoevt_${this.emittedEvents.length + 1}_${Date.now()}`,
      eventType,
      eventVersion: '1.0',
      timestampIso: new Date().toISOString(),
      ...(entityId ? { entityId } : {}),
      ...(datasetId ? { datasetId } : {}),
      metadata,
    };
    this.emittedEvents.push(evt);
    if (this.eventPublisher) void this.eventPublisher.publishGeographyEvent(evt);
  }

  public requireAdminActor(actor: GeographyAdminActor): void {
    if (!actor || !actor.uid || !actor.isAdmin) {
      throw new Error('FORBIDDEN_GEOGRAPHY_ADMIN_REQUIRED: Administrative privileges required for geographic mutations.');
    }
  }

  private seedFromExistingCanonicalCatalogs(): void {
    const seedIso = '2026-11-07T00:00:00.000Z';
    this.putEntityInternal({
      id: 'country:ir', entityType: 'country', officialNameFa: 'جمهوری اسلامی ایران', displayNameFa: 'ایران',
      nameEn: 'Iran', alternativeNames: ['کشور ایران', 'IR'], administrativeCode: 'IR',
      sourceReference: 'official-iran-administrative-divisions', verificationStatus: 'verified_official',
      geographicStatus: 'active', isInformalOrMarketingName: false, center: { lat: 32.4279, lng: 53.688 },
      createdAtIso: seedIso, updatedAtIso: seedIso, version: 1,
    });

    for (const prov of ALL_31_IRAN_PROVINCES) {
      const canonicalId = prov.id === 'khorasan_razavi' ? 'province:razavi_khorasan' : `province:${prov.id}`;
      const coreProv = Object.values(CANONICAL_PROVINCES).find((p) => `province:${p.id}` === canonicalId);
      this.putEntityInternal({
        id: canonicalId, entityType: 'province', officialNameFa: `استان ${prov.nameFa}`, displayNameFa: prov.nameFa,
        nameEn: coreProv?.nameEn ?? prov.id,
        alternativeNames: [`استان ${prov.nameFa}`, ...(prov.id === 'khorasan_razavi' ? ['province:khorasan_razavi'] : [])],
        parentId: 'country:ir', administrativeCode: coreProv?.officialCode ?? `IR-PROV-${prov.id.toUpperCase()}`,
        sourceReference: 'official-iran-administrative-divisions', verificationStatus: 'verified_official',
        geographicStatus: 'active', isInformalOrMarketingName: false, center: { lat: prov.center[0], lng: prov.center[1] },
        createdAtIso: seedIso, updatedAtIso: seedIso, version: 1,
      });
    }

    this.putEntityInternal({
      id: 'county:tehran_satellite', entityType: 'county', officialNameFa: 'شهرستان‌های حومه و اقمار استان تهران',
      displayNameFa: 'حومه و شهرستان‌های استان تهران', nameEn: 'Tehran Province Satellite Counties',
      alternativeNames: ['حومه تهران', 'شهرهای جدید استان تهران'], parentId: 'province:tehran',
      administrativeCode: 'THR-COUNTY-SAT', sourceReference: 'radartehran-tehran-counties-catalog',
      verificationStatus: 'reconciled_catalog', geographicStatus: 'active', isInformalOrMarketingName: false,
      center: { lat: 35.68, lng: 51.42 }, createdAtIso: seedIso, updatedAtIso: seedIso, version: 1,
    });

    for (const city of Object.values(CANONICAL_CITIES)) {
      this.putEntityInternal({
        id: `city:${city.id}`, entityType: 'city', officialNameFa: `شهر ${city.nameFa}`, displayNameFa: city.nameFa,
        nameEn: city.nameEn, alternativeNames: [`کلانشهر ${city.nameFa}`, city.slug], parentId: `province:${city.provinceId}`,
        administrativeCode: city.officialCode, sourceReference: city.provenance.sourceCatalog,
        verificationStatus: 'verified_official', geographicStatus: 'active', isInformalOrMarketingName: false,
        center: city.center, createdAtIso: seedIso, updatedAtIso: seedIso, version: 1,
      });
    }

    for (let d = 1; d <= 22; d++) {
      this.putEntityInternal({
        id: `district:tehran:${d}`, entityType: 'municipal_district', officialNameFa: `منطقه ${d} شهرداری تهران`,
        displayNameFa: `منطقه ${d} تهران`, nameEn: `Tehran District ${d}`,
        alternativeNames: [`منطقه ${d}`, `شهرداری منطقه ${d}`], parentId: 'city:tehran',
        administrativeCode: `THR-D${d}`, sourceReference: 'tehran-municipality-districts-v1',
        verificationStatus: 'verified_official', geographicStatus: 'active', isInformalOrMarketingName: false,
        createdAtIso: seedIso, updatedAtIso: seedIso, version: 1,
      });
    }

    for (const hood of listAllCanonicalNeighborhoods()) {
      const entityId = `hood:${hood.cityId}:${hood.id}`;
      const districts = extractAllDistrictNumbersFromZone(hood.zone);
      const isTehranSatelliteCounty = hood.cityId === 'tehran' && hood.id >= 61 && hood.id <= 80;
      let parentId = `city:${hood.cityId}`;
      let verificationStatus: EntityVerificationStatus = 'reconciled_catalog';

      if (isTehranSatelliteCounty) {
        parentId = 'county:tehran_satellite';
      } else if (hood.cityId === 'tehran' && districts.length >= 1) {
        parentId = `district:tehran:${districts[0]}`;
        if (districts.length > 1) verificationStatus = 'provisional_review';
      }

      this.putEntityInternal({
        id: entityId, entityType: 'neighborhood', officialNameFa: hood.nameFa, displayNameFa: hood.nameFa,
        alternativeNames: hood.aliases, parentId, administrativeCode: `${hood.cityId.toUpperCase()}-H${hood.id}`,
        sourceReference: hood.provenance.sourceCatalog, verificationStatus, geographicStatus: 'active',
        isInformalOrMarketingName: false, center: hood.coordinates ?? undefined,
        createdAtIso: seedIso, updatedAtIso: seedIso, version: 1,
      });

      if (hood.cityId === 'tehran' && districts.length > 1) {
        for (const dNum of districts.slice(1)) {
          this.addRelationshipInternal({
            sourceEntityId: entityId, targetEntityId: `district:tehran:${dNum}`, relationshipType: 'LOCATED_WITHIN',
            sourceReference: 'radartehran-multi-district-reconciliation', verificationStatus: 'provisional_review',
            effectiveTimestampIso: seedIso,
          });
        }
      }
    }

    for (let i = 0; i < CANONICAL_ALIASES.length; i++) {
      const a = CANONICAL_ALIASES[i];
      this.registerAliasInternal({
        aliasId: `alias_seed_${i + 1}`, entityId: `hood:${a.targetCityId}:${a.targetHoodId}`,
        cityScopeId: `city:${a.targetCityId}`, aliasText: a.alias, normalizedAlias: a.normalizedAlias,
        aliasKind: a.kind === 'colloquial' ? 'colloquial' : a.kind === 'zwnj_variant' ? 'zwnj_variant' : 'spelling_variant',
        isHistoricalRename: false, createdAtIso: seedIso,
      });
    }
  }

  public putEntityInternal(entity: CanonicalGeographicEntityV2): void {
    this.entities.set(entity.id, entity);
    const names = [entity.displayNameFa, entity.officialNameFa, ...(entity.alternativeNames ?? [])].filter((n): n is string => Boolean(n));
    for (const name of names) {
      const norm = normalizePersianText(name);
      if (!norm) continue;
      if (!this.normalizedAliasIndex.has(norm)) this.normalizedAliasIndex.set(norm, new Set());
      this.normalizedAliasIndex.get(norm)!.add(entity.id);
    }
    if (entity.parentId) {
      this.addRelationshipInternal({
        sourceEntityId: entity.parentId, targetEntityId: entity.id, relationshipType: 'PARENT_OF',
        sourceReference: entity.sourceReference, verificationStatus: entity.verificationStatus, effectiveTimestampIso: entity.updatedAtIso,
      });
      this.addRelationshipInternal({
        sourceEntityId: entity.id, targetEntityId: entity.parentId, relationshipType: 'CHILD_OF',
        sourceReference: entity.sourceReference, verificationStatus: entity.verificationStatus, effectiveTimestampIso: entity.updatedAtIso,
      });
    }
  }

  private registerAliasInternal(record: GeographicAliasRecord): void {
    this.aliases.set(record.aliasId, record);
    if (!this.normalizedAliasIndex.has(record.normalizedAlias)) {
      this.normalizedAliasIndex.set(record.normalizedAlias, new Set());
    }
    this.normalizedAliasIndex.get(record.normalizedAlias)!.add(record.entityId);
  }

  public addRelationshipInternal(params: {
    sourceEntityId: string;
    targetEntityId: string;
    relationshipType: GeographicRelationshipType;
    sourceReference: string;
    verificationStatus: EntityVerificationStatus;
    effectiveTimestampIso: string;
  }): GeographicRelationshipEdge {
    const edge: GeographicRelationshipEdge = { relationshipId: `rel_${this.relationships.length + 1}`, ...params, version: 1 };
    this.relationships.push(edge);
    return edge;
  }

  public validateHierarchyLink(childType: CanonicalEntityType, parentId?: string): { ok: boolean; error?: string } {
    if (childType === 'country') return parentId ? { ok: false, error: 'COUNTRY_CANNOT_HAVE_PARENT' } : { ok: true };
    if (!parentId) return { ok: false, error: `MISSING_PARENT_REFERENCE for entityType "${childType}".` };
    const parent = this.entities.get(parentId);
    if (!parent) return { ok: false, error: `PARENT_NOT_FOUND: "${parentId}" does not exist.` };
    const allowed = ALLOWED_PARENT_TYPES[childType] ?? [];
    if (!allowed.includes(parent.entityType)) {
      return { ok: false, error: `INVALID_HIERARCHY_PARENT_TYPE: "${childType}" cannot have parent of type "${parent.entityType}" (${parentId}).` };
    }
    return { ok: true };
  }

  public createEntity(params: {
    actor: GeographyAdminActor;
    entity: Omit<CanonicalGeographicEntityV2, 'createdAtIso' | 'updatedAtIso' | 'version'>;
    reason: string;
  }): CanonicalGeographicEntityV2 {
    this.requireAdminActor(params.actor);
    const { entity } = params;
    if (!entity.id || !/^[a-z0-9_:.-]{3,100}$/i.test(entity.id)) throw new Error('INVALID_ENTITY_ID_FORMAT');
    if (this.entities.has(entity.id)) throw new Error(`DUPLICATE_ENTITY_ID: "${entity.id}" already exists.`);
    const hCheck = this.validateHierarchyLink(entity.entityType, entity.parentId);
    if (!hCheck.ok) throw new Error(hCheck.error);
    if (entity.isInformalOrMarketingName && entity.verificationStatus === 'verified_official') {
      throw new Error('MARKETING_NAME_CANNOT_BE_OFFICIAL: Informal/marketing names cannot be marked verified_official.');
    }
    const nowIso = new Date().toISOString();
    const created: CanonicalGeographicEntityV2 = { ...entity, createdAtIso: nowIso, updatedAtIso: nowIso, version: 1 };
    this.putEntityInternal(created);
    this.recordChange(params.actor.uid, created.id, 'ENTITY_CREATED', null, { ...created }, created.sourceReference, params.reason, 1);
    this.emit('GeographicEntityCreated', created.id, { entityType: created.entityType, parentId: created.parentId });
    return created;
  }

  public renameEntity(params: {
    actor: GeographyAdminActor;
    entityId: string;
    newDisplayNameFa: string;
    newOfficialNameFa?: string;
    expectedVersion?: number;
    sourceReference: string;
    reason: string;
  }): CanonicalGeographicEntityV2 {
    this.requireAdminActor(params.actor);
    const existing = this.entities.get(params.entityId);
    if (!existing) throw new Error(`ENTITY_NOT_FOUND: "${params.entityId}"`);
    if (params.expectedVersion !== undefined && existing.version !== params.expectedVersion) {
      throw new Error(`CONCURRENT_VERSION_CONFLICT: expected ${params.expectedVersion}, actual ${existing.version}`);
    }
    const nowIso = new Date().toISOString();
    const nextVersion = existing.version + 1;
    const prevName = existing.displayNameFa;
    const updated: CanonicalGeographicEntityV2 = {
      ...existing,
      displayNameFa: params.newDisplayNameFa.trim(),
      officialNameFa: params.newOfficialNameFa?.trim() ?? existing.officialNameFa,
      alternativeNames: Array.from(new Set([...existing.alternativeNames, prevName])),
      updatedAtIso: nowIso,
      version: nextVersion,
    };
    this.putEntityInternal(updated);
    this.registerAliasInternal({
      aliasId: `alias_hist_${params.entityId}_v${nextVersion}`, entityId: params.entityId,
      aliasText: prevName, normalizedAlias: normalizePersianText(prevName),
      aliasKind: 'official_historical', isHistoricalRename: true, createdAtIso: nowIso,
    });
    this.recordChange(params.actor.uid, updated.id, 'ENTITY_RENAMED', { displayNameFa: prevName }, { displayNameFa: updated.displayNameFa }, params.sourceReference, params.reason, nextVersion);
    this.emit('GeographicEntityUpdated', updated.id, { change: 'rename', version: nextVersion });
    return updated;
  }

  public addAlias(params: {
    actor: GeographyAdminActor;
    entityId: string;
    aliasText: string;
    aliasKind: GeographicAliasRecord['aliasKind'];
    cityScopeId?: string;
    sourceReference: string;
    reason: string;
  }): GeographicAliasRecord {
    this.requireAdminActor(params.actor);
    const existing = this.entities.get(params.entityId);
    if (!existing) throw new Error(`ENTITY_NOT_FOUND: "${params.entityId}"`);
    const nowIso = new Date().toISOString();
    const record: GeographicAliasRecord = {
      aliasId: `alias_${this.aliases.size + 1}_${Date.now()}`, entityId: params.entityId,
      cityScopeId: params.cityScopeId, aliasText: params.aliasText.trim(),
      normalizedAlias: normalizePersianText(params.aliasText), aliasKind: params.aliasKind,
      isHistoricalRename: false, createdAtIso: nowIso,
    };
    this.registerAliasInternal(record);
    this.addRelationshipInternal({
      sourceEntityId: record.aliasId, targetEntityId: params.entityId, relationshipType: 'ALIAS_OF',
      sourceReference: params.sourceReference, verificationStatus: existing.verificationStatus, effectiveTimestampIso: nowIso,
    });
    this.recordChange(params.actor.uid, params.entityId, 'ALIAS_ADDED', null, { aliasText: record.aliasText, aliasKind: record.aliasKind }, params.sourceReference, params.reason, existing.version);
    this.emit('GeographicAliasAdded', params.entityId, { aliasText: record.aliasText });
    return record;
  }

  public upsertBoundary(params: {
    actor: GeographyAdminActor;
    entityId: string;
    geometry: GeoJsonGeometry;
    crs?: SupportedCrsCode;
    boundarySource: string;
    sourceVersion: string;
    verificationStatus: EntityVerificationStatus;
    boundaryClassification: BoundaryClassification;
    effectiveDateIso: string;
    accuracyMeters?: number;
    reason: string;
  }): BoundaryRecordV2 {
    this.requireAdminActor(params.actor);
    const entity = this.entities.get(params.entityId);
    if (!entity) throw new Error(`ENTITY_NOT_FOUND: "${params.entityId}"`);
    const val = validateGeoJsonGeometry(params.geometry);
    if (!val.valid || !val.boundingBox) throw new Error(`INVALID_BOUNDARY_GEOMETRY: ${val.errors.join('; ')}`);

    const history = this.boundaryHistoryByEntity.get(params.entityId) ?? [];
    const nextGeomVersion = history.length + 1;
    const nowIso = new Date().toISOString();
    const boundaryId = `bnd_${params.entityId.replace(/:/g, '_')}_v${nextGeomVersion}`;
    const record: BoundaryRecordV2 = {
      boundaryId, entityId: params.entityId, geometryType: params.geometry.type, crs: params.crs ?? 'EPSG:4326',
      boundarySource: params.boundarySource, sourceVersion: params.sourceVersion,
      verificationStatus: params.verificationStatus, boundaryClassification: params.boundaryClassification,
      effectiveDateIso: params.effectiveDateIso, importedAtIso: nowIso, geometryVersion: nextGeomVersion,
      accuracyMeters: params.accuracyMeters, boundingBox: val.boundingBox, areaSqMeters: val.computedAreaSqMeters,
      geometry: params.geometry,
    };

    this.boundariesById.set(boundaryId, record);
    history.push(record);
    this.boundaryHistoryByEntity.set(params.entityId, history);

    const prevBoundaryId = entity.activeBoundaryId ?? null;
    const updatedEntity: CanonicalGeographicEntityV2 = {
      ...entity, activeBoundaryId: boundaryId, updatedAtIso: nowIso, version: entity.version + 1,
    };
    this.entities.set(entity.id, updatedEntity);
    this.recordChange(params.actor.uid, entity.id, 'BOUNDARY_CORRECTED', { activeBoundaryId: prevBoundaryId }, { activeBoundaryId: boundaryId, geometryVersion: nextGeomVersion }, params.boundarySource, params.reason, updatedEntity.version);
    this.emit('GeographicBoundaryUpdated', entity.id, { boundaryId, geometryVersion: nextGeomVersion });
    return record;
  }

  public mergeEntities(params: {
    actor: GeographyAdminActor;
    sourceEntityId: string;
    targetEntityId: string;
    sourceReference: string;
    reason: string;
  }): { mergedSource: CanonicalGeographicEntityV2; target: CanonicalGeographicEntityV2 } {
    this.requireAdminActor(params.actor);
    const src = this.entities.get(params.sourceEntityId);
    const tgt = this.entities.get(params.targetEntityId);
    if (!src || !tgt) throw new Error('MERGE_ENTITY_NOT_FOUND');
    if (src.id === tgt.id) throw new Error('CANNOT_MERGE_ENTITY_INTO_ITSELF');
    const nowIso = new Date().toISOString();
    const mergedSource: CanonicalGeographicEntityV2 = {
      ...src, geographicStatus: 'merged', replacedByIds: [tgt.id], updatedAtIso: nowIso, version: src.version + 1,
    };
    const updatedTarget: CanonicalGeographicEntityV2 = {
      ...tgt, alternativeNames: Array.from(new Set([...tgt.alternativeNames, src.displayNameFa])), updatedAtIso: nowIso, version: tgt.version + 1,
    };
    this.entities.set(mergedSource.id, mergedSource);
    this.putEntityInternal(updatedTarget);
    this.addRelationshipInternal({ sourceEntityId: src.id, targetEntityId: tgt.id, relationshipType: 'MERGED_INTO', sourceReference: params.sourceReference, verificationStatus: 'verified_official', effectiveTimestampIso: nowIso });
    this.addRelationshipInternal({ sourceEntityId: src.id, targetEntityId: tgt.id, relationshipType: 'REPLACED_BY', sourceReference: params.sourceReference, verificationStatus: 'verified_official', effectiveTimestampIso: nowIso });
    this.recordChange(params.actor.uid, src.id, 'ENTITY_MERGED', { geographicStatus: src.geographicStatus }, { geographicStatus: 'merged', replacedByIds: [tgt.id] }, params.sourceReference, params.reason, mergedSource.version);
    this.emit('GeographicEntityMerged', src.id, { targetEntityId: tgt.id });
    return { mergedSource, target: updatedTarget };
  }

  public splitEntity(params: {
    actor: GeographyAdminActor;
    sourceEntityId: string;
    targetEntityIds: readonly string[];
    splitMappingRule: string;
    sourceReference: string;
    reason: string;
  }): CanonicalGeographicEntityV2 {
    this.requireAdminActor(params.actor);
    if (!params.splitMappingRule || params.splitMappingRule.trim().length < 5) {
      throw new Error('SPLIT_MAPPING_RULE_REQUIRED: Splitting an entity requires an explicit mapping rule.');
    }
    if (!Array.isArray(params.targetEntityIds) || params.targetEntityIds.length < 2) {
      throw new Error('SPLIT_REQUIRES_AT_LEAST_TWO_TARGETS');
    }
    const src = this.entities.get(params.sourceEntityId);
    if (!src) throw new Error(`ENTITY_NOT_FOUND: "${params.sourceEntityId}"`);
    for (const tId of params.targetEntityIds) {
      if (!this.entities.has(tId)) throw new Error(`SPLIT_TARGET_NOT_FOUND: "${tId}"`);
    }
    const nowIso = new Date().toISOString();
    const updatedSource: CanonicalGeographicEntityV2 = {
      ...src, geographicStatus: 'split', splitIntoIds: [...params.targetEntityIds],
      splitMappingRule: params.splitMappingRule.trim(), updatedAtIso: nowIso, version: src.version + 1,
    };
    this.entities.set(updatedSource.id, updatedSource);
    for (const tId of params.targetEntityIds) {
      this.addRelationshipInternal({ sourceEntityId: src.id, targetEntityId: tId, relationshipType: 'SPLIT_INTO', sourceReference: params.sourceReference, verificationStatus: 'verified_official', effectiveTimestampIso: nowIso });
    }
    this.recordChange(params.actor.uid, src.id, 'ENTITY_SPLIT', { geographicStatus: src.geographicStatus }, { geographicStatus: 'split', splitIntoIds: params.targetEntityIds, splitMappingRule: updatedSource.splitMappingRule }, params.sourceReference, params.reason, updatedSource.version);
    this.emit('GeographicEntitySplit', src.id, { splitIntoIds: params.targetEntityIds });
    return updatedSource;
  }

  public deactivateEntity(params: {
    actor: GeographyAdminActor;
    entityId: string;
    sourceReference: string;
    reason: string;
  }): CanonicalGeographicEntityV2 {
    this.requireAdminActor(params.actor);
    const src = this.entities.get(params.entityId);
    if (!src) throw new Error(`ENTITY_NOT_FOUND: "${params.entityId}"`);
    const nowIso = new Date().toISOString();
    const updated: CanonicalGeographicEntityV2 = { ...src, geographicStatus: 'inactive', updatedAtIso: nowIso, version: src.version + 1 };
    this.entities.set(updated.id, updated);
    this.recordChange(params.actor.uid, src.id, 'ENTITY_DEACTIVATED', { geographicStatus: src.geographicStatus }, { geographicStatus: 'inactive' }, params.sourceReference, params.reason, updated.version);
    this.emit('GeographicEntityDeactivated', src.id, { reason: params.reason });
    return updated;
  }

  private recordChange(
    actorUid: string, entityId: string, changeType: GeographicChangeType,
    previousValue: Record<string, unknown> | null, newValue: Record<string, unknown>,
    sourceReference: string, reason: string, version: number,
  ): void {
    this.changeHistory.push({
      changeId: `chg_${this.changeHistory.length + 1}`, entityId, changeType,
      previousValue, newValue, sourceReference, actorUid,
      timestampIso: new Date().toISOString(), approvalStatus: 'approved', reason, version,
    });
  }
}

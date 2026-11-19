import {
  CanonicalNeighborhood,
  defaultGeographicService,
  getCityByIdOrName,
  getNeighborhoodByCityAndId,
  getNeighborhoodByCompositeId,
  getProvinceById,
  listNeighborhoodsByCity,
} from '../geography';
import { ProvinceId, SupportedCityId } from '../geography/types';
import type { PropertyRegistryService } from '../property-registry/service';
import type { PropertyContextAuthorizationSnapshot } from '../property-registry/types';
import {
  ConstructionStageType,
  GeographicJurisdictionScope,
  LandUseCategoryType,
  PropertyCategoryType,
} from './types';
import { assertSafeEntityId, LegalRegulatoryError } from './validationAndAuthz';

export interface ResolvedGeographyMatch {
  valid: boolean;
  countryCode: 'IR';
  provinceId?: ProvinceId;
  cityId?: SupportedCityId;
  districtNumber?: number;
  neighborhoodId?: string;
  neighborhoodNameFa?: string;
  warnings: string[];
}

export interface GeographyLookupAdapter {
  validateJurisdictionScope(scope: GeographicJurisdictionScope): ResolvedGeographyMatch;
  resolvePropertyGeography(input: {
    provinceId?: ProvinceId;
    cityId?: SupportedCityId;
    districtNumber?: number;
    neighborhoodId?: string;
  }): ResolvedGeographyMatch;
}

export interface ExternalPropertyCharacteristicsSnapshot {
  propertyId: string;
  cityId?: SupportedCityId;
  provinceId?: ProvinceId;
  municipalityCode?: string;
  districtNumber?: number;
  neighborhoodId?: string;
  designatedZoneCode?: string;
  propertyCategory?: PropertyCategoryType;
  landUseCategory?: LandUseCategoryType;
  constructionStage?: ConstructionStageType;
  floorsCount?: number;
  plotAreaSqm?: number;
  buildingAgeYears?: number;
  isWornOutTextureBaftFarsoodeh?: boolean;
  isNearActiveFaultLine?: boolean;
}

export type AuthorizedPropertyContextResult =
  | { status: 'FOUND'; snapshot: ExternalPropertyCharacteristicsSnapshot }
  | { status: 'NOT_FOUND' }
  | { status: 'FORBIDDEN' };

/**
 * Strictly read-only Property Registry adapter contract (Stage 30-B).
 * Requires server-verified `actorId`; separates NOT_FOUND, FORBIDDEN, and FOUND.
 * Intentionally exposes ZERO write methods.
 */
export interface PropertyContextReferenceAdapter {
  getPropertyCharacteristicsById(input: {
    propertyId: string;
    actorId: string;
  }): Promise<AuthorizedPropertyContextResult>;
}

export interface SnapshotValidationReport {
  identityValid: boolean;
  attributesValid: boolean;
  missingCoreFields: string[];
  issues: string[];
}

const VALID_PROPERTY_CATEGORIES = new Set<string>([
  'RESIDENTIAL_APARTMENT', 'RESIDENTIAL_VILLA', 'COMMERCIAL_RETAIL',
  'ADMINISTRATIVE_OFFICE', 'MIXED_USE', 'RAW_URBAN_LAND', 'AGRICULTURAL_OR_GARDEN', 'INDUSTRIAL',
]);

export function validatePropertyCharacteristicsSnapshot(
  expectedPropertyId: string,
  snapshot: ExternalPropertyCharacteristicsSnapshot,
): SnapshotValidationReport {
  const issues: string[] = [];
  const missingCoreFields: string[] = [];
  const identityValid = Boolean(snapshot && snapshot.propertyId === expectedPropertyId);
  if (!identityValid) {
    issues.push(`Snapshot propertyId '${snapshot?.propertyId ?? ''}' does not match '${expectedPropertyId}'.`);
  }
  let attributesValid = true;
  if (snapshot.plotAreaSqm !== undefined && (!Number.isFinite(snapshot.plotAreaSqm) || snapshot.plotAreaSqm <= 0)) {
    attributesValid = false;
    issues.push('Snapshot plotAreaSqm must be a positive finite number.');
  }
  if (snapshot.floorsCount !== undefined && (!Number.isFinite(snapshot.floorsCount) || snapshot.floorsCount < 0)) {
    attributesValid = false;
    issues.push('Snapshot floorsCount must be a non-negative finite number.');
  }
  if (snapshot.buildingAgeYears !== undefined && (!Number.isFinite(snapshot.buildingAgeYears) || snapshot.buildingAgeYears < 0)) {
    attributesValid = false;
    issues.push('Snapshot buildingAgeYears must be a non-negative finite number.');
  }
  if (snapshot.districtNumber !== undefined && (!Number.isInteger(snapshot.districtNumber) || snapshot.districtNumber <= 0)) {
    attributesValid = false;
    issues.push('Snapshot districtNumber must be a positive integer.');
  }
  if (snapshot.propertyCategory !== undefined && !VALID_PROPERTY_CATEGORIES.has(snapshot.propertyCategory)) {
    attributesValid = false;
    issues.push(`Snapshot propertyCategory '${String(snapshot.propertyCategory)}' is invalid.`);
  }
  if (!snapshot.cityId && !snapshot.provinceId) missingCoreFields.push('geography');
  if (!snapshot.propertyCategory) missingCoreFields.push('propertyCategory');
  if (snapshot.plotAreaSqm === undefined) missingCoreFields.push('plotAreaSqm');
  if (snapshot.floorsCount === undefined) missingCoreFields.push('floorsCount');
  return { identityValid, attributesValid, missingCoreFields, issues };
}

function findNeighborhoodInCity(cityId: SupportedCityId, neighborhoodIdentifier: string): CanonicalNeighborhood | null {
  const trimmed = neighborhoodIdentifier.trim();
  if (!trimmed) return null;
  const numericId = Number(trimmed);
  if (Number.isSafeInteger(numericId) && numericId > 0) {
    const byNum = getNeighborhoodByCityAndId(cityId, numericId);
    if (byNum) return byNum;
  }
  if (trimmed.includes(':')) {
    const byComp = getNeighborhoodByCompositeId(trimmed);
    if (byComp && byComp.cityId === cityId) return byComp;
  }
  const resolved = defaultGeographicService.resolveAmbiguousName(trimmed, cityId);
  if (resolved.candidates.length > 0) return resolved.candidates[0].neighborhood;
  const lower = trimmed.toLowerCase();
  return (
    listNeighborhoodsByCity(cityId).find(
      (h) => h.nameFa === trimmed || h.slug.toLowerCase() === lower || h.compositeId.toLowerCase() === lower,
    ) ?? null
  );
}

export class CanonicalGeographyLookupAdapter implements GeographyLookupAdapter {
  validateJurisdictionScope(scope: GeographicJurisdictionScope): ResolvedGeographyMatch {
    const warnings: string[] = [];
    if (scope.countryCode !== 'IR') {
      return { valid: false, countryCode: 'IR', warnings: [`Unsupported countryCode '${String(scope.countryCode)}'.`] };
    }
    let resolvedProvinceId = scope.provinceId;
    if (scope.provinceId && !getProvinceById(scope.provinceId)) {
      return { valid: false, countryCode: 'IR', warnings: [`Province '${scope.provinceId}' is not registered.`] };
    }
    if (scope.cityId) {
      const city = getCityByIdOrName(scope.cityId);
      if (!city) {
        return { valid: false, countryCode: 'IR', provinceId: resolvedProvinceId, warnings: [`City '${scope.cityId}' is not registered.`] };
      }
      if (resolvedProvinceId && city.provinceId !== resolvedProvinceId) {
        return {
          valid: false, countryCode: 'IR', provinceId: resolvedProvinceId, cityId: city.id,
          warnings: [`City '${city.id}' belongs to province '${city.provinceId}', conflicting with '${resolvedProvinceId}'.`],
        };
      }
      resolvedProvinceId = city.provinceId;
    }
    let neighborhoodNameFa: string | undefined;
    let resolvedDistrict = scope.districtNumber;
    if (scope.neighborhoodId) {
      if (!scope.cityId) {
        return { valid: false, countryCode: 'IR', provinceId: resolvedProvinceId, warnings: ['neighborhoodId requires cityId.'] };
      }
      const hood = findNeighborhoodInCity(scope.cityId, scope.neighborhoodId);
      if (!hood) {
        return {
          valid: false, countryCode: 'IR', provinceId: resolvedProvinceId, cityId: scope.cityId,
          warnings: [`Neighborhood '${scope.neighborhoodId}' not found in city '${scope.cityId}'.`],
        };
      }
      neighborhoodNameFa = hood.nameFa;
      if (scope.districtNumber !== undefined && hood.districtNumber !== null && hood.districtNumber !== scope.districtNumber) {
        warnings.push(`Neighborhood '${hood.nameFa}' is in district ${hood.districtNumber}, overriding district ${scope.districtNumber}.`);
      }
      resolvedDistrict = hood.districtNumber ?? scope.districtNumber;
    }
    return {
      valid: true, countryCode: 'IR', provinceId: resolvedProvinceId, cityId: scope.cityId,
      districtNumber: resolvedDistrict, neighborhoodId: scope.neighborhoodId, neighborhoodNameFa, warnings,
    };
  }

  resolvePropertyGeography(input: {
    provinceId?: ProvinceId;
    cityId?: SupportedCityId;
    districtNumber?: number;
    neighborhoodId?: string;
  }): ResolvedGeographyMatch {
    const level = input.neighborhoodId ? 'NEIGHBORHOOD'
      : input.districtNumber !== undefined ? 'DISTRICT'
      : input.cityId ? 'CITY'
      : input.provinceId ? 'PROVINCIAL' : 'NATIONAL';
    return this.validateJurisdictionScope({ level, countryCode: 'IR', ...input });
  }
}

export interface InMemoryPropertyRecordEntry {
  snapshot: ExternalPropertyCharacteristicsSnapshot;
  authorizedActorIds?: string[];
  representatives?: Array<{ actorId: string; status: 'ACTIVE' | 'EXPIRED' | 'REVOKED'; expiresAtIso?: string }>;
}

/** Unit-test-only read-only in-memory adapter (rejected by `createProductionLegalRegulatoryModule`). */
export class ReadOnlyInMemoryPropertyContextAdapter implements PropertyContextReferenceAdapter {
  private readonly entries = new Map<string, InMemoryPropertyRecordEntry>();

  constructor(initial: Array<ExternalPropertyCharacteristicsSnapshot | InMemoryPropertyRecordEntry> = []) {
    for (const item of initial) {
      if ('snapshot' in item) {
        this.entries.set(item.snapshot.propertyId, {
          snapshot: { ...item.snapshot },
          authorizedActorIds: item.authorizedActorIds ? [...item.authorizedActorIds] : undefined,
          representatives: item.representatives ? item.representatives.map((r) => ({ ...r })) : undefined,
        });
      } else {
        this.entries.set(item.propertyId, { snapshot: { ...item } });
      }
    }
  }

  async getPropertyCharacteristicsById(input: {
    propertyId: string;
    actorId: string;
  }): Promise<AuthorizedPropertyContextResult> {
    const propertyId = assertSafeEntityId(input.propertyId, 'propertyId', 128);
    const entry = this.entries.get(propertyId);
    if (!entry) return { status: 'NOT_FOUND' };
    const actorId = typeof input.actorId === 'string' ? input.actorId.trim() : '';
    if (!actorId || actorId === 'anonymous' || actorId === 'anonymous-public-reader') return { status: 'FORBIDDEN' };
    if (entry.authorizedActorIds === undefined && entry.representatives === undefined) {
      return { status: 'FOUND', snapshot: { ...entry.snapshot } };
    }
    const nowMs = Date.now();
    const ownerMatch = Boolean(entry.authorizedActorIds?.includes(actorId));
    const repMatch = Boolean(
      entry.representatives?.some(
        (r) => r.actorId === actorId && r.status === 'ACTIVE' && (!r.expiresAtIso || Date.parse(r.expiresAtIso) > nowMs),
      ),
    );
    return ownerMatch || repMatch ? { status: 'FOUND', snapshot: { ...entry.snapshot } } : { status: 'FORBIDDEN' };
  }

  attemptProhibitedExternalWrite(_propertyId: string): never {
    throw new LegalRegulatoryError(
      'CROSS_MODULE_WRITE_PROHIBITED',
      'Legal & Regulatory module is strictly prohibited from mutating Property Registry records.',
      403,
    );
  }
}

const PROPERTY_CATEGORY_MAP: Record<string, PropertyCategoryType> = {
  RESIDENTIAL_APARTMENT: 'RESIDENTIAL_APARTMENT', RESIDENTIAL_TOWER: 'RESIDENTIAL_APARTMENT',
  RESIDENTIAL_APARTMENT_BLOCK: 'RESIDENTIAL_APARTMENT', residential_apartment: 'RESIDENTIAL_APARTMENT',
  SINGLE_FAMILY_VILLA: 'RESIDENTIAL_VILLA', residential_house: 'RESIDENTIAL_VILLA', villa: 'RESIDENTIAL_VILLA',
  URBAN_LAND_LOT: 'RAW_URBAN_LAND', land: 'RAW_URBAN_LAND',
  COMMERCIAL_UNIT: 'COMMERCIAL_RETAIL', COMMERCIAL_COMPLEX: 'COMMERCIAL_RETAIL',
  commercial_property: 'COMMERCIAL_RETAIL', retail_unit: 'COMMERCIAL_RETAIL', SHOP: 'COMMERCIAL_RETAIL',
  OFFICE_UNIT: 'ADMINISTRATIVE_OFFICE', OFFICE_BUILDING: 'ADMINISTRATIVE_OFFICE', office_property: 'ADMINISTRATIVE_OFFICE',
  INDUSTRIAL_FACILITY: 'INDUSTRIAL', industrial_property: 'INDUSTRIAL', warehouse: 'INDUSTRIAL',
  MIXED_USE_BUILDING: 'MIXED_USE', mixed_use: 'MIXED_USE',
};

const LAND_USE_MAP: Record<string, LandUseCategoryType> = {
  RESIDENTIAL_TARAKOM_KAM: 'RESIDENTIAL_TARAKOM_KAM', RESIDENTIAL_TARAKOM_MOTAVASET: 'RESIDENTIAL_TARAKOM_MOTAVASET',
  RESIDENTIAL_TARAKOM_ZIYAD: 'RESIDENTIAL_TARAKOM_ZIYAD', COMMERCIAL_TEJARI: 'COMMERCIAL_TEJARI',
  ADMINISTRATIVE_EDARI: 'ADMINISTRATIVE_EDARI', MIXED_MOKHTALET: 'MIXED_MOKHTALET',
  GREEN_SPACE_OR_GARDEN: 'GREEN_SPACE_OR_GARDEN', URBAN_SERVICES_KHADAMATI: 'URBAN_SERVICES_KHADAMATI',
  INDUSTRIAL_SANATI: 'INDUSTRIAL_SANATI', HERITAGE_PROTECTED_BAFT_TARIKHI: 'HERITAGE_PROTECTED_BAFT_TARIKHI',
  residential: 'RESIDENTIAL_TARAKOM_MOTAVASET', commercial: 'COMMERCIAL_TEJARI',
  mixed: 'MIXED_MOKHTALET', agricultural: 'GREEN_SPACE_OR_GARDEN', industrial: 'INDUSTRIAL_SANATI',
};

const INACTIVE_VERIFICATION_STATUSES = new Set(['REJECTED', 'EXPIRED', 'RELEASED', 'SUPERSEDED']);
const REJECTED_ACTORS = new Set(['', 'anonymous', 'anonymous-public-reader', 'server-secret-admin', 'system-admin-key']);

function computeBuildingAgeYears(raw: Record<string, unknown>, nowDate: Date): number | undefined {
  if (typeof raw.buildingAgeYears === 'number') return raw.buildingAgeYears;
  if (typeof raw.constructionYear === 'number' && Number.isFinite(raw.constructionYear)) {
    const yr = raw.constructionYear;
    if (yr >= 1300 && yr <= 1500) return Math.max(0, nowDate.getUTCFullYear() - 621 - yr);
    if (yr >= 1900 && yr <= 2100) return Math.max(0, nowDate.getUTCFullYear() - yr);
  }
  return undefined;
}

function isTimestampStillActive(expiresIso: unknown, nowMs: number): boolean {
  if (expiresIso === undefined || expiresIso === null || expiresIso === '') return true;
  if (typeof expiresIso !== 'string') return false;
  const parsed = Date.parse(expiresIso);
  return Number.isFinite(parsed) && parsed > nowMs;
}

function mapRegistryDocToSnapshot(
  requestedPropertyId: string,
  raw: Record<string, unknown>,
  nowDate: Date,
): ExternalPropertyCharacteristicsSnapshot {
  const embeddedId =
    (typeof raw.canonicalId === 'string' && raw.canonicalId.trim()) ||
    (typeof raw.id === 'string' && raw.id.trim()) ||
    requestedPropertyId;
  const geo = (raw.geographicRef && typeof raw.geographicRef === 'object' ? raw.geographicRef : {}) as Record<string, unknown>;
  const rawCategory = String(raw.unitCategory ?? raw.buildingCategory ?? raw.category ?? raw.parcelType ?? '');
  const rawLandUse = String(raw.landUseCategory ?? raw.landUseClassification ?? '');
  const floorsObj = raw.floorCount && typeof raw.floorCount === 'object' ? (raw.floorCount as Record<string, unknown>) : null;
  const floorsCount =
    typeof raw.totalFloors === 'number' ? raw.totalFloors
    : typeof raw.floorsCount === 'number' ? raw.floorsCount
    : floorsObj && typeof floorsObj.aboveGroundFloors === 'number' ? floorsObj.aboveGroundFloors : undefined;
  const plotAreaSqm =
    typeof raw.landAreaSqm === 'number' ? raw.landAreaSqm
    : typeof raw.parcelAreaSqm === 'number' ? raw.parcelAreaSqm
    : typeof raw.plotAreaSqm === 'number' ? raw.plotAreaSqm
    : typeof raw.areaSqm === 'number' ? raw.areaSqm : undefined;
  const districtNumber =
    typeof geo.districtNumber === 'number' ? geo.districtNumber
    : typeof geo.districtId === 'number' ? geo.districtId : undefined;
  const neighborhoodId =
    typeof geo.neighborhoodCompositeId === 'string' ? geo.neighborhoodCompositeId
    : typeof geo.hoodId === 'number' || typeof geo.hoodId === 'string' ? String(geo.hoodId) : undefined;

  // Strictly omit exactLocationPrivate, coordinates, postalCode, exactUnitAddress, deed numbers, and owner PII.
  return {
    propertyId: embeddedId,
    cityId: typeof geo.cityId === 'string' ? (geo.cityId as SupportedCityId) : undefined,
    provinceId: typeof geo.provinceId === 'string' ? (geo.provinceId as ProvinceId) : undefined,
    municipalityCode: typeof raw.municipalityCode === 'string' ? raw.municipalityCode : undefined,
    districtNumber,
    neighborhoodId,
    designatedZoneCode: typeof raw.designatedZoneCode === 'string' ? raw.designatedZoneCode : undefined,
    propertyCategory: PROPERTY_CATEGORY_MAP[rawCategory],
    landUseCategory: LAND_USE_MAP[rawLandUse],
    constructionStage: typeof raw.constructionStage === 'string' ? (raw.constructionStage as ConstructionStageType) : undefined,
    floorsCount,
    plotAreaSqm,
    buildingAgeYears: computeBuildingAgeYears(raw, nowDate),
    isWornOutTextureBaftFarsoodeh: typeof raw.isWornOutTextureBaftFarsoodeh === 'boolean' ? raw.isWornOutTextureBaftFarsoodeh : undefined,
    isNearActiveFaultLine: typeof raw.isNearActiveFaultLine === 'boolean' ? raw.isNearActiveFaultLine : undefined,
  };
}

function mapServiceSnapshot(snap: PropertyContextAuthorizationSnapshot, nowDate: Date): ExternalPropertyCharacteristicsSnapshot {
  return {
    propertyId: snap.propertyId,
    cityId: snap.cityId as SupportedCityId,
    districtNumber: snap.districtNumber,
    neighborhoodId: snap.neighborhoodId,
    propertyCategory: PROPERTY_CATEGORY_MAP[snap.category],
    floorsCount: snap.totalFloors,
    plotAreaSqm: snap.landAreaSqm ?? snap.areaSqm,
    buildingAgeYears: computeBuildingAgeYears({ constructionYear: snap.constructionYear }, nowDate),
  };
}

/**
 * Production strictly read-only Property Registry adapter (Stage 30-B).
 * Zero write methods; fails closed on DB outage; backend admin role alone NEVER grants private access.
 */
export class FirestoreReadOnlyPropertyRegistryAdapter implements PropertyContextReferenceAdapter {
  private readonly explicitDb?: import('firebase-admin/firestore').Firestore | null;
  private readonly dbProvider?: () => import('firebase-admin/firestore').Firestore | null | undefined;
  private readonly registryService?: Pick<PropertyRegistryService, 'authorizePropertyContextRead'>;
  private readonly nowFn: () => Date;

  constructor(options?: {
    db?: import('firebase-admin/firestore').Firestore | null;
    dbProvider?: () => import('firebase-admin/firestore').Firestore | null | undefined;
    propertyRegistryService?: Pick<PropertyRegistryService, 'authorizePropertyContextRead'>;
    nowFn?: () => Date;
  }) {
    this.explicitDb = options?.db;
    this.dbProvider = options?.dbProvider;
    this.registryService = options?.propertyRegistryService;
    this.nowFn = options?.nowFn ?? (() => new Date());
  }

  private async resolveDb(): Promise<import('firebase-admin/firestore').Firestore> {
    if (this.explicitDb !== undefined) {
      if (!this.explicitDb) {
        throw new LegalRegulatoryError('PERSISTENCE_UNAVAILABLE', 'Property Registry Firestore client is unavailable.', 503);
      }
      return this.explicitDb;
    }
    if (this.dbProvider) {
      const provided = this.dbProvider();
      if (!provided) {
        throw new LegalRegulatoryError('PERSISTENCE_UNAVAILABLE', 'Property Registry Firestore provider returned null.', 503);
      }
      return provided;
    }
    const { resolveProductionAdminFirestore } = await import('./firestoreTransactionRunner');
    return resolveProductionAdminFirestore();
  }

  private async isActorAuthorizedInFirestore(
    db: import('firebase-admin/firestore').Firestore,
    propertyId: string,
    rawDoc: Record<string, unknown>,
    actorId: string,
    nowMs: number,
  ): Promise<boolean> {
    if (rawDoc.ownerUid === actorId) return true;
    if (!rawDoc.ownerUid && rawDoc.createdByUid === actorId) return true;

    const reps = Array.isArray(rawDoc.authorizedRepresentatives) ? (rawDoc.authorizedRepresentatives as Array<Record<string, unknown>>) : [];
    if (reps.some((r) => (r.actorUid === actorId || r.representativeUid === actorId) && r.status === 'ACTIVE' && isTimestampStillActive(r.expiresAtIso, nowMs))) {
      return true;
    }

    const ownershipSnap = await db.collection('property_ownership_interests_v1').where('propertyId', '==', propertyId).limit(50).get();
    if (ownershipSnap.docs.some((doc) => {
      const d = doc.data() as Record<string, unknown>;
      const partyRef = d.partyRef && typeof d.partyRef === 'object' ? (d.partyRef as Record<string, unknown>) : null;
      const holder = partyRef?.partyId ?? d.holderUid ?? d.ownerUid ?? d.partyUid;
      const vec = d.statusVector && typeof d.statusVector === 'object' ? (d.statusVector as Record<string, unknown>) : null;
      const verStatus = typeof vec?.verificationStatus === 'string' ? vec.verificationStatus : '';
      return holder === actorId && (d.status === undefined || d.status === 'ACTIVE') && !d.terminatedAtIso && !INACTIVE_VERIFICATION_STATUSES.has(verStatus) && isTimestampStillActive(d.expirationDateIso, nowMs);
    })) return true;

    const rightsSnap = await db.collection('property_non_ownership_rights_v1').where('propertyId', '==', propertyId).limit(50).get();
    return rightsSnap.docs.some((doc) => {
      const d = doc.data() as Record<string, unknown>;
      const ben = d.beneficiaryParty && typeof d.beneficiaryParty === 'object' ? (d.beneficiaryParty as Record<string, unknown>) : null;
      const holder = ben?.partyId ?? d.representativeUid ?? d.actorUid;
      const vec = d.statusVector && typeof d.statusVector === 'object' ? (d.statusVector as Record<string, unknown>) : null;
      const verStatus = typeof vec?.verificationStatus === 'string' ? vec.verificationStatus : '';
      return holder === actorId && (d.status === undefined || d.status === 'ACTIVE') && !INACTIVE_VERIFICATION_STATUSES.has(verStatus) && isTimestampStillActive(d.expirationOrTerminationIso ?? d.expiresAtIso, nowMs);
    });
  }

  async getPropertyCharacteristicsById(input: {
    propertyId: string;
    actorId: string;
  }): Promise<AuthorizedPropertyContextResult> {
    const propertyId = assertSafeEntityId(input.propertyId, 'propertyId', 128);
    const actorId = typeof input.actorId === 'string' ? input.actorId.trim() : '';
    const nowDate = this.nowFn();

    if (this.registryService) {
      try {
        const res = await this.registryService.authorizePropertyContextRead({ propertyId, actorId, nowIso: nowDate.toISOString() });
        if (res.status !== 'FOUND') return { status: res.status };
        return { status: 'FOUND', snapshot: mapServiceSnapshot(res.snapshot, nowDate) };
      } catch (err) {
        if (err instanceof LegalRegulatoryError) throw err;
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 400) throw new LegalRegulatoryError('VALIDATION_ERROR', (err as Error).message, 400);
        if (statusCode === 422) throw new LegalRegulatoryError('SNAPSHOT_INCONSISTENT', (err as Error).message, 422);
        throw new LegalRegulatoryError('PERSISTENCE_UNAVAILABLE', 'Property Registry authorization service is temporarily unavailable.', 503);
      }
    }

    const db = await this.resolveDb();
    try {
      let raw: Record<string, unknown> | null = null;
      const canonicalSnap = await db.collection('property_registry_entities').doc(propertyId).get();
      if (canonicalSnap.exists && canonicalSnap.data()) {
        raw = canonicalSnap.data() as Record<string, unknown>;
      } else {
        const assetSnap = await db.collection('propertyAssets').doc(propertyId).get();
        if (assetSnap.exists && assetSnap.data()) raw = assetSnap.data() as Record<string, unknown>;
      }
      if (!raw) return { status: 'NOT_FOUND' };
      if (REJECTED_ACTORS.has(actorId)) return { status: 'FORBIDDEN' };

      const authorized = await this.isActorAuthorizedInFirestore(db, propertyId, raw, actorId, nowDate.getTime());
      if (!authorized) return { status: 'FORBIDDEN' };

      const snapshot = mapRegistryDocToSnapshot(propertyId, raw, nowDate);
      if (snapshot.propertyId !== propertyId) {
        throw new LegalRegulatoryError('SNAPSHOT_INCONSISTENT', `Property Registry snapshot identity mismatch for '${propertyId}'.`, 422);
      }
      return { status: 'FOUND', snapshot };
    } catch (err) {
      if (err instanceof LegalRegulatoryError) throw err;
      throw new LegalRegulatoryError('PERSISTENCE_UNAVAILABLE', 'Property Registry dependency is temporarily unavailable.', 503);
    }
  }
}

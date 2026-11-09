/**
 * @file server/modules/property-registry/services/propertyRegistryCoreService.ts
 * @description Core entity creation, retrieval (including retired/merged redirect resolution and
 * privacy-aware redaction), and descriptive attribute update operations for the Canonical Property Registry.
 */

import { randomUUID } from 'node:crypto';
import {
  CoreApiError,
  executeIdempotentMutation,
  sanitizeTextInput,
  type AuthenticatedPrincipal,
} from '../../core';
import type { CanonicalPropertyIdentityProjection } from '../contracts/externalAdapters';
import type {
  AttributeChangeHistoryRecord,
  BuildingCategory,
  BuildingConstructionYearSpec,
  BuildingFloorCountSpec,
  CanonicalBuildingEntity,
  CanonicalGeographicReference,
  CanonicalOtherPropertyEntity,
  CanonicalParcelEntity,
  CanonicalPropertyEntity,
  CanonicalUnitEntity,
  DataQualityFindingRecord,
  EntityRelationshipRecord,
  OtherPropertyEntitySubType,
  ParcelType,
  UnitAreaSpec,
  UnitCategory,
} from '../domain/types';
import {
  buildNormalizedAddressReference,
  computeIdentityQualityDimensions,
  generateCanonicalPropertyId,
  redactEntityForPublicAccess,
} from '../resolution/relationshipsAndResolutionEngine';
import {
  assertRegistryWriteAuthorized,
  canAccessUnredactedPropertyDetails,
  isPrincipalAdminOrReviewer,
  PROPERTY_REGISTRY_COLLECTIONS,
  recordRegistryAuditEvent,
  refreshEntityQualityDimensionsInTx,
  requireValidId,
  runRegistryDurableTx,
  sanitizeSourceProvenance,
  type PropertyRegistryServiceDependencies,
} from './propertyRegistryContext';

export interface BaseCreateEntityInput {
  principal: AuthenticatedPrincipal;
  idempotencyKey: string;
  clientSuppliedCanonicalId?: string;
  geographicInput: {
    provinceId: string;
    cityId: string;
    municipalityName?: string | null;
    districtNumber?: number | null;
    neighborhoodCompositeId?: string | null;
    coordinates?: { lat: number; lng: number } | null;
    geometryPrecision?: CanonicalGeographicReference['geometryPrecision'];
  };
  addressInput: {
    street: string;
    streetNumberOrPlate?: string | null;
    buildingEntranceOrBlock?: string | null;
    unitDesignation?: string | null;
    postalCode?: string | null;
    rawSourceAddress?: string;
  };
  sourceProvenance: {
    sourceRecordId: string;
    sourceSystemNamespace: string;
    reliabilityTier?:
      | 'AUTHORITATIVE_OFFICIAL'
      | 'VERIFIED_PARTNER'
      | 'PLATFORM_INTERNAL'
      | 'USER_SUBMITTED'
      | 'UNVERIFIED_EXTERNAL';
    notes?: string;
  };
}

export function createPropertyRegistryCoreOperations(deps: PropertyRegistryServiceDependencies) {
  const now = deps.now ?? (() => new Date());

  async function validateAndBuildGeoAndAddress(input: BaseCreateEntityInput, nowIso: string) {
    if (input.clientSuppliedCanonicalId !== undefined) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'CLIENT_SUPPLIED_CANONICAL_ID_FORBIDDEN: Canonical property IDs are generated exclusively by the registry and may never be client-supplied.',
      );
    }

    const geoCheck = await deps.geographyAdapter.validateGeographicReference({
      provinceId: input.geographicInput.provinceId,
      cityId: input.geographicInput.cityId,
      neighborhoodCompositeId: input.geographicInput.neighborhoodCompositeId,
      districtNumber: input.geographicInput.districtNumber,
      coordinates: input.geographicInput.coordinates,
    });

    if (!geoCheck.valid) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        `INVALID_GEOGRAPHIC_REFERENCE: ${geoCheck.validationNote || `Invalid geographic reference for city '${input.geographicInput.cityId}'.`}`,
      );
    }

    const geographicRef: CanonicalGeographicReference = {
      countryCode: 'IR',
      provinceId: geoCheck.provinceId,
      cityId: geoCheck.cityId,
      municipalityName: input.geographicInput.municipalityName
        ? sanitizeTextInput(input.geographicInput.municipalityName).slice(0, 80)
        : null,
      districtNumber: geoCheck.districtNumber,
      neighborhoodCompositeId: geoCheck.neighborhoodCompositeId,
      coordinates: input.geographicInput.coordinates ?? null,
      geometryPrecision: input.geographicInput.geometryPrecision ?? 'APPROXIMATE_STREET',
      geographyValidatedAtIso: nowIso,
    };

    const addressRef = buildNormalizedAddressReference({
      provinceId: geoCheck.provinceId,
      cityId: geoCheck.cityId,
      municipality: geographicRef.municipalityName,
      districtNumber: geoCheck.districtNumber,
      neighborhoodCompositeId: geoCheck.neighborhoodCompositeId,
      neighborhoodNameFa: geoCheck.canonicalNeighborhoodNameFa,
      street: input.addressInput.street,
      streetNumberOrPlate: input.addressInput.streetNumberOrPlate,
      buildingEntranceOrBlock: input.addressInput.buildingEntranceOrBlock,
      unitDesignation: input.addressInput.unitDesignation,
      postalCode: input.addressInput.postalCode,
      rawSourceAddress: input.addressInput.rawSourceAddress,
      sourceRecordId: input.sourceProvenance.sourceRecordId,
      sourceSystemNamespace: input.sourceProvenance.sourceSystemNamespace,
      nowIso,
    });

    return { geographicRef, addressRef };
  }

  return {
    /**
     * 1. Create canonical parcel
     */
    async createCanonicalParcel(
      input: BaseCreateEntityInput & {
        parcelType: ParcelType;
        parcelAreaSqm?: number | null;
        areaMeasurementBasis?: CanonicalParcelEntity['areaMeasurementBasis'];
        officialParcelIdentifier?: string | null;
        officialParcelIdentifierVerified?: boolean;
        boundaryReferenceId?: string | null;
      },
    ): Promise<CanonicalParcelEntity> {
      const principal = assertRegistryWriteAuthorized(input.principal, 'CREATE_OR_UPDATE_ENTITY');
      const nowDate = now();
      const nowIso = nowDate.toISOString();

      if (input.parcelAreaSqm !== undefined && input.parcelAreaSqm !== null) {
        if (!Number.isFinite(input.parcelAreaSqm) || input.parcelAreaSqm <= 0) {
          throw new CoreApiError(
            'VALIDATION_FAILED',
            400,
            'INVALID_PARCEL_AREA: Parcel area must be a positive finite number.',
          );
        }
      }

      const { geographicRef, addressRef } = await validateAndBuildGeoAndAddress(input, nowIso);
      const sourceRef = sanitizeSourceProvenance(input.sourceProvenance, principal, nowIso);

      const isAdmin = isPrincipalAdminOrReviewer(principal);
      const officialVerified = Boolean(
        isAdmin && input.officialParcelIdentifier && input.officialParcelIdentifierVerified,
      );

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_registry.createCanonicalParcel',
        actorUid: principal.uid,
        requestPayload: {
          parcelType: input.parcelType,
          parcelAreaSqm: input.parcelAreaSqm ?? null,
          street: addressRef.street,
          sourceRecordId: sourceRef.sourceRecordId,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runRegistryDurableTx(
            deps.txRunner,
            'property_registry.createCanonicalParcel',
            async (tx) => {
              const canonicalId = generateCanonicalPropertyId('PARCEL');
              const initialParcel: CanonicalParcelEntity = {
                canonicalId,
                entityKind: 'PARCEL',
                registrationStatus:
                  input.parcelAreaSqm && geographicRef.neighborhoodCompositeId
                    ? 'ACTIVE_CANONICAL'
                    : 'PROVISIONAL_INCOMPLETE',
                retiredOrRedirectedToIds: [],
                geographicRef,
                addressRef,
                parcelType: input.parcelType,
                parcelAreaSqm: input.parcelAreaSqm ?? null,
                areaMeasurementUnit: 'SQM',
                areaMeasurementBasis: input.areaMeasurementBasis ?? 'UNKNOWN',
                officialParcelIdentifier: input.officialParcelIdentifier
                  ? sanitizeTextInput(input.officialParcelIdentifier).slice(0, 80)
                  : null,
                officialParcelIdentifierVerified: officialVerified,
                boundaryReferenceId: input.boundaryReferenceId
                  ? requireValidId(input.boundaryReferenceId, 'boundaryReferenceId')
                  : null,
                qualityDimensions: computeIdentityQualityDimensions({
                  sourceReferences: [sourceRef],
                  hasVerifiedOfficialIdentifier: officialVerified,
                  populatedAttributeRatio: 0.5,
                  hasStructuralRelationship: false,
                  openFindings: [],
                  nowIso,
                }),
                sourceReferences: [sourceRef],
                recordVersion: 1,
                createdByUid: principal.uid,
                createdAtIso: nowIso,
                updatedAtIso: nowIso,
              };

              const finalized = (await refreshEntityQualityDimensionsInTx(
                tx,
                initialParcel,
                nowIso,
              )) as CanonicalParcelEntity;

              tx.set(PROPERTY_REGISTRY_COLLECTIONS.INITIAL_SNAPSHOTS, canonicalId, {
                canonicalId,
                snapshot: {
                  parcelType: finalized.parcelType,
                  parcelAreaSqm: finalized.parcelAreaSqm,
                  areaMeasurementBasis: finalized.areaMeasurementBasis,
                  street: finalized.addressRef.street,
                  streetNumberOrPlate: finalized.addressRef.streetNumberOrPlate,
                  postalCode: finalized.addressRef.postalCode,
                },
                createdAtIso: nowIso,
              });

              return { statusCode: 201, body: finalized };
            },
          ),
      });

      await recordRegistryAuditEvent(deps, {
        principal,
        action: 'property_registry.createCanonicalParcel',
        targetCollection: PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
        targetResourceId: res.body.canonicalId,
        outcome: 'SUCCESS',
        metadata: { parcelType: res.body.parcelType, replayed: res.replayed },
      });

      return res.body;
    },

    /**
     * 2. Create canonical building
     */
    async createCanonicalBuilding(
      input: BaseCreateEntityInput & {
        buildingCategory: BuildingCategory;
        associatedParcelIds?: string[];
        footprintReferenceId?: string | null;
        constructionYear?: Partial<BuildingConstructionYearSpec>;
        floorCount?: Partial<BuildingFloorCountSpec>;
        buildingUseClassification: CanonicalBuildingEntity['buildingUseClassification'];
        constructionStatus?: CanonicalBuildingEntity['constructionStatus'];
      },
    ): Promise<CanonicalBuildingEntity> {
      const principal = assertRegistryWriteAuthorized(input.principal, 'CREATE_OR_UPDATE_ENTITY');
      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const { geographicRef, addressRef } = await validateAndBuildGeoAndAddress(input, nowIso);
      const sourceRef = sanitizeSourceProvenance(input.sourceProvenance, principal, nowIso);
      const associatedParcelIds = (input.associatedParcelIds ?? []).map((id) =>
        requireValidId(id, 'associatedParcelId'),
      );

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_registry.createCanonicalBuilding',
        actorUid: principal.uid,
        requestPayload: {
          buildingCategory: input.buildingCategory,
          associatedParcelIds,
          street: addressRef.street,
          sourceRecordId: sourceRef.sourceRecordId,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runRegistryDurableTx(
            deps.txRunner,
            'property_registry.createCanonicalBuilding',
            async (tx) => {
              for (const parcelId of associatedParcelIds) {
                const parcel = await tx.get<CanonicalPropertyEntity>(
                  PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
                  parcelId,
                );
                if (!parcel || parcel.entityKind !== 'PARCEL') {
                  throw new CoreApiError(
                    'NOT_FOUND',
                    404,
                    `ASSOCIATED_PARCEL_NOT_FOUND: Referenced parcel '${parcelId}' does not exist.`,
                  );
                }
              }

              const canonicalId = generateCanonicalPropertyId('BUILDING');
              const constructionYear: BuildingConstructionYearSpec = {
                exactYearSolarHijri: input.constructionYear?.exactYearSolarHijri ?? null,
                estimatedPeriodFromSolarHijri:
                  input.constructionYear?.estimatedPeriodFromSolarHijri ?? null,
                estimatedPeriodToSolarHijri:
                  input.constructionYear?.estimatedPeriodToSolarHijri ?? null,
                isEstimated:
                  input.constructionYear?.isEstimated ??
                  input.constructionYear?.exactYearSolarHijri === undefined,
              };

              const floorCount: BuildingFloorCountSpec = {
                aboveGroundFloors: input.floorCount?.aboveGroundFloors ?? null,
                belowGroundFloors: input.floorCount?.belowGroundFloors ?? null,
                isApproximate: input.floorCount?.isApproximate ?? true,
              };

              const initialBuilding: CanonicalBuildingEntity = {
                canonicalId,
                entityKind: 'BUILDING',
                registrationStatus:
                  associatedParcelIds.length > 0 ? 'ACTIVE_CANONICAL' : 'PROVISIONAL_INCOMPLETE',
                retiredOrRedirectedToIds: [],
                geographicRef,
                addressRef,
                buildingCategory: input.buildingCategory,
                associatedParcelIds,
                footprintReferenceId: input.footprintReferenceId
                  ? requireValidId(input.footprintReferenceId, 'footprintReferenceId')
                  : null,
                constructionYear,
                floorCount,
                buildingUseClassification: input.buildingUseClassification,
                constructionStatus: input.constructionStatus ?? 'COMPLETED_ACTIVE',
                qualityDimensions: computeIdentityQualityDimensions({
                  sourceReferences: [sourceRef],
                  hasVerifiedOfficialIdentifier: false,
                  populatedAttributeRatio: 0.6,
                  hasStructuralRelationship: associatedParcelIds.length > 0,
                  openFindings: [],
                  nowIso,
                }),
                sourceReferences: [sourceRef],
                recordVersion: 1,
                createdByUid: principal.uid,
                createdAtIso: nowIso,
                updatedAtIso: nowIso,
              };

              for (const parcelId of associatedParcelIds) {
                const relId = `rel_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
                const relRecord: EntityRelationshipRecord = {
                  relationshipId: relId,
                  sourceEntityId: parcelId,
                  sourceEntityKind: 'PARCEL',
                  targetEntityId: canonicalId,
                  targetEntityKind: 'BUILDING',
                  relationshipType: 'PARCEL_CONTAINS_BUILDING',
                  status: 'ACTIVE',
                  validFromIso: nowIso,
                  validToIso: null,
                  provenanceReferences: [sourceRef],
                  verificationStatus: 'SINGLE_SOURCE_REPORTED',
                  createdByUid: principal.uid,
                  createdAtIso: nowIso,
                  updatedAtIso: nowIso,
                };
                tx.set(PROPERTY_REGISTRY_COLLECTIONS.RELATIONSHIPS, relId, relRecord);
              }

              const finalized = (await refreshEntityQualityDimensionsInTx(
                tx,
                initialBuilding,
                nowIso,
              )) as CanonicalBuildingEntity;

              tx.set(PROPERTY_REGISTRY_COLLECTIONS.INITIAL_SNAPSHOTS, canonicalId, {
                canonicalId,
                snapshot: {
                  buildingCategory: finalized.buildingCategory,
                  aboveGroundFloors: finalized.floorCount.aboveGroundFloors,
                  constructionStatus: finalized.constructionStatus,
                  street: finalized.addressRef.street,
                  streetNumberOrPlate: finalized.addressRef.streetNumberOrPlate,
                },
                createdAtIso: nowIso,
              });

              return { statusCode: 201, body: finalized };
            },
          ),
      });

      return res.body;
    },

    /**
     * 3. Create canonical unit
     */
    async createCanonicalUnit(
      input: BaseCreateEntityInput & {
        parentBuildingId?: string | null;
        associatedParcelId?: string | null;
        unitDesignation: string;
        floorReference?: string | null;
        unitCategory: UnitCategory;
        areaSpec?: Partial<UnitAreaSpec>;
        usageClassification: CanonicalUnitEntity['usageClassification'];
      },
    ): Promise<CanonicalUnitEntity> {
      const principal = assertRegistryWriteAuthorized(input.principal, 'CREATE_OR_UPDATE_ENTITY');
      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const unitDesignationClean = sanitizeTextInput(input.unitDesignation).slice(0, 40);
      if (!unitDesignationClean) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'INVALID_UNIT_DESIGNATION: unitDesignation is required.',
        );
      }

      if (input.areaSpec?.reportedAreaSqm !== undefined && input.areaSpec.reportedAreaSqm !== null) {
        if (!Number.isFinite(input.areaSpec.reportedAreaSqm) || input.areaSpec.reportedAreaSqm <= 0) {
          throw new CoreApiError(
            'VALIDATION_FAILED',
            400,
            'INVALID_UNIT_AREA: Unit area must be a positive finite number.',
          );
        }
      }

      const { geographicRef, addressRef } = await validateAndBuildGeoAndAddress(
        {
          ...input,
          addressInput: {
            ...input.addressInput,
            unitDesignation: unitDesignationClean,
          },
        },
        nowIso,
      );
      const sourceRef = sanitizeSourceProvenance(input.sourceProvenance, principal, nowIso);
      const parentBuildingId = input.parentBuildingId
        ? requireValidId(input.parentBuildingId, 'parentBuildingId')
        : null;
      const associatedParcelId = input.associatedParcelId
        ? requireValidId(input.associatedParcelId, 'associatedParcelId')
        : null;

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_registry.createCanonicalUnit',
        actorUid: principal.uid,
        requestPayload: {
          parentBuildingId,
          unitDesignation: unitDesignationClean,
          unitCategory: input.unitCategory,
          sourceRecordId: sourceRef.sourceRecordId,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runRegistryDurableTx(
            deps.txRunner,
            'property_registry.createCanonicalUnit',
            async (tx) => {
              let resolvedParcelId = associatedParcelId;
              if (parentBuildingId) {
                const parentBldg = await tx.get<CanonicalPropertyEntity>(
                  PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
                  parentBuildingId,
                );
                if (!parentBldg || parentBldg.entityKind !== 'BUILDING') {
                  throw new CoreApiError(
                    'NOT_FOUND',
                    404,
                    `PARENT_BUILDING_NOT_FOUND: Referenced parent building '${parentBuildingId}' does not exist.`,
                  );
                }
                if (!resolvedParcelId && parentBldg.associatedParcelIds.length > 0) {
                  resolvedParcelId = parentBldg.associatedParcelIds[0];
                }
              }

              if (resolvedParcelId) {
                const parcel = await tx.get<CanonicalPropertyEntity>(
                  PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
                  resolvedParcelId,
                );
                if (!parcel || parcel.entityKind !== 'PARCEL') {
                  throw new CoreApiError(
                    'NOT_FOUND',
                    404,
                    `ASSOCIATED_PARCEL_NOT_FOUND: Referenced parcel '${resolvedParcelId}' does not exist.`,
                  );
                }
              }

              const canonicalId = generateCanonicalPropertyId('UNIT');
              const initialUnit: CanonicalUnitEntity = {
                canonicalId,
                entityKind: 'UNIT',
                registrationStatus: parentBuildingId ? 'ACTIVE_CANONICAL' : 'PROVISIONAL_INCOMPLETE',
                retiredOrRedirectedToIds: [],
                geographicRef,
                addressRef,
                parentBuildingId,
                associatedParcelId: resolvedParcelId,
                unitDesignation: unitDesignationClean,
                floorReference: input.floorReference
                  ? sanitizeTextInput(input.floorReference).slice(0, 30)
                  : null,
                unitCategory: input.unitCategory,
                areaSpec: {
                  reportedAreaSqm: input.areaSpec?.reportedAreaSqm ?? null,
                  verifiedDeedAreaSqm: input.areaSpec?.verifiedDeedAreaSqm ?? null,
                  isApproximate: input.areaSpec?.isApproximate ?? true,
                },
                usageClassification: input.usageClassification,
                qualityDimensions: computeIdentityQualityDimensions({
                  sourceReferences: [sourceRef],
                  hasVerifiedOfficialIdentifier: false,
                  populatedAttributeRatio: 0.65,
                  hasStructuralRelationship: Boolean(parentBuildingId),
                  openFindings: [],
                  nowIso,
                }),
                sourceReferences: [sourceRef],
                recordVersion: 1,
                createdByUid: principal.uid,
                createdAtIso: nowIso,
                updatedAtIso: nowIso,
              };

              if (parentBuildingId) {
                const relId = `rel_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
                const relRecord: EntityRelationshipRecord = {
                  relationshipId: relId,
                  sourceEntityId: parentBuildingId,
                  sourceEntityKind: 'BUILDING',
                  targetEntityId: canonicalId,
                  targetEntityKind: 'UNIT',
                  relationshipType: 'BUILDING_CONTAINS_UNIT',
                  status: 'ACTIVE',
                  validFromIso: nowIso,
                  validToIso: null,
                  provenanceReferences: [sourceRef],
                  verificationStatus: 'SINGLE_SOURCE_REPORTED',
                  createdByUid: principal.uid,
                  createdAtIso: nowIso,
                  updatedAtIso: nowIso,
                };
                tx.set(PROPERTY_REGISTRY_COLLECTIONS.RELATIONSHIPS, relId, relRecord);
              }

              const finalized = (await refreshEntityQualityDimensionsInTx(
                tx,
                initialUnit,
                nowIso,
              )) as CanonicalUnitEntity;

              tx.set(PROPERTY_REGISTRY_COLLECTIONS.INITIAL_SNAPSHOTS, canonicalId, {
                canonicalId,
                snapshot: {
                  unitDesignation: finalized.unitDesignation,
                  floorReference: finalized.floorReference,
                  reportedAreaSqm: finalized.areaSpec.reportedAreaSqm,
                  verifiedDeedAreaSqm: finalized.areaSpec.verifiedDeedAreaSqm,
                  street: finalized.addressRef.street,
                },
                createdAtIso: nowIso,
              });

              return { statusCode: 201, body: finalized };
            },
          ),
      });

      return res.body;
    },

    /**
     * 3.D Create other supported property entity (Development site, shared facility, parking asset, etc.)
     */
    async createOtherPropertyEntity(
      input: BaseCreateEntityInput & {
        assetSubType: OtherPropertyEntitySubType;
        associatedParcelIds?: string[];
        associatedBuildingId?: string | null;
        reportedAreaSqm?: number | null;
        descriptionSummary: string;
      },
    ): Promise<CanonicalOtherPropertyEntity> {
      const principal = assertRegistryWriteAuthorized(input.principal, 'CREATE_OR_UPDATE_ENTITY');
      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const { geographicRef, addressRef } = await validateAndBuildGeoAndAddress(input, nowIso);
      const sourceRef = sanitizeSourceProvenance(input.sourceProvenance, principal, nowIso);
      const associatedParcelIds = (input.associatedParcelIds ?? []).map((id) =>
        requireValidId(id, 'associatedParcelId'),
      );
      const associatedBuildingId = input.associatedBuildingId
        ? requireValidId(input.associatedBuildingId, 'associatedBuildingId')
        : null;

      return runRegistryDurableTx(
        deps.txRunner,
        'property_registry.createOtherPropertyEntity',
        async (tx) => {
          const canonicalId = generateCanonicalPropertyId('OTHER_ASSET');
          const initialAsset: CanonicalOtherPropertyEntity = {
            canonicalId,
            entityKind: 'OTHER_ASSET',
            registrationStatus: 'ACTIVE_CANONICAL',
            retiredOrRedirectedToIds: [],
            geographicRef,
            addressRef,
            assetSubType: input.assetSubType,
            associatedParcelIds,
            associatedBuildingId,
            reportedAreaSqm: input.reportedAreaSqm ?? null,
            descriptionSummary: sanitizeTextInput(input.descriptionSummary).slice(0, 300),
            qualityDimensions: computeIdentityQualityDimensions({
              sourceReferences: [sourceRef],
              hasVerifiedOfficialIdentifier: false,
              populatedAttributeRatio: 0.6,
              hasStructuralRelationship: Boolean(
                associatedBuildingId || associatedParcelIds.length > 0,
              ),
              openFindings: [],
              nowIso,
            }),
            sourceReferences: [sourceRef],
            recordVersion: 1,
            createdByUid: principal.uid,
            createdAtIso: nowIso,
            updatedAtIso: nowIso,
          };

          const finalized = (await refreshEntityQualityDimensionsInTx(
            tx,
            initialAsset,
            nowIso,
          )) as CanonicalOtherPropertyEntity;

          tx.set(PROPERTY_REGISTRY_COLLECTIONS.INITIAL_SNAPSHOTS, canonicalId, {
            canonicalId,
            snapshot: {
              assetSubType: finalized.assetSubType,
              reportedAreaSqm: finalized.reportedAreaSqm,
              street: finalized.addressRef.street,
            },
            createdAtIso: nowIso,
          });

          return finalized;
        },
      );
    },

    /**
     * 4. Retrieve canonical entity (resolving retired/merged redirects when requested and redacting for public callers)
     */
    async getCanonicalEntity(input: {
      principal?: AuthenticatedPrincipal | null;
      canonicalId: string;
      followMergedRedirects?: boolean;
    }): Promise<{
      requestedCanonicalId: string;
      resolvedEntity: CanonicalPropertyEntity;
      wasRedirectedFromRetiredId: boolean;
      redirectTrail: string[];
    }> {
      const requestedId = requireValidId(input.canonicalId, 'canonicalId');
      return runRegistryDurableTx(
        deps.txRunner,
        'property_registry.getCanonicalEntity',
        async (tx) => {
          let current = await tx.get<CanonicalPropertyEntity>(
            PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
            requestedId,
          );
          if (!current) {
            throw new CoreApiError(
              'NOT_FOUND',
              404,
              `CANONICAL_ENTITY_NOT_FOUND: Entity '${requestedId}' not found.`,
            );
          }

          const redirectTrail: string[] = [current.canonicalId];
          let wasRedirected = false;

          if (
            input.followMergedRedirects !== false &&
            current.registrationStatus === 'MERGED_REDIRECT' &&
            current.retiredOrRedirectedToIds.length === 1
          ) {
            const targetId = current.retiredOrRedirectedToIds[0];
            const targetEntity = await tx.get<CanonicalPropertyEntity>(
              PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
              targetId,
            );
            if (targetEntity) {
              current = targetEntity;
              redirectTrail.push(targetEntity.canonicalId);
              wasRedirected = true;
            }
          }

          const allowFull = canAccessUnredactedPropertyDetails(input.principal, current);
          const resolvedEntity = allowFull ? current : redactEntityForPublicAccess(current);

          return {
            requestedCanonicalId: requestedId,
            resolvedEntity,
            wasRedirectedFromRetiredId: wasRedirected,
            redirectTrail,
          };
        },
      );
    },

    /**
     * Cross-module read projection contract
     */
    async getCanonicalIdentityProjection(
      canonicalId: string,
    ): Promise<CanonicalPropertyIdentityProjection> {
      const { resolvedEntity } = await this.getCanonicalEntity({
        canonicalId,
        followMergedRedirects: true,
      });

      const parentBuildingId =
        resolvedEntity.entityKind === 'UNIT'
          ? resolvedEntity.parentBuildingId
          : resolvedEntity.entityKind === 'OTHER_ASSET'
            ? resolvedEntity.associatedBuildingId
            : null;

      const associatedParcelIds =
        resolvedEntity.entityKind === 'BUILDING' || resolvedEntity.entityKind === 'OTHER_ASSET'
          ? resolvedEntity.associatedParcelIds
          : resolvedEntity.entityKind === 'UNIT' && resolvedEntity.associatedParcelId
            ? [resolvedEntity.associatedParcelId]
            : resolvedEntity.entityKind === 'PARCEL'
              ? [resolvedEntity.canonicalId]
              : [];

      return {
        canonicalId,
        resolvedActiveCanonicalId: resolvedEntity.canonicalId,
        entityKind: resolvedEntity.entityKind,
        registrationStatus: resolvedEntity.registrationStatus,
        parentBuildingId,
        associatedParcelIds,
        provinceId: resolvedEntity.geographicRef.provinceId,
        cityId: resolvedEntity.geographicRef.cityId,
        neighborhoodCompositeId: resolvedEntity.geographicRef.neighborhoodCompositeId,
        districtNumber: resolvedEntity.geographicRef.districtNumber,
        redactedPublicAddressSummary: resolvedEntity.addressRef.publicRedactedAddressSummary,
        identityConfidence: resolvedEntity.qualityDimensions.identityConfidence,
        verificationStatus: resolvedEntity.qualityDimensions.verificationStatus,
        recordVersion: resolvedEntity.recordVersion,
        updatedAtIso: resolvedEntity.updatedAtIso,
      };
    },

    /**
     * 5. Update permitted descriptive attributes without changing the stable canonical ID.
     */
    async updateDescriptiveAttributes(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      canonicalId: string;
      effectiveDateIso: string;
      changeReason: string;
      sourceProvenance: {
        sourceRecordId: string;
        sourceSystemNamespace: string;
        reliabilityTier?:
          | 'AUTHORITATIVE_OFFICIAL'
          | 'VERIFIED_PARTNER'
          | 'PLATFORM_INTERNAL'
          | 'USER_SUBMITTED'
          | 'UNVERIFIED_EXTERNAL';
        notes?: string;
      };
      updates: {
        street?: string;
        streetNumberOrPlate?: string | null;
        postalCode?: string | null;
        rawSourceAddress?: string;
        parcelAreaSqm?: number;
        areaMeasurementBasis?: CanonicalParcelEntity['areaMeasurementBasis'];
        aboveGroundFloors?: number;
        constructionStatus?: CanonicalBuildingEntity['constructionStatus'];
        reportedAreaSqm?: number;
        verifiedDeedAreaSqm?: number;
        floorReference?: string;
      };
    }): Promise<{
      entity: CanonicalPropertyEntity;
      recordedChanges: AttributeChangeHistoryRecord[];
      createdFindings: DataQualityFindingRecord[];
    }> {
      const principal = assertRegistryWriteAuthorized(input.principal, 'CREATE_OR_UPDATE_ENTITY');
      const canonicalId = requireValidId(input.canonicalId, 'canonicalId');
      const nowDate = now();
      const nowIso = nowDate.toISOString();

      if (!Number.isFinite(Date.parse(input.effectiveDateIso))) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'INVALID_EFFECTIVE_DATE: effectiveDateIso must be a valid ISO-8601 date.',
        );
      }

      const sourceRef = sanitizeSourceProvenance(input.sourceProvenance, principal, nowIso);
      const changeReason = sanitizeTextInput(input.changeReason).slice(0, 240);

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_registry.updateDescriptiveAttributes',
        actorUid: principal.uid,
        requestPayload: {
          canonicalId,
          effectiveDateIso: input.effectiveDateIso,
          updates: input.updates,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runRegistryDurableTx(
            deps.txRunner,
            'property_registry.updateDescriptiveAttributes',
            async (tx) => {
              const existing = await tx.get<CanonicalPropertyEntity>(
                PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
                canonicalId,
              );
              if (!existing) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `CANONICAL_ENTITY_NOT_FOUND: Entity '${canonicalId}' not found.`,
                );
              }
              if (
                existing.registrationStatus === 'MERGED_REDIRECT' ||
                existing.registrationStatus === 'SPLIT_RETIRED'
              ) {
                throw new CoreApiError(
                  'CONFLICT',
                  409,
                  `RETIRED_ENTITY_IMMUTABLE: Retired or merged entity '${canonicalId}' cannot be mutated directly.`,
                );
              }

              const nextVersion = existing.recordVersion + 1;
              let updated: CanonicalPropertyEntity = {
                ...existing,
                sourceReferences: [...existing.sourceReferences, sourceRef],
                recordVersion: nextVersion,
                updatedAtIso: nowIso,
              };

              const recordedChanges: AttributeChangeHistoryRecord[] = [];
              const createdFindings: DataQualityFindingRecord[] = [];

              const recordChange = (attr: string, prevVal: unknown, newVal: unknown) => {
                if (prevVal === newVal) return;
                const historyId = `attrhist_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
                const entry: AttributeChangeHistoryRecord = {
                  historyId,
                  canonicalEntityId: canonicalId,
                  attributeName: attr,
                  previousValue: prevVal,
                  newValue: newVal,
                  sourceReference: sourceRef,
                  effectiveDateIso: input.effectiveDateIso,
                  recordedAtIso: nowIso,
                  actorUid: principal.uid,
                  verificationStatus:
                    sourceRef.reliabilityTier === 'AUTHORITATIVE_OFFICIAL'
                      ? 'OFFICIAL_VERIFIED'
                      : 'SINGLE_SOURCE_REPORTED',
                  changeReason,
                  entityVersionAfterChange: nextVersion,
                };
                tx.set(PROPERTY_REGISTRY_COLLECTIONS.ATTRIBUTE_HISTORY, historyId, entry);
                recordedChanges.push(entry);
              };

              if (
                input.updates.street !== undefined ||
                input.updates.streetNumberOrPlate !== undefined ||
                input.updates.postalCode !== undefined ||
                input.updates.rawSourceAddress !== undefined
              ) {
                const prevStreet = updated.addressRef.street;
                const nextStreet = input.updates.street ?? prevStreet;
                if (prevStreet !== nextStreet) {
                  recordChange('street', prevStreet, nextStreet);
                }
                if (
                  input.updates.streetNumberOrPlate !== undefined &&
                  input.updates.streetNumberOrPlate !== updated.addressRef.streetNumberOrPlate
                ) {
                  recordChange(
                    'streetNumberOrPlate',
                    updated.addressRef.streetNumberOrPlate,
                    input.updates.streetNumberOrPlate,
                  );
                }
                if (
                  input.updates.postalCode !== undefined &&
                  input.updates.postalCode !== updated.addressRef.postalCode
                ) {
                  recordChange(
                    'postalCode',
                    updated.addressRef.postalCode,
                    input.updates.postalCode,
                  );
                }

                updated.addressRef = buildNormalizedAddressReference({
                  country: updated.addressRef.country,
                  provinceId: updated.addressRef.provinceId,
                  cityId: updated.addressRef.cityId,
                  municipality: updated.addressRef.municipality,
                  districtNumber: updated.addressRef.districtNumber,
                  neighborhoodCompositeId: updated.addressRef.neighborhoodCompositeId,
                  neighborhoodNameFa: updated.addressRef.neighborhoodNameFa,
                  street: nextStreet,
                  streetNumberOrPlate:
                    input.updates.streetNumberOrPlate !== undefined
                      ? input.updates.streetNumberOrPlate
                      : updated.addressRef.streetNumberOrPlate,
                  buildingEntranceOrBlock: updated.addressRef.buildingEntranceOrBlock,
                  unitDesignation: updated.addressRef.unitDesignation,
                  postalCode:
                    input.updates.postalCode !== undefined
                      ? input.updates.postalCode
                      : updated.addressRef.postalCode,
                  rawSourceAddress: input.updates.rawSourceAddress,
                  sourceRecordId: sourceRef.sourceRecordId,
                  sourceSystemNamespace: sourceRef.sourceSystemNamespace,
                  nowIso,
                  existingOriginalAddresses: updated.addressRef.sourceOriginalAddresses,
                });
              }

              if (updated.entityKind === 'PARCEL' && input.updates.parcelAreaSqm !== undefined) {
                const prevArea = updated.parcelAreaSqm;
                const newArea = input.updates.parcelAreaSqm;
                if (
                  prevArea !== null &&
                  Math.abs(prevArea - newArea) / Math.max(prevArea, newArea) > 0.1
                ) {
                  const findingId = `dq_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
                  const finding: DataQualityFindingRecord = {
                    findingId,
                    canonicalEntityId: canonicalId,
                    findingType: 'CONFLICTING_PROPERTY_AREAS',
                    severity: 'HIGH',
                    evidenceDescription: `Parcel area changed by >10% (${prevArea} -> ${newArea} sqm) across sources.`,
                    conflictingValues: { sourceA: prevArea, sourceB: newArea },
                    status: 'OPEN',
                    detectedAtIso: nowIso,
                    resolvedByUid: null,
                    resolvedAtIso: null,
                    resolutionNotes: null,
                  };
                  tx.set(PROPERTY_REGISTRY_COLLECTIONS.QUALITY_FINDINGS, findingId, finding);
                  createdFindings.push(finding);
                }
                recordChange('parcelAreaSqm', prevArea, newArea);
                updated = {
                  ...updated,
                  parcelAreaSqm: newArea,
                  areaMeasurementBasis:
                    input.updates.areaMeasurementBasis ?? updated.areaMeasurementBasis,
                };
              } else if (updated.entityKind === 'BUILDING') {
                if (input.updates.aboveGroundFloors !== undefined) {
                  recordChange(
                    'aboveGroundFloors',
                    updated.floorCount.aboveGroundFloors,
                    input.updates.aboveGroundFloors,
                  );
                  updated = {
                    ...updated,
                    floorCount: {
                      ...updated.floorCount,
                      aboveGroundFloors: input.updates.aboveGroundFloors,
                    },
                  };
                }
                if (input.updates.constructionStatus !== undefined) {
                  recordChange(
                    'constructionStatus',
                    updated.constructionStatus,
                    input.updates.constructionStatus,
                  );
                  updated = {
                    ...updated,
                    constructionStatus: input.updates.constructionStatus,
                  };
                }
              } else if (updated.entityKind === 'UNIT') {
                if (input.updates.reportedAreaSqm !== undefined) {
                  const prevArea = updated.areaSpec.reportedAreaSqm;
                  const newArea = input.updates.reportedAreaSqm;
                  if (
                    prevArea !== null &&
                    Math.abs(prevArea - newArea) / Math.max(prevArea, newArea) > 0.1
                  ) {
                    const findingId = `dq_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
                    const finding: DataQualityFindingRecord = {
                      findingId,
                      canonicalEntityId: canonicalId,
                      findingType: 'CONFLICTING_PROPERTY_AREAS',
                      severity: 'HIGH',
                      evidenceDescription: `Unit reported area discrepancy >10% (${prevArea} vs ${newArea} sqm).`,
                      conflictingValues: { sourceA: prevArea, sourceB: newArea },
                      status: 'OPEN',
                      detectedAtIso: nowIso,
                      resolvedByUid: null,
                      resolvedAtIso: null,
                      resolutionNotes: null,
                    };
                    tx.set(PROPERTY_REGISTRY_COLLECTIONS.QUALITY_FINDINGS, findingId, finding);
                    createdFindings.push(finding);
                  }
                  recordChange('reportedAreaSqm', prevArea, newArea);
                  updated = {
                    ...updated,
                    areaSpec: {
                      ...updated.areaSpec,
                      reportedAreaSqm: newArea,
                    },
                  };
                }
                if (input.updates.verifiedDeedAreaSqm !== undefined) {
                  recordChange(
                    'verifiedDeedAreaSqm',
                    updated.areaSpec.verifiedDeedAreaSqm,
                    input.updates.verifiedDeedAreaSqm,
                  );
                  updated = {
                    ...updated,
                    areaSpec: {
                      ...updated.areaSpec,
                      verifiedDeedAreaSqm: input.updates.verifiedDeedAreaSqm,
                      isApproximate: false,
                    },
                  };
                }
                if (input.updates.floorReference !== undefined) {
                  recordChange(
                    'floorReference',
                    updated.floorReference,
                    input.updates.floorReference,
                  );
                  updated = {
                    ...updated,
                    floorReference: sanitizeTextInput(input.updates.floorReference).slice(0, 30),
                  };
                }
              }

              const finalized = await refreshEntityQualityDimensionsInTx(tx, updated, nowIso);
              return {
                statusCode: 200,
                body: {
                  entity: finalized,
                  recordedChanges,
                  createdFindings,
                },
              };
            },
          ),
      });

      return res.body;
    },
  };
}

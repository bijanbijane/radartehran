type ProfileBoundaryVerificationStatus =
  | 'VERIFIED_OFFICIAL_PRIMARY'
  | 'VERIFIED_OFFICIAL_DERIVED'
  | 'VERIFIED_INTERNATIONAL_STANDARD'
  | 'VERIFIED_SECONDARY_GAZETTEER'
  | 'PROVISIONAL_UNVERIFIED'
  | 'DISPUTED'
  | 'REQUIRES_REVIEW'
  | 'NOT_VERIFIED';

export interface WorkerCanonicalNeighborhoodProfileIdentity {
  geographicEntityId: string;
  cityId: string;
  legacyNeighborhoodId: number;
  level: 'neighborhood' | 'district' | 'city';
  identityStatus: 'CONFIRMED_CANONICAL' | 'DISPUTED' | 'RETIRED' | 'UNVERIFIED';
  verificationStatus: ProfileBoundaryVerificationStatus;
}

import type {
  IrniGeographicRpcBindingV2,
  IrniRpcEntityV2,
  IrniRpcLegacyAliasV2,
} from './irniGeographicRpcV2Types';
import { IrniGeographicRpcV2Client } from './irniGeographicRpcV2Client';
import {
  encodeRadarCityNeighborhoodAlias,
  encodeRadarGeographyCatalogAlias,
  encodeRadarUrbanIntelligenceAlias,
} from './radarLegacyIdentifiers';

export interface IrniNeighborhoodIdentityResolverConfig {
  readonly expectedCanonicalIdentityContractVersion: string;
  readonly expectedIdAlgorithmVersion: string;
}

export type IrniNeighborhoodIdentityResolution =
  | { readonly ok: true; readonly identity: WorkerCanonicalNeighborhoodProfileIdentity }
  | {
      readonly ok: false;
      readonly code:
        | 'IRNI_BINDING_UNAVAILABLE'
        | 'IRNI_REGISTRY_UNVERIFIED'
        | 'IRNI_ALIAS_NOT_FOUND'
        | 'IRNI_ALIAS_AMBIGUOUS'
        | 'IRNI_ALIAS_NOT_AUTOMATICALLY_RESOLVABLE'
        | 'IRNI_CANONICAL_ENTITY_UNAVAILABLE'
        | 'IRNI_CANONICAL_ENTITY_MISMATCH';
    };

const ALLOWED_VERIFICATION = new Set<ProfileBoundaryVerificationStatus>([
  'VERIFIED_OFFICIAL_PRIMARY',
  'VERIFIED_OFFICIAL_DERIVED',
  'VERIFIED_INTERNATIONAL_STANDARD',
  'VERIFIED_SECONDARY_GAZETTEER',
]);

function isAllowedVerification(value: string): value is ProfileBoundaryVerificationStatus {
  return ALLOWED_VERIFICATION.has(value as ProfileBoundaryVerificationStatus);
}

function aliasesFor(cityId: string, hoodId: number): readonly string[] {
  const oldGeographyId = `hood:${cityId}:${hoodId}`;
  const oldUrbanId = `${cityId}:hood:${hoodId}`;
  return [
    encodeRadarCityNeighborhoodAlias(cityId, hoodId),
    encodeRadarGeographyCatalogAlias(oldGeographyId),
    encodeRadarUrbanIntelligenceAlias(oldUrbanId),
  ];
}

function entityToIdentity(
  entity: IrniRpcEntityV2,
  cityId: string,
  hoodId: number,
): WorkerCanonicalNeighborhoodProfileIdentity | null {
  if (
    entity.entityType !== 'URBAN_NEIGHBORHOOD' ||
    entity.identityStatus !== 'CONFIRMED_CANONICAL' ||
    entity.lifecycleStatus !== 'ACTIVE' ||
    !isAllowedVerification(entity.verificationStatus)
  ) return null;

  return {
    geographicEntityId: entity.geographicEntityId,
    cityId,
    legacyNeighborhoodId: hoodId,
    level: 'neighborhood',
    identityStatus: 'CONFIRMED_CANONICAL',
    verificationStatus: entity.verificationStatus,
  };
}

/**
 * Creates an IRNI-backed resolver for the Worker runtime. It deliberately does not
 * infer identity from names, coordinates, numeric IDs, or local application data.
 */
export function createIrniNeighborhoodProfileIdentityResolver(
  binding: IrniGeographicRpcBindingV2 | undefined,
  config: IrniNeighborhoodIdentityResolverConfig,
): (input: { cityId: string; legacyNeighborhoodId: number }) => Promise<IrniNeighborhoodIdentityResolution> {
  const client = new IrniGeographicRpcV2Client(binding);

  return async ({ cityId, legacyNeighborhoodId }) => {
    if (!client.isConfigured()) return { ok: false, code: 'IRNI_BINDING_UNAVAILABLE' };
    if (
      !/^[a-z][a-z0-9_-]{0,63}$/.test(cityId) ||
      !Number.isSafeInteger(legacyNeighborhoodId) ||
      legacyNeighborhoodId < 1 ||
      legacyNeighborhoodId > 999_999_999
    ) return { ok: false, code: 'IRNI_ALIAS_NOT_FOUND' };

    const metadataResult = await client.getApprovedRegistryMetadata();
    if (metadataResult.ok === false) return { ok: false, code: 'IRNI_REGISTRY_UNVERIFIED' };
    const metadata = metadataResult.value;
    if (
      metadata.contractState !== 'ACTIVE' ||
      metadata.integrityVerified !== true ||
      metadata.canonicalIdentityContractVersion !== config.expectedCanonicalIdentityContractVersion ||
      metadata.idAlgorithmVersion !== config.expectedIdAlgorithmVersion ||
      !/^[a-f0-9]{64}$/i.test(metadata.registryChecksum) ||
      !Number.isSafeInteger(metadata.registryRevision) ||
      metadata.registryRevision < 1
    ) return { ok: false, code: 'IRNI_REGISTRY_UNVERIFIED' };

    let expectedAliases: readonly string[];
    try {
      expectedAliases = aliasesFor(cityId, legacyNeighborhoodId);
    } catch {
      return { ok: false, code: 'IRNI_ALIAS_NOT_FOUND' };
    }

    const aliasesResult = await client.listApprovedLegacyAliases('TEHRAN_RADAR', metadata.registryRevision);
    if (aliasesResult.ok === false) return { ok: false, code: 'IRNI_REGISTRY_UNVERIFIED' };

    const matches = aliasesResult.value.aliases.filter((alias: IrniRpcLegacyAliasV2) =>
      alias.legacySystemCode === 'TEHRAN_RADAR' &&
      expectedAliases.includes(alias.legacyIdentifierValue) &&
      alias.aliasStatus === 'ACTIVE_COMPATIBILITY_ALIAS'
    );
    if (matches.length === 0) return { ok: false, code: 'IRNI_ALIAS_NOT_FOUND' };
    if (matches.length !== 1) return { ok: false, code: 'IRNI_ALIAS_AMBIGUOUS' };

    const alias = matches[0];
    if (!alias.automaticResolutionEligible) {
      return { ok: false, code: 'IRNI_ALIAS_NOT_AUTOMATICALLY_RESOLVABLE' };
    }

    const entityResult = await client.getApprovedEntityByCanonicalId(
      alias.canonicalGeographicEntityId,
      metadata.registryRevision,
    );
    if (entityResult.ok === false) return { ok: false, code: 'IRNI_CANONICAL_ENTITY_UNAVAILABLE' };
    const identity = entityToIdentity(entityResult.value, cityId, legacyNeighborhoodId);
    if (!identity) return { ok: false, code: 'IRNI_CANONICAL_ENTITY_MISMATCH' };
    return { ok: true, identity };
  };
}

import { createHash } from 'node:crypto';
import type {
  BoundaryVersionRecord,
  NeighborhoodProfileBoundaryResolvers,
  ProfileBoundaryAuthority,
  ProfileBoundaryVerificationStatus,
} from './types';

export type NeighborhoodProfileBoundaryBlockCode =
  | 'ACTIVE_BOUNDARY_NOT_FOUND'
  | 'BOUNDARY_CITY_MISMATCH'
  | 'BOUNDARY_LEGACY_ID_MISMATCH'
  | 'BOUNDARY_LEVEL_UNSUPPORTED'
  | 'BOUNDARY_VERSION_INVALID'
  | 'BOUNDARY_REVIEW_MISSING'
  | 'BOUNDARY_REVIEW_NOT_INDEPENDENT'
  | 'BOUNDARY_CRS_UNVERIFIED'
  | 'BOUNDARY_GEOMETRY_HASH_MISSING'
  | 'BOUNDARY_GEOMETRY_HASH_MISMATCH'
  | 'CANONICAL_IDENTITY_RESOLVER_NOT_CONFIGURED'
  | 'CANONICAL_IDENTITY_RESOLUTION_FAILED'
  | 'CANONICAL_IDENTITY_NOT_FOUND'
  | 'CANONICAL_IDENTITY_MISMATCH'
  | 'CANONICAL_IDENTITY_UNVERIFIED'
  | 'BOUNDARY_SOURCE_REGISTRY_NOT_CONFIGURED'
  | 'BOUNDARY_SOURCE_REGISTRY_FAILED'
  | 'BOUNDARY_SOURCE_NOT_REGISTERED'
  | 'BOUNDARY_SOURCE_METADATA_INVALID'
  | 'BOUNDARY_SOURCE_NON_AUTHORITATIVE';

export interface NeighborhoodProfileBoundaryEvidence {
  readonly geographicEntityId: string;
  readonly cityId: string;
  readonly legacyNeighborhoodId: number;
  readonly level: 'neighborhood';
  readonly versionId: string;
  readonly version: number;
  readonly status: 'ACTIVE';
  readonly identityStatus: 'CONFIRMED_CANONICAL';
  readonly verificationStatus: ProfileBoundaryVerificationStatus;
  readonly authority: 'OFFICIAL_PRIMARY' | 'OFFICIAL_DERIVED' | 'VERIFIED_SECONDARY' | 'REVIEWED_COMMUNITY';
  readonly crs: 'EPSG:4326';
  readonly geometry: BoundaryVersionRecord['geometry'];
  readonly sourceReference: string;
  /** Confirms independent review without disclosing the reviewer account identifier. */
  readonly reviewedIndependently: true;
  readonly reviewedAtIso: string;
  readonly geometrySha256: string;
  readonly geometryHashVerified: true;
}

export type NeighborhoodProfileBoundaryReadModelResult =
  | {
      readonly status: 'READY';
      readonly reasonCodes: readonly [];
      readonly evidence: NeighborhoodProfileBoundaryEvidence;
    }
  | {
      readonly status: 'BLOCKED';
      readonly reasonCodes: readonly NeighborhoodProfileBoundaryBlockCode[];
      readonly evidence: null;
    };

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function calculateNeighborhoodBoundaryGeometrySha256(
  geometry: BoundaryVersionRecord['geometry'],
): string {
  // Explicit object construction fixes the serialized property order used by the digest.
  const canonicalGeometry = {
    type: geometry.type,
    coordinates: geometry.coordinates,
  };
  return createHash('sha256').update(JSON.stringify(canonicalGeometry), 'utf8').digest('hex');
}

function validTimestamp(value: string | undefined): value is string {
  return Boolean(value && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value)));
}

const VERIFICATION_RANK: Record<ProfileBoundaryVerificationStatus, number> = {
  VERIFIED_OFFICIAL_PRIMARY: 4,
  VERIFIED_OFFICIAL_DERIVED: 3,
  VERIFIED_INTERNATIONAL_STANDARD: 3,
  VERIFIED_SECONDARY_GAZETTEER: 2,
  PROVISIONAL_UNVERIFIED: 0,
  DISPUTED: 0,
  REQUIRES_REVIEW: 0,
  NOT_VERIFIED: 0,
};

function isPublishableVerification(
  value: ProfileBoundaryVerificationStatus,
): boolean {
  return VERIFICATION_RANK[value] > 0;
}

type PublishableBoundaryAuthority = Exclude<ProfileBoundaryAuthority, 'ALGORITHMIC' | 'UNKNOWN'>;

function isPublishableAuthority(value: ProfileBoundaryAuthority): value is PublishableBoundaryAuthority {
  return value !== 'ALGORITHMIC' && value !== 'UNKNOWN';
}

function weakerVerification(
  left: ProfileBoundaryVerificationStatus,
  right: ProfileBoundaryVerificationStatus,
): ProfileBoundaryVerificationStatus {
  return VERIFICATION_RANK[left] <= VERIFICATION_RANK[right] ? left : right;
}

function blocked(
  reasonCodes: NeighborhoodProfileBoundaryBlockCode[],
): NeighborhoodProfileBoundaryReadModelResult {
  return {
    status: 'BLOCKED',
    reasonCodes: [...new Set(reasonCodes)],
    evidence: null,
  };
}

export async function buildNeighborhoodProfileBoundaryReadModel(params: {
  readonly boundary: BoundaryVersionRecord | null;
  readonly expectedCityId: string;
  readonly expectedLegacyNeighborhoodId: number;
  readonly resolvers?: NeighborhoodProfileBoundaryResolvers;
}): Promise<NeighborhoodProfileBoundaryReadModelResult> {
  const boundary = params.boundary;
  if (!boundary || boundary.status !== 'ACTIVE') {
    return blocked(['ACTIVE_BOUNDARY_NOT_FOUND']);
  }

  const reasons: NeighborhoodProfileBoundaryBlockCode[] = [];
  // The map-only fallback is never valid evidence, even if a source resolver is misconfigured.
  if (boundary.sourceProvenance === 'computed_hex_fallback') {
    reasons.push('BOUNDARY_SOURCE_NON_AUTHORITATIVE');
  }
  if (boundary.cityId !== params.expectedCityId) reasons.push('BOUNDARY_CITY_MISMATCH');
  if (boundary.hoodId !== params.expectedLegacyNeighborhoodId) reasons.push('BOUNDARY_LEGACY_ID_MISMATCH');
  if (boundary.level !== 'neighborhood') reasons.push('BOUNDARY_LEVEL_UNSUPPORTED');
  if (!boundary.id.trim() || !Number.isSafeInteger(boundary.version) || boundary.version < 1) {
    reasons.push('BOUNDARY_VERSION_INVALID');
  }
  if (!boundary.reviewedByUid || !validTimestamp(boundary.reviewedAtIso)) {
    reasons.push('BOUNDARY_REVIEW_MISSING');
  } else if (boundary.reviewedByUid === boundary.createdByUid) {
    reasons.push('BOUNDARY_REVIEW_NOT_INDEPENDENT');
  }
  if (boundary.geometryCrs !== 'EPSG:4326') reasons.push('BOUNDARY_CRS_UNVERIFIED');
  if (!boundary.geometrySha256 || !SHA256_HEX.test(boundary.geometrySha256)) {
    reasons.push('BOUNDARY_GEOMETRY_HASH_MISSING');
  } else if (calculateNeighborhoodBoundaryGeometrySha256(boundary.geometry) !== boundary.geometrySha256.toLowerCase()) {
    reasons.push('BOUNDARY_GEOMETRY_HASH_MISMATCH');
  }
  if (!params.resolvers?.resolveIdentity) reasons.push('CANONICAL_IDENTITY_RESOLVER_NOT_CONFIGURED');
  if (!params.resolvers?.resolveSource) reasons.push('BOUNDARY_SOURCE_REGISTRY_NOT_CONFIGURED');
  if (reasons.length > 0) return blocked(reasons);

  let identity: Awaited<ReturnType<NeighborhoodProfileBoundaryResolvers['resolveIdentity']>>;
  try {
    identity = await params.resolvers!.resolveIdentity({
      cityId: params.expectedCityId,
      legacyNeighborhoodId: params.expectedLegacyNeighborhoodId,
    });
  } catch {
    return blocked(['CANONICAL_IDENTITY_RESOLUTION_FAILED']);
  }
  if (!identity) return blocked(['CANONICAL_IDENTITY_NOT_FOUND']);

  const identityMatches =
    identity.cityId === params.expectedCityId &&
    identity.legacyNeighborhoodId === params.expectedLegacyNeighborhoodId &&
    identity.level === 'neighborhood' &&
    identity.identityStatus === 'CONFIRMED_CANONICAL' &&
    typeof identity.geographicEntityId === 'string' &&
    identity.geographicEntityId.trim().length > 0 &&
    isPublishableVerification(identity.verificationStatus);
  if (!identityMatches) return blocked(['CANONICAL_IDENTITY_MISMATCH', 'CANONICAL_IDENTITY_UNVERIFIED']);

  let source: Awaited<ReturnType<NeighborhoodProfileBoundaryResolvers['resolveSource']>>;
  try {
    source = await params.resolvers!.resolveSource(boundary.sourceProvenance);
  } catch {
    return blocked(['BOUNDARY_SOURCE_REGISTRY_FAILED']);
  }
  if (!source) return blocked(['BOUNDARY_SOURCE_NOT_REGISTERED']);

  const sourceMetadataValid =
    source.sourceProvenance === boundary.sourceProvenance &&
    typeof source.sourceReference === 'string' &&
    source.sourceReference.trim().length > 0 &&
    source.crs === 'EPSG:4326' &&
    isPublishableVerification(source.verificationStatus);
  if (!sourceMetadataValid || !isPublishableAuthority(source.authority)) {
    return blocked(['BOUNDARY_SOURCE_METADATA_INVALID']);
  }

  const evidence: NeighborhoodProfileBoundaryEvidence = {
    geographicEntityId: identity.geographicEntityId,
    cityId: identity.cityId,
    legacyNeighborhoodId: identity.legacyNeighborhoodId,
    level: 'neighborhood',
    versionId: boundary.id,
    version: boundary.version,
    status: 'ACTIVE',
    identityStatus: 'CONFIRMED_CANONICAL',
    verificationStatus: weakerVerification(identity.verificationStatus, source.verificationStatus),
    authority: source.authority,
    crs: 'EPSG:4326',
    geometry: structuredClone(boundary.geometry),
    sourceReference: source.sourceReference,
    reviewedIndependently: true,
    reviewedAtIso: boundary.reviewedAtIso!,
    geometrySha256: boundary.geometrySha256!.toLowerCase(),
    geometryHashVerified: true,
  };

  return { status: 'READY', reasonCodes: [], evidence };
}

// Compatibility export retained for boundary read-model consumers.
export { pickActiveBoundaryVersion } from './geospatialBoundaryReadModel';

import type { NeighborhoodProfileBoundaryEvidence } from '../profile-contract/neighborhoodProfileBoundaryContract';

export type NeighborhoodProfileBoundaryApiResult =
  | { readonly status: 'READY'; readonly evidence: NeighborhoodProfileBoundaryEvidence; readonly reasonCodes: readonly [] }
  | { readonly status: 'BLOCKED'; readonly evidence: null; readonly reasonCodes: readonly string[] }
  | { readonly status: 'UNAVAILABLE'; readonly evidence: null; readonly reasonCodes: readonly string[] };

interface ApiEnvelope<T> {
  readonly ok: boolean;
  readonly data?: T;
}

interface BoundaryReadModelPayload {
  readonly status?: unknown;
  readonly evidence?: unknown;
  readonly reasonCodes?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundaryEvidence(value: unknown): value is NeighborhoodProfileBoundaryEvidence {
  if (!isRecord(value) || !isRecord(value.geometry)) return false;
  const geometry = value.geometry;
  const validGeometry = geometry.type === 'Polygon'
    ? Array.isArray(geometry.coordinates)
    : geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates);
  return typeof value.geographicEntityId === 'string' && value.geographicEntityId.trim().length > 0
    && typeof value.cityId === 'string' && Number.isSafeInteger(value.legacyNeighborhoodId)
    && value.level === 'neighborhood' && typeof value.versionId === 'string'
    && Number.isSafeInteger(value.version) && value.status === 'ACTIVE'
    && value.identityStatus === 'CONFIRMED_CANONICAL'
    && typeof value.verificationStatus === 'string'
    && ['VERIFIED_OFFICIAL_PRIMARY', 'VERIFIED_OFFICIAL_DERIVED', 'VERIFIED_INTERNATIONAL_STANDARD', 'VERIFIED_SECONDARY_GAZETTEER'].includes(value.verificationStatus)
    && ['OFFICIAL_PRIMARY', 'OFFICIAL_DERIVED', 'VERIFIED_SECONDARY', 'REVIEWED_COMMUNITY'].includes(String(value.authority))
    && value.crs === 'EPSG:4326' && validGeometry
    && typeof value.sourceReference === 'string' && value.sourceReference.trim().length > 0
    && value.reviewedIndependently === true && typeof value.reviewedAtIso === 'string'
    && typeof value.geometrySha256 === 'string' && /^[a-f0-9]{64}$/i.test(value.geometrySha256)
    && value.geometryHashVerified === true;
}

export async function fetchNeighborhoodProfileBoundaryEvidence(
  cityId: string,
  hoodId: number,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<NeighborhoodProfileBoundaryApiResult> {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cityId) || !Number.isSafeInteger(hoodId) || hoodId < 1 || hoodId > 9999) {
    return { status: 'UNAVAILABLE', evidence: null, reasonCodes: ['INVALID_NEIGHBORHOOD_REFERENCE'] };
  }
  try {
    const response = await fetchImpl(
      `/api/v1/geospatial/neighborhood-boundaries/${encodeURIComponent(cityId)}/${hoodId}/profile-evidence`,
      { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store', signal },
    );
    if (!response.ok) {
      return { status: 'UNAVAILABLE', evidence: null, reasonCodes: [`HTTP_${response.status}`] };
    }
    const envelope = await response.json() as ApiEnvelope<BoundaryReadModelPayload>;
    if (!envelope?.ok || !isRecord(envelope.data)) {
      return { status: 'UNAVAILABLE', evidence: null, reasonCodes: ['INVALID_API_ENVELOPE'] };
    }
    const payload = envelope.data;
    const reasonCodes = Array.isArray(payload.reasonCodes)
      ? payload.reasonCodes.filter((item): item is string => typeof item === 'string')
      : [];
    if (payload.status === 'BLOCKED' && payload.evidence === null) {
      return { status: 'BLOCKED', evidence: null, reasonCodes };
    }
    if (payload.status === 'READY' && isBoundaryEvidence(payload.evidence)) {
      return { status: 'READY', evidence: payload.evidence, reasonCodes: [] };
    }
    return { status: 'UNAVAILABLE', evidence: null, reasonCodes: ['INVALID_BOUNDARY_EVIDENCE_RESPONSE'] };
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return { status: 'UNAVAILABLE', evidence: null, reasonCodes: ['REQUEST_ABORTED'] };
    }
    return { status: 'UNAVAILABLE', evidence: null, reasonCodes: ['PROFILE_EVIDENCE_ENDPOINT_UNAVAILABLE'] };
  }
}

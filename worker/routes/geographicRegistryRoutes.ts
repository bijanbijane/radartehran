/**
 * IRNI geographic registry read API and signed, versioned publisher ingress.
 *
 * IRNI remains the canonical identity authority. Radar holds a revisioned D1 replica.
 * Public routes are read-only; only the pinned IRNI GitHub Actions OIDC identity can stage
 * a complete snapshot. The pointer is advanced only after all datasets and identity
 * references pass verification in one D1 transaction.
 */
import { requireNeighborhoodDb } from '../db/bindingResolver';
import {
  compareActiveGeographicPublishManifest,
  type ExpectedGeographicPublishManifest,
} from './geographicRegistryPublishManifest';
import type { D1Database, WorkerRequestContext } from '../types';
import { jsonWorkerResponse } from '../contextAndSecurity';

const MAX_BODY_BYTES = 1_500_000;
const MAX_ITEMS_PER_CHUNK = 50;
const NONCE_RETENTION_MS = 10 * 60 * 1000;
type DatasetKind = 'entities' | 'relationships' | 'sourceMappings' | 'identityEntries' | 'anchors' | 'legacyAliases';
type SignedPayload =
  | { ok: true; payload: Record<string, unknown>; nonce: string }
  | { ok: false; status: number; code: string };

interface ActiveRegistryHead {
  readonly batch_id: string;
  readonly registry_revision: number;
  readonly registry_checksum: string;
  readonly activated_at_iso: string;
  readonly contract_version: string;
  readonly id_algorithm_version: string;
  readonly schema_version: string;
  readonly canonical_entry_count: number;
  readonly canonical_entity_count: number;
  readonly relationship_count: number;
  readonly anchor_count: number;
  readonly source_mapping_count: number;
  readonly legacy_alias_count: number;
  readonly duplicate_conflict_count: number;
  readonly integrity_verified: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
function isString(value: unknown, max = 512): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
type GitHubSigningJwk = JsonWebKey & { kid?: string };

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_OIDC_JWKS_URL = 'https://token.actions.githubusercontent.com/.well-known/jwks';
const GITHUB_OIDC_AUDIENCE = 'radartehran-irni-geographic-publisher';
const GITHUB_OIDC_REPOSITORY = 'bijanbijane/Iran-Neighborhood-Intelligence';
const GITHUB_OIDC_REPOSITORY_ID = '1466860862';
const GITHUB_OIDC_OWNER_ID = '338238765';
const GITHUB_OIDC_REF = 'refs/heads/main';
const GITHUB_OIDC_ENVIRONMENT = 'radar-publisher';
const GITHUB_OIDC_WORKFLOW_REF =
  'bijanbijane/Iran-Neighborhood-Intelligence/.github/workflows/publish-geography-to-radar.yml@refs/heads/main';
let githubJwksCache: { expiresAtMs: number; keys: GitHubSigningJwk[] } | null = null;

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
function parseJwtPart(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
    return asRecord(parsed);
  } catch {
    return null;
  }
}
async function getGitHubSigningKeys(): Promise<GitHubSigningJwk[]> {
  if (githubJwksCache && githubJwksCache.expiresAtMs > Date.now()) return githubJwksCache.keys;
  const response = await fetch(GITHUB_OIDC_JWKS_URL, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('GITHUB_OIDC_JWKS_UNAVAILABLE');
  const body: unknown = await response.json();
  const record = asRecord(body);
  const keys = record?.keys;
  if (!Array.isArray(keys) || keys.length === 0) throw new Error('GITHUB_OIDC_JWKS_INVALID');
  githubJwksCache = {
    keys: keys.filter((key): key is GitHubSigningJwk => Boolean(asRecord(key))),
    expiresAtMs: Date.now() + 5 * 60 * 1000,
  };
  return githubJwksCache.keys;
}
async function verifyGitHubActionsIdentity(token: string): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return 'JWT_SHAPE';
  const header = parseJwtPart(parts[0]);
  const claims = parseJwtPart(parts[1]);
  if (!header || !claims || header.alg !== 'RS256' || !isString(header.kid, 256)) return 'JWT_HEADER';

  const now = Math.floor(Date.now() / 1000);
  const exp = Number(claims.exp);
  const nbf = Number(claims.nbf ?? 0);
  const iat = Number(claims.iat ?? 0);
  const audience = claims.aud;
  const audienceMatches = audience === GITHUB_OIDC_AUDIENCE ||
    (Array.isArray(audience) && audience.includes(GITHUB_OIDC_AUDIENCE));
  if (claims.iss !== GITHUB_OIDC_ISSUER) return 'ISSUER';
  if (!audienceMatches) return 'AUDIENCE';
  if (!Number.isSafeInteger(exp) || exp <= now) return 'EXPIRY';
  if (Number.isFinite(nbf) && nbf > now + 30) return 'NOT_BEFORE';
  if (Number.isFinite(iat) && iat > now + 30) return 'ISSUED_AT';
  if (claims.repository !== GITHUB_OIDC_REPOSITORY) return 'REPOSITORY';
  if (String(claims.repository_id ?? '') !== GITHUB_OIDC_REPOSITORY_ID) return 'REPOSITORY_ID';
  if (String(claims.repository_owner_id ?? '') !== GITHUB_OIDC_OWNER_ID) return 'OWNER_ID';
  if (claims.ref !== GITHUB_OIDC_REF) return 'REF';
  if (claims.environment !== GITHUB_OIDC_ENVIRONMENT) return 'ENVIRONMENT';
  if (claims.workflow_ref !== GITHUB_OIDC_WORKFLOW_REF) return 'WORKFLOW_REF';
  if (claims.sub !== 'repo:bijanbijane@338238765/Iran-Neighborhood-Intelligence@1466860862:environment:radar-publisher') return 'SUBJECT';

  let keys: GitHubSigningJwk[];
  try {
    keys = await getGitHubSigningKeys();
  } catch {
    return 'JWKS_UNAVAILABLE';
  }
  let jwk: GitHubSigningJwk | undefined = keys.find((candidate) => candidate.kid === header.kid);
  if (!jwk) {
    githubJwksCache = null;
    try {
      const refreshed = await getGitHubSigningKeys();
      jwk = refreshed.find((candidate) => candidate.kid === header.kid);
    } catch {
      return 'JWKS_REFRESH_FAILED';
    }
  }
  if (!jwk) return 'SIGNING_KEY_NOT_FOUND';
  return await verifyJwtSignature(parts, jwk) ? null : 'SIGNATURE_INVALID';
}
async function verifyJwtSignature(parts: string[], jwk: JsonWebKey): Promise<boolean> {
  try {
    const publicKey = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
    );
    return await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(parts[0] + '.' + parts[1]),
    );
  } catch {
    return false;
  }
}
async function verifySignedPayload(request: Request): Promise<SignedPayload> {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer ([A-Za-z0-9._-]+)$/);
  const identityFailure = match ? await verifyGitHubActionsIdentity(match[1]) : 'BEARER_TOKEN_MISSING';
  if (identityFailure) {
    return { ok: false, status: 401, code: 'PUBLISH_GITHUB_OIDC_IDENTITY_INVALID_' + identityFailure };
  }
  const nonce = request.headers.get('x-irni-nonce') || '';
  if (!/^[A-Za-z0-9._-]{16,128}$/.test(nonce)) {
    return { ok: false, status: 401, code: 'PUBLISH_NONCE_INVALID' };
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return { ok: false, status: 413, code: 'PUBLISH_BODY_TOO_LARGE' };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const record = asRecord(parsed);
    if (!record) return { ok: false, status: 400, code: 'PUBLISH_JSON_INVALID' };
    return { ok: true, payload: record, nonce };
  } catch {
    return { ok: false, status: 400, code: 'PUBLISH_JSON_INVALID' };
  }
}
function requireSuccess(result: { success: boolean }, operation: string): void {
  if (!result.success) throw new Error(`D1_${operation}_FAILED`);
}
async function consumeNonce(db: D1Database, nonce: string): Promise<boolean> {
  const result = await db.prepare(
    'INSERT OR IGNORE INTO geo_registry_publish_nonces(nonce,expires_at_ms,recorded_at_iso) VALUES (?1,?2,?3)',
  ).bind(nonce, Date.now() + NONCE_RETENTION_MS, new Date().toISOString()).run();
  if (!result.success || result.meta?.changes !== 1) return false;
  await db.prepare('DELETE FROM geo_registry_publish_nonces WHERE expires_at_ms < ?1')
    .bind(Date.now()).run();
  return true;
}
async function getCurrentHead(db: D1Database): Promise<ActiveRegistryHead | null> {
  try {
    return await db.prepare(
      `SELECT p.batch_id,p.registry_revision,p.registry_checksum,p.activated_at_iso,
        h.contract_version,h.id_algorithm_version,h.schema_version,h.canonical_entry_count,
        h.canonical_entity_count,h.relationship_count,h.anchor_count,h.source_mapping_count,
        h.legacy_alias_count,h.duplicate_conflict_count,h.integrity_verified
       FROM geo_registry_publish_pointer p
       JOIN geo_registry_head h ON h.singleton_id = 'current'
       WHERE p.singleton_id = 'current'`,
    ).first<ActiveRegistryHead>();
  } catch {
    // The pre-publication schema or missing additive migration must report "not published",
    // not turn the whole backend into a 500 during staged rollout.
    return null;
  }
}
function normalizeLimit(value: string | null): number {
  const parsed = value ? Number(value) : 50;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 200 ? parsed : 50;
}
function normalizeOffset(value: string | null): number {
  const parsed = value ? Number(value) : 0;
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100_000 ? parsed : 0;
}
function jsonRecord(value: unknown): string {
  return JSON.stringify(value);
}
async function sha256Json(value: unknown): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))));
}

async function publishStart(
  ctx: WorkerRequestContext, db: D1Database, payload: Record<string, unknown>, nonce: string,
): Promise<Response> {
  if (!await consumeNonce(db, nonce)) {
    return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'PUBLISH_NONCE_REPLAYED' });
  }
  const batchId = payload.batchId;
  const revision = payload.registryRevision;
  const checksum = payload.registryChecksum;
  const counts = asRecord(payload.expectedCounts);
  const artifacts = asRecord(payload.artifactChecksums);
  const contractVersion = payload.contractVersion;
  const idAlgorithmVersion = payload.idAlgorithmVersion;
  const schemaVersion = payload.schemaVersion;
  if (!isString(batchId, 80) || !Number.isSafeInteger(revision) || Number(revision) < 1 ||
      !isString(checksum, 128) || !/^[a-f0-9]{64}$/i.test(checksum) || !counts ||
      !Number.isSafeInteger(counts.entities) || Number(counts.entities) < 0 ||
      !Number.isSafeInteger(counts.relationships) || Number(counts.relationships) < 0 ||
      !Number.isSafeInteger(counts.sourceMappings) || Number(counts.sourceMappings) < 0 ||
      !Number.isSafeInteger(counts.identityEntries) || Number(counts.identityEntries) < 0 ||
      !Number.isSafeInteger(counts.anchors) || Number(counts.anchors) < 0 ||
      !Number.isSafeInteger(counts.legacyAliases) || Number(counts.legacyAliases) < 0 ||
      !isString(contractVersion, 80) || !isString(idAlgorithmVersion, 80) ||
      !isString(schemaVersion, 40) || !artifacts) {
    return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'PUBLISH_MANIFEST_INVALID' });
  }
  if (ctx.env.GEO_REGISTRY_EXPECTED_CONTRACT &&
      contractVersion !== ctx.env.GEO_REGISTRY_EXPECTED_CONTRACT) {
    return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'PUBLISH_CONTRACT_VERSION_MISMATCH' });
  }
  if (ctx.env.GEO_REGISTRY_EXPECTED_ID_ALGORITHM &&
      idAlgorithmVersion !== ctx.env.GEO_REGISTRY_EXPECTED_ID_ALGORITHM) {
    return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'PUBLISH_ID_ALGORITHM_MISMATCH' });
  }
  const artifactKeys = ['snapshot','relationships','sourceMappings','identityEntries','anchors','legacyAliases'] as const;
  const normalizedArtifacts = {} as Record<(typeof artifactKeys)[number], string>;
  for (const key of artifactKeys) {
    if (!isString(artifacts[key], 64) || !/^[a-f0-9]{64}$/i.test(artifacts[key])) {
      return jsonWorkerResponse(ctx, 400, {
        status: 'error', code: 'PUBLISH_ARTIFACT_CHECKSUM_REQUIRED_OR_INVALID', artifact: key,
      });
    }
    normalizedArtifacts[key] = String(artifacts[key]).toLowerCase();
  }

  const manifestIdentity = {
    version: 1,
    registryRevision: Number(revision),
    registryChecksum: String(checksum).toLowerCase(),
    contractVersion: String(contractVersion),
    idAlgorithmVersion: String(idAlgorithmVersion),
    schemaVersion: String(schemaVersion),
    expectedCounts: {
      entities: Number(counts.entities),
      relationships: Number(counts.relationships),
      sourceMappings: Number(counts.sourceMappings),
      identityEntries: Number(counts.identityEntries),
      anchors: Number(counts.anchors),
      legacyAliases: Number(counts.legacyAliases),
    },
    artifactChecksums: normalizedArtifacts,
  };
  const expectedBatchId = 'irni-r' + Number(revision) + '-' + await sha256Json(manifestIdentity);
  if (batchId !== expectedBatchId) {
    return jsonWorkerResponse(ctx, 409, {
      status: 'error', code: 'PUBLISH_BATCH_MANIFEST_ID_MISMATCH',
    });
  }

  const head = await getCurrentHead(db);
  if (head && Number(revision) < Number(head.registry_revision)) {
    return jsonWorkerResponse(ctx, 409, {
      status: 'error', code: 'PUBLISH_REVISION_ROLLBACK_BLOCKED',
      currentRevision: head.registry_revision, requestedRevision: revision,
    });
  }
  if (head && Number(revision) === Number(head.registry_revision)) {
    if (checksum !== head.registry_checksum) {
      return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'SAME_REVISION_CHECKSUM_CONFLICT' });
    }

    let importedArtifacts: {
      artifact_path: string;
      artifact_sha256: string;
      record_count: number;
      registry_revision: number;
    }[];
    try {
      const imported = await db.prepare(
        'SELECT artifact_path,artifact_sha256,record_count,registry_revision FROM geo_registry_imports WHERE registry_revision=?1',
      ).bind(Number(revision)).all<{
        artifact_path: string;
        artifact_sha256: string;
        record_count: number;
        registry_revision: number;
      }>();
      if (!imported.success) {
        return jsonWorkerResponse(ctx, 503, {
          status: 'error', code: 'PUBLISH_ACTIVE_ARTIFACT_MANIFEST_UNAVAILABLE',
        });
      }
      importedArtifacts = imported.results;
    } catch {
      return jsonWorkerResponse(ctx, 503, {
        status: 'error', code: 'PUBLISH_ACTIVE_ARTIFACT_MANIFEST_UNAVAILABLE',
      });
    }

    const expectedManifest: ExpectedGeographicPublishManifest = {
      registryRevision: Number(revision),
      contractVersion: String(contractVersion),
      idAlgorithmVersion: String(idAlgorithmVersion),
      schemaVersion: String(schemaVersion),
      expectedCounts: manifestIdentity.expectedCounts,
      artifactChecksums: normalizedArtifacts,
    };
    const comparison = compareActiveGeographicPublishManifest({
      activeHead: head,
      expected: expectedManifest,
      importedArtifacts,
    });
    if (!comparison.matches) {
      return jsonWorkerResponse(ctx, 409, {
        status: 'error',
        code: 'PUBLISH_SAME_REVISION_MANIFEST_CONFLICT',
        mismatches: comparison.mismatches,
      });
    }
    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      alreadyPublished: true,
      registryRevision: revision,
      registryChecksum: checksum,
      verifiedArtifacts: 6,
    });
  }
  const now = new Date().toISOString();
  const result = await db.prepare(
    `INSERT INTO geo_registry_publish_sessions
      (batch_id,registry_revision,registry_checksum,contract_version,id_algorithm_version,schema_version,
       expected_entities,expected_relationships,expected_source_mappings,expected_identity_entries,
       expected_anchors,expected_legacy_aliases,status,created_at_iso)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'RECEIVING',?13)
     ON CONFLICT(batch_id) DO NOTHING`,
  ).bind(
    String(batchId), Number(revision), String(checksum), String(contractVersion),
    String(idAlgorithmVersion), String(schemaVersion), Number(counts.entities),
    Number(counts.relationships), Number(counts.sourceMappings), Number(counts.identityEntries),
    Number(counts.anchors), Number(counts.legacyAliases), now,
  ).run();
  requireSuccess(result, 'PUBLISH_START');
  const stored = await db.prepare(
    `SELECT registry_revision,registry_checksum,contract_version,id_algorithm_version,schema_version,
       expected_entities,expected_relationships,expected_source_mappings,expected_identity_entries,
       expected_anchors,expected_legacy_aliases,status
     FROM geo_registry_publish_sessions WHERE batch_id = ?1`,
  ).bind(String(batchId)).first<{
    registry_revision:number;
    registry_checksum:string;
    contract_version:string;
    id_algorithm_version:string;
    schema_version:string;
    expected_entities:number;
    expected_relationships:number;
    expected_source_mappings:number;
    expected_identity_entries:number;
    expected_anchors:number;
    expected_legacy_aliases:number;
    status:string;
  }>();
  const storedManifestMatches = stored &&
    Number(stored.registry_revision) === Number(revision) &&
    stored.registry_checksum === checksum &&
    stored.contract_version === contractVersion &&
    stored.id_algorithm_version === idAlgorithmVersion &&
    stored.schema_version === schemaVersion &&
    Number(stored.expected_entities) === Number(counts.entities) &&
    Number(stored.expected_relationships) === Number(counts.relationships) &&
    Number(stored.expected_source_mappings) === Number(counts.sourceMappings) &&
    Number(stored.expected_identity_entries) === Number(counts.identityEntries) &&
    Number(stored.expected_anchors) === Number(counts.anchors) &&
    Number(stored.expected_legacy_aliases) === Number(counts.legacyAliases);
  if (!storedManifestMatches || stored.status !== 'RECEIVING') {
    return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'PUBLISH_BATCH_ID_CONFLICT' });
  }
  return jsonWorkerResponse(ctx, 202, {
    status: 'ok', batchId, registryRevision: revision, registryChecksum: checksum,
    expectedCounts: counts, currentRevision: head?.registry_revision ?? null,
  });
}

function buildEntityStatement(db: D1Database, batchId: string, value: unknown) {
  const entity = asRecord(value);
  if (!entity || !isString(entity.geographicEntityId, 80) ||
      !/^IRGEO1-[a-f0-9]{64}$/i.test(String(entity.geographicEntityId)) ||
      !isString(entity.entityType, 80) || !isString(entity.classificationSystemId, 120) ||
      !isString(entity.canonicalNameFa, 300) || !isString(entity.identityStatus, 60) ||
      !isString(entity.verificationStatus, 60) || !isString(entity.lifecycleStatus, 60) ||
      entity.isSyntheticFixture !== false) {
    throw new Error('PUBLISH_ENTITY_INVALID_OR_SYNTHETIC');
  }
  return db.prepare(
    `INSERT INTO geo_registry_entity_stage
      (batch_id,geographic_entity_id,entity_type,classification_system_id,canonical_name_fa,
       parent_geographic_entity_id,province_geographic_entity_id,identity_status,
       verification_status,lifecycle_status,is_synthetic_fixture,entity_json)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,0,?11)
     ON CONFLICT(batch_id,geographic_entity_id) DO UPDATE SET
       entity_type=excluded.entity_type,classification_system_id=excluded.classification_system_id,
       canonical_name_fa=excluded.canonical_name_fa,parent_geographic_entity_id=excluded.parent_geographic_entity_id,
       province_geographic_entity_id=excluded.province_geographic_entity_id,identity_status=excluded.identity_status,
       verification_status=excluded.verification_status,lifecycle_status=excluded.lifecycle_status,
       entity_json=excluded.entity_json`,
  ).bind(
    batchId,String(entity.geographicEntityId),String(entity.entityType),String(entity.classificationSystemId),
    String(entity.canonicalNameFa),isString(entity.parentGeographicEntityId) ? entity.parentGeographicEntityId : null,
    isString(entity.provinceGeographicEntityId) ? entity.provinceGeographicEntityId : null,
    String(entity.identityStatus),String(entity.verificationStatus),String(entity.lifecycleStatus),jsonRecord(entity),
  );
}
function buildRelationshipStatement(db: D1Database, batchId: string, value: unknown) {
  const item = asRecord(value);
  if (!item || !isString(item.relationshipId, 120) ||
      !isString(item.sourceGeographicEntityId, 100) || !isString(item.targetGeographicEntityId, 100) ||
      !isString(item.relationshipType, 80) || !isString(item.classificationSystemId, 120) ||
      !isString(item.sourceDatasetId, 120) || !isString(item.evidenceReference, 1000) ||
      !isString(item.verificationStatus, 60)) throw new Error('PUBLISH_RELATIONSHIP_INVALID');
  return db.prepare(
    `INSERT INTO geo_registry_relationship_stage
      (batch_id,relationship_id,source_geographic_entity_id,target_geographic_entity_id,
       relationship_type,classification_system_id,source_dataset_id,verification_status,relationship_json)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
     ON CONFLICT(batch_id,relationship_id) DO UPDATE SET
       source_geographic_entity_id=excluded.source_geographic_entity_id,
       target_geographic_entity_id=excluded.target_geographic_entity_id,
       relationship_type=excluded.relationship_type,classification_system_id=excluded.classification_system_id,
       source_dataset_id=excluded.source_dataset_id,verification_status=excluded.verification_status,
       relationship_json=excluded.relationship_json`,
  ).bind(
    batchId,String(item.relationshipId),String(item.sourceGeographicEntityId),String(item.targetGeographicEntityId),
    String(item.relationshipType),String(item.classificationSystemId),String(item.sourceDatasetId),
    String(item.verificationStatus),jsonRecord(item),
  );
}
function buildMappingStatement(db: D1Database, batchId: string, value: unknown) {
  const item = asRecord(value);
  if (!item || !isString(item.mappingKey, 500) || !isString(item.identifierNamespaceCode, 120) ||
      !isString(item.classificationSystemId, 120) || !isString(item.entityType, 80) ||
      !isString(item.sourceNativeId, 200) || !isString(item.geographicEntityId, 80) ||
      !/^IRGEO1-[a-f0-9]{64}$/i.test(String(item.geographicEntityId)) ||
      !isString(item.sourceDatasetId, 120) ||
      !['SAME_ENTITY_CONFIRMED','DISTINCT_ENTITIES_CONFIRMED'].includes(String(item.resolutionOutcome)) ||
      !Number.isSafeInteger(item.committedAtRegistryRevision)) {
    throw new Error('PUBLISH_SOURCE_MAPPING_INVALID');
  }
  return db.prepare(
    `INSERT INTO geo_registry_source_mapping_stage
      (batch_id,mapping_key,identifier_namespace_code,classification_system_id,entity_type,
       source_native_id,geographic_entity_id,source_dataset_id,resolution_outcome,
       committed_at_registry_revision,mapping_json)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
     ON CONFLICT(batch_id,mapping_key) DO UPDATE SET
       identifier_namespace_code=excluded.identifier_namespace_code,classification_system_id=excluded.classification_system_id,
       entity_type=excluded.entity_type,source_native_id=excluded.source_native_id,
       geographic_entity_id=excluded.geographic_entity_id,source_dataset_id=excluded.source_dataset_id,
       resolution_outcome=excluded.resolution_outcome,
       committed_at_registry_revision=excluded.committed_at_registry_revision,mapping_json=excluded.mapping_json`,
  ).bind(
    batchId,String(item.mappingKey),String(item.identifierNamespaceCode),String(item.classificationSystemId),
    String(item.entityType),String(item.sourceNativeId),String(item.geographicEntityId),
    String(item.sourceDatasetId),String(item.resolutionOutcome),Number(item.committedAtRegistryRevision),jsonRecord(item),
  );
}

function buildIdentityEntryStatement(db: D1Database, batchId: string, value: unknown) {
  const item = asRecord(value);
  if (!item || !isString(item.geographicEntityId, 80) ||
      !/^IRGEO1-[a-f0-9]{64}$/i.test(String(item.geographicEntityId)) ||
      !isString(item.identityAnchor, 500) || !isString(item.anchorType, 80) ||
      !isString(item.entityType, 80) || !isString(item.classificationSystemId, 120) ||
      !isString(item.canonicalNameFa, 300) || !isString(item.identityStatus, 60) ||
      !Number.isSafeInteger(item.issuedAtRegistryRevision) || !Number.isSafeInteger(item.issuedOrderIndex) ||
      (item.survivingGeographicEntityId !== null && !isString(item.survivingGeographicEntityId, 80)) ||
      (item.retiredReason !== null && typeof item.retiredReason !== 'string') ||
      (item.retiredAtRegistryRevision !== null && !Number.isSafeInteger(item.retiredAtRegistryRevision))) {
    throw new Error('PUBLISH_IDENTITY_ENTRY_INVALID');
  }
  return db.prepare(
    `INSERT INTO geo_registry_identity_entry_stage
      (batch_id,geographic_entity_id,identity_anchor,anchor_type,entity_type,classification_system_id,
       canonical_name_fa,identity_status,issued_at_registry_revision,issued_order_index,
       surviving_geographic_entity_id,retired_reason,retired_at_registry_revision,entry_json)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
     ON CONFLICT(batch_id,geographic_entity_id) DO UPDATE SET
       identity_anchor=excluded.identity_anchor,anchor_type=excluded.anchor_type,entity_type=excluded.entity_type,
       classification_system_id=excluded.classification_system_id,canonical_name_fa=excluded.canonical_name_fa,
       identity_status=excluded.identity_status,issued_at_registry_revision=excluded.issued_at_registry_revision,
       issued_order_index=excluded.issued_order_index,surviving_geographic_entity_id=excluded.surviving_geographic_entity_id,
       retired_reason=excluded.retired_reason,retired_at_registry_revision=excluded.retired_at_registry_revision,
       entry_json=excluded.entry_json`,
  ).bind(
    batchId,String(item.geographicEntityId),String(item.identityAnchor),String(item.anchorType),
    String(item.entityType),String(item.classificationSystemId),String(item.canonicalNameFa),
    String(item.identityStatus),Number(item.issuedAtRegistryRevision),Number(item.issuedOrderIndex),
    isString(item.survivingGeographicEntityId) ? item.survivingGeographicEntityId : null,
    typeof item.retiredReason === 'string' ? item.retiredReason : null,
    Number.isSafeInteger(item.retiredAtRegistryRevision) ? Number(item.retiredAtRegistryRevision) : null,
    jsonRecord(item),
  );
}
function buildIdentityAnchorStatement(db: D1Database, batchId: string, value: unknown) {
  const item = asRecord(value);
  if (!item || !isString(item.identityAnchor, 500) || !isString(item.geographicEntityId, 80) ||
      !/^IRGEO1-[a-f0-9]{64}$/i.test(String(item.geographicEntityId)) ||
      !isString(item.anchorType, 80) || !isString(item.entityType, 80) ||
      !isString(item.classificationSystemId, 120) || !Number.isSafeInteger(item.issuedAtRegistryRevision) ||
      item.immutable !== true || (item.fallbackToken !== null && !isString(item.fallbackToken, 200))) {
    throw new Error('PUBLISH_IDENTITY_ANCHOR_INVALID');
  }
  return db.prepare(
    `INSERT INTO geo_registry_identity_anchor_stage
      (batch_id,identity_anchor,geographic_entity_id,anchor_type,entity_type,classification_system_id,
       fallback_token,issued_at_registry_revision,immutable,anchor_json)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,?9)
     ON CONFLICT(batch_id,identity_anchor) DO UPDATE SET
       geographic_entity_id=excluded.geographic_entity_id,anchor_type=excluded.anchor_type,
       entity_type=excluded.entity_type,classification_system_id=excluded.classification_system_id,
       fallback_token=excluded.fallback_token,issued_at_registry_revision=excluded.issued_at_registry_revision,
       anchor_json=excluded.anchor_json`,
  ).bind(
    batchId,String(item.identityAnchor),String(item.geographicEntityId),String(item.anchorType),
    String(item.entityType),String(item.classificationSystemId),
    isString(item.fallbackToken) ? item.fallbackToken : null,
    Number(item.issuedAtRegistryRevision),jsonRecord(item),
  );
}
function buildLegacyAliasStatement(db: D1Database, batchId: string, value: unknown) {
  const item = asRecord(value);
  const systems = ['TEHRAN_RADAR','LEGACY_IRAN_NEIGHBORHOOD_ID','RETIRED_CANONICAL_ID','OTHER_LEGACY'];
  const statuses = ['ACTIVE_COMPATIBILITY_ALIAS','RETIRED_DUPLICATE_ALIAS','MERGED_PREDECESSOR_ALIAS'];
  if (!item || !isString(item.aliasId, 160) || !systems.includes(String(item.legacySystemCode)) ||
      !isString(item.legacyIdentifierValue, 240) || !isString(item.canonicalGeographicEntityId, 80) ||
      !/^IRGEO1-[a-f0-9]{64}$/i.test(String(item.canonicalGeographicEntityId)) ||
      !statuses.includes(String(item.aliasStatus)) || !isString(item.resolutionEvidenceRef, 1000) ||
      !Number.isSafeInteger(item.recordedAtRegistryRevision)) {
    throw new Error('PUBLISH_LEGACY_ALIAS_INVALID');
  }
  return db.prepare(
    `INSERT INTO geo_registry_legacy_alias_stage
      (batch_id,alias_id,legacy_system_code,legacy_identifier_value,canonical_geographic_entity_id,
       alias_status,resolution_evidence_ref,recorded_at_registry_revision,alias_json)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
     ON CONFLICT(batch_id,alias_id) DO UPDATE SET
       legacy_system_code=excluded.legacy_system_code,legacy_identifier_value=excluded.legacy_identifier_value,
       canonical_geographic_entity_id=excluded.canonical_geographic_entity_id,alias_status=excluded.alias_status,
       resolution_evidence_ref=excluded.resolution_evidence_ref,
       recorded_at_registry_revision=excluded.recorded_at_registry_revision,alias_json=excluded.alias_json`,
  ).bind(
    batchId,String(item.aliasId),String(item.legacySystemCode),String(item.legacyIdentifierValue),
    String(item.canonicalGeographicEntityId),String(item.aliasStatus),String(item.resolutionEvidenceRef),
    Number(item.recordedAtRegistryRevision),jsonRecord(item),
  );
}

async function publishBatch(
  ctx: WorkerRequestContext, db: D1Database, payload: Record<string, unknown>, nonce: string,
): Promise<Response> {
  if (!await consumeNonce(db, nonce)) {
    return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'PUBLISH_NONCE_REPLAYED' });
  }
  const batchId = payload.batchId;
  const kind = payload.datasetKind as DatasetKind;
  const chunkIndex = payload.chunkIndex;
  const items = payload.items;
  if (!isString(batchId, 80) || !['entities','relationships','sourceMappings','identityEntries','anchors','legacyAliases'].includes(kind) ||
      !Number.isSafeInteger(chunkIndex) || Number(chunkIndex) < 0 ||
      !Array.isArray(items) || items.length < 1 || items.length > MAX_ITEMS_PER_CHUNK) {
    return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'PUBLISH_CHUNK_INVALID' });
  }
  const session = await db.prepare(
    'SELECT registry_revision,status FROM geo_registry_publish_sessions WHERE batch_id = ?1',
  ).bind(batchId).first<{registry_revision:number;status:string}>();
  if (!session || session.status !== 'RECEIVING') {
    return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'PUBLISH_BATCH_NOT_OPEN' });
  }
  const chunkSha = await sha256Json(items);
  const existingChunk = await db.prepare(
    'SELECT chunk_sha256,record_count FROM geo_registry_publish_chunks WHERE batch_id = ?1 AND dataset_kind = ?2 AND chunk_index = ?3',
  ).bind(String(batchId),kind,Number(chunkIndex)).first<{chunk_sha256:string;record_count:number}>();
  if (existingChunk) {
    if (existingChunk.chunk_sha256 !== chunkSha || Number(existingChunk.record_count) !== items.length) {
      return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'PUBLISH_CHUNK_CONTENT_CONFLICT' });
    }
    return jsonWorkerResponse(ctx, 202, {
      status: 'ok', idempotentReplay: true, batchId, datasetKind: kind, chunkIndex,
      receivedCount: items.length,
    });
  }
  const statements = [
    db.prepare(
      'INSERT INTO geo_registry_publish_chunks(batch_id,dataset_kind,chunk_index,record_count,chunk_sha256,created_at_iso) VALUES (?1,?2,?3,?4,?5,?6)',
    ).bind(String(batchId),kind,Number(chunkIndex),items.length,chunkSha,new Date().toISOString()),
    ...items.map((item) => kind === 'entities'
      ? buildEntityStatement(db,String(batchId),item)
      : kind === 'relationships'
        ? buildRelationshipStatement(db,String(batchId),item)
        : kind === 'sourceMappings'
          ? buildMappingStatement(db,String(batchId),item)
          : kind === 'identityEntries'
            ? buildIdentityEntryStatement(db,String(batchId),item)
            : kind === 'anchors'
              ? buildIdentityAnchorStatement(db,String(batchId),item)
              : buildLegacyAliasStatement(db,String(batchId),item)),
  ];
  try {
    const results = await db.batch(statements);
    if (results.some((result) => !result.success)) {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'PUBLISH_CHUNK_WRITE_FAILED' });
    }
    return jsonWorkerResponse(ctx, 202, {
      status: 'ok', batchId, datasetKind: kind, chunkIndex, receivedCount: items.length,
    });
  } catch (error) {
    return jsonWorkerResponse(ctx, 409, {
      status: 'error', code: error instanceof Error ? error.message : 'PUBLISH_CHUNK_WRITE_FAILED',
    });
  }
}

async function publishFinalize(
  ctx: WorkerRequestContext, db: D1Database, payload: Record<string, unknown>, nonce: string,
): Promise<Response> {
  if (!await consumeNonce(db, nonce)) {
    return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'PUBLISH_NONCE_REPLAYED' });
  }
  const batchId = payload.batchId;
  if (!isString(batchId, 80)) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'PUBLISH_BATCH_ID_REQUIRED' });
  const session = await db.prepare(
    'SELECT * FROM geo_registry_publish_sessions WHERE batch_id = ?1',
  ).bind(batchId).first<Record<string, unknown>>();
  if (!session) return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'PUBLISH_BATCH_NOT_FOUND' });
  if (session.status === 'COMPLETED') {
    const head = await getCurrentHead(db);
    return jsonWorkerResponse(ctx, 200, { status: 'ok', alreadyPublished: true, registry: head });
  }
  if (session.status !== 'RECEIVING') {
    return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'PUBLISH_BATCH_NOT_OPEN' });
  }
  const batchIdValue = String(batchId);
  const [entityCount,relationshipCount,mappingCount,identityEntryCount,anchorCount,aliasCount] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS count FROM geo_registry_entity_stage WHERE batch_id = ?1')
      .bind(batchIdValue).first<{count:number}>(),
    db.prepare('SELECT COUNT(*) AS count FROM geo_registry_relationship_stage WHERE batch_id = ?1')
      .bind(batchIdValue).first<{count:number}>(),
    db.prepare('SELECT COUNT(*) AS count FROM geo_registry_source_mapping_stage WHERE batch_id = ?1')
      .bind(batchIdValue).first<{count:number}>(),
    db.prepare('SELECT COUNT(*) AS count FROM geo_registry_identity_entry_stage WHERE batch_id = ?1')
      .bind(batchIdValue).first<{count:number}>(),
    db.prepare('SELECT COUNT(*) AS count FROM geo_registry_identity_anchor_stage WHERE batch_id = ?1')
      .bind(batchIdValue).first<{count:number}>(),
    db.prepare('SELECT COUNT(*) AS count FROM geo_registry_legacy_alias_stage WHERE batch_id = ?1')
      .bind(batchIdValue).first<{count:number}>(),
  ]);
  const actual = {
    entities: Number(entityCount?.count ?? 0),
    relationships: Number(relationshipCount?.count ?? 0),
    sourceMappings: Number(mappingCount?.count ?? 0),
    identityEntries: Number(identityEntryCount?.count ?? 0),
    anchors: Number(anchorCount?.count ?? 0),
    legacyAliases: Number(aliasCount?.count ?? 0),
  };
  const expected = {
    entities: Number(session.expected_entities),
    relationships: Number(session.expected_relationships),
    sourceMappings: Number(session.expected_source_mappings),
    identityEntries: Number(session.expected_identity_entries),
    anchors: Number(session.expected_anchors),
    legacyAliases: Number(session.expected_legacy_aliases),
  };
  if (Object.keys(expected).some((key) => actual[key as keyof typeof actual] !== expected[key as keyof typeof expected])) {
    return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'PUBLISH_COUNTS_MISMATCH', expected, actual });
  }
  if (actual.entities !== actual.identityEntries || actual.entities !== actual.anchors) {
    return jsonWorkerResponse(ctx, 409, {
      status: 'error', code: 'CANONICAL_IDENTITY_REGISTRY_COUNT_MISMATCH',
      stagedEntities: actual.entities, identityEntries: actual.identityEntries, anchors: actual.anchors,
    });
  }
  const revision = Number(session.registry_revision);
  const batchIdParam = batchIdValue;
  const missingIdentity = await db.prepare(
    `SELECT COUNT(*) AS count FROM geo_registry_entity_stage e
      LEFT JOIN geo_registry_identity_entry_stage i
        ON i.batch_id=e.batch_id AND i.geographic_entity_id=e.geographic_entity_id
      WHERE e.batch_id=?1 AND i.geographic_entity_id IS NULL`,
  ).bind(batchIdParam).first<{count:number}>();
  if (Number(missingIdentity?.count ?? 0) !== 0) {
    return jsonWorkerResponse(ctx, 409, {
      status: 'error', code: 'PUBLISH_ENTITY_WITHOUT_IRNI_CANONICAL_IDENTITY',
      count: missingIdentity?.count ?? 0,
    });
  }
  const orphanRelationships = await db.prepare(
    `SELECT COUNT(*) AS count FROM geo_registry_relationship_stage r
      LEFT JOIN geo_registry_entity_stage s
        ON s.batch_id=r.batch_id AND s.geographic_entity_id=r.source_geographic_entity_id
      LEFT JOIN geo_registry_entity_stage t
        ON t.batch_id=r.batch_id AND t.geographic_entity_id=r.target_geographic_entity_id
      WHERE r.batch_id=?1 AND (s.geographic_entity_id IS NULL OR t.geographic_entity_id IS NULL)`,
  ).bind(batchIdParam).first<{count:number}>();
  const orphanMappings = await db.prepare(
    `SELECT COUNT(*) AS count FROM geo_registry_source_mapping_stage m
      LEFT JOIN geo_registry_entity_stage e
        ON e.batch_id=m.batch_id AND e.geographic_entity_id=m.geographic_entity_id
      WHERE m.batch_id=?1 AND e.geographic_entity_id IS NULL`,
  ).bind(batchIdParam).first<{count:number}>();
  if (Number(orphanRelationships?.count ?? 0) !== 0 || Number(orphanMappings?.count ?? 0) !== 0) {
    return jsonWorkerResponse(ctx, 409, {
      status: 'error', code: 'PUBLISH_REFERENTIAL_INTEGRITY_FAILED',
      orphanRelationships: orphanRelationships?.count ?? 0, orphanMappings: orphanMappings?.count ?? 0,
    });
  }


  const mismatchedIdentityReferences = await db.prepare(
    `SELECT COUNT(*) AS count FROM geo_registry_identity_entry_stage i
      LEFT JOIN geo_registry_entity_stage e
        ON e.batch_id=i.batch_id AND e.geographic_entity_id=i.geographic_entity_id
      LEFT JOIN geo_registry_identity_anchor_stage a
        ON a.batch_id=i.batch_id AND a.identity_anchor=i.identity_anchor
          AND a.geographic_entity_id=i.geographic_entity_id
      WHERE i.batch_id=?1 AND (
        e.geographic_entity_id IS NULL OR a.identity_anchor IS NULL OR
        i.entity_type<>e.entity_type OR i.classification_system_id<>e.classification_system_id OR
        i.canonical_name_fa<>e.canonical_name_fa
      )`,
  ).bind(batchIdParam).first<{count:number}>();
  const orphanAliases = await db.prepare(
    `SELECT COUNT(*) AS count FROM geo_registry_legacy_alias_stage a
      LEFT JOIN geo_registry_entity_stage e
        ON e.batch_id=a.batch_id AND e.geographic_entity_id=a.canonical_geographic_entity_id
      WHERE a.batch_id=?1 AND e.geographic_entity_id IS NULL`,
  ).bind(batchIdParam).first<{count:number}>();
  const immutableAnchorConflicts = await db.prepare(
    `SELECT COUNT(*) AS count FROM geo_registry_identity_anchor_stage s
      JOIN geo_identity_anchors a ON a.identity_anchor=s.identity_anchor
      WHERE s.batch_id=?1 AND (
        a.geographic_entity_id<>s.geographic_entity_id OR a.anchor_type<>s.anchor_type OR
        a.entity_type<>s.entity_type OR a.classification_system_id<>s.classification_system_id OR
        COALESCE(a.fallback_token,'')<>COALESCE(s.fallback_token,'') OR
        a.issued_at_registry_revision<>s.issued_at_registry_revision OR a.immutable<>1
      )`,
  ).bind(batchIdParam).first<{count:number}>();
  if (Number(mismatchedIdentityReferences?.count ?? 0) !== 0 ||
      Number(orphanAliases?.count ?? 0) !== 0 ||
      Number(immutableAnchorConflicts?.count ?? 0) !== 0) {
    return jsonWorkerResponse(ctx, 409, {
      status: 'error', code: 'PUBLISH_CANONICAL_IDENTITY_INTEGRITY_FAILED',
      mismatchedIdentityReferences: mismatchedIdentityReferences?.count ?? 0,
      orphanAliases: orphanAliases?.count ?? 0,
      immutableAnchorConflicts: immutableAnchorConflicts?.count ?? 0,
    });
  }

  const timestamp = new Date().toISOString();
  const registryChecksum = String(session.registry_checksum);
  const previousHead = await db.prepare("SELECT registry_revision FROM geo_registry_head WHERE singleton_id='current'")
    .first<{registry_revision:number}>();
  const previousRevision = previousHead ? Number(previousHead.registry_revision) : null;
  const artifacts = asRecord(payload.artifactChecksums) ?? {};
  const statements = [
    db.prepare(
      `INSERT INTO geo_canonical_entities
       (geographic_entity_id,entity_type,classification_system_id,canonical_name_fa,parent_geographic_entity_id,
        province_geographic_entity_id,identity_status,verification_status,lifecycle_status,is_synthetic_fixture,entity_json)
       SELECT geographic_entity_id,entity_type,classification_system_id,canonical_name_fa,parent_geographic_entity_id,
        province_geographic_entity_id,identity_status,verification_status,lifecycle_status,0,entity_json
       FROM geo_registry_entity_stage WHERE batch_id=?1
       ON CONFLICT(geographic_entity_id) DO UPDATE SET entity_type=excluded.entity_type,
        classification_system_id=excluded.classification_system_id,canonical_name_fa=excluded.canonical_name_fa,
        parent_geographic_entity_id=excluded.parent_geographic_entity_id,
        province_geographic_entity_id=excluded.province_geographic_entity_id,
        identity_status=excluded.identity_status,verification_status=excluded.verification_status,
        lifecycle_status=excluded.lifecycle_status,is_synthetic_fixture=0,entity_json=excluded.entity_json`,
    ).bind(batchIdParam),
    db.prepare(
      `INSERT INTO geo_relationships
       (relationship_id,source_geographic_entity_id,target_geographic_entity_id,relationship_type,
        classification_system_id,source_dataset_id,verification_status,relationship_json)
       SELECT relationship_id,source_geographic_entity_id,target_geographic_entity_id,relationship_type,
        classification_system_id,source_dataset_id,verification_status,relationship_json
       FROM geo_registry_relationship_stage WHERE batch_id=?1
       ON CONFLICT(relationship_id) DO UPDATE SET source_geographic_entity_id=excluded.source_geographic_entity_id,
        target_geographic_entity_id=excluded.target_geographic_entity_id,relationship_type=excluded.relationship_type,
        classification_system_id=excluded.classification_system_id,source_dataset_id=excluded.source_dataset_id,
        verification_status=excluded.verification_status,relationship_json=excluded.relationship_json`,
    ).bind(batchIdParam),
    db.prepare(
      `INSERT INTO geo_source_mappings
       (mapping_key,identifier_namespace_code,classification_system_id,entity_type,source_native_id,
        geographic_entity_id,source_dataset_id,resolution_outcome,committed_at_registry_revision,mapping_json)
       SELECT mapping_key,identifier_namespace_code,classification_system_id,entity_type,source_native_id,
        geographic_entity_id,source_dataset_id,resolution_outcome,committed_at_registry_revision,mapping_json
       FROM geo_registry_source_mapping_stage WHERE batch_id=?1
       ON CONFLICT(mapping_key) DO UPDATE SET identifier_namespace_code=excluded.identifier_namespace_code,
        classification_system_id=excluded.classification_system_id,entity_type=excluded.entity_type,
        source_native_id=excluded.source_native_id,geographic_entity_id=excluded.geographic_entity_id,
        source_dataset_id=excluded.source_dataset_id,resolution_outcome=excluded.resolution_outcome,
        committed_at_registry_revision=excluded.committed_at_registry_revision,mapping_json=excluded.mapping_json`,
    ).bind(batchIdParam),

    db.prepare(
      `INSERT INTO geo_identity_registry_entries
       (geographic_entity_id,identity_anchor,anchor_type,entity_type,classification_system_id,
        canonical_name_fa,identity_status,issued_at_registry_revision,issued_order_index,
        surviving_geographic_entity_id,retired_reason,retired_at_registry_revision,entry_json)
       SELECT geographic_entity_id,identity_anchor,anchor_type,entity_type,classification_system_id,
        canonical_name_fa,identity_status,issued_at_registry_revision,issued_order_index,
        surviving_geographic_entity_id,retired_reason,retired_at_registry_revision,entry_json
       FROM geo_registry_identity_entry_stage WHERE batch_id=?1
       ON CONFLICT(geographic_entity_id) DO UPDATE SET identity_anchor=excluded.identity_anchor,
        anchor_type=excluded.anchor_type,entity_type=excluded.entity_type,
        classification_system_id=excluded.classification_system_id,canonical_name_fa=excluded.canonical_name_fa,
        identity_status=excluded.identity_status,issued_at_registry_revision=excluded.issued_at_registry_revision,
        issued_order_index=excluded.issued_order_index,surviving_geographic_entity_id=excluded.surviving_geographic_entity_id,
        retired_reason=excluded.retired_reason,retired_at_registry_revision=excluded.retired_at_registry_revision,
        entry_json=excluded.entry_json`,
    ).bind(batchIdParam),
    db.prepare(
      `INSERT OR IGNORE INTO geo_identity_anchors
       (identity_anchor,geographic_entity_id,anchor_type,entity_type,classification_system_id,
        fallback_token,issued_at_registry_revision,immutable,anchor_json)
       SELECT identity_anchor,geographic_entity_id,anchor_type,entity_type,classification_system_id,
        fallback_token,issued_at_registry_revision,1,anchor_json
       FROM geo_registry_identity_anchor_stage WHERE batch_id=?1`,
    ).bind(batchIdParam),
    db.prepare(
      `INSERT INTO geo_legacy_aliases
       (alias_id,legacy_system_code,legacy_identifier_value,canonical_geographic_entity_id,
        alias_status,resolution_evidence_ref,recorded_at_registry_revision,alias_json)
       SELECT alias_id,legacy_system_code,legacy_identifier_value,canonical_geographic_entity_id,
        alias_status,resolution_evidence_ref,recorded_at_registry_revision,alias_json
       FROM geo_registry_legacy_alias_stage WHERE batch_id=?1
       ON CONFLICT(alias_id) DO UPDATE SET legacy_system_code=excluded.legacy_system_code,
        legacy_identifier_value=excluded.legacy_identifier_value,
        canonical_geographic_entity_id=excluded.canonical_geographic_entity_id,
        alias_status=excluded.alias_status,resolution_evidence_ref=excluded.resolution_evidence_ref,
        recorded_at_registry_revision=excluded.recorded_at_registry_revision,alias_json=excluded.alias_json`,
    ).bind(batchIdParam),
    db.prepare(
      `INSERT INTO geo_registry_head
       (singleton_id,contract_version,id_algorithm_version,schema_version,registry_revision,
        previous_registry_revision,registry_checksum,canonical_entry_count,canonical_entity_count,
        relationship_count,anchor_count,source_mapping_count,legacy_alias_count,duplicate_conflict_count,
        integrity_verified,imported_at_iso)
       VALUES ('current',?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,1,?14)
       ON CONFLICT(singleton_id) DO UPDATE SET contract_version=excluded.contract_version,
        id_algorithm_version=excluded.id_algorithm_version,schema_version=excluded.schema_version,
        registry_revision=excluded.registry_revision,previous_registry_revision=excluded.previous_registry_revision,
        registry_checksum=excluded.registry_checksum,canonical_entry_count=excluded.canonical_entry_count,
        canonical_entity_count=excluded.canonical_entity_count,relationship_count=excluded.relationship_count,
        anchor_count=excluded.anchor_count,source_mapping_count=excluded.source_mapping_count,
        legacy_alias_count=excluded.legacy_alias_count,duplicate_conflict_count=excluded.duplicate_conflict_count,
        integrity_verified=1,imported_at_iso=excluded.imported_at_iso
       WHERE excluded.registry_revision > geo_registry_head.registry_revision
          OR (excluded.registry_revision=geo_registry_head.registry_revision
              AND excluded.registry_checksum=geo_registry_head.registry_checksum)`,
    ).bind(
      String(session.contract_version),String(session.id_algorithm_version),String(session.schema_version),
      revision,previousRevision,registryChecksum,actual.identityEntries,actual.entities,
      actual.relationships,actual.anchors,actual.sourceMappings,actual.legacyAliases,
      0,timestamp,
    ),
    db.prepare(
      `INSERT INTO geo_registry_publish_pointer(singleton_id,batch_id,registry_revision,registry_checksum,activated_at_iso)
       VALUES ('current',?1,?2,?3,?4)
       ON CONFLICT(singleton_id) DO UPDATE SET batch_id=excluded.batch_id,registry_revision=excluded.registry_revision,
        registry_checksum=excluded.registry_checksum,activated_at_iso=excluded.activated_at_iso
       WHERE excluded.registry_revision > geo_registry_publish_pointer.registry_revision
          OR (excluded.registry_revision=geo_registry_publish_pointer.registry_revision
              AND excluded.registry_checksum=geo_registry_publish_pointer.registry_checksum)`,
    ).bind(batchIdParam,revision,registryChecksum,timestamp),
    ...([
      ['public/data/geography/national-registry-snapshot.json','snapshot',actual.entities],
      ['data/geography/normalized/geographic-relationships.json','relationships',actual.relationships],
      ['data/geography/identity/GEOGRAPHIC-SOURCE-ID-MAPPINGS.json','sourceMappings',actual.sourceMappings],
      ['data/geography/identity/GEOGRAPHIC-CANONICAL-ID-REGISTRY.json','identityEntries',actual.identityEntries],
      ['data/geography/identity/GEOGRAPHIC-IDENTITY-ANCHOR-REGISTER.json','anchors',actual.anchors],
      ['data/geography/identity/GEOGRAPHIC-LEGACY-ID-ALIASES.json','legacyAliases',actual.legacyAliases],
    ] as const).map(([artifactPath,key,count]) =>
      db.prepare(
        `INSERT INTO geo_registry_imports(artifact_path,artifact_sha256,record_count,registry_revision,imported_at_iso)
         VALUES (?1,?2,?3,?4,?5)
         ON CONFLICT(artifact_path) DO UPDATE SET artifact_sha256=excluded.artifact_sha256,
          record_count=excluded.record_count,registry_revision=excluded.registry_revision,
          imported_at_iso=excluded.imported_at_iso`,
      ).bind(artifactPath,String(artifacts[key] ?? registryChecksum),count,revision,timestamp)
    ),
    db.prepare('UPDATE geo_registry_publish_sessions SET status=?1,completed_at_iso=?2 WHERE batch_id=?3')
      .bind('COMPLETED',timestamp,batchIdParam),
  ];
  const result = await db.batch(statements);
  if (result.some((entry) => !entry.success)) {
    return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'PUBLISH_ATOMIC_ACTIVATION_FAILED' });
  }
  const head = await getCurrentHead(db);
  if (!head || head.batch_id !== batchIdParam || Number(head.registry_revision) !== revision ||
      head.registry_checksum !== registryChecksum) {
    return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'PUBLISH_ACTIVATION_VERIFICATION_FAILED' });
  }
  return jsonWorkerResponse(ctx, 200, {
    status: 'ok', published: true, head,
    expectedCounts: expected, verifiedCounts: actual,
  });
}

async function handlePublisherRoute(ctx: WorkerRequestContext, db: D1Database): Promise<Response | null> {
  const path = ctx.pathname;
  if (![
    '/api/internal/geography/publish/start',
    '/api/internal/geography/publish/batch',
    '/api/internal/geography/publish/finalize',
  ].includes(path)) return null;
  if (ctx.method !== 'POST') return jsonWorkerResponse(ctx, 405, { status: 'error', code: 'METHOD_NOT_ALLOWED' });
  const signed = await verifySignedPayload(ctx.request);
  if (signed.ok === false) return jsonWorkerResponse(ctx, signed.status, { status: 'error', code: signed.code });
  if (path.endsWith('/start')) return publishStart(ctx, db, signed.payload, signed.nonce);
  if (path.endsWith('/batch')) return publishBatch(ctx, db, signed.payload, signed.nonce);
  return publishFinalize(ctx, db, signed.payload, signed.nonce);
}

export async function handleGeographicRegistryRoute(ctx: WorkerRequestContext): Promise<Response | null> {
  const { pathname, method, url } = ctx;
  if (!pathname.startsWith('/api/v1/geography/') &&
      !pathname.startsWith('/api/internal/geography/')) return null;
  const resolved = requireNeighborhoodDb(ctx.env);
  if (resolved.ok === false) {
    return jsonWorkerResponse(ctx, 503, { status: 'error', code: resolved.code, message: resolved.messageFa });
  }
  const db = resolved.db;
  if (pathname.startsWith('/api/internal/geography/')) return handlePublisherRoute(ctx, db);
  if (method !== 'GET') return jsonWorkerResponse(ctx, 405, { status: 'error', code: 'GEOGRAPHY_REFERENCE_READ_ONLY' });

  if (pathname === '/api/v1/geography/registry/health') {
    const head = await getCurrentHead(db);
    return jsonWorkerResponse(ctx, 200, {
      status: head ? 'ready' : 'not_published',
      databaseBound: true,
      authoritativeWriter: 'IRAN_NEIGHBORHOOD_INTELLIGENCE',
      directRadarWritesAllowed: false,
      head,
    });
  }
  const head = await getCurrentHead(db);
  if (!head) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'GEOGRAPHIC_REGISTRY_NOT_PUBLISHED' });
  const revision = Number(head.registry_revision);
  const batchId = head.batch_id;
  if (pathname === '/api/v1/geography/registry') {
    return jsonWorkerResponse(ctx, 200, { status: 'ok', registry: head });
  }

  if (pathname === '/api/v1/geography/legacy-aliases') {
    const systemCode = url.searchParams.get('legacySystemCode');
    if (systemCode && !['TEHRAN_RADAR','LEGACY_IRAN_NEIGHBORHOOD_ID','RETIRED_CANONICAL_ID','OTHER_LEGACY'].includes(systemCode)) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_LEGACY_SYSTEM_CODE' });
    }
    const query = systemCode
      ? db.prepare('SELECT alias_json FROM geo_registry_legacy_alias_stage WHERE batch_id=?1 AND legacy_system_code=?2 ORDER BY legacy_identifier_value')
        .bind(batchId, systemCode)
      : db.prepare('SELECT alias_json FROM geo_registry_legacy_alias_stage WHERE batch_id=?1 ORDER BY legacy_system_code,legacy_identifier_value')
        .bind(batchId);
    const rows = await query.all<{ alias_json: string }>();
    if (!rows.success) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'GEOGRAPHIC_ALIAS_QUERY_FAILED' });
    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      registryRevision: revision,
      items: rows.results.map((row) => JSON.parse(row.alias_json)),
      source: 'IRNI_CANONICAL_REGISTRY',
    });
  }

  if (pathname === '/api/v1/geography/entities' || pathname === '/api/v1/geography/neighborhoods') {
    const limit = normalizeLimit(url.searchParams.get('limit'));
    const offset = normalizeOffset(url.searchParams.get('offset'));
    const clauses = ['e.batch_id=?1'];
    const params: unknown[] = [batchId];
    const addClause = (column: string,value:unknown) => {
      params.push(value);
      clauses.push(`e.${column}=?${params.length}`);
    };
    if (pathname.endsWith('/neighborhoods')) {
      clauses.push("e.entity_type IN ('URBAN_NEIGHBORHOOD','URBAN_ZONE')");
    } else if (url.searchParams.has('entityType')) {
      const entityType=String(url.searchParams.get('entityType')||'').trim();
      if (!/^[A-Z_]{2,64}$/.test(entityType)) return jsonWorkerResponse(ctx,400,{status:'error',code:'INVALID_ENTITY_TYPE'});
      addClause('entity_type',entityType);
    }
    const provinceId=url.searchParams.get('provinceId');
    if(provinceId) addClause('province_geographic_entity_id',provinceId);
    const parentId=url.searchParams.get('parentId');
    if(parentId) addClause('parent_geographic_entity_id',parentId);
    const query=url.searchParams.get('q');
    if(query) { params.push(`%${query.slice(0,80)}%`); clauses.push(`e.canonical_name_fa LIKE ?${params.length}`); }
    params.push(limit,offset);
    const rows=await db.prepare(
      `SELECT e.geographic_entity_id,e.entity_type,e.classification_system_id,e.canonical_name_fa,
       e.parent_geographic_entity_id,e.province_geographic_entity_id,e.identity_status,e.verification_status,
       e.lifecycle_status,e.entity_json,i.entry_json
       FROM geo_registry_entity_stage e
       INNER JOIN geo_registry_identity_entry_stage i
         ON i.batch_id=e.batch_id AND i.geographic_entity_id=e.geographic_entity_id
       WHERE ${clauses.join(' AND ')} ORDER BY i.issued_order_index,e.geographic_entity_id
       LIMIT ?${params.length-1} OFFSET ?${params.length}`,
    ).bind(...params).all<Record<string,unknown>>();
    if(!rows.success) return jsonWorkerResponse(ctx,503,{status:'error',code:'GEOGRAPHIC_QUERY_FAILED'});
    return jsonWorkerResponse(ctx,200,{
      status:'ok',registryRevision:revision,
      items:rows.results.map((row)=>{
        const entity=JSON.parse(String(row.entity_json)) as Record<string,unknown>;
        return {...entity,registryIdentity:JSON.parse(String(row.entry_json))};
      }),
      pagination:{limit,offset,nextOffset:rows.results.length===limit?offset+limit:null},
      source:'IRNI_CANONICAL_REGISTRY',
    });
  }
  const match=pathname.match(/^\/api\/v1\/geography\/entities\/([^/]+)(?:\/relationships)?$/);
  if(match) {
    const id=decodeURIComponent(match[1]);
    if(pathname.endsWith('/relationships')) {
      const rows=await db.prepare(
        'SELECT relationship_json FROM geo_registry_relationship_stage WHERE batch_id=?1 AND (source_geographic_entity_id=?2 OR target_geographic_entity_id=?2) ORDER BY relationship_id',
      ).bind(batchId,id).all<{relationship_json:string}>();
      if(!rows.success) return jsonWorkerResponse(ctx,503,{status:'error',code:'GEOGRAPHIC_RELATIONSHIP_QUERY_FAILED'});
      return jsonWorkerResponse(ctx,200,{status:'ok',registryRevision:revision,items:rows.results.map(row=>JSON.parse(row.relationship_json))});
    }
    const row=await db.prepare(
      `SELECT e.entity_json,i.entry_json
       FROM geo_registry_entity_stage e
       INNER JOIN geo_registry_identity_entry_stage i
         ON i.batch_id=e.batch_id AND i.geographic_entity_id=e.geographic_entity_id
       WHERE e.batch_id=?1 AND e.geographic_entity_id=?2`,
    ).bind(batchId,id).first<{entity_json:string;entry_json:string}>();
    if(!row) return jsonWorkerResponse(ctx,404,{status:'error',code:'GEOGRAPHIC_ENTITY_NOT_FOUND'});
    const entity=JSON.parse(row.entity_json) as Record<string,unknown>;
    return jsonWorkerResponse(ctx,200,{
      status:'ok',registryRevision:revision,
      item:{...entity,registryIdentity:JSON.parse(row.entry_json)},
    });
  }
  return jsonWorkerResponse(ctx,404,{status:'error',code:'GEOGRAPHY_ROUTE_NOT_FOUND'});
}

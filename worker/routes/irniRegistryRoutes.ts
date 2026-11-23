/**
 * IRNI canonical geography publication and read API.
 *
 * Authority model:
 * - IRNI is the sole canonical data authority.
 * - Only the signed IRNI GitHub publisher may publish a new registry revision.
 * - Radar consumers use the canonical read endpoints and never mint or rewrite IDs.
 */
import { jsonWorkerResponse } from '../contextAndSecurity';
import type { WorkerRequestContext, D1Database, D1PreparedStatement } from '../types';

const CANONICAL_ID_RE = /^IRGEO1-[0-9a-f]{64}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const DATASET_KINDS = ['entities', 'relationships', 'sourceMappings'] as const;
type DatasetKind = (typeof DATASET_KINDS)[number];

interface PublishManifest {
  readonly batchId: string;
  readonly registryRevision: number;
  readonly registryChecksum: string;
  readonly contractVersion: string;
  readonly idAlgorithmVersion: string;
  readonly schemaVersion: string;
  readonly expectedCounts: {
    readonly entities: number;
    readonly relationships: number;
    readonly sourceMappings: number;
  };
  readonly artifactChecksums: {
    readonly snapshot: string;
    readonly relationships: string;
    readonly sourceMappings: string;
    readonly identityRegistry: string;
    readonly identityAnchors: string;
    readonly legacyAliases: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isHexSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_RE.test(value);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function authenticatePublisher(
  ctx: WorkerRequestContext,
  rawBody: string,
): Promise<{ ok: true } | { ok: false; status: number; code: string }> {
  const secret = ctx.env.IRNI_PUBLISH_HMAC_SECRET;
  const timestampText = ctx.request.headers.get('x-irni-timestamp') || '';
  const nonce = ctx.request.headers.get('x-irni-nonce') || '';
  const suppliedSignature = (ctx.request.headers.get('x-irni-signature') || '').toLowerCase();
  if (!secret || secret.length < 32) return { ok: false, status: 503, code: 'IRNI_PUBLISH_SECRET_NOT_CONFIGURED' };
  if (!/^\d{10}$/.test(timestampText) || !/^[0-9a-f-]{36}$/i.test(nonce) || !SHA256_RE.test(suppliedSignature)) {
    return { ok: false, status: 401, code: 'IRNI_PUBLISH_SIGNATURE_HEADERS_INVALID' };
  }
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) {
    return { ok: false, status: 401, code: 'IRNI_PUBLISH_TIMESTAMP_OUT_OF_WINDOW' };
  }
  const bodyHash = await sha256Hex(rawBody);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(timestampText + '\n' + nonce + '\n' + bodyHash),
  );
  const expectedSignature = Array.from(new Uint8Array(signatureBytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (!constantTimeEqual(expectedSignature, suppliedSignature)) {
    return { ok: false, status: 401, code: 'IRNI_PUBLISH_SIGNATURE_INVALID' };
  }

  const db = ctx.env.NEIGHBORHOOD_DB;
  if (!db) return { ok: false, status: 503, code: 'IRNI_NEIGHBORHOOD_DATABASE_NOT_BOUND' };
  try {
    await db.prepare(
      'INSERT INTO geo_publish_nonces (nonce, timestamp_seconds, expires_at_ms) VALUES (?, ?, ?)',
    ).bind(nonce, timestamp, Date.now() + 600_000).run();
    await db.prepare('DELETE FROM geo_publish_nonces WHERE expires_at_ms < ?').bind(Date.now()).run();
  } catch {
    return { ok: false, status: 409, code: 'IRNI_PUBLISH_NONCE_REPLAYED' };
  }
  return { ok: true };
}

async function readSignedJsonBody(
  ctx: WorkerRequestContext,
): Promise<{ ok: true; raw: string; body: Record<string, unknown> } | { ok: false; response: Response }> {
  const contentType = (ctx.request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return { ok: false, response: jsonWorkerResponse(ctx, 415, { status: 'error', code: 'INVALID_CONTENT_TYPE' }) };
  }
  const length = Number(ctx.request.headers.get('content-length') || 0);
  if (length > 1_000_000) {
    return { ok: false, response: jsonWorkerResponse(ctx, 413, { status: 'error', code: 'IRNI_PUBLISH_PAYLOAD_TOO_LARGE' }) };
  }
  let raw: string;
  try {
    raw = await ctx.request.text();
  } catch {
    return { ok: false, response: jsonWorkerResponse(ctx, 400, { status: 'error', code: 'IRNI_PUBLISH_BODY_READ_FAILED' }) };
  }
  if (new TextEncoder().encode(raw).byteLength > 1_000_000) {
    return { ok: false, response: jsonWorkerResponse(ctx, 413, { status: 'error', code: 'IRNI_PUBLISH_PAYLOAD_TOO_LARGE' }) };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, response: jsonWorkerResponse(ctx, 400, { status: 'error', code: 'IRNI_PUBLISH_INVALID_JSON' }) };
  }
  if (!isRecord(parsed)) {
    return { ok: false, response: jsonWorkerResponse(ctx, 400, { status: 'error', code: 'IRNI_PUBLISH_BODY_MUST_BE_OBJECT' }) };
  }
  return { ok: true, raw, body: parsed };
}

function getManifest(body: Record<string, unknown>): PublishManifest | null {
  const counts = body.expectedCounts;
  const checksums = body.artifactChecksums;
  if (
    typeof body.batchId !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(body.batchId) ||
    !isPositiveInteger(body.registryRevision) ||
    !isHexSha256(body.registryChecksum) ||
    typeof body.contractVersion !== 'string' ||
    typeof body.idAlgorithmVersion !== 'string' ||
    typeof body.schemaVersion !== 'string' ||
    !isRecord(counts) ||
    !isPositiveInteger(counts.entities) ||
    !isPositiveInteger(counts.relationships) ||
    !isPositiveInteger(counts.sourceMappings) ||
    !isRecord(checksums) ||
    !isHexSha256(checksums.snapshot) ||
    !isHexSha256(checksums.relationships) ||
    !isHexSha256(checksums.sourceMappings) ||
    !isHexSha256(checksums.identityRegistry) ||
    !isHexSha256(checksums.identityAnchors) ||
    !isHexSha256(checksums.legacyAliases)
  ) return null;
  if (counts.entities > 100_000 || counts.relationships > 200_000 || counts.sourceMappings > 250_000) return null;
  return body as unknown as PublishManifest;
}

function getRecordKey(kind: DatasetKind, item: Record<string, unknown>): string | null {
  if (kind === 'entities') {
    return typeof item.geographicEntityId === 'string' && CANONICAL_ID_RE.test(item.geographicEntityId)
      ? item.geographicEntityId : null;
  }
  if (kind === 'relationships') {
    return typeof item.relationshipId === 'string' && item.relationshipId.length > 0
      ? item.relationshipId : null;
  }
  return typeof item.mappingKey === 'string' && item.mappingKey.length > 0 ? item.mappingKey : null;
}

function validateDatasetRecord(kind: DatasetKind, item: Record<string, unknown>): boolean {
  if (kind === 'entities') {
    return getRecordKey(kind, item) !== null &&
      typeof item.entityType === 'string' &&
      typeof item.classificationSystemId === 'string' &&
      typeof item.canonicalNameFa === 'string' &&
      typeof item.identityAnchor === 'string' &&
      typeof item.identityAnchorType === 'string' &&
      typeof item.identityStatus === 'string' &&
      typeof item.verificationStatus === 'string' &&
      typeof item.lifecycleStatus === 'string' &&
      item.isSyntheticFixture !== true &&
      isRecord(item.identityRegistryEntry) &&
      item.identityRegistryEntry.geographicEntityId === item.geographicEntityId &&
      typeof item.identityRegistryEntry.identityAnchor === 'string' &&
      item.identityRegistryEntry.identityAnchor === item.identityAnchor &&
      typeof item.identityRegistryEntry.anchorType === 'string' &&
      typeof item.identityRegistryEntry.canonicalNameFa === 'string' &&
      typeof item.identityRegistryEntry.identityStatus === 'string' &&
      isPositiveInteger(item.identityRegistryEntry.issuedAtRegistryRevision) &&
      isNonNegativeInteger(item.identityRegistryEntry.issuedOrderIndex) &&
      isRecord(item.identityAnchorRecord) &&
      item.identityAnchorRecord.geographicEntityId === item.geographicEntityId &&
      item.identityAnchorRecord.identityAnchor === item.identityAnchor &&
      item.identityAnchorRecord.immutable === true &&
      item.identityAnchorRecord.anchorType === item.identityAnchorType &&
      item.identityAnchorRecord.entityType === item.entityType &&
      item.identityAnchorRecord.classificationSystemId === item.classificationSystemId &&
      isPositiveInteger(item.identityAnchorRecord.issuedAtRegistryRevision) &&
      (item.parentGeographicEntityId === null || typeof item.parentGeographicEntityId === 'string') &&
      (item.provinceGeographicEntityId === null || typeof item.provinceGeographicEntityId === 'string');
  }
  if (kind === 'relationships') {
    return getRecordKey(kind, item) !== null &&
      typeof item.sourceGeographicEntityId === 'string' && CANONICAL_ID_RE.test(item.sourceGeographicEntityId) &&
      typeof item.targetGeographicEntityId === 'string' && CANONICAL_ID_RE.test(item.targetGeographicEntityId) &&
      typeof item.relationshipType === 'string' &&
      typeof item.classificationSystemId === 'string' &&
      typeof item.sourceDatasetId === 'string' &&
      typeof item.verificationStatus === 'string';
  }
  return getRecordKey(kind, item) !== null &&
    typeof item.identifierNamespaceCode === 'string' &&
    typeof item.classificationSystemId === 'string' &&
    typeof item.entityType === 'string' &&
    typeof item.sourceNativeId === 'string' &&
    typeof item.geographicEntityId === 'string' && CANONICAL_ID_RE.test(item.geographicEntityId) &&
    typeof item.sourceDatasetId === 'string' &&
    typeof item.resolutionOutcome === 'string' &&
    isPositiveInteger(item.committedAtRegistryRevision);
}

function jsonResponse(ctx: WorkerRequestContext, status: number, payload: unknown): Response {
  return jsonWorkerResponse(ctx, status, payload, { cacheControl: 'no-store' });
}

async function handlePublisherRequest(ctx: WorkerRequestContext): Promise<Response> {
  const parsed = await readSignedJsonBody(ctx);
  if (!parsed.ok) return parsed.response;
  const auth = await authenticatePublisher(ctx, parsed.raw);
  if (!auth.ok) return jsonResponse(ctx, auth.status, { status: 'error', code: auth.code });
  const db = ctx.env.NEIGHBORHOOD_DB;
  if (!db) return jsonResponse(ctx, 503, { status: 'error', code: 'IRNI_NEIGHBORHOOD_DATABASE_NOT_BOUND' });

  if (ctx.pathname.endsWith('/start')) {
    const manifest = getManifest(parsed.body);
    if (!manifest) return jsonResponse(ctx, 400, { status: 'error', code: 'IRNI_PUBLISH_MANIFEST_INVALID' });
    const current = await db.prepare('SELECT registry_revision, registry_checksum FROM geo_registry_head WHERE singleton_id = ?')
      .bind('current').first<{ registry_revision: number; registry_checksum: string }>();
    if (current && current.registry_revision === manifest.registryRevision && current.registry_checksum === manifest.registryChecksum) {
      return jsonResponse(ctx, 200, { status: 'ok', alreadyPublished: true, registryRevision: current.registry_revision });
    }
    if (current && manifest.registryRevision <= current.registry_revision) {
      return jsonResponse(ctx, 409, { status: 'error', code: 'IRNI_PUBLISH_REVISION_NOT_MONOTONIC', activeRevision: current.registry_revision });
    }
    const existing = await db.prepare('SELECT registry_checksum, status FROM geo_publish_batches WHERE batch_id = ?')
      .bind(manifest.batchId).first<{ registry_checksum: string; status: string }>();
    if (existing) {
      if (existing.registry_checksum !== manifest.registryChecksum || existing.status !== 'RECEIVING') {
        return jsonResponse(ctx, 409, { status: 'error', code: 'IRNI_PUBLISH_BATCH_ID_CONFLICT' });
      }
      return jsonResponse(ctx, 200, { status: 'ok', resumed: true, batchId: manifest.batchId });
    }
    await db.prepare(
      `INSERT INTO geo_publish_batches (
        batch_id, registry_revision, registry_checksum, contract_version, id_algorithm_version,
        schema_version, expected_entities, expected_relationships, expected_source_mappings,
        artifact_checksums_json, status, created_at_iso, updated_at_iso
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVING', ?, ?)`,
    ).bind(
      manifest.batchId, manifest.registryRevision, manifest.registryChecksum, manifest.contractVersion,
      manifest.idAlgorithmVersion, manifest.schemaVersion, manifest.expectedCounts.entities,
      manifest.expectedCounts.relationships, manifest.expectedCounts.sourceMappings,
      JSON.stringify(manifest.artifactChecksums), new Date().toISOString(), new Date().toISOString(),
    ).run();
    return jsonResponse(ctx, 200, { status: 'ok', batchId: manifest.batchId, accepted: true });
  }

  if (ctx.pathname.endsWith('/batch')) {
    const batchId = parsed.body.batchId;
    const kind = parsed.body.datasetKind;
    const chunkIndex = parsed.body.chunkIndex;
    const items = parsed.body.items;
    if (
      typeof batchId !== 'string' || !/^[0-9a-f-]{36}$/i.test(batchId) ||
      !DATASET_KINDS.includes(kind as DatasetKind) ||
      !isNonNegativeInteger(chunkIndex) ||
      !Array.isArray(items) || items.length < 1 || items.length > 50 ||
      !items.every(isRecord)
    ) return jsonResponse(ctx, 400, { status: 'error', code: 'IRNI_PUBLISH_CHUNK_INVALID' });

    const batch = await db.prepare('SELECT status FROM geo_publish_batches WHERE batch_id = ?')
      .bind(batchId).first<{ status: string }>();
    if (!batch || batch.status !== 'RECEIVING') {
      return jsonResponse(ctx, 409, { status: 'error', code: 'IRNI_PUBLISH_BATCH_NOT_RECEIVING' });
    }
    const datasetKind = kind as DatasetKind;
    const keys = items.map((item) => getRecordKey(datasetKind, item));
    if (keys.some((key) => key === null) || !items.every((item) => validateDatasetRecord(datasetKind, item))) {
      return jsonResponse(ctx, 422, { status: 'error', code: 'IRNI_PUBLISH_RECORD_VALIDATION_FAILED' });
    }
    if (new Set(keys).size !== keys.length) {
      return jsonResponse(ctx, 422, { status: 'error', code: 'IRNI_PUBLISH_DUPLICATE_KEYS_IN_CHUNK' });
    }
    const chunkPayloadHash = await sha256Hex(JSON.stringify({ batchId, datasetKind, chunkIndex, items }));
    const priorChunk = await db.prepare(
      'SELECT payload_sha256 FROM geo_publish_chunks WHERE batch_id = ? AND dataset_kind = ? AND chunk_index = ?',
    ).bind(batchId, datasetKind, chunkIndex).first<{ payload_sha256: string }>();
    if (priorChunk) {
      if (priorChunk.payload_sha256 === chunkPayloadHash) {
        return jsonResponse(ctx, 200, { status: 'ok', idempotentReplay: true, recordCount: items.length });
      }
      return jsonResponse(ctx, 409, { status: 'error', code: 'IRNI_PUBLISH_CHUNK_CONFLICT' });
    }

    const statements: D1PreparedStatement[] = [];
    statements.push(db.prepare(
      'INSERT INTO geo_publish_chunks (batch_id, dataset_kind, chunk_index, payload_sha256, record_count, received_at_iso) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(batchId, datasetKind, chunkIndex, chunkPayloadHash, items.length, new Date().toISOString()));
    items.forEach((item, index) => {
      statements.push(db.prepare(
        'INSERT INTO geo_publish_staging_records (batch_id, dataset_kind, record_key, chunk_index, record_index, record_json) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind(batchId, datasetKind, keys[index], chunkIndex, index, JSON.stringify(item)));
    });
    const result = await db.batch(statements);
    if (result.some((entry) => !entry.success)) {
      return jsonResponse(ctx, 500, { status: 'error', code: 'IRNI_PUBLISH_CHUNK_PERSIST_FAILED' });
    }
    await db.prepare('UPDATE geo_publish_batches SET updated_at_iso = ? WHERE batch_id = ?')
      .bind(new Date().toISOString(), batchId).run();
    return jsonResponse(ctx, 200, { status: 'ok', batchId, datasetKind, chunkIndex, recordCount: items.length });
  }

  if (ctx.pathname.endsWith('/finalize')) {
    const batchId = parsed.body.batchId;
    if (typeof batchId !== 'string' || !/^[0-9a-f-]{36}$/i.test(batchId)) {
      return jsonResponse(ctx, 400, { status: 'error', code: 'IRNI_PUBLISH_FINALIZE_INVALID' });
    }
    const batch = await db.prepare('SELECT * FROM geo_publish_batches WHERE batch_id = ?')
      .bind(batchId).first<{
        batch_id: string; registry_revision: number; registry_checksum: string; contract_version: string;
        id_algorithm_version: string; schema_version: string; expected_entities: number;
        expected_relationships: number; expected_source_mappings: number; artifact_checksums_json: string; status: string;
      }>();
    if (!batch || batch.status !== 'RECEIVING') {
      return jsonResponse(ctx, 409, { status: 'error', code: 'IRNI_PUBLISH_BATCH_NOT_RECEIVING' });
    }
    const [entityCount, relationshipCount, mappingCount] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS count FROM geo_publish_staging_records WHERE batch_id = ? AND dataset_kind = ?').bind(batchId, 'entities').first<{ count: number }>(),
      db.prepare('SELECT COUNT(*) AS count FROM geo_publish_staging_records WHERE batch_id = ? AND dataset_kind = ?').bind(batchId, 'relationships').first<{ count: number }>(),
      db.prepare('SELECT COUNT(*) AS count FROM geo_publish_staging_records WHERE batch_id = ? AND dataset_kind = ?').bind(batchId, 'sourceMappings').first<{ count: number }>(),
    ]);
    if (
      Number(entityCount?.count || 0) !== batch.expected_entities ||
      Number(relationshipCount?.count || 0) !== batch.expected_relationships ||
      Number(mappingCount?.count || 0) !== batch.expected_source_mappings
    ) return jsonResponse(ctx, 409, { status: 'error', code: 'IRNI_PUBLISH_COUNTS_INCOMPLETE' });

    const [badRelationships, badMappings, badParents, syntheticCount, identityMismatch, distinctIdentityOrder] = await Promise.all([
      db.prepare(`SELECT COUNT(*) AS count FROM geo_publish_staging_records r
        WHERE r.batch_id = ? AND r.dataset_kind = 'relationships' AND (
          NOT EXISTS (SELECT 1 FROM geo_publish_staging_records e WHERE e.batch_id = r.batch_id AND e.dataset_kind = 'entities' AND json_extract(e.record_json, '$.geographicEntityId') = json_extract(r.record_json, '$.sourceGeographicEntityId')) OR
          NOT EXISTS (SELECT 1 FROM geo_publish_staging_records e WHERE e.batch_id = r.batch_id AND e.dataset_kind = 'entities' AND json_extract(e.record_json, '$.geographicEntityId') = json_extract(r.record_json, '$.targetGeographicEntityId'))
        )`).bind(batchId).first<{ count: number }>(),
      db.prepare(`SELECT COUNT(*) AS count FROM geo_publish_staging_records m
        WHERE m.batch_id = ? AND m.dataset_kind = 'sourceMappings' AND NOT EXISTS (
          SELECT 1 FROM geo_publish_staging_records e WHERE e.batch_id = m.batch_id AND e.dataset_kind = 'entities'
          AND json_extract(e.record_json, '$.geographicEntityId') = json_extract(m.record_json, '$.geographicEntityId')
        )`).bind(batchId).first<{ count: number }>(),
      db.prepare(`SELECT COUNT(*) AS count FROM geo_publish_staging_records e
        WHERE e.batch_id = ? AND e.dataset_kind = 'entities'
        AND json_extract(e.record_json, '$.parentGeographicEntityId') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM geo_publish_staging_records p WHERE p.batch_id = e.batch_id AND p.dataset_kind = 'entities'
          AND json_extract(p.record_json, '$.geographicEntityId') = json_extract(e.record_json, '$.parentGeographicEntityId'))`).bind(batchId).first<{ count: number }>(),
      db.prepare(`SELECT COUNT(*) AS count FROM geo_publish_staging_records e
        WHERE e.batch_id = ? AND e.dataset_kind = 'entities' AND json_extract(e.record_json, '$.isSyntheticFixture') = 1`).bind(batchId).first<{ count: number }>(),
      db.prepare(`SELECT COUNT(*) AS count FROM geo_publish_staging_records e
        WHERE e.batch_id = ? AND e.dataset_kind = 'entities' AND (
          json_extract(e.record_json, '$.identityRegistryEntry.geographicEntityId') != json_extract(e.record_json, '$.geographicEntityId') OR
          json_extract(e.record_json, '$.identityAnchorRecord.geographicEntityId') != json_extract(e.record_json, '$.geographicEntityId') OR
          json_extract(e.record_json, '$.identityRegistryEntry.identityAnchor') != json_extract(e.record_json, '$.identityAnchor') OR
          json_extract(e.record_json, '$.identityAnchorRecord.identityAnchor') != json_extract(e.record_json, '$.identityAnchor')
        )`).bind(batchId).first<{ count: number }>(),
      db.prepare(`SELECT COUNT(DISTINCT json_extract(record_json, '$.identityRegistryEntry.issuedOrderIndex')) AS count
        FROM geo_publish_staging_records WHERE batch_id = ? AND dataset_kind = 'entities'`).bind(batchId).first<{ count: number }>(),
    ]);
    if (Number(badRelationships?.count || 0) > 0 || Number(badMappings?.count || 0) > 0 ||
        Number(badParents?.count || 0) > 0 || Number(syntheticCount?.count || 0) > 0 ||
        Number(identityMismatch?.count || 0) > 0 || Number(distinctIdentityOrder?.count || 0) !== batch.expected_entities) {
      return jsonResponse(ctx, 422, {
        status: 'error', code: 'IRNI_PUBLISH_REFERENTIAL_INTEGRITY_FAILED',
        badRelationships: Number(badRelationships?.count || 0), badMappings: Number(badMappings?.count || 0),
        badParents: Number(badParents?.count || 0), syntheticRecords: Number(syntheticCount?.count || 0),
        identityMismatches: Number(identityMismatch?.count || 0),
        distinctIdentityOrderValues: Number(distinctIdentityOrder?.count || 0),
      });
    }

    const oldHead = await db.prepare('SELECT registry_revision FROM geo_registry_head WHERE singleton_id = ?')
      .bind('current').first<{ registry_revision: number }>();
    if (oldHead && batch.registry_revision <= oldHead.registry_revision) {
      return jsonResponse(ctx, 409, { status: 'error', code: 'IRNI_PUBLISH_REVISION_CHANGED_DURING_UPLOAD' });
    }
    const artifactChecksums = JSON.parse(batch.artifact_checksums_json) as PublishManifest['artifactChecksums'];
    if (!isRecord(parsed.body.artifactChecksums) ||
      parsed.body.artifactChecksums.snapshot !== artifactChecksums.snapshot ||
      parsed.body.artifactChecksums.relationships !== artifactChecksums.relationships ||
      parsed.body.artifactChecksums.sourceMappings !== artifactChecksums.sourceMappings ||
      parsed.body.artifactChecksums.identityRegistry !== artifactChecksums.identityRegistry ||
      parsed.body.artifactChecksums.identityAnchors !== artifactChecksums.identityAnchors ||
      parsed.body.artifactChecksums.legacyAliases !== artifactChecksums.legacyAliases) {
      return jsonResponse(ctx, 409, { status: 'error', code: 'IRNI_PUBLISH_ARTIFACT_CHECKSUM_MISMATCH' });
    }

    const importedAt = new Date().toISOString();
    const aliasCount = await db.prepare('SELECT COUNT(*) AS count FROM geo_legacy_aliases')
      .first<{ count: number }>();
    const statements: D1PreparedStatement[] = [
      db.prepare('DELETE FROM geo_canonical_entities'),
      db.prepare(`INSERT INTO geo_canonical_entities (
        geographic_entity_id, entity_type, classification_system_id, canonical_name_fa,
        parent_geographic_entity_id, province_geographic_entity_id, identity_status,
        verification_status, lifecycle_status, is_synthetic_fixture, entity_json
      ) SELECT json_extract(record_json, '$.geographicEntityId'), json_extract(record_json, '$.entityType'),
        json_extract(record_json, '$.classificationSystemId'), json_extract(record_json, '$.canonicalNameFa'),
        json_extract(record_json, '$.parentGeographicEntityId'), json_extract(record_json, '$.provinceGeographicEntityId'),
        json_extract(record_json, '$.identityStatus'), json_extract(record_json, '$.verificationStatus'),
        json_extract(record_json, '$.lifecycleStatus'), CASE WHEN json_extract(record_json, '$.isSyntheticFixture') = 1 THEN 1 ELSE 0 END,
        json_remove(record_json, '$.identityRegistryEntry', '$.identityAnchorRecord')
      FROM geo_publish_staging_records WHERE batch_id = ? AND dataset_kind = 'entities'`).bind(batchId),
      db.prepare('DELETE FROM geo_identity_anchors'),
      db.prepare(`INSERT INTO geo_identity_anchors (
        identity_anchor, geographic_entity_id, anchor_type, entity_type, classification_system_id,
        fallback_token, issued_at_registry_revision, immutable, anchor_json
      ) SELECT json_extract(record_json, '$.identityAnchorRecord.identityAnchor'), json_extract(record_json, '$.geographicEntityId'),
        json_extract(record_json, '$.identityAnchorRecord.anchorType'), json_extract(record_json, '$.identityAnchorRecord.entityType'),
        json_extract(record_json, '$.identityAnchorRecord.classificationSystemId'), json_extract(record_json, '$.identityAnchorRecord.fallbackToken'),
        json_extract(record_json, '$.identityAnchorRecord.issuedAtRegistryRevision'),
        CASE WHEN json_extract(record_json, '$.identityAnchorRecord.immutable') = 1 THEN 1 ELSE 0 END,
        json_extract(record_json, '$.identityAnchorRecord') FROM geo_publish_staging_records WHERE batch_id = ? AND dataset_kind = 'entities'`).bind(batchId),
      db.prepare('DELETE FROM geo_identity_registry_entries'),
      db.prepare(`INSERT INTO geo_identity_registry_entries (
        geographic_entity_id, identity_anchor, anchor_type, entity_type, classification_system_id,
        canonical_name_fa, identity_status, issued_at_registry_revision, issued_order_index,
        surviving_geographic_entity_id, retired_reason, retired_at_registry_revision, entry_json
      ) SELECT json_extract(record_json, '$.identityRegistryEntry.geographicEntityId'), json_extract(record_json, '$.identityRegistryEntry.identityAnchor'),
        json_extract(record_json, '$.identityRegistryEntry.anchorType'), json_extract(record_json, '$.identityRegistryEntry.entityType'),
        json_extract(record_json, '$.identityRegistryEntry.classificationSystemId'), json_extract(record_json, '$.identityRegistryEntry.canonicalNameFa'),
        json_extract(record_json, '$.identityRegistryEntry.identityStatus'), json_extract(record_json, '$.identityRegistryEntry.issuedAtRegistryRevision'),
        json_extract(record_json, '$.identityRegistryEntry.issuedOrderIndex'),
        json_extract(record_json, '$.identityRegistryEntry.survivingGeographicEntityId'),
        json_extract(record_json, '$.identityRegistryEntry.retiredReason'),
        json_extract(record_json, '$.identityRegistryEntry.retiredAtRegistryRevision'),
        json_extract(record_json, '$.identityRegistryEntry')
      FROM geo_publish_staging_records WHERE batch_id = ? AND dataset_kind = 'entities'`).bind(batchId),
      db.prepare('DELETE FROM geo_relationships'),
      db.prepare(`INSERT INTO geo_relationships (
        relationship_id, source_geographic_entity_id, target_geographic_entity_id, relationship_type,
        classification_system_id, source_dataset_id, verification_status, relationship_json
      ) SELECT json_extract(record_json, '$.relationshipId'), json_extract(record_json, '$.sourceGeographicEntityId'),
        json_extract(record_json, '$.targetGeographicEntityId'), json_extract(record_json, '$.relationshipType'),
        json_extract(record_json, '$.classificationSystemId'), json_extract(record_json, '$.sourceDatasetId'),
        json_extract(record_json, '$.verificationStatus'), record_json
      FROM geo_publish_staging_records WHERE batch_id = ? AND dataset_kind = 'relationships'`).bind(batchId),
      db.prepare('DELETE FROM geo_source_mappings'),
      db.prepare(`INSERT INTO geo_source_mappings (
        mapping_key, identifier_namespace_code, classification_system_id, entity_type, source_native_id,
        geographic_entity_id, source_dataset_id, resolution_outcome, committed_at_registry_revision, mapping_json
      ) SELECT json_extract(record_json, '$.mappingKey'), json_extract(record_json, '$.identifierNamespaceCode'),
        json_extract(record_json, '$.classificationSystemId'), json_extract(record_json, '$.entityType'),
        json_extract(record_json, '$.sourceNativeId'), json_extract(record_json, '$.geographicEntityId'),
        json_extract(record_json, '$.sourceDatasetId'), json_extract(record_json, '$.resolutionOutcome'),
        json_extract(record_json, '$.committedAtRegistryRevision'), record_json
      FROM geo_publish_staging_records WHERE batch_id = ? AND dataset_kind = 'sourceMappings'`).bind(batchId),
      db.prepare(`INSERT OR REPLACE INTO geo_registry_head (
        singleton_id, contract_version, id_algorithm_version, schema_version, registry_revision,
        previous_registry_revision, registry_checksum, canonical_entry_count, canonical_entity_count,
        relationship_count, anchor_count, source_mapping_count, legacy_alias_count, duplicate_conflict_count,
        integrity_verified, imported_at_iso
      ) VALUES ('current', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`).bind(
        batch.contract_version, batch.id_algorithm_version, batch.schema_version, batch.registry_revision,
        oldHead?.registry_revision ?? null, batch.registry_checksum, batch.expected_entities,
        batch.expected_entities, batch.expected_relationships, batch.expected_entities,
        batch.expected_source_mappings, Number(aliasCount?.count || 0), importedAt,
      ),
      db.prepare(`INSERT OR REPLACE INTO geo_registry_imports (artifact_path, artifact_sha256, record_count, registry_revision, imported_at_iso)
        VALUES (?, ?, ?, ?, ?)`).bind(
        'public/data/geography/national-registry-snapshot.json', artifactChecksums.snapshot, batch.expected_entities, batch.registry_revision, importedAt,
      ),
      db.prepare(`INSERT OR REPLACE INTO geo_registry_imports (artifact_path, artifact_sha256, record_count, registry_revision, imported_at_iso)
        VALUES (?, ?, ?, ?, ?)`).bind(
        'data/geography/normalized/geographic-relationships.json', artifactChecksums.relationships, batch.expected_relationships, batch.registry_revision, importedAt,
      ),
      db.prepare(`INSERT OR REPLACE INTO geo_registry_imports (artifact_path, artifact_sha256, record_count, registry_revision, imported_at_iso)
        VALUES (?, ?, ?, ?, ?)`).bind(
        'data/geography/identity/GEOGRAPHIC-SOURCE-ID-MAPPINGS.json', artifactChecksums.sourceMappings, batch.expected_source_mappings, batch.registry_revision, importedAt,
      ),
      db.prepare(`INSERT OR REPLACE INTO geo_registry_imports (artifact_path, artifact_sha256, record_count, registry_revision, imported_at_iso)
        VALUES (?, ?, ?, ?, ?)`).bind(
        'data/geography/identity/GEOGRAPHIC-CANONICAL-ID-REGISTRY.json', artifactChecksums.identityRegistry, batch.expected_entities, batch.registry_revision, importedAt,
      ),
      db.prepare(`INSERT OR REPLACE INTO geo_registry_imports (artifact_path, artifact_sha256, record_count, registry_revision, imported_at_iso)
        VALUES (?, ?, ?, ?, ?)`).bind(
        'data/geography/identity/GEOGRAPHIC-IDENTITY-ANCHOR-REGISTER.json', artifactChecksums.identityAnchors, batch.expected_entities, batch.registry_revision, importedAt,
      ),
      db.prepare(`INSERT OR REPLACE INTO geo_registry_imports (artifact_path, artifact_sha256, record_count, registry_revision, imported_at_iso)
        VALUES (?, ?, ?, ?, ?)`).bind(
        'data/geography/identity/GEOGRAPHIC-LEGACY-ID-ALIASES.json', artifactChecksums.legacyAliases, 0, batch.registry_revision, importedAt,
      ),
      db.prepare(`UPDATE geo_publish_batches SET status = 'PUBLISHED', updated_at_iso = ? WHERE batch_id = ?`).bind(importedAt, batchId),
      db.prepare('DELETE FROM geo_publish_staging_records WHERE batch_id = ?').bind(batchId),
      db.prepare('DELETE FROM geo_publish_chunks WHERE batch_id = ?').bind(batchId),
    ];
    const applied = await db.batch(statements);
    if (applied.some((entry) => !entry.success)) {
      return jsonResponse(ctx, 500, { status: 'error', code: 'IRNI_PUBLISH_ATOMIC_ACTIVATION_FAILED' });
    }
    const head = await db.prepare('SELECT registry_revision, registry_checksum, canonical_entity_count, relationship_count, source_mapping_count FROM geo_registry_head WHERE singleton_id = ?')
      .bind('current').first<Record<string, unknown>>();
    return jsonResponse(ctx, 200, { status: 'ok', published: true, head });
  }

  return jsonResponse(ctx, 404, { status: 'error', code: 'IRNI_PUBLISH_ROUTE_NOT_FOUND' });
}

async function handleCanonicalRead(ctx: WorkerRequestContext): Promise<Response | null> {
  const { pathname, method, url, env } = ctx;
  const prefix = '/api/v2/reference/geography';
  if (!pathname.startsWith(prefix)) return null;
  if (method !== 'GET') return jsonResponse(ctx, 405, { status: 'error', code: 'GEOGRAPHY_REFERENCE_READ_ONLY' });
  const db = env.NEIGHBORHOOD_DB;
  if (!db) return jsonResponse(ctx, 503, { status: 'error', code: 'IRNI_NEIGHBORHOOD_DATABASE_NOT_BOUND' });
  const head = await db.prepare('SELECT contract_version, id_algorithm_version, schema_version, registry_revision, registry_checksum, canonical_entity_count, relationship_count, source_mapping_count, integrity_verified, imported_at_iso FROM geo_registry_head WHERE singleton_id = ?')
    .bind('current').first<Record<string, unknown>>();
  if (!head || Number(head.integrity_verified) !== 1) {
    return jsonResponse(ctx, 503, { status: 'error', code: 'IRNI_REGISTRY_NOT_VERIFIED' });
  }
  if (pathname === prefix + '/metadata') {
    return jsonResponse(ctx, 200, { status: 'ok', registry: head });
  }
  const singlePrefix = prefix + '/entities/';
  if (pathname.startsWith(singlePrefix)) {
    const id = decodeURIComponent(pathname.slice(singlePrefix.length));
    if (!CANONICAL_ID_RE.test(id)) return jsonResponse(ctx, 400, { status: 'error', code: 'INVALID_CANONICAL_GEOGRAPHIC_ID' });
    const row = await db.prepare(`SELECT e.entity_json, i.entry_json, a.anchor_json
      FROM geo_canonical_entities e
      JOIN geo_identity_registry_entries i ON i.geographic_entity_id = e.geographic_entity_id
      JOIN geo_identity_anchors a ON a.geographic_entity_id = e.geographic_entity_id
      WHERE e.geographic_entity_id = ? AND e.lifecycle_status = ?`).bind(id, 'ACTIVE')
      .first<{ entity_json: string; entry_json: string; anchor_json: string }>();
    if (!row) return jsonResponse(ctx, 404, { status: 'error', code: 'GEOGRAPHIC_ENTITY_NOT_FOUND' });
    return jsonResponse(ctx, 200, {
      status: 'ok', registry: head,
      item: { entity: JSON.parse(row.entity_json), identityRegistryEntry: JSON.parse(row.entry_json), identityAnchor: JSON.parse(row.anchor_json) },
    });
  }
  if (pathname === prefix + '/entities') {
    const entityType = url.searchParams.get('entityType');
    const parentId = url.searchParams.get('parentGeographicEntityId');
    const provinceId = url.searchParams.get('provinceGeographicEntityId');
    const classification = url.searchParams.get('classificationSystemId');
    const limitRaw = Number(url.searchParams.get('limit') || 50);
    const offsetRaw = Number(url.searchParams.get('offset') || 0);
    if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 100 ||
      !Number.isInteger(offsetRaw) || offsetRaw < 0 || offsetRaw > 1_000_000) {
      return jsonResponse(ctx, 400, { status: 'error', code: 'INVALID_GEOGRAPHY_PAGINATION' });
    }
    const clauses: string[] = ['lifecycle_status = ?'];
    const params: unknown[] = ['ACTIVE'];
    if (entityType) { clauses.push('entity_type = ?'); params.push(entityType); }
    if (parentId) {
      if (!CANONICAL_ID_RE.test(parentId)) return jsonResponse(ctx, 400, { status: 'error', code: 'INVALID_PARENT_GEOGRAPHIC_ID' });
      clauses.push('parent_geographic_entity_id = ?'); params.push(parentId);
    }
    if (provinceId) {
      if (!CANONICAL_ID_RE.test(provinceId)) return jsonResponse(ctx, 400, { status: 'error', code: 'INVALID_PROVINCE_GEOGRAPHIC_ID' });
      clauses.push('province_geographic_entity_id = ?'); params.push(provinceId);
    }
    if (classification) { clauses.push('classification_system_id = ?'); params.push(classification); }
    const where = clauses.join(' AND ');
    const [rows, count] = await Promise.all([
      db.prepare(`SELECT e.entity_json, i.entry_json, a.anchor_json
        FROM geo_canonical_entities e
        JOIN geo_identity_registry_entries i ON i.geographic_entity_id = e.geographic_entity_id
        JOIN geo_identity_anchors a ON a.geographic_entity_id = e.geographic_entity_id
        WHERE ${where.replaceAll('lifecycle_status', 'e.lifecycle_status').replaceAll('entity_type', 'e.entity_type').replaceAll('parent_geographic_entity_id', 'e.parent_geographic_entity_id').replaceAll('province_geographic_entity_id', 'e.province_geographic_entity_id').replaceAll('classification_system_id', 'e.classification_system_id')}
        ORDER BY i.issued_order_index, e.geographic_entity_id LIMIT ? OFFSET ?`).bind(...params, limitRaw, offsetRaw)
        .all<{ entity_json: string; entry_json: string; anchor_json: string }>(), 
      db.prepare(`SELECT COUNT(*) AS count FROM geo_canonical_entities WHERE ${where}`)
        .bind(...params).first<{ count: number }>(),
    ]);
    const items = (rows.results || []).map((row) => ({
      entity: JSON.parse(row.entity_json),
      identityRegistryEntry: JSON.parse(row.entry_json),
      identityAnchor: JSON.parse(row.anchor_json),
    }));
    const totalItems = Number(count?.count || 0);
    return jsonResponse(ctx, 200, {
      status: 'ok', registry: head, items,
      pagination: { offset: offsetRaw, limit: limitRaw, totalItems, nextOffset: offsetRaw + items.length < totalItems ? offsetRaw + items.length : null },
    });
  }
  return jsonResponse(ctx, 404, { status: 'error', code: 'GEOGRAPHY_REFERENCE_ROUTE_NOT_FOUND' });
}

export async function handleIrniRegistryRoute(ctx: WorkerRequestContext): Promise<Response | null> {
  if (ctx.pathname.startsWith('/api/internal/geography/publish/')) {
    if (ctx.method !== 'POST') return jsonResponse(ctx, 405, { status: 'error', code: 'IRNI_PUBLISH_POST_ONLY' });
    return handlePublisherRequest(ctx);
  }
  return handleCanonicalRead(ctx);
}

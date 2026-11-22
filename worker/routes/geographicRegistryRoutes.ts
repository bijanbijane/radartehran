/**
 * IRNI geographic registry read API and signed, versioned publisher ingress.
 * IRNI remains the sole canonical identity authority. Radar exposes reads and accepts
 * writes only from the HMAC-authenticated publisher into NEIGHBORHOOD_DB.
 */
import { requireNeighborhoodDb } from '../db/bindingResolver';
import type { D1Database, WorkerRequestContext } from '../types';
import { jsonWorkerResponse } from '../contextAndSecurity';

const MAX_BODY_BYTES = 1_500_000;
const MAX_ITEMS_PER_CHUNK = 50;
const MAX_CLOCK_SKEW_SECONDS = 300;
type DatasetKind = 'entities' | 'relationships' | 'sourceMappings';
type ValidSignedPayload =
  | { ok: true; payload: Record<string, unknown>; nonce: string }
  | { ok: false; status: number; code: string };

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
function constantTimeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  let mismatch = 0;
  for (let index = 0; index < 64; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}
async function verifySignedPayload(request: Request, secret: string): Promise<ValidSignedPayload> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return { ok: false, status: 413, code: 'PUBLISH_BODY_TOO_LARGE' };
  }
  const timestamp = request.headers.get('x-irni-timestamp') || '';
  const nonce = request.headers.get('x-irni-nonce') || '';
  const signature = request.headers.get('x-irni-signature') || '';
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) ||
      Math.abs(Math.floor(Date.now() / 1000) - seconds) > MAX_CLOCK_SKEW_SECONDS) {
    return { ok: false, status: 401, code: 'PUBLISH_SIGNATURE_EXPIRED' };
  }
  if (!/^[A-Za-z0-9._-]{16,128}$/.test(nonce)) {
    return { ok: false, status: 401, code: 'PUBLISH_NONCE_INVALID' };
  }
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    const record = asRecord(parsed);
    if (!record) return { ok: false, status: 400, code: 'PUBLISH_JSON_INVALID' };
    payload = record;
  } catch {
    return { ok: false, status: 400, code: 'PUBLISH_JSON_INVALID' };
  }
  const bodyHash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const expected = toHex(await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(`${timestamp}\n${nonce}\n${bodyHash}`),
  ));
  if (!constantTimeHexEqual(signature, expected)) {
    return { ok: false, status: 401, code: 'PUBLISH_SIGNATURE_INVALID' };
  }
  return { ok: true, payload, nonce };
}
function ensureSuccess(result: { success: boolean }, operation: string): void {
  if (!result.success) throw new Error(`D1_${operation}_FAILED`);
}
async function getCurrentHead(db: D1Database): Promise<Record<string, unknown> | null> {
  return db.prepare('SELECT * FROM geo_registry_heads WHERE singleton = 1')
    .first<Record<string, unknown>>();
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

async function publishStart(
  ctx: WorkerRequestContext, db: D1Database, payload: Record<string, unknown>, nonce: string,
): Promise<Response> {
  const batchId = payload.batchId;
  const revision = payload.registryRevision;
  const checksum = payload.registryChecksum;
  const counts = asRecord(payload.expectedCounts);
  const contractVersion = payload.contractVersion;
  const idAlgorithmVersion = payload.idAlgorithmVersion;
  const schemaVersion = payload.schemaVersion;
  if (!isString(batchId, 80) || !Number.isSafeInteger(revision) || Number(revision) < 1 ||
      !isString(checksum, 128) || !counts ||
      !Number.isSafeInteger(counts.entities) || !Number.isSafeInteger(counts.relationships) ||
      !Number.isSafeInteger(counts.sourceMappings) ||
      !isString(contractVersion, 80) || !isString(idAlgorithmVersion, 80) ||
      !isString(schemaVersion, 40)) {
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
  const head = await getCurrentHead(db);
  if (head && Number(revision) < Number(head.registry_revision)) {
    return jsonWorkerResponse(ctx, 409, {
      status: 'error', code: 'PUBLISH_REVISION_ROLLBACK_BLOCKED',
      currentRevision: head.registry_revision, requestedRevision: revision,
    });
  }
  if (head && Number(revision) === Number(head.registry_revision) &&
      checksum !== head.registry_checksum) {
    return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'SAME_REVISION_CHECKSUM_CONFLICT' });
  }
  const now = new Date().toISOString();
  const insert = await db.prepare(
    `INSERT INTO geo_publish_batches
      (batch_id, registry_revision, registry_checksum, contract_version, id_algorithm_version,
       schema_version, expected_entities, expected_relationships, expected_source_mappings,
       status, created_at_iso)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'RECEIVING',?10)
     ON CONFLICT(batch_id) DO NOTHING`,
  ).bind(
    String(batchId), Number(revision), String(checksum), String(contractVersion),
    String(idAlgorithmVersion), String(schemaVersion), Number(counts.entities),
    Number(counts.relationships), Number(counts.sourceMappings), now,
  ).run();
  ensureSuccess(insert, 'PUBLISH_START');
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO geo_publish_nonces(nonce,expires_at_ms,recorded_at_iso) VALUES (?1,?2,?3)')
      .bind(nonce, Date.now() + 600_000, now),
    db.prepare('DELETE FROM geo_publish_nonces WHERE expires_at_ms < ?1').bind(Date.now()),
  ]);
  return jsonWorkerResponse(ctx, 202, {
    status: 'ok', batchId, registryRevision: revision, registryChecksum: checksum,
    expectedCounts: counts, currentRevision: head?.registry_revision ?? null,
  });
}

function buildEntityStatement(db: D1Database, revision: number, value: unknown) {
  const entity = asRecord(value);
  if (!entity || !isString(entity.geographicEntityId, 100) ||
      !isString(entity.entityType, 80) || !isString(entity.classificationSystemId, 120) ||
      !isString(entity.canonicalNameFa, 300) || !isString(entity.identityStatus, 60) ||
      !isString(entity.verificationStatus, 60) || !isString(entity.lifecycleStatus, 60) ||
      entity.isSyntheticFixture === true) throw new Error('PUBLISH_ENTITY_INVALID_OR_SYNTHETIC');
  return db.prepare(
    `INSERT INTO geo_entities
      (registry_revision,geographic_entity_id,entity_type,classification_system_id,canonical_name_fa,
       parent_geographic_entity_id,province_geographic_entity_id,identity_status,verification_status,
       lifecycle_status,is_synthetic_fixture,record_json)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,0,?11)
     ON CONFLICT(registry_revision,geographic_entity_id) DO UPDATE SET
       entity_type=excluded.entity_type, classification_system_id=excluded.classification_system_id,
       canonical_name_fa=excluded.canonical_name_fa, parent_geographic_entity_id=excluded.parent_geographic_entity_id,
       province_geographic_entity_id=excluded.province_geographic_entity_id, identity_status=excluded.identity_status,
       verification_status=excluded.verification_status, lifecycle_status=excluded.lifecycle_status,
       record_json=excluded.record_json`,
  ).bind(
    revision, String(entity.geographicEntityId), String(entity.entityType),
    String(entity.classificationSystemId), String(entity.canonicalNameFa),
    isString(entity.parentGeographicEntityId) ? entity.parentGeographicEntityId : null,
    isString(entity.provinceGeographicEntityId) ? entity.provinceGeographicEntityId : null,
    String(entity.identityStatus), String(entity.verificationStatus), String(entity.lifecycleStatus), jsonRecord(entity),
  );
}
function buildRelationshipStatement(db: D1Database, revision: number, value: unknown) {
  const item = asRecord(value);
  if (!item || !isString(item.relationshipId, 120) ||
      !isString(item.sourceGeographicEntityId, 100) || !isString(item.targetGeographicEntityId, 100) ||
      !isString(item.relationshipType, 80) || !isString(item.classificationSystemId, 120) ||
      !isString(item.sourceDatasetId, 120) || !isString(item.evidenceReference, 1000) ||
      !isString(item.verificationStatus, 60)) throw new Error('PUBLISH_RELATIONSHIP_INVALID');
  return db.prepare(
    `INSERT INTO geo_relationships
      (registry_revision,relationship_id,source_geographic_entity_id,target_geographic_entity_id,
       relationship_type,classification_system_id,source_dataset_id,evidence_reference,verification_status,record_json)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
     ON CONFLICT(registry_revision,relationship_id) DO UPDATE SET
       source_geographic_entity_id=excluded.source_geographic_entity_id,
       target_geographic_entity_id=excluded.target_geographic_entity_id,
       relationship_type=excluded.relationship_type, classification_system_id=excluded.classification_system_id,
       source_dataset_id=excluded.source_dataset_id, evidence_reference=excluded.evidence_reference,
       verification_status=excluded.verification_status, record_json=excluded.record_json`,
  ).bind(
    revision, String(item.relationshipId), String(item.sourceGeographicEntityId), String(item.targetGeographicEntityId),
    String(item.relationshipType), String(item.classificationSystemId), String(item.sourceDatasetId),
    String(item.evidenceReference), String(item.verificationStatus), jsonRecord(item),
  );
}
function buildMappingStatement(db: D1Database, revision: number, value: unknown) {
  const item = asRecord(value);
  if (!item || !isString(item.mappingKey, 500) || !isString(item.identifierNamespaceCode, 120) ||
      !isString(item.classificationSystemId, 120) || !isString(item.entityType, 80) ||
      !isString(item.sourceNativeId, 200) || !isString(item.geographicEntityId, 100) ||
      !isString(item.sourceDatasetId, 120) || !isString(item.resolutionOutcome, 80)) {
    throw new Error('PUBLISH_SOURCE_MAPPING_INVALID');
  }
  return db.prepare(
    `INSERT INTO geo_source_mappings
      (registry_revision,mapping_key,identifier_namespace_code,classification_system_id,entity_type,
       source_native_id,geographic_entity_id,source_dataset_id,resolution_outcome,record_json)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
     ON CONFLICT(registry_revision,mapping_key) DO UPDATE SET
       identifier_namespace_code=excluded.identifier_namespace_code,
       classification_system_id=excluded.classification_system_id, entity_type=excluded.entity_type,
       source_native_id=excluded.source_native_id, geographic_entity_id=excluded.geographic_entity_id,
       source_dataset_id=excluded.source_dataset_id, resolution_outcome=excluded.resolution_outcome,
       record_json=excluded.record_json`,
  ).bind(
    revision, String(item.mappingKey), String(item.identifierNamespaceCode), String(item.classificationSystemId),
    String(item.entityType), String(item.sourceNativeId), String(item.geographicEntityId),
    String(item.sourceDatasetId), String(item.resolutionOutcome), jsonRecord(item),
  );
}
async function publishBatch(
  ctx: WorkerRequestContext, db: D1Database, payload: Record<string, unknown>, nonce: string,
): Promise<Response> {
  const batchId = payload.batchId;
  const kind = payload.datasetKind as DatasetKind;
  const chunkIndex = payload.chunkIndex;
  const items = payload.items;
  if (!isString(batchId, 80) || !['entities','relationships','sourceMappings'].includes(kind) ||
      !Number.isSafeInteger(chunkIndex) || Number(chunkIndex) < 0 ||
      !Array.isArray(items) || items.length < 1 || items.length > MAX_ITEMS_PER_CHUNK) {
    return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'PUBLISH_CHUNK_INVALID' });
  }
  const batch = await db.prepare(
    'SELECT registry_revision,status FROM geo_publish_batches WHERE batch_id = ?1',
  ).bind(batchId).first<{registry_revision:number;status:string}>();
  if (!batch || batch.status !== 'RECEIVING') {
    return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'PUBLISH_BATCH_NOT_OPEN' });
  }
  try {
    const revision = Number(batch.registry_revision);
    const statements = [
      db.prepare('INSERT OR IGNORE INTO geo_publish_nonces(nonce,expires_at_ms,recorded_at_iso) VALUES (?1,?2,?3)')
        .bind(nonce, Date.now() + 600_000, new Date().toISOString()),
      db.prepare(
        'INSERT OR IGNORE INTO geo_publish_chunks(batch_id,dataset_kind,chunk_index,record_count,created_at_iso) VALUES (?1,?2,?3,?4,?5)',
      ).bind(String(batchId), kind, Number(chunkIndex), items.length, new Date().toISOString()),
      ...items.map((item) => kind === 'entities'
        ? buildEntityStatement(db, revision, item)
        : kind === 'relationships'
          ? buildRelationshipStatement(db, revision, item)
          : buildMappingStatement(db, revision, item)),
    ];
    const results = await db.batch(statements);
    if (results.some((result) => !result.success)) throw new Error('D1_PUBLISH_BATCH_FAILED');
    return jsonWorkerResponse(ctx, 202, {
      status: 'ok', batchId, datasetKind: kind, chunkIndex, receivedCount: items.length,
    });
  } catch (error) {
    return jsonWorkerResponse(ctx, 400, {
      status: 'error',
      code: error instanceof Error ? error.message : 'PUBLISH_BATCH_FAILED',
    });
  }
}
async function publishFinalize(
  ctx: WorkerRequestContext, db: D1Database, payload: Record<string, unknown>, nonce: string,
): Promise<Response> {
  const batchId = payload.batchId;
  if (!isString(batchId, 80)) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'PUBLISH_BATCH_ID_REQUIRED' });
  const batch = await db.prepare('SELECT * FROM geo_publish_batches WHERE batch_id = ?1')
    .bind(batchId).first<Record<string, unknown>>();
  if (!batch) return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'PUBLISH_BATCH_NOT_FOUND' });
  if (batch.status === 'COMPLETED') {
    return jsonWorkerResponse(ctx, 200, { status: 'ok', alreadyPublished: true, registryRevision: batch.registry_revision });
  }
  const revision = Number(batch.registry_revision);
  const [entityCount, relationshipCount, mappingCount] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS count FROM geo_entities WHERE registry_revision = ?1')
      .bind(revision).first<{count:number}>(),
    db.prepare('SELECT COUNT(*) AS count FROM geo_relationships WHERE registry_revision = ?1')
      .bind(revision).first<{count:number}>(),
    db.prepare('SELECT COUNT(*) AS count FROM geo_source_mappings WHERE registry_revision = ?1')
      .bind(revision).first<{count:number}>(),
  ]);
  const actual = {
    entities: Number(entityCount?.count ?? 0),
    relationships: Number(relationshipCount?.count ?? 0),
    sourceMappings: Number(mappingCount?.count ?? 0),
  };
  const expected = {
    entities: Number(batch.expected_entities),
    relationships: Number(batch.expected_relationships),
    sourceMappings: Number(batch.expected_source_mappings),
  };
  if (actual.entities !== expected.entities || actual.relationships !== expected.relationships ||
      actual.sourceMappings !== expected.sourceMappings) {
    return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'PUBLISH_COUNTS_MISMATCH', expected, actual });
  }
  const now = new Date().toISOString();
  const statements = [
    db.prepare(
      `INSERT INTO geo_registry_heads
       (singleton,registry_revision,registry_checksum,contract_version,id_algorithm_version,schema_version,
        total_entities,total_relationships,total_source_mappings,published_at_iso)
       VALUES (1,?1,?2,?3,?4,?5,?6,?7,?8,?9)
       ON CONFLICT(singleton) DO UPDATE SET
         registry_revision=excluded.registry_revision, registry_checksum=excluded.registry_checksum,
         contract_version=excluded.contract_version, id_algorithm_version=excluded.id_algorithm_version,
         schema_version=excluded.schema_version, total_entities=excluded.total_entities,
         total_relationships=excluded.total_relationships, total_source_mappings=excluded.total_source_mappings,
         published_at_iso=excluded.published_at_iso
       WHERE excluded.registry_revision > geo_registry_heads.registry_revision
          OR (excluded.registry_revision = geo_registry_heads.registry_revision
              AND excluded.registry_checksum = geo_registry_heads.registry_checksum)`,
    ).bind(
      revision, String(batch.registry_checksum), String(batch.contract_version),
      String(batch.id_algorithm_version), String(batch.schema_version),
      actual.entities, actual.relationships, actual.sourceMappings, now,
    ),
    db.prepare('UPDATE geo_publish_batches SET status = ?1, completed_at_iso = ?2 WHERE batch_id = ?3')
      .bind('COMPLETED', now, batchId),
    db.prepare('INSERT OR IGNORE INTO geo_publish_nonces(nonce,expires_at_ms,recorded_at_iso) VALUES (?1,?2,?3)')
      .bind(nonce, Date.now() + 600_000, now),
  ];
  const results = await db.batch(statements);
  if (results.some((result) => !result.success)) {
    return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'PUBLISH_COMMIT_FAILED' });
  }
  const head = await getCurrentHead(db);
  return jsonWorkerResponse(ctx, 200, { status: 'ok', published: true, head });
}
async function handlePublisherRoute(ctx: WorkerRequestContext, db: D1Database): Promise<Response | null> {
  const path = ctx.pathname;
  if (![
    '/api/internal/geography/publish/start',
    '/api/internal/geography/publish/batch',
    '/api/internal/geography/publish/finalize',
  ].includes(path)) return null;
  if (ctx.method !== 'POST') return jsonWorkerResponse(ctx, 405, { status: 'error', code: 'METHOD_NOT_ALLOWED' });
  const secret = String(ctx.env.IRNI_PUBLISH_HMAC_SECRET || '');
  if (secret.length < 32) {
    return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'IRNI_PUBLISH_SECRET_NOT_CONFIGURED' });
  }
  const signed = await verifySignedPayload(ctx.request, secret);
  if (!signed.ok) return jsonWorkerResponse(ctx, signed.status, { status: 'error', code: signed.code });
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
  if (pathname === '/api/v1/geography/registry') {
    return jsonWorkerResponse(ctx, 200, { status: 'ok', registry: head });
  }

  if (pathname === '/api/v1/geography/entities' || pathname === '/api/v1/geography/neighborhoods') {
    const limit = normalizeLimit(url.searchParams.get('limit'));
    const offset = normalizeOffset(url.searchParams.get('offset'));
    const clauses = ['registry_revision = ?1', "lifecycle_status = 'ACTIVE'"];
    const params: unknown[] = [revision];
    const addClause = (sql: string, value: unknown) => {
      params.push(value);
      clauses.push(sql.replace('?', `?${params.length}`));
    };
    if (pathname.endsWith('/neighborhoods')) {
      clauses.push("entity_type IN ('URBAN_NEIGHBORHOOD','URBAN_ZONE')");
    } else if (url.searchParams.has('entityType')) {
      const entityType = String(url.searchParams.get('entityType') || '').trim();
      if (!/^[A-Z_]{2,64}$/.test(entityType)) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_ENTITY_TYPE' });
      addClause('entity_type = ?', entityType);
    }
    const provinceId = url.searchParams.get('provinceId');
    if (provinceId) addClause('province_geographic_entity_id = ?', provinceId);
    const parentId = url.searchParams.get('parentId');
    if (parentId) addClause('parent_geographic_entity_id = ?', parentId);
    const query = url.searchParams.get('q');
    if (query) addClause('canonical_name_fa LIKE ?', `%${query.slice(0,80)}%`);
    params.push(limit, offset);
    const sql = `SELECT geographic_entity_id,entity_type,classification_system_id,canonical_name_fa,
      parent_geographic_entity_id,province_geographic_entity_id,identity_status,verification_status,
      lifecycle_status,record_json FROM geo_entities WHERE ${clauses.join(' AND ')}
      ORDER BY canonical_name_fa, geographic_entity_id LIMIT ?${params.length - 1} OFFSET ?${params.length}`;
    const rows = await db.prepare(sql).bind(...params).all<Record<string, unknown>>();
    if (!rows.success) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'GEOGRAPHIC_QUERY_FAILED' });
    const items = rows.results.map((row) => {
      try { return JSON.parse(String(row.record_json)); } catch { return row; }
    });
    return jsonWorkerResponse(ctx, 200, {
      status: 'ok', registryRevision: revision, items,
      pagination: { limit, offset, nextOffset: items.length === limit ? offset + limit : null },
      source: 'IRNI_CANONICAL_REGISTRY',
    });
  }

  const match = pathname.match(/^\/api\/v1\/geography\/entities\/([^/]+)(?:\/relationships)?$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (pathname.endsWith('/relationships')) {
      const rows = await db.prepare(
        'SELECT record_json FROM geo_relationships WHERE registry_revision = ?1 AND (source_geographic_entity_id = ?2 OR target_geographic_entity_id = ?2) ORDER BY relationship_id',
      ).bind(revision, id).all<{record_json:string}>();
      if (!rows.success) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'GEOGRAPHIC_RELATIONSHIP_QUERY_FAILED' });
      return jsonWorkerResponse(ctx, 200, {
        status: 'ok', registryRevision: revision, items: rows.results.map((row) => JSON.parse(row.record_json)),
      });
    }
    const row = await db.prepare(
      'SELECT record_json FROM geo_entities WHERE registry_revision = ?1 AND geographic_entity_id = ?2',
    ).bind(revision, id).first<{record_json:string}>();
    if (!row) return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'GEOGRAPHIC_ENTITY_NOT_FOUND' });
    return jsonWorkerResponse(ctx, 200, {
      status: 'ok', registryRevision: revision, item: JSON.parse(row.record_json),
    });
  }
  return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'GEOGRAPHY_ROUTE_NOT_FOUND' });
}

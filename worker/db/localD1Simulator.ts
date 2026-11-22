/**
 * @file worker/db/localD1Simulator.ts
 * @description Worker-safe in-memory Cloudflare D1 simulator supporting canonical SQL statements
 * across migrations 0001, 0002, and 0003 (projections, watermarks, upload sessions/chunks,
 * legal holds, strong rate limits, queue idempotency & leases, media_objects, and auth revocation audit).
 */
import type { D1Database, D1PreparedStatement } from '../types';
import type {
  D1AuthRevocationEventRecord,
  D1MediaObjectRecord,
  D1QueueJobExecutionRecord,
  D1UploadSessionRecord,
  NeighborhoodProjectionRow,
} from './d1SchemaAndMigrations';

export function createLocalD1DatabaseSimulator(): D1Database {
  const d1Migrations = new Map<string, { id: number; name: string; applied_at: string }>();
  const hoodProjections = new Map<string, NeighborhoodProjectionRow>();
  const watermarks = new Map<string, { watermark_key: string; watermark_value: string; updated_at_iso: string }>();
  const uploadSessions = new Map<string, D1UploadSessionRecord>();
  const uploadChunks = new Map<string, { session_id: string; chunk_index: number; chunk_base64: string; byte_length: number }>();
  const legalHolds = new Map<string, { resource_id: string; resource_type: string; reason: string; active: number }>();
  const rateLimits = new Map<string, { bucket_key: string; counter: number; window_reset_ms: number }>();
  const queueKeys = new Map<string, { idempotency_key: string; job_type: string; processed_at_iso: string; status: string }>();
  const mediaObjects = new Map<string, D1MediaObjectRecord>();
  const queueExecutions = new Map<string, D1QueueJobExecutionRecord>();
  const authRevocations = new Map<string, D1AuthRevocationEventRecord>();

  const makeStatement = (sql: string, boundValues: unknown[] = []): D1PreparedStatement => ({
    bind(...values: unknown[]) {
      return makeStatement(sql, values);
    },
    async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      let row: Record<string, unknown> | null = null;

      if (normalized.startsWith('SELECT id, name, applied_at FROM d1_migrations WHERE name')) {
        row = (d1Migrations.get(String(boundValues[0])) as unknown as Record<string, unknown>) ?? null;
      } else if (normalized.startsWith('SELECT watermark_value FROM sync_watermarks')) {
        row = (watermarks.get(String(boundValues[0])) as unknown as Record<string, unknown>) ?? null;
      } else if (normalized.startsWith('SELECT * FROM upload_sessions WHERE session_id')) {
        row = (uploadSessions.get(String(boundValues[0])) as unknown as Record<string, unknown>) ?? null;
      } else if (/^SELECT COUNT\(\*\) AS cnt FROM upload_sessions WHERE completed = 0 AND created_at_ms >=/i.test(normalized)) {
        const cutoff = Number(boundValues[0]);
        const cnt = Array.from(uploadSessions.values()).filter((s) => s.completed === 0 && s.created_at_ms >= cutoff).length;
        row = { cnt };
      } else if (/^SELECT COUNT\(\*\) AS cnt FROM upload_sessions WHERE owner_uid = \?1 AND completed = 0 AND created_at_ms >=/i.test(normalized)) {
        const owner = String(boundValues[0]);
        const cutoff = Number(boundValues[1]);
        const cnt = Array.from(uploadSessions.values()).filter((s) => s.owner_uid === owner && s.completed === 0 && s.created_at_ms >= cutoff).length;
        row = { cnt };
      } else if (/^SELECT COUNT\(\*\) AS cnt FROM upload_sessions WHERE owner_uid = \?1 AND completed = 0$/i.test(normalized)) {
        const owner = String(boundValues[0]);
        const cnt = Array.from(uploadSessions.values()).filter((s) => s.owner_uid === owner && s.completed === 0).length;
        row = { cnt };
      } else if (/^SELECT COUNT\(\*\) AS cnt FROM upload_sessions WHERE completed = 0$/i.test(normalized)) {
        const cnt = Array.from(uploadSessions.values()).filter((s) => s.completed === 0).length;
        row = { cnt };
      } else if (normalized.startsWith('SELECT chunk_index, chunk_base64, byte_length FROM upload_session_chunks WHERE session_id = ?1 AND chunk_index = ?2')) {
        const existing = uploadChunks.get(`${String(boundValues[0])}:${Number(boundValues[1])}`);
        row = existing ? { ...existing } : null;
      } else if (normalized.startsWith('SELECT chunk_index, byte_length FROM upload_session_chunks WHERE session_id = ?1 AND chunk_index = ?2')) {
        const existing = uploadChunks.get(`${String(boundValues[0])}:${Number(boundValues[1])}`);
        row = existing ? { chunk_index: existing.chunk_index, byte_length: existing.byte_length } : null;
      } else if (normalized.startsWith('SELECT active, reason FROM legal_holds')) {
        row = (legalHolds.get(String(boundValues[0])) as unknown as Record<string, unknown>) ?? null;
      } else if (normalized.startsWith('SELECT counter, window_reset_ms FROM strong_rate_limits')) {
        row = (rateLimits.get(String(boundValues[0])) as unknown as Record<string, unknown>) ?? null;
      } else if (normalized.startsWith('SELECT status FROM queue_idempotency_keys')) {
        row = (queueKeys.get(String(boundValues[0])) as unknown as Record<string, unknown>) ?? null;
      } else if (normalized.startsWith('SELECT job_type, processed_at_iso FROM queue_idempotency_keys')) {
        const completed = Array.from(queueKeys.values()).filter((q) => q.status === String(boundValues[0]));
        completed.sort((a, b) => b.processed_at_iso.localeCompare(a.processed_at_iso));
        row = (completed[0] as unknown as Record<string, unknown>) ?? null;
      } else if (normalized.startsWith('SELECT * FROM queue_job_executions WHERE idempotency_key')) {
        row = (queueExecutions.get(String(boundValues[0])) as unknown as Record<string, unknown>) ?? null;
      } else if (normalized.startsWith('SELECT job_type, completed_at_iso AS processed_at_iso FROM queue_job_executions')) {
        const completed = Array.from(queueExecutions.values()).filter((q) => q.status === String(boundValues[0]) && q.completed_at_iso);
        completed.sort((a, b) => String(b.completed_at_iso).localeCompare(String(a.completed_at_iso)));
        row = completed[0] ? { job_type: completed[0].job_type, processed_at_iso: completed[0].completed_at_iso } : null;
      } else if (normalized.startsWith('SELECT * FROM media_objects WHERE object_id') || normalized.startsWith('SELECT legal_hold, retention_until FROM media_objects WHERE object_id')) {
        row = (mediaObjects.get(String(boundValues[0])) as unknown as Record<string, unknown>) ?? null;
      } else if (normalized.startsWith('SELECT * FROM media_objects WHERE storage_key')) {
        const key = String(boundValues[0]);
        row = (Array.from(mediaObjects.values()).find((m) => m.storage_key === key) as unknown as Record<string, unknown>) ?? null;
      } else if (
        normalized.startsWith('SELECT * FROM auth_revocation_events WHERE idempotency_key') ||
        normalized.startsWith('SELECT event_id FROM auth_revocation_events WHERE idempotency_key') ||
        normalized.startsWith('SELECT event_id, uid, action, valid_since_seconds FROM auth_revocation_events WHERE idempotency_key')
      ) {
        const idem = String(boundValues[0]);
        row = (Array.from(authRevocations.values()).find((e) => e.idempotency_key === idem) as unknown as Record<string, unknown>) ?? null;
      }

      if (!row) return null;
      if (colName) return (row[colName] as T) ?? null;
      return row as T;
    },
    async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }> {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT id, name, applied_at FROM d1_migrations')) {
        return { results: Array.from(d1Migrations.values()) as unknown as T[], success: true };
      }
      if (normalized.startsWith('SELECT watermark_key, watermark_value, updated_at_iso FROM sync_watermarks')) {
        return { results: Array.from(watermarks.values()) as unknown as T[], success: true };
      }
      if (normalized.startsWith('SELECT * FROM neighborhood_projections')) {
        const [cityId, maxBuy, minScore, limit] = boundValues;
        const rows = Array.from(hoodProjections.values())
          .filter(
            (r) =>
              r.city_id === String(cityId) &&
              r.buy_per_sqm_million <= Number(maxBuy) &&
              r.investment_score >= Number(minScore),
          )
          .sort((a, b) => a.buy_per_sqm_million - b.buy_per_sqm_million)
          .slice(0, Number(limit) || 50);
        return { results: rows as unknown as T[], success: true };
      }
      if (normalized.startsWith('SELECT chunk_index, chunk_base64, byte_length FROM upload_session_chunks')) {
        const sessionId = String(boundValues[0]);
        const chunks = Array.from(uploadChunks.values())
          .filter((c) => c.session_id === sessionId)
          .sort((a, b) => a.chunk_index - b.chunk_index);
        return { results: chunks as unknown as T[], success: true };
      }
      if (normalized.startsWith('SELECT session_id FROM upload_sessions WHERE created_at_ms <')) {
        const cutoff = Number(boundValues[0]);
        const expired = Array.from(uploadSessions.values())
          .filter((s) => s.created_at_ms < cutoff)
          .map((s) => ({ session_id: s.session_id }));
        return { results: expired as unknown as T[], success: true };
      }
      if (normalized.startsWith('SELECT * FROM media_objects WHERE target_type = ?1 AND target_id = ?2')) {
        const targetType = String(boundValues[0]);
        const targetId = String(boundValues[1]);
        const rows = Array.from(mediaObjects.values()).filter(
          (m) => m.target_type === targetType && m.target_id === targetId,
        );
        return { results: rows as unknown as T[], success: true };
      }
      if (normalized.startsWith('SELECT * FROM media_objects WHERE lifecycle_state IN')) {
        const cutoffIso = String(boundValues[0]);
        const rows = Array.from(mediaObjects.values()).filter(
          (m) =>
            (m.lifecycle_state === 'PENDING_UPLOAD' || m.lifecycle_state === 'FAILED_UPLOAD' || m.deletion_state === 'PENDING_PHYSICAL_DELETE') &&
            m.updated_at_iso <= cutoffIso,
        );
        return { results: rows as unknown as T[], success: true };
      }
      if (normalized.startsWith('SELECT storage_key FROM media_objects WHERE deletion_state !=')) {
        const rows = Array.from(mediaObjects.values())
          .filter((m) => m.deletion_state !== String(boundValues[0]))
          .map((m) => ({ storage_key: m.storage_key }));
        return { results: rows as unknown as T[], success: true };
      }
      if (normalized.startsWith('SELECT * FROM queue_job_executions')) {
        return { results: Array.from(queueExecutions.values()) as unknown as T[], success: true };
      }
      if (normalized.startsWith('SELECT * FROM auth_revocation_events WHERE uid = ?1')) {
        const uid = String(boundValues[0]);
        const rows = Array.from(authRevocations.values()).filter((e) => e.uid === uid);
        return { results: rows as unknown as T[], success: true };
      }
      return { results: [], success: true };
    },
    async run(): Promise<{ success: boolean; meta?: { changes?: number } }> {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      let changes = 1;

      if (normalized.startsWith('INSERT INTO d1_migrations')) {
        const [name, applied_at] = boundValues.map(String);
        d1Migrations.set(name, { id: d1Migrations.size + 1, name, applied_at });
      } else if (normalized.startsWith('INSERT INTO neighborhood_projections')) {
        const row: NeighborhoodProjectionRow = {
          city_id: String(boundValues[0]),
          hood_id: Number(boundValues[1]),
          name_fa: String(boundValues[2]),
          district: Number(boundValues[3]),
          buy_per_sqm_million: Number(boundValues[4]),
          deal_per_sqm_million: Number(boundValues[5]),
          rahn_80m_million: Number(boundValues[6]),
          aqi: Number(boundValues[7]),
          investment_score: Number(boundValues[8]),
          firestore_version_iso: String(boundValues[9]),
          projected_at_iso: String(boundValues[10]),
        };
        hoodProjections.set(`${row.city_id}:${row.hood_id}`, row);
      } else if (normalized.startsWith('INSERT OR REPLACE INTO sync_watermarks')) {
        const [watermark_key, watermark_value, updated_at_iso] = boundValues.map(String);
        watermarks.set(watermark_key, { watermark_key, watermark_value, updated_at_iso });
      } else if (normalized.startsWith('DELETE FROM sync_watermarks WHERE watermark_key')) {
        changes = watermarks.delete(String(boundValues[0])) ? 1 : 0;
      } else if (normalized.startsWith('INSERT OR REPLACE INTO upload_sessions') || normalized.startsWith('INSERT INTO upload_sessions')) {
        const [session_id, owner_uid, city_id, hood_id, media_type, mime_type, file_name, total_chunks, max_bytes, received_bytes, completed, created_at_ms] = boundValues;
        uploadSessions.set(String(session_id), {
          session_id: String(session_id),
          owner_uid: String(owner_uid),
          city_id: String(city_id),
          hood_id: Number(hood_id),
          media_type: media_type === 'video' ? 'video' : 'image',
          mime_type: String(mime_type),
          file_name: String(file_name),
          total_chunks: Number(total_chunks),
          max_bytes: Number(max_bytes),
          received_bytes: Number(received_bytes),
          completed: Number(completed),
          created_at_ms: Number(created_at_ms),
        });
      } else if (normalized.startsWith('UPDATE upload_sessions SET received_bytes = received_bytes + ?1 WHERE session_id = ?2 AND completed = 0 AND received_bytes + ?1 <= max_bytes')) {
        const addBytes = Number(boundValues[0]);
        const sid = String(boundValues[1]);
        const sess = uploadSessions.get(sid);
        if (sess && sess.completed === 0 && sess.received_bytes + addBytes <= sess.max_bytes) {
          sess.received_bytes += addBytes;
          changes = 1;
        } else {
          changes = 0;
        }
      } else if (normalized.startsWith('UPDATE upload_sessions SET completed = 1 WHERE session_id = ?1 AND completed = 0')) {
        const sess = uploadSessions.get(String(boundValues[0]));
        if (sess && sess.completed === 0) {
          sess.completed = 1;
          changes = 1;
        } else {
          changes = 0;
        }
      } else if (normalized.startsWith('INSERT OR IGNORE INTO upload_session_chunks')) {
        const [session_id, chunk_index, chunk_base64, byte_length] = boundValues;
        const ck = `${String(session_id)}:${Number(chunk_index)}`;
        if (uploadChunks.has(ck)) {
          changes = 0;
        } else {
          uploadChunks.set(ck, {
            session_id: String(session_id),
            chunk_index: Number(chunk_index),
            chunk_base64: String(chunk_base64),
            byte_length: Number(byte_length),
          });
          changes = 1;
        }
      } else if (normalized.startsWith('INSERT INTO upload_session_chunks')) {
        const [session_id, chunk_index, chunk_base64, byte_length] = boundValues;
        uploadChunks.set(`${session_id}:${chunk_index}`, {
          session_id: String(session_id),
          chunk_index: Number(chunk_index),
          chunk_base64: String(chunk_base64),
          byte_length: Number(byte_length),
        });
      } else if (normalized.startsWith('DELETE FROM upload_session_chunks WHERE session_id = ?1')) {
        const sid = String(boundValues[0]);
        changes = 0;
        for (const k of Array.from(uploadChunks.keys())) {
          if (k.startsWith(`${sid}:`)) {
            uploadChunks.delete(k);
            changes += 1;
          }
        }
      } else if (normalized.startsWith('DELETE FROM upload_sessions WHERE created_at_ms <')) {
        const cutoff = Number(boundValues[0]);
        changes = 0;
        for (const [sid, sess] of Array.from(uploadSessions.entries())) {
          if (sess.created_at_ms < cutoff) {
            uploadSessions.delete(sid);
            for (const k of Array.from(uploadChunks.keys())) {
              if (k.startsWith(`${sid}:`)) uploadChunks.delete(k);
            }
            changes += 1;
          }
        }
      } else if (normalized.startsWith('DELETE FROM upload_sessions')) {
        const sid = String(boundValues[0]);
        changes = uploadSessions.delete(sid) ? 1 : 0;
        for (const k of Array.from(uploadChunks.keys())) {
          if (k.startsWith(`${sid}:`)) uploadChunks.delete(k);
        }
      } else if (normalized.startsWith('INSERT OR REPLACE INTO legal_holds')) {
        const [resource_id, resource_type, reason, active] = boundValues;
        legalHolds.set(String(resource_id), {
          resource_id: String(resource_id),
          resource_type: String(resource_type),
          reason: String(reason),
          active: Number(active),
        });
      } else if (normalized.startsWith('INSERT OR REPLACE INTO strong_rate_limits')) {
        const [bucket_key, counter, window_reset_ms] = boundValues;
        rateLimits.set(String(bucket_key), {
          bucket_key: String(bucket_key),
          counter: Number(counter),
          window_reset_ms: Number(window_reset_ms),
        });
      } else if (normalized.startsWith('INSERT OR REPLACE INTO queue_idempotency_keys')) {
        const [idempotency_key, job_type, processed_at_iso, status] = boundValues.map(String);
        queueKeys.set(idempotency_key, { idempotency_key, job_type, processed_at_iso, status });
      } else if (normalized.startsWith('INSERT OR IGNORE INTO queue_job_executions')) {
        const [
          idempotency_key,
          job_type,
          message_id,
          correlation_id,
          status,
          attempt_count,
          lease_owner,
          lease_expires_at_ms,
          created_at_iso,
          updated_at_iso,
        ] = boundValues;
        const key = String(idempotency_key);
        if (queueExecutions.has(key)) {
          changes = 0;
        } else {
          queueExecutions.set(key, {
            idempotency_key: key,
            job_type: String(job_type),
            message_id: String(message_id),
            correlation_id: String(correlation_id),
            status: String(status) as D1QueueJobExecutionRecord['status'],
            attempt_count: Number(attempt_count),
            lease_owner: lease_owner ? String(lease_owner) : null,
            lease_expires_at_ms: lease_expires_at_ms !== null && lease_expires_at_ms !== undefined ? Number(lease_expires_at_ms) : null,
            last_error_code: null,
            last_error_message: null,
            result_json: null,
            created_at_iso: String(created_at_iso),
            updated_at_iso: String(updated_at_iso),
            completed_at_iso: null,
          });
          changes = 1;
        }
      } else if (normalized.startsWith('UPDATE queue_job_executions SET status = \'PROCESSING\'')) {
        const [lease_owner, lease_expires_at_ms, updated_at_iso, idempotency_key, nowMs] = boundValues;
        const rec = queueExecutions.get(String(idempotency_key));
        const canClaim =
          rec &&
          (rec.status === 'PENDING' ||
            rec.status === 'RETRYABLE_FAILURE' ||
            (rec.status === 'PROCESSING' && (rec.lease_expires_at_ms ?? 0) <= Number(nowMs)));
        if (canClaim && rec) {
          rec.status = 'PROCESSING';
          rec.attempt_count += 1;
          rec.lease_owner = String(lease_owner);
          rec.lease_expires_at_ms = Number(lease_expires_at_ms);
          rec.updated_at_iso = String(updated_at_iso);
          changes = 1;
        } else {
          changes = 0;
        }
      } else if (normalized.startsWith('UPDATE queue_job_executions SET status = \'COMPLETED\'')) {
        const [result_json, updated_at_iso, completed_at_iso, idempotency_key, lease_owner] = boundValues;
        const rec = queueExecutions.get(String(idempotency_key));
        if (rec && rec.lease_owner === String(lease_owner)) {
          rec.status = 'COMPLETED';
          rec.lease_owner = null;
          rec.lease_expires_at_ms = null;
          rec.result_json = result_json ? String(result_json) : null;
          rec.last_error_code = null;
          rec.last_error_message = null;
          rec.updated_at_iso = String(updated_at_iso);
          rec.completed_at_iso = String(completed_at_iso);
          changes = 1;
        } else {
          changes = 0;
        }
      } else if (normalized.startsWith('UPDATE queue_job_executions SET status = ?1, last_error_code = ?2')) {
        const [status, errCode, errMsg, updated_at_iso, idempotency_key] = boundValues;
        const rec = queueExecutions.get(String(idempotency_key));
        if (rec) {
          rec.status = String(status) as D1QueueJobExecutionRecord['status'];
          rec.lease_owner = null;
          rec.lease_expires_at_ms = null;
          rec.last_error_code = errCode ? String(errCode) : null;
          rec.last_error_message = errMsg ? String(errMsg) : null;
          rec.updated_at_iso = String(updated_at_iso);
          changes = 1;
        } else {
          changes = 0;
        }
      } else if (normalized.startsWith('INSERT INTO media_objects')) {
        const [
          object_id, owner_uid, bucket_name, storage_key, city_id, hood_id,
          media_type, mime_type, size_bytes, sha256_checksum, target_type, target_id,
          lifecycle_state, deletion_state, legal_hold, retention_until,
          created_at_iso, updated_at_iso, deleted_at_iso,
        ] = boundValues;
        const oid = String(object_id);
        const skey = String(storage_key);
        if (mediaObjects.has(oid) || Array.from(mediaObjects.values()).some((m) => m.storage_key === skey)) {
          throw new Error('UNIQUE constraint failed: media_objects');
        }
        mediaObjects.set(oid, {
          object_id: oid, owner_uid: String(owner_uid), bucket_name: String(bucket_name), storage_key: skey,
          city_id: String(city_id), hood_id: Number(hood_id), media_type: media_type === 'video' ? 'video' : 'image',
          mime_type: String(mime_type), size_bytes: Number(size_bytes), sha256_checksum: String(sha256_checksum),
          target_type: target_type ? String(target_type) : null, target_id: target_id ? String(target_id) : null,
          lifecycle_state: String(lifecycle_state) as D1MediaObjectRecord['lifecycle_state'],
          deletion_state: String(deletion_state) as D1MediaObjectRecord['deletion_state'],
          legal_hold: Number(legal_hold ?? 0), retention_until: retention_until ? String(retention_until) : null,
          created_at_iso: String(created_at_iso), updated_at_iso: String(updated_at_iso),
          deleted_at_iso: deleted_at_iso ? String(deleted_at_iso) : null,
        });
      } else if (normalized.startsWith('UPDATE media_objects SET lifecycle_state = ?1, size_bytes = ?2, sha256_checksum = ?3, updated_at_iso = ?4 WHERE object_id = ?5')) {
        const [lifecycle_state, size_bytes, sha256_checksum, updated_at_iso, object_id] = boundValues;
        const rec = mediaObjects.get(String(object_id));
        if (rec) {
          rec.lifecycle_state = String(lifecycle_state) as D1MediaObjectRecord['lifecycle_state'];
          rec.size_bytes = Number(size_bytes);
          rec.sha256_checksum = String(sha256_checksum);
          rec.updated_at_iso = String(updated_at_iso);
          changes = 1;
        } else {
          changes = 0;
        }
      } else if (normalized.startsWith('UPDATE media_objects SET lifecycle_state = ?1, updated_at_iso = ?2 WHERE object_id = ?3')) {
        const [lifecycle_state, updated_at_iso, object_id] = boundValues;
        const rec = mediaObjects.get(String(object_id));
        if (rec) {
          rec.lifecycle_state = String(lifecycle_state) as D1MediaObjectRecord['lifecycle_state'];
          rec.updated_at_iso = String(updated_at_iso);
          changes = 1;
        } else {
          changes = 0;
        }
      } else if (normalized.startsWith('UPDATE media_objects SET target_type = ?1, target_id = ?2, updated_at_iso = ?3 WHERE object_id = ?4')) {
        const [target_type, target_id, updated_at_iso, object_id] = boundValues;
        const rec = mediaObjects.get(String(object_id));
        if (rec) {
          rec.target_type = target_type ? String(target_type) : null;
          rec.target_id = target_id ? String(target_id) : null;
          rec.updated_at_iso = String(updated_at_iso);
          changes = 1;
        } else {
          changes = 0;
        }
      } else if (normalized.startsWith('UPDATE media_objects SET lifecycle_state = ?1, deletion_state = ?2, updated_at_iso = ?3, deleted_at_iso = ?4 WHERE object_id = ?5')) {
        const [lifecycle_state, deletion_state, updated_at_iso, deleted_at_iso, object_id] = boundValues;
        const rec = mediaObjects.get(String(object_id));
        if (rec) {
          rec.lifecycle_state = String(lifecycle_state) as D1MediaObjectRecord['lifecycle_state'];
          rec.deletion_state = String(deletion_state) as D1MediaObjectRecord['deletion_state'];
          rec.updated_at_iso = String(updated_at_iso);
          rec.deleted_at_iso = deleted_at_iso ? String(deleted_at_iso) : null;
          changes = 1;
        } else {
          changes = 0;
        }
      } else if (
        normalized.startsWith('INSERT OR IGNORE INTO auth_revocation_events') ||
        normalized.startsWith('INSERT INTO auth_revocation_events')
      ) {
        const [event_id, uid, action, valid_since_seconds, actor_uid, reason, idempotency_key, created_at_iso] = boundValues;
        const idem = String(idempotency_key);
        const isIgnore = normalized.startsWith('INSERT OR IGNORE');
        if (Array.from(authRevocations.values()).some((e) => e.idempotency_key === idem)) {
          if (!isIgnore) {
            throw new Error('UNIQUE constraint failed: auth_revocation_events.idempotency_key');
          }
          changes = 0;
        } else {
          authRevocations.set(String(event_id), {
            event_id: String(event_id),
            uid: String(uid),
            action: String(action) as D1AuthRevocationEventRecord['action'],
            valid_since_seconds: valid_since_seconds !== null && valid_since_seconds !== undefined ? Number(valid_since_seconds) : null,
            actor_uid: String(actor_uid),
            reason: String(reason),
            idempotency_key: idem,
            created_at_iso: String(created_at_iso),
          });
          changes = 1;
        }
      }

      return { success: true, meta: { changes } };
    },
  });

  return {
    prepare(query: string) {
      return makeStatement(query);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]) {
      const snapWatermarks = new Map(watermarks);
      const snapAuthRevocations = new Map(authRevocations);
      const out: Array<{ results?: T[]; success: boolean }> = [];
      try {
        for (const stmt of statements) {
          const res = await stmt.run<T>();
          if (!res.success) {
            throw new Error('D1_BATCH_STATEMENT_FAILED');
          }
          out.push({ results: res.results, success: res.success });
        }
        return out;
      } catch (err) {
        watermarks.clear();
        for (const [k, v] of snapWatermarks.entries()) watermarks.set(k, v);
        authRevocations.clear();
        for (const [k, v] of snapAuthRevocations.entries()) authRevocations.set(k, v);
        throw err;
      }
    },
    async exec(_query: string) {
      return { count: 1, duration: 1 };
    },
  };
}

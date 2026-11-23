/**
 * D1-attributable telemetry erasure (Stage D hardening).
 */

import type { D1DatabaseBinding } from '../db/types.ts';
import type { AccountTelemetryErasureAdapter } from '../../server/modules/account-lifecycle/telemetryErasureContract.ts';

export function createWorkerD1TelemetryErasureAdapter(db: D1DatabaseBinding): AccountTelemetryErasureAdapter {
  return {
    async purgeAttributableTelemetryBatch({ targetUid, jobId, cursor, batchSize }) {
      const limit = Math.max(1, Math.min(50, batchSize));
      const cursorKey = cursor ?? '';
      const res = await db
        .prepare(
          `SELECT audit_id, recorded_at_iso FROM account_lifecycle_audit
           WHERE target_uid = ?1 AND audit_id > ?2
           ORDER BY audit_id ASC LIMIT ?3`,
        )
        .bind(targetUid, cursorKey, limit)
        .all<Record<string, unknown>>();
      const rows = res.success ? res.results : [];
      const nowIso = new Date().toISOString();
      let erased = 0;
      for (const row of rows) {
        await db
          .prepare('DELETE FROM account_lifecycle_audit WHERE audit_id = ?1 AND target_uid = ?2')
          .bind(String(row.audit_id), targetUid)
          .run();
        erased += 1;
      }
      const lastId = rows.length > 0 ? String(rows[rows.length - 1].audit_id) : null;
      return {
        receipts: [
          {
            receiptId: `tel_${targetUid}_${cursorKey || 'start'}_${nowIso}`,
            jobId,
            targetUid,
            dataClass: 'PSEUDONYMOUS_ATTRIBUTABLE',
            recordsErased: erased,
            recordsRetained: 0,
            processedAtIso: nowIso,
          },
        ],
        nextCursor: rows.length === limit ? lastId : null,
        hasMore: rows.length === limit,
      };
    },
    async purgePendingIngestionQueueForUser() {
      throw new Error('TELEMETRY_INGESTION_QUEUE_DRAIN_UNAVAILABLE: deletion cannot advance until queued attributable events are durably drained.');
    },
  };
}
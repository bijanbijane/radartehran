/**
 * In-memory D1 binding for account lifecycle integration tests.
 * Enforces migration 0004/0005 constraints (active job uniqueness, revision guards, idempotency).
 */

import type { D1DatabaseBinding, D1PreparedStatement, D1Result } from '../db/types.ts';
import * as Q from './d1Queries.ts';
import * as DQ from './d1LifecycleDispatchQueries.ts';

type Row = Record<string, unknown>;

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export class InMemoryAccountLifecycleD1 implements D1DatabaseBinding {
  private readonly deletionJobs = new Map<string, Row>();
  private readonly writeBlocks = new Map<string, Row>();
  private readonly exportJobs = new Map<string, Row>();
  private readonly consents = new Map<string, Row>();
  private readonly audit = new Map<string, Row>();
  private readonly dataRequests = new Map<string, Row>();
  private readonly batchReceipts = new Map<string, Row>();
  private readonly executionReceipts = new Map<string, Row>();
  private readonly retentionRecords = new Map<string, Row>();
  private readonly dispatchOutbox = new Map<string, Row>();
  private readonly jobLeases = new Map<string, Row>();
  private readonly mutationPermits = new Map<string, Row>();
  private readonly rpcNonces = new Map<string, Row>();

  public prepare(query: string): D1PreparedStatement {
    const normalized = query.replace(/\s+/g, ' ').trim();
    return new InMemoryStmt(this, normalized);
  }

  public async dump(): Promise<ArrayBuffer> {
    return new TextEncoder().encode('{}').buffer;
  }

  public async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const snapshot = this.captureSnapshot();
    const results: D1Result<T>[] = [];
    try {
      for (const stmt of statements) {
        const res = await stmt.run<T>();
        if (!res.success) {
          this.restoreSnapshot(snapshot);
          throw new Error('D1_BATCH_STATEMENT_FAILED');
        }
        results.push(res);
      }
      return results;
    } catch (err) {
      this.restoreSnapshot(snapshot);
      throw err;
    }
  }

  public async exec(query: string): Promise<{ count: number; duration: number }> {
    void query;
    return { count: 0, duration: 1 };
  }

  private captureSnapshot(): string {
    return JSON.stringify({
      deletionJobs: Object.fromEntries(this.deletionJobs),
      writeBlocks: Object.fromEntries(this.writeBlocks),
      exportJobs: Object.fromEntries(this.exportJobs),
      consents: Object.fromEntries(this.consents),
      audit: Object.fromEntries(this.audit),
      dataRequests: Object.fromEntries(this.dataRequests),
      batchReceipts: Object.fromEntries(this.batchReceipts),
      executionReceipts: Object.fromEntries(this.executionReceipts),
      retentionRecords: Object.fromEntries(this.retentionRecords),
      dispatchOutbox: Object.fromEntries(this.dispatchOutbox),
      jobLeases: Object.fromEntries(this.jobLeases),
      mutationPermits: Object.fromEntries(this.mutationPermits),
      rpcNonces: Object.fromEntries(this.rpcNonces),
    });
  }

  private restoreSnapshot(encoded: string): void {
    const parsed = JSON.parse(encoded) as Record<string, Record<string, Row>>;
    this.deletionJobs.clear();
    this.writeBlocks.clear();
    this.exportJobs.clear();
    this.consents.clear();
    this.audit.clear();
    this.dataRequests.clear();
    this.batchReceipts.clear();
    this.executionReceipts.clear();
    this.retentionRecords.clear();
    this.dispatchOutbox.clear();
    this.jobLeases.clear();
    this.mutationPermits.clear();
    this.rpcNonces.clear();
    for (const [k, v] of Object.entries(parsed.deletionJobs ?? {})) this.deletionJobs.set(k, v);
    for (const [k, v] of Object.entries(parsed.writeBlocks ?? {})) this.writeBlocks.set(k, v);
    for (const [k, v] of Object.entries(parsed.exportJobs ?? {})) this.exportJobs.set(k, v);
    for (const [k, v] of Object.entries(parsed.consents ?? {})) this.consents.set(k, v);
    for (const [k, v] of Object.entries(parsed.audit ?? {})) this.audit.set(k, v);
    for (const [k, v] of Object.entries(parsed.dataRequests ?? {})) this.dataRequests.set(k, v);
    for (const [k, v] of Object.entries(parsed.batchReceipts ?? {})) this.batchReceipts.set(k, v);
    for (const [k, v] of Object.entries(parsed.executionReceipts ?? {})) this.executionReceipts.set(k, v);
    for (const [k, v] of Object.entries(parsed.retentionRecords ?? {})) this.retentionRecords.set(k, v);
    for (const [k, v] of Object.entries(parsed.dispatchOutbox ?? {})) this.dispatchOutbox.set(k, v);
    for (const [k, v] of Object.entries(parsed.jobLeases ?? {})) this.jobLeases.set(k, v);
    for (const [k, v] of Object.entries(parsed.mutationPermits ?? {})) this.mutationPermits.set(k, v);
    for (const [k, v] of Object.entries(parsed.rpcNonces ?? {})) this.rpcNonces.set(k, v);
  }

  public runQuery(sql: string, values: unknown[]): { rows: Row[]; changes: number } {
    if (sql === 'PRAGMA table_info(account_write_blocks)') {
      return {
        rows: ['target_uid', 'state', 'active_deletion_job_id', 'blocked_at_iso', 'updated_at_iso', 'reason', 'revision']
          .map((name) => ({ name })),
        changes: 0,
      };
    }
    if (sql === 'PRAGMA table_info(lifecycle_internal_rpc_nonces)') {
      return {
        rows: ['nonce', 'consumed_at_iso', 'expires_at_ms'].map((name) => ({ name })),
        changes: 0,
      };
    }

    const activeJobsForUid = (uid: string): Row[] =>
      Array.from(this.deletionJobs.values()).filter(
        (j) => j.target_uid === uid && (j.completed_at_iso === null || j.completed_at_iso === undefined),
      );

    if (sql === Q.SQL_PROBE_HEALTH.replace(/\s+/g, ' ').trim()) {
      const first = Array.from(this.deletionJobs.values())[0];
      return { rows: first ? [first] : [], changes: 0 };
    }

    if (sql === Q.SQL_GET_WRITE_BLOCK.replace(/\s+/g, ' ').trim()) {
      const row = this.writeBlocks.get(String(values[0]));
      return { rows: row ? [deepClone(row)] : [], changes: 0 };
    }

    if (sql === Q.SQL_GET_JOB_BY_ID.replace(/\s+/g, ' ').trim()) {
      const row = this.deletionJobs.get(String(values[0]));
      return { rows: row ? [deepClone(row)] : [], changes: 0 };
    }

    if (sql === Q.SQL_GET_ACTIVE_JOB_FOR_UID.replace(/\s+/g, ' ').trim()) {
      const rows = activeJobsForUid(String(values[0]));
      return { rows: rows[0] ? [deepClone(rows[0])] : [], changes: 0 };
    }

    if (sql === Q.SQL_GET_LATEST_JOB_FOR_UID.replace(/\s+/g, ' ').trim()) {
      const rows = Array.from(this.deletionJobs.values())
        .filter((j) => j.target_uid === values[0])
        .sort((a, b) => String(b.created_at_iso).localeCompare(String(a.created_at_iso)));
      return { rows: rows[0] ? [deepClone(rows[0])] : [], changes: 0 };
    }

    if (sql === Q.SQL_INSERT_DELETION_JOB.replace(/\s+/g, ' ').trim()) {
      const jobId = String(values[0]);
      const targetUid = String(values[1]);
      if (activeJobsForUid(targetUid).length > 0) {
        throw new Error('UNIQUE_ACTIVE_JOB_VIOLATION');
      }
      if (this.deletionJobs.has(jobId)) {
        throw new Error('JOB_ID_CONFLICT');
      }
      const row: Row = {
        job_id: values[0],
        target_uid: values[1],
        requested_by_uid: values[2],
        state: values[3],
        reason: values[4],
        write_block_enforced: values[5],
        job_json: values[6],
        revision: values[7],
        created_at_iso: values[8],
        updated_at_iso: values[9],
        completed_at_iso: values[10] ?? null,
      };
      this.deletionJobs.set(jobId, row);
      return { rows: [], changes: 1 };
    }

    if (sql === Q.SQL_INSERT_WRITE_BLOCK_ON_JOB_CREATE.replace(/\s+/g, ' ').trim()) {
      const targetUid = String(values[0]);
      if (this.writeBlocks.has(targetUid)) {
        const existing = this.writeBlocks.get(targetUid)!;
        if (existing.state !== 'ACTIVE_WRITES_ALLOWED') {
          throw new Error('WRITE_BLOCK_ALREADY_BLOCKED');
        }
      }
      this.writeBlocks.set(targetUid, {
        target_uid: values[0],
        state: values[1],
        active_deletion_job_id: values[2],
        blocked_at_iso: values[3],
        updated_at_iso: values[4],
        reason: values[5],
        revision: values[6],
      });
      return { rows: [], changes: 1 };
    }

    if (sql === Q.SQL_UPDATE_JOB_PROGRESS.replace(/\s+/g, ' ').trim()) {
      const jobId = String(values[5]);
      const expectedRevision = Number(values[6]);
      const existing = this.deletionJobs.get(jobId);
      if (!existing) return { rows: [], changes: 0 };
      if (Number(existing.revision) !== expectedRevision) return { rows: [], changes: 0 };
      existing.state = values[0];
      existing.job_json = values[1];
      existing.revision = values[2];
      existing.updated_at_iso = values[3];
      existing.completed_at_iso = values[4];
      this.deletionJobs.set(jobId, existing);
      return { rows: [], changes: 1 };
    }

    if (sql === Q.SQL_UPDATE_WRITE_BLOCK_ON_JOB_COMPLETE.replace(/\s+/g, ' ').trim()) {
      const targetUid = String(values[4]);
      const block = this.writeBlocks.get(targetUid);
      if (!block) return { rows: [], changes: 0 };
      block.state = values[0];
      block.updated_at_iso = values[1];
      block.reason = values[2];
      block.revision = values[3];
      this.writeBlocks.set(targetUid, block);
      return { rows: [], changes: 1 };
    }

    if (sql === Q.SQL_UPSERT_WRITE_BLOCK.replace(/\s+/g, ' ').trim()) {
      const targetUid = String(values[0]);
      const nextRevision = Number(values[6]);
      const current = this.writeBlocks.get(targetUid);
      if (current && Number(current.revision) >= nextRevision) {
        return { rows: [], changes: 0 };
      }
      this.writeBlocks.set(targetUid, {
        target_uid: values[0],
        state: values[1],
        active_deletion_job_id: values[2],
        blocked_at_iso: values[3],
        updated_at_iso: values[4],
        reason: values[5],
        revision: values[6],
      });
      return { rows: [], changes: 1 };
    }

    if (sql === Q.SQL_LIST_RETRYABLE_JOBS.replace(/\s+/g, ' ').trim()) {
      const limit = Number(values[0]);
      const offset = Number(values[1]);
      const states = new Set([
        'PARTIAL_FAILURE_RETRYABLE',
        'PURGING_DEPENDENT_RECORDS',
        'CLEANING_UP_MEDIA',
        'APPLYING_RETENTION_POLICIES',
        'DELETING_AUTH_IDENTITY',
        'INITIATED_WRITE_BLOCKED',
      ]);
      const rows = Array.from(this.deletionJobs.values())
        .filter((j) => states.has(String(j.state)))
        .sort((a, b) => String(a.updated_at_iso).localeCompare(String(b.updated_at_iso)))
        .slice(offset, offset + limit);
      return { rows: rows.map(deepClone), changes: 0 };
    }

    if (sql === Q.SQL_LIST_JOBS.replace(/\s+/g, ' ').trim()) {
      const rows = Array.from(this.deletionJobs.values()).sort((a, b) =>
        String(b.updated_at_iso).localeCompare(String(a.updated_at_iso)),
      );
      return { rows: rows.map(deepClone), changes: 0 };
    }

    if (sql === Q.SQL_INSERT_BATCH_RECEIPT.replace(/\s+/g, ' ').trim()) {
      const idem = String(values[4]);
      if (this.batchReceipts.has(idem)) {
        return { rows: [], changes: 0 };
      }
      this.batchReceipts.set(idem, {
        receipt_id: values[0],
        job_id: values[1],
        target_uid: values[2],
        domain_source: values[3],
        idempotency_key: values[4],
        batch_cursor: values[5],
        outcome_json: values[6],
        recorded_at_iso: values[7],
        status: values[8] ?? 'COMPLETED',
        completed_at_iso: values[9] ?? values[7],
      });
      return { rows: [], changes: 1 };
    }

    if (sql === Q.SQL_GET_BATCH_RECEIPT_BY_IDEM.replace(/\s+/g, ' ').trim()) {
      const row = this.batchReceipts.get(String(values[0]));
      return { rows: row ? [deepClone(row)] : [], changes: 0 };
    }

    if (sql === Q.SQL_GET_EXECUTION_RECEIPT_BY_JOB.replace(/\s+/g, ' ').trim()) {
      const row = Array.from(this.executionReceipts.values()).find((r) => r.job_id === values[0]);
      return { rows: row ? [{ receipt_id: row.receipt_id }] : [], changes: 0 };
    }

    if (sql === Q.SQL_INSERT_EXECUTION_RECEIPT.replace(/\s+/g, ' ').trim()) {
      const jobId = String(values[1]);
      if (Array.from(this.executionReceipts.values()).some((r) => r.job_id === jobId)) {
        throw new Error('EXECUTION_RECEIPT_CONFLICT');
      }
      const receiptId = String(values[0]);
      this.executionReceipts.set(receiptId, {
        receipt_id: values[0],
        job_id: values[1],
        target_uid: values[2],
        status: values[3],
        receipt_json: values[4],
        recorded_at_iso: values[5],
      });
      return { rows: [], changes: 1 };
    }

    if (sql === Q.SQL_GET_EXPORT_JOB.replace(/\s+/g, ' ').trim()) {
      const row = this.exportJobs.get(String(values[0]));
      return { rows: row ? [deepClone(row)] : [], changes: 0 };
    }

    if (sql === Q.SQL_INSERT_EXPORT_JOB.replace(/\s+/g, ' ').trim()) {
      const id = String(values[0]);
      this.exportJobs.set(id, {
        export_job_id: values[0],
        target_uid: values[1],
        requested_by_uid: values[2],
        state: values[3],
        job_json: values[4],
        revision: values[5],
        download_expires_at_iso: values[6],
        created_at_iso: values[7],
        updated_at_iso: values[8],
        completed_at_iso: values[9],
      });
      return { rows: [], changes: 1 };
    }

    if (sql === Q.SQL_UPDATE_EXPORT_JOB.replace(/\s+/g, ' ').trim()) {
      const id = String(values[6]);
      const expected = Number(values[7]);
      const row = this.exportJobs.get(id);
      if (!row || Number(row.revision) !== expected) return { rows: [], changes: 0 };
      row.state = values[0];
      row.job_json = values[1];
      row.revision = values[2];
      row.updated_at_iso = values[3];
      row.completed_at_iso = values[4];
      row.download_expires_at_iso = values[5];
      this.exportJobs.set(id, row);
      return { rows: [], changes: 1 };
    }

    if (sql === Q.SQL_GET_LATEST_CONSENT.replace(/\s+/g, ' ').trim()) {
      const rows = Array.from(this.consents.values())
        .filter((c) => c.target_uid === values[0] && c.scope === values[1])
        .sort((a, b) => String(b.recorded_at_iso).localeCompare(String(a.recorded_at_iso)));
      return { rows: rows[0] ? [deepClone(rows[0])] : [], changes: 0 };
    }

    if (sql === Q.SQL_INSERT_CONSENT.replace(/\s+/g, ' ').trim()) {
      this.consents.set(String(values[0]), {
        consent_id: values[0],
        target_uid: values[1],
        scope: values[2],
        granted: values[3],
        policy_version: values[4],
        recorded_at_iso: values[5],
        revoked_at_iso: values[6],
        revision: values[7],
      });
      return { rows: [], changes: 1 };
    }

    if (sql === Q.SQL_INSERT_AUDIT.replace(/\s+/g, ' ').trim()) {
      this.audit.set(String(values[0]), {
        audit_id: values[0],
        job_id: values[1],
        target_uid: values[2],
        actor_uid: values[3],
        action: values[4],
        detail_redacted: values[5],
        recorded_at_iso: values[6],
      });
      return { rows: [], changes: 1 };
    }

    if (sql === Q.SQL_LIST_DATA_REQUESTS.replace(/\s+/g, ' ').trim()) {
      const rows = Array.from(this.dataRequests.values())
        .filter((r) => r.target_uid === values[0])
        .sort((a, b) => String(b.requested_at_iso).localeCompare(String(a.requested_at_iso)));
      return { rows: rows.map(deepClone), changes: 0 };
    }

    if (sql === Q.SQL_UPSERT_DATA_REQUEST.replace(/\s+/g, ' ').trim()) {
      const id = String(values[0]);
      this.dataRequests.set(id, {
        request_id: values[0],
        target_uid: values[1],
        kind: values[2],
        linked_job_id: values[3],
        status: values[4],
        requested_at_iso: values[5],
        completed_at_iso: values[6],
        revision: values[7],
      });
      return { rows: [], changes: 1 };
    }

    if (sql === DQ.SQL_INSERT_DISPATCH_OUTBOX.replace(/\s+/g, ' ').trim()) {
      const idem = String(values[4]);
      if (this.dispatchOutbox.has(idem)) return { rows: [], changes: 0 };
      this.dispatchOutbox.set(idem, {
        event_id: values[0],
        job_id: values[1],
        target_uid: values[2],
        operation_type: values[3],
        idempotency_key: values[4],
        dispatch_status: values[5],
        attempt_count: values[6],
        correlation_id: values[9],
      });
      return { rows: [], changes: 1 };
    }
    if (sql === DQ.SQL_GET_DISPATCH_BY_IDEM.replace(/\s+/g, ' ').trim()) {
      const row = this.dispatchOutbox.get(String(values[0]));
      return { rows: row ? [deepClone(row)] : [], changes: 0 };
    }
    if (sql === DQ.SQL_INSERT_JOB_LEASE.replace(/\s+/g, ' ').trim()) {
      this.jobLeases.set(String(values[0]), {
        job_id: values[0],
        target_uid: values[1],
        lease_token: values[2],
        fencing_revision: values[3],
        lease_owner: values[4],
        lease_expires_at_ms: values[5],
      });
      return { rows: [], changes: 1 };
    }
    if (sql === DQ.SQL_GET_JOB_LEASE.replace(/\s+/g, ' ').trim()) {
      const row = this.jobLeases.get(String(values[0]));
      return { rows: row ? [deepClone(row)] : [], changes: 0 };
    }
    if (sql === DQ.SQL_CLAIM_JOB_LEASE.replace(/\s+/g, ' ').trim()) {
      const jobId = String(values[5]);
      const row = this.jobLeases.get(jobId);
      if (!row) return { rows: [], changes: 0 };
      const expires = Number(row.lease_expires_at_ms);
      const token = String(values[0]);
      if (expires > Number(values[6]) && String(row.lease_token) !== token) {
        return { rows: [], changes: 0 };
      }
      row.lease_token = token;
      row.fencing_revision = values[1];
      row.lease_owner = values[2];
      row.lease_expires_at_ms = values[3];
      this.jobLeases.set(jobId, row);
      return { rows: [], changes: 1 };
    }
    if (sql === DQ.SQL_LIST_PENDING_DISPATCH.replace(/\s+/g, ' ').trim()) {
      const rows = Array.from(this.dispatchOutbox.values()).filter((r) =>
        ['PENDING', 'DISPATCH_FAILED'].includes(String(r.dispatch_status)),
      );
      return { rows: rows.slice(0, Number(values[1])).map(deepClone), changes: 0 };
    }

    if (sql === 'SELECT state FROM account_write_blocks WHERE target_uid = ?1') {
      const row = this.writeBlocks.get(String(values[0]));
      return { rows: row ? [{ state: row.state }] : [], changes: 0 };
    }
    if (
      sql ===
        'INSERT INTO lifecycle_internal_rpc_nonces (nonce, consumed_at_iso, expires_at_ms) VALUES (?1, ?2, ?3)' ||
      sql ===
        'INSERT OR IGNORE INTO lifecycle_internal_rpc_nonces (nonce, consumed_at_iso, expires_at_ms) VALUES (?1, ?2, ?3)'
    ) {
      const nonce = String(values[0]);
      if (this.rpcNonces.has(nonce)) {
        return { rows: [], changes: 0 };
      }
      this.rpcNonces.set(nonce, {
        nonce,
        consumed_at_iso: values[1],
        expires_at_ms: values[2],
      });
      return { rows: [], changes: 1 };
    }

    throw new Error(`UNSUPPORTED_ACCOUNT_LIFECYCLE_SQL:${sql.slice(0, 80)}`);
  }
}

class InMemoryStmt implements D1PreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly db: InMemoryAccountLifecycleD1,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this;
  }

  async first<T>(colName?: string): Promise<T | null> {
    const all = await this.all<T>();
    if (all.results.length === 0) return null;
    const row = all.results[0] as Record<string, unknown>;
    if (colName) return (row[colName] as T) ?? null;
    return row as T;
  }

  async run<T>(): Promise<D1Result<T>> {
    try {
      const { rows, changes } = this.db.runQuery(this.sql, this.values);
      return {
        results: rows as T[],
        success: true,
        meta: { duration: 1, changes },
      };
    } catch (err) {
      return {
        results: [],
        success: false,
        meta: { duration: 1, changes: 0 },
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async all<T>(): Promise<D1Result<T>> {
    return this.run<T>();
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const res = await this.run<Record<string, unknown>>();
    return res.results.map((r) => Object.values(r)) as unknown as T[];
  }
}
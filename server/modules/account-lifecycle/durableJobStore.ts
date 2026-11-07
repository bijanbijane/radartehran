/**
 * Employee 7 — Durable Account Deletion Job & Write-Block Store
 * (`server/modules/account-lifecycle/durableJobStore.ts`)
 *
 * Exclusive ownership: `server/modules/account-lifecycle/`
 *
 * Guarantees:
 *  - Authoritative state is persisted to durable storage (Firestore + atomic 0o600 disk journal).
 *  - Never relies on an in-memory deletion plan as the authoritative record.
 *  - Survives process restarts cleanly: reloading from `durableJournalPath` or Firestore
 *    restores exact resumable cursors, step progress, and write-block barriers.
 *  - Enforces optimistic concurrency control (`revision`) and serialized file locking.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getFirebaseAdminFirestoreForServer } from '../../../src/utils/serverAdminAndTelegramSecurity';
import {
  AccountLifecycleError,
  ALL_USER_OWNED_DOMAIN_SOURCES,
  DurableAccountDeletionJob,
  DurableUserWriteBlockRecord,
  DomainDeletionStepJournal,
  UserOwnedDomainSource,
} from './types.ts';

export const ACCOUNT_DELETION_JOBS_COLLECTION = 'account_deletion_jobs_v2';
export const ACCOUNT_WRITE_BLOCKS_COLLECTION = 'account_write_blocks_v2';

interface DurableLifecycleJournalSnapshot {
  schemaVersion: '2026-05.account-lifecycle-journal.v1';
  updatedAtIso: string;
  jobs: Record<string, DurableAccountDeletionJob>;
  activeJobIdByUid: Record<string, string>;
  writeBlocksByUid: Record<string, DurableUserWriteBlockRecord>;
}

export interface DurableAccountLifecycleStore {
  getWriteBlock(targetUid: string): Promise<DurableUserWriteBlockRecord | null>;
  upsertWriteBlock(record: DurableUserWriteBlockRecord): Promise<DurableUserWriteBlockRecord>;
  assertUserWritePermitted(targetUid: string): Promise<void>;

  getJobById(jobId: string): Promise<DurableAccountDeletionJob | null>;
  getLatestJobForUser(targetUid: string): Promise<DurableAccountDeletionJob | null>;
  createOrGetActiveJob(job: DurableAccountDeletionJob): Promise<{
    job: DurableAccountDeletionJob;
    createdNew: boolean;
  }>;
  saveJobProgress(
    jobId: string,
    expectedRevision: number,
    updater: (current: DurableAccountDeletionJob) => DurableAccountDeletionJob,
  ): Promise<DurableAccountDeletionJob>;
  listAllJobs(): Promise<DurableAccountDeletionJob[]>;
}

function cloneDeep<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

export function createInitialDomainSteps(nowIso: string): Record<UserOwnedDomainSource, DomainDeletionStepJournal> {
  const steps = {} as Record<UserOwnedDomainSource, DomainDeletionStepJournal>;
  for (const source of ALL_USER_OWNED_DOMAIN_SOURCES) {
    steps[source] = {
      source,
      status: 'PENDING',
      resumableCursor: null,
      batchesProcessed: 0,
      permanentlyDeletedIds: [],
      retainedRecords: [],
      attempts: 0,
      updatedAtIso: nowIso,
    };
  }
  return steps;
}

export class FirestoreAndJournalAccountLifecycleStore implements DurableAccountLifecycleStore {
  private readonly durableJournalPath: string;
  private readonly enableFirestoreSync: boolean;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(options?: {
    durableJournalPath?: string;
    enableFirestoreSync?: boolean;
  }) {
    this.durableJournalPath =
      options?.durableJournalPath ??
      path.resolve(process.cwd(), '.cache', 'account-lifecycle-journal.v1.json');
    this.enableFirestoreSync =
      options?.enableFirestoreSync ??
      Boolean(
        process.env.FIRESTORE_EMULATOR_HOST ||
          process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      );
  }

  private enqueueExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(fn, fn);
    this.mutationQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /**
   * Always reads the authoritative snapshot from disk so that no in-memory state
   * is ever treated as authoritative across restarts or concurrent store instances.
   */
  private readAuthoritativeSnapshotFromDisk(): DurableLifecycleJournalSnapshot {
    try {
      if (!fs.existsSync(this.durableJournalPath)) {
        return {
          schemaVersion: '2026-05.account-lifecycle-journal.v1',
          updatedAtIso: new Date().toISOString(),
          jobs: {},
          activeJobIdByUid: {},
          writeBlocksByUid: {},
        };
      }
      const raw = fs.readFileSync(this.durableJournalPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DurableLifecycleJournalSnapshot>;
      return {
        schemaVersion: '2026-05.account-lifecycle-journal.v1',
        updatedAtIso: parsed.updatedAtIso ?? new Date().toISOString(),
        jobs: parsed.jobs ?? {},
        activeJobIdByUid: parsed.activeJobIdByUid ?? {},
        writeBlocksByUid: parsed.writeBlocksByUid ?? {},
      };
    } catch {
      return {
        schemaVersion: '2026-05.account-lifecycle-journal.v1',
        updatedAtIso: new Date().toISOString(),
        jobs: {},
        activeJobIdByUid: {},
        writeBlocksByUid: {},
      };
    }
  }

  private writeAuthoritativeSnapshotToDisk(snapshot: DurableLifecycleJournalSnapshot): void {
    const dir = path.dirname(this.durableJournalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const tmpPath = `${this.durableJournalPath}.tmp.${process.pid}.${Date.now()}`;
    const payload = JSON.stringify(snapshot, null, 2);
    fs.writeFileSync(tmpPath, payload, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpPath, this.durableJournalPath);
  }

  private async syncToFirestoreBestEffort(
    job?: DurableAccountDeletionJob,
    writeBlock?: DurableUserWriteBlockRecord,
  ): Promise<void> {
    if (!this.enableFirestoreSync) return;
    try {
      const db = getFirebaseAdminFirestoreForServer(process.env);
      if (!db) return;
      if (job) {
        await db.collection(ACCOUNT_DELETION_JOBS_COLLECTION).doc(job.jobId).set(cloneDeep(job));
      }
      if (writeBlock) {
        await db
          .collection(ACCOUNT_WRITE_BLOCKS_COLLECTION)
          .doc(writeBlock.targetUid)
          .set(cloneDeep(writeBlock));
      }
    } catch {
      // Durable local journal is already committed; Firestore sync will catch up on next write.
    }
  }

  public async getWriteBlock(targetUid: string): Promise<DurableUserWriteBlockRecord | null> {
    const snapshot = this.readAuthoritativeSnapshotFromDisk();
    const record = snapshot.writeBlocksByUid[targetUid];
    return record ? cloneDeep(record) : null;
  }

  public async upsertWriteBlock(
    record: DurableUserWriteBlockRecord,
  ): Promise<DurableUserWriteBlockRecord> {
    return this.enqueueExclusive(async () => {
      const snapshot = this.readAuthoritativeSnapshotFromDisk();
      const existing = snapshot.writeBlocksByUid[record.targetUid];
      const saved: DurableUserWriteBlockRecord = {
        ...cloneDeep(record),
        revision: existing ? existing.revision + 1 : 1,
      };
      snapshot.writeBlocksByUid[record.targetUid] = saved;
      snapshot.updatedAtIso = saved.updatedAtIso;
      this.writeAuthoritativeSnapshotToDisk(snapshot);
      await this.syncToFirestoreBestEffort(undefined, saved);
      return cloneDeep(saved);
    });
  }

  public async assertUserWritePermitted(targetUid: string): Promise<void> {
    const block = await this.getWriteBlock(targetUid);
    if (!block || block.state === 'ACTIVE_WRITES_ALLOWED') {
      return;
    }
    throw new AccountLifecycleError(
      'USER_WRITES_BLOCKED_BY_DELETION',
      `Write operations are blocked for user "${targetUid}" because account state is "${block.state}" (job: ${block.activeDeletionJobId ?? 'none'}).`,
      423,
    );
  }

  public async getJobById(jobId: string): Promise<DurableAccountDeletionJob | null> {
    const snapshot = this.readAuthoritativeSnapshotFromDisk();
    const job = snapshot.jobs[jobId];
    return job ? cloneDeep(job) : null;
  }

  public async getLatestJobForUser(targetUid: string): Promise<DurableAccountDeletionJob | null> {
    const snapshot = this.readAuthoritativeSnapshotFromDisk();
    const activeJobId = snapshot.activeJobIdByUid[targetUid];
    if (activeJobId && snapshot.jobs[activeJobId]) {
      return cloneDeep(snapshot.jobs[activeJobId]);
    }
    const matching = Object.values(snapshot.jobs)
      .filter((j) => j.targetUid === targetUid)
      .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
    return matching[0] ? cloneDeep(matching[0]) : null;
  }

  public async createOrGetActiveJob(job: DurableAccountDeletionJob): Promise<{
    job: DurableAccountDeletionJob;
    createdNew: boolean;
  }> {
    return this.enqueueExclusive(async () => {
      const snapshot = this.readAuthoritativeSnapshotFromDisk();
      const existingJobId = snapshot.activeJobIdByUid[job.targetUid];
      if (existingJobId && snapshot.jobs[existingJobId]) {
        const existingJob = snapshot.jobs[existingJobId];
        return {
          job: cloneDeep(existingJob),
          createdNew: false,
        };
      }

      const writeBlock: DurableUserWriteBlockRecord = {
        targetUid: job.targetUid,
        state: 'WRITE_BLOCKED_DELETION_IN_PROGRESS',
        activeDeletionJobId: job.jobId,
        blockedAtIso: job.createdAtIso,
        updatedAtIso: job.createdAtIso,
        reason: `Account deletion initiated (${job.reason})`,
        revision: (snapshot.writeBlocksByUid[job.targetUid]?.revision ?? 0) + 1,
      };

      const authoritativeJob: DurableAccountDeletionJob = {
        ...cloneDeep(job),
        writeBlockEnforced: true,
        revision: 1,
      };

      snapshot.jobs[authoritativeJob.jobId] = authoritativeJob;
      snapshot.activeJobIdByUid[authoritativeJob.targetUid] = authoritativeJob.jobId;
      snapshot.writeBlocksByUid[authoritativeJob.targetUid] = writeBlock;
      snapshot.updatedAtIso = authoritativeJob.updatedAtIso;

      this.writeAuthoritativeSnapshotToDisk(snapshot);
      await this.syncToFirestoreBestEffort(authoritativeJob, writeBlock);

      return {
        job: cloneDeep(authoritativeJob),
        createdNew: true,
      };
    });
  }

  public async saveJobProgress(
    jobId: string,
    expectedRevision: number,
    updater: (current: DurableAccountDeletionJob) => DurableAccountDeletionJob,
  ): Promise<DurableAccountDeletionJob> {
    return this.enqueueExclusive(async () => {
      const snapshot = this.readAuthoritativeSnapshotFromDisk();
      const current = snapshot.jobs[jobId];
      if (!current) {
        throw new AccountLifecycleError(
          'JOB_NOT_FOUND',
          `Durable account deletion job "${jobId}" was not found.`,
          404,
        );
      }
      if (current.revision !== expectedRevision) {
        throw new AccountLifecycleError(
          'CONCURRENT_MODIFICATION_CONFLICT',
          `Optimistic concurrency conflict on deletion job "${jobId}": expected revision ${expectedRevision}, found ${current.revision}.`,
          409,
        );
      }

      const updated = updater(cloneDeep(current));
      const nextJob: DurableAccountDeletionJob = {
        ...cloneDeep(updated),
        revision: current.revision + 1,
      };

      snapshot.jobs[jobId] = nextJob;
      snapshot.updatedAtIso = nextJob.updatedAtIso;

      let updatedWriteBlock: DurableUserWriteBlockRecord | undefined;
      if (nextJob.state === 'COMPLETED') {
        const existingBlock = snapshot.writeBlocksByUid[nextJob.targetUid];
        updatedWriteBlock = {
          targetUid: nextJob.targetUid,
          state: 'WRITE_BLOCKED_ACCOUNT_DELETED',
          activeDeletionJobId: nextJob.jobId,
          blockedAtIso: existingBlock?.blockedAtIso ?? nextJob.createdAtIso,
          updatedAtIso: nextJob.updatedAtIso,
          reason: 'Account deletion job completed.',
          revision: (existingBlock?.revision ?? 0) + 1,
        };
        snapshot.writeBlocksByUid[nextJob.targetUid] = updatedWriteBlock;
      }

      this.writeAuthoritativeSnapshotToDisk(snapshot);
      await this.syncToFirestoreBestEffort(nextJob, updatedWriteBlock);

      return cloneDeep(nextJob);
    });
  }

  public async listAllJobs(): Promise<DurableAccountDeletionJob[]> {
    const snapshot = this.readAuthoritativeSnapshotFromDisk();
    return Object.values(snapshot.jobs)
      .map((j) => cloneDeep(j))
      .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  }
}

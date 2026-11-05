import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateRetryDelayMs,
  createDeletionJournalEntry,
  createJournalOperation,
  syncDeletionJournalReconciliationMetrics,
  transitionJournalOperation,
  JournalConflictError,
  type DeletionJournalEntry,
  type JournalStore,
} from "../src/utils/deletionJournal";

class MemoryJournalStore implements JournalStore {
  private readonly entries =
    new Map<string, DeletionJournalEntry>();

  async get(id: string) {
    const entry = this.entries.get(id);

    return entry ? { ...entry } : null;
  }

  async create(entry: DeletionJournalEntry) {
    if (this.entries.has(entry.operationId)) {
      throw new Error("DUPLICATE_OPERATION_ID");
    }

    this.entries.set(entry.operationId, { ...entry });
  }

  async compareAndSwap(
    id: string,
    expectedRevision: number,
    next: DeletionJournalEntry
  ) {
    const current = this.entries.get(id);

    if (
      !current ||
      current.revision !== expectedRevision
    ) {
      return false;
    }

    this.entries.set(id, { ...next });
    return true;
  }

  async listRecoverable(limit: number) {
    return [...this.entries.values()]
      .filter((entry) =>
        [
          "queued",
          "running",
          "remote_delete_pending",
          "remote_deleted",
          "local_delete_pending",
          "retryable_failure",
        ].includes(entry.status)
      )
      .slice(0, limit)
      .map((entry) => ({ ...entry }));
  }
}

function makeEntry() {
  return createDeletionJournalEntry({
    operationId: "delete_operation_0001",
    objectId: "media_0001",
    objectKey: "media/2026/media_0001.jpg",
    bargainId: "bargain_0001",
    ownerUid: "user_0001",
    now: new Date("2026-10-29T10:00:00.000Z"),
  });
}

test("new journal entry starts queued at revision zero", async () => {
  const store = new MemoryJournalStore();
  const entry = makeEntry();

  await createJournalOperation(store, entry);

  const stored = await store.get(entry.operationId);

  assert.equal(stored?.status, "queued");
  assert.equal(stored?.revision, 0);
  assert.equal(stored?.attemptCount, 0);
});

test("valid transitions increment the revision", async () => {
  const store = new MemoryJournalStore();
  const entry = makeEntry();

  await createJournalOperation(store, entry);

  const next = await transitionJournalOperation(
    store,
    entry.operationId,
    0,
    "running",
    {
      now: new Date("2026-10-29T10:01:00.000Z"),
      incrementAttempt: true,
      leaseOwner: "worker_01",
      leaseExpiresAt: "2026-10-29T10:02:00.000Z",
    }
  );

  assert.equal(next.status, "running");
  assert.equal(next.revision, 1);
  assert.equal(next.attemptCount, 1);
  assert.equal(next.leaseOwner, "worker_01");
});

test("stale revisions are rejected", async () => {
  const store = new MemoryJournalStore();
  const entry = makeEntry();

  await createJournalOperation(store, entry);

  await transitionJournalOperation(
    store,
    entry.operationId,
    0,
    "running"
  );

  await assert.rejects(
    transitionJournalOperation(
      store,
      entry.operationId,
      0,
      "remote_delete_pending"
    ),
    JournalConflictError
  );
});

test("invalid state transitions are rejected", async () => {
  const store = new MemoryJournalStore();
  const entry = makeEntry();

  await createJournalOperation(store, entry);

  await assert.rejects(
    transitionJournalOperation(
      store,
      entry.operationId,
      0,
      "completed"
    ),
    /INVALID_TRANSITION/
  );
});

test("completed operations cannot return to running", async () => {
  const store = new MemoryJournalStore();
  const entry = makeEntry();

  await createJournalOperation(store, entry);

  await transitionJournalOperation(
    store,
    entry.operationId,
    0,
    "running"
  );

  await transitionJournalOperation(
    store,
    entry.operationId,
    1,
    "remote_delete_pending"
  );

  await transitionJournalOperation(
    store,
    entry.operationId,
    2,
    "remote_deleted"
  );

  await transitionJournalOperation(
    store,
    entry.operationId,
    3,
    "local_delete_pending"
  );

  await transitionJournalOperation(
    store,
    entry.operationId,
    4,
    "completed"
  );

  await assert.rejects(
    transitionJournalOperation(
      store,
      entry.operationId,
      5,
      "running"
    ),
    /TERMINAL_STATE_TRANSITION/
  );
});

test("recoverable listing excludes completed operations", async () => {
  const store = new MemoryJournalStore();
  const entry = makeEntry();

  await createJournalOperation(store, entry);

  await transitionJournalOperation(
    store,
    entry.operationId,
    0,
    "running"
  );

  await transitionJournalOperation(
    store,
    entry.operationId,
    1,
    "remote_delete_pending"
  );

  await transitionJournalOperation(
    store,
    entry.operationId,
    2,
    "remote_deleted"
  );

  await transitionJournalOperation(
    store,
    entry.operationId,
    3,
    "local_delete_pending"
  );

  await transitionJournalOperation(
    store,
    entry.operationId,
    4,
    "completed"
  );

  const recoverable = await store.listRecoverable(100);

  assert.equal(recoverable.length, 0);
});

test("calculateRetryDelayMs applies exponential backoff and respects maxAttempts and bounds", () => {
  const policy = {
    maxAttempts: 5,
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    jitterRatio: 0.2,
  };

  assert.equal(calculateRetryDelayMs(1, policy, () => 0.5), 1000);
  assert.equal(calculateRetryDelayMs(2, policy, () => 0.5), 2000);
  assert.equal(calculateRetryDelayMs(3, policy, () => 0), 3200);

  assert.throws(
    () => calculateRetryDelayMs(6, policy, () => 0.5),
    /MAX_RETRY_ATTEMPTS_EXCEEDED/
  );
});

test("syncDeletionJournalReconciliationMetrics aggregates deletedCount, skippedCount, and failedCount", async () => {
  const store = new MemoryJournalStore();
  const metrics = await syncDeletionJournalReconciliationMetrics({
    deletedIds: ["obj_del_1", "obj_del_2"],
    blocked: [{ objectId: "obj_blk_1", reason: "ACTIVE_BARGAIN_REFERENCE" }],
    failures: [{ objectId: "obj_fail_1", reason: "REMOTE_DELETE_FAILED", retryable: true }],
    skippedNonBlockedCount: 1,
    store,
  });

  assert.equal(metrics.deletedCount, 2);
  assert.equal(metrics.skippedCount, 2);
  assert.equal(metrics.failedCount, 1);
  assert.equal(metrics.journalSyncedCount, 4);

  const recoverable = await store.listRecoverable(10);
  assert.equal(recoverable.length, 1);
  assert.equal(recoverable[0]?.objectId, "obj_fail_1");
  assert.equal(recoverable[0]?.status, "retryable_failure");
});

test("FileJournalStore persists entries atomically, rejects duplicate operationId, enforces CAS, and recovers dead-PID stale locks", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { FileJournalStore, withFileLock } = await import("../src/utils/deletionJournal");

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "tehran-radar-journal-"));
  try {
    const store = new FileJournalStore(tempDir);
    const entry = makeEntry();

    await createJournalOperation(store, entry);
    await assert.rejects(createJournalOperation(store, entry), /DUPLICATE_OPERATION_ID/);

    const running = await transitionJournalOperation(store, entry.operationId, 0, "running", {
      incrementAttempt: true,
      leaseOwner: "worker_file_01",
      leaseExpiresAt: "2026-10-29T10:05:00.000Z",
    });
    assert.equal(running.revision, 1);
    assert.equal(running.status, "running");

    // Manual review transition and recovery back to queued/running
    const review = await transitionJournalOperation(store, entry.operationId, 1, "manual_review", {
      errorCode: "OPERATOR_INSPECTION_REQUIRED",
    });
    assert.equal(review.status, "manual_review");
    const requeued = await transitionJournalOperation(store, entry.operationId, 2, "queued");
    assert.equal(requeued.status, "queued");

    // Dead PID stale lock file is reclaimed safely even before staleMs
    const lockPath = path.join(tempDir, `${entry.operationId}.json.lock`);
    await fs.promises.writeFile(
      lockPath,
      JSON.stringify({ pid: 99999999, host: os.hostname(), createdAtMs: Date.now() }),
      { mode: 0o600 }
    );
    const resumed = await transitionJournalOperation(store, entry.operationId, 3, "running");
    assert.equal(resumed.revision, 4);

    // Live PID lock is NEVER stolen even if backdated past staleMs
    const liveLockPath = path.join(tempDir, "live-lock.test.lock");
    await fs.promises.writeFile(
      liveLockPath,
      JSON.stringify({ pid: process.pid, host: os.hostname(), createdAtMs: Date.now() - 600_000 }),
      { mode: 0o600 }
    );
    await assert.rejects(
      withFileLock(liveLockPath, async () => "should-not-acquire", { timeoutMs: 80, retryDelayMs: 15, leaseMs: 50 }),
      /FILE_LOCK_TIMEOUT/
    );
    await fs.promises.unlink(liveLockPath).catch(() => {});

    // Corrupted JSON record is detected and rejected on get()
    const corruptPath = path.join(tempDir, "corrupt_op_12345.json");
    await fs.promises.writeFile(corruptPath, "{corrupt_json", "utf-8");
    await assert.rejects(store.get("corrupt_op_12345"), /CORRUPTED_JOURNAL_RECORD/);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});

test("claimRecoverableJournalOperation enforces lease exclusivity, recovers expired leases, resumes remote_deleted at local_delete_pending, and dead-letters after maxAttempts", async () => {
  const { claimRecoverableJournalOperation, isJournalLeaseActive } = await import(
    "../src/utils/deletionJournal"
  );
  const store = new MemoryJournalStore();
  const entry = makeEntry();
  await createJournalOperation(store, entry);

  const now1 = new Date("2026-10-29T10:01:00.000Z");
  const claimA = await claimRecoverableJournalOperation(store, entry.operationId, {
    workerId: "worker_alpha",
    leaseDurationMs: 30_000,
    maxAttempts: 3,
    now: now1,
  });
  assert.equal(claimA.claimed, true);
  assert.equal(claimA.reason, "CLAIMED");
  assert.equal(claimA.entry?.status, "running");
  assert.equal(claimA.entry?.attemptCount, 1);
  assert.equal(isJournalLeaseActive(claimA.entry!, new Date("2026-10-29T10:01:10.000Z")), true);

  // Worker Beta cannot steal an active lease
  const claimBBlocked = await claimRecoverableJournalOperation(store, entry.operationId, {
    workerId: "worker_beta",
    leaseDurationMs: 30_000,
    maxAttempts: 3,
    now: new Date("2026-10-29T10:01:15.000Z"),
  });
  assert.equal(claimBBlocked.claimed, false);
  assert.equal(claimBBlocked.reason, "LEASE_HELD_BY_OTHER");

  // After Worker Alpha crashes and lease expires, Worker Beta reclaims safely
  const claimBTakeover = await claimRecoverableJournalOperation(store, entry.operationId, {
    workerId: "worker_beta",
    leaseDurationMs: 30_000,
    maxAttempts: 3,
    now: new Date("2026-10-29T10:02:00.000Z"),
  });
  assert.equal(claimBTakeover.claimed, true);
  assert.equal(claimBTakeover.entry?.leaseOwner, "worker_beta");
  assert.equal(claimBTakeover.entry?.attemptCount, 2);

  // Transition to remote_deleted and simulate worker crash (lease expired)
  const remotePending = await transitionJournalOperation(
    store,
    entry.operationId,
    claimBTakeover.entry!.revision,
    "remote_delete_pending",
    {
      leaseOwner: "worker_beta",
      leaseExpiresAt: "2026-10-29T10:02:30.000Z",
    }
  );
  await transitionJournalOperation(
    store,
    entry.operationId,
    remotePending.revision,
    "remote_deleted",
    {
      leaseOwner: "worker_beta",
      leaseExpiresAt: "2026-10-29T10:02:30.000Z",
    }
  );

  // Recovery after remote_deleted resumes directly at local_delete_pending
  const claimAfterRemote = await claimRecoverableJournalOperation(store, entry.operationId, {
    workerId: "worker_gamma",
    leaseDurationMs: 30_000,
    maxAttempts: 3,
    now: new Date("2026-10-29T10:03:00.000Z"),
  });
  assert.equal(claimAfterRemote.claimed, true);
  assert.equal(claimAfterRemote.entry?.status, "local_delete_pending");

  // Exceeding maxAttempts on retryable_failure transitions to dead-letter manual_review
  const retryFailEntry = createDeletionJournalEntry({
    operationId: "del_op_deadletter_001",
    objectId: "media_dl_001",
    objectKey: "uploads/2026/10/media_dl_001.jpg",
    now: now1,
  });
  await createJournalOperation(store, retryFailEntry);
  for (let i = 0; i < 2; i++) {
    const c = await claimRecoverableJournalOperation(store, retryFailEntry.operationId, {
      workerId: "worker_retry",
      leaseDurationMs: 5_000,
      maxAttempts: 2,
      now: new Date(now1.getTime() + i * 10_000),
    });
    assert.equal(c.claimed, true);
    await transitionJournalOperation(
      store,
      retryFailEntry.operationId,
      c.entry!.revision,
      "retryable_failure",
      { errorCode: "S3_TIMEOUT" }
    );
  }
  const deadLettered = await claimRecoverableJournalOperation(store, retryFailEntry.operationId, {
    workerId: "worker_retry",
    leaseDurationMs: 5_000,
    maxAttempts: 2,
    now: new Date(now1.getTime() + 30_000),
  });
  assert.equal(deadLettered.claimed, false);
  assert.equal(deadLettered.reason, "DEAD_LETTERED_MANUAL_REVIEW");
  assert.equal(deadLettered.entry?.status, "manual_review");
});

test("serverDeliveryAndAbuseGuard enforces canonical redirects, static asset cache tiers, account quotas, and abuse cooldowns", async () => {
  const {
    checkAccountQuota,
    checkRateLimit,
    classifyStaticAssetCachePolicy,
    isIpInAbuseCooldown,
    isLegitimateCrawlerRequest,
    isStaticAssetPath,
    recordAbuseSignal,
    resetRateLimitStateForTests,
    resolveApiCacheControlHeader,
    resolveCanonicalRedirectUrl,
  } = await import("../src/utils/serverDeliveryAndAbuseGuard");

  resetRateLimitStateForTests();

  assert.equal(
    classifyStaticAssetCachePolicy("/assets/index-D8f9a1b2.js").cacheControl,
    "public, max-age=31536000, immutable"
  );
  assert.equal(
    classifyStaticAssetCachePolicy("/index.html").cacheControl,
    "no-cache, no-store, must-revalidate"
  );
  assert.equal(
    classifyStaticAssetCachePolicy("/sitemap.xml").cacheControl,
    "public, max-age=3600, stale-while-revalidate=86400"
  );
  assert.equal(isStaticAssetPath("/assets/missing-bundle-123456.js"), true);
  assert.equal(isStaticAssetPath("/?city=karaj&hood=101"), false);

  const wwwRedirect = resolveCanonicalRedirectUrl(
    {
      method: "GET",
      path: "/",
      originalUrl: "/?city=tehran",
      protocol: "https",
      headers: { host: "www.tehranradar.ir", "x-forwarded-proto": "https" },
    } as any,
    "https://tehranradar.ir",
    "production"
  );
  assert.equal(wwwRedirect, "https://tehranradar.ir/?city=tehran");

  const httpRedirect = resolveCanonicalRedirectUrl(
    {
      method: "GET",
      path: "/",
      originalUrl: "/",
      protocol: "http",
      headers: { host: "tehranradar.ir", "x-forwarded-proto": "http" },
    } as any,
    "https://tehranradar.ir",
    "production"
  );
  assert.equal(httpRedirect, "https://tehranradar.ir/");

  assert.equal(
    resolveApiCacheControlHeader({
      method: "GET",
      path: "/api/market-pulse",
      query: {},
      headers: {},
    } as any),
    "public, max-age=30, stale-while-revalidate=60"
  );
  assert.equal(
    resolveApiCacheControlHeader({
      method: "GET",
      path: "/api/market-pulse",
      query: {},
      headers: { authorization: "Bearer secret_jwt" },
    } as any),
    "private, no-store, no-cache, must-revalidate"
  );

  const now = 1_700_000_000_000;
  assert.equal(checkAccountQuota("uid_test_1", "buyer_alert", 2, 60_000, now), true);
  assert.equal(checkAccountQuota("uid_test_1", "buyer_alert", 2, 60_000, now + 100), true);
  assert.equal(checkAccountQuota("uid_test_1", "buyer_alert", 2, 60_000, now + 200), false);

  for (let i = 0; i < 5; i++) {
    recordAbuseSignal("203.0.113.55", "auth_failure", now + i * 100);
  }
  const cooldown = isIpInAbuseCooldown("203.0.113.55", now + 600);
  assert.equal(cooldown.blocked, true);
  assert.equal(checkRateLimit("203.0.113.55", "general", 180, 60_000, now + 600), false);

  assert.equal(
    isLegitimateCrawlerRequest({
      method: "GET",
      path: "/sitemap.xml",
      headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
    } as any),
    true
  );

  resetRateLimitStateForTests();
});




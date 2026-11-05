import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteStoredObjectSafely,
  isValidDeletePhase,
  normalizeLegacyDeletionState,
  type DeleteDependencies,
  type DeleteRecord,
} from "../src/utils/objectStorageDeleteCoordinator";

function makeFixture() {
  const records = new Map<string, DeleteRecord>();

  records.set("media_001", {
    id: "media_001",
    objectKey: "media/2026/media_001.jpg",
    localFileName: "media_001.jpg",
    ownerUid: "user_001",
    bargainId: "bargain_001",
    remoteS3Synced: true,
    deletionState: "active",
  });

  let remoteDeleteCalls = 0;
  let localDeleteCalls = 0;

  const dependencies: DeleteDependencies = {
    async readRecord(id) {
      return records.get(id) ?? null;
    },

    async persistRecord(record) {
      records.set(record.id, { ...record });
    },

    async deleteRemote() {
      remoteDeleteCalls += 1;
    },

    async deleteLocal() {
      localDeleteCalls += 1;
    },

    async isBargainEligibleForDeletion() {
      return true;
    },
  };

  return {
    records,
    dependencies,
    get remoteDeleteCalls() {
      return remoteDeleteCalls;
    },
    get localDeleteCalls() {
      return localDeleteCalls;
    },
  };
}

test("remote deletion failure does not delete local data", async () => {
  const fixture = makeFixture();

  fixture.dependencies.deleteRemote = async () => {
    throw Object.assign(
      new Error("Remote service unavailable"),
      {
        code: "SERVICE_UNAVAILABLE",
      }
    );
  };

  const result = await deleteStoredObjectSafely(
    "media_001",
    fixture.dependencies,
    {
      expectedBargainId: "bargain_001",
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.state, "pending_delete");
  assert.equal(result.retryable, true);

  assert.equal(fixture.localDeleteCalls, 0);

  assert.equal(
    fixture.records.get("media_001")?.deletionState,
    "pending_delete"
  );
});

test("association mismatch blocks deletion before any destructive action", async () => {
  const fixture = makeFixture();

  const result = await deleteStoredObjectSafely(
    "media_001",
    fixture.dependencies,
    {
      expectedBargainId: "different_bargain",
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "ASSOCIATION_MISMATCH");

  assert.equal(fixture.remoteDeleteCalls, 0);
  assert.equal(fixture.localDeleteCalls, 0);
});

test("successful deletion persists final state", async () => {
  const fixture = makeFixture();

  const result = await deleteStoredObjectSafely(
    "media_001",
    fixture.dependencies,
    {
      expectedBargainId: "bargain_001",
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.state, "deleted");

  assert.equal(fixture.remoteDeleteCalls, 1);
  assert.equal(fixture.localDeleteCalls, 1);

  assert.equal(
    fixture.records.get("media_001")?.deletionState,
    "deleted"
  );
});

test("local deletion failure remains recoverable", async () => {
  const fixture = makeFixture();

  fixture.dependencies.deleteLocal = async () => {
    throw Object.assign(
      new Error("Permission denied"),
      { code: "EACCES" }
    );
  };

  const result = await deleteStoredObjectSafely(
    "media_001",
    fixture.dependencies,
    {
      expectedBargainId: "bargain_001",
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.state, "local_cleanup_pending");
  assert.equal(fixture.localDeleteCalls, 0);

  assert.equal(
    fixture.records.get("media_001")?.deletionState,
    "local_cleanup_pending"
  );
});

test("missing records are not treated as successful deletion", async () => {
  const fixture = makeFixture();

  const result = await deleteStoredObjectSafely(
    "does_not_exist",
    fixture.dependencies,
    {
      allowUnattached: true,
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "RECORD_NOT_FOUND");
  assert.equal(fixture.localDeleteCalls, 0);
});

test("already deleted records are idempotent", async () => {
  const fixture = makeFixture();

  fixture.records.set("media_001", {
    ...fixture.records.get("media_001")!,
    deletionState: "deleted",
  });

  const result = await deleteStoredObjectSafely(
    "media_001",
    fixture.dependencies,
    {
      expectedBargainId: "bargain_001",
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.state, "deleted");

  assert.equal(fixture.remoteDeleteCalls, 0);
  assert.equal(fixture.localDeleteCalls, 0);
});

test("legacy records without deletionState are interpreted as active and not auto-deleted", async () => {
  const fixture = makeFixture();

  const legacyRecord: DeleteRecord = {
    id: "media_001",
    objectKey: "media/2026/media_001.jpg",
    localFileName: "media_001.jpg",
    ownerUid: "user_001",
    bargainId: "bargain_001",
    remoteS3Synced: true,
  };
  fixture.records.set("media_001", legacyRecord);

  assert.equal(normalizeLegacyDeletionState(legacyRecord.deletionState), "active");
  assert.equal(isValidDeletePhase("remote_deleted"), true);
  assert.equal(isValidDeletePhase("local_cleanup_pending"), true);
  assert.equal(isValidDeletePhase("invalid_phase"), false);

  const result = await deleteStoredObjectSafely(
    "media_001",
    fixture.dependencies,
    {
      expectedBargainId: "bargain_001",
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.state, "deleted");
  assert.equal(fixture.remoteDeleteCalls, 1);
  assert.equal(fixture.localDeleteCalls, 1);
});

test("concurrent delete requests on the same objectId are serialized without conflicting state", async () => {
  const fixture = makeFixture();

  let remoteDeleteCount = 0;
  fixture.dependencies.deleteRemote = async () => {
    remoteDeleteCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
  };

  const [first, second] = await Promise.all([
    deleteStoredObjectSafely("media_001", fixture.dependencies, {
      expectedBargainId: "bargain_001",
    }),
    deleteStoredObjectSafely("media_001", fixture.dependencies, {
      expectedBargainId: "bargain_001",
    }),
  ]);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(remoteDeleteCount, 1);
  assert.equal(fixture.localDeleteCalls, 1);
  assert.equal(fixture.records.get("media_001")?.deletionState, "deleted");
});

test("reverse failure: remote S3 delete succeeds but remote_deleted state persistence fails, and retry from remote_deleted skips redundant remote S3 call", async () => {
  const fixture = makeFixture();

  let persistAttempt = 0;
  const basePersist = fixture.dependencies.persistRecord;
  fixture.dependencies.persistRecord = async (nextRecord) => {
    persistAttempt += 1;
    // Fail on Step 2b (persisting remote_deleted after remote delete succeeded)
    if (persistAttempt === 2 && nextRecord.deletionState === "remote_deleted") {
      throw new Error("DISK_WRITE_INTERRUPTED");
    }
    await basePersist(nextRecord);
  };

  const firstAttempt = await deleteStoredObjectSafely(
    "media_001",
    fixture.dependencies,
    { expectedBargainId: "bargain_001" }
  );

  assert.equal(firstAttempt.ok, false);
  assert.equal(firstAttempt.errorCode, "REMOTE_STATE_PERSIST_FAILED");
  assert.equal(firstAttempt.retryable, true);
  assert.equal(fixture.remoteDeleteCalls, 1);
  // Crucial invariant: local file was NOT deleted because remote_deleted state was not durably persisted
  assert.equal(fixture.localDeleteCalls, 0);

  // Now simulate a record already persisted in remote_deleted state (e.g. crash before local cleanup)
  fixture.dependencies.persistRecord = basePersist;
  const currentRec = fixture.records.get("media_001")!;
  fixture.records.set("media_001", {
    ...currentRec,
    remoteS3Synced: true,
    deletionState: "remote_deleted",
  });

  const resumedAttempt = await deleteStoredObjectSafely(
    "media_001",
    fixture.dependencies,
    { expectedBargainId: "bargain_001" }
  );

  assert.equal(resumedAttempt.ok, true);
  assert.equal(resumedAttempt.state, "deleted");
  // Remote S3 delete was NOT called a second time because state was already remote_deleted
  assert.equal(fixture.remoteDeleteCalls, 1);
  assert.equal(fixture.localDeleteCalls, 1);
});


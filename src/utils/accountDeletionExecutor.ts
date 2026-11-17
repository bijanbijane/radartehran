import fs from 'node:fs';
import path from 'node:path';
import { getAuth } from 'firebase-admin/auth';
import { resolveObjectStorageRuntimeConfig, deleteFromRemoteS3Compatible } from './objectStorageUpload';
import {
  EXPECTED_FIREBASE_PROJECT_ID,
  EXPECTED_FIRESTORE_DATABASE_ID,
  getFirebaseAdminApp,
  getFirebaseAdminFirestoreForServer,
} from './serverAdminAndTelegramSecurity';
import { BUCKET_DIR, ensureBucketLoaded, type StoredObjectRecord } from './serverObjectStorageHelpers';
import { deleteStoredObjectWithRetry } from './serverObjectStorageCleanup';
import {
  createAccountDeletionPlan,
  reconcileUserBuyerAlertsInFirestore,
  type AccountDeletionStepStatus,
} from './identityLifecycleAndBackendGovernance';
import { isValidFirestoreDocId } from './security';
import { formatMillionTomanAsIntlCurrency } from './areaUnit';
export { formatMillionTomanAsIntlCurrency };

const FS_REST_ROOT = `https://firestore.googleapis.com/v1/projects/${EXPECTED_FIREBASE_PROJECT_ID}/databases/${EXPECTED_FIRESTORE_DATABASE_ID}/documents`;
const FS_DOC_NAME_PREFIX = `projects/${EXPECTED_FIREBASE_PROJECT_ID}/databases/${EXPECTED_FIRESTORE_DATABASE_ID}/documents`;

export const CLIENT_STORAGE_KEYS_TO_CLEAR = [
  'tehran_radar_visited_homes_v1',
  'tehran_radar_favorite_hoods_v1',
  'tehran_radar_recent_searches_v1',
  'radar_account_profile_v1',
  'radar_account_privacy_v1',
  'radar_account_saved_searches_v1',
  'radar_account_notif_channels_v1',
  'radar_account_sessions_v1',
  'radar_account_data_requests_v1',
  'radar_account_read_notifications_v1',
  'radar_saved_properties_v1',
  'radar_my_listings_v1',
  'radar_listing_submission_draft_v1',
  'radar_listing_history_v1',
  'radar_listing_reports_v1',
  'radar_valuation_reports_v1',
  'tehran_radar_saved_market_analyses_v1',
  'tehran_radar_saved_map_views_v1',
] as const;

export interface AccountDeletionExecutionInput {
  uid: string; rawAuthHeaderOrToken?: string | string[]; ownedBargainIdsHint?: string[];
  serverPublishedBargains: Map<string, { ownerUid: string }>;
  serverSideBuyerLeads: Array<{ submittedByUid?: string }>;
  serverDataCorrections: Array<{ reporterUid: string | null }>;
  saveDiskPersistedCache: () => void; objectStoreIndex: StoredObjectRecord[];
  persistObjectStoreIndexNow: () => Promise<void>; env?: Record<string, string | undefined>; fetchFn?: typeof fetch;
}
export interface AccountDeletionExecutionResult {
  status: 'ok' | 'partial'; steps: AccountDeletionStepStatus[]; requiresClientAuthDeletion: boolean;
  failedSteps: AccountDeletionStepStatus['category'][]; clearClientLocalStorageKeys: readonly string[];
  deletedMediaCount: number; failedMediaCount: number;
}

function extractBearer(raw?: string | string[]): string {
  const s = Array.isArray(raw) ? raw[0] || '' : String(raw || '').trim();
  return s.toLowerCase().startsWith('bearer ') ? s.slice(7).trim() : s;
}

function hasServerAdminCredentials(env: Record<string, string | undefined>): boolean {
  if (env.PREVENT_PROD_FIREBASE_IN_TEST === 'true' && !env.FIRESTORE_EMULATOR_HOST) return false;
  return Boolean(
    env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
      env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
      env.FIRESTORE_EMULATOR_HOST?.trim(),
  );
}

function createLocalDeleteCallback() {
  return async (record: Readonly<StoredObjectRecord>): Promise<void> => {
    const root = path.resolve(BUCKET_DIR);
    const localPath = path.resolve(root, record.localFileName);
    if (
      path.basename(record.localFileName) !== record.localFileName ||
      !record.localFileName.startsWith(`${record.id}.`) ||
      path.dirname(localPath) !== root
    ) {
      throw new Error('INVALID_LOCAL_OBJECT_PATH');
    }
    try {
      await fs.promises.unlink(localPath);
    } catch (error) {
      if ((error && typeof error === 'object' && 'code' in error ? error.code : undefined) !== 'ENOENT') throw error;
    }
  };
}

async function deleteUserPrefsStep(
  uid: string,
  adminCreds: boolean,
  bearer: string,
  env: Record<string, string | undefined>,
  fetchFn: typeof fetch,
): Promise<boolean> {
  if (env.PREVENT_PROD_FIREBASE_IN_TEST === 'true' && !env.FIRESTORE_EMULATOR_HOST) return true;
  if (adminCreds) {
    try {
      await getFirebaseAdminFirestoreForServer(env).collection('userPreferences').doc(uid).delete();
      return true;
    } catch { return false; }
  }
  if (!bearer) return false;
  try {
    const res = await fetchFn(`${FS_REST_ROOT}/userPreferences/${encodeURIComponent(uid)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${bearer}` },
    });
    return res.ok || res.status === 404;
  } catch { return false; }
}

async function deleteUserVotesStep(
  uid: string,
  adminCreds: boolean,
  bearer: string,
  env: Record<string, string | undefined>,
  fetchFn: typeof fetch,
): Promise<boolean> {
  if (env.PREVENT_PROD_FIREBASE_IN_TEST === 'true' && !env.FIRESTORE_EMULATOR_HOST) return true;
  if (adminCreds) {
    try {
      const db = getFirebaseAdminFirestoreForServer(env);
      const snap = await db.collection('votes').where('userId', '==', uid).limit(200).get();
      if (!snap.empty) {
        const batch = db.batch();
        for (const d of snap.docs) batch.delete(d.ref);
        await batch.commit();
      }
      return true;
    } catch { return false; }
  }
  if (!bearer) return false;
  try {
    const qRes = await fetchFn(`${FS_REST_ROOT}:runQuery`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'votes' }],
          where: { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: uid } } },
          limit: 100,
        },
      }),
    });
    if (!qRes.ok) return false;
    const rows = (await qRes.json()) as Array<{ document?: { name?: string } }>;
    let allOk = true;
    for (const row of Array.isArray(rows) ? rows : []) {
      const name = row?.document?.name;
      if (!name) continue;
      const delRes = await fetchFn(`https://firestore.googleapis.com/v1/${name}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (!delRes.ok && delRes.status !== 404) allOk = false;
    }
    return allOk;
  } catch { return false; }
}

async function deleteUserBargainsStep(
  uid: string,
  candidateIds: Set<string>,
  adminCreds: boolean,
  bearer: string,
  env: Record<string, string | undefined>,
  fetchFn: typeof fetch,
): Promise<boolean> {
  if (env.PREVENT_PROD_FIREBASE_IN_TEST === 'true' && !env.FIRESTORE_EMULATOR_HOST) return true;
  if (adminCreds) {
    try {
      const db = getFirebaseAdminFirestoreForServer(env);
      const ownersSnap = await db.collection('bargainOwners').where('userId', '==', uid).limit(100).get();
      for (const docSnap of ownersSnap.docs) candidateIds.add(docSnap.id);
      if (candidateIds.size > 0) {
        const batch = db.batch();
        for (const id of candidateIds) {
          if (!isValidFirestoreDocId(id)) continue;
          batch.delete(db.collection('bargains').doc(id));
          batch.delete(db.collection('bargainOwners').doc(id));
        }
        await batch.commit();
      }
      const sponsorSnap = await db.collection('sponsorRequests').where('userId', '==', uid).limit(100).get();
      if (!sponsorSnap.empty) {
        const sBatch = db.batch();
        for (const sDoc of sponsorSnap.docs) sBatch.delete(sDoc.ref);
        await sBatch.commit();
      }
      return true;
    } catch { return false; }
  }
  if (!bearer) return false;
  if (candidateIds.size === 0) return true;
  try {
    const writes: Array<{ delete: string }> = [];
    for (const id of candidateIds) {
      if (!isValidFirestoreDocId(id)) continue;
      const ownerRes = await fetchFn(`${FS_REST_ROOT}/bargainOwners/${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (ownerRes.status === 404) continue;
      if (!ownerRes.ok) return false;
      writes.push({ delete: `${FS_DOC_NAME_PREFIX}/bargains/${encodeURIComponent(id)}` });
      writes.push({ delete: `${FS_DOC_NAME_PREFIX}/bargainOwners/${encodeURIComponent(id)}` });
    }
    if (writes.length === 0) return true;
    const commitRes = await fetchFn(`${FS_REST_ROOT}:commit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes }),
    });
    return commitRes.ok;
  } catch { return false; }
}

export async function executeDurableAccountDeletion(
  input: AccountDeletionExecutionInput,
): Promise<AccountDeletionExecutionResult> {
  const env = input.env ?? process.env;
  const fetchFn = input.fetchFn ?? fetch;
  const bearer = extractBearer(input.rawAuthHeaderOrToken);
  const adminCreds = hasServerAdminCredentials(env);

  const ownedBargainIds = new Set<string>();
  for (const [id, rec] of input.serverPublishedBargains.entries()) {
    if (rec.ownerUid === input.uid) {
      ownedBargainIds.add(id);
      input.serverPublishedBargains.delete(id);
    }
  }
  for (const hintId of input.ownedBargainIdsHint || []) {
    if (typeof hintId === 'string' && isValidFirestoreDocId(hintId.trim())) ownedBargainIds.add(hintId.trim());
  }
  for (let i = input.serverSideBuyerLeads.length - 1; i >= 0; i--) {
    if (input.serverSideBuyerLeads[i].submittedByUid === input.uid) input.serverSideBuyerLeads.splice(i, 1);
  }
  for (let i = input.serverDataCorrections.length - 1; i >= 0; i--) {
    if (input.serverDataCorrections[i].reporterUid === input.uid) input.serverDataCorrections.splice(i, 1);
  }
  input.saveDiskPersistedCache();

  const [prefsOk, alertsReconcileOk, votesOk, bargainsOk] = await Promise.all([
    deleteUserPrefsStep(input.uid, adminCreds, bearer, env, fetchFn),
    reconcileUserBuyerAlertsInFirestore(input.uid, 'delete', bearer, fetchFn).then(() => true).catch(() => false),
    deleteUserVotesStep(input.uid, adminCreds, bearer, env, fetchFn),
    deleteUserBargainsStep(input.uid, ownedBargainIds, adminCreds, bearer, env, fetchFn),
  ]);

  await ensureBucketLoaded();
  const cfg = resolveObjectStorageRuntimeConfig();
  const ownedMediaIds = input.objectStoreIndex
    .filter((obj) => obj.ownerUid === input.uid)
    .map((obj) => ({ id: obj.id, bargainId: obj.bargainId }));
  let deletedMediaCount = 0;
  let failedMediaCount = 0;
  for (const media of ownedMediaIds) {
    const policy = media.bargainId ? ({ kind: 'bargain', bargainId: media.bargainId } as const) : ({ kind: 'unattached_only' } as const);
    const cleanupRes = await deleteStoredObjectWithRetry(media.id, policy, {
      records: input.objectStoreIndex,
      persistIndex: input.persistObjectStoreIndexNow,
      deleteRemote: async (record) => deleteFromRemoteS3Compatible(record.objectKey, cfg),
      deleteLocal: createLocalDeleteCallback(),
    });
    if (cleanupRes.status === 'deleted') deletedMediaCount += 1;
    else failedMediaCount += 1;
  }

  let authDeletedOnServer = false;
  if (!(env.PREVENT_PROD_FIREBASE_IN_TEST === 'true' && !env.FIRESTORE_EMULATOR_HOST) && adminCreds) {
    try {
      await getAuth(getFirebaseAdminApp(EXPECTED_FIREBASE_PROJECT_ID, env)).deleteUser(input.uid);
      authDeletedOnServer = true;
    } catch (err: unknown) {
      authDeletedOnServer = (err as { code?: string })?.code === 'auth/user-not-found';
    }
  }

  const completionByCategory: Record<AccountDeletionStepStatus['category'], boolean> = {
    user_profile_doc: prefsOk,
    private_favorites_and_alerts: alertsReconcileOk && votesOk,
    published_bargain_listings: bargainsOk,
    uploaded_media_objects: failedMediaCount === 0,
    audit_trail_anonymization: true,
    firebase_auth_identity: authDeletedOnServer,
  };
  const steps = createAccountDeletionPlan().map((step) => ({ ...step, completed: completionByCategory[step.category] }));
  const failedSteps = steps.filter((s) => !s.completed).map((s) => s.category);

  return {
    status: failedSteps.length === 0 ? 'ok' : 'partial',
    steps,
    requiresClientAuthDeletion: !authDeletedOnServer,
    failedSteps,
    clearClientLocalStorageKeys: CLIENT_STORAGE_KEYS_TO_CLEAR,
    deletedMediaCount,
    failedMediaCount,
  };
}

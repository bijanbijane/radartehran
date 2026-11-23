/**
 * Supplemental Firestore erasure steps not yet modeled as domain adapters (Phase A bridge).
 */

import { getAuth } from 'firebase-admin/auth';
import {
  getFirebaseAdminFirestoreForServer,
  getFirebaseAdminApp,
  EXPECTED_FIREBASE_PROJECT_ID,
  EXPECTED_FIRESTORE_DATABASE_ID,
} from '../../../src/utils/serverAdminAndTelegramSecurity';
import { isValidFirestoreDocId } from '../../../src/utils/security';
import { reconcileUserBuyerAlertsInFirestore } from '../../../src/utils/identityLifecycleAndBackendGovernance';

const FS_REST_ROOT = `https://firestore.googleapis.com/v1/projects/${EXPECTED_FIREBASE_PROJECT_ID}/databases/${EXPECTED_FIRESTORE_DATABASE_ID}/documents`;
const FS_DOC_NAME_PREFIX = `projects/${EXPECTED_FIREBASE_PROJECT_ID}/databases/${EXPECTED_FIRESTORE_DATABASE_ID}/documents`;

export interface LegacyFirestoreSupplementInput {
  uid: string;
  rawAuthHeaderOrToken?: string | string[];
  ownedBargainIdsHint?: string[];
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
}

export interface LegacyFirestoreSupplementResult {
  userPrefsOk: boolean;
  votesOk: boolean;
  firestoreBargainsOk: boolean;
  alertsReconcileOk: boolean;
  authDeletedOnServer: boolean;
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
    } catch {
      return false;
    }
  }
  if (!bearer) return false;
  try {
    const res = await fetchFn(`${FS_REST_ROOT}/userPreferences/${encodeURIComponent(uid)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${bearer}` },
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
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
    } catch {
      return false;
    }
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
  } catch {
    return false;
  }
}

async function deleteUserFirestoreBargainsStep(
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
    } catch {
      return false;
    }
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
  } catch {
    return false;
  }
}

export async function runLegacyFirestoreDeletionSupplement(
  input: LegacyFirestoreSupplementInput,
): Promise<LegacyFirestoreSupplementResult> {
  const env = input.env ?? process.env;
  const fetchFn = input.fetchFn ?? fetch;
  const bearer = extractBearer(input.rawAuthHeaderOrToken);
  const adminCreds = hasServerAdminCredentials(env);

  const candidateIds = new Set<string>();
  for (const hintId of input.ownedBargainIdsHint ?? []) {
    if (typeof hintId === 'string' && isValidFirestoreDocId(hintId.trim())) {
      candidateIds.add(hintId.trim());
    }
  }

  let alertsReconcileOk = true;
  try {
    await reconcileUserBuyerAlertsInFirestore(input.uid, 'delete', bearer, fetchFn);
  } catch {
    alertsReconcileOk = false;
  }

  const [userPrefsOk, votesOk, firestoreBargainsOk] = await Promise.all([
    deleteUserPrefsStep(input.uid, adminCreds, bearer, env, fetchFn),
    deleteUserVotesStep(input.uid, adminCreds, bearer, env, fetchFn),
    deleteUserFirestoreBargainsStep(input.uid, candidateIds, adminCreds, bearer, env, fetchFn),
  ]);

  let authDeletedOnServer = false;
  if (!(env.PREVENT_PROD_FIREBASE_IN_TEST === 'true' && !env.FIRESTORE_EMULATOR_HOST) && adminCreds) {
    try {
      await getAuth(getFirebaseAdminApp(EXPECTED_FIREBASE_PROJECT_ID, env)).deleteUser(input.uid);
      authDeletedOnServer = true;
    } catch (err: unknown) {
      authDeletedOnServer = (err as { code?: string })?.code === 'auth/user-not-found';
    }
  }

  return {
    userPrefsOk,
    votesOk,
    firestoreBargainsOk,
    alertsReconcileOk,
    authDeletedOnServer,
  };
}
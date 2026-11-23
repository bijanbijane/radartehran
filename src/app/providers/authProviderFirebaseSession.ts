/**
 * RT-FE-NAVIGATION-017 — Firebase auth/token listeners with stale-session guards (no token logging).
 */
import { onAuthStateChanged, onIdTokenChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '../../firebase';
import {
  AuthClient,
  bootstrapAuthSession,
  resolveAuthUserSnapshotFromFirebaseUser,
} from '../../platform/auth';

export function subscribeFirebaseAuthSession(params: {
  client: AuthClient;
  getGeneration: () => number;
  bumpGeneration: () => number;
}): () => void {
  const { client, getGeneration, bumpGeneration } = params;

  const runTokenRefreshFlow = async (fbUser: FirebaseUser, generation: number) => {
    const prior = client.getState();
    if (prior === 'READY' || prior === 'TOKEN_REFRESHING' || prior === 'REAUTH_REQUIRED') {
      client.transition('TOKEN_REFRESHING');
    }
    try {
      const snapshot = await resolveAuthUserSnapshotFromFirebaseUser(fbUser);
      if (generation !== getGeneration()) return;
      if (auth.currentUser?.uid !== fbUser.uid) return;
      client.updateUserSnapshot(snapshot);
      client.transition('READY', { reason: 'token_claims_refreshed' });
    } catch {
      if (generation !== getGeneration()) return;
      if (auth.currentUser?.uid !== fbUser.uid) return;
      client.transition('SESSION_EXPIRED', { reason: 'Token refresh claim resolution failed' });
    }
  };

  const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
    void (async () => {
      const generation = bumpGeneration();
      if (!fbUser) {
        await bootstrapAuthSession(null, { client });
        return;
      }
      try {
        const snapshot = await resolveAuthUserSnapshotFromFirebaseUser(fbUser);
        if (generation !== getGeneration()) return;
        if (auth.currentUser?.uid !== fbUser.uid) return;
        await bootstrapAuthSession(snapshot, { client });
      } catch {
        if (generation !== getGeneration()) return;
        if (auth.currentUser?.uid !== fbUser.uid) return;
        client.transition('ACCESS_DENIED', { reason: 'Failed to resolve ID token claims' });
      }
    })();
  });

  const unsubToken = onIdTokenChanged(auth, (fbUser) => {
    if (!fbUser) return;
    const lifecycle = client.getState();
    if (lifecycle !== 'READY' && lifecycle !== 'TOKEN_REFRESHING' && lifecycle !== 'REAUTH_REQUIRED') {
      return;
    }
    const generation = bumpGeneration();
    void runTokenRefreshFlow(fbUser, generation);
  });

  return () => {
    unsubAuth();
    unsubToken();
  };
}
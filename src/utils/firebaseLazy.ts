/**
 * @file src/utils/firebaseLazy.ts
 * @description Deferred Firebase client loader for routes and hooks that must not
 * pull Firebase Auth/Firestore into the initial application bundle.
 */
type FirebaseClientModule = typeof import('../firebase');
type FirebaseAuthModule = typeof import('firebase/auth');
type FirebaseFirestoreModule = typeof import('firebase/firestore');

export type LazyFirebaseClient = FirebaseClientModule & FirebaseAuthModule & FirebaseFirestoreModule;

let firebaseClientPromise: Promise<LazyFirebaseClient> | null = null;

export function loadFirebaseClient(): Promise<LazyFirebaseClient> {
  if (!firebaseClientPromise) {
    firebaseClientPromise = Promise.all([
      import('../firebase'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ])
      .then(([client, auth, firestore]) => ({
        ...client,
        ...auth,
        ...firestore,
      }) as LazyFirebaseClient)
      .catch((error) => {
        firebaseClientPromise = null;
        throw error;
      });
  }
  return firebaseClientPromise;
}

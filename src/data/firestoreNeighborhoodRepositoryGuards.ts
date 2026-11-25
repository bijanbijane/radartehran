const REPAIRABLE_COLLECTIONS: ReadonlySet<string> = new Set([
  'neighborhoodOverrides',
  'bargains',
  'votes',
  'sponsorRequests',
  'buyerAlerts',
]);

/**
 * Pure target validation shared by Firestore repair and quarantine-delete operations.
 * Kept outside the Firebase repository module so callers can validate targets without
 * initializing a Firestore client or opening a network-backed service.
 */
export function isAllowedFirestoreNeighborhoodDocument(
  collectionName: string,
  docId: unknown,
): docId is string {
  if (typeof docId !== 'string' || !docId.trim() || docId.includes('/')) return false;
  if (docId.startsWith('sim_')) return true;
  return REPAIRABLE_COLLECTIONS.has(collectionName);
}

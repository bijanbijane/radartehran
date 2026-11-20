/**
 * @file server/modules/trust-safety/moderationLegacyMigration.ts
 * @description RT-TS-CRITICAL-027 — Safe DRY_RUN / APPLY migration helper for
 * converting legacy truncated case IDs and stripping unbounded reportIds arrays.
 */
import {
  SOCIAL_COLLECTIONS,
  type CommunityDatabaseStore,
} from '../community/communityFirestoreAdapter';
import type {
  ModerationCaseStatus,
  ModerationTargetType,
  SocialModerationCaseRecord,
  SocialModerationDecision,
} from './moderationLifecycleHelpers';
import { buildCanonicalCaseId } from './moderationLifecycleHelpers';

export async function migrateLegacyModerationCases(
  store: CommunityDatabaseStore,
  mode: 'DRY_RUN' | 'APPLY' = 'DRY_RUN',
): Promise<{
  scannedCases: number;
  migratedCases: number;
  relinkedReports: number;
  relinkedEvents: number;
  collisionsDetected: number;
}> {
  let cursor: string | null = null;
  let scannedCases = 0;
  let migratedCases = 0;
  let relinkedReports = 0;
  let relinkedEvents = 0;
  let collisionsDetected = 0;
  const canonicalSeen = new Set<string>();

  for (let pageIdx = 0; pageIdx < 100; pageIdx++) {
    const page = await store.queryDocs<Record<string, unknown>>(SOCIAL_COLLECTIONS.moderationCases, {
      limit: 50,
      cursorDocId: cursor,
    });
    for (const c of page.items) {
      scannedCases += 1;
      const targetType = String(c.targetType || 'discussion_post') as ModerationTargetType;
      const targetId = String(c.targetId || '');
      const canonicalId = buildCanonicalCaseId(targetType, targetId);
      const hasLegacyArray = Array.isArray(c.reportIds);
      if (canonicalSeen.has(canonicalId)) collisionsDetected += 1;
      canonicalSeen.add(canonicalId);

      if (c.id !== canonicalId || hasLegacyArray) {
        migratedCases += 1;
        if (mode === 'APPLY') {
          const cleanCase: SocialModerationCaseRecord = {
            id: canonicalId,
            targetType,
            targetId,
            status: (c.status as ModerationCaseStatus) || 'OPEN',
            reportCount: Number(c.reportCount ?? (Array.isArray(c.reportIds) ? c.reportIds.length : 0)),
            activeReportCount: Number(c.activeReportCount ?? c.reportCount ?? 0),
            firstReportedAtIso: String(c.firstReportedAtIso || c.createdAtIso || new Date().toISOString()),
            lastReportedAtIso: String(c.lastReportedAtIso || c.updatedAtIso || new Date().toISOString()),
            revision: Number(c.revision ?? 1),
            claimedByUid: (c.claimedByUid as string | null) ?? null,
            claimLeaseExpiresAtIso: (c.claimLeaseExpiresAtIso as string | null) ?? null,
            lastDecision: (c.lastDecision as SocialModerationDecision | null) ?? null,
            lastDecisionId: (c.lastDecisionId as string | null) ?? null,
            lastDecidedByUid: (c.lastDecidedByUid as string | null) ?? null,
            lastDecisionReasonFa: (c.lastDecisionReasonFa as string | null) ?? null,
            activeAppealId: (c.activeAppealId as string | null) ?? null,
            createdAtIso: String(c.createdAtIso || new Date().toISOString()),
            updatedAtIso: new Date().toISOString(),
          };
          await store.setDoc(SOCIAL_COLLECTIONS.moderationCases, canonicalId, cleanCase);
          if (c.id !== canonicalId) {
            const reps = await store.queryDocs<Record<string, unknown>>(SOCIAL_COLLECTIONS.reports, {
              filters: [{ field: 'caseId', op: '==', value: c.id }],
              limit: 50,
            });
            for (const r of reps.items) {
              await store.setDoc(SOCIAL_COLLECTIONS.reports, r.id, { ...r, caseId: canonicalId });
              relinkedReports += 1;
            }
            const evs = await store.queryDocs<Record<string, unknown>>(SOCIAL_COLLECTIONS.moderationEvents, {
              filters: [{ field: 'caseId', op: '==', value: c.id }],
              limit: 50,
            });
            for (const ev of evs.items) {
              await store.setDoc(SOCIAL_COLLECTIONS.moderationEvents, ev.id, { ...ev, caseId: canonicalId });
              relinkedEvents += 1;
            }
          }
        }
      }
    }
    if (!page.hasMore || !page.nextCursor) break;
    cursor = page.nextCursor;
  }

  return { scannedCases, migratedCases, relinkedReports, relinkedEvents, collisionsDetected };
}

/** @file server/modules/community/communitySeedImporter.ts — Idempotent Non-Destructive Community Seed & Legacy JSON Importer (Stage 3) */
import fs from 'node:fs';
import path from 'node:path';
import {
  COMMUNITY_MEMBER_PROFILES,
  COMMUNITY_SEED_QUESTIONS,
  SEED_MODERATION_ACTIONS,
  SEED_MODERATION_APPEALS,
} from '../../../src/features/community/data/communityTopicsAndSeeds';
import {
  COMMUNITY_SEED_CORRECTIONS,
  COMMUNITY_SEED_DISCUSSIONS,
  COMMUNITY_SEED_RESEARCH_PROPOSALS,
} from '../../../src/features/community/data/communitySeedData';
import { SOCIAL_COLLECTIONS, type CommunityDatabaseStore } from './communityFirestoreAdapter';

export interface CommunityImportReport {
  dryRun: boolean;
  backendKind: string;
  scanned: number;
  created: number;
  skippedExisting: number;
  skippedInvalid: number;
  legacyFileDetected: boolean;
}

export async function runNonDestructiveCommunityImport(
  store: CommunityDatabaseStore,
  options?: { dryRun?: boolean; includeLegacyJson?: boolean; legacyJsonPath?: string },
): Promise<CommunityImportReport> {
  const dryRun = Boolean(options?.dryRun);
  let scanned = 0;
  let created = 0;
  let skippedExisting = 0;
  let skippedInvalid = 0;

  async function importRecord(col: (typeof SOCIAL_COLLECTIONS)[keyof typeof SOCIAL_COLLECTIONS], id: string, doc: Record<string, unknown>) {
    scanned += 1;
    if (!id || id.length > 120 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      skippedInvalid += 1;
      return;
    }
    const existing = await store.getDoc(col, id);
    if (existing) {
      skippedExisting += 1;
      return;
    }
    if (!dryRun) {
      const inserted = await store.createIfMissing(col, id, {
        ...doc,
        id,
        schemaVersion: 3,
        importedAtIso: new Date().toISOString(),
      });
      if (inserted) created += 1;
      else skippedExisting += 1;
    } else {
      created += 1;
    }
  }

  for (const d of COMMUNITY_SEED_DISCUSSIONS) {
    await importRecord(SOCIAL_COLLECTIONS.posts, d.id, {
      ...d,
      recordKind: 'discussion',
      moderationStatus: d.status === 'hidden' ? 'hidden' : 'approved',
      replyCount: Array.isArray(d.replies) ? d.replies.length : 0,
      followerCount: Array.isArray(d.followerIds) ? d.followerIds.length : 0,
      isDeleted: false,
    });
  }

  for (const q of COMMUNITY_SEED_QUESTIONS) {
    await importRecord(SOCIAL_COLLECTIONS.posts, q.id, {
      ...q,
      recordKind: 'question',
      moderationStatus: 'approved',
      replyCount: Array.isArray(q.answers) ? q.answers.length : 0,
      followerCount: Array.isArray(q.followerIds) ? q.followerIds.length : 0,
      isDeleted: false,
    });
  }

  for (const c of COMMUNITY_SEED_CORRECTIONS) {
    await importRecord(SOCIAL_COLLECTIONS.posts, c.id, {
      ...c,
      recordKind: 'correction',
      moderationStatus: c.status,
      isDeleted: false,
    });
  }

  for (const rp of COMMUNITY_SEED_RESEARCH_PROPOSALS) {
    await importRecord(SOCIAL_COLLECTIONS.posts, rp.id, {
      ...rp,
      recordKind: 'research_proposal',
      createdAtIso: rp.createdAtIso || new Date('2026-01-01T00:00:00.000Z').toISOString(),
      moderationStatus: 'approved',
      isDeleted: false,
    });
  }

  for (const p of COMMUNITY_MEMBER_PROFILES) {
    await importRecord(SOCIAL_COLLECTIONS.profiles, p.userId, { ...p, isSeed: true });
  }

  for (const act of SEED_MODERATION_ACTIONS) {
    await importRecord(SOCIAL_COLLECTIONS.reports, act.id, { ...act, recordKind: 'moderation_action' });
  }

  for (const apl of SEED_MODERATION_APPEALS) {
    await importRecord(SOCIAL_COLLECTIONS.reports, apl.id, { ...apl, recordKind: 'appeal' });
  }

  const legacyPath = options?.legacyJsonPath ?? path.resolve(process.cwd(), '.cache/community-state.json');
  const legacyExists = Boolean(options?.includeLegacyJson && fs.existsSync(legacyPath));
  if (legacyExists) {
    try {
      const parsed = JSON.parse(fs.readFileSync(legacyPath, 'utf8')) as Record<string, unknown>;
      const legacyDiscussions = Array.isArray(parsed.discussions) ? parsed.discussions : [];
      for (const item of legacyDiscussions) {
        if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
          const rec = item as Record<string, unknown>;
          await importRecord(SOCIAL_COLLECTIONS.posts, String(rec.id), {
            ...rec,
            recordKind: 'discussion',
            isDeleted: false,
          });
        } else {
          scanned += 1;
          skippedInvalid += 1;
        }
      }
    } catch {
      scanned += 1;
      skippedInvalid += 1;
    }
  }

  return {
    dryRun,
    backendKind: store.backendKind,
    scanned,
    created,
    skippedExisting,
    skippedInvalid,
    legacyFileDetected: legacyExists,
  };
}

const isCli = typeof process !== 'undefined' && Array.isArray(process.argv) && process.argv[1]?.endsWith('communitySeedImporter.ts');
if (isCli) {
  (async () => {
    const dryRun = !process.argv.includes('--apply');
    const { createDefaultCommunityDatabaseStore } = await import('./communityFirestoreAdapter');
    const store = createDefaultCommunityDatabaseStore(process.env);
    const report = await runNonDestructiveCommunityImport(store, { dryRun, includeLegacyJson: true });
    console.log(JSON.stringify(report, null, 2));
  })().catch((err) => {
    console.error('[COMMUNITY_IMPORT_ERROR]', err);
    process.exit(1);
  });
}

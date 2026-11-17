/** @file server/modules/community/communityRepository.ts — Durable Swappable Community Repository with Atomic Disk Persistence & Seed Idempotency (Stage 76) */
import fs from 'node:fs';
import path from 'node:path';
import {
  COMMUNITY_MEMBER_PROFILES,
  COMMUNITY_SEED_QUESTIONS,
  COMMUNITY_TOPICS_REGISTRY,
  SEED_MODERATION_ACTIONS,
  SEED_MODERATION_APPEALS,
} from '../../../src/features/community/data/communityTopicsAndSeeds';
import {
  COMMUNITY_SEED_CORRECTIONS,
  COMMUNITY_SEED_DISCUSSIONS,
  COMMUNITY_SEED_RESEARCH_PROPOSALS,
} from '../../../src/features/community/data/communitySeedData';
import type {
  CommunityAbuseReport,
  CommunityDiscussionPost,
  CommunityProfile,
  CommunityQuestionItem,
  CommunityTopicNode,
  DataCorrectionProposal,
  ModerationActionRecord,
  ModerationAppeal,
  ResearchTopicProposal,
} from '../../../src/features/community/types/community.types';
import {
  COMMUNITY_SEED_VERSION,
  COMMUNITY_STORE_SCHEMA_VERSION,
  type CommunityPersistedSnapshot,
  type CommunityStorageAdapter,
} from './communityTypes';

const clone = <T>(val: T): T => JSON.parse(JSON.stringify(val));

export const DEFAULT_COMMUNITY_STORE_PATH = path.resolve(process.cwd(), '.cache/community-store-v2.json');

export class FileBackedCommunityStorageAdapter implements CommunityStorageAdapter {
  constructor(private readonly filePath: string = DEFAULT_COMMUNITY_STORE_PATH) {}

  readSnapshot(): CommunityPersistedSnapshot | null {
    try {
      if (!fs.existsSync(this.filePath)) return null;
      const raw = fs.readFileSync(this.filePath, 'utf8');
      if (!raw.trim()) return null;
      const parsed = JSON.parse(raw) as CommunityPersistedSnapshot;
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  writeSnapshot(snapshot: CommunityPersistedSnapshot): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      const tmpPath = `${this.filePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmpPath, this.filePath);
    } catch {
      // Fall back to in-memory snapshot if filesystem is read-only
    }
  }

  clearSnapshot(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

export class InMemoryCommunityStorageAdapter implements CommunityStorageAdapter {
  private snapshot: CommunityPersistedSnapshot | null = null;
  readSnapshot(): CommunityPersistedSnapshot | null {
    return this.snapshot ? clone(this.snapshot) : null;
  }
  writeSnapshot(snapshot: CommunityPersistedSnapshot): void {
    this.snapshot = clone(snapshot);
  }
  clearSnapshot(): void {
    this.snapshot = null;
  }
}

function stampSeedItem<T extends { id: string }>(item: T): T & {
  source: 'seed';
  schemaVersion: number;
  revision: number;
  updatedAtIso: string;
} {
  return {
    ...clone(item),
    source: 'seed',
    schemaVersion: COMMUNITY_STORE_SCHEMA_VERSION,
    revision: 1,
    updatedAtIso: new Date().toISOString(),
  };
}

export function buildCanonicalSeedSnapshot(): CommunityPersistedSnapshot {
  const profiles: Record<string, CommunityProfile> = {};
  for (const p of COMMUNITY_MEMBER_PROFILES) {
    profiles[p.username] = { ...clone(p), isSeed: true };
  }
  const topicFollowersByTopicId: Record<string, string[]> = {};
  for (const t of COMMUNITY_TOPICS_REGISTRY) {
    topicFollowersByTopicId[t.id] = [];
  }
  return {
    schemaVersion: COMMUNITY_STORE_SCHEMA_VERSION,
    seedVersion: COMMUNITY_SEED_VERSION,
    updatedAtIso: new Date().toISOString(),
    discussions: COMMUNITY_SEED_DISCUSSIONS.map(stampSeedItem),
    questions: COMMUNITY_SEED_QUESTIONS.map(stampSeedItem),
    corrections: COMMUNITY_SEED_CORRECTIONS.map(stampSeedItem),
    researchProposals: COMMUNITY_SEED_RESEARCH_PROPOSALS.map(stampSeedItem),
    abuseReports: [],
    moderationActions: SEED_MODERATION_ACTIONS.map(stampSeedItem),
    appeals: SEED_MODERATION_APPEALS.map(stampSeedItem),
    profiles,
    topicFollowersByTopicId,
    reputationEvents: [],
  };
}

function mergeSeedAndUserCollection<T extends { id: string; source?: 'seed' | 'user'; schemaVersion?: number; revision?: number }>(
  existing: T[] | undefined,
  seeds: T[],
): T[] {
  if (!Array.isArray(existing) || existing.length === 0) {
    return clone(seeds);
  }
  const byId = new Map<string, T>();
  for (const item of existing) {
    if (!item || typeof item.id !== 'string') continue;
    byId.set(item.id, {
      ...item,
      source: item.source ?? (seeds.some((s) => s.id === item.id) ? 'seed' : 'user'),
      schemaVersion: COMMUNITY_STORE_SCHEMA_VERSION,
      revision: typeof item.revision === 'number' ? item.revision : 1,
    });
  }
  for (const seed of seeds) {
    if (!byId.has(seed.id)) {
      byId.set(seed.id, clone(seed));
    }
  }
  return Array.from(byId.values());
}

/** Stage 76.3 & 76.4: Non-destructive schema migration & idempotent seed merge */
export function migrateAndHydrateSnapshot(raw: CommunityPersistedSnapshot | null): CommunityPersistedSnapshot {
  const seedSnap = buildCanonicalSeedSnapshot();
  if (!raw || typeof raw !== 'object') {
    return seedSnap;
  }

  const mergedProfiles: Record<string, CommunityProfile> = { ...seedSnap.profiles };
  if (raw.profiles && typeof raw.profiles === 'object') {
    for (const [username, prof] of Object.entries(raw.profiles)) {
      if (prof && typeof prof === 'object') {
        mergedProfiles[username] = {
          ...prof,
          isSeed: prof.isSeed ?? Boolean(seedSnap.profiles[username]),
        };
      }
    }
  }

  return {
    schemaVersion: COMMUNITY_STORE_SCHEMA_VERSION,
    seedVersion: COMMUNITY_SEED_VERSION,
    updatedAtIso: new Date().toISOString(),
    discussions: mergeSeedAndUserCollection<CommunityDiscussionPost>(raw.discussions, seedSnap.discussions),
    questions: mergeSeedAndUserCollection<CommunityQuestionItem>(raw.questions, seedSnap.questions),
    corrections: mergeSeedAndUserCollection<DataCorrectionProposal>(raw.corrections, seedSnap.corrections),
    researchProposals: mergeSeedAndUserCollection<ResearchTopicProposal>(raw.researchProposals, seedSnap.researchProposals),
    abuseReports: Array.isArray(raw.abuseReports) ? raw.abuseReports : [],
    moderationActions: mergeSeedAndUserCollection<ModerationActionRecord>(raw.moderationActions, seedSnap.moderationActions),
    appeals: mergeSeedAndUserCollection<ModerationAppeal>(raw.appeals, seedSnap.appeals),
    profiles: mergedProfiles,
    topicFollowersByTopicId:
      raw.topicFollowersByTopicId && typeof raw.topicFollowersByTopicId === 'object'
        ? { ...seedSnap.topicFollowersByTopicId, ...raw.topicFollowersByTopicId }
        : seedSnap.topicFollowersByTopicId,
    reputationEvents: Array.isArray(raw.reputationEvents) ? raw.reputationEvents : [],
  };
}

export class CommunityRepository {
  private state: CommunityPersistedSnapshot;

  constructor(private adapter: CommunityStorageAdapter = new FileBackedCommunityStorageAdapter()) {
    const loaded = this.adapter.readSnapshot();
    this.state = migrateAndHydrateSnapshot(loaded);
    this.persist();
  }

  setAdapter(adapter: CommunityStorageAdapter): void {
    this.adapter = adapter;
    const loaded = this.adapter.readSnapshot();
    this.state = migrateAndHydrateSnapshot(loaded);
    this.persist();
  }

  reloadFromAdapter(): CommunityPersistedSnapshot {
    const loaded = this.adapter.readSnapshot();
    this.state = migrateAndHydrateSnapshot(loaded);
    return this.state;
  }

  resetToCanonicalSeed(): CommunityPersistedSnapshot {
    this.adapter.clearSnapshot();
    this.state = buildCanonicalSeedSnapshot();
    this.persist();
    return this.state;
  }

  persist(): void {
    this.state.updatedAtIso = new Date().toISOString();
    this.state.schemaVersion = COMMUNITY_STORE_SCHEMA_VERSION;
    this.adapter.writeSnapshot(this.state);
  }

  getState(): CommunityPersistedSnapshot {
    return this.state;
  }

  listTopics(viewerUid?: string): Array<CommunityTopicNode & { isFollowedByMe?: boolean }> {
    return COMMUNITY_TOPICS_REGISTRY.map((t) => {
      const followers = this.state.topicFollowersByTopicId[t.id] ?? [];
      const baseCount = t.followerCount ?? t.followersCount;
      return {
        ...t,
        followersCount: baseCount + followers.length,
        followerCount: baseCount + followers.length,
        isFollowedByMe: Boolean(viewerUid && followers.includes(viewerUid)),
      };
    });
  }
}

export const communityRepository = new CommunityRepository();

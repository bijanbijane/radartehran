/**
 * @file server/modules/community/socialEntityResolver.ts
 * @description RT-SOCIAL-IMPL-003 — Authoritative Multi-Entity Content Context Resolver.
 * Verifies entity existence and linkability against real canonical repositories in the codebase.
 * Entity types without an authoritative backend repository return `supported: false` (422 UNSUPPORTED_ENTITY_TYPE).
 */
import { INITIAL_NEIGHBORHOODS } from '../../../src/data/neighborhoods';
import { MULTI_CITY_CONFIGS } from '../../../src/data/multiCityData';
import {
  COMMUNITY_MEMBER_PROFILES,
  COMMUNITY_TOPICS_REGISTRY,
} from '../../../src/features/community/data/communityTopicsAndSeeds';
import type {
  SocialEntityReference,
  SocialEntityType,
} from '../../../src/features/community/types/communityDomain.types';
import {
  KNOWLEDGE_DATA_BRIEFS,
  KNOWLEDGE_SOURCE_REGISTRY,
} from '../../../src/features/knowledge/data/knowledgeSourcesAndBriefs';
import {
  INDICATOR_REGISTRY,
  MARKET_SOURCE_REGISTRY,
} from '../../../src/features/market/indicators/IndicatorRegistry';
import { serverPublishedBargains } from '../../../src/utils/serverPublisherBargains';
import {
  SOCIAL_COLLECTIONS,
  type CommunityDatabaseStore,
} from './communityFirestoreAdapter';

export type SocialEntityLifecycleStatus =
  | 'active'
  | 'inactive'
  | 'archived'
  | 'deleted'
  | 'unknown';

export interface SocialEntityResolverResult {
  supported: boolean;
  exists: boolean;
  linkable: boolean;
  canonicalId?: string;
  entityStatus?: SocialEntityLifecycleStatus;
  displayTitleFa?: string;
}

export const SUPPORTED_SOCIAL_ENTITY_TYPES: ReadonlySet<SocialEntityType> = new Set<SocialEntityType>([
  'neighborhood',
  'listing',
  'property',
  'expert',
  'research',
  'market',
  'topic',
]);

export const ALL_SOCIAL_ENTITY_TYPES: ReadonlySet<SocialEntityType> = new Set<SocialEntityType>([
  'neighborhood',
  'listing',
  'property',
  'expert',
  'company',
  'project',
  'tool',
  'service',
  'research',
  'market',
  'topic',
]);

const testEntityOverrides = new Map<string, SocialEntityResolverResult>();

export function registerSocialEntityOverrideForTests(
  entityType: SocialEntityType,
  entityId: string,
  result: SocialEntityResolverResult,
): void {
  testEntityOverrides.set(`${entityType}:${entityId.trim()}`, result);
}

export function clearSocialEntityOverridesForTests(): void {
  testEntityOverrides.clear();
}

function getAllCanonicalNeighborhoods() {
  const seen = new Map<number, { id: number; name: string }>();
  for (const h of INITIAL_NEIGHBORHOODS) {
    seen.set(h.id, { id: h.id, name: h.name });
  }
  for (const cfg of Object.values(MULTI_CITY_CONFIGS)) {
    for (const h of cfg.neighborhoods) {
      if (!seen.has(h.id)) {
        seen.set(h.id, { id: h.id, name: h.name });
      }
    }
  }
  return seen;
}

function resolveNeighborhoodEntity(entityId: string): SocialEntityResolverResult {
  const clean = entityId.trim();
  const match = /^(?:(?:neighborhood|hood)_)?(\d+)$/i.exec(clean);
  if (!match) {
    return { supported: true, exists: false, linkable: false, entityStatus: 'unknown' };
  }
  const numericId = Number(match[1]);
  const hoods = getAllCanonicalNeighborhoods();
  const hood = hoods.get(numericId);
  if (!hood) {
    return { supported: true, exists: false, linkable: false, entityStatus: 'unknown' };
  }
  return {
    supported: true,
    exists: true,
    linkable: true,
    canonicalId: clean,
    entityStatus: 'active',
    displayTitleFa: hood.name,
  };
}

function resolveTopicEntity(entityId: string): SocialEntityResolverResult {
  const clean = entityId.trim();
  const topic = COMMUNITY_TOPICS_REGISTRY.find(
    (t) => t.id === clean || t.slug === clean,
  );
  if (!topic) {
    return { supported: true, exists: false, linkable: false, entityStatus: 'unknown' };
  }
  return {
    supported: true,
    exists: true,
    linkable: true,
    canonicalId: clean,
    entityStatus: 'active',
    displayTitleFa: topic.titleFa,
  };
}

function resolveListingOrPropertyEntity(entityId: string): SocialEntityResolverResult {
  const clean = entityId.trim();
  const published = Array.from(serverPublishedBargains.values()).find(
    (b) => b.id === clean || `listing_${b.id}` === clean || `property_${b.id}` === clean,
  );
  if (published) {
    if (published.lifecycleState === 'published') {
      return {
        supported: true,
        exists: true,
        linkable: true,
        canonicalId: clean,
        entityStatus: 'active',
        displayTitleFa: published.title,
      };
    }
    const status: SocialEntityLifecycleStatus =
      published.lifecycleState === 'archived' ? 'archived' : 'inactive';
    return {
      supported: true,
      exists: true,
      linkable: false,
      canonicalId: clean,
      entityStatus: status,
      displayTitleFa: published.title,
    };
  }

  for (const h of INITIAL_NEIGHBORHOODS) {
    for (const b of h.bargains ?? []) {
      const bId = String(b.id);
      if (
        bId === clean ||
        `listing_${bId}` === clean ||
        `property_${bId}` === clean ||
        `hood_${h.id}_${bId}` === clean
      ) {
        return {
          supported: true,
          exists: true,
          linkable: true,
          canonicalId: clean,
          entityStatus: 'active',
          displayTitleFa: b.title,
        };
      }
    }
  }

  return { supported: true, exists: false, linkable: false, entityStatus: 'unknown' };
}

async function resolveExpertEntity(
  entityId: string,
  store?: CommunityDatabaseStore,
): Promise<SocialEntityResolverResult> {
  const clean = entityId.trim();
  let profile = COMMUNITY_MEMBER_PROFILES.find(
    (p) => p.userId === clean || p.username === clean,
  );

  if (!profile && store) {
    const fromStore = await store.getDoc<Record<string, unknown>>(
      SOCIAL_COLLECTIONS.profiles,
      clean,
    );
    if (fromStore) {
      profile = fromStore as unknown as (typeof COMMUNITY_MEMBER_PROFILES)[number];
    }
  }

  if (!profile) {
    return { supported: true, exists: false, linkable: false, entityStatus: 'unknown' };
  }

  const isPrivate = profile.visibility === 'private';
  const hasActiveCred =
    Boolean(profile.verifiedCredentialFa) ||
    (Array.isArray(profile.credentials) &&
      profile.credentials.some((c) => c.status === 'active'));

  if (isPrivate || !hasActiveCred) {
    return {
      supported: true,
      exists: true,
      linkable: false,
      canonicalId: clean,
      entityStatus: 'inactive',
      displayTitleFa: profile.displayNameFa,
    };
  }

  return {
    supported: true,
    exists: true,
    linkable: true,
    canonicalId: clean,
    entityStatus: 'active',
    displayTitleFa: profile.displayNameFa,
  };
}

function resolveResearchEntity(entityId: string): SocialEntityResolverResult {
  const clean = entityId.trim();
  const brief = KNOWLEDGE_DATA_BRIEFS.find((b) => b.briefId === clean);
  if (brief) {
    return {
      supported: true,
      exists: true,
      linkable: true,
      canonicalId: clean,
      entityStatus: 'active',
      displayTitleFa: brief.titleFa,
    };
  }

  const src = KNOWLEDGE_SOURCE_REGISTRY.find((s) => s.sourceId === clean);
  if (src) {
    if (src.licenseStatus === 'expired') {
      return {
        supported: true,
        exists: true,
        linkable: false,
        canonicalId: clean,
        entityStatus: 'archived',
        displayTitleFa: src.titleFa,
      };
    }
    return {
      supported: true,
      exists: true,
      linkable: true,
      canonicalId: clean,
      entityStatus: 'active',
      displayTitleFa: src.titleFa,
    };
  }

  return { supported: true, exists: false, linkable: false, entityStatus: 'unknown' };
}

function resolveMarketEntity(entityId: string): SocialEntityResolverResult {
  const clean = entityId.trim();
  const indicators = Array.isArray(INDICATOR_REGISTRY)
    ? INDICATOR_REGISTRY
    : Object.values(INDICATOR_REGISTRY);
  const indicator = indicators.find((ind) => ind.id === clean);
  if (indicator) {
    return {
      supported: true,
      exists: true,
      linkable: true,
      canonicalId: clean,
      entityStatus: 'active',
      displayTitleFa: indicator.titleFa,
    };
  }

  const marketSources = Array.isArray(MARKET_SOURCE_REGISTRY)
    ? MARKET_SOURCE_REGISTRY
    : Object.values(MARKET_SOURCE_REGISTRY);
  const marketSource = marketSources.find((ms) => ms.id === clean);
  if (marketSource) {
    return {
      supported: true,
      exists: true,
      linkable: true,
      canonicalId: clean,
      entityStatus: 'active',
      displayTitleFa: marketSource.nameFa,
    };
  }

  return { supported: true, exists: false, linkable: false, entityStatus: 'unknown' };
}

export async function resolveSocialEntityReference(
  ref: SocialEntityReference,
  options?: { store?: CommunityDatabaseStore },
): Promise<SocialEntityResolverResult> {
  const cleanId = typeof ref?.entityId === 'string' ? ref.entityId.trim() : '';
  const override = testEntityOverrides.get(`${ref?.entityType}:${cleanId}`);
  if (override) {
    return override;
  }

  if (!SUPPORTED_SOCIAL_ENTITY_TYPES.has(ref.entityType)) {
    return {
      supported: false,
      exists: false,
      linkable: false,
      entityStatus: 'unknown',
    };
  }

  switch (ref.entityType) {
    case 'neighborhood':
      return resolveNeighborhoodEntity(cleanId);
    case 'topic':
      return resolveTopicEntity(cleanId);
    case 'listing':
    case 'property':
      return resolveListingOrPropertyEntity(cleanId);
    case 'expert':
      return resolveExpertEntity(cleanId, options?.store);
    case 'research':
      return resolveResearchEntity(cleanId);
    case 'market':
      return resolveMarketEntity(cleanId);
    default:
      return {
        supported: false,
        exists: false,
        linkable: false,
        entityStatus: 'unknown',
      };
  }
}

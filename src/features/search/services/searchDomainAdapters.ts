/**
 * RT-UI-SEARCH-001 | Multi-Domain Search Source Adapters & Canonical Index Documents
 * 6 Independent Domain Adapters with Visibility, Multi-City & Location Precision Enforcement
 */

import { LocationPrecision, SearchDocument, SearchRankingPolicy, SearchScope } from '../models/search.types';

export const DEFAULT_RANKING_POLICIES: Record<SearchScope, SearchRankingPolicy> = {
  ALL: { version: 'v27.1.0-global', scope: 'ALL', weights: { textualRelevance: 0.32, exactEntityMatch: 0.24, spatialProximity: 0.12, freshness: 0.10, qualityAndVerification: 0.12, structuredFilterMatch: 0.10 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  PROPERTIES: { version: 'v27.1.0-properties', scope: 'PROPERTIES', weights: { textualRelevance: 0.22, exactEntityMatch: 0.18, spatialProximity: 0.18, freshness: 0.14, qualityAndVerification: 0.12, structuredFilterMatch: 0.16 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  LISTINGS: { version: 'v27.1.0-listings', scope: 'LISTINGS', weights: { textualRelevance: 0.22, exactEntityMatch: 0.18, spatialProximity: 0.16, freshness: 0.18, qualityAndVerification: 0.10, structuredFilterMatch: 0.16 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  NEIGHBORHOODS: { version: 'v27.1.0-neighborhoods', scope: 'NEIGHBORHOODS', weights: { textualRelevance: 0.30, exactEntityMatch: 0.35, spatialProximity: 0.15, freshness: 0.05, qualityAndVerification: 0.10, structuredFilterMatch: 0.05 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  MARKET: { version: 'v27.1.0-market', scope: 'MARKET', weights: { textualRelevance: 0.28, exactEntityMatch: 0.26, spatialProximity: 0.10, freshness: 0.18, qualityAndVerification: 0.12, structuredFilterMatch: 0.06 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  VALUATION: { version: 'v27.1.0-valuation', scope: 'VALUATION', weights: { textualRelevance: 0.30, exactEntityMatch: 0.25, spatialProximity: 0.10, freshness: 0.10, qualityAndVerification: 0.15, structuredFilterMatch: 0.10 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  SERVICES: { version: 'v27.1.0-services', scope: 'SERVICES', weights: { textualRelevance: 0.26, exactEntityMatch: 0.20, spatialProximity: 0.16, freshness: 0.08, qualityAndVerification: 0.22, structuredFilterMatch: 0.08 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  PROVIDERS: { version: 'v27.1.0-providers', scope: 'PROVIDERS', weights: { textualRelevance: 0.24, exactEntityMatch: 0.20, spatialProximity: 0.18, freshness: 0.08, qualityAndVerification: 0.24, structuredFilterMatch: 0.06 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  KNOWLEDGE: { version: 'v27.1.0-knowledge', scope: 'KNOWLEDGE', weights: { textualRelevance: 0.34, exactEntityMatch: 0.24, spatialProximity: 0.06, freshness: 0.12, qualityAndVerification: 0.18, structuredFilterMatch: 0.06 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  COMMUNITY: { version: 'v27.1.0-community', scope: 'COMMUNITY', weights: { textualRelevance: 0.32, exactEntityMatch: 0.20, spatialProximity: 0.08, freshness: 0.14, qualityAndVerification: 0.20, structuredFilterMatch: 0.06 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  MAP: { version: 'v27.1.0-map', scope: 'MAP', weights: { textualRelevance: 0.20, exactEntityMatch: 0.20, spatialProximity: 0.35, freshness: 0.10, qualityAndVerification: 0.08, structuredFilterMatch: 0.07 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
  ACCOUNT: { version: 'v27.1.0-account', scope: 'ACCOUNT', weights: { textualRelevance: 0.40, exactEntityMatch: 0.30, spatialProximity: 0.05, freshness: 0.15, qualityAndVerification: 0.05, structuredFilterMatch: 0.05 }, active: true, updatedAt: '2026-04-01T00:00:00Z' },
};

/** Fixtures moved to ../fixtures/demoSearchDocuments — not for production index bootstrap. */
export {
  INITIAL_SEARCH_DOCUMENTS,
  buildMultiCitySearchDocuments,
  DEMO_ALL_CITY_SEARCH_DOCUMENTS,
  ALL_CITY_SEARCH_DOCUMENTS,
} from '../fixtures/demoSearchDocuments';

export function sanitizeDocumentLocationForCaller(
  doc: SearchDocument,
  caller: { userId?: string; isAdmin?: boolean }
): SearchDocument {
  if (doc.locationPrecision === 'EXACT_AUTHORIZED') {
    const isAuthorized = Boolean(caller.isAdmin || (caller.userId && doc.ownerUserId === caller.userId));
    if (!isAuthorized) {
      return {
        ...doc,
        lat: doc.lat ? Math.round(doc.lat * 100) / 100 : undefined,
        lng: doc.lng ? Math.round(doc.lng * 100) / 100 : undefined,
        locationPrecision: 'APPROXIMATE' as LocationPrecision,
      };
    }
  }
  return doc;
}


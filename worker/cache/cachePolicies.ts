/**
 * @file worker/cache/cachePolicies.ts
 * @description Formal Cache Policies, Classification Matrix, and Key Conventions.
 *
 * Enforces:
 * - Deterministic, collision-resistant cache key conventions:
 *   `radar:{env}:{domain}:{scope}:{resourceId}:v{schemaVer}`
 * - Strict prohibition of caching private, transactional, or privileged data in KV.
 * - Negative caching bounds and TTL rules.
 */

import type { CacheDataClassification, CachePolicy } from './types';

export const CACHE_POLICIES: Readonly<Record<CacheDataClassification, CachePolicy>> = {
  PUBLIC_STATIC_REFERENCE: {
    classification: 'PUBLIC_STATIC_REFERENCE',
    allowedInKv: true,
    allowedInEdgeCache: true,
    allowedInBrowser: true,
    defaultTtlSeconds: 86400 * 7, // 7 days
    maxStalenessSeconds: 86400 * 30,
    allowsNegativeCaching: true,
    negativeCacheTtlSeconds: 300,
    requiresAuthScope: false,
    description: 'Static geographic boundaries, neighborhood static seed lists, and reference schemas.',
  },
  PUBLIC_SLOW_CHANGING: {
    classification: 'PUBLIC_SLOW_CHANGING',
    allowedInKv: true,
    allowedInEdgeCache: true,
    allowedInBrowser: true,
    defaultTtlSeconds: 3600, // 1 hour
    maxStalenessSeconds: 86400,
    allowsNegativeCaching: true,
    negativeCacheTtlSeconds: 60,
    requiresAuthScope: false,
    description: 'Neighborhood benchmark price summaries, amenity indicators, and feature flags snapshot.',
  },
  PUBLIC_FREQUENTLY_CHANGING: {
    classification: 'PUBLIC_FREQUENTLY_CHANGING',
    allowedInKv: true,
    allowedInEdgeCache: true,
    allowedInBrowser: false,
    defaultTtlSeconds: 300, // 5 minutes
    maxStalenessSeconds: 900,
    allowsNegativeCaching: true,
    negativeCacheTtlSeconds: 30,
    requiresAuthScope: false,
    description: 'City market pulse data, air quality station metrics, and public bargain listing cards.',
  },
  USER_PRIVATE_SENSITIVE: {
    classification: 'USER_PRIVATE_SENSITIVE',
    allowedInKv: false, // FORBIDDEN in KV
    allowedInEdgeCache: false, // FORBIDDEN in shared edge CDN
    allowedInBrowser: true, // Only in private user browser session
    defaultTtlSeconds: 60,
    maxStalenessSeconds: 120,
    allowsNegativeCaching: false,
    negativeCacheTtlSeconds: 0,
    requiresAuthScope: true,
    description: 'User preferences, bookmarked neighborhoods, and personal buyer alert subscriptions.',
  },
  SECURITY_PRIVILEGED_AUTHORIZATION: {
    classification: 'SECURITY_PRIVILEGED_AUTHORIZATION',
    allowedInKv: false, // FORBIDDEN in KV
    allowedInEdgeCache: false, // FORBIDDEN in shared edge CDN
    allowedInBrowser: false,
    defaultTtlSeconds: 30, // Max 30s in-memory token cache
    maxStalenessSeconds: 60,
    allowsNegativeCaching: false,
    negativeCacheTtlSeconds: 0,
    requiresAuthScope: true,
    description: 'Verified admin roles, delegated permissions, and token revocation states.',
  },
  TRANSACTIONAL_SOURCE_OF_TRUTH: {
    classification: 'TRANSACTIONAL_SOURCE_OF_TRUTH',
    allowedInKv: false, // FORBIDDEN in KV
    allowedInEdgeCache: false, // FORBIDDEN
    allowedInBrowser: false,
    defaultTtlSeconds: 0,
    maxStalenessSeconds: 0,
    allowsNegativeCaching: false,
    negativeCacheTtlSeconds: 0,
    requiresAuthScope: true,
    description: 'Bargain submission approvals, sponsorship financial payments, and ownership changes.',
  },
  TEMPORARY_COORDINATION_LEASE: {
    classification: 'TEMPORARY_COORDINATION_LEASE',
    allowedInKv: true,
    allowedInEdgeCache: false,
    allowedInBrowser: false,
    defaultTtlSeconds: 60,
    maxStalenessSeconds: 90,
    allowsNegativeCaching: false,
    negativeCacheTtlSeconds: 0,
    requiresAuthScope: false,
    description: 'Background cron job singleton execution leases and migration locks.',
  },
  ANALYTICAL_AGGREGATION: {
    classification: 'ANALYTICAL_AGGREGATION',
    allowedInKv: true,
    allowedInEdgeCache: true,
    allowedInBrowser: true,
    defaultTtlSeconds: 600, // 10 minutes
    maxStalenessSeconds: 3600,
    allowsNegativeCaching: false,
    negativeCacheTtlSeconds: 0,
    requiresAuthScope: false,
    description: 'k-anonymized neighborhood search trends and aggregated system health benchmarks.',
  },
};

export interface CacheKeyBuildParams {
  environment?: 'development' | 'preview' | 'staging' | 'production';
  domain: 'geo' | 'benchmarks' | 'pulse' | 'listings' | 'config' | 'analytics' | 'leases';
  scope?: 'public' | 'admin' | string;
  resourceId: string;
  schemaVersion?: number;
}

/**
 * Builds deterministic, collision-resistant cache key.
 */
export function buildCacheKey(params: CacheKeyBuildParams): string {
  const env = params.environment || 'production';
  const domain = params.domain;
  const scope = params.scope || 'public';
  const ver = params.schemaVersion || 1;
  const cleanId = params.resourceId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);

  return `radar:${env}:${domain}:${scope}:${cleanId}:v${ver}`;
}

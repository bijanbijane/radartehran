/**
 * @fileoverview Employee 4 — Crowd Claims and Market Observations Public Module Barrel (`server/modules/crowd-data/index.ts`).
 *
 * Exposes strictly separated domain services:
 * 1. `CrowdClaimsDomainService` (`crowdClaims` — user-submitted claims, ownership, moderation, duplicates, audit history)
 * 2. `MarketObservationsDomainService` (`marketObservations` — structured observations, validity, QC, safe analytics)
 */

export * from './types';
export {
  CROWD_CLAIMS_COLLECTION,
  MARKET_OBSERVATIONS_COLLECTION,
  CrowdDataDomainError,
  type CrowdDataErrorCode,
  type CrowdDataPersistenceStore,
  assertAuthenticatedActor,
  assertOwnerPrivilege,
  assertAdminPrivilege,
  validateAuthoritativeNeighborhoodReference,
  createDurableCrowdDataStore,
} from './persistenceAdapter';
export {
  CROWD_CLAIM_ALLOWED_TRANSITIONS,
  validateEvidenceReferences,
  detectDuplicateCrowdClaims,
  CrowdClaimsDomainService,
} from './crowdClaimsDomain';
export { computeSafeNeighborhoodAggregation } from './marketObservationsAggregation';
export { MarketObservationsDomainService } from './marketObservationsDomain';

import {
  createDurableCrowdDataStore,
  type CrowdDataPersistenceStore,
} from './persistenceAdapter';
import { CrowdClaimsDomainService } from './crowdClaimsDomain';
import { MarketObservationsDomainService } from './marketObservationsDomain';

export interface CrowdDataModuleFacade {
  readonly store: CrowdDataPersistenceStore;
  readonly crowdClaims: CrowdClaimsDomainService;
  readonly marketObservations: MarketObservationsDomainService;
}

/**
 * Factory creating an isolated or shared persistence-backed instance of both separated domains.
 */
export function createCrowdDataModuleFacade(
  customStore?: CrowdDataPersistenceStore
): CrowdDataModuleFacade {
  const store = customStore ?? createDurableCrowdDataStore();
  return {
    store,
    crowdClaims: new CrowdClaimsDomainService(store),
    marketObservations: new MarketObservationsDomainService(store),
  };
}

export const CROWD_DATA_PROVENANCE_MODEL = Object.freeze({
  version: '2.0.0-employee-4',
  epistemicFirewallEnforced: true,
  syntheticDataGenerationAllowed: false,
  tiers: [
    {
      epistemicClass: 'UNVERIFIED_CROWD_CLAIM',
      trustTier: 'T0_USER_ASSERTION',
      authoritativeEligible: false,
      description: 'Raw user-submitted claim. Never treated as verified fact or market observation.',
    },
    {
      epistemicClass: 'MODERATED_CROWD_CLAIM',
      trustTier: 'T1_COMMUNITY_MODERATED_CLAIM',
      authoritativeEligible: false,
      description: 'Moderator-accepted community claim. Remains a crowd claim; never converted into market observation.',
    },
    {
      epistemicClass: 'RAW_MARKET_OBSERVATION',
      trustTier: 'T2_UNVERIFIED_OBSERVATION',
      authoritativeEligible: false,
      description: 'Structured observation with source & validity metadata awaiting quality-control verification.',
    },
    {
      epistemicClass: 'VERIFIED_MARKET_OBSERVATION',
      trustTier: 'T3_VERIFIED_OBSERVATION',
      authoritativeEligible: true,
      description: 'Quality-controlled, non-expired market observation eligible for safe analytical aggregation.',
    },
    {
      epistemicClass: 'DERIVED_MARKET_METRIC',
      trustTier: 'T4_DERIVED_ANALYTICS',
      authoritativeEligible: true,
      description: 'IQR-filtered statistical aggregate computed strictly from active VERIFIED_MARKET_OBSERVATION records.',
    },
  ],
} as const);

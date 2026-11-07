/**
 * @fileoverview Domain 2: Market Observations Backend Service (`server/modules/crowd-data/marketObservationsDomain.ts`).
 *
 * Implements:
 * 1. Structured market observations with strict separation from Crowd Claims.
 * 2. Authoritative neighborhood and city association validation.
 * 3. Observation source and provenance tracking (`ObservationProvenance`).
 * 4. Observation date and validity window enforcement (`ObservationValidityWindow`).
 * 5. Confidence scoring and anomaly quarantine (reusing `validateAndQuarantineMarketObservation`).
 * 6. Admin moderation and quality-control workflow (`VERIFY`, `QUARANTINE`, `REJECT`).
 * 7. Safe aggregation interface (`aggregateVerifiedMarketObservations`) that strictly distinguishes
 *    raw observations, verified observations, and derived metrics — and NEVER manufactures synthetic data.
 */

import { normalizeStreetName } from '../../../src/cells/knowledge-crowd/crowdClaimsEngine';
import { validateAndQuarantineMarketObservation } from '../../../src/utils/marketHistoryAndPulseIntegrity';
import { clampNumber, sanitizeInput } from '../../../src/utils/security';
import { computeSafeNeighborhoodAggregation } from './marketObservationsAggregation';
import {
  assertAdminPrivilege,
  assertAuthenticatedActor,
  CrowdDataDomainError,
  type CrowdDataPersistenceStore,
  validateAuthoritativeNeighborhoodReference,
} from './persistenceAdapter';
import type {
  ActorContext,
  MarketObservationRecord,
  MarketObservationSourceType,
  ModerateMarketObservationRequest,
  ObservationConfidenceMetadata,
  ObservationVerificationState,
  SafeMarketObservationAggregation,
  SubmitMarketObservationRequest,
} from './types';

const SOURCE_BASE_CONFIDENCE: Readonly<Record<MarketObservationSourceType, number>> = {
  OFFICIAL_DEED_REGISTRY: 0.94,
  VERIFIED_ESCROW_CONTRACT: 0.88,
  LICENSED_APPRAISER_REPORT: 0.82,
  VETTED_MARKET_FEED: 0.68,
  USER_REPORTED_RAW: 0.35,
};

const MAX_OBSERVATION_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function computeConfidenceGrade(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 0.85) return 'A';
  if (score >= 0.7) return 'B';
  if (score >= 0.5) return 'C';
  return 'D';
}

export class MarketObservationsDomainService {
  private readonly store: CrowdDataPersistenceStore;
  private readonly seenObservationRefs = new Set<string>();

  constructor(store: CrowdDataPersistenceStore) {
    this.store = store;
  }

  /**
   * Explicit Epistemic Firewall guard: prevents any caller from converting a CrowdClaimRecord
   * or claim ID into a MarketObservationRecord.
   */
  public assertNotDerivedFromCrowdClaim(input: {
    sourceClaimId?: unknown;
    externalReferenceId?: unknown;
    epistemicClass?: unknown;
  }): void {
    const refId = typeof input.externalReferenceId === 'string' ? input.externalReferenceId.trim() : '';
    if (
      input.sourceClaimId !== undefined ||
      refId.startsWith('cclaim_') ||
      refId.startsWith('claim_') ||
      input.epistemicClass === 'UNVERIFIED_CROWD_CLAIM' ||
      input.epistemicClass === 'MODERATED_CROWD_CLAIM'
    ) {
      throw new CrowdDataDomainError(
        'EPISTEMIC_FIREWALL_VIOLATION',
        'Data integrity violation: User crowd claims cannot be converted into market observations or authoritative market data.',
        422
      );
    }
  }

  public async submitObservation(
    actorInput: ActorContext,
    request: SubmitMarketObservationRequest,
    nowMs = Date.now()
  ): Promise<MarketObservationRecord> {
    const actor = assertAuthenticatedActor(actorInput);
    this.assertNotDerivedFromCrowdClaim({
      sourceClaimId: request.sourceClaimId,
      externalReferenceId: request.externalReferenceId,
    });

    const hoodRef = validateAuthoritativeNeighborhoodReference(request.cityId, request.hoodId);
    if (!(request.sourceType in SOURCE_BASE_CONFIDENCE)) {
      throw new CrowdDataDomainError(
        'VALIDATION_FAILED',
        `Unsupported market observation sourceType: '${String(request.sourceType)}'.`
      );
    }
    const externalRef = sanitizeInput(request.externalReferenceId, 160);
    if (externalRef.length < 3) {
      throw new CrowdDataDomainError(
        'VALIDATION_FAILED',
        'Observation externalReferenceId must be at least 3 characters.'
      );
    }

    const observedMs = Date.parse(request.observedAtIso);
    if (!Number.isFinite(observedMs)) {
      throw new CrowdDataDomainError('VALIDATION_FAILED', 'Invalid observedAtIso timestamp format.');
    }
    if (observedMs > nowMs + MAX_CLOCK_SKEW_MS) {
      throw new CrowdDataDomainError(
        'VALIDATION_FAILED',
        'Observation timestamp cannot be in the future.'
      );
    }
    if (nowMs - observedMs > MAX_OBSERVATION_AGE_MS) {
      throw new CrowdDataDomainError(
        'VALIDATION_FAILED',
        'Observation timestamp exceeds maximum 180-day validity horizon.'
      );
    }

    const sqm = Number(request.sqm);
    const pricePerSqm = Number(request.pricePerSqmMillionToman);
    if (!Number.isFinite(sqm) || sqm < 20 || sqm > 2000) {
      throw new CrowdDataDomainError('VALIDATION_FAILED', 'Observation sqm must be within [20, 2000].');
    }
    if (!Number.isFinite(pricePerSqm) || pricePerSqm <= 0) {
      throw new CrowdDataDomainError(
        'VALIDATION_FAILED',
        'Observation pricePerSqmMillionToman must be a positive number.'
      );
    }

    const streetKeyNormalized = normalizeStreetName(sanitizeInput(request.streetName, 120));
    if (streetKeyNormalized.length < 2) {
      throw new CrowdDataDomainError('VALIDATION_FAILED', 'Observation streetName must be at least 2 characters.');
    }

    const ttlDays = clampNumber(request.ttlDays ?? 30, 1, 90, 30);
    const validFromIso = new Date(observedMs).toISOString();
    const validUntilIso = new Date(observedMs + ttlDays * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date(nowMs).toISOString();

    const observationId = `mobs_${hoodRef.cityId}_${hoodRef.hoodId}_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const quarantineCheck = validateAndQuarantineMarketObservation(
      {
        observationId: externalRef,
        cityId: hoodRef.cityId,
        neighborhoodId: hoodRef.hoodId,
        dealType: request.dealType === 'RENT' ? 'rent' : 'buy',
        priceValue: pricePerSqm,
        currencyUnit: 'million_toman_per_sqm',
        areaSqm: sqm,
        observedAtMs: observedMs,
        sourceName: request.sourceType,
        benchmarkPriceMillions: hoodRef.baseBuyPerSqmMillionToman,
      },
      this.seenObservationRefs,
      nowMs
    );

    const quarantinedInfo = quarantineCheck.quarantined;
    const isQuarantined = quarantinedInfo !== null;
    const anomalyFlags = quarantinedInfo ? quarantinedInfo.anomalyCodes : [];
    const baseConfidence = SOURCE_BASE_CONFIDENCE[request.sourceType];
    const effectiveScore = isQuarantined ? Math.min(0.25, baseConfidence * 0.4) : baseConfidence;

    const initialVerificationState: ObservationVerificationState = isQuarantined
      ? 'QUARANTINED'
      : 'RAW_UNVERIFIED';

    const confidence: ObservationConfidenceMetadata = {
      confidenceScore: Math.round(effectiveScore * 1000) / 1000,
      confidenceGrade: computeConfidenceGrade(effectiveScore),
      anomalyFlags,
      qualityControlNotes: isQuarantined
        ? `Auto-quarantined on ingestion: ${anomalyFlags.join(', ')}`
        : 'Ingested as raw unverified observation awaiting QC verification',
    };

    const record: MarketObservationRecord = {
      observationId,
      epistemicClass: 'RAW_MARKET_OBSERVATION',
      cityId: hoodRef.cityId,
      hoodId: hoodRef.hoodId,
      hoodName: hoodRef.hoodName,
      streetKeyNormalized,
      dealType: request.dealType === 'RENT' ? 'RENT' : 'BUY',
      sqm,
      pricePerSqmMillionToman: pricePerSqm,
      totalPriceMillionToman: Math.round(sqm * pricePerSqm * 100) / 100,
      rahn80mEquivalentMillionToman: request.rahn80mEquivalentMillionToman,
      buildingAgeYears: request.buildingAgeYears,
      verificationState: initialVerificationState,
      provenance: {
        submittedByUid: actor.uid,
        sourceType: request.sourceType,
        externalReferenceId: externalRef,
        sourceCapturedAtIso: validFromIso,
        ingestedAtIso: nowIso,
      },
      validity: {
        observedAtIso: validFromIso,
        validFromIso,
        validUntilIso,
        ttlDays,
      },
      confidence,
      revision: 1,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    return this.store.createObservation(record);
  }

  public async moderateObservation(
    actorInput: ActorContext,
    request: ModerateMarketObservationRequest,
    nowMs = Date.now()
  ): Promise<MarketObservationRecord> {
    assertAdminPrivilege(actorInput);
    const notes = sanitizeInput(request.qualityControlNotes, 400);
    if (notes.length < 4) {
      throw new CrowdDataDomainError(
        'VALIDATION_FAILED',
        'Quality control notes must be at least 4 characters.'
      );
    }
    const nowIso = new Date(nowMs).toISOString();

    return this.store.updateObservationAtomically(
      request.observationId,
      request.expectedRevision,
      (current) => {
        if (current.verificationState === 'REJECTED_INVALID' && request.action === 'VERIFY') {
          throw new CrowdDataDomainError(
            'INVALID_STATE_TRANSITION',
            'Cannot directly VERIFY an observation that was marked REJECTED_INVALID.',
            409
          );
        }
        if (
          request.action === 'VERIFY' &&
          current.confidence.anomalyFlags.includes('UNIT_SCALE_MISMATCH')
        ) {
          throw new CrowdDataDomainError(
            'VALIDATION_FAILED',
            'Cannot verify observation with UNIT_SCALE_MISMATCH anomaly flag.',
            422
          );
        }

        const nextRevision = current.revision + 1;
        if (request.action === 'VERIFY') {
          const boost = clampNumber(request.confidenceBoost ?? 0.1, 0, 0.25, 0.1);
          const nextScore = Math.min(0.99, Math.round((current.confidence.confidenceScore + boost) * 1000) / 1000);
          return {
            ...current,
            epistemicClass: 'VERIFIED_MARKET_OBSERVATION',
            verificationState: 'VERIFIED_OBSERVATION',
            confidence: {
              ...current.confidence,
              confidenceScore: nextScore,
              confidenceGrade: computeConfidenceGrade(nextScore),
              verifierUid: actorInput.uid,
              verifiedAtIso: nowIso,
              verificationMethod: request.verificationMethod ?? 'ADMIN_AUDIT',
              qualityControlNotes: notes,
            },
            revision: nextRevision,
            updatedAtIso: nowIso,
          };
        }

        const targetState: ObservationVerificationState =
          request.action === 'QUARANTINE' ? 'QUARANTINED' : 'REJECTED_INVALID';
        const degradedScore = request.action === 'QUARANTINE' ? 0.2 : 0;
        return {
          ...current,
          epistemicClass: 'RAW_MARKET_OBSERVATION',
          verificationState: targetState,
          confidence: {
            ...current.confidence,
            confidenceScore: degradedScore,
            confidenceGrade: 'D',
            verifierUid: actorInput.uid,
            verifiedAtIso: nowIso,
            qualityControlNotes: notes,
          },
          revision: nextRevision,
          updatedAtIso: nowIso,
        };
      }
    );
  }

  /**
   * Computes safe market analytics for a neighborhood.
   *
   * INVARIANTS:
   * - Strictly separates raw, quarantined, rejected, expired, and active verified observations.
   * - Computes `derivedMetrics` ONLY from active (`validUntilIso >= evaluatedAtIso`) `VERIFIED_OBSERVATION` records.
   * - NEVER manufactures observations or synthetic fallback metrics when verified data is missing.
   */
  public async aggregateVerifiedMarketObservations(
    cityIdInput: unknown,
    hoodIdInput: unknown,
    nowMs = Date.now()
  ): Promise<SafeMarketObservationAggregation> {
    const hoodRef = validateAuthoritativeNeighborhoodReference(cityIdInput, hoodIdInput);
    const allObservations = await this.store.listObservationsByNeighborhood(hoodRef.cityId, hoodRef.hoodId);
    return computeSafeNeighborhoodAggregation(hoodRef, allObservations, nowMs);
  }

  public async getObservationById(observationId: string): Promise<MarketObservationRecord | null> {
    return this.store.getObservation(observationId);
  }

  public async listNeighborhoodObservations(
    cityId: unknown,
    hoodId: unknown
  ): Promise<MarketObservationRecord[]> {
    const hoodRef = validateAuthoritativeNeighborhoodReference(cityId, hoodId);
    return this.store.listObservationsByNeighborhood(hoodRef.cityId, hoodRef.hoodId);
  }
}

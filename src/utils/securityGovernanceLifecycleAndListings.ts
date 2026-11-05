/**
 * @file src/utils/securityGovernanceLifecycleAndListings.ts
 * @description Server lifecycle draining, release rollback compatibility, authoritative
 * listing fraud separation, neighborhood vote aggregation, atomic sponsor slot allocation,
 * market refresh generation ordering, and distributed job lease coordination (Tasks 625–639).
 *
 * Pure utility module (< 200 lines, zero React/UI imports).
 */

import {
  evaluatePropertyListingTrust,
  normalizePersianAddressText,
  validateIranianPostalCode,
  type PropertyListingCandidate,
  type ListingAnomalyClassification,
} from '../data/listingFraudAndAddressEngine';
import type { Neighborhood } from '../data/neighborhoods';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';

export class ServerLifecycleCoordinator {
  private state: 'RUNNING' | 'DRAINING' | 'STOPPED' = 'RUNNING';
  private inflightCount = 0;
  getState(): 'RUNNING' | 'DRAINING' | 'STOPPED' { return this.state; }
  tryEnterRequest(isNewUploadOrBackgroundJob = false): boolean {
    if (this.state !== 'RUNNING' || (isNewUploadOrBackgroundJob && this.state !== 'RUNNING')) return false;
    this.inflightCount++;
    return true;
  }
  leaveRequest(): void { if (this.inflightCount > 0) this.inflightCount--; }
  initiateGracefulShutdown(): { alreadyShuttingDown: boolean; inflightRemaining: number } {
    const alreadyShuttingDown = this.state !== 'RUNNING';
    if (this.state === 'RUNNING') this.state = 'DRAINING';
    if (this.inflightCount === 0) this.state = 'STOPPED';
    return { alreadyShuttingDown, inflightRemaining: this.inflightCount };
  }
}

export function evaluateReleaseRollbackCompatibility(
  currentRelease: { version: string; schemaVersion: number; firestoreRulesVersion: number; hasIrreversibleMigration?: boolean },
  targetPreviousRelease: { version: string; artifactSha256: string; schemaVersion: number; firestoreRulesVersion: number },
  operatorApprovedIrreversible = false,
): { compatible: boolean; reason: string } {
  if (!/^[a-f0-9]{64}$/i.test(targetPreviousRelease.artifactSha256)) return { compatible: false, reason: 'UNVERIFIED_PREVIOUS_ARTIFACT_DIGEST' };
  if (targetPreviousRelease.firestoreRulesVersion < currentRelease.firestoreRulesVersion) return { compatible: false, reason: 'SECURITY_RULES_DOWNGRADE_FORBIDDEN' };
  if (currentRelease.hasIrreversibleMigration && !operatorApprovedIrreversible) return { compatible: false, reason: 'IRREVERSIBLE_MIGRATION_REQUIRES_OPERATOR_APPROVAL' };
  if (currentRelease.schemaVersion - targetPreviousRelease.schemaVersion > 1) return { compatible: false, reason: 'INCOMPATIBLE_SCHEMA_VERSION_GAP' };
  return { compatible: true, reason: 'ROLLBACK_COMPATIBLE' };
}

export function evaluateAuthoritativeListingSubmission(
  candidate: PropertyListingCandidate & { postalCode?: string; rawAddress?: string },
  referenceHood: Neighborhood,
  existingListings: PropertyListingCandidate[] = [],
  options?: { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode }
): {
  acceptedForSubmission: boolean;
  fraudClassification: ListingAnomalyClassification;
  initialPublicationStatus: 'pending' | 'rejected';
  requiresHumanModeration: true;
  normalizedAddress: string;
  reasons: string[];
  displayAreaUnitLabel: string;
  offeredPriceIntlText: string;
} {
  const displayAreaUnitLabel = formatAreaUnitLabel(options?.areaUnit ?? 'sqm');
  const offeredPriceIntlText = formatMillionTomanAsIntlCurrency(candidate.totalPriceMillion ?? 0, options?.intlCurrency ?? 'IRT');
  if (candidate.postalCode) {
    const postalCheck = validateIranianPostalCode(candidate.postalCode);
    if (!postalCheck.valid) {
      return {
        acceptedForSubmission: false,
        fraudClassification: 'DATA_VALIDATION_FAILURE',
        initialPublicationStatus: 'rejected',
        requiresHumanModeration: true,
        normalizedAddress: '',
        reasons: [postalCheck.reason || 'INVALID_POSTAL_CODE'],
        displayAreaUnitLabel,
        offeredPriceIntlText,
      };
    }
  }
  const evalResult = evaluatePropertyListingTrust({ ...candidate, humanConfirmedFraud: false }, referenceHood, existingListings);
  const accepted = evalResult.recommendedAction !== 'REJECT_INVALID_SCHEMA';
  return {
    acceptedForSubmission: accepted,
    fraudClassification: evalResult.classification,
    initialPublicationStatus: accepted ? 'pending' : 'rejected',
    requiresHumanModeration: true,
    normalizedAddress: normalizePersianAddressText(candidate.rawAddress || candidate.title),
    reasons: evalResult.reasons,
    displayAreaUnitLabel,
    offeredPriceIntlText,
  };
}

export function computeAuthoritativeNeighborhoodVoteAggregate(
  votes: ReadonlyArray<{ voterUid: string; hoodId: number; score: number; clientLocationVerified?: boolean }>,
  seedScore: number,
  seedVotesCount: number,
): { avgScore: number; totalVotesCount: number; uniqueValidVoterCount: number } {
  const byVoter = new Map<string, number>();
  for (const v of votes) {
    if (!v.voterUid || !Number.isFinite(v.score) || v.score < 1 || v.score > 10) continue;
    byVoter.set(`${v.voterUid}_hood_${v.hoodId}`, Number(v.score));
  }
  let sum = seedScore * seedVotesCount;
  for (const s of byVoter.values()) sum += s;
  const totalVotesCount = seedVotesCount + byVoter.size;
  const avgScore = totalVotesCount > 0 ? Number((sum / totalVotesCount).toFixed(1)) : seedScore;
  return { avgScore, totalVotesCount, uniqueValidVoterCount: byVoter.size };
}

export function isPublicSponsorCurrentlyActive(
  sponsor: { verified?: boolean; expiresAtIso?: string; status?: string } | null | undefined,
  serverNowMs = Date.now(),
): boolean {
  if (!sponsor || sponsor.verified !== true) return false;
  if (sponsor.status && sponsor.status !== 'approved') return false;
  if (!sponsor.expiresAtIso) return false;
  const expMs = Date.parse(sponsor.expiresAtIso);
  return Number.isFinite(expMs) && expMs > serverNowMs;
}

const activeSponsorSlotByHood = new Map<number, { requestId: string; expiresAtMs: number }>();

export function allocateExclusiveSponsorSlotAtomically(params: {
  hoodId: number;
  requestId: string;
  expiresAtMs: number;
  serverNowMs?: number;
}): { allocated: boolean; reason: 'ALLOCATED' | 'IDEMPOTENT_SAME_REQUEST' | 'SLOT_ALREADY_RESERVED' } {
  const now = params.serverNowMs ?? Date.now();
  const current = activeSponsorSlotByHood.get(params.hoodId);
  if (current && current.expiresAtMs > now) {
    if (current.requestId === params.requestId) {
      current.expiresAtMs = params.expiresAtMs;
      return { allocated: true, reason: 'IDEMPOTENT_SAME_REQUEST' };
    }
    return { allocated: false, reason: 'SLOT_ALREADY_RESERVED' };
  }
  if (activeSponsorSlotByHood.size >= 500) {
    for (const [k, v] of activeSponsorSlotByHood.entries()) {
      if (v.expiresAtMs <= now) activeSponsorSlotByHood.delete(k);
    }
    if (activeSponsorSlotByHood.size >= 500) {
      const oldest = activeSponsorSlotByHood.keys().next().value;
      if (oldest !== undefined) activeSponsorSlotByHood.delete(oldest);
    }
  }
  activeSponsorSlotByHood.set(params.hoodId, { requestId: params.requestId, expiresAtMs: params.expiresAtMs });
  return { allocated: true, reason: 'ALLOCATED' };
}

export class MarketRefreshGenerationTracker {
  private nextGen = 1;
  private committedGenByCity = new Map<string, number>();
  beginRefresh(): number { return this.nextGen++; }
  tryCommitRefresh(city: string, generation: number): boolean {
    const cleanCity = String(city || '').trim().toLowerCase().slice(0, 64);
    if (!cleanCity || !Number.isInteger(generation) || generation < 1) return false;
    const latest = this.committedGenByCity.get(cleanCity) ?? 0;
    if (generation < latest) return false;
    if (!this.committedGenByCity.has(cleanCity) && this.committedGenByCity.size >= 200) {
      const oldest = this.committedGenByCity.keys().next().value;
      if (oldest !== undefined) this.committedGenByCity.delete(oldest);
    }
    this.committedGenByCity.set(cleanCity, generation);
    return true;
  }
}

export class DistributedJobLeaseCoordinator {
  private readonly leases = new Map<string, { ownerId: string; expiresAtMs: number }>();
  acquireLease(jobName: string, ownerId: string, ttlMs: number, nowMs = Date.now()): boolean {
    if (!jobName || !ownerId || !Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > 3_600_000) return false;
    const cur = this.leases.get(jobName);
    if (cur && cur.expiresAtMs > nowMs && cur.ownerId !== ownerId) return false;
    if (!this.leases.has(jobName) && this.leases.size >= 500) {
      for (const [k, v] of this.leases.entries()) {
        if (v.expiresAtMs <= nowMs) this.leases.delete(k);
      }
      if (this.leases.size >= 500) return false;
    }
    this.leases.set(jobName, { ownerId, expiresAtMs: nowMs + ttlMs });
    return true;
  }
  releaseLease(jobName: string, callerOwnerId: string): boolean {
    const cur = this.leases.get(jobName);
    if (!cur || cur.ownerId !== callerOwnerId) return false;
    this.leases.delete(jobName);
    return true;
  }
}

export async function executeWithAuditFailurePolicy<T>(params: {
  criticality: 'MANDATORY_FAIL_CLOSED' | 'BEST_EFFORT';
  writeAuditRecord: () => Promise<void> | void;
  executeOperation: () => Promise<T>;
}): Promise<{ ok: true; result: T; auditDegraded?: boolean } | { ok: false; code: 'MANDATORY_AUDIT_WRITE_FAILED' }> {
  try {
    await params.writeAuditRecord();
  } catch {
    if (params.criticality === 'MANDATORY_FAIL_CLOSED') return { ok: false, code: 'MANDATORY_AUDIT_WRITE_FAILED' };
    return { ok: true, result: await params.executeOperation(), auditDegraded: true };
  }
  return { ok: true, result: await params.executeOperation() };
}

import crypto from 'node:crypto'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; import { DEFAULT_FEATURE_FLAGS, type FeatureFlags } from './security'; export type VerificationEvidenceBasis = | 'SOURCE_CODE_INSPECTED'
  | 'SIMULATED_AUTOMATED_TEST'
  | 'LIVE_INFRASTRUCTURE_VERIFIED'; export interface CacheEntryEnvelope<T = unknown> { cacheKey: string; entityId: string; userScope: string; roleScope: string; cityScope: string; revision: number; storedAtMs: number; expiresAtMs: number; isNegativeCache: boolean; value: T | null; }
export class ScopedCacheCoherenceManager { private readonly store = new Map<string, CacheEntryEnvelope>(); private readonly tombstones = new Map<string, number>(); // entityId -> deletedAtRevision
  buildScopedCacheKey(params: { namespace: string; entityId: string; userId?: string; role?: string; cityKey?: string; }): string {
    return `${params.namespace}|u:${params.userId || 'public'}|r:${params.role || 'guest'}|c:${params.cityKey || 'all'}|id:${params.entityId}`;
  }
  put<T>(params: { namespace: string; entityId: string; userId?: string; role?: string; cityKey?: string;
    revision: number; ttlMs: number; value: T | null; nowMs?: number;
  }): boolean { const tombstoneRev = this.tombstones.get(params.entityId); if (tombstoneRev !== undefined && params.revision <= tombstoneRev) { return false;
    }
    const nowMs = params.nowMs ?? Date.now(); const cacheKey = this.buildScopedCacheKey(params);
    const safeTtlMs = Math.max(0, Math.min(Number.isFinite(params.ttlMs) ? params.ttlMs : 60_000, 7 * 24 * 3600_000));
    if (!this.store.has(cacheKey) && this.store.size >= 5000) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(cacheKey, {
      cacheKey, entityId: params.entityId, userScope: params.userId || 'public',
      roleScope: params.role || 'guest', cityScope: params.cityKey || 'all', revision: params.revision,
      storedAtMs: nowMs, expiresAtMs: nowMs + safeTtlMs, isNegativeCache: params.value === null, value: params.value,
    });
    return true;
  }
  get<T>(params: {
    namespace: string; entityId: string; userId?: string; role?: string; cityKey?: string; nowMs?: number;
  }): { hit: boolean; value: T | null; revision?: number } {
    const nowMs = params.nowMs ?? Date.now();
    if (this.tombstones.has(params.entityId)) return { hit: false, value: null };
    const cacheKey = this.buildScopedCacheKey(params);
    const entry = this.store.get(cacheKey);
    if (!entry || nowMs > entry.expiresAtMs) {
      if (entry) this.store.delete(cacheKey);
      return { hit: false, value: null };
    }
    return { hit: true, value: entry.value as T | null, revision: entry.revision };
  }
  invalidateEntity(entityId: string, deletedAtRevision?: number): number {
    if (deletedAtRevision !== undefined) {
      if (!this.tombstones.has(entityId) && this.tombstones.size >= 5000) {
        const oldestEntity = this.tombstones.keys().next().value;
        if (oldestEntity !== undefined) this.tombstones.delete(oldestEntity);
      }
      this.tombstones.set(entityId, deletedAtRevision);
    }
    let removed = 0;
    for (const [k, v] of this.store.entries()) {
      if (v.entityId === entityId) { this.store.delete(k); removed++; }
    }
    return removed;
  }
  invalidateUserSessionOrRoleChange(userId: string): number {
    let removed = 0;
    for (const [k, v] of this.store.entries()) {
      if (v.userScope === userId) { this.store.delete(k); removed++; }
    }
    return removed;
  }
}
export interface BackgroundJobExecutionRecord {
  jobType: string; idempotencyKey: string; workerId: string;
  status: 'RUNNING' | 'COMPLETED' | 'DEAD_LETTER'; attempts: number; leaseExpiresAtMs: number; lastError?: string;
}
export class LeasedBackgroundJobCoordinator {
  private readonly activeLeases = new Map<string, BackgroundJobExecutionRecord>();
  private readonly completedKeys = new Set<string>();
  private readonly deadLetterQueue: BackgroundJobExecutionRecord[] = [];
  acquireJobLease(params: {
    jobType: string; idempotencyKey: string; workerId: string; leaseDurationMs?: number; nowMs?: number;
  }): { acquired: boolean; reason: 'LEASE_GRANTED' | 'ALREADY_COMPLETED' | 'LOCKED_BY_ACTIVE_WORKER' } {
    const nowMs = params.nowMs ?? Date.now();
    if (this.completedKeys.has(params.idempotencyKey)) return { acquired: false, reason: 'ALREADY_COMPLETED' };
    const existing = this.activeLeases.get(params.jobType);
    if (existing && existing.leaseExpiresAtMs > nowMs && existing.status === 'RUNNING') {
      return { acquired: false, reason: 'LOCKED_BY_ACTIVE_WORKER' };
    }
    if (!this.activeLeases.has(params.jobType) && this.activeLeases.size >= 1000) {
      const oldestJob = this.activeLeases.keys().next().value;
      if (oldestJob !== undefined) this.activeLeases.delete(oldestJob);
    }
    const rec: BackgroundJobExecutionRecord = {
      jobType: params.jobType, idempotencyKey: params.idempotencyKey, workerId: params.workerId,
      status: 'RUNNING', attempts: (existing?.attempts ?? 0) + 1, leaseExpiresAtMs: nowMs + Math.max(1000, Math.min(params.leaseDurationMs ?? 30_000, 3_600_000)),
    };
    this.activeLeases.set(params.jobType, rec);
    return { acquired: true, reason: 'LEASE_GRANTED' };
  }
  completeJob(jobType: string, idempotencyKey: string, workerId: string): void {
    const existing = this.activeLeases.get(jobType);
    if (!existing || existing.workerId !== workerId) throw new Error('JOB_LEASE_OWNERSHIP_LOST');
    existing.status = 'COMPLETED';
    if (this.completedKeys.size >= 5000) {
      const oldestKey = this.completedKeys.values().next().value;
      if (oldestKey !== undefined) this.completedKeys.delete(oldestKey);
    }
    this.completedKeys.add(idempotencyKey);
    this.activeLeases.delete(jobType);
  }
  failJobToDeadLetter(jobType: string, errorMessage: string): BackgroundJobExecutionRecord {
    const existing = this.activeLeases.get(jobType);
    if (!existing) throw new Error('JOB_NOT_FOUND');
    existing.status = 'DEAD_LETTER';
    existing.lastError = errorMessage;
    if (this.deadLetterQueue.length >= 1000) this.deadLetterQueue.shift();
    this.deadLetterQueue.push({ ...existing });
    this.activeLeases.delete(jobType);
    return existing;
  }
  getDeadLetterQueue(): BackgroundJobExecutionRecord[] {
    return [...this.deadLetterQueue];
  }
}
export interface GeospatialValidationResult {
  valid: boolean; swappedLatLngDetected: boolean; nullIslandDetected: boolean;
  normalizedLat?: number; normalizedLng?: number; reason: string;
}
/**
 * Validates WGS84 coordinates for Iran (Lat: 24.5..40.0 N, Lng: 44.0..63.5 E)
 * and detects accidental [lng, lat] reversal or (0, 0) Null Island defaults.
 */
export function validateAndAuditGeospatialPoint(lat: number, lng: number): GeospatialValidationResult {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { valid: false, swappedLatLngDetected: false, nullIslandDetected: false, reason: 'NON_FINITE_COORDINATES' };
  }
  if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) {
    return { valid: false, swappedLatLngDetected: false, nullIslandDetected: true, reason: 'NULL_ISLAND_ZERO_COORDINATES' };
  }
  if (lat >= 44.0 && lat <= 63.5 && lng >= 24.5 && lng <= 40.0) {
    return {
      valid: false, swappedLatLngDetected: true, nullIslandDetected: false,
      normalizedLat: lng, normalizedLng: lat, reason: 'LAT_LNG_REVERSED_FOR_IRAN_BBOX',
    };
  }
  if (lat < 24.5 || lat > 40.0 || lng < 44.0 || lng > 63.5) {
    return { valid: false, swappedLatLngDetected: false, nullIslandDetected: false, reason: 'OUTSIDE_IRAN_GEOGRAPHIC_BOUNDS' };
  }
  return {
    valid: true, swappedLatLngDetected: false, nullIslandDetected: false,
    normalizedLat: Number(lat.toFixed(6)), normalizedLng: Number(lng.toFixed(6)), reason: 'VALID_IRAN_WGS84_COORDINATE',
  };
}
export function computeGeodesicHaversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371.0088; // Mean Earth radius in km (IUGG)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Number((2 * R * Math.asin(Math.min(1, Math.sqrt(a)))).toFixed(3));
}
export function maskExactResidentialCoordinates(lat: number, lng: number): {
  approxLat: number; approxLng: number; precisionDisclosure: 'APPROXIMATE_NEIGHBORHOOD_LEVEL_FOR_PRIVACY';
} {
  return {
    approxLat: Number(lat.toFixed(3)), approxLng: Number(lng.toFixed(3)),
    precisionDisclosure: 'APPROXIMATE_NEIGHBORHOOD_LEVEL_FOR_PRIVACY',
  };
}
export type DataLineageProvenance = 'IMPORTED_FEED' | 'MANUAL_ADMIN_VERIFIED' | 'HEDONIC_COMPUTED';
export interface IngestedNeighborhoodPriceRecord {
  hoodId: number; buyPerSqm: number; rahn80m: number; sourceId: string; sourcePublishedAtIso: string; provenance: DataLineageProvenance;
}
export function executeTraceableIngestionBatch(params: {
  batchId: string;
  incomingRecords: Array<Partial<IngestedNeighborhoodPriceRecord>>;
  existingRecordsByHoodId: Map<number, IngestedNeighborhoodPriceRecord>;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
}): {
  batchId: string; appliedCount: number; skippedStaleOrProtectedCount: number; isolatedMalformedCount: number;
  updatedState: Map<number, IngestedNeighborhoodPriceRecord>; displayAreaUnitLabel: string; referenceValuationIntlText: string;
} {
  const resolvedUnit = params.areaUnit ?? getStoredAreaUnit(); const resolvedCurrency = params.intlCurrency ?? getStoredIntlCurrency();
  const updatedState = new Map(params.existingRecordsByHoodId);
  let appliedCount = 0; let skippedStaleOrProtectedCount = 0; let isolatedMalformedCount = 0;
  for (const raw of params.incomingRecords) {
    if (
      typeof raw.hoodId !== 'number' || typeof raw.buyPerSqm !== 'number' ||
      !Number.isFinite(raw.buyPerSqm) || raw.buyPerSqm < 5 ||
      typeof raw.rahn80m !== 'number' || !raw.sourceId || !raw.sourcePublishedAtIso
    ) {
      isolatedMalformedCount++;
      continue;
    }
    const current = updatedState.get(raw.hoodId);
    if (current) {
      const incomingTime = Date.parse(raw.sourcePublishedAtIso);
      const currentTime = Date.parse(current.sourcePublishedAtIso);
      const isOlder = Number.isFinite(incomingTime) && Number.isFinite(currentTime) && incomingTime <= currentTime;
      const isProtectedManual = current.provenance === 'MANUAL_ADMIN_VERIFIED' && raw.provenance === 'IMPORTED_FEED';
      if (isOlder || isProtectedManual) {
        skippedStaleOrProtectedCount++;
        continue;
      }
    }
    updatedState.set(raw.hoodId, {
      hoodId: raw.hoodId, buyPerSqm: raw.buyPerSqm, rahn80m: raw.rahn80m,
      sourceId: raw.sourceId, sourcePublishedAtIso: raw.sourcePublishedAtIso, provenance: raw.provenance ?? 'IMPORTED_FEED',
    });
    appliedCount++;
  }
  return {
    batchId: params.batchId, appliedCount, skippedStaleOrProtectedCount, isolatedMalformedCount, updatedState,
    displayAreaUnitLabel: formatAreaUnitLabel(resolvedUnit), referenceValuationIntlText: formatMillionTomanAsIntlCurrency(14500, resolvedCurrency),
  };
}
export class FeatureFlagGovernanceEvaluator {
  private flags: FeatureFlags = { ...DEFAULT_FEATURE_FLAGS };
  getEffectiveFlags(): FeatureFlags {
    return { ...this.flags };
  }
  updateFlagsAsAdmin(params: {
    actorIsVerifiedAdmin: boolean;
    patch: Partial<Record<keyof FeatureFlags, unknown>>;
  }): { ok: boolean; statusCode: number; updatedFlags: FeatureFlags } {
    if (!params.actorIsVerifiedAdmin) {
      return { ok: false, statusCode: 403, updatedFlags: this.getEffectiveFlags() };
    }
    const next: FeatureFlags = { ...this.flags };
    for (const key of Object.keys(DEFAULT_FEATURE_FLAGS) as Array<keyof FeatureFlags>) {
      if (typeof params.patch[key] === 'boolean') {
        next[key] = params.patch[key] as boolean;
      }
    }
    this.flags = next;
    return { ok: true, statusCode: 200, updatedFlags: this.getEffectiveFlags() };
  }
  assertServerCapabilityEnabled(flagKey: keyof FeatureFlags): { allowed: boolean; statusCode: number; reason: string } {
    if (!this.flags[flagKey]) {
      return {
        allowed: false,
        statusCode: 503,
        reason: `FEATURE_DISABLED_BY_SERVER_KILL_SWITCH:${String(flagKey)}`,
      };
    } return { allowed: true, statusCode: 200, reason: 'FEATURE_ENABLED' }; } isUserInDeterministicRolloutCohort(userId: string, flagKey: keyof FeatureFlags, percentage0To100: number): boolean { if (!this.flags[flagKey]) return false; const clamped = Math.max(0, Math.min(100, percentage0To100)); if (clamped === 0) return false; if (clamped === 100) return true;
    const hashVal = crypto.createHash('sha256').update(`${flagKey}:${userId}`).digest()[0];
    const bucket = Math.floor((hashVal / 256) * 100); return bucket < clamped; } }
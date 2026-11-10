import crypto from 'node:crypto';
import { formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';
import type { BuildingEntityFingerprint, CanonicalBuildingRecord, EntityResolutionOutcome } from './aiIngestionTypes';

const canonicalBuildingStore = new Map<string, CanonicalBuildingRecord>();
const buildingAliasRedirectMap = new Map<string, string>();
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeDigitsToAscii(input: string): string {
  return String(input || '').replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
}

export function normalizePersianStreetName(rawStreet: string): string {
  const ascii = normalizeDigitsToAscii(rawStreet || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200c\u200f\u200e]/g, ' ')
    .replace(/(?:^|\s)(?:خیابان|خ|کوچه|ک|بلوار|بزرگراه|بن\s*بست|میدان|پلاک|واحد)(?=\s|$)/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return ascii || 'نامشخص';
}

export function computeSpatialDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeBuildingEntityFingerprint(input: {
  cityId: string;
  hoodId: number;
  streetNameNormalized: string;
  areaSqm: number;
  buildingAgeYears: number;
  totalFloors: number;
  lat?: number;
  lng?: number;
}): BuildingEntityFingerprint {
  const cityId = String(input.cityId || 'tehran').trim().toLowerCase();
  const hoodId = Math.max(1, Math.round(Number(input.hoodId) || 1));
  const streetNameNormalized = normalizePersianStreetName(input.streetNameNormalized);
  const areaBucket5Sqm = Math.max(20, Math.round((Number(input.areaSqm) || 85) / 5) * 5);
  const buildingAgeBucket = Math.max(0, Math.round((Number(input.buildingAgeYears) || 0) / 2) * 2);
  const totalFloors = Math.max(1, Math.round(Number(input.totalFloors) || 4));
  const hasCoords = typeof input.lat === 'number' && Number.isFinite(input.lat) && typeof input.lng === 'number' && Number.isFinite(input.lng);
  let spatialCell35m: string | null = null;
  if (hasCoords) {
    const latBucket = Math.round(((input.lat as number) * 111_320) / 35);
    const lngMetersPerDeg = 111_320 * Math.cos(((input.lat as number) * Math.PI) / 180);
    const lngBucket = Math.round(((input.lng as number) * lngMetersPerDeg) / 35);
    spatialCell35m = `${latBucket}:${lngBucket}`;
  }
  const canonicalKey = [cityId, hoodId, streetNameNormalized, `a${areaBucket5Sqm}`, `age${buildingAgeBucket}`, `f${totalFloors}`, spatialCell35m ?? 'no-geo'].join('|');
  const fingerprintHash = crypto.createHash('sha256').update(canonicalKey).digest('hex').slice(0, 24);
  return {
    fingerprintHash,
    cityId,
    hoodId,
    streetNameNormalized,
    areaBucket5Sqm,
    buildingAgeBucket,
    totalFloors,
    spatialCell35m,
    ...(hasCoords ? { lat: input.lat, lng: input.lng } : {}),
  };
}

export function computeBuildingSimilarityScore(
  fp: BuildingEntityFingerprint,
  candidate: CanonicalBuildingRecord,
): { similarityScore: number; within35mRadius: boolean; distanceMeters: number | null } {
  if (fp.cityId !== candidate.cityId || fp.hoodId !== candidate.hoodId) {
    return { similarityScore: 0, within35mRadius: false, distanceMeters: null };
  }
  let distanceMeters: number | null = null;
  let within35mRadius = false;
  if (typeof fp.lat === 'number' && typeof fp.lng === 'number' && typeof candidate.lat === 'number' && typeof candidate.lng === 'number') {
    distanceMeters = computeSpatialDistanceMeters(fp.lat, fp.lng, candidate.lat, candidate.lng);
    within35mRadius = distanceMeters <= 35;
    if (distanceMeters > 120) return { similarityScore: 0.15, within35mRadius: false, distanceMeters };
  }
  const hasKnownStreet = fp.streetNameNormalized !== 'نامشخص' && candidate.streetNameNormalized !== 'نامشخص';
  const streetScore = !hasKnownStreet
    ? 0
    : fp.streetNameNormalized === candidate.streetNameNormalized
      ? 1
      : fp.streetNameNormalized.includes(candidate.streetNameNormalized) || candidate.streetNameNormalized.includes(fp.streetNameNormalized)
        ? 0.85
        : 0;
  const areaDiff = Math.abs(fp.areaBucket5Sqm - candidate.areaBucket5Sqm);
  const areaScore = areaDiff === 0 ? 1 : areaDiff <= 5 ? 0.9 : areaDiff <= 10 ? 0.65 : 0;
  const ageDiff = Math.abs(fp.buildingAgeBucket - candidate.buildingAgeBucket);
  const ageScore = ageDiff === 0 ? 1 : ageDiff <= 2 ? 0.9 : ageDiff <= 4 ? 0.6 : 0;
  const floorDiff = Math.abs(fp.totalFloors - candidate.totalFloors);
  const floorScore = floorDiff === 0 ? 1 : floorDiff === 1 ? 0.85 : 0;
  const spatialScore =
    distanceMeters === null
      ? streetScore > 0
        ? 0.9
        : 0.35
      : within35mRadius
        ? 1
        : distanceMeters <= 60
          ? 0.65
          : 0.2;
  const weighted = streetScore * 0.32 + areaScore * 0.2 + ageScore * 0.16 + floorScore * 0.16 + spatialScore * 0.16;
  return { similarityScore: Number(Math.min(1, Math.max(0, weighted)).toFixed(4)), within35mRadius, distanceMeters };
}

export function resolveCanonicalRedirectId(buildingId: string): { resolvedBuildingId: string; wasRedirected: boolean; redirectHopCount: number } {
  let current = String(buildingId || '').trim();
  const visited = new Set<string>();
  let hops = 0;
  while (buildingAliasRedirectMap.has(current) && !visited.has(current) && hops < 16) {
    visited.add(current);
    const next = buildingAliasRedirectMap.get(current)!;
    if (!next || next === current) break;
    current = next;
    hops += 1;
  }
  return { resolvedBuildingId: current, wasRedirected: hops > 0, redirectHopCount: hops };
}

export function resolveOrMergeCanonicalBuilding(
  input: { cityId: string; hoodId: number; streetNameNormalized: string; areaSqm: number; buildingAgeYears: number; totalFloors: number; lat?: number; lng?: number },
  factId?: string,
): EntityResolutionOutcome {
  const fp = computeBuildingEntityFingerprint(input);
  let bestCandidate: CanonicalBuildingRecord | null = null;
  let bestSimilarity = 0;
  let bestWithin35m = false;

  for (const record of canonicalBuildingStore.values()) {
    if (record.status !== 'ACTIVE') continue;
    const { similarityScore, within35mRadius, distanceMeters } = computeBuildingSimilarityScore(fp, record);
    if (process.env.NODE_ENV !== 'production') {
      console.debug(
        `[EntityResolution] candidate=${record.canonicalBuildingId} similarity=${(similarityScore * 100).toFixed(1)}% threshold85=${similarityScore >= 0.85} distM=${distanceMeters !== null ? distanceMeters.toFixed(1) : 'n/a'} within35m=${within35mRadius} buckets=(area:${fp.areaBucket5Sqm},age:${fp.buildingAgeBucket},floors:${fp.totalFloors})`,
      );
    }
    if (similarityScore > bestSimilarity) {
      bestSimilarity = similarityScore;
      bestCandidate = record;
      bestWithin35m = within35mRadius;
    }
  }

  const nowIso = new Date().toISOString();
  if (bestCandidate && bestSimilarity >= 0.85) {
    const redirected = resolveCanonicalRedirectId(bestCandidate.canonicalBuildingId);
    const activeRecord = canonicalBuildingStore.get(redirected.resolvedBuildingId) ?? bestCandidate;
    if (factId && !activeRecord.linkedFactIds.includes(factId)) activeRecord.linkedFactIds.push(factId);
    activeRecord.updatedAtIso = nowIso;
    return { canonicalBuildingId: activeRecord.canonicalBuildingId, matchedExisting: true, similarityScore: bestSimilarity, within35mRadius: bestWithin35m, fingerprint: fp, buildingRecord: activeRecord };
  }

  const baseBuildingId = `bld_${fp.fingerprintHash.slice(0, 12)}`;
  const canonicalBuildingId = canonicalBuildingStore.has(baseBuildingId)
    ? `bld_${crypto.createHash('sha256').update(`${fp.fingerprintHash}|${factId || canonicalBuildingStore.size}`).digest('hex').slice(0, 12)}`
    : baseBuildingId;
  const newRecord: CanonicalBuildingRecord = {
    canonicalBuildingId,
    cityId: fp.cityId,
    hoodId: fp.hoodId,
    streetNameNormalized: fp.streetNameNormalized,
    areaBucket5Sqm: fp.areaBucket5Sqm,
    buildingAgeBucket: fp.buildingAgeBucket,
    totalFloors: fp.totalFloors,
    ...(typeof fp.lat === 'number' && typeof fp.lng === 'number' ? { lat: fp.lat, lng: fp.lng } : {}),
    status: 'ACTIVE',
    mergedIntoBuildingId: null,
    aliasBuildingIds: [],
    linkedFactIds: factId ? [factId] : [],
    fingerprintHash: fp.fingerprintHash,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
  if (!canonicalBuildingStore.has(canonicalBuildingId) && canonicalBuildingStore.size >= 2000) {
    const oldestKey = canonicalBuildingStore.keys().next().value;
    if (oldestKey !== undefined) canonicalBuildingStore.delete(oldestKey);
  }
  canonicalBuildingStore.set(canonicalBuildingId, newRecord);
  void formatMillionTomanAsIntlCurrency(100, 'USD');
  return { canonicalBuildingId, matchedExisting: false, similarityScore: 1, within35mRadius: Boolean(fp.spatialCell35m), fingerprint: fp, buildingRecord: newRecord };
}

export function mergeDuplicateCanonicalBuildings(
  sourceBuildingId: string,
  targetBuildingId: string,
): { merged: boolean; canonicalBuildingId: string; aliasRedirectFrom: string; record: CanonicalBuildingRecord | null } {
  const sourceResolved = resolveCanonicalRedirectId(sourceBuildingId).resolvedBuildingId;
  const targetResolved = resolveCanonicalRedirectId(targetBuildingId).resolvedBuildingId;
  const sourceRec = canonicalBuildingStore.get(sourceResolved);
  const targetRec = canonicalBuildingStore.get(targetResolved);
  if (!sourceRec || !targetRec || sourceResolved === targetResolved) {
    return { merged: false, canonicalBuildingId: targetResolved, aliasRedirectFrom: sourceBuildingId, record: targetRec ?? null };
  }
  const nowIso = new Date().toISOString();
  sourceRec.status = 'MERGED_INTO';
  sourceRec.mergedIntoBuildingId = targetResolved;
  sourceRec.updatedAtIso = nowIso;
  if (buildingAliasRedirectMap.size >= 2000) {
    const oldestAlias = buildingAliasRedirectMap.keys().next().value;
    if (oldestAlias !== undefined) buildingAliasRedirectMap.delete(oldestAlias);
  }
  buildingAliasRedirectMap.set(sourceBuildingId, targetResolved);
  buildingAliasRedirectMap.set(sourceResolved, targetResolved);
  for (const alias of sourceRec.aliasBuildingIds) {
    buildingAliasRedirectMap.set(alias, targetResolved);
    if (!targetRec.aliasBuildingIds.includes(alias)) targetRec.aliasBuildingIds.push(alias);
  }
  if (!targetRec.aliasBuildingIds.includes(sourceResolved)) targetRec.aliasBuildingIds.push(sourceResolved);
  for (const fid of sourceRec.linkedFactIds) {
    if (!targetRec.linkedFactIds.includes(fid)) targetRec.linkedFactIds.push(fid);
  }
  targetRec.updatedAtIso = nowIso;
  return { merged: true, canonicalBuildingId: targetResolved, aliasRedirectFrom: sourceResolved, record: targetRec };
}

export function getCanonicalBuildingById(buildingId: string): {
  found: boolean;
  requestedBuildingId: string;
  canonicalBuildingId: string;
  wasRedirected: boolean;
  redirectHopCount: number;
  record: CanonicalBuildingRecord | null;
} {
  const { resolvedBuildingId, wasRedirected, redirectHopCount } = resolveCanonicalRedirectId(buildingId);
  const record = canonicalBuildingStore.get(resolvedBuildingId) ?? null;
  return { found: record !== null, requestedBuildingId: buildingId, canonicalBuildingId: record ? record.canonicalBuildingId : resolvedBuildingId, wasRedirected, redirectHopCount, record };
}

export function resetEntityResolutionStoreForTests(): void {
  canonicalBuildingStore.clear();
  buildingAliasRedirectMap.clear();
}

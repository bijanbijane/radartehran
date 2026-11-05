import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from './areaUnit';
export type MutationIdempotencyStatus = 'new_execution' | 'in_progress' | 'replayed_completed' | 'payload_mismatch_conflict' | 'cross_account_forbidden';
export interface StoredIdempotencyEntry<T = unknown> { idempotencyKey: string; actorScope: string; operationType: string; payloadFingerprint: string; state: 'in_progress' | 'completed' | 'failed_safely'; resultSnapshot?: T; createdAtMs: number; expiresAtMs: number; }
export function computeCanonicalPayloadFingerprint(payload: unknown, depth = 0, seen = new WeakSet<object>()): string {
  if (payload === null || payload === undefined) return 'null';
  if (typeof payload !== 'object') return `${typeof payload}:${String(payload)}`;
  if (depth > 12) return '"[MAX_DEPTH]"';
  if (seen.has(payload as object)) return '"[CIRCULAR]"';
  seen.add(payload as object);
  if (Array.isArray(payload)) return `[${payload.map((item) => computeCanonicalPayloadFingerprint(item, depth + 1, seen)).join(',')}]`;
  const obj = payload as Record<string, unknown>; const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys
    .filter((k) => obj[k] !== undefined && k !== 'idempotencyKey' && k !== 'clientTimestamp' && k !== '__proto__' && k !== 'constructor' && k !== 'prototype')
    .map((k) => `${JSON.stringify(k)}:${computeCanonicalPayloadFingerprint(obj[k], depth + 1, seen)}`);
  return `{${pairs.join(',')}}`;
}
export class CentralizedMutationIdempotencyStore {
  private readonly records = new Map<string, StoredIdempotencyEntry>(); private readonly maxEntries: number; private readonly defaultTtlMs: number;
  constructor(maxEntries = 2000, defaultTtlMs = 24 * 60 * 60 * 1000) { this.maxEntries = maxEntries; this.defaultTtlMs = defaultTtlMs; }
  public evaluateOrClaim(input: { idempotencyKey: string; actorScope: string; operationType: string; payload: unknown; nowMs?: number; }): { status: MutationIdempotencyStatus; httpStatus: 200 | 202 | 403 | 409; existingResult?: unknown } {
    const now = input.nowMs ?? Date.now(); this.evictExpired(now);
    const compositeKey = `${input.operationType}:${input.idempotencyKey}`;
    const fingerprint = computeCanonicalPayloadFingerprint(input.payload); const existing = this.records.get(compositeKey);
    if (existing && existing.expiresAtMs > now) {
      if (existing.actorScope !== input.actorScope) return { status: 'cross_account_forbidden', httpStatus: 403 };
      if (existing.payloadFingerprint !== fingerprint) return { status: 'payload_mismatch_conflict', httpStatus: 409 };
      if (existing.state === 'in_progress') return { status: 'in_progress', httpStatus: 202 };
      if (existing.state === 'completed') return { status: 'replayed_completed', httpStatus: 200, existingResult: existing.resultSnapshot };
    }
    this.records.set(compositeKey, { idempotencyKey: input.idempotencyKey, actorScope: input.actorScope, operationType: input.operationType, payloadFingerprint: fingerprint, state: 'in_progress', createdAtMs: now, expiresAtMs: now + this.defaultTtlMs });
    return { status: 'new_execution', httpStatus: 200 };
  }
  public markCompleted(operationType: string, idempotencyKey: string, resultSnapshot: unknown): void {
    const entry = this.records.get(`${operationType}:${idempotencyKey}`);
    if (entry) { entry.state = 'completed'; entry.resultSnapshot = resultSnapshot; }
  }
  public markFailedSafely(operationType: string, idempotencyKey: string): void { this.records.delete(`${operationType}:${idempotencyKey}`); }
  private evictExpired(nowMs: number): void {
    for (const [k, v] of this.records.entries()) { if (v.expiresAtMs <= nowMs) this.records.delete(k); }
    while (this.records.size >= this.maxEntries) { const oldestKey = this.records.keys().next().value; if (!oldestKey) break; this.records.delete(oldestKey); }
  }
}
export const globalMutationIdempotencyStore = new CentralizedMutationIdempotencyStore();
export function selectDistributedCounterShardId(entityId: string | number, actorKey: string, shardCount = 10): string {
  const safeShards = Math.max(1, Math.min(64, Math.trunc(shardCount))); let hash = 2166136261;
  const seed = `${entityId}:${actorKey}`;
  for (let i = 0; i < seed.length; i++) { hash ^= seed.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return `shard_${Math.abs(hash) % safeShards}`;
}
export interface CursorPaginationToken { sortValue: number | string; tieBreakerId: string; filterContextHash: string; }
export function encodePaginationCursor(token: CursorPaginationToken): string { return Buffer.from(JSON.stringify(token), 'utf-8').toString('base64url'); }
export function decodeAndValidatePaginationCursor(
  encodedCursor: string | null | undefined,
  expectedFilterContextHash: string,
): { valid: boolean; token: CursorPaginationToken | null; resetReason: string | null } {
  if (!encodedCursor || !encodedCursor.trim()) return { valid: true, token: null, resetReason: null };
  if (encodedCursor.length > 2048) return { valid: false, token: null, resetReason: 'MALFORMED_CURSOR_TOKEN' };
  try {
    const raw = Buffer.from(encodedCursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(raw, (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v)) as CursorPaginationToken;
    if (!parsed || typeof parsed.tieBreakerId !== 'string' || !parsed.filterContextHash) {
      return { valid: false, token: null, resetReason: 'MALFORMED_CURSOR_TOKEN' };
    }
    if (parsed.filterContextHash !== expectedFilterContextHash) {
      return { valid: false, token: null, resetReason: 'FILTER_CONTEXT_CHANGED' };
    }
    return { valid: true, token: parsed, resetReason: null };
  } catch {
    return { valid: false, token: null, resetReason: 'INVALID_BASE64_CURSOR' };
  }
}
export function paginateDeterministicItems<T extends { id: string; sortMetric: number }>(
  items: T[],
  options: { requestedPageSize?: number; maxServerPageSize?: number; encodedCursor?: string | null; filterContextHash: string; direction?: 'asc' | 'desc'; },
): { pageItems: T[]; nextCursor: string | null; hasMore: boolean; cursorResetReason: string | null; } {
  const maxPage = options.maxServerPageSize ?? 50;
  const pageSize = Math.max(1, Math.min(maxPage, Math.trunc(options.requestedPageSize || 20)));
  const dir = options.direction === 'asc' ? 1 : -1;
  const sorted = [...items].sort((a, b) => (a.sortMetric !== b.sortMetric ? (a.sortMetric - b.sortMetric) * dir : a.id.localeCompare(b.id)));
  const cursorCheck = decodeAndValidatePaginationCursor(options.encodedCursor, options.filterContextHash);
  let startIndex = 0;
  if (cursorCheck.valid && cursorCheck.token) {
    const tok = cursorCheck.token;
    const foundIdx = sorted.findIndex((item) => item.sortMetric === tok.sortValue && item.id === tok.tieBreakerId);
    if (foundIdx !== -1) startIndex = foundIdx + 1;
  }
  const pageItems = sorted.slice(startIndex, startIndex + pageSize);
  const hasMore = startIndex + pageSize < sorted.length;
  const lastItem = pageItems.length > 0 ? pageItems[pageItems.length - 1] : null;
  const nextCursor = hasMore && lastItem ? encodePaginationCursor({ sortValue: lastItem.sortMetric, tieBreakerId: lastItem.id, filterContextHash: options.filterContextHash }) : null;
  return { pageItems, nextCursor, hasMore, cursorResetReason: cursorCheck.resetReason };
}
export interface SearchIndexProjectionEntry { listingId: string; cityId: string; neighborhoodId: number; dealType: 'خرید' | 'اجاره'; normalizedTitle: string; priceMillions: number; areaSqm: number; sourceVersionMs: number; }
export function reconcileIncrementalSearchProjection(
  currentIndex: Map<string, SearchIndexProjectionEntry>,
  incomingEvent: { listingId: string; lifecycleState: 'draft' | 'pending_review' | 'published' | 'rejected' | 'withdrawn' | 'sold' | 'rented' | 'expired' | 'archived' | 'deleted'; sourceVersionMs: number; projection?: Omit<SearchIndexProjectionEntry, 'sourceVersionMs'>; },
): { action: 'upserted' | 'removed' | 'ignored_stale_event'; displayAreaUnitLabel: string; priceIntlText?: string } {
  const displayAreaUnitLabel = formatAreaUnitLabel(getStoredAreaUnit());
  const existing = currentIndex.get(incomingEvent.listingId);
  if (existing && incomingEvent.sourceVersionMs < existing.sourceVersionMs) return { action: 'ignored_stale_event', displayAreaUnitLabel };
  if (incomingEvent.lifecycleState !== 'published' || !incomingEvent.projection) {
    currentIndex.delete(incomingEvent.listingId);
    return { action: 'removed', displayAreaUnitLabel };
  }
  currentIndex.set(incomingEvent.listingId, { ...incomingEvent.projection, sourceVersionMs: incomingEvent.sourceVersionMs });
  return { action: 'upserted', displayAreaUnitLabel, priceIntlText: formatMillionTomanAsIntlCurrency(incomingEvent.projection.priceMillions, getStoredIntlCurrency()) };
}
export function evaluateCorsOriginPolicy(
  requestOrigin: string | undefined,
  allowedOrigins: readonly string[],
  allowCredentials = true,
): { allowed: boolean; allowOriginHeader: string | null; allowCredentialsHeader: 'true' | null; varyHeader: 'Origin'; } {
  if (!requestOrigin) return { allowed: true, allowOriginHeader: null, allowCredentialsHeader: null, varyHeader: 'Origin' };
  const normalizedOrigin = requestOrigin.trim().replace(/\/+$/, '').toLowerCase();
  const isAllowed =
    allowedOrigins.some((o) => o.trim().replace(/\/+$/, '').toLowerCase() === normalizedOrigin) ||
    /^https?:\/\/localhost(:\d+)?$/.test(normalizedOrigin) ||
    /^https:\/\/ais-(dev|pre)-[a-z0-9-]+-\d+\.[a-z0-9-]+\.run\.app$/.test(normalizedOrigin);
  if (!isAllowed) return { allowed: false, allowOriginHeader: null, allowCredentialsHeader: null, varyHeader: 'Origin' };
  return { allowed: true, allowOriginHeader: requestOrigin, allowCredentialsHeader: allowCredentials ? 'true' : null, varyHeader: 'Origin' };
}
/**
 * Stale Deployment Chunk Recovery Policy (Prompt 990).
 */
export function isStaleChunkLoadError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message || error || '').toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('chunkloaderror') ||
    msg.includes('vite:preloaderror')
  );
}
export function shouldAttemptSingleChunkReload(
  chunkError: unknown,
  hasUnsavedDraftWork: boolean,
  sessionReloadCount: number,
): { shouldReloadNow: boolean; nextReloadCount: number; reasonFa: string } {
  if (!isStaleChunkLoadError(chunkError)) {
    return { shouldReloadNow: false, nextReloadCount: sessionReloadCount, reasonFa: 'خطای رخ‌داده ناشی از تغییر نسخه فایل‌های استاتیک نیست.' };
  }
  if (hasUnsavedDraftWork) {
    return {
      shouldReloadNow: false,
      nextReloadCount: sessionReloadCount,
      reasonFa: 'نسخه جدید برنامه منتشر شده است؛ برای حفظ اطلاعات فرم در حال تکمیل، بارگذاری مجدد خودکار متوقف شد.',
    };
  }
  if (sessionReloadCount >= 1) {
    return {
      shouldReloadNow: false,
      nextReloadCount: sessionReloadCount,
      reasonFa: 'تلاش خودکار برای دریافت نسخه جدید قبلاً انجام شده است (جلوگیری از حلقه تکرار).',
    };
  }
  return { shouldReloadNow: true, nextReloadCount: sessionReloadCount + 1, reasonFa: 'در حال دریافت فایل‌های نسخه جدید برنامه...' };
}
/**
 * Bidirectional RTL & Mixed-Script Text Isolation Helper (Prompt 993).
 * Wraps phone numbers, URLs, Latin codes, and directional numerals in Unicode FSI/PDI (`\u2068...\u2069`)
 * so adjacent Persian RTL text never scrambles their visual order.
 */
export function formatBidiIsolatedToken(token: string | number): string {
  const str = String(token ?? '').trim();
  if (!str) return '';
  return `\u2068${str}\u2069`;
}
/**
 * Transient & Expired Data Retention Dry-Run Cleanup Engine (Prompt 997).
 * Protects any object still referenced by an active listing or draft.
 */
export interface RetentionCandidateItem {
  resourceId: string;
  category: 'expired_draft' | 'orphan_media' | 'expired_idempotency_key' | 'historical_transaction';
  createdAtMs: number;
  isReferencedByActiveRecord: boolean;
}
export function evaluateDataRetentionCleanupBatch(
  candidates: RetentionCandidateItem[],
  options: {
    nowMs?: number;
    dryRun: boolean;
    maxBatchSize?: number;
  },
): {
  dryRun: boolean;
  eligibleForDeletionIds: string[];
  skippedActiveReferenceIds: string[];
  protectedHistoricalIds: string[];
} {
  const now = options.nowMs ?? Date.now();
  const maxBatch = options.maxBatchSize ?? 100;
  const retentionTtlByCategory: Record<RetentionCandidateItem['category'], number> = {
    expired_draft: 30 * 24 * 60 * 60 * 1000,
    orphan_media: 7 * 24 * 60 * 60 * 1000,
    expired_idempotency_key: 24 * 60 * 60 * 1000,
    historical_transaction: Number.POSITIVE_INFINITY,
  };
  const eligibleForDeletionIds: string[] = [];
  const skippedActiveReferenceIds: string[] = [];
  const protectedHistoricalIds: string[] = [];
  for (const item of candidates.slice(0, maxBatch)) {
    if (item.category === 'historical_transaction') {
      protectedHistoricalIds.push(item.resourceId);
      continue;
    }
    if (item.isReferencedByActiveRecord) {
      skippedActiveReferenceIds.push(item.resourceId);
      continue;
    }
    const ttl = retentionTtlByCategory[item.category];
    if (now - item.createdAtMs >= ttl) {
      eligibleForDeletionIds.push(item.resourceId);
    }
  }
  return {
    dryRun: options.dryRun,
    eligibleForDeletionIds,
    skippedActiveReferenceIds,
    protectedHistoricalIds,
  };
}
/**
 * High-Traffic Firestore Read Amplification & Query Bound Optimizer (Prompt 998).
 */
export function enforceBoundedFirestoreQueryLimit(
  requestedLimit: number | undefined,
  workflowType: 'map_viewport' | 'search_dropdown' | 'property_detail' | 'admin_table',
): number {
  const maxByWorkflow: Record<typeof workflowType, number> = {
    map_viewport: 60, search_dropdown: 20, property_detail: 6, admin_table: 50, }; const cap = maxByWorkflow[workflowType]; if (!requestedLimit || !Number.isFinite(requestedLimit) || requestedLimit <= 0) { return Math.min(25, cap); } return Math.max(1, Math.min(cap, Math.trunc(requestedLimit))); }
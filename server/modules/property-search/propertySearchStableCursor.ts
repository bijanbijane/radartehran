import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PropertySearchQueryFilters, SearchSortMode } from './types';

const CURSOR_VERSION = 2;

export interface StableSearchCursorPayload {
  sortValue: string | number;
  stableRecordId: string;
  queryFingerprint: string;
  sortMode: SearchSortMode;
  sourceWatermark: string;
  cursorVersion: number;
}

export class InvalidSearchCursorError extends Error {
  readonly code = 'INVALID_SEARCH_CURSOR';
}

export class StaleSearchCursorError extends Error {
  readonly code = 'SEARCH_CURSOR_STALE';
}

function cursorSecret(): string {
  return process.env.SEARCH_CURSOR_HMAC_SECRET || process.env.ADMIN_API_SECRET || 'dev-search-cursor-hmac';
}

export function buildQueryFingerprint(filters: PropertySearchQueryFilters, sort: SearchSortMode): string {
  return createHmac('sha256', cursorSecret())
    .update(JSON.stringify({ filters, sort }))
    .digest('hex')
    .slice(0, 24);
}

export function encodeStableSearchCursor(payload: StableSearchCursorPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', cursorSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function decodeStableSearchCursor(
  cursorStr: string | undefined,
  expectedFingerprint: string,
): StableSearchCursorPayload {
  if (!cursorStr) {
    throw new InvalidSearchCursorError('Missing cursor');
  }
  const parts = cursorStr.split('.');
  if (parts.length !== 2) throw new InvalidSearchCursorError('Malformed cursor');
  const [body, sig] = parts;
  const expectedSig = createHmac('sha256', cursorSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new InvalidSearchCursorError('Invalid cursor signature');
  }
  let parsed: StableSearchCursorPayload;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StableSearchCursorPayload;
  } catch {
    throw new InvalidSearchCursorError('Invalid cursor payload');
  }
  if (parsed.cursorVersion !== CURSOR_VERSION) throw new StaleSearchCursorError('Cursor version mismatch');
  if (parsed.queryFingerprint !== expectedFingerprint) throw new StaleSearchCursorError('Cursor query mismatch');
  return parsed;
}

export function sortTupleForItem(
  item: { id: string; publishedAtIso?: string; askingPriceTotalMillion?: number; areaSqm?: number },
  sortMode: SearchSortMode,
): { sortValue: string | number; stableRecordId: string } {
  switch (sortMode) {
    case 'price_asc':
      return { sortValue: item.askingPriceTotalMillion ?? 0, stableRecordId: item.id };
    case 'price_desc':
      return { sortValue: -(item.askingPriceTotalMillion ?? 0), stableRecordId: item.id };
    case 'area_asc':
      return { sortValue: item.areaSqm ?? 0, stableRecordId: item.id };
    case 'area_desc':
      return { sortValue: -(item.areaSqm ?? 0), stableRecordId: item.id };
    case 'oldest':
      return { sortValue: item.publishedAtIso ?? '', stableRecordId: item.id };
    case 'newest':
    default:
      return { sortValue: item.publishedAtIso ?? '', stableRecordId: item.id };
  }
}

export { CURSOR_VERSION };
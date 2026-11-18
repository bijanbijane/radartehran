/** @file server/modules/search/socialFeedCursor.ts — RT-SOCIAL-IMPL-007 Social Feed Cursor Codec, Fingerprint Validation & Projection DTO */
import crypto from 'node:crypto';
import {
  CommunityHttpError,
  type CommunityOrderBy,
} from '../community/communityFirestoreAdapter';
import {
  FEED_SCORE_FORMULA_VERSION,
  type SocialFeedIndexDocument,
} from './socialFeedProjection';

export const MAX_FEED_PAGE_LIMIT = 30;
export const DEFAULT_FEED_PAGE_LIMIT = 12;
export const MAX_CURSOR_LENGTH = 2048;

export interface SocialFeedItem {
  id: string;
  recordKind: 'discussion' | 'question' | 'correction' | 'research_proposal';
  neighborhoodId: number;
  topicId: string;
  authorUid: string;
  titleFa: string;
  excerptFa: string;
  createdAtIso: string;
  helpfulCount: number;
  replyCount: number;
  feedScore: number;
  formulaVersion: string;
}

export interface SocialFeedCursor {
  version: 1;
  lastDocumentId: string;
  lastCreatedAtIso: string;
  lastFeedScore: number;
  queryFingerprint: string;
  formulaVersion: string;
  followSetVersion?: string;
  issuedAtIso: string;
}

export const FEED_INDEX_ORDER_BY: CommunityOrderBy[] = [
  { field: 'feedScore', direction: 'desc' },
  { field: 'createdAtIso', direction: 'desc' },
  { field: 'id', direction: 'asc' },
];

export function computeQueryFingerprint(descriptor: string): string {
  return crypto.createHash('sha256').update(descriptor, 'utf8').digest('hex').slice(0, 24);
}

export function encodeSocialFeedCursor(cursor: SocialFeedCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function validateAndDecodeSocialFeedCursor(
  rawCursor: string | null | undefined,
  expected: {
    queryFingerprint: string;
    formulaVersion?: string;
    followSetVersion?: string;
  },
): SocialFeedCursor | null {
  if (rawCursor === undefined || rawCursor === null || rawCursor === '') return null;
  if (typeof rawCursor !== 'string' || rawCursor.length > MAX_CURSOR_LENGTH) {
    throw new CommunityHttpError(
      400,
      'INVALID_FEED_CURSOR',
      'نشانگر صفحه‌بندی نامعتبر یا بیش از حد طولانی است.',
    );
  }
  let parsed: Record<string, unknown>;
  try {
    const jsonStr = Buffer.from(rawCursor, 'base64url').toString('utf8');
    const obj = JSON.parse(jsonStr);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error('NOT_OBJECT');
    }
    parsed = obj as Record<string, unknown>;
  } catch {
    throw new CommunityHttpError(400, 'INVALID_FEED_CURSOR', 'ساختار نشانگر صفحه‌بندی نامعتبر است.');
  }

  if (
    parsed.version !== 1 ||
    typeof parsed.lastDocumentId !== 'string' ||
    !parsed.lastDocumentId.trim() ||
    typeof parsed.lastCreatedAtIso !== 'string' ||
    !parsed.lastCreatedAtIso.trim() ||
    typeof parsed.lastFeedScore !== 'number' ||
    !Number.isFinite(parsed.lastFeedScore) ||
    typeof parsed.queryFingerprint !== 'string' ||
    typeof parsed.formulaVersion !== 'string' ||
    typeof parsed.issuedAtIso !== 'string'
  ) {
    throw new CommunityHttpError(400, 'INVALID_FEED_CURSOR', 'فیلدهای نشانگر صفحه‌بندی ناقص یا نامعتبر است.');
  }

  if (parsed.queryFingerprint !== expected.queryFingerprint) {
    throw new CommunityHttpError(
      409,
      'FEED_CURSOR_MISMATCH',
      'نشانگر صفحه‌بندی متعلق به کوئری یا کاربر دیگری است.',
    );
  }

  const expectedFormula = expected.formulaVersion ?? FEED_SCORE_FORMULA_VERSION;
  if (parsed.formulaVersion !== expectedFormula) {
    throw new CommunityHttpError(
      409,
      'FEED_CURSOR_STALE',
      'نسخه فرمول رتبه‌بندی فید تغییر کرده است؛ لطفاً از صفحه نخست بازخوانی کنید.',
    );
  }

  if (
    expected.followSetVersion !== undefined &&
    parsed.followSetVersion !== expected.followSetVersion
  ) {
    throw new CommunityHttpError(
      409,
      'FEED_CURSOR_STALE',
      'مجموعه دنبال‌شونده‌های شما تغییر کرده است؛ لطفاً فید را از ابتدا بازخوانی کنید.',
    );
  }

  return {
    version: 1,
    lastDocumentId: parsed.lastDocumentId,
    lastCreatedAtIso: parsed.lastCreatedAtIso,
    lastFeedScore: parsed.lastFeedScore,
    queryFingerprint: parsed.queryFingerprint,
    formulaVersion: parsed.formulaVersion,
    ...(typeof parsed.followSetVersion === 'string' ? { followSetVersion: parsed.followSetVersion } : {}),
    issuedAtIso: parsed.issuedAtIso,
  };
}

export function clampFeedLimit(rawLimit?: number): number {
  if (rawLimit === undefined || rawLimit === null) return DEFAULT_FEED_PAGE_LIMIT;
  const num = Number(rawLimit);
  if (!Number.isFinite(num) || num < 1) {
    throw new CommunityHttpError(400, 'INVALID_FEED_LIMIT', 'مقدار limit برای فید نامعتبر است.');
  }
  return Math.min(MAX_FEED_PAGE_LIMIT, Math.floor(num));
}

export function compareFeedIndexOrder(a: SocialFeedIndexDocument, b: SocialFeedIndexDocument): number {
  if (a.feedScore !== b.feedScore) return b.feedScore - a.feedScore;
  if (a.createdAtIso !== b.createdAtIso) return b.createdAtIso.localeCompare(a.createdAtIso);
  return a.id.localeCompare(b.id);
}

export function isStrictlyAfterCursor(doc: SocialFeedIndexDocument, cursor: SocialFeedCursor | null): boolean {
  if (!cursor) return true;
  if (doc.feedScore !== cursor.lastFeedScore) {
    return doc.feedScore < cursor.lastFeedScore;
  }
  if (doc.createdAtIso !== cursor.lastCreatedAtIso) {
    return doc.createdAtIso < cursor.lastCreatedAtIso;
  }
  return doc.id.localeCompare(cursor.lastDocumentId) > 0;
}

export function toSocialFeedItem(doc: SocialFeedIndexDocument): SocialFeedItem {
  return {
    id: doc.sourcePostId || doc.id,
    recordKind: doc.recordKind,
    neighborhoodId: Number(doc.neighborhoodId ?? 0),
    topicId: String(doc.topicId || 'general'),
    authorUid: String(doc.authorUid || 'anon'),
    titleFa: String(doc.titleFa || doc.normalizedTitleFa || '').slice(0, 140),
    excerptFa: String(doc.excerptFa || '').slice(0, 180),
    createdAtIso: String(doc.createdAtIso || ''),
    helpfulCount: Number(doc.helpfulCount ?? 0),
    replyCount: Number(doc.replyCount ?? 0),
    feedScore: Number(doc.feedScore ?? 0),
    formulaVersion: String(doc.formulaVersion || FEED_SCORE_FORMULA_VERSION),
  };
}

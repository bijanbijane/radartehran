/** @file server/modules/community/communityProfileCursorAndUsername.ts — RT-SOCIAL-IMPL-008 HMAC Cursor Codec & Direct Username Normalization/Uniqueness */
import crypto from 'node:crypto';
import type {
  CommunityProfile,
  ProfileContributionKind,
} from '../../../src/features/community/types/community.types';
import {
  CommunityHttpError,
  SOCIAL_COLLECTIONS,
  type CommunityDatabaseStore,
} from './communityFirestoreAdapter';

export const MAX_PROFILE_CURSOR_LENGTH = 2048;
const USERNAME_PATTERN = /^[a-z0-9_.-]{3,40}$/;

export interface ProfileTimelineCursor {
  version: 1;
  profileUserId: string;
  queryFingerprint: string;
  postsCursorDocId: string | null;
  commentsCursorDocId: string | null;
  issuedAtIso: string;
}

function getCursorHmacSecret(): string {
  return (
    process.env.PROFILE_CURSOR_HMAC_SECRET ||
    process.env.ADMIN_API_SECRET ||
    'tehran-radar-profile-timeline-cursor-hmac-v1'
  );
}

function signCursorPayload(payloadBase64Url: string): string {
  return crypto
    .createHmac('sha256', getCursorHmacSecret())
    .update(payloadBase64Url, 'utf8')
    .digest('base64url');
}

export function computeProfileTimelineFingerprint(
  profileUserId: string,
  kind: ProfileContributionKind,
): string {
  return crypto
    .createHash('sha256')
    .update(`profile-timeline:v1:uid=${profileUserId}:kind=${kind}`, 'utf8')
    .digest('hex')
    .slice(0, 24);
}

export function encodeProfileTimelineCursor(cursor: ProfileTimelineCursor): string {
  const payloadB64 = Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  const sig = signCursorPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function validateAndDecodeProfileTimelineCursor(
  rawCursor: string | null | undefined,
  expected: { profileUserId: string; queryFingerprint: string },
): ProfileTimelineCursor | null {
  if (rawCursor === undefined || rawCursor === null || rawCursor === '') return null;
  if (typeof rawCursor !== 'string' || rawCursor.length > MAX_PROFILE_CURSOR_LENGTH) {
    throw new CommunityHttpError(400, 'INVALID_PROFILE_CURSOR', 'نشانگر صفحه‌بندی مشارکت‌ها نامعتبر یا بیش از حد طولانی است.');
  }
  const parts = rawCursor.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new CommunityHttpError(400, 'INVALID_PROFILE_CURSOR', 'قالب یا امضای نشانگر صفحه‌بندی مشارکت‌ها نامعتبر است.');
  }
  const [payloadB64, providedSig] = parts;
  const expectedSig = signCursorPayload(payloadB64);
  const sigBufA = Buffer.from(providedSig, 'utf8');
  const sigBufB = Buffer.from(expectedSig, 'utf8');
  if (sigBufA.length !== sigBufB.length || !crypto.timingSafeEqual(sigBufA, sigBufB)) {
    throw new CommunityHttpError(400, 'INVALID_PROFILE_CURSOR', 'امضای نشانگر صفحه‌بندی مشارکت‌ها نامعتبر یا دستکاری‌شده است.');
  }

  let parsed: Record<string, unknown>;
  try {
    const obj = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('NOT_OBJECT');
    parsed = obj as Record<string, unknown>;
  } catch {
    throw new CommunityHttpError(400, 'INVALID_PROFILE_CURSOR', 'ساختار نشانگر صفحه‌بندی مشارکت‌ها نامعتبر است.');
  }

  if (
    parsed.version !== 1 ||
    typeof parsed.profileUserId !== 'string' ||
    !parsed.profileUserId.trim() ||
    typeof parsed.queryFingerprint !== 'string' ||
    !parsed.queryFingerprint.trim() ||
    (parsed.postsCursorDocId !== null && typeof parsed.postsCursorDocId !== 'string') ||
    (parsed.commentsCursorDocId !== null && typeof parsed.commentsCursorDocId !== 'string') ||
    typeof parsed.issuedAtIso !== 'string'
  ) {
    throw new CommunityHttpError(400, 'INVALID_PROFILE_CURSOR', 'فیلدهای نشانگر صفحه‌بندی مشارکت‌ها ناقص است.');
  }

  if (parsed.profileUserId !== expected.profileUserId || parsed.queryFingerprint !== expected.queryFingerprint) {
    throw new CommunityHttpError(409, 'PROFILE_CURSOR_MISMATCH', 'نشانگر صفحه‌بندی متعلق به پروفایل یا فیلتر مشارکت دیگری است.');
  }

  return {
    version: 1,
    profileUserId: parsed.profileUserId,
    queryFingerprint: parsed.queryFingerprint,
    postsCursorDocId: parsed.postsCursorDocId as string | null,
    commentsCursorDocId: parsed.commentsCursorDocId as string | null,
    issuedAtIso: parsed.issuedAtIso,
  };
}

export function normalizeCommunityUsername(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new CommunityHttpError(400, 'INVALID_USERNAME', 'نام کاربری باید رشته معتبر باشد.');
  }
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || !USERNAME_PATTERN.test(trimmed)) {
    throw new CommunityHttpError(400, 'INVALID_USERNAME', 'نام کاربری معتبر نیست (۳ تا ۴۰ کاراکتر از حروف انگلیسی، اعداد و زیرخط).');
  }
  return trimmed;
}

export async function assertCommunityUsernameUnique(
  store: CommunityDatabaseStore,
  rawUsername: string,
  currentUserId: string,
): Promise<string> {
  const normalized = normalizeCommunityUsername(rawUsername);
  const page = await store.queryDocs<CommunityProfile & Record<string, unknown>>(
    SOCIAL_COLLECTIONS.profiles,
    { filters: [{ field: 'username', op: '==', value: normalized }], limit: 1 },
  );
  const existing = page.items[0];
  if (existing && existing.userId !== currentUserId) {
    throw new CommunityHttpError(409, 'DUPLICATE_USERNAME', 'این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است.');
  }
  return normalized;
}

export async function lookupRawCommunityProfileByUsername(
  store: CommunityDatabaseStore,
  rawUsername: string,
): Promise<(CommunityProfile & Record<string, unknown>) | null> {
  const clean = normalizeCommunityUsername(rawUsername);
  const directPage = await store.queryDocs<CommunityProfile & Record<string, unknown>>(
    SOCIAL_COLLECTIONS.profiles,
    { filters: [{ field: 'username', op: '==', value: clean }], limit: 1 },
  );
  if (directPage.items[0]) return directPage.items[0];

  const rawTrimmed = rawUsername.trim();
  if (rawTrimmed !== clean) {
    const exactCasePage = await store.queryDocs<CommunityProfile & Record<string, unknown>>(
      SOCIAL_COLLECTIONS.profiles,
      { filters: [{ field: 'username', op: '==', value: rawTrimmed }], limit: 1 },
    );
    if (exactCasePage.items[0]) {
      const doc = exactCasePage.items[0];
      const migrated = { ...doc, username: clean };
      await store.setDoc(SOCIAL_COLLECTIONS.profiles, doc.userId || doc.id, migrated, true);
      return migrated;
    }
  }

  let legacyCursor: string | null = null;
  do {
    const legacyPage = await store.queryDocs<CommunityProfile & Record<string, unknown>>(
      SOCIAL_COLLECTIONS.profiles,
      { orderBy: [{ field: 'id', direction: 'asc' }], limit: 50, cursorDocId: legacyCursor },
    );
    const matchedLegacy = legacyPage.items.find(
      (p) => typeof p.username === 'string' && p.username.trim().toLowerCase() === clean,
    );
    if (matchedLegacy) {
      const migrated = { ...matchedLegacy, username: clean };
      await store.setDoc(SOCIAL_COLLECTIONS.profiles, matchedLegacy.userId || matchedLegacy.id, migrated, true);
      return migrated;
    }
    legacyCursor = legacyPage.nextCursor;
  } while (legacyCursor);

  return null;
}

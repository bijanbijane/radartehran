/** @file tests/social-search-persian.test.ts — Stage 7 Persian Normalization, Tokenization & Two-Phase Search Acceptance Suite (RT-SOCIAL-IMPL-007: FEED-021..FEED-028) */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommunityHttpError,
  MockFirestoreCommunityStore,
} from '../server/modules/community/communityFirestoreAdapter';
import { CommunityRateLimiter } from '../server/modules/community/communityRateLimiter';
import { CommunityUnifiedRepository } from '../server/modules/community/communityUnifiedRepository';
import { SocialDiscoveryAndFeedService } from '../server/modules/search/socialDiscoveryAndFeed';
import {
  extractNormalizedSearchTokens,
  normalizePersianSearchText,
} from '../server/modules/search/socialFeedProjection';

test('FEED-021..FEED-024: normalizePersianSearchText normalizes Arabic Yeh/Kaf, ZWNJ, diacritics, and Persian/Arabic digits consistently', () => {
  const raw = 'آپارتمانِ ميلياردي و خيابانِ ولي‌عصر با قيمت ١٢٣ و ۴۵۶ میلیون';
  const normalized = normalizePersianSearchText(raw);
  assert.equal(normalized.includes('ي'), false);
  assert.equal(normalized.includes('ك'), false);
  assert.ok(normalized.includes('میلیاردی'));
  assert.ok(normalized.includes('ولی عصر'));
  assert.ok(normalized.includes('123'));
  assert.ok(normalized.includes('456'));

  const tokens = extractNormalizedSearchTokens(raw);
  assert.ok(tokens.includes('میلیاردی'));
  assert.ok(tokens.includes('123'));
  // Single-character tokens like 'و' are excluded (< 2 chars)
  assert.equal(tokens.includes('و'), false);
});

test('FEED-025..FEED-028: Two-phase Persian search finds older posts beyond 200 recent posts, enforces multi-token phrase matching, and rejects >120 chars or >10 tokens', async () => {
  const store = new MockFirestoreCommunityStore();
  const repo = new CommunityUnifiedRepository(
    store,
    new CommunityRateLimiter({ COMMUNITY_RL_POST_MAX: '500' }),
  );
  const service = new SocialDiscoveryAndFeedService(() => store);
  const actor = { uid: 'user_search_1', emailVerified: true };

  // Create an early post with Arabic Yeh/Kaf variant ("فيبر نوري مخابرات سعادت‌آباد")
  const targetPost = await repo.createDiscussion(actor, {
    titleFa: 'گزارش سرعت فيبر نوري مخابرات در سعادت‌آباد',
    bodyFa: 'اتصال فیبر نوری در بلوار سرو سعادت‌آباد با سرعت ۵۰۰ مگابیت برقرار شد.',
    neighborhoodId: 1,
  });

  // Create 215 newer unrelated posts so targetPost is older than the 200 most recent posts
  for (let i = 1; i <= 215; i++) {
    await repo.createDiscussion(actor, {
      titleFa: `گفت‌وگوی عمومی درباره فضای سبز و بوستان شماره ${i}`,
      bodyFa: `بررسی وضعیت درختکاری و آبیاری فضای سبز در کوچه شماره ${i} محله.`,
      neighborhoodId: 1,
    });
  }

  // Search using standard Persian Yeh/Kaf ("فیبر نوری") -> must find targetPost even though 215 newer posts exist!
  const found = await service.searchSocial({
    q: 'فیبر نوری مخابرات',
    limit: 10,
  });
  assert.ok(found.items.some((item) => item.id === targetPost.item.id));

  // Search with a non-matching second token ("فیبر نوری مترو") -> must NOT match targetPost
  const notFound = await service.searchSocial({
    q: 'فیبر نوری مترو',
    limit: 10,
  });
  assert.ok(!notFound.items.some((item) => item.id === targetPost.item.id));

  // FEED-027: Query > 120 chars -> 400 SEARCH_QUERY_TOO_LONG
  const tooLongQuery = 'بازار مسکن تهران '.repeat(10);
  await assert.rejects(
    () => service.searchSocial({ q: tooLongQuery }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 400 && err.code === 'SEARCH_QUERY_TOO_LONG',
  );

  // FEED-028: Query > 10 tokens -> 400 SEARCH_QUERY_TOO_LONG
  const elevenTokens = 'تهران ونک سعادت‌آباد پاسداران جردن قلهک تجریش نیاوران فرمانیه زعفرانیه الهیه';
  await assert.rejects(
    () => service.searchSocial({ q: elevenTokens }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 400 && err.code === 'SEARCH_QUERY_TOO_LONG',
  );
});

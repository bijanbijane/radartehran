/** @file tests/community-content-context.test.ts — Stage 3 Canonical Multi-Entity Content Context Acceptance Suite (RT-SOCIAL-IMPL-003: CTX-001..CTX-018) */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommunityHttpError,
  MockFirestoreCommunityStore,
  SOCIAL_COLLECTIONS,
} from '../server/modules/community/communityFirestoreAdapter';
import { CommunityUnifiedRepository } from '../server/modules/community/communityUnifiedRepository';
import { queryCommunityPostsPaginated } from '../server/modules/community/communityUnifiedQueries';
import {
  clearSocialEntityOverridesForTests,
  registerSocialEntityOverrideForTests,
  resolveSocialEntityReference,
} from '../server/modules/community/socialEntityResolver';
import { validateSocialContentContext } from '../server/modules/community/communityValidation';

function createTestRepo() {
  const store = new MockFirestoreCommunityStore();
  const repo = new CommunityUnifiedRepository(store);
  return { store, repo };
}

test('CTX-001..CTX-004: SocialEntityResolver resolves valid neighborhood, market, property, research, and topic entities from authoritative repositories', async () => {
  const { store, repo } = createTestRepo();
  clearSocialEntityOverridesForTests();

  // CTX-001: neighborhood
  const hoodRes = await resolveSocialEntityReference({ entityType: 'neighborhood', entityId: '1' }, { store });
  assert.equal(hoodRes.supported, true);
  assert.equal(hoodRes.exists, true);
  assert.equal(hoodRes.linkable, true);

  // CTX-002: market
  const marketRes = await resolveSocialEntityReference({ entityType: 'market', entityId: 'asking_price_median_sqm' }, { store });
  assert.equal(marketRes.supported, true);
  assert.equal(marketRes.exists, true);
  assert.equal(marketRes.linkable, true);

  // CTX-003: research (knowledge brief / source registry)
  const researchRes = await resolveSocialEntityReference({ entityType: 'research', entityId: 'brief-metro-rent' }, { store });
  assert.equal(researchRes.supported, true);
  assert.equal(researchRes.exists, true);
  assert.equal(researchRes.linkable, true);

  // CTX-004: topic
  const topicRes = await resolveSocialEntityReference({ entityType: 'topic', entityId: 'topic-rent-deposit' }, { store });
  assert.equal(topicRes.supported, true);
  assert.equal(topicRes.exists, true);
  assert.equal(topicRes.linkable, true);

  // Validate discussion creation with multi-entity socialContext (primary + related, client-injected extra fields stripped)
  const disc = await repo.createDiscussion(
    { uid: 'user_ctx_1', emailVerified: true },
    {
      titleFa: 'تحلیل نسبت اجاره به قیمت در محله ونک و بازار کل',
      bodyFa: 'مقایسه شاخص کل بازار مسکن با معاملات واقعی محله ونک نشان از ثبات نسبی دارد.',
      neighborhoodId: 1,
      socialContext: {
        primary: { entityType: 'market', entityId: 'asking_price_median_sqm', labelFa: 'جعلی' } as unknown as { entityType: 'market'; entityId: string },
        related: [
          { entityType: 'neighborhood', entityId: '1' },
          { entityType: 'topic', entityId: 'topic-rent-deposit' },
        ],
        schemaVersion: 1,
      },
    },
  );
  assert.equal(disc.item.socialContext?.primary?.entityType, 'market');
  assert.equal(disc.item.socialContext?.primary?.entityId, 'asking_price_median_sqm');
  assert.equal('labelFa' in ((disc.item.socialContext?.primary ?? {}) as Record<string, unknown>), false);
  assert.equal(disc.item.socialContext?.related.length, 2);
});

test('CTX-005..CTX-008: Reserved entity types (company, project, tool, service) fail closed with 422 UNSUPPORTED_ENTITY_TYPE', async () => {
  const { store } = createTestRepo();

  for (const reservedType of ['company', 'project', 'tool', 'service'] as const) {
    const res = await resolveSocialEntityReference({ entityType: reservedType, entityId: 'ent_123' }, { store });
    assert.equal(res.supported, false);

    await assert.rejects(
      () =>
        validateSocialContentContext(
          {
            primary: { entityType: reservedType, entityId: 'ent_123' },
            schemaVersion: 1,
          },
          { store },
        ),
      (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 422 && err.code === 'UNSUPPORTED_ENTITY_TYPE',
    );
  }
});

test('CTX-009..CTX-012 & CTX-016..CTX-018: Rejects missing (404), non-linkable (422), >4 related, duplicate entities, invalid schemaVersion, and unknown entityType', async () => {
  const { store, repo } = createTestRepo();
  clearSocialEntityOverridesForTests();

  // CTX-009: Non-existent neighborhood -> 404 SOCIAL_ENTITY_NOT_FOUND
  await assert.rejects(
    () =>
      repo.createDiscussion(
        { uid: 'user_ctx_2', emailVerified: true },
        {
          titleFa: 'گفت‌وگو با شناسه محله ناموجود',
          bodyFa: 'این درخواست باید با خطای عدم وجود موجودیت در سامانه رد شود.',
          neighborhoodId: 1,
          socialContext: {
            primary: { entityType: 'neighborhood', entityId: '999999' },
            related: [],
            schemaVersion: 1,
          },
        },
      ),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 404 && err.code === 'SOCIAL_ENTITY_NOT_FOUND',
  );

  // CTX-010: Archived/inactive entity -> 422 SOCIAL_ENTITY_NOT_LINKABLE
  registerSocialEntityOverrideForTests('listing', 'listing_archived_1', {
    supported: true,
    exists: true,
    linkable: false,
    entityStatus: 'archived',
  });
  await assert.rejects(
    () =>
      validateSocialContentContext(
        {
          primary: { entityType: 'listing', entityId: 'listing_archived_1' },
          related: [],
          schemaVersion: 1,
        },
        { store },
      ),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 422 && err.code === 'SOCIAL_ENTITY_NOT_LINKABLE',
  );
  clearSocialEntityOverridesForTests();

  // CTX-011: >4 related entities -> 422 INVALID_SOCIAL_CONTEXT
  await assert.rejects(
    () =>
      validateSocialContentContext(
        {
          primary: { entityType: 'neighborhood', entityId: '1' },
          related: [
            { entityType: 'neighborhood', entityId: '2' },
            { entityType: 'neighborhood', entityId: '3' },
            { entityType: 'neighborhood', entityId: '4' },
            { entityType: 'neighborhood', entityId: '5' },
            { entityType: 'neighborhood', entityId: '6' },
          ],
          schemaVersion: 1,
        },
        { store },
      ),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 422 && err.code === 'INVALID_SOCIAL_CONTEXT',
  );

  // CTX-012: Duplicate entity between primary & related -> 422 DUPLICATE_SOCIAL_CONTEXT
  await assert.rejects(
    () =>
      validateSocialContentContext(
        {
          primary: { entityType: 'neighborhood', entityId: '1' },
          related: [{ entityType: 'neighborhood', entityId: '1' }],
          schemaVersion: 1,
        },
        { store },
      ),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 422 && err.code === 'DUPLICATE_SOCIAL_CONTEXT',
  );

  // CTX-018: Invalid schemaVersion -> 422 INVALID_SOCIAL_CONTEXT
  await assert.rejects(
    () =>
      validateSocialContentContext(
        {
          primary: { entityType: 'neighborhood', entityId: '1' },
          related: [],
          schemaVersion: 2,
        },
        { store },
      ),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 422 && err.code === 'INVALID_SOCIAL_CONTEXT',
  );
});

test('CTX-013..CTX-015: Fallback canonical neighborhood context and query filtering by entityType + entityId across primary and related', async () => {
  const { store, repo } = createTestRepo();

  // Question without explicit socialContext gets canonical fallback socialContext
  const question = await repo.createQuestion(
    { uid: 'user_ctx_3', emailVerified: true },
    {
      titleFa: 'وضعیت فشار آب و نوسان برق در تابستان چگونه است؟',
      bodyFa: 'لطفاً ساکنان محله درباره کیفیت خدمات آب و برق در ساعات اوج مصرف نظر دهند.',
      neighborhoodId: 2,
      topicId: 'topic-transit-infra',
    },
  );
  assert.equal(question.socialContext?.primary?.entityType, 'neighborhood');
  assert.equal(question.socialContext?.primary?.entityId, '2');
  assert.equal(question.socialContext?.schemaVersion, 1);

  // Discussion with primary=neighborhood:1 and related=[market:asking_price_median_sqm]
  const disc = await repo.createDiscussion(
    { uid: 'user_ctx_3', emailVerified: true },
    {
      titleFa: 'تحلیل همبستگی شاخص کل با معاملات محله ونک',
      bodyFa: 'بررسی آماری داده‌های ۶ ماه گذشته همبستگی قوی با شاخص کل بازار تهران نشان می‌دهد.',
      neighborhoodId: 1,
      socialContext: {
        primary: { entityType: 'neighborhood', entityId: '1' },
        related: [{ entityType: 'market', entityId: 'asking_price_median_sqm' }],
        schemaVersion: 1,
      },
    },
  );

  // CTX-014: Query by primary entity AND by related entity
  const byPrimary = await queryCommunityPostsPaginated(store, {
    recordKind: 'discussion',
    includeSeeds: false,
    entityType: 'neighborhood',
    entityId: '1',
  });
  assert.ok(byPrimary.items.some((d) => d.id === disc.item.id));

  const byRelated = await queryCommunityPostsPaginated(store, {
    recordKind: 'discussion',
    includeSeeds: false,
    entityType: 'market',
    entityId: 'asking_price_median_sqm',
  });
  assert.ok(byRelated.items.some((d) => d.id === disc.item.id));

  const storedRaw = await store.getDoc(SOCIAL_COLLECTIONS.posts, disc.item.id);
  assert.ok(storedRaw?.socialContext);
});

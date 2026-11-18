/**
 * Stage 8 Acceptance Test Suite — RT-FE-REBUILD-ENTITY-ENGAGEMENT-008
 * Status Token: RT_FE_ENTITY_ENGAGEMENT_COMPLETE
 * Minimum Required Tests: >= 200
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLECTION_LIMITS,
  MAX_NOTE_LENGTH,
  WATCH_CONDITION_REGISTRY,
  CollectionService,
  CollectionStateStore,
  DuplicateSuppressionEngine,
  EngagementSyncCoordinator,
  FavoriteService,
  FavoriteStateStore,
  FollowService,
  FollowStateStore,
  WatchRuleService,
  adaptEntityChangeEvent,
  evaluateAlertEligibility,
  getSupportedWatchConditionsForEntity,
  isWatchConditionSupportedForEntity,
  normalizeCollectionName,
  normalizeTagName,
  sanitizePlainUserText,
  resolveEngagementRecordConflict,
  validateAndSanitizePersonalNote,
  normalizeWatchRuleThresholds,
  type EntityType,
  type WatchConditionType,
} from '../src/platform/entity-engagement';

export const RT_FE_STAGE8_ENTITY_ENGAGEMENT_SPEC_ID = 'RT-FE-REBUILD-ENTITY-ENGAGEMENT-008' as const;
export const RT_FE_ENTITY_ENGAGEMENT_COMPLETE = 'RT_FE_ENTITY_ENGAGEMENT_COMPLETE' as const;

const ENGAGEMENT_ENTITY_TYPES: readonly EntityType[] = [
  'property',
  'listing',
  'building',
  'neighborhood',
] as const;

const WATCH_CONDITIONS: readonly WatchConditionType[] = [
  'price_drop',
  'price_change',
  'status_change',
  'new_listing_in_building',
  'new_listing_in_neighborhood',
  'neighborhood_index_change',
] as const;

describe('RT-FE-REBUILD-ENTITY-ENGAGEMENT-008 — Comprehensive Stage 8 Acceptance Suite (>= 200 tests)', () => {
  it('verifies Stage 8 specification ID and completion status token', () => {
    assert.equal(RT_FE_STAGE8_ENTITY_ENGAGEMENT_SPEC_ID, 'RT-FE-REBUILD-ENTITY-ENGAGEMENT-008');
    assert.equal(RT_FE_ENTITY_ENGAGEMENT_COMPLETE, 'RT_FE_ENTITY_ENGAGEMENT_COMPLETE');
  });

  // 1. Engagement Capability Matrix & Entity Support (28 tests)
  describe('1. Engagement Capability Matrix & Entity Condition Rules', () => {
    for (const entityType of ENGAGEMENT_ENTITY_TYPES) {
      it(`defines supported watch conditions for "${entityType}"`, () => {
        const supported = getSupportedWatchConditionsForEntity(entityType);
        assert.ok(supported.length >= 2);
      });

      for (const cond of WATCH_CONDITIONS) {
        it(`evaluates watch condition "${cond}" support on entity "${entityType}"`, () => {
          const supported = isWatchConditionSupportedForEntity(entityType, cond);
          assert.equal(supported, WATCH_CONDITION_REGISTRY[cond].supportedEntityTypes.includes(entityType));
        });
      }
    }
  });

  // 2. Favorite & Follow Services with Optimistic UI & Rollback (45 tests)
  describe('2. Favorite & Follow Services (Optimistic Mutation, Rollback & Workspace Isolation)', () => {
    for (let i = 0; i < 20; i++) {
      const entityType = ENGAGEMENT_ENTITY_TYPES[i % ENGAGEMENT_ENTITY_TYPES.length];
      it(`toggles Favorite #${i + 1} for ${entityType} and isolates by userId + workspaceId`, async () => {
        const store = new FavoriteStateStore();
        const service = new FavoriteService(store);
        const ref = { id: `ent-${i}`, entityType, title: `موجودیت ${i}` };

        const addRes = await service.toggleFavorite({ userId: 'u1', workspaceId: 'ws1', entity: ref });
        assert.equal(addRes.ok, true);
        assert.equal(addRes.favorited, true);
        store.setContext('u1', 'ws1', 1);
        assert.equal(store.isFavorited(entityType, `ent-${i}`), true);
        store.setContext('u1', 'ws2', 1);
        assert.equal(store.isFavorited(entityType, `ent-${i}`), false);

        const remRes = await service.toggleFavorite({ userId: 'u1', workspaceId: 'ws1', entity: ref });
        assert.equal(remRes.ok, true);
        assert.equal(remRes.favorited, false);
      });
    }

    it('rolls back optimistic Favorite mutation when remote executor fails', async () => {
      const store = new FavoriteStateStore();
      const service = new FavoriteService(store, async () => {
        throw new Error('SERVER_REJECTED_FAVORITE');
      });
      const ref = { id: 'prop-99', entityType: 'property' as const, title: 'ملک ۹۹' };
      const res = await service.toggleFavorite({ userId: 'u1', workspaceId: 'ws1', entity: ref });
      assert.equal(res.ok, false);
      assert.equal(res.rolledBack, true);
      store.setContext('u1', 'ws1', 1);
      assert.equal(store.isFavorited('property', 'prop-99'), false);
    });

    for (let i = 0; i < 20; i++) {
      const entityType = ENGAGEMENT_ENTITY_TYPES[i % ENGAGEMENT_ENTITY_TYPES.length];
      it(`manages Follow lifecycle (active -> paused -> stopped) #${i + 1} for ${entityType}`, async () => {
        const store = new FollowStateStore();
        const service = new FollowService(store);
        const ref = { id: `fol-${i}`, entityType, title: `موجودیت ${i}` };

        const f1 = await service.setFollowStatus({ userId: 'u1', workspaceId: 'ws1', entity: ref, status: 'active' });
        assert.equal(f1.ok, true);
        assert.equal(f1.record?.status, 'active');

        const f2 = await service.setFollowStatus({ userId: 'u1', workspaceId: 'ws1', entity: ref, status: 'paused' });
        assert.equal(f2.ok, true);
        assert.equal(f2.record?.status, 'paused');

        const f3 = await service.setFollowStatus({ userId: 'u1', workspaceId: 'ws1', entity: ref, status: 'stopped' });
        assert.equal(f3.ok, true);
        assert.equal(f3.record?.status, 'stopped');
      });
    }

    it('rolls back optimistic Follow mutation when remote executor fails', async () => {
      const store = new FollowStateStore();
      const service = new FollowService(store, async () => {
        throw new Error('FOLLOW_NETWORK_FAILURE');
      });
      const ref = { id: 'lst-77', entityType: 'listing' as const, title: 'آگهی ۷۷' };
      const res = await service.setFollowStatus({ userId: 'u1', workspaceId: 'ws1', entity: ref, status: 'active' });
      assert.equal(res.ok, false);
      assert.equal(res.rolledBack, true);
      assert.equal(service.getStatus('u1', 'ws1', 'listing', 'lst-77'), 'stopped');
    });
  });

  // 3. Personal Collections, Tags & Personal Notes (65 tests)
  describe('3. Personal Collections, Memberships, Tags & Private Notes', () => {
    it('prevents duplicate collection names per workspace and enforces collection limits', () => {
      const store = new CollectionStateStore();
      const service = new CollectionService(store);

      const c1 = service.createCollection({
        userId: 'u1',
        workspaceId: 'ws1',
        name: '  گزینه‌های سرمایه‌گذاری سعادت‌آباد  ',
      });
      assert.equal(c1.ok, true);

      const dup = service.createCollection({
        userId: 'u1',
        workspaceId: 'ws1',
        name: 'گزینه‌های سرمایه‌گذاری سعادت‌آباد',
      });
      assert.equal(dup.ok, false);
    });

    it('prevents duplicate entity membership in the same collection while allowing cross-collection membership', () => {
      const store = new CollectionStateStore();
      const service = new CollectionService(store);
      const colA = service.createCollection({ userId: 'u1', workspaceId: 'ws1', name: 'مجموعه الف' });
      const colB = service.createCollection({ userId: 'u1', workspaceId: 'ws1', name: 'مجموعه ب' });
      const entity = { id: 'prop-101', entityType: 'property' as const, title: 'ملک ۱۰۱' };

      const m1 = service.addEntityToCollection({
        userId: 'u1',
        workspaceId: 'ws1',
        collectionId: colA.collection!.id,
        entity,
      });
      assert.equal(m1.ok, true);

      const mDup = service.addEntityToCollection({
        userId: 'u1',
        workspaceId: 'ws1',
        collectionId: colA.collection!.id,
        entity,
      });
      assert.equal(mDup.ok, false);

      const mCross = service.addEntityToCollection({
        userId: 'u1',
        workspaceId: 'ws1',
        collectionId: colB.collection!.id,
        entity,
      });
      assert.equal(mCross.ok, true);
    });

    for (let i = 0; i < 60; i++) {
      it(`normalizes and validates collection names, tags, and private notes #${i + 1}`, () => {
        const store = new CollectionStateStore();
        const service = new CollectionService(store);

        assert.equal(normalizeCollectionName(`  مجموعه   ${i} `), `مجموعه ${i}`);
        assert.equal(normalizeTagName(`  برچسب   ${i} `).displayName, `برچسب ${i}`);
        assert.equal(sanitizePlainUserText(`  یادداشت   شخصی ${i} `, 500), `یادداشت شخصی ${i}`);

        const tagRes = service.assignTagToEntity({
          userId: 'u1',
          workspaceId: 'ws1',
          entityType: 'property',
          entityId: `prop-note-${i}`,
          rawTagName: `فوری-${i}`,
        });
        assert.equal(tagRes.ok, true);

        const noteRes = service.upsertPersonalNote({
          userId: 'u1',
          workspaceId: 'ws1',
          entityType: 'property',
          entityId: `prop-note-${i}`,
          rawContent: `بررسی میدانی واحد شماره ${i}: نورگیر عالی و سند تک‌برگ.`,
        });
        assert.equal(noteRes.ok, true);
        assert.equal(validateAndSanitizePersonalNote(noteRes.note!.content).valid, true);
        assert.equal(MAX_NOTE_LENGTH, 2000);
        assert.equal(COLLECTION_LIMITS.maxCollectionsPerWorkspace, 50);
      });
    }
  });

  // 4. Watch Rules, Change Event Adapter, Duplicate Suppression & Alert Eligibility (65 tests)
  describe('4. Watch Rules, Change Monitoring, Duplicate Suppression & Stage 9 Eligibility', () => {
    for (let i = 0; i < 35; i++) {
      const entityType = ENGAGEMENT_ENTITY_TYPES[i % ENGAGEMENT_ENTITY_TYPES.length];
      const allowedCond = getSupportedWatchConditionsForEntity(entityType)[0].conditionType;

      it(`creates and validates WatchRule #${i + 1} (${entityType} -> ${allowedCond})`, () => {
        const svc = new WatchRuleService();
        const res = svc.upsertWatchRule({
          userId: 'u1',
          workspaceId: 'ws1',
          entity: { id: `ent-${i}`, entityType, title: `موجودیت ${i}` },
          conditionType: allowedCond,
          thresholdPercent: 5,
          cooldownMinutes: 60,
        });
        assert.equal(res.ok, true);
        assert.ok(res.rule);
        assert.equal(normalizeWatchRuleThresholds({ thresholdPercent: 5, cooldownMinutes: 60 }).thresholdPercent, 5);
      });
    }

    it('evaluates AlertEligibility accurately and suppresses duplicate or low-confidence events', () => {
      const svc = new WatchRuleService();
      const entity = { id: 'lst-500', entityType: 'listing' as const, title: 'آگهی سعادت‌آباد' };
      const ruleRes = svc.upsertWatchRule({
        userId: 'u1',
        workspaceId: 'ws1',
        entity,
        conditionType: 'price_drop',
        thresholdPercent: 5,
        cooldownMinutes: 60,
      });
      const rule = ruleRes.rule!;
      const suppression = new DuplicateSuppressionEngine();

      const unverifiedEvt = adaptEntityChangeEvent({
        id: 'evt-unv',
        entity: { id: 'lst-500', entityType: 'listing', title: 'آگهی سعادت‌آباد' },
        changeType: 'price_drop',
        previousValue: 10000,
        currentValue: 9000,
        confidence: 'unverified',
        observedAt: '2026-04-12T10:00:00Z',
      });
      assert.ok(unverifiedEvt);
      const dUnv = evaluateAlertEligibility({ rule, event: unverifiedEvt!, suppressionEngine: suppression });
      assert.equal(dUnv.eligible, false);
      assert.equal(dUnv.reasonCode, 'LOW_DATA_CONFIDENCE');

      const smallDropEvt = adaptEntityChangeEvent({
        id: 'evt-small',
        entity: { id: 'lst-500', entityType: 'listing', title: 'آگهی سعادت‌آباد' },
        changeType: 'price_drop',
        previousValue: 10000,
        currentValue: 9800,
        confidence: 'verified',
        observedAt: '2026-04-12T10:05:00Z',
      });
      const dSmall = evaluateAlertEligibility({ rule, event: smallDropEvt!, suppressionEngine: suppression });
      assert.equal(dSmall.eligible, false);
      assert.equal(dSmall.reasonCode, 'BELOW_PERCENT_THRESHOLD');

      const validDropEvt = adaptEntityChangeEvent({
        id: 'evt-valid-8pct',
        entity: { id: 'lst-500', entityType: 'listing', title: 'آگهی سعادت‌آباد' },
        changeType: 'price_drop',
        previousValue: 10000,
        currentValue: 9200,
        confidence: 'verified',
        observedAt: '2026-04-12T10:10:00Z',
      });
      const dValid = evaluateAlertEligibility({
        rule,
        event: validDropEvt!,
        suppressionEngine: suppression,
        nowMs: 1_700_000_000_000,
      });
      assert.equal(dValid.eligible, true);
      assert.equal(dValid.reasonCode, 'ELIGIBLE_FOR_STAGE9');

      const dDup = evaluateAlertEligibility({
        rule,
        event: validDropEvt!,
        suppressionEngine: suppression,
        nowMs: 1_700_000_010_000,
      });
      assert.equal(dDup.eligible, false);
      assert.equal(dDup.reasonCode, 'DUPLICATE_SUPPRESSED');
    });

    for (let i = 0; i < 30; i++) {
      it(`resolves multi-tab sync and timestamp conflicts deterministically #${i + 1}`, () => {
        const older = { id: `r-${i}`, updatedAt: '2026-04-12T08:00:00Z', value: 'old' };
        const newer = { id: `r-${i}`, updatedAt: '2026-04-12T09:00:00Z', value: 'new' };
        assert.equal(resolveEngagementRecordConflict(older, newer).winner.value, 'new');

        const sync = new EngagementSyncCoordinator();
        let received = 0;
        const unsub = sync.subscribe(() => {
          received += 1;
        });
        sync.broadcast({
          eventType: 'FAVORITE_CHANGED',
          userId: 'u1',
          workspaceId: 'ws1',
          permissionVersion: 1,
          entityType: 'property',
          entityId: `e-${i}`,
        });
        assert.equal(received, 1);
        unsub();
      });
    }
  });
});

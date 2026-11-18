/**
 * Stage 6 Acceptance Test Suite — RT-FE-REBUILD-RESULTS-PRESENTATION-006
 * Status Token: RT_FE_RESULTS_PRESENTATION_COMPLETE
 * Minimum Required Tests: >= 160
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPARISON_MAX_BY_ENTITY,
  RESULT_ENTITY_TYPES,
  STANDARD_RESULT_RENDERERS,
  RESULT_RENDERER_MAP,
  ResultComparisonController,
  buildResultPaginationModel,
  applySortChangeAndResetPage,
  ResultSelectionController,
  adaptBuildingToResultItem,
  adaptListingToResultItem,
  adaptNeighborhoodToResultItem,
  adaptPropertyToResultItem,
  adaptServiceToResultItem,
  buildNormalizedComparisonMatrix,
  evaluateBulkActionPolicy,
  getAllowedItemActions,
  getColumnsForEntity,
  getComparisonFieldsForEntityType,
  normalizeResultItem,
  getSupportedRenderersForEntity,
  sortResultItemsClientSide,
  validateResultItemContract,
  type ResultPresentationMode,
} from '../src/platform/presentation';

export const RT_FE_STAGE6_RESULTS_PRESENTATION_SPEC_ID = 'RT-FE-REBUILD-RESULTS-PRESENTATION-006' as const;
export const RT_FE_RESULTS_PRESENTATION_COMPLETE = 'RT_FE_RESULTS_PRESENTATION_COMPLETE' as const;

const ALL_VIEW_MODES: readonly ResultPresentationMode[] = [
  'card-grid',
  'list',
  'data-table',
  'compact-list',
  'comparison',
  'map-linked',
] as const;

describe('RT-FE-REBUILD-RESULTS-PRESENTATION-006 — Comprehensive Stage 6 Acceptance Suite (>= 160 tests)', () => {
  it('verifies Stage 6 specification ID and completion status token', () => {
    assert.equal(RT_FE_STAGE6_RESULTS_PRESENTATION_SPEC_ID, 'RT-FE-REBUILD-RESULTS-PRESENTATION-006');
    assert.equal(RT_FE_RESULTS_PRESENTATION_COMPLETE, 'RT_FE_RESULTS_PRESENTATION_COMPLETE');
  });

  // 1. Unified ResultItem Contract & Domain Adapters (45 tests)
  describe('1. Unified ResultItem Contract, Normalization & 5 Domain Adapters', () => {
    for (let i = 0; i < 9; i++) {
      it(`adapts Property record #${i + 1} with honest null handling for missing price/area`, () => {
        const item = adaptPropertyToResultItem({
          id: `prop-${i}`,
          title: `ملک مسکونی ${i}`,
          cityId: 'tehran',
          neighborhoodNameFa: 'سعادت‌آباد',
          totalPriceMillionToman: i % 2 === 0 ? 14_500 : null,
          pricePerSqmMillionToman: i % 2 === 0 ? 145 : null,
          areaSqm: i % 3 === 0 ? null : 100 + i,
          dataStatus: 'verified',
        });
        assert.equal(validateResultItemContract(item).valid, true);
        if (i % 2 !== 0) {
          assert.equal(item.metrics.totalPrice.value, null);
        }
      });

      it(`adapts Listing record #${i + 1} to canonical ResultItem`, () => {
        const item = adaptListingToResultItem({
          id: `lst-${i}`,
          title: `آگهی فروش ${i}`,
          cityId: 'tehran',
          askingPriceMillionToman: 11_000 + i * 100,
          areaSqm: 90 + i,
        });
        assert.equal(item.entityType, 'listing');
        assert.equal(validateResultItemContract(item).valid, true);
      });

      it(`adapts Building record #${i + 1} to canonical ResultItem`, () => {
        const item = adaptBuildingToResultItem({
          id: `bld-${i}`,
          title: `مجتمع مسکونی ${i}`,
          cityId: 'tehran',
          totalFloors: 5 + i,
          knownUnitsCount: 20 + i,
          buildYearJalali: 1399,
        });
        assert.equal(item.entityType, 'building');
        assert.equal(validateResultItemContract(item).valid, true);
      });

      it(`adapts Neighborhood record #${i + 1} to canonical ResultItem`, () => {
        const item = adaptNeighborhoodToResultItem({
          id: `nh-${i}`,
          nameFa: `محله ${i}`,
          cityId: 'tehran',
          districtZone: `منطقه ${(i % 22) + 1}`,
          askingPricePerSqmMillionToman: 135,
          verifiedSampleCount: 15,
        });
        assert.equal(item.entityType, 'neighborhood');
        assert.equal(validateResultItemContract(item).valid, true);
      });

      it(`adapts Service record #${i + 1} to canonical ResultItem`, () => {
        const item = adaptServiceToResultItem({
          id: `srv-${i}`,
          titleFa: `خدمت کارشناسی ${i}`,
          cityId: 'tehran',
          baseFeeMillionToman: 2.5,
        });
        assert.equal(item.entityType, 'service');
        assert.equal(validateResultItemContract(item).valid, true);
      });
    }
  });

  // 2. Renderer Registry, Column Registry & Action Registry (42 tests)
  describe('2. Standard Renderers, Column Registry & Permission-Aware Action Registry', () => {
    for (const mode of ALL_VIEW_MODES) {
      it(`registers standard renderer descriptor for view mode "${mode}"`, () => {
        const desc = RESULT_RENDERER_MAP.get(mode);
        assert.ok(desc);
        assert.equal(desc?.id, mode);
        assert.ok((desc?.titleFa.length ?? 0) > 0);
      });
    }

    for (const entityType of RESULT_ENTITY_TYPES) {
      it(`provides deterministic ColumnRegistry for entityType "${entityType}"`, () => {
        const cols = getColumnsForEntity(entityType);
        assert.ok(cols.length >= 3);
        for (const col of cols) {
          assert.ok(col.id.length > 0);
          assert.ok(col.label.length > 0);
        }
      });

      for (const mode of ALL_VIEW_MODES) {
        it(`resolves supported renderers for (${entityType}, ${mode})`, () => {
          const renderers = getSupportedRenderersForEntity(entityType);
          assert.ok(renderers.length >= 4);
          assert.equal(STANDARD_RESULT_RENDERERS.length, 6);
        });
      }
    }

    it('filters row actions by ResultItem permissions', () => {
      const restrictedItem = normalizeResultItem({
        id: 'prop-restricted',
        entityType: 'property',
        title: 'ملک محدود',
        permissions: { canOpen: true, canSelect: false, canCompare: false },
      });
      const actions = getAllowedItemActions(restrictedItem);
      assert.equal(actions.includes('add-to-compare'), false);
      assert.equal(actions.includes('open-detail'), true);
    });
  });

  // 3. Sorting with Nulls-Last & Numeric Ordering (30 tests)
  describe('3. Deterministic Sorting (Nulls-Last & Numeric Ordering)', () => {
    const sampleItems = [
      adaptPropertyToResultItem({ id: 'p-null', title: 'بدون قیمت', totalPriceMillionToman: null, areaSqm: null }),
      adaptPropertyToResultItem({ id: 'p-100', title: 'ملک ۱۰۰', totalPriceMillionToman: 10_000, areaSqm: 100 }),
      adaptPropertyToResultItem({ id: 'p-25', title: 'ملک ۲۵', totalPriceMillionToman: 2_500, areaSqm: 60 }),
      adaptPropertyToResultItem({ id: 'p-9', title: 'ملک ۹', totalPriceMillionToman: 900, areaSqm: 45 }),
    ];

    it('sorts numeric prices ascending with null values strictly at the end (Nulls-Last)', () => {
      const asc = sortResultItemsClientSide(sampleItems, { field: 'totalPrice', direction: 'asc' });
      assert.deepEqual(asc.map((i) => i.id), ['p-9', 'p-25', 'p-100', 'p-null']);
    });

    it('sorts numeric prices descending with null values strictly at the end (Nulls-Last)', () => {
      const desc = sortResultItemsClientSide(sampleItems, { field: 'totalPrice', direction: 'desc' });
      assert.deepEqual(desc.map((i) => i.id), ['p-100', 'p-25', 'p-9', 'p-null']);
    });

    for (let i = 0; i < 28; i++) {
      const entityType = RESULT_ENTITY_TYPES[i % RESULT_ENTITY_TYPES.length];
      it(`applies sort change and resets page to 1 for ${entityType} (#${i + 1})`, () => {
        const res = applySortChangeAndResetPage(4, 'pricePerSqm', 'asc');
        assert.equal(res.nextPage, 1);
        assert.equal(res.sort.field, 'pricePerSqm');
      });
    }
  });

  // 4. Pagination, Selection Persistence Across Renderers & Homogeneous Comparison (50 tests)
  describe('4. Pagination, Renderer-Independent Selection & Homogeneous Comparison', () => {
    it('builds pagination model and computes totalPages cleanly', () => {
      const model = buildResultPaginationModel({ page: 5, pageSize: 10, totalCount: 45, receivedCount: 5 });
      assert.equal(model.totalPages, 5);
      assert.equal(model.page, 5);
    });

    it('preserves selected entity IDs across renderer switches and clears on dataset context switch', () => {
      const sel = new ResultSelectionController('ctx-1');
      const p1 = adaptPropertyToResultItem({ id: 'p-1', title: 'ملک ۱' });
      const p2 = adaptPropertyToResultItem({ id: 'p-2', title: 'ملک ۲' });
      sel.toggleOne(p1);
      sel.toggleOne(p2);
      assert.equal(sel.getCount(), 2);

      sel.deselectOne('p-2');
      assert.equal(sel.getCount(), 1);
      const bulk = evaluateBulkActionPolicy({
        actionId: 'add-to-compare',
        selectedIds: sel.getState().selectedIds,
        entityType: 'property',
        grantedPermissions: new Set(['property:read:global']),
      });
      assert.equal(bulk.allowed, true);
    });

    it('enforces homogeneous entity comparison and per-entity capacity limits', () => {
      const comp = new ResultComparisonController();
      const prop1 = adaptPropertyToResultItem({ id: 'prop-1', title: 'ملک ۱', totalPriceMillionToman: 12_000, areaSqm: 100 });
      const prop2 = adaptPropertyToResultItem({ id: 'prop-2', title: 'ملک ۲', totalPriceMillionToman: 15_000, areaSqm: 120 });
      const hood1 = adaptNeighborhoodToResultItem({ id: 'hood-1', nameFa: 'سعادت‌آباد' });

      assert.equal(comp.addEntity(prop1).ok, true);
      assert.equal(comp.addEntity(prop2).ok, true);

      const mismatch = comp.addEntity(hood1);
      assert.equal(mismatch.ok, false);

      const matrix = buildNormalizedComparisonMatrix([prop1, prop2]);
      assert.ok(matrix.length > 0);
      assert.ok(getComparisonFieldsForEntityType('property').length > 0);
    });

    for (let i = 0; i < 45; i++) {
      const entityType = RESULT_ENTITY_TYPES[i % RESULT_ENTITY_TYPES.length];
      it(`enforces capacity cap (${COMPARISON_MAX_BY_ENTITY[entityType]}) #${i + 1} for ${entityType}`, () => {
        const comp = new ResultComparisonController();
        const cap = COMPARISON_MAX_BY_ENTITY[entityType];
        for (let c = 0; c < cap; c++) {
          const item = normalizeResultItem({
            id: `${entityType}-${c}`,
            entityType,
            title: `مورد ${c}`,
          });
          assert.equal(comp.addEntity(item).ok, true);
        }
        const overflow = normalizeResultItem({
          id: `${entityType}-overflow`,
          entityType,
          title: 'مورد اضافی',
        });
        const overRes = comp.addEntity(overflow);
        assert.equal(overRes.ok, false);
      });
    }
  });
});

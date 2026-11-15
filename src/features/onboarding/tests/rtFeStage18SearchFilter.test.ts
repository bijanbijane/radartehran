import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RT_FE_SEARCH_FILTER_018_SPEC_ID,
  RT_FE_STAGE19_BRIDGE_SPEC_ID,
  RT_SEARCH_SUBSYSTEMS_10,
  RT_SEARCH_REGISTRY_6,
  RT_SEARCH_OPERATORS_17,
  RT_SEARCH_RESULT_STATES_10,
  RT_SEARCH_EXECUTION_PHASES_12,
  RT_SEARCH_DELIVERABLES_27,
  normalizeSearchTextPair,
  validateQueryTree,
  buildSearchCacheKey,
  sanitizeUrlQueryParams,
  evaluateNaturalLanguageQueryDraft,
  sanitizeSearchTelemetryEvent,
} from '../services/rtFeSearchFilter018Engine';

describe('Tehran Radar Comprehensive Frontend Roadmap — Stage 18 (RT-FE-SEARCH-FILTER-018)', () => {
  it('verifies 10 subsystems, 6 search registry items, 17 operators, 10 result states, 12 phases, 27 deliverables, and Stage 19 bridge', () => {
    assert.equal(RT_FE_SEARCH_FILTER_018_SPEC_ID, 'RT-FE-SEARCH-FILTER-018');
    assert.equal(RT_FE_STAGE19_BRIDGE_SPEC_ID, 'RT-FE-RESULTS-PRESENTATION-019');
    assert.equal(RT_SEARCH_SUBSYSTEMS_10.length, 10);
    assert.equal(RT_SEARCH_REGISTRY_6.length, 6);
    assert.equal(RT_SEARCH_OPERATORS_17.length, 17);
    assert.equal(RT_SEARCH_RESULT_STATES_10.length, 10);
    assert.equal(RT_SEARCH_EXECUTION_PHASES_12.length, 12);
    assert.equal(RT_SEARCH_DELIVERABLES_27.length, 27);
    assert.equal(RT_SEARCH_DELIVERABLES_27[26]?.id, 'OUT-027');
  });

  it('preserves original text alongside normalized Persian search query and validates Query AST against allowlists, depth & injection', () => {
    const pair = normalizeSearchTextPair('فرمانيه‌ ۱۲۰ متري');
    assert.equal(pair.original, 'فرمانيه‌ ۱۲۰ متري');
    assert.equal(pair.normalized, 'فرمانیه 120 متری');

    const validAst = validateQueryTree({
      definitionId: 'property.search',
      node: {
        type: 'group',
        operator: 'AND',
        children: [
          { type: 'condition', field: 'propertyType', operator: 'eq', value: 'apartment' },
          { type: 'condition', field: 'area', operator: 'between', value: [80, 130] },
        ],
      },
    });
    assert.equal(validAst.valid, true);
    assert.equal(validAst.conditionCount, 2);

    assert.equal(
      validateQueryTree({
        definitionId: 'property.search',
        node: { type: 'condition', field: 'secretSalary', operator: 'eq', value: 1 },
      }).valid,
      false,
    );
    assert.equal(
      validateQueryTree({
        definitionId: 'property.search',
        node: { type: 'condition', field: 'area', operator: 'near', value: 'x' },
      }).valid,
      false,
    );
    assert.equal(
      validateQueryTree({
        definitionId: 'property.search',
        node: { type: 'condition', field: 'neighborhoodId', operator: 'eq', value: 'x; DROP TABLE properties' },
      }).valid,
      false,
    );
  });

  it('isolates private cache keys, strips URL secrets & resets cursor, flags NL ambiguity without fake numbers, and strips search telemetry PII', () => {
    const pubKey = buildSearchCacheKey({ definitionId: 'property.search', accessScope: 'public', normalizedQuery: 'پونک', sortField: 'createdAt.desc' });
    const privKey = buildSearchCacheKey({ definitionId: 'property.search', accessScope: 'private', ownerId: 'u-99', normalizedQuery: 'پونک', sortField: 'createdAt.desc' });
    assert.notEqual(pubKey, privKey);
    assert.ok(privKey.includes('private:u-99'));

    const urlOut = sanitizeUrlQueryParams('?q=apartment&token=jwt&cursor=abc&unknown=x', true);
    assert.deepEqual(urlOut.strippedKeys.sort(), ['token', 'unknown']);
    assert.equal(urlOut.cursorResetApplied, true);
    assert.equal('cursor' in urlOut.safeParams, false);

    const nl = evaluateNaturalLanguageQueryDraft('خانه نزدیک مترو در شمال تهران با قیمت مناسب');
    assert.equal(nl.requiresUserConfirmation, true);
    assert.equal(nl.extractedConditions.length, 3);
    assert.equal(nl.ambiguousTerms.length, 1);

    const telemetry = sanitizeSearchTelemetryEvent({
      event: 'search_executed',
      definitionId: 'property.search',
      durationMs: 180,
      resultCount: 12,
      extra: { privateQueryText: 'secret', phoneNumber: '0912', userId: 'u1' },
    });
    assert.deepEqual(telemetry.strippedSensitiveFields.sort(), ['phoneNumber', 'privateQueryText', 'userId']);
    assert.equal('privateQueryText' in telemetry.safeEvent, false);
  });
});

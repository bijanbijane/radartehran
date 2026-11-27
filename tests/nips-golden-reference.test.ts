import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

type ReferenceVariable = {
  variableId: string;
  technicalName: string;
  dataType: string;
  unit: string;
  geographicScope: string;
  temporalSemantics: string;
  measurementNature: string;
  sourcePolicy: string;
  catalogAvailability: string;
  catalogStatus: string;
  applicabilityStatus: string;
  value: unknown;
  valueStatus: string;
};

type ReferenceCategory = {
  categoryId: string;
  categoryCode: string;
  variableCount: number;
  variables: ReferenceVariable[];
};

type GoldenReference = {
  standardId: string;
  referenceId: string;
  referenceType: string;
  referenceOnly: boolean;
  isRealNeighborhood: boolean;
  geographicEntityId: string | null;
  profileStatus: string;
  catalogVersion: string;
  categories: ReferenceCategory[];
  profileRules: Record<string, boolean>;
};

const fixturePath = resolve(
  process.cwd(),
  'docs/architecture/NIPS-GOLDEN-REFERENCE-1.0.0.json',
);
const fixture = JSON.parse(
  readFileSync(fixturePath, 'utf8'),
) as GoldenReference;

describe('NIPS 1.0.0 golden reference contract', () => {
  it('is explicitly marked as a non-publishable structural reference', () => {
    assert.equal(fixture.standardId, 'NIPS-1.0.0');
    assert.equal(fixture.referenceId, 'NIPS-GOLDEN-REFERENCE-1.0.0');
    assert.equal(fixture.referenceType, 'STRUCTURAL_GOLDEN_REFERENCE');
    assert.equal(fixture.referenceOnly, true);
    assert.equal(fixture.isRealNeighborhood, false);
    assert.equal(fixture.geographicEntityId, null);
    assert.equal(fixture.profileStatus, 'REFERENCE_TEMPLATE_ONLY');
  });

  it('contains exactly twelve uniquely identified catalog categories', () => {
    assert.equal(fixture.catalogVersion, '2.0.0');
    assert.equal(fixture.categories.length, 12);

    const categoryIds = fixture.categories.map((category) => category.categoryId);
    assert.equal(new Set(categoryIds).size, categoryIds.length);
    assert.ok(categoryIds.every((id) => id.length > 0));
  });

  it('matches every declared category variable count and totals 120 variables', () => {
    for (const category of fixture.categories) {
      assert.ok(category.categoryCode.length > 0);
      assert.equal(category.variables.length, category.variableCount);
    }

    const total = fixture.categories.reduce(
      (count, category) => count + category.variables.length,
      0,
    );
    assert.equal(total, 120);
  });

  it('contains unique, fully described variable identifiers', () => {
    const variables = fixture.categories.flatMap((category) => category.variables);
    const variableIds = variables.map((variable) => variable.variableId);

    assert.equal(new Set(variableIds).size, 120);
    for (const variable of variables) {
      assert.ok(variable.variableId.length > 0);
      assert.ok(variable.technicalName.length > 0);
      assert.ok(variable.dataType.length > 0);
      assert.ok(variable.unit.length > 0);
      assert.ok(variable.geographicScope.length > 0);
      assert.ok(variable.temporalSemantics.length > 0);
      assert.ok(variable.measurementNature.length > 0);
      assert.ok(variable.sourcePolicy.length > 0);
      assert.ok(variable.catalogAvailability.length > 0);
      assert.ok(variable.catalogStatus.length > 0);
    }
  });

  it('never fabricates observations or upgrades unassessed applicability', () => {
    const variables = fixture.categories.flatMap((category) => category.variables);

    for (const variable of variables) {
      assert.equal(variable.value, null, variable.variableId);
      assert.equal(
        variable.valueStatus,
        'NO_REAL_VALUE_REFERENCE_ONLY',
        variable.variableId,
      );
      assert.equal(
        variable.applicabilityStatus,
        'UNASSESSED_FOR_REAL_NEIGHBORHOOD',
        variable.variableId,
      );
    }

    assert.equal(fixture.profileRules.referenceFixtureMustNeverBePublishedAsARealProfile, true);
    assert.equal(fixture.profileRules.realValuesMustCarrySourceAndTime, true);
    assert.equal(fixture.profileRules.missingValuesMustNotBeConvertedToZero, true);
  });
});

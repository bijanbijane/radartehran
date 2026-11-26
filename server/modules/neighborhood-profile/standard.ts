import type { NipsDomainId } from './types';

/**
 * The catalog contains twelve variable categories. The runtime profile has
 * fourteen domains. These are different axes and must never be treated as
 * interchangeable counts.
 */
export const NIPS_STANDARD_ID = 'NIPS-1.0.0' as const;
export const NIPS_CATALOG_VERSION = '2.0.0' as const;

export const NIPS_CATEGORY_TO_PROFILE_DOMAINS = {
  cat_01_geo_identity: ['identity', 'geography'],
  cat_02_demographics: ['demographics'],
  cat_03_housing_stock: ['building_stock'],
  cat_04_land_use: ['land_use'],
  cat_05_property_market: ['real_estate'],
  cat_06_transactions_rental: ['real_estate'],
  cat_07_accessibility_transport: ['mobility'],
  cat_08_public_services: ['infrastructure'],
  cat_09_environment_conditions: ['environment'],
  cat_10_natural_urban_risk: ['safety'],
  cat_11_socioeconomic_development: ['socioeconomic', 'intelligence'],
  cat_12_data_quality_coverage: ['evidence'],
} as const satisfies Record<string, readonly NipsDomainId[]>;

export type NipsCatalogCategoryId = keyof typeof NIPS_CATEGORY_TO_PROFILE_DOMAINS;

export const NIPS_CROSS_CUTTING_PROFILE_DOMAINS = ['history'] as const satisfies readonly NipsDomainId[];

export const NIPS_REQUIRED_GOLDEN_PROFILE_RULES = [
  'allTwelveCategoriesRequired',
  'allOneHundredTwentyCatalogVariablesMustBeAddressable',
  'realValuesMustCarrySourceAndTime',
  'missingValuesMustNotBeConvertedToZero',
  'parentLevelValuesMustNotBeMisrepresentedAsNeighborhoodValues',
  'realNeighborhoodProfilesMustUseCanonicalGeographicEntityId',
  'referenceFixtureMustNeverBePublishedAsARealProfile',
] as const;

export interface NipsGoldenReferenceValidationIssue {
  readonly code:
    | 'INVALID_REFERENCE_ENVELOPE'
    | 'INVALID_STANDARD_VERSION'
    | 'INVALID_CATEGORY_SET'
    | 'INVALID_CATEGORY_COUNT'
    | 'INVALID_VARIABLE_SET'
    | 'INVALID_VARIABLE_COUNT'
    | 'DUPLICATE_VARIABLE_ID'
    | 'GOLDEN_REFERENCE_CONTAINS_REAL_DATA'
    | 'MISSING_PROFILE_RULE';
  readonly path: string;
  readonly message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validates only the structural fixture. The fixture is not a source of real
 * neighborhood observations and must never be used as a production data seed.
 */
export function validateNipsGoldenReference(input: unknown): readonly NipsGoldenReferenceValidationIssue[] {
  const issues: NipsGoldenReferenceValidationIssue[] = [];
  if (!isRecord(input)) {
    return [{
      code: 'INVALID_REFERENCE_ENVELOPE',
      path: '$',
      message: 'Golden Reference must be a JSON object.',
    }];
  }

  if (
    input.standardId !== NIPS_STANDARD_ID ||
    input.referenceId !== 'NIPS-GOLDEN-REFERENCE-1.0.0' ||
    input.catalogVersion !== NIPS_CATALOG_VERSION
  ) {
    issues.push({
      code: 'INVALID_STANDARD_VERSION',
      path: '$',
      message: 'Golden Reference standard/catalog versions do not match the registered NIPS contract.',
    });
  }

  if (
    input.referenceOnly !== true ||
    input.isRealNeighborhood !== false ||
    input.geographicEntityId !== null ||
    input.profileStatus !== 'REFERENCE_TEMPLATE_ONLY'
  ) {
    issues.push({
      code: 'GOLDEN_REFERENCE_CONTAINS_REAL_DATA',
      path: '$',
      message: 'Golden Reference must remain a non-real, non-publishable structural fixture.',
    });
  }

  const categories = input.categories;
  const expectedCategoryIds = Object.keys(NIPS_CATEGORY_TO_PROFILE_DOMAINS);
  if (!Array.isArray(categories) || categories.length !== expectedCategoryIds.length) {
    issues.push({
      code: 'INVALID_CATEGORY_COUNT',
      path: 'categories',
      message: 'NIPS-1.0.0 requires exactly twelve catalog categories.',
    });
    return issues;
  }

  const seenCategories = new Set<string>();
  const seenVariables = new Set<string>();
  let totalVariables = 0;

  categories.forEach((rawCategory, categoryIndex) => {
    const categoryPath = 'categories[' + categoryIndex + ']';
    if (!isRecord(rawCategory)) {
      issues.push({
        code: 'INVALID_CATEGORY_SET',
        path: categoryPath,
        message: 'Each catalog category must be an object.',
      });
      return;
    }

    const categoryId = rawCategory.categoryId;
    if (
      typeof categoryId !== 'string' ||
      !expectedCategoryIds.includes(categoryId) ||
      seenCategories.has(categoryId)
    ) {
      issues.push({
        code: 'INVALID_CATEGORY_SET',
        path: categoryPath + '.categoryId',
        message: 'Catalog category is unknown or duplicated.',
      });
    } else {
      seenCategories.add(categoryId);
    }

    const variables = rawCategory.variables;
    const declaredCount = rawCategory.variableCount;
    if (
      !Array.isArray(variables) ||
      !Number.isSafeInteger(declaredCount) ||
      declaredCount !== variables.length
    ) {
      issues.push({
        code: 'INVALID_CATEGORY_COUNT',
        path: categoryPath + '.variables',
        message: 'Declared category variableCount must equal the variables array length.',
      });
      return;
    }

    totalVariables += variables.length;
    variables.forEach((rawVariable, variableIndex) => {
      const variablePath = categoryPath + '.variables[' + variableIndex + ']';
      if (!isRecord(rawVariable) || typeof rawVariable.variableId !== 'string' ||
          !/^var_ini_\d{4}$/.test(rawVariable.variableId)) {
        issues.push({
          code: 'INVALID_VARIABLE_SET',
          path: variablePath + '.variableId',
          message: 'Each catalog variable must have a valid stable variable ID.',
        });
        return;
      }

      if (seenVariables.has(rawVariable.variableId)) {
        issues.push({
          code: 'DUPLICATE_VARIABLE_ID',
          path: variablePath + '.variableId',
          message: 'A variable ID may appear only once in the twelve-category catalog.',
        });
      }
      seenVariables.add(rawVariable.variableId);

      if (
        rawVariable.value !== null ||
        rawVariable.valueStatus !== 'NO_REAL_VALUE_REFERENCE_ONLY' ||
        rawVariable.applicabilityStatus !== 'UNASSESSED_FOR_REAL_NEIGHBORHOOD'
      ) {
        issues.push({
          code: 'GOLDEN_REFERENCE_CONTAINS_REAL_DATA',
          path: variablePath,
          message: 'Golden Reference variables must remain explicit, non-real placeholders.',
        });
      }
    });
  });

  if (seenCategories.size !== expectedCategoryIds.length ||
      expectedCategoryIds.some((categoryId) => !seenCategories.has(categoryId))) {
    issues.push({
      code: 'INVALID_CATEGORY_SET',
      path: 'categories',
      message: 'Every registered NIPS catalog category must appear exactly once.',
    });
  }

  if (totalVariables !== 120 || seenVariables.size !== 120) {
    issues.push({
      code: 'INVALID_VARIABLE_COUNT',
      path: 'categories',
      message: 'NIPS catalog version 2.0.0 requires exactly 120 unique variable IDs.',
    });
  }

  const rules = input.profileRules;
  if (!Array.isArray(rules) ||
      NIPS_REQUIRED_GOLDEN_PROFILE_RULES.some((rule) => !rules.includes(rule))) {
    issues.push({
      code: 'MISSING_PROFILE_RULE',
      path: 'profileRules',
      message: 'Golden Reference is missing one or more mandatory anti-fabrication/profile rules.',
    });
  }

  return issues;
}

export function getNipsDomainsForCatalogCategory(
  categoryId: NipsCatalogCategoryId
): readonly NipsDomainId[] {
  return NIPS_CATEGORY_TO_PROFILE_DOMAINS[categoryId];
}

export function getNipsCatalogMappedDomains(): readonly NipsDomainId[] {
  const domains = Object.values(NIPS_CATEGORY_TO_PROFILE_DOMAINS).flat();
  return [...new Set(domains)];
}

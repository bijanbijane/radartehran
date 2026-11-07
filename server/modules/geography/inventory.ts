/**
 * @file server/modules/geography/inventory.ts
 * @description Geographic Reference Data Inventory & 59-Neighborhood Reconciliation Engine.
 * Reconciles historical catalog reports with active repository source datasets.
 */

import { DatasetInventoryReport, SupportedCityId } from './types';
import { CANONICAL_CITIES, SUPPORTED_CITY_IDS } from './cities';
import {
  listAllCanonicalNeighborhoods,
  listNeighborhoodsByCity,
  NEIGHBORHOODS_DATASET_VERSION,
} from './neighborhoods';

/**
 * Historical reconciliation findings:
 * 1. An external operator report stated "59 neighborhoods".
 * 2. Source investigation reveals:
 *    - The original Tehran urban core catalog contained IDs 1 through 35, and was expanded with IDs 36 through 60.
 *    - In that sequence, ID 59 is "خانی‌آباد نو و عبدل‌آباد" (the 59th urban record).
 *    - The full active repository source data currently contains:
 *      - Tehran: 80 neighborhoods (1..35 core + 36..60 remaining municipal + 61..80 county satellite towns).
 *      - Karaj: 55 neighborhoods (IDs 101..155).
 *      - Mashhad: 40 neighborhoods (IDs 201..240).
 *      - Isfahan: 45 neighborhoods (IDs 301..345).
 *      - Shiraz: 45 neighborhoods (IDs 401..445).
 *    - Total reconciled count across all 5 initial cities: 265 neighborhoods.
 */
export const HISTORICAL_59_RECONCILIATION_ANALYSIS = {
  reportedCount: 59 as const,
  reconciledCount: 265,
  explanation:
    'The historical report of 59 neighborhoods refers to the legacy Tehran municipal dataset terminating at ID 59 (خانی‌آباد نو و عبدل‌آباد). The active verified repository catalog contains 80 Tehran neighborhoods (including 20 county satellite towns) plus 185 metropolitan neighborhoods across Karaj, Mashhad, Isfahan, and Shiraz, totaling 265 active canonical records.',
  tehranMunicipalCoreCount: 60,
  tehranCountyCount: 20,
  totalTehranCatalogCount: 80,
};

/**
 * Performs a rigorous data integrity audit across all canonical records.
 */
export function auditGeographicDataIntegrity(): DatasetInventoryReport['dataIntegrityAudit'] {
  const allHoods = listAllCanonicalNeighborhoods();

  // 1. Audit Duplicate Numeric IDs
  const idCounts = new Map<number, number>();
  for (const h of allHoods) {
    idCounts.set(h.id, (idCounts.get(h.id) || 0) + 1);
  }
  const duplicateNumericIds: number[] = [];
  for (const [id, count] of idCounts.entries()) {
    if (count > 1) {
      duplicateNumericIds.push(id);
    }
  }

  // 2. Audit Missing Coordinates
  let missingCoordinatesCount = 0;
  for (const h of allHoods) {
    if (
      !h.coordinates ||
      typeof h.coordinates.lat !== 'number' ||
      typeof h.coordinates.lng !== 'number' ||
      Number.isNaN(h.coordinates.lat) ||
      Number.isNaN(h.coordinates.lng)
    ) {
      missingCoordinatesCount++;
    }
  }

  // 3. Audit Cross-City Duplicate Names
  const nameToCities = new Map<string, Array<{ cityId: SupportedCityId; hoodId: number }>>();
  for (const h of allHoods) {
    const list = nameToCities.get(h.nameFa) || [];
    list.push({ cityId: h.cityId, hoodId: h.id });
    nameToCities.set(h.nameFa, list);
  }

  const crossCityDuplicateNames: Array<{ name: string; cities: SupportedCityId[]; hoodIds: number[] }> = [];
  for (const [name, occurrences] of nameToCities.entries()) {
    if (occurrences.length > 1) {
      crossCityDuplicateNames.push({
        name,
        cities: occurrences.map((o) => o.cityId),
        hoodIds: occurrences.map((o) => o.hoodId),
      });
    }
  }

  // 4. Verify Single City Ownership
  const allHoodsBelongToExactlyOneCity = allHoods.every(
    (h) => typeof h.cityId === 'string' && SUPPORTED_CITY_IDS.includes(h.cityId)
  );

  return {
    duplicateNumericIds,
    missingCoordinatesCount,
    crossCityDuplicateNames,
    allHoodsBelongToExactlyOneCity,
  };
}

/**
 * Generates the complete canonical inventory and reconciliation report.
 */
export function generateReconciliationInventoryReport(): DatasetInventoryReport {
  const neighborhoodsByCity: Record<SupportedCityId, number> = {
    tehran: listNeighborhoodsByCity('tehran').length,
    karaj: listNeighborhoodsByCity('karaj').length,
    mashhad: listNeighborhoodsByCity('mashhad').length,
    isfahan: listNeighborhoodsByCity('isfahan').length,
    shiraz: listNeighborhoodsByCity('shiraz').length,
  };

  const totalNeighborhoodsCount = Object.values(neighborhoodsByCity).reduce((a, b) => a + b, 0);

  return {
    datasetVersion: NEIGHBORHOODS_DATASET_VERSION,
    generatedAtIso: new Date().toISOString(),
    supportedCitiesCount: Object.keys(CANONICAL_CITIES).length,
    totalNeighborhoodsCount,
    neighborhoodsByCity,
    historical59Reconciliation: HISTORICAL_59_RECONCILIATION_ANALYSIS,
    dataIntegrityAudit: auditGeographicDataIntegrity(),
  };
}

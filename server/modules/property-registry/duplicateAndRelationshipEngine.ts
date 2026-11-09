import type {
  BargainsListingConsumerAdapter,
  StoredAssetListingLink,
  StoredDuplicateMatchCandidate,
  StoredPropertyAsset,
} from './types';

/**
 * Pure duplicate candidate evaluation engine.
 * Never performs automatic irreversible merges.
 * Evaluates physical asset characteristics across neighborhood, area, floor, and building/unit references.
 */
export function evaluateAssetDuplicateCandidate(
  assetA: StoredPropertyAsset,
  assetB: StoredPropertyAsset,
): { isCandidate: boolean; score: number; reasons: string[] } {
  if (assetA.id === assetB.id) {
    return { isCandidate: false, score: 0, reasons: [] };
  }

  // Must be same city and neighborhood
  if (
    assetA.geographicRef.cityId !== assetB.geographicRef.cityId ||
    assetA.geographicRef.hoodId !== assetB.geographicRef.hoodId
  ) {
    return { isCandidate: false, score: 0, reasons: ['Different city or neighborhood'] };
  }

  // Must be same category
  if (assetA.category !== assetB.category) {
    return { isCandidate: false, score: 0, reasons: ['Different property category'] };
  }

  const reasons: string[] = [];
  let score = 20; // Base score for same hood & category

  // 1. Direct Building & Unit match
  if (assetA.buildingId && assetB.buildingId && assetA.buildingId === assetB.buildingId) {
    score += 40;
    reasons.push('Identical parent building ID');
    if (assetA.unitId && assetB.unitId && assetA.unitId === assetB.unitId) {
      score += 35;
      reasons.push('Identical unit ID in same building');
    }
  }

  // 2. Area comparison (within 3% tolerance)
  const areaDiff = Math.abs(assetA.areaSqm - assetB.areaSqm) / Math.max(assetA.areaSqm, assetB.areaSqm);
  if (areaDiff <= 0.01) {
    score += 25;
    reasons.push('Exact area match (within 1%)');
  } else if (areaDiff <= 0.03) {
    score += 15;
    reasons.push('Close area match (within 3%)');
  } else if (areaDiff > 0.1) {
    score -= 30; // Substantial area divergence penalizes match
  }

  // 3. Floor number comparison
  if (assetA.floorNumber !== undefined && assetB.floorNumber !== undefined) {
    if (assetA.floorNumber === assetB.floorNumber) {
      score += 20;
      reasons.push(`Identical floor number (${assetA.floorNumber})`);
    } else {
      score -= 40; // Different floors strongly implies different physical units!
    }
  }

  // 4. Construction year comparison
  if (assetA.constructionYear && assetB.constructionYear) {
    const yearDiff = Math.abs(assetA.constructionYear - assetB.constructionYear);
    if (yearDiff === 0) {
      score += 10;
      reasons.push('Identical construction year');
    } else if (yearDiff > 2) {
      score -= 20;
    }
  }

  const normalizedScore = Math.max(0, Math.min(100, score));
  const isCandidate = normalizedScore >= 70;

  return { isCandidate, score: normalizedScore, reasons };
}

/**
 * Validates whether a listing from Bargains can be plausibly linked to a physical asset.
 */
export async function validateListingToAssetMatch(params: {
  asset: StoredPropertyAsset;
  listingId: string;
  bargainsAdapter?: BargainsListingConsumerAdapter;
}): Promise<{ compatible: boolean; confidence: 'high' | 'medium' | 'low'; reason: string }> {
  if (!params.bargainsAdapter) {
    // Fallback when adapter is unconfigured: allow manual administrative link
    return {
      compatible: true,
      confidence: 'low',
      reason: 'Manual administrative link; external Bargains adapter unconfigured.',
    };
  }

  const listing = await params.bargainsAdapter.getListingSummary(params.listingId);
  if (!listing) {
    return {
      compatible: false,
      confidence: 'low',
      reason: `Listing "${params.listingId}" was not found in the Bargains module.`,
    };
  }

  // Geographic consistency check
  if (
    listing.cityId.toLowerCase() !== params.asset.geographicRef.cityId.toLowerCase() ||
    listing.hoodId !== params.asset.geographicRef.hoodId
  ) {
    return {
      compatible: false,
      confidence: 'low',
      reason: 'Listing belongs to a different city or neighborhood than the target asset.',
    };
  }

  // Area consistency check (within 10% tolerance for listing roundings)
  const areaDiff = Math.abs(listing.sqm - params.asset.areaSqm) / params.asset.areaSqm;
  if (areaDiff > 0.15) {
    return {
      compatible: false,
      confidence: 'low',
      reason: `Area divergence (${listing.sqm}m² vs asset ${params.asset.areaSqm}m²) exceeds 15% threshold.`,
    };
  }

  const isHigh = areaDiff <= 0.03 && (listing.floor === undefined || listing.floor === params.asset.floorNumber);
  return {
    compatible: true,
    confidence: isHigh ? 'high' : 'medium',
    reason: `Matching neighborhood (${listing.hoodId}) and compatible area (${listing.sqm}m²).`,
  };
}

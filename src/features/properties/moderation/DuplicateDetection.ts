/** @file src/features/properties/moderation/DuplicateDetection.ts — Multi-Signal Non-Destructive Duplicate Detection */
import { matchesPersianSearch } from '../../../utils/security';
import { normalizeDigitsToAscii } from '../filters/PropertyFilterDraft';
import type { PropertyListingRecord } from '../types/listing.types';
import type { DuplicateMatchAssessment, ListingSubmissionDraft } from '../types/listing-history.types';

function parseNum(v: string): number {
  const n = Number(normalizeDigitsToAscii(v || '').replace(/[,٬\s]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

export function assessDuplicateSubmission(
  draft: ListingSubmissionDraft,
  existingRecords: PropertyListingRecord[],
): DuplicateMatchAssessment {
  const draftArea = parseNum(draft.areaSqm);
  const draftTotalM =
    draft.transactionType === 'sale' || draft.transactionType === 'presale'
      ? parseNum(draft.saleTotalBillion) * 1000
      : parseNum(draft.depositMillion);

  let bestScore = 0;
  const matchedIds: string[] = [];
  const bestReasons: string[] = [];

  for (const rec of existingRecords) {
    if (rec.listing.status === 'removed' || rec.listing.status === 'rejected') continue;
    if (rec.property.hoodId !== draft.hoodId) continue;
    if (rec.listing.transactionType !== draft.transactionType) continue;
    if (rec.property.propertyType !== draft.propertyType) continue;

    let score = 20; // same hood + same tx + same propertyType
    const reasons: string[] = ['تطابق محله، نوع ملک و نوع معامله'];

    if (draft.street.trim() && matchesPersianSearch(rec.property.street, draft.street.trim())) {
      score += 25;
      reasons.push('تشابه خیابان/محدوده');
    }

    if (rec.property.areaSqm && draftArea > 0) {
      const areaDiffRatio = Math.abs(rec.property.areaSqm - draftArea) / rec.property.areaSqm;
      if (areaDiffRatio <= 0.04) {
        score += 30;
        reasons.push('متراژ بسیار نزدیک (±۴٪)');
      } else if (areaDiffRatio <= 0.1) {
        score += 15;
        reasons.push('متراژ نزدیک (±۱۰٪)');
      }
    }

    const recPrice =
      rec.listing.transactionType === 'sale' || rec.listing.transactionType === 'presale'
        ? rec.listing.price.saleTotalMillion
        : rec.listing.price.depositMillion;

    if (recPrice && draftTotalM > 0) {
      const priceDiffRatio = Math.abs(recPrice - draftTotalM) / recPrice;
      if (priceDiffRatio <= 0.05) {
        score += 25;
        reasons.push('قیمت نزدیک (±۵٪)');
      }
    }

    if (score >= 55) {
      matchedIds.push(rec.listing.listingId);
      if (score > bestScore) {
        bestScore = score;
        bestReasons.splice(0, bestReasons.length, ...reasons);
      }
    }
  }

  if (bestScore >= 80) {
    return {
      level: 'high',
      score: bestScore,
      matchedListingIds: matchedIds.slice(0, 3),
      reasons: bestReasons,
      actionPolicy: 'queue_manual_review',
    };
  }
  if (bestScore >= 60) {
    return {
      level: 'medium',
      score: bestScore,
      matchedListingIds: matchedIds.slice(0, 3),
      reasons: bestReasons,
      actionPolicy: 'warn_publisher',
    };
  }
  if (bestScore >= 40) {
    return {
      level: 'low',
      score: bestScore,
      matchedListingIds: matchedIds.slice(0, 3),
      reasons: bestReasons,
      actionPolicy: 'allow_publish',
    };
  }
  return {
    level: 'none',
    score: 0,
    matchedListingIds: [],
    reasons: [],
    actionPolicy: 'allow_publish',
  };
}

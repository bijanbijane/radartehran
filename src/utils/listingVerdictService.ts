/**
 * Listing verdict API — epistemic disclaimers, hood mismatch, diagnosis wrapper.
 * OP-DEC-001 parity: formatMillionTomanAsIntlCurrency (see areaUnit).
 */

import { INITIAL_NEIGHBORHOODS } from '../data/neighborhoods';
import { MULTI_CITY_CONFIGS } from '../data/multiCityData';
import type { CityId } from '../types/models';
import { compactPersianSearchKey } from './persianSearchAndPersonalWorkspace';
import { buildDivarComparableProvenance, fetchDivarComparableListings } from './divarComparableListings';
import { diagnoseListingDeal, parseListingNarrativeText, type ListingDiagnosisResult } from './listingVerifierEngine';

const DISCLAIMER_FA =
  'این گزارش بر پایهٔ متن آگهی و مدل مرجع رادار است؛ معاملهٔ قطعی ثبت‌شده یا قیمت رسمی کاداستر تلقی نمی‌شود.';

export type ListingVerdictRequest = {
  city: string;
  hoodName: string;
  listingText: string;
  mode: 'buy' | 'rent';
};

export type ListingVerdictOk = {
  status: 'ok';
  disclaimerFa: string;
  hoodMismatchWarningFa: string | null;
  diagnosis: ListingDiagnosisResult;
};

export type ListingVerdictError = {
  status: 'error';
  code: 'INVALID_INPUT' | 'HOOD_NOT_FOUND';
  messageFa: string;
};

export type ListingVerdictResult = ListingVerdictOk | ListingVerdictError;

function normalizeHoodKey(name: string): string {
  return compactPersianSearchKey(name.replace(/\u200c/g, ''));
}

export function buildHoodMismatchWarningFa(
  detectedHoodName: string | undefined,
  selectedHoodName: string | undefined,
): string | null {
  if (!detectedHoodName || !selectedHoodName) return null;
  const detected = normalizeHoodKey(detectedHoodName);
  const selected = normalizeHoodKey(selectedHoodName);
  if (!detected || !selected) return null;
  if (detected === selected || detected.includes(selected) || selected.includes(detected)) return null;
  return `نام محله در متن آگهی (${detectedHoodName}) با محلهٔ انتخاب‌شده (${selectedHoodName}) هم‌خوان نیست؛ قبل از قیمت‌گذاری، محله را تصحیح کنید.`;
}

function resolveHoodId(city: string, hoodName: string): number | undefined {
  const cfg = MULTI_CITY_CONFIGS[city as keyof typeof MULTI_CITY_CONFIGS] || MULTI_CITY_CONFIGS.tehran;
  const hoods = cfg?.neighborhoods || INITIAL_NEIGHBORHOODS;
  const key = normalizeHoodKey(hoodName);
  const exact = hoods.find((h) => normalizeHoodKey(h.name) === key);
  if (exact) return exact.id;
  return hoods.find((h) => {
    const hk = normalizeHoodKey(h.name);
    return hk.includes(key) || key.includes(hk);
  })?.id;
}

export async function buildListingVerdict(req: ListingVerdictRequest): Promise<ListingVerdictResult> {
  const text = (req.listingText || '').trim();
  if (text.length < 12) {
    return { status: 'error', code: 'INVALID_INPUT', messageFa: 'متن آگهی برای تحلیل کافی نیست.' };
  }
  const hoodId = resolveHoodId(req.city, req.hoodName);
  if (hoodId === undefined) {
    return { status: 'error', code: 'HOOD_NOT_FOUND', messageFa: 'محلهٔ انتخاب‌شده در دیتابیس رادار یافت نشد.' };
  }

  const parsed = parseListingNarrativeText(text, req.hoodName);
  const hoodMismatchWarningFa = buildHoodMismatchWarningFa(parsed.detectedHoodName, req.hoodName);

  let liveContext: Parameters<typeof diagnoseListingDeal>[3];
  try {
    const cityId = (['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'] as const).includes(req.city as CityId)
      ? (req.city as CityId)
      : 'tehran';
    const sample = await fetchDivarComparableListings(cityId, req.hoodName, { targetSqm: parsed.areaSqm });
    liveContext = {
      comparables: sample.comparables,
      medianPerSqm: sample.medianPerSqm,
      insufficientSample: sample.insufficientSample,
      provenance: sample.provenance,
    };
  } catch {
    liveContext = {
      comparables: [],
      medianPerSqm: null,
      insufficientSample: true,
      provenance: buildDivarComparableProvenance('upstream_error', new Date().toISOString()),
    };
  }

  const diagnosis = diagnoseListingDeal(parsed, req.city, hoodId, liveContext);

  return {
    status: 'ok',
    disclaimerFa: DISCLAIMER_FA,
    hoodMismatchWarningFa,
    diagnosis,
  };
}

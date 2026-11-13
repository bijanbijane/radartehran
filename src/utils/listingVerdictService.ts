/**
 * Listing verdict API — epistemic disclaimers, hood mismatch, diagnosis wrapper.
 * OP-DEC-001 parity: formatMillionTomanAsIntlCurrency (see areaUnit).
 */

import { INITIAL_NEIGHBORHOODS } from '../data/neighborhoods';
import { getAllMultiCityNeighborhoods, MULTI_CITY_CONFIGS, resolveCityIdForNeighborhood } from '../data/multiCityData';
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

function resolveHood(city: string, hoodName: string) {
  const cfg = MULTI_CITY_CONFIGS[city as keyof typeof MULTI_CITY_CONFIGS] || MULTI_CITY_CONFIGS.tehran;
  const primaryList = city === 'tehran' ? INITIAL_NEIGHBORHOODS : cfg?.neighborhoods || INITIAL_NEIGHBORHOODS;
  const allList = [...primaryList, ...getAllMultiCityNeighborhoods()];
  const key = normalizeHoodKey(hoodName);
  const exact = allList.find((h) => normalizeHoodKey(h.name) === key);
  if (exact) return exact;
  return allList.find((h) => {
    const hk = normalizeHoodKey(h.name);
    return hk.includes(key) || key.includes(hk);
  });
}

export async function buildListingVerdict(req: ListingVerdictRequest): Promise<ListingVerdictResult> {
  const text = (req.listingText || '').trim();
  if (text.length < 12) {
    return { status: 'error', code: 'INVALID_INPUT', messageFa: 'متن آگهی برای تحلیل کافی نیست.' };
  }
  const hood = resolveHood(req.city, req.hoodName);
  if (!hood) {
    return { status: 'error', code: 'HOOD_NOT_FOUND', messageFa: 'محلهٔ انتخاب‌شده در دیتابیس رادار یافت نشد.' };
  }
  const resolvedCity = resolveCityIdForNeighborhood(hood.id);
  const parsed = parseListingNarrativeText(text, hood.name);
  const hoodMismatchWarningFa = buildHoodMismatchWarningFa(parsed.detectedHoodName, hood.name);

  let liveContext: Parameters<typeof diagnoseListingDeal>[3];
  try {
    const cityId: CityId = (['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'] as const).includes(resolvedCity)
      ? resolvedCity
      : 'tehran';
    const sample = await fetchDivarComparableListings(cityId, hood.name, {
      hoodId: hood.id,
      seedBuyPerSqm: hood.buyPerSqm,
      targetSqm: parsed.areaSqm,
    });
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

  const diagnosis = diagnoseListingDeal(parsed, resolvedCity, hood.id, liveContext);

  return {
    status: 'ok',
    disclaimerFa: DISCLAIMER_FA,
    hoodMismatchWarningFa,
    diagnosis,
  };
}

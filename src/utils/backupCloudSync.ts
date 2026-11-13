/**
 * @file src/utils/backupCloudSync.ts
 * @description Cloud persistence helper for admin backup restoration (`appConfig/featureFlags` and changed `neighborhoodOverrides`)
 * plus clean override sponsor sanitization matching `firestore.rules:isValidOverrideSponsor`.
 */

import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Neighborhood, NeighborhoodSponsor } from '../data/neighborhoods';
import type { FeatureFlags } from './security';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from './areaUnit';

export function formatRestoredBuyPerSqmIntl(buyPerSqmMillion: number, currency: IntlCurrencyCode = 'USD'): string {
  return formatMillionTomanAsIntlCurrency(buyPerSqmMillion, currency);
}

export interface CleanOverrideSponsor {
  name: string;
  phone: string;
  specialty: string;
  experienceYears: number;
  expiresAtIso?: string;
  planType?: 'free' | 'paid_1m' | 'paid_3m';
}

export function sanitizeSponsorForOverrideDoc(
  sponsor: (NeighborhoodSponsor & { verified?: boolean; planMonths?: number }) | null | undefined,
): CleanOverrideSponsor | null {
  if (!sponsor || typeof sponsor !== 'object') return null;
  const planType =
    sponsor.planType === 'free' || sponsor.planType === 'paid_1m' || sponsor.planType === 'paid_3m'
      ? sponsor.planType
      : undefined;
  return {
    name: String(sponsor.name || '').slice(0, 120),
    phone: String(sponsor.phone || '').slice(0, 30),
    specialty: String(sponsor.specialty || '').slice(0, 140),
    experienceYears: Math.min(60, Math.max(0, Math.round(Number(sponsor.experienceYears) || 0))),
    ...(sponsor.expiresAtIso ? { expiresAtIso: String(sponsor.expiresAtIso).slice(0, 60) } : {}),
    ...(planType ? { planType } : {}),
  };
}

export async function persistRestoredStateToFirestore(params: {
  restoredNeighborhoods: Neighborhood[];
  seedNeighborhoods: Neighborhood[];
  featureFlags?: FeatureFlags;
}): Promise<{ syncedOverridesCount: number; syncedFlags: boolean }> {
  let syncedFlags = false;
  if (params.featureFlags) {
    await setDoc(doc(db, 'appConfig', 'featureFlags'), {
      ...params.featureFlags,
      updatedAt: serverTimestamp(),
    });
    syncedFlags = true;
  }

  const seedById = new Map(params.seedNeighborhoods.map((h) => [h.id, h]));
  const changedHoods = params.restoredNeighborhoods.filter((h) => {
    const seed = seedById.get(h.id);
    if (!seed) return true;
    const baseBuy = (h as Neighborhood & { baseBuyPerSqm?: number }).baseBuyPerSqm ?? h.buyPerSqm;
    return baseBuy !== seed.buyPerSqm || h.rahn80m !== seed.rahn80m || Boolean(h.sponsor) !== Boolean(seed.sponsor) || h.sponsor?.expiresAtIso !== seed.sponsor?.expiresAtIso;
  });

  let syncedOverridesCount = 0;
  for (let i = 0; i < changedHoods.length; i += 350) {
    const chunk = changedHoods.slice(i, i + 350);
    const batch = writeBatch(db);
    for (const hood of chunk) {
      const buyVal = Math.min(5000, Math.max(10, Math.round((hood as Neighborhood & { baseBuyPerSqm?: number }).baseBuyPerSqm ?? hood.buyPerSqm)));
      const rahnVal = Math.min(100000, Math.max(50, Math.round(hood.rahn80m)));
      const cleanSponsor = sanitizeSponsorForOverrideDoc(hood.sponsor);
      batch.set(doc(db, 'neighborhoodOverrides', String(hood.id)), {
        hoodId: hood.id,
        buyPerSqm: buyVal,
        rahn80m: rahnVal,
        ...(cleanSponsor ? { sponsor: cleanSponsor } : {}),
        overrideSource: 'ADMIN_MANUAL',
        manualLockUntilMs: Date.now() + 7 * 24 * 60 * 60 * 1000,
        updatedAt: serverTimestamp(),
      });
      syncedOverridesCount += 1;
    }
    if (chunk.length > 0) await batch.commit();
  }

  return { syncedOverridesCount, syncedFlags };
}

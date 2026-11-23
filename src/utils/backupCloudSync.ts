/**
 * @file src/utils/backupCloudSync.ts
 * @description Cloud persistence helper for admin backup restoration (`appConfig/featureFlags` and changed `neighborhoodOverrides`)
 * plus clean override sponsor sanitization matching `firestore.rules:isValidOverrideSponsor`.
 */

import { CLIENT_FIRESTORE_FORBIDDEN } from '../platform/data/clientDataPolicy';
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
  if (CLIENT_FIRESTORE_FORBIDDEN) {
    return { syncedOverridesCount: 0, syncedFlags: false };
  }
  return { syncedOverridesCount: 0, syncedFlags: false };
}

import type { NeighborhoodSponsor } from '../types/models';
import { formatMillionTomanAsIntlCurrency } from './areaUnit';

export const PUBLIC_SPONSOR_COLLECTION = 'neighborhoodOverrides';
export const PUBLIC_SPONSOR_HOOD_MIN = 1;
export const PUBLIC_SPONSOR_HOOD_MAX = 999;

export function sponsorFromNeighborhoodOverride(data: Record<string, unknown>, nowMs = Date.now()): NeighborhoodSponsor | null {
  const raw = data.sponsor;
  if (!raw || typeof raw !== 'object') return null;
  const sponsor = raw as Record<string, unknown>;
  if (typeof sponsor.name !== 'string' || typeof sponsor.phone !== 'string') return null;
  const expiresAtIso = typeof sponsor.expiresAtIso === 'string' ? sponsor.expiresAtIso : '';
  const expiresMs = expiresAtIso ? Date.parse(expiresAtIso) : Number.NaN;
  if (expiresAtIso && !Number.isNaN(expiresMs) && expiresMs <= nowMs) return null;
  const planType = sponsor.planType === 'free' || sponsor.planType === 'paid_1m' || sponsor.planType === 'paid_3m' ? sponsor.planType : 'paid_1m';
  return {
    name: sponsor.name.slice(0, 120),
    phone: sponsor.phone.slice(0, 30),
    specialty: typeof sponsor.specialty === 'string' ? sponsor.specialty.slice(0, 140) : '',
    experienceYears: Math.min(60, Math.max(0, Number(sponsor.experienceYears) || 0)),
    expiresAtIso,
    planType,
  };
}

export function publicSponsorCollectionLabel(): string {
  return `${PUBLIC_SPONSOR_COLLECTION}:${formatMillionTomanAsIntlCurrency(PUBLIC_SPONSOR_HOOD_MAX, 'USD', 'en')}`;
}

/**
 * Account privacy & consent backend contract (Phase A).
 * Local storage is cache-only; authoritative records live in DurableAccountLifecycleStoreV2.
 */

import type { AccountPrivacyConsentRecord, PrivacyConsentScope } from './types.ts';

export interface AccountPrivacySettingsSnapshot {
  targetUid: string;
  productAnalyticsOptIn: boolean;
  communityProfileVisibility: 'public' | 'connections' | 'private';
  marketingEmailOptIn: boolean;
  consentPolicyVersion: string;
  updatedAtIso: string;
  revision: number;
}

export interface AccountPrivacyStore {
  getPrivacySettings(targetUid: string): Promise<AccountPrivacySettingsSnapshot | null>;
  savePrivacySettings(
    targetUid: string,
    expectedRevision: number | null,
    next: Omit<AccountPrivacySettingsSnapshot, 'targetUid'>,
  ): Promise<AccountPrivacySettingsSnapshot>;

  getLatestConsent(targetUid: string, scope: PrivacyConsentScope): Promise<AccountPrivacyConsentRecord | null>;
  recordConsent(consent: AccountPrivacyConsentRecord): Promise<AccountPrivacyConsentRecord>;
  listConsentsForUser(
    targetUid: string,
    options?: { limit?: number },
  ): Promise<AccountPrivacyConsentRecord[]>;
}

export const DEFAULT_PRIVACY_POLICY_VERSION = '2026-11.privacy.v1';

export function deriveOptionalAnalyticsAllowed(
  consent: AccountPrivacyConsentRecord | null,
  nowIso: string,
): boolean {
  if (!consent) return false;
  if (consent.scope !== 'PRODUCT_ANALYTICS_OPTIONAL') return false;
  if (!consent.granted) return false;
  if (consent.revokedAtIso && consent.revokedAtIso <= nowIso) return false;
  return true;
}
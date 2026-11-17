/** @file src/platform/auth/identity/profileResolver.ts — User Profile Resolution (Zero Permission Leakage) */
import type { UserIdentitySnapshot, UserProfileSnapshot } from '../core/authState';
import type { IdentityRecord } from './identityResolver';

export interface RawUserProfileInput {
  readonly displayName?: string | null;
  readonly avatarUrl?: string | null;
  readonly preferredLocale?: 'fa' | 'en';
  readonly organizationName?: string | null;
}

export interface ProfileRecord extends UserProfileSnapshot {
  readonly isComplete: boolean;
}

export function resolveUserProfile(
  identity: UserIdentitySnapshot | null,
  rawProfile?: RawUserProfileInput | null,
): UserProfileSnapshot | null {
  if (!identity) return null;
  const fallbackName = identity.email ? identity.email.split('@')[0] : 'کاربر رادار تهران';
  return {
    userId: identity.userId,
    displayName:
      typeof rawProfile?.displayName === 'string' && rawProfile.displayName.trim()
        ? rawProfile.displayName.trim().slice(0, 80)
        : fallbackName,
    avatarUrl:
      typeof rawProfile?.avatarUrl === 'string' && rawProfile.avatarUrl.startsWith('https://')
        ? rawProfile.avatarUrl
        : null,
    preferredLocale: rawProfile?.preferredLocale === 'en' ? 'en' : 'fa',
    organizationName:
      typeof rawProfile?.organizationName === 'string' && rawProfile.organizationName.trim()
        ? rawProfile.organizationName.trim().slice(0, 100)
        : null,
  };
}

export function resolveProfile(
  identity: IdentityRecord | UserIdentitySnapshot | null,
  rawProfile?: RawUserProfileInput | null
): ProfileRecord {
  if (!identity || identity.userId === 'guest') {
    return {
      userId: 'guest',
      displayName: 'کاربر مهمان',
      avatarUrl: null,
      preferredLocale: 'fa',
      organizationName: null,
      isComplete: false,
    };
  }
  const base = resolveUserProfile(identity, {
    ...rawProfile,
    displayName: rawProfile?.displayName ?? (identity as IdentityRecord).displayName,
  })!;
  const isComplete = Boolean(base.displayName && (identity.email || identity.phoneNumber));
  return {
    ...base,
    isComplete,
  };
}

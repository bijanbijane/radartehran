/** @file src/platform/auth/identity/identityResolver.ts — Strict Identity Resolution (Separate from Profile, Role & Permission) */
import type { UserIdentitySnapshot } from '../core/authState';
import type { AuthUserSnapshot } from '../core/authClient';

export interface RawIdentityInput {
  readonly uid?: string | null;
  readonly email?: string | null;
  readonly emailVerified?: boolean | null;
  readonly phoneNumber?: string | null;
  readonly displayName?: string | null;
  readonly providerIds?: readonly string[];
  readonly isAnonymous?: boolean | null;
  readonly customClaims?: Record<string, unknown>;
}

export interface IdentityRecord extends UserIdentitySnapshot {
  readonly uid: string;
  readonly displayName: string | null;
  readonly customClaims: Record<string, unknown>;
}

export function resolveCanonicalIdentity(raw: RawIdentityInput | null | undefined): UserIdentitySnapshot | null {
  if (!raw || typeof raw.uid !== 'string' || !raw.uid.trim()) {
    return null;
  }
  const cleanUid = raw.uid.trim();
  return {
    userId: cleanUid,
    email: typeof raw.email === 'string' && raw.email.trim() ? raw.email.trim().toLowerCase() : null,
    emailVerified: Boolean(raw.emailVerified),
    phoneNumber: typeof raw.phoneNumber === 'string' && raw.phoneNumber.trim() ? raw.phoneNumber.trim() : null,
    providerIds: Array.isArray(raw.providerIds) ? [...raw.providerIds] : [],
    isAnonymous: Boolean(raw.isAnonymous),
  };
}

export function resolveIdentity(raw: AuthUserSnapshot | RawIdentityInput | null | undefined): IdentityRecord {
  const canonical = resolveCanonicalIdentity(raw);
  if (!canonical) {
    return {
      uid: 'guest',
      userId: 'guest',
      email: null,
      emailVerified: false,
      phoneNumber: null,
      displayName: null,
      providerIds: [],
      isAnonymous: true,
      customClaims: {},
    };
  }
  return {
    ...canonical,
    uid: canonical.userId,
    displayName: typeof raw?.displayName === 'string' ? raw.displayName : null,
    customClaims: (raw?.customClaims as Record<string, unknown>) ?? {},
  };
}

export function isSameUserIdentity(a: UserIdentitySnapshot | null, b: UserIdentitySnapshot | null): boolean {
  if (!a || !b) return false;
  return a.userId === b.userId;
}

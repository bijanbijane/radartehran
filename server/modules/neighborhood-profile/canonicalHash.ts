import type { NipsNeighborhoodProfile } from './types';

function canonicalize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('NIPS_CANONICAL_JSON_NON_FINITE_NUMBER');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new TypeError('NIPS_CANONICAL_JSON_UNSUPPORTED_VALUE');
  }

  const objectValue = value as object;
  if (ancestors.has(objectValue)) throw new TypeError('NIPS_CANONICAL_JSON_CYCLE');
  ancestors.add(objectValue);

  try {
    if (Array.isArray(value)) {
      const length = value.length;
      const ownKeys = Reflect.ownKeys(value);
      const allowedKeys = ownKeys.every((key) =>
        key === 'length' ||
        (typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key) && Number(key) < length)
      );
      if (!allowedKeys) throw new TypeError('NIPS_CANONICAL_JSON_ARRAY_EXTRA_PROPERTY');

      const items: string[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !('value' in descriptor)) {
          throw new TypeError('NIPS_CANONICAL_JSON_SPARSE_OR_ACCESSOR_ARRAY');
        }
        items.push(canonicalize(descriptor.value, ancestors));
      }
      return '[' + items.join(',') + ']';
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('NIPS_CANONICAL_JSON_NON_PLAIN_OBJECT');
    }

    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== 'string')) {
      throw new TypeError('NIPS_CANONICAL_JSON_SYMBOL_KEY');
    }

    const keys = (ownKeys as string[]).sort();
    const pairs: string[] = [];
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) {
        throw new TypeError('NIPS_CANONICAL_JSON_ACCESSOR_OR_NON_ENUMERABLE_PROPERTY');
      }
      pairs.push(JSON.stringify(key) + ':' + canonicalize(descriptor.value, ancestors));
    }
    return '{' + pairs.join(',') + '}';
  } finally {
    ancestors.delete(objectValue);
  }
}

/** Stable JSON serialization: sorted object keys, ordered arrays, no coercion. */
export function canonicalizeNipsValue(value: unknown): string {
  return canonicalize(value, new Set<object>());
}

export async function sha256NipsValue(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('NIPS_WEB_CRYPTO_UNAVAILABLE');
  const bytes = new TextEncoder().encode(canonicalizeNipsValue(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Hashes immutable snapshot content and pinned dependencies. Wall-clock creation
 * timestamps and publication decisions are deliberately excluded: publication
 * is a separate governance record and must not mutate snapshot identity.
 */
export async function computeNipsProfileContentHash(profile: NipsNeighborhoodProfile): Promise<string> {
  const metadata = profile.metadata;
  return sha256NipsValue({
    snapshot: {
      profileId: metadata.profileId,
      schemaVersion: metadata.schemaVersion,
      profileVersion: metadata.profileVersion,
      assemblyBuildId: metadata.assemblyBuildId,
      methodologyVersion: metadata.methodologyVersion,
      publicationPolicyVersion: metadata.publicationPolicyVersion,
      sourceWatermarks: metadata.sourceWatermarks,
    },
    identity: profile.identity,
    domains: profile.domains,
    quality: profile.quality,
  });
}

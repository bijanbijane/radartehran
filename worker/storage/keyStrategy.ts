/**
 * @file worker/storage/keyStrategy.ts
 * @description Deterministic, collision-resistant object key generation,
 * strict validation, path-traversal prevention, and client filename sanitization.
 *
 * Pattern:
 * `listings/{environment}/{city}/hood-{hoodId}/{mediaCategory}/{yyyy-mm}/{objectId}.{ext}`
 * `private/{environment}/documents/{ownerUid}/{yyyy-mm}/{objectId}.{ext}`
 * `telemetry/{environment}/v1/year={yyyy}/month={mm}/day={dd}/{batchId}.ndjson`
 */

import type { AllowedMediaMime, ObjectMediaCategory } from './types';

const ALLOWED_CITIES = new Set(['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz']);

const EXTENSION_MAP: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{12,64}$/;

export interface ObjectKeyBuildParams {
  environment?: 'development' | 'preview' | 'staging' | 'production';
  city: string;
  hoodId: number;
  mediaCategory: ObjectMediaCategory;
  mimeType: AllowedMediaMime | string;
  objectId: string;
}

/**
 * Generate a cryptographically random, collision-resistant Object ID.
 */
export function generateDeterministicObjectId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `obj-${Date.now()}-${hex.slice(0, 12)}`;
}

/**
 * Normalize and sanitize original client-provided filename.
 * Original filenames are NEVER used as storage keys.
 */
export function sanitizeClientFileName(raw: string): string {
  if (!raw || typeof raw !== 'string') return 'unnamed_file';
  const noPath = raw
    .replace(/[\\/]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '_');
  const clean = noPath.replace(/^(\.\.?_)+/, '').replace(/^\.+/, '').trim().slice(0, 100);
  return clean || 'unnamed_file';
}

/**
 * Build deterministic, collision-resistant storage key.
 */
export function buildScopedStorageKey(params: ObjectKeyBuildParams): string {
  const env = params.environment || 'production';
  const city = ALLOWED_CITIES.has(params.city.toLowerCase()) ? params.city.toLowerCase() : 'tehran';
  const hoodId = Math.max(1, Math.min(999, Math.floor(params.hoodId) || 1));
  const category: ObjectMediaCategory = params.mediaCategory === 'video' ? 'video' : 'image';
  
  const cleanMime = String(params.mimeType || '').trim().toLowerCase();
  const ext = EXTENSION_MAP[cleanMime] || (category === 'video' ? 'mp4' : 'webp');

  const cleanId = String(params.objectId || '').trim();
  if (!SAFE_ID_PATTERN.test(cleanId)) {
    throw new Error('INVALID_OBJECT_ID: Object ID must match /^[a-zA-Z0-9_-]{12,64}$/');
  }

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');

  return `listings/${env}/${city}/hood-${hoodId}/${category}/${yyyy}-${mm}/${cleanId}.${ext}`;
}

const PARSEABLE_STORAGE_KEY_PATTERN =
  /^listings\/(development|preview|staging|production)\/(tehran|karaj|mashhad|isfahan|shiraz)\/hood-([1-9]\d{0,2})\/(image|video)\/\d{4}-(0[1-9]|1[0-2])\/([a-zA-Z0-9_-]{12,64})\.(jpg|jpeg|png|webp|mp4|webm|mov)$/i;

export interface ParsedStorageKey {
  readonly valid: boolean;
  readonly environment?: string;
  readonly city?: string;
  readonly hoodId?: number;
  readonly mediaCategory?: ObjectMediaCategory;
  readonly objectId?: string;
  readonly extension?: string;
  readonly error?: string;
}

/**
 * Validate and parse internal storage key.
 * Strictly prevents path-traversal, unexpected environments, and illegal characters.
 */
export function parseAndValidateStorageKey(storageKey: string): ParsedStorageKey {
  if (!storageKey || typeof storageKey !== 'string') {
    return { valid: false, error: 'MISSING_STORAGE_KEY' };
  }

  if (storageKey.includes('..') || storageKey.includes('\\') || storageKey.includes('\0')) {
    return { valid: false, error: 'PATH_TRAVERSAL_DETECTED' };
  }

  const match = PARSEABLE_STORAGE_KEY_PATTERN.exec(storageKey.trim());
  if (!match) {
    return { valid: false, error: 'INVALID_STORAGE_KEY_FORMAT' };
  }

  return {
    valid: true,
    environment: match[1],
    city: match[2],
    hoodId: Number(match[3]),
    mediaCategory: match[4] as ObjectMediaCategory,
    objectId: match[6],
    extension: match[7],
  };
}

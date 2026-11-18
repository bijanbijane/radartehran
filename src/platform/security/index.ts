/**
 * @file src/platform/security/index.ts
 * @description Stage 13 (RT-FE-REBUILD-CLIENT-SECURITY-013) — Client Security Boundary,
 * Zero Trust on Client Identity/Role, URL/Redirect Policy, File Preview Policy & Session Purge.
 */

export const RT_FE_REBUILD_STAGE_13_SPEC_ID = 'RT-FE-REBUILD-CLIENT-SECURITY-013' as const;

const FORBIDDEN_IDENTITY_BODY_KEYS = new Set([
  'uid',
  'userId',
  'authorUid',
  'senderUid',
  'senderId',
  'ownerUid',
  'role',
  'roles',
  'permissions',
  'isAdmin',
  'isVerified',
  'authoritativeVerified',
]);

const FORBIDDEN_TEST_HEADERS = new Set([
  'x-test-uid',
  'x-test-role',
  'x-mock-user',
  'x-debug-admin',
]);

const SENSITIVE_DIAGNOSTIC_KEYS = new Set([
  'authorization',
  'token',
  'idToken',
  'accessToken',
  'refreshToken',
  'cookie',
  'password',
  'recoveryCode',
  'nationalId',
  'phone',
  'mobile',
  'iban',
  'sheba',
]);

const SAFE_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);

export function assertNoClientSuppliedIdentityOrRole(input: {
  body?: Record<string, unknown> | null;
  headers?: Record<string, string> | null;
}): {
  readonly safe: boolean;
  readonly strippedBodyKeys: readonly string[];
  readonly rejectedHeaders: readonly string[];
  readonly sanitizedBody: Record<string, unknown>;
} {
  const strippedBodyKeys: string[] = [];
  const rejectedHeaders: string[] = [];
  const sanitizedBody: Record<string, unknown> = {};

  if (input.body && typeof input.body === 'object') {
    for (const [key, value] of Object.entries(input.body)) {
      if (FORBIDDEN_IDENTITY_BODY_KEYS.has(key)) {
        strippedBodyKeys.push(key);
      } else {
        sanitizedBody[key] = value;
      }
    }
  }

  if (input.headers && typeof input.headers === 'object') {
    for (const headerName of Object.keys(input.headers)) {
      if (FORBIDDEN_TEST_HEADERS.has(headerName.toLowerCase())) {
        rejectedHeaders.push(headerName);
      }
    }
  }

  return {
    safe: strippedBodyKeys.length === 0 && rejectedHeaders.length === 0,
    strippedBodyKeys,
    rejectedHeaders,
    sanitizedBody,
  };
}

export function validateSafeNavigationTarget(
  rawTarget: string,
  allowedInternalPrefixes: readonly string[] = ['/', '/map', '/market', '/discover', '/tools', '/account', '/services'],
): {
  readonly allowed: boolean;
  readonly normalizedPath: string;
  readonly reasonCode: 'SAFE_INTERNAL_PATH' | 'UNSAFE_SCHEME' | 'PROTOCOL_RELATIVE_REJECTED' | 'EXTERNAL_REDIRECT_BLOCKED';
} {
  const trimmed = String(rawTarget ?? '').trim();
  if (!trimmed) {
    return { allowed: true, normalizedPath: '/', reasonCode: 'SAFE_INTERNAL_PATH' };
  }
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:')
  ) {
    return { allowed: false, normalizedPath: '/', reasonCode: 'UNSAFE_SCHEME' };
  }
  if (trimmed.startsWith('//') || trimmed.startsWith('\\\\')) {
    return { allowed: false, normalizedPath: '/', reasonCode: 'PROTOCOL_RELATIVE_REJECTED' };
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || !trimmed.startsWith('/')) {
    return { allowed: false, normalizedPath: '/', reasonCode: 'EXTERNAL_REDIRECT_BLOCKED' };
  }
  const matchesPrefix = allowedInternalPrefixes.some(
    (prefix) => trimmed === prefix || trimmed.startsWith(prefix === '/' ? '/' : `${prefix}/`) || trimmed.startsWith(`${prefix}?`),
  );
  return {
    allowed: matchesPrefix,
    normalizedPath: matchesPrefix ? trimmed : '/',
    reasonCode: matchesPrefix ? 'SAFE_INTERNAL_PATH' : 'EXTERNAL_REDIRECT_BLOCKED',
  };
}

export function sanitizeUntrustedClientContent(rawText: string): string {
  return String(rawText ?? '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/[<>]/g, (ch) => (ch === '<' ? '&lt;' : '&gt;'));
}

export function validateSafeFilePreview(input: {
  fileName: string;
  mimeType: string;
  byteSize: number;
  maxBytes?: number;
}): {
  readonly safeForInlinePreview: boolean;
  readonly reasonCode: 'SAFE_RASTER_IMAGE' | 'EXECUTABLE_OR_VECTOR_BLOCKED' | 'SIZE_LIMIT_EXCEEDED';
} {
  const maxBytes = input.maxBytes ?? 10 * 1024 * 1024;
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0 || input.byteSize > maxBytes) {
    return { safeForInlinePreview: false, reasonCode: 'SIZE_LIMIT_EXCEEDED' };
  }
  const lowerMime = input.mimeType.toLowerCase().trim();
  const lowerName = input.fileName.toLowerCase().trim();
  if (
    lowerMime.includes('svg') ||
    lowerMime.includes('html') ||
    lowerMime.includes('javascript') ||
    lowerName.endsWith('.svg') ||
    lowerName.endsWith('.html') ||
    lowerName.endsWith('.htm')
  ) {
    return { safeForInlinePreview: false, reasonCode: 'EXECUTABLE_OR_VECTOR_BLOCKED' };
  }
  if (!SAFE_IMAGE_MIME_TYPES.has(lowerMime)) {
    return { safeForInlinePreview: false, reasonCode: 'EXECUTABLE_OR_VECTOR_BLOCKED' };
  }
  return { safeForInlinePreview: true, reasonCode: 'SAFE_RASTER_IMAGE' };
}

export function redactSensitiveDiagnosticsPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    const normalizedKey = key.trim();
    if (
      SENSITIVE_DIAGNOSTIC_KEYS.has(normalizedKey) ||
      SENSITIVE_DIAGNOSTIC_KEYS.has(normalizedKey.toLowerCase())
    ) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'string' && /^Bearer\s+[A-Za-z0-9._-]+/i.test(value)) {
      redacted[key] = 'Bearer [REDACTED]';
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

export function purgePrivateClientStorageOnSessionChange(storageKeys: readonly string[]): {
  readonly purgedKeys: readonly string[];
  readonly retainedPublicKeys: readonly string[];
} {
  const PUBLIC_PREF_KEYS = new Set(['radar_theme_preference', 'radar_locale', 'radar_area_unit']);
  const purgedKeys: string[] = [];
  const retainedPublicKeys: string[] = [];
  for (const key of storageKeys) {
    if (PUBLIC_PREF_KEYS.has(key)) {
      retainedPublicKeys.push(key);
    } else {
      purgedKeys.push(key);
    }
  }
  return { purgedKeys, retainedPublicKeys };
}

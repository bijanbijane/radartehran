import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from './areaUnit'; import { validateSafeReturnPath, validateSafeExternalUrl } from './security'; export interface ContentTypeValidationResult { ok: boolean; statusCode: 200 | 400 | 406 | 415; normalizedContentType: string; reason?: string; }
export function validateApiContentTypeAndAccept(params: { method: string; path: string; contentTypeHeader: string | undefined; acceptHeader?: string | undefined; expectedMediaTypes?: readonly string[]; }): ContentTypeValidationResult { const method = String(params.method || 'GET').toUpperCase(); const acceptRaw = String(params.acceptHeader || '*/*').trim().toLowerCase();
  if ( acceptRaw && !acceptRaw.includes('*/*') && !acceptRaw.includes('application/*') &&
    !acceptRaw.includes('application/json') && !acceptRaw.includes('text/plain') && !acceptRaw.includes('application/octet-stream') && !acceptRaw.includes('image/') && !acceptRaw.includes('video/')
  ) { return { ok: false, statusCode: 406, normalizedContentType: '', reason: 'UNSUPPORTED_ACCEPT_HEADER' }; } if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || method === 'DELETE') { return { ok: true, statusCode: 200, normalizedContentType: '' }; }
  const rawCt = String(params.contentTypeHeader || '').trim(); if (!rawCt || /[\r\n\0]/.test(rawCt)) { return { ok: false, statusCode: 415, normalizedContentType: '', reason: 'MISSING_OR_MALFORMED_CONTENT_TYPE' }; } const parts = rawCt.split(';').map((p) => p.trim()).filter(Boolean); const mediaType = (parts[0] || '').toLowerCase(); if (!/^[a-z0-9!#$&-^_]+\/[a-z0-9!#$&-^_.+]+$/.test(mediaType)) { return { ok: false, statusCode: 400, normalizedContentType: '', reason: 'MALFORMED_MEDIA_TYPE' }; }
  for (let i = 1; i < parts.length; i++) { const param = parts[i].toLowerCase(); if (param.startsWith('charset=')) { const charset = param.slice('charset='.length).replace(/^"|"$/g, ''); if (charset !== 'utf-8' && charset !== 'utf8') { return { ok: false, statusCode: 415, normalizedContentType: mediaType, reason: 'UNSUPPORTED_CHARSET' }; } } }
  const allowed = params.expectedMediaTypes ?? ['application/json']; if (!allowed.includes(mediaType)) { return { ok: false, statusCode: 415, normalizedContentType: mediaType, reason: 'UNSUPPORTED_MEDIA_TYPE' }; } return { ok: true, statusCode: 200, normalizedContentType: mediaType }; }
export function canonicalizeAndValidateApiPath(rawUrlOrPath: string): { ok: boolean; canonicalPath: string; reason?: string; } { const raw = String(rawUrlOrPath || ''); const pathPart = raw.split('?')[0] || '/'; if ( /[\r\n\0\\]/.test(pathPart) || /%2f|%5c|%00|%2e%2e|%252e|%252f/i.test(pathPart) ||
    /\/\.\.(\/|$)/.test(pathPart) || /\/\.(\/|$)/.test(pathPart)
  ) { return { ok: false, canonicalPath: '', reason: 'AMBIGUOUS_OR_TRAVERSAL_PATH' }; } if (/^\/api(\/|$)/i.test(pathPart) && /\/\/+/.test(pathPart)) { return { ok: false, canonicalPath: '', reason: 'DUPLICATE_SLASH_IN_API_PATH' }; }
  let normalized = pathPart.replace(/\/+/g, '/'); if (normalized.length > 1 && normalized.endsWith('/')) { normalized = normalized.slice(0, -1); }
  if (/^\/api\//i.test(normalized)) {
    normalized = normalized.toLowerCase(); }
  return { ok: true, canonicalPath: normalized || '/' }; }
export function detectForbiddenMethodOverride( headers: Record<string, unknown>, query?: Record<string, unknown>, body?: Record<string, unknown>, ): { detected: boolean; reason?: string } {
  const forbidden = new Set(['x-http-method-override', 'x-method-override', 'x-http-method']);
  for (const [rawKey, val] of Object.entries(headers || {})) { const h = rawKey.toLowerCase(); if (forbidden.has(h) && val !== undefined && String(val).trim() !== '') {
      return { detected: true, reason: `FORBIDDEN_HEADER_${h.toUpperCase()}` };
    } }
  if (query && typeof query._method === 'string' && query._method.trim() !== '') { return { detected: true, reason: 'FORBIDDEN_QUERY_METHOD_OVERRIDE' }; }
  if (body && typeof body === 'object' && '_method' in body) { return { detected: true, reason: 'FORBIDDEN_BODY_METHOD_OVERRIDE' }; }
  return { detected: false }; }
export function sanitizeHttpResponseHeaderValue(value: string, maxLen = 512): { ok: boolean; sanitized: string; } { const raw = String(value ?? ''); if (/[\r\n\0\x00-\x1f\x7f]/.test(raw) || raw.length > maxLen) { return { ok: false, sanitized: '' }; }
  return { ok: true, sanitized: raw.trim() }; }
export function buildSafeContentDispositionHeader(params: { disposition: 'inline' | 'attachment'; filename?: string; fallbackExtension?: string;
}): string { const mode = params.disposition === 'inline' ? 'inline' : 'attachment'; const rawName = String(params.filename || '').trim();
  const ext = String(params.fallbackExtension || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin'; if (!rawName || /[\r\n\0\\/]/.test(rawName) || rawName.includes('..')) {
    return `${mode}; filename="media-asset.${ext}"`;
  }
  const baseSafe =
    rawName.replace(/[\x00-\x1f\x7f"\\/;=]/g, '_').replace(/^\.+/, '').slice(0, 120) ||
    `media-asset.${ext}`;
  const asciiFallback = baseSafe.replace(/[^\x20-\x7e]/g, '_') || `media-asset.${ext}`;
  const rfc5987Encoded = encodeURIComponent(baseSafe).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${mode}; filename="${asciiFallback}"; filename*=UTF-8''${rfc5987Encoded}`;
}
const PASSIVE_INLINE_MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
]);
export function resolveSafeMediaDeliveryPolicy(verifiedMimeType: string, filename?: string): {
  allowed: boolean;
  disposition: 'inline' | 'attachment';
  contentType: string;
  contentDisposition: string;
  nosniff: 'nosniff';
  contentSecurityPolicy: string;
} {
  const mime = String(verifiedMimeType || '').trim().toLowerCase();
  const isPassive = PASSIVE_INLINE_MEDIA_TYPES.has(mime);
  const disposition = isPassive ? 'inline' : 'attachment';
  const safeMime = isPassive ? mime : 'application/octet-stream';
  return {
    allowed: isPassive,
    disposition,
    contentType: safeMime,
    contentDisposition: buildSafeContentDispositionHeader({
      disposition,
      filename,
      fallbackExtension: isPassive ? mime.split('/')[1] : 'bin',
    }),
    nosniff: 'nosniff',
    contentSecurityPolicy: "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  };
}
const ALLOWED_S3_CUSTOM_METADATA_KEYS = new Set([
  'owner-uid',
  'media-category',
  'sha256-checksum',
  'upload-state',
  'environment-scope',
]);
export function validateAndSanitizeS3ObjectMetadata(
  rawMeta: Record<string, unknown>,
): { ok: boolean; sanitized: Record<string, string>; reason?: string } {
  const entries = Object.entries(rawMeta || {});
  if (entries.length > 8) return { ok: false, sanitized: {}, reason: 'TOO_MANY_METADATA_KEYS' };
  const sanitized = Object.create(null) as Record<string, string>;
  for (const [k, v] of entries) {
    const key = k.toLowerCase().replace(/^x-amz-meta-/, '');
    if (
      key.includes('website-redirect') ||
      key.includes('content-disposition') ||
      key.includes('content-type') ||
      !ALLOWED_S3_CUSTOM_METADATA_KEYS.has(key)
    ) {
      return { ok: false, sanitized: {}, reason: `FORBIDDEN_S3_METADATA_KEY_${key}` };
    }
    const valCheck = sanitizeHttpResponseHeaderValue(String(v ?? ''), 128);
    if (!valCheck.ok) return { ok: false, sanitized: {}, reason: 'INVALID_S3_METADATA_VALUE' };
    sanitized[key] = valCheck.sanitized;
  }
  return { ok: true, sanitized };
}
const ALLOWED_UPDATE_FIELDS_BY_COLLECTION: Record<string, ReadonlySet<string>> = {
  bargains: new Set([
    'title', 'description', 'buyPrice', 'rahnPrice', 'area', 'age', 'floor',
    'totalFloors', 'hasParking', 'hasElevator', 'hasStorage', 'address',
    'contactPhone', 'imageUrls', 'videoUrl', 'updatedAt',
  ]),
  users: new Set(['displayName', 'phone', 'cityPreference', 'updatedAt']),
  neighborhoodOverrides: new Set(['buyPerSqm', 'rahn80m', 'changePercent', 'updatedAt', 'updatedBy', 'sponsor']),
};
export function validateFirestoreUpdatePayloadPaths(
  collectionName: string,
  payload: Record<string, unknown>,
  isAdminActor = false,
): { ok: boolean; reason?: string } {
  const allowed = ALLOWED_UPDATE_FIELDS_BY_COLLECTION[collectionName];
  if (!allowed) return { ok: false, reason: 'UNKNOWN_COLLECTION_FOR_UPDATE' };
  for (const key of Object.keys(payload || {})) {
    if (key.includes('.') || key.includes('/') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return { ok: false, reason: `FORBIDDEN_DOTTED_OR_PROTOTYPE_FIELD_PATH_${key}` };
    }
    if (!isAdminActor && !allowed.has(key)) {
      return { ok: false, reason: `UNAUTHORIZED_UPDATE_FIELD_${key}` };
    }
  }
  return { ok: true };
}
export function validateFirestoreAtomicTransformInvariant(params: {
  field: string;
  operation: 'increment' | 'arrayUnion' | 'arrayRemove' | 'serverTimestamp' | 'delete';
  deltaOrValue?: number | unknown[];
  currentNumericValue?: number;
  isAdminActor?: boolean;
}): { ok: boolean; reason?: string } {
  if (params.operation === 'delete' && !params.isAdminActor) {
    return { ok: false, reason: 'CLIENT_FIELD_DELETE_FORBIDDEN' };
  }
  if (params.operation === 'increment') {
    const delta = Number(params.deltaOrValue);
    if (!Number.isFinite(delta) || Math.abs(delta) > 1) {
      return { ok: false, reason: 'INVALID_COUNTER_INCREMENT_DELTA' };
    }
    const nextVal = (params.currentNumericValue ?? 0) + delta;
    if (nextVal < 0 || nextVal > 1_000_000) return { ok: false, reason: 'COUNTER_OUT_OF_RANGE' };
  }
  if (
    (params.operation === 'arrayUnion' || params.operation === 'arrayRemove') &&
    (params.field === 'roles' || params.field === 'userId' || params.field === 'ownerUid')
  ) {
    return { ok: false, reason: 'PROTECTED_OWNERSHIP_OR_ROLE_ARRAY_TRANSFORM' };
  }
  return { ok: true };
}
export function validateFirestoreDocumentComplexity(
  doc: unknown,
  limits = {
    maxSerializedBytes: 64 * 1024,
    maxDepth: 5,
    maxFieldsPerObject: 50,
    maxArrayLength: 50,
    maxStringLength: 5000,
  },
): { ok: boolean; reason?: string } {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, reason: 'DOCUMENT_MUST_BE_OBJECT' };
  }
  const seen = new WeakSet<object>();
  const walk = (node: unknown, depth: number): string | null => {
    if (depth > limits.maxDepth) return 'MAX_NESTING_DEPTH_EXCEEDED';
    if (typeof node === 'number' && !Number.isFinite(node)) return 'NON_FINITE_NUMBER_IN_DOCUMENT';
    if (typeof node === 'string') return node.length > limits.maxStringLength ? 'STRING_FIELD_TOO_LONG' : null;
    if (Array.isArray(node)) {
      if (seen.has(node)) return 'CIRCULAR_OR_UNSERIALIZABLE_DOCUMENT';
      seen.add(node);
      if (node.length > limits.maxArrayLength) return 'ARRAY_LENGTH_EXCEEDED';
      for (const item of node) {
        const err = walk(item, depth + 1);
        if (err) return err;
      }
      return null;
    }
    if (node && typeof node === 'object') {
      if (seen.has(node)) return 'CIRCULAR_OR_UNSERIALIZABLE_DOCUMENT';
      seen.add(node);
      const keys = Object.keys(node as Record<string, unknown>);
      if (keys.length > limits.maxFieldsPerObject) return 'OBJECT_FIELD_COUNT_EXCEEDED';
      for (const k of keys) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') return 'PROTOTYPE_POLLUTION_KEY';
        const err = walk((node as Record<string, unknown>)[k], depth + 1);
        if (err) return err;
      }
    }
    return null;
  };
  const violation = walk(doc, 0);
  if (violation) return { ok: false, reason: violation };
  try {
    if (Buffer.byteLength(JSON.stringify(doc), 'utf8') > limits.maxSerializedBytes) {
      return { ok: false, reason: 'DOCUMENT_PAYLOAD_TOO_LARGE' };
    }
  } catch {
    return { ok: false, reason: 'CIRCULAR_OR_UNSERIALIZABLE_DOCUMENT' };
  }
  return { ok: true };
}
export function validateFirestoreBatchOperationScope(params: {
  operations: ReadonlyArray<{ collection: string; docId: string; ownerUid?: string }>;
  actorUid: string;
  isAdmin: boolean;
  maxBatchSize?: number;
}): { ok: boolean; reason?: string } {
  const maxBatch = params.maxBatchSize ?? 100;
  if (params.operations.length === 0 || params.operations.length > maxBatch) {
    return { ok: false, reason: 'BATCH_SIZE_OUT_OF_BOUNDS' };
  }
  for (const op of params.operations) {
    if (!params.isAdmin && op.ownerUid && op.ownerUid !== params.actorUid) {
      return { ok: false, reason: 'CROSS_OWNER_BATCH_WRITE_FORBIDDEN' };
    }
    if (op.collection === 'admins' && !params.isAdmin) {
      return { ok: false, reason: 'PROTECTED_COLLECTION_IN_BATCH' };
    }
  }
  return { ok: true };
}
export function projectFirestoreDocumentByRole(
  collection: 'bargains' | 'sponsors' | 'users',
  rawDoc: Record<string, unknown>,
  viewerRole: 'public' | 'owner' | 'admin',
): Record<string, unknown> {
  const publicFields: Record<'bargains' | 'sponsors' | 'users', readonly string[]> = {
    bargains: ['id', 'hoodId', 'hoodName', 'city', 'title', 'description', 'buyPrice', 'rahnPrice', 'area', 'age', 'floor', 'totalFloors', 'hasParking', 'hasElevator', 'hasStorage', 'imageUrls', 'videoUrl', 'status', 'trustScore', 'createdAt'],
    sponsors: ['hoodId', 'name', 'title', 'phone', 'url', 'logoUrl', 'expiresAt', 'status'],
    users: ['uid', 'displayName'],
  };
  const ownerExtraFields: Record<'bargains' | 'sponsors' | 'users', readonly string[]> = {
    bargains: ['userId', 'address', 'contactPhone', 'moderationNote'],
    sponsors: ['userId', 'amountPaidToman', 'invoiceId'],
    users: ['email', 'phone', 'cityPreference'],
  };
  const adminExtraFields: Record<'bargains' | 'sponsors' | 'users', readonly string[]> = {
    bargains: ['userId', 'userEmail', 'address', 'contactPhone', 'fraudReasons', 'approvedBy'],
    sponsors: ['userId', 'userEmail', 'amountPaidToman', 'invoiceId', 'approvedBy'],
    users: ['email', 'phone', 'cityPreference', 'disabled', 'createdAt'],
  };
  const allowed = new Set<string>(publicFields[collection] || []);
  if (viewerRole === 'owner' || viewerRole === 'admin') {
    for (const f of ownerExtraFields[collection] || []) allowed.add(f);
  }
  if (viewerRole === 'admin') {
    for (const f of adminExtraFields[collection] || []) allowed.add(f);
  }
  const projected = Object.create(null) as Record<string, unknown>;
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(rawDoc, key) && rawDoc[key] !== undefined) {
      projected[key] = rawDoc[key];
    }
  }
  return projected;
}
export function resolveRouteRobotsAndIndexingPolicy(pathname: string): {
  indexable: boolean;
  robotsMeta: string;
  xRobotsTag: string;
} {
  const p = String(pathname || '/').toLowerCase();
  const isPrivateOrAdmin =
    p.startsWith('/api') || p.startsWith('/admin') || p.startsWith('/crm') ||
    p.startsWith('/backup') || p.startsWith('/profile') || p.startsWith('/login');
  const directive = isPrivateOrAdmin
    ? 'noindex, nofollow, noarchive'
    : 'index, follow, max-snippet:-1, max-image-preview:large';
  return { indexable: !isPrivateOrAdmin, robotsMeta: directive, xRobotsTag: directive };
}
export function buildPrivacySafePublicListingJsonLd(params: {
  id: string; title: string; description: string; hoodName: string; city: string;
  buyPrice: number; status: string; canonicalBaseUrl: string;
}): { eligible: boolean; jsonLdString: string; displayAreaUnitLabel?: string; buyPriceIntlText?: string } {
  if (params.status !== 'approved') return { eligible: false, jsonLdString: '' };
  const safePayload = {
    '@context': 'https://schema.org', '@type': 'RealEstateListing',
    identifier: String(params.id || '').slice(0, 64),
    name: String(params.title || '').slice(0, 120),
    description: String(params.description || '').replace(/09\d{9}|\+98\d{10}|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[REDACTED]').slice(0, 280),
    url: `${params.canonicalBaseUrl.replace(/\/$/, '')}/?listing=${encodeURIComponent(params.id)}`,
    address: { '@type': 'PostalAddress', addressLocality: String(params.hoodName || '').slice(0, 64), addressRegion: String(params.city || 'تهران').slice(0, 64), addressCountry: 'IR' },
    offers: { '@type': 'Offer', price: Number(params.buyPrice) || 0, priceCurrency: 'IRR' },
  };
  return { eligible: true, jsonLdString: JSON.stringify(safePayload).replace(/</g, '\\u003c').replace(/>/g, '\\u003e'), displayAreaUnitLabel: formatAreaUnitLabel(getStoredAreaUnit()), buyPriceIntlText: formatMillionTomanAsIntlCurrency(Number(params.buyPrice) || 0, getStoredIntlCurrency()) };
} export function validateSafeClipboardWriteRequest(params: { text: string; category: 'public_share_url' | 'neighborhood_summary' | 'forbidden_secret'; hasExplicitUserGesture: boolean; canonicalOrigin: string; }): { allowed: boolean; sanitizedText: string; reason?: string } { if (!params.hasExplicitUserGesture) return { allowed: false, sanitizedText: '', reason: 'USER_GESTURE_REQUIRED' }; if (params.category === 'forbidden_secret') return { allowed: false, sanitizedText: '', reason: 'CREDENTIAL_CLIPBOARD_FORBIDDEN' }; const raw = String(params.text || '').trim(); if (/AIza[0-9A-Za-z_-]{30,}|Bearer\s+[A-Za-z0-9._-]+|PRIVATE KEY/i.test(raw)) { return { allowed: false, sanitizedText: '', reason: 'SECRET_PATTERN_IN_CLIPBOARD' }; } if (params.category === 'public_share_url') { try { const parsed = new URL(raw); const canonical = new URL(params.canonicalOrigin); if (parsed.origin !== canonical.origin) return { allowed: false, sanitizedText: '', reason: 'UNTRUSTED_SHARE_ORIGIN' }; } catch { return { allowed: false, sanitizedText: '', reason: 'UNTRUSTED_SHARE_ORIGIN' }; } } return { allowed: true, sanitizedText: raw.slice(0, 500) }; } export { validateSafeReturnPath, validateSafeExternalUrl };
import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path'; import { normalizePersianSearchText, validateCityParam } from './security'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export interface CycloneDxComponent { type: 'library'; name: string; version: string; scope: 'required' | 'optional' | 'excluded'; purl: string; }
export interface SupplyChainAuditReport { bomFormat: 'CycloneDX'; specVersion: '1.5'; lockfilePresent: boolean; unpinnedOrFloatingDeps: string[]; gitOrUrlDeps: string[]; suspiciousInstallScripts: string[]; components: CycloneDxComponent[]; }
export function generateRepositorySbomAndSupplyChainAudit(repoRoot = process.cwd()): SupplyChainAuditReport { const pkgPath = path.join(repoRoot, 'package.json'); const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
    scripts?: Record<string, string>; }; const lockfilePresent = fs.existsSync(path.join(repoRoot, 'package-lock.json')) ||
    fs.existsSync(path.join(repoRoot, 'bun.lock')); const unpinnedOrFloatingDeps: string[] = []; const gitOrUrlDeps: string[] = []; const components: CycloneDxComponent[] = []; const inspectMap = (map: Record<string, string> | undefined, scope: 'required' | 'optional') => { for (const [name, ver] of Object.entries(map ?? {})) {
      if (ver === '*' || ver === 'latest') unpinnedOrFloatingDeps.push(`${name}@${ver}`);
      if (/^(git\+|https?:\/\/|github:)/i.test(ver)) gitOrUrlDeps.push(`${name}@${ver}`);
      const cleanVer = ver.replace(/^[\^~]/, ''); components.push({ type: 'library', name, version: cleanVer, scope,
        purl: `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(cleanVer)}`,
      }); }
  }; inspectMap(pkg.dependencies, 'required'); inspectMap(pkg.devDependencies, 'optional'); const suspiciousInstallScripts: string[] = []; for (const hook of ['preinstall', 'install', 'postinstall']) { if (pkg.scripts?.[hook]) {
      suspiciousInstallScripts.push(`${hook}: ${pkg.scripts[hook]}`);
    } }
  return { bomFormat: 'CycloneDX', specVersion: '1.5', lockfilePresent, unpinnedOrFloatingDeps, gitOrUrlDeps,
    suspiciousInstallScripts, components,
  }; }
export class InboundWebhookAuthenticator {
  private readonly primarySecret: string;
  private readonly secondaryRotationSecret?: string;
  private readonly maxTimestampSkewSec: number;
  private readonly processedEvents = new Set<string>();
  constructor(options: {
    primarySecret: string;
    secondaryRotationSecret?: string;
    maxTimestampSkewSec?: number;
  }) {
    this.primarySecret = options.primarySecret;
    this.secondaryRotationSecret = options.secondaryRotationSecret;
    this.maxTimestampSkewSec = options.maxTimestampSkewSec ?? 300;
  }
  computeSignatureHex(rawBodyBuffer: Buffer, timestampSec: number, secret = this.primarySecret): string {
    return crypto
      .createHmac('sha256', secret)
      .update(`${timestampSec}.`)
      .update(rawBodyBuffer)
      .digest('hex');
  }
  private timingSafeHexMatch(candidateHex: string, expectedHex: string): boolean {
    if (candidateHex.length !== expectedHex.length || candidateHex.length % 2 !== 0) return false;
    try {
      const a = Buffer.from(candidateHex, 'hex');
      const b = Buffer.from(expectedHex, 'hex');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
  verifyAndRegisterWebhookEvent(params: {
    providerId: string;
    eventId: string;
    timestampSec: number;
    signatureHeaderHex: string;
    rawBodyBuffer: Buffer;
    nowSec?: number;
  }): {
    accepted: boolean;
    statusCode: 200 | 400 | 401 | 409 | 413;
    reason:
      | 'WEBHOOK_VERIFIED_AND_ACCEPTED'
      | 'PAYLOAD_TOO_LARGE'
      | 'TIMESTAMP_OUTSIDE_REPLAY_WINDOW'
      | 'INVALID_HMAC_SIGNATURE'
      | 'DUPLICATE_EVENT_REPLAY_BLOCKED';
  } {
    if (params.rawBodyBuffer.byteLength > 256 * 1024) {
      return { accepted: false, statusCode: 413, reason: 'PAYLOAD_TOO_LARGE' };
    }
    const nowSec = params.nowSec ?? Math.floor(Date.now() / 1000);
    if (!Number.isFinite(params.timestampSec) || !Number.isFinite(nowSec) || Math.abs(nowSec - params.timestampSec) > this.maxTimestampSkewSec) {
      return { accepted: false, statusCode: 401, reason: 'TIMESTAMP_OUTSIDE_REPLAY_WINDOW' };
    }
    const expectedPrimary = this.computeSignatureHex(params.rawBodyBuffer, params.timestampSec, this.primarySecret);
    let sigValid = this.timingSafeHexMatch(params.signatureHeaderHex, expectedPrimary);
    if (!sigValid && this.secondaryRotationSecret) {
      const expectedSecondary = this.computeSignatureHex(
        params.rawBodyBuffer,
        params.timestampSec,
        this.secondaryRotationSecret,
      );
      sigValid = this.timingSafeHexMatch(params.signatureHeaderHex, expectedSecondary);
    }
    if (!sigValid) {
      return { accepted: false, statusCode: 401, reason: 'INVALID_HMAC_SIGNATURE' };
    }
    const dedupKey = `${params.providerId}:${params.eventId}`;
    if (this.processedEvents.has(dedupKey)) {
      return { accepted: false, statusCode: 409, reason: 'DUPLICATE_EVENT_REPLAY_BLOCKED' };
    }
    if (this.processedEvents.size >= 5000) {
      const oldest = this.processedEvents.keys().next().value;
      if (oldest !== undefined) this.processedEvents.delete(oldest);
    }
    this.processedEvents.add(dedupKey);
    return { accepted: true, statusCode: 200, reason: 'WEBHOOK_VERIFIED_AND_ACCEPTED' };
  }
}
export interface ImageSanitizationResult {
  safe: boolean;
  detectedFormat: 'JPEG' | 'PNG' | 'WEBP' | 'REJECTED_ACTIVE_OR_UNKNOWN';
  exifMetadataStripped: boolean;
  sanitizedBuffer: Buffer;
  reason: string;
}
export function inspectAndSanitizeImageUploadBuffer(
  rawBuffer: Buffer,
  declaredDimensions?: { width: number; height: number },
  maxPixels = 25_000_000,
): ImageSanitizationResult {
  if (declaredDimensions) {
    const totalPixels = declaredDimensions.width * declaredDimensions.height;
    if (
      !Number.isFinite(declaredDimensions.width) ||
      !Number.isFinite(declaredDimensions.height) ||
      declaredDimensions.width <= 0 ||
      declaredDimensions.height <= 0 ||
      declaredDimensions.width > 12_000 ||
      declaredDimensions.height > 12_000 ||
      totalPixels > maxPixels
    ) {
      return {
        safe: false,
        detectedFormat: 'REJECTED_ACTIVE_OR_UNKNOWN',
        exifMetadataStripped: false,
        sanitizedBuffer: Buffer.alloc(0),
        reason: 'PIXEL_BOMB_DIMENSION_LIMIT_EXCEEDED',
      };
    }
  }
  const headAscii = rawBuffer.subarray(0, Math.min(rawBuffer.length, 2048)).toString('latin1');
  const tailAscii = rawBuffer.length > 2048 ? rawBuffer.subarray(rawBuffer.length - 2048).toString('latin1') : '';
  const combinedScan = `${headAscii}\n${tailAscii}`.toLowerCase();
  if (combinedScan.includes('<svg') || combinedScan.includes('<html') || combinedScan.includes('<script') || combinedScan.includes('<?php') || combinedScan.includes('javascript:')) {
    return {
      safe: false,
      detectedFormat: 'REJECTED_ACTIVE_OR_UNKNOWN',
      exifMetadataStripped: false,
      sanitizedBuffer: Buffer.alloc(0),
      reason: 'ACTIVE_SVG_OR_HTML_CONTENT_FORBIDDEN',
    };
  }
  if (rawBuffer.length >= 4 && rawBuffer[0] === 0xff && rawBuffer[1] === 0xd8) {
    const chunks: Buffer[] = [Buffer.from([0xff, 0xd8])];
    let offset = 2;
    let stripped = false;
    while (offset + 4 <= rawBuffer.length && rawBuffer[offset] === 0xff) {
      const marker = rawBuffer[offset + 1];
      if (marker === 0xda || marker === 0xd9) {
        chunks.push(rawBuffer.subarray(offset));
        break;
      }
      const segLength = rawBuffer.readUInt16BE(offset + 2);
      if (segLength < 2 || offset + 2 + segLength > rawBuffer.length) break;
      if (marker === 0xe1 || marker === 0xfe) {
        stripped = true;
      } else {
        chunks.push(rawBuffer.subarray(offset, offset + 2 + segLength));
      }
      offset += 2 + segLength;
    }
    return {
      safe: true,
      detectedFormat: 'JPEG',
      exifMetadataStripped: stripped,
      sanitizedBuffer: Buffer.concat(chunks),
      reason: 'VALID_JPEG_SANITIZED',
    };
  }
  if (
    rawBuffer.length >= 8 &&
    rawBuffer[0] === 0x89 &&
    rawBuffer[1] === 0x50 &&
    rawBuffer[2] === 0x4e &&
    rawBuffer[3] === 0x47
  ) {
    return {
      safe: true,
      detectedFormat: 'PNG',
      exifMetadataStripped: false,
      sanitizedBuffer: Buffer.from(rawBuffer),
      reason: 'VALID_PNG',
    };
  }
  if (
    rawBuffer.length >= 12 &&
    rawBuffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    rawBuffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return {
      safe: true,
      detectedFormat: 'WEBP',
      exifMetadataStripped: false,
      sanitizedBuffer: Buffer.from(rawBuffer),
      reason: 'VALID_WEBP',
    };
  }
  return {
    safe: false,
    detectedFormat: 'REJECTED_ACTIVE_OR_UNKNOWN',
    exifMetadataStripped: false,
    sanitizedBuffer: Buffer.alloc(0),
    reason: 'UNSUPPORTED_OR_CORRUPTED_IMAGE_SIGNATURE',
  };
}
const TEHRAN_FINGLISH_SYNONYM_MAP: Record<string, string> = {
  vanak: 'ونک',
  'saadat abad': 'سعادت اباد',
  saadatabad: 'سعادت اباد',
  pasdaran: 'پاسداران', ekbatan: 'اکباتان', punak: 'پونک', poonak: 'پونک', tajrish: 'تجریش', niavaran: 'نیاوران',
  zaferanieh: 'زعفرانیه', velenjak: 'ولنجک', shahrak: 'شهرک غرب', narmak: 'نارمک', tehranpars: 'تهرانپارس', yousefabad: 'یوسف اباد', gisha: 'گیشا',
};
export interface PersianSearchScoredResult<T extends { id: number; name: string; zone?: string }> {
  item: T; relevanceScore: number; matchType: 'EXACT_NAME' | 'PREFIX_NAME' | 'COMPACT_OR_SYNONYM' | 'MULTI_TOKEN' | 'ZONE_MATCH';
}
export function evaluatePersianNeighborhoodSearchRelevance<T extends { id: number; name: string; zone?: string }>(
  candidates: T[],
  rawQuery: string,
): PersianSearchScoredResult<T>[] {
  const normQ = normalizePersianSearchText(rawQuery);
  if (!normQ) {
    return candidates.map((item) => ({ item, relevanceScore: 100, matchType: 'EXACT_NAME' }));
  }
  const mappedQuery = TEHRAN_FINGLISH_SYNONYM_MAP[normQ] ?? normQ;
  const compactQ = mappedQuery.replace(/\s+/g, '');
  const tokens = mappedQuery.split(' ').filter(Boolean);
  const results: PersianSearchScoredResult<T>[] = [];
  const seenIds = new Set<number>();
  for (const item of candidates) {
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    const normName = normalizePersianSearchText(item.name);
    const compactName = normName.replace(/\s+/g, '');
    const normZone = normalizePersianSearchText(item.zone ?? '');
    if (normName === mappedQuery) {
      results.push({ item, relevanceScore: 100, matchType: 'EXACT_NAME' });
    } else if (compactName === compactQ) {
      results.push({ item, relevanceScore: 95, matchType: 'COMPACT_OR_SYNONYM' });
    } else if (normName.startsWith(mappedQuery) || compactName.startsWith(compactQ)) {
      results.push({ item, relevanceScore: 85, matchType: 'PREFIX_NAME' });
    } else if (tokens.length > 1 && tokens.every((tk) => normName.includes(tk) || normZone.includes(tk))) {
      results.push({ item, relevanceScore: 75, matchType: 'MULTI_TOKEN' });
    } else if (normName.includes(mappedQuery) || compactName.includes(compactQ)) {
      results.push({ item, relevanceScore: 65, matchType: 'COMPACT_OR_SYNONYM' });
    } else if (normZone.includes(mappedQuery)) {
      results.push({ item, relevanceScore: 50, matchType: 'ZONE_MATCH' });
    }
  }
  return results.sort((a, b) => b.relevanceScore - a.relevanceScore || a.item.id - b.item.id);
}
export function validateAndSanitizeDeepLinkUrl(
  rawUrlOrSearch: string,
  options?: { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; referenceValuationMillionToman?: number }
): {
  isSpaRoute: boolean; isApiOrStaticAssetPath: boolean; canonicalShareSearch: string; strippedSensitiveParams: string[];
  parsedState: { city: string; mode: 'rent' | 'buy'; hoodId: number; comparePair: [number, number] | null };
  displayAreaUnitLabel: string; referenceValuationIntlText: string;
} {
  const u = new URL(rawUrlOrSearch, 'https://tehran-radar.local');
  const isApiOrStaticAssetPath = u.pathname.startsWith('/api/') || /\.(js|css|png|jpg|webp|svg|ico|json|woff2)$/i.test(u.pathname);
  const strippedSensitiveParams: string[] = [];
  for (const key of [...u.searchParams.keys()]) {
    if (/token|secret|password|auth|key|session/i.test(key)) { strippedSensitiveParams.push(key); u.searchParams.delete(key); }
  }
  const city = validateCityParam(u.searchParams.get('city'), 'tehran');
  const mode: 'rent' | 'buy' = u.searchParams.get('mode') === 'buy' ? 'buy' : 'rent';
  const rawHood = Number(u.searchParams.get('hood'));
  const hoodId = Number.isInteger(rawHood) && rawHood >= 1 && rawHood <= 999 ? rawHood : 5;
  let comparePair: [number, number] | null = null;
  const rawCompare = u.searchParams.get('compare');
  if (rawCompare && rawCompare.includes('-')) {
    const [a, b] = rawCompare.split('-').map((p) => Number(p.trim()));
    if (Number.isInteger(a) && Number.isInteger(b) && a >= 1 && a <= 999 && b >= 1 && b <= 999 && a !== b) {
      comparePair = [a, b];
    } } const cleanParams = new URLSearchParams(); cleanParams.set('city', city); cleanParams.set('mode', mode); cleanParams.set('hood', String(comparePair ? comparePair[0] : hoodId));
  if (comparePair) cleanParams.set('compare', `${comparePair[0]}-${comparePair[1]}`);
  return {
    isSpaRoute: !isApiOrStaticAssetPath, isApiOrStaticAssetPath, canonicalShareSearch: `?${cleanParams.toString()}`, strippedSensitiveParams,
    parsedState: { city, mode, hoodId: comparePair ? comparePair[0] : hoodId, comparePair },
    displayAreaUnitLabel: formatAreaUnitLabel(options?.areaUnit ?? 'sqm'),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(options?.referenceValuationMillionToman ?? 0, options?.intlCurrency ?? 'IRT'),
  }; }
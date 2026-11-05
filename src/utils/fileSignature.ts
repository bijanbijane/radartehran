/**
 * @file src/utils/fileSignature.ts
 * @description File magic bytes, SVG rejection, and video container structural inspection
 * for uploaded media (jpg, webp, png, mp4, mov, webm).
 */
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export interface DetectedMediaSignature { mediaType: 'image' | 'video'; supportedMimeTypes: readonly string[]; allowedExtensions: readonly string[]; }
const JPEG_SOF_OR_APP_MARKERS = new Set<number>([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xcb, 0xcc, 0xcd, 0xce, 0xcf, 0xdb, 0xdd, 0xe0, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xec, 0xed, 0xee, 0xef, 0xfe, ]); const VALID_ISO_BMFF_BOXES = new Set<string>([
  'ftyp', 'moov', 'mdat', 'wide', 'free', 'skip',
  'uuid', 'meta', 'udta', 'moof',
  'mfra', ]); const SAFE_MIME_BY_EXTENSION: Record<string, string> = { '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.mp4': 'video/mp4',
  '.mov': 'video/quicktime', '.webm': 'video/webm',
};
/**
 * Task 428 & 531: Detect SVG / XML / active markup payloads even if disguised with image extensions.
 */
export function isSvgOrXmlPayload(buf: Buffer, mimeType?: string, extension?: string): boolean {
  const cleanMime = (mimeType || '').trim().toLowerCase();
  const cleanExt = (extension || '').trim().toLowerCase();
  if (cleanMime.includes('svg') || cleanMime.includes('xml') || cleanExt === '.svg' || cleanExt === 'svg') {
    return true;
  }
  if (!Buffer.isBuffer(buf) || buf.length < 4) return false;
  const head = buf.subarray(0, Math.min(buf.length, 1024)).toString('utf8').replace(/\u0000/g, '').trimStart().toLowerCase();
  return (
    /<\s*(?:svg\b|!doctype\s+svg\b|\?xml\b|html\b|script\b)/i.test(head) ||
    head.includes('http://www.w3.org/2000/svg')
  );
}
export function hasPolyglotScriptBytes(buf: Buffer): boolean {
  if (!Buffer.isBuffer(buf) || buf.length < 8) return false;
  const headText = buf.subarray(0, Math.min(buf.length, 4096)).toString('latin1').toLowerCase();
  const tailText = buf.length > 4096 ? buf.subarray(Math.max(0, buf.length - 4096)).toString('latin1').toLowerCase() : '';
  const combined = `${headText} ${tailText}`;
  return combined.includes('<script') || combined.includes('javascript:') || combined.includes('<!doctype html');
}
/**
 * Task 497 & 532: Structural inspection of MP4/MOV/WebM containers to reject malformed boxes,
 * external URL reference atoms, and polyglot script payloads.
 */
export function validateVideoContainerSafety(
  buf: Buffer,
  mimeType = 'video/mp4',
): { safe: boolean; valid: boolean; reason?: string; code?: string } {
  const fail = (reason: string) => ({ safe: false, valid: false, reason, code: reason });
  if (!Buffer.isBuffer(buf) || buf.length < 12) return fail('VIDEO_BUFFER_TOO_SMALL');
  const headText = buf.subarray(0, Math.min(buf.length, 4096)).toString('latin1').toLowerCase();
  const tailText = buf.length > 4096 ? buf.subarray(Math.max(0, buf.length - 4096)).toString('latin1').toLowerCase() : '';
  const combinedScan = `${headText} ${tailText}`;
  if (hasPolyglotScriptBytes(buf)) {
    return fail('VIDEO_POLYGLOT_SCRIPT_DETECTED');
  }
  const cleanMime = (mimeType || '').trim().toLowerCase();
  if (cleanMime === 'video/webm') {
    if (buf[0] !== 0x1a || buf[1] !== 0x45 || buf[2] !== 0xdf || buf[3] !== 0xa3) {
      return fail('INVALID_WEBM_EBML_HEADER');
    }
    return { safe: true, valid: true };
  }
  let offset = 0;
  let boxCount = 0;
  let sawValidMediaBox = false;
  while (offset < buf.length) {
    if (offset + 8 > buf.length) return fail('TRUNCATED_ISO_BMFF_BOX_HEADER');
    const size32 = buf.readUInt32BE(offset);
    const boxType = buf.subarray(offset + 4, offset + 8).toString('ascii');
    if (!/^[\x20-\x7E]{4}$/.test(boxType)) return fail('INVALID_ISO_BMFF_BOX_TYPE');
    if (boxCount === 0 && !VALID_ISO_BMFF_BOXES.has(boxType)) return fail('INVALID_FIRST_ISO_BMFF_BOX');
    if (boxType === 'ftyp' || boxType === 'moov' || boxType === 'mdat') sawValidMediaBox = true;
    let boxSize = size32;
    if (size32 === 1) {
      if (offset + 16 > buf.length) return fail('TRUNCATED_EXTENDED_BOX_SIZE');
      const bigSize = Number(buf.readBigUInt64BE(offset + 8));
      if (!Number.isSafeInteger(bigSize) || bigSize < 16) return fail('INVALID_EXTENDED_BOX_SIZE');
      boxSize = bigSize;
    } else if (size32 === 0) {
      boxSize = buf.length - offset;
    } else if (size32 < 8) {
      return fail('INVALID_ISO_BMFF_BOX_SIZE');
    }
    if (offset + boxSize > buf.length) return fail('ISO_BMFF_BOX_OVERFLOWS_BUFFER');
    offset += boxSize;
    boxCount += 1;
    if (boxCount > 4096) return fail('EXCESSIVE_ISO_BMFF_BOX_COUNT');
  }
  if (!sawValidMediaBox) return fail('MISSING_MEDIA_BOXES');
  if (combinedScan.includes('dref') && (combinedScan.includes('http://') || combinedScan.includes('https://') || combinedScan.includes('file://'))) {
    return fail('EXTERNAL_VIDEO_DATA_REFERENCE_FORBIDDEN');
  }
  return { safe: true, valid: true };
}
export function detectMediaFormatByMagicBytes(buf: Buffer): DetectedMediaSignature | null {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (isSvgOrXmlPayload(buf)) return null;
  // 1. JPEG: FF D8 FF + valid marker byte
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff && JPEG_SOF_OR_APP_MARKERS.has(buf[3])) {
    return {
      mediaType: 'image',
      supportedMimeTypes: ['image/jpeg'],
      allowedExtensions: ['.jpg', '.jpeg'],
    };
  }
  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return { mediaType: 'image', supportedMimeTypes: ['image/png'], allowedExtensions: ['.png'] };
  }
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    if (buf.length >= 16) {
      const vp8Chunk = buf.subarray(12, 16).toString('ascii');
      if (vp8Chunk !== 'VP8 ' && vp8Chunk !== 'VP8L' && vp8Chunk !== 'VP8X') return null;
    }
    return { mediaType: 'image', supportedMimeTypes: ['image/webp'], allowedExtensions: ['.webp'] };
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { mediaType: 'video', supportedMimeTypes: ['video/webm'], allowedExtensions: ['.webm'] };
  }
  const boxType = buf.subarray(4, 8).toString('ascii');
  if (VALID_ISO_BMFF_BOXES.has(boxType)) {
    const boxSize = buf.readUInt32BE(0);
    if (boxSize !== 0 && boxSize !== 1 && boxSize < 8) {
      return null;
    }
    if (boxType === 'ftyp') {
      const majorBrand = buf.subarray(8, 12).toString('ascii');
      if (majorBrand === 'qt  ') {
        return {
          mediaType: 'video',
          supportedMimeTypes: ['video/quicktime', 'video/mp4'],
          allowedExtensions: ['.mov', '.mp4'],
        };
      }
    }
    return {
      mediaType: 'video',
      supportedMimeTypes: ['video/mp4', 'video/quicktime'],
      allowedExtensions: ['.mp4', '.mov'],
    };
  }
  return null;
}
export interface MagicByteValidationResult {
  valid: boolean; reason?: string; code?: string; detectedMediaType?: 'image' | 'video';
  detectedFormat?: string; canonicalExtension?: string; canonicalMimeType?: string; allowedExtensions?: readonly string[];
  displayAreaUnitLabel?: string; referenceValuationIntlText?: string;
}
export function validateMediaMagicBytesAndExtension(
  paramsOrBuffer:
    | { buffer: Buffer; mimeType: string; extension?: string; mediaType?: 'image' | 'video'; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; referenceValuationMillionToman?: number }
    | Buffer,
  mediaTypeArg?: 'image' | 'video',
  mimeTypeArg?: string,
  extensionArg?: string,
): MagicByteValidationResult {
  const params = Buffer.isBuffer(paramsOrBuffer)
    ? { buffer: paramsOrBuffer, mediaType: mediaTypeArg, mimeType: mimeTypeArg || '', extension: extensionArg, areaUnit: undefined, intlCurrency: undefined, referenceValuationMillionToman: undefined }
    : paramsOrBuffer;
  const displayAreaUnitLabel = formatAreaUnitLabel(params.areaUnit ?? 'sqm');
  const referenceValuationIntlText = formatMillionTomanAsIntlCurrency(params.referenceValuationMillionToman ?? 0, params.intlCurrency ?? 'IRT');
  const normalizedMime = (params.mimeType || '').trim().toLowerCase();
  if (isSvgOrXmlPayload(params.buffer, normalizedMime, params.extension)) {
    return { valid: false, reason: 'SVG_UPLOAD_FORBIDDEN', code: 'SVG_UPLOAD_FORBIDDEN', displayAreaUnitLabel, referenceValuationIntlText };
  }
  const detected = detectMediaFormatByMagicBytes(params.buffer);
  if (!detected) {
    return { valid: false, reason: 'UNRECOGNIZED_MAGIC_BYTES', code: 'UNRECOGNIZED_MAGIC_BYTES', displayAreaUnitLabel, referenceValuationIntlText };
  }
  const canonicalExtension = detected.allowedExtensions[0] || '.webp';
  const canonicalMimeType = detected.supportedMimeTypes[0] || normalizedMime;
  if (!detected.supportedMimeTypes.includes(normalizedMime)) {
    return {
      valid: false, reason: 'MAGIC_BYTES_MIME_MISMATCH', code: 'MAGIC_BYTES_MIME_MISMATCH',
      detectedMediaType: detected.mediaType, detectedFormat: canonicalMimeType, canonicalExtension, canonicalMimeType,
      allowedExtensions: detected.allowedExtensions, displayAreaUnitLabel, referenceValuationIntlText,
    };
  }
  if (params.mediaType && detected.mediaType !== params.mediaType) {
    return {
      valid: false, reason: 'MAGIC_BYTES_MEDIA_TYPE_MISMATCH', code: 'MAGIC_BYTES_MEDIA_TYPE_MISMATCH',
      detectedMediaType: detected.mediaType, detectedFormat: canonicalMimeType, canonicalExtension, canonicalMimeType,
      allowedExtensions: detected.allowedExtensions, displayAreaUnitLabel, referenceValuationIntlText,
    };
  }
  if (params.extension !== undefined && params.extension.trim() !== '') {
    const rawExt = params.extension.trim().toLowerCase();
    const normalizedExt = rawExt.startsWith('.') ? rawExt : `.${rawExt}`;
    const expectedMimeForExt = SAFE_MIME_BY_EXTENSION[normalizedExt];
    if (!expectedMimeForExt || !detected.allowedExtensions.includes(normalizedExt) || expectedMimeForExt !== normalizedMime) {
      return {
        valid: false, reason: 'MAGIC_BYTES_EXTENSION_MISMATCH', code: 'MAGIC_BYTES_EXTENSION_MISMATCH',
        detectedMediaType: detected.mediaType, detectedFormat: canonicalMimeType, canonicalExtension, canonicalMimeType,
        allowedExtensions: detected.allowedExtensions, displayAreaUnitLabel, referenceValuationIntlText,
      };
    }
  }
  if (detected.mediaType === 'video') {
    const containerCheck = validateVideoContainerSafety(params.buffer, normalizedMime);
    if (!containerCheck.safe) {
      const r = containerCheck.reason || 'UNSAFE_VIDEO_CONTAINER';
      return { valid: false, reason: r, code: r, displayAreaUnitLabel, referenceValuationIntlText };
    }
  } else if (hasPolyglotScriptBytes(params.buffer)) {
    return { valid: false, reason: 'IMAGE_POLYGLOT_SCRIPT_DETECTED', code: 'IMAGE_POLYGLOT_SCRIPT_DETECTED', displayAreaUnitLabel, referenceValuationIntlText };
  }
  return {
    valid: true, detectedMediaType: detected.mediaType, detectedFormat: canonicalMimeType,
    canonicalExtension, canonicalMimeType, allowedExtensions: detected.allowedExtensions,
    displayAreaUnitLabel, referenceValuationIntlText,
  };
}
export function verifyMediaMagicBytes(
  buffer: Buffer,
  mimeType: string,
  expectedExtension?: string,
): boolean {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  const normalizedMime = (mimeType || '').trim().toLowerCase();
  if (isSvgOrXmlPayload(buffer, normalizedMime, expectedExtension)) return false;
  const headText = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('latin1').toLowerCase();
  const tailText = buffer.length > 4096 ? buffer.subarray(Math.max(0, buffer.length - 4096)).toString('latin1').toLowerCase() : '';
  if (headText.includes('<script') || headText.includes('javascript:') || tailText.includes('<script') || tailText.includes('javascript:')) return false;
  const detected = detectMediaFormatByMagicBytes(buffer);
  if (!detected || !detected.supportedMimeTypes.includes(normalizedMime)) return false;
  if (expectedExtension !== undefined && expectedExtension.trim() !== '') {
    const rawExt = expectedExtension.trim().toLowerCase();
    const normalizedExt = rawExt.startsWith('.') ? rawExt : `.${rawExt}`;
    const expectedMimeForExt = SAFE_MIME_BY_EXTENSION[normalizedExt];
    if (
      !expectedMimeForExt ||
      !detected.allowedExtensions.includes(normalizedExt) ||
      expectedMimeForExt !== normalizedMime
    ) {
      return false;
    }
  }
  if (detected.mediaType === 'video' && (expectedExtension !== undefined || buffer.length > 12) && !validateVideoContainerSafety(buffer, normalizedMime).safe) {
    return false;
  }
  return true;
}
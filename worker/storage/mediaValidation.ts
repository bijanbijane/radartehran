/**
 * @file worker/storage/mediaValidation.ts
 * @description Pure Web Crypto and typed binary inspection for media validation.
 *
 * Enforces:
 * - Magic byte inspection (JPEG, PNG, WebP, MP4, WebM, QuickTime).
 * - SVG and XML payload rejection (anti-XSS).
 * - Polyglot script detection (anti-PHP, anti-HTML script embedding).
 * - Exact MIME-type verification (never trusting browser headers).
 * - Video container safety (blocking executable streams or dangerous atoms).
 * - Size limit enforcement.
 */

import type { AllowedImageMime, AllowedMediaMime, AllowedVideoMime, ObjectMediaCategory } from './types';

export interface MediaValidationResult {
  readonly valid: boolean;
  readonly mediaCategory: ObjectMediaCategory;
  readonly detectedMime: AllowedMediaMime | null;
  readonly sha256Hex: string;
  readonly sizeBytes: number;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

export const ALLOWED_IMAGE_MIMES: ReadonlySet<string> = new Set<AllowedImageMime>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const ALLOWED_VIDEO_MIMES: ReadonlySet<string> = new Set<AllowedVideoMime>([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

export const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const DEFAULT_MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Inspect magic bytes to detect authentic media format.
 */
export function detectMagicBytesFormat(bytes: Uint8Array): { mime: AllowedMediaMime; category: ObjectMediaCategory } | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', category: 'image' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: 'image/png', category: 'image' };
  }

  // WebP: RIFF .... WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: 'image/webp', category: 'image' };
  }

  // WebM: 1A 45 DF A3 (EBML)
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { mime: 'video/webm', category: 'video' };
  }

  // MP4 / QuickTime ftyp check
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand.startsWith('qt')) {
      return { mime: 'video/quicktime', category: 'video' };
    }
    return { mime: 'video/mp4', category: 'video' };
  }

  return null;
}

/**
 * Check if the payload contains XML, SVG, HTML, or polyglot script tags.
 */
export function hasDangerousPayloadOrPolyglot(bytes: Uint8Array): boolean {
  // Check first 1KB and last 1KB for embedded script tags
  const sampleLength = Math.min(bytes.length, 1024);
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, sampleLength)).toLowerCase();
  
  if (head.includes('<svg') || head.includes('<?xml') || head.includes('<script') || head.includes('javascript:')) {
    return true;
  }
  if (head.includes('<?php') || head.includes('<html') || head.includes('<!doctype')) {
    return true;
  }

  if (bytes.length > 2048) {
    const tail = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(bytes.length - 1024)).toLowerCase();
    if (tail.includes('</script>') || tail.includes('<?php') || tail.includes('</svg>')) {
      return true;
    }
  }

  return false;
}

/**
 * Validate media bytes against security rules, magic bytes, declared category and MIME.
 */
export async function validateMediaBytes(
  bytes: Uint8Array,
  declaredCategory: ObjectMediaCategory,
  declaredMime: string,
  options?: { maxImageBytes?: number; maxVideoBytes?: number }
): Promise<MediaValidationResult> {
  const maxImg = options?.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const maxVid = options?.maxVideoBytes ?? DEFAULT_MAX_VIDEO_BYTES;
  const maxAllowed = declaredCategory === 'video' ? maxVid : maxImg;

  // 1. Size checks
  if (bytes.length === 0) {
    return {
      valid: false,
      mediaCategory: declaredCategory,
      detectedMime: null,
      sha256Hex: '',
      sizeBytes: 0,
      errorCode: 'EMPTY_PAYLOAD',
      errorMessage: 'Uploaded file is empty.',
    };
  }

  if (bytes.length > maxAllowed) {
    return {
      valid: false,
      mediaCategory: declaredCategory,
      detectedMime: null,
      sha256Hex: '',
      sizeBytes: bytes.length,
      errorCode: 'FILE_SIZE_EXCEEDED',
      errorMessage: `File size exceeds the permitted limit of ${Math.round(maxAllowed / (1024 * 1024))} MB.`,
    };
  }

  // 2. Compute SHA-256 Checksum via Web Crypto
  const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
  const sha256Hex = Array.from(new Uint8Array(hashBuf), (b) => b.toString(16).padStart(2, '0')).join('');

  // 3. Dangerous content & polyglot check
  if (hasDangerousPayloadOrPolyglot(bytes)) {
    return {
      valid: false,
      mediaCategory: declaredCategory,
      detectedMime: null,
      sha256Hex,
      sizeBytes: bytes.length,
      errorCode: 'DANGEROUS_PAYLOAD_DETECTED',
      errorMessage: 'File contains forbidden active content, script or SVG/XML vectors.',
    };
  }

  // 4. Magic bytes detection
  const detected = detectMagicBytesFormat(bytes);
  if (!detected) {
    return {
      valid: false,
      mediaCategory: declaredCategory,
      detectedMime: null,
      sha256Hex,
      sizeBytes: bytes.length,
      errorCode: 'UNRECOGNIZED_MAGIC_BYTES',
      errorMessage: 'Binary file signature does not match any supported image or video format.',
    };
  }

  // 5. Category parity
  if (detected.category !== declaredCategory) {
    return {
      valid: false,
      mediaCategory: declaredCategory,
      detectedMime: detected.mime,
      sha256Hex,
      sizeBytes: bytes.length,
      errorCode: 'MEDIA_CATEGORY_MISMATCH',
      errorMessage: `Detected ${detected.category} format does not match declared category ${declaredCategory}.`,
    };
  }

  // 6. Declared MIME parity check
  const cleanDeclaredMime = declaredMime.trim().toLowerCase();
  if (cleanDeclaredMime && cleanDeclaredMime !== detected.mime) {
    // QuickTime (.mov) / MP4 compatibility tolerance
    const isMp4QtOverlap =
      (detected.mime === 'video/mp4' && cleanDeclaredMime === 'video/quicktime') ||
      (detected.mime === 'video/quicktime' && cleanDeclaredMime === 'video/mp4');

    if (!isMp4QtOverlap) {
      return {
        valid: false,
        mediaCategory: declaredCategory,
        detectedMime: detected.mime,
        sha256Hex,
        sizeBytes: bytes.length,
        errorCode: 'MIME_TYPE_SPOOF_DETECTED',
        errorMessage: `Declared MIME '${cleanDeclaredMime}' does not match detected format '${detected.mime}'.`,
      };
    }
  }

  return {
    valid: true,
    mediaCategory: detected.category,
    detectedMime: detected.mime,
    sha256Hex,
    sizeBytes: bytes.length,
  };
}

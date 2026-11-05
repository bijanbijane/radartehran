/**
 * @file src/utils/objectStorageSampleMedia.ts
 * @description Synthetic sample property photo and minimal MP4 smoke-test payload generators
 * for verifying the object-storage upload pipeline.
 *
 * Pure utility module (< 100 lines, zero React/UI imports).
 */

import { clampNumber, sanitizeInput } from './security';
import { formatAreaShort, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';

/**
 * Generate a synthetic property image for testing the upload flow.
 *
 * This is a graphic test image, not a real property photograph.
 */
export function generateSamplePropertyPhotoBase64(
  hoodName: string,
  sqm: number,
  areaUnit: AreaUnit = 'sqm',
  intlCurrency: IntlCurrencyCode = 'USD',
  referenceValuationMillionToman = 0,
): string {
  if (typeof document === 'undefined') return '';

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 420;
  const context = canvas.getContext('2d');
  if (!context) return '';

  const gradient = context.createLinearGradient(0, 0, 640, 420);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(0.55, '#1e293b');
  gradient.addColorStop(1, '#065f46');

  context.fillStyle = gradient;
  context.fillRect(0, 0, 640, 420);

  // Buildings & Windows
  context.fillStyle = '#334155';
  context.fillRect(90, 70, 200, 270);
  context.fillRect(310, 45, 240, 295);

  for (let row = 0; row < 5; row++) {
    for (let column = 0; column < 3; column++) {
      context.fillStyle = (row + column) % 2 === 0 ? '#fde68a' : '#38bdf8';
      context.fillRect(115 + column * 55, 95 + row * 46, 36, 28);
      context.fillRect(340 + column * 65, 75 + row * 48, 42, 30);
    }
  }

  // Caption panel
  context.fillStyle = 'rgba(16, 185, 129, 0.92)';
  context.fillRect(0, 340, 640, 80);

  const safeHoodName = sanitizeInput(hoodName, 60);
  const safeSqm = clampNumber(sqm, 25, 1000, 80);
  const displayArea = formatAreaShort(safeSqm, areaUnit, true);
  const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
  const intlSuffix = referenceValuationMillionToman > 0 ? ` — ${formatMillionTomanAsIntlCurrency(referenceValuationMillionToman, intlCurrency, 'en')}` : '';
  context.fillStyle = '#ffffff';
  context.font = 'bold 22px Vazirmatn, Tahoma, sans-serif';
  context.textAlign = 'right';
  context.fillText(`نمای نمونه ${displayArea} — محله ${safeHoodName}`, 610, 375);

  context.font = '14px Vazirmatn, Tahoma, sans-serif';
  context.fillStyle = '#d1fae5';
  context.fillText(`تصویر آزمایشی برای بررسی آپلود رادار مسکن (${displayAreaUnitLabel})${intlSuffix}`, 610, 402);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

/**
 * Generate a minimal MP4-like payload for endpoint smoke tests.
 *
 * IMPORTANT:
 * This payload contains an ftyp box and an empty mdat box only.
 * It is not a playable video and must not be treated as proof
 * that a real MP4 video can be decoded or played.
 */
export function generateSamplePropertyVideoBase64(): string {
  const bytes = new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // size=24, 'ftyp'
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, // 'isom', minor_version=512
    0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, // 'isom', 'iso2'
    0x00, 0x00, 0x00, 0x08, 0x6d, 0x64, 0x61, 0x74, // size=8, 'mdat'
  ]);

  let binary = '';
  for (let index = 0; index < bytes.length; index++) {
    binary += String.fromCharCode(bytes[index]);
  }
  return typeof btoa === 'function' ? btoa(binary) : '';
}

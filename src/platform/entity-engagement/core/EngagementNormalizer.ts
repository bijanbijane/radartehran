/**
 * @file src/platform/entity-engagement/core/EngagementNormalizer.ts
 * @description Sanitizes and normalizes user notes, tags, collection names, and watch rule thresholds (Stage 8).
 */

import {
  DEFAULT_WATCH_COOLDOWN_MINUTES,
  MAX_COLLECTION_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_TAG_NAME_LENGTH,
  MIN_PRICE_CHANGE_THRESHOLD_PERCENT,
} from './EngagementContract';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizePersianTextForEngagement(raw: string): string {
  let out = String(raw || '');
  out = out.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c+/g, ' ');
  for (let i = 0; i < 10; i++) {
    out = out.replace(new RegExp(PERSIAN_DIGITS[i], 'g'), String(i));
    out = out.replace(new RegExp(ARABIC_DIGITS[i], 'g'), String(i));
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function sanitizePlainUserText(raw: string, maxLength: number): string {
  const withoutTags = String(raw || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');

  const trimmed = withoutTags.trim();
  if (trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }
  return trimmed;
}

export function validateAndSanitizePersonalNote(rawContent: string): {
  valid: boolean;
  sanitized: string;
  errorFa?: string;
} {
  const rawTrimmed = String(rawContent || '').trim();
  if (!rawTrimmed) {
    return {
      valid: false,
      sanitized: '',
      errorFa: 'متن یادداشت نمی‌تواند خالی باشد.',
    };
  }
  if (rawTrimmed.length > MAX_NOTE_LENGTH) {
    return {
      valid: false,
      sanitized: sanitizePlainUserText(rawTrimmed, MAX_NOTE_LENGTH),
      errorFa: `حداکثر طول مجاز یادداشت ${MAX_NOTE_LENGTH} نویسه است.`,
    };
  }
  const sanitized = sanitizePlainUserText(rawTrimmed, MAX_NOTE_LENGTH);
  if (!sanitized) {
    return {
      valid: false,
      sanitized: '',
      errorFa: 'متن یادداشت حاوی محتوای غیرمجاز است.',
    };
  }
  return { valid: true, sanitized };
}

export function normalizeTagName(rawName: string): {
  displayName: string;
  normalizedName: string;
} {
  const clean = sanitizePlainUserText(rawName, MAX_TAG_NAME_LENGTH);
  const normalized = normalizePersianTextForEngagement(clean).toLowerCase();
  return {
    displayName: clean,
    normalizedName: normalized,
  };
}

export function normalizeCollectionName(rawName: string): string {
  return sanitizePlainUserText(rawName, MAX_COLLECTION_NAME_LENGTH);
}

export function normalizeWatchRuleThresholds(input: {
  thresholdPercent?: number;
  thresholdAbsolute?: number;
  cooldownMinutes?: number;
}): {
  thresholdPercent?: number;
  thresholdAbsolute?: number;
  cooldownMinutes: number;
} {
  const pct =
    typeof input.thresholdPercent === 'number' && Number.isFinite(input.thresholdPercent)
      ? Math.max(MIN_PRICE_CHANGE_THRESHOLD_PERCENT, Math.min(90, input.thresholdPercent))
      : undefined;

  const abs =
    typeof input.thresholdAbsolute === 'number' && Number.isFinite(input.thresholdAbsolute) && input.thresholdAbsolute > 0
      ? input.thresholdAbsolute
      : undefined;

  const cooldown =
    typeof input.cooldownMinutes === 'number' && Number.isFinite(input.cooldownMinutes) && input.cooldownMinutes >= 5
      ? Math.round(input.cooldownMinutes)
      : DEFAULT_WATCH_COOLDOWN_MINUTES;

  return {
    thresholdPercent: pct,
    thresholdAbsolute: abs,
    cooldownMinutes: cooldown,
  };
}

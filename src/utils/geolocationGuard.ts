/**
 * [RULE-07] Geolocation Permission & Tehran Bounding-Box Guard
 * Prevents VPN teleportation to Europe/US and handles PERMISSION_DENIED gracefully.
 */

import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from './areaUnit';

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export function formatTehranCenterBenchmarkIntl(millionToman = 9500, currency: IntlCurrencyCode = 'USD'): string {
  return formatMillionTomanAsIntlCurrency(millionToman, currency);
}

export const TEHRAN_BOUNDS = Object.freeze({
  minLat: 35.50,
  maxLat: 35.90,
  minLng: 51.05,
  maxLng: 51.65,
});

// Default Fallback: Azadi Tower, Tehran
export const TEHRAN_DEFAULT_CENTER: Readonly<GeoCoordinates> = Object.freeze({
  lat: 35.6997,
  lng: 51.3380,
});

export type GeolocationResultStatus =
  | 'SUCCESS_INSIDE_TEHRAN'
  | 'REJECTED_OUTSIDE_TEHRAN_VPN'
  | 'PERMISSION_DENIED'
  | 'TIMEOUT_OR_UNAVAILABLE';

export interface SafeGeolocationResult {
  status: GeolocationResultStatus;
  coordinates: GeoCoordinates;
  persianMessage: string;
}

export function isInsideTehranBounds(coords: GeoCoordinates | null | undefined): boolean {
  if (!coords || typeof coords !== 'object') return false;
  return (
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    coords.lat >= TEHRAN_BOUNDS.minLat &&
    coords.lat <= TEHRAN_BOUNDS.maxLat &&
    coords.lng >= TEHRAN_BOUNDS.minLng &&
    coords.lng <= TEHRAN_BOUNDS.maxLng
  );
}

export async function acquireSafeTehranLocation(timeoutMs = 7000): Promise<SafeGeolocationResult> {
  const safeTimeoutMs = Number.isFinite(timeoutMs) ? Math.max(1000, Math.min(20_000, Math.trunc(timeoutMs))) : 7000;
  if (typeof window === 'undefined' || !('geolocation' in navigator)) {
    return {
      status: 'TIMEOUT_OR_UNAVAILABLE',
      coordinates: TEHRAN_DEFAULT_CENTER,
      persianMessage: 'مرورگر شما از موقعیت‌یاب پشتیبانی نمی‌کند. نمایش مرکز تهران (میدان آزادی).',
    };
  }

  // Pre-check Permissions API if supported
  if ('permissions' in navigator && typeof navigator.permissions.query === 'function') {
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' });
      if (perm.state === 'denied') {
        return {
          status: 'PERMISSION_DENIED',
          coordinates: TEHRAN_DEFAULT_CENTER,
          persianMessage: 'دسترسی به موقعیت مکانی مسدود است. لطفاً محله را از نوار جستجو انتخاب کنید.',
        };
      }
    } catch {
      // Ignore permission query failures on older WebKit
    }
  }

  return new Promise<SafeGeolocationResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const candidate: GeoCoordinates = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };

        if (!isInsideTehranBounds(candidate)) {
          resolve({
            status: 'REJECTED_OUTSIDE_TEHRAN_VPN',
            coordinates: TEHRAN_DEFAULT_CENTER,
            persianMessage:
              'موقعیت دریافتی خارج از محدوده کلان‌شهر تهران است (احتمال روشن بودن VPN). نقشه روی میدان آزادی تنظیم شد.',
          });
          return;
        }

        resolve({
          status: 'SUCCESS_INSIDE_TEHRAN',
          coordinates: candidate,
          persianMessage: 'موقعیت شما در تهران با موفقیت شناسایی شد.',
        });
      },
      (err) => {
        if (err.code === 1) {
          resolve({
            status: 'PERMISSION_DENIED',
            coordinates: TEHRAN_DEFAULT_CENTER,
            persianMessage: 'اجازه دسترسی به GPS داده نشد. نمایش پیش‌فرض مرکز تهران.',
          });
        } else {
          resolve({
            status: 'TIMEOUT_OR_UNAVAILABLE',
            coordinates: TEHRAN_DEFAULT_CENTER,
            persianMessage: 'خطا در دریافت سیگنال GPS. نمایش پیش‌فرض مرکز تهران.',
          });
        }
      },
      {
        enableHighAccuracy: false,
        timeout: safeTimeoutMs,
        maximumAge: 60_000,
      }
    );
  });
}

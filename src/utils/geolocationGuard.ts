/**
 * [RULE-07] Geolocation Permission & Multi-City Bounding-Box Guard
 * Prevents VPN teleportation outside target city bounds and handles PERMISSION_DENIED gracefully.
 */

import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from './areaUnit';
import type { CityId } from '../types/models';

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export interface CityGeoBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
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

export const CITY_BOUNDS_REGISTRY: Readonly<Record<CityId, CityGeoBounds>> = Object.freeze({
  tehran: TEHRAN_BOUNDS,
  karaj: Object.freeze({ minLat: 35.72, maxLat: 35.95, minLng: 50.80, maxLng: 51.12 }),
  mashhad: Object.freeze({ minLat: 36.15, maxLat: 36.45, minLng: 59.40, maxLng: 59.80 }),
  isfahan: Object.freeze({ minLat: 32.52, maxLat: 32.80, minLng: 51.52, maxLng: 51.85 }),
  shiraz: Object.freeze({ minLat: 29.50, maxLat: 29.75, minLng: 52.38, maxLng: 52.70 }),
});

export const CITY_DEFAULT_CENTERS: Readonly<Record<CityId, Readonly<GeoCoordinates>>> = Object.freeze({
  tehran: TEHRAN_DEFAULT_CENTER,
  karaj: Object.freeze({ lat: 35.8327, lng: 50.9915 }),
  mashhad: Object.freeze({ lat: 36.2972, lng: 59.6067 }),
  isfahan: Object.freeze({ lat: 32.6546, lng: 51.6680 }),
  shiraz: Object.freeze({ lat: 29.5918, lng: 52.5837 }),
});

const CITY_NAMES_FA: Readonly<Record<CityId, string>> = Object.freeze({
  tehran: 'تهران',
  karaj: 'کرج',
  mashhad: 'مشهد',
  isfahan: 'اصفهان',
  shiraz: 'شیراز',
});

export type GeolocationResultStatus =
  | 'SUCCESS_INSIDE_TEHRAN'
  | 'SUCCESS_INSIDE_CITY'
  | 'REJECTED_OUTSIDE_TEHRAN_VPN'
  | 'REJECTED_OUTSIDE_CITY_VPN'
  | 'PERMISSION_DENIED'
  | 'TIMEOUT_OR_UNAVAILABLE';

export interface SafeGeolocationResult {
  status: GeolocationResultStatus;
  coordinates: GeoCoordinates;
  persianMessage: string;
}

export function isInsideCityBounds(cityId: CityId, coords: GeoCoordinates | null | undefined): boolean {
  if (!coords || typeof coords !== 'object') return false;
  const bounds = CITY_BOUNDS_REGISTRY[cityId] ?? TEHRAN_BOUNDS;
  return (
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    coords.lat >= bounds.minLat &&
    coords.lat <= bounds.maxLat &&
    coords.lng >= bounds.minLng &&
    coords.lng <= bounds.maxLng
  );
}

export function isInsideTehranBounds(coords: GeoCoordinates | null | undefined): boolean {
  return isInsideCityBounds('tehran', coords);
}

export async function acquireSafeCityLocation(cityId: CityId = 'tehran', timeoutMs = 7000): Promise<SafeGeolocationResult> {
  const safeTimeoutMs = Number.isFinite(timeoutMs) ? Math.max(1000, Math.min(20_000, Math.trunc(timeoutMs))) : 7000;
  const defaultCenter = CITY_DEFAULT_CENTERS[cityId] ?? TEHRAN_DEFAULT_CENTER;
  const cityNameFa = CITY_NAMES_FA[cityId] ?? 'تهران';

  if (typeof window === 'undefined' || !('geolocation' in navigator)) {
    return {
      status: 'TIMEOUT_OR_UNAVAILABLE',
      coordinates: defaultCenter,
      persianMessage: `مرورگر شما از موقعیت‌یاب پشتیبانی نمی‌کند. نمایش مرکز ${cityNameFa}.`,
    };
  }

  if ('permissions' in navigator && typeof navigator.permissions.query === 'function') {
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' });
      if (perm.state === 'denied') {
        return {
          status: 'PERMISSION_DENIED',
          coordinates: defaultCenter,
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

        if (!isInsideCityBounds(cityId, candidate)) {
          resolve({
            status: cityId === 'tehran' ? 'REJECTED_OUTSIDE_TEHRAN_VPN' : 'REJECTED_OUTSIDE_CITY_VPN',
            coordinates: defaultCenter,
            persianMessage: `موقعیت دریافتی خارج از محدوده کلان‌شهر ${cityNameFa} است (احتمال روشن بودن VPN یا انتخاب شهر دیگر). نقشه روی مرکز ${cityNameFa} تنظیم شد.`,
          });
          return;
        }

        resolve({
          status: cityId === 'tehran' ? 'SUCCESS_INSIDE_TEHRAN' : 'SUCCESS_INSIDE_CITY',
          coordinates: candidate,
          persianMessage: `موقعیت شما در ${cityNameFa} با موفقیت شناسایی شد.`,
        });
      },
      (err) => {
        if (err.code === 1) {
          resolve({
            status: 'PERMISSION_DENIED',
            coordinates: defaultCenter,
            persianMessage: `اجازه دسترسی به GPS داده نشد. نمایش پیش‌فرض مرکز ${cityNameFa}.`,
          });
        } else {
          resolve({
            status: 'TIMEOUT_OR_UNAVAILABLE',
            coordinates: defaultCenter,
            persianMessage: `خطا در دریافت سیگنال GPS. نمایش پیش‌فرض مرکز ${cityNameFa}.`,
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

export async function acquireSafeTehranLocation(timeoutMs = 7000): Promise<SafeGeolocationResult> {
  return acquireSafeCityLocation('tehran', timeoutMs);
}

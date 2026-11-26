/**
 * Native Cloudflare Worker route for bounded approximate neighborhood geometry.
 * The output is explicitly marked as a visualization fallback, never as an official boundary.
 */
import { computeApproxHexRing } from '../../src/utils/geo/approximateBoundaryGeometry';
import { jsonWorkerResponse, readValidatedJsonBody } from '../contextAndSecurity';
import type { WorkerRequestContext } from '../types';

const BOUNDARY_PATH = '/api/neighborhood-boundaries/resolve';
const MAX_NEIGHBORHOODS = 120;
const MAX_BODY_BYTES = 32 * 1024;
const IRAN_BOUNDS = { minLat: 24, maxLat: 41, minLng: 43, maxLng: 64 };

interface BoundaryInput {
  id: number;
  name: string;
  lat: number;
  lng: number;
  radius: number;
}

function parseBoundaryInput(value: unknown): BoundaryInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = Number(row.id);
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  const radius = Number(row.radius);
  if (!Number.isSafeInteger(id) || id < 1 || id > 999) return null;
  if (!Number.isFinite(lat) || lat < IRAN_BOUNDS.minLat || lat > IRAN_BOUNDS.maxLat) return null;
  if (!Number.isFinite(lng) || lng < IRAN_BOUNDS.minLng || lng > IRAN_BOUNDS.maxLng) return null;
  const cleanName = typeof row.name === 'string'
    ? row.name.replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 80)
    : '';
  if (!cleanName) return null;
  const safeRadius = Number.isFinite(radius) ? Math.min(2500, Math.max(500, radius)) : 1150;
  return { id, name: cleanName, lat, lng, radius: safeRadius };
}

export async function handleNeighborhoodBoundaryResolveRoute(
  ctx: WorkerRequestContext,
): Promise<Response | null> {
  if (ctx.pathname !== BOUNDARY_PATH) return null;
  if (ctx.method !== 'POST') {
    return jsonWorkerResponse(ctx, 405, {
      status: 'error',
      code: 'METHOD_NOT_ALLOWED',
      message: 'این مسیر فقط درخواست POST را می‌پذیرد.',
    });
  }

  const parsed = await readValidatedJsonBody(ctx.request, MAX_BODY_BYTES);
  if (!parsed.ok) {
    return jsonWorkerResponse(ctx, parsed.status, {
      status: 'error',
      code: parsed.code,
      message: parsed.messageFa,
    });
  }

  const neighborhoods = Array.isArray(parsed.body.neighborhoods)
    ? parsed.body.neighborhoods.slice(0, MAX_NEIGHBORHOODS)
    : [];
  if (neighborhoods.length === 0) {
    return jsonWorkerResponse(ctx, 422, {
      status: 'error',
      code: 'BOUNDARY_NEIGHBORHOODS_REQUIRED',
      message: 'حداقل یک محله معتبر برای تولید هندسه لازم است.',
    });
  }

  const cityNameFa = typeof parsed.body.cityNameFa === 'string'
    ? parsed.body.cityNameFa.replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 40)
    : '';
  const boundaries: Record<string, {
    hoodId: number;
    name: string;
    source: 'computed_hex_fallback';
    sourceLabelFa: string;
    coordinates: [number, number][];
    updatedAtIso: string;
  }> = {};
  const seen = new Set<number>();
  const updatedAtIso = new Date().toISOString();

  for (const raw of neighborhoods) {
    const item = parseBoundaryInput(raw);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    const areaSqKm = Math.PI * (item.radius / 1000) ** 2;
    boundaries[String(item.id)] = {
      hoodId: item.id,
      name: item.name,
      source: 'computed_hex_fallback',
      sourceLabelFa: 'هندسهٔ تقریبی شش‌ضلعی؛ مرز رسمی یا ثبتی نیست',
      coordinates: computeApproxHexRing(item.lat, item.lng, areaSqKm, item.id),
      updatedAtIso,
    };
  }

  if (Object.keys(boundaries).length === 0) {
    return jsonWorkerResponse(ctx, 422, {
      status: 'error',
      code: 'NO_VALID_BOUNDARY_NEIGHBORHOODS',
      message: 'هیچ‌یک از محله‌های ارسالی شناسه یا مختصات معتبر نداشت.',
    });
  }

  return jsonWorkerResponse(ctx, 200, {
    status: 'ok',
    cityNameFa,
    boundaries,
    geometryNoticeFa: 'هندسه‌های محاسبه‌شده تقریبی‌اند و برای نمایش نقشه هستند؛ مرز رسمی، ثبتی یا حقوقی محسوب نمی‌شوند.',
  }, { cacheControl: 'private, max-age=300' });
}

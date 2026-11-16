/**
 * @file src/features/account/services/systemHealthProbeService.ts
 * @description Pure & injectable live health probing engine for Firebase, Casper Hub, and Cloud Databases.
 * Enforces request deduplication (Axis 6/12), AbortController timeouts (Axis 11/12), and truthful status classification (Axis 2/20).
 */

export type ServiceConnectivityStatus = 'online' | 'degraded' | 'offline';
export type LatencyHealthBand = 'excellent' | 'normal' | 'slow' | 'unreachable';

export interface ServiceHealthProbeResult {
  id: 'firebase' | 'casperHub' | 'cloudDatabase';
  titleFa: string;
  subtitleEn: string;
  status: ServiceConnectivityStatus;
  statusLabelFa: string;
  latencyMs: number | null;
  latencyBand: LatencyHealthBand;
  latencyBadgeFa: string;
  endpointLabel: string;
  detailFa: string;
  checkedAtIso: string;
}

export interface SystemHealthDashboardSnapshot {
  overallStatus: ServiceConnectivityStatus;
  overallScorePct: number;
  averageLatencyMs: number | null;
  browserOnline: boolean;
  checkedAtFa: string;
  checkedAtIso: string;
  services: {
    firebase: ServiceHealthProbeResult;
    casperHub: ServiceHealthProbeResult;
    cloudDatabase: ServiceHealthProbeResult;
  };
}

export function classifyLatencyBand(latencyMs: number | null, status: ServiceConnectivityStatus): {
  band: LatencyHealthBand;
  badgeFa: string;
} {
  if (status === 'offline' || latencyMs === null || !Number.isFinite(latencyMs) || latencyMs < 0) {
    return { band: 'unreachable', badgeFa: 'عدم ارتباط' };
  }
  if (latencyMs <= 120) {
    return { band: 'excellent', badgeFa: 'عالی (کم‌تأخیر)' };
  }
  if (latencyMs <= 350) {
    return { band: 'normal', badgeFa: 'متعادل و پایدار' };
  }
  return { band: 'slow', badgeFa: 'تأخیر بالا' };
}

export function computeCompositeSystemHealth(
  services: {
    firebase: ServiceHealthProbeResult;
    casperHub: ServiceHealthProbeResult;
    cloudDatabase: ServiceHealthProbeResult;
  },
  browserOnline: boolean,
  nowDate: Date = new Date(),
): SystemHealthDashboardSnapshot {
  const checkedAtIso = nowDate.toISOString();
  const checkedAtFa = nowDate.toLocaleTimeString('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (!browserOnline) {
    const makeOffline = (item: ServiceHealthProbeResult): ServiceHealthProbeResult => ({
      ...item,
      status: 'offline',
      statusLabelFa: 'آفلاین (قطع اینترنت دستگاه)',
      latencyMs: null,
      latencyBand: 'unreachable',
      latencyBadgeFa: 'عدم ارتباط',
      detailFa: 'اتصال اینترنت مرورگر قطع است؛ داده‌ها از حافظه پنهان محلی خوانده می‌شوند.',
      checkedAtIso,
    });
    return {
      overallStatus: 'offline',
      overallScorePct: 0,
      averageLatencyMs: null,
      browserOnline: false,
      checkedAtFa,
      checkedAtIso,
      services: {
        firebase: makeOffline(services.firebase),
        casperHub: makeOffline(services.casperHub),
        cloudDatabase: makeOffline(services.cloudDatabase),
      },
    };
  }

  const list = [services.firebase, services.casperHub, services.cloudDatabase];
  const scoreMap: Record<ServiceConnectivityStatus, number> = {
    online: 100,
    degraded: 65,
    offline: 0,
  };
  const totalScore = list.reduce((sum, s) => sum + scoreMap[s.status], 0);
  const overallScorePct = Math.round(totalScore / list.length);

  const validLatencies = list
    .map((s) => s.latencyMs)
    .filter((ms): ms is number => typeof ms === 'number' && Number.isFinite(ms) && ms >= 0);
  const averageLatencyMs =
    validLatencies.length > 0
      ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length)
      : null;

  const onlineCount = list.filter((s) => s.status === 'online').length;
  const offlineCount = list.filter((s) => s.status === 'offline').length;
  const overallStatus: ServiceConnectivityStatus =
    offlineCount === list.length ? 'offline' : onlineCount === list.length ? 'online' : 'degraded';

  return {
    overallStatus,
    overallScorePct,
    averageLatencyMs,
    browserOnline: true,
    checkedAtFa,
    checkedAtIso,
    services,
  };
}

export interface RunSystemHealthProbesDeps {
  fetchImpl?: typeof fetch;
  probeFirebaseFn?: () => Promise<{ ok: boolean; latencyMs: number; detailFa: string; degraded?: boolean }>;
  browserOnline?: boolean;
  timeoutMs?: number;
}

let inFlightProbePromise: Promise<SystemHealthDashboardSnapshot> | null = null;

async function timedFetchJson(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; latencyMs: number; data: Record<string, unknown> | null }> {
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const latencyMs = Math.max(1, Math.round(performance.now() - start));
    const text = await res.text();
    let data: Record<string, unknown> | null = null;
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, latencyMs, data };
  } catch {
    const latencyMs = Math.max(1, Math.round(performance.now() - start));
    return { ok: false, status: 0, latencyMs, data: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function executeLiveSystemHealthProbes(
  deps: RunSystemHealthProbesDeps = {},
): Promise<SystemHealthDashboardSnapshot> {
  const isDefaultCall = !deps.fetchImpl && !deps.probeFirebaseFn && deps.browserOnline === undefined;
  if (isDefaultCall && inFlightProbePromise) {
    return inFlightProbePromise;
  }

  const runner = async (): Promise<SystemHealthDashboardSnapshot> => {
    const fetchImpl = deps.fetchImpl ?? fetch;
    const timeoutMs = Math.max(500, Math.min(10_000, deps.timeoutMs ?? 4500));
    const browserOnline =
      deps.browserOnline !== undefined
        ? deps.browserOnline
        : typeof navigator !== 'undefined'
          ? navigator.onLine !== false
          : true;
    const nowIso = new Date().toISOString();

    const [readinessRes, storageRes, fbProbe] = await Promise.all([
      timedFetchJson('/api/health/readiness', fetchImpl, timeoutMs),
      timedFetchJson('/api/object-storage/status', fetchImpl, timeoutMs),
      deps.probeFirebaseFn
        ? deps.probeFirebaseFn()
        : (async () => {
            const start = performance.now();
            try {
              const fbMod = await import('../../../firebase');
              const ok = await fbMod.testConnection(timeoutMs);
              const latencyMs = Math.max(1, Math.round(performance.now() - start));
              const orth = fbMod.getFirestoreOrthogonalStatus();
              const authUser = fbMod.auth?.currentUser;
              const authBadge = authUser ? `احراز هویت فعال (${authUser.email || 'کاربر'})` : 'حالت مهمان / آماده ورود';
              return {
                ok,
                degraded: orth.backendConnectivity !== 'online',
                latencyMs,
                detailFa: ok
                  ? `متصل به دیتابیس ابری Firestore · ${authBadge}`
                  : 'استفاده از کش محلی Firestore (حالت تاب‌آوری آفلاین)',
              };
            } catch {
              const latencyMs = Math.max(1, Math.round(performance.now() - start));
              return {
                ok: false,
                degraded: true,
                latencyMs,
                detailFa: 'عدم دسترسی مستقیم به سرور Firebase؛ فعال بودن کش آفلاین',
              };
            }
          })(),
    ]);

    const fbStatus: ServiceConnectivityStatus = fbProbe.ok ? (fbProbe.degraded ? 'degraded' : 'online') : readinessRes.ok ? 'degraded' : 'offline';
    const fbLatency = fbStatus === 'offline' ? null : fbProbe.latencyMs;
    const fbBand = classifyLatencyBand(fbLatency, fbStatus);
    const firebaseResult: ServiceHealthProbeResult = {
      id: 'firebase', titleFa: 'سرویس ابری Firebase (Firestore و Auth)', subtitleEn: 'Google Cloud Firestore & Firebase Authentication',
      status: fbStatus, latencyMs: fbLatency, latencyBand: fbBand.band, latencyBadgeFa: fbBand.badgeFa,
      statusLabelFa: fbStatus === 'online' ? 'آنلاین (متصل)' : fbStatus === 'degraded' ? 'آماده (کش محلی / جایگزین)' : 'آفلاین (قطع ارتباط)',
      endpointLabel: 'Firestore DB · gen-lang-client-0713157837', detailFa: fbProbe.detailFa, checkedAtIso: nowIso,
    };

    const servicesObj = readinessRes.data && typeof readinessRes.data.services === 'object' && readinessRes.data.services !== null
      ? (readinessRes.data.services as Record<string, Record<string, unknown>>) : null;
    const casperMeta = servicesObj?.casperHub ?? null;
    const casperStatus: ServiceConnectivityStatus = readinessRes.ok ? (casperMeta?.configured === false ? 'degraded' : 'online') : 'offline';
    const casperLatency = casperStatus === 'offline' ? null : readinessRes.latencyMs;
    const casperBand = classifyLatencyBand(casperLatency, casperStatus);
    const casperResult: ServiceHealthProbeResult = {
      id: 'casperHub', titleFa: 'شبکه هوش مصنوعی کسپر هاب (CASPER HUB)', subtitleEn: 'Cloudflare Worker · CASPER-05 Epistemic Gateway',
      status: casperStatus, latencyMs: casperLatency, latencyBand: casperBand.band, latencyBadgeFa: casperBand.badgeFa,
      statusLabelFa: casperStatus === 'online' ? 'آنلاین (متصل به هاب)' : casperStatus === 'degraded' ? 'آماده (پروکسی سرور فعال)' : 'آفلاین (عدم پاسخ هاب)',
      endpointLabel: 'casper-hub-api.bijanbijane-1.workers.dev (CASPER-05)',
      detailFa: casperStatus === 'online'
        ? 'ارتباط امن سروری با کسپر هاب و هماهنگ‌ساز ایجنت CASPER-05 برقرار است.'
        : casperStatus === 'degraded'
          ? 'گیت‌وی سرور فعال است؛ توکن محیطی CASPER_HUB_TOKEN در حالت آماده پیکربندی قرار دارد.'
          : 'عدم دسترسی به گیت‌وی کسپر هاب در بررسی لحظه‌ای.',
      checkedAtIso: nowIso,
    };

    const dbOk = storageRes.ok || readinessRes.ok;
    const bothOk = storageRes.ok && readinessRes.ok;
    const dbStatus: ServiceConnectivityStatus = bothOk ? 'online' : dbOk ? 'degraded' : 'offline';
    const dbLatency = dbStatus === 'offline' ? null : storageRes.ok ? storageRes.latencyMs : readinessRes.latencyMs;
    const dbBand = classifyLatencyBand(dbLatency, dbStatus);
    const providerLabelFa = storageRes.data && typeof storageRes.data.providerLabelFa === 'string'
      ? storageRes.data.providerLabelFa : 'Cloudflare D1 + R2 Object Storage';
    const cloudDbResult: ServiceHealthProbeResult = {
      id: 'cloudDatabase', titleFa: 'دیتابیس‌های ابری و استوریج (Cloud DB & D1/R2)', subtitleEn: 'Cloudflare D1 SQL · Object Storage · Market Cache',
      status: dbStatus, latencyMs: dbLatency, latencyBand: dbBand.band, latencyBadgeFa: dbBand.badgeFa,
      statusLabelFa: dbStatus === 'online' ? 'آنلاین (سالم و آماده)' : dbStatus === 'degraded' ? 'پایدار (ظرفیت محدود)' : 'آفلاین (خطای دسترسی)',
      endpointLabel: `CASPER_HUB_DB (D1) · ${providerLabelFa}`,
      detailFa: dbStatus === 'online'
        ? `دیتابیس D1، مخزن آبجکت استوریج (${providerLabelFa}) و کش نبض بازار بدون خطا فعال هستند.`
        : dbStatus === 'degraded'
          ? 'بخشی از سرویس‌های ذخیره‌سازی ابری با تأخیر یا در حالت کش محلی پاسخ می‌دهند.'
          : 'خطا در برقراری ارتباط با لایه دیتابیس و ذخیره‌سازی ابری.',
      checkedAtIso: nowIso,
    };

    return computeCompositeSystemHealth({ firebase: firebaseResult, casperHub: casperResult, cloudDatabase: cloudDbResult }, browserOnline);
  };

  if (isDefaultCall) {
    inFlightProbePromise = runner().finally(() => { inFlightProbePromise = null; });
    return inFlightProbePromise;
  }
  return runner();
}

import fs from "fs"; import path from "path"; import { GoogleGenAI, Type } from "@google/genai"; import { INITIAL_NEIGHBORHOODS, getNeighborhoodTrafficInfo, toPersianNum } from "../data/neighborhoods"; import { MULTI_CITY_CONFIGS, CityId, resolveCityIdForNeighborhood } from "../data/multiCityData"; import type { MarketPulseData, HoodLiveSnapshot, GroundingSourceLink, ServerAuditLogEntry, BuyerAlertLeadItem, BargainListing } from "../types/models"; import { clampNumber, sanitizeInput } from "./security"; import { getValidatedServerConfig } from "./serverAdminAndTelegramSecurity"; import { fetchFreeLiveGoldAndUsdRates, fetchFreeDivarNeighborhoodStats, fetchFreeCityWeather } from "./freeLiveMarketScraper"; import { mergeEffectiveBargains } from "./marketDataIntegrity"; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from "./areaUnit"; const MONITORING_INTERVAL_MS = 2 * 60 * 60 * 1000; const DISK_CACHE_FILE = path.join(process.cwd(), ".cache-data.json");
export interface ZoneAirReading { region: string; stationName: string; lat: number; lng: number; aqi: number; pm25: number; status: string; source?: "open-meteo"; fetchedAtIso?: string; } export interface DeepHoodPriceOverride { buyPerSqm: number; rahn80m: number; liveBargains?: BargainListing[]; updatedAtIso: string; }
export let cachedMarketPulseByCity: Partial<Record<CityId, MarketPulseData>> = {}; export let deepSyncedOverrides: Partial<Record<CityId, Record<number, DeepHoodPriceOverride>>> = {}; export function getCityNeighborhoods(cityId: CityId) { return cityId === "tehran" ? INITIAL_NEIGHBORHOODS : MULTI_CITY_CONFIGS[cityId]?.neighborhoods ?? []; }
export function getDeepSyncedOverride(cityId: CityId, hoodId: number): DeepHoodPriceOverride | undefined { return deepSyncedOverrides[cityId]?.[hoodId]; } export function setDeepSyncedOverride(cityId: CityId, hoodId: number, override: DeepHoodPriceOverride): void { deepSyncedOverrides = { ...deepSyncedOverrides, [cityId]: { ...(deepSyncedOverrides[cityId] ?? {}), [hoodId]: override } }; }
export function parsePersistedDeepOverrides(raw: unknown): Partial<Record<CityId, Record<number, DeepHoodPriceOverride>>> { const result: Partial<Record<CityId, Record<number, DeepHoodPriceOverride>>> = {}; if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result; const root = raw as Record<string, unknown>; for (const cityId of Object.keys(MULTI_CITY_CONFIGS) as CityId[]) { const rawCity = root[cityId]; if (!rawCity || typeof rawCity !== "object" || Array.isArray(rawCity)) continue; const cityHoods = getCityNeighborhoods(cityId); const validCityRecords: Record<number, DeepHoodPriceOverride> = {}; for (const [rawId, rawRecord] of Object.entries(rawCity as Record<string, unknown>)) { const hoodId = Number(rawId); if (!Number.isSafeInteger(hoodId) || !rawRecord || typeof rawRecord !== "object" || Array.isArray(rawRecord)) continue; if (resolveCityIdForNeighborhood(hoodId) !== cityId && !cityHoods.some((item) => item.id === hoodId)) continue; const { buyPerSqm, rahn80m, liveBargains, updatedAtIso } = rawRecord as Record<string, unknown>; if (typeof buyPerSqm !== "number" || !Number.isFinite(buyPerSqm) || buyPerSqm <= 0 || buyPerSqm > 1_000_000 || typeof rahn80m !== "number" || !Number.isFinite(rahn80m) || rahn80m < 0 || rahn80m > 100_000_000 || typeof updatedAtIso !== "string" || !Number.isFinite(Date.parse(updatedAtIso))) continue; const validBargains = Array.isArray(liveBargains) ? liveBargains.filter((b): b is BargainListing => Boolean(b && typeof b === "object" && typeof (b as BargainListing).title === "string")) : undefined;
      validCityRecords[hoodId] = { buyPerSqm, rahn80m, ...(validBargains ? { liveBargains: validBargains } : {}), updatedAtIso }; } if (Object.keys(validCityRecords).length > 0) result[cityId] = validCityRecords; }
  return result; } export let serverSideBuyerLeads: BuyerAlertLeadItem[] = []; export let serverAuditLogs: ServerAuditLogEntry[] = []; export let liveMacroRates = { gold18kToman: 6850000, usdToman: 92500, updatedAtIso: new Date().toISOString() }; export let lastPulseUpdatedMs = 0; export let lastPulseUpdatedMsByCity: Partial<Record<CityId, number>> = {}, lastAirQualityFetchMs: Partial<Record<CityId, number>> = {}; export let lastAirQualityFetchSucceeded: Partial<Record<CityId, boolean>> = {}, airQualityStationSuccessCount: Partial<Record<CityId, number>> = {};
export let airQualityLastOkByCity: Partial<Record<CityId, boolean>> = {}, airQualityLastSuccessMsByCity: Partial<Record<CityId, number>> = {}; export let openMeteoLastOk = true; export let isBackgroundSyncRunning = false; type MarketPulseFlightKind = "regular" | "deep"; interface MarketPulseFlight { kind: MarketPulseFlightKind; promise: Promise<MarketPulseData>; }
const marketPulseFlights = new Map<CityId, MarketPulseFlight>(); function updateBackgroundSyncFlag(): void { isBackgroundSyncRunning = marketPulseFlights.size > 0; }
export const CITY_AIR_STATIONS: Record<CityId, Record<string, ZoneAirReading>> = { tehran: { north: { region: "شمال", stationName: "ایستگاه اقدسیه / تجریش", lat: 35.802, lng: 51.456, aqi: 34, pm25: 4.8, status: "پاک و ایدهآل (سبز)" }, west: { region: "غرب", stationName: "ایستگاه پونک / ستاری", lat: 35.762, lng: 51.331, aqi: 89, pm25: 46.0, status: "سالم / قابل قبول (زرد)" }, center: { region: "مرکز", stationName: "ایستگاه شریف / فاطمی", lat: 35.706, lng: 51.351, aqi: 89, pm25: 46.0, status: "سالم / قابل قبول (زرد)" }, east: { region: "شرق", stationName: "ایستگاه پیروزی / تهرانپارس", lat: 35.695, lng: 51.491, aqi: 68, pm25: 41.6, status: "سالم / قابل قبول (زرد)" }, south: { region: "جنوب", stationName: "ایستگاه شهرری / نازیآباد", lat: 35.595, lng: 51.431, aqi: 68, pm25: 41.6, status: "سالم / قابل قبول (زرد)" }, }, karaj: { north: { region: "شمال کرج", stationName: "ایستگاه عظیمیه / طالقانی", lat: 35.844, lng: 51.006, aqi: 78, pm25: 24.0, status: "سالم (قابل قبول)" }, west: { region: "غرب کرج", stationName: "ایستگاه مهرشهر / گلشهر", lat: 35.805, lng: 50.919, aqi: 84, pm25: 26.5, status: "سالم (قابل قبول)" }, center: { region: "مرکز و جنوب", stationName: "ایستگاه جهانشهر / فردیس", lat: 35.778, lng: 50.986, aqi: 95, pm25: 31.2, status: "سالم (قابل قبول)" }, }, mashhad: {
    west: { region: "غرب مشهد", stationName: "ایستگاه سجاد / وکیلآباد", lat: 36.326, lng: 59.522, aqi: 82, pm25: 25.4, status: "سالم (قابل قبول)" }, north: { region: "شمال غرب", stationName: "ایستگاه الهیه / قاسمآباد", lat: 36.366, lng: 59.491, aqi: 88, pm25: 27.8, status: "سالم (قابل قبول)" }, center: { region: "مرکز مشهد", stationName: "ایستگاه احمدآباد / کوهسنگی", lat: 36.286, lng: 59.565, aqi: 98, pm25: 32.5, status: "سالم (قابل قبول)" }, }, isfahan: {
    south: { region: "جنوب زایندهرود", stationName: "ایستگاه مرداویج / جلفا", lat: 32.627, lng: 51.661, aqi: 94, pm25: 30.8, status: "سالم (قابل قبول)" }, north: { region: "شمال اصفهان", stationName: "ایستگاه خانه اصفهان", lat: 32.712, lng: 51.644, aqi: 102, pm25: 35.1, status: "ناسالم برای گروههای حساس" }, sepahan: { region: "جنوب سیتیسنتر", stationName: "ایستگاه سپاهانشهر", lat: 32.559, lng: 51.674, aqi: 86, pm25: 27.2, status: "سالم (قابل قبول)" }, }, shiraz: {
    northwest: { region: "شمال غرب شیراز", stationName: "ایستگاه قصرالدشت / معالیآباد", lat: 29.656, lng: 52.481, aqi: 68, pm25: 19.5, status: "سالم (قابل قبول)" }, center: { region: "مرکز شیراز", stationName: "ایستگاه ستارخان / عفیفآباد", lat: 29.630, lng: 52.504, aqi: 76, pm25: 22.8, status: "سالم (قابل قبول)" }, sadra: { region: "شهر جدید صدرا", stationName: "ایستگاه صدرا / فرهنگشهر", lat: 29.726, lng: 52.465, aqi: 62, pm25: 17.2, status: "سالم (قابل قبول)" }, }, };
export let latestZoneAirQuality = CITY_AIR_STATIONS.tehran; function formatTehranTimeFa(date = new Date()): string { try { return date.toLocaleTimeString("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return toPersianNum(date.toISOString().slice(11, 19)); } }
export function pushAuditLog(level: "INFO" | "WARN" | "SYNC", event: string): void { const now = new Date();
  serverAuditLogs.unshift({ id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestampIso: now.toISOString(), timeFa: formatTehranTimeFa(now), level, event: sanitizeInput(event, 240) });
  if (serverAuditLogs.length > 200) serverAuditLogs = serverAuditLogs.slice(0, 200); }
export function loadDiskPersistedCache(): void { try { if (!fs.existsSync(DISK_CACHE_FILE)) return; const parsed = JSON.parse(fs.readFileSync(DISK_CACHE_FILE, "utf-8")); if (!parsed || typeof parsed !== "object") return;
    if (parsed.deepSyncedOverrides && typeof parsed.deepSyncedOverrides === "object") { const rawOverrides = parsed.deepSyncedOverrides as Record<string, unknown>; const hasLegacyNumericKeys = Object.keys(rawOverrides).some((key) => /^\d+$/.test(key)); deepSyncedOverrides = parsePersistedDeepOverrides(rawOverrides);
      if (hasLegacyNumericKeys) pushAuditLog("WARN", "بازنویسیهای قیمت قدیمی بدون شناسهٔ شهر شناسایی شدند؛ این دادهها برای جلوگیری از اختلاط محلهها بارگذاری نشدند."); }
    if (parsed.liveMacroRates && typeof parsed.liveMacroRates === "object") { const rawMacro = parsed.liveMacroRates as Record<string, unknown>; liveMacroRates = { gold18kToman: Math.round(clampNumber(rawMacro.gold18kToman, 2_000_000, 35_000_000, liveMacroRates.gold18kToman)), usdToman: Math.round(clampNumber(rawMacro.usdToman, 40_000, 350_000, liveMacroRates.usdToman)), updatedAtIso: typeof rawMacro.updatedAtIso === "string" && Number.isFinite(Date.parse(rawMacro.updatedAtIso)) ? rawMacro.updatedAtIso : liveMacroRates.updatedAtIso }; } if (Array.isArray(parsed.serverAuditLogs)) serverAuditLogs = parsed.serverAuditLogs.filter((l: unknown): l is ServerAuditLogEntry => Boolean(l && typeof l === "object" && typeof (l as ServerAuditLogEntry).id === "string" && typeof (l as ServerAuditLogEntry).event === "string")).slice(0, 200).map((l: ServerAuditLogEntry) => ({ id: sanitizeInput(l.id, 64), timestampIso: typeof l.timestampIso === "string" ? l.timestampIso : new Date().toISOString(), timeFa: typeof l.timeFa === "string" ? sanitizeInput(l.timeFa, 32) : "", level: l.level === "WARN" || l.level === "SYNC" ? l.level : "INFO", event: sanitizeInput(l.event, 240) }));
    if (parsed.cityAirStations && typeof parsed.cityAirStations === "object") { for (const cId of Object.keys(MULTI_CITY_CONFIGS) as CityId[]) { if (parsed.cityAirStations[cId] && typeof parsed.cityAirStations[cId] === "object") CITY_AIR_STATIONS[cId] = { ...CITY_AIR_STATIONS[cId], ...parsed.cityAirStations[cId] }; }
      latestZoneAirQuality = CITY_AIR_STATIONS.tehran; } else if (parsed.latestZoneAirQuality && typeof parsed.latestZoneAirQuality === "object") { CITY_AIR_STATIONS.tehran = { ...CITY_AIR_STATIONS.tehran, ...parsed.latestZoneAirQuality }; latestZoneAirQuality = CITY_AIR_STATIONS.tehran; }
    if (typeof parsed.lastPulseUpdatedMs === "number" && Number.isFinite(parsed.lastPulseUpdatedMs) && parsed.lastPulseUpdatedMs > 0 && parsed.lastPulseUpdatedMs <= Date.now() + 60_000) lastPulseUpdatedMs = parsed.lastPulseUpdatedMs; const rawCityTimestamps = parsed.lastPulseUpdatedMsByCity;
    if (rawCityTimestamps && typeof rawCityTimestamps === "object" && !Array.isArray(rawCityTimestamps)) { const nextTimestamps: Partial<Record<CityId, number>> = {}; for (const cityId of Object.keys(MULTI_CITY_CONFIGS) as CityId[]) { const value = (rawCityTimestamps as Record<string, unknown>)[cityId];
        if (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= Date.now() + 60_000) nextTimestamps[cityId] = value; }
      lastPulseUpdatedMsByCity = nextTimestamps; }
    if (Array.isArray(parsed.buyerLeads)) saveDiskPersistedCache();
  } catch { /* ignore */ }
}
let pendingDiskSaveTimer: ReturnType<typeof setTimeout> | null = null; let diskWriteMutexChain: Promise<void> = Promise.resolve(); let diskCacheDirty = false;
async function flushDiskCache(): Promise<void> {
  const currentTask = diskWriteMutexChain.catch(() => {}).then(async () => {
    if (!diskCacheDirty) return;
    diskCacheDirty = false;
    const payload = { savedAtIso: new Date().toISOString(), lastPulseUpdatedMs, lastPulseUpdatedMsByCity, deepSyncedOverrides, liveMacroRates, latestZoneAirQuality: CITY_AIR_STATIONS.tehran, cityAirStations: CITY_AIR_STATIONS, serverAuditLogs: serverAuditLogs.slice(0, 200) };
    const tmp = `${DISK_CACHE_FILE}.tmp.${process.pid}.${Date.now()}`;
    try {
      await fs.promises.writeFile(tmp, JSON.stringify(payload, null, 2), { encoding: "utf-8", mode: 0o600 });
      await fs.promises.rename(tmp, DISK_CACHE_FILE);
      await fs.promises.chmod(DISK_CACHE_FILE, 0o600).catch(() => {});
    } catch {
      diskCacheDirty = true;
      await fs.promises.unlink(tmp).catch(() => {});
    }
  });
  diskWriteMutexChain = currentTask;
  await currentTask;
}
function scheduleDiskCacheFlush(): void { if (pendingDiskSaveTimer) clearTimeout(pendingDiskSaveTimer); pendingDiskSaveTimer = setTimeout(() => { pendingDiskSaveTimer = null; void flushDiskCache(); }, 400); }
export function saveDiskPersistedCache(): void { diskCacheDirty = true; scheduleDiskCacheFlush(); }
export const scheduleSaveCacheToDisk = saveDiskPersistedCache;
export function getBuyerLeads(): any[] { return serverSideBuyerLeads; }
export function appendBuyerLead(lead: any): void { serverSideBuyerLeads.unshift(lead); if (serverSideBuyerLeads.length > 500) serverSideBuyerLeads = serverSideBuyerLeads.slice(0, 500); }
export function cacheBuyerAlertAfterDurableCommit(committed: boolean, lead: BuyerAlertLeadItem): boolean { if (!committed) return false; const nowMs = Date.now(); for (let i = serverSideBuyerLeads.length - 1; i >= 0; i--) { const exp = Date.parse(serverSideBuyerLeads[i]?.expiresAtIso || ''); if (Number.isFinite(exp) && exp <= nowMs) serverSideBuyerLeads.splice(i, 1); } const idx = serverSideBuyerLeads.findIndex((existing) => existing.id === lead.id); if (idx >= 0) serverSideBuyerLeads[idx] = lead; else serverSideBuyerLeads.unshift(lead); if (serverSideBuyerLeads.length > 200) serverSideBuyerLeads.length = 200; return true; }
export function getCityCache(cityId: CityId = "tehran", areaUnit: AreaUnit = "sqm", intlCurrency: IntlCurrencyCode = "USD") {
  const pulse = cachedMarketPulseByCity[cityId]; const hoods = getCityNeighborhoods(cityId);
  const avgBuy = pulse?.marketSummary.tehranAverageBuyPerSqm ?? Math.round(hoods.reduce((s, h) => s + h.buyPerSqm, 0) / Math.max(1, hoods.length));
  const avgRahn = pulse?.marketSummary.tehranAverageRahn80m ?? Math.round(hoods.reduce((s, h) => s + h.rahn80m, 0) / Math.max(1, hoods.length));
  const aqi = pulse?.airQuality.tehranAverageAqi ?? 85;
  return { cityWideAvgBuyPerSqm: avgBuy, cityWideAvgRahn80m: avgRahn, gold18kToman: liveMacroRates.gold18kToman, usdToman: liveMacroRates.usdToman, tehranAqi: aqi, aqiStatusText: classifyUsAqi(aqi), displayAreaUnitLabel: formatAreaUnitLabel(areaUnit), cityWideAvgBuyPerSqmIntlText: formatMillionTomanAsIntlCurrency(avgBuy, intlCurrency, "en") };
}
export function classifyUsAqi(aqi: number): string {
  return aqi <= 50 ? "پاک و ایدهآل (سبز)" : aqi <= 100 ? "سالم / قابل قبول (زرد)" : aqi <= 150 ? "ناسالم برای گروههای حساس (نارنجی)" : aqi <= 200 ? "ناسالم برای عموم (قرمز)" : "بسیار ناسالم / اضطراری (بنفش)";
}
export interface CityAirQualityFetchStatus { successCount: number; totalCount: number; lastAttemptIso: string | null; lastSuccessIso: string | null; }
export const cityAirQualityFetchStatus: Partial<Record<CityId, CityAirQualityFetchStatus>> = {};
export async function refreshCityAirQuality(cityId: CityId = "tehran"): Promise<boolean> {
  const now = Date.now();
  if (now - (lastAirQualityFetchMs[cityId] ?? 0) < 60_000) return airQualityLastOkByCity[cityId] ?? false;
  const cityStations = CITY_AIR_STATIONS[cityId];
  if (!cityStations) { airQualityLastOkByCity[cityId] = false; if (cityId === "tehran") openMeteoLastOk = false; return false; }
  lastAirQualityFetchMs[cityId] = now;
  let successCount = 0;
  const entries = Object.entries(cityStations);
  await Promise.all(entries.map(async ([key, existingStation]) => {
    try {
      const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
      url.searchParams.set("latitude", String(existingStation.lat));
      url.searchParams.set("longitude", String(existingStation.lng));
      url.searchParams.set("current", "us_aqi,pm2_5");
      const response = await fetch(url.toString(), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5_000) });
      if (!response.ok) return;
      const rawText = await response.text();
      if (rawText.length > 65_536) return;
      const payload: unknown = JSON.parse(rawText);
      if (!payload || typeof payload !== "object" || !("current" in payload)) return;
      const current = (payload as { current?: { us_aqi?: unknown; pm2_5?: unknown } }).current;
      if (!current) return;
      const rawAqi = current.us_aqi; const rawPm25 = current.pm2_5;
      if (typeof rawAqi !== "number" || !Number.isFinite(rawAqi) || rawAqi < 0 || rawAqi > 500 || typeof rawPm25 !== "number" || !Number.isFinite(rawPm25) || rawPm25 < 0 || rawPm25 > 1_000) return;
      const aqi = Math.round(rawAqi); const pm25 = Number(rawPm25.toFixed(1));
      cityStations[key] = { ...existingStation, aqi, pm25, status: classifyUsAqi(aqi), source: "open-meteo", fetchedAtIso: new Date().toISOString() };
      successCount++;
    } catch { /* Retain previous valid value */ }
  }));
  const success = successCount > 0;
  const nowIso = new Date().toISOString();
  const previousStatus = cityAirQualityFetchStatus[cityId];
  airQualityLastOkByCity[cityId] = success;
  lastAirQualityFetchSucceeded[cityId] = success;
  airQualityStationSuccessCount[cityId] = successCount;
  cityAirQualityFetchStatus[cityId] = { successCount, totalCount: entries.length, lastAttemptIso: nowIso, lastSuccessIso: success ? nowIso : previousStatus?.lastSuccessIso ?? null };
  if (success) airQualityLastSuccessMsByCity[cityId] = Date.now();
  if (cityId === "tehran") { openMeteoLastOk = success; latestZoneAirQuality = CITY_AIR_STATIONS.tehran; }
  if (!success) pushAuditLog("WARN", `دریافت دادهٔ کیفیت هوا برای ${MULTI_CITY_CONFIGS[cityId]?.nameFa || cityId} موفق نبود؛ مقادیر قبلی حفظ شدند.`);
  return success;
}
export function getCityOverallTrafficSummary(cityId: CityId = "tehran") {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const hour = Number.parseInt(parts.find((p) => p.type === "hour")?.value || "12", 10);
  const weekday = parts.find((p) => p.type === "weekday")?.value || "Sat";
  const cityName = MULTI_CITY_CONFIGS[cityId]?.nameFa || "تهران";
  if (weekday === "Fri") return { statusLabel: `برآورد قاعده‌محور ترافیک پایان هفته در بزرگراه‌های ${cityName}`, peakWindow: "۱۷:۰۰ تا ۲۱:۳۰ (محورهای تفریحی و خروجی‌ها)", seasonalNote: "برآورد الگوی زمانی؛ سنسور ترافیک بلادرنگ متصل نیست." };
  if (hour >= 7 && hour <= 10) return { statusLabel: `برآورد قاعده‌محور ترافیک سنگین صبحگاهی در محورهای ورودی مرکز ${cityName}`, peakWindow: "۰۷:۱۵ تا ۱۰:۰۰ صبح", seasonalNote: "برآورد الگوی زمانی ساعات کاری؛ سنسور ترافیک بلادرنگ متصل نیست." };
  if (hour >= 16 && hour <= 20) return { statusLabel: `برآورد قاعده‌محور ترافیک عصرگاهی در بزرگراه‌های اصلی ${cityName}`, peakWindow: "۱۶:۳۰ تا ۲۰:۳۰ شب", seasonalNote: "برآورد الگوی زمانی بازگشت کاری؛ سنسور ترافیک بلادرنگ متصل نیست." };
  return { statusLabel: `برآورد قاعده‌محور ترافیک نیمه‌سنگین تا روان در معابر اصلی ${cityName}`, peakWindow: "۰۷:۳۰ تا ۱۰:۰۰ و ۱۶:۳۰ تا ۲۰:۳۰", seasonalNote: "برآورد الگوی زمانی؛ سنسور ترافیک بلادرنگ متصل نیست." };
}
export async function performGeminiDeepMarketSearch(cityId: CityId = "tehran"): Promise<{ usedGemini: boolean; sources: GroundingSourceLink[] }> {
  const cfg = getValidatedServerConfig();
  const sources: GroundingSourceLink[] = [];
  if (!cfg.geminiConfigured || !cfg.geminiApiKey) {
    const hoods = getCityNeighborhoods(cityId);
    const nowIso = new Date().toISOString();
    let divarDataUsed = false;
    for (const h of hoods.slice(0, 6)) {
      const scraped = await fetchFreeDivarNeighborhoodStats(cityId, h.name, h.buyPerSqm);
      if (scraped.medianBuyPerSqm) {
        divarDataUsed = true;
        setDeepSyncedOverride(cityId, h.id, {
          buyPerSqm: scraped.medianBuyPerSqm, rahn80m: Math.round((scraped.medianBuyPerSqm / Math.max(1, h.buyPerSqm)) * h.rahn80m),
          liveBargains: scraped.bargains.length > 0 ? scraped.bargains : undefined, updatedAtIso: nowIso,
        });
      }
    }
    if (divarDataUsed) sources.push({ title: "آگهیهای بررسیشدهٔ Divar؛ نمونهٔ محدود، نه شاخص رسمی بازار", uri: "https://divar.ir/" });
    return { usedGemini: false, sources };
  }
  try {
    const ai = new GoogleGenAI({ apiKey: cfg.geminiApiKey, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
    const cityNameFa = MULTI_CITY_CONFIGS[cityId]?.nameFa || "تهران";
    const hoods = getCityNeighborhoods(cityId);
    const hoodQueryList = hoods.map((h) => `{id:${h.id},name:"${h.name}",baseBuy:${h.buyPerSqm},baseRahn:${h.rahn80m}}`).join(", ");
    const prompt = `Search Iranian real estate market sources (Divar, Delta, Kilid, Melkana, Donya-e-Eqtesad) for the latest average residential apartment price per square meter (buyPerSqm in Million Tomans) and 80m2 full deposit (rahn80m in Million Tomans) in ${cityNameFa} for these neighborhoods: [${hoodQueryList}]. Also find the latest 18k Gold per gram price in Tomans (gold18kToman) and open-market USD price in Tomans (usdToman). Return strict JSON.`;
    const response = await ai.models.generateContent({
      model: cfg.geminiModel || "gemini-2.5-flash", contents: prompt,
      config: {
        abortSignal: AbortSignal.timeout(10_000), tools: [{ googleSearch: {} }], responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT, required: ["neighborhoodPrices"],
          properties: {
            gold18kToman: { type: Type.NUMBER }, usdToman: { type: Type.NUMBER },
            neighborhoodPrices: {
              type: Type.ARRAY,
              items: { type: Type.OBJECT, required: ["id", "buyPerSqm", "rahn80m"], properties: { id: { type: Type.NUMBER }, buyPerSqm: { type: Type.NUMBER }, rahn80m: { type: Type.NUMBER } } },
            },
          },
        },
      },
    });
    const parsed = JSON.parse(response.text || "{}");
    const nowIso = new Date().toISOString();
    if (typeof parsed.gold18kToman === "number" && parsed.gold18kToman >= 2_000_000) { liveMacroRates.gold18kToman = Math.round(clampNumber(parsed.gold18kToman, 2_000_000, 35_000_000, liveMacroRates.gold18kToman)); liveMacroRates.updatedAtIso = nowIso; }
    if (typeof parsed.usdToman === "number" && parsed.usdToman >= 40_000) { liveMacroRates.usdToman = Math.round(clampNumber(parsed.usdToman, 40_000, 350_000, liveMacroRates.usdToman)); liveMacroRates.updatedAtIso = nowIso; }
    if (Array.isArray(parsed.neighborhoodPrices)) {
      const { FieldValue } = await import("firebase-admin/firestore"); const { getFirebaseAdminFirestoreForServer } = await import("./serverAdminAndTelegramSecurity");
      let adminDb: ReturnType<typeof getFirebaseAdminFirestoreForServer> | null = null; try { adminDb = getFirebaseAdminFirestoreForServer(); } catch { adminDb = null; }
      for (const item of parsed.neighborhoodPrices) {
        const seed = hoods.find((h) => h.id === Number(item?.id)); if (!seed) continue;
        const buyPerSqm = Math.round(clampNumber(item.buyPerSqm, Math.max(20, Math.round(seed.buyPerSqm * 0.6)), Math.round(seed.buyPerSqm * 1.85), seed.buyPerSqm));
        const rahn80m = Math.round(clampNumber(item.rahn80m, Math.max(120, Math.round(seed.rahn80m * 0.6)), Math.round(seed.rahn80m * 1.85), seed.rahn80m));
        setDeepSyncedOverride(cityId, seed.id, { buyPerSqm, rahn80m, updatedAtIso: nowIso });
        if (adminDb) {
          try {
            const ref = adminDb.collection("neighborhoodOverrides").doc(String(seed.id)); const existing = (await ref.get()).data();
            if (!(existing?.overrideSource === "ADMIN_MANUAL" && Number(existing?.manualLockUntilMs) > Date.now())) {
              await ref.set({ hoodId: seed.id, buyPerSqm, rahn80m, overrideSource: "SERVER_DEEP_SYNC", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            }
          } catch { /* Offline fallback */ }
        }
      }
    }
    for (const chunk of response.candidates?.[0]?.groundingMetadata?.groundingChunks || []) {
      if (chunk.web?.uri && /^https?:\/\//i.test(chunk.web.uri) && chunk.web?.title) sources.push({ title: sanitizeInput(chunk.web.title, 90), uri: sanitizeInput(chunk.web.uri, 400) });
    }
    pushAuditLog("SYNC", `بروزرسانی عمیق Gemini برای قیمت محلههای ${cityNameFa} و نرخ طلا/دلار انجام شد.`);
    return { usedGemini: true, sources: sources.slice(0, 6) };
  } catch { return { usedGemini: false, sources }; }
}
export function describeLiveTrafficWithWeather(baseStatus: string, weather: { snowfallCm: number; isRainingOrSnowing: boolean; provenance?: { qualityStatus?: string } }): { status: string; weatherLive: boolean } {
  const weatherLive = weather.provenance?.qualityStatus === 'verified_live'; if (!weatherLive) return { status: baseStatus, weatherLive: false };
  if (weather.snowfallCm > 0) return { status: `❄️ بارش برف و کندی تردد (${baseStatus})`, weatherLive: true };
  return { status: weather.isRainingOrSnowing ? `🌧️ بارندگی و ترافیک سنگینتر (${baseStatus})` : baseStatus, weatherLive: true };
}
export async function buildMarketPulseSnapshot(cityId: CityId = "tehran", cacheState: MarketPulseData["cacheStatus"] = "REFRESHED", sources: GroundingSourceLink[] = []): Promise<MarketPulseData> {
  await refreshCityAirQuality(cityId); try { liveMacroRates = await fetchFreeLiveGoldAndUsdRates(liveMacroRates); } catch { /* retain current */ }
  const cityCenter = MULTI_CITY_CONFIGS[cityId]?.center || [35.7219, 51.3347]; const weather = await fetchFreeCityWeather(cityCenter[0], cityCenter[1]);
  const hoods = getCityNeighborhoods(cityId); if (hoods.length === 0) throw new Error(`NO_NEIGHBORHOODS_CONFIGURED_FOR_CITY:${cityId}`);
  const stationReadings = Object.values(CITY_AIR_STATIONS[cityId]);
  const stations = stationReadings.map((s) => ({
    region: s.region, stationName: s.stationName, aqi: s.aqi, pm25: s.pm25, status: s.status,
    source: s.source === "open-meteo" ? ("open-meteo" as const) : ("fallback" as const), fetchedAtIso: s.fetchedAtIso,
  }));
  const liveStations = stationReadings.filter((s) => s.source === "open-meteo" && typeof s.fetchedAtIso === "string" && Number.isFinite(Date.parse(s.fetchedAtIso)));
  const validStationCount = stationReadings.length;
  const liveStationCount = liveStations.length;
  const dataStatus: "live" | "mixed" | "fallback" = liveStationCount === validStationCount && validStationCount > 0 ? "live" : liveStationCount > 0 ? "mixed" : "fallback";
  const lastSuccessfulFetchMs = liveStations.reduce((latest, s) => {
    const ts = Date.parse(s.fetchedAtIso || "");
    return Number.isFinite(ts) ? Math.max(latest, ts) : latest;
  }, 0);
  const lastSuccessIso = lastSuccessfulFetchMs > 0 ? new Date(lastSuccessfulFetchMs).toISOString() : undefined;
  const avgAqi = Math.round(stationReadings.reduce((sum, s) => sum + s.aqi, 0) / Math.max(1, stationReadings.length));
  const avgPm25 = Number((stationReadings.reduce((sum, s) => sum + s.pm25, 0) / Math.max(1, stationReadings.length)).toFixed(1));
  const airStatus = cityAirQualityFetchStatus[cityId];
  const airSourceStatus: "LIVE" | "PARTIAL" | "STALE" | "SEED" = !airStatus
    ? "SEED" : airStatus.successCount === airStatus.totalCount && airStatus.totalCount > 0 ? "LIVE" : airStatus.successCount > 0 ? "PARTIAL" : airStatus.lastSuccessIso ? "STALE" : "SEED";
  const hoodLiveSnapshots: HoodLiveSnapshot[] = hoods.map((h) => {
    const override = getDeepSyncedOverride(cityId, h.id);
    const liveBuyPerSqm = override?.buyPerSqm ?? h.buyPerSqm;
    const liveRahn80m = override?.rahn80m ?? h.rahn80m;
    const traffic = getNeighborhoodTrafficInfo(h);
    const nearestStation = stationReadings.reduce((best, cur) => {
      const dCur = Math.hypot((h.lat - cur.lat) * 111, (h.lng - cur.lng) * 90);
      const dBest = Math.hypot((h.lat - best.lat) * 111, (h.lng - best.lng) * 90);
      return dCur < dBest ? cur : best;
    }, stationReadings[0] || { aqi: avgAqi, pm25: avgPm25, lat: h.lat, lng: h.lng });
    const hoodAqi = nearestStation?.aqi ?? avgAqi;
    const hoodPm25 = nearestStation?.pm25 ?? avgPm25;
    const liveAirScore = clampNumber(Number((10 - (hoodAqi - 45) / 28).toFixed(1)), 3.5, 9.8, h.air);
    const trafficWithWeather = describeLiveTrafficWithWeather(traffic.liveStatus, weather);
    const weatherPenalty = !trafficWithWeather.weatherLive ? 0 : weather.snowfallCm > 0 ? (h.flatTerrain <= 6 ? 2.2 : 1.2) : weather.isRainingOrSnowing ? (h.flatTerrain <= 6 ? 1.3 : 0.7) : 0;
    const liveTrafficScore = clampNumber(Number((traffic.trafficScore - weatherPenalty).toFixed(1)), 2.5, 9.8, traffic.trafficScore);
    const liveTrafficStatus = trafficWithWeather.status;
    return {
      id: h.id, name: h.name, liveBuyPerSqm, liveRahn80m, liveAirScore, stationAqi: hoodAqi, pm25: hoodPm25,
      hourlyChangePercent: 0, liveTrafficStatus, liveTrafficScore, peakHours: traffic.peakHours,
      seasonalAnalysis: traffic.seasonalAnalysis, bottlenecks: traffic.bottlenecks, liveBargains: override?.liveBargains,
    };
  });
  const sortedByBuy = [...hoodLiveSnapshots].sort((a, b) => a.liveBuyPerSqm - b.liveBuyPerSqm);
  const cheapestSnap = sortedByBuy[0] || hoodLiveSnapshots[0];
  const mostExpensiveSnap = sortedByBuy[sortedByBuy.length - 1] || hoodLiveSnapshots[0];
  const cheapestHood = hoods.find((h) => h.id === cheapestSnap?.id) || hoods[0];
  const mostExpensiveHood = hoods.find((h) => h.id === mostExpensiveSnap?.id) || hoods[0];
  const avgBuy = Math.round(hoodLiveSnapshots.reduce((acc, s) => acc + s.liveBuyPerSqm, 0) / Math.max(1, hoodLiveSnapshots.length));
  const avgRahn = Math.round(hoodLiveSnapshots.reduce((acc, s) => acc + s.liveRahn80m, 0) / Math.max(1, hoodLiveSnapshots.length));
  const totalBargainsCount = hoods.reduce((acc, hood) => acc + mergeEffectiveBargains(hood.bargains, getDeepSyncedOverride(cityId, hood.id)?.liveBargains).length, 0);
  const now = new Date(); const nextDate = new Date(now.getTime() + MONITORING_INTERVAL_MS);
  return {
    status: "ok", cacheStatus: cacheState, lastUpdatedIso: now.toISOString(),
    lastUpdatedTimeFa: formatTehranTimeFa(now), nextRefreshMinutes: 120, nextScheduledTimeFa: formatTehranTimeFa(nextDate),
    schedulerWindowLabel: "بروزرسانی خودکار هر ۲ ساعت", tehranTrafficSummary: getCityOverallTrafficSummary(cityId),
    liveMacroRates, groundingSources: sources.slice(0, 6),
    airQuality: {
      cityId, sourceStatus: airSourceStatus, lastObservedAtIso: airStatus?.lastSuccessIso ?? null,
      stationSuccessCount: airStatus?.successCount ?? 0, stationCount: stations.length,
      lastAttemptMs: lastAirQualityFetchMs[cityId] ?? null, successfulStations: airQualityStationSuccessCount[cityId] ?? 0,
      totalStations: stations.length, tehranAverageAqi: avgAqi, tehranPm25: avgPm25, tehranAveragePm25: avgPm25,
      statusLabel: classifyUsAqi(avgAqi), dominantPollutant: "PM2.5", dataStatus, liveStationCount,
      totalStationCount: validStationCount, lastSuccessIso, stations,
    },
    marketSummary: {
      totalNeighborhoods: hoods.length, totalBargainsCount, tehranAverageBuyPerSqm: avgBuy, tehranAverageRahn80m: avgRahn,
      cheapestNeighborhood: { id: cheapestHood.id, name: cheapestHood.name, zone: cheapestHood.zone, buyPerSqm: cheapestSnap?.liveBuyPerSqm ?? cheapestHood.buyPerSqm, rahn80m: cheapestSnap?.liveRahn80m ?? cheapestHood.rahn80m },
      mostExpensiveNeighborhood: { id: mostExpensiveHood.id, name: mostExpensiveHood.name, zone: mostExpensiveHood.zone, buyPerSqm: mostExpensiveSnap?.liveBuyPerSqm ?? mostExpensiveHood.buyPerSqm, rahn80m: mostExpensiveSnap?.liveRahn80m ?? mostExpensiveHood.rahn80m },
    },
    hoodLiveSnapshots,
  };
}
export async function executeDeepMonitoringCycle(cityId: CityId = "tehran", forceGemini = false): Promise<MarketPulseData> {
  const activeFlight = marketPulseFlights.get(cityId);
  if (activeFlight) {
    if (activeFlight.kind === "deep" || !forceGemini) return activeFlight.promise;
    try { await activeFlight.promise; } catch { /* retry deep */ }
    return executeDeepMonitoringCycle(cityId, true);
  }
  const work = (async (): Promise<MarketPulseData> => {
    let sources: GroundingSourceLink[] = [];
    let usedGemini = false;
    if (forceGemini) {
      const result = await performGeminiDeepMarketSearch(cityId);
      sources = result.sources; usedGemini = result.usedGemini;
    } const snapshot = await buildMarketPulseSnapshot(cityId, usedGemini ? "DEEP_SYNCED" : "REFRESHED", sources); cachedMarketPulseByCity[cityId] = snapshot; const completedAt = Date.now(); lastPulseUpdatedMs = completedAt; lastPulseUpdatedMsByCity[cityId] = completedAt; saveDiskPersistedCache(); return snapshot; })(); let trackedPromise!: Promise<MarketPulseData>; trackedPromise = work.finally(() => { if (marketPulseFlights.get(cityId)?.promise === trackedPromise) marketPulseFlights.delete(cityId); updateBackgroundSyncFlag(); }); marketPulseFlights.set(cityId, { kind: forceGemini ? "deep" : "regular", promise: trackedPromise }); updateBackgroundSyncFlag(); return trackedPromise; } export async function getOrUpdateMarketPulse(cityId: CityId = "tehran", forceRefresh = false): Promise<MarketPulseData> { const existing = cachedMarketPulseByCity[cityId]; const persistedTimestamp = lastPulseUpdatedMsByCity[cityId]; const snapshotTimestamp = existing ? Date.parse(existing.lastUpdatedIso) : Number.NaN; const lastUpdated = typeof persistedTimestamp === "number" && Number.isFinite(persistedTimestamp) && persistedTimestamp > 0 ? persistedTimestamp : snapshotTimestamp; const expired = !Number.isFinite(lastUpdated) || Date.now() - lastUpdated > MONITORING_INTERVAL_MS; if (!forceRefresh && existing && !expired) return { ...existing, cacheStatus: "HIT" }; return executeDeepMonitoringCycle(cityId, false); }
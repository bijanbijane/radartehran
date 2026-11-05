import assert from "node:assert/strict";
import { isMarketPulseData } from "../src/types/typeGuards";

function makeValidMarketPulseFixture() {
  const now = new Date().toISOString();

  return {
    status: "ok",
    cacheStatus: "REFRESHED",
    lastUpdatedIso: now,
    lastUpdatedTimeFa: "۱۲:۳۰",
    nextRefreshMinutes: 120,
    nextScheduledTimeFa: "۱۴:۳۰",
    schedulerWindowLabel: "بروزرسانی خودکار هر ۲ ساعت",

    groundingSources: [
      {
        title: "نمونه منبع معتبر",
        uri: "https://example.com/market",
      },
    ],

    airQuality: {
      tehranAverageAqi: 72,
      tehranPm25: 18.5,
      tehranAveragePm25: 18.5,
      statusLabel: "متوسط",
      dominantPollutant: "PM2.5",
      stations: [
        {
          region: "مرکز",
          stationName: "ایستگاه نمونه",
          aqi: 72,
          pm25: 18.5,
          status: "متوسط",
        },
      ],
    },

    marketSummary: {
      totalNeighborhoods: 2,
      totalBargainsCount: 4,
      tehranAverageBuyPerSqm: 120,
      tehranAverageRahn80m: 850,
      cheapestNeighborhood: {
        id: 1,
        name: "محله نمونه ارزان",
        zone: "مرکز",
        buyPerSqm: 90,
        rahn80m: 600,
      },
      mostExpensiveNeighborhood: {
        id: 2,
        name: "محله نمونه گران",
        zone: "شمال",
        buyPerSqm: 180,
        rahn80m: 1200,
      },
    },

    hoodLiveSnapshots: [
      {
        id: 1,
        name: "محله نمونه ارزان",
        liveBuyPerSqm: 90,
        liveRahn80m: 600,
        liveAirScore: 7.5,
        stationAqi: 72,
        pm25: 18.5,
        hourlyChangePercent: 0,
        liveTrafficStatus: "ترافیک متوسط",
        liveTrafficScore: 6.5,
        peakHours: "۷ تا ۹",
        seasonalAnalysis: "نمونه تحلیل فصلی",
        bottlenecks: "نمونه گلوگاه",
      },
    ],
  };
}

function assertPasses(
  name: string,
  actual: boolean
): void {
  assert.equal(actual, true, `${name}: expected valid`);
  console.log(`[PASS] ${name}`);
}

function assertFails(
  name: string,
  actual: boolean
): void {
  assert.equal(actual, false, `${name}: expected invalid`);
  console.log(`[PASS] ${name}`);
}

function runMarketPulseContractTests(): void {
  const valid = makeValidMarketPulseFixture();

  assertPasses(
    "Valid market-pulse response",
    isMarketPulseData(valid)
  );

  const invalidAqi = structuredClone(valid);
  invalidAqi.airQuality.tehranAverageAqi = 501;

  assertFails(
    "AQI above supported range",
    isMarketPulseData(invalidAqi)
  );

  const invalidPrice = structuredClone(valid);
  invalidPrice.marketSummary.tehranAverageBuyPerSqm =
    Number.POSITIVE_INFINITY;

  assertFails(
    "Infinite average price",
    isMarketPulseData(invalidPrice)
  );

  const invalidSnapshot = structuredClone(valid);
  delete (
    invalidSnapshot.hoodLiveSnapshots![0] as
      Partial<(typeof invalidSnapshot.hoodLiveSnapshots)[number]>
  ).peakHours;

  assertFails(
    "Snapshot missing required peakHours",
    isMarketPulseData(invalidSnapshot)
  );

  const invalidGrounding = structuredClone(valid);
  invalidGrounding.groundingSources![0].uri =
    "javascript:alert(1)";

  assertFails(
    "Unsafe grounding URL",
    isMarketPulseData(invalidGrounding)
  );

  const invalidTimestamp = structuredClone(valid);
  invalidTimestamp.lastUpdatedIso = "not-a-date";

  assertFails(
    "Invalid lastUpdatedIso",
    isMarketPulseData(invalidTimestamp)
  );

  const invalidCacheStatus = structuredClone(valid);
  invalidCacheStatus.cacheStatus = "UNKNOWN";

  assertFails(
    "Unknown cacheStatus",
    isMarketPulseData(invalidCacheStatus)
  );

  const invalidStation = structuredClone(valid);
  invalidStation.airQuality.stations[0].pm25 = -1;

  assertFails(
    "Negative PM2.5 value",
    isMarketPulseData(invalidStation)
  );

  const noSnapshots: Record<string, unknown> = structuredClone(valid);
  delete noSnapshots.hoodLiveSnapshots;

  assertPasses(
    "Response without optional hoodLiveSnapshots",
    isMarketPulseData(noSnapshots)
  );

  console.log("All market-pulse contract tests passed.");
}

runMarketPulseContractTests();

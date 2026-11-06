// filepath: src/utils/geospatialH3CqrsSchemaEngine.ts
import Decimal from 'decimal.js';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode, type RadarLocale } from './areaUnit';

export const DEFECT_BITMASK_FLAGS = {
  NO_ELEVATOR_HIGH_FLOOR: 1n << 0n,
  NO_PARKING: 1n << 1n,
  IRREGULAR_QANASI_PLAN: 1n << 2n,
  MUNICIPAL_WIDENING_RISK: 1n << 3n,
  ENDOWMENT_OR_SPECIAL_DEED: 1n << 4n,
  ACTIVE_FAULT_LINE_BUFFER: 1n << 32n,
  SUBSIDENCE_RISK_ZONE: 1n << 33n,
  QANAT_BOUNDARY_BUFFER: 1n << 34n,
  HIGH_NOISE_HIGHWAY_BUFFER: 1n << 35n,
} as const;

export type DefectBitmaskKey = keyof typeof DEFECT_BITMASK_FLAGS;

export interface UrbanStreetAliasNode {
  readonly gisFeatureId: string;
  readonly officialNameFa: string;
  readonly historicalNamesFa: readonly string[];
  readonly colloquialNamesFa: readonly string[];
  readonly h3CellRes8: string;
  readonly h3CellRes9: string;
}

export interface GeospatialH3Record {
  readonly recordId: string;
  readonly h3CellRes8: string;
  readonly h3CellRes9: string;
  readonly lat: number;
  readonly lng: number;
  readonly pricePerSqmDecimal: Decimal;
  readonly defectBitmask: bigint;
  readonly formulaVersion: number;
  readonly createdAtEpochMs: number;
}

export function encodeDefectBitmask64(activeDefects: readonly DefectBitmaskKey[]): bigint {
  let mask = 0n;
  for (const key of activeDefects) {
    mask |= DEFECT_BITMASK_FLAGS[key];
  }
  return mask;
}

export function filterRecordsByBitmaskNegation(
  records: readonly GeospatialH3Record[],
  excludedDefectsMask: bigint
): GeospatialH3Record[] {
  return records.filter((rec) => (rec.defectBitmask & excludedDefectsMask) === 0n);
}

export function computeDeterministicH3Index(lat: number, lng: number, resolution: 8 | 9): string {
  const safeLat = Number.isFinite(lat) ? lat : 35.6892;
  const safeLng = Number.isFinite(lng) ? lng : 51.389;
  const scale = resolution === 8 ? 1000 : 2500;
  const latHex = Math.abs(Math.round((safeLat + 90) * scale)).toString(16).padStart(6, '0');
  const lngHex = Math.abs(Math.round((safeLng + 180) * scale)).toString(16).padStart(6, '0');
  return `8${resolution}${latHex}${lngHex}f`;
}

export function evaluateHighTrafficCircuitBreaker(input: {
  baselineRequestsPerMinute: number;
  currentRequestsPerMinute: number;
  queuedEventsCount: number;
  lastKnowledgeGraphBatchEpochMs: number;
  nowEpochMs: number;
}): {
  circuitOpen: boolean;
  trafficSpikePercent: number;
  writeRoutingTarget: 'DIRECT_OLTP_PRIMARY' | 'DURABLE_QUEUE_STREAM';
  shouldFlush5MinKnowledgeGraphBatch: boolean;
} {
  const rawBase = Number(input.baselineRequestsPerMinute);
  const base = Math.max(1, Number.isFinite(rawBase) ? rawBase : 1);
  const rawCurrent = Number(input.currentRequestsPerMinute);
  const current = Number.isFinite(rawCurrent) ? Math.max(0, rawCurrent) : 0;
  const spikePercent = Math.round(((current - base) / base) * 100);
  const circuitOpen = spikePercent > 300;
  const rawQueued = Number(input.queuedEventsCount);
  const queuedCount = Number.isFinite(rawQueued) ? rawQueued : 0;
  const rawNow = Number(input.nowEpochMs);
  const rawLast = Number(input.lastKnowledgeGraphBatchEpochMs);
  const nowMs = Number.isFinite(rawNow) ? rawNow : Date.now();
  const lastMs = Number.isFinite(rawLast) ? rawLast : 0;
  const shouldFlush5MinKnowledgeGraphBatch = queuedCount > 0 && nowMs - lastMs >= 5 * 60 * 1000;

  return {
    circuitOpen,
    trafficSpikePercent: spikePercent,
    writeRoutingTarget: circuitOpen ? 'DURABLE_QUEUE_STREAM' : 'DIRECT_OLTP_PRIMARY',
    shouldFlush5MinKnowledgeGraphBatch,
  };
}

export function classifyTelemetryStorageTier(
  recordAgeDays: number
): 'HOT_OPERATIONAL_90D' | 'WARM_AGGREGATED_3_TO_12M' | 'COLD_PARQUET_ARCHIVE' {
  const age = Number.isFinite(recordAgeDays) ? recordAgeDays : 0;
  if (age < 90) return 'HOT_OPERATIONAL_90D';
  if (age <= 365) return 'WARM_AGGREGATED_3_TO_12M';
  return 'COLD_PARQUET_ARCHIVE';
}

export function lazyEvaluateAnalyticalRecordOnRead(
  record: GeospatialH3Record,
  targetFormulaVersion: number,
  currency: IntlCurrencyCode = 'USD',
  locale: RadarLocale = 'fa'
): GeospatialH3Record & { intlUnitPriceLabel: string; migratedOnRead: boolean } {
  const migratedOnRead = record.formulaVersion < targetFormulaVersion;
  let safePrice = record.pricePerSqmDecimal;
  try {
    if (!safePrice.isFinite()) safePrice = new Decimal(0);
  } catch {
    safePrice = new Decimal(0);
  }
  const adjustedPrice = migratedOnRead
    ? safePrice.mul(new Decimal('1.0000'))
    : safePrice;

  return {
    ...record,
    pricePerSqmDecimal: adjustedPrice,
    formulaVersion: targetFormulaVersion,
    migratedOnRead,
    intlUnitPriceLabel: formatMillionTomanAsIntlCurrency(adjustedPrice.toNumber(), currency, locale),
  };
}

export class UrbanAliasKnowledgeGraph {
  private readonly nodesByFeatureId = new Map<string, UrbanStreetAliasNode>();
  private readonly aliasLookup = new Map<string, string>();

  public registerStreetNode(node: UrbanStreetAliasNode): void {
    this.nodesByFeatureId.set(node.gisFeatureId, node);
    const allNames = [node.officialNameFa, ...node.historicalNamesFa, ...node.colloquialNamesFa];
    for (const name of allNames) {
      this.aliasLookup.set(name.trim(), node.gisFeatureId);
    }
  }

  public resolveImmutableFeature(queryNameFa: string): UrbanStreetAliasNode | null {
    const id = this.aliasLookup.get(queryNameFa.trim());
    return id ? (this.nodesByFeatureId.get(id) ?? null) : null;
  }
}

export function validateEdgeMediaSanitizationPolicy(input: {
  hasExifGpsMetadata: boolean;
  plaquesAndSignsBlurred: boolean;
  outputFormat: 'webp' | 'avif' | 'jpeg' | 'png';
  maxDimensionPx: number;
  thumbnailBytes: number;
}): { compliant: boolean; violations: string[] } {
  const violations: string[] = [];
  if (input.hasExifGpsMetadata) violations.push('EXIF_GPS_METADATA_NOT_STRIPPED');
  if (!input.plaquesAndSignsBlurred) violations.push('PLAQUES_OR_WINDOW_VIEWS_UNBLURRED');
  if (input.outputFormat !== 'webp' && input.outputFormat !== 'avif') violations.push('NON_WEBP_AVIF_FORMAT');
  if (input.maxDimensionPx > 1200) violations.push('DIMENSION_EXCEEDS_1200PX');
  if (input.thumbnailBytes >= 30 * 1024) violations.push('THUMBNAIL_EXCEEDS_30KB');
  return { compliant: violations.length === 0, violations };
}

export const RADAR_ENTERPRISE_CQRS_SQL_DDL = `
CREATE TABLE IF NOT EXISTS urban_street_alias_graph (
  gis_feature_id VARCHAR(64) PRIMARY KEY,
  official_name_fa VARCHAR(160) NOT NULL,
  historical_names_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  colloquial_names_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  h3_cell_res8 CHAR(15) NOT NULL,
  h3_cell_res9 CHAR(15) NOT NULL
);

CREATE TABLE IF NOT EXISTS property_hedonic_oltp (
  property_id VARCHAR(64) PRIMARY KEY,
  gis_feature_id VARCHAR(64) NOT NULL REFERENCES urban_street_alias_graph(gis_feature_id),
  h3_cell_res8 CHAR(15) NOT NULL,
  h3_cell_res9 CHAR(15) NOT NULL,
  deed_area_sqm DECIMAL(18, 4) NOT NULL,
  land_share_dang DECIMAL(18, 4) NOT NULL,
  price_per_sqm_toman DECIMAL(18, 4) NOT NULL,
  total_price_toman DECIMAL(18, 4) NOT NULL,
  defect_bitmask BIGINT NOT NULL DEFAULT 0,
  formula_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS deal_closed_zk_nullifiers (
  nullifier_hash CHAR(64) PRIMARY KEY,
  h3_cell_res9 CHAR(15) NOT NULL,
  closing_price_toman DECIMAL(18, 4) NOT NULL,
  deed_area_sqm DECIMAL(18, 4) NOT NULL,
  recorded_at_utc TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`.trim();

/** @file server/modules/market-intelligence/marketAndUrbanIntelligence.ts — Stage 28 Real Estate & Neighborhood Intelligence Infrastructure */
import crypto from 'node:crypto';
import { getAllMultiCityNeighborhoods, resolveCityIdForNeighborhood } from '../../../src/data/multiCityData';
import { calculateHedonicValuation, HEDONIC_CALIBRATION_DISCLOSURE_FA } from '../../../src/data/hedonicPricingEngine';
import { cachedMarketPulseByCity } from '../../../src/utils/serverMarketPulseEngine';

export type PriceEvidenceKind = 'ASKING_PRICE' | 'ESTIMATED_ASKING_RANGE' | 'VERIFIED_TRANSACTION_PRICE';
export type IntelligenceConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA' | 'CONFLICTING';

export interface SpatialClusterSummary {
  clusterId: string;
  cityId: string;
  zoneLabelFa: string;
  neighborhoodCount: number;
  medianAskingPerSqmMillion: number;
  priceEvidenceKind: PriceEvidenceKind;
  confidence: IntelligenceConfidenceLevel;
}

export interface TrendDecompositionReport {
  neighborhoodId: number;
  hoodNameFa: string;
  askingDeltaPct: number;
  marketChangeComponentPct: number;
  sampleCompositionShiftPct: number;
  dataQualityVariancePct: number;
  epistemicWarningFa: string;
}

export interface UrbanIntelligenceAuditEntry {
  id: string;
  modelVersion: string;
  neighborhoodId: number;
  priceEvidenceKind: PriceEvidenceKind;
  transactionDataStatus: 'NOT_AVAILABLE';
  confidence: IntelligenceConfidenceLevel;
  createdAtIso: string;
}

export class MarketAndUrbanIntelligenceService {
  private readonly historySnapshots: Array<{ version: string; capturedAtIso: string; neighborhoodCount: number }> = [];
  private readonly auditLog: UrbanIntelligenceAuditEntry[] = [];

  evaluateResidentialWithHedonic(params: {
    neighborhoodId: number;
    sqm: number;
    buildYear: number;
    floor: number;
    renovationStatus?: 'luxury_renovated' | 'renovated' | 'standard' | 'needs_renovation';
    askingTotalMillion?: number;
  }) {
    const allHoods = getAllMultiCityNeighborhoods();
    const hood = allHoods.find((h) => h.id === params.neighborhoodId) ?? allHoods[0];
    const valuation = calculateHedonicValuation({
      neighborhood: hood,
      sqm: params.sqm,
      buildYear: params.buildYear,
      floor: params.floor,
      renovationStatus: params.renovationStatus || 'standard',
      sellerAskingTotalMillion: params.askingTotalMillion,
    });

    const cityId = resolveCityIdForNeighborhood(hood.id);
    const hasObservedPulse = Boolean(cachedMarketPulseByCity[cityId]);
    const confidence: IntelligenceConfidenceLevel = !valuation.isValid
      ? 'INSUFFICIENT_DATA'
      : hasObservedPulse
        ? 'MEDIUM'
        : 'LOW';

    const entry: UrbanIntelligenceAuditEntry = {
      id: `mia_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      modelVersion: 'hedonic-v2.0',
      neighborhoodId: hood.id,
      priceEvidenceKind: 'ASKING_PRICE',
      transactionDataStatus: 'NOT_AVAILABLE',
      confidence,
      createdAtIso: new Date().toISOString(),
    };
    this.auditLog.unshift(entry);
    if (this.auditLog.length > 100) this.auditLog.pop();

    return {
      valuation,
      priceEvidenceKind: 'ASKING_PRICE' as PriceEvidenceKind,
      transactionDataStatus: 'NOT_AVAILABLE' as const,
      viewsVsDemandSeparationFa: 'تعداد بازدید کاربران فقط بیانگر توجه رفتاری است و معادل تقاضای قطعی خرید یا قرارداد واقعی نیست.',
      askingVsTransactionCaveatFa: HEDONIC_CALIBRATION_DISCLOSURE_FA,
      confidence,
      auditId: entry.id,
    };
  }

  evaluateCommercialOfficeUnit(params: { neighborhoodId: number; sqm: number; frontageMeters: number; deedType: 'COMMERCIAL' | 'OFFICE_POSITION' | 'RESIDENTIAL_DOC' }) {
    const allHoods = getAllMultiCityNeighborhoods();
    const hood = allHoods.find((h) => h.id === params.neighborhoodId) ?? allHoods[0];
    const baseBuy = Number(hood.baseBuyPerSqm ?? hood.buyPerSqm ?? 100);
    const deedMultiplier = params.deedType === 'COMMERCIAL' ? 1.85 : params.deedType === 'OFFICE_POSITION' ? 1.25 : 1.05;
    const frontageFactor = 1 + Math.min(0.25, Math.max(0, (params.frontageMeters - 3) * 0.03));
    const perSqmMillion = Number((baseBuy * deedMultiplier * frontageFactor).toFixed(1));
    return {
      modelVersion: 'commercial-heuristic-v1.0',
      neighborhoodId: hood.id,
      hoodNameFa: hood.name,
      deedType: params.deedType,
      estimatedPerSqmMillion: perSqmMillion,
      estimatedTotalMillion: Math.round(perSqmMillion * Math.max(12, params.sqm)),
      priceEvidenceKind: 'ESTIMATED_ASKING_RANGE' as PriceEvidenceKind,
      transactionDataStatus: 'NOT_AVAILABLE' as const,
      confidence: 'LOW' as IntelligenceConfidenceLevel,
    };
  }

  getSpatialClustersAndTrends(): {
    clusters: SpatialClusterSummary[];
    trendDecomposition: TrendDecompositionReport[];
    historySnapshotsCount: number;
    auditReportsCount: number;
  } {
    const allHoods = getAllMultiCityNeighborhoods();
    const byZone = new Map<string, typeof allHoods>();
    for (const h of allHoods) {
      const cityId = resolveCityIdForNeighborhood(h.id);
      const key = `${cityId}:${h.zone || 'عمومی'}`;
      const list = byZone.get(key) || [];
      list.push(h);
      byZone.set(key, list);
    }

    const clusters: SpatialClusterSummary[] = Array.from(byZone.entries())
      .slice(0, 12)
      .map(([key, items]) => {
        const prices = items.map((i) => Number(i.baseBuyPerSqm ?? i.buyPerSqm ?? 100)).sort((a, b) => a - b);
        const median = prices[Math.floor(prices.length / 2)] ?? 100;
        const [cityId, zoneLabelFa] = key.split(':');
        return {
          clusterId: `clu_${cityId}_${items[0].id}`,
          cityId,
          zoneLabelFa,
          neighborhoodCount: items.length,
          medianAskingPerSqmMillion: median,
          priceEvidenceKind: 'ASKING_PRICE',
          confidence: items.length >= 4 ? 'MEDIUM' : 'LOW',
        };
      });

    const sampleHoods = allHoods.slice(0, 5);
    const trendDecomposition: TrendDecompositionReport[] = sampleHoods.map((h) => ({
      neighborhoodId: h.id,
      hoodNameFa: h.name,
      askingDeltaPct: 0,
      marketChangeComponentPct: 0,
      sampleCompositionShiftPct: 0,
      dataQualityVariancePct: 0,
      epistemicWarningFa: 'تا زمان ثبت سری زمانی معاملات تاییدشده، تفکیک روند صرفاً بر مبنای پایه پیشنهادی نمایش داده می‌شود.',
    }));

    return {
      clusters,
      trendDecomposition,
      historySnapshotsCount: this.historySnapshots.length,
      auditReportsCount: this.auditLog.length,
    };
  }

  appendNonDestructiveHistorySnapshot(versionLabel = 'snapshot-v1') {
    const snap = {
      version: versionLabel,
      capturedAtIso: new Date().toISOString(),
      neighborhoodCount: getAllMultiCityNeighborhoods().length,
    };
    this.historySnapshots.unshift(snap);
    return snap;
  }
}

export const defaultMarketAndUrbanIntelligence = new MarketAndUrbanIntelligenceService();

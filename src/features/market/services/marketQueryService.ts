import type { AppliedMarketFilters } from '../types/market.types';
import type { MarketSnapshotBundle } from './marketDataAdapter';

export interface RequestSequenceGuard {
  next: () => number;
  isLatest: (seq: number) => boolean;
}

export function createRequestSequenceGuard(): RequestSequenceGuard {
  let currentSeq = 0;
  return {
    next: () => {
      currentSeq += 1;
      return currentSeq;
    },
    isLatest: (seq: number) => seq === currentSeq,
  };
}

export interface MarketExportPayload {
  filename: string;
  mimeType: string;
  content: string;
}

export function buildMarketAggregateExport(
  bundle: MarketSnapshotBundle,
  filters: AppliedMarketFilters,
  format: 'json' | 'csv',
): MarketExportPayload {
  const safeScopeSlug = filters.geoLevel + '-' + filters.marketType + '-' + filters.transactionType;
  const generatedAtIso = new Date().toISOString();

  if (format === 'json') {
    const doc = {
      schemaVersion: 'RT-UI-MARKET-001/1.0',
      generatedAtIso,
      provenanceNotice:
        'Only aggregated public indicators with explicit dataKind and provenance are exported. Registered transaction count is verified=0.',
      context: {
        geoScopeFa: bundle.geoScopeFa,
        cityNameFa: bundle.cityNameFa,
        periodLabelFa: bundle.periodLabelFa,
        filters,
      },
      dataQuality: bundle.quality,
      indicators: bundle.indicators,
      comparisonRows: bundle.comparisonRows,
    };
    return {
      filename: `radar-market-${safeScopeSlug}.json`,
      mimeType: 'application/json;charset=utf-8',
      content: JSON.stringify(doc, null, 2),
    };
  }

  const lines: string[] = [
    `# Tehran Radar Market Export (Aggregate Only) | Scope: ${bundle.geoScopeFa} | Period: ${bundle.periodLabelFa} | Generated: ${generatedAtIso}`,
    `# Verified Registered Transactions: ${bundle.quality.verifiedTransactionCount} | Asking price != Closed Transaction`,
    'indicator_id,title_fa,data_kind,value,unit,status,sample_count',
    ...bundle.indicators.map(
      (ind) =>
        `"${ind.id}","${ind.titleFa.replace(/"/g, '""')}","${ind.dataKind}",${ind.value ?? ''},"${ind.unitFa}","${ind.status}",${ind.sampleCount}`,
    ),
  ];
  return {
    filename: `radar-market-${safeScopeSlug}.csv`,
    mimeType: 'text/csv;charset=utf-8',
    content: '\uFEFF' + lines.join('\n'),
  };
}

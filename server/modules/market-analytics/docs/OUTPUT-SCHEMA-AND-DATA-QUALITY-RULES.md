# Output Schema & Data-Quality Rules (`OUTPUT-SCHEMA-AND-DATA-QUALITY-RULES.md`)

- **Module**: `server/modules/market-analytics/`
- **Owner**: Employee 10 — Property Valuation and Market Analytics Backend
- **Model Version**: `v1.0.0-market-analytics-2026.11`

---

## 1. Versioned Valuation Output Schema (`VersionedValuationOutput`)

Every valuation run returns a deterministic, versioned `VersionedValuationOutput` object:

```typescript
interface VersionedValuationOutput {
  resultId: string;
  reproducibilityHash: string;
  valuationTimestampIso: string;
  modelVersion: string;
  marketMode: 'sale' | 'rental';
  reference: {
    targetType: 'property' | 'neighborhood';
    cityId: SupportedCityId;
    provinceId: ProvinceId;
    hoodId: number;
    compositeNeighborhoodId: string; // e.g., "tehran:3"
    neighborhoodNameFa: string;
    propertyId?: string;
    subjectSqm: number | null;
  };
  status: 'authoritative_estimate' | 'provisional_range_only' | 'insufficient_evidence';
  isAuthoritativeEstimateAllowed: boolean;
  estimatedRange: {
    minTotalMillion: number | null;
    maxTotalMillion: number | null;
    minPerSqmMillion: number | null;
    maxPerSqmMillion: number | null;
    minRahnEquivalentMillion?: number | null;
    maxRahnEquivalentMillion?: number | null;
  } | null;
  centralValue: {
    totalMillion: number | null;
    perSqmMillion: number | null;
    rahnEquivalentMillion?: number | null;
    estimatedMonthlyRentMillion?: number | null;
  } | null;
  comparableObservationsCount: {
    submittedTotal: number;
    validDeduplicated: number;
    inliersUsed: number;
  };
  dataSources: SourceProportionSummary[];
  confidence: ConfidenceAssessment;
  limitations: string[];
  contributingFactors: AnalyticalFactorExplanation[];
  dataQuality: DataQualityReport;
  outlierReport: OutlierDetectionResult;
  selectedComparables: EvaluatedComparableItem[];
  candidateQuoteEvaluation?: {
    quotedMetricMillion: number;
    deviationPercent: number;
    classification: 'undervalued_bargain' | 'within_fair_range' | 'overpriced_asking';
    explanation: string;
  };
}
```

---

## 2. Mandatory Data-Quality & Ingestion Rules

| Rule Code | Condition | Action |
|---|---|---|
| `DUPLICATE_OBSERVATION_ID` | Observation shares `observationId` with an earlier entry in the batch. | Excluded before calculation; increments `rejectedDuplicateCount`. |
| `DUPLICATE_CONTENT_FINGERPRINT` | Same `cityId`, `hoodId`, `marketMode`, `sourceCategory`, `sqm`, price, `floor`, and calendar day. | Excluded as duplicate submission; increments `rejectedDuplicateCount`. |
| `MODEL_DERIVED_EXCLUDED_FROM_PRIMARY_EVIDENCE` | `sourceCategory === 'model_derived_estimate'`. | Excluded from empirical pool to prevent circular self-reinforcement. |
| `INVALID_GEOGRAPHY_REFERENCE` | `validateCityNeighborhood(cityId, hoodId)` fails or does not match subject neighborhood. | Excluded; increments `rejectedInvalidCount`. |
| `CROSS_MODE_CONTAMINATION` | Observation `marketMode` (`'sale'` vs `'rental'`) does not match target valuation mode. | Excluded; prevents mixing rental deposits with sale prices. |
| `INVALID_OR_FUTURE_TIMESTAMP` | `observedAtIso` is unparseable or after `valuationTimestampIso`. | Excluded to preserve temporal causality. |
| `STALE_OBSERVATION_EXCEEDED_MAX_AGE` | Observation age exceeds `maxObservationAgeDays` (`180` days). | Excluded to prevent stale historical prices from distorting current estimates. |
| `INVALID_AREA_SQM` | `sqm !== null` and (`sqm < 20` or `sqm > 2000` or `NaN`). | Excluded. Note: `sqm === null` is allowed for non-per-sqm total evaluations, and increments `missingAreaCount`. |
| `MISSING_OR_NON_POSITIVE_PRICE` | Sale `totalPriceMillion <= 0` or `null`, or Rental Rahn-equivalent `<= 0` or `null`. | Excluded; missing prices are never coerced to `0`. |

---

## 3. Reproducibility Guarantee

Every `VersionedValuationOutput` and `HistoricalTrendSeriesOutput` includes a 32-character hexadecimal `reproducibilityHash` derived from SHA-256 over:
1. `modelVersion`
2. `valuationTimestampIso`
3. Normalized `SubjectPropertySpecs`
4. Deterministically sorted array of `MarketObservationRecord` inputs

Given the same set of observations (in any input order), subject specs, timestamp, and model version, the engine produces the exact same `reproducibilityHash` and numerical outputs.

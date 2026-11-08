/**
 * EMPLOYEE 71 — DETERMINISTIC RULES ENGINE, EXPLAINABLE RISK SCORING, ANOMALY & ASSOCIATION ANALYZER
 */

import { CoreApiError } from '../core';
import type {
  ContributingSignalSummary,
  EvidenceReliability,
  RiskBand,
  RiskEntityType,
  RiskPolicyConfiguration,
  RiskRelationship,
  RiskRule,
  RiskSeverity,
  RiskSignal,
  StructuredRuleCondition,
} from './types';

const ALLOWED_OPERATORS = new Set([
  'EQ',
  'NEQ',
  'GT',
  'GTE',
  'LT',
  'LTE',
  'IN',
  'RATIO_DEVIATION_GT',
  'WINDOW_COUNT_GTE',
]);

export function validateStructuredRiskRule(rule: Partial<RiskRule>): void {
  if (!rule.ruleId || !rule.name || !rule.category) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'ruleId, name, and category are required.');
  }
  if (!Array.isArray(rule.conditions) || rule.conditions.length === 0 || rule.conditions.length > 15) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Rule must contain between 1 and 15 structured conditions.');
  }
  const serialized = JSON.stringify(rule);
  if (/function\s*\(|eval\(|new\s+Function|SELECT\s+.*FROM|;\s*DROP\s+/i.test(serialized)) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'UNSAFE_RULE_EXPRESSION: Arbitrary code, SQL, or dynamic script expressions are prohibited in risk rules.',
    );
  }
  for (const cond of rule.conditions) {
    if (!cond.field || !ALLOWED_OPERATORS.has(cond.operator)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `Invalid condition field or operator: ${cond.operator}`);
    }
  }
}

export function evaluateRuleAgainstPayload(
  rule: RiskRule,
  entityType: RiskEntityType,
  payload: Record<string, unknown>,
): {
  triggered: boolean;
  missingFields: string[];
  matchedReasons: string[];
} {
  if (!rule.enabled || !rule.supportedEntityTypes.includes(entityType)) {
    return { triggered: false, criticalMissing: false, missingFields: [], matchedReasons: [] } as never;
  }

  const missingFields: string[] = [];
  for (const reqField of rule.requiredFields) {
    if (payload[reqField] === undefined || payload[reqField] === null || payload[reqField] === '') {
      missingFields.push(reqField);
    }
  }

  // Distinguish missing information from negative evidence: if required fields are missing, do NOT fire adverse signal
  if (missingFields.length > 0) {
    return { triggered: false, missingFields, matchedReasons: [] };
  }

  const matchedReasons: string[] = [];
  for (const cond of rule.conditions) {
    if (!evaluateSingleCondition(cond, payload)) {
      return { triggered: false, missingFields: [], matchedReasons: [] };
    }
    matchedReasons.push(`${cond.field} ${cond.operator} ${JSON.stringify(cond.expectedValue)}`);
  }

  return { triggered: true, missingFields: [], matchedReasons };
}

function evaluateSingleCondition(cond: StructuredRuleCondition, payload: Record<string, unknown>): boolean {
  const actual = payload[cond.field];
  if (actual === undefined || actual === null) return false;

  switch (cond.operator) {
    case 'EQ':
      return actual === cond.expectedValue;
    case 'NEQ':
      return actual !== cond.expectedValue;
    case 'GT':
      return typeof actual === 'number' && typeof cond.expectedValue === 'number' && actual > cond.expectedValue;
    case 'GTE':
    case 'WINDOW_COUNT_GTE':
      return typeof actual === 'number' && typeof cond.expectedValue === 'number' && actual >= cond.expectedValue;
    case 'LT':
      return typeof actual === 'number' && typeof cond.expectedValue === 'number' && actual < cond.expectedValue;
    case 'LTE':
      return typeof actual === 'number' && typeof cond.expectedValue === 'number' && actual <= cond.expectedValue;
    case 'IN':
      return Array.isArray(cond.expectedValue) && cond.expectedValue.includes(actual as never);
    case 'RATIO_DEVIATION_GT': {
      const refVal = cond.referenceBaselineField ? payload[cond.referenceBaselineField] : undefined;
      if (typeof actual !== 'number' || typeof refVal !== 'number' || refVal <= 0 || typeof cond.expectedValue !== 'number') {
        return false;
      }
      const deviation = Math.abs(actual - refVal) / refVal;
      return deviation > cond.expectedValue;
    }
    default:
      return false;
  }
}

const RELIABILITY_MULTIPLIER: Record<EvidenceReliability, number> = {
  AUTHORITATIVE_VERIFIED: 1.0,
  CORROBORATED_INTERNAL: 0.9,
  AUTOMATED_HEURISTIC: 0.75,
  EXTERNAL_UNVERIFIED: 0.5,
  USER_REPORTED: 0.6,
};

const SEVERITY_BASE_WEIGHT: Record<RiskSeverity, number> = {
  LOW: 12,
  MODERATE: 26,
  HIGH: 45,
  CRITICAL: 68,
};

export function calculateExplainableRiskScore(params: {
  signals: RiskSignal[];
  rulesMap: Map<string, RiskRule>;
  policy: RiskPolicyConfiguration;
  positiveMitigatingFactors?: string[];
  missingDataFields?: string[];
  nowEpochMs?: number;
}): {
  score: number;
  riskBand: RiskBand;
  confidence: number;
  contributingSignals: ContributingSignalSummary[];
  ruleVersionsUsed: Record<string, number>;
} {
  const nowMs = params.nowEpochMs ?? Date.now();
  const activeSignals = params.signals.filter(
    (s) => s.status === 'ACTIVE' && Date.parse(s.expiresAt) > nowMs,
  );

  // Deduplicate signals by deduplicationKey so repeated events never inflate risk
  const uniqueByDedupeKey = new Map<string, RiskSignal>();
  for (const sig of activeSignals) {
    const existing = uniqueByDedupeKey.get(sig.deduplicationKey);
    if (!existing || Date.parse(sig.detectedAt) > Date.parse(existing.detectedAt)) {
      uniqueByDedupeKey.set(sig.deduplicationKey, sig);
    }
  }

  const deduplicated = Array.from(uniqueByDedupeKey.values());
  if (deduplicated.length === 0) {
    return {
      score: 0,
      riskBand: 'MINIMAL',
      confidence: 0.9,
      contributingSignals: [],
      ruleVersionsUsed: {},
    };
  }

  // Group by category + ruleId to dampen correlated signals from same rule/category
  const categoryOccurrenceCount = new Map<string, number>();
  const contributingSignals: ContributingSignalSummary[] = [];
  const ruleVersionsUsed: Record<string, number> = {};

  let totalEffectivePoints = 0;
  let weightedConfidenceSum = 0;
  let weightDenominator = 0;

  for (const sig of deduplicated) {
    const rule = params.rulesMap.get(sig.ruleId);
    const rawWeight = rule ? rule.weightPoints : SEVERITY_BASE_WEIGHT[sig.severity];
    ruleVersionsUsed[sig.ruleId] = sig.ruleVersion;

    const ageHours = Math.max(0, (nowMs - Date.parse(sig.detectedAt)) / (1000 * 3600));
    const halfLife = Math.max(1, params.policy.timeDecayHalfLifeHours);
    const timeDecayFactor = Math.pow(0.5, ageHours / halfLife);

    const catKey = `${sig.category}::${sig.signalType}`;
    const seenCount = categoryOccurrenceCount.get(catKey) ?? 0;
    categoryOccurrenceCount.set(catKey, seenCount + 1);
    // Diminishing returns for correlated signals of the same type
    const correlationDampener = 1 / Math.pow(1.6, seenCount);

    const reliabilityFactor = RELIABILITY_MULTIPLIER[sig.reliability] ?? 0.7;

    // Safeguard: weak technical correlations (e.g., shared IP/office) cannot push high risk alone
    const weakSignalCap = rule?.weakSignalOnly ? Math.min(rawWeight, 15) : rawWeight;

    // Low-confidence signal cannot automatically become a critical score
    const confidenceAdjustedWeight =
      weakSignalCap * (0.35 + 0.65 * sig.confidence) * reliabilityFactor * timeDecayFactor * correlationDampener;

    const effectiveWeight = Math.round(confidenceAdjustedWeight * 100) / 100;
    totalEffectivePoints += effectiveWeight;

    weightedConfidenceSum += sig.confidence * reliabilityFactor * effectiveWeight;
    weightDenominator += effectiveWeight;

    contributingSignals.push({
      signalId: sig.signalId,
      category: sig.category,
      signalType: sig.signalType,
      ruleId: sig.ruleId,
      ruleVersion: sig.ruleVersion,
      severity: sig.severity,
      confidence: sig.confidence,
      rawWeight,
      effectiveWeightAfterDecayAndCorrelation: effectiveWeight,
      detectedAt: sig.detectedAt,
    });
  }

  // Mitigating positive evidence reduces score modestly (never below 0)
  const mitigationReduction = Math.min(18, (params.positiveMitigatingFactors?.length ?? 0) * 6);
  const rawScore = Math.max(0, Math.min(100, Math.round(totalEffectivePoints - mitigationReduction)));

  const confidence =
    weightDenominator > 0
      ? Math.max(0.1, Math.min(0.99, Math.round((weightedConfidenceSum / weightDenominator) * 100) / 100))
      : 0.5;

  // Safeguard: if aggregate confidence is very low (< 0.45), cap maximum score below CRITICAL (<= 58)
  const finalScore = confidence < 0.45 ? Math.min(rawScore, 58) : rawScore;
  const riskBand = resolveRiskBand(finalScore, params.policy);

  return {
    score: finalScore,
    riskBand,
    confidence,
    contributingSignals,
    ruleVersionsUsed,
  };
}

export function resolveRiskBand(score: number, policy: RiskPolicyConfiguration): RiskBand {
  if (score <= policy.bands.minimalMax) return 'MINIMAL';
  if (score <= policy.bands.lowMax) return 'LOW';
  if (score <= policy.bands.moderateMax) return 'MODERATE';
  if (score <= policy.bands.highMax) return 'HIGH';
  return 'CRITICAL';
}

export function evaluateNeighborhoodCategoryAnomaly(params: {
  observedValue: number;
  historicalSampleValues: number[];
  neighborhoodId: string;
  propertyCategory: string;
}): {
  isAnomalous: boolean;
  zScore: number;
  confidence: number;
  explanation: string;
} {
  const samples = params.historicalSampleValues.filter((v) => Number.isFinite(v) && v > 0);
  // Sparse dataset safeguard: conservative fallback with low confidence
  if (samples.length < 5) {
    return {
      isAnomalous: false,
      zScore: 0,
      confidence: 0.25,
      explanation: `Insufficient sample size (${samples.length}) for neighborhood=${params.neighborhoodId}, category=${params.propertyCategory}; conservative fallback applied.`,
    };
  }

  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / samples.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev <= 0) {
    const ratio = Math.abs(params.observedValue - mean) / Math.max(1, mean);
    return {
      isAnomalous: ratio > 0.5,
      zScore: ratio * 3,
      confidence: 0.65,
      explanation: `Zero-variance baseline comparison (deviation ratio ${(ratio * 100).toFixed(1)}%).`,
    };
  }

  const zScore = Math.round((Math.abs(params.observedValue - mean) / stdDev) * 100) / 100;
  const sampleConfidence = Math.min(0.95, 0.5 + samples.length * 0.03);
  return {
    isAnomalous: zScore >= 3.0,
    zScore,
    confidence: Math.round(sampleConfidence * 100) / 100,
    explanation: `Observed value ${params.observedValue} has z-score ${zScore} against ${samples.length} comparable records in ${params.neighborhoodId} (${params.propertyCategory}).`,
  };
}

export function analyzeEntityAssociationsBounded(params: {
  rootEntityType: RiskEntityType;
  rootEntityId: string;
  allRelationships: RiskRelationship[];
  maxDepth?: number;
  maxNodes?: number;
}): {
  visitedNodes: string[];
  relationships: RiskRelationship[];
  suspiciousCollusionIndicators: string[];
} {
  const maxDepth = Math.max(1, Math.min(3, params.maxDepth ?? 2));
  const maxNodes = Math.max(5, Math.min(100, params.maxNodes ?? 40));

  const rootKey = `${params.rootEntityType}:${params.rootEntityId}`;
  const visited = new Set<string>([rootKey]);
  const collectedEdges: RiskRelationship[] = [];
  let frontier = [rootKey];

  for (let depth = 0; depth < maxDepth; depth++) {
    const nextFrontier: string[] = [];
    for (const currentKey of frontier) {
      for (const rel of params.allRelationships) {
        const fromKey = `${rel.fromEntityType}:${rel.fromEntityId}`;
        const toKey = `${rel.toEntityType}:${rel.toEntityId}`;
        if (fromKey === currentKey || toKey === currentKey) {
          if (!collectedEdges.some((e) => e.relationshipId === rel.relationshipId)) {
            collectedEdges.push(rel);
          }
          const neighbor = fromKey === currentKey ? toKey : fromKey;
          if (!visited.has(neighbor) && visited.size < maxNodes) {
            visited.add(neighbor);
            nextFrontier.push(neighbor);
          }
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.length === 0 || visited.size >= maxNodes) break;
  }

  // Safeguard: shared network / weak technical correlations NEVER count as collusion proof
  const strongEdges = collectedEdges.filter((e) => !e.isWeakTechnicalCorrelation);
  const indicators: string[] = [];

  const sharedDocEdges = strongEdges.filter((e) => e.relationshipType === 'SHARED_DOCUMENT_HASH');
  if (sharedDocEdges.length >= 2) {
    indicators.push('REUSED_DOCUMENT_FINGERPRINT_ACROSS_MULTIPLE_ENTITIES');
  }

  const reciprocalInteractions = strongEdges.filter(
    (e) => e.relationshipType === 'USER_TO_USER_INTERACTION' || e.relationshipType === 'USER_TO_REVIEW',
  );
  if (reciprocalInteractions.length >= 3) {
    indicators.push('REPEATED_RECIPROCAL_GROUP_INTERACTION_PATTERN');
  }

  return {
    visitedNodes: Array.from(visited),
    relationships: collectedEdges,
    suspiciousCollusionIndicators: indicators,
  };
}

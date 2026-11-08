/**
 * Employee 17 — Schema Contracts, Persian/Currency/Unit Normalization, Data Quality & Deduplication Engine
 * (`server/modules/data-ingestion/schemaQualityAndNormalization.ts`)
 * Exclusive ownership: `server/modules/data-ingestion/`
 */

import type { ValidationIssue } from '../core';
import { computeCanonicalHashSha256 } from './normalizationAndValidation';
import type {
  DatasetQualityRuleConfig,
  DatasetSchemaContract,
  DatasetValidationSummary,
  GeographicReferenceValidator,
  QuarantineReasonCode,
  RecordDeduplicationClassification,
  SchemaEvolutionReport,
} from './ingestionContracts';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

const PROHIBITED_PII_FIELD_REGEX =
  /^(?:national[_-]?id|national[_-]?code|kode[_-]?melli|phone|phone[_-]?number|mobile|cellphone|iban|shaba|card[_-]?number|passport|email|owner[_-]?full[_-]?name|exact[_-]?postal[_-]?address)$/i;

export function normalizePersianAndSanitizeText(raw: string): string {
  let text = raw;
  for (let i = 0; i < 10; i++) {
    text = text.replaceAll(PERSIAN_DIGITS[i], String(i)).replaceAll(ARABIC_DIGITS[i], String(i));
  }
  return text
    .replace(/ي|ى/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .replace(/\{\{[\s\S]*?\}\}/g, '')
    .replace(/\$\{[\s\S]*?\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectUnsolicitedPiiFields(
  rawRecord: Record<string, unknown>,
  piiLawfulBasisApproved?: boolean,
): string[] {
  if (piiLawfulBasisApproved === true) return [];
  return Object.keys(rawRecord).filter((key) => PROHIBITED_PII_FIELD_REGEX.test(key.trim()));
}

export function inspectDatasetSchemaEvolution(params: {
  contract: DatasetSchemaContract;
  requestedSchemaVersion: string;
  records: readonly Record<string, unknown>[];
}): SchemaEvolutionReport {
  const { contract, requestedSchemaVersion, records } = params;
  const incompatibleVersion = contract.schemaVersion !== requestedSchemaVersion;
  const expectedFieldNames = new Set(contract.fields.map((f) => f.fieldName));
  const missingSet = new Set<string>();
  const unexpectedSet = new Set<string>();
  const changedDataTypes: { field: string; expected: string; actual: string }[] = [];
  const seenTypeMismatches = new Set<string>();

  for (const row of records) {
    for (const spec of contract.fields) {
      if (spec.required && (row[spec.fieldName] === undefined || row[spec.fieldName] === null || row[spec.fieldName] === '')) {
        missingSet.add(spec.fieldName);
      }
      const val = row[spec.fieldName];
      if (val !== undefined && val !== null && val !== '') {
        const actualType = Array.isArray(val) ? 'array' : typeof val;
        if (
          (spec.dataType === 'number' || spec.dataType === 'integer' || spec.dataType === 'currency_amount' || spec.dataType === 'area_measure') &&
          typeof val !== 'number' &&
          Number.isNaN(Number(val))
        ) {
          const key = `${spec.fieldName}:${spec.dataType}:${actualType}`;
          if (!seenTypeMismatches.has(key)) {
            seenTypeMismatches.add(key);
            changedDataTypes.push({ field: spec.fieldName, expected: spec.dataType, actual: actualType });
          }
        }
      }
    }
    if (!contract.allowUnexpectedFields) {
      for (const key of Object.keys(row)) {
        if (!expectedFieldNames.has(key) && !key.startsWith('_')) unexpectedSet.add(key);
      }
    }
  }

  return {
    schemaChanged: incompatibleVersion || missingSet.size > 0 || unexpectedSet.size > 0 || changedDataTypes.length > 0,
    missingExpectedFields: [...missingSet],
    unexpectedFields: [...unexpectedSet],
    changedDataTypes,
    incompatibleVersion,
  };
}

export interface ExistingRecordIndexEntry {
  readonly sourceId: string;
  readonly datasetId: string;
  readonly naturalKey: string;
  readonly recordFingerprint: string;
  readonly dataVersion: string;
}

export interface EvaluatedRecordOutcome {
  readonly rowIndex: number;
  readonly sourceRecordId: string;
  readonly naturalKey: string;
  readonly recordFingerprint: string;
  readonly rawPayloadHashSha256: string;
  readonly rawSourceRecord: Record<string, unknown>;
  readonly normalizedRecord: Record<string, unknown>;
  readonly validForDelivery: boolean;
  readonly quarantined: boolean;
  readonly quarantineReason?: QuarantineReasonCode;
  readonly validationIssues: ValidationIssue[];
  readonly dedupClassification: RecordDeduplicationClassification;
  readonly isOutlierCandidate: boolean;
  readonly isStaleObservation: boolean;
}

function computeQuartileBounds(values: number[], multiplier: number): { lower: number; upper: number } | null {
  if (values.length < 4) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  return { lower: q1 - multiplier * iqr, upper: q3 + multiplier * iqr };
}

export function evaluateDatasetBatchQualityAndNormalize(params: {
  reportId: string;
  jobId: string;
  sourceId: string;
  datasetId: string;
  dataVersion: string;
  requestedSchemaVersion: string;
  contract: DatasetSchemaContract;
  qualityRules: DatasetQualityRuleConfig;
  freshnessMaxAgeHours: number;
  rawRecords: readonly Record<string, unknown>[];
  malformedRowErrors: readonly { rowIndex: number; rawText: string; reason: string }[];
  existingRecordsByNaturalKey: ReadonlyMap<string, ExistingRecordIndexEntry[]>;
  geographyValidator?: GeographicReferenceValidator;
  nowEpochMs: number;
}): { outcomes: EvaluatedRecordOutcome[]; summary: DatasetValidationSummary } {
  const {
    reportId, jobId, sourceId, datasetId, requestedSchemaVersion, contract,
    qualityRules, freshnessMaxAgeHours, rawRecords, malformedRowErrors,
    existingRecordsByNaturalKey, geographyValidator, nowEpochMs,
  } = params;

  const schemaEvolution = inspectDatasetSchemaEvolution({ contract, requestedSchemaVersion, records: rawRecords });

  let outlierBounds: { lower: number; upper: number } | null = null;
  if (qualityRules.enableIqrOutlierDetection && qualityRules.numericOutlierField) {
    const fieldName = qualityRules.numericOutlierField;
    const numericSamples = rawRecords.map((r) => Number(r[fieldName])).filter((n) => Number.isFinite(n));
    outlierBounds = computeQuartileBounds(numericSamples, qualityRules.iqrMultiplier || 1.5);
  }

  const outcomes: EvaluatedRecordOutcome[] = [];
  const seenSameJobFingerprints = new Set<string>();
  const seenSameJobNaturalKeys = new Set<string>();

  let validRecords = 0;
  let invalidRecords = 0;
  let duplicateRecords = 0;
  let updatedSameSourceRecords = 0;
  let crossSourceMatchCandidates = 0;
  let missingFieldsCount = 0;
  let outlierCandidatesCount = 0;
  let unrecognizedValuesCount = 0;
  let geographicResolutionFailures = 0;
  let staleObservationsCount = 0;
  const qualityWarnings: string[] = [];
  const humanConfirmationRequiredFields = contract.fields.filter((f) => f.requiresHumanConfirmationMapping).map((f) => f.fieldName);

  for (const mal of malformedRowErrors) {
    const rawObj = { __malformedRawText: mal.rawText, __reason: mal.reason };
    const rawHash = computeCanonicalHashSha256(rawObj);
    invalidRecords += 1;
    outcomes.push({
      rowIndex: mal.rowIndex,
      sourceRecordId: `malformed_${mal.rowIndex}`,
      naturalKey: '',
      recordFingerprint: rawHash,
      rawPayloadHashSha256: rawHash,
      rawSourceRecord: rawObj,
      normalizedRecord: {},
      validForDelivery: false,
      quarantined: true,
      quarantineReason: 'MALFORMED_SOURCE_ROW',
      validationIssues: [{ field: '$row', code: 'INVALID_FORMAT', message: mal.reason }],
      dedupClassification: 'NEW_RECORD',
      isOutlierCandidate: false,
      isStaleObservation: false,
    });
  }

  for (let idx = 0; idx < rawRecords.length; idx++) {
    const rawRow = rawRecords[idx];
    const rawPayloadHashSha256 = computeCanonicalHashSha256(rawRow);
    const issues: ValidationIssue[] = [];
    const normalized: Record<string, unknown> = {};
    let quarantineReason: QuarantineReasonCode | undefined;
    let isStaleObservation = false;
    let isOutlierCandidate = false;

    if (schemaEvolution.incompatibleVersion) {
      issues.push({
        field: '$schemaVersion',
        code: 'INVALID_FORMAT',
        message: `Dataset schemaVersion "${contract.schemaVersion}" is incompatible with job schemaVersion "${requestedSchemaVersion}".`,
      });
      quarantineReason = 'UNEXPECTED_SCHEMA_CHANGE';
    }

    const piiFields = detectUnsolicitedPiiFields(rawRow, contract.piiLawfulBasisApproved);
    if (piiFields.length > 0) {
      issues.push({
        field: piiFields.join(','),
        code: 'UNTRUSTED_IDENTITY_FIELD',
        message: `Unsolicited PII fields (${piiFields.join(', ')}) rejected without explicit lawful basis approval.`,
      });
      quarantineReason = 'LICENSE_OR_PII_POLICY_ISSUE';
    }

    if (!contract.allowUnexpectedFields) {
      const allowedSet = new Set(contract.fields.map((f) => f.fieldName));
      for (const k of Object.keys(rawRow)) {
        if (!allowedSet.has(k) && !k.startsWith('_')) {
          unrecognizedValuesCount += 1;
          issues.push({ field: k, code: 'UNKNOWN_FIELD_REJECTED', message: `Unexpected field "${k}" is not in schemaVersion "${contract.schemaVersion}".` });
          quarantineReason = quarantineReason ?? 'UNEXPECTED_SCHEMA_CHANGE';
        }
      }
    }

    for (const spec of contract.fields) {
      const rawVal = rawRow[spec.fieldName];
      const outKey = spec.targetNormalizedField ?? spec.fieldName;

      if (rawVal === undefined || rawVal === null || rawVal === '') {
        if (spec.required) {
          missingFieldsCount += 1;
          issues.push({ field: spec.fieldName, code: 'REQUIRED_FIELD_MISSING', message: `Required field "${spec.fieldName}" is missing (never fabricated).` });
        } else {
          normalized[outKey] = null;
        }
        continue;
      }

      switch (spec.dataType) {
        case 'string':
        case 'identifier': {
          if (typeof rawVal !== 'string' && typeof rawVal !== 'number') {
            issues.push({ field: spec.fieldName, code: 'INVALID_TYPE', message: `Field "${spec.fieldName}" must be a string.` });
            break;
          }
          const sanitized = normalizePersianAndSanitizeText(String(rawVal));
          if (!sanitized) {
            issues.push({ field: spec.fieldName, code: 'STRING_TOO_SHORT', message: `Field "${spec.fieldName}" is empty after sanitization.` });
            break;
          }
          if (spec.identifierPatternRegex && !new RegExp(spec.identifierPatternRegex).test(sanitized)) {
            issues.push({ field: spec.fieldName, code: 'INVALID_FORMAT', message: `Identifier "${spec.fieldName}" does not match pattern.` });
            quarantineReason = quarantineReason ?? 'CONFLICTING_IDENTIFIER';
            break;
          }
          normalized[outKey] = sanitized;
          break;
        }
        case 'number':
        case 'integer': {
          const numVal = typeof rawVal === 'number' ? rawVal : Number(normalizePersianAndSanitizeText(String(rawVal)));
          if (!Number.isFinite(numVal) || (spec.dataType === 'integer' && !Number.isInteger(numVal))) {
            issues.push({ field: spec.fieldName, code: 'INVALID_TYPE', message: `Field "${spec.fieldName}" must be a valid ${spec.dataType}.` });
            break;
          }
          if ((spec.minNumeric !== undefined && numVal < spec.minNumeric) || (spec.maxNumeric !== undefined && numVal > spec.maxNumeric)) {
            issues.push({ field: spec.fieldName, code: 'NUMBER_OUT_OF_RANGE', message: `Field "${spec.fieldName}" (${numVal}) is out of range.` });
            break;
          }
          normalized[outKey] = spec.dataType === 'integer' ? numVal : Math.round(numVal * 1000) / 1000;
          break;
        }
        case 'boolean': {
          if (typeof rawVal !== 'boolean') {
            issues.push({ field: spec.fieldName, code: 'INVALID_TYPE', message: `Field "${spec.fieldName}" must be a boolean.` });
            break;
          }
          normalized[outKey] = rawVal;
          break;
        }
        case 'iso_date': {
          const dateStr = typeof rawVal === 'string' ? normalizePersianAndSanitizeText(rawVal) : '';
          const parsedMs = Date.parse(dateStr);
          if (!dateStr || Number.isNaN(parsedMs)) {
            issues.push({ field: spec.fieldName, code: 'INVALID_FORMAT', message: `Field "${spec.fieldName}" must be a valid ISO-8601 date.` });
            quarantineReason = quarantineReason ?? 'INCOMPATIBLE_OR_STALE_DATE';
            break;
          }
          const isoNormalized = new Date(parsedMs).toISOString();
          normalized[outKey] = isoNormalized;
          if (contract.timestampField === spec.fieldName && freshnessMaxAgeHours > 0) {
            const ageHours = (nowEpochMs - parsedMs) / (1000 * 60 * 60);
            if (ageHours > freshnessMaxAgeHours) {
              isStaleObservation = true;
              staleObservationsCount += 1;
              qualityWarnings.push(`Row ${idx}: observation timestamp ${isoNormalized} exceeds freshness window (${freshnessMaxAgeHours}h).`);
            }
          }
          break;
        }
        case 'currency_amount': {
          const numVal = typeof rawVal === 'number' ? rawVal : Number(normalizePersianAndSanitizeText(String(rawVal)));
          if (!Number.isFinite(numVal) || numVal <= 0) {
            issues.push({ field: spec.fieldName, code: 'NUMBER_OUT_OF_RANGE', message: `Currency field "${spec.fieldName}" must be positive.` });
            break;
          }
          const recordCurrency = typeof rawRow.currency === 'string' ? rawRow.currency.trim().toUpperCase() : spec.expectedCurrency;
          if (spec.expectedCurrency && recordCurrency && recordCurrency !== spec.expectedCurrency) {
            issues.push({
              field: spec.fieldName,
              code: 'INVALID_ENUM_VALUE',
              message: `Currency mismatch on "${spec.fieldName}": expected "${spec.expectedCurrency}", got "${recordCurrency}". Silent currency conversion is prohibited.`,
            });
            break;
          }
          if ((spec.minNumeric !== undefined && numVal < spec.minNumeric) || (spec.maxNumeric !== undefined && numVal > spec.maxNumeric)) {
            issues.push({ field: spec.fieldName, code: 'NUMBER_OUT_OF_RANGE', message: `Currency amount "${spec.fieldName}" (${numVal}) is out of range.` });
            break;
          }
          normalized[outKey] = Math.round(numVal * 100) / 100;
          normalized[`${outKey}Currency`] = spec.expectedCurrency ?? 'MILLION_TOMAN';
          if (spec.priceSemanticType) normalized[`${outKey}SemanticType`] = spec.priceSemanticType;
          break;
        }
        case 'area_measure': {
          const numVal = typeof rawVal === 'number' ? rawVal : Number(normalizePersianAndSanitizeText(String(rawVal)));
          if (!Number.isFinite(numVal) || numVal <= 0) {
            issues.push({ field: spec.fieldName, code: 'NUMBER_OUT_OF_RANGE', message: `Area field "${spec.fieldName}" must be positive.` });
            break;
          }
          const rowUnit = typeof rawRow.areaUnit === 'string' ? rawRow.areaUnit.trim().toLowerCase() : (spec.sourceAreaUnit ?? 'sqm');
          if (rowUnit !== 'sqm' && rowUnit !== 'hectare') {
            unrecognizedValuesCount += 1;
            issues.push({ field: spec.fieldName, code: 'INVALID_ENUM_VALUE', message: `Unrecognized area unit "${rowUnit}".` });
            break;
          }
          if (rowUnit === 'hectare' && spec.normalizeAreaToSqm) {
            normalized[outKey] = Math.round(numVal * 10_000 * 100) / 100;
            normalized[`${outKey}Unit`] = 'sqm';
            normalized[`${outKey}OriginalUnit`] = 'hectare';
          } else {
            normalized[outKey] = Math.round(numVal * 100) / 100;
            normalized[`${outKey}Unit`] = rowUnit;
          }
          break;
        }
        case 'geographic_ref': {
          normalized[outKey] = normalizePersianAndSanitizeText(String(rawVal)).toLowerCase();
          break;
        }
      }
    }

    if (qualityRules.requireGeographicResolution) {
      const cityId = typeof normalized.cityId === 'string' ? normalized.cityId : '';
      const hoodId = typeof normalized.hoodId === 'number' ? normalized.hoodId : undefined;
      const validGeo = geographyValidator
        ? geographyValidator.isValidCityAndNeighborhood(cityId, hoodId)
        : Boolean(cityId && (hoodId === undefined || (Number.isInteger(hoodId) && hoodId > 0)));
      if (!validGeo) {
        geographicResolutionFailures += 1;
        issues.push({ field: 'cityId/hoodId', code: 'INVALID_FORMAT', message: `Geographic reference (${cityId}:${hoodId ?? 'none'}) failed resolution.` });
        quarantineReason = quarantineReason ?? 'UNCLEAR_GEOGRAPHIC_MAPPING';
      }
    }

    if (outlierBounds && qualityRules.numericOutlierField) {
      const val = Number(rawRow[qualityRules.numericOutlierField]);
      if (Number.isFinite(val) && (val < outlierBounds.lower || val > outlierBounds.upper)) {
        isOutlierCandidate = true;
        outlierCandidatesCount += 1;
        qualityWarnings.push(`Row ${idx}: statistical outlier candidate on "${qualityRules.numericOutlierField}"=${val}.`);
      }
    }

    const naturalKeyParts = contract.primaryNaturalKeyFields.map((k) => {
      const targetKey = contract.fields.find((f) => f.fieldName === k)?.targetNormalizedField ?? k;
      return String(normalized[targetKey] ?? rawRow[k] ?? '');
    });
    const naturalKey = naturalKeyParts.every(Boolean) ? naturalKeyParts.join(':') : `row_${idx}_${rawPayloadHashSha256.slice(0, 12)}`;
    const sourceRecordId = String(rawRow.sourceRecordId ?? rawRow.id ?? naturalKey);
    const recordFingerprint = computeCanonicalHashSha256({
      datasetId, schemaVersion: contract.schemaVersion, transformationVersion: contract.transformationVersion, normalized,
    });

    let dedupClassification: RecordDeduplicationClassification = 'NEW_RECORD';
    if (seenSameJobFingerprints.has(recordFingerprint) || seenSameJobNaturalKeys.has(`${sourceId}:${naturalKey}`)) {
      dedupClassification = 'EXACT_SAME_SOURCE_DUPLICATE';
      duplicateRecords += 1;
    } else {
      seenSameJobFingerprints.add(recordFingerprint);
      seenSameJobNaturalKeys.add(`${sourceId}:${naturalKey}`);
      const priorMatches = existingRecordsByNaturalKey.get(naturalKey) ?? [];
      const sameSourceMatch = priorMatches.find((m) => m.sourceId === sourceId && m.datasetId === datasetId);
      const otherSourceMatch = priorMatches.find((m) => m.sourceId !== sourceId);

      if (sameSourceMatch) {
        if (sameSourceMatch.recordFingerprint === recordFingerprint) {
          dedupClassification = 'EXACT_SAME_SOURCE_DUPLICATE';
          duplicateRecords += 1;
        } else {
          dedupClassification = 'UPDATED_SAME_SOURCE_RECORD';
          updatedSameSourceRecords += 1;
        }
      } else if (otherSourceMatch) {
        if (!qualityRules.allowCrossSourceAutoMerge) {
          dedupClassification = 'POTENTIAL_CROSS_SOURCE_MATCH';
          crossSourceMatchCandidates += 1;
          issues.push({
            field: '$naturalKey',
            code: 'UNKNOWN_FIELD_REJECTED',
            message: `Potential cross-source match with "${otherSourceMatch.sourceId}" on "${naturalKey}"; quarantined to prevent silent merge.`,
          });
          quarantineReason = quarantineReason ?? 'POTENTIAL_CROSS_SOURCE_DUPLICATE';
        } else {
          dedupClassification = 'INDEPENDENT_OBSERVATION';
        }
      }
    }

    if (issues.length > 0) {
      invalidRecords += 1;
      outcomes.push({
        rowIndex: idx, sourceRecordId, naturalKey, recordFingerprint, rawPayloadHashSha256,
        rawSourceRecord: rawRow, normalizedRecord: normalized, validForDelivery: false,
        quarantined: true, quarantineReason: quarantineReason ?? 'INVALID_SCHEMA_RECORD',
        validationIssues: issues, dedupClassification, isOutlierCandidate, isStaleObservation,
      });
    } else if (dedupClassification === 'EXACT_SAME_SOURCE_DUPLICATE') {
      outcomes.push({
        rowIndex: idx, sourceRecordId, naturalKey, recordFingerprint, rawPayloadHashSha256,
        rawSourceRecord: rawRow, normalizedRecord: normalized, validForDelivery: false,
        quarantined: false, validationIssues: [], dedupClassification, isOutlierCandidate, isStaleObservation,
      });
    } else {
      validRecords += 1;
      outcomes.push({
        rowIndex: idx, sourceRecordId, naturalKey, recordFingerprint, rawPayloadHashSha256,
        rawSourceRecord: rawRow, normalizedRecord: normalized, validForDelivery: true,
        quarantined: false, validationIssues: [], dedupClassification, isOutlierCandidate, isStaleObservation,
      });
    }
  }

  return {
    outcomes,
    summary: {
      reportId, jobId, sourceId, datasetId,
      schemaVersion: contract.schemaVersion,
      transformationVersion: contract.transformationVersion,
      totalRecords: rawRecords.length + malformedRowErrors.length,
      validRecords, invalidRecords, duplicateRecords,
      updatedSameSourceRecords, crossSourceMatchCandidates,
      missingFieldsCount, outlierCandidatesCount, unrecognizedValuesCount,
      geographicResolutionFailures, staleObservationsCount,
      schemaEvolution, qualityWarnings, humanConfirmationRequiredFields,
      validatedAtIso: new Date(nowEpochMs).toISOString(),
    },
  };
}

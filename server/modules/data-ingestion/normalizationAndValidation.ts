import crypto from 'crypto';
import type { ValidationIssue, ValidationResult } from '../core';
import type {
  CreateIngestionJobInput,
  IngestRecordsBatchInput,
  IngestStructuredFileInput,
  IngestionDataCategory,
  IngestionImportMethod,
  ModerateIngestionJobInput,
  RegisterIngestionSourceInput,
} from './types';

export const ALLOWED_DATA_CATEGORIES: readonly IngestionDataCategory[] = [
  'geographic_reference',
  'market_observations',
  'economic_demographic_indicators',
  'construction_development',
  'public_property_statistics',
  'official_city_neighborhood_datasets',
  'other_structured_dataset',
];

export const ALLOWED_IMPORT_METHODS: readonly IngestionImportMethod[] = [
  'manual_entry',
  'structured_file',
];

const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{3,80}$/;
const VERSION_REGEX = /^[a-zA-Z0-9._-]{1,40}$/;

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Computes a deterministic SHA-256 hex digest of an arbitrary object with sorted keys.
 */
export function computeCanonicalHashSha256(value: unknown): string {
  const canonicalJson = JSON.stringify(sortDeep(value));
  return crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      out[k] = sortDeep(value[k]);
    }
    return out;
  }
  return value;
}

/**
 * Validates source registration input, enforcing explicit legal & technical basis approval
 * and forbidding scraping/bypassing flags.
 */
export function validateRegisterSourceInput(
  raw: unknown,
): ValidationResult<RegisterIngestionSourceInput> {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      issues: [{ field: '$body', code: 'INVALID_TYPE', message: 'Request body must be a JSON object.' }],
    };
  }

  const issues: ValidationIssue[] = [];
  for (const forbidden of ['ownerUid', 'ownerEmail', 'status', 'bypassAuth', 'scrapeUrl']) {
    if (forbidden in raw) {
      issues.push({
        field: forbidden,
        code: 'UNTRUSTED_IDENTITY_FIELD',
        message: `Field "${forbidden}" is not permitted in source registration.`,
      });
    }
  }

  const sourceId = typeof raw.sourceId === 'string' ? raw.sourceId.trim() : '';
  if (!SAFE_ID_REGEX.test(sourceId)) {
    issues.push({
      field: 'sourceId',
      code: 'INVALID_FORMAT',
      message: 'sourceId must be 3-80 alphanumeric/underscore/hyphen characters.',
    });
  }

  const sourceName = typeof raw.sourceName === 'string' ? raw.sourceName.trim() : '';
  if (sourceName.length < 3 || sourceName.length > 140) {
    issues.push({
      field: 'sourceName',
      code: 'STRING_TOO_SHORT',
      message: 'sourceName must be 3-140 characters.',
    });
  }

  const authorityOrPublisher = typeof raw.authorityOrPublisher === 'string' ? raw.authorityOrPublisher.trim() : '';
  if (authorityOrPublisher.length < 2 || authorityOrPublisher.length > 140) {
    issues.push({
      field: 'authorityOrPublisher',
      code: 'STRING_TOO_SHORT',
      message: 'authorityOrPublisher must be 2-140 characters.',
    });
  }

  const dataCategory = raw.dataCategory as IngestionDataCategory;
  if (!ALLOWED_DATA_CATEGORIES.includes(dataCategory)) {
    issues.push({
      field: 'dataCategory',
      code: 'INVALID_ENUM_VALUE',
      message: 'Invalid dataCategory.',
    });
  }

  const supportedSchemaVersion = typeof raw.supportedSchemaVersion === 'string' ? raw.supportedSchemaVersion.trim() : '';
  if (!VERSION_REGEX.test(supportedSchemaVersion)) {
    issues.push({
      field: 'supportedSchemaVersion',
      code: 'INVALID_FORMAT',
      message: 'supportedSchemaVersion is invalid.',
    });
  }

  const licenseOrUsageTerms = typeof raw.licenseOrUsageTerms === 'string' ? raw.licenseOrUsageTerms.trim() : '';
  if (licenseOrUsageTerms.length < 3 || licenseOrUsageTerms.length > 300) {
    issues.push({
      field: 'licenseOrUsageTerms',
      code: 'STRING_TOO_SHORT',
      message: 'licenseOrUsageTerms must be 3-300 characters.',
    });
  }

  if (raw.legalAndTechnicalBasisApproved !== true) {
    issues.push({
      field: 'legalAndTechnicalBasisApproved',
      code: 'REQUIRED_FIELD_MISSING',
      message: 'Explicit legal and technical basis approval is required before registering an external data source.',
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    issues: [],
    value: {
      sourceId,
      sourceName,
      authorityOrPublisher,
      dataCategory,
      supportedSchemaVersion,
      licenseOrUsageTerms,
      legalAndTechnicalBasisApproved: true,
    },
  };
}

export function validateCreateJobInput(raw: unknown): ValidationResult<CreateIngestionJobInput> {
  if (!isPlainObject(raw)) {
    return { ok: false, issues: [{ field: '$body', code: 'INVALID_TYPE', message: 'Body must be an object.' }] };
  }

  const issues: ValidationIssue[] = [];
  for (const forbidden of ['status', 'approvedByUid', 'publishedRecordCount', 'submittedByUid']) {
    if (forbidden in raw) {
      issues.push({
        field: forbidden,
        code: 'UNTRUSTED_IDENTITY_FIELD',
        message: `Field "${forbidden}" cannot be set by client.`,
      });
    }
  }

  const sourceId = typeof raw.sourceId === 'string' ? raw.sourceId.trim() : '';
  if (!SAFE_ID_REGEX.test(sourceId)) {
    issues.push({ field: 'sourceId', code: 'INVALID_FORMAT', message: 'Invalid sourceId.' });
  }

  const sourceVersion = typeof raw.sourceVersion === 'string' ? raw.sourceVersion.trim() : '';
  if (!VERSION_REGEX.test(sourceVersion)) {
    issues.push({ field: 'sourceVersion', code: 'INVALID_FORMAT', message: 'Invalid sourceVersion.' });
  }

  const schemaVersion = typeof raw.schemaVersion === 'string' ? raw.schemaVersion.trim() : '';
  if (!VERSION_REGEX.test(schemaVersion)) {
    issues.push({ field: 'schemaVersion', code: 'INVALID_FORMAT', message: 'Invalid schemaVersion.' });
  }

  const importMethod = raw.importMethod as IngestionImportMethod;
  if (!ALLOWED_IMPORT_METHODS.includes(importMethod)) {
    issues.push({ field: 'importMethod', code: 'INVALID_ENUM_VALUE', message: 'importMethod must be manual_entry or structured_file.' });
  }

  const retrievalOrSubmissionDateIso = typeof raw.retrievalOrSubmissionDateIso === 'string' ? raw.retrievalOrSubmissionDateIso.trim() : '';
  const parsedDate = Date.parse(retrievalOrSubmissionDateIso);
  if (Number.isNaN(parsedDate)) {
    issues.push({ field: 'retrievalOrSubmissionDateIso', code: 'INVALID_FORMAT', message: 'retrievalOrSubmissionDateIso must be a valid ISO date.' });
  }

  const totalExpectedRows = typeof raw.totalExpectedRows === 'number' && Number.isInteger(raw.totalExpectedRows) ? raw.totalExpectedRows : -1;
  if (totalExpectedRows < 1 || totalExpectedRows > 5000) {
    issues.push({ field: 'totalExpectedRows', code: 'NUMBER_OUT_OF_RANGE', message: 'totalExpectedRows must be between 1 and 5000.' });
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    issues: [],
    value: {
      sourceId,
      sourceVersion,
      schemaVersion,
      importMethod,
      retrievalOrSubmissionDateIso: new Date(parsedDate).toISOString(),
      totalExpectedRows,
    },
  };
}

export function validateIngestBatchInput(raw: unknown): ValidationResult<IngestRecordsBatchInput> {
  if (!isPlainObject(raw) || !Array.isArray(raw.rows) || raw.rows.length === 0 || raw.rows.length > 500) {
    return {
      ok: false,
      issues: [{ field: 'rows', code: 'INVALID_TYPE', message: 'rows must be a non-empty array of up to 500 objects.' }],
    };
  }
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < raw.rows.length; i++) {
    const item = raw.rows[i];
    if (!isPlainObject(item)) {
      rows.push({ __malformedRowValue: item });
    } else {
      rows.push(item);
    }
  }
  const startRowIndex = typeof raw.startRowIndex === 'number' && Number.isInteger(raw.startRowIndex) && raw.startRowIndex >= 0 ? raw.startRowIndex : undefined;
  const simulateInterruptionAfterRowCount =
    typeof raw.simulateInterruptionAfterRowCount === 'number' && Number.isInteger(raw.simulateInterruptionAfterRowCount) && raw.simulateInterruptionAfterRowCount > 0
      ? raw.simulateInterruptionAfterRowCount
      : undefined;

  return {
    ok: true,
    issues: [],
    value: {
      rows,
      ...(startRowIndex !== undefined ? { startRowIndex } : {}),
      ...(simulateInterruptionAfterRowCount !== undefined ? { simulateInterruptionAfterRowCount } : {}),
    },
  };
}

/**
 * 5. Structured File Parsing Interface (`json_array` or `csv_rows`)
 */
export function parseStructuredFileInput(raw: unknown): ValidationResult<{ rows: Array<Record<string, unknown>>; startRowIndex?: number }> {
  if (!isPlainObject(raw)) {
    return { ok: false, issues: [{ field: '$body', code: 'INVALID_TYPE', message: 'Body must be an object.' }] };
  }
  const format = raw.format as IngestStructuredFileInput['format'];
  const content = typeof raw.content === 'string' ? raw.content.trim() : '';
  if ((format !== 'json_array' && format !== 'csv_rows') || !content) {
    return { ok: false, issues: [{ field: 'format', code: 'INVALID_FORMAT', message: 'format (json_array | csv_rows) and non-empty content are required.' }] };
  }

  const startRowIndex = typeof raw.startRowIndex === 'number' && Number.isInteger(raw.startRowIndex) && raw.startRowIndex >= 0 ? raw.startRowIndex : undefined;

  if (format === 'json_array') {
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return { ok: false, issues: [{ field: 'content', code: 'INVALID_FORMAT', message: 'JSON content must be a non-empty array.' }] };
      }
      const rows = parsed.map((item) => (isPlainObject(item) ? item : { __malformedRowValue: item }));
      return { ok: true, issues: [], value: { rows, ...(startRowIndex !== undefined ? { startRowIndex } : {}) } };
    } catch {
      return { ok: false, issues: [{ field: 'content', code: 'INVALID_FORMAT', message: 'Failed to parse JSON array content.' }] };
    }
  }

  // csv_rows parser
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return { ok: false, issues: [{ field: 'content', code: 'INVALID_FORMAT', message: 'CSV must contain a header line and at least one data row.' }] };
  }
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (cols.length !== headers.length) {
      rows.push({ __malformedCsvLine: lines[i], expectedColumns: headers.length, actualColumns: cols.length });
      continue;
    }
    const rowObj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      const val = cols[c];
      const num = Number(val);
      rowObj[headers[c]] = val !== '' && !Number.isNaN(num) ? num : val;
    }
    rows.push(rowObj);
  }
  return { ok: true, issues: [], value: { rows, ...(startRowIndex !== undefined ? { startRowIndex } : {}) } };
}

export interface EvaluatedIngestionRowResult {
  valid: boolean;
  naturalKey: string;
  recordFingerprint: string;
  normalizedRecord: Record<string, unknown>;
  quarantineReason: 'SCHEMA_VALIDATION_FAILED' | 'AMBIGUOUS_RECORD' | 'MALFORMED_ROW';
  issues: ValidationIssue[];
}

/**
 * 6, 7, 8 & 9. Data Normalization, Schema Validation, Duplicate Fingerprinting & Quarantine Evaluation
 * Never fabricates missing fields; preserves rawSourceRecord for auditability.
 */
export function normalizeAndValidateIngestionRow(params: {
  dataCategory: IngestionDataCategory;
  schemaVersion: string;
  rawRow: Record<string, unknown>;
}): EvaluatedIngestionRowResult {
  const { dataCategory, rawRow } = params;
  const rawHash = computeCanonicalHashSha256(rawRow);

  if ('__malformedRowValue' in rawRow || '__malformedCsvLine' in rawRow) {
    return {
      valid: false,
      naturalKey: '',
      normalizedRecord: {},
      quarantineReason: 'MALFORMED_ROW',
      issues: [{ field: '$row', code: 'INVALID_FORMAT', message: 'Row could not be parsed as a valid key-value record.' }],
      recordFingerprint: rawHash,
    };
  }

  const issues: ValidationIssue[] = [];
  const normalized: Record<string, unknown> = {};

  const rawCity = typeof rawRow.cityId === 'string' ? rawRow.cityId.trim().toLowerCase() : '';
  if (!rawCity || !/^[a-z_]{2,32}$/.test(rawCity)) {
    issues.push({ field: 'cityId', code: 'REQUIRED_FIELD_MISSING', message: 'Valid cityId is required (never fabricated).' });
  } else {
    normalized.cityId = rawCity;
  }

  const rawHoodId = typeof rawRow.hoodId === 'number' ? rawRow.hoodId : Number(rawRow.hoodId);
  if (!Number.isInteger(rawHoodId) || rawHoodId <= 0) {
    issues.push({ field: 'hoodId', code: 'REQUIRED_FIELD_MISSING', message: 'Positive integer hoodId is required (never fabricated).' });
  } else {
    normalized.hoodId = rawHoodId;
  }

  if (dataCategory === 'market_observations' || dataCategory === 'public_property_statistics') {
    const avgPrice = typeof rawRow.avgPricePerSqmMillion === 'number' ? rawRow.avgPricePerSqmMillion : Number(rawRow.avgPricePerSqmMillion);
    if (!Number.isFinite(avgPrice) || avgPrice <= 0 || avgPrice > 2000) {
      issues.push({ field: 'avgPricePerSqmMillion', code: 'NUMBER_OUT_OF_RANGE', message: 'avgPricePerSqmMillion must be in (0, 2000].' });
    } else {
      normalized.avgPricePerSqmMillion = Math.round(avgPrice * 100) / 100;
    }
    const period = typeof rawRow.observationPeriod === 'string' ? rawRow.observationPeriod.trim() : '';
    if (!period || period.length < 4 || period.length > 32) {
      issues.push({ field: 'observationPeriod', code: 'REQUIRED_FIELD_MISSING', message: 'observationPeriod is required.' });
    } else {
      normalized.observationPeriod = period;
    }
  } else if (dataCategory === 'geographic_reference' || dataCategory === 'official_city_neighborhood_datasets') {
    const hoodName = typeof rawRow.hoodName === 'string' ? rawRow.hoodName.trim() : '';
    if (hoodName.length < 2 || hoodName.length > 100) {
      issues.push({ field: 'hoodName', code: 'STRING_TOO_SHORT', message: 'hoodName (2-100 chars) is required.' });
    } else {
      normalized.hoodName = hoodName;
    }
    if (rawRow.districtNumber !== undefined) {
      const dist = Number(rawRow.districtNumber);
      if (!Number.isInteger(dist) || dist < 1 || dist > 50) {
        issues.push({ field: 'districtNumber', code: 'NUMBER_OUT_OF_RANGE', message: 'districtNumber must be an integer 1..50.' });
      } else {
        normalized.districtNumber = dist;
      }
    }
  } else {
    const metricKey = typeof rawRow.metricKey === 'string' ? rawRow.metricKey.trim() : '';
    const metricValue = typeof rawRow.metricValue === 'number' ? rawRow.metricValue : Number(rawRow.metricValue);
    if (!metricKey || !Number.isFinite(metricValue)) {
      issues.push({ field: 'metricKey', code: 'REQUIRED_FIELD_MISSING', message: 'metricKey and finite metricValue are required.' });
    } else {
      normalized.metricKey = metricKey;
      normalized.metricValue = Math.round(metricValue * 1000) / 1000;
    }
  }

  let hasAmbiguity = false;
  if (rawRow.conflictingSourceValue !== undefined) {
    hasAmbiguity = true;
    issues.push({ field: 'conflictingSourceValue', code: 'UNKNOWN_FIELD_REJECTED', message: 'Record contains unresolved conflicting source values.' });
  }

  if (issues.length > 0) {
    return {
      valid: false,
      naturalKey: '',
      normalizedRecord: {},
      quarantineReason: hasAmbiguity ? 'AMBIGUOUS_RECORD' : 'SCHEMA_VALIDATION_FAILED',
      issues,
      recordFingerprint: rawHash,
    };
  }

  const naturalKeyParts = [
    String(normalized.cityId),
    String(normalized.hoodId),
    String(normalized.observationPeriod ?? normalized.hoodName ?? normalized.metricKey ?? 'base'),
  ];
  const naturalKey = naturalKeyParts.join(':');
  const recordFingerprint = computeCanonicalHashSha256({ dataCategory, normalized });

  return {
    valid: true,
    naturalKey,
    recordFingerprint,
    normalizedRecord: normalized,
    quarantineReason: 'SCHEMA_VALIDATION_FAILED',
    issues: [],
  };
}

export function validateModerateJobInput(raw: unknown): ValidationResult<ModerateIngestionJobInput> {
  if (!isPlainObject(raw)) {
    return { ok: false, issues: [{ field: '$body', code: 'INVALID_TYPE', message: 'Body must be an object.' }] };
  }
  const decision = raw.decision;
  if (decision !== 'approve' && decision !== 'reject') {
    return { ok: false, issues: [{ field: 'decision', code: 'INVALID_ENUM_VALUE', message: 'decision must be approve or reject.' }] };
  }
  const expectedRevision = typeof raw.expectedRevision === 'number' && Number.isInteger(raw.expectedRevision) ? raw.expectedRevision : undefined;
  const rejectionReason = typeof raw.rejectionReason === 'string' ? raw.rejectionReason.trim() : undefined;
  if (decision === 'reject' && (!rejectionReason || rejectionReason.length < 3)) {
    return { ok: false, issues: [{ field: 'rejectionReason', code: 'REQUIRED_FIELD_MISSING', message: 'rejectionReason is required when rejecting an import job.' }] };
  }
  return {
    ok: true,
    issues: [],
    value: {
      decision,
      ...(expectedRevision !== undefined ? { expectedRevision } : {}),
      ...(rejectionReason ? { rejectionReason } : {}),
    },
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CoreApiError,
  type AuthenticatedPrincipal,
  type DelegatedAdminStoreAdapter,
  type FirebaseTokenVerifierAdapter,
  type TransactionContextLike,
  type TransactionRunnerAdapter,
} from '../../core';
import {
  createDataIngestionService,
  type DestinationDomainPublisherAdapter,
  type RecordProvenanceEnvelope,
  type StoredQuarantinedRecord,
  type StoredStagedRecord,
} from '../index';

function createMockFirestoreAdapter() {
  const docs = new Map<string, Record<string, unknown>>();

  const txRunner: TransactionRunnerAdapter = {
    async runTransaction<T>(fn: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      const staged = new Map<string, Record<string, unknown> | null>();
      const tx: TransactionContextLike = {
        async get<D = Record<string, unknown>>(docPath: string) {
          const current = staged.has(docPath) ? staged.get(docPath) : docs.get(docPath);
          if (!current) return { exists: false, id: docPath.split('/').pop() ?? '', data: undefined };
          return {
            exists: true,
            id: docPath.split('/').pop() ?? '',
            data: structuredClone(current) as D,
          };
        },
        set(docPath: string, data: Record<string, unknown>, setOpts?: { merge?: boolean }) {
          const existing = (staged.has(docPath) ? staged.get(docPath) : docs.get(docPath)) ?? {};
          staged.set(
            docPath,
            setOpts?.merge ? { ...structuredClone(existing), ...structuredClone(data) } : structuredClone(data),
          );
        },
        update(docPath: string, data: Record<string, unknown>) {
          const existing = (staged.has(docPath) ? staged.get(docPath) : docs.get(docPath)) ?? {};
          staged.set(docPath, { ...structuredClone(existing), ...structuredClone(data) });
        },
        delete(docPath: string) {
          staged.set(docPath, null);
        },
      };
      const result = await fn(tx);
      for (const [k, v] of staged.entries()) {
        if (v === null) docs.delete(k);
        else docs.set(k, v);
      }
      return result;
    },
  };

  return { docs, txRunner };
}

const dummyTokenVerifier: FirebaseTokenVerifierAdapter = {
  async verifyIdToken() {
    throw new Error('Not used in direct service tests');
  },
};

const adminStore: DelegatedAdminStoreAdapter = {
  async getDelegatedAdminByUid(uid: string) {
    if (uid === 'admin_ingester_1') {
      return { uid, email: 'ingester@radartehran.ir', role: 'delegated_admin', active: true };
    }
    return null;
  },
};

const regularUser: AuthenticatedPrincipal = {
  uid: 'user_regular_1',
  email: 'user@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  issuedAtSeconds: 1700000000,
  expiresAtSeconds: 1700003600,
  claims: {},
};

const adminPrincipal: AuthenticatedPrincipal = {
  uid: 'admin_ingester_1',
  email: 'ingester@radartehran.ir',
  emailVerified: true,
  role: 'delegated_admin',
  authMode: 'firebase_id_token',
  issuedAtSeconds: 1700000000,
  expiresAtSeconds: 1700003600,
  claims: {},
};

test('1. Authorization, source governance, anti-scraping rules & idempotent source registration', async () => {
  const db = createMockFirestoreAdapter();
  const service = createDataIngestionService({
    tokenVerifier: dummyTokenVerifier,
    adminStore,
    txRunner: db.txRunner,
  });

  // Non-admin user is rejected (403 FORBIDDEN)
  await assert.rejects(
    async () =>
      service.registerDataSource({
        principal: regularUser,
        idempotencyKey: 'idem_src_unauth',
        rawBody: {
          sourceId: 'cbi_housing_stats',
          sourceName: 'گزارش تحولات بازار مسکن',
          authorityOrPublisher: 'بانک مرکزی',
          dataCategory: 'public_property_statistics',
          supportedSchemaVersion: '1.0.0',
          licenseOrUsageTerms: 'Open Public Statistical Publication',
          legalAndTechnicalBasisApproved: true,
        },
        correlationId: 'corr_1',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN' && err.status === 403,
  );

  // Source without legalAndTechnicalBasisApproved or with scrapeUrl/bypassAuth is rejected
  await assert.rejects(
    async () =>
      service.registerDataSource({
        principal: adminPrincipal,
        idempotencyKey: 'idem_src_illegal',
        rawBody: {
          sourceId: 'unapproved_scraper',
          sourceName: 'Scraped Site',
          authorityOrPublisher: 'Unknown',
          dataCategory: 'market_observations',
          supportedSchemaVersion: '1.0.0',
          licenseOrUsageTerms: 'None',
          legalAndTechnicalBasisApproved: false,
          scrapeUrl: 'https://example.com',
        },
        correlationId: 'corr_2',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED' && err.status === 400,
  );

  // Valid source registration + idempotent replay
  const srcPayload = {
    sourceId: 'cbi_housing_stats',
    sourceName: 'گزارش رسمی تحولات مسکن',
    authorityOrPublisher: 'مرکز آمار و اطلاعات اقتصادی',
    dataCategory: 'public_property_statistics',
    supportedSchemaVersion: '1.0.0',
    licenseOrUsageTerms: 'انتشار عمومی با ذکر منبع رسمی',
    legalAndTechnicalBasisApproved: true,
  };

  const firstReg = await service.registerDataSource({
    principal: adminPrincipal,
    idempotencyKey: 'idem_src_valid_001',
    rawBody: srcPayload,
    correlationId: 'corr_3',
  });
  assert.equal(firstReg.replayed, false);
  assert.equal(firstReg.statusCode, 201);
  assert.equal(firstReg.source.ownerUid, adminPrincipal.uid);

  const replayReg = await service.registerDataSource({
    principal: adminPrincipal,
    idempotencyKey: 'idem_src_valid_001',
    rawBody: srcPayload,
    correlationId: 'corr_4',
  });
  assert.equal(replayReg.replayed, true);
  assert.equal(replayReg.source.id, 'cbi_housing_stats');
});

test('2. Duplicate detection, invalid/ambiguous record quarantine, raw preservation & reconciliation', async () => {
  const db = createMockFirestoreAdapter();
  const service = createDataIngestionService({
    tokenVerifier: dummyTokenVerifier,
    adminStore,
    txRunner: db.txRunner,
  });

  await service.registerDataSource({
    principal: adminPrincipal,
    idempotencyKey: 'idem_src_mkt_1',
    rawBody: {
      sourceId: 'official_market_obs',
      sourceName: 'شاخص قیمت منطقه‌ای',
      authorityOrPublisher: 'سامانه آمار شهری',
      dataCategory: 'market_observations',
      supportedSchemaVersion: '1.0',
      licenseOrUsageTerms: 'مجوز رسمی داده باز شهری',
      legalAndTechnicalBasisApproved: true,
    },
    correlationId: 'corr_m1',
  });

  const jobCreated = await service.createImportJob({
    principal: adminPrincipal,
    idempotencyKey: 'idem_job_mkt_1',
    rawBody: {
      sourceId: 'official_market_obs',
      sourceVersion: '2026-10',
      schemaVersion: '1.0',
      importMethod: 'manual_entry',
      retrievalOrSubmissionDateIso: '2026-10-15T08:00:00.000Z',
      totalExpectedRows: 5,
    },
    correlationId: 'corr_m2',
  });
  const jobId = jobCreated.job.id;

  // Batch of 5 rows:
  // Row 0: Valid (Tehran hood 1)
  // Row 1: Duplicate of Row 0 (same natural key & payload)
  // Row 2: Invalid missing hoodId (must be quarantined, never fabricated)
  // Row 3: Ambiguous record with conflictingSourceValue (must be quarantined as AMBIGUOUS_RECORD)
  // Row 4: Valid (Tehran hood 2)
  const batchResult = await service.ingestRecordsBatch({
    principal: adminPrincipal,
    jobId,
    rawBody: {
      rows: [
        { cityId: 'TEHRAN', hoodId: 1, avgPricePerSqmMillion: 145.678, observationPeriod: '2026-10', rawExtraNote: 'keep-me' },
        { cityId: 'tehran', hoodId: 1, avgPricePerSqmMillion: 145.678, observationPeriod: '2026-10' },
        { cityId: 'tehran', avgPricePerSqmMillion: 110, observationPeriod: '2026-10', unvalidatedField: 'preserve-me' },
        { cityId: 'tehran', hoodId: 3, avgPricePerSqmMillion: 98, observationPeriod: '2026-10', conflictingSourceValue: 135 },
        { cityId: 'tehran', hoodId: 2, avgPricePerSqmMillion: 132.5, observationPeriod: '2026-10' },
      ],
    },
    correlationId: 'corr_m3',
  });

  assert.equal(batchResult.job.status, 'staged_pending_review');
  assert.equal(batchResult.report.processedCount, 5);
  assert.equal(batchResult.report.validStagedCount, 2);
  assert.equal(batchResult.report.duplicateSkippedCount, 1);
  assert.equal(batchResult.report.quarantinedInvalidCount, 2);
  assert.equal(batchResult.report.reconciledBalanced, true);

  // Verify raw source values and provenance are preserved in staging & quarantine
  const stagedRow0 = db.docs.get(`ingestionStaging/${jobId}_row_0`) as unknown as StoredStagedRecord | undefined;
  assert.ok(stagedRow0);
  assert.equal(stagedRow0.rawSourceRecord.rawExtraNote, 'keep-me');
  assert.equal(stagedRow0.normalizedRecord.cityId, 'tehran');
  assert.equal(stagedRow0.normalizedRecord.avgPricePerSqmMillion, 145.68);
  assert.equal(stagedRow0.provenance.sourceVersion, '2026-10');

  const quarantinedRow2 = db.docs.get(`ingestionQuarantine/${jobId}_row_2`) as unknown as StoredQuarantinedRecord | undefined;
  assert.ok(quarantinedRow2);
  assert.equal(quarantinedRow2.quarantineReason, 'SCHEMA_VALIDATION_FAILED');
  assert.equal(quarantinedRow2.rawSourceRecord.unvalidatedField, 'preserve-me');

  const quarantinedRow3 = db.docs.get(`ingestionQuarantine/${jobId}_row_3`) as unknown as StoredQuarantinedRecord | undefined;
  assert.ok(quarantinedRow3);
  assert.equal(quarantinedRow3.quarantineReason, 'AMBIGUOUS_RECORD');
});

test('3. Version change tracking, structured CSV ingestion, approval gate & destination publication', async () => {
  const db = createMockFirestoreAdapter();
  const publishedBatches: Array<{
    jobId: string;
    sourceVersion: string;
    records: Array<{ naturalKey: string; provenance: RecordProvenanceEnvelope }>;
  }> = [];

  const destinationPublisher: DestinationDomainPublisherAdapter = {
    async publishApprovedRecords(params) {
      publishedBatches.push({
        jobId: params.jobId,
        sourceVersion: params.sourceVersion,
        records: params.records.map((r) => ({ naturalKey: r.naturalKey, provenance: r.provenance })),
      });
      return { acceptedCount: params.records.length };
    },
  };

  const service = createDataIngestionService({
    tokenVerifier: dummyTokenVerifier,
    adminStore,
    txRunner: db.txRunner,
    destinationPublisher,
  });

  await service.registerDataSource({
    principal: adminPrincipal,
    idempotencyKey: 'idem_src_geo_1',
    rawBody: {
      sourceId: 'tehran_geo_hoods',
      sourceName: 'مرزبندی رسمی محلات تهران',
      authorityOrPublisher: 'شهرداری تهران - داده باز',
      dataCategory: 'official_city_neighborhood_datasets',
      supportedSchemaVersion: '2.0',
      licenseOrUsageTerms: 'Open Municipality License',
      legalAndTechnicalBasisApproved: true,
    },
    correlationId: 'corr_g1',
  });

  // First job with version v2026.1
  await service.createImportJob({
    principal: adminPrincipal,
    idempotencyKey: 'idem_job_geo_v1',
    rawBody: {
      sourceId: 'tehran_geo_hoods',
      sourceVersion: 'v2026.1',
      schemaVersion: '2.0',
      importMethod: 'structured_file',
      retrievalOrSubmissionDateIso: '2026-09-01T00:00:00.000Z',
      totalExpectedRows: 1,
    },
    correlationId: 'corr_g2',
  });

  // Second job with version v2026.2 detects version change
  const jobV2 = await service.createImportJob({
    principal: adminPrincipal,
    idempotencyKey: 'idem_job_geo_v2',
    rawBody: {
      sourceId: 'tehran_geo_hoods',
      sourceVersion: 'v2026.2',
      schemaVersion: '2.0',
      importMethod: 'structured_file',
      retrievalOrSubmissionDateIso: '2026-11-01T00:00:00.000Z',
      totalExpectedRows: 2,
    },
    correlationId: 'corr_g3',
  });
  assert.equal(jobV2.job.versionChangeDetected, true);
  assert.equal(jobV2.job.previousSourceVersion, 'v2026.1');

  // Ingest structured CSV file
  const csvContent = ['cityId,hoodId,hoodName,districtNumber', 'tehran,1,زعفرانیه,1', 'tehran,2,ولنجک,1'].join('\n');
  const ingested = await service.ingestStructuredFile({
    principal: adminPrincipal,
    jobId: jobV2.job.id,
    rawBody: { format: 'csv_rows', content: csvContent },
    correlationId: 'corr_g4',
  });
  assert.equal(ingested.job.status, 'staged_pending_review');
  assert.equal(ingested.report.validStagedCount, 2);

  // Attempting to publish before admin approval is rejected (409 CONFLICT)
  await assert.rejects(
    async () =>
      service.publishApprovedJob({
        principal: adminPrincipal,
        jobId: jobV2.job.id,
        idempotencyKey: 'idem_pub_unapproved',
        correlationId: 'corr_g5',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'CONFLICT' && err.status === 409,
  );

  // Approve job and publish via destination domain adapter
  const approved = await service.moderateImportJob({
    principal: adminPrincipal,
    jobId: jobV2.job.id,
    rawBody: { decision: 'approve', expectedRevision: ingested.job.revision },
    correlationId: 'corr_g6',
  });
  assert.equal(approved.job.status, 'approved_for_publication');

  const published = await service.publishApprovedJob({
    principal: adminPrincipal,
    jobId: jobV2.job.id,
    idempotencyKey: 'idem_pub_v2_001',
    correlationId: 'corr_g7',
  });
  assert.equal(published.job.status, 'published');
  assert.equal(published.report.publishedRecordCount, 2);
  assert.equal(publishedBatches.length, 1);
  assert.equal(publishedBatches[0].records[0].provenance.approvedByUid, adminPrincipal.uid);
});

test('4. Interrupted jobs & repeatable resumable batch processing without duplicate staging', async () => {
  const db = createMockFirestoreAdapter();
  const service = createDataIngestionService({
    tokenVerifier: dummyTokenVerifier,
    adminStore,
    txRunner: db.txRunner,
  });

  await service.registerDataSource({
    principal: adminPrincipal,
    idempotencyKey: 'idem_src_resumable',
    rawBody: {
      sourceId: 'econ_indicators',
      sourceName: 'شاخص‌های کلان مسکن',
      authorityOrPublisher: 'پژوهشکده اقتصادی',
      dataCategory: 'economic_demographic_indicators',
      supportedSchemaVersion: '1.0',
      licenseOrUsageTerms: 'Open Research Data',
      legalAndTechnicalBasisApproved: true,
    },
    correlationId: 'corr_r1',
  });

  const jobCreated = await service.createImportJob({
    principal: adminPrincipal,
    idempotencyKey: 'idem_job_resumable',
    rawBody: {
      sourceId: 'econ_indicators',
      sourceVersion: '2026-Q4',
      schemaVersion: '1.0',
      importMethod: 'manual_entry',
      retrievalOrSubmissionDateIso: '2026-11-05T00:00:00.000Z',
      totalExpectedRows: 4,
    },
    correlationId: 'corr_r2',
  });
  const jobId = jobCreated.job.id;

  const fourRows = [
    { cityId: 'tehran', hoodId: 1, metricKey: 'vacancy_rate', metricValue: 4.2 },
    { cityId: 'tehran', hoodId: 2, metricKey: 'vacancy_rate', metricValue: 5.1 },
    { cityId: 'tehran', hoodId: 3, metricKey: 'vacancy_rate', metricValue: 3.8 },
    { cityId: 'tehran', hoodId: 4, metricKey: 'vacancy_rate', metricValue: 6.0 },
  ];

  // Simulate interruption after 2 rows
  const interrupted = await service.ingestRecordsBatch({
    principal: adminPrincipal,
    jobId,
    rawBody: { rows: fourRows, startRowIndex: 0, simulateInterruptionAfterRowCount: 2 },
    correlationId: 'corr_r3',
  });
  assert.equal(interrupted.job.status, 'interrupted');
  assert.equal(interrupted.job.cursorOffset, 2);
  assert.equal(interrupted.report.processedCount, 2);
  assert.equal(interrupted.report.unprocessedRemainingCount, 2);

  // Resume by re-submitting the full 4-row array from startRowIndex 0:
  // Rows 0 and 1 are skipped via cursorOffset, rows 2 and 3 are processed cleanly
  const resumed = await service.ingestRecordsBatch({
    principal: adminPrincipal,
    jobId,
    rawBody: { rows: fourRows, startRowIndex: 0 },
    correlationId: 'corr_r4',
  });
  assert.equal(resumed.job.status, 'staged_pending_review');
  assert.equal(resumed.job.cursorOffset, 4);
  assert.equal(resumed.report.processedCount, 4);
  assert.equal(resumed.report.validStagedCount, 4);
  assert.equal(resumed.report.duplicateSkippedCount, 0);
  assert.equal(resumed.report.reconciledBalanced, true);
  assert.equal(resumed.report.unprocessedRemainingCount, 0);
});

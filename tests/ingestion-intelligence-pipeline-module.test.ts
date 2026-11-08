/**
 * EMPLOYEE 70 — REAL ESTATE DATA INGESTION, EXTERNAL SOURCES & INTELLIGENCE PIPELINE TESTS
 * Comprehensive verification of all 26 requirements in Section 22 of Employee 70.
 */

import assert from 'node:assert/strict';
import type {
  AuthenticatedPrincipal,
  StructuredAuditEvent,
  TransactionContextLike,
  TransactionRunnerAdapter,
} from '../server/modules/core';
import {
  IngestionIntelligencePipelineService,
  assertSafeExternalUrl,
  normalizePersianTextAndDigits,
  type NormalizedIngestionRecord,
  type SourceProvenanceRecord,
  type ValuationEvidenceObservationRecord,
} from '../server/modules/ingestion-intelligence-pipeline';

function createInMemoryTxRunner(): TransactionRunnerAdapter {
  const store = new Map<string, Record<string, unknown>>();
  return {
    async runTransaction<T>(workFn: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      const tx: TransactionContextLike = {
        async get<D = Record<string, unknown>>(docPath: string) {
          const item = store.get(docPath);
          return { exists: Boolean(item), data: item as D | undefined };
        },
        set(docPath: string, data: Record<string, unknown>) {
          store.set(docPath, { ...data });
        },
        update(docPath: string, partial: Record<string, unknown>) {
          const prev = store.get(docPath) ?? {};
          store.set(docPath, { ...prev, ...partial });
        },
        delete(docPath: string) {
          store.delete(docPath);
        },
      };
      return workFn(tx);
    },
  };
}

async function runTests() {
  const txRunner = createInMemoryTxRunner();
  const auditEvents: StructuredAuditEvent[] = [];

  const propagatedProperties: { record: NormalizedIngestionRecord; provenance: SourceProvenanceRecord }[] = [];
  const propagatedValuations: ValuationEvidenceObservationRecord[] = [];
  const searchRefreshes: NormalizedIngestionRecord[] = [];
  const alertTriggers: NormalizedIngestionRecord[] = [];

  const service = new IngestionIntelligencePipelineService({
    txRunner,
    auditSink: {
      async writeAuditEvent(event) {
        auditEvents.push(event);
      },
    },
    knownCanonicalEntities: [
      {
        canonicalPropertyId: 'prop_canonical_100',
        canonicalListingId: 'lst_canonical_100',
        nationalPropertyCode: '1400998877',
        postalCode: '1987654321',
        cityName: 'تهران',
        districtCode: 1,
        neighborhoodName: 'نیاوران',
        normalizedAddressFa: 'نیاوران خیابان باهنر کوچه گلستان پلاک 12',
        areaSqm: 145,
        latitude: 35.8125,
        longitude: 51.4712,
      },
    ],
    onCanonicalPropertyPropagated: (record, provenance) => {
      propagatedProperties.push({ record, provenance });
    },
    onValuationEvidencePropagated: (obs) => {
      propagatedValuations.push(obs);
    },
    onSearchIndexRefreshRequested: (record) => {
      searchRefreshes.push(record);
    },
    onAlertTriggerRequested: (record) => {
      alertTriggers.push(record);
    },
  });

  const adminActor: AuthenticatedPrincipal = {
    uid: 'admin_ingest_1',
    email: 'ingest-admin@tehranradar.ir',
    emailVerified: true,
    role: 'primary_admin',
    authMode: 'firebase_id_token',
    claims: {},
  };

  const regularUser: AuthenticatedPrincipal = {
    uid: 'user_regular_99',
    email: 'buyer@tehranradar.ir',
    emailVerified: true,
    role: 'verified_user',
    authMode: 'firebase_id_token',
    claims: {},
  };

  // 1. Source registration & permission verification
  await assert.rejects(
    () =>
      service.registerDataSource(adminActor, {
        sourceId: 'src_unlicensed',
        name: 'Unlicensed Scraper Feed',
        category: 'AUTHORIZED_LISTING_FEED',
        owner: 'External',
        providerName: 'Unverified',
        licensingReference: 'NONE',
        permissionVerified: false,
        allowedDomains: ['partner.example.com'],
        connectorFormat: 'JSON',
        ingestionFrequencyMinutes: 60,
        reliabilityClassification: 'UNVERIFIED_EXTERNAL',
        defaultProvenanceClassification: 'PLATFORM_OBSERVED',
        trustScore: 30,
        status: 'ACTIVE',
        schemaVersion: '1.0',
        requiresManualApprovalBeforePublish: true,
        maxPayloadBytes: 500_000,
        maxRecordsPerBatch: 100,
      }),
    /UNLICENSED_OR_UNAUTHORIZED_DATA_SOURCE/,
  );

  // Register official transaction dataset & partner listing feed
  const officialGovSource = await service.registerDataSource(adminActor, {
    sourceId: 'src_official_transactions',
    name: 'Official Real Estate Transactions Registry',
    category: 'OFFICIAL_PUBLIC_DATASET',
    owner: 'Ministry Statistical Registry',
    providerName: 'Iran Official Housing Stats',
    licensingReference: 'GOV-OPEN-DATA-2026-01',
    permissionVerified: true,
    allowedDomains: ['stats.gov.example.ir'],
    connectorFormat: 'JSON',
    ingestionFrequencyMinutes: 1440,
    reliabilityClassification: 'AUTHORITATIVE_OFFICIAL',
    defaultProvenanceClassification: 'OFFICIALLY_SOURCED',
    trustScore: 98,
    status: 'ACTIVE',
    schemaVersion: '2.1',
    secretEnvKeyRef: 'OFFICIAL_REGISTRY_API_KEY',
    requiresManualApprovalBeforePublish: false,
    maxPayloadBytes: 2_000_000,
    maxRecordsPerBatch: 500,
  });
  assert.equal(officialGovSource.sourceId, 'src_official_transactions');

  const partnerFeedSource = await service.registerDataSource(adminActor, {
    sourceId: 'src_partner_broker_feed',
    name: 'Licensed Brokerage Partner Feed',
    category: 'AUTHORIZED_LISTING_FEED',
    owner: 'Tehran Brokerage Syndicate Partner',
    providerName: 'Syndicate XML/CSV Feed',
    licensingReference: 'LIC-2026-8841',
    permissionVerified: true,
    allowedDomains: ['feed.syndicate.example.ir'],
    connectorFormat: 'CSV',
    ingestionFrequencyMinutes: 60,
    reliabilityClassification: 'VERIFIED_PARTNER',
    defaultProvenanceClassification: 'BROKER_SUBMITTED',
    trustScore: 85,
    status: 'ACTIVE',
    schemaVersion: '1.4',
    requiresManualApprovalBeforePublish: false,
    maxPayloadBytes: 1_000_000,
    maxRecordsPerBatch: 200,
  });
  assert.equal(partnerFeedSource.status, 'ACTIVE');

  // 2. Unauthorized ingestion trigger rejection
  await assert.rejects(
    () =>
      service.executeIngestionPipelineBatch(regularUser, {
        sourceId: 'src_official_transactions',
        idempotencyKey: 'unauthorized_attempt_1',
        records: [],
      }),
    /Administrative privileges are required/,
  );

  // 3. SSRF protection verification
  assert.throws(
    () => assertSafeExternalUrl('http://127.0.0.1:8080/internal', ['127.0.0.1']),
    /SSRF_PRIVATE_NETWORK_BLOCKED/,
  );
  assert.throws(
    () => assertSafeExternalUrl('http://169.254.169.254/latest/meta-data', ['169.254.169.254']),
    /SSRF_PRIVATE_NETWORK_BLOCKED/,
  );
  assert.throws(
    () => assertSafeExternalUrl('file:///etc/passwd', ['stats.gov.example.ir']),
    /SSRF_BLOCKED_PROTOCOL/,
  );
  assert.throws(
    () => assertSafeExternalUrl('https://evil.attacker.com/feed.json', ['stats.gov.example.ir']),
    /SSRF_DOMAIN_NOT_ALLOWLISTED/,
  );
  const safeUrl = assertSafeExternalUrl('https://stats.gov.example.ir/v2/transactions', ['stats.gov.example.ir']);
  assert.equal(safeUrl.hostname, 'stats.gov.example.ir');

  // 4. Malicious file / XXE / script upload rejection & malformed payload handling
  await assert.rejects(
    () =>
      service.executeIngestionPipelineBatch(adminActor, {
        sourceId: 'src_official_transactions',
        idempotencyKey: 'malicious_xxe_batch',
        rawFormat: 'XML',
        rawPayloadText: '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><record>&xxe;</record>',
      }),
    /MALICIOUS_INGESTION_PAYLOAD_REJECTED/,
  );

  await assert.rejects(
    () =>
      service.executeIngestionPipelineBatch(adminActor, {
        sourceId: 'src_official_transactions',
        idempotencyKey: 'malformed_json_batch',
        rawFormat: 'JSON',
        rawPayloadText: '{ broken_json: [1, 2 ',
      }),
    /MALFORMED_INGESTION_JSON/,
  );

  // 5. Persian text, digits, currency, area, coordinate normalization + entity resolution + quarantine
  assert.equal(normalizePersianTextAndDigits('آپارتمان ۱۲۵ متری در نیاوران ي ك'), 'آپارتمان 125 متری در نیاوران ی ک');

  const batchResult = await service.executeIngestionPipelineBatch(adminActor, {
    sourceId: 'src_official_transactions',
    idempotencyKey: 'batch_gov_2026_11_08_01',
    cursorToken: 'cursor_page_101',
    fetchUrl: 'https://stats.gov.example.ir/api/transactions?cursor=100',
    records: [
      {
        externalRecordId: 'gov_tx_۱۰۰۱',
        recordDomain: 'TRANSACTION_OBSERVATION',
        title: 'آپارتمان نوساز ۱۱۰ متری دارای پارکینگ و آسانسور',
        address: 'سعادت آباد بلوار دریا خیابان صرافها پلاک ۲۴',
        city: 'تهران',
        district: '۲',
        neighborhood: 'سعادت آباد',
        propertyCategory: 'RESIDENTIAL',
        transactionMode: 'SALE',
        area: '۱۱۰',
        areaUnit: 'SQM',
        price: '۱۶۵۰۰۰۰۰۰۰۰',
        currency: 'TOMAN',
        isVerifiedTransaction: true,
        latitude: '۳۵.۷۷۸۲',
        longitude: '۵۱.۳۶۲۰',
        buildingAge: '۲',
        bedrooms: '۲',
        postalCode: '۱۹۹۸۸۷۷۶۶۵',
      },
      {
        externalRecordId: 'gov_tx_1001',
        title: 'Duplicate row in same batch',
        city: 'تهران',
        district: 2,
        area: 110,
        price: 16500000000,
        currency: 'TOMAN',
        isVerifiedTransaction: true,
      },
      {
        externalRecordId: 'gov_tx_1002',
        title: 'معامله قطعی آپارتمان نیاوران',
        address: 'نیاوران خیابان باهنر کوچه گلستان پلاک ۱۲',
        city: 'تهران',
        district: 1,
        neighborhood: 'نیاوران',
        area: 145,
        price: 290000000000,
        currency: 'RIAL',
        isVerifiedTransaction: true,
        nationalPropertyCode: '۱۴۰۰۹۹۸۸۷۷',
        latitude: 35.8125,
        longitude: 51.4712,
      },
      {
        externalRecordId: 'gov_tx_1003',
        title: 'واحد مسکونی نیاوران گلستان',
        address: 'نیاوران خیابان باهنر کوچه گلستان پلاک 12 واحد 4',
        city: 'تهران',
        district: 1,
        neighborhood: 'نیاوران',
        area: 146,
        price: 29500000000,
        currency: 'TOMAN',
        isVerifiedTransaction: true,
        postalCode: '1987654321',
        latitude: 35.8126,
        longitude: 51.4713,
      },
      {
        externalRecordId: 'gov_tx_1004_bad',
        title: 'رکورد معیوب',
        city: 'تهران',
        district: 99,
        area: -25,
        price: 50,
        latitude: 88.99,
        longitude: 12.34,
      },
    ],
  });

  assert.equal(batchResult.batch.totalReceivedCount, 5);
  assert.equal(batchResult.batch.validCount, 4);
  assert.equal(batchResult.batch.quarantinedCount, 1);
  assert.equal(batchResult.batch.duplicateSkippedCount, 1);
  assert.equal(batchResult.batch.ambiguousReviewCount, 1);
  assert.equal(batchResult.batch.propagatedCanonicalCount, 2);
  assert.equal(batchResult.batch.status, 'PARTIALLY_COMPLETED');

  // Verify idempotent batch replay
  const replayResult = await service.executeIngestionPipelineBatch(adminActor, {
    sourceId: 'src_official_transactions',
    idempotencyKey: 'batch_gov_2026_11_08_01',
    records: [],
  });
  assert.equal(replayResult.batch.batchId, batchResult.batch.batchId);
  assert.equal(propagatedProperties.length, 2);

  // Verify incremental synchronization checkpoint was saved
  const checkpoint = service.getCheckpoint('src_official_transactions');
  assert.ok(checkpoint);
  assert.equal(checkpoint.cursorToken, 'cursor_page_101');

  // 6. CSV & XML connector parsing + separation of asking prices vs verified transaction prices
  const csvPayload = [
    'externalRecordId,title,address,city,district,neighborhood,area,price,currency,latitude,longitude',
    'csv_2001,آپارتمان ۸۵ متری ونک,ملاصدرا کوچه شیراز,تهران,3,ونک,85,11900000000,TOMAN,35.7575,51.4100',
  ].join('\n');

  const csvBatch = await service.executeIngestionPipelineBatch(adminActor, {
    sourceId: 'src_partner_broker_feed',
    idempotencyKey: 'batch_csv_partner_01',
    rawFormat: 'CSV',
    rawPayloadText: csvPayload,
  });
  assert.equal(csvBatch.batch.validCount, 1);
  assert.equal(csvBatch.normalizedRecords[0].isAskingPrice, true);
  assert.equal(csvBatch.normalizedRecords[0].isVerifiedTransactionPrice, false);

  const askingObservations = service.getValuationObservations({
    evidenceCategory: 'ASKING_PRICE_OBSERVATION',
  });
  const verifiedObservations = service.getValuationObservations({
    evidenceCategory: 'VERIFIED_TRANSACTION_OBSERVATION',
  });
  assert.equal(askingObservations.length, 1);
  assert.equal(verifiedObservations.length, 2);

  // 7. Human review of ambiguous candidate record (Record D)
  const ambiguousResolution = batchResult.resolutions.find(
    (r) => r.decision === 'AMBIGUOUS_CANDIDATE_REQUIRES_REVIEW',
  );
  assert.ok(ambiguousResolution);

  const reviewedResolution = await service.reviewAmbiguousEntityCandidate(
    adminActor,
    ambiguousResolution.normalizedRecordId,
    'APPROVE_MERGE',
    'prop_canonical_100',
  );
  assert.equal(reviewedResolution.reviewStatus, 'HUMAN_APPROVED_MERGE');
  assert.equal(reviewedResolution.matchedCanonicalPropertyId, 'prop_canonical_100');
  assert.equal(propagatedProperties.length, 4);

  // 8. Manual approval gate & batch rollback
  const manualUploadSource = await service.registerDataSource(adminActor, {
    sourceId: 'src_manual_upload_curated',
    name: 'Curated Research Spreadsheet Upload',
    category: 'MANUAL_UPLOAD_DATASET',
    owner: 'Research Team',
    providerName: 'Internal Research Analysts',
    licensingReference: 'INTERNAL-RESEARCH-2026',
    permissionVerified: true,
    allowedDomains: [],
    connectorFormat: 'XML',
    ingestionFrequencyMinutes: 0,
    reliabilityClassification: 'MANUAL_CURATED',
    defaultProvenanceClassification: 'MANUALLY_VERIFIED',
    trustScore: 90,
    status: 'ACTIVE',
    schemaVersion: '1.0',
    requiresManualApprovalBeforePublish: true,
    maxPayloadBytes: 500_000,
    maxRecordsPerBatch: 100,
  });
  assert.equal(manualUploadSource.requiresManualApprovalBeforePublish, true);

  const xmlBatch = await service.executeIngestionPipelineBatch(adminActor, {
    sourceId: 'src_manual_upload_curated',
    idempotencyKey: 'batch_xml_manual_01',
    rawFormat: 'XML',
    rawPayloadText: `
      <records>
        <record>
          <externalRecordId>xml_3001</externalRecordId>
          <title>واحد اداری جردن</title>
          <city>تهران</city>
          <district>3</district>
          <neighborhood>جردن</neighborhood>
          <propertyCategory>OFFICE</propertyCategory>
          <area>120</area>
          <price>18000000000</price>
          <currency>TOMAN</currency>
        </record>
      </records>
    `,
  });
  assert.equal(xmlBatch.batch.status, 'AWAITING_APPROVAL');
  assert.equal(xmlBatch.batch.propagatedCanonicalCount, 0);

  const approvedBatch = await service.approveOrRollbackBatch(
    adminActor,
    xmlBatch.batch.batchId,
    'APPROVE',
    'Verified by lead research analyst',
  );
  assert.equal(approvedBatch.status, 'COMPLETED');
  assert.equal(approvedBatch.propagatedCanonicalCount, 1);

  const rolledBackBatch = await service.approveOrRollbackBatch(
    adminActor,
    xmlBatch.batch.batchId,
    'ROLLBACK',
    'Reverting manual batch for recalibration',
  );
  assert.equal(rolledBackBatch.status, 'ROLLED_BACK');
  assert.equal(rolledBackBatch.propagatedCanonicalCount, 0);

  // 9. Pause data source & verify ingestion blocked when paused
  await service.setDataSourceStatus(adminActor, 'src_partner_broker_feed', 'PAUSED');
  await assert.rejects(
    () =>
      service.executeIngestionPipelineBatch(adminActor, {
        sourceId: 'src_partner_broker_feed',
        idempotencyKey: 'batch_while_paused',
        records: [],
      }),
    /DATA_SOURCE_NOT_ACTIVE/,
  );

  // 10. Operational metrics & audit trail check
  const metrics = service.getOperationalMetrics(adminActor);
  assert.equal(metrics.registeredSourcesCount, 3);
  assert.equal(metrics.activeSourcesCount, 2);
  assert.ok(metrics.totalBatchesExecuted >= 3);
  assert.ok(searchRefreshes.length >= 4);
  assert.ok(alertTriggers.length >= 4);
  assert.ok(auditEvents.length >= 8);

  console.log('ALL EMPLOYEE 70 INGESTION & INTELLIGENCE PIPELINE TESTS PASSED');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

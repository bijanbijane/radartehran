/** @file src/features/data-governance/services/dataGovernanceSeeds.ts — Canonical Source/Methodology Baselines & Test Demo Fixture */
import type {
  DataClaimRecord,
  DataSourceRecord,
  EntityVersionRecord,
  EvidenceRecord,
  MethodologyRecord,
  ProvenanceEdge,
  ReconciliationCase,
} from '../models/dataGovernance.types';

export const INITIAL_DATA_SOURCES: DataSourceRecord[] = [
  {
    id: 'src-official-tehran-gis', nameFa: 'مرجع رسمی نقشه و مرز محلات شهرداری تهران (GIS)', sourceType: 'OFFICIAL',
    organizationFa: 'سازمان فناوری اطلاعات و ارتباطات شهرداری تهران', domains: ['GEOGRAPHIC_BOUNDARIES', 'URBAN_INFRASTRUCTURE'],
    geographicCoverageFa: 'مناطق ۲۲گانه و ۳۵۴ محله شهر تهران', temporalCoverageFa: '۱۴۰۲ تا ۱۴۰۵', collectionMethod: 'FILE_BATCH',
    updateFrequencyFa: 'سالانه / پس از مصوبات مرزبندی', owner: 'Geo Data Steward',
    domainReliability: [
      { domain: 'GEOGRAPHIC_BOUNDARIES', level: 'HIGH', rationaleFa: 'مرجع رسمی مرزبندی اداری و کدهای نوسازی', assessedAt: '2026-04-01T00:00:00Z' },
      { domain: 'MARKET_INDICATORS', level: 'NOT_APPLICABLE', rationaleFa: 'این منبع داده قیمتی بازار ارائه نمی‌کند.', assessedAt: '2026-04-01T00:00:00Z' },
    ],
    usagePolicy: {
      id: 'pol-gis-1', sourceId: 'src-official-tehran-gis', purpose: 'نمایش مرز محلات و تحلیل مکانی عمومی',
      collectAllowed: true, storeAllowed: true, transformAllowed: true, analyzeAllowed: true, displayAllowed: true, redistributeAllowed: false, trainAllowed: true,
      attributionRequired: true, attributionTextFa: 'منبع هندسه مرز محلات: سامانه GIS شهرداری تهران (نسخه ۱۴۰۵)', retentionDays: 1825,
      licenseReference: 'TEHRAN-OPEN-GIS-1405', effectiveFrom: '2025-03-21T00:00:00Z', status: 'ATTRIBUTION_REQUIRED',
    },
    status: 'ACTIVE', lastVerifiedAt: '2026-04-10T08:00:00Z', createdAt: '2025-04-01T00:00:00Z', updatedAt: '2026-04-10T08:00:00Z',
  },
  {
    id: 'src-first-party-listings', nameFa: 'فایل‌ها و آگهی‌های ثبت‌شده در رادار تهران', sourceType: 'FIRST_PARTY',
    organizationFa: 'سکوی رادار تهران', domains: ['MARKET_INDICATORS', 'BUILDING_CHARACTERISTICS'],
    geographicCoverageFa: 'تهران و شهرهای اقماری', temporalCoverageFa: 'پایش پیوسته روزانه', collectionMethod: 'INTERNAL_PIPELINE',
    updateFrequencyFa: 'لحظه‌ای / روزانه', owner: 'Market Data Steward',
    domainReliability: [
      { domain: 'MARKET_INDICATORS', level: 'HIGH', rationaleFa: 'نشان‌دهنده قیمت پیشنهادی فروشندگان (نه قیمت قطعی معامله)', assessedAt: '2026-04-05T00:00:00Z' },
      { domain: 'REAL_ESTATE_TRANSACTIONS', level: 'LOW', rationaleFa: 'آگهی پیشنهادی بدون سند معامله، شاهد قطعی معامله نیست.', assessedAt: '2026-04-05T00:00:00Z' },
    ],
    usagePolicy: {
      id: 'pol-fp-1', sourceId: 'src-first-party-listings', purpose: 'محاسبه میانه قیمت پیشنهادی و شاخص عرضه',
      collectAllowed: true, storeAllowed: true, transformAllowed: true, analyzeAllowed: true, displayAllowed: true, redistributeAllowed: true, trainAllowed: true,
      attributionRequired: false, retentionDays: 730, licenseReference: 'RADAR-1P-TOS-V2', effectiveFrom: '2025-01-01T00:00:00Z', status: 'OPEN_USE',
    },
    status: 'ACTIVE', lastVerifiedAt: '2026-04-12T06:00:00Z', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-04-12T06:00:00Z',
  },
  {
    id: 'src-licensed-partner-analytics', nameFa: 'مجموعه‌داده قراردادی پایش دفاتر مشاور املاک منتخب', sourceType: 'LICENSED',
    organizationFa: 'کنسرسیوم داده مسکن (قراردادی)', domains: ['MARKET_INDICATORS', 'REAL_ESTATE_TRANSACTIONS'],
    geographicCoverageFa: 'مناطق ۱ تا ۸ تهران', temporalCoverageFa: '۱۴۰۳ تا ۱۴۰۵', collectionMethod: 'API',
    updateFrequencyFa: 'هفتگی', owner: 'Source Manager',
    domainReliability: [
      { domain: 'MARKET_INDICATORS', level: 'HIGH', rationaleFa: 'نمونه‌های پالایش‌شده دارای کد رهگیری یا تایید مشاور', assessedAt: '2026-04-01T00:00:00Z' },
    ],
    usagePolicy: {
      id: 'pol-lic-1', sourceId: 'src-licensed-partner-analytics', purpose: 'فقط تحلیل آماری و استخراج شاخص تجمیعی (انتشار رکورد خام ممنوع)',
      collectAllowed: true, storeAllowed: true, transformAllowed: true, analyzeAllowed: true, displayAllowed: false, redistributeAllowed: false, trainAllowed: false,
      attributionRequired: true, attributionTextFa: 'تحلیل مبتنی بر نمونه‌های پالایش‌شده شبکه مشاوران همکار', retentionDays: 365,
      licenseReference: 'PARTNER-LIC-2026-09', effectiveFrom: '2026-01-01T00:00:00Z', effectiveTo: '2026-12-30T00:00:00Z', status: 'INTERNAL_ANALYSIS_ONLY',
    },
    status: 'RESTRICTED', lastVerifiedAt: '2026-04-02T00:00:00Z', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-04-02T00:00:00Z',
  },
];

export const INITIAL_METHODOLOGIES: MethodologyRecord[] = [
  {
    id: 'meth-median-offer-v2', code: 'MEDIAN_OFFER_PRICE',
    nameFa: 'میانه و صدک‌های قیمت پیشنهادی پس از حذف داده‌های پرت (IQR Trimmed)', domain: 'MARKET_INDICATORS', version: '2.1',
    descriptionFa: 'محاسبه میانه، صدک ۱۰ و صدک ۹۰ قیمت هر مترمربع از آگهی‌های یکتا و غیرتکراری در بازه ۳۰ روزه.',
    calculationDefinitionFa: 'حذف آگهی‌های تکراری با Hash مشخصات، حذف مقادیر خارج از بازه [Q1 - 1.5*IQR, Q3 + 1.5*IQR] و محاسبه P50.',
    limitationsFa: ['بر پایه قیمت‌های پیشنهادی فروشندگان است و معادل قیمت قطعی معامله ثبتی نیست.', 'در محله‌های با کمتر از ۱۵ نمونه یکتا، وضعیت کفایت LIMITED اعلام می‌شود.'],
    reviewer: 'Methodology Reviewer', status: 'ACTIVE', effectiveFrom: '2026-01-01T00:00:00Z', publishedAt: '2026-01-05T00:00:00Z',
  },
  {
    id: 'meth-hedonic-v1405', code: 'HEDONIC_VALUATION_V1405',
    nameFa: 'مدل هدونیک برآورد بازه ارزش ملک و سناریوی معامله v6.4', domain: 'MARKET_INDICATORS', version: '1405.1',
    descriptionFa: 'تعدیل پایه قیمت محله بر اساس سن بنا، طبقه، آسانسور، پارکینگ، نورگیری و ضریب نقدشوندگی.',
    calculationDefinitionFa: 'BaseHoodPrice * AgeFactor * FloorFactor * AmenityFactor * DealDiscountFactor',
    limitationsFa: ['خروجی مدل، برآورد آماری است و جایگزین کارشناسی رسمی دادگستری یا سند ثبتی نمی‌شود.'],
    reviewer: 'Domain Expert', status: 'ACTIVE', effectiveFrom: '2026-03-21T00:00:00Z', publishedAt: '2026-03-21T00:00:00Z',
  },
];

export function buildDemoDgovFixture(): {
  claims: DataClaimRecord[];
  evidences: EvidenceRecord[];
  reconciliationCases: ReconciliationCase[];
  lineageEdges: ProvenanceEdge[];
  entityVersions: EntityVersionRecord[];
} {
  return {
    claims: [
      {
        id: 'claim-saadat-median-ask', entityType: 'MARKET_INDICATOR', entityId: 'saadat-abad', attribute: 'medianAskingPricePerSqm',
        value: 142, unit: 'MILLION_TOMAN_PER_SQM', sourceId: 'src-first-party-listings', sourceType: 'FIRST_PARTY',
        evidenceRefs: ['ev-101'], observedAt: '2026-04-12T06:00:00Z', validFrom: '2026-04-01T00:00:00Z',
        recordedAt: '2026-04-12T06:05:00Z', verificationStatus: 'VERIFIED', confidenceLevel: 'HIGH', createdBy: 'ingestion-worker',
      },
      {
        id: 'claim-prop-101-area-a', entityType: 'PROPERTY', entityId: 'prop-saadat-105', attribute: 'areaSqm', value: 110, unit: 'SQM',
        sourceId: 'src-first-party-listings', sourceType: 'FIRST_PARTY', evidenceRefs: ['ev-private-deed-900'],
        observedAt: '2026-04-01T10:00:00Z', validFrom: '2026-04-01T00:00:00Z', recordedAt: '2026-04-01T10:05:00Z',
        verificationStatus: 'REPORTED', confidenceLevel: 'MEDIUM', createdBy: 'listing-publisher',
      },
      {
        id: 'claim-prop-101-area-b', entityType: 'PROPERTY', entityId: 'prop-saadat-105', attribute: 'areaSqm', value: 105, unit: 'SQM',
        sourceId: 'src-licensed-partner-analytics', sourceType: 'LICENSED', evidenceRefs: ['ev-101'],
        observedAt: '2026-04-08T10:00:00Z', validFrom: '2026-04-08T00:00:00Z', recordedAt: '2026-04-08T12:00:00Z',
        verificationStatus: 'SUPPORTED', confidenceLevel: 'HIGH', createdBy: 'partner-sync',
      },
    ],
    evidences: [
      {
        id: 'ev-101', evidenceType: 'DATASET', sourceId: 'src-first-party-listings',
        storageRef: 'vault://snapshots/saadat-abad-1405-08.json', contentHash: 'sha256:9f86d081884c7d659a2feaa0c55ad015',
        capturedAt: '2026-04-12T06:00:00Z', receivedAt: '2026-04-12T06:05:00Z', createdBy: 'ingestion-worker',
        relatedClaimIds: ['claim-saadat-median-ask'], verificationStatus: 'VERIFIED', accessPolicy: 'PUBLIC', retentionDays: 730,
        summaryFa: 'اسنپ‌شات ۱۲۴ آگهی یکتای آپارتمان مسکونی در سعادت‌آباد (داده نمونه آزمایشی)',
      },
      {
        id: 'ev-private-deed-900', evidenceType: 'OFFICIAL_RECORD', sourceId: 'src-first-party-listings',
        storageRef: 'vault://restricted/deed-scan-900.pdf', contentHash: 'sha256:4b227777d4dd1fc61c6f884f48641d02',
        capturedAt: '2026-04-10T10:00:00Z', receivedAt: '2026-04-10T10:01:00Z', createdBy: 'usr-owner-1',
        relatedClaimIds: ['claim-prop-101-area-a'], verificationStatus: 'VERIFIED', accessPolicy: 'RESTRICTED', retentionDays: 180,
        summaryFa: 'تصویر سند مالکیت خصوصی (غیرقابل نمایش عمومی)',
      },
    ],
    reconciliationCases: [
      {
        id: 'recon-case-101', entityType: 'PROPERTY', entityId: 'prop-saadat-105', attribute: 'areaSqm',
        claimIds: ['claim-prop-101-area-a', 'claim-prop-101-area-b'], conflictType: 'CORE_AREA_DISCREPANCY',
        severity: 'HIGH', requiresHumanReview: true, assignedTo: 'reviewer-steward-1', conflictedReviewerIds: ['usr-owner-1'],
        status: 'UNDER_REVIEW', createdAt: '2026-04-09T09:00:00Z',
      },
    ],
    lineageEdges: [
      { id: 'edge-1', parentType: 'RAW_RECORD', parentId: 'raw-batch-saadat-1405-08', childType: 'STAGING_BATCH', childId: 'staging-dedup-v3', transformationId: 'DEDUP_HASH_V3', relationshipType: 'NORMALIZED_BY', contentHash: 'sha256:1111aaaa', createdAt: '2026-04-12T06:01:00Z' },
      { id: 'edge-2', parentType: 'STAGING_BATCH', parentId: 'staging-dedup-v3', childType: 'SNAPSHOT', childId: 'mkt-snapshot-2026-04-12', transformationId: 'UNIT_NORM_V2', relationshipType: 'AGGREGATED_INTO', contentHash: 'sha256:2222bbbb', createdAt: '2026-04-12T06:03:00Z' },
      { id: 'edge-3', parentType: 'SNAPSHOT', parentId: 'mkt-snapshot-2026-04-12', childType: 'PUBLISHED_INDICATOR', childId: 'saadat-abad', transformationId: 'MEDIAN_OFFER_PRICE_V2.1', relationshipType: 'PUBLISHED_AS', contentHash: 'sha256:3333cccc', createdAt: '2026-04-12T06:05:00Z' },
    ],
    entityVersions: [
      {
        id: 'ver-saadat-1', entityType: 'MARKET_INDICATOR', entityId: 'saadat-abad', attribute: 'medianAskingPricePerSqm',
        versionNumber: 1, dataVersion: '2026-03-15', methodologyVersion: '2.0', value: 138.4, sourceId: 'src-first-party-listings',
        qualityStatus: 'SUPPORTED', snapshotRef: 'mkt-snapshot-2026-03-15', validFrom: '2026-03-01T00:00:00Z', validTo: '2026-03-31T23:59:59Z',
        recordedAt: '2026-03-15T08:00:00Z', changeType: 'SOURCE_UPDATE', changeReasonFa: 'ثبت Snapshot اسفند ماه بازار سعادت‌آباد', approvedBy: 'Market Data Steward',
      },
      {
        id: 'ver-saadat-2', entityType: 'MARKET_INDICATOR', entityId: 'saadat-abad', attribute: 'medianAskingPricePerSqm',
        versionNumber: 2, dataVersion: '2026-04-12', methodologyVersion: '2.1', value: 142.0, sourceId: 'src-first-party-listings',
        qualityStatus: 'VERIFIED', snapshotRef: 'mkt-snapshot-2026-04-12', validFrom: '2026-04-01T00:00:00Z',
        recordedAt: '2026-04-12T06:05:00Z', supersedesVersion: 1, changeType: 'METHODOLOGY_CHANGE',
        changeReasonFa: 'بروزرسانی به روش حذف پرت IQR نسخه ۲.۱', approvedBy: 'Methodology Reviewer',
      },
    ],
  };
}

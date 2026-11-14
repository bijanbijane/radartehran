/**
 * RT-UI-DATA-GOV-001 | Data Quality, Provenance, Source Registry,
 * Claims Reconciliation, Lineage Graph & Temporal Versioning Engine
 */

import {
  DataClaimRecord,
  DataCorrectionProposal,
  DataSourceRecord,
  DataSourceStatus,
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

const HIGH_STAKES_CONFLICT_TYPES = new Set<ReconciliationCase['conflictType']>([
  'BOUNDARY_GEOMETRY', 'LEGAL_OWNERSHIP', 'TRANSACTION_DEAL_PRICE', 'CORE_AREA_DISCREPANCY',
]);

export class DataGovernanceEngine {
  private sources: Map<string, DataSourceRecord> = new Map();
  private claims: Map<string, DataClaimRecord> = new Map();
  private evidences: Map<string, EvidenceRecord> = new Map();
  private lineageEdges: ProvenanceEdge[] = [];
  private reconciliationCases: Map<string, ReconciliationCase> = new Map();
  private entityVersions: EntityVersionRecord[] = [];
  private methodologies: Map<string, MethodologyRecord> = new Map();
  private correctionProposals: Map<string, DataCorrectionProposal> = new Map();
  private auditLogs: Array<{ id: string; actor: string; action: string; targetId: string; reasonFa: string; timestamp: string }> = [];

  constructor() {
    INITIAL_DATA_SOURCES.forEach((s) => this.sources.set(s.id, { ...s, usagePolicy: { ...s.usagePolicy } }));
    INITIAL_METHODOLOGIES.forEach((m) => this.methodologies.set(m.id, { ...m }));
    this.seedInitialClaimsLineageAndConflicts();
  }

  private seedInitialClaimsLineageAndConflicts(): void {
    this.evidences.set('ev-101', {
      id: 'ev-101', evidenceType: 'DATASET', sourceId: 'src-first-party-listings',
      storageRef: 'vault://snapshots/saadat-abad-1405-08.json', contentHash: 'sha256:9f86d081884c7d659a2feaa0c55ad015',
      capturedAt: '2026-04-12T06:00:00Z', receivedAt: '2026-04-12T06:05:00Z', createdBy: 'ingestion-worker',
      relatedClaimIds: ['claim-saadat-median-ask'], verificationStatus: 'VERIFIED', accessPolicy: 'PUBLIC', retentionDays: 730,
      summaryFa: 'اسنپ‌شات ۱۲۴ آگهی یکتای آپارتمان مسکونی در سعادت‌آباد',
    });
    this.evidences.set('ev-private-deed-900', {
      id: 'ev-private-deed-900', evidenceType: 'OFFICIAL_RECORD', sourceId: 'src-first-party-listings',
      storageRef: 'vault://restricted/deed-scan-900.pdf', contentHash: 'sha256:4b227777d4dd1fc61c6f884f48641d02',
      capturedAt: '2026-04-10T10:00:00Z', receivedAt: '2026-04-10T10:01:00Z', createdBy: 'usr-owner-1',
      relatedClaimIds: ['claim-prop-101-area-a'], verificationStatus: 'VERIFIED', accessPolicy: 'RESTRICTED', retentionDays: 180,
      summaryFa: 'تصویر سند مالکیت خصوصی (غیرقابل نمایش عمومی)',
    });
    this.claims.set('claim-prop-101-area-a', {
      id: 'claim-prop-101-area-a', entityType: 'PROPERTY', entityId: 'prop-saadat-105', attribute: 'areaSqm', value: 110, unit: 'SQM',
      sourceId: 'src-first-party-listings', sourceType: 'FIRST_PARTY', evidenceRefs: ['ev-private-deed-900'],
      observedAt: '2026-04-01T10:00:00Z', validFrom: '2026-04-01T00:00:00Z', recordedAt: '2026-04-01T10:05:00Z',
      verificationStatus: 'REPORTED', confidenceLevel: 'MEDIUM', createdBy: 'listing-publisher',
    });
    this.claims.set('claim-prop-101-area-b', {
      id: 'claim-prop-101-area-b', entityType: 'PROPERTY', entityId: 'prop-saadat-105', attribute: 'areaSqm', value: 105, unit: 'SQM',
      sourceId: 'src-licensed-partner-analytics', sourceType: 'LICENSED', evidenceRefs: ['ev-101'],
      observedAt: '2026-04-08T10:00:00Z', validFrom: '2026-04-08T00:00:00Z', recordedAt: '2026-04-08T12:00:00Z',
      verificationStatus: 'SUPPORTED', confidenceLevel: 'HIGH', createdBy: 'partner-sync',
    });
    this.reconciliationCases.set('recon-case-101', {
      id: 'recon-case-101', entityType: 'PROPERTY', entityId: 'prop-saadat-105', attribute: 'areaSqm',
      claimIds: ['claim-prop-101-area-a', 'claim-prop-101-area-b'], conflictType: 'CORE_AREA_DISCREPANCY',
      severity: 'HIGH', requiresHumanReview: true, assignedTo: 'reviewer-steward-1', conflictedReviewerIds: ['usr-owner-1'],
      status: 'UNDER_REVIEW', createdAt: '2026-04-09T09:00:00Z',
    });
    this.lineageEdges.push(
      { id: 'edge-1', parentType: 'RAW_RECORD', parentId: 'raw-batch-saadat-1405-08', childType: 'STAGING_BATCH', childId: 'staging-dedup-v3', transformationId: 'DEDUP_HASH_V3', relationshipType: 'NORMALIZED_BY', contentHash: 'sha256:1111aaaa', createdAt: '2026-04-12T06:01:00Z' },
      { id: 'edge-2', parentType: 'STAGING_BATCH', parentId: 'staging-dedup-v3', childType: 'SNAPSHOT', childId: 'mkt-snapshot-2026-04-12', transformationId: 'UNIT_NORM_V2', relationshipType: 'AGGREGATED_INTO', contentHash: 'sha256:2222bbbb', createdAt: '2026-04-12T06:03:00Z' },
      { id: 'edge-3', parentType: 'SNAPSHOT', parentId: 'mkt-snapshot-2026-04-12', childType: 'PUBLISHED_INDICATOR', childId: 'saadat-abad', transformationId: 'MEDIAN_OFFER_PRICE_V2.1', relationshipType: 'PUBLISHED_AS', contentHash: 'sha256:3333cccc', createdAt: '2026-04-12T06:05:00Z' }
    );
    this.entityVersions.push(
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
        changeReasonFa: 'بروزرسانی به روش حذف پرت IQR نسخه ۲.۱ و نمونه ۱۲۴ آگهی یکتا', approvedBy: 'Methodology Reviewer',
      }
    );
    this.correctionProposals.set('corr-prop-1', {
      id: 'corr-prop-1', entityType: 'NEIGHBORHOOD', entityId: 'saadat-abad', attribute: 'transitAccessNoteFa',
      currentValue: 'دسترسی اتوبوس تندرو در بلوار دریا', proposedValue: 'دسترسی به ایستگاه مترو میدان کتاب (خط ۷) و پایانه بلوار فرهنگ',
      reasonFa: 'ایستگاه مترو میدان کتاب در سعادت‌آباد فعال شده است.', evidenceId: 'ev-101', proposerUserId: 'usr-local-resident-7',
      proposerVerifiedIdentity: true, proposerVerifiedCredential: false, status: 'UNDER_REVIEW', createdAt: '2026-04-11T14:20:00Z',
    });
  }

  public registerSource(input: Partial<DataSourceRecord>): { ok: boolean; errorFa?: string; source?: DataSourceRecord } {
    if (!input.nameFa || !input.owner || !input.owner.trim()) return { ok: false, errorFa: 'ثبت منبع بدون تعیین مالک/مسئول پاسخگو (Owner) مجاز نیست.' };
    if (!input.collectionMethod) return { ok: false, errorFa: 'روش گردآوری داده (Collection Method) باید مشخص باشد.' };
    if (!input.domains || input.domains.length === 0) return { ok: false, errorFa: 'حداقل یک حوزه اعتبار (Domain) باید برای منبع تعیین شود.' };
    const id = input.id || `src-${Date.now()}`;
    const now = new Date().toISOString();
    const record: DataSourceRecord = {
      id, nameFa: input.nameFa, sourceType: input.sourceType || 'OBSERVED', organizationFa: input.organizationFa || 'نامشخص',
      domains: input.domains, geographicCoverageFa: input.geographicCoverageFa || 'شهر تهران', temporalCoverageFa: input.temporalCoverageFa || '۱۴۰۵',
      collectionMethod: input.collectionMethod, updateFrequencyFa: input.updateFrequencyFa || 'ماهیانه', owner: input.owner.trim(),
      domainReliability: input.domainReliability || input.domains.map((d) => ({ domain: d, level: 'MEDIUM', rationaleFa: 'ارزیابی اولیه', assessedAt: now })),
      usagePolicy: input.usagePolicy || {
        id: `pol-${id}`, sourceId: id, purpose: 'ارزیابی اولیه', collectAllowed: true, storeAllowed: true, transformAllowed: true,
        analyzeAllowed: true, displayAllowed: false, redistributeAllowed: false, trainAllowed: false, attributionRequired: true,
        retentionDays: 365, licenseReference: 'PENDING-ASSESSMENT', effectiveFrom: now, status: 'UNASSESSED',
      },
      status: input.status || 'DISCOVERED', lastVerifiedAt: now, createdAt: now, updatedAt: now,
    };
    this.sources.set(id, record);
    return { ok: true, source: record };
  }

  public transitionSourceStatus(sourceId: string, nextStatus: DataSourceStatus, actor: string, reasonFa: string) {
    const src = this.sources.get(sourceId);
    if (!src || !reasonFa.trim()) return { ok: false, errorFa: 'منبع یافت نشد یا دلیل تغییر وضعیت ثبت نشده است.' };
    src.status = nextStatus;
    if (nextStatus === 'REVOKED') {
      src.usagePolicy.status = 'REVOKED';
      src.usagePolicy.displayAllowed = false;
      src.usagePolicy.redistributeAllowed = false;
    }
    src.updatedAt = new Date().toISOString();
    this.auditLogs.unshift({ id: `aud-${Date.now()}`, actor, action: `SOURCE_STATUS_${nextStatus}`, targetId: sourceId, reasonFa, timestamp: src.updatedAt });
    const impactedClaims = Array.from(this.claims.values()).filter((c) => c.sourceId === sourceId).map((c) => c.id);
    return { ok: true, source: src, impactedClaimIds: impactedClaims };
  }

  public canUseSourceForOperation(
    sourceId: string,
    operation: 'COLLECT' | 'ANALYZE' | 'DISPLAY_RAW' | 'REDISTRIBUTE' | 'TRAIN_MODEL',
    referenceTimeIso = new Date().toISOString()
  ): { allowed: boolean; reasonFa: string; requiresAttribution: boolean } {
    const src = this.sources.get(sourceId);
    if (!src) return { allowed: false, reasonFa: 'منبع در Source Registry ثبت نشده است.', requiresAttribution: false };
    if (src.status === 'REVOKED' || src.status === 'SUSPENDED' || src.usagePolicy.status === 'REVOKED') return { allowed: false, reasonFa: 'مجوز منبع لغو یا تعلیق شده است.', requiresAttribution: false };
    if (src.usagePolicy.effectiveTo && src.usagePolicy.effectiveTo < referenceTimeIso) return { allowed: false, reasonFa: 'مجوز زمانی استفاده از این منبع منقضی شده است.', requiresAttribution: false };
    const pol = src.usagePolicy;
    if (operation === 'COLLECT' && !pol.collectAllowed) return { allowed: false, reasonFa: 'دریافت داده مجاز نیست.', requiresAttribution: pol.attributionRequired };
    if (operation === 'ANALYZE' && !pol.analyzeAllowed) return { allowed: false, reasonFa: 'تحلیل آماری مجاز نیست.', requiresAttribution: pol.attributionRequired };
    if (operation === 'DISPLAY_RAW' && !pol.displayAllowed) return { allowed: false, reasonFa: 'منبع فقط مجاز برای تحلیل داخلی است؛ انتشار عمومی داده خام ممنوع است.', requiresAttribution: pol.attributionRequired };
    if (operation === 'REDISTRIBUTE' && !pol.redistributeAllowed) return { allowed: false, reasonFa: 'بازنشر داده این منبع مجاز نیست.', requiresAttribution: pol.attributionRequired };
    if (operation === 'TRAIN_MODEL' && !pol.trainAllowed) return { allowed: false, reasonFa: 'استفاده در آموزش مدل هوش مصنوعی طبق مجوز منبع مجاز نیست.', requiresAttribution: pol.attributionRequired };
    return { allowed: true, reasonFa: 'مجاز مطابق Source Usage Policy', requiresAttribution: pol.attributionRequired };
  }

  public getSources(): DataSourceRecord[] { return Array.from(this.sources.values()); }
  public getClaims(): DataClaimRecord[] { return Array.from(this.claims.values()); }
  public getReconciliationCases(): ReconciliationCase[] { return Array.from(this.reconciliationCases.values()); }
  public getEntityVersions(entityId?: string): EntityVersionRecord[] { return entityId ? this.entityVersions.filter((v) => v.entityId === entityId) : this.entityVersions; }
  public getLineageForEntity(entityId: string): ProvenanceEdge[] { return this.lineageEdges.filter((e) => e.childId === entityId || e.parentId.includes('saadat') || e.childId.includes('mkt-snapshot')); }
  public getMethodologies(): MethodologyRecord[] { return Array.from(this.methodologies.values()); }
  public getCorrectionProposals(): DataCorrectionProposal[] { return Array.from(this.correctionProposals.values()); }
  public getAuditLogs() { return this.auditLogs; }

  public getEvidenceForCaller(evidenceId: string, caller: { isAdmin?: boolean; role?: string }): { ok: boolean; errorFa?: string; evidence?: EvidenceRecord } {
    const ev = this.evidences.get(evidenceId);
    if (!ev) return { ok: false, errorFa: 'شاهد یافت نشد.' };
    if ((ev.accessPolicy === 'RESTRICTED' || ev.accessPolicy === 'CONFIDENTIAL') && !caller.isAdmin) {
      return { ok: false, errorFa: 'دسترسی کاربر عمومی به فایل شاهد خصوصی/محرمانه مجاز نیست.' };
    }
    return { ok: true, evidence: ev };
  }

  public resolveConflictCase(params: {
    caseId: string; reviewerId: string; resolutionValue: string | number; resolutionReasonFa: string; isAutomatedAttempt?: boolean;
  }): { ok: boolean; errorFa?: string; updatedCase?: ReconciliationCase; newVersion?: EntityVersionRecord } {
    const c = this.reconciliationCases.get(params.caseId);
    if (!c) return { ok: false, errorFa: 'پرونده تعارض یافت نشد.' };
    if (params.isAutomatedAttempt && (c.requiresHumanReview || HIGH_STAKES_CONFLICT_TYPES.has(c.conflictType))) {
      return { ok: false, errorFa: 'تعارض‌های حساس (مرز محله، مالکیت، قیمت معامله، متراژ) نباید به صورت خودکار حل شوند؛ بررسی انسانی الزامی است.' };
    }
    if (!params.resolutionReasonFa || params.resolutionReasonFa.trim().length < 5) return { ok: false, errorFa: 'ثبت تصمیم حل تعارض بدون ذکر دلیل مستند مجاز نیست.' };
    if (c.conflictedReviewerIds?.includes(params.reviewerId)) return { ok: false, errorFa: 'بررسی‌کننده دارای تعارض منافع ثبت‌شده در این پرونده است و مجاز به صدور رای نهایی نیست.' };
    c.status = 'RESOLVED';
    c.resolutionValue = params.resolutionValue;
    c.resolutionReasonFa = params.resolutionReasonFa.trim();
    c.resolvedBy = params.reviewerId;
    c.resolvedAt = new Date().toISOString();

    const prevVersions = this.entityVersions.filter((v) => v.entityId === c.entityId && v.attribute === c.attribute);
    const nextNum = prevVersions.length + 1;
    const newVersion: EntityVersionRecord = {
      id: `ver-${c.entityId}-${Date.now()}`, entityType: c.entityType, entityId: c.entityId, attribute: c.attribute,
      versionNumber: nextNum, dataVersion: new Date().toISOString().slice(0, 10), methodologyVersion: '2.1',
      value: params.resolutionValue, sourceId: 'src-licensed-partner-analytics', qualityStatus: 'VERIFIED',
      snapshotRef: `recon-${c.id}`, validFrom: new Date().toISOString(), recordedAt: new Date().toISOString(),
      supersedesVersion: nextNum > 1 ? nextNum - 1 : undefined, changeType: 'CORRECTION', changeReasonFa: c.resolutionReasonFa, approvedBy: params.reviewerId,
    };
    this.entityVersions.push(newVersion);
    return { ok: true, updatedCase: c, newVersion };
  }
}

export const defaultDataGovernanceEngine = new DataGovernanceEngine();

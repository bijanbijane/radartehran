/**
 * RT-UI-DATA-GOV-001 | Data Quality, Provenance, Source Registry,
 * Claims Reconciliation, Lineage Graph & Temporal Versioning Engine
 */
import {
  DataClaimRecord,
  DataCorrectionProposal,
  DataQualityStatus,
  DataSourceRecord,
  DataSourceStatus,
  EntityVersionRecord,
  EvidenceRecord,
  MethodologyRecord,
  ProvenanceEdge,
  ReconciliationCase,
} from '../models/dataGovernance.types';
import {
  buildDemoDgovFixture,
  INITIAL_DATA_SOURCES,
  INITIAL_METHODOLOGIES,
} from './dataGovernanceSeeds';

export { INITIAL_DATA_SOURCES, INITIAL_METHODOLOGIES };

const HIGH_STAKES_CONFLICT_TYPES = new Set<ReconciliationCase['conflictType']>([
  'BOUNDARY_GEOMETRY', 'LEGAL_OWNERSHIP', 'TRANSACTION_DEAL_PRICE', 'CORE_AREA_DISCREPANCY',
]);

const ALLOWED_SOURCE_TRANSITIONS: Record<DataSourceStatus, readonly DataSourceStatus[]> = {
  DISCOVERED: ['UNDER_REVIEW', 'SUSPENDED', 'REVOKED', 'ARCHIVED'],
  UNDER_REVIEW: ['VERIFIED', 'RESTRICTED', 'SUSPENDED', 'REVOKED'],
  VERIFIED: ['ACTIVE', 'RESTRICTED', 'STALE', 'SUSPENDED', 'REVOKED'],
  ACTIVE: ['RESTRICTED', 'STALE', 'SUSPENDED', 'REVOKED', 'ARCHIVED'],
  RESTRICTED: ['ACTIVE', 'STALE', 'SUSPENDED', 'REVOKED', 'ARCHIVED'],
  STALE: ['ACTIVE', 'RESTRICTED', 'SUSPENDED', 'REVOKED', 'ARCHIVED'],
  SUSPENDED: ['UNDER_REVIEW', 'ACTIVE', 'RESTRICTED', 'REVOKED', 'ARCHIVED'],
  REVOKED: ['ARCHIVED'],
  ARCHIVED: [],
};

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

  constructor(options: { seedDemo?: boolean } = { seedDemo: true }) {
    INITIAL_DATA_SOURCES.forEach((s) => this.sources.set(s.id, { ...s, usagePolicy: { ...s.usagePolicy } }));
    INITIAL_METHODOLOGIES.forEach((m) => this.methodologies.set(m.id, { ...m }));
    if (options.seedDemo !== false) {
      const fx = buildDemoDgovFixture();
      fx.claims.forEach((c) => this.claims.set(c.id, c));
      fx.evidences.forEach((e) => this.evidences.set(e.id, e));
      fx.reconciliationCases.forEach((r) => this.reconciliationCases.set(r.id, r));
      this.lineageEdges.push(...fx.lineageEdges);
      this.entityVersions.push(...fx.entityVersions);
      this.correctionProposals.set('corr-prop-1', {
        id: 'corr-prop-1', entityType: 'NEIGHBORHOOD', entityId: 'saadat-abad', attribute: 'transitAccessNoteFa',
        currentValue: 'دسترسی اتوبوس تندرو در بلوار دریا', proposedValue: 'دسترسی به ایستگاه مترو میدان کتاب (خط ۷) و پایانه بلوار فرهنگ',
        reasonFa: 'ایستگاه مترو میدان کتاب در سعادت‌آباد فعال شده است.', evidenceId: 'ev-101', proposerUserId: 'usr-local-resident-7',
        proposerVerifiedIdentity: true, proposerVerifiedCredential: false, status: 'UNDER_REVIEW', createdAt: '2026-04-11T14:20:00Z',
      });
    }
  }

  public hydrateState(snap: {
    sources?: DataSourceRecord[]; claims?: DataClaimRecord[]; evidences?: EvidenceRecord[];
    lineageEdges?: ProvenanceEdge[]; reconciliationCases?: ReconciliationCase[];
    entityVersions?: EntityVersionRecord[]; methodologies?: MethodologyRecord[];
    correctionProposals?: DataCorrectionProposal[];
    auditLogs?: Array<{ id: string; actor: string; action: string; targetId: string; reasonFa: string; timestamp: string }>;
  }): void {
    this.sources.clear(); (snap.sources || INITIAL_DATA_SOURCES).forEach((s) => this.sources.set(s.id, s));
    this.claims.clear(); (snap.claims || []).forEach((c) => this.claims.set(c.id, c));
    this.evidences.clear(); (snap.evidences || []).forEach((e) => this.evidences.set(e.id, e));
    this.lineageEdges = [...(snap.lineageEdges || [])];
    this.reconciliationCases.clear(); (snap.reconciliationCases || []).forEach((r) => this.reconciliationCases.set(r.id, r));
    this.entityVersions = [...(snap.entityVersions || [])];
    this.methodologies.clear(); (snap.methodologies || INITIAL_METHODOLOGIES).forEach((m) => this.methodologies.set(m.id, m));
    this.correctionProposals.clear(); (snap.correctionProposals || []).forEach((p) => this.correctionProposals.set(p.id, p));
    this.auditLogs = [...(snap.auditLogs || [])];
  }

  public exportState() {
    return {
      sources: this.getSources(), claims: this.getClaims(), evidences: this.getEvidences(),
      lineageEdges: [...this.lineageEdges], reconciliationCases: this.getReconciliationCases(),
      entityVersions: [...this.entityVersions], methodologies: this.getMethodologies(),
      correctionProposals: this.getCorrectionProposals(), auditLogs: [...this.auditLogs],
    };
  }

  public addCorrectionProposal(proposal: DataCorrectionProposal): void {
    this.correctionProposals.set(proposal.id, proposal);
  }

  public registerSource(input: Partial<DataSourceRecord>): { ok: boolean; errorFa?: string; source?: DataSourceRecord } {
    if (!input.nameFa?.trim() || !input.owner?.trim()) return { ok: false, errorFa: 'ثبت منبع بدون عنوان و تعیین مالک پاسخگو (Owner) مجاز نیست.' };
    if (!input.collectionMethod) return { ok: false, errorFa: 'روش گردآوری داده (Collection Method) باید مشخص باشد.' };
    if (!input.domains || input.domains.length === 0) return { ok: false, errorFa: 'حداقل یک حوزه اعتبار (Domain) باید برای منبع تعیین شود.' };
    if (!input.geographicCoverageFa?.trim() || !input.temporalCoverageFa?.trim() || !input.updateFrequencyFa?.trim()) {
      return { ok: false, errorFa: 'پوشش جغرافیایی، بازه زمانی و تواتر بروزرسانی منبع باید صراحتاً مشخص شوند.' };
    }
    const id = (input.id || `src-${Date.now()}`).trim();
    if (this.sources.has(id)) return { ok: false, errorFa: `منبع با شناسه تکراری «${id}» قبلاً ثبت شده است.` };
    const now = new Date().toISOString();
    const record: DataSourceRecord = {
      id, nameFa: input.nameFa.trim(), sourceType: input.sourceType || 'OBSERVED', organizationFa: (input.organizationFa || '').trim() || 'ثبت‌نشده',
      domains: input.domains, geographicCoverageFa: input.geographicCoverageFa.trim(), temporalCoverageFa: input.temporalCoverageFa.trim(),
      collectionMethod: input.collectionMethod, updateFrequencyFa: input.updateFrequencyFa.trim(), owner: input.owner.trim(),
      domainReliability: input.domainReliability || input.domains.map((d) => ({ domain: d, level: 'MEDIUM', rationaleFa: 'ارزیابی اولیه ثبت‌شده', assessedAt: now })),
      usagePolicy: input.usagePolicy || {
        id: `pol-${id}`, sourceId: id, purpose: 'تحلیل و ارزیابی حاکمیتی', collectAllowed: true, storeAllowed: true, transformAllowed: true,
        analyzeAllowed: true, displayAllowed: false, redistributeAllowed: false, trainAllowed: false, attributionRequired: true,
        retentionDays: 365, licenseReference: 'EXPLICIT-PENDING-REVIEW', effectiveFrom: now, status: 'DISPLAY_RESTRICTED',
      },
      status: input.status || 'DISCOVERED', lastVerifiedAt: now, createdAt: now, updatedAt: now,
    };
    this.sources.set(id, record);
    return { ok: true, source: record };
  }

  public transitionSourceStatus(sourceId: string, nextStatus: DataSourceStatus, actor: string, reasonFa: string) {
    const src = this.sources.get(sourceId);
    if (!src || reasonFa.trim().length < 5) return { ok: false, errorFa: 'منبع یافت نشد یا دلیل مستند تغییر وضعیت (حداقل ۵ کاراکتر) ثبت نشده است.' };
    if (!ALLOWED_SOURCE_TRANSITIONS[src.status].includes(nextStatus)) {
      return { ok: false, errorFa: `تغییر وضعیت از ${src.status} به ${nextStatus} در چرخه عمر منبع مجاز نیست.` };
    }
    src.status = nextStatus;
    if (nextStatus === 'REVOKED' || nextStatus === 'SUSPENDED') {
      src.usagePolicy.status = 'REVOKED';
      src.usagePolicy.displayAllowed = false;
      src.usagePolicy.redistributeAllowed = false;
    }
    src.updatedAt = new Date().toISOString();
    this.auditLogs.unshift({ id: `aud-${Date.now()}`, actor, action: `SOURCE_STATUS_${nextStatus}`, targetId: sourceId, reasonFa: reasonFa.trim(), timestamp: src.updatedAt });
    const impactedClaimIds = Array.from(this.claims.values()).filter((c) => c.sourceId === sourceId).map((c) => c.id);
    const impactedVersionIds = this.entityVersions.filter((v) => v.sourceId === sourceId).map((v) => v.id);
    return { ok: true, source: src, impactedClaimIds, impactedVersionIds };
  }

  public canUseSourceForOperation(
    sourceId: string,
    operation: 'COLLECT' | 'ANALYZE' | 'DISPLAY_RAW' | 'REDISTRIBUTE' | 'TRAIN_MODEL',
    referenceTimeIso = new Date().toISOString(),
  ): { allowed: boolean; reasonFa: string; requiresAttribution: boolean } {
    const src = this.sources.get(sourceId);
    if (!src) return { allowed: false, reasonFa: 'منبع در Source Registry ثبت نشده است.', requiresAttribution: false };
    if (src.status === 'REVOKED' || src.status === 'SUSPENDED' || src.usagePolicy.status === 'REVOKED') return { allowed: false, reasonFa: 'مجوز منبع لغو یا تعلیق شده است.', requiresAttribution: false };
    if (src.usagePolicy.effectiveFrom && src.usagePolicy.effectiveFrom > referenceTimeIso) return { allowed: false, reasonFa: 'بازه اعتبار مجوز این منبع هنوز آغاز نشده است.', requiresAttribution: false };
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
  public getEvidences(): EvidenceRecord[] { return Array.from(this.evidences.values()); }
  public getReconciliationCases(): ReconciliationCase[] { return Array.from(this.reconciliationCases.values()); }
  public getEntityVersions(entityId?: string): EntityVersionRecord[] { return entityId ? this.entityVersions.filter((v) => v.entityId === entityId) : this.entityVersions; }
  public getLineageForEntity(entityId: string | null | undefined): ProvenanceEdge[] {
    return this.getLineageDetailsForEntity(entityId).edges;
  }

  public getLineageDetailsForEntity(entityId: string | null | undefined): {
    edges: ProvenanceEdge[]; rootSourceIds: string[]; hasCycle: boolean;
  } {
    if (!entityId) return { edges: [], rootSourceIds: [], hasCycle: false };
    const connectedNodes = new Set<string>([entityId]);
    const collected: ProvenanceEdge[] = [];
    let hasCycle = false;
    let added = true;
    while (added) {
      added = false;
      for (const edge of this.lineageEdges) {
        if (connectedNodes.has(edge.childId) && !collected.includes(edge)) {
          if (connectedNodes.has(edge.parentId)) hasCycle = true;
          collected.push(edge);
          connectedNodes.add(edge.parentId);
          added = true;
        }
      }
    }
    const childIds = new Set(collected.map((e) => e.childId));
    const rootSourceIds = Array.from(new Set(collected.filter((e) => !childIds.has(e.parentId)).map((e) => e.parentId)));
    return { edges: collected.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), rootSourceIds, hasCycle };
  }

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
    caseId: string; reviewerId: string; resolutionValue: string | number; resolutionReasonFa: string;
    isAutomatedAttempt?: boolean; evidenceSourceId?: string; methodologyVersion?: string; qualityStatus?: DataQualityStatus;
  }): { ok: boolean; errorFa?: string; updatedCase?: ReconciliationCase; newVersion?: EntityVersionRecord } {
    const c = this.reconciliationCases.get(params.caseId);
    if (!c) return { ok: false, errorFa: 'پرونده تعارض یافت نشد.' };
    if (params.isAutomatedAttempt && (c.requiresHumanReview || HIGH_STAKES_CONFLICT_TYPES.has(c.conflictType))) {
      return { ok: false, errorFa: 'تعارض‌های حساس (مرز محله، مالکیت، قیمت معامله، متراژ) نباید به صورت خودکار حل شوند؛ بررسی انسانی الزامی است.' };
    }
    if (!params.reviewerId?.trim()) return { ok: false, errorFa: 'شناسه بررسی‌کننده معتبر الزامی است.' };
    if (params.resolutionValue === '' || params.resolutionValue === undefined || params.resolutionValue === null) {
      return { ok: false, errorFa: 'مقدار نهایی حل تعارض باید مشخص شود.' };
    }
    if (!params.resolutionReasonFa || params.resolutionReasonFa.trim().length < 5) return { ok: false, errorFa: 'ثبت تصمیم حل تعارض بدون ذکر دلیل مستند مجاز نیست.' };
    if (c.conflictedReviewerIds?.includes(params.reviewerId)) return { ok: false, errorFa: 'بررسی‌کننده دارای تعارض منافع ثبت‌شده در این پرونده است و مجاز به صدور رای نهایی نیست.' };

    const matchingClaim = c.claimIds.map((id) => this.claims.get(id)).find((cl) => cl && String(cl.value) === String(params.resolutionValue))
      || c.claimIds.map((id) => this.claims.get(id)).find(Boolean);
    const resolvedSourceId = params.evidenceSourceId?.trim() || matchingClaim?.sourceId;
    if (!resolvedSourceId) return { ok: false, errorFa: 'منبع مستند تصمیم حل تعارض مشخص نیست.' };

    const nowIso = new Date().toISOString();
    c.status = 'RESOLVED'; c.resolutionValue = params.resolutionValue;
    c.resolutionReasonFa = params.resolutionReasonFa.trim(); c.resolvedBy = params.reviewerId.trim(); c.resolvedAt = nowIso;

    const prevVersions = this.entityVersions.filter((v) => v.entityId === c.entityId && v.attribute === c.attribute);
    if (prevVersions.length > 0 && !prevVersions[prevVersions.length - 1].validTo) {
      prevVersions[prevVersions.length - 1].validTo = nowIso;
    }
    const activeMeth = Array.from(this.methodologies.values()).find((m) => m.status === 'ACTIVE');
    const nextNum = prevVersions.length + 1;
    const newVersion: EntityVersionRecord = {
      id: `ver-${c.entityId}-${Date.now()}`, entityType: c.entityType, entityId: c.entityId, attribute: c.attribute,
      versionNumber: nextNum, dataVersion: nowIso.slice(0, 10), methodologyVersion: params.methodologyVersion || activeMeth?.version || '1.0',
      value: params.resolutionValue, sourceId: resolvedSourceId, qualityStatus: params.qualityStatus || 'SUPPORTED',
      snapshotRef: `recon-${c.id}`, validFrom: nowIso, recordedAt: nowIso,
      supersedesVersion: nextNum > 1 ? nextNum - 1 : undefined, changeType: 'CORRECTION', changeReasonFa: c.resolutionReasonFa, approvedBy: c.resolvedBy,
    };
    this.entityVersions.push(newVersion);
    this.auditLogs.unshift({ id: `aud-${Date.now()}`, actor: c.resolvedBy, action: 'RECONCILIATION_RESOLVED', targetId: c.id, reasonFa: c.resolutionReasonFa, timestamp: nowIso });
    return { ok: true, updatedCase: c, newVersion };
  }
}

export const defaultDataGovernanceEngine = new DataGovernanceEngine();

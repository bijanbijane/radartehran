import {
  ApplicabilityRuleCriteria,
  ComplianceActorContext,
  ComplianceJurisdiction,
  ComplianceObligation,
  JurisdictionHierarchyLevel,
  ObligationCategory,
  ObligationLifecycleStatus,
  ObligationSeverity,
  ObligationVersion,
  RegulatoryAuthority,
  RegulatorySource,
  RegulatorySourceType,
  RegulatorySourceVersion,
} from './types';
import { ComplianceDomainError, RegulatoryComplianceStore, requireCompliancePermission } from './store';

const UNVERIFIED_OR_DISALLOWED_SOURCE_TYPES: RegulatorySourceType[] = [
  'SEARCH_ENGINE_SNIPPET',
  'UNOFFICIAL_WEBSITE',
  'UNVERIFIED_AI_SUMMARY',
];

export class JurisdictionSourceAndObligationService {
  constructor(private readonly store: RegulatoryComplianceStore) {}

  public registerJurisdiction(
    actor: ComplianceActorContext,
    input: {
      code: string;
      name: string;
      level: JurisdictionHierarchyLevel;
      parentJurisdictionId?: string | null;
      regulatoryAuthorityIds?: string[];
      effectiveFrom: string;
      effectiveTo?: string | null;
    },
  ): ComplianceJurisdiction {
    requireCompliancePermission(actor, 'compliance.jurisdiction.manage', this.store);
    if (!input.code?.trim() || !input.name?.trim()) {
      throw new ComplianceDomainError('INVALID_JURISDICTION_INPUT', 'Jurisdiction code and name are required.');
    }
    if (input.parentJurisdictionId && !this.store.jurisdictions.has(input.parentJurisdictionId)) {
      throw new ComplianceDomainError('PARENT_JURISDICTION_NOT_FOUND', 'Referenced parent jurisdiction does not exist.', 404);
    }
    const now = this.store.nowIso();
    const jurisdiction: ComplianceJurisdiction = {
      id: this.store.createId('jur'),
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      level: input.level,
      parentJurisdictionId: input.parentJurisdictionId ?? null,
      regulatoryAuthorityIds: input.regulatoryAuthorityIds ?? [],
      active: true,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.jurisdictions.set(jurisdiction.id, jurisdiction);
    this.store.recordAudit(actor, 'JURISDICTION_REGISTERED', 'ComplianceJurisdiction', jurisdiction.id, {
      code: jurisdiction.code,
      level: jurisdiction.level,
    });
    return jurisdiction;
  }

  public registerRegulatoryAuthority(
    actor: ComplianceActorContext,
    input: {
      name: string;
      jurisdictionId: string;
      domainScope: string[];
      officialPortalUrl?: string | null;
    },
  ): RegulatoryAuthority {
    requireCompliancePermission(actor, 'compliance.jurisdiction.manage', this.store);
    if (!this.store.jurisdictions.has(input.jurisdictionId)) {
      throw new ComplianceDomainError('JURISDICTION_NOT_FOUND', 'Referenced jurisdiction does not exist.', 404);
    }
    const authority: RegulatoryAuthority = {
      id: this.store.createId('rauth'),
      name: input.name.trim(),
      jurisdictionId: input.jurisdictionId,
      domainScope: input.domainScope,
      officialPortalUrl: input.officialPortalUrl ?? null,
      active: true,
      createdAt: this.store.nowIso(),
    };
    this.store.authorities.set(authority.id, authority);
    this.store.recordAudit(actor, 'REGULATORY_AUTHORITY_REGISTERED', 'RegulatoryAuthority', authority.id, {
      name: authority.name,
    });
    return authority;
  }

  public registerRegulatorySource(
    actor: ComplianceActorContext,
    input: {
      title: string;
      issuingAuthorityId: string;
      jurisdictionId: string;
      sourceType: RegulatorySourceType;
      externalReferenceCode: string;
      officialCitation: string;
      publicationDate: string;
      effectiveDate: string;
      expirationOrReviewDate?: string | null;
      versionLabel: string;
      summaryNotes: string;
      linkedDocumentReferenceIds?: string[];
    },
  ): RegulatorySource {
    requireCompliancePermission(actor, 'compliance.source.manage', this.store);
    if (UNVERIFIED_OR_DISALLOWED_SOURCE_TYPES.includes(input.sourceType)) {
      throw new ComplianceDomainError(
        'DISALLOWED_AUTHORITATIVE_LEGAL_SOURCE',
        `Source type '${input.sourceType}' cannot be treated as an authoritative legal source.`,
      );
    }
    if (!this.store.jurisdictions.has(input.jurisdictionId)) {
      throw new ComplianceDomainError('JURISDICTION_NOT_FOUND', 'Referenced jurisdiction does not exist.', 404);
    }
    const now = this.store.nowIso();
    const source: RegulatorySource = {
      id: this.store.createId('rsrc'),
      title: input.title.trim(),
      issuingAuthorityId: input.issuingAuthorityId,
      jurisdictionId: input.jurisdictionId,
      sourceType: input.sourceType,
      externalReferenceCode: input.externalReferenceCode.trim(),
      officialCitation: input.officialCitation.trim(),
      publicationDate: input.publicationDate,
      effectiveDate: input.effectiveDate,
      expirationOrReviewDate: input.expirationOrReviewDate ?? null,
      versionLabel: input.versionLabel.trim(),
      verificationStatus: 'UNVERIFIED',
      approvalStatus: 'PENDING_VERIFICATION',
      verifiedByActorId: null,
      approvedByActorId: null,
      summaryNotes: input.summaryNotes.trim(),
      linkedDocumentReferenceIds: input.linkedDocumentReferenceIds ?? [],
      currentVersionNumber: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.store.sources.set(source.id, source);
    const version: RegulatorySourceVersion = {
      id: this.store.createId('rsrcv'),
      sourceId: source.id,
      versionNumber: 1,
      versionLabel: source.versionLabel,
      officialCitation: source.officialCitation,
      effectiveDate: source.effectiveDate,
      summaryNotes: source.summaryNotes,
      approvalStatus: source.approvalStatus,
      recordedByActorId: actor.actorId,
      recordedAt: now,
    };
    this.store.sourceVersions.set(source.id, [version]);
    this.store.recordAudit(actor, 'REGULATORY_SOURCE_REGISTERED', 'RegulatorySource', source.id, {
      sourceType: source.sourceType,
      versionLabel: source.versionLabel,
    });
    return source;
  }

  public approveRegulatorySource(
    actor: ComplianceActorContext,
    sourceId: string,
    rationale: string,
  ): RegulatorySource {
    requireCompliancePermission(actor, 'compliance.source.approve', this.store);
    const source = this.store.sources.get(sourceId);
    if (!source) {
      throw new ComplianceDomainError('REGULATORY_SOURCE_NOT_FOUND', 'Regulatory source not found.', 404);
    }
    source.verificationStatus = 'VERIFIED';
    source.approvalStatus = 'APPROVED';
    source.verifiedByActorId = actor.actorId;
    source.approvedByActorId = actor.actorId;
    source.updatedAt = this.store.nowIso();
    this.store.approvals.set(this.store.createId('cappr'), {
      id: this.store.createId('cappr'),
      targetType: 'REGULATORY_SOURCE',
      targetId: source.id,
      requestedByActorId: source.verifiedByActorId,
      decidedByActorId: actor.actorId,
      decision: 'APPROVED',
      rationale,
      decidedAt: source.updatedAt,
    });
    this.store.recordAudit(actor, 'REGULATORY_SOURCE_APPROVED', 'RegulatorySource', source.id, { rationale });
    return source;
  }

  public createObligation(
    actor: ComplianceActorContext,
    input: {
      code: string;
      title: string;
      description: string;
      category: ObligationCategory;
      regulatorySourceId: string;
      jurisdictionId: string;
      applicabilityCriteria: ApplicabilityRuleCriteria;
      mandatoryLevel: 'MANDATORY' | 'CONDITIONAL' | 'RECOMMENDED';
      severity: ObligationSeverity;
      responsibleOwnerRole: string;
      reviewFrequencyDays: number;
      evidenceRequirements: string[];
      effectiveStartDate: string;
      effectiveEndDate?: string | null;
    },
  ): ComplianceObligation {
    requireCompliancePermission(actor, 'compliance.obligation.manage', this.store);
    const source = this.store.sources.get(input.regulatorySourceId);
    if (!source) {
      throw new ComplianceDomainError('REGULATORY_SOURCE_NOT_FOUND', 'Regulatory source not found.', 404);
    }
    if (source.approvalStatus !== 'APPROVED' || source.verificationStatus !== 'VERIFIED') {
      throw new ComplianceDomainError(
        'UNAPPROVED_REGULATORY_SOURCE',
        'External or internal regulatory source must be verified and approved before obligations are created from it.',
      );
    }
    const now = this.store.nowIso();
    const obligation: ComplianceObligation = {
      id: this.store.createId('obl'),
      code: input.code.trim().toUpperCase(),
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category,
      regulatorySourceId: input.regulatorySourceId,
      jurisdictionId: input.jurisdictionId,
      applicabilityCriteria: input.applicabilityCriteria,
      mandatoryLevel: input.mandatoryLevel,
      severity: input.severity,
      responsibleOwnerRole: input.responsibleOwnerRole,
      reviewFrequencyDays: input.reviewFrequencyDays,
      evidenceRequirements: input.evidenceRequirements,
      effectiveStartDate: input.effectiveStartDate,
      effectiveEndDate: input.effectiveEndDate ?? null,
      status: 'DRAFT',
      currentVersionNumber: 1,
      supersedesObligationId: null,
      approvedByActorId: null,
      approvedAt: null,
      createdByActorId: actor.actorId,
      createdAt: now,
      updatedAt: now,
    };
    this.store.obligations.set(obligation.id, obligation);
    const version: ObligationVersion = {
      id: this.store.createId('oblv'),
      obligationId: obligation.id,
      versionNumber: 1,
      title: obligation.title,
      description: obligation.description,
      applicabilityCriteria: obligation.applicabilityCriteria,
      evidenceRequirements: obligation.evidenceRequirements,
      effectiveStartDate: obligation.effectiveStartDate,
      effectiveEndDate: obligation.effectiveEndDate,
      status: 'DRAFT',
      changeReason: 'Initial obligation creation',
      createdByActorId: actor.actorId,
      approvedByActorId: null,
      createdAt: now,
    };
    this.store.obligationVersions.set(obligation.id, [version]);
    this.store.recordAudit(actor, 'OBLIGATION_CREATED', 'ComplianceObligation', obligation.id, {
      code: obligation.code,
      category: obligation.category,
    });
    this.store.publishEvent(
      'compliance.obligation.created',
      `obl_create_${obligation.id}_v1`,
      actor.correlationId || obligation.id,
      { obligationId: obligation.id, code: obligation.code, versionNumber: 1 },
    );
    return obligation;
  }

  public transitionObligationStatus(
    actor: ComplianceActorContext,
    obligationId: string,
    targetStatus: ObligationLifecycleStatus,
    rationale: string,
  ): ComplianceObligation {
    if (targetStatus === 'APPROVED' || targetStatus === 'ACTIVE') {
      requireCompliancePermission(actor, 'compliance.obligation.approve', this.store);
    } else {
      requireCompliancePermission(actor, 'compliance.obligation.manage', this.store);
    }
    const obligation = this.store.obligations.get(obligationId);
    if (!obligation) {
      throw new ComplianceDomainError('OBLIGATION_NOT_FOUND', 'Obligation not found.', 404);
    }
    const source = this.store.sources.get(obligation.regulatorySourceId);
    if ((targetStatus === 'APPROVED' || targetStatus === 'ACTIVE') && source?.approvalStatus !== 'APPROVED') {
      throw new ComplianceDomainError(
        'UNAPPROVED_REGULATORY_SOURCE',
        'Cannot approve or activate obligation linked to an unapproved regulatory source.',
      );
    }
    obligation.status = targetStatus;
    if (targetStatus === 'APPROVED' || targetStatus === 'ACTIVE') {
      obligation.approvedByActorId = actor.actorId;
      obligation.approvedAt = this.store.nowIso();
    }
    obligation.updatedAt = this.store.nowIso();
    const versions = this.store.obligationVersions.get(obligation.id) ?? [];
    const currentVersion = versions[versions.length - 1];
    if (currentVersion) {
      currentVersion.status = targetStatus;
      currentVersion.approvedByActorId = obligation.approvedByActorId;
    }
    this.store.recordAudit(actor, 'OBLIGATION_STATUS_TRANSITIONED', 'ComplianceObligation', obligation.id, {
      targetStatus,
      rationale,
    });
    return obligation;
  }

  public createNewObligationVersion(
    actor: ComplianceActorContext,
    obligationId: string,
    input: {
      title: string;
      description: string;
      applicabilityCriteria: ApplicabilityRuleCriteria;
      evidenceRequirements: string[];
      effectiveStartDate: string;
      effectiveEndDate?: string | null;
      changeReason: string;
    },
  ): ObligationVersion {
    requireCompliancePermission(actor, 'compliance.obligation.manage', this.store);
    const obligation = this.store.obligations.get(obligationId);
    if (!obligation) {
      throw new ComplianceDomainError('OBLIGATION_NOT_FOUND', 'Obligation not found.', 404);
    }
    const versions = this.store.obligationVersions.get(obligationId) ?? [];
    for (const v of versions) {
      if (v.status === 'ACTIVE' || v.status === 'APPROVED') {
        v.status = 'SUPERSEDED';
      }
    }
    const nextVersionNumber = obligation.currentVersionNumber + 1;
    const now = this.store.nowIso();
    const newVersion: ObligationVersion = {
      id: this.store.createId('oblv'),
      obligationId: obligation.id,
      versionNumber: nextVersionNumber,
      title: input.title.trim(),
      description: input.description.trim(),
      applicabilityCriteria: input.applicabilityCriteria,
      evidenceRequirements: input.evidenceRequirements,
      effectiveStartDate: input.effectiveStartDate,
      effectiveEndDate: input.effectiveEndDate ?? null,
      status: 'ACTIVE',
      changeReason: input.changeReason.trim(),
      createdByActorId: actor.actorId,
      approvedByActorId: actor.actorId,
      createdAt: now,
    };
    versions.push(newVersion);
    this.store.obligationVersions.set(obligationId, versions);
    obligation.title = newVersion.title;
    obligation.description = newVersion.description;
    obligation.applicabilityCriteria = newVersion.applicabilityCriteria;
    obligation.evidenceRequirements = newVersion.evidenceRequirements;
    obligation.effectiveStartDate = newVersion.effectiveStartDate;
    obligation.effectiveEndDate = newVersion.effectiveEndDate;
    obligation.currentVersionNumber = nextVersionNumber;
    obligation.updatedAt = now;

    this.store.recordAudit(actor, 'OBLIGATION_VERSION_CREATED', 'ComplianceObligation', obligation.id, {
      versionNumber: nextVersionNumber,
      changeReason: input.changeReason,
    });
    this.store.publishEvent(
      'compliance.obligation.updated',
      `obl_update_${obligation.id}_v${nextVersionNumber}`,
      actor.correlationId || obligation.id,
      { obligationId: obligation.id, versionNumber: nextVersionNumber },
    );
    return newVersion;
  }

  public evaluateObligationApplicability(
    actor: ComplianceActorContext,
    context: {
      jurisdictionId?: string;
      businessActivity?: string;
      platformModule?: string;
      organizationType?: string;
      transactionCategory?: string;
      propertyCategory?: string;
    },
  ): {
    status: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNRESOLVED_OR_REVIEW_REQUIRED';
    applicableObligations: ComplianceObligation[];
    explanation: string;
  } {
    requireCompliancePermission(actor, 'compliance.read', this.store);
    if (!context.jurisdictionId || !this.store.jurisdictions.has(context.jurisdictionId)) {
      return {
        status: 'UNRESOLVED_OR_REVIEW_REQUIRED',
        applicableObligations: [],
        explanation:
          'Jurisdiction is missing or unknown; applicability cannot be reliably determined and requires compliance review.',
      };
    }
    const lineageIds = new Set<string>();
    let cursor: ComplianceJurisdiction | undefined = this.store.jurisdictions.get(context.jurisdictionId);
    while (cursor) {
      lineageIds.add(cursor.id);
      cursor = cursor.parentJurisdictionId ? this.store.jurisdictions.get(cursor.parentJurisdictionId) : undefined;
    }

    const applicable: ComplianceObligation[] = [];
    for (const obl of this.store.obligations.values()) {
      if (obl.status !== 'ACTIVE' && obl.status !== 'APPROVED') continue;
      const jurMatch =
        lineageIds.has(obl.jurisdictionId) ||
        obl.applicabilityCriteria.jurisdictionIds.some((id) => lineageIds.has(id));
      if (!jurMatch) continue;
      const moduleMatch =
        obl.applicabilityCriteria.platformModules.length === 0 ||
        (context.platformModule ? obl.applicabilityCriteria.platformModules.includes(context.platformModule) : false);
      const activityMatch =
        obl.applicabilityCriteria.businessActivities.length === 0 ||
        (context.businessActivity
          ? obl.applicabilityCriteria.businessActivities.includes(context.businessActivity)
          : false);
      if (moduleMatch && activityMatch) {
        applicable.push(obl);
      }
    }

    return {
      status: applicable.length > 0 ? 'APPLICABLE' : 'NOT_APPLICABLE',
      applicableObligations: applicable,
      explanation:
        applicable.length > 0
          ? `Matched ${applicable.length} active/approved obligation(s) across jurisdiction hierarchy (${Array.from(lineageIds).join(' -> ')}).`
          : 'No active obligations matched the provided jurisdiction and operational context.',
    };
  }
}

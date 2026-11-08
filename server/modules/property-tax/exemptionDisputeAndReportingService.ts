import { assertPropertyTaxAccess } from './authorityTaxRecordAndAssessmentService';
import { PaginatedTaxResult, paginateTaxItems, TransactionalPropertyTaxStore } from './store';
import {
  PropertyTaxActorContext,
  PropertyTaxError,
  PropertyTaxReportingSummary,
  TaxDeadlineRecord,
  TaxDisputeRecord,
  TaxDisputeStatus,
  TaxExemptionCategory,
  TaxExemptionLifecycleStatus,
  TaxExemptionRecord,
  TaxHistoryEntryRecord,
  TaxObligationRecord,
  TaxPeriodRange,
} from './types';

function makeTaxId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class ExemptionDisputeAndReportingService {
  constructor(private readonly store: TransactionalPropertyTaxStore) {}

  public async registerExemptionApplication(
    actor: PropertyTaxActorContext,
    input: {
      propertyTaxRecordId: string;
      exemptionCategory: TaxExemptionCategory;
      eligibilityCriteriaReference: string;
      applicationDateIso?: string;
      effectivePeriod: TaxPeriodRange;
      documentedExemptionAmountRials?: number;
      documentedExemptionPercentage?: number;
      sourceDocumentId?: string;
    }
  ): Promise<TaxExemptionRecord> {
    const taxRecord = this.store.getTaxRecord(input.propertyTaxRecordId);
    if (!taxRecord) {
      throw new PropertyTaxError('RESOURCE_NOT_FOUND', `Tax record "${input.propertyTaxRecordId}" not found.`, 404);
    }
    assertPropertyTaxAccess(this.store, actor, taxRecord.propertyId);

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const status: TaxExemptionLifecycleStatus = input.applicationDateIso
        ? 'APPLICATION_SUBMITTED'
        : 'POTENTIAL_ELIGIBILITY';

      const exemption: TaxExemptionRecord = {
        id: makeTaxId('tax_exemp'),
        propertyId: taxRecord.propertyId,
        propertyTaxRecordId: taxRecord.id,
        taxpayerPartyId: taxRecord.taxpayerPartyId,
        taxAuthorityId: taxRecord.taxAuthorityId,
        exemptionCategory: input.exemptionCategory,
        eligibilityCriteriaReference: input.eligibilityCriteriaReference,
        applicationDateIso: input.applicationDateIso,
        effectivePeriod: input.effectivePeriod,
        documentedExemptionAmountRials: input.documentedExemptionAmountRials,
        documentedExemptionPercentage: input.documentedExemptionPercentage,
        status,
        sourceDocumentId: input.sourceDocumentId,
        verificationStatus: input.sourceDocumentId
          ? 'DOCUMENT_SUPPORTED_UNVERIFIED'
          : 'UNVERIFIED_USER_REPORTED',
        determinedFromDemographicsAlone: false,
        autoAppliedWithoutApproval: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveExemption(exemption);
      tx.appendHistory({
        id: makeTaxId('thist'),
        propertyId: exemption.propertyId,
        entityType: 'EXEMPTION',
        entityId: exemption.id,
        historyClassification: 'ORIGINAL_RECORD',
        actionSummary: `Registered tax exemption record (${exemption.exemptionCategory}, status=${exemption.status}).`,
        actorUserId: actor.userId,
        newSnapshot: { ...exemption },
        provenanceReference: input.eligibilityCriteriaReference,
        recordedAtIso: now,
      });
      return exemption;
    });
  }

  public async recordExemptionDecision(
    actor: PropertyTaxActorContext,
    input: {
      exemptionId: string;
      decision: 'APPROVED_EXEMPTION' | 'REJECTED_EXEMPTION';
      officialApprovalReference?: string;
      sourceDocumentId?: string;
    }
  ): Promise<TaxExemptionRecord> {
    const exemption = this.store.getExemption(input.exemptionId);
    if (!exemption) {
      throw new PropertyTaxError('RESOURCE_NOT_FOUND', `Exemption "${input.exemptionId}" not found.`, 404);
    }
    assertPropertyTaxAccess(this.store, actor, exemption.propertyId);

    if (actor.role !== 'AUTHORITY_VERIFIER_OR_ADMIN') {
      throw new PropertyTaxError(
        'EXEMPTION_APPROVAL_REQUIRES_VERIFIER',
        'Only AUTHORITY_VERIFIER_OR_ADMIN can record an official exemption approval or rejection decision.',
        403
      );
    }
    if (input.decision === 'APPROVED_EXEMPTION' && !input.officialApprovalReference) {
      throw new PropertyTaxError(
        'EXEMPTION_APPROVAL_REQUIRES_VERIFIER',
        'APPROVED_EXEMPTION requires an officialApprovalReference from the tax authority.'
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const updated: TaxExemptionRecord = {
        ...exemption,
        status: input.decision,
        officialApprovalReference: input.officialApprovalReference,
        sourceDocumentId: input.sourceDocumentId ?? exemption.sourceDocumentId,
        verificationStatus: 'OFFICIALLY_VERIFIED',
        version: exemption.version + 1,
        updatedAt: now,
      };
      tx.saveExemption(updated);
      tx.appendHistory({
        id: makeTaxId('thist'),
        propertyId: updated.propertyId,
        entityType: 'EXEMPTION',
        entityId: updated.id,
        historyClassification: 'CORRECTED_RECORD',
        actionSummary: `Recorded exemption decision: ${updated.status} (ref=${input.officialApprovalReference ?? 'N/A'}).`,
        actorUserId: actor.userId,
        previousSnapshot: { ...exemption },
        newSnapshot: { ...updated },
        provenanceReference: input.officialApprovalReference ?? 'OFFICIAL_REJECTION',
        recordedAtIso: now,
      });
      return updated;
    });
  }

  public async evaluateExemptionExpiration(
    actor: PropertyTaxActorContext,
    exemptionId: string,
    asOfIso: string
  ): Promise<TaxExemptionRecord> {
    const exemption = this.store.getExemption(exemptionId);
    if (!exemption) {
      throw new PropertyTaxError('RESOURCE_NOT_FOUND', `Exemption "${exemptionId}" not found.`, 404);
    }
    assertPropertyTaxAccess(this.store, actor, exemption.propertyId);

    if (
      new Date(asOfIso).getTime() <= new Date(exemption.effectivePeriod.periodEndIso).getTime() ||
      exemption.status === 'EXPIRED_EXEMPTION'
    ) {
      return exemption;
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const expired: TaxExemptionRecord = {
        ...exemption,
        status: 'EXPIRED_EXEMPTION',
        version: exemption.version + 1,
        updatedAt: now,
      };
      tx.saveExemption(expired);
      tx.appendHistory({
        id: makeTaxId('thist'),
        propertyId: expired.propertyId,
        entityType: 'EXEMPTION',
        entityId: expired.id,
        historyClassification: 'CORRECTED_RECORD',
        actionSummary: `Exemption ${expired.id} expired as of ${asOfIso}.`,
        actorUserId: actor.userId,
        previousSnapshot: { ...exemption },
        newSnapshot: { ...expired },
        provenanceReference: `EXPIRATION_CHECK:${asOfIso}`,
        recordedAtIso: now,
      });
      return expired;
    });
  }

  public async createTaxDispute(
    actor: PropertyTaxActorContext,
    input: {
      propertyId: string;
      relatedRecordType: 'ASSESSMENT' | 'OBLIGATION' | 'BILL';
      relatedRecordId: string;
      taxAuthorityId: string;
      disputeCategory: string;
      appealDeadlineIso?: string;
      groundsReference: string;
      supportingDocumentIds: string[];
      sourceProvenance: string;
    }
  ): Promise<TaxDisputeRecord> {
    assertPropertyTaxAccess(this.store, actor, input.propertyId);
    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const dispute: TaxDisputeRecord = {
        id: makeTaxId('tax_disp'),
        propertyId: input.propertyId,
        relatedRecordType: input.relatedRecordType,
        relatedRecordId: input.relatedRecordId,
        taxAuthorityId: input.taxAuthorityId,
        disputeCategory: input.disputeCategory,
        appealDeadlineIso: input.appealDeadlineIso,
        groundsReference: input.groundsReference,
        supportingDocumentIds: input.supportingDocumentIds,
        status: 'PREPARING',
        sourceProvenance: input.sourceProvenance,
        suspensionConfirmedByAuthority: false,
        providesLegalAdvice: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveDispute(dispute);
      tx.appendHistory({
        id: makeTaxId('thist'),
        propertyId: dispute.propertyId,
        entityType: 'DISPUTE',
        entityId: dispute.id,
        historyClassification: 'DISPUTED_RECORD',
        actionSummary: `Created tax dispute (${dispute.disputeCategory}) in PREPARING state.`,
        actorUserId: actor.userId,
        newSnapshot: { ...dispute },
        provenanceReference: input.sourceProvenance,
        recordedAtIso: now,
      });
      return dispute;
    });
  }

  public async recordAppealSubmissionReference(
    actor: PropertyTaxActorContext,
    input: {
      disputeId: string;
      submissionDateIso: string;
      officialCaseReference: string;
      suspensionConfirmedByAuthority?: boolean;
      targetStatus?: 'SUBMITTED' | 'ACKNOWLEDGED' | 'UNDER_REVIEW';
    }
  ): Promise<TaxDisputeRecord> {
    const dispute = this.store.getDispute(input.disputeId);
    if (!dispute) {
      throw new PropertyTaxError('RESOURCE_NOT_FOUND', `Dispute "${input.disputeId}" not found.`, 404);
    }
    assertPropertyTaxAccess(this.store, actor, dispute.propertyId);
    if (!input.officialCaseReference.trim()) {
      throw new PropertyTaxError(
        'APPEAL_SUBMISSION_REQUIRES_OFFICIAL_REF',
        'Cannot claim an appeal has been filed without an authoritative officialCaseReference.'
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const suspensionConfirmed =
        Boolean(input.suspensionConfirmedByAuthority) && actor.role === 'AUTHORITY_VERIFIER_OR_ADMIN';
      const updated: TaxDisputeRecord = {
        ...dispute,
        submissionDateIso: input.submissionDateIso,
        officialCaseReference: input.officialCaseReference.trim(),
        status: input.targetStatus ?? 'SUBMITTED',
        suspensionConfirmedByAuthority: suspensionConfirmed,
        version: dispute.version + 1,
        updatedAt: now,
      };
      if (dispute.relatedRecordType === 'OBLIGATION') {
        const ob = tx.getObligation(dispute.relatedRecordId);
        if (ob) {
          tx.saveObligation({
            ...ob,
            status: suspensionConfirmed ? 'SUSPENDED' : ob.status,
            collectionSuspendedByAuthority: suspensionConfirmed,
            version: ob.version + 1,
            updatedAt: now,
          });
        }
      }
      tx.saveDispute(updated);
      tx.appendHistory({
        id: makeTaxId('thist'),
        propertyId: updated.propertyId,
        entityType: 'DISPUTE',
        entityId: updated.id,
        historyClassification: 'DISPUTED_RECORD',
        actionSummary: `Recorded official appeal submission (${updated.officialCaseReference}), status=${updated.status}, suspension=${suspensionConfirmed}.`,
        actorUserId: actor.userId,
        previousSnapshot: { ...dispute },
        newSnapshot: { ...updated },
        provenanceReference: updated.officialCaseReference ?? 'APPEAL_SUBMISSION',
        recordedAtIso: now,
      });
      return updated;
    });
  }

  public async recordDisputeResolution(
    actor: PropertyTaxActorContext,
    input: {
      disputeId: string;
      resolutionStatus: Extract<
        TaxDisputeStatus,
        'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'RESOLVED' | 'CLOSED'
      >;
      resolutionReference: string;
      resolutionSummary: string;
    }
  ): Promise<TaxDisputeRecord> {
    const dispute = this.store.getDispute(input.disputeId);
    if (!dispute) {
      throw new PropertyTaxError('RESOURCE_NOT_FOUND', `Dispute "${input.disputeId}" not found.`, 404);
    }
    assertPropertyTaxAccess(this.store, actor, dispute.propertyId);

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const updated: TaxDisputeRecord = {
        ...dispute,
        status: input.resolutionStatus,
        resolutionReference: input.resolutionReference,
        resolutionSummary: input.resolutionSummary,
        version: dispute.version + 1,
        updatedAt: now,
      };
      tx.saveDispute(updated);
      tx.appendHistory({
        id: makeTaxId('thist'),
        propertyId: updated.propertyId,
        entityType: 'DISPUTE',
        entityId: updated.id,
        historyClassification: 'CORRECTED_RECORD',
        actionSummary: `Resolved dispute ${updated.id} with status ${updated.status}: ${input.resolutionSummary}`,
        actorUserId: actor.userId,
        previousSnapshot: { ...dispute },
        newSnapshot: { ...updated },
        provenanceReference: input.resolutionReference,
        recordedAtIso: now,
      });
      return updated;
    });
  }

  public retrieveTaxHistory(
    actor: PropertyTaxActorContext,
    propertyId: string,
    limit?: number,
    offset?: number
  ): PaginatedTaxResult<TaxHistoryEntryRecord> {
    assertPropertyTaxAccess(this.store, actor, propertyId);
    return paginateTaxItems(this.store.listHistoryByProperty(propertyId), limit, offset);
  }

  public retrieveTaxObligations(
    actor: PropertyTaxActorContext,
    propertyId: string,
    limit?: number,
    offset?: number
  ): PaginatedTaxResult<TaxObligationRecord> {
    assertPropertyTaxAccess(this.store, actor, propertyId);
    return paginateTaxItems(this.store.listObligationsByProperty(propertyId), limit, offset);
  }

  public retrieveUpcomingDeadlines(
    actor: PropertyTaxActorContext,
    propertyId: string,
    limit?: number,
    offset?: number
  ): PaginatedTaxResult<TaxDeadlineRecord> {
    assertPropertyTaxAccess(this.store, actor, propertyId);
    const items = this.store
      .listDeadlinesByProperty(propertyId)
      .filter((d) => d.status === 'UPCOMING' || d.status === 'DUE_TODAY');
    return paginateTaxItems(items, limit, offset);
  }

  public retrieveOverdueTaxRecords(
    actor: PropertyTaxActorContext,
    propertyId: string,
    asOfIso?: string,
    limit?: number,
    offset?: number
  ): PaginatedTaxResult<TaxObligationRecord> {
    assertPropertyTaxAccess(this.store, actor, propertyId);
    const cutoff = asOfIso ? new Date(asOfIso).getTime() : Date.now();
    const items = this.store.listObligationsByProperty(propertyId).filter((ob) => {
      if (ob.status === 'PAID' || ob.status === 'WAIVED' || ob.status === 'CANCELLED') return false;
      return ob.status === 'OVERDUE' || new Date(ob.dueDateIso).getTime() < cutoff;
    });
    return paginateTaxItems(items, limit, offset);
  }

  public retrieveExemptionStatus(
    actor: PropertyTaxActorContext,
    propertyId: string,
    limit?: number,
    offset?: number
  ): PaginatedTaxResult<TaxExemptionRecord> {
    assertPropertyTaxAccess(this.store, actor, propertyId);
    return paginateTaxItems(this.store.listExemptionsByProperty(propertyId), limit, offset);
  }

  public retrieveTaxReportingSummary(
    actor: PropertyTaxActorContext,
    propertyId: string
  ): PropertyTaxReportingSummary {
    assertPropertyTaxAccess(this.store, actor, propertyId);
    const taxRecords = this.store.listTaxRecordsByProperty(propertyId);
    const obligations = this.store.listObligationsByProperty(propertyId);
    const charges = this.store.listMunicipalChargesByProperty(propertyId);
    const deadlines = this.store.listDeadlinesByProperty(propertyId);
    const exemptions = this.store.listExemptionsByProperty(propertyId);
    const disputes = this.store.listDisputesByProperty(propertyId);

    const missingInformationSummary: string[] = [];
    if (taxRecords.length === 0) {
      missingInformationSummary.push(
        'No property tax records are registered for this property; absence of records does not imply zero tax liability.'
      );
    }

    let officiallyVerifiedObligationsTotalRials = 0;
    let officiallyConfirmedPaidTotalRials = 0;
    let officiallyConfirmedUnpaidTotalRials = 0;
    let userReportedUnverifiedObligationsTotalRials = 0;
    let estimatedObligationsTotalRials = 0;
    const conflictingRecordIds: string[] = [];

    for (const ob of obligations) {
      if (ob.verificationStatus === 'CONFLICTING_RECORDS') conflictingRecordIds.push(ob.id);
      if (ob.epistemicClassification === 'OFFICIALLY_ASSESSED_OBLIGATION') {
        officiallyVerifiedObligationsTotalRials += ob.originalAmountRials;
        officiallyConfirmedPaidTotalRials += ob.confirmedPaidAmountRials;
        officiallyConfirmedUnpaidTotalRials += Math.max(0, ob.originalAmountRials - ob.confirmedPaidAmountRials);
      } else if (ob.epistemicClassification === 'USER_REPORTED_OBLIGATION') {
        userReportedUnverifiedObligationsTotalRials += ob.originalAmountRials;
      } else if (ob.epistemicClassification === 'ESTIMATED_OBLIGATION') {
        estimatedObligationsTotalRials += ob.originalAmountRials;
      }
    }

    let verifiedChargesTotalRials = 0;
    let unverifiedReportedChargesTotalRials = 0;
    for (const chg of charges) {
      if (chg.verificationStatus === 'OFFICIALLY_VERIFIED') verifiedChargesTotalRials += chg.amountRials;
      else unverifiedReportedChargesTotalRials += chg.amountRials;
    }

    return {
      propertyId,
      generatedAtIso: new Date().toISOString(),
      hasAnyRecordedTaxData: taxRecords.length > 0 || obligations.length > 0 || charges.length > 0,
      missingInformationSummary,
      conflictingRecordIds,
      officiallyVerifiedObligationsTotalRials,
      officiallyConfirmedPaidTotalRials,
      officiallyConfirmedUnpaidTotalRials,
      userReportedUnverifiedObligationsTotalRials,
      estimatedObligationsTotalRials,
      municipalChargesSummary: {
        verifiedChargesTotalRials,
        unverifiedReportedChargesTotalRials,
        chargeCount: charges.length,
      },
      upcomingDeadlinesCount: deadlines.filter((d) => d.status === 'UPCOMING' || d.status === 'DUE_TODAY').length,
      overdueRecordsCount: obligations.filter((o) => o.status === 'OVERDUE').length,
      activeApprovedExemptionsCount: exemptions.filter((e) => e.status === 'APPROVED_EXEMPTION').length,
      pendingOrUnverifiedExemptionsCount: exemptions.filter(
        (e) =>
          e.status === 'POTENTIAL_ELIGIBILITY' ||
          e.status === 'APPLICATION_SUBMITTED' ||
          e.status === 'APPLICATION_PENDING' ||
          e.status === 'UNVERIFIED_EXEMPTION'
      ).length,
      openDisputesCount: disputes.filter(
        (d) => d.status !== 'RESOLVED' && d.status !== 'CLOSED' && d.status !== 'WITHDRAWN'
      ).length,
      missingRecordsMeanNoTaxLiability: false,
      combinesUnrelatedPropertyExpenses: false,
    };
  }
}

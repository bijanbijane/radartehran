import crypto from 'crypto';
import {
  DeadlineClassification,
  DeadlineUrgencyStatus,
  FeeRequirementStatus,
  InspectionStageCategory,
  InspectionVerificationStatus,
  PermitActorContext,
  PermitDeadlineRecord,
  PermitError,
  PermitFeeRecord,
  PermitInspectionRecord,
  PropertyAndProjectPermitProfile,
} from './types';
import {
  assertCanReadApplicationOrPermit,
  assertOfficerOrComplianceAdmin,
  evaluatePermitMultiDimensionalStatus,
  validateNonEmptyText,
} from './validationAndAuthz';
import { PropertyPermitsExternalAdapters } from './adapters';
import { PropertyPermitsStore } from './store';

export interface RegisterOfficialInspectionInput {
  id?: string;
  permitId?: string;
  applicationId?: string;
  inspectionStage: InspectionStageCategory;
  scheduledDateIso?: string;
  inspectingAuthorityId: string;
  verificationStatus?: Extract<
    InspectionVerificationStatus,
    'INTERNALLY_SCHEDULED' | 'REPORTED_COMPLETED_BY_APPLICANT'
  >;
  findingsSummary: string;
  followUpRequired?: boolean;
  isSyntheticTestFixture?: boolean;
}

export interface RecordInspectionOutcomeInput {
  inspectionId: string;
  verificationStatus: InspectionVerificationStatus;
  conductedDateIso?: string;
  officialInspectionReference?: string;
  findingsSummary: string;
  followUpRequired: boolean;
  supportingEvidenceIds?: string[];
}

export interface RegisterFeeAssessmentInput {
  id?: string;
  permitId?: string;
  applicationId?: string;
  feeType: string;
  amountRials: number;
  issuingAuthorityId: string;
  feeStatus: Extract<FeeRequirementStatus, 'ESTIMATED_FEE' | 'OFFICIALLY_ASSESSED_OUTSTANDING'>;
  officialAssessmentReference?: string;
  dueDateIso?: string;
  isSyntheticTestFixture?: boolean;
}

export interface RecordFeePaymentReferenceInput {
  feeId: string;
  paymentClaimType: 'REPORTED_PAID_BY_APPLICANT_UNVERIFIED' | 'CONFIRMED_PAID_BY_AUTHORITATIVE_SOURCE' | 'WAIVED_OR_REFUNDED';
  externalPaymentReferenceNumber: string;
  receiptEvidenceIds?: string[];
}

export interface RegisterDeadlineInput {
  id?: string;
  targetType: 'APPLICATION' | 'PERMIT' | 'CONDITION' | 'INSPECTION' | 'FEE';
  targetId: string;
  propertyId: string;
  deadlineClassification: DeadlineClassification;
  title: string;
  dueDateIso: string;
  recipientPartyId?: string;
  dueSoonThresholdDays?: number;
}

export class InspectionsFeesAndDeadlinesService {
  constructor(
    private readonly store: PropertyPermitsStore,
    private readonly adapters: PropertyPermitsExternalAdapters
  ) {}

  async registerOfficialInspection(
    actor: PermitActorContext,
    input: RegisterOfficialInspectionInput
  ): Promise<PermitInspectionRecord> {
    if (!input.permitId && !input.applicationId) {
      throw new PermitError(
        'VALIDATION_FAILED',
        'An inspection record must reference either a permitId or an applicationId.',
        400
      );
    }

    const now = new Date().toISOString();
    const record: PermitInspectionRecord = {
      id: input.id || `pinsp_${crypto.randomBytes(6).toString('hex')}`,
      permitId: input.permitId,
      applicationId: input.applicationId,
      inspectionStage: input.inspectionStage,
      scheduledDateIso: input.scheduledDateIso,
      inspectingAuthorityId: input.inspectingAuthorityId,
      verificationStatus: input.verificationStatus || 'INTERNALLY_SCHEDULED',
      findingsSummary: validateNonEmptyText(input.findingsSummary, 'findingsSummary', 1000),
      followUpRequired: input.followUpRequired ?? false,
      supportingEvidenceIds: [],
      isSyntheticTestFixture: input.isSyntheticTestFixture ?? false,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.saveInspection(record);
    return record;
  }

  async recordInspectionOutcome(
    actor: PermitActorContext,
    input: RecordInspectionOutcomeInput
  ): Promise<PermitInspectionRecord> {
    const existing = await this.store.getInspectionById(input.inspectionId);
    if (!existing) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Inspection '${input.inspectionId}' not found.`, 404);
    }

    const requiresOfficialVerification =
      input.verificationStatus === 'CONFIRMED_COMPLETED_BY_AUTHORITY' ||
      input.verificationStatus === 'OFFICIAL_RESULT_PASSED' ||
      input.verificationStatus === 'OFFICIAL_RESULT_FAILED' ||
      input.verificationStatus === 'OFFICIAL_RESULT_CONDITIONAL';

    if (requiresOfficialVerification) {
      assertOfficerOrComplianceAdmin(
        actor,
        `recording official inspection outcome '${input.verificationStatus}'`
      );
      if (
        !input.officialInspectionReference ||
        input.officialInspectionReference.trim().length === 0 ||
        !input.supportingEvidenceIds ||
        input.supportingEvidenceIds.length === 0
      ) {
        throw new PermitError(
          'UNVERIFIED_INSPECTION_PASS_REJECTED',
          `Cannot record '${input.verificationStatus}' without an officialInspectionReference and supportingEvidenceIds.`,
          400
        );
      }
    }

    const now = new Date().toISOString();
    const updated: PermitInspectionRecord = {
      ...existing,
      verificationStatus: input.verificationStatus,
      conductedDateIso: input.conductedDateIso || existing.conductedDateIso || now,
      officialInspectionReference:
        input.officialInspectionReference ?? existing.officialInspectionReference,
      findingsSummary: validateNonEmptyText(input.findingsSummary, 'findingsSummary', 1000),
      followUpRequired: input.followUpRequired,
      supportingEvidenceIds: input.supportingEvidenceIds
        ? Array.from(new Set([...existing.supportingEvidenceIds, ...input.supportingEvidenceIds]))
        : existing.supportingEvidenceIds,
      updatedAt: now,
    };

    await this.store.saveInspection(updated);
    await this.store.appendAuditEvent({
      id: `aud_${crypto.randomBytes(6).toString('hex')}`,
      targetType: 'INSPECTION',
      targetId: updated.id,
      action: `INSPECTION_${updated.verificationStatus}`,
      actorId: actor.actorId,
      actorRole: actor.role,
      occurredAt: now,
      summary: `Recorded inspection outcome ${updated.verificationStatus}.`,
    });
    return updated;
  }

  async registerFeeAssessment(
    actor: PermitActorContext,
    input: RegisterFeeAssessmentInput
  ): Promise<PermitFeeRecord> {
    if (!input.permitId && !input.applicationId) {
      throw new PermitError(
        'VALIDATION_FAILED',
        'A permit fee record must reference either a permitId or an applicationId.',
        400
      );
    }
    if (input.amountRials < 0 || !Number.isFinite(input.amountRials)) {
      throw new PermitError('VALIDATION_FAILED', 'amountRials must be a non-negative finite number.', 400);
    }
    if (
      input.feeStatus === 'OFFICIALLY_ASSESSED_OUTSTANDING' &&
      (!input.officialAssessmentReference || input.officialAssessmentReference.trim().length === 0)
    ) {
      throw new PermitError(
        'MISSING_OFFICIAL_DECISION_REFERENCE',
        'OFFICIALLY_ASSESSED_OUTSTANDING requires an officialAssessmentReference.',
        400
      );
    }

    const now = new Date().toISOString();
    const fee: PermitFeeRecord = {
      id: input.id || `pfee_${crypto.randomBytes(6).toString('hex')}`,
      permitId: input.permitId,
      applicationId: input.applicationId,
      feeType: validateNonEmptyText(input.feeType, 'feeType', 200),
      amountRials: input.amountRials,
      currency: 'IRR',
      issuingAuthorityId: input.issuingAuthorityId,
      feeStatus: input.feeStatus,
      officialAssessmentReference: input.officialAssessmentReference,
      dueDateIso: input.dueDateIso,
      receiptEvidenceIds: [],
      processedByPlatform: false,
      isSyntheticTestFixture: input.isSyntheticTestFixture ?? false,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.saveFee(fee);
    return fee;
  }

  async recordFeePaymentReference(
    actor: PermitActorContext,
    input: RecordFeePaymentReferenceInput
  ): Promise<PermitFeeRecord> {
    const fee = await this.store.getFeeById(input.feeId);
    if (!fee) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Fee record '${input.feeId}' not found.`, 404);
    }

    const extRef = validateNonEmptyText(
      input.externalPaymentReferenceNumber,
      'externalPaymentReferenceNumber',
      150
    );

    if (input.paymentClaimType === 'CONFIRMED_PAID_BY_AUTHORITATIVE_SOURCE') {
      assertOfficerOrComplianceAdmin(
        actor,
        'confirming fee payment from an authoritative source'
      );
      const paymentVerification = await this.adapters.paymentReference.verifyOfficialReceiptReference({
        issuingAuthorityId: fee.issuingAuthorityId,
        externalPaymentReferenceNumber: extRef,
        amountRials: fee.amountRials,
      });
      if (
        !paymentVerification.verifiedByAuthoritativeSource &&
        (!input.receiptEvidenceIds || input.receiptEvidenceIds.length === 0)
      ) {
        throw new PermitError(
          'UNVERIFIED_PAYMENT_CLAIM_REJECTED',
          'Cannot mark fee CONFIRMED_PAID_BY_AUTHORITATIVE_SOURCE without authoritative verification or official receipt evidence.',
          400
        );
      }
    } else if (input.paymentClaimType === 'WAIVED_OR_REFUNDED') {
      assertOfficerOrComplianceAdmin(actor, 'marking a regulatory fee as WAIVED_OR_REFUNDED');
    }

    const now = new Date().toISOString();
    const updated: PermitFeeRecord = {
      ...fee,
      feeStatus: input.paymentClaimType,
      externalPaymentReferenceNumber: extRef,
      receiptEvidenceIds: input.receiptEvidenceIds
        ? Array.from(new Set([...fee.receiptEvidenceIds, ...input.receiptEvidenceIds]))
        : fee.receiptEvidenceIds,
      updatedAt: now,
    };

    await this.store.saveFee(updated);
    return updated;
  }

  private computeDeadlineUrgency(
    dueDateIso: string,
    asOfDateIso: string,
    completedAtIso?: string,
    dueSoonThresholdDays = 14
  ): DeadlineUrgencyStatus {
    if (completedAtIso) return 'COMPLETED';
    const dueMs = new Date(dueDateIso).getTime();
    const nowMs = new Date(asOfDateIso).getTime();
    if (nowMs > dueMs) return 'OVERDUE';
    const diffDays = (dueMs - nowMs) / (1000 * 60 * 60 * 24);
    return diffDays <= dueSoonThresholdDays ? 'DUE_SOON' : 'UPCOMING';
  }

  async registerDeadline(
    actor: PermitActorContext,
    input: RegisterDeadlineInput
  ): Promise<PermitDeadlineRecord> {
    const now = new Date().toISOString();
    const urgencyStatus = this.computeDeadlineUrgency(
      input.dueDateIso,
      now,
      undefined,
      input.dueSoonThresholdDays
    );

    const deadline: PermitDeadlineRecord = {
      id: input.id || `pdead_${crypto.randomBytes(6).toString('hex')}`,
      targetType: input.targetType,
      targetId: input.targetId,
      propertyId: input.propertyId,
      deadlineClassification: input.deadlineClassification,
      title: validateNonEmptyText(input.title, 'title', 300),
      dueDateIso: input.dueDateIso,
      urgencyStatus,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.saveDeadline(deadline);

    if (
      (urgencyStatus === 'DUE_SOON' || urgencyStatus === 'OVERDUE') &&
      input.recipientPartyId
    ) {
      await this.adapters.notifications.emitPermitDeadlineReminder({
        deadlineId: deadline.id,
        targetType: deadline.targetType,
        targetId: deadline.targetId,
        recipientPartyId: input.recipientPartyId,
        urgencyStatus,
        dueDateIso: deadline.dueDateIso,
        summary: `${deadline.title} (${deadline.deadlineClassification}) is ${urgencyStatus}.`,
      });
    }

    return deadline;
  }

  async retrieveUpcomingAndOverdueDeadlines(
    _actor: PermitActorContext,
    propertyId: string,
    asOfDateIso: string
  ): Promise<{
    asOfDateIso: string;
    upcomingAndDueSoon: PermitDeadlineRecord[];
    overdue: PermitDeadlineRecord[];
    completed: PermitDeadlineRecord[];
  }> {
    const rawDeadlines = await this.store.listDeadlinesByProperty(propertyId);
    // Re-evaluate urgency as of `asOfDateIso` WITHOUT ever auto-extending OFFICIAL_AUTHORITY_DEADLINE dueDateIso
    const evaluated = rawDeadlines.map((d) => ({
      ...d,
      urgencyStatus: this.computeDeadlineUrgency(d.dueDateIso, asOfDateIso, d.completedAtIso),
    }));

    return {
      asOfDateIso,
      upcomingAndDueSoon: evaluated.filter(
        (d) => d.urgencyStatus === 'UPCOMING' || d.urgencyStatus === 'DUE_SOON'
      ),
      overdue: evaluated.filter((d) => d.urgencyStatus === 'OVERDUE'),
      completed: evaluated.filter((d) => d.urgencyStatus === 'COMPLETED'),
    };
  }

  async retrievePropertyAndProjectPermitProfile(
    actor: PermitActorContext,
    propertyId: string,
    asOfDateIso = new Date().toISOString()
  ): Promise<PropertyAndProjectPermitProfile> {
    const [allApps, allPermits, allDeadlines] = await Promise.all([
      this.store.listApplicationsByProperty(propertyId, 100),
      this.store.listPermitsByProperty(propertyId, 100),
      this.store.listDeadlinesByProperty(propertyId),
    ]);

    const visibleApps = allApps.filter((app) => {
      try {
        assertCanReadApplicationOrPermit(actor, app);
        return true;
      } catch {
        return false;
      }
    });

    const visiblePermits = [];
    const conditionsByPermitId: Record<string, Awaited<ReturnType<PropertyPermitsStore['listConditionsByPermit']>>> = {};

    for (const p of allPermits) {
      try {
        assertCanReadApplicationOrPermit(actor, p);
        const conds = await this.store.listConditionsByPermit(p.id);
        conditionsByPermitId[p.id] = conds;
        visiblePermits.push({
          ...p,
          multiDimensionalStatus: evaluatePermitMultiDimensionalStatus({
            permit: p,
            conditions: conds,
            asOfDateIso,
          }),
        });
      } catch {
        // skip unauthorized permits
      }
    }

    const targetIds = new Set<string>([
      ...visibleApps.map((a) => a.id),
      ...visiblePermits.map((p) => p.id),
    ]);

    const inspectionsMap = new Map<string, PermitInspectionRecord>();
    const feesMap = new Map<string, PermitFeeRecord>();

    for (const tid of targetIds) {
      const [insps, fees] = await Promise.all([
        this.store.listInspectionsBySubject(tid),
        this.store.listFeesBySubject(tid),
      ]);
      for (const i of insps) inspectionsMap.set(i.id, i);
      for (const f of fees) feesMap.set(f.id, f);
    }

    const evaluatedDeadlines = allDeadlines.map((d) => ({
      ...d,
      urgencyStatus: this.computeDeadlineUrgency(d.dueDateIso, asOfDateIso, d.completedAtIso),
    }));

    return {
      propertyId,
      applications: visibleApps,
      permits: visiblePermits,
      conditionsByPermitId,
      inspections: Array.from(inspectionsMap.values()),
      fees: Array.from(feesMap.values()),
      upcomingAndOverdueDeadlines: evaluatedDeadlines,
    };
  }
}

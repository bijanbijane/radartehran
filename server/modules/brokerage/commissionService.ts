/**
 * @file server/modules/brokerage/commissionService.ts
 * @description Brokerage Commission Agreements, Calculation Bases, Versioning, and Unconfirmed Deal Guards.
 */

import type {
  CommissionAgreementRecord,
  CommissionType,
  CommissionCalculationBasis,
  CommissionPayer,
  CommissionApprovalStatus,
  CommissionAllocationRules,
} from './types';
import type { BrokerageStore } from './store';
import type {
  TransactionReferenceAdapter,
  BrokerageNotificationEventSink,
} from './adapters';
import { authorizeAgencyAction } from './authorization';
import {
  validateSafeId,
  validateCommissionType,
  validateCalculationBasis,
  validateCommissionAllocation,
  sanitizeText,
  BrokerageValidationError,
} from './validation';

export interface CreateCommissionAgreementInput {
  agencyId: string;
  agentUid: string;
  dealReference: string;
  commissionType: CommissionType;
  agreedAmountOrPercentage: number;
  currency: 'IRT' | 'IRR' | 'USD';
  calculationBasis: CommissionCalculationBasis;
  payer: CommissionPayer;
  allocationRules: CommissionAllocationRules;
  effectiveDateIso: string;
  expirationDateIso?: string;
  supportingDocumentReferences?: string[];
}

export interface CommissionCalculationResult {
  dealReference: string;
  isConfirmed: boolean;
  confirmedValueToman?: number;
  totalCommissionToman: number;
  agencyShareToman: number;
  agentShareToman: number;
  referralShareToman: number;
  calculationBasis: CommissionCalculationBasis;
  status: 'ESTIMATED_PENDING_CONFIRMATION' | 'CALCULATED_ON_CONFIRMED_DEAL';
}

export class CommissionService {
  constructor(
    private readonly store: BrokerageStore,
    private readonly transactionAdapter: TransactionReferenceAdapter,
    private readonly notificationSink: BrokerageNotificationEventSink,
  ) {}

  async createAgreement(
    actorUid: string,
    input: CreateCommissionAgreementInput,
    isPlatformAdmin = false,
  ): Promise<CommissionAgreementRecord> {
    validateSafeId(input.agencyId, 'agencyId');
    validateSafeId(input.agentUid, 'agentUid');
    validateSafeId(input.dealReference, 'dealReference');

    const commType = validateCommissionType(input.commissionType);
    const calcBasis = validateCalculationBasis(input.calculationBasis);
    const allocation = validateCommissionAllocation(input.allocationRules);

    const val = Number(input.agreedAmountOrPercentage);
    if (Number.isNaN(val) || val <= 0) {
      throw new BrokerageValidationError('INVALID_AMOUNT', 'Agreed amount or percentage must be greater than zero.');
    }

    const agency = await this.store.getAgencyById(input.agencyId);
    if (!agency || agency.operatingStatus === 'suspended' || agency.operatingStatus === 'closed') {
      throw new BrokerageValidationError('AGENCY_INACTIVE', 'Cannot record commission agreements under inactive agency.');
    }

    const actorMembership = await this.store.findMembershipByAgencyAndUser(input.agencyId, actorUid);
    const authDecision = authorizeAgencyAction('agency.manage_commission_agreements', {
      principalUid: actorUid,
      isPlatformAdmin,
      agency,
      membership: actorMembership,
    });
    if (!authDecision.allowed) {
      throw new BrokerageValidationError('FORBIDDEN', authDecision.reason || 'Unauthorized to manage commission agreements.');
    }

    const agreementId = `comm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();

    const record: CommissionAgreementRecord = {
      id: agreementId,
      agencyId: input.agencyId,
      agentUid: input.agentUid,
      dealReference: input.dealReference,
      commissionType: commType,
      agreedAmountOrPercentage: val,
      currency: input.currency || 'IRT',
      calculationBasis: calcBasis,
      payer: input.payer || 'seller',
      allocationRules: allocation,
      version: 1,
      effectiveDateIso: input.effectiveDateIso || nowIso,
      expirationDateIso: input.expirationDateIso,
      approvalStatus: 'proposed',
      supportingDocumentReferences: (input.supportingDocumentReferences || []).map((r) => sanitizeText(r, 100)),
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    const saved = await this.store.saveCommissionAgreement(record);

    await this.notificationSink.emitEvent({
      eventType: 'brokerage.commission_agreement_created',
      recipientUid: input.agentUid,
      agencyId: input.agencyId,
      actorUid,
      data: { agreementId, dealReference: input.dealReference, agreedAmountOrPercentage: val },
      timestampIso: nowIso,
    });

    return saved;
  }

  async amendAgreement(
    actorUid: string,
    existingAgreementId: string,
    updates: Partial<CreateCommissionAgreementInput>,
    isPlatformAdmin = false,
  ): Promise<CommissionAgreementRecord> {
    const existing = await this.store.getCommissionAgreementById(existingAgreementId);
    if (!existing) throw new BrokerageValidationError('NOT_FOUND', 'Commission agreement not found.');

    const agency = await this.store.getAgencyById(existing.agencyId);
    const actorMembership = await this.store.findMembershipByAgencyAndUser(existing.agencyId, actorUid);
    const authDecision = authorizeAgencyAction('agency.manage_commission_agreements', {
      principalUid: actorUid,
      isPlatformAdmin,
      agency,
      membership: actorMembership,
    });
    if (!authDecision.allowed) {
      throw new BrokerageValidationError('FORBIDDEN', 'Unauthorized to amend commission agreements.');
    }

    // Mark previous as amended
    existing.approvalStatus = 'amended';
    existing.updatedAtIso = new Date().toISOString();
    await this.store.saveCommissionAgreement(existing);

    // Create next version
    const newId = `comm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();

    const amendedRecord: CommissionAgreementRecord = {
      id: newId,
      agencyId: existing.agencyId,
      agentUid: updates.agentUid || existing.agentUid,
      dealReference: updates.dealReference || existing.dealReference,
      commissionType: updates.commissionType ? validateCommissionType(updates.commissionType) : existing.commissionType,
      agreedAmountOrPercentage: updates.agreedAmountOrPercentage ?? existing.agreedAmountOrPercentage,
      currency: updates.currency || existing.currency,
      calculationBasis: updates.calculationBasis ? validateCalculationBasis(updates.calculationBasis) : existing.calculationBasis,
      payer: updates.payer || existing.payer,
      allocationRules: updates.allocationRules ? validateCommissionAllocation(updates.allocationRules) : existing.allocationRules,
      version: existing.version + 1,
      effectiveDateIso: updates.effectiveDateIso || nowIso,
      expirationDateIso: updates.expirationDateIso || existing.expirationDateIso,
      approvalStatus: 'proposed',
      supportingDocumentReferences: updates.supportingDocumentReferences || existing.supportingDocumentReferences,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      amendedFromId: existing.id,
    };

    return this.store.saveCommissionAgreement(amendedRecord);
  }

  async updateApprovalStatus(
    actorUid: string,
    agreementId: string,
    status: CommissionApprovalStatus,
  ): Promise<CommissionAgreementRecord> {
    const agreement = await this.store.getCommissionAgreementById(agreementId);
    if (!agreement) throw new BrokerageValidationError('NOT_FOUND', 'Agreement not found.');

    agreement.approvalStatus = status;
    agreement.updatedAtIso = new Date().toISOString();
    return this.store.saveCommissionAgreement(agreement);
  }

  /**
   * Safe commission calculation:
   * Guard: Never calculate payable commission without verified deal confirmation from Property Transactions module!
   */
  async calculatePayableCommission(
    agreementId: string,
  ): Promise<CommissionCalculationResult> {
    const agreement = await this.store.getCommissionAgreementById(agreementId);
    if (!agreement) throw new BrokerageValidationError('NOT_FOUND', 'Agreement not found.');

    const dealVerification = await this.transactionAdapter.verifyDealStatus(agreement.dealReference);

    let totalCommissionToman = 0;
    if (agreement.commissionType === 'fixed_amount') {
      totalCommissionToman = agreement.agreedAmountOrPercentage;
    } else if (dealVerification.isConfirmed && dealVerification.confirmedValueToman) {
      // Percentage calculated strictly on verified confirmed transaction value
      totalCommissionToman = Math.round(
        (dealVerification.confirmedValueToman * agreement.agreedAmountOrPercentage) / 100,
      );
    }

    const agencyShare = Math.round(
      (totalCommissionToman * agreement.allocationRules.agencySharePercentage) / 100,
    );
    const agentShare = Math.round(
      (totalCommissionToman * agreement.allocationRules.agentSharePercentage) / 100,
    );
    const referralShare = Math.round(
      (totalCommissionToman * (agreement.allocationRules.referralSharePercentage || 0)) / 100,
    );

    return {
      dealReference: agreement.dealReference,
      isConfirmed: dealVerification.isConfirmed,
      confirmedValueToman: dealVerification.confirmedValueToman,
      totalCommissionToman,
      agencyShareToman: agencyShare,
      agentShareToman: agentShare,
      referralShareToman: referralShare,
      calculationBasis: agreement.calculationBasis,
      status: dealVerification.isConfirmed
        ? 'CALCULATED_ON_CONFIRMED_DEAL'
        : 'ESTIMATED_PENDING_CONFIRMATION',
    };
  }
}

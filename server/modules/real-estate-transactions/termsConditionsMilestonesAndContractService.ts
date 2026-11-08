import { RealEstateTransactionCrossModuleAdapters, TransactionalRealEstateTransactionStore } from './store';
import { assertTransactionAccess } from './transactionParticipantOfferAndNegotiationService';
import {
  ContractExecutionStatus,
  ContractProvenanceStage,
  DealTermEpistemicStage,
  DealTermRecord,
  MilestoneEpistemicStatus,
  RealEstateTransactionError,
  TransactionActorContext,
  TransactionConditionCategory,
  TransactionConditionRecord,
  TransactionConditionStatus,
  TransactionContractReferenceRecord,
  TransactionMilestoneRecord,
} from './types';

function makeTxId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class TermsConditionsMilestonesAndContractService {
  constructor(
    private readonly store: TransactionalRealEstateTransactionStore,
    private readonly adapters: RealEstateTransactionCrossModuleAdapters
  ) {}

  public async recordAgreedDealTerm(
    actor: TransactionActorContext,
    input: {
      transactionId: string;
      termCategory: string;
      termValue: string | number;
      unitOrCurrency: string;
      effectivePeriodSummary: string;
      epistemicStage: DealTermEpistemicStage;
      supportingEvidenceReference?: string;
      sourceProvenance: string;
    }
  ): Promise<DealTermRecord> {
    const txRecord = assertTransactionAccess(this.store, actor, input.transactionId);

    return this.store.runTransaction((tx) => {
      const priorTerms = tx
        .listDealTermsByTransaction(txRecord.id)
        .filter((t) => t.termCategory === input.termCategory);
      const latestPrior = priorTerms[priorTerms.length - 1];

      const term: DealTermRecord = {
        id: makeTxId('txterm'),
        transactionId: txRecord.id,
        termCategory: input.termCategory,
        termValue: input.termValue,
        unitOrCurrency: input.unitOrCurrency,
        version: latestPrior ? latestPrior.version + 1 : 1,
        supersedesTermId: latestPrior?.id,
        effectivePeriodSummary: input.effectivePeriodSummary,
        epistemicStage: input.epistemicStage,
        supportingEvidenceReference: input.supportingEvidenceReference,
        sourceProvenance: input.sourceProvenance,
        isLegallyBindingWithoutContractEvidence: false,
        createdAt: new Date().toISOString(),
      };
      tx.saveDealTerm(term);
      return term;
    });
  }

  public async registerTransactionCondition(
    actor: TransactionActorContext,
    input: {
      transactionId: string;
      conditionCategory: TransactionConditionCategory;
      description: string;
      responsiblePartyId: string;
      requiredCompletionDateIso: string;
    }
  ): Promise<TransactionConditionRecord> {
    const txRecord = assertTransactionAccess(this.store, actor, input.transactionId);
    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const cond: TransactionConditionRecord = {
        id: makeTxId('txcond'),
        transactionId: txRecord.id,
        conditionCategory: input.conditionCategory,
        description: input.description,
        responsiblePartyId: input.responsiblePartyId,
        requiredCompletionDateIso: input.requiredCompletionDateIso,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };
      tx.saveCondition(cond);
      return cond;
    });
  }

  public async updateConditionStatusFromAuthorizedSource(
    actor: TransactionActorContext,
    input: {
      conditionId: string;
      targetStatus: TransactionConditionStatus;
      evidenceReference?: string;
      verificationSourceModule?: string;
    }
  ): Promise<TransactionConditionRecord> {
    const cond = this.store.getCondition(input.conditionId);
    if (!cond) {
      throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', `Condition "${input.conditionId}" not found.`, 404);
    }
    assertTransactionAccess(this.store, actor, cond.transactionId);

    // A condition may be marked satisfied only by the required evidence or authorized confirmation
    if (input.targetStatus === 'SATISFIED' && (!input.evidenceReference || !input.verificationSourceModule)) {
      throw new RealEstateTransactionError(
        'CONDITION_SATISFACTION_REQUIRES_EVIDENCE',
        'Marking a transaction condition SATISFIED requires both an evidenceReference and a verificationSourceModule.'
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const updated: TransactionConditionRecord = {
        ...cond,
        status: input.targetStatus,
        evidenceReference: input.evidenceReference ?? cond.evidenceReference,
        verificationSourceModule: input.verificationSourceModule ?? cond.verificationSourceModule,
        completedAtIso: input.targetStatus === 'SATISFIED' ? now : cond.completedAtIso,
        updatedAt: now,
      };
      tx.saveCondition(updated);
      return updated;
    });
  }

  public async registerTransactionMilestone(
    actor: TransactionActorContext,
    input: {
      transactionId: string;
      milestoneType: TransactionMilestoneRecord['milestoneType'];
      expectedDateIso: string;
      responsiblePartyId: string;
      sourceProvenance: string;
    }
  ): Promise<TransactionMilestoneRecord> {
    const txRecord = assertTransactionAccess(this.store, actor, input.transactionId);
    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const milestone: TransactionMilestoneRecord = {
        id: makeTxId('txmile'),
        transactionId: txRecord.id,
        milestoneType: input.milestoneType,
        expectedDateIso: input.expectedDateIso,
        epistemicStatus: 'PLANNED_MILESTONE',
        responsiblePartyId: input.responsiblePartyId,
        evidenceReferences: [],
        sourceProvenance: input.sourceProvenance,
        plannedEqualsCompleted: false,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveMilestone(milestone);
      return milestone;
    });
  }

  public async confirmTransactionMilestone(
    actor: TransactionActorContext,
    input: {
      milestoneId: string;
      targetStatus: Exclude<MilestoneEpistemicStatus, 'PLANNED_MILESTONE'>;
      actualDateIso: string;
      evidenceReferences: string[];
    }
  ): Promise<TransactionMilestoneRecord> {
    const milestone = this.store.getMilestone(input.milestoneId);
    if (!milestone) {
      throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', `Milestone "${input.milestoneId}" not found.`, 404);
    }
    assertTransactionAccess(this.store, actor, milestone.transactionId);

    if (input.targetStatus === 'CONFIRMED_MILESTONE' && input.evidenceReferences.length === 0) {
      throw new RealEstateTransactionError(
        'PLANNED_MILESTONE_NOT_COMPLETED_WITHOUT_EVIDENCE',
        'A planned milestone cannot be marked CONFIRMED_MILESTONE without supporting evidenceReferences.'
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const updated: TransactionMilestoneRecord = {
        ...milestone,
        epistemicStatus: input.targetStatus,
        actualDateIso: input.actualDateIso,
        evidenceReferences: input.evidenceReferences,
        updatedAt: now,
      };
      tx.saveMilestone(updated);
      return updated;
    });
  }

  public async recordContractReference(
    actor: TransactionActorContext,
    input: {
      transactionId: string;
      contractType: string;
      contractVersion: number;
      contractingPartyIds: string[];
      contractDateIso: string;
      effectiveDateIso: string;
      expirationDateIso?: string;
      mediaDocumentId: string;
      provenanceStage: ContractProvenanceStage;
      signatureProviderReference?: string;
      officialRegistrationReference?: string;
    }
  ): Promise<TransactionContractReferenceRecord> {
    const txRecord = assertTransactionAccess(this.store, actor, input.transactionId);
    if (!(await this.adapters.media.verifyDocumentExists(input.mediaDocumentId))) {
      throw new RealEstateTransactionError(
        'VALIDATION_FAILED',
        `Media document "${input.mediaDocumentId}" was not found in the Media module.`
      );
    }

    // Do not claim legal validity or confirmed execution solely because a PDF was uploaded
    if (
      input.provenanceStage === 'SIGNATURE_PROVIDER_CONFIRMED_EXECUTION' &&
      !input.signatureProviderReference
    ) {
      throw new RealEstateTransactionError(
        'UPLOADED_PDF_NOT_EXECUTED_CONTRACT',
        'SIGNATURE_PROVIDER_CONFIRMED_EXECUTION requires an external signatureProviderReference.'
      );
    }
    if (
      input.provenanceStage === 'OFFICIALLY_REGISTERED_CONTRACT' &&
      !input.officialRegistrationReference
    ) {
      throw new RealEstateTransactionError(
        'UPLOADED_PDF_NOT_EXECUTED_CONTRACT',
        'OFFICIALLY_REGISTERED_CONTRACT requires an officialRegistrationReference.'
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const executionStatus: ContractExecutionStatus =
        input.provenanceStage === 'SIGNATURE_PROVIDER_CONFIRMED_EXECUTION' ||
        input.provenanceStage === 'OFFICIALLY_REGISTERED_CONTRACT'
          ? 'FULLY_SIGNED'
          : input.provenanceStage === 'USER_REPORTED_SIGNED_DOCUMENT'
            ? 'PARTIALLY_SIGNED'
            : 'PREPARED';

      const contract: TransactionContractReferenceRecord = {
        id: makeTxId('txcontract'),
        transactionId: txRecord.id,
        contractType: input.contractType,
        contractVersion: input.contractVersion,
        contractingPartyIds: input.contractingPartyIds,
        contractDateIso: input.contractDateIso,
        effectiveDateIso: input.effectiveDateIso,
        expirationDateIso: input.expirationDateIso,
        executionStatus,
        provenanceStage: input.provenanceStage,
        signatureProviderReference: input.signatureProviderReference,
        officialRegistrationReference: input.officialRegistrationReference,
        mediaDocumentId: input.mediaDocumentId,
        provesLegalValidityFromPdfImageAlone: false,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveContract(contract);
      tx.saveTransaction({
        ...txRecord,
        activeContractId: contract.id,
        status: executionStatus === 'FULLY_SIGNED' ? 'CONDITIONS_PENDING' : 'CONTRACT_EXECUTION_PENDING',
        version: txRecord.version + 1,
        updatedAt: now,
      });
      return contract;
    });
  }
}

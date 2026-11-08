export * from './types';
export * from './validationAndAuthz';
export * from './adapters';
export * from './store';
export * from './firestoreStore';
export * from './orgBranchAndProfileService';
export * from './mandateAssignmentAndCommissionService';
export * from './engagementSupervisionAndReportingService';

import {
  BrokerageOperationsExternalAdapters,
  createDefaultBrokerageOperationsAdapters,
} from './adapters';
import { BrokerageOperationsStore, InMemoryBrokerageOperationsStore } from './store';
import { FirestoreBrokerageOperationsStore } from './firestoreStore';
import { OrgBranchAndProfileService } from './orgBranchAndProfileService';
import { MandateAssignmentAndCommissionService } from './mandateAssignmentAndCommissionService';
import { EngagementSupervisionAndReportingService } from './engagementSupervisionAndReportingService';

export interface BrokerageOperationsModuleOptions {
  store?: BrokerageOperationsStore;
  useFirestore?: boolean;
  adapters?: Partial<BrokerageOperationsExternalAdapters>;
}

export function createBrokerageOperationsModuleFacade(
  options: BrokerageOperationsModuleOptions = {}
) {
  const store: BrokerageOperationsStore =
    options.store ??
    (options.useFirestore
      ? new FirestoreBrokerageOperationsStore()
      : new InMemoryBrokerageOperationsStore());

  const adapters = createDefaultBrokerageOperationsAdapters(options.adapters);
  const orgBranchAndProfileService = new OrgBranchAndProfileService(store, adapters);
  const mandateAssignmentAndCommissionService = new MandateAssignmentAndCommissionService(store, adapters);
  const engagementSupervisionAndReportingService = new EngagementSupervisionAndReportingService(store, adapters);

  return {
    store,
    adapters,
    orgBranchAndProfileService,
    mandateAssignmentAndCommissionService,
    engagementSupervisionAndReportingService,
    registerBrokerageOrganization: orgBranchAndProfileService.registerBrokerageOrganization.bind(orgBranchAndProfileService),
    retrieveBrokerageOrganization: orgBranchAndProfileService.retrieveBrokerageOrganization.bind(orgBranchAndProfileService),
    updateOrganizationMetadata: orgBranchAndProfileService.updateOrganizationMetadata.bind(orgBranchAndProfileService),
    registerAgencyBranch: orgBranchAndProfileService.registerAgencyBranch.bind(orgBranchAndProfileService),
    closeOrSuspendBranch: orgBranchAndProfileService.closeOrSuspendBranch.bind(orgBranchAndProfileService),
    registerProfessionalProfile: orgBranchAndProfileService.registerProfessionalProfile.bind(orgBranchAndProfileService),
    retrievePublicProfessionalProfile: orgBranchAndProfileService.retrievePublicProfessionalProfile.bind(orgBranchAndProfileService),
    addQualificationReference: orgBranchAndProfileService.addQualificationReference.bind(orgBranchAndProfileService),
    submitQualificationForVerification: orgBranchAndProfileService.submitQualificationForVerification.bind(orgBranchAndProfileService),
    recordAuthorizedQualificationVerification: orgBranchAndProfileService.recordAuthorizedQualificationVerification.bind(orgBranchAndProfileService),
    verifyProfessionalLicensedEligibility: orgBranchAndProfileService.verifyProfessionalLicensedEligibility.bind(orgBranchAndProfileService),
    createOrganizationAgentAffiliation: orgBranchAndProfileService.createOrganizationAgentAffiliation.bind(orgBranchAndProfileService),
    transferBranchAffiliation: orgBranchAndProfileService.transferBranchAffiliation.bind(orgBranchAndProfileService),
    suspendOrTerminateAffiliation: orgBranchAndProfileService.suspendOrTerminateAffiliation.bind(orgBranchAndProfileService),
    createRepresentationMandate: mandateAssignmentAndCommissionService.createRepresentationMandate.bind(mandateAssignmentAndCommissionService),
    acceptOrTerminateMandate: mandateAssignmentAndCommissionService.acceptOrTerminateMandate.bind(mandateAssignmentAndCommissionService),
    updatePermittedMandateScope: mandateAssignmentAndCommissionService.updatePermittedMandateScope.bind(mandateAssignmentAndCommissionService),
    recordAuthorityScope: mandateAssignmentAndCommissionService.recordAuthorityScope.bind(mandateAssignmentAndCommissionService),
    verifyMandateActionPermission: mandateAssignmentAndCommissionService.verifyMandateActionPermission.bind(mandateAssignmentAndCommissionService),
    createAgentAssignment: mandateAssignmentAndCommissionService.createAgentAssignment.bind(mandateAssignmentAndCommissionService),
    acceptOrRejectAssignment: mandateAssignmentAndCommissionService.acceptOrRejectAssignment.bind(mandateAssignmentAndCommissionService),
    reassignProfessional: mandateAssignmentAndCommissionService.reassignProfessional.bind(mandateAssignmentAndCommissionService),
    createCommissionAgreement: mandateAssignmentAndCommissionService.createCommissionAgreement.bind(mandateAssignmentAndCommissionService),
    amendCommissionAgreement: mandateAssignmentAndCommissionService.amendCommissionAgreement.bind(mandateAssignmentAndCommissionService),
    calculateCommissionReference: mandateAssignmentAndCommissionService.calculateCommissionReference.bind(mandateAssignmentAndCommissionService),
    recordInternalCommissionAllocation: mandateAssignmentAndCommissionService.recordInternalCommissionAllocation.bind(mandateAssignmentAndCommissionService),
    recordCommissionPaymentStatus: mandateAssignmentAndCommissionService.recordCommissionPaymentStatus.bind(mandateAssignmentAndCommissionService),
    createClientEngagement: engagementSupervisionAndReportingService.createClientEngagement.bind(engagementSupervisionAndReportingService),
    retrieveClientEngagement: engagementSupervisionAndReportingService.retrieveClientEngagement.bind(engagementSupervisionAndReportingService),
    recordConsentAwareContactAttempt: engagementSupervisionAndReportingService.recordConsentAwareContactAttempt.bind(engagementSupervisionAndReportingService),
    transferOrCloseEngagement: engagementSupervisionAndReportingService.transferOrCloseEngagement.bind(engagementSupervisionAndReportingService),
    recordSupervisionReview: engagementSupervisionAndReportingService.recordSupervisionReview.bind(engagementSupervisionAndReportingService),
    retrieveOrganizationOperationalSummary: engagementSupervisionAndReportingService.retrieveOrganizationOperationalSummary.bind(engagementSupervisionAndReportingService),
    retrieveProfessionalActivityHistory: engagementSupervisionAndReportingService.retrieveProfessionalActivityHistory.bind(engagementSupervisionAndReportingService),
    retrieveMandateAndAffiliationHistory: engagementSupervisionAndReportingService.retrieveMandateAndAffiliationHistory.bind(engagementSupervisionAndReportingService),
  };
}

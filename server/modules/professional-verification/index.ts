/**
 * @file server/modules/professional-verification/index.ts
 * @description Canonical Barrel Exports for the Radartehran Professional Identity,
 * Organization, and Credential-Verification Backend Domain (Employee 12).
 */

export type {
  AuthenticatedPrincipalContext,
  BusinessOrganizationProfileRecord,
  CredentialCategory,
  IssuingAuthorityCode,
  OfficialVerificationAuthorityMetadata,
  OrganizationMembershipReference,
  OrganizationMembershipRole,
  OrganizationMembershipStatus,
  PrivateDocumentEvidenceItem,
  ProfessionalLicenseRecord,
  ProfessionalProfileRecord,
  PublicOrganizationVerificationSummary,
  PublicProfessionalVerificationSummary,
  ServiceMarketplaceProviderRef,
  VerificationAuditLogEntry,
  VerificationEvidenceRecord,
  VerificationLifecycleState,
  VerificationMethodType,
  VerificationPermission,
  VerifiedEntityType,
} from './types';

export {
  ALLOWED_VERIFICATION_STATE_TRANSITIONS,
  authorizePrincipalForVerificationAction,
  getVerificationMethodLabelFa,
  maskCredentialIdentifierForPublic,
  OFFICIAL_VERIFICATION_AUTHORITIES,
  validateOfficialAuthorityVerificationUrl,
  validateVerificationStateTransition,
} from './authoritiesAndStateMachine';

export {
  applyDisciplinaryCredentialTransition,
  computeAuditIntegrityHash,
  createUnsubmittedCredentialDraft,
  createVerificationAuditRecord,
  decideCredentialVerificationReview,
  evaluateAndTransitionExpiredCredential,
  isCredentialExpiredAt,
  recomputeAggregateVerificationState,
  startCredentialVerificationReview,
  submitCredentialForReview,
  validatePrivateDocumentEvidenceItem,
} from './workflowAndExpirationEngine';

export {
  buildPublicOrganizationVerificationSummary,
  buildPublicProfessionalVerificationSummary,
  getPublicVerificationBadgeLabelFa,
  readProtectedEvidenceForPrincipal,
} from './privacyAndPublicProjections';

export {
  defaultProfessionalVerificationService,
  InMemoryProfessionalVerificationRepository,
  ProfessionalVerificationService,
  type ProfessionalVerificationRepository,
} from './repositoryAndService';

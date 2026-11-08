export * from './types';
export * from './validationAndAuthz';
export * from './adapters';
export * from './store';
export * from './firestoreStore';
export * from './authorityAndApplicationService';
export * from './permitAndAmendmentService';
export * from './inspectionsFeesAndDeadlinesService';

import {
  createDefaultPropertyPermitsAdapters,
  PropertyPermitsExternalAdapters,
} from './adapters';
import { InMemoryPropertyPermitsStore, PropertyPermitsStore } from './store';
import { FirestorePropertyPermitsStore } from './firestoreStore';
import { AuthorityAndApplicationService } from './authorityAndApplicationService';
import { PermitAndAmendmentService } from './permitAndAmendmentService';
import { InspectionsFeesAndDeadlinesService } from './inspectionsFeesAndDeadlinesService';

export interface PropertyPermitsModuleOptions {
  store?: PropertyPermitsStore;
  useFirestore?: boolean;
  adapters?: Partial<PropertyPermitsExternalAdapters>;
}

export interface PropertyPermitsModuleFacade {
  readonly store: PropertyPermitsStore;
  readonly adapters: PropertyPermitsExternalAdapters;
  readonly authorityAndApplicationService: AuthorityAndApplicationService;
  readonly permitAndAmendmentService: PermitAndAmendmentService;
  readonly inspectionsFeesAndDeadlinesService: InspectionsFeesAndDeadlinesService;
  // Direct convenience methods matching all 21 required application/service operations:
  readonly registerAuthorityReference: AuthorityAndApplicationService['registerAuthorityReference'];
  readonly createPermitApplication: AuthorityAndApplicationService['createPermitApplication'];
  readonly retrievePermitApplication: AuthorityAndApplicationService['retrievePermitApplication'];
  readonly updateDraftApplication: AuthorityAndApplicationService['updateDraftApplication'];
  readonly recordApplicationSubmission: AuthorityAndApplicationService['recordApplicationSubmission'];
  readonly recordAuthorityAcknowledgment: AuthorityAndApplicationService['recordAuthorityAcknowledgment'];
  readonly recordAdditionalInformationRequest: AuthorityAndApplicationService['recordAdditionalInformationRequest'];
  readonly recordApplicantResponse: AuthorityAndApplicationService['recordApplicantResponse'];
  readonly recordOfficialDecision: AuthorityAndApplicationService['recordOfficialDecision'];
  readonly withdrawApplication: AuthorityAndApplicationService['withdrawApplication'];
  readonly registerIssuedPermit: PermitAndAmendmentService['registerIssuedPermit'];
  readonly retrievePermitRecord: PermitAndAmendmentService['retrievePermitRecord'];
  readonly evaluatePermitValidity: PermitAndAmendmentService['evaluatePermitValidity'];
  readonly registerPermitCondition: PermitAndAmendmentService['registerPermitCondition'];
  readonly recordConditionFulfillment: PermitAndAmendmentService['recordConditionFulfillment'];
  readonly submitAmendmentOrRenewalRequest: PermitAndAmendmentService['submitAmendmentOrRenewalRequest'];
  readonly recordAmendmentOrRenewalDecision: PermitAndAmendmentService['recordAmendmentOrRenewalDecision'];
  readonly recordSuspensionOrRevocation: PermitAndAmendmentService['recordSuspensionOrRevocation'];
  readonly registerOfficialInspection: InspectionsFeesAndDeadlinesService['registerOfficialInspection'];
  readonly recordInspectionOutcome: InspectionsFeesAndDeadlinesService['recordInspectionOutcome'];
  readonly registerFeeAssessment: InspectionsFeesAndDeadlinesService['registerFeeAssessment'];
  readonly recordFeePaymentReference: InspectionsFeesAndDeadlinesService['recordFeePaymentReference'];
  readonly registerDeadline: InspectionsFeesAndDeadlinesService['registerDeadline'];
  readonly retrieveUpcomingAndOverdueDeadlines: InspectionsFeesAndDeadlinesService['retrieveUpcomingAndOverdueDeadlines'];
  readonly retrievePropertyAndProjectPermitProfile: InspectionsFeesAndDeadlinesService['retrievePropertyAndProjectPermitProfile'];
}

export function createPropertyPermitsModuleFacade(
  options: PropertyPermitsModuleOptions = {}
): PropertyPermitsModuleFacade {
  const store: PropertyPermitsStore =
    options.store ??
    (options.useFirestore
      ? new FirestorePropertyPermitsStore()
      : new InMemoryPropertyPermitsStore());

  const adapters = createDefaultPropertyPermitsAdapters(options.adapters);
  const authorityAndApplicationService = new AuthorityAndApplicationService(store, adapters);
  const permitAndAmendmentService = new PermitAndAmendmentService(store);
  const inspectionsFeesAndDeadlinesService = new InspectionsFeesAndDeadlinesService(store, adapters);

  return {
    store,
    adapters,
    authorityAndApplicationService,
    permitAndAmendmentService,
    inspectionsFeesAndDeadlinesService,
    registerAuthorityReference: authorityAndApplicationService.registerAuthorityReference.bind(
      authorityAndApplicationService
    ),
    createPermitApplication: authorityAndApplicationService.createPermitApplication.bind(
      authorityAndApplicationService
    ),
    retrievePermitApplication: authorityAndApplicationService.retrievePermitApplication.bind(
      authorityAndApplicationService
    ),
    updateDraftApplication: authorityAndApplicationService.updateDraftApplication.bind(
      authorityAndApplicationService
    ),
    recordApplicationSubmission: authorityAndApplicationService.recordApplicationSubmission.bind(
      authorityAndApplicationService
    ),
    recordAuthorityAcknowledgment: authorityAndApplicationService.recordAuthorityAcknowledgment.bind(
      authorityAndApplicationService
    ),
    recordAdditionalInformationRequest:
      authorityAndApplicationService.recordAdditionalInformationRequest.bind(
        authorityAndApplicationService
      ),
    recordApplicantResponse: authorityAndApplicationService.recordApplicantResponse.bind(
      authorityAndApplicationService
    ),
    recordOfficialDecision: authorityAndApplicationService.recordOfficialDecision.bind(
      authorityAndApplicationService
    ),
    withdrawApplication: authorityAndApplicationService.withdrawApplication.bind(
      authorityAndApplicationService
    ),
    registerIssuedPermit: permitAndAmendmentService.registerIssuedPermit.bind(
      permitAndAmendmentService
    ),
    retrievePermitRecord: permitAndAmendmentService.retrievePermitRecord.bind(
      permitAndAmendmentService
    ),
    evaluatePermitValidity: permitAndAmendmentService.evaluatePermitValidity.bind(
      permitAndAmendmentService
    ),
    registerPermitCondition: permitAndAmendmentService.registerPermitCondition.bind(
      permitAndAmendmentService
    ),
    recordConditionFulfillment: permitAndAmendmentService.recordConditionFulfillment.bind(
      permitAndAmendmentService
    ),
    submitAmendmentOrRenewalRequest: permitAndAmendmentService.submitAmendmentOrRenewalRequest.bind(
      permitAndAmendmentService
    ),
    recordAmendmentOrRenewalDecision:
      permitAndAmendmentService.recordAmendmentOrRenewalDecision.bind(permitAndAmendmentService),
    recordSuspensionOrRevocation: permitAndAmendmentService.recordSuspensionOrRevocation.bind(
      permitAndAmendmentService
    ),
    registerOfficialInspection:
      inspectionsFeesAndDeadlinesService.registerOfficialInspection.bind(
        inspectionsFeesAndDeadlinesService
      ),
    recordInspectionOutcome: inspectionsFeesAndDeadlinesService.recordInspectionOutcome.bind(
      inspectionsFeesAndDeadlinesService
    ),
    registerFeeAssessment: inspectionsFeesAndDeadlinesService.registerFeeAssessment.bind(
      inspectionsFeesAndDeadlinesService
    ),
    recordFeePaymentReference: inspectionsFeesAndDeadlinesService.recordFeePaymentReference.bind(
      inspectionsFeesAndDeadlinesService
    ),
    registerDeadline: inspectionsFeesAndDeadlinesService.registerDeadline.bind(
      inspectionsFeesAndDeadlinesService
    ),
    retrieveUpcomingAndOverdueDeadlines:
      inspectionsFeesAndDeadlinesService.retrieveUpcomingAndOverdueDeadlines.bind(
        inspectionsFeesAndDeadlinesService
      ),
    retrievePropertyAndProjectPermitProfile:
      inspectionsFeesAndDeadlinesService.retrievePropertyAndProjectPermitProfile.bind(
        inspectionsFeesAndDeadlinesService
      ),
  };
}

import { SupportedCityId } from '../geography/types';

export type CanonicalPropertyAssetCategory =
  | 'LAND_PARCEL'
  | 'BUILDING'
  | 'INDEPENDENT_UNIT'
  | 'COMMERCIAL_PREMISES'
  | 'STORAGE_OR_PARKING_APPENDIX'
  | 'MIXED_COMPLEX';

export interface PropertyEntityReference {
  propertyId: string;
  assetCategory: CanonicalPropertyAssetCategory;
  cityId?: SupportedCityId;
  registrationPlatePelakSabti?: string;
}

export type LegalPartyType =
  | 'INDIVIDUAL'
  | 'LEGAL_ENTITY'
  | 'ORGANIZATION'
  | 'PUBLIC_AUTHORITY'
  | 'ESTATE_OR_TRUST';

export type IdentityConfidenceState =
  | 'UNVERIFIED_SELF_ASSERTION'
  | 'AUTHENTICATED_PLATFORM_USER'
  | 'KYC_DOCUMENT_MATCHED'
  | 'OFFICIAL_REGISTRY_CONFIRMED_PARTY';

export interface PartyReference {
  partyId: string;
  partyType: LegalPartyType;
  identityConfidence: IdentityConfidenceState;
  publicRoleLabel: string;
  confidentialFullName?: string;
  confidentialNationalOrRegistrationId?: string;
  organizationRegistryRef?: string;
}

export type EvidenceSourceReliability =
  | 'AUTHORITATIVE_OFFICIAL_REGISTRY'
  | 'NOTARIAL_INSTRUMENT_SANAD_RASMI'
  | 'JUDICIAL_FINAL_DECREE'
  | 'ORDINARY_CONTRACT_MABAYENAMEH'
  | 'UNVERIFIED_PARTY_ASSERTION_OR_UPLOAD';

export type InterestVerificationStatus =
  | 'CLAIMED'
  | 'DOCUMENTED'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'DISPUTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'RELEASED'
  | 'SUPERSEDED'
  | 'UNKNOWN';

export type LegalStatusClassification =
  | 'REPORTED_UNVERIFIED_CLAIM'
  | 'DOCUMENTED_UNVERIFIED_INTEREST'
  | 'INDEPENDENTLY_VERIFIED_INTEREST'
  | 'UNRESOLVED_OR_DISPUTED_LEGAL_STATUS'
  | 'HISTORICAL_TERMINATED_OR_SUPERSEDED';

export type OwnershipArrangementType =
  | 'FULL_OWNERSHIP_6_DANG'
  | 'JOINT_OWNERSHIP'
  | 'UNDIVIDED_CO_OWNERSHIP_MOSHA'
  | 'FRACTIONAL_DANG_OR_SAHM'
  | 'LEGAL_ENTITY_OWNERSHIP'
  | 'BARE_OWNERSHIP_AAN_WITHOUT_MANFAAT';

export type ShareCalculationBasis =
  | 'SIX_DANG_6'
  | 'NINETY_SIX_SHAIR_96'
  | 'BASIS_POINTS_10000'
  | 'EXACT_RATIONAL_FRACTION';

export type OwnershipShareState =
  | 'KNOWN_EXACT_SHARE'
  | 'UNKNOWN_SHARE'
  | 'ZERO_NO_OWNERSHIP';

export interface ExactOwnershipShare {
  shareState: OwnershipShareState;
  /** Integer numerator when shareState is KNOWN_EXACT_SHARE or ZERO_NO_OWNERSHIP */
  numerator: number | null;
  /** Positive integer denominator when shareState is KNOWN_EXACT_SHARE or ZERO_NO_OWNERSHIP */
  denominator: number | null;
  calculationBasis: ShareCalculationBasis;
  /** Human-readable Iranian Dang/Shair representation (e.g., "3/6 دانگ") when applicable */
  dangDisplayLabel?: string;
}

export interface MultiDimensionalStatusVector {
  identityConfidence: IdentityConfidenceState;
  sourceReliability: EvidenceSourceReliability;
  verificationStatus: InterestVerificationStatus;
  legalStatus: LegalStatusClassification;
}

export interface OwnershipInterestRecord {
  id: string;
  propertyRef: PropertyEntityReference;
  partyRef: PartyReference;
  interestType: OwnershipArrangementType;
  ownershipShare: ExactOwnershipShare;
  effectiveFromIso: string;
  recordedAtIso: string;
  sourceVerifiedAtIso?: string | null;
  expirationDateIso?: string | null;
  terminatedAtIso?: string | null;
  evidenceIds: string[];
  statusVector: MultiDimensionalStatusVector;
  jurisdictionCountryCode: 'IR';
  jurisdictionCityId?: SupportedCityId;
  restrictions: string[];
  previousInterestIds: string[];
  supersededByInterestIds: string[];
  activeDisputeIds: string[];
  recordedByActorId: string;
  verifiedByReviewerId?: string;
  internalReviewNotes?: string;
  version: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export type PublicOrRedactedOwnershipInterestView = Omit<
  OwnershipInterestRecord,
  'internalReviewNotes' | 'partyRef'
> & {
  partyRef: Omit<
    PartyReference,
    'confidentialFullName' | 'confidentialNationalOrRegistrationId'
  >;
};

export type NonOwnershipRightCategory =
  | 'USUFRUCT_HAQQ_ENTEFA'
  | 'RIGHT_OF_HABITATION_HAQQ_SOKNA'
  | 'LEASEHOLD_INTEREST'
  | 'EASEMENT_HAQQ_ERTFAQ'
  | 'RIGHT_OF_WAY_HAQQ_OBOOR'
  | 'SURFACE_OR_DEVELOPMENT_RIGHT'
  | 'USAGE_RIGHT'
  | 'COMMERCIAL_OCCUPANCY_HAQQ_KASB_O_PISHEH';

export interface PropertyRightRecord {
  id: string;
  propertyRef: PropertyEntityReference;
  beneficiaryParty: PartyReference;
  grantingParty?: PartyReference | null;
  rightCategory: NonOwnershipRightCategory;
  scopeDescription: string;
  physicalOrGeographicScope?: string;
  effectiveFromIso: string;
  recordedAtIso: string;
  sourceVerifiedAtIso?: string | null;
  expirationOrTerminationIso?: string | null;
  evidenceIds: string[];
  statusVector: MultiDimensionalStatusVector;
  restrictionsAndConditions: string[];
  establishesLegalOwnership: false;
  previousRightVersionId?: string | null;
  recordedByActorId: string;
  version: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export type TenureCategory =
  | 'RESIDENTIAL_LEASEHOLD_EJAREH'
  | 'COMMERCIAL_LEASEHOLD'
  | 'LONG_TERM_GROUND_TENURE_AGHD_MOJAREH'
  | 'CUSTODIAL_OCCUPANCY_AMANAT';

export interface TenureInterestRecord {
  id: string;
  propertyRef: PropertyEntityReference;
  tenantOrBeneficiaryParty: PartyReference;
  grantingParty: PartyReference;
  tenureCategory: TenureCategory;
  effectiveFromIso: string;
  effectiveToIso?: string | null;
  recordedAtIso: string;
  recordedRights: string[];
  restrictions: string[];
  externalContractReference?: string;
  evidenceIds: string[];
  statusVector: MultiDimensionalStatusVector;
  establishesLegalOwnership: false;
  operationalTenancyManagedExternally: true;
  recordedByActorId: string;
  version: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export type EncumbranceType =
  | 'MORTGAGE_RAHN'
  | 'PLEDGE_OR_SECURITY_INTEREST_VASIGHEH'
  | 'REGISTERED_LIEN'
  | 'LEGAL_RESTRICTION_REFERENCE'
  | 'JUDICIAL_ATTACHMENT_OR_SEIZURE_BAZDAST'
  | 'EASEMENT_BURDEN'
  | 'USE_RESTRICTION'
  | 'TRANSFER_RESTRICTION_MAN_E_MOAMELEH';

export type EncumbranceClassificationState =
  | 'REPORTED_ENCUMBRANCE'
  | 'DOCUMENTED_UNVERIFIED_ENCUMBRANCE'
  | 'VERIFIED_REGISTERED_ENCUMBRANCE'
  | 'DISPUTED_ENCUMBRANCE'
  | 'RELEASED_OR_EXPIRED_WITH_EVIDENCE'
  | 'UNKNOWN_ENCUMBRANCE_STATUS';

export interface EncumbranceReleaseHistoryEntry {
  releasedAtEffectiveIso: string;
  recordedAtIso: string;
  releaseReferenceNumber: string;
  releasingAuthorityName: string;
  releaseEvidenceIds: string[];
  recordedByActorId: string;
}

export interface PropertyEncumbranceRecord {
  id: string;
  propertyRef: PropertyEntityReference;
  beneficiaryOrAuthorityParty: PartyReference;
  affectedOwnershipInterestId?: string | null;
  encumbranceType: EncumbranceType;
  sourceAuthorityName: string;
  registrationReferenceNumber: string;
  effectiveFromIso: string;
  recordedAtIso: string;
  sourceVerifiedAtIso?: string | null;
  expirationOrReleaseIso?: string | null;
  classificationState: EncumbranceClassificationState;
  statusVector: MultiDimensionalStatusVector;
  evidenceIds: string[];
  releaseHistory: EncumbranceReleaseHistoryEntry[];
  recordedByActorId: string;
  version: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export type EvidenceCategory =
  | 'OFFICIAL_SINGLE_LEAF_DEED_SANAD_TAK_BARG'
  | 'PROPERTY_REGISTRATION_LEDGER_DAFTAR_AMLAK'
  | 'NOTARIAL_TRANSFER_DEED_SANAD_RASMI'
  | 'COURT_FINAL_JUDGMENT_DADNAMEH'
  | 'INHERITANCE_PROBATE_HASR_VARASAT'
  | 'OFFICIAL_SABT_ESTELAM_RESPONSE'
  | 'REGISTERED_CONTRACT_MABAYENAMEH_CODE_RAHGIRI'
  | 'POWER_OF_ATTORNEY_VEKALATNAMEH'
  | 'ENCUMBRANCE_RELEASE_LETTER_FAK_E_RAHN';

export interface OwnershipEvidenceRecord {
  id: string;
  propertyId: string;
  evidenceCategory: EvidenceCategory;
  issuingSourceAuthority: string;
  documentReferenceNumber: string;
  issueDateIso: string;
  effectiveDateIso: string;
  recordedAtIso: string;
  sourceReliability: EvidenceSourceReliability;
  verificationMethod:
    | 'UNVERIFIED_UPLOAD_OR_ASSERTION'
    | 'DOCUMENT_REVIEWER_INSPECTION'
    | 'NOTARIAL_VERIFICATION_CODE_CHECK'
    | 'OFFICIAL_REGISTRY_INQUIRY_CONFIRMED';
  verificationStatus: InterestVerificationStatus;
  verifiedByReviewerId?: string;
  verifiedAtIso?: string | null;
  mediaFileObjectId?: string | null;
  dueDiligenceAssessmentId?: string | null;
  provenance: {
    submittedByActorId: string;
    submittedAtIso: string;
    isSyntheticTestFixture?: boolean;
  };
  knownLimitations: string[];
  version: number;
}

export type PropertyHistoryEventCategory =
  | 'INITIAL_INTEREST_RECORDED'
  | 'ACQUISITION'
  | 'SALE_OR_FULL_TRANSFER'
  | 'PARTIAL_SHARE_TRANSFER'
  | 'SHARE_CONSOLIDATION'
  | 'INHERITANCE_TRANSMISSION'
  | 'GIFT_OR_DONATION_HEBEH'
  | 'OWNERSHIP_RECORD_CORRECTION'
  | 'RIGHT_CREATED'
  | 'RIGHT_AMENDED'
  | 'RIGHT_TERMINATED_OR_EXPIRED'
  | 'ENCUMBRANCE_REGISTERED'
  | 'ENCUMBRANCE_RELEASED'
  | 'COURT_ORDERED_CHANGE'
  | 'DISPUTE_OPENED'
  | 'DISPUTE_STATUS_UPDATED'
  | 'VERIFICATION_DECISION_RECORDED';

export interface PropertyRightsHistoryEventRecord {
  id: string;
  propertyId: string;
  affectedEntityType: 'OWNERSHIP_INTEREST' | 'PROPERTY_RIGHT' | 'TENURE_INTEREST' | 'ENCUMBRANCE' | 'DISPUTE';
  affectedEntityId: string;
  relatedEntityIds: string[];
  previousPartyIds: string[];
  newPartyIds: string[];
  eventCategory: PropertyHistoryEventCategory;
  effectiveDateIso: string;
  recordedAtIso: string;
  sourceVerifiedAtIso?: string | null;
  learnedAfterEffectiveDateDays: number;
  evidenceIds: string[];
  verificationStatusAtEvent: InterestVerificationStatus;
  authorizedActorId: string;
  actorRole: PropertyRightsActorRole;
  entityVersionAfterEvent: number;
  summary: string;
}

export type DisputeCategory =
  | 'COMPETING_OWNERSHIP_CLAIM'
  | 'CONFLICTING_SHARE_ALLOCATION'
  | 'CHALLENGED_TRANSFER_OR_POWER_OF_ATTORNEY'
  | 'DISPUTED_ENCUMBRANCE_OR_ATTACHMENT'
  | 'INHERITANCE_SHARE_CONFLICT';

export interface OwnershipDisputeRecord {
  id: string;
  propertyId: string;
  affectedInterestOrRightIds: string[];
  competingPartyIds: string[];
  disputeCategory: DisputeCategory;
  supportingEvidenceIds: string[];
  disputeStatus: 'OPEN_UNRESOLVED' | 'UNDER_LEGAL_REVIEW' | 'RESOLVED_BY_OFFICIAL_INSTRUMENT' | 'WITHDRAWN';
  relatedLegalCaseReference?: string;
  reviewHistory: Array<{
    reviewedAtIso: string;
    reviewerActorId: string;
    note: string;
    statusAfterReview: OwnershipDisputeRecord['disputeStatus'];
  }>;
  resolutionEvidenceId?: string;
  resolutionSummary?: string;
  adjudicatedByPlatform: false;
  createdAtIso: string;
  updatedAtIso: string;
  version: number;
}

export type PropertyRightsActorRole =
  | 'PUBLIC_CALLER'
  | 'AUTHENTICATED_PARTY'
  | 'AUTHORIZED_REGISTRAR'
  | 'RIGHTS_VERIFICATION_OFFICER'
  | 'REGISTRY_ADMIN';

export interface PropertyRightsActorContext {
  actorId: string;
  role: PropertyRightsActorRole;
  isAuthenticated: boolean;
  linkedPartyIds?: string[];
}

export interface CoOwnershipSummaryView {
  propertyId: string;
  evaluatedAsOfDateIso: string;
  activeInterestsCount: number;
  verifiedInterestsCount: number;
  disputedInterestsCount: number;
  hasUnknownShares: boolean;
  totalKnownActiveShare: {
    numerator: number;
    denominator: number;
    exceeds100Percent: boolean;
    equals100Percent: boolean;
  };
  coOwnerBreakdown: Array<{
    interestId: string;
    partyId: string;
    publicRoleLabel: string;
    share: ExactOwnershipShare;
    statusVector: MultiDimensionalStatusVector;
  }>;
  warnings: string[];
}

export interface PropertyOwnershipAndRightsProfile {
  profileGeneratedAtIso: string;
  evaluatedAsOfDateIso: string;
  propertyRef: PropertyEntityReference;
  coOwnershipSummary: CoOwnershipSummaryView;
  ownershipInterests: Array<OwnershipInterestRecord | PublicOrRedactedOwnershipInterestView>;
  nonOwnershipRights: PropertyRightRecord[];
  tenureInterests: TenureInterestRecord[];
  encumbrances: PropertyEncumbranceRecord[];
  encumbranceAssessment: {
    activeEncumbrancesCount: number;
    /**
     * Absence of recorded encumbrances NEVER proves a property is free of encumbrances.
     */
    encumbranceFreeEstablished: false;
    encumbranceStatusNote: string;
  };
  openDisputes: OwnershipDisputeRecord[];
  chainOfTitleIntegrity: {
    definitiveLegalChainEstablished: boolean;
    hasUnverifiedClaims: boolean;
    hasUnresolvedDisputes: boolean;
    hasShareSumMismatchOrUnknowns: boolean;
    integrityWarnings: string[];
  };
  disclaimer: string;
}

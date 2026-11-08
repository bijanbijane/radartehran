import { ProvinceId, SupportedCityId } from '../geography/types';

export type RegulatorySourceCategory =
  | 'NATIONAL_STATUTE'
  | 'CABINET_REGULATION'
  | 'MINISTERIAL_DIRECTIVE'
  | 'SUPREME_COUNCIL_URBAN_PLANNING'
  | 'MUNICIPAL_COUNCIL_BYLAW'
  | 'MUNICIPAL_DETAILED_PLAN_TARH_TAFSILI'
  | 'NATIONAL_BUILDING_CODE_MABHAS'
  | 'REGISTRATION_CIRCULAR_SABT'
  | 'TAX_DIRECTIVE_MALIYAT'
  | 'ENVIRONMENTAL_OR_SAFETY_STANDARD'
  | 'SECONDARY_LEGAL_COMMENTARY';

export type SourceReliabilityTier =
  | 'PRIMARY_OFFICIAL_STATUTE'
  | 'OFFICIAL_BYLAW_OR_DIRECTIVE'
  | 'SECONDARY_COMMENTARY'
  | 'UNVERIFIED_EXTERNAL_REFERENCE';

export type RegulatoryVerificationStatus =
  | 'VERIFIED'
  | 'PENDING_VERIFICATION'
  | 'UNVERIFIED'
  | 'SUPERSEDED'
  | 'REPEALED';

export type RegulatoryDocumentCategory =
  | 'LAND_USE_AND_ZONING'
  | 'CONSTRUCTION_AND_DENSITY'
  | 'BUILDING_CODE_SAFETY'
  | 'PROPERTY_OWNERSHIP_AND_TITLE'
  | 'RENTAL_AND_LEASE_REGULATION'
  | 'TRANSACTION_AND_TRANSFER_OBLIGATION'
  | 'TAX_AND_MUNICIPAL_LEVIES'
  | 'HERITAGE_AND_ENVIRONMENTAL_RESTRICTION';

export type ProvisionHierarchyLevel = 'CHAPTER' | 'ARTICLE' | 'CLAUSE' | 'SUBCLAUSE' | 'NOTE_TABSAREH';

export type ProvisionLifecycleStatus =
  | 'DRAFT_UNVERIFIED'
  | 'ACTIVE_IN_FORCE'
  | 'TEMPORARY_IN_FORCE'
  | 'AMENDED'
  | 'SUPERSEDED'
  | 'REPEALED';

export type JurisdictionLevel =
  | 'NATIONAL'
  | 'PROVINCIAL'
  | 'CITY'
  | 'MUNICIPALITY_REGION'
  | 'DISTRICT'
  | 'NEIGHBORHOOD'
  | 'DESIGNATED_ZONE';

export interface GeographicJurisdictionScope {
  level: JurisdictionLevel;
  countryCode: 'IR';
  provinceId?: ProvinceId;
  cityId?: SupportedCityId;
  municipalityCode?: string;
  districtNumber?: number;
  neighborhoodId?: string;
  designatedZoneCode?: string;
}

export interface RegulatorySourceProvenance {
  recordedByActorId: string;
  recordedAtIso: string;
  verifiedByReviewerId?: string;
  lastVerifiedAtIso?: string;
  verificationMethodNote?: string;
  isSyntheticTestFixture?: boolean;
}

export interface RegulatorySourceRecord {
  id: string;
  officialTitleFa: string;
  officialTitleEn?: string;
  issuingAuthority: string;
  jurisdictionScope: GeographicJurisdictionScope;
  sourceCategory: RegulatorySourceCategory;
  reliabilityTier: SourceReliabilityTier;
  verificationStatus: RegulatoryVerificationStatus;
  officialReferenceNumber: string;
  officialGazetteNumber?: string;
  publicationDateIso: string;
  effectiveFromIso: string;
  effectiveToIso?: string | null;
  repealedAtIso?: string | null;
  verifiedOriginalSourceUrl?: string | null;
  language: 'fa' | 'en' | 'bilingual';
  provenance: RegulatorySourceProvenance;
  internalReviewerNotes?: string;
  restrictedAuditMetadata?: Record<string, string>;
  version: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export type PublicRegulatorySourceView = Omit<
  RegulatorySourceRecord,
  'internalReviewerNotes' | 'restrictedAuditMetadata'
>;

export interface HumanVerifiedInterpretation {
  interpretationText: string;
  verifiedByLegalReviewerId: string;
  verifiedAtIso: string;
  scopeAndLimitationsNote: string;
  citations: string[];
}

export interface NonAuthoritativeAiSummaryRecord {
  id: string;
  targetEntityType: 'SOURCE' | 'DOCUMENT' | 'PROVISION' | 'PROPERTY_PROFILE';
  targetEntityId: string;
  targetEntityVersion: number;
  summaryText: string;
  suggestedCategoryTags: string[];
  modelIdentifier: string;
  promptTemplateVersion: string;
  generatedAtIso: string;
  generatedByActorId: string;
  isAuthoritative: false;
  requiresHumanReview: true;
  humanReviewStatus: 'UNREVIEWED' | 'REVIEWED_ACCEPTED_AS_SUMMARY' | 'REJECTED';
  reviewedByActorId?: string;
  reviewedAtIso?: string;
  disclaimer: string;
}

export interface RegulatoryDocumentRecord {
  id: string;
  sourceId: string;
  documentCode: string;
  titleFa: string;
  titleEn?: string;
  documentCategory: RegulatoryDocumentCategory;
  jurisdictionScope: GeographicJurisdictionScope;
  verificationStatus: RegulatoryVerificationStatus;
  effectiveFromIso: string;
  effectiveToIso?: string | null;
  repealedAtIso?: string | null;
  summaryVerified?: string;
  internalReviewerNotes?: string;
  version: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface RegulatoryProvisionVersionSnapshot {
  versionNumber: number;
  originalTextVerbatim: string;
  verifiedExcerptText?: string;
  plainLanguageSummary?: string;
  humanVerifiedInterpretation?: HumanVerifiedInterpretation;
  statusAtVersion: ProvisionLifecycleStatus;
  effectiveFromIso: string;
  effectiveToIso?: string | null;
  repealedAtIso?: string | null;
  changeRecordId?: string;
  recordedAtIso: string;
  recordedByActorId: string;
}

export interface RegulatoryProvisionRecord {
  id: string;
  documentId: string;
  sourceId: string;
  parentProvisionId?: string | null;
  hierarchyLevel: ProvisionHierarchyLevel;
  provisionNumber: string;
  citationLabel: string;
  titleFa: string;
  documentCategory: RegulatoryDocumentCategory;
  jurisdictionScope: GeographicJurisdictionScope;
  originalTextVerbatim: string;
  verifiedExcerptText?: string;
  plainLanguageSummary?: string;
  humanVerifiedInterpretation?: HumanVerifiedInterpretation;
  nonAuthoritativeAiSummary?: NonAuthoritativeAiSummaryRecord;
  lifecycleStatus: ProvisionLifecycleStatus;
   verificationStatus: RegulatoryVerificationStatus;
  effectiveFromIso: string;
  effectiveToIso?: string | null;
  repealedAtIso?: string | null;
  supersededByProvisionId?: string | null;
  amendsProvisionId?: string | null;
  versionHistory: RegulatoryProvisionVersionSnapshot[];
  internalReviewerNotes?: string;
  restrictedAuditMetadata?: Record<string, string>;
  version: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export type PublicRegulatoryProvisionView = Omit<
  RegulatoryProvisionRecord,
  'internalReviewerNotes' | 'restrictedAuditMetadata'
>;

export type RegulatoryChangeType =
  | 'NEW_ENACTMENT'
  | 'AMENDMENT'
  | 'REPEAL'
  | 'TEMPORARY_PROVISION'
  | 'EXTENSION_OF_EXPIRATION'
  | 'SUPERSESSION_REPLACEMENT'
  | 'CONFLICT_NOTICE'
  | 'EFFECTIVE_DATE_CORRECTION';

export interface RegulatoryChangeRecord {
  id: string;
  changeType: RegulatoryChangeType;
  targetProvisionId: string;
  enactingSourceId: string;
  enactingProvisionId?: string;
  previousProvisionVersion: number;
  newProvisionVersion: number;
  effectiveFromIso: string;
  effectiveToIso?: string | null;
  changeSummary: string;
  recordedByActorId: string;
  recordedAtIso: string;
}

export type ConflictSeverity = 'DIRECT_STATUTORY_CONFLICT' | 'OVERLAPPING_JURISDICTION_AMBIGUITY' | 'TEMPORAL_TRANSITION_OVERLAP';

export interface RegulatoryProvisionConflictRecord {
  id: string;
  provisionIdA: string;
  provisionIdB: string;
  conflictSeverity: ConflictSeverity;
  conflictDescription: string;
  resolutionGuidance?: string;
  higherAuthorityProvisionId?: string;
  status: 'OPEN_UNRESOLVED' | 'RESOLVED_BY_INTERPRETATION' | 'RESOLVED_BY_REPEAL';
  recordedByActorId: string;
  recordedAtIso: string;
  version: number;
}

export type PropertyCategoryType =
  | 'RESIDENTIAL_APARTMENT'
  | 'RESIDENTIAL_VILLA'
  | 'COMMERCIAL_RETAIL'
  | 'ADMINISTRATIVE_OFFICE'
  | 'MIXED_USE'
  | 'RAW_URBAN_LAND'
  | 'AGRICULTURAL_OR_GARDEN_BAQ'
  | 'INDUSTRIAL'
  | 'HERITAGE_REGISTERED';

export type LandUseCategoryType =
  | 'RESIDENTIAL_TARAKOM_KAM'
  | 'RESIDENTIAL_TARAKOM_MOTAVASET'
  | 'RESIDENTIAL_TARAKOM_ZIYAD'
  | 'COMMERCIAL_TEJARI'
  | 'ADMINISTRATIVE_EDARI'
  | 'MIXED_MOKHTALET'
  | 'GREEN_SPACE_OR_GARDEN'
  | 'URBAN_SERVICES_KHADAMATI'
  | 'INDUSTRIAL_SANATI'
  | 'HERITAGE_PROTECTED_BAFT_TARIKHI';

export type ConstructionStageType =
  | 'PRE_PERMIT_PLANNING'
  | 'EXCAVATION_AND_FOUNDATION'
  | 'STRUCTURAL_FRAME'
  | 'COMPLETED_WITH_PAYAN_KAR'
  | 'COMPLETED_WITHOUT_PAYAN_KAR'
  | 'RENOVATION_OR_RETROFIT';

export type TransactionContextType =
  | 'SALE_TRANSFER'
  | 'LONG_TERM_RESIDENTIAL_LEASE'
  | 'COMMERCIAL_LEASE_SARQORFLI'
  | 'CONSTRUCTION_PARTNERSHIP_MOSHAREKAT'
  | 'PRE_SALE_PISH_FOROOSH'
  | 'MORTGAGE_COLLATERAL_RAHN';

export type ApplicabilityOutcomeState =
  | 'CONFIRMED_APPLICABLE'
  | 'POTENTIALLY_APPLICABLE_NEEDS_INFO'
  | 'UNKNOWN_APPLICABILITY_MISSING_DATA'
  | 'NOT_APPLICABLE_VERIFIED_EXCLUSION';

export interface ApplicabilityRuleCondition {
  requiredPropertyCategories?: PropertyCategoryType[];
  excludedPropertyCategories?: PropertyCategoryType[];
  requiredLandUseCategories?: LandUseCategoryType[];
  requiredConstructionStages?: ConstructionStageType[];
  requiredTransactionContexts?: TransactionContextType[];
  minFloors?: number;
  maxFloors?: number;
  minPlotAreaSqm?: number;
  maxPlotAreaSqm?: number;
  minBuildingAgeYears?: number;
  requiresWornOutTextureBaftFarsoodeh?: boolean;
  requiresFaultLineProximity?: boolean;
  requiredContextFields: Array<
    | 'propertyCategory'
    | 'landUseCategory'
    | 'constructionStage'
    | 'transactionContext'
    | 'floorsCount'
    | 'plotAreaSqm'
    | 'buildingAgeYears'
    | 'isWornOutTextureBaftFarsoodeh'
    | 'isNearActiveFaultLine'
  >;
}

export interface RegulatoryApplicabilityRuleRecord {
  id: string;
  provisionId: string;
  sourceId: string;
  ruleName: string;
  jurisdictionScope: GeographicJurisdictionScope;
  conditions: ApplicabilityRuleCondition;
  restrictionOrObligationSummary: string;
  mandatoryClassification: 'MANDATORY_STATUTORY' | 'CONDITIONAL_ON_PERMIT' | 'ADVISORY_GUIDELINE';
  effectiveFromIso: string;
  effectiveToIso?: string | null;
  verificationStatus: RegulatoryVerificationStatus;
  version: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface PropertyRegulatoryEvaluationInput {
  propertyId?: string;
  asOfDateIso?: string;
  countryCode?: 'IR';
  provinceId?: ProvinceId;
  cityId?: SupportedCityId;
  municipalityCode?: string;
  districtNumber?: number;
  neighborhoodId?: string;
  designatedZoneCode?: string;
  propertyCategory?: PropertyCategoryType;
  landUseCategory?: LandUseCategoryType;
  constructionStage?: ConstructionStageType;
  transactionContext?: TransactionContextType;
  floorsCount?: number;
  plotAreaSqm?: number;
  buildingAgeYears?: number;
  isWornOutTextureBaftFarsoodeh?: boolean;
  isNearActiveFaultLine?: boolean;
}

export interface ApplicabilityRuleEvaluationResult {
  ruleId: string;
  provisionId: string;
  sourceId: string;
  citationLabel: string;
  documentCategory: RegulatoryDocumentCategory;
  outcomeState: ApplicabilityOutcomeState;
  mandatoryClassification: 'MANDATORY_STATUTORY' | 'CONDITIONAL_ON_PERMIT' | 'ADVISORY_GUIDELINE';
  restrictionOrObligationSummary: string;
  matchedReasons: string[];
  missingRequiredFields: string[];
  exclusionReasons: string[];
  sourceVerificationStatus: RegulatoryVerificationStatus;
  sourceReliabilityTier: SourceReliabilityTier;
}

export interface ComplianceRequirementRecord {
  id: string;
  requirementCode: string;
  sourceId: string;
  provisionId: string;
  jurisdictionScope: GeographicJurisdictionScope;
  applicablePropertyCategories: PropertyCategoryType[];
  applicableTransactionContexts: TransactionContextType[];
  titleFa: string;
  requirementDescription: string;
  mandatoryClassification: 'MANDATORY_STATUTORY' | 'CONDITIONAL_TRIGGERED';
  conditionTriggerDescription?: string;
  requiredEvidenceTypes: string[];
  verificationMethodDescription: string;
  responsibleAuthorityName: string;
  effectiveFromIso: string;
  effectiveToIso?: string | null;
  status: 'ACTIVE' | 'SUPERSEDED' | 'REPEALED';
  verificationStatus: RegulatoryVerificationStatus;
  provenance: RegulatorySourceProvenance;
  internalReviewerNotes?: string;
  version: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export type PublicComplianceRequirementView = Omit<ComplianceRequirementRecord, 'internalReviewerNotes'>;

export interface PropertyComplianceRequirementStatusView {
  requirement: PublicComplianceRequirementView;
  applicabilityState: ApplicabilityOutcomeState;
  /**
   * Explicitly separates the existence of a legal requirement from proof that a
   * property satisfies it. A requirement definition NEVER establishes compliance on its own.
   */
  complianceEstablished: false;
  complianceDisclaimer: string;
  requiredOfficialEvidenceTypes: string[];
}

export interface PropertyRegulatoryProfile {
  profileGeneratedAtIso: string;
  evaluatedAsOfDateIso: string;
  propertyId?: string;
  resolvedGeography: {
    countryCode: 'IR';
    provinceId?: ProvinceId;
    cityId?: SupportedCityId;
    districtNumber?: number;
    neighborhoodId?: string;
    neighborhoodNameFa?: string;
    geographyVerified: boolean;
    geographyWarnings: string[];
  };
  landUseRestrictions: ApplicabilityRuleEvaluationResult[];
  constructionAndDevelopmentRules: ApplicabilityRuleEvaluationResult[];
  buildingUseAndSafetyRules: ApplicabilityRuleEvaluationResult[];
  transactionAndOwnershipObligations: ApplicabilityRuleEvaluationResult[];
  applicableComplianceRequirements: PropertyComplianceRequirementStatusView[];
  detectedRegulatoryConflicts: RegulatoryProvisionConflictRecord[];
  incompleteOrMissingDataWarnings: string[];
  unverifiedSourceWarnings: string[];
  nonAuthoritativeDisclaimer: string;
}

export type LegalRegulatoryActorRole =
  | 'PUBLIC_READER'
  | 'AUTHENTICATED_USER'
  | 'LEGAL_REVIEWER'
  | 'REGULATORY_ADMIN';

export interface LegalRegulatoryActorContext {
  actorId: string;
  role: LegalRegulatoryActorRole;
  isAuthenticated: boolean;
}

export interface LegalRegulatoryAuditRecord {
  id: string;
  action: string;
  targetEntityType: 'SOURCE' | 'DOCUMENT' | 'PROVISION' | 'RULE' | 'CHANGE' | 'CONFLICT' | 'COMPLIANCE_REQ' | 'AI_SUMMARY';
  targetEntityId: string;
  actorId: string;
  actorRole: LegalRegulatoryActorRole;
  occurredAtIso: string;
  summary: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  limit: number;
  totalMatched: number;
}

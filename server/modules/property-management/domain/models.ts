import type { NormalizedTimestamp } from '../../core';
import type {
  AuthoritativePaymentEventStatus,
  CanonicalPropertyCategory,
  OperationalMediaVisibility,
} from '../contracts/externalAdapters';

export type PortfolioType =
  | 'INDIVIDUAL_LANDLORD'
  | 'PROPERTY_MANAGEMENT_COMPANY'
  | 'RESIDENTIAL_PORTFOLIO'
  | 'COMMERCIAL_PORTFOLIO'
  | 'MULTI_UNIT_BUILDING'
  | 'MIXED_USE_PORTFOLIO';

export type PortfolioOperatingStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export interface PortfolioPropertyRef {
  propertyRefId: string;
  buildingRefId?: string;
  unitRefId?: string;
  category: CanonicalPropertyCategory;
  addedByUid: string;
  addedAt: NormalizedTimestamp;
  arrangementNote?: string;
}

export interface PortfolioMembershipHistoryEntry {
  propertyRefId: string;
  buildingRefId?: string;
  unitRefId?: string;
  action: 'ADDED' | 'REMOVED';
  actorUid: string;
  occurredAt: NormalizedTimestamp;
  reason?: string;
}

export interface ManagedPortfolioRecord {
  id: string;
  name: string;
  portfolioType: PortfolioType;
  ownerUid: string;
  managementOrganizationId?: string;
  authorizedManagerUids: string[];
  propertyRefs: PortfolioPropertyRef[];
  membershipHistory: PortfolioMembershipHistoryEntry[];
  operatingStatus: PortfolioOperatingStatus;
  revision: number;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export type ManagementAuthorityScope =
  | 'FULL_PROPERTY_MANAGEMENT'
  | 'TENANT_COMMUNICATION'
  | 'MAINTENANCE_COORDINATION'
  | 'RENT_SCHEDULE_ADMINISTRATION'
  | 'INSPECTION_COORDINATION'
  | 'LEASE_ADMINISTRATION'
  | 'LIMITED_OPERATIONAL_ACCESS';

export const ALL_MANAGEMENT_AUTHORITY_SCOPES: readonly ManagementAuthorityScope[] = [
  'FULL_PROPERTY_MANAGEMENT',
  'TENANT_COMMUNICATION',
  'MAINTENANCE_COORDINATION',
  'RENT_SCHEDULE_ADMINISTRATION',
  'INSPECTION_COORDINATION',
  'LEASE_ADMINISTRATION',
  'LIMITED_OPERATIONAL_ACCESS',
] as const;

export type ManagementAuthorizationState =
  | 'PENDING'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'REVOKED';

export interface AuthorizationHistoryEntry {
  fromState: ManagementAuthorizationState | 'NONE';
  toState: ManagementAuthorizationState;
  actorUid: string;
  occurredAt: NormalizedTimestamp;
  reason?: string;
}

export interface ManagementAuthorizationRecord {
  id: string;
  portfolioId?: string;
  propertyRefId?: string;
  buildingRefId?: string;
  unitRefId?: string;
  authorizingOwnerUid: string;
  authorizedManagerUid: string;
  authorizedOrganizationId?: string;
  scopes: ManagementAuthorityScope[];
  startDateIso: string;
  expirationDateIso: string;
  supportingEvidenceMediaIds: string[];
  confirmationStatus: 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'REJECTED';
  revocationStatus: 'NOT_REVOKED' | 'REVOKED';
  state: ManagementAuthorizationState;
  revokedAt?: NormalizedTimestamp;
  revokedByUid?: string;
  revocationReason?: string;
  history: AuthorizationHistoryEntry[];
  revision: number;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export type OccupancyLifecycleState =
  | 'PENDING'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'TEMPORARILY_SUSPENDED'
  | 'ENDED'
  | 'CANCELLED'
  | 'DISPUTED';

export interface OccupancyTransitionEntry {
  fromState: OccupancyLifecycleState | 'NONE';
  toState: OccupancyLifecycleState;
  actorUid: string;
  occurredAt: NormalizedTimestamp;
  note?: string;
}

export interface OccupancyRecord {
  id: string;
  propertyRefId: string;
  buildingRefId?: string;
  unitRefId?: string;
  portfolioId?: string;
  tenantUid: string;
  authorizedCoOccupantUids: string[];
  rentalAgreementId: string;
  occupancyStartDateIso: string;
  expectedEndDateIso: string;
  actualEndDateIso?: string;
  status: OccupancyLifecycleState;
  moveInHandoverId?: string;
  moveOutHandoverId?: string;
  disputeInvestigationRefId?: string;
  history: OccupancyTransitionEntry[];
  revision: number;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export type RentalAgreementType =
  | 'RESIDENTIAL_LEASE'
  | 'COMMERCIAL_LEASE'
  | 'OFFICE_LEASE'
  | 'MULTI_UNIT_RESIDENTIAL_LEASE';

export type RentalAgreementState =
  | 'DRAFT'
  | 'AWAITING_PARTIES'
  | 'AWAITING_DOCUMENT'
  | 'PENDING_COMMENCEMENT'
  | 'ACTIVE'
  | 'RENEWAL_PENDING'
  | 'EXPIRED'
  | 'TERMINATION_PENDING'
  | 'TERMINATED'
  | 'DISPUTED';

export type PaymentFrequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'ONE_TIME';

export type AgreementDocumentVerificationDistinction =
  | 'METADATA_ONLY_NO_DOCUMENT'
  | 'UPLOADED_DOCUMENT_NOT_LEGALLY_AUTHENTICATED'
  | 'EXTERNAL_OFFICIAL_CONTRACT_REFERENCE_LINKED';

export interface RentalAgreementVersionSnapshot {
  versionNumber: number;
  depositAmount: number;
  monthlyRentAmount: number;
  currency: 'IRT' | 'TOMAN' | 'IRR';
  paymentFrequency: PaymentFrequency;
  startDateIso: string;
  endDateIso: string;
  renewalConditionsMetadata: string;
  terminationConditionsMetadata: string;
  documentMediaIds: string[];
  externalContractReferenceCode?: string;
  amendedByUid: string;
  amendmentReason: string;
  createdAt: NormalizedTimestamp;
}

export interface RentalAgreementRecord {
  id: string;
  propertyRefId: string;
  buildingRefId?: string;
  unitRefId?: string;
  portfolioId?: string;
  tenantUid: string;
  maxAuthorizedOccupants: number;
  landlordUid: string;
  authorizedRepresentativeUids: string[];
  relatedDealRefId?: string;
  agreementType: RentalAgreementType;
  startDateIso: string;
  endDateIso: string;
  originalDepositAmount: number;
  originalMonthlyRentAmount: number;
  depositAmount: number;
  monthlyRentAmount: number;
  currency: 'IRT' | 'TOMAN' | 'IRR';
  paymentFrequency: PaymentFrequency;
  renewalConditionsMetadata: string;
  terminationConditionsMetadata: string;
  documentMediaIds: string[];
  externalContractReferenceCode?: string;
  documentVerificationDistinction: AgreementDocumentVerificationDistinction;
  legalValidityDisclaimer: string;
  status: RentalAgreementState;
  currentVersion: number;
  versionHistory: RentalAgreementVersionSnapshot[];
  tenantAcceptedAt?: NormalizedTimestamp;
  landlordAcceptedAt?: NormalizedTimestamp;
  revision: number;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export type ObligationType =
  | 'MONTHLY_RENT'
  | 'SECURITY_DEPOSIT'
  | 'ADDITIONAL_AGREED_CHARGE'
  | 'REFUND_OBLIGATION'
  | 'OTHER_DEFINED_OBLIGATION';

export type ObligationStatus =
  | 'SCHEDULED'
  | 'DUE'
  | 'REPORTED_AS_PAID'
  | 'PAYMENT_CONFIRMED'
  | 'PARTIALLY_SETTLED'
  | 'OVERDUE'
  | 'WAIVED'
  | 'CANCELLED'
  | 'DISPUTED';

export interface ObligationPaymentReconciliationEntry {
  reconciliationId: string;
  source: 'TENANT_SELF_REPORT' | 'AUTHORITATIVE_PAYMENT_PROVIDER';
  externalPaymentRefId?: string;
  providerId?: string;
  amount: number;
  paymentEventStatus: AuthoritativePaymentEventStatus;
  actorUid: string;
  recordedAt: NormalizedTimestamp;
  note?: string;
}

export interface ObligationAmendmentEntry {
  previousAmount: number;
  newAmount: number;
  previousDueDateIso: string;
  newDueDateIso: string;
  amendedByUid: string;
  reason: string;
  amendedAt: NormalizedTimestamp;
}

export interface FinancialObligationScheduleRecord {
  id: string;
  agreementId: string;
  agreementVersion: number;
  propertyRefId: string;
  tenantUid: string;
  landlordUid: string;
  obligationType: ObligationType;
  originalDueDateIso: string;
  dueDateIso: string;
  originalAmount: number;
  currentAmount: number;
  confirmedSettledAmount: number;
  tenantSelfReportedAmount: number;
  currency: 'IRT' | 'TOMAN' | 'IRR';
  paymentPeriodKey: string;
  coveredPeriodStartIso: string;
  coveredPeriodEndIso: string;
  gracePeriodDays: number;
  status: ObligationStatus;
  paymentState: AuthoritativePaymentEventStatus | 'UNPAID';
  authoritativeExternalPaymentRefs: string[];
  reconciliationHistory: ObligationPaymentReconciliationEntry[];
  amendmentHistory: ObligationAmendmentEntry[];
  revision: number;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

import type {
  AuditEventSink,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  NormalizedTimestamp,
  TransactionRunnerAdapter,
} from '../../core';

export type DueDiligenceSourceType =
  | 'PROPERTY_REGISTRY_RECORD'
  | 'OFFICIAL_REGISTRY_RESPONSE'
  | 'MUNICIPAL_RECORD'
  | 'LICENSED_INSPECTOR_REPORT'
  | 'PROPERTY_MANAGEMENT_RECORD'
  | 'LEGAL_REGULATORY_RECORD'
  | 'TRUST_AND_SAFETY_SIGNAL'
  | 'USER_UPLOADED_DOCUMENT'
  | 'AI_OCR_EXTRACTION_UNTRUSTED';

export type ConfidenceClassification =
  | 'AUTHORITATIVE_OFFICIAL'
  | 'INDEPENDENT_PROFESSIONAL'
  | 'CORROBORATED_MULTI_SOURCE'
  | 'SINGLE_SOURCE_UNVERIFIED'
  | 'UNTRUSTED_EXTRACTION';

/**
 * 1. Property Registry & Multi-Source Property Attribute Read Adapter (Section 3A, 3E, 4)
 */
export interface SourcePropertyAttributesSnapshot {
  sourceId: string;
  sourceType: DueDiligenceSourceType;
  sourceName: string;
  observedAtIso: string;
  canonicalPropertyId: string;
  addressText?: string | null;
  cityId?: string | null;
  districtId?: string | null;
  neighborhoodId?: string | null;
  propertyType?: string | null;
  landAreaSqm?: number | null;
  buildingAreaSqm?: number | null;
  floorNumber?: number | null;
  unitNumber?: string | null;
  constructionYear?: number | null;
  buildingUsage?: string | null;
  claimedOwnerRef?: string | null;
  registrationPlateRef?: string | null;
  occupancyStatus?: string | null;
}

export interface DueDiligencePropertyRegistryReadAdapter {
  getCanonicalPropertyExists(canonicalPropertyId: string): Promise<boolean>;
  listMultiSourcePropertySnapshots(
    canonicalPropertyId: string,
  ): Promise<SourcePropertyAttributesSnapshot[]>;
}

/**
 * 2. Media Module Evidence File Reference Read Adapter (Section 3B, 4)
 * Never stores binary files inside property-due-diligence.
 */
export interface MediaDocumentReferenceMetadata {
  mediaId: string;
  uploaderUid: string;
  mimeType: string;
  byteSize: number;
  sha256Checksum: string;
  uploadedAtIso: string;
  accessScope: 'PRIVATE_CASE_EVIDENCE' | 'RESTRICTED_REVIEWER';
}

export interface DueDiligenceMediaReadAdapter {
  verifyMediaDocumentReference(mediaId: string): Promise<MediaDocumentReferenceMetadata | null>;
}

/**
 * 3. Property Management & Inspection Read Adapter (Section 3F, 3G, 4)
 */
export interface PhysicalInspectionRecordSummary {
  inspectionRefId: string;
  canonicalPropertyId: string;
  domain:
    | 'STRUCTURAL'
    | 'ELECTRICAL'
    | 'PLUMBING'
    | 'HVAC'
    | 'MOISTURE_WATER_DAMAGE'
    | 'ROOF_AND_FACADE'
    | 'FIRE_SAFETY'
    | 'ACCESSIBILITY';
  inspectorCredentialRef: string | null;
  inspectedAtIso: string;
  hasIdentifiedConcern: boolean;
  summaryNotes: string;
  limitations: string[];
}

export interface DueDiligenceInspectionAndManagementReadAdapter {
  listInspectionSummaries(canonicalPropertyId: string): Promise<PhysicalInspectionRecordSummary[]>;
}

/**
 * 4. Trust & Safety and Regulatory Read Adapter (Section 4)
 */
export interface TrustAndSafetyPropertySignal {
  signalId: string;
  canonicalPropertyId: string;
  category: 'DUPLICATE_DOCUMENT_HASH' | 'DISPUTED_OWNERSHIP_CLAIM' | 'REGULATORY_RESTRICTION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  verifiedByReviewer: boolean;
  recordedAtIso: string;
  summary: string;
}

export interface DueDiligenceTrustAndSafetyReadAdapter {
  listSignalsForProperty(canonicalPropertyId: string): Promise<TrustAndSafetyPropertySignal[]>;
}

export interface PropertyDueDiligenceModuleDependencies {
  txRunner: TransactionRunnerAdapter;
  adminStore?: DelegatedAdminStoreAdapter | null;
  tokenVerifier?: FirebaseTokenVerifierAdapter | null;
  idempotencyStore?: IdempotencyStoreAdapter;
  auditSink?: AuditEventSink;
  primaryAdminEmails?: string[];
  authorizedReviewerUids?: string[];
  nowFn?: () => number;
  propertyRegistry: DueDiligencePropertyRegistryReadAdapter;
  media: DueDiligenceMediaReadAdapter;
  inspectionsAndManagement?: DueDiligenceInspectionAndManagementReadAdapter;
  trustAndSafety?: DueDiligenceTrustAndSafetyReadAdapter;
}

export type { NormalizedTimestamp };

/**
 * @file server/modules/property-due-diligence/adapters.ts
 * @description Module-Local Integration Adapters for Authoritative Upstream Modules & Optional AI Review Boundary.
 */

import type {
  DueDiligenceDomainEvent,
  DocumentCategory,
  FindingSeverity,
} from './types';

export interface PropertyRegistryReferenceAdapter {
  verifyPropertyReference(propertyReference: string): Promise<{
    exists: boolean;
    cityId?: string;
    neighborhoodId?: number;
    propertyType?: string;
  }>;
}

export interface MediaEvidenceReferenceAdapter {
  verifyMediaReference(mediaReferenceId: string): Promise<{
    exists: boolean;
    mimeType?: string;
    sizeBytes?: number;
    ownerUid?: string;
  }>;
}

export interface GeographyAndEnvironmentalReferenceAdapter {
  validateGeographicContext(cityId: string, neighborhoodId?: number): Promise<{
    isValidCity: boolean;
    isValidNeighborhood: boolean;
    datasetSourceName?: string;
    datasetPublishedAtIso?: string;
  }>;
}

export interface ServiceProvidersQualificationAdapter {
  verifyProviderQualification(providerRef: string, reviewerUid: string): Promise<{
    exists: boolean;
    licenseVerifiedByRegistry: boolean;
    activeCategories: string[];
    credentialSummary?: string;
  }>;
}

export interface AppointmentsReferenceAdapter {
  verifyAppointmentReference(appointmentId: string): Promise<{
    exists: boolean;
    status: 'scheduled' | 'completed' | 'cancelled' | 'unavailable';
    completedAtIso?: string;
  }>;
}

export interface DueDiligenceEventSink {
  publishEvent(event: DueDiligenceDomainEvent): Promise<void>;
}

/**
 * Optional AI-Assisted Review Boundary (Section 23):
 * - Strictly optional, never assumed configured.
 * - All outputs treated as untrusted candidate suggestions requiring human confirmation.
 * - Never performs automatic document approval, legal verification, or engineering certification.
 */
export interface OptionalAiReviewAssistantAdapter {
  isConfigured(): boolean;
  suggestDocumentClassification(input: {
    documentDescription: string;
    visibleIdentifier?: string;
    privacyApprovedForExternalModel: boolean;
  }): Promise<{
    suggestedCategory?: DocumentCategory;
    modelIdentifier: string;
    promptVersion: string;
    requiresHumanConfirmation: true;
  } | null>;
  summarizeHumanFindingsForDraft(input: {
    findingTitles: string[];
  }): Promise<{
    candidateSummaryText: string;
    modelIdentifier: string;
    promptVersion: string;
    authoredByModelSuggestion: true;
    requiresHumanConfirmation: true;
  } | null>;
}

export interface DueDiligenceAccountLifecycleAdapter {
  exportUserData(userUid: string): Promise<{
    requestedAssessments: unknown[];
    submittedEvidenceRefs: unknown[];
    authoredFindings: unknown[];
  }>;
  handleAccountDeletion(userUid: string, reason: string): Promise<{
    anonymizedAssessmentsCount: number;
    redactedEvidenceSubmissionsCount: number;
  }>;
}

export class DefaultPropertyRegistryReferenceAdapter implements PropertyRegistryReferenceAdapter {
  async verifyPropertyReference(propertyReference: string) {
    return {
      exists: Boolean(propertyReference && propertyReference.trim().length >= 3 && !propertyReference.includes('invalid')),
      cityId: 'tehran',
      neighborhoodId: 1,
      propertyType: 'residential_apartment',
    };
  }
}

export class DefaultMediaEvidenceReferenceAdapter implements MediaEvidenceReferenceAdapter {
  async verifyMediaReference(mediaReferenceId: string) {
    return {
      exists: Boolean(mediaReferenceId && mediaReferenceId.trim().length >= 3 && !mediaReferenceId.includes('missing_media')),
      mimeType: 'image/jpeg',
      sizeBytes: 204_800,
    };
  }
}

export class DefaultGeographyAndEnvironmentalReferenceAdapter implements GeographyAndEnvironmentalReferenceAdapter {
  private readonly supportedCities = new Set(['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz']);
  async validateGeographicContext(cityId: string, neighborhoodId?: number) {
    const isValidCity = this.supportedCities.has(cityId.toLowerCase());
    const isValidNeighborhood = typeof neighborhoodId === 'number' ? neighborhoodId > 0 : true;
    return {
      isValidCity,
      isValidNeighborhood,
      datasetSourceName: 'Canonical Geography Catalog v2026',
      datasetPublishedAtIso: '2026-01-15T00:00:00.000Z',
    };
  }
}

export class DefaultServiceProvidersQualificationAdapter implements ServiceProvidersQualificationAdapter {
  async verifyProviderQualification(providerRef: string, _reviewerUid: string) {
    const isVerified = providerRef.startsWith('verified_prov_');
    return {
      exists: Boolean(providerRef),
      licenseVerifiedByRegistry: isVerified,
      activeCategories: isVerified ? ['structural_inspection', 'electrical_inspection', 'technical_inspection'] : [],
      credentialSummary: isVerified ? 'Verified Registry Reference' : 'Unverified / Self-Declared Only',
    };
  }
}

export class DefaultAppointmentsReferenceAdapter implements AppointmentsReferenceAdapter {
  async verifyAppointmentReference(appointmentId: string) {
    if (appointmentId.startsWith('completed_appt_')) {
      return {
        exists: true,
        status: 'completed' as const,
        completedAtIso: new Date().toISOString(),
      };
    }
    return {
      exists: Boolean(appointmentId),
      status: 'scheduled' as const,
    };
  }
}

export class BufferedDueDiligenceEventSink implements DueDiligenceEventSink {
  private readonly seenIds = new Set<string>();
  public readonly events: DueDiligenceDomainEvent[] = [];

  async publishEvent(event: DueDiligenceDomainEvent): Promise<void> {
    const dedupeKey = event.idempotencyKey || event.eventId;
    if (this.seenIds.has(dedupeKey)) return;
    this.seenIds.add(dedupeKey);
    this.events.push(event);
  }
}

export class UnconfiguredAiReviewAssistantAdapter implements OptionalAiReviewAssistantAdapter {
  isConfigured(): boolean {
    return false;
  }
  async suggestDocumentClassification(): Promise<null> {
    return null;
  }
  async summarizeHumanFindingsForDraft(): Promise<null> {
    return null;
  }
}

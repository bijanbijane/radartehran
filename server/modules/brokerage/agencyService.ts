/**
 * @file server/modules/brokerage/agencyService.ts
 * @description Service for Managing Agency Organizations, Branches, Operating Status, and Professional Credentials.
 */

import type {
  AgencyRecord,
  BranchRecord,
  ProfessionalCredentialRecord,
  AgencyOrganizationType,
  AgencyOperatingStatus,
  BusinessContactInfo,
  GeographicReference,
  RegistrationInfoReference,
  VerificationState,
} from './types';
import type { BrokerageStore } from './store';
import type {
  GeographyReferenceAdapter,
  BrokerageNotificationEventSink,
} from './adapters';
import {
  authorizeAgencyAction,
  type AuthorizationContext,
} from './authorization';
import {
  validateSafeId,
  validateEmail,
  validatePhone,
  validateOrgType,
  sanitizeText,
  BrokerageValidationError,
} from './validation';

export interface CreateAgencyInput {
  legalBusinessName?: string;
  publicDisplayName: string;
  description: string;
  organizationType: AgencyOrganizationType;
  businessContact: BusinessContactInfo;
  mainGeographicReference: GeographicReference;
  registrationReference?: RegistrationInfoReference;
}

export interface CreateBranchInput {
  agencyId: string;
  branchName: string;
  contact: BusinessContactInfo;
  geographicReference: GeographicReference;
  operatingHours?: string;
  branchManagerUid: string;
}

export class AgencyService {
  constructor(
    private readonly store: BrokerageStore,
    private readonly geoAdapter: GeographyReferenceAdapter,
    private readonly notificationSink: BrokerageNotificationEventSink,
  ) {}

  async createAgency(
    actorUid: string,
    input: CreateAgencyInput,
  ): Promise<{ agency: AgencyRecord }> {
    if (!actorUid) throw new BrokerageValidationError('AUTH_REQUIRED', 'Actor UID required.');
    const displayName = sanitizeText(input.publicDisplayName, 120);
    if (!displayName || displayName.length < 3) {
      throw new BrokerageValidationError('INVALID_NAME', 'Public display name must be at least 3 characters.');
    }

    const orgType = validateOrgType(input.organizationType);
    const email = validateEmail(input.businessContact?.email, 'businessContact.email');
    const phone = validatePhone(input.businessContact?.phone, 'businessContact.phone');

    // Geography validation
    const geo = input.mainGeographicReference;
    const geoCheck = await this.geoAdapter.validateGeographicArea(geo.cityId, geo.neighborhoodId);
    if (!geoCheck.isValidCity) {
      throw new BrokerageValidationError('INVALID_GEOGRAPHY', `Unknown or unsupported city ID '${geo.cityId}'.`);
    }

    const agencyId = `agency_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();

    const agency: AgencyRecord = {
      id: agencyId,
      legalBusinessName: input.legalBusinessName ? sanitizeText(input.legalBusinessName, 150) : undefined,
      publicDisplayName: displayName,
      description: sanitizeText(input.description, 1000),
      organizationType: orgType,
      businessContact: {
        phone,
        email,
        website: input.businessContact?.website ? sanitizeText(input.businessContact.website, 150) : undefined,
        supportPhone: input.businessContact?.supportPhone ? validatePhone(input.businessContact.supportPhone, 'supportPhone') : undefined,
      },
      publicContactPhone: phone,
      publicContactEmail: email,
      mainGeographicReference: {
        cityId: geo.cityId,
        province: geo.province ? sanitizeText(geo.province, 50) : undefined,
        neighborhoodId: geo.neighborhoodId,
        district: geo.district ? sanitizeText(geo.district, 60) : undefined,
        addressLine: geo.addressLine ? sanitizeText(geo.addressLine, 200) : undefined,
      },
      operatingStatus: 'pending_review',
      ownerUid: actorUid,
      registrationReference: input.registrationReference
        ? {
            registrationNumber: sanitizeText(input.registrationReference.registrationNumber, 50),
            taxIdentifier: sanitizeText(input.registrationReference.taxIdentifier, 50),
            unionLicenseNumber: sanitizeText(input.registrationReference.unionLicenseNumber, 50),
            issuingAuthority: sanitizeText(input.registrationReference.issuingAuthority, 100),
          }
        : undefined,
      verificationState: 'unverified',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      version: 1,
    };

    const saved = await this.store.saveAgency(agency);

    // Auto-create active owner membership
    const ownerMembershipId = `m_${agencyId}_${actorUid}`;
    await this.store.saveMembership({
      id: ownerMembershipId,
      agencyId,
      userUid: actorUid,
      role: 'agency_owner',
      status: 'active',
      invitedAtIso: nowIso,
      acceptedAtIso: nowIso,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      version: 1,
    });

    // Record activity
    await this.store.saveActivityRecord({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      agencyId,
      actorUid,
      actorRole: 'agency_owner',
      actionType: 'agency_created',
      resourceType: 'agency',
      resourceId: agencyId,
      timestampIso: nowIso,
      metadata: { displayName, orgType },
    });

    return { agency: saved };
  }

  async getAgency(agencyId: string): Promise<AgencyRecord | null> {
    validateSafeId(agencyId, 'agencyId');
    return this.store.getAgencyById(agencyId);
  }

  async updateAgency(
    agencyId: string,
    actorUid: string,
    updates: Partial<CreateAgencyInput>,
    isPlatformAdmin = false,
  ): Promise<AgencyRecord> {
    validateSafeId(agencyId, 'agencyId');
    const agency = await this.store.getAgencyById(agencyId);
    if (!agency) throw new BrokerageValidationError('NOT_FOUND', `Agency ${agencyId} not found.`);

    const membership = await this.store.findMembershipByAgencyAndUser(agencyId, actorUid);
    const authDecision = authorizeAgencyAction('agency.manage_settings', {
      principalUid: actorUid,
      isPlatformAdmin,
      agency,
      membership,
    });
    if (!authDecision.allowed) {
      throw new BrokerageValidationError('FORBIDDEN', authDecision.reason || 'Unauthorized to manage agency.');
    }

    if (updates.publicDisplayName) {
      agency.publicDisplayName = sanitizeText(updates.publicDisplayName, 120);
    }
    if (updates.description) {
      agency.description = sanitizeText(updates.description, 1000);
    }
    if (updates.businessContact) {
      if (updates.businessContact.email) {
        agency.businessContact.email = validateEmail(updates.businessContact.email);
        agency.publicContactEmail = agency.businessContact.email;
      }
      if (updates.businessContact.phone) {
        agency.businessContact.phone = validatePhone(updates.businessContact.phone);
        agency.publicContactPhone = agency.businessContact.phone;
      }
    }

    const saved = await this.store.saveAgency(agency);
    await this.store.saveActivityRecord({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      agencyId,
      actorUid,
      actorRole: membership?.role || 'platform_admin',
      actionType: 'agency_updated',
      resourceType: 'agency',
      resourceId: agencyId,
      timestampIso: new Date().toISOString(),
    });

    return saved;
  }

  async setOperatingStatus(
    agencyId: string,
    newStatus: AgencyOperatingStatus,
    actorUid: string,
    reason?: string,
    isPlatformAdmin = false,
  ): Promise<AgencyRecord> {
    validateSafeId(agencyId, 'agencyId');
    const agency = await this.store.getAgencyById(agencyId);
    if (!agency) throw new BrokerageValidationError('NOT_FOUND', `Agency ${agencyId} not found.`);

    // Suspending, restricting, or closing from platform or owner
    if (!isPlatformAdmin && agency.ownerUid !== actorUid) {
      throw new BrokerageValidationError('FORBIDDEN', 'Only agency owner or platform admin can alter agency status.');
    }

    const updated = await this.store.updateAgencyStatus(agencyId, newStatus, reason);

    await this.notificationSink.emitEvent({
      eventType: 'brokerage.agency_status_changed',
      recipientUid: agency.ownerUid,
      agencyId,
      actorUid,
      data: { oldStatus: agency.operatingStatus, newStatus, reason },
      timestampIso: new Date().toISOString(),
    });

    await this.store.saveActivityRecord({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      agencyId,
      actorUid,
      actorRole: isPlatformAdmin ? 'platform_admin' : 'agency_owner',
      actionType: 'agency_status_changed',
      resourceType: 'agency',
      resourceId: agencyId,
      timestampIso: new Date().toISOString(),
      metadata: { newStatus, reason },
    });

    return updated;
  }

  // --- Branch Operations ---
  async createBranch(
    actorUid: string,
    input: CreateBranchInput,
    isPlatformAdmin = false,
  ): Promise<BranchRecord> {
    validateSafeId(input.agencyId, 'agencyId');
    const agency = await this.store.getAgencyById(input.agencyId);
    if (!agency) throw new BrokerageValidationError('NOT_FOUND', `Agency ${input.agencyId} not found.`);

    const membership = await this.store.findMembershipByAgencyAndUser(input.agencyId, actorUid);
    const authDecision = authorizeAgencyAction('agency.manage_branches', {
      principalUid: actorUid,
      isPlatformAdmin,
      agency,
      membership,
    });
    if (!authDecision.allowed) {
      throw new BrokerageValidationError('FORBIDDEN', authDecision.reason || 'Unauthorized to manage branches.');
    }

    const branchName = sanitizeText(input.branchName, 80);
    if (!branchName || branchName.length < 2) {
      throw new BrokerageValidationError('INVALID_BRANCH_NAME', 'Branch name must be at least 2 characters.');
    }

    const branchId = `br_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();

    const branch: BranchRecord = {
      id: branchId,
      agencyId: input.agencyId,
      branchName,
      contact: {
        phone: validatePhone(input.contact?.phone, 'branchContact.phone'),
        email: validateEmail(input.contact?.email, 'branchContact.email'),
      },
      geographicReference: input.geographicReference,
      operatingHours: input.operatingHours ? sanitizeText(input.operatingHours, 100) : undefined,
      branchManagerUid: validateSafeId(input.branchManagerUid, 'branchManagerUid'),
      status: 'active',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      version: 1,
    };

    const saved = await this.store.saveBranch(branch);

    await this.store.saveActivityRecord({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      agencyId: input.agencyId,
      branchId,
      actorUid,
      actorRole: membership?.role || 'platform_admin',
      actionType: 'branch_created',
      resourceType: 'branch',
      resourceId: branchId,
      timestampIso: nowIso,
      metadata: { branchName },
    });

    return saved;
  }

  async listAgencyBranches(agencyId: string): Promise<BranchRecord[]> {
    validateSafeId(agencyId, 'agencyId');
    return this.store.findBranchesByAgencyId(agencyId);
  }

  async submitCredential(
    actorUid: string,
    cred: Omit<ProfessionalCredentialRecord, 'id' | 'verificationStatus' | 'lastVerifiedAtIso'>,
  ): Promise<ProfessionalCredentialRecord> {
    const credId = `cred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record: ProfessionalCredentialRecord = {
      ...cred,
      id: credId,
      verificationStatus: 'pending_verification',
    };
    const saved = await this.store.saveCredential(record);
    return saved;
  }
}

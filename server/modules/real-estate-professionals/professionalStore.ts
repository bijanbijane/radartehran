/**
 * @file server/modules/real-estate-professionals/professionalStore.ts
 * @description Isolated storage repository for professionals, agencies, branches, credentials, and memberships.
 */

import crypto from 'node:crypto';
import type {
  AgencyBranch,
  AgencyMembershipRecord,
  AgencyProfile,
  ListingAgentAssociation,
  ProfessionalCredential,
  ProfessionalPrivateProfile,
  ProfessionalPublicProfile,
} from './professionalTypes';

export class ProfessionalStore {
  private readonly professionals = new Map<string, ProfessionalPrivateProfile>();
  private readonly userToProfessionalId = new Map<string, string>();
  private readonly agencies = new Map<string, AgencyProfile>();
  private readonly credentials = new Map<string, ProfessionalCredential>();
  private readonly memberships = new Map<string, AgencyMembershipRecord>();
  private readonly listingAssociations = new Map<string, ListingAgentAssociation>();
  private readonly auditLogs: Array<{ action: string; actorUid: string; timestampIso: string; details?: unknown }> = [];

  // --- Professionals ---

  public async saveProfessionalProfile(profile: ProfessionalPrivateProfile): Promise<ProfessionalPrivateProfile> {
    this.professionals.set(profile.id, profile);
    this.userToProfessionalId.set(profile.userId, profile.id);
    return profile;
  }

  public async getPrivateProfessionalById(id: string): Promise<ProfessionalPrivateProfile | null> {
    return this.professionals.get(id) || null;
  }

  public async getProfessionalByUserId(userId: string): Promise<ProfessionalPrivateProfile | null> {
    const profId = this.userToProfessionalId.get(userId);
    if (!profId) return null;
    return this.professionals.get(profId) || null;
  }

  /**
   * Returns sanitized public profile (stripping contact phone, masked national ID, and private notes).
   */
  public async getPublicProfessionalById(id: string): Promise<ProfessionalPublicProfile | null> {
    const priv = this.professionals.get(id);
    if (!priv) return null;

    const {
      contactPhone: _cp,
      nationalIdMasked: _nid,
      privateNotes: _pn,
      credentialIds: _cids,
      ...publicFields
    } = priv;

    return publicFields;
  }

  public async listPublicProfessionals(filters?: {
    cityId?: string;
    hoodId?: number;
    role?: string;
    verificationStatus?: string;
    limit?: number;
  }): Promise<ProfessionalPublicProfile[]> {
    const limit = Math.max(1, Math.min(100, filters?.limit || 20));
    const list: ProfessionalPublicProfile[] = [];

    for (const priv of this.professionals.values()) {
      if (priv.operatingStatus === 'inactive') continue;

      if (filters?.cityId && priv.primaryCityId !== filters.cityId) continue;
      if (filters?.hoodId && !priv.activeHoodIds.includes(filters.hoodId)) continue;
      if (filters?.role && priv.role !== filters.role) continue;
      if (filters?.verificationStatus && priv.verificationStatus !== filters.verificationStatus) continue;

      const pub = await this.getPublicProfessionalById(priv.id);
      if (pub) list.push(pub);
      if (list.length >= limit) break;
    }

    return list;
  }

  // --- Agencies & Branches ---

  public async saveAgencyProfile(agency: AgencyProfile): Promise<AgencyProfile> {
    this.agencies.set(agency.id, agency);
    return agency;
  }

  public async getAgencyById(id: string): Promise<AgencyProfile | null> {
    return this.agencies.get(id) || null;
  }

  public async getPublicAgencyById(id: string): Promise<Omit<AgencyProfile, 'privateContactPhone'> | null> {
    const agency = this.agencies.get(id);
    if (!agency) return null;
    const { privateContactPhone: _pc, ...publicAgency } = agency;
    return publicAgency;
  }

  public async listPublicAgencies(cityId?: string, limit = 20): Promise<Array<Omit<AgencyProfile, 'privateContactPhone'>>> {
    const list: Array<Omit<AgencyProfile, 'privateContactPhone'>> = [];
    for (const agency of this.agencies.values()) {
      if (!agency.isActive) continue;
      if (cityId && agency.cityId !== cityId) continue;
      const pub = await this.getPublicAgencyById(agency.id);
      if (pub) list.push(pub);
      if (list.length >= limit) break;
    }
    return list;
  }

  // --- Credentials ---

  public async saveCredential(cred: ProfessionalCredential): Promise<ProfessionalCredential> {
    this.credentials.set(cred.id, cred);
    return cred;
  }

  public async getCredentialById(id: string): Promise<ProfessionalCredential | null> {
    return this.credentials.get(id) || null;
  }

  public async listCredentialsForOwner(ownerId: string): Promise<ProfessionalCredential[]> {
    return Array.from(this.credentials.values()).filter((c) => c.ownerId === ownerId);
  }

  // --- Agency Memberships ---

  public async saveMembership(record: AgencyMembershipRecord): Promise<AgencyMembershipRecord> {
    this.memberships.set(record.id, record);
    return record;
  }

  public async getMembershipById(id: string): Promise<AgencyMembershipRecord | null> {
    return this.memberships.get(id) || null;
  }

  public async getActiveMembership(professionalId: string, agencyId: string): Promise<AgencyMembershipRecord | null> {
    for (const m of this.memberships.values()) {
      if (m.professionalId === professionalId && m.agencyId === agencyId && m.state === 'ACTIVE') {
        return m;
      }
    }
    return null;
  }

  public async listMembershipsForAgency(agencyId: string, activeOnly = true): Promise<AgencyMembershipRecord[]> {
    return Array.from(this.memberships.values()).filter(
      (m) => m.agencyId === agencyId && (!activeOnly || m.state === 'ACTIVE'),
    );
  }

  public async listMembershipsForProfessional(professionalId: string): Promise<AgencyMembershipRecord[]> {
    return Array.from(this.memberships.values()).filter((m) => m.professionalId === professionalId);
  }

  // --- Listing Agent Associations ---

  public async saveListingAssociation(assoc: ListingAgentAssociation): Promise<ListingAgentAssociation> {
    this.listingAssociations.set(assoc.id, assoc);
    return assoc;
  }

  public async getActiveListingAssociation(listingId: string): Promise<ListingAgentAssociation | null> {
    const nowIso = new Date().toISOString();
    for (const a of this.listingAssociations.values()) {
      if (a.listingId === listingId && a.status === 'ACTIVE' && a.authorizedUntilIso >= nowIso) {
        return a;
      }
    }
    return null;
  }

  // --- Audit Logs ---

  public async logAudit(action: string, actorUid: string, details?: unknown): Promise<void> {
    this.auditLogs.push({
      action,
      actorUid,
      timestampIso: new Date().toISOString(),
      details,
    });
  }

  public getAuditLogs(): readonly { action: string; actorUid: string; timestampIso: string }[] {
    return this.auditLogs;
  }

  public clearAllForTesting(): void {
    this.professionals.clear();
    this.userToProfessionalId.clear();
    this.agencies.clear();
    this.credentials.clear();
    this.memberships.clear();
    this.listingAssociations.clear();
    this.auditLogs.length = 0;
  }
}

export const defaultProfessionalStore = new ProfessionalStore();

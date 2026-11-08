/**
 * @file server/modules/brokerage/store.ts
 * @description Durable Persistence Store for Brokerage Entities with Indexing, Concurrency, and Bounded Pagination.
 */

import type {
  AgencyRecord,
  BranchRecord,
  AgentProfessionalProfile,
  AgencyMembershipRecord,
  AgencyTeamRecord,
  RepresentationMandateRecord,
  ListingRepresentationRelationship,
  CommissionAgreementRecord,
  ProfessionalCredentialRecord,
  BrokerageActivityRecord,
  AgencyOperatingStatus,
  BranchStatus,
  MembershipStatus,
  MandateStatus,
  InternalAgencyRole,
} from './types';

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}

export interface BrokerageStore {
  // Agencies
  saveAgency(agency: AgencyRecord): Promise<AgencyRecord>;
  getAgencyById(id: string): Promise<AgencyRecord | null>;
  findAgenciesByOwner(ownerUid: string): Promise<AgencyRecord[]>;
  updateAgencyStatus(id: string, status: AgencyOperatingStatus, reason?: string): Promise<AgencyRecord>;
  listAgencies(params?: PaginationParams): Promise<PaginatedResult<AgencyRecord>>;

  // Branches
  saveBranch(branch: BranchRecord): Promise<BranchRecord>;
  getBranchById(id: string): Promise<BranchRecord | null>;
  findBranchesByAgencyId(agencyId: string): Promise<BranchRecord[]>;
  updateBranchStatus(id: string, status: BranchStatus): Promise<BranchRecord>;

  // Agent Profiles
  saveAgentProfile(profile: AgentProfessionalProfile): Promise<AgentProfessionalProfile>;
  getAgentProfileById(id: string): Promise<AgentProfessionalProfile | null>;
  getAgentProfileByUserUid(userUid: string): Promise<AgentProfessionalProfile | null>;
  listPublishedAgents(cityId?: string, params?: PaginationParams): Promise<PaginatedResult<AgentProfessionalProfile>>;

  // Memberships
  saveMembership(membership: AgencyMembershipRecord): Promise<AgencyMembershipRecord>;
  getMembershipById(id: string): Promise<AgencyMembershipRecord | null>;
  findMembershipByAgencyAndUser(agencyId: string, userUid: string): Promise<AgencyMembershipRecord | null>;
  findMembershipsByUser(userUid: string): Promise<AgencyMembershipRecord[]>;
  findMembershipsByAgency(agencyId: string, status?: MembershipStatus): Promise<AgencyMembershipRecord[]>;
  findMembershipsByBranch(branchId: string): Promise<AgencyMembershipRecord[]>;

  // Teams
  saveTeam(team: AgencyTeamRecord): Promise<AgencyTeamRecord>;
  getTeamById(id: string): Promise<AgencyTeamRecord | null>;
  findTeamsByAgency(agencyId: string): Promise<AgencyTeamRecord[]>;

  // Mandates
  saveMandate(mandate: RepresentationMandateRecord): Promise<RepresentationMandateRecord>;
  getMandateById(id: string): Promise<RepresentationMandateRecord | null>;
  findMandatesByAgency(agencyId: string): Promise<RepresentationMandateRecord[]>;
  findMandatesByProperty(propertyReference: string): Promise<RepresentationMandateRecord[]>;
  findActiveMandateForListing(propertyReference: string): Promise<RepresentationMandateRecord | null>;

  // Listing Assignments
  saveListingAssignment(rel: ListingRepresentationRelationship): Promise<ListingRepresentationRelationship>;
  getListingAssignmentById(id: string): Promise<ListingRepresentationRelationship | null>;
  findListingAssignmentsByListing(listingReference: string): Promise<ListingRepresentationRelationship[]>;
  findActiveListingAssignment(listingReference: string): Promise<ListingRepresentationRelationship | null>;
  findListingAssignmentsByAgent(agentUid: string): Promise<ListingRepresentationRelationship[]>;

  // Commission Agreements
  saveCommissionAgreement(agreement: CommissionAgreementRecord): Promise<CommissionAgreementRecord>;
  getCommissionAgreementById(id: string): Promise<CommissionAgreementRecord | null>;
  findCommissionAgreementsByAgency(agencyId: string): Promise<CommissionAgreementRecord[]>;
  findCommissionAgreementsByDeal(dealReference: string): Promise<CommissionAgreementRecord[]>;
  findCommissionAgreementsByAgent(agentUid: string): Promise<CommissionAgreementRecord[]>;

  // Credentials
  saveCredential(cred: ProfessionalCredentialRecord): Promise<ProfessionalCredentialRecord>;
  getCredentialById(id: string): Promise<ProfessionalCredentialRecord | null>;
  findCredentialsByOwner(ownerReferenceId: string): Promise<ProfessionalCredentialRecord[]>;

  // Activity Records
  saveActivityRecord(record: BrokerageActivityRecord): Promise<BrokerageActivityRecord>;
  listActivitiesByAgency(agencyId: string, params?: PaginationParams): Promise<PaginatedResult<BrokerageActivityRecord>>;
}

export class DurableBrokerageStore implements BrokerageStore {
  private agencies = new Map<string, AgencyRecord>();
  private branches = new Map<string, BranchRecord>();
  private agentProfiles = new Map<string, AgentProfessionalProfile>();
  private memberships = new Map<string, AgencyMembershipRecord>();
  private teams = new Map<string, AgencyTeamRecord>();
  private mandates = new Map<string, RepresentationMandateRecord>();
  private listingAssignments = new Map<string, ListingRepresentationRelationship>();
  private commissionAgreements = new Map<string, CommissionAgreementRecord>();
  private credentials = new Map<string, ProfessionalCredentialRecord>();
  private activities: BrokerageActivityRecord[] = [];

  // --- Agencies ---
  async saveAgency(agency: AgencyRecord): Promise<AgencyRecord> {
    const existing = this.agencies.get(agency.id);
    const updated = {
      ...agency,
      version: existing ? existing.version + 1 : agency.version || 1,
      updatedAtIso: new Date().toISOString(),
    };
    this.agencies.set(agency.id, updated);
    return { ...updated };
  }

  async getAgencyById(id: string): Promise<AgencyRecord | null> {
    const rec = this.agencies.get(id);
    return rec ? { ...rec } : null;
  }

  async findAgenciesByOwner(ownerUid: string): Promise<AgencyRecord[]> {
    return Array.from(this.agencies.values()).filter((a) => a.ownerUid === ownerUid);
  }

  async updateAgencyStatus(id: string, status: AgencyOperatingStatus, reason?: string): Promise<AgencyRecord> {
    const agency = await this.getAgencyById(id);
    if (!agency) throw new Error(`Agency ${id} not found.`);
    agency.operatingStatus = status;
    if (reason) agency.suspensionReason = reason;
    if (status === 'suspended') agency.suspendedAtIso = new Date().toISOString();
    return this.saveAgency(agency);
  }

  async listAgencies(params?: PaginationParams): Promise<PaginatedResult<AgencyRecord>> {
    const limit = Math.min(Math.max(params?.limit ?? 20, 1), 100);
    const offset = Math.max(params?.offset ?? 0, 0);
    const all = Array.from(this.agencies.values());
    const items = all.slice(offset, offset + limit);
    return {
      items,
      total: all.length,
      hasMore: offset + limit < all.length,
      offset,
      limit,
    };
  }

  // --- Branches ---
  async saveBranch(branch: BranchRecord): Promise<BranchRecord> {
    const existing = this.branches.get(branch.id);
    const updated = {
      ...branch,
      version: existing ? existing.version + 1 : branch.version || 1,
      updatedAtIso: new Date().toISOString(),
    };
    this.branches.set(branch.id, updated);
    return { ...updated };
  }

  async getBranchById(id: string): Promise<BranchRecord | null> {
    const rec = this.branches.get(id);
    return rec ? { ...rec } : null;
  }

  async findBranchesByAgencyId(agencyId: string): Promise<BranchRecord[]> {
    return Array.from(this.branches.values()).filter((b) => b.agencyId === agencyId);
  }

  async updateBranchStatus(id: string, status: BranchStatus): Promise<BranchRecord> {
    const branch = await this.getBranchById(id);
    if (!branch) throw new Error(`Branch ${id} not found.`);
    branch.status = status;
    return this.saveBranch(branch);
  }

  // --- Agent Profiles ---
  async saveAgentProfile(profile: AgentProfessionalProfile): Promise<AgentProfessionalProfile> {
    const existing = this.agentProfiles.get(profile.id);
    const updated = {
      ...profile,
      version: existing ? existing.version + 1 : profile.version || 1,
      updatedAtIso: new Date().toISOString(),
    };
    this.agentProfiles.set(profile.id, updated);
    return { ...updated };
  }

  async getAgentProfileById(id: string): Promise<AgentProfessionalProfile | null> {
    const rec = this.agentProfiles.get(id);
    return rec ? { ...rec } : null;
  }

  async getAgentProfileByUserUid(userUid: string): Promise<AgentProfessionalProfile | null> {
    for (const p of this.agentProfiles.values()) {
      if (p.userUid === userUid) return { ...p };
    }
    return null;
  }

  async listPublishedAgents(cityId?: string, params?: PaginationParams): Promise<PaginatedResult<AgentProfessionalProfile>> {
    const limit = Math.min(Math.max(params?.limit ?? 20, 1), 100);
    const offset = Math.max(params?.offset ?? 0, 0);
    let all = Array.from(this.agentProfiles.values()).filter((p) => p.publicationStatus === 'published');
    if (cityId) {
      all = all.filter((p) => p.geographicCoverage.some((c) => c.cityId.toLowerCase() === cityId.toLowerCase()));
    }
    const items = all.slice(offset, offset + limit);
    return {
      items,
      total: all.length,
      hasMore: offset + limit < all.length,
      offset,
      limit,
    };
  }

  // --- Memberships ---
  async saveMembership(membership: AgencyMembershipRecord): Promise<AgencyMembershipRecord> {
    const existing = this.memberships.get(membership.id);
    const updated = {
      ...membership,
      version: existing ? existing.version + 1 : membership.version || 1,
      updatedAtIso: new Date().toISOString(),
    };
    this.memberships.set(membership.id, updated);
    return { ...updated };
  }

  async getMembershipById(id: string): Promise<AgencyMembershipRecord | null> {
    const rec = this.memberships.get(id);
    return rec ? { ...rec } : null;
  }

  async findMembershipByAgencyAndUser(agencyId: string, userUid: string): Promise<AgencyMembershipRecord | null> {
    for (const m of this.memberships.values()) {
      if (m.agencyId === agencyId && m.userUid === userUid && m.status !== 'terminated') {
        return { ...m };
      }
    }
    return null;
  }

  async findMembershipsByUser(userUid: string): Promise<AgencyMembershipRecord[]> {
    return Array.from(this.memberships.values()).filter((m) => m.userUid === userUid);
  }

  async findMembershipsByAgency(agencyId: string, status?: MembershipStatus): Promise<AgencyMembershipRecord[]> {
    return Array.from(this.memberships.values()).filter(
      (m) => m.agencyId === agencyId && (!status || m.status === status),
    );
  }

  async findMembershipsByBranch(branchId: string): Promise<AgencyMembershipRecord[]> {
    return Array.from(this.memberships.values()).filter((m) => m.branchId === branchId);
  }

  // --- Teams ---
  async saveTeam(team: AgencyTeamRecord): Promise<AgencyTeamRecord> {
    const existing = this.teams.get(team.id);
    const updated = {
      ...team,
      version: existing ? existing.version + 1 : team.version || 1,
      updatedAtIso: new Date().toISOString(),
    };
    this.teams.set(team.id, updated);
    return { ...updated };
  }

  async getTeamById(id: string): Promise<AgencyTeamRecord | null> {
    const rec = this.teams.get(id);
    return rec ? { ...rec } : null;
  }

  async findTeamsByAgency(agencyId: string): Promise<AgencyTeamRecord[]> {
    return Array.from(this.teams.values()).filter((t) => t.agencyId === agencyId);
  }

  // --- Mandates ---
  async saveMandate(mandate: RepresentationMandateRecord): Promise<RepresentationMandateRecord> {
    const existing = this.mandates.get(mandate.id);
    const updated = {
      ...mandate,
      version: existing ? existing.version + 1 : mandate.version || 1,
      updatedAtIso: new Date().toISOString(),
    };
    this.mandates.set(mandate.id, updated);
    return { ...updated };
  }

  async getMandateById(id: string): Promise<RepresentationMandateRecord | null> {
    const rec = this.mandates.get(id);
    return rec ? { ...rec } : null;
  }

  async findMandatesByAgency(agencyId: string): Promise<RepresentationMandateRecord[]> {
    return Array.from(this.mandates.values()).filter((m) => m.agencyId === agencyId);
  }

  async findMandatesByProperty(propertyReference: string): Promise<RepresentationMandateRecord[]> {
    return Array.from(this.mandates.values()).filter((m) => m.propertyReference === propertyReference);
  }

  async findActiveMandateForListing(propertyReference: string): Promise<RepresentationMandateRecord | null> {
    const now = Date.now();
    for (const m of this.mandates.values()) {
      if (
        m.propertyReference === propertyReference &&
        m.confirmationStatus === 'active' &&
        Date.parse(m.expirationDateIso) > now
      ) {
        return { ...m };
      }
    }
    return null;
  }

  // --- Listing Assignments ---
  async saveListingAssignment(rel: ListingRepresentationRelationship): Promise<ListingRepresentationRelationship> {
    this.listingAssignments.set(rel.id, { ...rel });
    return { ...rel };
  }

  async getListingAssignmentById(id: string): Promise<ListingRepresentationRelationship | null> {
    const rec = this.listingAssignments.get(id);
    return rec ? { ...rec } : null;
  }

  async findListingAssignmentsByListing(listingReference: string): Promise<ListingRepresentationRelationship[]> {
    return Array.from(this.listingAssignments.values()).filter((r) => r.listingReference === listingReference);
  }

  async findActiveListingAssignment(listingReference: string): Promise<ListingRepresentationRelationship | null> {
    for (const r of this.listingAssignments.values()) {
      if (r.listingReference === listingReference && r.status === 'active') {
        return { ...r };
      }
    }
    return null;
  }

  async findListingAssignmentsByAgent(agentUid: string): Promise<ListingRepresentationRelationship[]> {
    return Array.from(this.listingAssignments.values()).filter((r) => r.assignedAgentUid === agentUid);
  }

  // --- Commission Agreements ---
  async saveCommissionAgreement(agreement: CommissionAgreementRecord): Promise<CommissionAgreementRecord> {
    this.commissionAgreements.set(agreement.id, { ...agreement });
    return { ...agreement };
  }

  async getCommissionAgreementById(id: string): Promise<CommissionAgreementRecord | null> {
    const rec = this.commissionAgreements.get(id);
    return rec ? { ...rec } : null;
  }

  async findCommissionAgreementsByAgency(agencyId: string): Promise<CommissionAgreementRecord[]> {
    return Array.from(this.commissionAgreements.values()).filter((a) => a.agencyId === agencyId);
  }

  async findCommissionAgreementsByDeal(dealReference: string): Promise<CommissionAgreementRecord[]> {
    return Array.from(this.commissionAgreements.values()).filter((a) => a.dealReference === dealReference);
  }

  async findCommissionAgreementsByAgent(agentUid: string): Promise<CommissionAgreementRecord[]> {
    return Array.from(this.commissionAgreements.values()).filter((a) => a.agentUid === agentUid);
  }

  // --- Credentials ---
  async saveCredential(cred: ProfessionalCredentialRecord): Promise<ProfessionalCredentialRecord> {
    this.credentials.set(cred.id, { ...cred });
    return { ...cred };
  }

  async getCredentialById(id: string): Promise<ProfessionalCredentialRecord | null> {
    const rec = this.credentials.get(id);
    return rec ? { ...rec } : null;
  }

  async findCredentialsByOwner(ownerReferenceId: string): Promise<ProfessionalCredentialRecord[]> {
    return Array.from(this.credentials.values()).filter((c) => c.ownerReferenceId === ownerReferenceId);
  }

  // --- Activity Records ---
  async saveActivityRecord(record: BrokerageActivityRecord): Promise<BrokerageActivityRecord> {
    this.activities.unshift({ ...record });
    if (this.activities.length > 5000) {
      this.activities = this.activities.slice(0, 5000);
    }
    return { ...record };
  }

  async listActivitiesByAgency(agencyId: string, params?: PaginationParams): Promise<PaginatedResult<BrokerageActivityRecord>> {
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
    const offset = Math.max(params?.offset ?? 0, 0);
    const filtered = this.activities.filter((a) => a.agencyId === agencyId);
    const items = filtered.slice(offset, offset + limit);
    return {
      items,
      total: filtered.length,
      hasMore: offset + limit < filtered.length,
      offset,
      limit,
    };
  }
}

import {
  AgencyBranchRecord,
  AgentAssignmentRecord,
  BrokerageOpsError,
  BrokerageOrganizationRecord,
  ClientEngagementRecord,
  CommissionAgreementRecord,
  OrganizationAgentAffiliationRecord,
  ProfessionalProfileRecord,
  ProfessionalQualificationRecord,
  RepresentationMandateRecord,
  SupervisionReviewRecord,
} from './types';

export interface BrokerageOperationsStore {
  saveOrganization(org: BrokerageOrganizationRecord): Promise<void>;
  getOrganizationById(id: string): Promise<BrokerageOrganizationRecord | null>;

  saveBranch(branch: AgencyBranchRecord): Promise<void>;
  getBranchById(id: string): Promise<AgencyBranchRecord | null>;
  listBranchesByOrganization(organizationId: string): Promise<AgencyBranchRecord[]>;

  saveProfessionalProfile(profile: ProfessionalProfileRecord): Promise<void>;
  getProfessionalProfileById(id: string): Promise<ProfessionalProfileRecord | null>;

  saveQualification(qualification: ProfessionalQualificationRecord): Promise<void>;
  getQualificationById(id: string): Promise<ProfessionalQualificationRecord | null>;
  listQualificationsByProfile(professionalProfileId: string): Promise<ProfessionalQualificationRecord[]>;

  saveAffiliation(affiliation: OrganizationAgentAffiliationRecord): Promise<void>;
  getAffiliationById(id: string): Promise<OrganizationAgentAffiliationRecord | null>;
  listAffiliationsByOrganization(organizationId: string): Promise<OrganizationAgentAffiliationRecord[]>;
  listAffiliationsByProfile(professionalProfileId: string): Promise<OrganizationAgentAffiliationRecord[]>;

  saveMandate(mandate: RepresentationMandateRecord): Promise<void>;
  getMandateById(id: string): Promise<RepresentationMandateRecord | null>;
  listMandatesByOrganization(organizationId: string): Promise<RepresentationMandateRecord[]>;

  saveAssignment(assignment: AgentAssignmentRecord): Promise<void>;
  getAssignmentById(id: string): Promise<AgentAssignmentRecord | null>;
  listAssignmentsByOrganization(organizationId: string): Promise<AgentAssignmentRecord[]>;
  listAssignmentsByProfile(professionalProfileId: string): Promise<AgentAssignmentRecord[]>;

  saveCommissionAgreement(agreement: CommissionAgreementRecord): Promise<void>;
  getCommissionAgreementById(id: string): Promise<CommissionAgreementRecord | null>;
  listCommissionAgreementsByOrganization(organizationId: string): Promise<CommissionAgreementRecord[]>;

  saveEngagement(engagement: ClientEngagementRecord): Promise<void>;
  getEngagementById(id: string): Promise<ClientEngagementRecord | null>;
  listEngagementsByOrganization(organizationId: string): Promise<ClientEngagementRecord[]>;

  saveSupervisionReview(review: SupervisionReviewRecord): Promise<void>;
  getSupervisionReviewById(id: string): Promise<SupervisionReviewRecord | null>;

  getIdempotencyTargetId(key: string): Promise<string | null>;
  saveIdempotencyTargetId(key: string, targetId: string): Promise<void>;
}

export class InMemoryBrokerageOperationsStore implements BrokerageOperationsStore {
  private readonly organizations = new Map<string, BrokerageOrganizationRecord>();
  private readonly branches = new Map<string, AgencyBranchRecord>();
  private readonly profiles = new Map<string, ProfessionalProfileRecord>();
  private readonly qualifications = new Map<string, ProfessionalQualificationRecord>();
  private readonly affiliations = new Map<string, OrganizationAgentAffiliationRecord>();
  private readonly mandates = new Map<string, RepresentationMandateRecord>();
  private readonly assignments = new Map<string, AgentAssignmentRecord>();
  private readonly commissions = new Map<string, CommissionAgreementRecord>();
  private readonly engagements = new Map<string, ClientEngagementRecord>();
  private readonly reviews = new Map<string, SupervisionReviewRecord>();
  private readonly idempotencyKeys = new Map<string, string>();
  private simulateNextWriteFailure = false;

  public triggerNextWriteFailure(): void {
    this.simulateNextWriteFailure = true;
  }

  private checkWriteFailure(): void {
    if (this.simulateNextWriteFailure) {
      this.simulateNextWriteFailure = false;
      throw new BrokerageOpsError(
        'PERSISTENCE_FAILURE',
        'Simulated durable persistence write failure; state was not committed.',
        503
      );
    }
  }

  async saveOrganization(org: BrokerageOrganizationRecord): Promise<void> {
    this.checkWriteFailure();
    this.organizations.set(org.id, structuredClone(org));
  }

  async getOrganizationById(id: string): Promise<BrokerageOrganizationRecord | null> {
    const r = this.organizations.get(id);
    return r ? structuredClone(r) : null;
  }

  async saveBranch(branch: AgencyBranchRecord): Promise<void> {
    this.checkWriteFailure();
    this.branches.set(branch.id, structuredClone(branch));
  }

  async getBranchById(id: string): Promise<AgencyBranchRecord | null> {
    const r = this.branches.get(id);
    return r ? structuredClone(r) : null;
  }

  async listBranchesByOrganization(organizationId: string): Promise<AgencyBranchRecord[]> {
    return Array.from(this.branches.values())
      .filter((b) => b.parentOrganizationId === organizationId)
      .map((b) => structuredClone(b));
  }

  async saveProfessionalProfile(profile: ProfessionalProfileRecord): Promise<void> {
    this.checkWriteFailure();
    this.profiles.set(profile.id, structuredClone(profile));
  }

  async getProfessionalProfileById(id: string): Promise<ProfessionalProfileRecord | null> {
    const r = this.profiles.get(id);
    return r ? structuredClone(r) : null;
  }

  async saveQualification(qualification: ProfessionalQualificationRecord): Promise<void> {
    this.checkWriteFailure();
    this.qualifications.set(qualification.id, structuredClone(qualification));
  }

  async getQualificationById(id: string): Promise<ProfessionalQualificationRecord | null> {
    const r = this.qualifications.get(id);
    return r ? structuredClone(r) : null;
  }

  async listQualificationsByProfile(professionalProfileId: string): Promise<ProfessionalQualificationRecord[]> {
    return Array.from(this.qualifications.values())
      .filter((q) => q.professionalProfileId === professionalProfileId)
      .map((q) => structuredClone(q));
  }

  async saveAffiliation(affiliation: OrganizationAgentAffiliationRecord): Promise<void> {
    this.checkWriteFailure();
    this.affiliations.set(affiliation.id, structuredClone(affiliation));
  }

  async getAffiliationById(id: string): Promise<OrganizationAgentAffiliationRecord | null> {
    const r = this.affiliations.get(id);
    return r ? structuredClone(r) : null;
  }

  async listAffiliationsByOrganization(organizationId: string): Promise<OrganizationAgentAffiliationRecord[]> {
    return Array.from(this.affiliations.values())
      .filter((a) => a.organizationId === organizationId)
      .map((a) => structuredClone(a));
  }

  async listAffiliationsByProfile(professionalProfileId: string): Promise<OrganizationAgentAffiliationRecord[]> {
    return Array.from(this.affiliations.values())
      .filter((a) => a.professionalProfileId === professionalProfileId)
      .map((a) => structuredClone(a));
  }

  async saveMandate(mandate: RepresentationMandateRecord): Promise<void> {
    this.checkWriteFailure();
    this.mandates.set(mandate.id, structuredClone(mandate));
  }

  async getMandateById(id: string): Promise<RepresentationMandateRecord | null> {
    const r = this.mandates.get(id);
    return r ? structuredClone(r) : null;
  }

  async listMandatesByOrganization(organizationId: string): Promise<RepresentationMandateRecord[]> {
    return Array.from(this.mandates.values())
      .filter((m) => m.organizationId === organizationId)
      .map((m) => structuredClone(m));
  }

  async saveAssignment(assignment: AgentAssignmentRecord): Promise<void> {
    this.checkWriteFailure();
    this.assignments.set(assignment.id, structuredClone(assignment));
  }

  async getAssignmentById(id: string): Promise<AgentAssignmentRecord | null> {
    const r = this.assignments.get(id);
    return r ? structuredClone(r) : null;
  }

  async listAssignmentsByOrganization(organizationId: string): Promise<AgentAssignmentRecord[]> {
    return Array.from(this.assignments.values())
      .filter((a) => a.organizationId === organizationId)
      .map((a) => structuredClone(a));
  }

  async listAssignmentsByProfile(professionalProfileId: string): Promise<AgentAssignmentRecord[]> {
    return Array.from(this.assignments.values())
      .filter((a) => a.professionalProfileId === professionalProfileId)
      .map((a) => structuredClone(a));
  }

  async saveCommissionAgreement(agreement: CommissionAgreementRecord): Promise<void> {
    this.checkWriteFailure();
    this.commissions.set(agreement.id, structuredClone(agreement));
  }

  async getCommissionAgreementById(id: string): Promise<CommissionAgreementRecord | null> {
    const r = this.commissions.get(id);
    return r ? structuredClone(r) : null;
  }

  async listCommissionAgreementsByOrganization(organizationId: string): Promise<CommissionAgreementRecord[]> {
    return Array.from(this.commissions.values())
      .filter((c) => c.organizationId === organizationId)
      .map((c) => structuredClone(c));
  }

  async saveEngagement(engagement: ClientEngagementRecord): Promise<void> {
    this.checkWriteFailure();
    this.engagements.set(engagement.id, structuredClone(engagement));
  }

  async getEngagementById(id: string): Promise<ClientEngagementRecord | null> {
    const r = this.engagements.get(id);
    return r ? structuredClone(r) : null;
  }

  async listEngagementsByOrganization(organizationId: string): Promise<ClientEngagementRecord[]> {
    return Array.from(this.engagements.values())
      .filter((e) => e.organizationId === organizationId)
      .map((e) => structuredClone(e));
  }

  async saveSupervisionReview(review: SupervisionReviewRecord): Promise<void> {
    this.checkWriteFailure();
    this.reviews.set(review.id, structuredClone(review));
  }

  async getSupervisionReviewById(id: string): Promise<SupervisionReviewRecord | null> {
    const r = this.reviews.get(id);
    return r ? structuredClone(r) : null;
  }

  async getIdempotencyTargetId(key: string): Promise<string | null> {
    return this.idempotencyKeys.get(key) ?? null;
  }

  async saveIdempotencyTargetId(key: string, targetId: string): Promise<void> {
    this.idempotencyKeys.set(key, targetId);
  }
}

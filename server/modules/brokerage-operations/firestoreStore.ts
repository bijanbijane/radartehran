import { getFirebaseAdminFirestoreForServer } from '../../../src/utils/serverAdminAndTelegramSecurity';
import {
  AgencyBranchRecord,
  AgentAssignmentRecord,
  BrokerageOrganizationRecord,
  ClientEngagementRecord,
  CommissionAgreementRecord,
  OrganizationAgentAffiliationRecord,
  ProfessionalProfileRecord,
  ProfessionalQualificationRecord,
  RepresentationMandateRecord,
  SupervisionReviewRecord,
} from './types';
import { BrokerageOperationsStore } from './store';

export const BROKERAGE_OPS_COLLECTIONS = {
  organizations: 'brokerage_ops_organizations',
  branches: 'brokerage_ops_branches',
  profiles: 'brokerage_ops_profiles',
  qualifications: 'brokerage_ops_qualifications',
  affiliations: 'brokerage_ops_affiliations',
  mandates: 'brokerage_ops_mandates',
  assignments: 'brokerage_ops_assignments',
  commissions: 'brokerage_ops_commissions',
  engagements: 'brokerage_ops_engagements',
  reviews: 'brokerage_ops_supervision_reviews',
  idempotency: 'brokerage_ops_idempotency',
} as const;

export class FirestoreBrokerageOperationsStore implements BrokerageOperationsStore {
  private get db() {
    const firestore = getFirebaseAdminFirestoreForServer();
    if (!firestore) {
      throw new Error('Firebase Admin Firestore is not initialized for BrokerageOperationsStore');
    }
    return firestore;
  }

  async saveOrganization(org: BrokerageOrganizationRecord): Promise<void> {
    await this.db.collection(BROKERAGE_OPS_COLLECTIONS.organizations).doc(org.id).set(org);
  }
  async getOrganizationById(id: string): Promise<BrokerageOrganizationRecord | null> {
    const s = await this.db.collection(BROKERAGE_OPS_COLLECTIONS.organizations).doc(id).get();
    return s.exists ? (s.data() as BrokerageOrganizationRecord) : null;
  }

  async saveBranch(branch: AgencyBranchRecord): Promise<void> {
    await this.db.collection(BROKERAGE_OPS_COLLECTIONS.branches).doc(branch.id).set(branch);
  }
  async getBranchById(id: string): Promise<AgencyBranchRecord | null> {
    const s = await this.db.collection(BROKERAGE_OPS_COLLECTIONS.branches).doc(id).get();
    return s.exists ? (s.data() as AgencyBranchRecord) : null;
  }
  async listBranchesByOrganization(organizationId: string): Promise<AgencyBranchRecord[]> {
    const s = await this.db
      .collection(BROKERAGE_OPS_COLLECTIONS.branches)
      .where('parentOrganizationId', '==', organizationId)
      .limit(100)
      .get();
    return s.docs.map((d) => d.data() as AgencyBranchRecord);
  }

  async saveProfessionalProfile(profile: ProfessionalProfileRecord): Promise<void> {
    await this.db.collection(BROKERAGE_OPS_COLLECTIONS.profiles).doc(profile.id).set(profile);
  }
  async getProfessionalProfileById(id: string): Promise<ProfessionalProfileRecord | null> {
    const s = await this.db.collection(BROKERAGE_OPS_COLLECTIONS.profiles).doc(id).get();
    return s.exists ? (s.data() as ProfessionalProfileRecord) : null;
  }

  async saveQualification(qualification: ProfessionalQualificationRecord): Promise<void> {
    await this.db.collection(BROKERAGE_OPS_COLLECTIONS.qualifications).doc(qualification.id).set(qualification);
  }
  async getQualificationById(id: string): Promise<ProfessionalQualificationRecord | null> {
    const s = await this.db.collection(BROKERAGE_OPS_COLLECTIONS.qualifications).doc(id).get();
    return s.exists ? (s.data() as ProfessionalQualificationRecord) : null;
  }
  async listQualificationsByProfile(professionalProfileId: string): Promise<ProfessionalQualificationRecord[]> {
    const s = await this.db
      .collection(BROKERAGE_OPS_COLLECTIONS.qualifications)
      .where('professionalProfileId', '==', professionalProfileId)
      .limit(100)
      .get();
    return s.docs.map((d) => d.data() as ProfessionalQualificationRecord);
  }

  async saveAffiliation(affiliation: OrganizationAgentAffiliationRecord): Promise<void> {
    await this.db.collection(BROKERAGE_OPS_COLLECTIONS.affiliations).doc(affiliation.id).set(affiliation);
  }
  async getAffiliationById(id: string): Promise<OrganizationAgentAffiliationRecord | null> {
    const s = await this.db.collection(BROKERAGE_OPS_COLLECTIONS.affiliations).doc(id).get();
    return s.exists ? (s.data() as OrganizationAgentAffiliationRecord) : null;
  }
  async listAffiliationsByOrganization(organizationId: string): Promise<OrganizationAgentAffiliationRecord[]> {
    const s = await this.db
      .collection(BROKERAGE_OPS_COLLECTIONS.affiliations)
      .where('organizationId', '==', organizationId)
      .limit(100)
      .get();
    return s.docs.map((d) => d.data() as OrganizationAgentAffiliationRecord);
  }
  async listAffiliationsByProfile(professionalProfileId: string): Promise<OrganizationAgentAffiliationRecord[]> {
    const s = await this.db
      .collection(BROKERAGE_OPS_COLLECTIONS.affiliations)
      .where('professionalProfileId', '==', professionalProfileId)
      .limit(100)
      .get();
    return s.docs.map((d) => d.data() as OrganizationAgentAffiliationRecord);
  }

  async saveMandate(mandate: RepresentationMandateRecord): Promise<void> {
    await this.db.collection(BROKERAGE_OPS_COLLECTIONS.mandates).doc(mandate.id).set(mandate);
  }
  async getMandateById(id: string): Promise<RepresentationMandateRecord | null> {
    const s = await this.db.collection(BROKERAGE_OPS_COLLECTIONS.mandates).doc(id).get();
    return s.exists ? (s.data() as RepresentationMandateRecord) : null;
  }
  async listMandatesByOrganization(organizationId: string): Promise<RepresentationMandateRecord[]> {
    const s = await this.db
      .collection(BROKERAGE_OPS_COLLECTIONS.mandates)
      .where('organizationId', '==', organizationId)
      .limit(100)
      .get();
    return s.docs.map((d) => d.data() as RepresentationMandateRecord);
  }

  async saveAssignment(assignment: AgentAssignmentRecord): Promise<void> {
    await this.db.collection(BROKERAGE_OPS_COLLECTIONS.assignments).doc(assignment.id).set(assignment);
  }
  async getAssignmentById(id: string): Promise<AgentAssignmentRecord | null> {
    const s = await this.db.collection(BROKERAGE_OPS_COLLECTIONS.assignments).doc(id).get();
    return s.exists ? (s.data() as AgentAssignmentRecord) : null;
  }
  async listAssignmentsByOrganization(organizationId: string): Promise<AgentAssignmentRecord[]> {
    const s = await this.db
      .collection(BROKERAGE_OPS_COLLECTIONS.assignments)
      .where('organizationId', '==', organizationId)
      .limit(100)
      .get();
    return s.docs.map((d) => d.data() as AgentAssignmentRecord);
  }
  async listAssignmentsByProfile(professionalProfileId: string): Promise<AgentAssignmentRecord[]> {
    const s = await this.db
      .collection(BROKERAGE_OPS_COLLECTIONS.assignments)
      .where('professionalProfileId', '==', professionalProfileId)
      .limit(100)
      .get();
    return s.docs.map((d) => d.data() as AgentAssignmentRecord);
  }

  async saveCommissionAgreement(agreement: CommissionAgreementRecord): Promise<void> {
    await this.db.collection(BROKERAGE_OPS_COLLECTIONS.commissions).doc(agreement.id).set(agreement);
  }
  async getCommissionAgreementById(id: string): Promise<CommissionAgreementRecord | null> {
    const s = await this.db.collection(BROKERAGE_OPS_COLLECTIONS.commissions).doc(id).get();
    return s.exists ? (s.data() as CommissionAgreementRecord) : null;
  }
  async listCommissionAgreementsByOrganization(organizationId: string): Promise<CommissionAgreementRecord[]> {
    const s = await this.db
      .collection(BROKERAGE_OPS_COLLECTIONS.commissions)
      .where('organizationId', '==', organizationId)
      .limit(100)
      .get();
    return s.docs.map((d) => d.data() as CommissionAgreementRecord);
  }

  async saveEngagement(engagement: ClientEngagementRecord): Promise<void> {
    await this.db.collection(BROKERAGE_OPS_COLLECTIONS.engagements).doc(engagement.id).set(engagement);
  }
  async getEngagementById(id: string): Promise<ClientEngagementRecord | null> {
    const s = await this.db.collection(BROKERAGE_OPS_COLLECTIONS.engagements).doc(id).get();
    return s.exists ? (s.data() as ClientEngagementRecord) : null;
  }
  async listEngagementsByOrganization(organizationId: string): Promise<ClientEngagementRecord[]> {
    const s = await this.db
      .collection(BROKERAGE_OPS_COLLECTIONS.engagements)
      .where('organizationId', '==', organizationId)
      .limit(100)
      .get();
    return s.docs.map((d) => d.data() as ClientEngagementRecord);
  }

  async saveSupervisionReview(review: SupervisionReviewRecord): Promise<void> {
    await this.db.collection(BROKERAGE_OPS_COLLECTIONS.reviews).doc(review.id).set(review);
  }
  async getSupervisionReviewById(id: string): Promise<SupervisionReviewRecord | null> {
    const s = await this.db.collection(BROKERAGE_OPS_COLLECTIONS.reviews).doc(id).get();
    return s.exists ? (s.data() as SupervisionReviewRecord) : null;
  }

  async getIdempotencyTargetId(key: string): Promise<string | null> {
    const s = await this.db.collection(BROKERAGE_OPS_COLLECTIONS.idempotency).doc(key).get();
    return s.exists ? (s.data() as { targetId: string }).targetId : null;
  }
  async saveIdempotencyTargetId(key: string, targetId: string): Promise<void> {
    await this.db.collection(BROKERAGE_OPS_COLLECTIONS.idempotency).doc(key).set({
      targetId,
      createdAt: new Date().toISOString(),
    });
  }
}

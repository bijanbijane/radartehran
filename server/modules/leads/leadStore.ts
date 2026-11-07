/**
 * @file server/modules/leads/leadStore.ts
 * @description Storage repository interfaces and memory implementation for Real Estate Lead Management & CRM.
 */

import type {
  ActivityVisibility,
  ContactAccessAuditEntry,
  LeadActivityRecord,
  LeadLifecycleState,
  LeadRecord,
} from './leadTypes';

export interface LeadPaginationOptions {
  readonly limit?: number;
  readonly cursor?: string;
  readonly isClosed?: boolean;
  readonly lifecycleState?: LeadLifecycleState;
  readonly branchId?: string;
  readonly unassignedOnly?: boolean;
}

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
  readonly totalMatching?: number;
}

export interface LeadRepository {
  saveLead(lead: LeadRecord): Promise<LeadRecord>;
  getLeadById(id: string): Promise<LeadRecord | undefined>;
  getLeadByIdempotencyKey(key: string): Promise<LeadRecord | undefined>;
  findActiveDuplicate(params: {
    customerUid: string;
    targetListingId?: string;
    cityId?: string;
    hoodId?: number;
    propertyCategory?: string;
    transactionType?: string;
    windowSeconds?: number;
  }): Promise<LeadRecord | undefined>;
  listCustomerLeads(customerUid: string, options?: LeadPaginationOptions): Promise<PaginatedResult<LeadRecord>>;
  listProfessionalLeads(
    professionalUserId: string,
    options?: LeadPaginationOptions,
  ): Promise<PaginatedResult<LeadRecord>>;
  listAgencyLeads(agencyId: string, options?: LeadPaginationOptions): Promise<PaginatedResult<LeadRecord>>;
  saveActivity(activity: LeadActivityRecord): Promise<LeadActivityRecord>;
  listActivities(leadId: string, visibility?: ActivityVisibility): Promise<readonly LeadActivityRecord[]>;
  saveContactAccessAudit(entry: ContactAccessAuditEntry): Promise<void>;
  listContactAccessAudits(leadId: string): Promise<readonly ContactAccessAuditEntry[]>;
  exportCustomerLeads(customerUid: string): Promise<{
    readonly leads: readonly LeadRecord[];
    readonly activities: readonly LeadActivityRecord[];
  }>;
  anonymizeCustomerLeads(customerUid: string): Promise<{ readonly anonymizedCount: number }>;
}

export class MemoryLeadStore implements LeadRepository {
  private readonly leads = new Map<string, LeadRecord>();
  private readonly idempotencyIndex = new Map<string, string>(); // idempotencyKey -> leadId
  private readonly activities = new Map<string, LeadActivityRecord[]>(); // leadId -> activities
  private readonly contactAccessAudits = new Map<string, ContactAccessAuditEntry[]>(); // leadId -> audits

  public async saveLead(lead: LeadRecord): Promise<LeadRecord> {
    this.leads.set(lead.id, lead);
    this.idempotencyIndex.set(lead.idempotencyKey, lead.id);
    return lead;
  }

  public async getLeadById(id: string): Promise<LeadRecord | undefined> {
    return this.leads.get(id);
  }

  public async getLeadByIdempotencyKey(key: string): Promise<LeadRecord | undefined> {
    const leadId = this.idempotencyIndex.get(key);
    if (!leadId) return undefined;
    return this.leads.get(leadId);
  }

  public async findActiveDuplicate(params: {
    customerUid: string;
    targetListingId?: string;
    cityId?: string;
    hoodId?: number;
    propertyCategory?: string;
    transactionType?: string;
    windowSeconds?: number;
  }): Promise<LeadRecord | undefined> {
    const windowSec = params.windowSeconds ?? 86400; // 24 hours
    const nowMs = Date.now();
    const thresholdMs = nowMs - windowSec * 1000;

    const closedStates: LeadLifecycleState[] = ['SUCCESSFUL', 'UNSUCCESSFUL', 'CANCELLED', 'EXPIRED', 'REJECTED'];

    for (const lead of this.leads.values()) {
      if (lead.customerAccountUid !== params.customerUid) continue;
      if (closedStates.includes(lead.lifecycleState)) continue;

      const createdMs = new Date(lead.createdAtIso).getTime();
      if (createdMs < thresholdMs) continue;

      // Duplicate match 1: Same target listing
      if (params.targetListingId && lead.targetListingId === params.targetListingId) {
        return lead;
      }

      // Duplicate match 2: General requirement in same area & taxonomy
      if (
        !params.targetListingId &&
        lead.requirements.cityId === params.cityId?.toLowerCase() &&
        lead.requirements.hoodId === params.hoodId &&
        lead.requirements.propertyCategory === params.propertyCategory &&
        lead.requirements.transactionType === params.transactionType
      ) {
        return lead;
      }
    }

    return undefined;
  }

  public async listCustomerLeads(
    customerUid: string,
    options?: LeadPaginationOptions,
  ): Promise<PaginatedResult<LeadRecord>> {
    const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
    const closedStates: LeadLifecycleState[] = ['SUCCESSFUL', 'UNSUCCESSFUL', 'CANCELLED', 'EXPIRED', 'REJECTED'];

    let all = Array.from(this.leads.values()).filter((l) => l.customerAccountUid === customerUid);

    if (options?.isClosed !== undefined) {
      all = all.filter((l) => (options.isClosed ? closedStates.includes(l.lifecycleState) : !closedStates.includes(l.lifecycleState)));
    }

    // Sort newest first
    all.sort((a, b) => new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime());

    let startIndex = 0;
    if (options?.cursor) {
      const idx = all.findIndex((l) => l.id === options.cursor);
      if (idx >= 0) {
        startIndex = idx + 1;
      }
    }

    const items = all.slice(startIndex, startIndex + limit);
    const nextCursor = items.length === limit && startIndex + limit < all.length ? items[items.length - 1].id : undefined;

    return { items, nextCursor, totalMatching: all.length };
  }

  public async listProfessionalLeads(
    professionalUserId: string,
    options?: LeadPaginationOptions,
  ): Promise<PaginatedResult<LeadRecord>> {
    const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);

    let all = Array.from(this.leads.values()).filter(
      (l) => l.currentAssignment?.professionalId === professionalUserId || l.targetProfessionalId === professionalUserId,
    );

    if (options?.lifecycleState) {
      all = all.filter((l) => l.lifecycleState === options.lifecycleState);
    }

    all.sort((a, b) => new Date(b.lastActivityAtIso).getTime() - new Date(a.lastActivityAtIso).getTime());

    let startIndex = 0;
    if (options?.cursor) {
      const idx = all.findIndex((l) => l.id === options.cursor);
      if (idx >= 0) {
        startIndex = idx + 1;
      }
    }

    const items = all.slice(startIndex, startIndex + limit);
    const nextCursor = items.length === limit && startIndex + limit < all.length ? items[items.length - 1].id : undefined;

    return { items, nextCursor, totalMatching: all.length };
  }

  public async listAgencyLeads(
    agencyId: string,
    options?: LeadPaginationOptions,
  ): Promise<PaginatedResult<LeadRecord>> {
    const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);

    let all = Array.from(this.leads.values()).filter(
      (l) => l.targetAgencyId === agencyId || l.currentAssignment?.agencyId === agencyId,
    );

    if (options?.branchId) {
      all = all.filter(
        (l) => l.targetBranchId === options.branchId || l.currentAssignment?.branchId === options.branchId,
      );
    }

    if (options?.unassignedOnly) {
      all = all.filter(
        (l) => l.assignmentStatus === 'UNASSIGNED' || l.assignmentStatus === 'ASSIGNED_TO_AGENCY',
      );
    }

    all.sort((a, b) => new Date(b.lastActivityAtIso).getTime() - new Date(a.lastActivityAtIso).getTime());

    let startIndex = 0;
    if (options?.cursor) {
      const idx = all.findIndex((l) => l.id === options.cursor);
      if (idx >= 0) {
        startIndex = idx + 1;
      }
    }

    const items = all.slice(startIndex, startIndex + limit);
    const nextCursor = items.length === limit && startIndex + limit < all.length ? items[items.length - 1].id : undefined;

    return { items, nextCursor, totalMatching: all.length };
  }

  public async saveActivity(activity: LeadActivityRecord): Promise<LeadActivityRecord> {
    const list = this.activities.get(activity.leadId) ?? [];
    list.push(activity);
    this.activities.set(activity.leadId, list);
    return activity;
  }

  public async listActivities(
    leadId: string,
    visibility?: ActivityVisibility,
  ): Promise<readonly LeadActivityRecord[]> {
    const list = this.activities.get(leadId) ?? [];
    if (!visibility) return list;
    return list.filter((a) => a.visibility === visibility);
  }

  public async saveContactAccessAudit(entry: ContactAccessAuditEntry): Promise<void> {
    const list = this.contactAccessAudits.get(entry.leadId) ?? [];
    list.push(entry);
    this.contactAccessAudits.set(entry.leadId, list);
  }

  public async listContactAccessAudits(leadId: string): Promise<readonly ContactAccessAuditEntry[]> {
    return this.contactAccessAudits.get(leadId) ?? [];
  }

  public async exportCustomerLeads(customerUid: string): Promise<{
    readonly leads: readonly LeadRecord[];
    readonly activities: readonly LeadActivityRecord[];
  }> {
    const customerLeads = Array.from(this.leads.values()).filter((l) => l.customerAccountUid === customerUid);
    const allActivities: LeadActivityRecord[] = [];
    for (const lead of customerLeads) {
      const acts = this.activities.get(lead.id) ?? [];
      // Only customer-visible activities exported
      allActivities.push(...acts.filter((a) => a.visibility === 'PUBLIC_CUSTOMER'));
    }
    return { leads: customerLeads, activities: allActivities };
  }

  public async anonymizeCustomerLeads(customerUid: string): Promise<{ readonly anonymizedCount: number }> {
    let count = 0;
    for (const [id, lead] of this.leads.entries()) {
      if (lead.customerAccountUid === customerUid) {
        const anonymized: LeadRecord = {
          ...lead,
          customerDisplayName: 'کاربر ناشناس (حذف‌شده)',
          customerPhone: '09000000000',
          customerEmail: undefined,
          isAnonymized: true,
          updatedAtIso: new Date().toISOString(),
          lastActivityAtIso: new Date().toISOString(),
        };
        this.leads.set(id, anonymized);
        count += 1;
      }
    }
    return { anonymizedCount: count };
  }
}

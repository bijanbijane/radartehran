import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type CustomerCategory = 'BUYER' | 'SELLER' | 'TENANT' | 'LANDLORD' | 'INVESTOR'; export type CustomerRelationshipStatus = 'NEW' | 'ACTIVE' | 'QUALIFIED' | 'CLOSED' | 'INACTIVE'; export interface CrmCustomerRecord { customerId: string; organizationId: string; fullName: string; phone: string; email?: string | null; category: CustomerCategory; relationshipStatus: CustomerRelationshipStatus; assignedAgentId: string | null; registeredAtIso: string; budgetCapToman?: number | null; preferredHoodIds?: number[]; savedListingIds?: string[]; internalNotes?: string[]; }
export type CrmLeadStatus = 'NEW' | 'UNASSIGNED' | 'ASSIGNED' | 'ACTIVE' | 'QUALIFIED' | 'CONVERTED' | 'CLOSED_REJECTED'; export interface CrmLeadRecord { leadId: string; organizationId: string; customerId: string; customerName: string; phone: string; interestedListingId?: string | null; sourceChannel?: 'DIRECT_INQUIRY' | 'PRICE_ALERT' | 'REFERRAL' | 'WALK_IN' | null; status: CrmLeadStatus; assignedAgentId: string | null; priority?: 'HIGH' | 'MEDIUM' | 'LOW' | null; createdAtIso: string; } export type KanbanOpportunityStage = 'INQUIRY' | 'VIEWING_SCHEDULED' | 'OFFER_NEGOTIATION' | 'CONTRACT_DRAFTING' | 'CLOSED_WON' | 'CLOSED_LOST'; export interface CrmOpportunityCard {
  opportunityId: string; organizationId: string; customerId: string; customerName: string; listingId: string; propertyTitle: string; assignedAgentId: string; estimatedValueToman?: number | null; stage: KanbanOpportunityStage; lastActivityAtIso: string; }
export type CrmInteractionType = 'PHONE_CALL' | 'IN_PERSON_MEETING' | 'PROPERTY_VISIT' | 'ONLINE_MEETING' | 'MESSAGE' | 'EMAIL' | 'OTHER'; export interface CrmInteractionRecord {
  interactionId: string; organizationId: string; customerId: string; interactionType: CrmInteractionType; occurredAtIso: string; assignedAgentId: string; subject: string; description: string; outcome: string; relatedListingId?: string | null; attachedDocumentIds?: string[]; isPrivateNote?: boolean; }
export type AgentTaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'; export interface AgentTaskRecord { taskId: string; organizationId: string; title: string; description?: string; assigneeAgentId: string; dueAtIso: string; priority?: 'HIGH' | 'MEDIUM' | 'LOW' | null; relatedCustomerId?: string | null; relatedListingId?: string | null; category: 'FOLLOW_UP' | 'VIEWING' | 'DOCUMENT_CHECK' | 'CONTRACT_PREP' | 'GENERAL'; status: AgentTaskStatus; }
export type PropertyViewingState = 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED' | 'NO_SHOW'; export interface PropertyViewingRecord {
  viewingId: string; organizationId: string; listingId: string; propertyTitle: string; customerId: string; customerName: string; assignedAgentId: string; startAtIso: string; endAtIso: string; meetingLocation: string; state: PropertyViewingState; notes?: string; }
export interface PostViewingFeedbackRecord { feedbackId: string; viewingId: string; customerId: string; listingId: string; overallScore1To5: number; conditionScore1To5: number; locationScore1To5: number; pricePerception: 'FAIR' | 'HIGH' | 'LOW' | 'UNSPECIFIED';
  interestLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'; customerComment: string; privateAgentNote?: string; recordedAtIso: string; }
export interface AgencyDocumentRecord { documentId: string; organizationId: string; fileName: string; category: 'CUSTOMER' | 'PROPERTY' | 'CONTRACT' | 'ORGANIZATION'; relatedCustomerId?: string | null; relatedListingId?: string | null; relatedContractId?: string | null; uploadedAtIso: string; ownerUid: string; status: 'VALIDATED' | 'UPLOADING' | 'FAILED'; versionNumber: number; }
export type CustomerContractLifecycleState = 'DRAFT' | 'UNDER_REVIEW' | 'SIGNED' | 'ACTIVE' | 'TERMINATED' | 'EXPIRED';
export interface CustomerContractRecord {
  contractId: string; organizationId: string; title: string; contractType: 'PURCHASE_MOBALLEGHNAMEH' | 'RESIDENTIAL_LEASE' | 'AGENCY_MANDATE';
  customerId: string; relatedListingId: string; partyNames: string[]; startDateIso: string; endDateIso?: string | null; nextDeadlineIso?: string | null;
  state: CustomerContractLifecycleState; linkedDocumentIds: string[];
}
export type AgencyNotificationCategory =
  | 'NEW_INQUIRY'
  | 'ASSIGNED_LEAD'
  | 'UPCOMING_FOLLOW_UP'
  | 'CONTRACT_DEADLINE'
  | 'PROPERTY_VIEWING'
  | 'TEAM_INVITATION'
  | 'DOCUMENT_PROCESSING';
export interface AgencyNotificationRecord {
  notificationId: string;
  organizationId: string;
  category: AgencyNotificationCategory;
  titleFa: string;
  createdAtIso: string;
  isRead: boolean;
  priority?: 'HIGH' | 'NORMAL' | null;
  relatedEntityId?: string | null;
  referenceAvailable: boolean;
}
export type CommunicationDeliveryStatus = 'DRAFT' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED';
export interface CustomerCommunicationRecord {
  messageId: string;
  organizationId: string;
  customerId: string;
  senderLabel: string;
  recipientLabel: string;
  sentAtIso: string;
  channel: 'SMS' | 'INTERNAL_NOTE' | 'EMAIL' | 'PHONE_LOG';
  subject: string;
  contentPreview: string;
  deliveryStatus: CommunicationDeliveryStatus;
}
export type AutomationTriggerType =
  | 'CUSTOMER_REGISTERED'
  | 'NEW_INQUIRY_RECEIVED'
  | 'TASK_DEADLINE_APPROACHING'
  | 'VIEWING_COMPLETED';
export type AutomationActionType =
  | 'CREATE_FOLLOW_UP_TASK'
  | 'ASSIGN_TO_AGENT'
  | 'NOTIFY_ORG_ADMIN';
export interface WorkflowAutomationRule {
  workflowId: string;
  organizationId: string;
  nameFa: string;
  descriptionFa: string;
  trigger: AutomationTriggerType | null;
  action: AutomationActionType | null;
  enabled: boolean;
  lastExecutionStatus?: 'NEVER_RUN' | 'SUCCEEDED' | 'FAILED';
  lastExecutedAtIso?: string | null;
}
export function computeCrmDashboardMetrics(params: {
  organizationId: string;
  customers: readonly CrmCustomerRecord[];
  leads: readonly CrmLeadRecord[];
  tasks: readonly AgentTaskRecord[];
}) {
  const orgCustomers = params.customers.filter((c) => c.organizationId === params.organizationId);
  const orgLeads = params.leads.filter((l) => l.organizationId === params.organizationId);
  const orgTasks = params.tasks.filter((t) => t.organizationId === params.organizationId);
  return {
    totalCustomers: orgCustomers.length,
    newLeads: orgLeads.filter((l) => l.status === 'NEW' || l.status === 'UNASSIGNED').length,
    activeLeads: orgLeads.filter((l) => l.status === 'ACTIVE' || l.status === 'ASSIGNED').length,
    followUpTasks: orgTasks.filter((t) => t.category === 'FOLLOW_UP' && t.status !== 'COMPLETED' && t.status !== 'CANCELLED').length,
    qualifiedProspects: orgLeads.filter((l) => l.status === 'QUALIFIED').length,
    closedOpportunities: orgLeads.filter((l) => l.status === 'CONVERTED').length,
    inactiveLeads: orgLeads.filter((l) => l.status === 'CLOSED_REJECTED').length,
    byCategory: {
      BUYER: orgCustomers.filter((c) => c.category === 'BUYER').length,
      SELLER: orgCustomers.filter((c) => c.category === 'SELLER').length,
      TENANT: orgCustomers.filter((c) => c.category === 'TENANT').length,
      LANDLORD: orgCustomers.filter((c) => c.category === 'LANDLORD').length,
      INVESTOR: orgCustomers.filter((c) => c.category === 'INVESTOR').length,
    },
  };
}
export function normalizeCrmSearchToken(input: string): string {
  return String(input || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
export function maskCustomerPhoneForRole(phone: string, canViewUnmasked: boolean): string {
  const clean = String(phone || '').trim();
  if (!clean) return 'ثبت نشده';
  if (canViewUnmasked) return clean;
  if (clean.length >= 10) return `${clean.slice(0, 4)}***${clean.slice(-4)}`;
  return '***';
}
export function detectCustomerContactDuplicates(customers: readonly CrmCustomerRecord[]): Record<string, string[]> {
  const byPhone = new Map<string, string[]>();
  for (const c of customers) {
    const normPhone = normalizeCrmSearchToken(c.phone).replace(/\D/g, '');
    if (!normPhone) continue;
    const list = byPhone.get(normPhone) || [];
    list.push(c.customerId);
    byPhone.set(normPhone, list);
  }
  const duplicates: Record<string, string[]> = Object.create(null);
  for (const [, ids] of byPhone.entries()) {
    if (ids.length > 1) {
      for (const id of ids) {
        if (id === '__proto__' || id === 'constructor' || id === 'prototype') continue;
        duplicates[id] = ids.filter((other) => other !== id);
      }
    }
  }
  return duplicates;
}
/**
 * Prompt 1201: Builds a Customer 360-degree profile with explicit completeness flags and tenant isolation.
 */
export function buildCustomer360Profile(params: {
  actorOrganizationId: string;
  customer: CrmCustomerRecord;
  leads: readonly CrmLeadRecord[];
  interactions: readonly CrmInteractionRecord[];
  tasks: readonly AgentTaskRecord[];
  documents: readonly AgencyDocumentRecord[];
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
}) {
  if (params.customer.organizationId !== params.actorOrganizationId) {
    return { accessAllowed: false as const, reasonFa: 'عدم دسترسی به اطلاعات سازمان دیگر (Cross-Tenant Blocked).' };
  }
  const areaUnit = params.areaUnit ?? getStoredAreaUnit();
  const intlCurrency = params.intlCurrency ?? getStoredIntlCurrency();
  const customerId = params.customer.customerId;
  const customerLeads = params.leads.filter((l) => l.organizationId === params.actorOrganizationId && l.customerId === customerId);
  const customerInteractions = params.interactions
    .filter((i) => i.organizationId === params.actorOrganizationId && i.customerId === customerId)
    .sort((a, b) => Date.parse(b.occurredAtIso) - Date.parse(a.occurredAtIso));
  const pendingFollowUps = params.tasks.filter(
    (t) => t.organizationId === params.actorOrganizationId && t.relatedCustomerId === customerId && (t.status === 'PENDING' || t.status === 'IN_PROGRESS')
  );
  const customerDocs = params.documents.filter((d) => d.organizationId === params.actorOrganizationId && d.relatedCustomerId === customerId);
  const hasBudgetCap = typeof params.customer.budgetCapToman === 'number' && params.customer.budgetCapToman > 0;
  return {
    accessAllowed: true as const,
    customer: params.customer,
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    budgetCapIntlText: hasBudgetCap ? formatMillionTomanAsIntlCurrency((params.customer.budgetCapToman || 0) / 1_000_000, intlCurrency) : null,
    completeness: {
      hasEmail: Boolean(params.customer.email && params.customer.email.trim()),
      hasBudgetCap,
      hasPreferredHoods: Array.isArray(params.customer.preferredHoodIds) && params.customer.preferredHoodIds.length > 0,
    },
    inquiries: customerLeads,
    recordedInteractions: customerInteractions,
    pendingFollowUps,
    documents: customerDocs,
  };
}
/**
 * Prompt 1203: Validates Kanban sales pipeline stage transitions and agent permissions.
 */
const ALLOWED_KANBAN_TRANSITIONS: Record<KanbanOpportunityStage, readonly KanbanOpportunityStage[]> = {
  INQUIRY: ['VIEWING_SCHEDULED', 'CLOSED_LOST'],
  VIEWING_SCHEDULED: ['INQUIRY', 'OFFER_NEGOTIATION', 'CLOSED_LOST'],
  OFFER_NEGOTIATION: ['VIEWING_SCHEDULED', 'CONTRACT_DRAFTING', 'CLOSED_LOST'],
  CONTRACT_DRAFTING: ['OFFER_NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'],
  CLOSED_WON: [],
  CLOSED_LOST: ['INQUIRY'],
};
export function validateKanbanStageTransition(params: {
  currentStage: KanbanOpportunityStage;
  targetStage: KanbanOpportunityStage;
  actorAgentId: string;
  actorRole: 'ORG_ADMIN' | 'ORG_AGENT';
  assignedAgentId: string;
}): { allowed: boolean; reasonFa: string | null } {
  if (params.currentStage === params.targetStage) return { allowed: true, reasonFa: null };
  if (params.actorRole !== 'ORG_ADMIN' && params.actorAgentId !== params.assignedAgentId) {
    return { allowed: false, reasonFa: 'فقط مشاور مسئول پرونده یا مدیر آژانس مجاز به تغییر مرحله مذاکره است.' };
  }
  const validTargets = ALLOWED_KANBAN_TRANSITIONS[params.currentStage] || [];
  if (!validTargets.includes(params.targetStage)) {
    return { allowed: false, reasonFa: `انتقال مستقیم از مرحله «${params.currentStage}» به «${params.targetStage}» بدون طی مراحل میانی مجاز نیست.` };
  }
  return { allowed: true, reasonFa: null };
}
export function classifyFollowUpUrgency(task: AgentTaskRecord, nowMs: number): 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | 'COMPLETED' | 'CANCELLED' {
  if (task.status === 'COMPLETED' || task.status === 'CANCELLED') return task.status;
  const dueMs = Date.parse(task.dueAtIso);
  if (!Number.isFinite(dueMs)) return 'UPCOMING';
  const diffMs = dueMs - nowMs;
  return diffMs < 0 ? 'OVERDUE' : diffMs <= 86_400_000 ? 'DUE_TODAY' : 'UPCOMING';
}
export function detectViewingScheduleConflicts(viewings: readonly PropertyViewingRecord[]): Array<{ viewingA: string; viewingB: string; agentId: string }> {
  const conflicts: Array<{ viewingA: string; viewingB: string; agentId: string }> = [];
  const active = viewings.filter((v) => v.state === 'SCHEDULED' || v.state === 'CONFIRMED');
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      if (a.organizationId !== b.organizationId || a.assignedAgentId !== b.assignedAgentId) continue;
      if (Date.parse(a.startAtIso) < Date.parse(b.endAtIso) && Date.parse(b.startAtIso) < Date.parse(a.endAtIso)) {
        conflicts.push({ viewingA: a.viewingId, viewingB: b.viewingId, agentId: a.assignedAgentId });
      }
    }
  }
  return conflicts;
}
export function computeAgentPerformanceMetrics(params: {
  agentId: string;
  leads: readonly CrmLeadRecord[];
  interactions: readonly CrmInteractionRecord[];
  viewings: readonly PropertyViewingRecord[];
  tasks: readonly AgentTaskRecord[];
  opportunities: readonly CrmOpportunityCard[];
}) {
  const agentLeads = params.leads.filter((l) => l.assignedAgentId === params.agentId);
  const agentInteractions = params.interactions.filter((i) => i.assignedAgentId === params.agentId);
  const completedViewings = params.viewings.filter((v) => v.assignedAgentId === params.agentId && v.state === 'COMPLETED');
  const openFollowUps = params.tasks.filter(
    (t) => t.assigneeAgentId === params.agentId && t.category === 'FOLLOW_UP' && (t.status === 'PENDING' || t.status === 'IN_PROGRESS')
  );
  const closedWon = params.opportunities.filter((o) => o.assignedAgentId === params.agentId && o.stage === 'CLOSED_WON');
  return {
    agentId: params.agentId,
    assignedLeadsCount: agentLeads.length,
    recordedInteractionsCount: agentInteractions.length,
    completedViewingsCount: completedViewings.length,
    openFollowUpsCount: openFollowUps.length,
    closedWonOpportunitiesCount: closedWon.length,
    drillDownLeadIds: agentLeads.map((l) => l.leadId),
  };
}
export function validateWorkflowAutomationConfig(rule: WorkflowAutomationRule, actorRole: 'ORG_ADMIN' | 'ORG_AGENT'): { valid: boolean; errorsFa: string[] } {
  const errorsFa: string[] = [];
  if (actorRole !== 'ORG_ADMIN') errorsFa.push('فقط مدیر آژانس مجاز به فعال‌سازی یا ویرایش قوانین اتوماسیون است.');
  if (!rule.nameFa || rule.nameFa.trim().length < 3) errorsFa.push('نام گردش کار باید حداقل ۳ کاراکتر باشد.');
  if (!rule.trigger) errorsFa.push('رویداد آغازگر (Trigger) انتخاب نشده است.');
  if (!rule.action) errorsFa.push('عملیات اجرایی (Action) انتخاب نشده است.');
  return { valid: errorsFa.length === 0, errorsFa };
}
export function buildReproducibleCrmReport(params: {
  organizationId: string;
  reportType: 'LEADS' | 'CUSTOMERS' | 'AGENT_ACTIVITY' | 'VIEWINGS';
  appliedFilters: Record<string, string>;
  rows: ReadonlyArray<Record<string, string | number | null>>;
  nowIso?: string;
}) {
  const generatedAtIso = params.nowIso || new Date().toISOString();
  const headers = (params.rows.length > 0 ? Object.keys(params.rows[0]) : ['وضعیت']).filter((h) => h !== '__proto__' && h !== 'constructor' && h !== 'prototype');
  const sanitizeCell = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined || val === '') return 'ثبت نشده';
    const str = String(val).replace(/[\r\n]+/g, ' ');
    return /^\s*[=+\-@\t]/.test(str) ? `'${str}` : str;
  };
  const headerLine = headers.map((h) => `"${sanitizeCell(h).replace(/"/g, '""')}"`).join(',');
  const boundedRows = params.rows.slice(0, 5000);
  const csvLines = [headerLine, ...boundedRows.map((r) => headers.map((h) => `"${sanitizeCell(r[h]).replace(/"/g, '""')}"`).join(','))];
  return { organizationId: params.organizationId, reportType: params.reportType, generatedAtIso, appliedFilters: params.appliedFilters, rowCount: boundedRows.length, csvContent: csvLines.join('\n') };
}
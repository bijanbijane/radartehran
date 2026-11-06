import { addMonetaryExact, multiplyMonetaryExact, subtractMonetaryExact } from './propertyComparisonAndFinancialPrecision';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type AgencySystemRole = 'WORKSPACE_OWNER' | 'WORKSPACE_ADMIN' | 'BRANCH_MANAGER' | 'TEAM_LEAD' | 'SENIOR_AGENT' | 'JUNIOR_AGENT' | 'AUDITOR_READONLY';
export type AgencyWorkspaceRole = AgencySystemRole;
export type AgencyResourceDomain = 'WORKSPACE_SETTINGS' | 'BRANCH_MANAGEMENT' | 'TEAM_MANAGEMENT' | 'CRM_CONTACTS' | 'PROPERTY_LISTINGS' | 'LEADS' | 'DEALS_AND_CASES' | 'DOCUMENTS' | 'FINANCIAL_COMMISSIONS' | 'REPORTS' | 'DATA_EXPORT' | 'AUDIT_LOGS';
export type AgencyActionVerb = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'ASSIGN' | 'EXPORT' | 'APPROVE' | 'ADMINISTER';
export type PermissionKey = `${AgencyResourceDomain}:${AgencyActionVerb}`;
export interface AgencyMemberAuthorizationContext { memberUid: string; workspaceId: string; branchId: string | null; teamId: string | null; membershipStatus: 'ACTIVE' | 'SUSPENDED' | 'REVOKED'; role: AgencySystemRole; explicitAllow?: readonly PermissionKey[]; explicitDeny?: readonly PermissionKey[]; }
const ALL_DOMAINS: readonly AgencyResourceDomain[] = [
  'WORKSPACE_SETTINGS', 'BRANCH_MANAGEMENT', 'TEAM_MANAGEMENT', 'CRM_CONTACTS', 'PROPERTY_LISTINGS', 'LEADS', 'DEALS_AND_CASES', 'DOCUMENTS', 'FINANCIAL_COMMISSIONS', 'REPORTS', 'DATA_EXPORT', 'AUDIT_LOGS', ];
const ALL_VERBS: readonly AgencyActionVerb[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'ASSIGN', 'EXPORT', 'APPROVE', 'ADMINISTER']; function buildAllPermissions(): PermissionKey[] { const list: PermissionKey[] = [];
  for (const d of ALL_DOMAINS) for (const v of ALL_VERBS) list.push(`${d}:${v}`);
  return list; }
export const ROLE_PERMISSION_MATRIX: Readonly<Record<AgencySystemRole, readonly PermissionKey[]>> = { WORKSPACE_OWNER: buildAllPermissions(), WORKSPACE_ADMIN: buildAllPermissions().filter((p) => p !== 'WORKSPACE_SETTINGS:DELETE'), BRANCH_MANAGER: [
    'BRANCH_MANAGEMENT:VIEW', 'TEAM_MANAGEMENT:VIEW', 'TEAM_MANAGEMENT:EDIT', 'CRM_CONTACTS:VIEW', 'CRM_CONTACTS:CREATE', 'CRM_CONTACTS:EDIT', 'CRM_CONTACTS:ASSIGN', 'PROPERTY_LISTINGS:VIEW', 'PROPERTY_LISTINGS:CREATE', 'PROPERTY_LISTINGS:EDIT', 'PROPERTY_LISTINGS:APPROVE', 'LEADS:VIEW', 'LEADS:CREATE', 'LEADS:EDIT', 'LEADS:ASSIGN',
    'DEALS_AND_CASES:VIEW', 'DEALS_AND_CASES:CREATE', 'DEALS_AND_CASES:EDIT', 'DEALS_AND_CASES:APPROVE', 'DOCUMENTS:VIEW', 'DOCUMENTS:CREATE', 'DOCUMENTS:APPROVE', 'FINANCIAL_COMMISSIONS:VIEW', 'FINANCIAL_COMMISSIONS:APPROVE', 'REPORTS:VIEW', 'AUDIT_LOGS:VIEW', ], TEAM_LEAD: [
    'CRM_CONTACTS:VIEW', 'CRM_CONTACTS:CREATE', 'CRM_CONTACTS:EDIT', 'PROPERTY_LISTINGS:VIEW', 'PROPERTY_LISTINGS:CREATE', 'PROPERTY_LISTINGS:EDIT', 'LEADS:VIEW', 'LEADS:CREATE', 'LEADS:EDIT', 'LEADS:ASSIGN', 'DEALS_AND_CASES:VIEW', 'DEALS_AND_CASES:CREATE', 'DEALS_AND_CASES:EDIT',
    'DOCUMENTS:VIEW', 'DOCUMENTS:CREATE', 'REPORTS:VIEW', ],
  SENIOR_AGENT: [
    'CRM_CONTACTS:VIEW', 'CRM_CONTACTS:CREATE', 'CRM_CONTACTS:EDIT', 'PROPERTY_LISTINGS:VIEW', 'PROPERTY_LISTINGS:CREATE', 'PROPERTY_LISTINGS:EDIT',
    'LEADS:VIEW', 'LEADS:CREATE', 'LEADS:EDIT',
    'DEALS_AND_CASES:VIEW', 'DEALS_AND_CASES:CREATE', 'DEALS_AND_CASES:EDIT',
    'DOCUMENTS:VIEW', 'DOCUMENTS:CREATE',
  ],
  JUNIOR_AGENT: ['CRM_CONTACTS:VIEW', 'CRM_CONTACTS:CREATE', 'PROPERTY_LISTINGS:VIEW', 'LEADS:VIEW', 'LEADS:EDIT', 'DEALS_AND_CASES:VIEW', 'DOCUMENTS:VIEW'],
  AUDITOR_READONLY: ['CRM_CONTACTS:VIEW', 'PROPERTY_LISTINGS:VIEW', 'LEADS:VIEW', 'DEALS_AND_CASES:VIEW', 'DOCUMENTS:VIEW', 'FINANCIAL_COMMISSIONS:VIEW', 'REPORTS:VIEW', 'AUDIT_LOGS:VIEW'],
};
export function evaluateGranularAgencyPermission(params: {
  actor: AgencyMemberAuthorizationContext;
  targetWorkspaceId: string;
  targetBranchId?: string | null;
  domain: AgencyResourceDomain;
  action: AgencyActionVerb;
}): { allowed: boolean; statusCode: 200 | 403; reasonCode: string; reasonFa: string | null } {
  const { actor, targetWorkspaceId, targetBranchId, domain, action } = params;
  if (actor.membershipStatus !== 'ACTIVE') {
    return { allowed: false, statusCode: 403, reasonCode: 'MEMBERSHIP_NOT_ACTIVE', reasonFa: 'عضویت کاربر در آژانس تعلیق یا لغو شده است.' };
  }
  if (actor.workspaceId !== targetWorkspaceId) {
    return { allowed: false, statusCode: 403, reasonCode: 'CROSS_WORKSPACE_DENIED', reasonFa: 'دسترسی به منابع فضای کاری آژانس دیگر مجاز نیست.' };
  }
  if (targetBranchId && actor.branchId && actor.branchId !== targetBranchId && actor.role !== 'WORKSPACE_OWNER' && actor.role !== 'WORKSPACE_ADMIN' && actor.role !== 'AUDITOR_READONLY') {
    return { allowed: false, statusCode: 403, reasonCode: 'CROSS_BRANCH_DENIED', reasonFa: 'دسترسی به پرونده‌های شعبه دیگر برای این نقش مجاز نیست.' };
  }
  const key: PermissionKey = `${domain}:${action}`;
  if (actor.explicitDeny?.includes(key)) {
    return { allowed: false, statusCode: 403, reasonCode: 'EXPLICIT_DENY_RULE', reasonFa: `دسترسی «${key}» به‌طور صریح برای این عضو مسدود شده است.` };
  }
  const rolePermissions = ROLE_PERMISSION_MATRIX[actor.role] || [];
  if (!rolePermissions.includes(key) && !actor.explicitAllow?.includes(key)) {
    return { allowed: false, statusCode: 403, reasonCode: 'INSUFFICIENT_ROLE_PERMISSION', reasonFa: `نقش «${actor.role}» مجوز انجام عملیات «${key}» را ندارد.` };
  }
  return { allowed: true, statusCode: 200, reasonCode: 'AUTHORIZED', reasonFa: null };
}
export type LeadDistributionStrategy = 'ROUND_ROBIN' | 'LOWEST_ACTIVE_WORKLOAD' | 'BRANCH_MATCH' | 'SPECIALIZATION_MATCH';
export interface EligibleDistributionAgent {
  agentUid: string;
  workspaceId: string;
  branchId: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  activeLeadsCount: number;
  specializations: readonly ('BUY' | 'RENT' | 'COMMERCIAL' | 'LUXURY')[];
  lastAssignedEpochMs: number;
}
export function distributeLeadDeterministically(params: {
  leadId: string;
  workspaceId: string;
  branchId?: string | null;
  requiredSpecialization?: 'BUY' | 'RENT' | 'COMMERCIAL' | 'LUXURY' | null;
  strategy: LeadDistributionStrategy;
  candidates: readonly EligibleDistributionAgent[];
}): { assignedAgentUid: string | null; strategyUsed: LeadDistributionStrategy; fallbackReasonFa: string | null } {
  const activeInWorkspace = params.candidates.filter((c) => c.workspaceId === params.workspaceId && c.status === 'ACTIVE');
  if (activeInWorkspace.length === 0) {
    return { assignedAgentUid: null, strategyUsed: params.strategy, fallbackReasonFa: 'هیچ مشاور فعالی در این فضای کاری یافت نشد.' };
  }
  let pool = activeInWorkspace;
  if (params.branchId) {
    const bf = pool.filter((c) => c.branchId === params.branchId);
    if (bf.length > 0) pool = bf;
  }
  if (params.requiredSpecialization) {
    const sf = pool.filter((c) => c.specializations.includes(params.requiredSpecialization!));
    if (sf.length > 0) pool = sf;
  }
  const sorted = [...pool].sort((a, b) => {
    if (params.strategy === 'LOWEST_ACTIVE_WORKLOAD' && a.activeLeadsCount !== b.activeLeadsCount) return a.activeLeadsCount - b.activeLeadsCount;
    if (a.lastAssignedEpochMs !== b.lastAssignedEpochMs) return a.lastAssignedEpochMs - b.lastAssignedEpochMs;
    return a.agentUid.localeCompare(b.agentUid);
  });
  return { assignedAgentUid: sorted[0].agentUid, strategyUsed: params.strategy, fallbackReasonFa: null };
}
export interface LeadOwnershipClaimRecord {
  leadId: string;
  primaryOwnerAgentUid: string;
  branchId: string;
  version: number;
  assignedByUid: string;
  assignedAtIso: string;
}
export function detectAndResolveLeadOwnershipConflicts(claims: readonly LeadOwnershipClaimRecord[]) {
  const byLead = new Map<string, LeadOwnershipClaimRecord[]>();
  for (const c of claims) {
    const list = byLead.get(c.leadId) || [];
    list.push(c);
    byLead.set(c.leadId, list);
  }
  const conflictingLeadIds: string[] = [];
  const canonicalPrimaryByLeadId: Record<string, LeadOwnershipClaimRecord> = Object.create(null);
  for (const [leadId, records] of byLead.entries()) {
    if (leadId === '__proto__' || leadId === 'constructor' || leadId === 'prototype') continue;
    if (new Set(records.map((r) => r.primaryOwnerAgentUid)).size > 1) conflictingLeadIds.push(leadId);
    canonicalPrimaryByLeadId[leadId] = [...records].sort((a, b) => (b.version !== a.version ? b.version - a.version : Date.parse(b.assignedAtIso) - Date.parse(a.assignedAtIso)))[0];
  }
  return { hasConflict: conflictingLeadIds.length > 0, conflictingLeadIds, canonicalPrimaryByLeadId };
}
export interface CustomerMatchConstraints {
  customerId: string;
  dealIntent: 'BUY' | 'RENT';
  maxBudgetToman: number;
  preferredHoodIds: readonly number[];
  minSqm: number;
  minRooms?: number | null;
  mustHaveParking?: boolean;
}
export interface CandidatePropertyForMatching {
  listingId: string;
  title: string;
  dealType: 'BUY' | 'RENT';
  hoodId: number;
  priceToman: number | null;
  sqm: number | null;
  rooms?: number | null;
  hasParking?: boolean | null;
  lifecycleState: 'PUBLISHED' | 'DRAFT' | 'WITHDRAWN' | 'EXPIRED';
}
export interface PropertyMatchEvaluation {
  listingId: string;
  eligible: boolean;
  matchScore0To100: number;
  matchedReasonsFa: string[];
  disqualificationOrMissingNotesFa: string[];
}
export function evaluateCustomerPropertyMatch(constraints: CustomerMatchConstraints, property: CandidatePropertyForMatching): PropertyMatchEvaluation {
  const matchedReasonsFa: string[] = [];
  const notesFa: string[] = [];
  if (property.lifecycleState !== 'PUBLISHED' || property.dealType !== constraints.dealIntent || property.priceToman === null || property.priceToman <= 0 || property.priceToman > constraints.maxBudgetToman) {
    return { listingId: property.listingId, eligible: false, matchScore0To100: 0, matchedReasonsFa: [], disqualificationOrMissingNotesFa: ['عدم احراز شرایط پایه بودجه یا نوع معامله.'] };
  }
  let score = 45;
  matchedReasonsFa.push('در محدوده سقف بودجه مشتری');
  if (constraints.preferredHoodIds.includes(property.hoodId)) {
    score += 25;
    matchedReasonsFa.push('منطبق با محلات منتخب مشتری');
  }
  if (property.sqm !== null && property.sqm >= constraints.minSqm) {
    score += 20;
    matchedReasonsFa.push(`متراژ (${property.sqm} متر) منطبق با درخواست`);
  }
  if (constraints.mustHaveParking) {
    if (property.hasParking === true) {
      score += 10;
      matchedReasonsFa.push('دارای پارکینگ الزامی');
    } else {
      return { listingId: property.listingId, eligible: false, matchScore0To100: 0, matchedReasonsFa, disqualificationOrMissingNotesFa: ['فاقد پارکینگ الزامی.'] };
    }
  }
  return { listingId: property.listingId, eligible: true, matchScore0To100: Math.min(100, score), matchedReasonsFa, disqualificationOrMissingNotesFa: notesFa };
}
export type OfferProposalStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED';
export interface NegotiationOfferVersion {
  offerId: string;
  parentOfferId: string | null;
  caseId: string;
  revisionNumber: number;
  proposerRole: 'BUYER' | 'SELLER' | 'TENANT' | 'LANDLORD';
  proposedAmountToman: number;
  conditionsFa: string;
  internalAgentNoteFa?: string;
  status: OfferProposalStatus;
  createdAtIso: string;
}
export function appendCounterOfferImmutable(
  history: readonly NegotiationOfferVersion[],
  nextInput: { offerId: string; parentOfferId: string | null; caseId: string; proposerRole: NegotiationOfferVersion['proposerRole']; proposedAmountToman: number; conditionsFa: string; internalAgentNoteFa?: string; createdAtIso: string }
): { ok: boolean; errorFa: string | null; updatedHistory: NegotiationOfferVersion[] } {
  if (history.length >= 100 || !Number.isFinite(nextInput.proposedAmountToman) || nextInput.proposedAmountToman <= 0 || history.some((h) => h.offerId === nextInput.offerId || h.status === 'ACCEPTED')) {
    return { ok: false, errorFa: 'پیشنهاد نامعتبر یا پرونده نهایی شده است.', updatedHistory: [...history] };
  }
  return { ok: true, errorFa: null, updatedHistory: [...history, { ...nextInput, conditionsFa: String(nextInput.conditionsFa || '').slice(0, 500), revisionNumber: history.length + 1, status: 'PENDING' }] };
}
export type ChecklistDocumentState = 'MISSING' | 'REQUESTED' | 'RECEIVED' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
export interface TransactionChecklistItem {
  itemId: string;
  titleFa: string;
  mandatoryForClosing: boolean;
  state: ChecklistDocumentState;
  expiresAtIso?: string | null;
}
export function evaluateTransactionDocumentReadiness(items: readonly TransactionChecklistItem[], nowMs = Date.now()) {
  const mandatory = items.filter((i) => i.mandatoryForClosing);
  const blockingItemsFa: string[] = [];
  let verifiedMandatoryCount = 0;
  for (const item of mandatory) {
    const expMs = item.expiresAtIso ? Date.parse(item.expiresAtIso) : Number.POSITIVE_INFINITY;
    const isExpired = item.expiresAtIso ? !Number.isFinite(expMs) || !Number.isFinite(nowMs) || expMs < nowMs : false;
    if (item.state === 'VERIFIED' && !isExpired) verifiedMandatoryCount++;
    else blockingItemsFa.push(`${item.titleFa} (${isExpired ? 'EXPIRED' : item.state})`);
  }
  return { readyForClosing: blockingItemsFa.length === 0 && mandatory.length > 0, verifiedMandatoryCount, totalMandatoryCount: mandatory.length, blockingItemsFa };
}
export interface CommissionAllocationInput {
  transactionId: string;
  ruleVersion: string;
  transactionValueToman: number;
  grossCommissionRatePercent: number;
  taxAndLegalDeductionsToman: number;
  agencySharePercent: number;
  participatingAgents: ReadonlyArray<{ agentUid: string; splitOfAgentPoolPercent: number }>;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
}
export function calculateAgencyCommissionAllocation(input: CommissionAllocationInput) {
  const areaUnit = input.areaUnit ?? getStoredAreaUnit();
  const intlCurrency = input.intlCurrency ?? getStoredIntlCurrency();
  const txVal = Number.isFinite(input.transactionValueToman) && input.transactionValueToman >= 0 ? input.transactionValueToman : 0;
  const commRate = Number.isFinite(input.grossCommissionRatePercent) && input.grossCommissionRatePercent >= 0 ? input.grossCommissionRatePercent : 0;
  const taxDed = Number.isFinite(input.taxAndLegalDeductionsToman) && input.taxAndLegalDeductionsToman >= 0 ? input.taxAndLegalDeductionsToman : 0;
  const agencySharePct = Number.isFinite(input.agencySharePercent) && input.agencySharePercent >= 0 ? input.agencySharePercent : 0;
  const grossCommissionToman = Math.round(multiplyMonetaryExact(txVal, commRate / 100, 0));
  const netDistributableToman = Math.max(0, Math.round(subtractMonetaryExact(grossCommissionToman, taxDed)));
  const agencyShareToman = Math.round(multiplyMonetaryExact(netDistributableToman, agencySharePct / 100, 0));
  const totalAgentPoolToman = Math.max(0, Math.round(subtractMonetaryExact(netDistributableToman, agencyShareToman)));
  const agentAllocations = input.participatingAgents.map((a) => {
    const splitPct = Number.isFinite(a.splitOfAgentPoolPercent) && a.splitOfAgentPoolPercent >= 0 ? a.splitOfAgentPoolPercent : 0;
    return {
      agentUid: a.agentUid,
      splitPercent: splitPct,
      allocatedAmountToman: Math.round(multiplyMonetaryExact(totalAgentPoolToman, splitPct / 100, 0)),
      paymentStatus: 'CALCULATED_UNPAID' as const,
    };
  });
  return {
    valid: true as const, transactionId: input.transactionId, ruleVersion: input.ruleVersion,
    grossCommissionToman, netDistributableToman, displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    netDistributableIntlText: formatMillionTomanAsIntlCurrency(netDistributableToman / 1_000_000, intlCurrency),
    agencyShareToman, totalAgentPoolToman, agentAllocations,
    reconciledTotalToman: addMonetaryExact(agencyShareToman, totalAgentPoolToman),
  };
}
export function validateMemberOffboardingAndHandover(params: {
  memberUid: string;
  operation: 'SUSPEND' | 'REMOVE';
  activeOwnedLeadIds: readonly string[];
  activeOwnedCaseIds: readonly string[];
  reassignedToAgentUid: string | null;
  reassignedTargetActive: boolean;
}) {
  const hasActiveRecords = params.activeOwnedLeadIds.length > 0 || params.activeOwnedCaseIds.length > 0;
  if (hasActiveRecords && (!params.reassignedToAgentUid || !params.reassignedTargetActive || params.reassignedToAgentUid === params.memberUid)) {
    return { canCompleteOffboarding: false, requiresHandoverFirst: true, blockingReasonFa: 'نیازمند تعیین مشاور جایگزین فعال پیش از خروج عضو.' };
  }
  return { canCompleteOffboarding: true, requiresHandoverFirst: false, blockingReasonFa: null };
}
export interface AgencyAuditLedgerEntry {
  eventId: string;
  workspaceId: string;
  actorUid: string;
  actionCategory: 'MEMBERSHIP_CHANGE' | 'PERMISSION_CHANGE' | 'LEAD_ASSIGNMENT' | 'DEAL_STAGE_CHANGE' | 'COMMISSION_CALCULATION' | 'DATA_EXPORT';
  resourceId: string;
  outcome: 'SUCCESS' | 'DENIED';
  timestampIso: string;
  redactedSummaryFa: string;
}
export function createSanitizedAgencyAuditEvent(input: Omit<AgencyAuditLedgerEntry, 'redactedSummaryFa'> & { rawSummaryFa: string }): AgencyAuditLedgerEntry {
  const redactedSummaryFa = String(input.rawSummaryFa || '')
    .replace(/(?:token|password|secret|Bearer)\s*[:=]?\s*\S+/gi, '[REDACTED_SECRET]')
    .replace(/\b09\d{9}\b/g, '[REDACTED_PHONE]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
    .slice(0, 280);
  return { eventId: input.eventId, workspaceId: input.workspaceId, actorUid: input.actorUid, actionCategory: input.actionCategory, resourceId: input.resourceId, outcome: input.outcome, timestampIso: input.timestampIso, redactedSummaryFa };
}
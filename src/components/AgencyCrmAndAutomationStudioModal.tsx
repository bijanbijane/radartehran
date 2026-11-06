import React, { useState, useMemo } from 'react'; import { Users, Kanban, ShieldCheck, Workflow, PhoneCall, Eye, EyeOff, GitMerge, Send, X } from 'lucide-react'; import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator'; import { computeCrmDashboardMetrics, normalizeCrmSearchToken, maskCustomerPhoneForRole, buildCustomer360Profile, type CrmCustomerRecord, type CrmLeadRecord, type CrmInteractionRecord, type AgentTaskRecord } from '../utils/agencyCrmWorkflowAndReportingEngine'; import { evaluateGranularAgencyPermission, evaluateCustomerPropertyMatch, appendCounterOfferImmutable, evaluateTransactionDocumentReadiness, calculateAgencyCommissionAllocation, type AgencySystemRole, type NegotiationOfferVersion } from '../utils/agencyEnterpriseOperationsAndGovernanceEngine'; import { evaluateMultiLevelApprovalDecision, evaluateSlaAndEscalationState, computeAgentWorkloadCapacity, synchronizeOperationsQueue, evaluateDeclarativeBusinessRules, transitionOutboxDispatchAttempt, type ApprovalRequestRecord, type AgencyBusinessCalendarConfig, type TransactionalOutboxRecord } from '../utils/agencyAutomationOutboxAndSlaEngine';
import { detectStalledDealsExplainable, evaluateAgencyDuplicateLeadSignals, executeControlledCrmRecordMerge, evaluateOutboundMessageEligibilityAndIdempotency, type CrmMergeableRecord, type TrackedOutboundMessage } from '../utils/agencyDeduplicationAndMessagingGovernance'; import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { AreaUnitToggle, useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { useDialogFocus } from './useDialogFocus'; export interface AgencyCrmAndAutomationStudioModalProps { isOpen: boolean; onClose: () => void; } type StudioTabId = 'crm_360_dedup' | 'pipeline_ops_queue' | 'approvals_sla_capacity' | 'workflow_inbox_outbox'; const INITIAL_CUSTOMERS: CrmCustomerRecord[] = [
  { customerId: 'cust-101', organizationId: 'org-tehran-prime', fullName: 'کیوان رضایی', phone: '09121112233', email: 'keyvan@example.com', category: 'BUYER', relationshipStatus: 'QUALIFIED', assignedAgentId: 'agent-1', registeredAtIso: '2026-04-10T09:00:00Z', budgetCapToman: 14_500_000_000, preferredHoodIds: [1, 3], savedListingIds: ['lst-201'] }, { customerId: 'cust-102', organizationId: 'org-tehran-prime', fullName: 'سارا محمدی', phone: '09124445566', email: null, category: 'TENANT', relationshipStatus: 'ACTIVE', assignedAgentId: 'agent-2', registeredAtIso: '2026-04-18T11:30:00Z', budgetCapToman: null, preferredHoodIds: [5], savedListingIds: [] }, { customerId: 'cust-103', organizationId: 'org-tehran-prime', fullName: 'کیوان رضایی (ورودی تکراری)', phone: '09121112233', email: null, category: 'INVESTOR', relationshipStatus: 'NEW', assignedAgentId: 'agent-1', registeredAtIso: '2026-04-22T14:00:00Z' }, ]; const INITIAL_LEADS: CrmLeadRecord[] = [
  { leadId: 'lead-301', organizationId: 'org-tehran-prime', customerId: 'cust-101', customerName: 'کیوان رضایی', phone: '09121112233', interestedListingId: 'lst-201', sourceChannel: 'DIRECT_INQUIRY', status: 'QUALIFIED', assignedAgentId: 'agent-1', priority: 'HIGH', createdAtIso: '2026-04-12T10:00:00Z' }, { leadId: 'lead-302', organizationId: 'org-tehran-prime', customerId: 'cust-102', customerName: 'سارا محمدی', phone: '09124445566', interestedListingId: 'lst-205', sourceChannel: 'PRICE_ALERT', status: 'ACTIVE', assignedAgentId: 'agent-2', priority: 'MEDIUM', createdAtIso: '2026-04-19T12:00:00Z' }, ]; const INITIAL_TASKS: AgentTaskRecord[] = [ { taskId: 'tsk-601', organizationId: 'org-tehran-prime', title: 'پیگیری نظر نهایی پس از بازدید سعادت‌آباد', assigneeAgentId: 'agent-1', dueAtIso: '2026-04-20T12:00:00Z', priority: 'HIGH', relatedCustomerId: 'cust-101', relatedListingId: 'lst-201', category: 'FOLLOW_UP', status: 'PENDING' }, { taskId: 'tsk-602', organizationId: 'org-tehran-prime', title: 'استعلام کد رهگیری پیش‌نویس اجاره ونک', assigneeAgentId: 'agent-2', dueAtIso: '2026-11-05T12:00:00Z', priority: 'MEDIUM', relatedCustomerId: 'cust-102', relatedListingId: 'lst-205', category: 'CONTRACT_PREP', status: 'IN_PROGRESS' }, ]; const AGENCY_CALENDAR: AgencyBusinessCalendarConfig = { calendarId: 'cal-tehran-1405', workspaceId: 'org-tehran-prime', version: 3, timezone: 'Asia/Tehran', workingDaysOfWeek: [6, 0, 1, 2, 3], workStartHour: 8, workEndHour: 17, holidayDatesIso: ['2026-05-04'], exceptionalWorkingDatesIso: ['2026-05-08'],
}; export const AgencyCrmAndAutomationStudioModal: React.FC<AgencyCrmAndAutomationStudioModalProps> = ({ isOpen, onClose }) => { const [areaUnit] = useAreaUnit(); const [currency] = useIntlCurrency(); const [locale] = useRadarLocale(); const showIntl = currency !== 'IRT'; const dialogRef = useDialogFocus(isOpen, onClose); const [activeTab, setActiveTab] = useState<StudioTabId>('crm_360_dedup'); const [actorRole, setActorRole] = useState<AgencySystemRole>('WORKSPACE_ADMIN'); const [actorUserId, setActorUserId] = useState<'mgr-1' | 'agent-1'>('mgr-1'); const [searchQuery, setSearchQuery] = useState(''); const [selectedCustomerId, setSelectedCustomerId] = useState('cust-101');
  const [revealPhones, setRevealPhones] = useState(false); const [interactions, setInteractions] = useState<CrmInteractionRecord[]>([ { interactionId: 'int-501', organizationId: 'org-tehran-prime', customerId: 'cust-101', interactionType: 'PHONE_CALL', occurredAtIso: '2026-04-24T15:30:00Z', assignedAgentId: 'agent-1', subject: 'هماهنگی بازدید حضوری سعادت‌آباد', description: 'مدارک بودجه نقدی تایید شد.', outcome: 'تعیین وقت بازدید فردا ساعت ۱۴', relatedListingId: 'lst-201' }, ]); const [newInteractionSubject, setNewInteractionSubject] = useState(''); const [mergeOutcomeFa, setMergeOutcomeFa] = useState<string | null>(null); const [offers, setOffers] = useState<NegotiationOfferVersion[]>([ { revisionNumber: 1, offerId: 'off-1', parentOfferId: null, caseId: 'case-101', proposerRole: 'BUYER', proposedAmountToman: 13_200_000_000, conditionsFa: '۳ میلیارد نقد همزمان با مبایعه‌نامه، الباقی طی ۴۵ روز', status: 'PENDING', createdAtIso: '2026-04-25T10:00:00Z' },
    { revisionNumber: 2, offerId: 'off-2', parentOfferId: 'off-1', caseId: 'case-101', proposerRole: 'SELLER', proposedAmountToman: 13_650_000_000, conditionsFa: '۴ میلیارد همزمان با امضا، تسویه کامل در محضر', status: 'PENDING', createdAtIso: '2026-04-26T10:00:00Z' }, ]); const [approvalReq, setApprovalReq] = useState<ApprovalRequestRecord>({ approvalId: 'apr-901', workspaceId: 'org-tehran-prime', operationType: 'COMMISSION_OVERRIDE', targetResourceId: 'deal-saadat-201', makerUserId: 'agent-1', requiredLevels: 1, currentLevel: 0, status: 'PENDING', justificationFa: 'تخفیف ۱۵٪ کارمزد به دلیل خرید همزمان دو واحد توسط سرمایه‌گذار', beforeSummaryFa: 'کارمزد استاندارد: ۱۳۶.۵ میلیون تومان', afterSummaryFa: 'کارمزد اصلاح‌شده: ۱۱۶ میلیون تومان', decisions: [], expiresAtMs: Date.now() + 86_400_000 * 5, }); const [rejectionReason, setRejectionReason] = useState(''); const [approvalFeedbackFa, setApprovalFeedbackFa] = useState<string | null>(null); const [consentGranted, setConsentGranted] = useState(true); const [idempotencyKeyInput, setIdempotencyKeyInput] = useState('msg-visit-confirm-101'); const [sentMessages, setSentMessages] = useState<TrackedOutboundMessage[]>([]); const [msgFeedbackFa, setMsgFeedbackFa] = useState<string | null>(null); const [outboxRec, setOutboxRec] = useState<TransactionalOutboxRecord>({ outboxId: 'obx-501', workspaceId: 'org-tehran-prime', eventId: 'evt-deal-won-401', idempotencyKey: 'idem-evt-401', status: 'PENDING', attemptCount: 1, maxAttempts: 3, createdAtMs: Date.now() - 120_000, lastAttemptAtMs: Date.now() - 60_000, lockedByWorkerId: null, lastError: 'ACK_TIMEOUT_AFTER_DISPATCH', }); const dashboardMetrics = useMemo(() => computeCrmDashboardMetrics({ organizationId: 'org-tehran-prime', customers: INITIAL_CUSTOMERS, leads: INITIAL_LEADS, tasks: INITIAL_TASKS }), []); const mergeableRecords: CrmMergeableRecord[] = useMemo(() => [
    { recordId: 'cust-101', workspaceId: 'org-tehran-prime', fullName: 'کیوان رضایی', phone: '09121112233', email: 'keyvan@example.com', assignedAgentId: 'agent-1', interestedListingIds: ['lst-201'], interactionIds: ['int-501'], taskIds: ['tsk-601'], visitIds: ['vw-701'], activeDealIds: ['opp-401'] }, { recordId: 'cust-103', workspaceId: 'org-tehran-prime', fullName: 'کیوان رضایی (ورودی تکراری)', phone: '09121112233', email: null, assignedAgentId: 'agent-1', interestedListingIds: ['lst-209'], interactionIds: ['int-509'], taskIds: [], visitIds: ['vw-702'], activeDealIds: [] },
  ], []); const duplicateSignals = useMemo(() => evaluateAgencyDuplicateLeadSignals({ workspaceId: 'org-tehran-prime', records: mergeableRecords }), [mergeableRecords]); const filteredCustomers = useMemo(() => { const q = normalizeCrmSearchToken(searchQuery);
    return INITIAL_CUSTOMERS.filter((c) => !q || normalizeCrmSearchToken(`${c.fullName} ${c.phone} ${c.customerId}`).includes(q));
  }, [searchQuery]); const selectedCustomer = useMemo(() => INITIAL_CUSTOMERS.find((c) => c.customerId === selectedCustomerId) || INITIAL_CUSTOMERS[0], [selectedCustomerId]); const profile360 = useMemo(() => buildCustomer360Profile({ actorOrganizationId: 'org-tehran-prime', customer: selectedCustomer, leads: INITIAL_LEADS, interactions, tasks: INITIAL_TASKS, documents: [] }), [selectedCustomer, interactions]);
  const propertyMatch = useMemo(() => evaluateCustomerPropertyMatch({ customerId: 'cust-101', dealIntent: 'BUY', maxBudgetToman: 14_500_000_000, minSqm: 115, minRooms: 2, preferredHoodIds: [1, 3], mustHaveParking: true }, { listingId: 'lst-201', title: 'آپارتمان ۱۲۵ متری سعادت‌آباد', dealType: 'BUY', priceToman: 13_800_000_000, sqm: 125, rooms: 3, hoodId: 1, hasParking: true, lifecycleState: 'PUBLISHED' }), []); const commissionBreakdown = useMemo(() => calculateAgencyCommissionAllocation({
    transactionId: 'tx-saadat-201', ruleVersion: 'comm-v2', transactionValueToman: 13_800_000_000, grossCommissionRatePercent: 1, taxAndLegalDeductionsToman: 13_800_000, agencySharePercent: 45, participatingAgents: [{ agentUid: 'agent-1', splitOfAgentPoolPercent: 50 }, { agentUid: 'agent-2', splitOfAgentPoolPercent: 50 }], }), []); const docReadiness = useMemo(() => evaluateTransactionDocumentReadiness([
    { itemId: 'NATIONAL_ID_CARDS', titleFa: 'کارت ملی طرفین', mandatoryForClosing: true, state: 'VERIFIED' }, { itemId: 'TITLE_DEED_SANAD', titleFa: 'سند تک‌برگ مالکیت', mandatoryForClosing: true, state: 'VERIFIED' }, { itemId: 'MUNICIPAL_CLEARANCE', titleFa: 'مفاصاحساب شهرداری و دارایی', mandatoryForClosing: true, state: 'RECEIVED' }, ]), []);
  const opsQueue = useMemo(() => synchronizeOperationsQueue({ workspaceId: 'org-tehran-prime', items: [
      { queueItemId: 'q-1', workspaceId: 'org-tehran-prime', category: 'PENDING_APPROVAL', sourceEntityId: 'apr-901', sourceExistsAndUnresolved: approvalReq.status === 'PENDING', priority: 'CRITICAL', titleFa: 'تأیید تخفیف کارمزد پرونده سعادت‌آباد', assignedOwnerId: 'mgr-1', ageHours: 6 }, { queueItemId: 'q-2', workspaceId: 'org-tehran-prime', category: 'OVERDUE_FOLLOW_UP', sourceEntityId: 'tsk-601', sourceExistsAndUnresolved: true, priority: 'HIGH', titleFa: 'پیگیری معوق بازدید کیوان رضایی', assignedOwnerId: 'agent-1', ageHours: 29 },
      { queueItemId: 'q-3', workspaceId: 'org-tehran-prime', category: 'DATA_CONFLICT', sourceEntityId: 'cust-101:cust-103', sourceExistsAndUnresolved: !mergeOutcomeFa, priority: 'NORMAL', titleFa: 'بررسی تشابه شماره تماس دو پرونده مشتری', assignedOwnerId: 'mgr-1', ageHours: 14 }, ], }), [approvalReq.status, mergeOutcomeFa]); const stalledDeals = useMemo(() => detectStalledDealsExplainable({ workspaceId: 'org-tehran-prime', nowMs: Date.now(), deals: [
      { dealId: 'opp-401', workspaceId: 'org-tehran-prime', stage: 'VIEWING_SCHEDULED', lastInternalActivityAtMs: Date.now() - 85 * 3_600_000, awaitingExternalCustomerReply: false, isExplicitlyPaused: false }, { dealId: 'opp-402', workspaceId: 'org-tehran-prime', stage: 'OFFER_NEGOTIATION', lastInternalActivityAtMs: Date.now() - 60 * 3_600_000, awaitingExternalCustomerReply: true, isExplicitlyPaused: false }, ],
  }), []); const slaSample = useMemo(() => evaluateSlaAndEscalationState({ taskId: 'tsk-601', workspaceId: 'org-tehran-prime', priority: 'HIGH', createdAtMs: Date.parse('2026-05-02T08:00:00Z'),
    nowMs: Date.parse('2026-05-02T10:30:00Z'), pausedDurationMinutes: 15, calendar: AGENCY_CALENDAR, supervisorMemberId: 'mgr-1', supervisorIsActive: true, alreadyEscalatedLevels: [], }), []);
  const agentWorkloads = useMemo(() => [computeAgentWorkloadCapacity({ agentId: 'agent-1 (مشاور ارشد منطقه ۱)', availability: 'AVAILABLE', activeLeadsCount: 5, overdueTasksCount: 2, upcomingVisitsCount: 3, maxWeightedScoreCap: 30 }),
    computeAgentWorkloadCapacity({ agentId: 'agent-2 (مشاور اجاره و تجاری)', availability: 'AVAILABLE', activeLeadsCount: 2, overdueTasksCount: 0, upcomingVisitsCount: 1, maxWeightedScoreCap: 30 }), ], []);
  const rbacSample = useMemo(() => evaluateGranularAgencyPermission({ actor: { memberUid: actorUserId, workspaceId: 'org-tehran-prime', branchId: 'br-1', teamId: 'tm-1', role: actorRole, membershipStatus: 'ACTIVE' }, targetWorkspaceId: 'org-tehran-prime', domain: 'FINANCIAL_COMMISSIONS', action: 'APPROVE', }), [actorUserId, actorRole]);
  const declarativeRuleEval = useMemo(() => evaluateDeclarativeBusinessRules({ rules: [
      { ruleId: 'rule-vip-budget', version: 2, field: 'dealAmountToman', operator: 'GTE', expectedValue: 10_000_000_000 }, { ruleId: 'rule-doc-ready', version: 1, field: 'missingDocsCount', operator: 'EQ', expectedValue: 0, dependsOnRuleId: 'rule-vip-budget' },
    ], context: { dealAmountToman: 13_800_000_000, missingDocsCount: 0 },
  }), []); const handleControlledMerge = () => {
    const res = executeControlledCrmRecordMerge({
      actorWorkspaceId: 'org-tehran-prime', actorAuthorized: actorRole === 'WORKSPACE_ADMIN' || actorRole === 'WORKSPACE_OWNER',
      survivingRecord: mergeableRecords[0], mergedRecord: mergeableRecords[1], nowMs: Date.now(), });
    if (!res.succeeded || !res.canonicalRecord) {
      setMergeOutcomeFa('عدم مجوز کافی برای ادغام پرونده‌های تکراری (نیازمند نقش مدیر آژانس).'); return; }
    setMergeOutcomeFa(`ادغام کنترل‌شده انجام شد: پرونده بقایافته «${res.canonicalRecord.recordId}» با ${res.canonicalRecord.interactionIds.length} تعامل و اسنپ‌شات بازگشت (Rollback).`);
  };
  const handleApprovalAction = (decision: 'APPROVED' | 'REJECTED') => {
    const res = evaluateMultiLevelApprovalDecision({
      request: approvalReq, actorUserId, actorIsActiveMember: true,
      actorHasApprovePermission: actorRole === 'WORKSPACE_ADMIN' || actorRole === 'WORKSPACE_OWNER',
      decision, reasonFa: rejectionReason, nowMs: Date.now(), });
    setApprovalReq(res.updatedRequest); setApprovalFeedbackFa(res.explanationFa); };
  const handleSendTrackedMessage = () => {
    const check = evaluateOutboundMessageEligibilityAndIdempotency({
      workspaceId: 'org-tehran-prime', customerId: 'cust-101',
      channel: { channelId: 'ch-sms-1', workspaceId: 'org-tehran-prime', channelType: 'SMS', enabled: true, hasServerSideSecretReference: true, status: 'READY' },
      consent: { customerId: 'cust-101', workspaceId: 'org-tehran-prime', channelType: 'SMS', status: consentGranted ? 'GRANTED' : 'WITHDRAWN', source: 'EXPLICIT_FORM_OPT_IN', updatedAtMs: Date.now() },
      idempotencyKey: idempotencyKeyInput.trim(), existingMessages: sentMessages, nowMs: Date.now(),
    });
    if (!check.canDispatch) { setMsgFeedbackFa(check.explanationFa); return; }
    const nextMsg: TrackedOutboundMessage = {
      messageId: `msg-${Date.now()}`, workspaceId: 'org-tehran-prime', customerId: 'cust-101',
      channelType: 'SMS', idempotencyKey: idempotencyKeyInput.trim(), providerMessageId: `prv-${Date.now()}`,
      deliveryState: 'DELIVERED', sentAtMs: Date.now(), updatedAtMs: Date.now(),
    };
    setSentMessages((prev) => [nextMsg, ...prev]);
    setMsgFeedbackFa(`پیام با کلید یکتای «${nextMsg.idempotencyKey}» ارسال و تاییدیه تحویل اپراتور ثبت شد.`);
  };
  if (!isOpen) return null;
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="enterprise-crm-automation-title" dir="rtl">
      <div ref={dialogRef} onClick={(e) => e.stopPropagation()} className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 dark:border-slate-700 bg-slate-900 dark:bg-slate-900 text-slate-100 dark:text-slate-100 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 dark:border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-emerald-400" />
            <div>
              <h2 id="enterprise-crm-automation-title" className="text-base font-bold text-white">مرکز عملیات سازمانی آژانس املاک، CRM ۳۶۰ درجه، کنترل SoD و اتوماسیون گردش کار</h2>
              <p className="text-xs text-slate-400">بسته‌های ۱۱۲ و ۱۱۳ (پرامپت‌های ۱۱۷۹ تا ۱۲۵۵) · ایزولاسیون فضای کاری · موتور تصمیم‌گیری قطعی</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AreaUnitToggle compact showIntlControls />
            <select value={actorUserId} onChange={(e) => { const uid = e.target.value as 'mgr-1' | 'agent-1'; setActorUserId(uid); setActorRole(uid === 'mgr-1' ? 'WORKSPACE_ADMIN' : 'SENIOR_AGENT'); }} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200" aria-label="انتخاب کاربر فعال آژانس">
              <option value="mgr-1">کاربر فعال: مدیر آژانس (mgr-1 · WORKSPACE_ADMIN)</option>
              <option value="agent-1">کاربر فعال: مشاور ثبت‌کننده (agent-1 · SENIOR_AGENT)</option>
            </select>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="بستن پنجره"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 border-b border-slate-800 bg-slate-950/60 px-6 py-3">
          {[
            { id: 'crm_360_dedup', label: '۰۱. CRM ۳۶۰ و ادغام تکراری‌ها (۱۱۹۹–۱۲۰۴، ۱۲۳۸–۱۲۳۹)', icon: Users },
            { id: 'pipeline_ops_queue', label: `۰۲. پایپ‌لاین، تطبیق ملک، کمیسیون و صف عملیات (${opsQueue.length})`, icon: Kanban },
            { id: 'approvals_sla_capacity', label: '۰۳. تأیید چندمرحله‌ای (SoD)، SLA و ظرفیت مشاوران', icon: ShieldCheck },
            { id: 'workflow_inbox_outbox', label: '۰۴. گردش کار، قواعد شرطی، صندوق پیام و Outbox', icon: Workflow },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} type="button" onClick={() => setActiveTab(t.id as StudioTabId)} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${activeTab === t.id ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800'}`}>
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-6 text-xs">
          {activeTab === 'crm_360_dedup' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {[
                  ['کل مشتریان', dashboardMetrics.totalCustomers], ['سرنخ جدید', dashboardMetrics.newLeads],
                  ['سرنخ فعال', dashboardMetrics.activeLeads], ['پیگیری باز', dashboardMetrics.followUpTasks],
                  ['واجد شرایط', dashboardMetrics.qualifiedProspects], ['معاملات موفق', dashboardMetrics.closedOpportunities],
                  ['غیرفعال', dashboardMetrics.inactiveLeads], ].map(([label, val]) => (
                  <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="text-[11px] text-slate-400">{label}</div>
                    <div className="mt-1 text-base font-bold text-white">{Number(val).toLocaleString('fa-IR')}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 lg:col-span-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-emerald-400">دفترچه مشتریان (۱۲۰۰)</h3>
                    <button type="button" onClick={() => setRevealPhones((p) => !p)} className="inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-[11px] text-slate-200">
                      {revealPhones ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {revealPhones ? 'پوشاندن شماره' : 'نمایش شماره'}
                    </button>
                  </div>
                  <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="جست‌وجوی نام، موبایل یا کد مشتری..." className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-white" />
                  <div className="space-y-2">
                    {filteredCustomers.map((c) => (
                      <button key={c.customerId} type="button" onClick={() => setSelectedCustomerId(c.customerId)} className={`w-full rounded-lg border p-2.5 text-right transition ${selectedCustomerId === c.customerId ? 'border-emerald-500 bg-emerald-950/20' : 'border-slate-800 bg-slate-900'}`}>
                        <div className="flex items-center justify-between font-bold text-white"><span>{c.fullName}</span><span className="text-[11px] font-normal text-slate-400">{c.category} · {c.relationshipStatus}</span></div>
                        <div className="mt-1 text-[11px] text-slate-300" dir="ltr">{maskCustomerPhoneForRole(c.phone, revealPhones && actorRole === 'WORKSPACE_ADMIN')}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 lg:col-span-7">
                  {profile360.customer && (
                    <div className="border-b border-slate-800 pb-2">
                      <h3 className="font-bold text-white">پروفایل ۳۶۰ درجه: {profile360.customer.fullName} (۱۱۸۵، ۱۲۰۱)</h3>
                      <p className="mt-1 text-[11px] text-slate-400">مشاور مسئول: {profile360.customer.assignedAgentId} · سقف بودجه: {profile360.completeness.hasBudgetCap ? `${profile360.customer.budgetCapToman?.toLocaleString('fa-IR')} تومان (هر ${areaUnit === 'sqft' ? 'ft²' : 'متر'} واحد ${formatAreaShort(80, areaUnit)}: ${Math.round(convertPricePerSqmToUnit(((profile360.customer.budgetCapToman ?? 0) / 1_000_000) / 80, areaUnit)).toLocaleString('fa-IR')} م)${showIntl ? ` (${formatMillionTomanAsIntlCurrency((profile360.customer.budgetCapToman ?? 0) / 1_000_000, currency, locale)})` : ''}` : 'ثبت نشده'}</p>
                    </div>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault(); if (!newInteractionSubject.trim()) return;
                      setInteractions((prev) => [{ interactionId: `int-${Date.now()}`, organizationId: 'org-tehran-prime', customerId: selectedCustomer.customerId, interactionType: 'PHONE_CALL', occurredAtIso: new Date().toISOString(), assignedAgentId: 'agent-1', subject: newInteractionSubject.trim(), description: 'ثبت در تایم‌لاین مشتری', outcome: 'تعیین گام بعدی' }, ...prev]);
                      setNewInteractionSubject(''); }}
                    className="flex gap-2"
                  >
                    <input type="text" value={newInteractionSubject} onChange={(e) => setNewInteractionSubject(e.target.value)} placeholder="ثبت خلاصه تماس تلفنی یا جلسه حضوری جدید (۱۲۰۴)..." className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-white" />
                    <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3.5 py-1.5 font-semibold text-white"><PhoneCall className="h-3.5 w-3.5" /> ثبت تعامل</button>
                  </form>
                  <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-amber-300">بررسی و ادغام کنترل‌شده رکوردهای تکراری (۱۲۳۸، ۱۲۳۹ و ۱۲۵۰)</div>
                        {duplicateSignals.map((sig) => (
                          <div key={`${sig.primaryRecordId}-${sig.secondaryRecordId}`} className="mt-1 text-[11px] text-slate-300">
                            کاندیدها: {sig.primaryRecordId} و {sig.secondaryRecordId} · اطمینان: {sig.confidence} · {sig.matchedSignalsFa.join('، ')}
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={handleControlledMerge} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white"><GitMerge className="h-3.5 w-3.5" /> ادغام در پرونده اصلی</button>
                    </div>
                    {mergeOutcomeFa && <div className="mt-2 rounded bg-slate-900/90 p-2 text-[11px] text-emerald-300">{mergeOutcomeFa}</div>}
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'pipeline_ops_queue' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <h3 className="mb-2 font-bold text-emerald-400">صف متمرکز عملیات آژانس همگام با رکوردهای منشأ (۱۲۳۶ و ۱۲۴۵)</h3>
                  <div className="space-y-2">
                    {opsQueue.map((q) => (
                      <div key={q.queueItemId} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                        <div><div className="font-semibold text-white">{q.titleFa}</div><div className="text-[11px] text-slate-400">دسته: {q.category} · مسئول: {q.assignedOwnerId} · قدمت: {q.ageHours} ساعت</div></div>
                        <span className="text-[11px] font-bold text-amber-400">{q.priority}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <h3 className="mb-2 font-bold text-amber-400">تشخیص معاملات راکد و تفکیک انتظار پاسخ مشتری (۱۲۳۷)</h3>
                  <div className="space-y-2">
                    {stalledDeals.map((sd) => (
                      <div key={sd.dealId} className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                        <div className="font-semibold text-white">{sd.dealId} · {sd.waitingStateClassification}</div>
                        <div className="mt-1 text-[11px] text-slate-300">{sd.explanationFa}</div>
                      </div>
                    ))} </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <h3 className="mb-2 font-bold text-sky-400">موتور تطبیق شفاف مشتری و ملک (۱۱۹۰–۱۱۹۱)</h3>
                  <div className="text-sm font-bold text-white">امتیاز تطبیق: {propertyMatch.matchScore0To100} از ۱۰۰ ({propertyMatch.eligible ? 'واجد شرایط' : 'رد شده'}) · {formatAreaShort(125, areaUnit)}{showIntl ? ` · ${formatMillionTomanAsIntlCurrency(13_800, currency, locale)}` : ''} · معامله v6.4: {Math.round(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', 13_800 / 125, []).estimatedDealPricePerSqm, areaUnit)).toLocaleString('fa-IR')} م</div>
                  <ul className="mt-2 space-y-1 text-[11px] text-emerald-300">{propertyMatch.matchedReasonsFa.map((r) => <li key={r}>✓ {r}</li>)}</ul>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-bold text-emerald-400">مذاکره و پیشنهاد متقابل (۱۱۹۲–۱۱۹۳)</h3>
                    <button
                      type="button"
                      onClick={() => {
                        const res = appendCounterOfferImmutable(offers, { offerId: `off-${offers.length + 1}`, parentOfferId: offers[offers.length - 1].offerId, caseId: 'case-101', proposerRole: 'BUYER', proposedAmountToman: 13_500_000_000, conditionsFa: 'پیشنهاد نهایی خریدار', createdAtIso: new Date().toISOString() });
                        if (res.ok) setOffers(res.updatedHistory); }} className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white"
                    >
                      + ثبت پیشنهاد جدید
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {offers.map((o) => (
                      <div key={o.offerId} className="rounded border border-slate-800 bg-slate-900 p-2 text-[11px]">
                        <span className="font-bold text-white">نسخه {o.revisionNumber} ({o.proposerRole})</span> · {o.proposedAmountToman.toLocaleString('fa-IR')} تومان (هر {areaUnit === 'sqft' ? 'ft²' : 'متر'} {formatAreaShort(125, areaUnit)}: {Math.round(convertPricePerSqmToUnit((o.proposedAmountToman / 1_000_000) / 125, areaUnit)).toLocaleString('fa-IR')} م){showIntl ? ` (${formatMillionTomanAsIntlCurrency(o.proposedAmountToman / 1_000_000, currency, locale)})` : ''}
                      </div>
                    ))} </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <h3 className="mb-2 font-bold text-purple-300">تسهیم کمیسیون و آمادگی مدارک (۱۱۹۵–۱۱۹۶)</h3>
                  <div className="text-[11px] text-slate-300">کمیسیون ناخالص: {commissionBreakdown.grossCommissionToman.toLocaleString('fa-IR')} · خالص: {commissionBreakdown.netDistributableToman.toLocaleString('fa-IR')} تومان{showIntl ? ` (${formatMillionTomanAsIntlCurrency(commissionBreakdown.netDistributableToman / 1_000_000, currency, locale)})` : ''}</div>
                  <div className="mt-1 text-[11px] text-emerald-300">سهم آژانس: {commissionBreakdown.agencyShareToman.toLocaleString('fa-IR')} · استخر مشاوران: {commissionBreakdown.totalAgentPoolToman.toLocaleString('fa-IR')} تومان{showIntl ? ` (${formatMillionTomanAsIntlCurrency(commissionBreakdown.agencyShareToman / 1_000_000, currency, locale)} / ${formatMillionTomanAsIntlCurrency(commissionBreakdown.totalAgentPoolToman / 1_000_000, currency, locale)})` : ''}</div>
                  <div className="mt-2 border-t border-slate-800 pt-2 text-[11px] text-amber-300">آمادگی محضر: {docReadiness.readyForClosing ? 'آماده' : `ناقص (${docReadiness.blockingItemsFa.join('، ')})`}</div>
                </div>
              </div>
            </div>
          )} {activeTab === 'approvals_sla_capacity' && ( <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-emerald-400">مرکز تأییدهای چندمرحله‌ای و کنترل تفکیک وظایف (Maker-Checker SoD) (۱۲۳۰، ۱۲۳۱ و ۱۲۴۶)</h3>
                    <p className="mt-1 text-[11px] text-slate-300">درخواست: {approvalReq.operationType} · ایجادکننده (Maker): {approvalReq.makerUserId} · وضعیت: <strong className="text-white">{approvalReq.status}</strong></p>
                    <p className="text-[11px] text-slate-400">{approvalReq.beforeSummaryFa} ← {approvalReq.afterSummaryFa}{showIntl ? ` (${formatMillionTomanAsIntlCurrency(136.5, currency, locale)} ← ${formatMillionTomanAsIntlCurrency(116, currency, locale)})` : ''}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="text" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="علت تایید یا رد..." className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-white" />
                    <button type="button" onClick={() => handleApprovalAction('APPROVED')} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white">تأیید درخواست</button>
                    <button type="button" onClick={() => handleApprovalAction('REJECTED')} className="rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white">رد درخواست</button>
                  </div>
                </div>
                {approvalFeedbackFa && <div className="mt-2 rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-[11px] text-amber-300">{approvalFeedbackFa} (مجوز RBAC: {rbacSample.allowed ? 'مجاز' : 'غیرمجاز'})</div>} </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <h3 className="mb-2 font-bold text-sky-400">مانیتورینگ SLA و تقویم کاری آژانس (۱۲۳۲–۱۲۳۴)</h3>
                  <div className="space-y-1.5 text-[11px] text-slate-300">
                    <div>تقویم کاری: {AGENCY_CALENDAR.timezone} (v{slaSample.policyVersion}) · ساعت کاری: {AGENCY_CALENDAR.workStartHour} الی {AGENCY_CALENDAR.workEndHour}</div>
                    <div>زمان کاری خالص: <strong className="text-white">{slaSample.netBusinessMinutes} دقیقه</strong> (هدف: {slaSample.targetBusinessMinutes} دقیقه)</div>
                    <div className="text-rose-400">وضعیت SLA: {slaSample.slaStatus} · ارجاع: {slaSample.triggerEscalation} به ({slaSample.escalateToSupervisorId})</div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <h3 className="mb-2 font-bold text-emerald-400">داشبورد ظرفیت کاری مشاوران (۱۲۳۵ و ۱۲۴۹)</h3>
                  <div className="space-y-2">
                    {agentWorkloads.map((w) => ( <div key={w.agentId} className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                        <div className="flex items-center justify-between font-semibold text-white"><span>{w.agentId}</span><span>ضریب اشغال: {w.capacityUtilizationPercent}%</span></div>
                        <div className="mt-1 text-[11px] text-slate-400">سرنخ فعال: {w.activeLeadsCount} · بازدید: {w.upcomingVisitsCount} · معوق: {w.overdueTasksCount} · {w.statusLabelFa}</div>
                      </div>
                    ))} </div>
                </div>
              </div>
            </div>
          )} {activeTab === 'workflow_inbox_outbox' && ( <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <h3 className="mb-2 font-bold text-emerald-400">صندوق ارتباطات مشتری، مدیریت رضایت (Consent) و تضمین Idempotency (۱۲۴۰–۱۲۴۳)</h3>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-slate-200"><input type="checkbox" checked={consentGranted} onChange={(e) => setConsentGranted(e.target.checked)} /> رضایت صریح مشتری (cust-101) فعال است</label>
                  <input type="text" value={idempotencyKeyInput} onChange={(e) => setIdempotencyKeyInput(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-white" dir="ltr" />
                  <button type="button" onClick={handleSendTrackedMessage} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 font-semibold text-white"><Send className="h-3.5 w-3.5" /> ارسال پیام</button>
                </div>
                {msgFeedbackFa && <div className="mt-2 rounded bg-slate-900 p-2 text-[11px] text-sky-300">{msgFeedbackFa}</div>} </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <h3 className="mb-2 font-bold text-sky-400">موتور قواعد شرطی کسب‌وکار (۱۲۲۴ و ۱۲۲۸)</h3>
                  <div className="text-[11px] text-slate-300">اعتبارسنجی سینتکس و عدم حلقه: {declarativeRuleEval.validSyntax && !declarativeRuleEval.hasCircularDependency ? 'معتبر (بدون حلقه)' : 'خطا'}</div>
                  <div className="mt-1 text-[11px] text-emerald-300">قواعد منطبق: {declarativeRuleEval.matchedRuleIds.join('، ')}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-amber-400">مانیتور الگوی Outbox (۱۲۲۶ و ۱۲۵۳)</h3>
                    <button
                      type="button"
                      onClick={() => { const res = transitionOutboxDispatchAttempt({ record: outboxRec, workerId: 'worker-tehran-1', nowMs: Date.now(), dispatchSucceeded: true, ackSucceeded: true, downstreamAlreadyProcessedKeys: new Set() }); setOutboxRec(res.updatedRecord); }} className="rounded bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                    >
                      تلاش مجدد ایمن (Retry Outbox)
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-300">رویداد: {outboxRec.eventId} · وضعیت: <strong className="text-white">{outboxRec.status}</strong> · تلاش: {outboxRec.attemptCount}/{outboxRec.maxAttempts}</div>
                </div>
              </div>
            </div>
          )} </div>
      </div>
    </div>
  ); };
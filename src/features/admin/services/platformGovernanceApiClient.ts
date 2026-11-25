/** @file src/features/admin/services/platformGovernanceApiClient.ts — Client for Stages 6–28 Unified Governance, Intelligence, Automation, Gateway, Exchange & Market APIs */
import type { AuthUserSnapshot } from '../../../platform/auth';

export interface UnifiedGovernanceOverview {
  resilience: {
    overallTier: string;
    openCircuits: string[];
    openIncidentsCount: number;
    matrixCount: number;
  };
  opsCostRelease: {
    status: string;
    releaseGates: { overallStatus: string; gates: Array<{ gateCode: string; labelFa: string; status: string }> };
    featureFlags: Record<string, boolean>;
    rollout: { currentWave: string; rollbackLevel: number; productionTrafficStatus: string };
  };
  legal: {
    readinessStatus: string;
    activeLegalHoldsCount: number;
    regulatoryMatrix: Array<{ requirementCode: string; status: string; counselReviewRequired: boolean; notesFa: string }>;
  };
  commercial: {
    commercialStatus: string;
    commercialEntryGate: string;
    liveBillingEnabled: boolean;
    selectedMarketsCount: number;
  };
  productLifecycle: { status: string; consolidationDebtCount: number };
  engineeringScale: { architectureTopology: string; observedTrackedLegacyFilesCount: number; parallelWorkflowGatesCount: number };
}

export interface PlatformIntelligenceSnapshot {
  healthScoreStatus: string;
  healthScore0To100: number | null;
  independentCriticalAlerts: Array<{ id: string; priority: string; titleFa: string; rootCauseStatus: string }>;
  metricsCatalog: Array<{ code: string; group: string; value: number | null; status: string; epistemicTag: string }>;
  decisionSuggestions: Array<{ id: string; titleFa: string; riskTier: string; status: string; reversalPlanFa: string }>;
  selfEvaluationStatus: string;
}

export interface AutomationStatusSnapshot {
  killSwitchEngaged: boolean;
  queueAdapterProvider: string;
  queueOperationalState: string;
  costCeilingStatus: string;
  agents: Array<{ agentId: string; roleTitleFa: string; maxRiskClass: string; enabled: boolean }>;
  tasks: Array<{ id: string; agentId: string; toolName: string; riskClass: string; state: string }>;
}

export interface GatewayProviderItem {
  providerId: string;
  nameFa: string;
  lifecycle: string;
  secretRefAlias: string;
  secretValueExposed: false;
  circuitState: string;
}

async function authHeaders(currentUser?: AuthUserSnapshot | null): Promise<Record<string, string>> {
  return currentUser?.uid ? {} : {};
}

async function callJson<T>(url: string, init: RequestInit, currentUser?: AuthUserSnapshot | null): Promise<{ ok: boolean; status: number; data?: T; errorFa?: string }> {
  const hdrs = await authHeaders(currentUser);
  try {
    const res = await fetch(url, { ...init, credentials: init.credentials ?? 'same-origin', headers: { Accept: 'application/json', ...hdrs, ...(init.headers || {}) } });
    const body = (await res.json().catch(() => ({}))) as T & { messageFa?: string; code?: string };
    if (!res.ok) {
      return { ok: false, status: res.status, errorFa: res.status === 401 || res.status === 403 ? 'دسترسی به این بخش نیازمند نشست تاییدشده مدیر است.' : (body.messageFa || body.code || 'خطا در ارتباط با سرور') };
    }
    return { ok: true, status: res.status, data: body };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return { ok: false, status: 0, errorFa: 'ABORTED' };
    return { ok: false, status: 503, errorFa: 'سرویس موقتاً در دسترس نیست.' };
  }
}

export const fetchUnifiedGovernanceOverview = (currentUser?: AuthUserSnapshot | null, signal?: AbortSignal) =>
  callJson<UnifiedGovernanceOverview>('/api/v1/governance/overview', { signal }, currentUser);

export const fetchPlatformIntelligenceOverview = (currentUser?: AuthUserSnapshot | null, signal?: AbortSignal) =>
  callJson<PlatformIntelligenceSnapshot>('/api/v1/intelligence/overview', { signal }, currentUser);

export const reviewIntelligenceDecision = (id: string, decision: 'APPROVED' | 'REJECTED', currentUser?: AuthUserSnapshot | null) =>
  callJson<{ suggestion: { id: string; status: string } }>(`/api/v1/intelligence/decisions/${encodeURIComponent(id)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) }, currentUser);

export const runConsistencyCheck = (currentUser?: AuthUserSnapshot | null) =>
  callJson<{ report: { consistent: boolean; checkedPosts: number; checkedCases: number } }>('/api/v1/governance/resilience/consistency', { method: 'POST' }, currentUser);

export const fetchAutomationStatus = (currentUser?: AuthUserSnapshot | null, signal?: AbortSignal) =>
  callJson<AutomationStatusSnapshot>('/api/v1/automation/status', { signal }, currentUser);

export const toggleAutomationKillSwitch = (engaged: boolean, currentUser?: AuthUserSnapshot | null) =>
  callJson<{ killSwitchEngaged: boolean }>('/api/v1/automation/kill-switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ engaged }) }, currentUser);

export const submitSandboxAutomationTask = (currentUser?: AuthUserSnapshot | null) =>
  callJson<{ ok: boolean; code?: string }>('/api/v1/automation/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId: 'agent-triage-ro', toolName: 'read_case', riskClass: 'A1', payload: { sample: 'triage' } }) }, currentUser);

export const fetchGatewayProviders = (currentUser?: AuthUserSnapshot | null, signal?: AbortSignal) =>
  callJson<{ providers: GatewayProviderItem[] }>('/api/v1/gateway/providers', { signal }, currentUser);

export const triggerGatewaySandboxPilot = (providerId: string, currentUser?: AuthUserSnapshot | null) =>
  callJson<{ ok: boolean; envelope?: { envelopeId: string; retrievedAtIso: string; sandboxMode: boolean } }>(`/api/v1/gateway/sandbox-pilot/${encodeURIComponent(providerId)}`, { method: 'POST' }, currentUser);

export const fetchDataExchangeOverview = (currentUser?: AuthUserSnapshot | null, signal?: AbortSignal) =>
  callJson<{ sources: Array<{ sourceId: string; nameFa: string; licensed: boolean }>; factsCount: number }>('/api/v1/data-exchange/overview', { signal }, currentUser);

export const fetchMarketIntelligenceOverview = (currentUser?: AuthUserSnapshot | null, signal?: AbortSignal) =>
  callJson<{ clusters: Array<{ clusterId: string; zoneLabelFa: string; medianAskingPerSqmMillion: number; confidence: string }>; sampleHedonicCheck: { priceEvidenceKind: string; transactionDataStatus: string; confidence: string } }>('/api/v1/market-intelligence/overview', { signal }, currentUser);

/** @file server/modules/distributed-processing/automationGovernanceEngine.ts — Stage 24 Automation & AI Agent Orchestration Governance */
import crypto from 'node:crypto';
import {
  ConfigurableQueueProviderAdapter,
  type QueueProviderAdapter,
} from './jobsOutboxAndWorkersEngine';
import { sanitizeInput } from '../../../src/utils/security';

export type AutomationRiskClass = 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5';
export type TaskLifecycleState =
  | 'CREATED'
  | 'QUEUED'
  | 'LEASED'
  | 'AWAITING_APPROVAL'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'SUCCEEDED'
  | 'RETRY_WAIT'
  | 'COMPENSATING'
  | 'DEAD_LETTER'
  | 'CANCELLED';

export interface GovernedAgentDescriptor {
  agentId: string;
  roleTitleFa: string;
  maxRiskClass: AutomationRiskClass;
  allowedTools: string[];
  enabled: boolean;
}

export interface HumanApprovalRequest {
  approvalId: string;
  taskId: string;
  riskClass: AutomationRiskClass;
  actionCode: string;
  boundPayloadSha256: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedByUid: string | null;
  createdAtIso: string;
}

export interface GovernedAutomationTask {
  id: string;
  agentId: string;
  toolName: string;
  riskClass: AutomationRiskClass;
  state: TaskLifecycleState;
  payloadHash: string;
  attemptCount: number;
  leaseOwner: string | null;
  compensationPlanFa: string;
  costStatus: 'COST_NOT_MEASURED';
  createdAtIso: string;
  updatedAtIso: string;
}

const VALID_RISK_CLASSES: readonly AutomationRiskClass[] = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'];

export function computePayloadDigest(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export class AutomationGovernanceEngine {
  private killSwitchEngaged = false;
  private readonly queueAdapter: QueueProviderAdapter = new ConfigurableQueueProviderAdapter();
  private readonly agents: GovernedAgentDescriptor[] = [
    { agentId: 'agent-triage-ro', roleTitleFa: 'عامل دسته‌بندی خواندنی گزارش‌ها', maxRiskClass: 'A1', allowedTools: ['read_case', 'classify_text'], enabled: true },
    { agentId: 'agent-index-sync', roleTitleFa: 'عامل همگام‌سازی ایندکس محله‌ها', maxRiskClass: 'A2', allowedTools: ['rebuild_search_index'], enabled: true },
    { agentId: 'agent-policy-exec', roleTitleFa: 'عامل اقدام حساس (نیازمند تایید انسانی)', maxRiskClass: 'A4', allowedTools: ['hide_post', 'rotate_secret_meta'], enabled: true },
  ];
  private readonly tasks: GovernedAutomationTask[] = [];
  private readonly approvals: HumanApprovalRequest[] = [];
  private readonly auditTrail: Array<{ id: string; eventFa: string; taskId: string; createdAtIso: string }> = [];

  setKillSwitch(engaged: boolean, actorUid: string): { killSwitchEngaged: boolean; actorUid: string } {
    this.killSwitchEngaged = engaged;
    this.auditTrail.unshift({
      id: `aga_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`,
      eventFa: engaged ? 'توقف اضطراری اتوماسیون (Kill Switch) فعال شد.' : 'توقف اضطراری غیرفعال شد.',
      taskId: 'SYSTEM',
      createdAtIso: new Date().toISOString(),
    });
    return { killSwitchEngaged: this.killSwitchEngaged, actorUid };
  }

  submitGovernedTask(params: {
    agentId: string;
    toolName: string;
    riskClass: AutomationRiskClass;
    payload: Record<string, unknown>;
    compensationPlanFa: string;
  }): { ok: boolean; code?: string; task?: GovernedAutomationTask; approvalRequired?: HumanApprovalRequest } {
    if (this.killSwitchEngaged) {
      return { ok: false, code: 'AUTOMATION_KILL_SWITCH_ENGAGED' };
    }
    const agent = this.agents.find((a) => a.agentId === params.agentId && a.enabled);
    if (!agent) return { ok: false, code: 'AGENT_NOT_REGISTERED_OR_DISABLED' };
    if (!agent.allowedTools.includes(params.toolName)) return { ok: false, code: 'TOOL_PERMISSION_DENIED' };
    if (VALID_RISK_CLASSES.indexOf(params.riskClass) > VALID_RISK_CLASSES.indexOf(agent.maxRiskClass)) {
      return { ok: false, code: 'RISK_CLASS_EXCEEDS_AGENT_LIMIT' };
    }

    const nowIso = new Date().toISOString();
    const payloadHash = computePayloadDigest(params.payload);
    const needsHumanGate = params.riskClass === 'A3' || params.riskClass === 'A4' || params.riskClass === 'A5';
    const task: GovernedAutomationTask = {
      id: `atk_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      agentId: agent.agentId,
      toolName: params.toolName,
      riskClass: params.riskClass,
      state: needsHumanGate ? 'AWAITING_APPROVAL' : 'QUEUED',
      payloadHash,
      attemptCount: 0,
      leaseOwner: null,
      compensationPlanFa: sanitizeInput(params.compensationPlanFa, 180) || 'ROLLBACK_SAFE_STATE',
      costStatus: 'COST_NOT_MEASURED',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    this.tasks.unshift(task);
    this.queueAdapter.enqueueMessage({
      jobId: task.id,
      jobType: `automation.${task.toolName}`,
      priority: needsHumanGate ? 'HIGH' : 'NORMAL',
      correlationId: task.id,
    });

    let approvalRequired: HumanApprovalRequest | undefined;
    if (needsHumanGate) {
      approvalRequired = {
        approvalId: `apr_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
        taskId: task.id,
        riskClass: task.riskClass,
        actionCode: task.toolName,
        boundPayloadSha256: payloadHash,
        status: 'PENDING',
        approvedByUid: null,
        createdAtIso: nowIso,
      };
      this.approvals.unshift(approvalRequired);
    }

    return { ok: true, task, approvalRequired };
  }

  executeApprovedTask(params: { taskId: string; approvalId?: string; currentPayload: Record<string, unknown>; executorUid: string }): {
    ok: boolean;
    code?: string;
    task?: GovernedAutomationTask;
  } {
    if (this.killSwitchEngaged) return { ok: false, code: 'AUTOMATION_KILL_SWITCH_ENGAGED' };
    const task = this.tasks.find((t) => t.id === params.taskId);
    if (!task) return { ok: false, code: 'TASK_NOT_FOUND' };

    const runtimeHash = computePayloadDigest(params.currentPayload);
    if (runtimeHash !== task.payloadHash) {
      return { ok: false, code: 'APPROVAL_PAYLOAD_HASH_MISMATCH' };
    }

    if (task.state === 'AWAITING_APPROVAL') {
      const apr = this.approvals.find((a) => a.taskId === task.id && (!params.approvalId || a.approvalId === params.approvalId));
      if (!apr) return { ok: false, code: 'APPROVAL_RECORD_MISSING' };
      apr.status = 'APPROVED';
      apr.approvedByUid = params.executorUid;
    }

    task.state = 'SUCCEEDED';
    task.attemptCount += 1;
    task.updatedAtIso = new Date().toISOString();
    this.auditTrail.unshift({
      id: `aga_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`,
      eventFa: `اجرای کنترل‌شده ابزار ${task.toolName}`,
      taskId: task.id,
      createdAtIso: task.updatedAtIso,
    });
    return { ok: true, task };
  }

  getGovernanceOverview() {
    return {
      killSwitchEngaged: this.killSwitchEngaged,
      queueAdapterProvider: this.queueAdapter.providerName,
      queueOperationalState: this.queueAdapter.operationalState,
      costCeilingStatus: 'COST_NOT_MEASURED',
      agents: this.agents,
      tasks: this.tasks.slice(0, 25),
      pendingApprovals: this.approvals.filter((a) => a.status === 'PENDING'),
      recentAudit: this.auditTrail.slice(0, 20),
    };
  }
}

export const defaultAutomationGovernance = new AutomationGovernanceEngine();

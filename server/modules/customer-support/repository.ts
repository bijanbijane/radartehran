/**
 * Employee 66 — Customer Support & Case Management Persistence Repository
 * (`server/modules/customer-support/repository.ts`)
 *
 * Exclusive ownership: `server/modules/customer-support/`
 */

import { runDurableTransaction } from '../core';
import type { TransactionContextLike, TransactionRunnerAdapter } from '../core/types';
import type {
  CaseAssignmentHistoryRecord,
  CaseEscalationRecord,
  CaseEvidenceAttachmentRecord,
  CaseInternalNoteRecord,
  CaseMessageRecord,
  CaseSatisfactionFeedbackRecord,
  CaseStatusTransitionRecord,
  KnowledgeArticleFeedbackRecord,
  KnowledgeBaseArticleRecord,
  SlaMonitorJobExecutionResult,
  SlaPolicyRecord,
  SupportCaseRecord,
  SupportComplaintRecord,
  SupportResponseTemplateRecord,
  SupportTeamRecord,
} from './types';

export interface InMemoryCustomerSupportBackingStore {
  docs: Map<string, Record<string, unknown>>;
}

export function createInMemoryCustomerSupportTxRunner(
  backingStore: InMemoryCustomerSupportBackingStore = { docs: new Map() },
): TransactionRunnerAdapter & { backingStore: InMemoryCustomerSupportBackingStore } {
  return {
    backingStore,
    async runTransaction<T>(work: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      const stagedWrites = new Map<string, Record<string, unknown> | null>();
      const tx: TransactionContextLike = {
        async get<D = Record<string, unknown>>(docPath: string): Promise<{ exists: boolean; data?: D }> {
          if (stagedWrites.has(docPath)) {
            const val = stagedWrites.get(docPath);
            return val ? { exists: true, data: structuredClone(val) as D } : { exists: false };
          }
          const existing = backingStore.docs.get(docPath);
          return existing
            ? { exists: true, data: structuredClone(existing) as D }
            : { exists: false };
        },
        set(docPath: string, data: Record<string, unknown>, options?: { merge?: boolean }): void {
          const current = stagedWrites.has(docPath)
            ? stagedWrites.get(docPath)
            : (backingStore.docs.get(docPath) ?? null);
          if (options?.merge && current) {
            stagedWrites.set(docPath, {
              ...structuredClone(current),
              ...structuredClone(data),
            });
          } else {
            stagedWrites.set(docPath, structuredClone(data));
          }
        },
        update(docPath: string, data: Record<string, unknown>): void {
          const current = stagedWrites.has(docPath)
            ? stagedWrites.get(docPath)
            : (backingStore.docs.get(docPath) ?? {});
          stagedWrites.set(docPath, {
            ...structuredClone(current ?? {}),
            ...structuredClone(data),
          });
        },
        delete(docPath: string): void {
          stagedWrites.set(docPath, null);
        },
      };

      const result = await work(tx);
      for (const [docPath, value] of stagedWrites.entries()) {
        if (value === null) {
          backingStore.docs.delete(docPath);
        } else {
          backingStore.docs.set(docPath, value);
        }
      }
      return result;
    },
  };
}

interface IndexDoc {
  ids: string[];
  updatedAtIso: string;
}

export class CustomerSupportRepository {
  private readonly txRunner: TransactionRunnerAdapter;

  constructor(txRunner: TransactionRunnerAdapter) {
    this.txRunner = txRunner;
  }

  public async runInTransaction<T>(
    operationName: string,
    work: (tx: TransactionContextLike) => Promise<T>,
  ): Promise<T> {
    return runDurableTransaction(this.txRunner, { operationName }, work);
  }

  private async readDoc<T>(tx: TransactionContextLike, docPath: string): Promise<T | null> {
    const snap = await tx.get<T>(docPath);
    return snap.exists && snap.data ? snap.data : null;
  }

  private async addToIndex(tx: TransactionContextLike, indexPath: string, itemId: string): Promise<void> {
    const existing = await this.readDoc<IndexDoc>(tx, indexPath);
    const ids = existing?.ids ? [...existing.ids] : [];
    if (!ids.includes(itemId)) {
      ids.push(itemId);
      tx.set(indexPath, {
        ids,
        updatedAtIso: new Date().toISOString(),
      });
    }
  }

  private async removeFromIndex(tx: TransactionContextLike, indexPath: string, itemId: string): Promise<void> {
    const existing = await this.readDoc<IndexDoc>(tx, indexPath);
    if (!existing?.ids) return;
    tx.set(indexPath, {
      ids: existing.ids.filter((id) => id !== itemId),
      updatedAtIso: new Date().toISOString(),
    });
  }

  private async getIndexedDocs<T>(
    tx: TransactionContextLike,
    indexPath: string,
    collectionPrefix: string,
  ): Promise<T[]> {
    const idx = await this.readDoc<IndexDoc>(tx, indexPath);
    if (!idx?.ids || idx.ids.length === 0) return [];
    const results: T[] = [];
    for (const id of idx.ids) {
      const doc = await this.readDoc<T>(tx, `${collectionPrefix}/${id}`);
      if (doc) results.push(doc);
    }
    return results;
  }

  // --------------------------------------------------------------------------
  // Support Cases & Indexed Queues
  // --------------------------------------------------------------------------

  public async getCaseInTx(tx: TransactionContextLike, caseId: string): Promise<SupportCaseRecord | null> {
    return this.readDoc<SupportCaseRecord>(tx, `cs_cases/${caseId}`);
  }

  public async upsertCaseInTx(
    tx: TransactionContextLike,
    record: SupportCaseRecord,
    previousTeamId?: string | null,
    previousAgentUid?: string | null,
  ): Promise<void> {
    await this.addToIndex(tx, 'cs_cases_global/all', record.caseId);
    await this.addToIndex(tx, `cs_cases_by_requester/${record.requesterUid}`, record.caseId);

    for (const p of record.participants) {
      await this.addToIndex(tx, `cs_cases_by_participant/${p.uid}`, record.caseId);
    }

    if (previousTeamId && previousTeamId !== record.assignedTeamId) {
      await this.removeFromIndex(tx, `cs_cases_by_team/${previousTeamId}`, record.caseId);
    }
    if (record.assignedTeamId) {
      await this.addToIndex(tx, `cs_cases_by_team/${record.assignedTeamId}`, record.caseId);
    }

    if (previousAgentUid && previousAgentUid !== record.assignedAgentUid) {
      await this.removeFromIndex(tx, `cs_cases_by_agent/${previousAgentUid}`, record.caseId);
    }
    if (record.assignedAgentUid) {
      await this.addToIndex(tx, `cs_cases_by_agent/${record.assignedAgentUid}`, record.caseId);
    }

    tx.set(`cs_cases/${record.caseId}`, record as unknown as Record<string, unknown>);
  }

  public async listCasesByParticipantInTx(
    tx: TransactionContextLike,
    uid: string,
  ): Promise<SupportCaseRecord[]> {
    const items = await this.getIndexedDocs<SupportCaseRecord>(
      tx,
      `cs_cases_by_participant/${uid}`,
      'cs_cases',
    );
    return items.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
  }

  public async listAllCasesInTx(tx: TransactionContextLike): Promise<SupportCaseRecord[]> {
    const items = await this.getIndexedDocs<SupportCaseRecord>(tx, 'cs_cases_global/all', 'cs_cases');
    return items.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
  }

  public async listCasesByTeamInTx(
    tx: TransactionContextLike,
    teamId: string,
  ): Promise<SupportCaseRecord[]> {
    const items = await this.getIndexedDocs<SupportCaseRecord>(
      tx,
      `cs_cases_by_team/${teamId}`,
      'cs_cases',
    );
    return items.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
  }

  public async listCasesByAgentInTx(
    tx: TransactionContextLike,
    agentUid: string,
  ): Promise<SupportCaseRecord[]> {
    const items = await this.getIndexedDocs<SupportCaseRecord>(
      tx,
      `cs_cases_by_agent/${agentUid}`,
      'cs_cases',
    );
    return items.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
  }

  // --------------------------------------------------------------------------
  // Case Status Transition History & Assignment History
  // --------------------------------------------------------------------------

  public async appendStatusTransitionInTx(
    tx: TransactionContextLike,
    record: CaseStatusTransitionRecord,
  ): Promise<void> {
    await this.addToIndex(tx, `cs_case_transitions_by_case/${record.caseId}`, record.transitionId);
    tx.set(
      `cs_case_transitions/${record.transitionId}`,
      record as unknown as Record<string, unknown>,
    );
  }

  public async listStatusTransitionsByCaseInTx(
    tx: TransactionContextLike,
    caseId: string,
  ): Promise<CaseStatusTransitionRecord[]> {
    const items = await this.getIndexedDocs<CaseStatusTransitionRecord>(
      tx,
      `cs_case_transitions_by_case/${caseId}`,
      'cs_case_transitions',
    );
    return items.sort((a, b) => a.timestampIso.localeCompare(b.timestampIso));
  }

  public async appendAssignmentHistoryInTx(
    tx: TransactionContextLike,
    record: CaseAssignmentHistoryRecord,
  ): Promise<void> {
    await this.addToIndex(tx, `cs_case_assignments_by_case/${record.caseId}`, record.assignmentId);
    tx.set(
      `cs_case_assignments/${record.assignmentId}`,
      record as unknown as Record<string, unknown>,
    );
  }

  public async listAssignmentHistoryByCaseInTx(
    tx: TransactionContextLike,
    caseId: string,
  ): Promise<CaseAssignmentHistoryRecord[]> {
    const items = await this.getIndexedDocs<CaseAssignmentHistoryRecord>(
      tx,
      `cs_case_assignments_by_case/${caseId}`,
      'cs_case_assignments',
    );
    return items.sort((a, b) => a.timestampIso.localeCompare(b.timestampIso));
  }

  // --------------------------------------------------------------------------
  // Customer-Visible Messages vs. Strictly Separated Internal Staff Notes
  // --------------------------------------------------------------------------

  public async appendCustomerVisibleMessageInTx(
    tx: TransactionContextLike,
    message: CaseMessageRecord,
  ): Promise<void> {
    await this.addToIndex(tx, `cs_case_messages_by_case/${message.caseId}`, message.messageId);
    tx.set(`cs_case_messages/${message.messageId}`, message as unknown as Record<string, unknown>);
  }

  public async listCustomerVisibleMessagesByCaseInTx(
    tx: TransactionContextLike,
    caseId: string,
  ): Promise<CaseMessageRecord[]> {
    const items = await this.getIndexedDocs<CaseMessageRecord>(
      tx,
      `cs_case_messages_by_case/${caseId}`,
      'cs_case_messages',
    );
    return items.sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));
  }

  public async appendInternalNoteInTx(
    tx: TransactionContextLike,
    note: CaseInternalNoteRecord,
  ): Promise<void> {
    await this.addToIndex(tx, `cs_internal_notes_by_case/${note.caseId}`, note.noteId);
    tx.set(`cs_internal_notes/${note.noteId}`, note as unknown as Record<string, unknown>);
  }

  public async listInternalNotesByCaseInTx(
    tx: TransactionContextLike,
    caseId: string,
  ): Promise<CaseInternalNoteRecord[]> {
    const items = await this.getIndexedDocs<CaseInternalNoteRecord>(
      tx,
      `cs_internal_notes_by_case/${caseId}`,
      'cs_internal_notes',
    );
    return items.sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));
  }

  // --------------------------------------------------------------------------
  // Evidence & Attachments
  // --------------------------------------------------------------------------

  public async getAttachmentInTx(
    tx: TransactionContextLike,
    attachmentId: string,
  ): Promise<CaseEvidenceAttachmentRecord | null> {
    return this.readDoc<CaseEvidenceAttachmentRecord>(tx, `cs_case_attachments/${attachmentId}`);
  }

  public async upsertAttachmentInTx(
    tx: TransactionContextLike,
    record: CaseEvidenceAttachmentRecord,
  ): Promise<void> {
    await this.addToIndex(tx, `cs_case_attachments_by_case/${record.caseId}`, record.attachmentId);
    tx.set(
      `cs_case_attachments/${record.attachmentId}`,
      record as unknown as Record<string, unknown>,
    );
  }

  public async listAttachmentsByCaseInTx(
    tx: TransactionContextLike,
    caseId: string,
  ): Promise<CaseEvidenceAttachmentRecord[]> {
    return this.getIndexedDocs<CaseEvidenceAttachmentRecord>(
      tx,
      `cs_case_attachments_by_case/${caseId}`,
      'cs_case_attachments',
    );
  }

  // --------------------------------------------------------------------------
  // Support Teams, SLA Policies & Templates
  // --------------------------------------------------------------------------

  public async getTeamInTx(
    tx: TransactionContextLike,
    teamId: string,
  ): Promise<SupportTeamRecord | null> {
    return this.readDoc<SupportTeamRecord>(tx, `cs_teams/${teamId}`);
  }

  public async upsertTeamInTx(
    tx: TransactionContextLike,
    team: SupportTeamRecord,
  ): Promise<void> {
    await this.addToIndex(tx, 'cs_teams_global/all', team.teamId);
    tx.set(`cs_teams/${team.teamId}`, team as unknown as Record<string, unknown>);
  }

  public async listTeamsInTx(tx: TransactionContextLike): Promise<SupportTeamRecord[]> {
    return this.getIndexedDocs<SupportTeamRecord>(tx, 'cs_teams_global/all', 'cs_teams');
  }

  public async getActiveSlaPolicyInTx(tx: TransactionContextLike): Promise<SlaPolicyRecord | null> {
    return this.readDoc<SlaPolicyRecord>(tx, 'cs_sla_policies/active_policy');
  }

  public setActiveSlaPolicyInTx(tx: TransactionContextLike, policy: SlaPolicyRecord): void {
    tx.set('cs_sla_policies/active_policy', policy as unknown as Record<string, unknown>);
    tx.set(
      `cs_sla_policy_versions/${policy.policyVersion}`,
      policy as unknown as Record<string, unknown>,
    );
  }

  public async getSlaMonitorJobInTx(
    tx: TransactionContextLike,
    jobExecutionKey: string,
  ): Promise<SlaMonitorJobExecutionResult | null> {
    return this.readDoc<SlaMonitorJobExecutionResult>(
      tx,
      `cs_sla_monitor_jobs/${jobExecutionKey}`,
    );
  }

  public setSlaMonitorJobInTx(
    tx: TransactionContextLike,
    result: SlaMonitorJobExecutionResult,
  ): void {
    tx.set(
      `cs_sla_monitor_jobs/${result.jobExecutionKey}`,
      result as unknown as Record<string, unknown>,
    );
  }

  public async getResponseTemplateInTx(
    tx: TransactionContextLike,
    templateId: string,
  ): Promise<SupportResponseTemplateRecord | null> {
    return this.readDoc<SupportResponseTemplateRecord>(tx, `cs_response_templates/${templateId}`);
  }

  public async upsertResponseTemplateInTx(
    tx: TransactionContextLike,
    template: SupportResponseTemplateRecord,
  ): Promise<void> {
    await this.addToIndex(tx, 'cs_response_templates_global/all', template.templateId);
    tx.set(
      `cs_response_templates/${template.templateId}`,
      template as unknown as Record<string, unknown>,
    );
  }

  // --------------------------------------------------------------------------
  // Complaints & Escalations
  // --------------------------------------------------------------------------

  public async getComplaintInTx(
    tx: TransactionContextLike,
    complaintId: string,
  ): Promise<SupportComplaintRecord | null> {
    return this.readDoc<SupportComplaintRecord>(tx, `cs_complaints/${complaintId}`);
  }

  public async upsertComplaintInTx(
    tx: TransactionContextLike,
    complaint: SupportComplaintRecord,
  ): Promise<void> {
    await this.addToIndex(tx, 'cs_complaints_global/all', complaint.complaintId);
    tx.set(`cs_complaints/${complaint.complaintId}`, complaint as unknown as Record<string, unknown>);
  }

  public async appendEscalationInTx(
    tx: TransactionContextLike,
    escalation: CaseEscalationRecord,
  ): Promise<void> {
    await this.addToIndex(tx, `cs_escalations_by_case/${escalation.caseId}`, escalation.escalationId);
    tx.set(
      `cs_escalations/${escalation.escalationId}`,
      escalation as unknown as Record<string, unknown>,
    );
  }

  public async listEscalationsByCaseInTx(
    tx: TransactionContextLike,
    caseId: string,
  ): Promise<CaseEscalationRecord[]> {
    return this.getIndexedDocs<CaseEscalationRecord>(
      tx,
      `cs_escalations_by_case/${caseId}`,
      'cs_escalations',
    );
  }

  // --------------------------------------------------------------------------
  // Customer Satisfaction (CSAT) & Knowledge Base
  // --------------------------------------------------------------------------

  public async getSatisfactionByCaseInTx(
    tx: TransactionContextLike,
    caseId: string,
  ): Promise<CaseSatisfactionFeedbackRecord | null> {
    return this.readDoc<CaseSatisfactionFeedbackRecord>(tx, `cs_satisfaction/${caseId}`);
  }

  public async upsertSatisfactionInTx(
    tx: TransactionContextLike,
    record: CaseSatisfactionFeedbackRecord,
  ): Promise<void> {
    await this.addToIndex(tx, 'cs_satisfaction_global/all', record.caseId);
    tx.set(`cs_satisfaction/${record.caseId}`, record as unknown as Record<string, unknown>);
  }

  public async listAllSatisfactionInTx(
    tx: TransactionContextLike,
  ): Promise<CaseSatisfactionFeedbackRecord[]> {
    return this.getIndexedDocs<CaseSatisfactionFeedbackRecord>(
      tx,
      'cs_satisfaction_global/all',
      'cs_satisfaction',
    );
  }

  public async getKnowledgeArticleInTx(
    tx: TransactionContextLike,
    articleId: string,
  ): Promise<KnowledgeBaseArticleRecord | null> {
    return this.readDoc<KnowledgeBaseArticleRecord>(tx, `cs_kb_articles/${articleId}`);
  }

  public async upsertKnowledgeArticleInTx(
    tx: TransactionContextLike,
    article: KnowledgeBaseArticleRecord,
  ): Promise<void> {
    await this.addToIndex(tx, 'cs_kb_articles_global/all', article.articleId);
    tx.set(`cs_kb_articles/${article.articleId}`, article as unknown as Record<string, unknown>);
  }

  public async listAllKnowledgeArticlesInTx(
    tx: TransactionContextLike,
  ): Promise<KnowledgeBaseArticleRecord[]> {
    return this.getIndexedDocs<KnowledgeBaseArticleRecord>(
      tx,
      'cs_kb_articles_global/all',
      'cs_kb_articles',
    );
  }

  public async getKnowledgeFeedbackInTx(
    tx: TransactionContextLike,
    articleId: string,
    userUid: string,
  ): Promise<KnowledgeArticleFeedbackRecord | null> {
    return this.readDoc<KnowledgeArticleFeedbackRecord>(
      tx,
      `cs_kb_feedback/${articleId}__${userUid}`,
    );
  }

  public setKnowledgeFeedbackInTx(
    tx: TransactionContextLike,
    feedback: KnowledgeArticleFeedbackRecord,
  ): void {
    tx.set(
      `cs_kb_feedback/${feedback.articleId}__${feedback.userUid}`,
      feedback as unknown as Record<string, unknown>,
    );
  }
}

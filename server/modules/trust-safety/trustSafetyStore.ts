/**
 * @file server/modules/trust-safety/trustSafetyStore.ts
 * @description Storage repository interfaces and memory implementation for Trust, Safety & Fraud Prevention.
 */

import type {
  AppealRecord,
  EnforcementDecisionRecord,
  ModerationCaseRecord,
  ModerationCaseStatus,
  ReportTargetType,
  RiskAssessmentRecord,
  UserReportRecord,
} from './trustSafetyTypes';

export interface TrustSafetyRepository {
  saveReport(report: UserReportRecord): Promise<UserReportRecord>;
  getReportById(id: string): Promise<UserReportRecord | undefined>;
  getReportByIdempotencyKey(key: string): Promise<UserReportRecord | undefined>;
  listReportsForTarget(targetType: ReportTargetType, targetId: string): Promise<readonly UserReportRecord[]>;
  listReportsByReporter(reporterUid: string): Promise<readonly UserReportRecord[]>;

  saveCase(modCase: ModerationCaseRecord): Promise<ModerationCaseRecord>;
  getCaseById(id: string): Promise<ModerationCaseRecord | undefined>;
  findOpenCaseForTarget(targetType: ReportTargetType, targetId: string): Promise<ModerationCaseRecord | undefined>;
  listCases(options?: { status?: ModerationCaseStatus; moderatorUid?: string }): Promise<readonly ModerationCaseRecord[]>;

  saveRiskAssessment(assessment: RiskAssessmentRecord): Promise<RiskAssessmentRecord>;
  getAssessmentsForTarget(targetType: ReportTargetType, targetId: string): Promise<readonly RiskAssessmentRecord[]>;

  saveEnforcementDecision(decision: EnforcementDecisionRecord): Promise<EnforcementDecisionRecord>;
  getEnforcementDecisionById(id: string): Promise<EnforcementDecisionRecord | undefined>;
  listEnforcementsForTarget(targetType: ReportTargetType, targetId: string): Promise<readonly EnforcementDecisionRecord[]>;

  saveAppeal(appeal: AppealRecord): Promise<AppealRecord>;
  getAppealById(id: string): Promise<AppealRecord | undefined>;
  getAppealForDecision(enforcementDecisionId: string): Promise<AppealRecord | undefined>;

  anonymizeReporterData(reporterUid: string): Promise<{ readonly anonymizedCount: number }>;
}

export class MemoryTrustSafetyStore implements TrustSafetyRepository {
  private readonly reports = new Map<string, UserReportRecord>();
  private readonly reportIdempotency = new Map<string, string>(); // idempotencyKey -> reportId
  private readonly cases = new Map<string, ModerationCaseRecord>();
  private readonly assessments = new Map<string, RiskAssessmentRecord[]>(); // "targetType:targetId" -> assessments
  private readonly enforcements = new Map<string, EnforcementDecisionRecord>();
  private readonly appeals = new Map<string, AppealRecord>();

  public async saveReport(report: UserReportRecord): Promise<UserReportRecord> {
    this.reports.set(report.id, report);
    this.reportIdempotency.set(report.idempotencyKey, report.id);
    return report;
  }

  public async getReportById(id: string): Promise<UserReportRecord | undefined> {
    return this.reports.get(id);
  }

  public async getReportByIdempotencyKey(key: string): Promise<UserReportRecord | undefined> {
    const id = this.reportIdempotency.get(key);
    if (!id) return undefined;
    return this.reports.get(id);
  }

  public async listReportsForTarget(targetType: ReportTargetType, targetId: string): Promise<readonly UserReportRecord[]> {
    return Array.from(this.reports.values()).filter((r) => r.targetType === targetType && r.targetId === targetId);
  }

  public async listReportsByReporter(reporterUid: string): Promise<readonly UserReportRecord[]> {
    return Array.from(this.reports.values()).filter((r) => r.reporterUid === reporterUid);
  }

  public async saveCase(modCase: ModerationCaseRecord): Promise<ModerationCaseRecord> {
    this.cases.set(modCase.id, modCase);
    return modCase;
  }

  public async getCaseById(id: string): Promise<ModerationCaseRecord | undefined> {
    return this.cases.get(id);
  }

  public async findOpenCaseForTarget(targetType: ReportTargetType, targetId: string): Promise<ModerationCaseRecord | undefined> {
    const closedStates: ModerationCaseStatus[] = ['RESOLVED', 'DISMISSED', 'CLOSED'];
    for (const c of this.cases.values()) {
      if (c.targetType === targetType && c.targetId === targetId && !closedStates.includes(c.status)) {
        return c;
      }
    }
    return undefined;
  }

  public async listCases(options?: { status?: ModerationCaseStatus; moderatorUid?: string }): Promise<readonly ModerationCaseRecord[]> {
    let all = Array.from(this.cases.values());
    if (options?.status) {
      all = all.filter((c) => c.status === options.status);
    }
    if (options?.moderatorUid) {
      all = all.filter((c) => c.assignedModeratorUid === options.moderatorUid);
    }
    return all.sort((a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime());
  }

  public async saveRiskAssessment(assessment: RiskAssessmentRecord): Promise<RiskAssessmentRecord> {
    const key = `${assessment.targetType}:${assessment.targetId}`;
    const list = this.assessments.get(key) ?? [];
    list.push(assessment);
    this.assessments.set(key, list);
    return assessment;
  }

  public async getAssessmentsForTarget(targetType: ReportTargetType, targetId: string): Promise<readonly RiskAssessmentRecord[]> {
    return this.assessments.get(`${targetType}:${targetId}`) ?? [];
  }

  public async saveEnforcementDecision(decision: EnforcementDecisionRecord): Promise<EnforcementDecisionRecord> {
    this.enforcements.set(decision.id, decision);
    return decision;
  }

  public async getEnforcementDecisionById(id: string): Promise<EnforcementDecisionRecord | undefined> {
    return this.enforcements.get(id);
  }

  public async listEnforcementsForTarget(targetType: ReportTargetType, targetId: string): Promise<readonly EnforcementDecisionRecord[]> {
    return Array.from(this.enforcements.values()).filter((e) => e.targetType === targetType && e.targetId === targetId);
  }

  public async saveAppeal(appeal: AppealRecord): Promise<AppealRecord> {
    this.appeals.set(appeal.id, appeal);
    return appeal;
  }

  public async getAppealById(id: string): Promise<AppealRecord | undefined> {
    return this.appeals.get(id);
  }

  public async getAppealForDecision(enforcementDecisionId: string): Promise<AppealRecord | undefined> {
    for (const a of this.appeals.values()) {
      if (a.enforcementDecisionId === enforcementDecisionId) return a;
    }
    return undefined;
  }

  public async anonymizeReporterData(reporterUid: string): Promise<{ readonly anonymizedCount: number }> {
    let count = 0;
    for (const [id, r] of this.reports.entries()) {
      if (r.reporterUid === reporterUid) {
        this.reports.set(id, {
          ...r,
          reporterUid: 'ANONYMIZED_USER',
        });
        count += 1;
      }
    }
    return { anonymizedCount: count };
  }
}

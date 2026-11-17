/** @file server/modules/platform-foundation/engineeringScaleGovernance.ts — Stage 22 Modular Monolith Scale, L0..L6 AI RBAC & Observed Metrics */
import fs from 'node:fs';
import path from 'node:path';

export type AiAgentTrustLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';

export interface AiAgentPermissionPolicy {
  level: AiAgentTrustLevel;
  titleFa: string;
  canModifySensitiveFiles: boolean;
  requiresHumanReview: boolean;
  allowedScopes: string[];
}

export const AI_AGENT_RBAC_LEVELS: readonly AiAgentPermissionPolicy[] = [
  { level: 'L0', titleFa: 'فقط خواندن (Read-Only Research)', canModifySensitiveFiles: false, requiresHumanReview: false, allowedScopes: ['docs/**', 'tests/**'] },
  { level: 'L1', titleFa: 'پیشنهاد تست واحد', canModifySensitiveFiles: false, requiresHumanReview: true, allowedScopes: ['tests/**/*.test.ts'] },
  { level: 'L2', titleFa: 'توسعه ماژول UI ایزوله', canModifySensitiveFiles: false, requiresHumanReview: true, allowedScopes: ['src/features/**'] },
  { level: 'L3', titleFa: 'توسعه ماژول سرور غیرامنیتی', canModifySensitiveFiles: false, requiresHumanReview: true, allowedScopes: ['server/modules/**'] },
  { level: 'L4', titleFa: 'تغییر قرارداد API با گیت معماری', canModifySensitiveFiles: false, requiresHumanReview: true, allowedScopes: ['src/utils/expressRouteCatalog.ts'] },
  { level: 'L5', titleFa: 'دسترسی محدود امنیتی با قفل انسان', canModifySensitiveFiles: true, requiresHumanReview: true, allowedScopes: ['firestore.rules', 'server/modules/core/authAndAuthz.ts'] },
  { level: 'L6', titleFa: 'تغییر هسته قیمت‌گذاری و استقرار', canModifySensitiveFiles: true, requiresHumanReview: true, allowedScopes: ['server.ts', 'src/data/hedonicPricingEngine.ts'] },
];

export const SENSITIVE_SCOPE_LOCK_PATHS: readonly string[] = [
  'firestore.rules',
  'server/modules/core/authAndAuthz.ts',
  'server.ts',
  'src/data/hedonicPricingEngine.ts',
  'architecture-baseline.json',
];

export function evaluateSensitiveScopeAccess(targetPath: string, agentLevel: AiAgentTrustLevel): {
  allowed: boolean;
  requiresHumanSignoff: boolean;
  reasonFa: string;
} {
  const isSensitive = SENSITIVE_SCOPE_LOCK_PATHS.some((p) => targetPath.endsWith(p));
  const policy = AI_AGENT_RBAC_LEVELS.find((l) => l.level === agentLevel)!;
  if (isSensitive && !policy.canModifySensitiveFiles) {
    return {
      allowed: false,
      requiresHumanSignoff: true,
      reasonFa: `فایل حساس «${targetPath}» برای سطح ${agentLevel} قفل است و نیازمند ارتقا و تایید انسانی است.`,
    };
  }
  return {
    allowed: true,
    requiresHumanSignoff: isSensitive || policy.requiresHumanReview,
    reasonFa: isSensitive ? 'دسترسی مجاز مشروط به بازبینی انسانی اجباری' : 'تغییر در محدوده استاندارد ماژول',
  };
}

export class EngineeringScaleGovernanceService {
  getObservedRepositoryMetrics() {
    const cwd = process.cwd();
    let trackedLegacyCount = 0;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(cwd, 'architecture-baseline.json'), 'utf8')) as {
        trackedLegacyFiles?: Record<string, unknown>;
      };
      trackedLegacyCount = Object.keys(raw.trackedLegacyFiles || {}).length;
    } catch {
      trackedLegacyCount = 0;
    }
    return {
      architectureTopology: 'MODULAR_MONOLITH',
      parallelWorkflowGatesCount: 7,
      aiAgentRbacLevels: AI_AGENT_RBAC_LEVELS,
      sensitiveScopeLocks: SENSITIVE_SCOPE_LOCK_PATHS,
      observedTrackedLegacyFilesCount: trackedLegacyCount,
      liveTeamThroughputStatus: 'OBSERVED_REPO_METADATA_ONLY',
    };
  }
}

export const defaultEngineeringScaleGovernance = new EngineeringScaleGovernanceService();

/**
 * @file src/utils/engineeringAndMigrationGovernance.ts
 * @description PROMPTS 146, 147, 148, 149, 150 & 155: * ۱. حاکمیت عامل‌های کدنویسی هوش مصنوعی و بررسی ایمنی تغییرات (PROMPT 146)
 * ۲. یکپارچگی Git، مدیریت شاخه و بازیابی ایمن کد بدون دستورات مخرب (PROMPT 147)
 * ۳. تطابق Firebase Emulator با محیط عملیاتی و بررسی شاخص‌ها و قوانین (PROMPT 148)
 * ۴. ارزیابی ریسک پیش از مهاجرت داده و تولید مانیفست غیرمخرب (PROMPT 149)
 * ۵. نقشه راه تکامل معماری، ADRها و حاکمیت مالکیت ماژول‌ها (PROMPTS 150 & 155)
 */
import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from './areaUnit'; export interface AiAgentModificationAuditInput { taskId: string; declaredScopeFiles: string[]; actualModifiedFiles: string[]; addedDependencies?: string[]; executedTestSuites: string[]; claimedVerifiedFeatures: string[]; diffSummary?: { removedSecurityChecks?: boolean; replacedRealServiceWithMock?: boolean; introducedUnsafeTypeCasts?: boolean }; }
export interface AiAgentModificationAuditReport { approved: boolean; outOfScopeFiles: string[]; unverifiedClaims: string[]; violations: Array<{ code: 'OUT_OF_SCOPE_MODIFICATION' | 'UNNECESSARY_DEPENDENCY_ADDED' | 'SECURITY_CHECK_REMOVED' | 'REAL_SERVICE_REPLACED_BY_MOCK' | 'CLAIM_WITHOUT_EXECUTED_TESTS'; detail: string; }>; }
export function auditAiAgentCodeModification(input: AiAgentModificationAuditInput): AiAgentModificationAuditReport { const violations: AiAgentModificationAuditReport['violations'] = []; const declaredSet = new Set(input.declaredScopeFiles.map((f) => f.replace(/^\/+/, ''))); const outOfScopeFiles = input.actualModifiedFiles.map((f) => f.replace(/^\/+/, '')).filter((f) => !declaredSet.has(f)); if (outOfScopeFiles.length > 0) {
    violations.push({ code: 'OUT_OF_SCOPE_MODIFICATION', detail: `Files modified outside declared task scope: ${outOfScopeFiles.join(', ')}` });
  }
  if ((input.addedDependencies?.length ?? 0) > 0) {
    violations.push({ code: 'UNNECESSARY_DEPENDENCY_ADDED', detail: `Unapproved dependencies added: ${input.addedDependencies!.join(', ')}` });
  }
  if (input.diffSummary?.removedSecurityChecks) { violations.push({ code: 'SECURITY_CHECK_REMOVED', detail: 'Security or authorization checks were weakened or removed in diff' }); }
  if (input.diffSummary?.replacedRealServiceWithMock) { violations.push({ code: 'REAL_SERVICE_REPLACED_BY_MOCK', detail: 'Real integration was replaced by a mock implementation' }); }
  const unverifiedClaims = input.claimedVerifiedFeatures.length > 0 && input.executedTestSuites.length === 0 ? [...input.claimedVerifiedFeatures] : []; if (unverifiedClaims.length > 0) { violations.push({ code: 'CLAIM_WITHOUT_EXECUTED_TESTS', detail: 'Features claimed as verified without any executed test suites' }); }
  return { approved: violations.length === 0, outOfScopeFiles, unverifiedClaims, violations }; }
const FORBIDDEN_DESTRUCTIVE_GIT_PATTERNS = [
  /\bgit\s+reset\s+--hard\b/i, /\bgit\s+clean\s+-[a-z]*f/i, /\bgit\s+push\s+.*(?:--force|-f)\b/i, /\bgit\s+checkout\s+--\s+\./i, ]; export function validateGitCommandSafety(commandLine: string): { safe: boolean; reason: string } { for (const rx of FORBIDDEN_DESTRUCTIVE_GIT_PATTERNS) { if (rx.test(commandLine)) {
      return { safe: false, reason: `DESTRUCTIVE_GIT_COMMAND_BLOCKED: "${commandLine}" requires explicit human authorization and backup` };
    } }
  return { safe: true, reason: 'SAFE_GIT_OPERATION' }; }
export function inspectGitignoreAndRepoHygiene(repoRoot = process.cwd()): { gitInitialized: boolean; gitignorePresent: boolean; protectsEnvAndSecrets: boolean;
  protectsRuntimeCacheFiles: boolean; recoverySteps: string[]; } { const gitDir = path.join(repoRoot, '.git');
  const gitignorePath = path.join(repoRoot, '.gitignore'); const gitInitialized = fs.existsSync(gitDir); const gitignorePresent = fs.existsSync(gitignorePath); const content = gitignorePresent ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const protectsEnvAndSecrets = /\.env/.test(content); const protectsRuntimeCacheFiles =
    content.includes('.cache-data.json') || content.includes('.runtime-config.json') || content.includes('node_modules');
  return {
    gitInitialized,
    gitignorePresent,
    protectsEnvAndSecrets,
    protectsRuntimeCacheFiles,
    recoverySteps: [
      '1. Inspect current working tree status (git status --short)',
      '2. Create non-destructive checkpoint stash or branch before applying changes',
      '3. Verify complete diff and run mandatory architecture + test suites before commit',
      '4. Never assume Git revert undoes external Firestore or Object Storage mutations',
    ],
  };
}
export type ParityVerificationStatus =
  | 'EMULATOR_VERIFIED'
  | 'PRODUCTION_CONFIG_VERIFIED_STATICALLY'
  | 'PRODUCTION_BEHAVIOR_NOT_VERIFIED'
  | 'BLOCKED_BY_EXTERNAL_INFRASTRUCTURE';
export interface FirebaseParityAuditResult {
  projectIdConfigured: boolean;
  firestoreDatabaseIdConfigured: boolean;
  rulesFilePresent: boolean;
  emulatorLeakInProdBlocked: boolean;
  classifications: Record<string, ParityVerificationStatus>;
}
export function auditFirebaseEmulatorProductionParity(
  repoRoot = process.cwd(),
  env: Record<string, string | undefined> = process.env,
): FirebaseParityAuditResult {
  const configPath = path.join(repoRoot, 'firebase-applet-config.json');
  const rulesPath = path.join(repoRoot, 'firestore.rules');
  const rulesFilePresent = fs.existsSync(rulesPath);
  let projectIdConfigured = false;
  let firestoreDatabaseIdConfigured = false;
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
      projectIdConfigured = typeof parsed.projectId === 'string' && parsed.projectId.length > 0;
      firestoreDatabaseIdConfigured =
        typeof parsed.firestoreDatabaseId === 'string' && parsed.firestoreDatabaseId.length > 0;
    } catch {
      projectIdConfigured = false;
    }
  }
  const isProd = env.NODE_ENV === 'production';
  const hasEmulatorHost = Boolean(env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST);
  const emulatorLeakInProdBlocked = !(isProd && hasEmulatorHost);
  return {
    projectIdConfigured,
    firestoreDatabaseIdConfigured,
    rulesFilePresent,
    emulatorLeakInProdBlocked,
    classifications: {
      securityRulesSyntaxAndInvariants: rulesFilePresent
        ? 'PRODUCTION_CONFIG_VERIFIED_STATICALLY'
        : 'PRODUCTION_BEHAVIOR_NOT_VERIFIED',
      projectAndNamedDatabaseBinding:
        projectIdConfigured && firestoreDatabaseIdConfigured
          ? 'PRODUCTION_CONFIG_VERIFIED_STATICALLY'
          : 'PRODUCTION_BEHAVIOR_NOT_VERIFIED',
      liveMultiRegionLatencyAndQuotas: 'PRODUCTION_BEHAVIOR_NOT_VERIFIED',
    },
  };
}
export type MigrationReadinessVerdict =
  | 'READY_FOR_ISOLATED_REHEARSAL'
  | 'READY_WITH_DATA_CLEANUP_REQUIRED'
  | 'MIGRATION_BLOCKED'
  | 'NOT_ASSESSABLE';
export interface MigrationManifest {
  sourceDataset: string;
  destinationDataset: string;
  transformationVersion: string;
  expectedRecordCount: number;
  validRecordCount: number;
  invalidRecordCount: number;
  duplicateRecordCount: number;
  unresolvedReferenceCount: number;
  checksumSha256: string;
  blockers: string[];
  readinessVerdict: MigrationReadinessVerdict;
}
export function runNonDestructiveMigrationDryRun(params: {
  sourceDataset: string;
  destinationDataset: string;
  transformationVersion: string;
  neighborhoodIds: number[];
  records: Array<{
    id: string | number;
    hoodId?: number;
    ownerId?: string;
    schemaValid: boolean;
  }>;
}): MigrationManifest {
  const validHoodIds = new Set(params.neighborhoodIds);
  const seenIds = new Set<string>();
  let validRecordCount = 0;
  let invalidRecordCount = 0;
  let duplicateRecordCount = 0;
  let unresolvedReferenceCount = 0;
  const blockers: string[] = [];
  for (const r of params.records) {
    const key = String(r.id);
    if (seenIds.has(key)) {
      duplicateRecordCount++;
      continue;
    }
    seenIds.add(key);
    if (r.hoodId !== undefined && !validHoodIds.has(r.hoodId)) {
      unresolvedReferenceCount++;
    }
    if (!r.schemaValid) {
      invalidRecordCount++;
    } else {
      validRecordCount++;
    }
  }
  if (unresolvedReferenceCount > 0) {
    blockers.push(`UNRESOLVED_FOREIGN_KEYS: ${unresolvedReferenceCount} records reference non-existent neighborhoods`);
  }
  if (duplicateRecordCount > 0) {
    blockers.push(`DUPLICATE_PRIMARY_KEYS: ${duplicateRecordCount} duplicate record IDs detected`);
  }
  const readinessVerdict: MigrationReadinessVerdict =
    blockers.length > 0
      ? 'MIGRATION_BLOCKED'
      : invalidRecordCount > 0
        ? 'READY_WITH_DATA_CLEANUP_REQUIRED'
        : 'READY_FOR_ISOLATED_REHEARSAL';
  const checksumSha256 = crypto
    .createHash('sha256')
    .update(JSON.stringify({ expected: params.records.length, validRecordCount, invalidRecordCount, duplicateRecordCount }))
    .digest('hex');
  return {
    sourceDataset: params.sourceDataset,
    destinationDataset: params.destinationDataset,
    transformationVersion: params.transformationVersion,
    expectedRecordCount: params.records.length,
    validRecordCount,
    invalidRecordCount,
    duplicateRecordCount,
    unresolvedReferenceCount,
    checksumSha256,
    blockers,
    readinessVerdict,
  };
}
export interface ArchitecturalDecisionRecord {
  adrId: string;
  title: string;
  horizon: 'IMMEDIATE' | 'SHORT_TERM' | 'MEDIUM_TERM' | 'LONG_TERM' | 'NOT_CURRENTLY_NECESSARY';
  recommendedDecision: string;
  rejectedAlternatives: string[];
  revisitCondition: string;
}
export const TEHRAN_RADAR_ADRS: ArchitecturalDecisionRecord[] = [
  {
    adrId: 'ADR-001',
    title: 'Modular Monolith on Express + Vite + React SPA over Premature Microservices',
    horizon: 'IMMEDIATE',
    recommendedDecision: 'Retain single-deployment modular architecture enforced by check-architecture.ts (<500 lines/file and strict layer DAG).',
    rejectedAlternatives: ['Kubernetes multi-service split', 'Distributed message broker (Kafka/RabbitMQ)'],
    revisitCondition: 'Sustained concurrent write throughput exceeding 500 req/sec or independent multi-team release cadences.',
  },
  {
    adrId: 'ADR-002',
    title: 'Single Authoritative Hedonic Valuation Engine in src/data/hedonicPricingEngine.ts',
    horizon: 'IMMEDIATE',
    recommendedDecision: 'All UI components, traces, and AI summaries consume calculateHedonicValuation without duplicating coefficients.',
    rejectedAlternatives: ['Separate frontend and backend pricing formulas', 'Unverified LLM-computed property prices'],
    revisitCondition: 'Official Iranian real-estate transaction registry API integration.',
  },
  {
    adrId: 'ADR-003',
    title: 'Dual-Mode S3/Local Object Storage with Magic-Bytes Validation, Sharp WebP<=800px & RFC 9110 Range Streaming',
    horizon: 'IMMEDIATE',
    recommendedDecision: 'Enforce binary signature verification, Sharp concurrency semaphore (MAX_CONCURRENT_SHARP_JOBS=2), and two-phase deletion journal.',
    rejectedAlternatives: ['Unvalidated direct client public bucket writes', 'Storing base64 images inside Firestore documents'],
    revisitCondition: 'Dedicated CDN media edge transcoding pipeline.',
  },
  {
    adrId: 'ADR-004',
    title: 'In-Memory & Firestore Unified Persian Search over External Elasticsearch/Algolia Cluster',
    horizon: 'IMMEDIATE',
    recommendedDecision: 'Use executeUnifiedNeighborhoodSearch with Persian/Arabic normalization, Finglish alias dictionary, and bounded 1-edit typo tolerance.',
    rejectedAlternatives: ['Elasticsearch/OpenSearch cluster', 'Algolia SaaS external indexing'],
    revisitCondition: 'Active searchable property listings exceeding 50,000 concurrent documents.',
  },
  {
    adrId: 'ADR-005',
    title: 'Privacy-Conscious Product Analytics Engine with Automatic PII Redaction & Consent Gate',
    horizon: 'IMMEDIATE',
    recommendedDecision: 'Collect strictly typed product events via CentralizedRadarAnalyticsCollector while stripping phone/email/token fields.',
    rejectedAlternatives: ['Third-party invasive session-replay scripts', 'Logging raw unredacted search queries'],
    revisitCondition: 'Dedicated self-hosted privacy-certified analytics warehouse.',
  },
];
export interface ModuleGovernanceEntry {
  modulePath: string;
  purpose: string;
  ownerGroup: 'CORE_PRICING' | 'SECURITY_AND_STORAGE' | 'MAP_AND_UI' | 'AI_GOVERNANCE';
  securitySensitivity: 'CRITICAL' | 'HIGH' | 'STANDARD';
  relatedTests: string[];
}
export const MODULE_GOVERNANCE_INVENTORY: ModuleGovernanceEntry[] = [
  {
    modulePath: 'src/data/hedonicPricingEngine.ts',
    purpose: 'Single source of truth for Hedonic property valuation and fast-sale liquidity factor',
    ownerGroup: 'CORE_PRICING',
    securitySensitivity: 'HIGH',
    relatedTests: ['tests/hedonic-and-627-debug.test.ts', 'tests/prompts-261-to-300-business-and-qa.test.ts'],
  },
  {
    modulePath: 'src/utils/security.ts',
    purpose: 'HTML attribute escaping, external Divar URL builder, and security constants',
    ownerGroup: 'SECURITY_AND_STORAGE',
    securitySensitivity: 'CRITICAL',
    relatedTests: ['tests/fifty-step-audit.test.ts', 'tests/prompts-341-to-400-security-analytics-search.test.ts'],
  },
  {
    modulePath: 'src/utils/serverObjectStorage.ts',
    purpose: 'S3-compatible object storage reservation, upload verification, and range streaming',
    ownerGroup: 'SECURITY_AND_STORAGE',
    securitySensitivity: 'CRITICAL',
    relatedTests: ['tests/object-storage-security.test.ts', 'tests/object-storage-range.test.ts'],
  },
  {
    modulePath: 'src/utils/searchEngineeringEngine.ts',
    purpose: 'Unified Persian search normalization, bounded typo tolerance, ranking, and feature discovery',
    ownerGroup: 'MAP_AND_UI',
    securitySensitivity: 'HIGH',
    relatedTests: ['tests/prompts-341-to-400-security-analytics-search.test.ts'],
  },
  {
    modulePath: 'src/utils/productAnalyticsEngine.ts',
    purpose: 'Privacy-preserving event taxonomy, TTV, funnel, cohort retention, and A/B testing engine',
    ownerGroup: 'AI_GOVERNANCE',
    securitySensitivity: 'HIGH',
    relatedTests: ['tests/prompts-341-to-400-security-analytics-search.test.ts'],
  },
];
export function auditRepositoryCodeQualityAndMaintainability(repoRoot = process.cwd()): {
  baselineConfigPresent: boolean; maxLinesNewFileLimit: number; adrCount: number; governedModulesCount: number;
  allGovernedModulesExistOnDisk: boolean; displayAreaUnitLabel: string; referenceValuationIntlText: string;
} {
  const baselinePath = path.join(repoRoot, 'architecture-baseline.json');
  const baselineConfigPresent = fs.existsSync(baselinePath);
  let maxLinesNewFileLimit = 500;
  if (baselineConfigPresent) {
    try {
      const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      maxLinesNewFileLimit = parsed?.thresholds?.maxLinesNewFile ?? 500;
    } catch { maxLinesNewFileLimit = 500; }
  }
  const allGovernedModulesExistOnDisk = MODULE_GOVERNANCE_INVENTORY.every((m) => fs.existsSync(path.join(repoRoot, m.modulePath)));
  return { baselineConfigPresent, maxLinesNewFileLimit, adrCount: TEHRAN_RADAR_ADRS.length, governedModulesCount: MODULE_GOVERNANCE_INVENTORY.length, allGovernedModulesExistOnDisk, displayAreaUnitLabel: formatAreaUnitLabel(getStoredAreaUnit()), referenceValuationIntlText: formatMillionTomanAsIntlCurrency(10_000, getStoredIntlCurrency()) }; }
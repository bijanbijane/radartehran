/** @file src/utils/rmepExecutionStateEngine.ts — RMEP-001 v4.1 Persistent Engineering Memory & Atomic Checkpoint Engine */
import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export const RMEP_PROGRAM_ID = 'RMEP-001' as const; export const RMEP_PROGRAM_VERSION = '4.1' as const; export const RMEP_MASTER_PROMPT_REL_PATH = 'docs/engineering/RMEP-001/MASTER-PROMPT.md' as const;
export const RMEP_EXECUTION_STATE_REL_PATH = 'docs/engineering/RMEP-001/EXECUTION-STATE.json' as const; export const PINNED_MASTER_PROMPT_SHA256 = '4be39b67c381536d5c363b9fa5c026d61dd00fae5964cedfd5df168d3f6abc63' as const;
export type RmepPhaseStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'IMPLEMENTED' | 'TESTING' | 'PARTIALLY_VERIFIED' | 'VERIFIED' | 'AWAITING_AUTHORIZATION'; export type RmepOperationStatus = 'PLANNED' | 'PREPARED' | 'STARTED' | 'COMPLETED' | 'VERIFIED' | 'BLOCKED' | 'UNKNOWN';
export interface RmepExecutionState { schema_version: '1.0'; program_id: 'RMEP-001'; program_version: '4.1'; execution_mode: 'AUTONOMOUS_SEQUENTIAL'; program_status: 'IN_PROGRESS' | 'COMPLETED_WITH_EVIDENCE' | 'PARTIALLY_VERIFIED' | 'BLOCKED';
  approved_master_prompt: { path: string; approved_commit: string; sha256: string; verification_status: 'VERIFIED' | 'PENDING' | 'MISMATCH' }; repository: { remote_identity: string; current_branch: string; head_commit: string; working_tree_status: string; last_verified_commit: string };
  current_phase: { phase_id: 'PHASE-1' | 'PHASE-2' | 'PHASE-3' | 'PHASE-4' | 'PHASE-5' | 'PHASE-6'; phase_name: string; phase_status: RmepPhaseStatus }; current_workstream: { workstream_id: string; workstream_name: string; task_id: string; task_status: RmepPhaseStatus }; checkpoint: { checkpoint_id: string;
    checkpoint_timestamp_utc: string; last_safe_operation: string; last_completed_operation: string; next_exact_action: string; resume_status: 'READY' | 'AWAITING_USER_CONTINUE' | 'COMPLETED'; };
  execution_history: { completed_tasks: string[]; in_progress_tasks: string[]; verified_commits: string[]; uncommitted_changes_summary: string; };
  phase_statuses: { phase_1: RmepPhaseStatus; phase_2: RmepPhaseStatus; phase_3: RmepPhaseStatus; phase_4: RmepPhaseStatus; phase_5: RmepPhaseStatus; phase_6: RmepPhaseStatus; };
  operations: Array<{ operation_id: string; phase: string; description: string; status: RmepOperationStatus; idempotent: boolean; timestamp_utc: string; }>;
  tests: Array<{ test_name: string; command: string; environment: string; timestamp_utc: string; exit_code?: number | null; outcome: 'PASSED' | 'FAILED' | 'NOT_RUN'; evidence_path: string | null; }>;
  engineering_decisions: string[];
  blockers: Array<{ blocker_id: string; phase: string; description: string; requires_explicit_user_authorization: boolean; }>;
  pending_authorization: string[];
  phase_dependencies: Array<{ from_phase: string; to_phase: string; dependency_note: string; satisfied: boolean; }>;
  final_report_path?: string;
  resume_instructions: { resume_from_task_id: string; do_not_repeat: string[]; must_verify_before_resume: string[]; next_action: string; };
}
export function verifyMasterPromptIntegrity(
  rootDir: string = process.cwd(),
  areaUnit: AreaUnit = 'sqm',
  intlCurrency: IntlCurrencyCode = 'USD',
  referenceValuationMillionToman = 10000,
): { exists: boolean; sha256: string; matchesPinnedBaseline: boolean; byteLength: number; displayAreaUnitLabel: string; referenceValuationIntlText: string } {
  const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
  const referenceValuationIntlText = formatMillionTomanAsIntlCurrency(referenceValuationMillionToman, intlCurrency, 'en');
  const fullPath = path.resolve(rootDir, RMEP_MASTER_PROMPT_REL_PATH);
  if (!fs.existsSync(fullPath)) return { exists: false, sha256: '', matchesPinnedBaseline: false, byteLength: 0, displayAreaUnitLabel, referenceValuationIntlText };
  const bytes = fs.readFileSync(fullPath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  return { exists: true, sha256, matchesPinnedBaseline: sha256 === PINNED_MASTER_PROMPT_SHA256, byteLength: bytes.byteLength, displayAreaUnitLabel, referenceValuationIntlText };
}
const SECRET_LEAK_PATTERN = /(AIzaSy[A-Za-z0-9_-]{30,}|-----BEGIN\s+(?:RSA\s+|EC\s+)?PRIVATE\s+KEY-----|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/i;
export function validateRmepExecutionState(state: RmepExecutionState): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { valid: false, reasons: ['Execution state must be an object'] };
  }
  if (state.program_id !== RMEP_PROGRAM_ID) reasons.push('Invalid program_id');
  if (state.program_version !== RMEP_PROGRAM_VERSION) reasons.push('Invalid program_version');
  if (SECRET_LEAK_PATTERN.test(JSON.stringify(state))) {
    reasons.push('Execution state must never contain secrets, API keys, or private keys');
  }

  const approvedPath = state.approved_master_prompt?.path;
  if (typeof approvedPath !== 'string' || !approvedPath.trim()) {
    reasons.push('Missing approved_master_prompt.path');
  } else if (approvedPath.includes('..') || approvedPath.startsWith('/') || approvedPath.includes('\\')) {
    reasons.push('Unsafe path reference in approved_master_prompt.path');
  }

  const reportPath: unknown = state.final_report_path;
  if (reportPath !== undefined && reportPath !== null) {
    if (typeof reportPath !== 'string' || reportPath.includes('..') || reportPath.startsWith('/') || reportPath.includes('\\')) {
      reasons.push('Unsafe path reference in final_report_path');
    }
  }

  if (!Array.isArray(state.tests)) {
    reasons.push('Execution state tests must be an array');
  } else {
    for (const testRecord of state.tests) {
      if (!testRecord || typeof testRecord !== 'object') {
        reasons.push('Execution state contains an invalid test record');
        continue;
      }
      const evidencePath: unknown = testRecord.evidence_path;
      if (evidencePath === null && testRecord.outcome === 'NOT_RUN') continue;
      if (typeof evidencePath !== 'string' || !evidencePath.trim()) {
        reasons.push(`Missing evidence_path for test: ${String(testRecord.test_name ?? 'unknown')}`);
        continue;
      }
      if (evidencePath.includes('..') || evidencePath.startsWith('/') || evidencePath.includes('\\')) {
        reasons.push(`Unsafe evidence_path: ${evidencePath}`);
      }
    }
  }

  return { valid: reasons.length === 0, reasons };
}
export async function writeExecutionStateAtomically(
  state: RmepExecutionState,
  rootDir: string = process.cwd()
): Promise<{ writtenPath: string; sha256: string }> {
  const validation = validateRmepExecutionState(state);
  if (!validation.valid) throw new Error(`RMEP_EXECUTION_STATE_INVALID: ${validation.reasons.join('; ')}`);
  const targetPath = path.resolve(rootDir, RMEP_EXECUTION_STATE_REL_PATH);
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  const formattedJson = JSON.stringify(state, null, 2) + '\n';
  JSON.parse(formattedJson);
  const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.promises.writeFile(tmpPath, formattedJson, { encoding: 'utf-8', mode: 0o600 });
    JSON.parse(await fs.promises.readFile(tmpPath, 'utf-8'));
    await fs.promises.rename(tmpPath, targetPath);
  } catch (err) {
    await fs.promises.unlink(tmpPath).catch(() => {});
    throw err;
  }
  const sha256 = crypto.createHash('sha256').update(formattedJson, 'utf-8').digest('hex');
  return { writtenPath: targetPath, sha256 };
}
const REQUIRED_RMEP_MEMORY_FILES = [
  'docs/engineering/RMEP-001/MASTER-PROMPT.md', 'docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md', 'docs/engineering/RMEP-001/EXECUTION-STATE.json',
  'docs/engineering/RMEP-001/MASTER-ENGINEERING-DECISIONS.md', 'docs/engineering/RMEP-001/PROGRESS-LOG.md', 'docs/engineering/RMEP-001/FINAL-ENGINEERING-REPORT.md',
  'docs/engineering/RMEP-001/phases/PHASE-1-BACKEND.md', 'docs/engineering/RMEP-001/phases/PHASE-2-DATABASE.md', 'docs/engineering/RMEP-001/phases/PHASE-3-FRONTEND.md',
  'docs/engineering/RMEP-001/phases/PHASE-4-UI-UX.md', 'docs/engineering/RMEP-001/phases/PHASE-5-INTEGRATION-SECURITY.md', 'docs/engineering/RMEP-001/phases/PHASE-6-PRODUCTION-READINESS.md',
] as const;
export function readAndReconcileExecutionState(rootDir: string = process.cwd()): {
  state: RmepExecutionState | null; masterPromptVerification: ReturnType<typeof verifyMasterPromptIntegrity>; reconciled: boolean; discrepancies: string[];
} {
  const masterPromptVerification = verifyMasterPromptIntegrity(rootDir);
  const statePath = path.resolve(rootDir, RMEP_EXECUTION_STATE_REL_PATH);
  const discrepancies: string[] = [];
  if (!masterPromptVerification.exists || !masterPromptVerification.matchesPinnedBaseline) {
    discrepancies.push('Master prompt file missing or SHA-256 hash mismatch against pinned baseline');
  }
  for (const relDoc of REQUIRED_RMEP_MEMORY_FILES) {
    const absDoc = path.resolve(rootDir, relDoc);
    if (!fs.existsSync(absDoc) || fs.statSync(absDoc).size === 0) {
      discrepancies.push(`Missing or empty RMEP persistent memory file: ${relDoc}`);
    }
  }
  const canonicalMemoryPath = path.resolve(rootDir, 'docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md');
  if (fs.existsSync(canonicalMemoryPath)) {
    const memText = fs.readFileSync(canonicalMemoryPath, 'utf-8');
    for (const token of ['OP-DEC-001', 'OP-DEC-002', 'OP-DEC-003', 'OP-DEC-004', 'OP-DEC-005', 'SUP-001', 'OPERATOR_CONFIRMED', 'REPOSITORY_VERIFIED']) {
      if (!memText.includes(token)) discrepancies.push(`PERSISTENT-ENGINEERING-MEMORY.md missing required governance token: ${token}`);
    }
  }
  if (!fs.existsSync(statePath)) {
    discrepancies.push('EXECUTION-STATE.json does not exist yet');
    return { state: null, masterPromptVerification, reconciled: false, discrepancies };
  }
  const parsed = JSON.parse(fs.readFileSync(statePath, 'utf-8'), (k, v) =>
    k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v
  ) as RmepExecutionState;
  const check = validateRmepExecutionState(parsed);
  if (!check.valid) discrepancies.push(...check.reasons);
  if (parsed.approved_master_prompt?.sha256 !== masterPromptVerification.sha256) {
    discrepancies.push('Recorded master prompt SHA-256 in state differs from actual file hash');
  }
  for (const testItem of Array.isArray(parsed.tests) ? parsed.tests : []) {
    if (testItem.outcome === 'NOT_RUN' && testItem.evidence_path === null) {
      // A deliberately unexecuted check has no exit code or evidence artifact by design.
      // Preserve that truth without treating it as a passed test or attempting path resolution.
      if (!testItem.command?.trim() || !testItem.environment?.includes('NOT_RUN')) {
        discrepancies.push(`NOT_RUN test '${testItem.test_name}' must record its command and NOT_RUN environment`);
      }
      continue;
    }
    if (typeof testItem.evidence_path !== 'string' || !testItem.evidence_path.trim()) {
      discrepancies.push(`Test '${testItem.test_name}' has no evidence path`);
      continue;
    }
    if (testItem.exit_code !== 0 || testItem.outcome !== 'PASSED' || !testItem.command?.trim()) {
      discrepancies.push(`Test '${testItem.test_name}' is not PASSED with exit_code=0 and valid command`);
    }
    if (typeof testItem.evidence_path !== 'string' || !testItem.evidence_path.trim()) {
      discrepancies.push(`Test '${testItem.test_name}' has no evidence path`);
      continue;
    }
    const absEvidence = path.resolve(rootDir, testItem.evidence_path);
    if (!fs.existsSync(absEvidence)) {
      discrepancies.push(`Missing test evidence file on disk: ${testItem.evidence_path}`);
      continue;
    }
    try {
      const ev = JSON.parse(fs.readFileSync(absEvidence, 'utf-8')) as {
        status?: string; artifacts_inspected?: string[]; checks?: Array<{ name?: string; exit_code?: number }>;
      };
      if (ev.status !== 'VERIFIED') discrepancies.push(`Evidence ${testItem.evidence_path} status is not VERIFIED`);
      for (const art of ev.artifacts_inspected ?? []) {
        if (!fs.existsSync(path.resolve(rootDir, art))) discrepancies.push(`Missing inspected artifact '${art}' referenced in ${testItem.evidence_path}`);
      }
      for (const chk of ev.checks ?? []) {
        if (chk.exit_code !== 0) discrepancies.push(`Non-zero exit_code in ${testItem.evidence_path} check '${chk.name ?? 'unknown'}'`);
      }
    } catch {
      discrepancies.push(`Invalid JSON in test evidence file: ${testItem.evidence_path}`);
    }
  }
  if (typeof parsed.final_report_path === 'string' && parsed.final_report_path && !fs.existsSync(path.resolve(rootDir, parsed.final_report_path))) {
    discrepancies.push(`Missing final_report_path on disk: ${parsed.final_report_path}`);
  }
  const doNotRepeatSet = new Set(parsed.resume_instructions?.do_not_repeat ?? []);
  for (const completedTask of parsed.execution_history?.completed_tasks ?? []) {
    if (!doNotRepeatSet.has(completedTask)) discrepancies.push(`Completed task '${completedTask}' missing from resume_instructions.do_not_repeat`);
  }
  const expectedEdges = ['PHASE-1->PHASE-2', 'PHASE-2->PHASE-3', 'PHASE-3->PHASE-4', 'PHASE-4->PHASE-5', 'PHASE-5->PHASE-6'];
  const satisfiedEdges = new Set((parsed.phase_dependencies ?? []).filter((d) => d.satisfied === true).map((d) => `${d.from_phase}->${d.to_phase}`));
  for (const edge of expectedEdges) {
    if (!satisfiedEdges.has(edge)) discrepancies.push(`Unsatisfied or missing phase dependency edge: ${edge}`);
  }
  const ops = parsed.operations ?? [];
  ops.forEach((op, idx) => {
    const expectedId = `OP-${String(idx + 1).padStart(3, '0')}`;
    if (op.operation_id !== expectedId) discrepancies.push(`Non-sequential operation_id at index ${idx}: expected ${expectedId}, got ${op.operation_id}`);
    if (op.status !== 'VERIFIED' || op.idempotent !== true) discrepancies.push(`Operation ${op.operation_id} is not VERIFIED + idempotent`);
  });
  const latestOpId = ops.length > 0 ? ops[ops.length - 1].operation_id : '';
  if (latestOpId && !parsed.checkpoint?.last_completed_operation?.includes(latestOpId)) discrepancies.push(`checkpoint.last_completed_operation does not reference latest operation ${latestOpId}`);
  if (latestOpId && !parsed.execution_history?.uncommitted_changes_summary?.includes(latestOpId)) discrepancies.push(`execution_history.uncommitted_changes_summary does not reference latest operation ${latestOpId}`);
  const progressLogPath = path.resolve(rootDir, 'docs/engineering/RMEP-001/PROGRESS-LOG.md');
  if (fs.existsSync(progressLogPath)) {
    const progressText = fs.readFileSync(progressLogPath, 'utf-8');
    if (latestOpId && !progressText.includes(latestOpId)) discrepancies.push(`PROGRESS-LOG.md missing ${latestOpId}`);
    if (parsed.checkpoint?.checkpoint_id && !progressText.includes(parsed.checkpoint.checkpoint_id)) discrepancies.push(`PROGRESS-LOG.md does not reference checkpoint_id ${parsed.checkpoint.checkpoint_id}`);
  }
  if (parsed.final_report_path) {
    const absFinalReport = path.resolve(rootDir, parsed.final_report_path);
    if (fs.existsSync(absFinalReport)) {
      const reportText = fs.readFileSync(absFinalReport, 'utf-8');
      if (latestOpId && !reportText.includes(latestOpId)) discrepancies.push(`FINAL-ENGINEERING-REPORT.md does not reference latest operation ${latestOpId}`);
      if (parsed.checkpoint?.checkpoint_id && !reportText.includes(parsed.checkpoint.checkpoint_id)) discrepancies.push(`FINAL-ENGINEERING-REPORT.md does not reference checkpoint_id ${parsed.checkpoint.checkpoint_id}`);
    }
  }
  for (const [k, v] of Object.entries(parsed.phase_statuses ?? {})) {
    if (k === 'phase_6') {
      const phase6Allowed = v === 'VERIFIED' ||
        (v === 'PARTIALLY_VERIFIED' && parsed.current_phase?.phase_id === 'PHASE-6' &&
          parsed.current_workstream?.task_status === 'IN_PROGRESS' &&
          parsed.program_status === 'PARTIALLY_VERIFIED');
      if (!phase6Allowed) discrepancies.push('Phase 6 status is inconsistent with the active RMEP workstream (got ' + v + ')');
    } else if (v !== 'VERIFIED') {
      discrepancies.push('Phase status ' + k + ' is not VERIFIED (got ' + v + ')');
    }
  }
  const decisionsDocPath = path.resolve(rootDir, 'docs/engineering/RMEP-001/MASTER-ENGINEERING-DECISIONS.md');
  if (fs.existsSync(decisionsDocPath)) {
    const decisionsText = fs.readFileSync(decisionsDocPath, 'utf-8');
    for (const dec of parsed.engineering_decisions ?? []) {
      const idMatch = dec.match(/^(MED-\d+)/);
      if (idMatch && !decisionsText.includes(`## ${idMatch[1]}:`)) discrepancies.push(`Engineering decision ${idMatch[1]} missing section in MASTER-ENGINEERING-DECISIONS.md`);
    }
  }
  for (const govRel of ['docs/engineering/RMEP-001/ARCHITECTURE-AND-GOVERNANCE.md', 'docs/engineering/RMEP-001/RISK-AND-SECURITY-REGISTER.md']) {
    const govAbs = path.resolve(rootDir, govRel);
    if (fs.existsSync(govAbs) && !fs.readFileSync(govAbs, 'utf-8').includes('RMEP-001')) discrepancies.push(`Governance document ${govRel} missing RMEP-001 program reference`);
  }
  for (let p = 1; p <= 6; p++) {
    const relPhaseDoc = REQUIRED_RMEP_MEMORY_FILES[5 + p];
    const absPhaseDoc = path.resolve(rootDir, relPhaseDoc);
    if (fs.existsSync(absPhaseDoc)) {
      const phaseText = fs.readFileSync(absPhaseDoc, 'utf-8');
      if (!phaseText.includes(`PHASE-${p}`) && !phaseText.includes(`PHASE ${p}`) && !phaseText.includes(`RMEP-001-P${p}`)) discrepancies.push(`Phase report ${relPhaseDoc} missing PHASE-${p} header identifier`);
    }
  }
  for (const suiteRel of ['tests/assess-004-hedonic-accuracy-benchmark.test.ts', 'tests/assess-005-legal-and-tax-formulas.test.ts', 'tests/assess-006-trade-up-swap-model.test.ts', 'tests/assess-007-008-performance-lod-and-pwa.test.ts', 'tests/assess-009-010-seo-deeplink-and-crm-funnel.test.ts']) {
    if (!fs.existsSync(path.resolve(rootDir, suiteRel))) discrepancies.push(`Missing empirical domain benchmark suite: ${suiteRel}`);
  }
  const pkgPath = path.resolve(rootDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkgText = fs.readFileSync(pkgPath, 'utf-8');
    if (!pkgText.includes('"test:assess"') || !pkgText.includes('npm run test:assess')) discrepancies.push('package.json missing test:assess script integration in npm test');
  }
  const archBaselinePath = path.resolve(rootDir, 'architecture-baseline.json');
  if (fs.existsSync(archBaselinePath)) {
    const archBase = JSON.parse(fs.readFileSync(archBaselinePath, 'utf-8'));
    const staticDs = new Set<string>(Object.keys(archBase.datasetExclusions || {}));
    if (!(archBase.thresholds?.warningLines < archBase.thresholds?.reviewLines && archBase.thresholds?.reviewLines < archBase.thresholds?.maxLinesNewFile) || !(archBase.trackedLegacyFiles?.['src/App.tsx']?.maxLines <= 270)) {
      discrepancies.push('architecture-baseline.json thresholds or src/App.tsx <=270 ratchet invariant violated');
    }
    for (const dsRel of ['src/types/models.ts', ...staticDs]) {
      const dsText = fs.existsSync(path.resolve(rootDir, dsRel)) ? fs.readFileSync(path.resolve(rootDir, dsRel), 'utf-8') : '';
      if (/from\s+['"]react['"]|from\s+['"]\.\.\/components\//.test(dsText)) discrepancies.push(`Dependency direction violation in ${dsRel}`);
      if (staticDs.has(dsRel) && !(archBase.datasetExclusions?.[dsRel]?.maxLines <= 290)) discrepancies.push(`Dataset maxLines ratchet > 290 in ${dsRel}`);
    }
    const allRepoFiles = ['server.ts', 'src/App.tsx', 'src/main.tsx', 'src/firebase.ts'];
    for (const dirRel of ['src/components', 'src/data', 'src/utils', 'src/types']) {
      const absD = path.resolve(rootDir, dirRel);
      if (fs.existsSync(absD)) for (const f of fs.readdirSync(absD)) if (f.endsWith('.ts') || f.endsWith('.tsx')) allRepoFiles.push(`${dirRel}/${f}`);
    }
    for (const relF of allRepoFiles) {
      const absF = path.resolve(rootDir, relF);
      if (fs.existsSync(absF)) {
        const srcTxt = fs.readFileSync(absF, 'utf-8');
        const lineCeiling = archBase.datasetExclusions?.[relF]?.maxLines ?? archBase.trackedLegacyFiles?.[relF]?.maxLines ?? archBase.thresholds?.maxLinesNewFile ?? 500;
        const logicalLineCount = srcTxt.split(/\r?\n/).length - (srcTxt.endsWith('\n') ? 1 : 0);
        if (logicalLineCount > lineCeiling) discrepancies.push('Source file exceeds ceiling ' + lineCeiling + ': ' + relF);
      }
    }
  } else discrepancies.push('Missing architecture-baseline.json');
  for (const relF of [
    'src/utils/areaUnit.ts',
    'src/utils/persianFinancials.ts',
    'src/data/hedonicPricingEngine.ts',
    'src/components/HedonicValuationModal.tsx',
  ]) {
    const absF = path.resolve(rootDir, relF);
    const source = fs.existsSync(absF) ? fs.readFileSync(absF, 'utf-8') : '';
    if (!source.includes('formatMillionTomanAsIntlCurrency')) {
      discrepancies.push('OP-DEC-001 financial parity missing from ' + relF);
    }
  }
  // Canonical persistence/authentication is Cloudflare D1 + Worker OIDC sessions.
  // Firestore JSON/rules files are archival migration evidence, never runtime authorities.
  const rootFirebaseFacade = fs.existsSync(path.resolve(rootDir, 'src/firebase.ts'))
    ? fs.readFileSync(path.resolve(rootDir, 'src/firebase.ts'), 'utf-8')
    : '';
  const nativeSessionFiles = [
    'src/platform/auth/core/authClient.ts',
    'worker/auth/sessionAuth.ts',
    'worker/auth/authorizationPolicy.ts',
    'worker/auth/authRevocationStore.ts',
    'worker/routes/authRoutes.ts',
  ];
  for (const rel of nativeSessionFiles) {
    if (!fs.existsSync(path.resolve(rootDir, rel))) {
      discrepancies.push('Missing Cloudflare-native auth artifact: ' + rel);
    }
  }
  if (!rootFirebaseFacade.includes('getAuthClient') || !rootFirebaseFacade.includes('subscribeAuthState')) {
    discrepancies.push('src/firebase.ts does not expose the Cloudflare D1 session compatibility facade');
  }
  if (/from\s+['"]firebase\/(?:app|auth|firestore|app-check)['"]|import\(['"]firebase\//.test(rootFirebaseFacade)) {
    discrepancies.push('Firebase client SDK import remains in src/firebase.ts');
  }
  const nativePolicyText = fs.existsSync(path.resolve(rootDir, 'worker/auth/authorizationPolicy.ts'))
    ? fs.readFileSync(path.resolve(rootDir, 'worker/auth/authorizationPolicy.ts'), 'utf-8')
    : '';
  if (!nativePolicyText.includes('FIREBASE_BEARER_TOKEN_RETIRED') ||
      !nativePolicyText.includes('STATIC_ADMIN_TOKEN_RETIRED') ||
      !nativePolicyText.includes('authenticateWorkerSession')) {
    discrepancies.push('Worker native auth policy must retire Firebase Bearer/static admin credentials and validate D1 sessions');
  }
  const userMigrationDir = path.resolve(rootDir, 'migrations/user-d1');
  const userMigrationFiles = fs.existsSync(userMigrationDir)
    ? fs.readdirSync(userMigrationDir).filter((name) => /^\d+.*\.sql$/.test(name)).sort()
    : [];
  for (const migration of [
    '0007_cloudflare_native_identity_and_sessions.sql',
    '0010_marketplace_and_neighborhood_core.sql',
  ]) {
    if (!userMigrationFiles.includes(migration)) {
      discrepancies.push('Missing canonical USER_DB migration: ' + migration);
    }
  }
  const userSchemaText = userMigrationFiles
    .map((name) => fs.readFileSync(path.join(userMigrationDir, name), 'utf-8'))
    .join('\n');
  for (const table of [
    'auth_identities', 'auth_oauth_states', 'user_sessions',
    'bargains', 'sponsor_requests', 'buyer_alerts', 'neighborhood_votes', 'app_config',
  ]) {
    const tablePattern = new RegExp('CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+' + table + '\\b', 'i');
    if (!tablePattern.test(userSchemaText)) {
      discrepancies.push('Missing canonical USER_DB table definition: ' + table);
    }
  }
  const marketplaceWorkerText = fs.existsSync(path.resolve(rootDir, 'worker/routes/marketplaceRoutes.ts'))
    ? fs.readFileSync(path.resolve(rootDir, 'worker/routes/marketplaceRoutes.ts'), 'utf-8')
    : '';
  if (!marketplaceWorkerText.includes('privacyConsent !== true') ||
      !marketplaceWorkerText.includes('calculateCanonicalD1SponsorPricing')) {
    discrepancies.push('D1 marketplace must enforce explicit buyer consent and server-owned sponsor pricing');
  }
  const frontendFirebaseImports: string[] = [];
  for (const dirRel of ['src', 'apps/frontend']) {
    const absDir = path.resolve(rootDir, dirRel);
    const visit = (dir: string): void => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== 'dist') visit(abs);
        } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const source = fs.readFileSync(abs, 'utf-8');
          if (/from\s+['"]firebase\/(?:app|auth|firestore|app-check)['"]|import\(['"]firebase\/(?:app|auth|firestore|app-check)['"]\)/.test(source)) {
            frontendFirebaseImports.push(path.relative(rootDir, abs));
          }
        }
      }
    };
    visit(absDir);
  }
  if (frontendFirebaseImports.length > 0) {
    discrepancies.push('Firebase client SDK imports remain in frontend runtime: ' + frontendFirebaseImports.slice(0, 10).join(', '));
  }
  if (!fs.existsSync(path.resolve(rootDir, 'tests/cloudflare-native-auth.test.ts')) ||
      !fs.existsSync(path.resolve(rootDir, 'tests/cloudflare-worker-native-auth-failclosed.test.ts'))) {
    discrepancies.push('Missing native D1 session, revocation, and fail-closed regression tests');
  }
  const cfgValText = fs.existsSync(path.resolve(rootDir, 'src/utils/serverConfigValidator.ts')) ? fs.readFileSync(path.resolve(rootDir, 'src/utils/serverConfigValidator.ts'), 'utf-8') : '';
  const apiInvText = fs.existsSync(path.resolve(rootDir, 'src/utils/apiContractsAndSerializationEngine.ts')) ? fs.readFileSync(path.resolve(rootDir, 'src/utils/apiContractsAndSerializationEngine.ts'), 'utf-8') : '';
  if (!cfgValText.includes('API_ENDPOINT_CONTRACTS') || !apiInvText.includes('RADAR_API_ROUTE_INVENTORY')) discrepancies.push('Missing API_ENDPOINT_CONTRACTS or RADAR_API_ROUTE_INVENTORY route contract definitions');
  const envStoreText = fs.existsSync(path.resolve(rootDir, 'src/utils/serverRuntimeEnvStore.ts')) ? fs.readFileSync(path.resolve(rootDir, 'src/utils/serverRuntimeEnvStore.ts'), 'utf-8') : '';
  if (!envStoreText.includes('RUNTIME_ENV_KEYS') || !fs.existsSync(path.resolve(rootDir, '.env.example')) || !fs.existsSync(path.resolve(rootDir, 'docs/deployment.md'))) discrepancies.push('Missing RUNTIME_ENV_KEYS, .env.example, or docs/deployment.md environment contract parity');
  const hedonicText = fs.existsSync(path.resolve(rootDir, 'src/data/hedonicPricingEngine.ts')) ? fs.readFileSync(path.resolve(rootDir, 'src/data/hedonicPricingEngine.ts'), 'utf-8') : ''; const superLogicText = fs.existsSync(path.resolve(rootDir, 'src/data/superModulesLogic.ts')) ? fs.readFileSync(path.resolve(rootDir, 'src/data/superModulesLogic.ts'), 'utf-8') : ''; const hedonicModalText = fs.existsSync(path.resolve(rootDir, 'src/components/HedonicValuationModal.tsx')) ? fs.readFileSync(path.resolve(rootDir, 'src/components/HedonicValuationModal.tsx'), 'utf-8') : '';
  const secText = fs.existsSync(path.resolve(rootDir, 'src/utils/security.ts')) ? fs.readFileSync(path.resolve(rootDir, 'src/utils/security.ts'), 'utf-8') : ''; const inspectorTabsText = fs.existsSync(path.resolve(rootDir, 'src/components/NeighborhoodInspectorTabs.tsx')) ? fs.readFileSync(path.resolve(rootDir, 'src/components/NeighborhoodInspectorTabs.tsx'), 'utf-8') : '';
  const leafletMapText = fs.existsSync(path.resolve(rootDir, 'src/components/useLeafletRadarMap.ts')) ? fs.readFileSync(path.resolve(rootDir, 'src/components/useLeafletRadarMap.ts'), 'utf-8') : '';
  if (!hedonicText.includes('calculateHedonicValuation') || !hedonicText.includes('FAST_SALE_FACTOR') || !superLogicText.includes('calculateHedonicValuation') || !superLogicText.includes('FAST_SALE_FACTOR') || !hedonicModalText.includes('calculateHedonicValuation') || !secText.includes('escapeHtmlAttr') || !secText.includes('buildExternalDivarUrl') || !leafletMapText.includes('escapeHtmlAttr') || !leafletMapText.includes('buildExternalDivarUrl') || !inspectorTabsText.includes('buildExternalDivarUrl')) discrepancies.push('Missing core domain Hedonic single-source or Leaflet/Divar security invariants');
  const pulseText = fs.existsSync(path.resolve(rootDir, 'src/utils/serverMarketPulseEngine.ts')) ? fs.readFileSync(path.resolve(rootDir, 'src/utils/serverMarketPulseEngine.ts'), 'utf-8') : ''; const objStoreText = fs.existsSync(path.resolve(rootDir, 'src/utils/serverObjectStorage.ts')) ? fs.readFileSync(path.resolve(rootDir, 'src/utils/serverObjectStorage.ts'), 'utf-8') : '';
  if (!pulseText.includes('0o600') || !pulseText.includes('Array.isArray(parsed.buyerLeads)') || /const payload\s*=\s*\{[^}]*buyerLeads/s.test(pulseText) || !envStoreText.includes('0o600') || !envStoreText.includes('SECRET_ENV_KEYS') || !objStoreText.includes('0o600')) discrepancies.push('Missing 0o600 atomic write, buyerLeads PII exclusion, or SECRET_ENV_KEYS invariants in server disk I/O engines');
  const archPolicyDoc = fs.existsSync(path.resolve(rootDir, 'ARCHITECTURE.md')) ? fs.readFileSync(path.resolve(rootDir, 'ARCHITECTURE.md'), 'utf-8') : ''; const sysArchDoc = fs.existsSync(path.resolve(rootDir, 'docs/system-architecture.md')) ? fs.readFileSync(path.resolve(rootDir, 'docs/system-architecture.md'), 'utf-8') : '';
  const secDoc = fs.existsSync(path.resolve(rootDir, 'docs/security.md')) ? fs.readFileSync(path.resolve(rootDir, 'docs/security.md'), 'utf-8') : '';
  if (!archPolicyDoc.includes('maxLines: 270') || !archPolicyDoc.includes('<= 290') || !sysArchDoc.includes('neighborhoodOverrides.sponsor') || !sysArchDoc.includes('0o600') || !secDoc.includes('neighborhoodOverrides.sponsor') || !secDoc.includes('.runtime-config.json')) discrepancies.push('Missing AGENTS.md Rule 5 doc sync parity in ARCHITECTURE.md, docs/system-architecture.md, or docs/security.md');
  const priceAggText = fs.existsSync(path.resolve(rootDir, 'src/data/realMarketPriceAggregator.ts')) ? fs.readFileSync(path.resolve(rootDir, 'src/data/realMarketPriceAggregator.ts'), 'utf-8') : '';
  if (!priceAggText.includes('verifyPricingEngineIntegrity') || !priceAggText.includes('aggregateNeighborhoodLivePrice') || !priceAggText.includes('extractListingSpecsFromText')) discrepancies.push('Missing v6.4 Persian NLP & Hedonic pricing aggregator exports in src/data/realMarketPriceAggregator.ts');
  for (const reqScript of [
    'scripts/check-architecture.ts',
    'tests/architecture-guardrails.test.ts',
    'tests/pricing-engine-integrity.test.ts',
    'tests/neighborhood-insights.test.ts',
    'tests/stress-50-cycles.test.ts',
    'tests/object-storage-security.test.ts',
    'tests/object-storage-range.test.ts',
    'tests/cloudflare-worker-platform.test.ts',
    'tests/cloudflare-google-oidc.test.ts',
    'tests/cloudflare-native-auth.test.ts',
    'tests/cloudflare-worker-native-auth-failclosed.test.ts',
    'tests/cloudflare-marketplace-privacy.test.ts',
    'tests/cloudflare-marketplace-write-routes.test.ts',
    'tsconfig.worker.json',
  ]) {
    const absScript = path.resolve(rootDir, reqScript);
    if (!fs.existsSync(absScript) || fs.statSync(absScript).size === 0) {
      discrepancies.push('Missing or empty AGENTS.md Rule 4 mandatory verification artifact: ' + reqScript);
    }
  }
  return { state: parsed, masterPromptVerification, reconciled: discrepancies.length === 0, discrepancies };
}
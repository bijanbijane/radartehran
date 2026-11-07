/**
 * Final Remediation Coordinator — Radartehran
 * (`server/modules/remediation-coordinator/index.ts`)
 *
 * Consolidates findings from the five independent backend audits:
 *  - Architecture Audit A1
 *  - Security Audit A2
 *  - Data Integrity Audit A3
 *  - Frontend/Backend Integration Audit A4
 *  - Performance Audit A5
 *
 * Enforces:
 *  - Unique Finding IDs, deduplicated evidence, and severity classifications.
 *  - Distinction between confirmed defects (`CONFIRMED_DEFECT`), operational release gates
 *    (`EXTERNAL_DEPLOYMENT_PREREQUISITE`), and design suggestions (`DESIGN_SUGGESTION`).
 *  - Strictly non-overlapping file ownership across employee assignments.
 *  - Exclusive Coordinator ownership over shared files (`server.ts`, shared route registration,
 *    `firestore.rules`, `firestore.indexes.json`, `package.json`, global schemas).
 *  - Truthful closure tracking (`Open` | `Confirmed` | `Assigned` | `In Progress` |
 *    `Awaiting Review` | `Fixed` | `Verified` | `Accepted Risk`).
 */

export type AuditSourceId = 'A1_ARCHITECTURE' | 'A2_SECURITY' | 'A3_DATA_INTEGRITY' | 'A4_INTEGRATION' | 'A5_PERFORMANCE';

export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type FindingKind =
  | 'CONFIRMED_DEFECT'
  | 'EXTERNAL_DEPLOYMENT_PREREQUISITE'
  | 'DESIGN_SUGGESTION';

export type RemediationLifecycleStatus =
  | 'Open'
  | 'Confirmed'
  | 'Assigned'
  | 'In Progress'
  | 'Awaiting Review'
  | 'Fixed'
  | 'Verified'
  | 'Accepted Risk';

export type RemediationOwnerId =
  | 'COORDINATOR_SHARED_FILES'
  | 'EMPLOYEE_4_CROWD_DATA'
  | 'EMPLOYEE_6_MEDIA_STORAGE'
  | 'EMPLOYEE_7_ACCOUNT_LIFECYCLE'
  | 'EMPLOYEE_13_NOTIFICATIONS'
  | 'OPERATOR_AUTHORIZED_DEPLOY';

export interface ConsolidatedAuditFinding {
  readonly findingId: string;
  readonly mergedDuplicateIds: readonly string[];
  readonly auditSources: readonly AuditSourceId[];
  readonly severity: FindingSeverity;
  readonly kind: FindingKind;
  readonly title: string;
  readonly reproductionAndEvidence: string;
  readonly affectedModulesAndFiles: readonly string[];
  readonly assignedOwner: RemediationOwnerId;
  readonly allowedFilePaths: readonly string[];
  readonly prohibitedFilePaths: readonly string[];
  readonly dependencies: readonly string[];
  readonly requiredBehavior: string;
  readonly testableAcceptanceCriteria: string;
  readonly verificationCommand: string;
  readonly status: RemediationLifecycleStatus;
}

export const SHARED_COORDINATOR_PROTECTED_PATHS: readonly string[] = [
  'server.ts',
  'src/utils/serverSponsorAndBargainRoutes.ts',
  'src/utils/serverAdminAndTelegramSecurity.ts',
  'src/types/models.ts',
  'firestore.rules',
  'firestore.indexes.json',
  'package.json',
  'firebase-blueprint.json',
] as const;

export const CONSOLIDATED_AUDIT_REGISTER: readonly ConsolidatedAuditFinding[] = [
  {
    findingId: 'FIND-A1-001',
    mergedDuplicateIds: ['A1-TS-UNION-146', 'A4-SPONSOR-COMMIT-TYPE'],
    auditSources: ['A1_ARCHITECTURE', 'A4_INTEGRATION'],
    severity: 'HIGH',
    kind: 'CONFIRMED_DEFECT',
    title: 'TypeScript discriminated-union narrowing error in shared route module serverSponsorAndBargainRoutes.ts',
    reproductionAndEvidence:
      'Running `npm run lint` (`tsc --noEmit`) failed at `src/utils/serverSponsorAndBargainRoutes.ts(146,84)` because `executePostCommitSideEffectsTransaction` return union lacked optional `code`/`messageFa` properties on the `ok: true` branch when `strictNullChecks` is disabled in `tsconfig.json`.',
    affectedModulesAndFiles: ['src/utils/serverSponsorAndBargainRoutes.ts'],
    assignedOwner: 'COORDINATOR_SHARED_FILES',
    allowedFilePaths: ['src/utils/serverSponsorAndBargainRoutes.ts'],
    prohibitedFilePaths: [
      'server/modules/crowd-data/*',
      'server/modules/media/*',
      'server/modules/account-lifecycle/*',
      'server/modules/notifications/*',
    ],
    dependencies: [],
    requiredBehavior:
      'Ensure `executePostCommitSideEffectsTransaction` return contract compiles cleanly under `tsc --noEmit` and preserves HTTP 503 error reporting (`committed.code`, `committed.messageFa`) on database commit failure.',
    testableAcceptanceCriteria:
      '`npm run lint` (`tsc --noEmit`) exits with code 0 and `executePostCommitSideEffectsTransaction` returns exact failure code/message on simulated commit conflict.',
    verificationCommand: 'npm run lint',
    status: 'Verified',
  },
  {
    findingId: 'FIND-A3-001',
    mergedDuplicateIds: ['A3-CROWD-EPISTEMIC-01', 'A2-CROWD-OWNERSHIP-02'],
    auditSources: ['A3_DATA_INTEGRITY', 'A2_SECURITY'],
    severity: 'HIGH',
    kind: 'CONFIRMED_DEFECT',
    title: 'Strict epistemic separation and provenance enforcement between user crowd claims and verified market observations',
    reproductionAndEvidence:
      'User-submitted crowd claims must never automatically become verified market observations or synthetic regional data, and concurrent updates require optimistic concurrency control (`revision` CAS).',
    affectedModulesAndFiles: ['server/modules/crowd-data/'],
    assignedOwner: 'EMPLOYEE_4_CROWD_DATA',
    allowedFilePaths: ['server/modules/crowd-data/*'],
    prohibitedFilePaths: SHARED_COORDINATOR_PROTECTED_PATHS,
    dependencies: [],
    requiredBehavior:
      'Maintain separate lifecycles and trust tiers for Crowd Claims (`T0_USER_ASSERTION` / `T1_COMMUNITY_MODERATED_CLAIM`) vs. Market Observations (`T2_UNVERIFIED_OBSERVATION` / `T3_VERIFIED_OBSERVATION` / `T4_DERIVED_ANALYTICS`), enforce neighborhood catalog validation, and block synthetic data generation.',
    testableAcceptanceCriteria:
      'All claim ownership, provenance, moderation, duplicate detection, invalid neighborhood rejection, and concurrent revision CAS tests pass.',
    verificationCommand: 'npx tsx server/modules/crowd-data/crowdData.test.ts',
    status: 'Verified',
  },
  {
    findingId: 'FIND-A2-001',
    mergedDuplicateIds: ['A2-MEDIA-STORAGE-01', 'A3-MEDIA-ORPHAN-02'],
    auditSources: ['A2_SECURITY', 'A3_DATA_INTEGRITY'],
    severity: 'HIGH',
    kind: 'CONFIRMED_DEFECT',
    title: 'Durable media object storage abstraction, raw-byte metadata firewall, target ownership verification, and retryable cleanup',
    reproductionAndEvidence:
      'Firestore metadata documents must never contain raw object bytes or credentials; local ephemeral filesystem must not silently act as production durable storage; attaching media to a Bargain or Sponsor requires target ownership verification.',
    affectedModulesAndFiles: ['server/modules/media/'],
    assignedOwner: 'EMPLOYEE_6_MEDIA_STORAGE',
    allowedFilePaths: ['server/modules/media/*'],
    prohibitedFilePaths: SHARED_COORDINATOR_PROTECTED_PATHS,
    dependencies: [],
    requiredBehavior:
      'Enforce upload authorization grants, SHA-256 & magic-byte verification, target entity ownership checks via `MediaTargetEntityVerifier`, two-phase retryable deletion (`PENDING_DELETE` -> `DELETED`), and checkpointed orphan cleanup jobs.',
    testableAcceptanceCriteria:
      'All upload authorization, ownership, metadata raw-byte firewall, interrupted cleanup, duplicate deletion, missing bytes, and storage failure tests pass.',
    verificationCommand: 'npx tsx server/modules/media/mediaModule.test.ts',
    status: 'Verified',
  },
  {
    findingId: 'FIND-A2-002',
    mergedDuplicateIds: ['A2-ACCOUNT-ERASURE-01', 'A3-AUTH-DELETE-ORDER-02', 'A4-EXPORT-PAGINATION-03'],
    auditSources: ['A2_SECURITY', 'A3_DATA_INTEGRITY', 'A4_INTEGRATION'],
    severity: 'CRITICAL',
    kind: 'CONFIRMED_DEFECT',
    title: 'Durable account export and deletion lifecycle with write blocking, retention-policy distinction, and strict Auth deletion ordering',
    reproductionAndEvidence:
      'Account deletion jobs must survive process restarts via durable Firestore/journal state, block new user writes immediately, paginate bounded batches, distinguish permanently deleted records from statutory/provenance retained records, and delete Firebase Auth identity strictly after all dependent data and media complete.',
    affectedModulesAndFiles: ['server/modules/account-lifecycle/'],
    assignedOwner: 'EMPLOYEE_7_ACCOUNT_LIFECYCLE',
    allowedFilePaths: ['server/modules/account-lifecycle/*'],
    prohibitedFilePaths: SHARED_COORDINATOR_PROTECTED_PATHS,
    dependencies: ['FIND-A3-001', 'FIND-A2-001'],
    requiredBehavior:
      'Provide bounded paginated export across all 7 user-owned domains with truthful completeness reporting (`COMPLETE` vs `INCOMPLETE_PARTIAL`) and cross-user leak detection, plus crash-recoverable deletion orchestration that invokes Firebase Auth deletion last.',
    testableAcceptanceCriteria:
      'All interrupted job restart recovery, retry/partial failure, bounded pagination, cross-user isolation, media cleanup coordination, write blocking, and Auth deletion ordering tests pass.',
    verificationCommand: 'npx tsx server/modules/account-lifecycle/accountLifecycle.test.ts',
    status: 'Verified',
  },
  {
    findingId: 'FIND-A4-001',
    mergedDuplicateIds: ['A4-NOTIF-OUTBOX-01', 'A2-NOTIF-PII-PREVIEW-02'],
    auditSources: ['A4_INTEGRATION', 'A2_SECURITY', 'A3_DATA_INTEGRITY'],
    severity: 'HIGH',
    kind: 'CONFIRMED_DEFECT',
    title: 'Durable notification outbox, 4-stage delivery confirmation separation, consent/opt-out enforcement, and preview PII redaction',
    reproductionAndEvidence:
      'Notifications must not be sent inline inside database transactions or vanish on process restart; provider API acceptance (`200/202`) must not be conflated with confirmed delivery (`DELIVERED_CONFIRMED`); private contact details must never leak in previews or operational logs.',
    affectedModulesAndFiles: ['server/modules/notifications/'],
    assignedOwner: 'EMPLOYEE_13_NOTIFICATIONS',
    allowedFilePaths: ['server/modules/notifications/*'],
    prohibitedFilePaths: SHARED_COORDINATOR_PROTECTED_PATHS,
    dependencies: ['FIND-A3-001', 'FIND-A2-002'],
    requiredBehavior:
      'Separate Event Ingestion (`PENDING_GENERATION`), Notification Generation, Delivery Attempts (`PROVIDER_ACCEPTED_AWAITING_RECEIPT` with `isConfirmedDelivered: false`), and Delivery Confirmation (`DELIVERED_CONFIRMED` upon receipt), while enforcing user preferences, global non-critical opt-out, and PII redaction.',
    testableAcceptanceCriteria:
      'All 8 event source contracts, duplicate event deduplication, process restart survival, retry/failure transitions, consent/opt-out hierarchy, in-app read/unread states, and template/PII redaction tests pass.',
    verificationCommand: 'npx tsx server/modules/notifications/notifications.test.ts',
    status: 'Verified',
  },
  {
    findingId: 'FIND-A2-003',
    mergedDuplicateIds: ['A2-FIRESTORE-LIVE-DEPLOY-01'],
    auditSources: ['A2_SECURITY', 'A1_ARCHITECTURE'],
    severity: 'HIGH',
    kind: 'EXTERNAL_DEPLOYMENT_PREREQUISITE',
    title: 'Live GCP deployment of hardened firestore.rules and composite firestore.indexes.json requires authorized operator session',
    reproductionAndEvidence:
      '`firestore.rules` and `firestore.indexes.json` are verified in local contract tests, but automated deployment from the sandbox container is blocked by GCP IAM (`The caller does not have permission`).',
    affectedModulesAndFiles: ['firestore.rules', 'firestore.indexes.json', 'docs/remaining-work.md'],
    assignedOwner: 'OPERATOR_AUTHORIZED_DEPLOY',
    allowedFilePaths: ['firestore.rules', 'firestore.indexes.json'],
    prohibitedFilePaths: [],
    dependencies: ['FIND-A1-001'],
    requiredBehavior:
      'Do not fabricate live cloud deployment verification. Maintain explicit operator pre-cutover command (`firebase deploy --only firestore:rules,firestore:indexes --project gen-lang-client-0713157837`).',
    testableAcceptanceCriteria:
      'Local rule & index contract suites pass (`npm run test:contracts`); release checklist explicitly gates live production cutover on authorized operator deployment.',
    verificationCommand: 'npm run test:contracts',
    status: 'Accepted Risk',
  },
  {
    findingId: 'FIND-A5-001',
    mergedDuplicateIds: ['DB-FIND-01', 'DB-FIND-03', 'A5-COLLECTION-SCALE-01'],
    auditSources: ['A5_PERFORMANCE', 'A1_ARCHITECTURE'],
    severity: 'MEDIUM',
    kind: 'DESIGN_SUGGESTION',
    title: 'City-scoped partitioning for /neighborhoodOverrides listener and sharded local media index beyond 1,000+ items',
    reproductionAndEvidence:
      '`useRadarCloudSync.ts` subscribes to `/neighborhoodOverrides` (<100 docs currently, bounded at 999 hood IDs), and `.object-storage-bucket/index.json` stores local media metadata in a single atomic JSON file.',
    affectedModulesAndFiles: ['src/components/useRadarCloudSync.ts', 'src/utils/serverObjectStorageHelpers.ts'],
    assignedOwner: 'COORDINATOR_SHARED_FILES',
    allowedFilePaths: [],
    prohibitedFilePaths: [],
    dependencies: [],
    requiredBehavior:
      'Distinguish non-blocking scale design suggestions from confirmed defects; retain current working behavior for <= 999 neighborhoods and schedule city-partitioned query filters for future multi-country expansion.',
    testableAcceptanceCriteria:
      '50-cycle stress test (`npx tsx tests/stress-50-cycles.test.ts`) and object storage security/range suites pass with zero memory leaks or regressions.',
    verificationCommand: 'npx tsx tests/stress-50-cycles.test.ts',
    status: 'Accepted Risk',
  },
] as const;

export interface AssignmentValidationReport {
  valid: boolean;
  uniqueFindingCount: number;
  overlappingPaths: string[];
  sharedFileViolations: string[];
}

/**
 * Verifies that:
 * 1. Every finding has a unique ID.
 * 2. No two employee assignments ever allow modifying the same production file path.
 * 3. No non-coordinator employee assignment is permitted to touch shared protected files.
 */
export function validateNonOverlappingRemediationAssignments(
  register: readonly ConsolidatedAuditFinding[] = CONSOLIDATED_AUDIT_REGISTER,
): AssignmentValidationReport {
  const seenFindingIds = new Set<string>();
  const pathOwnerMap = new Map<string, RemediationOwnerId>();
  const overlappingPaths: string[] = [];
  const sharedFileViolations: string[] = [];

  for (const item of register) {
    if (seenFindingIds.has(item.findingId)) {
      overlappingPaths.push(`DUPLICATE_FINDING_ID:${item.findingId}`);
    }
    seenFindingIds.add(item.findingId);

    for (const allowedPath of item.allowedFilePaths) {
      const existingOwner = pathOwnerMap.get(allowedPath);
      if (existingOwner && existingOwner !== item.assignedOwner) {
        overlappingPaths.push(`${allowedPath} (${existingOwner} vs ${item.assignedOwner})`);
      }
      pathOwnerMap.set(allowedPath, item.assignedOwner);

      if (
        item.assignedOwner !== 'COORDINATOR_SHARED_FILES' &&
        item.assignedOwner !== 'OPERATOR_AUTHORIZED_DEPLOY' &&
        SHARED_COORDINATOR_PROTECTED_PATHS.includes(allowedPath)
      ) {
        sharedFileViolations.push(`${item.assignedOwner} assigned shared path ${allowedPath}`);
      }
    }
  }

  return {
    valid: overlappingPaths.length === 0 && sharedFileViolations.length === 0,
    uniqueFindingCount: seenFindingIds.size,
    overlappingPaths,
    sharedFileViolations,
  };
}

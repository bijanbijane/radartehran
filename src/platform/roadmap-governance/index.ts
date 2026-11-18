/**
 * @file src/platform/roadmap-governance/index.ts
 * @description Stage 21 (RT-FE-REBUILD-ROADMAP-AND-QUALITY-GOVERNANCE-021) — Master Frontend Roadmap Registry,
 * Stage ID Disambiguation (Rebuild vs Legacy Tracks), Test Manifest & CI Quality Gate Evidence Verifier.
 * Includes Stages 22, 23, 24, 25, and 26 registered with truthful `status: 'designed'`.
 */

export const RT_FE_REBUILD_STAGE_21_SPEC_ID = 'RT-FE-REBUILD-ROADMAP-AND-QUALITY-GOVERNANCE-021' as const;

export const ROADMAP_STAGE_STATUSES = [
  'proposed',
  'designed',
  'in_progress',
  'implemented',
  'verified',
  'accepted',
  'blocked',
  'deprecated',
] as const;

export type RoadmapStageStatus = (typeof ROADMAP_STAGE_STATUSES)[number];
export type RoadmapTrackId = 'REBUILD_2026' | 'LEGACY_RT_FE' | 'LEGACY_STAGE_32_84';

export interface StageTestExecutionEvidence {
  readonly testName: string;
  readonly stageId: string;
  readonly command: string;
  readonly passed: boolean;
  readonly durationMs: number;
  readonly commitSha: string;
  readonly executedAtIso: string;
}

export interface MasterRoadmapStageEntry {
  readonly stageId: string;
  readonly stageNumber: number;
  readonly track: RoadmapTrackId;
  readonly title: string;
  readonly ownerDomain: string;
  readonly dependencies: readonly string[];
  readonly status: RoadmapStageStatus;
  readonly testManifest: readonly string[];
  readonly acceptanceEvidence: readonly StageTestExecutionEvidence[];
  readonly version: string;
  readonly legacyTabId?: string;
}

const rStage = (
  stageId: string,
  stageNumber: number,
  track: RoadmapTrackId,
  title: string,
  ownerDomain: string,
  dependencies: readonly string[],
  status: RoadmapStageStatus,
  testManifest: readonly string[],
  legacyTabId?: string,
): MasterRoadmapStageEntry => ({
  stageId,
  stageNumber,
  track,
  title,
  ownerDomain,
  dependencies,
  status,
  testManifest,
  acceptanceEvidence: [],
  version: '1.0.0',
  ...(legacyTabId ? { legacyTabId } : {}),
});

export const MASTER_FRONTEND_ROADMAP_REGISTRY: readonly MasterRoadmapStageEntry[] = [
  rStage('RT-FE-REBUILD-FOUNDATION-001', 1, 'REBUILD_2026', 'معماری پایه، لایه‌بندی و جداسازی دامنه فرانت‌اند', 'platform/architecture', [], 'verified', ['tests/rt-fe-rebuild-stages-1-to-3.test.ts']),
  rStage('RT-FE-REBUILD-MAP-GIS-004', 4, 'REBUILD_2026', 'بازسازی موتور نقشه، GIS و لایه‌های مکانی', 'features/map', ['RT-FE-REBUILD-FOUNDATION-001'], 'verified', ['tests/rt-fe-rebuild-stage-4-map-gis.test.ts']),
  rStage('RT-FE-REBUILD-MESSAGING-010', 10, 'REBUILD_2026', 'بازسازی معماری پیام‌رسان داخلی و چرخه تحویل پیام', 'platform/messaging', ['RT-FE-REBUILD-FOUNDATION-001'], 'verified', ['tests/rt-fe-rebuild-stages-10-to-21.test.ts']),
  rStage('RT-FE-REBUILD-PROFILE-IDENTITY-011', 11, 'REBUILD_2026', 'بازسازی پروفایل، هویت حرفه‌ای و سازمانی', 'platform/identity', ['RT-FE-REBUILD-FOUNDATION-001'], 'verified', ['tests/rt-fe-rebuild-stages-10-to-21.test.ts']),
  rStage('RT-FE-REBUILD-LISTING-DATA-INTEGRITY-012', 12, 'REBUILD_2026', 'بازسازی صحت داده آگهی، قیمت، مختصات و چرخه انتشار', 'platform/listing-integrity', ['RT-FE-REBUILD-PROFILE-IDENTITY-011'], 'verified', ['tests/rt-fe-rebuild-stages-10-to-21.test.ts']),
  rStage('RT-FE-REBUILD-CLIENT-SECURITY-013', 13, 'REBUILD_2026', 'بازسازی امنیت سمت کاربر و حذف اعتماد ناامن کلاینت', 'platform/security', ['RT-FE-REBUILD-LISTING-DATA-INTEGRITY-012'], 'verified', ['tests/rt-fe-rebuild-stages-10-to-21.test.ts']),
  rStage('RT-FE-REBUILD-FRONTEND-RESILIENCE-014', 14, 'REBUILD_2026', 'بازسازی تاب‌آوری عملیاتی فرانت‌اند و بازیابی وضعیت', 'platform/resilience', ['RT-FE-REBUILD-CLIENT-SECURITY-013'], 'verified', ['tests/rt-fe-rebuild-stages-10-to-21.test.ts']),
  rStage('RT-FE-REBUILD-API-CONTRACT-INTEGRITY-015', 15, 'REBUILD_2026', 'بازسازی یکپارچگی قراردادهای API و اعتبارسنجی مرز داده', 'platform/api-contracts', ['RT-FE-REBUILD-FRONTEND-RESILIENCE-014'], 'verified', ['tests/rt-fe-rebuild-stages-10-to-21.test.ts']),
  rStage('RT-FE-REBUILD-ACCESSIBILITY-REACHABILITY-016', 16, 'REBUILD_2026', 'رفع موانع بحرانی دسترس‌پذیری، صفحه‌کلید و ۹ Viewport مرجع', 'platform/accessibility', ['RT-FE-REBUILD-FOUNDATION-001'], 'verified', ['tests/rt-fe-rebuild-stages-10-to-21.test.ts']),
  rStage('RT-FE-REBUILD-FINANCIAL-TRUST-BOUNDARY-017', 17, 'REBUILD_2026', 'بازسازی مرز اعتماد رابط مالی و حذف تأیید محلی تراکنش', 'platform/financial-trust', ['RT-FE-REBUILD-CLIENT-SECURITY-013', 'RT-FE-REBUILD-API-CONTRACT-INTEGRITY-015'], 'verified', ['src/features/onboarding/tests/stage44TransactionArchitecture.test.ts', 'tests/rt-fe-rebuild-stages-10-to-21.test.ts']),
  rStage('RT-FE-REBUILD-E2E-CRITICAL-JOURNEYS-018', 18, 'REBUILD_2026', 'بازسازی آزمون‌های انتها‌به‌انتها و ۱۲ گردش‌کار حیاتی محصول', 'tests/e2e', ['RT-FE-REBUILD-FINANCIAL-TRUST-BOUNDARY-017'], 'verified', ['tests/e2e/journeys/critical-journeys-matrix.e2e.spec.ts']),
  rStage('RT-FE-REBUILD-ACCOUNT-DATA-RIGHTS-LIFECYCLE-019', 19, 'REBUILD_2026', 'بازسازی تجربه حقوق داده کاربر، خروجی ۷ منبع و چرخه حذف امن حساب', 'features/account', ['RT-FE-REBUILD-CLIENT-SECURITY-013'], 'verified', ['src/features/account/tests/accountActionLifecycle.test.ts', 'tests/rt-fe-rebuild-stages-10-to-21.test.ts']),
  rStage('RT-FE-REBUILD-MULTICITY-CONTEXT-INTEGRITY-020', 20, 'REBUILD_2026', 'یکپارچگی Context جغرافیایی چندشهری و حذف Fallback خاموش بین ۵ شهر', 'platform/geo-context', ['RT-FE-REBUILD-MAP-GIS-004'], 'verified', ['src/features/market/tests/marketIntelligenceCenter.test.ts', 'tests/rt-fe-rebuild-stages-10-to-21.test.ts']),
  rStage('RT-FE-REBUILD-ROADMAP-AND-QUALITY-GOVERNANCE-021', 21, 'REBUILD_2026', 'تثبیت مرجع یگانه نقشه راه فرانت‌اند، یکپارچه‌سازی شناسه مراحل و دروازه کیفیت CI', 'platform/roadmap-governance', ['RT-FE-REBUILD-API-CONTRACT-INTEGRITY-015', 'RT-FE-REBUILD-ACCESSIBILITY-REACHABILITY-016', 'RT-FE-REBUILD-E2E-CRITICAL-JOURNEYS-018', 'RT-FE-REBUILD-MULTICITY-CONTEXT-INTEGRITY-020'], 'verified', ['tests/rt-fe-rebuild-stages-10-to-21.test.ts']),
  rStage('RT-FE-REBUILD-PAYMENTS-BILLING-PRODUCTION-022', 22, 'REBUILD_2026', 'اتصال عملیاتی رابط پرداخت، کیف پول، صورت‌حساب و اشتراک به سرویس‌های مالی معتبر Backend', 'features/commerce', ['RT-FE-REBUILD-FINANCIAL-TRUST-BOUNDARY-017', 'RT-FE-REBUILD-E2E-CRITICAL-JOURNEYS-018', 'RT-FE-REBUILD-ROADMAP-AND-QUALITY-GOVERNANCE-021'], 'designed', []),
  rStage('RT-FE-REBUILD-ADMIN-OPERATIONS-AUTHORITY-023', 23, 'REBUILD_2026', 'بازسازی یکپارچگی داده و گردش‌کار عملیات مدیریتی، حذف وضعیت‌های نمایشی و تضمین تأیید سروری اقدامات حساس', 'features/admin', ['RT-FE-REBUILD-CLIENT-SECURITY-013', 'RT-FE-REBUILD-FRONTEND-RESILIENCE-014', 'RT-FE-REBUILD-API-CONTRACT-INTEGRITY-015', 'RT-FE-REBUILD-ROADMAP-AND-QUALITY-GOVERNANCE-021'], 'designed', ['src/features/admin/tests/adminGovernance.test.ts']),
  rStage('RT-FE-REBUILD-DATA-COMMERCE-PORTAL-024', 24, 'REBUILD_2026', 'ایجاد تجربه یکپارچه عرضه و مصرف محصولات داده‌ای، کاتالوگ تجاری، دسترسی API و ابزارهای MCP برای مشتریان بیرونی', 'features/commerce', ['RT-FE-REBUILD-API-CONTRACT-INTEGRITY-015', 'RT-FE-REBUILD-CLIENT-SECURITY-013', 'RT-FE-REBUILD-MULTICITY-CONTEXT-INTEGRITY-020', 'RT-FE-REBUILD-PAYMENTS-BILLING-PRODUCTION-022', 'RT-FE-REBUILD-ADMIN-OPERATIONS-AUTHORITY-023'], 'designed', []),
  rStage('RT-FE-REBUILD-VALUATION-AUTHORITY-025', 25, 'REBUILD_2026', 'یکپارچه‌سازی مرجع محاسبه ارزش ملک، اتصال Workspace به سرویس معتبر ارزش‌گذاری و تفکیک خروجی کارشناسی از سناریوی محلی', 'features/valuation', ['RT-FE-REBUILD-LISTING-DATA-INTEGRITY-012', 'RT-FE-REBUILD-API-CONTRACT-INTEGRITY-015', 'RT-FE-REBUILD-MULTICITY-CONTEXT-INTEGRITY-020', 'RT-FE-REBUILD-ROADMAP-AND-QUALITY-GOVERNANCE-021'], 'designed', ['src/features/valuation/tests/valuationWorkspace.test.ts']),
  rStage('RT-FE-REBUILD-TELEMETRY-CONSENT-DELIVERY-026', 26, 'REBUILD_2026', 'بازسازی رضایت آگاهانه، کنترل جمع‌آوری داده رفتاری و یکپارچگی زنجیره تحویل Telemetry از فرانت‌اند تا مخزن', 'features/analytics', ['RT-FE-REBUILD-CLIENT-SECURITY-013', 'RT-FE-REBUILD-FRONTEND-RESILIENCE-014', 'RT-FE-REBUILD-API-CONTRACT-INTEGRITY-015', 'RT-FE-REBUILD-ACCOUNT-DATA-RIGHTS-LIFECYCLE-019', 'RT-FE-REBUILD-ROADMAP-AND-QUALITY-GOVERNANCE-021'], 'designed', []),
  // Legacy Historical Track (preserved without collision against RT-FE-REBUILD-*)
  rStage('RT-FE-ENTITY-DETAIL-021', 21, 'LEGACY_RT_FE', 'صفحات جزئیات موجودیت، ملک، ساختمان و محله (Legacy Track)', 'features/onboarding', [], 'verified', ['src/features/onboarding/tests/rtFeStage21EntityDetail.test.ts'], 'rt_fe_entity_021'),
  rStage('RT-FE-NOTIFICATION-023', 23, 'LEGACY_RT_FE', 'مرکز اعلان‌ها، ارتباطات چندکاناله و ترجیحات (Legacy Track)', 'features/onboarding', ['RT-FE-ENTITY-DETAIL-021'], 'verified', ['src/features/onboarding/tests/rtFeStage23Notification.test.ts'], 'rt_fe_notification_023'),
  rStage('RT-FE-USER-ACCOUNT-024', 24, 'LEGACY_RT_FE', 'حساب کاربری، پروفایل، هویت دیجیتال و پل مرحله ۲۵ (Legacy Track)', 'features/onboarding', ['RT-FE-ENTITY-DETAIL-021'], 'verified', ['src/features/onboarding/tests/rtFeStage24Account.test.ts'], 'rt_fe_account_024'),
  rStage('RT-FE-USER-ACCESS-CONTROL-025', 25, 'LEGACY_RT_FE', 'کنترل دسترسی کاربر و مجوزها — پل مرحله ۲۴ به ۲۵ (Legacy Track)', 'features/onboarding', ['RT-FE-USER-ACCOUNT-024'], 'verified', ['src/features/onboarding/tests/rtFeStage24Account.test.ts']),
] as const;

export function validateRoadmapRegistryIntegrity(
  entries: readonly MasterRoadmapStageEntry[] = MASTER_FRONTEND_ROADMAP_REGISTRY,
): {
  readonly valid: boolean;
  readonly duplicateStageIds: readonly string[];
  readonly missingDependencies: readonly string[];
  readonly unverifiedAcceptedStages: readonly string[];
  readonly collisionResolvedForStage21: boolean;
} {
  const seenIds = new Set<string>();
  const duplicateStageIds: string[] = [];
  for (const entry of entries) {
    if (seenIds.has(entry.stageId)) duplicateStageIds.push(entry.stageId);
    seenIds.add(entry.stageId);
  }
  const missingDependencies: string[] = [];
  const unverifiedAcceptedStages: string[] = [];
  for (const entry of entries) {
    for (const depId of entry.dependencies) {
      if (!seenIds.has(depId)) missingDependencies.push(`${entry.stageId}->${depId}`);
    }
    if (entry.status === 'accepted' && (entry.acceptanceEvidence.length === 0 || entry.acceptanceEvidence.some((ev) => !ev.passed))) {
      unverifiedAcceptedStages.push(entry.stageId);
    }
  }
  const rebuild21 = entries.find((e) => e.stageId === 'RT-FE-REBUILD-ROADMAP-AND-QUALITY-GOVERNANCE-021');
  const legacy21 = entries.find((e) => e.stageId === 'RT-FE-ENTITY-DETAIL-021');
  const collisionResolvedForStage21 = Boolean(
    rebuild21 && legacy21 && rebuild21.stageId !== legacy21.stageId && rebuild21.track === 'REBUILD_2026' && legacy21.track === 'LEGACY_RT_FE',
  );
  return {
    valid: duplicateStageIds.length === 0 && missingDependencies.length === 0 && unverifiedAcceptedStages.length === 0 && collisionResolvedForStage21,
    duplicateStageIds,
    missingDependencies,
    unverifiedAcceptedStages,
    collisionResolvedForStage21,
  };
}

export function canTransitionStageToAccepted(entry: MasterRoadmapStageEntry): {
  readonly allowed: boolean;
  readonly reasonCode: 'ACCEPTED_WITH_EVIDENCE' | 'MISSING_TEST_MANIFEST' | 'MISSING_EXECUTION_EVIDENCE' | 'FAILING_TEST_EVIDENCE';
} {
  if (entry.testManifest.length === 0) return { allowed: false, reasonCode: 'MISSING_TEST_MANIFEST' };
  if (entry.acceptanceEvidence.length === 0) return { allowed: false, reasonCode: 'MISSING_EXECUTION_EVIDENCE' };
  if (entry.acceptanceEvidence.some((ev) => !ev.passed || ev.durationMs < 0 || !ev.commitSha)) {
    return { allowed: false, reasonCode: 'FAILING_TEST_EVIDENCE' };
  }
  return { allowed: true, reasonCode: 'ACCEPTED_WITH_EVIDENCE' };
}

import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; import { DEFAULT_FEATURE_FLAGS, type FeatureFlags } from './security';
export type DeploymentEnvironmentName = 'development' | 'test' | 'staging' | 'production'; export interface EnvironmentValidationReport { environment: DeploymentEnvironmentName; valid: boolean; exposedClientSecrets: string[]; devUrlsInProduction: string[]; prodTargetsInTest: string[];
  missingRequiredVars: string[]; unsafeFallbacksDetected: string[]; }
const SERVER_ONLY_SECRET_NAMES = new Set([
  'ADMIN_API_SECRET', 'GEMINI_API_KEY', 'OBJECT_STORAGE_ACCESS_KEY', 'OBJECT_STORAGE_SECRET_KEY', 'TELEGRAM_BOT_TOKEN', 'FIREBASE_SERVICE_ACCOUNT_KEY', ]); export function validateEnvironmentSeparationMatrix(params: { environment: DeploymentEnvironmentName;
  envVars: Record<string, string | undefined>; }): EnvironmentValidationReport { const exposedClientSecrets: string[] = []; const devUrlsInProduction: string[] = [];
  const prodTargetsInTest: string[] = []; const missingRequiredVars: string[] = []; const unsafeFallbacksDetected: string[] = []; for (const [key, rawVal] of Object.entries(params.envVars)) { const val = (rawVal ?? '').trim(); if (key.startsWith('VITE_')) { const stripped = key.replace(/^VITE_/, ''); if (
        SERVER_ONLY_SECRET_NAMES.has(stripped) || /SECRET|PRIVATE_KEY|BOT_TOKEN|ADMIN_API|GEMINI_API/i.test(key)
      ) { exposedClientSecrets.push(key); } }
    if (params.environment === 'production' && val) { if (
        /^(https?|ws):\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i.test(val) && (key.includes('URL') || key.includes('ENDPOINT') || key.includes('ORIGIN'))
      ) { devUrlsInProduction.push(key);
      }
      if (/^(admin|123456|password|changeme|default-secret|test-secret)$/i.test(val)) { unsafeFallbacksDetected.push(key);
      } }
    if (params.environment === 'test' && val) {
      if (key === 'OBJECT_STORAGE_BUCKET' && /prod|production/i.test(val)) {
        prodTargetsInTest.push(key);
      }
    }
  }
  if (params.environment === 'production') {
    for (const reqKey of ['FIREBASE_PROJECT_ID', 'ADMIN_API_SECRET']) {
      if (!(params.envVars[reqKey] ?? '').trim()) {
        missingRequiredVars.push(reqKey);
      }
    }
  }
  const valid =
    exposedClientSecrets.length === 0 &&
    devUrlsInProduction.length === 0 &&
    prodTargetsInTest.length === 0 &&
    missingRequiredVars.length === 0 &&
    unsafeFallbacksDetected.length === 0;
  return {
    environment: params.environment, valid, exposedClientSecrets,
    devUrlsInProduction, prodTargetsInTest, missingRequiredVars, unsafeFallbacksDetected,
  };
}
export interface BuildOutputVerificationReport {
  distExists: boolean; indexHtmlExists: boolean; referencedJsAssets: string[];
  referencedCssAssets: string[]; missingReferencedAssets: string[]; unhashedAssetNames: string[];
  publicSourceMapsFound: string[]; chunksExceeding600Kb: Array<{ file: string; sizeKb: number }>;
  deterministicManifestHash: string; passed: boolean;
}
export function verifyProductionBuildIntegrityAndHtmlAssets(
  distDir = path.resolve(process.cwd(), 'dist'),
): BuildOutputVerificationReport {
  const indexHtmlPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(distDir) || !fs.existsSync(indexHtmlPath)) {
    return {
      distExists: fs.existsSync(distDir), indexHtmlExists: false,
      referencedJsAssets: [], referencedCssAssets: [], missingReferencedAssets: ['index.html'],
      unhashedAssetNames: [], publicSourceMapsFound: [], chunksExceeding600Kb: [],
      deterministicManifestHash: '', passed: false,
    };
  }
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const referencedJsAssets: string[] = []; const referencedCssAssets: string[] = [];
  const missingReferencedAssets: string[] = []; const unhashedAssetNames: string[] = [];
  const scriptRegex = /<script\b[^>]*?\bsrc=["']([^"']+)["']/gi;
  const linkRegex = /<link\b[^>]*?\bhref=["']([^"']+\.css)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRegex.exec(html)) !== null) {
    if (!/^https?:/i.test(m[1])) referencedJsAssets.push(m[1]);
  }
  while ((m = linkRegex.exec(html)) !== null) {
    if (!/^https?:/i.test(m[1])) referencedCssAssets.push(m[1]);
  }
  const resolvedDistRoot = path.resolve(distDir);
  for (const ref of [...referencedJsAssets, ...referencedCssAssets]) {
    const cleanRel = ref.replace(/^\//, '');
    const resolved = path.resolve(resolvedDistRoot, cleanRel);
    const insideDist = resolved.startsWith(`${resolvedDistRoot}${path.sep}`) && !cleanRel.includes('..');
    if (!insideDist || !fs.existsSync(resolved)) missingReferencedAssets.push(ref);
    const base = path.basename(cleanRel);
    if (!/-[A-Za-z0-9_-]{6,}\.(js|css)$/.test(base)) unhashedAssetNames.push(base);
  }
  const publicSourceMapsFound: string[] = [];
  const chunksExceeding600Kb: Array<{ file: string; sizeKb: number }> = [];
  const fileDigests: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(distDir, full).replace(/\\/g, '/');
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name.endsWith('.map')) publicSourceMapsFound.push(rel);
      const buf = fs.readFileSync(full);
      const sizeKb = Number((buf.byteLength / 1024).toFixed(2));
      if (entry.name.endsWith('.js') && sizeKb > 600) chunksExceeding600Kb.push({ file: rel, sizeKb });
      const sha = crypto.createHash('sha256').update(buf).digest('hex');
      fileDigests.push(`${rel}:${sha}`);
    }
  };
  walk(distDir);
  const deterministicManifestHash = crypto.createHash('sha256').update(fileDigests.join('\n')).digest('hex');
  const passed =
    referencedJsAssets.length > 0 && referencedCssAssets.length > 0 &&
    missingReferencedAssets.length === 0 && unhashedAssetNames.length === 0 &&
    publicSourceMapsFound.length === 0 && chunksExceeding600Kb.length === 0;
  return {
    distExists: true, indexHtmlExists: true, referencedJsAssets, referencedCssAssets,
    missingReferencedAssets, unhashedAssetNames, publicSourceMapsFound,
    chunksExceeding600Kb, deterministicManifestHash, passed,
  };
}
export type QualityGateTier =
  | 'MANDATORY_BLOCKING'
  | 'NON_BLOCKING_WARNING'
  | 'SCHEDULED_DEEP_VERIFICATION'
  | 'MANUAL_RELEASE_APPROVAL';
export interface QualityCheckResultInput {
  checkId: string; tier: QualityGateTier; passed: boolean; durationMs: number; details: string;
}
export function evaluateReleaseQualityGate(checks: readonly QualityCheckResultInput[]): {
  releaseAllowed: boolean; blockingFailures: string[]; nonBlockingWarnings: string[]; totalDurationMs: number;
} {
  const blockingFailures: string[] = []; const nonBlockingWarnings: string[] = [];
  let totalDurationMs = 0;
  for (const c of checks) {
    totalDurationMs += Math.max(0, c.durationMs);
    if (!c.passed) {
      if (c.tier === 'MANDATORY_BLOCKING') blockingFailures.push(c.checkId);
      else if (c.tier === 'NON_BLOCKING_WARNING') nonBlockingWarnings.push(c.checkId);
    }
  }
  return { releaseAllowed: blockingFailures.length === 0, blockingFailures, nonBlockingWarnings, totalDurationMs };
}
export interface SafeBuildIdentityStamp {
  appName: string; semver: string; gitCommitShortSha: string; buildTimestampUtc: string;
  releaseId: string; environment: DeploymentEnvironmentName; apiContractVersion: 'v1'; containsExposedSecrets: false;
  displayAreaUnitLabel?: string; referenceValuationIntlText?: string;
}
export function generateBuildIdentityMetadata(params: {
  semver: string; gitCommitSha: string; buildTimestampMs: number; environment: DeploymentEnvironmentName;
  areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode;
}): SafeBuildIdentityStamp {
  const resolvedUnit = params.areaUnit ?? getStoredAreaUnit(); const resolvedCurrency = params.intlCurrency ?? getStoredIntlCurrency();
  const cleanSemver = /^\d+\.\d+\.\d+(-[A-Za-z0-9.]+)?$/.test(params.semver.trim()) ? params.semver.trim() : '1.0.0';
  const cleanSha = params.gitCommitSha.replace(/[^a-fA-F0-9]/g, '').slice(0, 8).toLowerCase() || 'localdev';
  const iso = new Date(params.buildTimestampMs).toISOString();
  const dateCompact = iso.slice(0, 10).replace(/-/g, '');
  return {
    appName: 'radar-tehran', semver: cleanSemver, gitCommitShortSha: cleanSha, buildTimestampUtc: iso,
    releaseId: `rel-${cleanSemver}-${dateCompact}-${cleanSha}`, environment: params.environment,
    apiContractVersion: 'v1', containsExposedSecrets: false,
    displayAreaUnitLabel: formatAreaUnitLabel(resolvedUnit),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(14500, resolvedCurrency),
  };
}
export interface SchemaMigrationChangeDescriptor {
  changeId: string;
  operation:
    | 'ADD_OPTIONAL_FIELD'
    | 'ADD_REQUIRED_FIELD_WITHOUT_DEFAULT'
    | 'REMOVE_EXISTING_FIELD'
    | 'RENAME_EXISTING_FIELD'
    | 'CHANGE_FIELD_TYPE_IN_PLACE'
    | 'ADD_COMPOSITE_INDEX';
  dualReadFallbackImplemented: boolean;
}
export function evaluateApiAndSchemaReleaseCompatibility(
  changes: readonly SchemaMigrationChangeDescriptor[],
): {
  backwardCompatibleWithPreviousAppVersion: boolean;
  safeForStatelessInstantRollback: boolean;
  blockingBreakingChanges: string[];
  recommendedStagePattern: 'STATELESS_DIRECT_DEPLOY' | 'EXPAND_MIGRATE_CONTRACT_5_STAGE';
} {
  const blockingBreakingChanges: string[] = [];
  for (const c of changes) {
    if (
      c.operation === 'ADD_REQUIRED_FIELD_WITHOUT_DEFAULT' ||
      c.operation === 'REMOVE_EXISTING_FIELD' ||
      c.operation === 'RENAME_EXISTING_FIELD' ||
      c.operation === 'CHANGE_FIELD_TYPE_IN_PLACE'
    ) {
      if (!c.dualReadFallbackImplemented) {
        blockingBreakingChanges.push(`${c.changeId}:${c.operation}`);
      }
    }
  }
  const backwardCompatibleWithPreviousAppVersion = blockingBreakingChanges.length === 0;
  return {
    backwardCompatibleWithPreviousAppVersion,
    safeForStatelessInstantRollback: backwardCompatibleWithPreviousAppVersion,
    blockingBreakingChanges,
    recommendedStagePattern:
      changes.length === 0 ? 'STATELESS_DIRECT_DEPLOY' : 'EXPAND_MIGRATE_CONTRACT_5_STAGE',
  };
}
export function evaluateControlledFeatureFlagState(params: {
  flagKey: keyof FeatureFlags;
  overrides?: Partial<FeatureFlags>;
  actorAuthenticated: boolean;
  actorIsAdmin: boolean;
  requiresAdminAuthorization: boolean;
}): {
  uiVisible: boolean;
  serverAuthorized: boolean;
  effectiveDefaultUsed: boolean;
  reason: string;
} {
  const hasOverride =
    params.overrides !== undefined && typeof params.overrides[params.flagKey] === 'boolean';
  const flagEnabled = hasOverride
    ? Boolean(params.overrides![params.flagKey])
    : DEFAULT_FEATURE_FLAGS[params.flagKey];
  if (!flagEnabled) {
    return {
      uiVisible: false,
      serverAuthorized: false,
      effectiveDefaultUsed: !hasOverride,
      reason: 'FLAG_DISABLED',
    };
  }
  if (params.requiresAdminAuthorization && (!params.actorAuthenticated || !params.actorIsAdmin)) {
    return {
      uiVisible: false,
      serverAuthorized: false,
      effectiveDefaultUsed: !hasOverride, reason: 'SERVER_RBAC_DENIED_DESPITE_ENABLED_FLAG', }; } return { uiVisible: true, serverAuthorized: true, effectiveDefaultUsed: !hasOverride, reason: 'FLAG_AND_RBAC_AUTHORIZED', }; }
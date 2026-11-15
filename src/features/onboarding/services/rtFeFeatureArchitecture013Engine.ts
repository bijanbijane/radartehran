/**
 * Stage 13 (Modularization Track) — Executable Architecture Governance Engine
 * Spec ID: RT-FE-FEATURE-ARCHITECTURE-013
 * Implements FeatureManifest contracts, Import Boundary Validator, DFS Cycle Detector,
 * Access/Flag isolation, AI Agent Task Boundary validator, and Contract Versioning check.
 */

export * from './rtFeFeatureArchitecture013Specs';
export * from './rtFeFeatureArchitecture013ExtendedSpecs';
import { RT_FEA_ENTITY_OWNERSHIP_11 } from './rtFeFeatureArchitecture013ExtendedSpecs';

export interface FeatureManifest {
  id: string;
  name: string;
  version: string;
  status: 'planned' | 'active' | 'deprecated' | 'disabled';
  owner: string;
  publicContracts: string[];
  dependencies: string[];
  capabilities: string[];
  routes?: string[];
  permissions?: string[];
  dataOwnership: string[];
  eventsPublished?: string[];
  eventsConsumed?: string[];
}

export interface FeatureDependency {
  sourceFeature: string;
  targetFeature: string;
  dependencyType: 'contract' | 'event' | 'composition';
  required: boolean;
  reason: string;
  contractVersion?: string;
}

export interface FeatureEvent<T = unknown> {
  eventId: string;
  eventName: string;
  eventVersion: number;
  occurredAt: string;
  sourceFeature: string;
  payload: T;
}

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  rolloutPercentage?: number;
  environment: 'development' | 'staging' | 'production';
}

export interface AgentTaskBoundary {
  taskId: string;
  targetFeature: string;
  allowedPaths: string[];
  restrictedPaths: string[];
  publicContracts: string[];
  dependencies: string[];
  acceptanceCriteria: string[];
  requiredTests: string[];
}

export const RT_FEAT_SAMPLE_DEPENDENCY_REGISTRY: readonly FeatureDependency[] = [
  { sourceFeature: 'valuation', targetFeature: 'properties', dependencyType: 'contract', required: true, reason: 'Read property information', contractVersion: '1.0' },
  { sourceFeature: 'valuation', targetFeature: 'neighborhoods', dependencyType: 'contract', required: true, reason: 'Read neighborhood baseline price index', contractVersion: '1.0' },
  { sourceFeature: 'search', targetFeature: 'properties', dependencyType: 'contract', required: true, reason: 'Build searchable property cards', contractVersion: '1.0' },
  { sourceFeature: 'search', targetFeature: 'neighborhoods', dependencyType: 'contract', required: false, reason: 'Neighborhood filtering', contractVersion: '1.0' },
  { sourceFeature: 'listings', targetFeature: 'properties', dependencyType: 'contract', required: true, reason: 'Attach listing to canonical property entity', contractVersion: '1.0' },
  { sourceFeature: 'urban-analytics', targetFeature: 'neighborhoods', dependencyType: 'contract', required: true, reason: 'Aggregate urban indicators by neighborhood', contractVersion: '1.0' },
];

/** Enforces §13.7 & §13.8: Cross-feature imports may only enter via public/index or public/, never internal folders. */
export function validateFeatureImportBoundary(input: {
  importerLayer: 'app' | 'feature' | 'shared';
  importerFeature?: string;
  importPath: string;
}): { allowed: boolean; ruleViolated: string | null; messageFa: string } {
  const normalized = input.importPath.replace(/\\/g, '/');
  const featureMatch = normalized.match(/(?:@\/|src\/)?features\/([^/]+)\/(.+)$/);

  if (input.importerLayer === 'shared' && featureMatch) {
    return {
      allowed: false,
      ruleViolated: 'SHARED_MUST_NOT_DEPEND_ON_FEATURE',
      messageFa: `خطای معماری (§۱۳.۸): لایه Shared مجاز به واردکردن کد از ماژول «${featureMatch[1]}» نیست.`,
    };
  }

  if (featureMatch) {
    const targetFeature = featureMatch[1];
    const subPath = featureMatch[2];
    const isSameFeature = input.importerLayer === 'feature' && input.importerFeature === targetFeature;
    const isPublicEntry = subPath === 'public' || subPath === 'public/index.ts' || subPath === 'public/index' || subPath.startsWith('public/');
    if (!isSameFeature && !isPublicEntry) {
      return {
        allowed: false,
        ruleViolated: 'DIRECT_INTERNAL_IMPORT_FORBIDDEN',
        messageFa: `خطای مرزبندی (§۱۳.۷): دسترسی مستقیم به مسیر داخلی «${subPath}» در ماژول «${targetFeature}» ممنوع است؛ فقط از public/index.ts استفاده کنید.`,
      };
    }
  }

  return {
    allowed: true,
    ruleViolated: null,
    messageFa: 'مسیر Import با قوانین مرزبندی و Public API ماژول‌ها منطبق است.',
  };
}

/** Detects circular dependencies across the Feature Dependency Registry (§13.8 & §13.9). */
export function detectFeatureDependencyCycles(dependencies: readonly FeatureDependency[]): {
  hasCycle: boolean;
  cyclePath: string[];
  affectedPairs: string[];
} {
  const adj = new Map<string, string[]>();
  for (const dep of dependencies) {
    const list = adj.get(dep.sourceFeature) ?? [];
    list.push(dep.targetFeature);
    adj.set(dep.sourceFeature, list);
  }

  const visited = new Set<string>();
  const onStack = new Set<string>();
  const stack: string[] = [];

  const dfs = (node: string): string[] | null => {
    visited.add(node);
    onStack.add(node);
    stack.push(node);

    for (const next of adj.get(node) ?? []) {
      if (!visited.has(next)) {
        const res = dfs(next);
        if (res) return res;
      } else if (onStack.has(next)) {
        const idx = stack.indexOf(next);
        return [...stack.slice(idx), next];
      }
    }

    stack.pop();
    onStack.delete(node);
    return null;
  };

  for (const node of adj.keys()) {
    if (!visited.has(node)) {
      const cycle = dfs(node);
      if (cycle) {
        const affectedPairs: string[] = [];
        for (let i = 0; i < cycle.length - 1; i++) {
          affectedPairs.push(`${cycle[i]} -> ${cycle[i + 1]}`);
        }
        return { hasCycle: true, cyclePath: cycle, affectedPairs };
      }
    }
  }

  return { hasCycle: false, cyclePath: [], affectedPairs: [] };
}

/** Enforces §13.16 & §13.26: Feature Flag can NEVER bypass Role Permissions or Admin isolation. */
export function evaluateFeatureAccessAndFlag(input: {
  featureStatus: 'planned' | 'active' | 'deprecated' | 'disabled';
  accessScope: 'public' | 'authenticated' | 'administrative';
  flagEnabled: boolean;
  userAuthenticated: boolean;
  isAdmin: boolean;
}): { accessible: boolean; includedInPublicBundle: boolean; reasonFa: string } {
  const includedInPublicBundle = input.accessScope !== 'administrative';
  if (input.featureStatus === 'disabled' || input.featureStatus === 'planned' || !input.flagEnabled) {
    return {
      accessible: false,
      includedInPublicBundle,
      reasonFa: 'قابلیت در Feature Registry یا Feature Flag غیرفعال/در حال برنامه‌ریزی است.',
    };
  }
  if (input.accessScope === 'administrative' && !input.isAdmin) {
    return {
      accessible: false,
      includedInPublicBundle: false,
      reasonFa: 'دسترسی مسدود شد: فعال‌بودن Feature Flag جایگزین مجوز مدیر نیست و Bundle ادمین ایزوله می‌ماند.',
    };
  }
  if (input.accessScope === 'authenticated' && !input.userAuthenticated) {
    return {
      accessible: false,
      includedInPublicBundle,
      reasonFa: 'دسترسی نیازمند احراز هویت معتبر کاربر و تأیید سمت Backend است.',
    };
  }
  return {
    accessible: true,
    includedInPublicBundle,
    reasonFa: 'مجاز: وضعیت چرخه عمر، Feature Flag و سطح دسترسی کاربر با هم سازگارند.',
  };
}

/** Validates AI Agent edit paths against AgentTaskBoundary (§13.20). */
export function validateAgentTaskBoundary(
  boundary: Pick<AgentTaskBoundary, 'allowedPaths' | 'restrictedPaths'>,
  proposedEditPath: string,
): { permitted: boolean; requiresCentralReview: boolean; reasonFa: string } {
  const clean = proposedEditPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (boundary.restrictedPaths.some((r) => clean.startsWith(r.replace(/^\/+/, '')))) {
    return {
      permitted: false,
      requiresCentralReview: true,
      reasonFa: `تغییر در مسیر محافظت‌شده «${clean}» خارج از مرز مجاز Agent است و نیاز به تأیید معماری دارد.`,
    };
  }
  const insideAllowed = boundary.allowedPaths.some((a) => clean.startsWith(a.replace(/^\/+/, '')));
  if (!insideAllowed) {
    return {
      permitted: false,
      requiresCentralReview: true,
      reasonFa: `مسیر «${clean}» در فهرست allowedPaths مأموریت ثبت نشده است.`,
    };
  }
  const touchesPublic = clean.includes('/public/');
  return {
    permitted: true,
    requiresCentralReview: touchesPublic,
    reasonFa: touchesPublic
      ? 'مجاز با هشدار: تغییر در Public API نیازمند بررسی مصرف‌کنندگان و نسخه‌بندی است.'
      : 'تغییر در محدوده داخلی Feature و کاملاً منطبق با مرز مأموریت Agent است.',
  };
}

/** Evaluates Public Contract change compatibility (§13.21). */
export function evaluateContractChangeCompatibility(change: {
  addsOptionalField?: boolean;
  removesPublicField?: boolean;
  changesFieldTypeOrMeaning?: boolean;
  hasNewContractVersion?: boolean;
  migrationPlanDefined?: boolean;
}): { compatibility: 'backward-compatible' | 'breaking'; allowedToMerge: boolean; guidanceFa: string } {
  const isBreaking = Boolean(change.removesPublicField || change.changesFieldTypeOrMeaning);
  if (!isBreaking) {
    return {
      compatibility: 'backward-compatible',
      allowedToMerge: true,
      guidanceFa: 'تغییر سازگار با نسخه‌های قبلی است (افزودن فیلد اختیاری یا عملیات مستقل).',
    };
  }
  const ready = Boolean(change.hasNewContractVersion && change.migrationPlanDefined);
  return {
    compatibility: 'breaking',
    allowedToMerge: ready,
    guidanceFa: ready
      ? 'تغییر ناسازگار همراه با نسخه جدید قرارداد و برنامه مهاجرت مصرف‌کنندگان ثبت شده است.'
      : 'تغییر ناسازگار متوقف شد: پیش از ادغام باید نسخه جدید قرارداد و مسیر مهاجرت تعریف شود.',
  };
}

/** Validates Feature ID, Folder, Event & Contract naming conventions (§13.24). */
export function validateFeatureNamingStandard(input: {
  featureId: string;
  folderName: string;
  eventName: string;
}): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!/^FEAT-[A-Z]{2,5}-\d{3}$/.test(input.featureId)) issues.push('featureId');
  if (!/^[a-z][a-z0-9-]*$/.test(input.folderName) || input.folderName === 'module1' || input.folderName === 'newfeature') {
    issues.push('folderName');
  }
  if (!/^[a-z][a-z0-9-]*\.[a-z][a-z0-9_]*$/.test(input.eventName)) issues.push('eventName');
  return { valid: issues.length === 0, issues };
}

/** Enforces single canonical owner per entity (§13.7: consumers cannot call owner repository or mutate owner cache directly). */
export function evaluateEntityOwnershipMutation(input: {
  entity: string;
  actingModule: string;
  action: 'read_via_contract' | 'direct_repository_write' | 'mutate_owner_cache';
}): { allowed: boolean; canonicalOwner: string | null; reasonFa: string } {
  const record = RT_FEA_ENTITY_OWNERSHIP_11.find((item) => item.entity === input.entity);
  const canonicalOwner = record?.owner ?? null;
  if (!canonicalOwner) {
    return { allowed: false, canonicalOwner: null, reasonFa: 'موجودیت در رجیستری مالکیت ثبت نشده است.' };
  }
  if (input.action !== 'read_via_contract' && input.actingModule !== canonicalOwner) {
    return {
      allowed: false,
      canonicalOwner,
      reasonFa: `ممنوع (§۱۳.۷): فقط مالک اصلی «${canonicalOwner}» مجاز به تغییر یا مدیریت Repository «${input.entity}» است.`,
    };
  }
  return {
    allowed: true,
    canonicalOwner,
    reasonFa: `مجاز: مصرف/عملیات روی «${input.entity}» با مالکیت «${canonicalOwner}» سازگار است.`,
  };
}

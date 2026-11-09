/**
 * @file server/modules/platform-foundation/architectureValidator.ts
 * @description Deliverable D09 — Architecture Validation Utilities
 * Validates module registry, dependency graph, domain ownership, API/event contracts,
 * error catalog categories, environment configuration, and secret-pattern hygiene.
 */

import {
  INITIAL_API_CONTRACT_METADATA,
  validateApiContractMetadata,
  validatePlatformEnvironmentConfig,
} from './configAndContracts';
import { ALL_PLATFORM_ERROR_CATEGORIES, getCanonicalErrorCatalog } from './contextAndErrors';
import {
  CANONICAL_ERROR_CATALOG,
  INITIAL_DOMAIN_OWNERSHIP_RECORDS,
  INITIAL_EVENT_CONTRACTS,
  INITIAL_PLATFORM_MODULES,
  INITIAL_SERVICE_DEPENDENCIES,
} from './seedCatalogs';
import type {
  ApiContractMetadataRecord,
  DomainOwnershipRecord,
  EventContractMetadataRecord,
  PlatformErrorCatalogEntry,
  PlatformModuleRecord,
  ServiceDependencyRecord,
} from './types';

export interface ArchitectureValidationViolation {
  ruleCode:
    | 'DUPLICATE_MODULE_CODE'
    | 'MISSING_OR_INVALID_MODULE_OWNER'
    | 'PLANNED_MODULE_MARKED_OPERATIONAL'
    | 'INVALID_DEPENDENCY_MODULE_REFERENCE'
    | 'REQUIRED_STARTUP_DEPENDENCY_CYCLE'
    | 'DUPLICATE_AUTHORITATIVE_OWNERSHIP'
    | 'MISSING_OWNERSHIP_DEFINITION'
    | 'INVALID_API_CONTRACT_METADATA'
    | 'INVALID_EVENT_CONTRACT_METADATA'
    | 'INVALID_ERROR_CATEGORY'
    | 'UNSAFE_ENVIRONMENT_CONFIG'
    | 'SECRET_PATTERN_VIOLATION';
  severity: 'ERROR' | 'WARNING';
  target: string;
  message: string;
}

export interface ArchitectureValidationReport {
  valid: boolean;
  checkedAtIso: string;
  summary: {
    modulesChecked: number;
    dependenciesChecked: number;
    ownershipsChecked: number;
    apiContractsChecked: number;
    eventContractsChecked: number;
    errorCatalogEntriesChecked: number;
    violationsCount: number;
  };
  violations: ArchitectureValidationViolation[];
}

export interface ArchitectureValidationInput {
  modules?: readonly PlatformModuleRecord[];
  dependencies?: readonly ServiceDependencyRecord[];
  ownerships?: readonly DomainOwnershipRecord[];
  apiContracts?: readonly ApiContractMetadataRecord[];
  eventContracts?: readonly EventContractMetadataRecord[];
  errorCatalog?: readonly PlatformErrorCatalogEntry[];
  envConfig?: Record<string, string | undefined>;
  sourceCodeSnippetsToScanForSecrets?: ReadonlyArray<{ filePath: string; content: string }>;
}

const VALID_EMPLOYEE_SET = new Set<string>([
  'EMP_53', 'EMP_54', 'EMP_55', 'EMP_56', 'EMP_57', 'EMP_58', 'EMP_59',
  'EMP_60', 'EMP_61', 'EMP_62', 'EMP_63', 'EMP_64', 'EMP_65', 'EMP_66',
  'EMP_67', 'EMP_68', 'EMP_69', 'EMP_70', 'EMP_71', 'EMP_72', 'EMP_73',
  'EMP_74', 'EMP_75', 'EMP_76', 'EMP_77', 'EMP_78', 'EMP_79', 'EMP_80',
]);

const COMMITTED_SECRET_REGEXES: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'Google API Key literal', pattern: /AIzaSy[0-9A-Za-z_-]{33}/ },
  { label: 'OpenAI/Secret Key literal', pattern: /sk-(?:live|proj)-[0-9A-Za-z_-]{20,}/ },
  { label: 'Private Key PEM block', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
];

export function runPhase1ArchitectureValidation(
  input: ArchitectureValidationInput = {},
): ArchitectureValidationReport {
  const modules = input.modules ?? INITIAL_PLATFORM_MODULES;
  const dependencies = input.dependencies ?? INITIAL_SERVICE_DEPENDENCIES;
  const ownerships = input.ownerships ?? INITIAL_DOMAIN_OWNERSHIP_RECORDS;
  const apiContracts = input.apiContracts ?? INITIAL_API_CONTRACT_METADATA;
  const eventContracts = input.eventContracts ?? INITIAL_EVENT_CONTRACTS;
  const errorCatalog = input.errorCatalog ?? CANONICAL_ERROR_CATALOG;
  const envConfig = input.envConfig ?? process.env;

  const violations: ArchitectureValidationViolation[] = [];

  // 1. Validate Module Registry (duplicate codes, missing/invalid owners, planned modules marked operational)
  const seenModuleCodes = new Set<string>();
  const seenModuleIds = new Set<string>();
  for (const mod of modules) {
    const code = (mod.moduleCode ?? '').trim().toLowerCase();
    if (!code || seenModuleCodes.has(code) || seenModuleIds.has(mod.moduleId)) {
      violations.push({
        ruleCode: 'DUPLICATE_MODULE_CODE',
        severity: 'ERROR',
        target: mod.moduleCode || mod.moduleId,
        message: `Duplicate or empty moduleCode/moduleId '${mod.moduleCode}' detected.`,
      });
    }
    seenModuleCodes.add(code);
    seenModuleIds.add(mod.moduleId);

    if (!mod.owner || !VALID_EMPLOYEE_SET.has(mod.owner)) {
      violations.push({
        ruleCode: 'MISSING_OR_INVALID_MODULE_OWNER',
        severity: 'ERROR',
        target: mod.moduleCode,
        message: `Module '${mod.moduleCode}' has missing or invalid owner '${String(mod.owner)}'.`,
      });
    }

    if (
      (mod.implementationStatus === 'PLANNED' ||
        mod.implementationStatus === 'UNVERIFIED' ||
        mod.implementationStatus === 'NOT_STARTED') &&
      (mod.isOperational || mod.status === 'HEALTHY' || mod.operationalHealth === 'HEALTHY')
    ) {
      violations.push({
        ruleCode: 'PLANNED_MODULE_MARKED_OPERATIONAL',
        severity: 'ERROR',
        target: mod.moduleCode,
        message: `Planned/unverified module '${mod.moduleCode}' (${mod.owner}) must not be reported as HEALTHY/operational.`,
      });
    }
  }

  // 2. Validate Service Dependencies & Startup Cycles
  const startupAdj = new Map<string, string[]>();
  for (const code of seenModuleCodes) startupAdj.set(code, []);

  for (const dep of dependencies) {
    const src = (dep.sourceModule ?? '').trim().toLowerCase();
    const tgt = (dep.targetModule ?? '').trim().toLowerCase();
    if (!seenModuleCodes.has(src) || !seenModuleCodes.has(tgt) || src === tgt) {
      violations.push({
        ruleCode: 'INVALID_DEPENDENCY_MODULE_REFERENCE',
        severity: 'ERROR',
        target: dep.id,
        message: `Dependency '${dep.id}' references unregistered or self module ('${dep.sourceModule}' -> '${dep.targetModule}').`,
      });
    } else if (dep.requiredForStartup) {
      const list = startupAdj.get(src) ?? [];
      list.push(tgt);
      startupAdj.set(src, list);
    }
  }

  // Detect cycles on requiredForStartup graph
  const visitState = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const dfsCycle = (node: string) => {
    visitState.set(node, 1);
    stack.push(node);
    for (const next of startupAdj.get(node) ?? []) {
      const st = visitState.get(next) ?? 0;
      if (st === 0) {
        dfsCycle(next);
      } else if (st === 1) {
        const idx = stack.indexOf(next);
        const cyclePath = [...stack.slice(idx), next].join(' -> ');
        violations.push({
          ruleCode: 'REQUIRED_STARTUP_DEPENDENCY_CYCLE',
          severity: 'ERROR',
          target: cyclePath,
          message: `Required startup dependency cycle detected: ${cyclePath}`,
        });
      }
    }
    stack.pop();
    visitState.set(node, 2);
  };
  for (const node of startupAdj.keys()) {
    if ((visitState.get(node) ?? 0) === 0) dfsCycle(node);
  }

  // 3. Validate Source-of-Truth & Domain Ownership Registry
  const seenEntities = new Set<string>();
  for (const own of ownerships) {
    const entity = (own.entityType ?? '').trim().toUpperCase();
    if (!entity || seenEntities.has(entity)) {
      violations.push({
        ruleCode: 'DUPLICATE_AUTHORITATIVE_OWNERSHIP',
        severity: 'ERROR',
        target: entity || own.id,
        message: `Duplicate authoritative ownership registered for entityType '${entity}'.`,
      });
    }
    seenEntities.add(entity);

    if (
      !own.owningEmployee ||
      !VALID_EMPLOYEE_SET.has(own.owningEmployee) ||
      !seenModuleCodes.has((own.owningModuleCode ?? '').toLowerCase()) ||
      !own.mutationServiceReference
    ) {
      violations.push({
        ruleCode: 'MISSING_OWNERSHIP_DEFINITION',
        severity: 'ERROR',
        target: entity || own.id,
        message: `Ownership definition for '${entity}' is missing valid owningEmployee, owningModuleCode, or mutationServiceReference.`,
      });
    }
  }

  // Verify every module's declared dataOwnership entities exist in the ownership registry
  for (const mod of modules) {
    for (const declaredEntity of mod.dataOwnership) {
      if (!seenEntities.has(declaredEntity.toUpperCase())) {
        violations.push({
          ruleCode: 'MISSING_OWNERSHIP_DEFINITION',
          severity: 'ERROR',
          target: declaredEntity,
          message: `Entity '${declaredEntity}' declared by module '${mod.moduleCode}' has no entry in the Domain Ownership Registry.`,
        });
      }
    }
  }

  // 4. Validate API Contract Metadata
  for (const api of apiContracts) {
    try {
      validateApiContractMetadata(api, seenModuleCodes);
    } catch (err) {
      violations.push({
        ruleCode: 'INVALID_API_CONTRACT_METADATA',
        severity: 'ERROR',
        target: api.contractId || api.path,
        message: err instanceof Error ? err.message : 'Invalid API contract metadata.',
      });
    }
  }

  // 5. Validate Event Contract Metadata
  for (const evt of eventContracts) {
    if (
      !evt.contractId ||
      !evt.eventType ||
      ! VALID_EMPLOYEE_SET.has(evt.owningEmployee) ||
      !seenModuleCodes.has((evt.sourceModule ?? '').toLowerCase()) ||
      !Array.isArray(evt.requiredPayloadFields) ||
      evt.requiredPayloadFields.length === 0
    ) {
      violations.push({
        ruleCode: 'INVALID_EVENT_CONTRACT_METADATA',
        severity: 'ERROR',
        target: evt.contractId || evt.eventType,
        message: `Event contract '${evt.eventType}' has missing sourceModule, owningEmployee, or requiredPayloadFields.`,
      });
    }
  }

  // 6. Validate Error Categories
  const validCategories = new Set<string>(ALL_PLATFORM_ERROR_CATEGORIES);
  for (const entry of errorCatalog ?? getCanonicalErrorCatalog()) {
    if (!entry.code || !validCategories.has(entry.category)) {
      violations.push({
        ruleCode: 'INVALID_ERROR_CATEGORY',
        severity: 'ERROR',
        target: entry.code || 'UNKNOWN',
        message: `Error catalog entry '${entry.code}' uses invalid category '${String(entry.category)}'.`,
      });
    }
  }

  // 7. Validate Environment Configuration
  const envReport = validatePlatformEnvironmentConfig(envConfig);
  if (!envReport.valid) {
    for (const errMsg of envReport.errors) {
      violations.push({
        ruleCode: 'UNSAFE_ENVIRONMENT_CONFIG',
        severity: 'ERROR',
        target: 'environment',
        message: errMsg,
      });
    }
  }

  // 8. Scan provided source snippets for secret patterns
  for (const snippet of input.sourceCodeSnippetsToScanForSecrets ?? []) {
    for (const rule of COMMITTED_SECRET_REGEXES) {
      if (rule.pattern.test(snippet.content)) {
        violations.push({
          ruleCode: 'SECRET_PATTERN_VIOLATION',
          severity: 'ERROR',
          target: snippet.filePath,
          message: `Detected committed secret pattern (${rule.label}) in '${snippet.filePath}'.`,
        });
      }
    }
  }

  return {
    valid: violations.length === 0,
    checkedAtIso: new Date().toISOString(),
    summary: {
      modulesChecked: modules.length,
      dependenciesChecked: dependencies.length,
      ownershipsChecked: ownerships.length,
      apiContractsChecked: apiContracts.length,
      eventContractsChecked: eventContracts.length,
      errorCatalogEntriesChecked: errorCatalog.length,
      violationsCount: violations.length,
    },
    violations,
  };
}

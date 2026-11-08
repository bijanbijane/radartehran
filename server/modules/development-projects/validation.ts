/**
 * Real Estate Development & Construction Project Validation & DAG Algorithms
 * (`server/modules/development-projects/validation.ts`)
 * Exclusive ownership: `server/modules/development-projects/`
 */

import type {
  CostCategory,
  CostClassification,
  DevelopmentProjectType,
  ProjectTaskRecord,
} from './types';

export class DevelopmentValidationError extends Error {
  public readonly code: string;
  public readonly field?: string;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = 'DevelopmentValidationError';
    this.code = code;
    this.field = field;
  }
}

export function sanitizeText(input: unknown, maxLength = 1000): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function validateSafeFirestoreId(id: unknown, fieldName: string): string {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{3,128}$/.test(id)) {
    throw new DevelopmentValidationError('INVALID_IDENTIFIER', `Invalid ${fieldName} identifier.`, fieldName);
  }
  return id;
}

export function validateIsoDateString(isoString: unknown, fieldName: string): string {
  if (typeof isoString !== 'string') {
    throw new DevelopmentValidationError('INVALID_TIMESTAMP', `${fieldName} must be an ISO date string.`, fieldName);
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    throw new DevelopmentValidationError('INVALID_TIMESTAMP', `${fieldName} is not a valid date.`, fieldName);
  }
  return date.toISOString();
}

export function validateDateRange(startIso: string, endIso: string, label = 'Date range'): void {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (end < start) {
    throw new DevelopmentValidationError('INVALID_DATE_RANGE', `${label}: Completion date cannot be earlier than start date.`);
  }
}

/**
 * Detects circular dependencies in a Directed Acyclic Graph (DAG) of project tasks.
 * Uses Depth First Search (DFS) with 3-color node classification (0=white, 1=gray, 2=black).
 */
export function assertNoCircularTaskDependencies(
  newOrUpdatedTaskId: string,
  newDependsOnTaskIds: string[],
  allTasks: ProjectTaskRecord[],
): void {
  if (newDependsOnTaskIds.includes(newOrUpdatedTaskId)) {
    throw new DevelopmentValidationError(
      'CIRCULAR_TASK_DEPENDENCY',
      `Task ${newOrUpdatedTaskId} cannot depend on itself.`,
      'dependsOnTaskIds',
    );
  }

  const adjList = new Map<string, string[]>();
  for (const t of allTasks) {
    if (t.taskId === newOrUpdatedTaskId) {
      adjList.set(t.taskId, [...newDependsOnTaskIds]);
    } else {
      adjList.set(t.taskId, [...t.dependsOnTaskIds]);
    }
  }

  if (!adjList.has(newOrUpdatedTaskId)) {
    adjList.set(newOrUpdatedTaskId, [...newDependsOnTaskIds]);
  }

  const visited = new Map<string, 0 | 1 | 2>(); // 0: unvisited, 1: visiting (in stack), 2: finished
  for (const taskId of adjList.keys()) {
    visited.set(taskId, 0);
  }

  function dfs(curr: string, path: string[]): void {
    visited.set(curr, 1);
    const neighbors = adjList.get(curr) || [];

    for (const n of neighbors) {
      const state = visited.get(n) ?? 0;
      if (state === 1) {
        const cycle = [...path, n].join(' -> ');
        throw new DevelopmentValidationError(
          'CIRCULAR_TASK_DEPENDENCY',
          `Circular dependency cycle detected: ${cycle}`,
          'dependsOnTaskIds',
        );
      }
      if (state === 0) {
        dfs(n, [...path, n]);
      }
    }

    visited.set(curr, 2);
  }

  for (const taskId of adjList.keys()) {
    if ((visited.get(taskId) ?? 0) === 0) {
      dfs(taskId, [taskId]);
    }
  }
}

export function validateCostEntry(params: {
  amountMillionToman: unknown;
  currency: unknown;
  category: unknown;
  classification: unknown;
  descriptionFa: unknown;
}): {
  amountMillionToman: number;
  currency: 'IRT';
  category: CostCategory;
  classification: CostClassification;
  descriptionFa: string;
} {
  if (typeof params.amountMillionToman !== 'number' || !Number.isFinite(params.amountMillionToman) || params.amountMillionToman <= 0) {
    throw new DevelopmentValidationError('INVALID_COST_AMOUNT', 'Cost amount must be a positive number in Million Toman.', 'amountMillionToman');
  }

  if (params.currency !== 'IRT') {
    throw new DevelopmentValidationError('INVALID_CURRENCY', 'Budget currency must strictly be IRT (Iranian Toman).', 'currency');
  }

  const allowedCategories: CostCategory[] = ['labor', 'material', 'equipment', 'design_consulting', 'permit_administrative', 'contingency', 'other'];
  if (!allowedCategories.includes(params.category as CostCategory)) {
    throw new DevelopmentValidationError('INVALID_COST_CATEGORY', `Cost category must be one of: ${allowedCategories.join(', ')}`, 'category');
  }

  const allowedClassifications: CostClassification[] = ['planned_estimate', 'forecast', 'approved_commitment', 'confirmed_expenditure'];
  if (!allowedClassifications.includes(params.classification as CostClassification)) {
    throw new DevelopmentValidationError('INVALID_COST_CLASSIFICATION', `Classification must be one of: ${allowedClassifications.join(', ')}`, 'classification');
  }

  const cleanDesc = sanitizeText(params.descriptionFa, 300);
  if (cleanDesc.length < 3) {
    throw new DevelopmentValidationError('MISSING_COST_DESCRIPTION', 'Cost description must be at least 3 characters.', 'descriptionFa');
  }

  return {
    amountMillionToman: Math.round(params.amountMillionToman * 100) / 100,
    currency: 'IRT',
    category: params.category as CostCategory,
    classification: params.classification as CostClassification,
    descriptionFa: cleanDesc,
  };
}

export function calculateWeightedPhysicalProgress(tasks: ProjectTaskRecord[]): number {
  if (tasks.length === 0) return 0;

  let totalWeight = 0;
  let earnedProgress = 0;

  for (const t of tasks) {
    const weight = t.estimatedEffortHours > 0 ? t.estimatedEffortHours : 10;
    totalWeight += weight;
    earnedProgress += (t.progressPercent / 100) * weight;
  }

  if (totalWeight === 0) return 0;
  return Math.min(100, Math.round((earnedProgress / totalWeight) * 10000) / 100);
}

export function validateProjectType(type: unknown): DevelopmentProjectType {
  const allowed: DevelopmentProjectType[] = [
    'new_construction',
    'residential_development',
    'commercial_development',
    'office_development',
    'mixed_use_development',
    'land_development',
    'renovation',
    'reconstruction',
    'infrastructure_work',
    'multi_building_development',
  ];
  if (!allowed.includes(type as DevelopmentProjectType)) {
    throw new DevelopmentValidationError('INVALID_PROJECT_TYPE', `Invalid project type: ${String(type)}`);
  }
  return type as DevelopmentProjectType;
}

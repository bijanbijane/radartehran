/**
 * Development Projects Phases, Tasks & Progress Sub-Service
 * (`server/modules/development-projects/phasesAndTasksService.ts`)
 * Exclusive ownership: `server/modules/development-projects/`
 */

import type { DevelopmentProjectRepository } from './repository';
import type {
  DevelopmentDomainEvent,
  DevelopmentProjectType,
  PhaseStatus,
  ProjectPhaseRecord,
  ProjectTaskRecord,
  TaskStatus,
} from './types';
import {
  assertNoCircularTaskDependencies,
  calculateWeightedPhysicalProgress,
  DevelopmentValidationError,
  sanitizeText,
  validateDateRange,
  validateIsoDateString,
  validateSafeFirestoreId,
} from './validation';

export interface PhasesAndTasksContext {
  repository: DevelopmentProjectRepository;
  emitEvent: (
    eventType: DevelopmentDomainEvent['eventType'],
    aggregateId: string,
    aggregateType: DevelopmentDomainEvent['aggregateType'],
    actorUserId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
}

export function generateDefaultPhases(
  projectId: string,
  projectType: DevelopmentProjectType,
  startIso: string,
  endIso: string,
  totalBudgetMillion: number,
): ProjectPhaseRecord[] {
  const isRenovation = projectType === 'renovation' || projectType === 'reconstruction';

  if (isRenovation) {
    return [
      {
        phaseId: `ph_${projectId}_1`,
        projectId,
        phaseKey: 'site_assessment',
        titleFa: 'بررسی وضعیت موجود و ارزیابی سازه',
        sequenceOrder: 1,
        status: 'in_progress',
        plannedStartDateIso: startIso,
        plannedEndDateIso: endIso,
        allocatedBudgetMillionToman: Math.round(totalBudgetMillion * 0.1),
        progressPercent: 0,
      },
      {
        phaseId: `ph_${projectId}_2`,
        projectId,
        phaseKey: 'renovation_works',
        titleFa: 'عملیات اجرایی و بازسازی تاسیسات و نما',
        sequenceOrder: 2,
        status: 'not_started',
        plannedStartDateIso: startIso,
        plannedEndDateIso: endIso,
        allocatedBudgetMillionToman: Math.round(totalBudgetMillion * 0.75),
        progressPercent: 0,
        dependsOnPhaseIds: [`ph_${projectId}_1`],
      },
      {
        phaseId: `ph_${projectId}_3`,
        projectId,
        phaseKey: 'handover_closeout',
        titleFa: 'تحویل نهایی، رفع نواقص و تسویه‌حساب',
        sequenceOrder: 3,
        status: 'not_started',
        plannedStartDateIso: startIso,
        plannedEndDateIso: endIso,
        allocatedBudgetMillionToman: Math.round(totalBudgetMillion * 0.15),
        progressPercent: 0,
        dependsOnPhaseIds: [`ph_${projectId}_2`],
      },
    ];
  }

  return [
    {
      phaseId: `ph_${projectId}_1`,
      projectId,
      phaseKey: 'planning_feasibility',
      titleFa: 'مطالعات فاز صفر، امکان‌سنجی و طرح توجیهی',
      sequenceOrder: 1,
      status: 'in_progress',
      plannedStartDateIso: startIso,
      plannedEndDateIso: endIso,
      allocatedBudgetMillionToman: Math.round(totalBudgetMillion * 0.05),
      progressPercent: 0,
    },
    {
      phaseId: `ph_${projectId}_2`,
      projectId,
      phaseKey: 'architectural_engineering_design',
      titleFa: 'طراحی معماری، سازه، مکانیک و برق (فاز ۱ و ۲)',
      sequenceOrder: 2,
      status: 'not_started',
      plannedStartDateIso: startIso,
      plannedEndDateIso: endIso,
      allocatedBudgetMillionToman: Math.round(totalBudgetMillion * 0.1),
      progressPercent: 0,
      dependsOnPhaseIds: [`ph_${projectId}_1`],
    },
    {
      phaseId: `ph_${projectId}_3`,
      projectId,
      phaseKey: 'permitting_mobilization',
      titleFa: 'اخذ پروانه ساختمانی و تجهیز کارگاه',
      sequenceOrder: 3,
      status: 'not_started',
      plannedStartDateIso: startIso,
      plannedEndDateIso: endIso,
      allocatedBudgetMillionToman: Math.round(totalBudgetMillion * 0.15),
      progressPercent: 0,
      dependsOnPhaseIds: [`ph_${projectId}_2`],
    },
    {
      phaseId: `ph_${projectId}_4`,
      projectId,
      phaseKey: 'structural_execution',
      titleFa: 'گودبرداری، فونداسیون و اسکلت سازه',
      sequenceOrder: 4,
      status: 'not_started',
      plannedStartDateIso: startIso,
      plannedEndDateIso: endIso,
      allocatedBudgetMillionToman: Math.round(totalBudgetMillion * 0.4),
      progressPercent: 0,
      dependsOnPhaseIds: [`ph_${projectId}_3`],
    },
    {
      phaseId: `ph_${projectId}_5`,
      projectId,
      phaseKey: 'finishing_handover',
      titleFa: 'نازک‌کاری، نصب تاسیسات، پایان‌کار و تحویل',
      sequenceOrder: 5,
      status: 'not_started',
      plannedStartDateIso: startIso,
      plannedEndDateIso: endIso,
      allocatedBudgetMillionToman: Math.round(totalBudgetMillion * 0.3),
      progressPercent: 0,
      dependsOnPhaseIds: [`ph_${projectId}_4`],
    },
  ];
}

export async function createTaskWorkflow(
  ctx: PhasesAndTasksContext,
  input: {
    projectId: string;
    phaseId: string;
    nameFa: string;
    descriptionFa?: string;
    assignedUserIds?: string[];
    contractorProviderId?: string;
    plannedStartDateIso: string;
    plannedCompletionDateIso: string;
    dependsOnTaskIds?: string[];
    estimatedEffortHours?: number;
    priority?: 'low' | 'medium' | 'high' | 'critical';
  },
  actorUserId: string,
): Promise<ProjectTaskRecord> {
  const projectId = validateSafeFirestoreId(input.projectId, 'projectId');
  const phaseId = validateSafeFirestoreId(input.phaseId, 'phaseId');
  const nameFa = sanitizeText(input.nameFa, 200);
  if (nameFa.length < 2) {
    throw new DevelopmentValidationError('INVALID_TASK_NAME', 'Task name must be at least 2 characters.', 'nameFa');
  }

  const startIso = validateIsoDateString(input.plannedStartDateIso, 'plannedStartDateIso');
  const endIso = validateIsoDateString(input.plannedCompletionDateIso, 'plannedCompletionDateIso');
  validateDateRange(startIso, endIso, 'Task schedule');

  const allTasks = await ctx.repository.listTasksByProject(projectId);
  const dependsOn = input.dependsOnTaskIds || [];
  const taskId = `tsk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  assertNoCircularTaskDependencies(taskId, dependsOn, allTasks);

  // Check if depends on tasks that are not yet completed
  let initialStatus: TaskStatus = 'ready';
  if (dependsOn.length > 0) {
    const uncompletedDeps = allTasks.filter((t) => dependsOn.includes(t.taskId) && t.status !== 'completed');
    if (uncompletedDeps.length > 0) {
      initialStatus = 'blocked';
    }
  }

  const now = new Date().toISOString();
  const taskRecord: ProjectTaskRecord = {
    taskId,
    projectId,
    phaseId,
    nameFa,
    descriptionFa: sanitizeText(input.descriptionFa, 1000) || undefined,
    assignedUserIds: input.assignedUserIds || [],
    contractorProviderId: input.contractorProviderId,
    plannedStartDateIso: startIso,
    plannedCompletionDateIso: endIso,
    status: initialStatus,
    priority: input.priority || 'medium',
    dependsOnTaskIds: dependsOn,
    estimatedEffortHours: typeof input.estimatedEffortHours === 'number' && input.estimatedEffortHours > 0 ? input.estimatedEffortHours : 8,
    progressPercent: 0,
    blockingReason: initialStatus === 'blocked' ? 'وابستگی به تسک‌های پیش‌نیاز تکمیل‌نشده' : undefined,
    createdAtIso: now,
    updatedAtIso: now,
  };

  await ctx.repository.saveTask(taskRecord);
  await ctx.emitEvent('project.task_assigned', taskId, 'task', actorUserId, { projectId, phaseId, nameFa });
  return taskRecord;
}

export async function updateTaskStatusWorkflow(
  ctx: PhasesAndTasksContext,
  taskId: string,
  newStatus: TaskStatus,
  progressPercent: number | undefined,
  actorUserId: string,
): Promise<ProjectTaskRecord> {
  const task = await ctx.repository.getTaskById(taskId);
  if (!task) throw new DevelopmentValidationError('TASK_NOT_FOUND', `Task ${taskId} not found.`);

  if (newStatus === 'completed') {
    const allTasks = await ctx.repository.listTasksByProject(task.projectId);
    const uncompletedDeps = allTasks.filter(
      (t) => task.dependsOnTaskIds.includes(t.taskId) && t.status !== 'completed',
    );
    if (uncompletedDeps.length > 0) {
      throw new DevelopmentValidationError(
        'TASK_DEPENDENCIES_UNFULFILLED',
        `Cannot complete task ${task.taskId}: dependencies [${uncompletedDeps.map((d) => d.nameFa).join(', ')}] are not completed.`,
      );
    }
    task.progressPercent = 100;
    task.actualCompletionDateIso = new Date().toISOString();
  } else if (progressPercent !== undefined) {
    task.progressPercent = Math.min(100, Math.max(0, Math.round(progressPercent)));
  }

  task.status = newStatus;
  task.updatedAtIso = new Date().toISOString();
  await ctx.repository.saveTask(task);

  // Recalculate project total progress
  const projectTasks = await ctx.repository.listTasksByProject(task.projectId);
  const totalProgress = calculateWeightedPhysicalProgress(projectTasks);
  const project = await ctx.repository.getProjectById(task.projectId);
  if (project) {
    project.totalPhysicalProgressPercent = totalProgress;
    await ctx.repository.saveProject(project);
  }

  // Check if any blocked tasks can now be unblocked
  if (newStatus === 'completed') {
    for (const other of projectTasks) {
      if (other.status === 'blocked' && other.dependsOnTaskIds.includes(task.taskId)) {
        const stillUncompleted = projectTasks.filter(
          (t) => other.dependsOnTaskIds.includes(t.taskId) && t.status !== 'completed' && t.taskId !== task.taskId,
        );
        if (stillUncompleted.length === 0) {
          other.status = 'ready';
          other.blockingReason = undefined;
          other.updatedAtIso = new Date().toISOString();
          await ctx.repository.saveTask(other);
        }
      }
    }
  }

  await ctx.emitEvent(
    newStatus === 'completed' ? 'project.task_completed' : 'project.task_assigned',
    task.taskId,
    'task',
    actorUserId,
    { status: newStatus, progressPercent: task.progressPercent },
  );

  return task;
}

export async function updateTaskDependenciesWorkflow(
  ctx: PhasesAndTasksContext,
  taskId: string,
  newDependsOnTaskIds: string[],
  actorUserId: string,
): Promise<ProjectTaskRecord> {
  const task = await ctx.repository.getTaskById(taskId);
  if (!task) throw new DevelopmentValidationError('TASK_NOT_FOUND', `Task ${taskId} not found.`);

  const allTasks = await ctx.repository.listTasksByProject(task.projectId);
  assertNoCircularTaskDependencies(task.taskId, newDependsOnTaskIds, allTasks);

  task.dependsOnTaskIds = newDependsOnTaskIds;
  task.updatedAtIso = new Date().toISOString();
  await ctx.repository.saveTask(task);
  return task;
}

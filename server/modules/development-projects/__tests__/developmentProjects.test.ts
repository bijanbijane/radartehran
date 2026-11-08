/**
 * Real Estate Development Projects Automated Test Suite
 * (`server/modules/development-projects/__tests__/developmentProjects.test.ts`)
 * Exclusive ownership: `server/modules/development-projects/`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDevelopmentProjectService } from '../index';
import { InMemoryDevelopmentProjectRepository } from '../repository';
import { DevelopmentValidationError } from '../validation';

describe('Real Estate Development & Construction Project Management Backend Module', () => {
  describe('1. Project Registration & Participant Roles', () => {
    it('creates a new construction project with baseline schedule and default phases', async () => {
      const repo = new InMemoryDevelopmentProjectRepository();
      const service = createDevelopmentProjectService({ repository: repo });

      const start = new Date(Date.now() + 86400000).toISOString();
      const end = new Date(Date.now() + 365 * 86400000).toISOString();

      const project = await service.createProject(
        {
          nameFa: 'پروژه برج مسکونی نیایش',
          projectType: 'residential_development',
          cityId: 'tehran',
          hoodId: 2,
          plannedStartDateIso: start,
          plannedCompletionDateIso: end,
          baselineBudgetMillionToman: 45000,
          targetPropertyIds: ['land_parcel_101', 'land_parcel_102'],
        },
        'developer_user_1',
      );

      assert.equal(project.nameFa, 'پروژه برج مسکونی نیایش');
      assert.equal(project.projectType, 'residential_development');
      assert.equal(project.ownerUserId, 'developer_user_1');
      assert.equal(project.baselineBudgetMillionToman, 45000);
      assert.equal(project.targetPropertyIds?.length, 2);

      const phases = await repo.listPhasesByProject(project.projectId);
      assert.equal(phases.length, 5); // 5 standard phases for construction

      const schedules = await repo.listScheduleVersions(project.projectId);
      assert.equal(schedules.length, 1);
      assert.equal(schedules[0].isBaseline, true);
    });

    it('rejects invalid project dates and invalid budget amounts', async () => {
      const service = createDevelopmentProjectService();
      const start = new Date(Date.now() + 86400000).toISOString();
      const earlierEnd = new Date(Date.now() - 86400000).toISOString();

      await assert.rejects(
        async () => {
          await service.createProject(
            {
              nameFa: 'پروژه نامعتبر',
              projectType: 'new_construction',
              cityId: 'tehran',
              plannedStartDateIso: start,
              plannedCompletionDateIso: earlierEnd,
              baselineBudgetMillionToman: 1000,
            },
            'dev_1',
          );
        },
        (err: DevelopmentValidationError) => {
          assert.equal(err.code, 'INVALID_DATE_RANGE');
          return true;
        },
      );
    });

    it('assigns participants with specific roles and authorization boundaries', async () => {
      const repo = new InMemoryDevelopmentProjectRepository();
      const service = createDevelopmentProjectService({ repository: repo });

      const start = new Date(Date.now() + 86400000).toISOString();
      const end = new Date(Date.now() + 180 * 86400000).toISOString();

      const project = await service.createProject(
        {
          nameFa: 'پروژه بازسازی ساختمان اداری وزرا',
          projectType: 'renovation',
          cityId: 'tehran',
          plannedStartDateIso: start,
          plannedCompletionDateIso: end,
          baselineBudgetMillionToman: 8000,
        },
        'dev_owner_1',
      );

      const updated = await service.addParticipant(
        {
          projectId: project.projectId,
          userId: 'engineer_user_1',
          role: 'structural_engineer',
          canConductInspections: true,
        },
        'dev_owner_1',
      );

      assert.equal(updated.participants.length, 2);
      const engineer = updated.participants.find((p) => p.userId === 'engineer_user_1');
      assert.ok(engineer);
      assert.equal(engineer.role, 'structural_engineer');
      assert.equal(engineer.canConductInspections, true);
      assert.equal(engineer.canApproveBudgets, false);

      // Non-owner cannot assign participants
      await assert.rejects(
        async () => {
          await service.addParticipant(
            { projectId: project.projectId, userId: 'contractor_1', role: 'general_contractor' },
            'engineer_user_1',
          );
        },
        (err: DevelopmentValidationError) => {
          assert.equal(err.code, 'UNAUTHORIZED_PARTICIPANT_ASSIGNMENT');
          return true;
        },
      );
    });
  });

  describe('2. Tasks, DAG Dependencies & Progress Calculation', () => {
    it('detects and rejects circular task dependencies', async () => {
      const repo = new InMemoryDevelopmentProjectRepository();
      const service = createDevelopmentProjectService({ repository: repo });

      const start = new Date(Date.now() + 86400000).toISOString();
      const end = new Date(Date.now() + 100 * 86400000).toISOString();
      const project = await service.createProject(
        { nameFa: 'پروژه گودبرداری', projectType: 'new_construction', cityId: 'tehran', plannedStartDateIso: start, plannedCompletionDateIso: end, baselineBudgetMillionToman: 5000 },
        'dev_1',
      );
      const phases = await repo.listPhasesByProject(project.projectId);

      const taskA = await service.createTask(
        { projectId: project.projectId, phaseId: phases[0].phaseId, nameFa: 'تسک الف: پی‌کنی', plannedStartDateIso: start, plannedCompletionDateIso: end },
        'dev_1',
      );
      const taskB = await service.createTask(
        { projectId: project.projectId, phaseId: phases[0].phaseId, nameFa: 'تسک ب: بتن‌ریزی', plannedStartDateIso: start, plannedCompletionDateIso: end, dependsOnTaskIds: [taskA.taskId] },
        'dev_1',
      );

      // Updating Task A to depend on Task B creates an A -> B -> A cycle
      await assert.rejects(
        async () => {
          await service.updateTaskDependencies(taskA.taskId, [taskB.taskId], 'dev_1');
        },
        (err: DevelopmentValidationError) => {
          assert.equal(err.code, 'CIRCULAR_TASK_DEPENDENCY');
          return true;
        },
      );

      // A task cannot depend on itself
      await assert.rejects(
        async () => {
          await service.updateTaskDependencies(taskA.taskId, [taskA.taskId], 'dev_1');
        },
        (err: DevelopmentValidationError) => {
          assert.equal(err.code, 'CIRCULAR_TASK_DEPENDENCY');
          return true;
        },
      );
    });

    it('enforces dependency completion and automatically unblocks dependent tasks', async () => {
      const repo = new InMemoryDevelopmentProjectRepository();
      const service = createDevelopmentProjectService({ repository: repo });

      const start = new Date(Date.now() + 86400000).toISOString();
      const end = new Date(Date.now() + 50 * 86400000).toISOString();
      const project = await service.createProject(
        { nameFa: 'پروژه اسکلت بتنی', projectType: 'new_construction', cityId: 'tehran', plannedStartDateIso: start, plannedCompletionDateIso: end, baselineBudgetMillionToman: 12000 },
        'dev_1',
      );
      const phases = await repo.listPhasesByProject(project.projectId);

      const foundationTask = await service.createTask(
        { projectId: project.projectId, phaseId: phases[3].phaseId, nameFa: 'اجرای فونداسیون', plannedStartDateIso: start, plannedCompletionDateIso: end, estimatedEffortHours: 40 },
        'dev_1',
      );

      const columnTask = await service.createTask(
        { projectId: project.projectId, phaseId: phases[3].phaseId, nameFa: 'آرماتوربندی ستون‌ها', plannedStartDateIso: start, plannedCompletionDateIso: end, dependsOnTaskIds: [foundationTask.taskId], estimatedEffortHours: 60 },
        'dev_1',
      );

      assert.equal(columnTask.status, 'blocked');

      // Cannot complete columnTask while foundationTask is not completed
      await assert.rejects(
        async () => {
          await service.updateTaskStatus(columnTask.taskId, 'completed', 100, 'dev_1');
        },
        (err: DevelopmentValidationError) => {
          assert.equal(err.code, 'TASK_DEPENDENCIES_UNFULFILLED');
          return true;
        },
      );

      // Complete foundationTask
      await service.updateTaskStatus(foundationTask.taskId, 'completed', 100, 'dev_1');

      // columnTask is now automatically unblocked ('ready')
      const refreshedColumn = await repo.getTaskById(columnTask.taskId);
      assert.equal(refreshedColumn?.status, 'ready');

      // Project physical progress is earned (40h out of 100h = 40%)
      const projectAfter = await repo.getProjectById(project.projectId);
      assert.equal(projectAfter?.totalPhysicalProgressPercent, 40);
    });
  });

  describe('3. Cost Tracking, Procurement & Change Orders', () => {
    it('distinguishes cost classifications and validates currency', async () => {
      const repo = new InMemoryDevelopmentProjectRepository();
      const service = createDevelopmentProjectService({ repository: repo });

      const start = new Date(Date.now() + 86400000).toISOString();
      const end = new Date(Date.now() + 90 * 86400000).toISOString();
      const project = await service.createProject(
        { nameFa: 'پروژه هزینه', projectType: 'new_construction', cityId: 'tehran', plannedStartDateIso: start, plannedCompletionDateIso: end, baselineBudgetMillionToman: 5000 },
        'dev_1',
      );

      const cost = await service.recordCost(
        {
          projectId: project.projectId,
          category: 'material',
          classification: 'confirmed_expenditure',
          amountMillionToman: 450,
          currency: 'IRT',
          descriptionFa: 'خرید ۱۰۰ تن میلگرد عاجدار اصفهان',
        },
        'dev_1',
      );

      assert.equal(cost.amountMillionToman, 450);
      assert.equal(cost.classification, 'confirmed_expenditure');

      const metrics = await service.getProjectSummaryMetrics(project.projectId);
      assert.equal(metrics.totalConfirmedExpenditureMillionToman, 450);
    });

    it('tracks procurement requests and partial delivery increments', async () => {
      const repo = new InMemoryDevelopmentProjectRepository();
      const service = createDevelopmentProjectService({ repository: repo });

      const start = new Date(Date.now() + 86400000).toISOString();
      const end = new Date(Date.now() + 90 * 86400000).toISOString();
      const project = await service.createProject(
        { nameFa: 'پروژه خرید آهن‌آلات', projectType: 'new_construction', cityId: 'tehran', plannedStartDateIso: start, plannedCompletionDateIso: end, baselineBudgetMillionToman: 6000 },
        'dev_1',
      );

      const req = await service.createProcurement(
        {
          projectId: project.projectId,
          category: 'steel_reinforcement',
          itemDescriptionFa: 'میلگرد نمره ۱۶',
          quantity: 50,
          unitOfMeasure: 'ton',
          requiredByDateIso: new Date(Date.now() + 7 * 86400000).toISOString(),
        },
        'dev_1',
      );

      assert.equal(req.status, 'requested');
      assert.equal(req.deliveredQuantity, 0);

      // Partial delivery of 20 tons
      const partial = await service.deliverProcurement(req.requestId, 20, 'dev_1');
      assert.equal(partial.status, 'partially_delivered');
      assert.equal(partial.deliveredQuantity, 20);

      // Final delivery of 30 tons
      const final = await service.deliverProcurement(req.requestId, 30, 'dev_1');
      assert.equal(final.status, 'delivered');
      assert.equal(final.deliveredQuantity, 50);
    });

    it('manages change orders and updates project baseline budget upon approval', async () => {
      const repo = new InMemoryDevelopmentProjectRepository();
      const service = createDevelopmentProjectService({ repository: repo });

      const start = new Date(Date.now() + 86400000).toISOString();
      const end = new Date(Date.now() + 90 * 86400000).toISOString();
      const project = await service.createProject(
        { nameFa: 'پروژه تغییرات', projectType: 'new_construction', cityId: 'tehran', plannedStartDateIso: start, plannedCompletionDateIso: end, baselineBudgetMillionToman: 10000 },
        'dev_1',
      );

      const co = await service.submitChangeOrder(
        {
          projectId: project.projectId,
          titleFa: 'تغییر سیستم تاسیسات به داکت اسپلیت اینورتر',
          reasonFa: 'درخواست مالک جهت ارتقای رده انرژی ساختمان',
          costImpactMillionToman: 1200,
          scheduleImpactDays: 15,
        },
        'dev_1',
      );

      assert.equal(co.status, 'submitted');
      assert.equal(co.costImpactMillionToman, 1200);

      // Approve change order
      const approved = await service.decideChangeOrder(co.changeOrderId, 'approved', 'dev_1');
      assert.equal(approved.status, 'approved');

      const updatedProject = await repo.getProjectById(project.projectId);
      assert.equal(updatedProject?.baselineBudgetMillionToman, 11200);
    });
  });

  describe('4. Quality Control, Permits & Handover Closeout', () => {
    it('blocks project handover if unresolved critical defects exist, and succeeds once resolved', async () => {
      const repo = new InMemoryDevelopmentProjectRepository();
      const service = createDevelopmentProjectService({ repository: repo });

      const start = new Date(Date.now() + 86400000).toISOString();
      const end = new Date(Date.now() + 90 * 86400000).toISOString();
      const project = await service.createProject(
        { nameFa: 'پروژه پایان‌کار', projectType: 'new_construction', cityId: 'tehran', plannedStartDateIso: start, plannedCompletionDateIso: end, baselineBudgetMillionToman: 8000 },
        'dev_1',
      );

      // Conduct quality inspection with a critical defect
      const insp = await service.inspectQuality(
        {
          projectId: project.projectId,
          inspectionType: 'concrete',
          criteriaFa: 'آزمایش مقاومت فشاری نمونه بتن ۲۸ روزه',
          passed: false,
          findingsFa: 'مقاومت فشاری بتن ستون طبقه ۲ کمتر از حد استاندارد است.',
          defects: [{ descriptionFa: 'نیاز به کاشت میلگرد و ژاکت بتنی ستون', severity: 'critical' }],
        },
        'inspector_1',
      );

      assert.equal(insp.passed, false);
      assert.equal(insp.defects.length, 1);

      // Attempt handover while critical defect is open
      await assert.rejects(
        async () => {
          await service.scheduleHandoverAndClose(
            {
              projectId: project.projectId,
              handoverDateIso: new Date(Date.now() + 86400000).toISOString(),
              participants: [{ userId: 'dev_1', role: 'developer' }],
            },
            'dev_1',
          );
        },
        (err: DevelopmentValidationError) => {
          assert.equal(err.code, 'OPEN_CRITICAL_DEFECTS_BLOCK_HANDOVER');
          return true;
        },
      );

      // Resolve defect
      await service.resolveDefect(insp.inspectionId, insp.defects[0].defectId, 'evidence_media_101', 'engineer_1');

      // Handover succeeds now
      const handover = await service.scheduleHandoverAndClose(
        {
          projectId: project.projectId,
          handoverDateIso: new Date(Date.now() + 86400000).toISOString(),
          participants: [{ userId: 'dev_1', role: 'developer' }],
          acceptanceNotesFa: 'تمام چک‌لیست‌های تحویل قطعی تایید شد.',
        },
        'dev_1',
      );

      assert.equal(handover.status, 'handover_accepted');

      const closedProject = await repo.getProjectById(project.projectId);
      assert.equal(closedProject?.status, 'completed');
      assert.ok(closedProject?.closedAtIso);
    });

    it('enforces optimistic concurrency control on project revisions', async () => {
      const repo = new InMemoryDevelopmentProjectRepository();
      const service = createDevelopmentProjectService({ repository: repo });

      const start = new Date(Date.now() + 86400000).toISOString();
      const end = new Date(Date.now() + 90 * 86400000).toISOString();
      const project = await service.createProject(
        { nameFa: 'پروژه همزمانی', projectType: 'residential_development', cityId: 'tehran', plannedStartDateIso: start, plannedCompletionDateIso: end, baselineBudgetMillionToman: 3000 },
        'dev_1',
      );

      // Saving with wrong expected revision must reject
      await assert.rejects(
        async () => {
          await repo.saveProject(project, 999);
        },
        (err: DevelopmentValidationError) => {
          assert.equal(err.code, 'CONCURRENCY_CONFLICT');
          return true;
        },
      );
    });
  });
});

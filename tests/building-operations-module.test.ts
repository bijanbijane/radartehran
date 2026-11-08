import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import {
  type AuditEventSink,
  type AuthenticatedPrincipal,
  type DelegatedAdminStoreAdapter,
  type FirebaseTokenVerifierAdapter,
  type StructuredAuditEvent,
  type TransactionContextLike,
  type TransactionRunnerAdapter,
} from '../server/modules/core';
import {
  createBuildingOperationsRouter,
  createBuildingOperationsService,
} from '../server/modules/building-operations';

function createInMemoryBuildingHarness() {
  const store = new Map<string, Record<string, unknown>>();
  const auditEvents: StructuredAuditEvent[] = [];
  const notifications: Array<Record<string, unknown>> = [];

  const txRunner: TransactionRunnerAdapter = {
    async runTransaction<T>(callback: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      const staged = new Map<string, Record<string, unknown> | null>();
      const tx: TransactionContextLike = {
        async get<Doc = Record<string, unknown>>(docPath: string) {
          const val = staged.has(docPath) ? staged.get(docPath) : store.get(docPath);
          if (!val) return { exists: false };
          return { exists: true, data: structuredClone(val) as unknown as Doc };
        },
        set(docPath: string, data: Record<string, unknown>, options?: { merge?: boolean }) {
          if (options?.merge) {
            const existing = staged.get(docPath) ?? store.get(docPath) ?? {};
            staged.set(docPath, { ...structuredClone(existing), ...structuredClone(data) });
          } else {
            staged.set(docPath, structuredClone(data));
          }
        },
        update(docPath: string, partialData: Record<string, unknown>) {
          const existing = staged.get(docPath) ?? store.get(docPath);
          if (!existing) throw new Error(`Missing document ${docPath}`);
          staged.set(docPath, { ...structuredClone(existing), ...structuredClone(partialData) });
        },
        delete(docPath: string) {
          staged.set(docPath, null);
        },
      };
      const result = await callback(tx);
      for (const [k, v] of staged.entries()) {
        if (v === null) store.delete(k);
        else store.set(k, v);
      }
      return result;
    },
  };

  const principals: Record<string, AuthenticatedPrincipal> = {
    owner: {
      uid: 'uid_owner_01',
      email: 'owner01@example.com',
      emailVerified: true,
      role: 'verified_user',
      authMode: 'firebase_id_token',
      claims: {},
    },
    manager: {
      uid: 'uid_manager_01',
      email: 'manager01@example.com',
      emailVerified: true,
      role: 'verified_user',
      authMode: 'firebase_id_token',
      claims: {},
    },
    tenant: {
      uid: 'uid_tenant_01',
      email: 'tenant01@example.com',
      emailVerified: true,
      role: 'verified_user',
      authMode: 'firebase_id_token',
      claims: {},
    },
    provider: {
      uid: 'uid_provider_01',
      email: 'provider01@example.com',
      emailVerified: true,
      role: 'verified_user',
      authMode: 'firebase_id_token',
      claims: {},
    },
    outsider: {
      uid: 'uid_outsider_99',
      email: 'outsider99@example.com',
      emailVerified: true,
      role: 'verified_user',
      authMode: 'firebase_id_token',
      claims: {},
    },
    admin: {
      uid: 'uid_admin_01',
      email: 'admin@radartehran.ir',
      emailVerified: true,
      role: 'primary_admin',
      authMode: 'firebase_id_token',
      claims: {},
    },
  };

  const tokenAliases: Record<string, string> = {
    token_owner_valid_00001: 'owner',
    token_mgr_valid_0000001: 'manager',
    token_tenant_valid_0001: 'tenant',
    token_vendor_valid_0001: 'provider',
    token_outsider_valid_01: 'outsider',
    token_admin_valid_00001: 'admin',
  };

  const tokenVerifier: FirebaseTokenVerifierAdapter = {
    async verifyIdToken(token: string) {
      const p = principals[token] ?? principals[tokenAliases[token] ?? ''];
      if (!p) throw new Error('Invalid token');
      return {
        uid: p.uid,
        email: p.email,
        email_verified: p.emailVerified,
        ...p.claims,
      };
    },
  };

  const adminStore: DelegatedAdminStoreAdapter = {
    async getDelegatedAdminByUid() {
      return null;
    },
  };

  const auditSink: AuditEventSink = {
    async writeAuditEvent(event: StructuredAuditEvent) {
      auditEvents.push(event);
    },
  };

  return {
    store,
    txRunner,
    tokenVerifier,
    adminStore,
    auditSink,
    principals,
    auditEvents,
    notifications,
    primaryAdminEmails: ['admin@radartehran.ir'],
    notificationEmitter: async (ev: unknown) => {
      notifications.push(ev as Record<string, unknown>);
    },
    nowFn: () => Date.parse('2026-11-08T10:00:00.000Z'),
  };
}

describe('Employee 56 — Property Management, Building Operations and Facility Management Backend', () => {
  it('upserts buildings, registers units with duplicate protection, creates management contracts, and enforces ownership vs manager permissions', async () => {
    const h = createInMemoryBuildingHarness();
    const service = createBuildingOperationsService(h);

    const bldRes = await service.upsertBuilding({
      principal: h.principals.owner,
      buildingId: 'bld_saadat_01',
      rawInput: {
        name: 'Saadat Abad Tower A',
        buildingType: 'RESIDENTIAL',
        constructionYear: 1401,
        floorsCount: 12,
        declaredUnitsCount: 24,
        sharedSpaces: ['Lobby', 'Parking B1'],
        ownerUids: ['uid_owner_01'],
        propertyManagerUid: 'uid_manager_01',
        operationalStatus: 'ACTIVE',
      },
      idempotencyKey: 'idem_bld_01',
      correlationId: 'corr_bld_01',
    });

    assert.equal(bldRes.statusCode, 201);
    assert.equal(bldRes.body.operationalStatus, 'ACTIVE');

    const replay = await service.upsertBuilding({
      principal: h.principals.owner,
      buildingId: 'bld_saadat_01',
      rawInput: {
        name: 'Saadat Abad Tower A',
        buildingType: 'RESIDENTIAL',
        constructionYear: 1401,
        floorsCount: 12,
        declaredUnitsCount: 24,
        sharedSpaces: ['Lobby', 'Parking B1'],
        ownerUids: ['uid_owner_01'],
        propertyManagerUid: 'uid_manager_01',
        operationalStatus: 'ACTIVE',
      },
      idempotencyKey: 'idem_bld_01',
      correlationId: 'corr_bld_01',
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.body.buildingId, 'bld_saadat_01');

    await assert.rejects(
      () =>
        service.upsertBuilding({
          principal: h.principals.manager,
          buildingId: 'bld_saadat_01',
          rawInput: {
            name: 'Saadat Abad Tower A',
            buildingType: 'RESIDENTIAL',
            floorsCount: 12,
            declaredUnitsCount: 24,
            sharedSpaces: ['Lobby'],
            ownerUids: ['uid_manager_01'],
            propertyManagerUid: 'uid_manager_01',
            operationalStatus: 'ACTIVE',
          },
          idempotencyKey: 'idem_bld_mgr_hijack',
          correlationId: 'corr_bld_02',
        }),
      /requires verified building legal ownership/,
    );

    const contractRes = await service.createManagementContract({
      principal: h.principals.owner,
      buildingId: 'bld_saadat_01',
      rawInput: {
        ownerUid: 'uid_owner_01',
        authorizedManagerUid: 'uid_manager_01',
        contractStartDateIso: '2026-11-01T00:00:00.000Z',
        contractEndDateIso: '2027-11-01T00:00:00.000Z',
        serviceScope: 'Full building facility and shared expense operations',
        delegatedPermissions: ['MANAGE_MAINTENANCE', 'MANAGE_EXPENSES', 'MANAGE_FACILITIES'],
        managementFeeAmount: 25_000_000,
        currency: 'IRT',
        contractDocumentMediaId: 'doc_cnt_01',
      },
      idempotencyKey: 'idem_cnt_01',
      correlationId: 'corr_cnt_01',
    });
    assert.equal(contractRes.body.status, 'ACTIVE');

    const u1 = await service.registerBuildingUnit({
      principal: h.principals.manager,
      buildingId: 'bld_saadat_01',
      rawInput: {
        propertyId: 'prop_unit_101',
        floorNumber: 1,
        unitNumber: '101',
        category: 'RESIDENTIAL',
        areaSqm: 100,
        ownershipShareBasisPoints: 2500,
        occupancyStatus: 'RENTED',
        ownerUid: 'uid_owner_01',
        tenantUid: 'uid_tenant_01',
      },
      idempotencyKey: 'idem_u101',
      correlationId: 'corr_u101',
    });
    assert.equal(u1.body.unitNumber, '101');

    await service.registerBuildingUnit({
      principal: h.principals.manager,
      buildingId: 'bld_saadat_01',
      rawInput: {
        propertyId: 'prop_unit_102',
        floorNumber: 1,
        unitNumber: '102',
        category: 'RESIDENTIAL',
        areaSqm: 100,
        ownershipShareBasisPoints: 2500,
        occupancyStatus: 'OWNER_OCCUPIED',
        ownerUid: 'uid_owner_01',
      },
      idempotencyKey: 'idem_u102',
      correlationId: 'corr_u102',
    });

    await service.registerBuildingUnit({
      principal: h.principals.manager,
      buildingId: 'bld_saadat_01',
      rawInput: {
        propertyId: 'prop_unit_201',
        floorNumber: 2,
        unitNumber: '201',
        category: 'RESIDENTIAL',
        areaSqm: 200,
        ownershipShareBasisPoints: 5000,
        occupancyStatus: 'VACANT',
        ownerUid: 'uid_owner_01',
      },
      idempotencyKey: 'idem_u201',
      correlationId: 'corr_u201',
    });

    await assert.rejects(
      () =>
        service.registerBuildingUnit({
          principal: h.principals.manager,
          buildingId: 'bld_saadat_01',
          rawInput: {
            propertyId: 'prop_unit_999',
            floorNumber: 1,
            unitNumber: '101',
            category: 'RESIDENTIAL',
            areaSqm: 90,
            occupancyStatus: 'VACANT',
            ownerUid: 'uid_owner_01',
          },
          idempotencyKey: 'idem_u_dup_num',
          correlationId: 'corr_u_dup',
        }),
      /already registered/,
    );
  });

  it('manages facilities, equipment, maintenance requests, preventive schedules, work orders, expenses, allocations, and HTTP routes', async () => {
    const h = createInMemoryBuildingHarness();
    const service = createBuildingOperationsService(h);

    await service.upsertBuilding({
      principal: h.principals.owner,
      buildingId: 'bld_elahieh_01',
      rawInput: {
        name: 'Elahieh Residence',
        buildingType: 'RESIDENTIAL',
        floorsCount: 10,
        declaredUnitsCount: 3,
        sharedSpaces: ['Lobby', 'Roof Garden'],
        ownerUids: ['uid_owner_01'],
        propertyManagerUid: 'uid_manager_01',
        operationalStatus: 'ACTIVE',
      },
      idempotencyKey: 'idem_el_bld',
      correlationId: 'corr_el_1',
    });

    const u1 = await service.registerBuildingUnit({
      principal: h.principals.manager,
      buildingId: 'bld_elahieh_01',
      rawInput: {
        propertyId: 'prop_el_1',
        floorNumber: 1,
        unitNumber: 'A1',
        category: 'RESIDENTIAL',
        areaSqm: 100,
        ownershipShareBasisPoints: 4000,
        occupancyStatus: 'RENTED',
        ownerUid: 'uid_owner_01',
        tenantUid: 'uid_tenant_01',
      },
      idempotencyKey: 'idem_el_u1',
      correlationId: 'corr_el_u1',
    });

    await service.registerBuildingUnit({
      principal: h.principals.manager,
      buildingId: 'bld_elahieh_01',
      rawInput: {
        propertyId: 'prop_el_2',
        floorNumber: 2,
        unitNumber: 'A2',
        category: 'RESIDENTIAL',
        areaSqm: 150,
        ownershipShareBasisPoints: 6000,
        occupancyStatus: 'OWNER_OCCUPIED',
        ownerUid: 'uid_owner_01',
      },
      idempotencyKey: 'idem_el_u2',
      correlationId: 'corr_el_u2',
    });

    const fac = await service.registerOrUpdateFacility({
      principal: h.principals.manager,
      buildingId: 'bld_elahieh_01',
      rawInput: {
        category: 'ELEVATOR',
        name: 'Main Passenger Elevator',
        operationalStatus: 'OPERATIONAL',
      },
      idempotencyKey: 'idem_el_fac',
      correlationId: 'corr_el_fac',
    });
    assert.equal(fac.body.operationalStatus, 'OPERATIONAL');

    const eq = await service.registerOrUpdateEquipmentAsset({
      principal: h.principals.manager,
      buildingId: 'bld_elahieh_01',
      rawInput: {
        facilityId: fac.body.facilityId,
        classification: 'ELEVATOR',
        assetCode: 'ELV-DRV-01',
        installationDateIso: '2025-01-01T00:00:00.000Z',
        status: 'OPERATIONAL',
      },
      idempotencyKey: 'idem_el_eq',
      correlationId: 'corr_el_eq',
    });
    assert.equal(eq.body.status, 'OPERATIONAL');

    const mReq = await service.createMaintenanceRequest({
      principal: h.principals.tenant,
      buildingId: 'bld_elahieh_01',
      rawInput: {
        unitId: u1.body.unitId,
        category: 'HEATING_SYSTEM',
        priority: 'HIGH',
        description: 'Radiator valve leaking in living room.',
        currency: 'IRT',
      },
      idempotencyKey: 'idem_el_mreq',
      correlationId: 'corr_el_mreq',
    });
    assert.equal(mReq.body.status, 'SUBMITTED');

    const sch = await service.createPreventiveSchedule({
      principal: h.principals.manager,
      buildingId: 'bld_elahieh_01',
      rawInput: {
        equipmentId: eq.body.equipmentId,
        facilityId: fac.body.facilityId,
        title: 'Quarterly Elevator Safety Check',
        recurrenceIntervalDays: 90,
        nextDueDateIso: '2026-12-01T00:00:00.000Z',
        responsiblePartyUid: 'uid_manager_01',
        checklistItems: ['Check brake pads', 'Test emergency intercom'],
      },
      idempotencyKey: 'idem_el_sch',
      correlationId: 'corr_el_sch',
    });

    const genWo = await service.generatePreventiveWorkOrder({
      principal: h.principals.manager,
      buildingId: 'bld_elahieh_01',
      scheduleId: sch.body.scheduleId,
      serviceProviderId: 'uid_provider_01',
      estimatedCostAmount: 12_000_000,
      currency: 'IRT',
      idempotencyKey: 'idem_el_genwo',
      correlationId: 'corr_el_genwo',
    });
    assert.equal(genWo.body.workOrder.status, 'ASSIGNED');

    const exp = await service.createBuildingExpense({
      principal: h.principals.manager,
      buildingId: 'bld_elahieh_01',
      rawInput: {
        category: 'MAINTENANCE',
        title: 'Common Lobby & Elevator Servicing',
        amount: 10_000_000,
        currency: 'IRT',
        expenseDateIso: '2026-11-05T00:00:00.000Z',
        responsiblePartyUid: 'uid_owner_01',
        approveImmediately: true,
      },
      idempotencyKey: 'idem_el_exp',
      correlationId: 'corr_el_exp',
    });

    const alloc = await service.allocateSharedBuildingExpense({
      principal: h.principals.manager,
      buildingId: 'bld_elahieh_01',
      rawInput: {
        expenseId: exp.body.expenseId,
        allocationPeriod: '2026-11',
        method: 'AREA_BASED',
      },
      idempotencyKey: 'idem_el_alloc',
      correlationId: 'corr_el_alloc',
    });
    assert.equal(alloc.body.unitShares.length, 2);
    assert.equal(alloc.body.unitShares[0].allocatedAmount, 4_000_000);
    assert.equal(alloc.body.unitShares[1].allocatedAmount, 6_000_000);

    const app = express();
    app.use(express.json());
    app.use('/api/building-ops', createBuildingOperationsRouter(h));
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const baseUrl = `http://127.0.0.1:${port}/api/building-ops`;

    try {
      const outsiderRes = await fetch(`${baseUrl}/buildings/bld_elahieh_01/overview`, {
        headers: { authorization: 'Bearer token_outsider_valid_01' },
      });
      assert.equal(outsiderRes.status, 403);

      const incRes = await fetch(`${baseUrl}/buildings/bld_elahieh_01/incidents`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer token_mgr_valid_0000001',
          'idempotency-key': 'http_inc_01',
        },
        body: JSON.stringify({
          category: 'GAS_INCIDENT',
          incidentTimestampIso: '2026-11-08T09:30:00.000Z',
          severity: 'CRITICAL',
          description: 'Boiler room gas pressure sensor triggered.',
          responsiblePartyUid: 'uid_manager_01',
          responseActions: ['Shut main gas valve', 'Ventilated room'],
        }),
      });
      assert.equal(incRes.status, 201);
      const incJson = (await incRes.json()) as { data: { escalationPriority: string } };
      assert.equal(incJson.data.escalationPriority, 'P1_IMMEDIATE');
    } finally {
      server.close();
    }
  });
});

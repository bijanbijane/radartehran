import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  PlatformFoundationRegistryStore,
  createPlatformExecutionContext,
  propagateExecutionContext,
  validateCorrelationId,
  PlatformApplicationError,
  redactSensitiveErrorText,
  toCanonicalErrorResponse,
  validatePlatformEnvironmentConfig,
  validateApiContractMetadata,
  createCanonicalEventEnvelope,
  validateCanonicalEventEnvelope,
  validateEventContractCompatibility,
  runPhase1ArchitectureValidation,
  registerPlatformFoundationAdminRoutes,
  CANONICAL_ERROR_CATALOG,
  INITIAL_PLATFORM_MODULES,
  INITIAL_API_CONTRACT_METADATA,
  INITIAL_EVENT_CONTRACTS,
} from '../server/modules/platform-foundation/index';

const TEST_ACTOR = {
  actorId: 'test-admin',
  actorRole: 'primary_admin',
  correlationId: 'corr_test_actor_001',
};

describe('Phase 1 — Platform Foundation & Architecture Contracts (D01–D13)', () => {
  it('D01 — Canonical Platform Module Registry covers Employees 53–80 with strict planned/operational separation', () => {
    const store = new PlatformFoundationRegistryStore();
    const page1 = store.listModules({ limit: 50 });
    assert.equal(page1.items.length, 28, 'Initial registry must contain all 28 modules from EMP_53 to EMP_80');

    // Verify EMP_53..EMP_73 are operational and EMP_74..EMP_80 are PLANNED and NOT operational
    for (let empNum = 53; empNum <= 80; empNum++) {
      const empId = `EMP_${empNum}`;
      const mod = page1.items.find((m) => m.owner === empId);
      assert.ok(mod, `Expected module for ${empId}`);
      if (empNum >= 74) {
        assert.equal(mod.implementationStatus, 'PLANNED', `${empId} must be PLANNED in Phase 1`);
        assert.equal(mod.isOperational, false, `${empId} must not be marked operational in Phase 1`);
        assert.notEqual(mod.operationalHealth, 'HEALTHY', `${empId} must not be reported HEALTHY`);
      } else {
        assert.equal(mod.isOperational, true, `${empId} should be operational`);
      }
    }

    // Retrieve by ID and code
    const emp74 = store.getModuleByIdOrCode('mod_emp_74');
    assert.equal(emp74.moduleCode, 'enterprise-multi-tenancy');

    // Reject duplicate moduleCode
    assert.throws(
      () =>
        store.registerModule(
          {
            moduleCode: 'enterprise-multi-tenancy',
            displayName: 'Duplicate Tenant Module',
            owner: 'EMP_74',
            implementationStatus: 'PLANNED',
            apiBasePath: '/api/v1/tenants',
          },
          TEST_ACTOR,
        ),
      (err: unknown) => err instanceof PlatformApplicationError && err.code === 'DUPLICATE_MODULE_CODE',
    );

    // Reject invalid owner reference
    assert.throws(
      () =>
        store.registerModule(
          {
            moduleCode: 'invalid-owner-mod',
            displayName: 'Invalid Owner Module',
            owner: 'EMP_99' as 'EMP_80',
            implementationStatus: 'PLANNED',
            apiBasePath: '/api/v1/invalid',
          },
          TEST_ACTOR,
        ),
      (err: unknown) => err instanceof PlatformApplicationError && err.category === 'VALIDATION',
    );

    // Reject marking PLANNED module as HEALTHY
    const emp75 = store.getModuleByIdOrCode('mod_emp_75');
    assert.throws(
      () =>
        store.updateModule(
          'mod_emp_75',
          {
            operationalHealth: 'HEALTHY',
            expectedVersion: emp75.version,
          },
          TEST_ACTOR,
        ),
      (err: unknown) =>
        err instanceof PlatformApplicationError && err.code === 'PLANNED_MODULE_CANNOT_BE_OPERATIONAL',
    );
  });

  it('D02 — Service Dependency Registry enforces valid module refs, duplicate prevention, and required startup cycle detection', () => {
    const store = new PlatformFoundationRegistryStore();
    const graphValidation = store.computeDependencyGraph();
    assert.equal(graphValidation.valid, true);
    assert.equal(graphValidation.startupCyclesDetected.length, 0);

    // Register valid optional dependency
    const newDep = store.registerDependency(
      {
        sourceModule: 'distributed-caching-performance',
        targetModule: 'analytical-data-platform',
        dependencyType: 'ANALYTICS',
        criticality: 'OPTIONAL',
        requiredForStartup: false,
        requiredForRequests: false,
        fallbackStrategy: 'SKIP_OPTIONAL',
      },
      TEST_ACTOR,
    );
    assert.equal(newDep.status, 'UNKNOWN', 'Unverified dependency availability must default to UNKNOWN');
    assert.equal(newDep.isOptional, true);

    // Reject duplicate dependency
    assert.throws(
      () =>
        store.registerDependency(
          {
            sourceModule: 'distributed-caching-performance',
            targetModule: 'analytical-data-platform',
            dependencyType: 'ANALYTICS',
            criticality: 'OPTIONAL',
            requiredForStartup: false,
            requiredForRequests: false,
            fallbackStrategy: 'SKIP_OPTIONAL',
          },
          TEST_ACTOR,
        ),
      (err: unknown) => err instanceof PlatformApplicationError && err.code === 'DUPLICATE_DEPENDENCY_EDGE',
    );

    // Reject missing module reference
    assert.throws(
      () =>
        store.registerDependency(
          {
            sourceModule: 'non-existent-module',
            targetModule: 'platform-integration-resilience',
            dependencyType: 'OTHER',
            criticality: 'OPTIONAL',
            requiredForStartup: false,
            requiredForRequests: false,
            fallbackStrategy: 'SKIP_OPTIONAL',
          },
          TEST_ACTOR,
        ),
      (err: unknown) =>
        err instanceof PlatformApplicationError && err.code === 'UNRESOLVED_DEPENDENCY_MODULE_REFERENCE',
    );

    // Detect and reject required startup dependency cycle:
    // real-estate-transactions -> financial-ledger is requiredForStartup in seed
    assert.throws(
      () =>
        store.registerDependency(
          {
            sourceModule: 'financial-ledger',
            targetModule: 'real-estate-transactions',
            dependencyType: 'BILLING',
            criticality: 'CRITICAL',
            requiredForStartup: true,
            requiredForRequests: true,
            fallbackStrategy: 'FAIL_CLOSED',
          },
          TEST_ACTOR,
        ),
      (err: unknown) =>
        err instanceof PlatformApplicationError && err.code === 'REQUIRED_STARTUP_DEPENDENCY_CYCLE',
    );
  });

  it('D03 — Domain Ownership & Authority Matrix enforces single authoritative owner and protects EMP_54, EMP_58, EMP_72', () => {
    const store = new PlatformFoundationRegistryStore();

    const ledgerOwner = store.resolveEntityOwnership('FINANCIAL_LEDGER_ENTRY');
    assert.equal(ledgerOwner.owningEmployee, 'EMP_54');

    const listingOwner = store.resolveEntityOwnership('PROPERTY_LISTING');
    assert.equal(listingOwner.owningEmployee, 'EMP_58');

    const legalHoldOwner = store.resolveEntityOwnership('LEGAL_HOLD_AND_RETENTION_POLICY');
    assert.equal(legalHoldOwner.owningEmployee, 'EMP_72');

    // Unknown entityType fails explicitly with 404
    assert.throws(
      () => store.resolveEntityOwnership('UNKNOWN_ENTITY_TYPE_XYZ'),
      (err: unknown) => err instanceof PlatformApplicationError && err.httpStatus === 404,
    );

    // Duplicate authoritative ownership is rejected
    assert.throws(
      () =>
        store.registerOwnership(
          {
            entityType: 'PROPERTY_LISTING',
            owningEmployee: 'EMP_74',
            owningModuleCode: 'enterprise-tenancy-isolation',
            authoritativePersistenceProvider: 'FIRESTORE_AUTHORITATIVE',
            authoritativeCollectionOrTable: 'bargains',
            mutationServiceReference: 'tenant.listings.mutate',
            tenantOwnershipClassification: 'TENANT_OWNED',
          },
          TEST_ACTOR,
        ),
      (err: unknown) =>
        err instanceof PlatformApplicationError && err.code === 'DUPLICATE_AUTHORITATIVE_OWNERSHIP',
    );

    // Core authority reassignment for EMP_54 / EMP_58 / EMP_72 is rejected
    assert.throws(
      () =>
        store.updateOwnership(
          legalHoldOwner.id,
          {
            owningEmployee: 'EMP_77',
            expectedVersion: legalHoldOwner.version,
          },
          TEST_ACTOR,
        ),
      (err: unknown) =>
        err instanceof PlatformApplicationError && err.code === 'IMMUTABLE_DOMAIN_AUTHORITY_VIOLATION',
    );
  });

  it('D04 — Platform Execution Context enforces server-generated requestId, validated correlationId, and untrusted client tenantId', () => {
    const validCorr = validateCorrelationId('corr-abc-12345678');
    assert.equal(validCorr, 'corr-abc-12345678');

    const invalidCorr = validateCorrelationId('bad!@#script<svg>');
    assert.equal(invalidCorr, null);

    const ctx = createPlatformExecutionContext({
      correlationId: 'corr-valid-99887766',
      clientRequestedTenantId: 'tenant-spoof-attempt',
      untrustedClientActorId: 'spoofed-admin',
      sourceModule: 'listing-lifecycle',
    });

    assert.match(ctx.requestId, /^req_[a-f0-9]+$/, 'requestId must always be server-generated');
    assert.equal(ctx.correlationId, 'corr-valid-99887766');
    assert.equal(ctx.actorId, null, 'Untrusted client actorId must never be trusted');
    assert.equal(ctx.verifiedTenantId, null, 'Unverified client tenant hint must not populate verifiedTenantId');
    assert.equal(ctx.tenantResolutionStatus, 'UNVERIFIED_CLIENT_HINT');

    const childCtx = propagateExecutionContext(ctx, {
      sourceModule: 'financial-ledger-settlement',
      operationName: 'ledger.settle',
    });
    assert.equal(childCtx.correlationId, ctx.correlationId);
    assert.equal(childCtx.causationId, ctx.requestId);
    assert.equal(childCtx.sourceModule, 'financial-ledger-settlement');
  });

  it('D05 — Canonical Error Taxonomy covers all 14 categories, maps HTTP statuses, and redacts secrets', () => {
    assert.equal(CANONICAL_ERROR_CATALOG.length, 14);
    const categories = new Set(CANONICAL_ERROR_CATALOG.map((c) => c.category));
    const expected = [
      'VALIDATION',
      'AUTHENTICATION',
      'AUTHORIZATION',
      'TENANT_ISOLATION',
      'NOT_FOUND',
      'CONFLICT',
      'BUSINESS_RULE',
      'DEPENDENCY_UNAVAILABLE',
      'RESOURCE_EXHAUSTED',
      'TIMEOUT',
      'INTEGRITY',
      'COMPLIANCE',
      'SECURITY',
      'INTERNAL',
    ];
    for (const exp of expected) {
      assert.ok(categories.has(exp as never), `Missing category ${exp}`);
    }

    const rawError = new PlatformApplicationError({
      code: 'DB_CONN_FAILED',
      category: 'DEPENDENCY_UNAVAILABLE',
      message:
        'Failed connecting to postgres://admin:superSecretPass@db.internal:5432/prod with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def and key AIzaSyD-1234567890abcdefghijklmnopqrstuvwx',
    });

    const formatted = toCanonicalErrorResponse(rawError, {
      requestId: 'req_test_1',
      correlationId: 'corr_test_1',
    });

    assert.equal(formatted.statusCode, 503);
    assert.equal(formatted.body.error.retryable, true);
    assert.ok(!JSON.stringify(formatted.body).includes('superSecretPass'));
    assert.ok(!JSON.stringify(formatted.body).includes('AIzaSyD'));
    assert.ok(!JSON.stringify(formatted.body).includes('eyJhbGciOi'));
    assert.ok(!redactSensitiveErrorText('Error line 1\n    at Object.<anonymous> (/app/server.ts:42:13)').includes('/app/server.ts'));
  });

  it('D06 — Environment & Runtime Configuration Validator enforces strict production rules and blocks VITE_ secret exposure', () => {
    const devReport = validatePlatformEnvironmentConfig({
      NODE_ENV: 'development',
      PORT: '3000',
    });
    assert.equal(devReport.valid, true);

    const badProdReport = validatePlatformEnvironmentConfig({
      NODE_ENV: 'production',
      PORT: '3000',
      FIRESTORE_EMULATOR_HOST: 'localhost:8080',
      ADMIN_API_SECRET: 'changeme',
      VITE_GEMINI_API_KEY: 'exposed-secret-to-browser',
    });
    assert.equal(badProdReport.valid, false);
    const joinedErrors = badProdReport.errors.join(' | ');
    assert.ok(joinedErrors.includes('UNSAFE_PRODUCTION_EMULATOR'));
    assert.ok(joinedErrors.includes('INSECURE_PRODUCTION_SECRET'));
    assert.ok(joinedErrors.includes('FRONTEND_SECRET_EXPOSURE'));
  });

  it('D07 & D08 — API Contract & Event Envelope Standards validate schemas, ownership, and version compatibility', () => {
    assert.doesNotThrow(() => validateApiContractMetadata(INITIAL_API_CONTRACT_METADATA[0]));

    assert.throws(
      () =>
        validateApiContractMetadata({
          ...INITIAL_API_CONTRACT_METADATA[0],
          contractId: 'BAD_API',
          path: 'relative/path',
        }),
      (err: unknown) => err instanceof PlatformApplicationError && err.code === 'INVALID_API_CONTRACT_PATH',
    );

    const contract = INITIAL_EVENT_CONTRACTS[0];
    const payload: Record<string, unknown> = {};
    for (const reqField of contract.requiredPayloadFields) {
      payload[reqField] = 'test-value';
    }

    const envelope = createCanonicalEventEnvelope({
      eventType: contract.eventType,
      eventVersion: contract.eventVersion,
      sourceModule: contract.sourceModule,
      owningEmployee: contract.owningEmployee,
      aggregateType: contract.aggregateType,
      aggregateId: 'agg_001',
      correlationId: 'corr_evt_001',
      causationId: 'req_evt_001',
      payloadReference: 'inline:payload',
      schemaReference: contract.schemaReference,
      payload,
    });

    assert.doesNotThrow(() => validateCanonicalEventEnvelope(envelope, contract));

    // Mismatched producer module must be rejected
    assert.throws(
      () =>
        validateCanonicalEventEnvelope(
          { ...envelope, sourceModule: 'enterprise-tenancy-isolation' },
          contract,
        ),
      (err: unknown) =>
        err instanceof PlatformApplicationError && err.code === 'EVENT_SOURCE_OWNERSHIP_MISMATCH',
    );

    // Version compatibility check: removing a required field without incrementing major version is breaking
    const breakingChange = validateEventContractCompatibility(contract, {
      ...contract,
      requiredPayloadFields: [],
    });
    assert.equal(breakingChange.compatible, false);
  });

  it('D09 — Architecture & Boundary Validator passes on clean seed state and catches synthetic violations', () => {
    const cleanResult = runPhase1ArchitectureValidation();
    assert.equal(cleanResult.valid, true, `Expected 0 violations, got: ${JSON.stringify(cleanResult.violations)}`);

    // Introduce synthetic violations: planned module marked operational + secret literal
    const corruptedModules = INITIAL_PLATFORM_MODULES.map((m) =>
      m.moduleId === 'mod_emp_74' ? { ...m, isOperational: true, operationalHealth: 'HEALTHY' as const } : m,
    );
    const corruptedResult = runPhase1ArchitectureValidation({
      modules: corruptedModules,
      sourceCodeSnippetsToScanForSecrets: [
        { filePath: 'synthetic.ts', content: 'const key = "sk-live-1234567890abcdefghijklmnop";' },
      ],
    });
    assert.equal(corruptedResult.valid, false);
    const codes = new Set(corruptedResult.violations.map((v) => v.ruleCode));
    assert.ok(codes.has('PLANNED_MODULE_MARKED_OPERATIONAL'));
    assert.ok(codes.has('SECRET_PATTERN_VIOLATION'));
  });

  it('D10 & D11 — Administrative APIs, RBAC, Optimistic Concurrency (409), Pagination, Audit Log & Durable Migration', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-phase1-test-'));
    const persistenceFile = path.join(tmpDir, 'platform-registry.json');

    try {
      const store = new PlatformFoundationRegistryStore({ persistenceFilePath: persistenceFile });

      // D11: Verify repeat-safe idempotent migration execution
      const mig1 = store.runAdditiveMigrations();
      const mig2 = store.runAdditiveMigrations();
      assert.equal(mig1.migrationId, 'MIG_20261108_001_PLATFORM_FOUNDATION_REGISTRIES');
      assert.equal(mig2.checksum, mig1.checksum);
      assert.equal(mig2.executionStatus, 'ALREADY_APPLIED');
      assert.equal(store.getMigrations().length, 1);

      const app = express();
      app.use(express.json());
      registerPlatformFoundationAdminRoutes(app, {
        store,
        authVerifier: async (req, requiredPermission) => {
          const token = req.headers['x-test-admin-token'];
          if (!token) {
            return {
              authorized: false,
              statusCode: 401,
              reason: 'MISSING_ADMIN_TOKEN',
              actorId: 'anonymous',
              actorRole: 'unauthorized',
              permissions: [],
            };
          }
          const scope = req.headers['x-admin-role-scope'];
          if (scope === 'read_only' && requiredPermission === 'platform:admin:write') {
            return {
              authorized: false,
              statusCode: 403,
              reason: 'PERMISSION_DENIED',
              actorId: 'readonly-operator',
              actorRole: 'read_only_admin',
              permissions: ['platform:admin:read'],
            };
          }
          return {
            authorized: true,
            statusCode: 200,
            reason: 'AUTHORIZED_TEST_ADMIN',
            actorId: 'admin-operator-1',
            actorRole: 'primary_admin',
            permissions: ['platform:admin:read', 'platform:admin:write'],
          };
        },
      });

      const server = app.listen(0);
      const port = (server.address() as AddressInfo).port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        // 1. Unauthenticated request -> 401
        const unauthRes = await fetch(`${baseUrl}/api/admin/platform/modules`);
        assert.equal(unauthRes.status, 401);

        // 2. Paginated GET /api/admin/platform/modules with limit=10
        const page1Res = await fetch(`${baseUrl}/api/admin/platform/modules?limit=10`, {
          headers: { 'x-test-admin-token': 'valid', 'x-correlation-id': 'corr_http_test_01' },
        });
        assert.equal(page1Res.status, 200);
        const page1Body = await page1Res.json();
        assert.equal(page1Body.success, true);
        assert.equal(page1Body.data.length, 10);
        assert.ok(page1Body.meta.nextCursor);

        // 3. Read-only admin role attempting write -> 403 PERMISSION_DENIED
        const viewerWriteRes = await fetch(`${baseUrl}/api/admin/platform/modules/mod_emp_80`, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'x-test-admin-token': 'valid',
            'x-admin-role-scope': 'read_only',
          },
          body: JSON.stringify({ displayName: 'Blocked Update', expectedVersion: 1 }),
        });
        assert.equal(viewerWriteRes.status, 403);
        const viewerWriteBody = await viewerWriteRes.json();
        assert.equal(viewerWriteBody.error.code, 'PERMISSION_DENIED');

        // 4. Authorized PATCH with valid expectedVersion -> 200 and increments version
        const patchOkRes = await fetch(`${baseUrl}/api/admin/platform/modules/mod_emp_80`, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'x-test-admin-token': 'valid',
          },
          body: JSON.stringify({ displayName: 'Platform Integration & Resilience v2', expectedVersion: 1 }),
        });
        assert.equal(patchOkRes.status, 200);
        const patchOkBody = await patchOkRes.json();
        assert.equal(patchOkBody.data.version, 2);
        assert.equal(patchOkBody.data.displayName, 'Platform Integration & Resilience v2');

        // 5. Stale expectedVersion -> 409 VERSION_CONFLICT
        const stalePatchRes = await fetch(`${baseUrl}/api/admin/platform/modules/mod_emp_80`, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'x-test-admin-token': 'valid',
          },
          body: JSON.stringify({ displayName: 'Stale Update', expectedVersion: 1 }),
        });
        assert.equal(stalePatchRes.status, 409);
        const stalePatchBody = await stalePatchRes.json();
        assert.equal(stalePatchBody.error.code, 'VERSION_CONFLICT');

        // 6. Test remaining endpoints: dependencies graph, ownership resolve, contracts, events/contracts, errors/catalog
        const graphRes = await fetch(`${baseUrl}/api/admin/platform/dependencies/graph`, {
          headers: { 'x-test-admin-token': 'valid' },
        });
        assert.equal(graphRes.status, 200);
        const graphBody = await graphRes.json();
        assert.equal(graphBody.data.valid, true);

        const resolveRes = await fetch(`${baseUrl}/api/admin/platform/ownership/PROPERTY_LISTING/resolve`, {
          headers: { 'x-test-admin-token': 'valid' },
        });
        assert.equal(resolveRes.status, 200);
        const resolveBody = await resolveRes.json();
        assert.equal(resolveBody.data.authoritativeOwnerEmployee, 'EMP_58');

        const contractsRes = await fetch(`${baseUrl}/api/admin/platform/contracts`, {
          headers: { 'x-test-admin-token': 'valid' },
        });
        assert.equal(contractsRes.status, 200);

        const eventsContractsRes = await fetch(`${baseUrl}/api/admin/platform/events/contracts`, {
          headers: { 'x-test-admin-token': 'valid' },
        });
        assert.equal(eventsContractsRes.status, 200);

        const errorCatalogRes = await fetch(`${baseUrl}/api/admin/platform/errors/catalog`, {
          headers: { 'x-test-admin-token': 'valid' },
        });
        assert.equal(errorCatalogRes.status, 200);
        const errorCatalogBody = await errorCatalogRes.json();
        assert.equal(errorCatalogBody.data.length, 14);

        // 7. Verify audit log recorded the administrative mutation
        const audits = store.getAuditLog();
        assert.ok(audits.length >= 1);
        assert.equal(audits[0].operation, 'module.update');
        assert.equal(audits[0].actorId, 'admin-operator-1');

        // 8. Verify durable persistence across store re-instantiation
        const reloadedStore = new PlatformFoundationRegistryStore({ persistenceFilePath: persistenceFile });
        const reloadedMod80 = reloadedStore.getModuleByIdOrCode('mod_emp_80');
        assert.equal(reloadedMod80.displayName, 'Platform Integration & Resilience v2');
        assert.equal(reloadedMod80.version, 2);
      } finally {
        server.close();
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('D13 — Completion manifest at docs/manifests/phase_01.json tracks D01 through D13 with valid schema and TESTED states', () => {
    const manifestPath = path.resolve(process.cwd(), 'docs/manifests/phase_01.json');
    assert.equal(fs.existsSync(manifestPath), true, 'docs/manifests/phase_01.json must exist');
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      phaseId: string;
      programId: string;
      deliverables: Array<{
        deliverableId: string;
        title: string;
        status: string;
        files: string[];
        tests: string[];
        verificationCommands: string[];
      }>;
    };
    assert.equal(parsed.phaseId, 'PHASE_01');
    assert.equal(parsed.programId, 'EMPLOYEES_74_80');
    assert.equal(parsed.deliverables.length, 13);

    const expectedIds = Array.from({ length: 13 }, (_, idx) => `D${String(idx + 1).padStart(2, '0')}`);
    assert.deepEqual(
      parsed.deliverables.map((d) => d.deliverableId),
      expectedIds,
    );

    const allowedStates = new Set([
      'NOT_STARTED',
      'IN_PROGRESS',
      'IMPLEMENTED',
      'INTEGRATED',
      'TESTED',
      'BLOCKED_EXTERNAL',
    ]);
    for (const deliv of parsed.deliverables) {
      assert.equal(allowedStates.has(deliv.status), true);
      assert.equal(deliv.status, 'TESTED');
      assert.ok(Array.isArray(deliv.files) && deliv.files.length >= 1);
      assert.ok(Array.isArray(deliv.tests) && deliv.tests.length >= 1);
      assert.ok(Array.isArray(deliv.verificationCommands) && deliv.verificationCommands.length >= 1);
    }
  });
});


/**
 * @file tests/cloudflare-ai-commerce-architecture.test.ts
 * @description Verification suite for Gold Master Cloud, AI & Digital Commerce Architecture:
 * - 5-Dimension Portability & Cloudflare Capability Registry
 * - Central AI Model Registry, Routing, Audit Trail & Rollback
 * - Mandatory `SIMULATED — NOT A REAL AI RESPONSE` labeling
 * - Data Commerce PII Protection (`403` on buyerLeads) & x402 (`402 Payment Required`)
 * - Mandatory `SIMULATION — NO REAL PAYMENT OR SETTLEMENT` separation from settled revenue
 * - Authorized MCP Tools grounded in `calculateHedonicValuation`
 * - Authoritative Architecture Documentation inventory
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  evaluateCloudflareRuntimePortability,
  FORENSIC_PORTABILITY_MATRIX,
  CLOUDFLARE_CAPABILITY_REGISTRY,
} from '../src/utils/cloudflarePortabilityAndCapabilities';
import {
  OFFICIAL_AI_MODEL_REGISTRY,
  AiModelRoutingManager,
  buildCloudflareAiGatewayEndpoint,
  parseNaturalPersianHousingQuery,
  MANDATORY_AI_SIMULATION_BANNER,
} from '../src/utils/aiModelRegistryAndGateway';
import {
  auditDatasetCommercialEligibility,
  buildX402PaymentChallenge,
  signX402PaymentContextForVerification,
  verifyX402PaymentHeaders,
  MonetizationLedgerAndSimulator,
  executeAuthorizedMcpTool,
  AUTHORIZED_MCP_TOOL_DESCRIPTORS,
  MANDATORY_PAYMENT_SIMULATION_BANNER,
} from '../src/utils/dataCommerceMcpAndMonetization';
import {
  verifyMasterPromptIntegrity,
  validateRmepExecutionState,
  readAndReconcileExecutionState,
  PINNED_MASTER_PROMPT_SHA256,
} from '../src/utils/rmepExecutionStateEngine';

async function runTests() {
  console.log('Running Gold Master Cloud, AI & Digital Commerce Architecture + RMEP-001 verification suite...');

  // 1. Authoritative Documentation Check
  const requiredDocs = [
    'docs/architecture/ARCHITECTURE-AND-PORTABILITY.md',
    'docs/architecture/CLOUDFLARE-CAPABILITY-REGISTRY.md',
    'docs/architecture/AI-MODEL-AND-GATEWAY-ARCHITECTURE.md',
    'docs/architecture/DATA-COMMERCE-AND-MONETIZATION.md',
    'docs/architecture/PROVIDER-REPLACEMENT-MATRIX.md',
    'docs/architecture/ARCHITECTURE-DECISIONS.md',
    'docs/engineering/RMEP-001/MASTER-PROMPT.md',
    'docs/engineering/RMEP-001/EXECUTION-STATE.json',
    'docs/engineering/RMEP-001/MASTER-ENGINEERING-DECISIONS.md',
    'docs/engineering/RMEP-001/PROGRESS-LOG.md',
    'docs/engineering/RMEP-001/FINAL-ENGINEERING-REPORT.md',
  ];
  for (const relDoc of requiredDocs) {
    const absPath = path.join(process.cwd(), relDoc);
    assert.equal(fs.existsSync(absPath), true, `Missing authoritative doc: ${relDoc}`);
    const content = fs.readFileSync(absPath, 'utf-8');
    assert.ok(content.length > 200, `Authoritative doc ${relDoc} must be substantive`);
  }

  // 2. Five-Dimension Portability & Cloudflare Capability Registry
  const portability = evaluateCloudflareRuntimePortability({});
  assert.equal(portability.accountBindingsStatus.cloudflareAccountConfigured, 'BLOCKED');
  assert.equal(portability.activeRecommendedModel, 'C_EXTERNAL_BACKEND_WITH_CLOUDFLARE_EDGE');
  assert.ok(FORENSIC_PORTABILITY_MATRIX.length >= 5);
  assert.ok(CLOUDFLARE_CAPABILITY_REGISTRY.some((c) => c.id === 'cf_r2_storage' && c.adoptionDecision === 'ADOPT_NOW'));
  assert.ok(
    CLOUDFLARE_CAPABILITY_REGISTRY.some(
      (c) => c.id === 'cf_vectorize' && c.adoptionDecision === 'REJECT_WITH_EVIDENCE'
    )
  );

  // 3. Central AI Model Registry, Routing, Audit Trail & Rollback
  assert.ok(OFFICIAL_AI_MODEL_REGISTRY.some((m) => m.modelId === 'gemini-2.5-flash'));
  assert.ok(
    OFFICIAL_AI_MODEL_REGISTRY.some((m) => m.modelId === '@cf/meta/llama-3.3-70b-instruct-fp8-fast')
  );

  const router = new AiModelRoutingManager();
  assert.equal(router.getCurrentConfig().version, 1);

  assert.throws(
    () => router.updateRouting({ actorEmail: '', routes: { intelligent_search: 'gemini-2.5-flash' } }),
    /ADMIN_AUTHORIZATION_REQUIRED_FOR_AI_ROUTING/
  );
  assert.throws(
    () =>
      router.updateRouting({
        actorEmail: 'admin@radar.ir',
        routes: { intelligent_search: 'fake-invented-model-999' },
      }),
    /UNVERIFIED_MODEL_IDENTIFIER/
  );

  const updated = router.updateRouting({
    actorEmail: 'admin@radar.ir',
    aiGatewayEnabled: true,
    routes: { intelligent_search: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
  });
  assert.equal(updated.version, 2);
  assert.equal(updated.routes.intelligent_search, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.equal(router.getAuditTrail().length, 1);

  const rolledBack = router.rollbackToPreviousConfig('admin@radar.ir');
  assert.equal(rolledBack.version, 3);
  assert.equal(rolledBack.routes.intelligent_search, 'gemini-2.5-flash');
  assert.equal(router.getAuditTrail()[0].action, 'ROLLBACK_ROUTING');

  // 4. Cloudflare AI Gateway Redacted URL Builder
  const unconfiguredGw = buildCloudflareAiGatewayEndpoint({
    provider: 'google-ai-studio',
    modelId: 'gemini-2.5-flash',
  });
  assert.equal(unconfiguredGw.configured, false);
  assert.equal(unconfiguredGw.endpointUrl, null);

  const configuredGw = buildCloudflareAiGatewayEndpoint({
    accountId: '0123456789abcdef0123456789abcdef',
    gatewayId: 'radar-tehran-gw',
    provider: 'workers-ai',
    modelId: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  });
  assert.equal(configuredGw.configured, true);
  assert.ok(!configuredGw.redactedPreviewUrl.includes('0123456789abcdef0123456789abcdef'));

  // 5. Intelligent Persian Search & Mandatory Simulation Label
  const parsedSearch = parseNaturalPersianHousingQuery(
    'آپارتمان در منطقه ۵ تا ۱۳۵ میلیون متری با رشد مثبت در پونک',
    { isLiveModelVerified: false }
  );
  assert.equal(parsedSearch.cityId, 'tehran');
  assert.equal(parsedSearch.dealMode, 'buy');
  assert.equal(parsedSearch.targetZone, 5);
  assert.equal(parsedSearch.maxBuyPerSqmMillions, 135);
  assert.equal(parsedSearch.positiveGrowthOnly, true);
  assert.ok(parsedSearch.mentionedHoodKeywords.includes('پونک'));
  assert.equal(parsedSearch.isSimulated, true);
  assert.equal(parsedSearch.simulationBanner, MANDATORY_AI_SIMULATION_BANNER);

  // 6. Data Commerce PII Redistribution Protection & x402 Protocol
  const piiAudit = auditDatasetCommercialEligibility('buyerLeads');
  assert.equal(piiAudit.distributable, false);
  assert.equal(piiAudit.httpStatusIfRequested, 403);
  assert.equal(piiAudit.reasonCode, 'FORBIDDEN_PII_OR_PRIVATE_DATA');

  const publicIndexAudit = auditDatasetCommercialEligibility('tehran_neighborhood_price_index_v1');
  assert.equal(publicIndexAudit.distributable, true);
  assert.equal(publicIndexAudit.httpStatusIfRequested, 200);

  const challenge = buildX402PaymentChallenge('tehran_neighborhood_price_index_v1');
  assert.equal(challenge.httpStatus, 402);
  assert.ok(challenge.headers['PAYMENT-REQUIRED'].length > 16);

  const missingHeadersCheck = verifyX402PaymentHeaders({
    expectedProductId: 'tehran_neighborhood_price_index_v1',
    verificationSecret: 'test-x402-secret-key',
  });
  assert.equal(missingHeadersCheck.verified, false);
  assert.equal(missingHeadersCheck.httpStatus, 402);
  assert.equal(missingHeadersCheck.failureCode, 'PAYMENT_REQUIRED');

  const validContextJson = JSON.stringify({
    productId: 'tehran_neighborhood_price_index_v1',
    amountUsdMicros: 5000,
    nonce: 'n1',
  });
  const validContextB64 = Buffer.from(validContextJson, 'utf-8').toString('base64');
  const validSig = signX402PaymentContextForVerification(validContextJson, 'test-x402-secret-key');

  const validProofCheck = verifyX402PaymentHeaders({
    paymentContextHeader: validContextB64,
    paymentSignatureHeader: validSig,
    expectedProductId: 'tehran_neighborhood_price_index_v1',
    verificationSecret: 'test-x402-secret-key',
  });
  assert.equal(validProofCheck.verified, true);
  assert.equal(validProofCheck.httpStatus, 200);

  // 7. Strict Separation of Simulated vs. Settled Revenue
  const ledger = new MonetizationLedgerAndSimulator();
  const simTx = ledger.runPaymentSimulation('tehran_neighborhood_price_index_v1');
  assert.equal(simTx.isSimulation, true);
  assert.equal(simTx.simulationBanner, MANDATORY_PAYMENT_SIMULATION_BANNER);
  assert.equal(simTx.settledRevenueAddedUsdMicros, 0);

  const summaryAfterSim = ledger.getSummary();
  assert.equal(summaryAfterSim.simulationLedger.simulatedTransactionsCount, 1);
  assert.equal(summaryAfterSim.productionLedger.actualSettledRevenueUsdMicros, 0);
  assert.equal(summaryAfterSim.productionLedger.authorizedPaymentsCount, 0);

  ledger.recordAuthorizedPayment(5000);
  assert.equal(ledger.getSummary().productionLedger.authorizedUnsettledUsdMicros, 5000);
  assert.equal(ledger.getSummary().productionLedger.actualSettledRevenueUsdMicros, 0);

  ledger.confirmSettlement(5000);
  assert.equal(ledger.getSummary().productionLedger.authorizedUnsettledUsdMicros, 0);
  assert.equal(ledger.getSummary().productionLedger.actualSettledRevenueUsdMicros, 5000);

  // 8. Authorized MCP Tool Execution & Hedonic Grounding
  const mcpValuation = executeAuthorizedMcpTool({
    toolName: 'compute_hedonic_valuation',
    args: {
      basePricePerSqm: 120,
      sqm: 100,
      buildingAge: 2,
      floor: 3,
      totalFloors: 5,
      hasElevator: true,
      hasParking: true,
      hasStorage: true,
      isRenovated: false,
    },
  });
  assert.equal(mcpValuation.ok, true);
  assert.ok(mcpValuation.provenance.includes('hedonicPricingEngine.ts'));

  const mcpStats = executeAuthorizedMcpTool({
    toolName: 'get_neighborhood_statistics',
    args: { city: 'tehran', hoodId: 1 },
  });
  assert.equal(mcpStats.ok, true);
  assert.equal((mcpStats.result as any).id, 1);

  const mcpSearch = executeAuthorizedMcpTool({
    toolName: 'search_approved_market_data',
    args: { city: 'tehran', maxBuyPerSqm: 160 },
  });
  assert.equal(mcpSearch.ok, true);
  assert.ok(Array.isArray((mcpSearch.result as any).items));

  const mcpCompare = executeAuthorizedMcpTool({
    toolName: 'compare_market_indicators',
    args: { city: 'tehran', firstHoodId: 1, secondHoodId: 2 },
  });
  assert.equal(mcpCompare.ok, true);
  assert.equal(typeof (mcpCompare.result as any).buyDiffPerSqm, 'number');

  assert.throws(
    () => executeAuthorizedMcpTool({ toolName: 'execute_raw_sql_query', args: {} }),
    /UNAUTHORIZED_OR_UNKNOWN_MCP_TOOL/
  );

  assert.equal(AUTHORIZED_MCP_TOOL_DESCRIPTORS.length, 4);
  for (const desc of AUTHORIZED_MCP_TOOL_DESCRIPTORS) {
    assert.equal(desc.readOnly, true);
    assert.equal(desc.zeroPii, true);
  }

  const aiRoutesSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/utils/serverAiAndCommerceRoutes.ts'),
    'utf-8'
  );
  assert.ok(aiRoutesSrc.includes('/api/mcp/tools'));
  assert.ok(aiRoutesSrc.includes('/api/mcp/invoke'));
  assert.ok(aiRoutesSrc.includes('/api/ai/gateway/infer'));
  assert.ok(aiRoutesSrc.includes('/api/v1/commerce/neighborhood-dossier/:hoodId'));

  const serverSrc = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
  assert.ok(serverSrc.includes('registerSponsorAndBargainRoutes(app'));
  assert.ok(serverSrc.includes('registerBackupAndChunkUploadRoutes(app'));
  assert.ok(serverSrc.includes('registerAiAndCommerceRoutes(app'));
  assert.ok(serverSrc.includes('app.get("/api/healthz"'));
  assert.ok(serverSrc.includes('app.get("/api/openapi.json"'));

  const liveDiagSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/LiveDiagnosticOverlay.tsx'),
    'utf-8'
  );
  assert.ok(liveDiagSrc.includes('cities.length >= 5'));
  assert.ok(liveDiagSrc.includes('storageJson?.providerLabelFa'));

  // 9. RMEP-001 Master Prompt SHA-256 & Declarative Execution State Verification
  const promptVerification = verifyMasterPromptIntegrity();
  assert.equal(promptVerification.exists, true);
  assert.equal(promptVerification.sha256, PINNED_MASTER_PROMPT_SHA256);
  assert.equal(promptVerification.matchesPinnedBaseline, true);

  const reconciledState = readAndReconcileExecutionState();
  assert.equal(
    reconciledState.reconciled,
    true,
    `RMEP EXECUTION-STATE discrepancies: ${reconciledState.discrepancies.join(', ')}`
  );
  assert.equal(reconciledState.state?.program_id, 'RMEP-001');
  assert.equal(reconciledState.state?.program_status, 'COMPLETED_WITH_EVIDENCE');

  // Verify secret rejection in declarative state
  if (reconciledState.state) {
    const poisonedCheck = validateRmepExecutionState({
      ...reconciledState.state,
      pending_authorization: ['AIzaSyFakeSecretKey12345678901234567890'],
    });
    assert.equal(poisonedCheck.valid, false);
    assert.ok(poisonedCheck.reasons.some((r: string) => r.includes('never contain secrets')));
  }

  console.log('PASS: All Gold Master Cloud, AI & Digital Commerce Architecture + RMEP-001 checks succeeded.');
}

runTests().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});


import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type ForensicComponentStatus =
  | 'PRESENT_IN_SOURCE'
  | 'DECLARED_IN_CONFIGURATION'
  | 'ACCOUNT_CONFIGURED'
  | 'DEPLOYED'
  | 'TESTED'
  | 'PREVIEW_VERIFIED'
  | 'STAGING_VERIFIED'
  | 'PRODUCTION_VERIFIED'
  | 'BLOCKED'
  | 'UNVERIFIABLE';

export type ReplaceabilityClassification =
  | 'VERIFIED_REPLACEABLE'
  | 'ARCHITECTURALLY_PREPARED'
  | 'PARTIALLY_REPLACEABLE'
  | 'PROVIDER_LOCKED'
  | 'UNVERIFIED';

export type CloudflareDiscoveryStatus =
  | 'DISCOVERED'
  | 'RELEVANCE_ASSESSED'
  | 'NOT_CURRENTLY_NEEDED'
  | 'ARCHITECTURAL_PREPARATION_COMPLETE'
  | 'IMPLEMENTATION_IN_PROGRESS'
  | 'IMPLEMENTED_IN_SOURCE'
  | 'ACCOUNT_CONFIGURED'
  | 'DEPLOYED'
  | 'PREVIEW_VERIFIED'
  | 'PRODUCTION_VERIFIED'
  | 'BLOCKED'
  | 'DEPRECATED_OR_SUPERSEDED';

export type CloudflareAdoptionDecision =
  | 'ADOPT_NOW'
  | 'PREPARE_A_MINIMAL_BOUNDARY'
  | 'DEFER'
  | 'RETAIN_EXISTING_IMPLEMENTATION'
  | 'REJECT_WITH_EVIDENCE';

export interface FiveDimensionPortabilityAssessment {
  componentId: string;
  componentNameFa: string;
  primaryProvider: string;
  verifiedAlternatives: string[];
  forensicStatuses: ForensicComponentStatus[];
  dimensions: {
    codePortability: 'PORTABLE_WEB_STANDARD' | 'NODE_RUNTIME_REQUIRED' | 'PROVIDER_SDK_COUPLED';
    dataPortability: 'PORTABLE_JSON_OR_S3_CHECKSUM' | 'SCHEMA_MAPPING_REQUIRED';
    operationalPortability: 'STANDARD_HTTP_PROBES_AND_ENV' | 'MANAGED_CONTROL_PLANE';
    protocolPortability: 'STANDARD_REST_JSON_AND_X402' | 'PROPRIETARY_REALTIME_LISTENER';
    migrationPortability: 'LOW_RISK_HOT_SWAP' | 'MEDIUM_EFFORT_ADAPTER_SWAP';
  };
  classification: ReplaceabilityClassification;
  verificationEvidence: string;
}

export interface CloudflareCapabilityRecord {
  id: string;
  officialProductName: string;
  category: string;
  purpose: string;
  radarTehranUseCase: string;
  maturity: 'GA' | 'BETA' | 'EMERGING_STANDARD';
  accountAndPlanRequirements: string;
  geographicEligibilityNote: string;
  limitsAndFailureModes: string;
  officialCostBaseline: string;
  dataOwnership: string;
  replacementOptions: string[];
  officialDocsUrl: string;
  verificationDate: string;
  status: CloudflareDiscoveryStatus;
  adoptionDecision: CloudflareAdoptionDecision;
}

export const FORENSIC_PORTABILITY_MATRIX: readonly FiveDimensionPortabilityAssessment[] = [
  {
    componentId: 'hedonic_and_proptech_engines',
    componentNameFa: 'موتور ارزش‌گذاری هدانیک و محاسبه‌گرهای ملکی',
    primaryProvider: 'Pure TypeScript (src/data/hedonicPricingEngine.ts)',
    verifiedAlternatives: ['Node.js', 'Cloudflare Workers', 'Bun', 'Deno', 'Browser WebWorker'],
    forensicStatuses: ['PRESENT_IN_SOURCE', 'TESTED', 'PREVIEW_VERIFIED'],
    dimensions: {
      codePortability: 'PORTABLE_WEB_STANDARD',
      dataPortability: 'PORTABLE_JSON_OR_S3_CHECKSUM',
      operationalPortability: 'STANDARD_HTTP_PROBES_AND_ENV',
      protocolPortability: 'STANDARD_REST_JSON_AND_X402',
      migrationPortability: 'LOW_RISK_HOT_SWAP',
    },
    classification: 'VERIFIED_REPLACEABLE',
    verificationEvidence: 'tests/hedonic-and-627-debug.test.ts (zero external runtime or vendor imports)',
  },
  {
    componentId: 'object_and_media_storage',
    componentNameFa: 'ذخیره‌سازی تصاویر WebP و ویدیوهای املاک',
    primaryProvider: 'Local Atomic Bucket + ArvanCloud S3 SigV4',
    verifiedAlternatives: ['Cloudflare R2', 'AWS S3', 'MinIO', 'PortableMemoryStorageAdapter'],
    forensicStatuses: ['PRESENT_IN_SOURCE', 'DECLARED_IN_CONFIGURATION', 'TESTED', 'PREVIEW_VERIFIED'],
    dimensions: {
      codePortability: 'PORTABLE_WEB_STANDARD',
      dataPortability: 'PORTABLE_JSON_OR_S3_CHECKSUM',
      operationalPortability: 'STANDARD_HTTP_PROBES_AND_ENV',
      protocolPortability: 'STANDARD_REST_JSON_AND_X402',
      migrationPortability: 'LOW_RISK_HOT_SWAP',
    },
    classification: 'VERIFIED_REPLACEABLE',
    verificationEvidence: 'src/utils/serverStoragePortabilityAndTracing.ts & tests/object-storage-security.test.ts',
  },
  {
    componentId: 'map_tile_delivery',
    componentNameFa: 'تایل‌های نقشه تعاملی و مسیریابی محلات',
    primaryProvider: 'Neshan Tile Server + Express OSM Proxy',
    verifiedAlternatives: ['OpenStreetMap Proxy (/api/osm-tile)', 'Cloudflare CDN Cached XYZ Tiles'],
    forensicStatuses: ['PRESENT_IN_SOURCE', 'TESTED', 'PREVIEW_VERIFIED'],
    dimensions: {
      codePortability: 'PORTABLE_WEB_STANDARD',
      dataPortability: 'PORTABLE_JSON_OR_S3_CHECKSUM',
      operationalPortability: 'STANDARD_HTTP_PROBES_AND_ENV',
      protocolPortability: 'STANDARD_REST_JSON_AND_X402',
      migrationPortability: 'LOW_RISK_HOT_SWAP',
    },
    classification: 'VERIFIED_REPLACEABLE',
    verificationEvidence: 'tests/neshan-osm-fallback.test.ts',
  },
  {
    componentId: 'ai_inference_and_gateway',
    componentNameFa: 'موتور هوش مصنوعی و مسیریابی مدل‌ها',
    primaryProvider: 'Google Gemini SDK + Local Deterministic Engine',
    verifiedAlternatives: ['Cloudflare AI Gateway', 'Cloudflare Workers AI', 'Local Deterministic Rule Engine'],
    forensicStatuses: ['PRESENT_IN_SOURCE', 'TESTED', 'PREVIEW_VERIFIED'],
    dimensions: {
      codePortability: 'PORTABLE_WEB_STANDARD',
      dataPortability: 'PORTABLE_JSON_OR_S3_CHECKSUM',
      operationalPortability: 'STANDARD_HTTP_PROBES_AND_ENV',
      protocolPortability: 'STANDARD_REST_JSON_AND_X402',
      migrationPortability: 'LOW_RISK_HOT_SWAP',
    },
    classification: 'VERIFIED_REPLACEABLE',
    verificationEvidence: 'src/utils/aiModelRegistryAndGateway.ts & src/utils/serverUtilityRoutes.ts',
  },
  {
    componentId: 'operational_cloud_database',
    componentNameFa: 'دیتابیس عملیاتی و همگام‌سازی زنده',
    primaryProvider: 'Google Cloud Firestore',
    verifiedAlternatives: ['Full JSON Snapshot Export/Restore', 'PostgreSQL', 'Cloudflare D1 (Analytical Read Replica)'],
    forensicStatuses: ['PRESENT_IN_SOURCE', 'DECLARED_IN_CONFIGURATION', 'ACCOUNT_CONFIGURED', 'TESTED'],
    dimensions: {
      codePortability: 'PROVIDER_SDK_COUPLED',
      dataPortability: 'PORTABLE_JSON_OR_S3_CHECKSUM',
      operationalPortability: 'MANAGED_CONTROL_PLANE',
      protocolPortability: 'PROPRIETARY_REALTIME_LISTENER',
      migrationPortability: 'MEDIUM_EFFORT_ADAPTER_SWAP',
    },
    classification: 'PARTIALLY_REPLACEABLE',
    verificationEvidence: 'firestore.rules & Admin Full JSON Backup/Restore',
  },
];

export const CLOUDFLARE_CAPABILITY_REGISTRY: readonly CloudflareCapabilityRecord[] = [
  {
    id: 'cf_r2_storage',
    officialProductName: 'Cloudflare R2',
    category: 'Object Storage',
    purpose: 'S3-compatible object storage with zero egress fees',
    radarTehranUseCase: 'ذخیره تصاویر بهینه‌شده WebP (<=800px) و ویدیوهای آگهی‌های شکار بدون هزینه ترافیک خروجی',
    maturity: 'GA',
    accountAndPlanRequirements: 'Cloudflare account with R2 enabled (10 GB/mo free tier)',
    geographicEligibilityNote: 'Accessible globally via S3 SigV4 HTTPS endpoint',
    limitsAndFailureModes: 'Max 5 TB per object; S3 SigV4 compatible',
    officialCostBaseline: '$0.015 / GB-month storage, $0 egress',
    dataOwnership: 'Full object & metadata parity with local atomic index',
    replacementOptions: ['ArvanCloud Object Storage', 'Local .object-storage-bucket/', 'AWS S3', 'MinIO'],
    officialDocsUrl: 'https://developers.cloudflare.com/r2/',
    verificationDate: '2026-11-01',
    status: 'IMPLEMENTED_IN_SOURCE',
    adoptionDecision: 'ADOPT_NOW',
  },
  {
    id: 'cf_ai_gateway',
    officialProductName: 'Cloudflare AI Gateway',
    category: 'AI Governance & Observability',
    purpose: 'Unified routing, caching, rate limiting, and cost analytics for AI model requests',
    radarTehranUseCase: 'مسیریابی امن، کش پاسخ‌های تکراری و کنترل بودجه توکن برای Gemini و Workers AI',
    maturity: 'GA',
    accountAndPlanRequirements: 'Available on Cloudflare Free & Paid plans',
    geographicEligibilityNote: 'Edge proxy routes to configured upstream AI providers',
    limitsAndFailureModes: 'Requires Cloudflare account_id and gateway_id; falls back to direct SDK or local rules',
    officialCostBaseline: '$0 base gateway fee on Free/Paid plans',
    dataOwnership: 'Request telemetry metadata only; authoritative facts remain in Radar Tehran',
    replacementOptions: ['Direct @google/genai SDK + AiTokenUsageAndCostLedger'],
    officialDocsUrl: 'https://developers.cloudflare.com/ai-gateway/',
    verificationDate: '2026-11-01',
    status: 'IMPLEMENTED_IN_SOURCE',
    adoptionDecision: 'PREPARE_A_MINIMAL_BOUNDARY',
  },
  {
    id: 'cf_workers_ai',
    officialProductName: 'Cloudflare Workers AI',
    category: 'AI & Model Access',
    purpose: 'Serverless GPU inference on Cloudflare global network',
    radarTehranUseCase: 'تبدیل جست‌وجوی فارسی به فیلتر ساختاریافته و تحلیل متن با مدل‌های Llama 3.3 و BGE-M3',
    maturity: 'GA',
    accountAndPlanRequirements: 'Cloudflare Account + Workers AI API Token',
    geographicEligibilityNote: 'Runs on Cloudflare global GPU edge',
    limitsAndFailureModes: '10,000 Neurons/day free tier; never used to replace deterministic Hedonic math',
    officialCostBaseline: '$0.011 / 1,000 Neurons above free tier',
    dataOwnership: 'Stateless inference calls',
    replacementOptions: ['Google Gemini (gemini-2.5-flash)', 'Local Deterministic Rule Engine'],
    officialDocsUrl: 'https://developers.cloudflare.com/workers-ai/',
    verificationDate: '2026-11-01',
    status: 'IMPLEMENTED_IN_SOURCE',
    adoptionDecision: 'PREPARE_A_MINIMAL_BOUNDARY',
  },
  {
    id: 'cf_monetization_x402',
    officialProductName: 'Cloudflare Monetization Gateway / Pay Per Crawl (x402)',
    category: 'Monetization & Commerce',
    purpose: 'HTTP 402 Payment Required challenge and cryptographic settlement verification for AI agents and APIs',
    radarTehranUseCase: 'تحویل تجاری شاخص‌های قیمت محلات و ابزارهای MCP به ایجنت‌ها و مشتریان سازمانی',
    maturity: 'BETA',
    accountAndPlanRequirements: 'Cloudflare Beta enrollment + verified seller settlement account',
    geographicEligibilityNote: 'Live settlement blocked in sandbox/restricted regions; provider-independent x402 contract active',
    limitsAndFailureModes: 'HTTP 200 is not settlement proof; requires PAYMENT-SIGNATURE & PAYMENT-CONTEXT verification',
    officialCostBaseline: 'Beta / transaction-based settlement fee',
    dataOwnership: 'Separate simulated vs. authorized vs. settled ledgers in Radar Tehran',
    replacementOptions: ['Direct Enterprise API Entitlements', 'Contractual Billing', 'Alternative IPG'],
    officialDocsUrl: 'https://developers.cloudflare.com/agents/x402/',
    verificationDate: '2026-11-01',
    status: 'BLOCKED',
    adoptionDecision: 'PREPARE_A_MINIMAL_BOUNDARY',
  },
  {
    id: 'cf_vectorize',
    officialProductName: 'Cloudflare Vectorize',
    category: 'Search & Vector Capabilities',
    purpose: 'Distributed vector database for embeddings',
    radarTehranUseCase: 'جست‌وجوی معنایی محلات (فعلاً نیازی نیست چون ۳۹۲ محله در کمتر از ۲ مگابایت حافظه پردازش می‌شوند)',
    maturity: 'GA',
    accountAndPlanRequirements: 'Workers Paid plan ($5/mo)',
    geographicEligibilityNote: 'Global Workers binding',
    limitsAndFailureModes: 'Adds network hop compared to in-memory grounded neighborhood selector',
    officialCostBaseline: '$0.01 / 1M queried vector dimensions',
    dataOwnership: 'Derived vector indexes',
    replacementOptions: ['selectGroundedAiNeighborhoodContext (in-memory deterministic filter)'],
    officialDocsUrl: 'https://developers.cloudflare.com/vectorize/',
    verificationDate: '2026-11-01',
    status: 'NOT_CURRENTLY_NEEDED',
    adoptionDecision: 'REJECT_WITH_EVIDENCE',
  },
];

export function evaluateCloudflareRuntimePortability(
  env: Record<string, string | undefined> = process.env,
  areaUnit?: AreaUnit,
  intlCurrency?: IntlCurrencyCode,
) {
  const cfAccountConfigured = Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN);
  const aiGatewayConfigured = Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_GATEWAY_ID);
  const r2Configured =
    (env.OBJECT_STORAGE_PROVIDER || '').toLowerCase() === 'r2' &&
    Boolean(env.OBJECT_STORAGE_ACCESS_KEY && env.OBJECT_STORAGE_SECRET_KEY);
  const resolvedUnit = areaUnit ?? getStoredAreaUnit();
  const resolvedCurrency = intlCurrency ?? getStoredIntlCurrency();

  return {
    verificationDate: '2026-11-01',
    supportedDeploymentModels: [
      'A_CLOUDFLARE_CENTRIC',
      'B_SPLIT_HOSTING',
      'C_EXTERNAL_BACKEND_WITH_CLOUDFLARE_EDGE',
      'D_PARTIAL_CLOUDFLARE_REPLACEMENT',
      'E_COMPLETE_HOSTING_MIGRATION',
    ] as const,
    activeRecommendedModel: 'C_EXTERNAL_BACKEND_WITH_CLOUDFLARE_EDGE' as const,
    accountBindingsStatus: {
      cloudflareAccountConfigured: cfAccountConfigured ? 'ACCOUNT_CONFIGURED' : 'BLOCKED',
      aiGatewayConfigured: aiGatewayConfigured ? 'ACCOUNT_CONFIGURED' : 'ARCHITECTURAL_PREPARATION_COMPLETE',
      r2StorageConfigured: r2Configured ? 'ACCOUNT_CONFIGURED' : 'ARCHITECTURAL_PREPARATION_COMPLETE',
    },
    portabilityMatrix: FORENSIC_PORTABILITY_MATRIX,
    capabilityRegistry: CLOUDFLARE_CAPABILITY_REGISTRY,
    displayAreaUnitLabel: formatAreaUnitLabel(resolvedUnit),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(14500, resolvedCurrency),
  };
}

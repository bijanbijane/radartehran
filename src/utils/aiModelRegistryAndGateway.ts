/**
 * @file src/utils/aiModelRegistryAndGateway.ts
 * @description Central AI Model Catalogue, Dynamic Routing Manager with Audit & Rollback, * Cloudflare AI Gateway URL Builder, Strict Preview Simulation Separation
 * (`SIMULATED — NOT A REAL AI RESPONSE`), and Validated Persian Housing Search Parser.
 *
 * Pure utility module (< 300 lines, zero React/UI imports).
 */
import { sanitizeInput, detectPromptInjection } from './security';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export const MANDATORY_AI_SIMULATION_BANNER = 'SIMULATED — NOT A REAL AI RESPONSE' as const;
export type AiHostingType = 'CLOUDFLARE_WORKERS_AI' | 'AI_GATEWAY_ROUTED' | 'DIRECT_EXTERNAL_PROVIDER' | 'LOCAL_DETERMINISTIC_SIMULATION';
export type RadarAiWorkflowId = 'intelligent_search' | 'contract_legal_analysis' | 'valuation_explanation' | 'data_extraction' | 'market_assistant';
export interface OfficialAiModelRecord {
  modelId: string; displayName: string; provider: 'Google DeepMind' | 'Meta (Workers AI)' | 'BAAI (Workers AI)' | 'Radar Tehran Internal'; hostingType: AiHostingType; modalities: readonly ('text' | 'image' | 'audio' | 'embeddings')[]; contextWindowTokens: number;
  maxOutputTokens: number; pricingInputPer1MUsd: number; pricingOutputPer1MUsd: number;
  maturity: 'GA' | 'PREVIEW' | 'DETERMINISTIC_LOCAL'; accountRequirements: string;
  knownLimitationsFa: string; verificationDate: string;
}
export const OFFICIAL_AI_MODEL_REGISTRY: readonly OfficialAiModelRecord[] = [
  { modelId: 'gemini-2.5-flash', displayName: 'Google Gemini 2.5 Flash', provider: 'Google DeepMind', hostingType: 'DIRECT_EXTERNAL_PROVIDER', modalities: ['text', 'image', 'audio'], contextWindowTokens: 1_048_576, maxOutputTokens: 8_192, pricingInputPer1MUsd: 0.10, pricingOutputPer1MUsd: 0.40, maturity: 'GA', accountRequirements: 'Requires GEMINI_API_KEY on server (or Cloudflare AI Gateway route)', knownLimitationsFa: 'نیازمند کلید سرور؛ هرگز نباید جایگزین فرمول قطعی هدانیک شود.', verificationDate: '2026-11-01' },
  { modelId: 'gemini-3-flash-preview', displayName: 'Google Gemini 3 Flash Preview', provider: 'Google DeepMind', hostingType: 'AI_GATEWAY_ROUTED', modalities: ['text', 'image', 'audio'], contextWindowTokens: 1_048_576, maxOutputTokens: 8_192, pricingInputPer1MUsd: 0.15, pricingOutputPer1MUsd: 0.60, maturity: 'PREVIEW', accountRequirements: 'Requires GEMINI_API_KEY + optional Cloudflare AI Gateway', knownLimitationsFa: 'نسخه پیش‌نمایش؛ نیازمند اعتبارسنجی خروجی عددی.', verificationDate: '2026-11-01' },
  { modelId: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', displayName: 'Meta Llama 3.3 70B Instruct FP8 Fast (Workers AI)', provider: 'Meta (Workers AI)', hostingType: 'CLOUDFLARE_WORKERS_AI', modalities: ['text'], contextWindowTokens: 128_000, maxOutputTokens: 4_096, pricingInputPer1MUsd: 0.29, pricingOutputPer1MUsd: 2.25, maturity: 'GA', accountRequirements: 'Requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN', knownLimitationsFa: 'فقط متنی؛ خروجی فارسی نیازمند بررسی تطابق اعداد با دیتاست محلات است.', verificationDate: '2026-11-01' },
  {
    modelId: '@cf/meta/llama-3.1-8b-instruct',
    displayName: 'Meta Llama 3.1 8B Instruct (Workers AI)',
    provider: 'Meta (Workers AI)',
    hostingType: 'CLOUDFLARE_WORKERS_AI',
    modalities: ['text'],
    contextWindowTokens: 128_000,
    maxOutputTokens: 2_048,
    pricingInputPer1MUsd: 0.05,
    pricingOutputPer1MUsd: 0.20,
    maturity: 'GA',
    accountRequirements: 'Cloudflare Workers AI Free/Paid tier (10k Neurons/day free)',
    knownLimitationsFa: 'مناسب استخراج فیلتر سریع؛ برای تحلیل حقوقی پیچیده توصیه نمی‌شود.',
    verificationDate: '2026-11-01',
  },
  {
    modelId: '@cf/baai/bge-m3',
    displayName: 'BAAI BGE-M3 Multilingual Embeddings (Workers AI)',
    provider: 'BAAI (Workers AI)',
    hostingType: 'CLOUDFLARE_WORKERS_AI',
    modalities: ['embeddings'],
    contextWindowTokens: 8_192,
    maxOutputTokens: 1_024,
    pricingInputPer1MUsd: 0.012,
    pricingOutputPer1MUsd: 0,
    maturity: 'GA',
    accountRequirements: 'Cloudflare Workers AI binding/token',
    knownLimitationsFa: 'صرفاً تولید بردار (Embedding) چندزبانه؛ مدل تولید متن نیست.',
    verificationDate: '2026-11-01',
  },
  {
    modelId: 'local-deterministic-rule-engine-v1',
    displayName: 'موتور قواعد قطعی داخلی رادار تهران (Deterministic Fallback)',
    provider: 'Radar Tehran Internal',
    hostingType: 'LOCAL_DETERMINISTIC_SIMULATION',
    modalities: ['text'],
    contextWindowTokens: 32_000,
    maxOutputTokens: 2_000,
    pricingInputPer1MUsd: 0,
    pricingOutputPer1MUsd: 0,
    maturity: 'DETERMINISTIC_LOCAL',
    accountRequirements: 'None (Always available offline & in preview)',
    knownLimitationsFa: 'پاسخ مبتنی بر قواعد قطعی است و با برچسب SIMULATED مشخص می‌شود.',
    verificationDate: '2026-11-01',
  },
];
export interface WorkflowRoutingConfig {
  version: number;
  updatedAtIso: string;
  updatedByAdmin: string;
  aiGatewayEnabled: boolean;
  routes: Record<RadarAiWorkflowId, string>;
}
export interface RoutingAuditEntry {
  version: number;
  timestampIso: string;
  actor: string;
  action: 'UPDATE_ROUTING' | 'ROLLBACK_ROUTING';
  summaryFa: string;
}
const DEFAULT_ROUTES: Record<RadarAiWorkflowId, string> = {
  intelligent_search: 'gemini-2.5-flash',
  contract_legal_analysis: 'gemini-2.5-flash',
  valuation_explanation: 'gemini-2.5-flash',
  data_extraction: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  market_assistant: 'gemini-2.5-flash',
};
export class AiModelRoutingManager {
  private current: WorkflowRoutingConfig = {
    version: 1,
    updatedAtIso: '2026-11-01T00:00:00.000Z',
    updatedByAdmin: 'system-bootstrap',
    aiGatewayEnabled: false,
    routes: { ...DEFAULT_ROUTES },
  };
  private previousSnapshot: WorkflowRoutingConfig | null = null;
  private readonly auditTrail: RoutingAuditEntry[] = [];
  getCurrentConfig(): WorkflowRoutingConfig {
    return { ...this.current, routes: { ...this.current.routes } };
  }
  getAuditTrail(): RoutingAuditEntry[] {
    return [...this.auditTrail];
  }
  updateRouting(params: {
    actorEmail: string;
    aiGatewayEnabled?: boolean;
    routes?: Partial<Record<RadarAiWorkflowId, string>>;
  }): WorkflowRoutingConfig {
    const cleanActor = sanitizeInput(params.actorEmail || '', 120);
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(cleanActor)) {
      throw new Error('ADMIN_AUTHORIZATION_REQUIRED_FOR_AI_ROUTING');
    }
    const validIds = new Set(OFFICIAL_AI_MODEL_REGISTRY.map((m) => m.modelId));
    const nextRoutes: Record<RadarAiWorkflowId, string> = { ...this.current.routes };
    if (params.routes) {
      for (const [wf, modelId] of Object.entries(params.routes) as [RadarAiWorkflowId, string][]) {
        if (!Object.prototype.hasOwnProperty.call(nextRoutes, wf)) {
          throw new Error(`UNKNOWN_AI_WORKFLOW: ${wf}`);
        }
        if (!validIds.has(modelId)) {
          throw new Error(`UNVERIFIED_MODEL_IDENTIFIER: ${modelId}`);
        }
        nextRoutes[wf] = modelId;
      }
    }
    this.previousSnapshot = this.getCurrentConfig();
    this.current = {
      version: this.current.version + 1,
      updatedAtIso: new Date().toISOString(),
      updatedByAdmin: cleanActor,
      aiGatewayEnabled: params.aiGatewayEnabled ?? this.current.aiGatewayEnabled,
      routes: nextRoutes,
    };
    this.auditTrail.unshift({
      version: this.current.version,
      timestampIso: this.current.updatedAtIso,
      actor: cleanActor,
      action: 'UPDATE_ROUTING',
      summaryFa: `بروزرسانی مسیریابی مدل‌های هوش مصنوعی به نسخه v${this.current.version} توسط ${cleanActor}`,
    });
    if (this.auditTrail.length > 500) this.auditTrail.length = 500;
    return this.getCurrentConfig();
  }
  rollbackToPreviousConfig(actorEmail: string): WorkflowRoutingConfig {
    const cleanActor = sanitizeInput(actorEmail || '', 120);
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(cleanActor)) {
      throw new Error('ADMIN_AUTHORIZATION_REQUIRED_FOR_AI_ROLLBACK');
    }
    if (!this.previousSnapshot) {
      throw new Error('NO_PREVIOUS_AI_ROUTING_CONFIG_TO_ROLLBACK');
    }
    const restored: WorkflowRoutingConfig = {
      ...this.previousSnapshot,
      version: this.current.version + 1,
      updatedAtIso: new Date().toISOString(),
      updatedByAdmin: cleanActor,
    };
    this.previousSnapshot = null;
    this.current = restored;
    this.auditTrail.unshift({
      version: this.current.version,
      timestampIso: this.current.updatedAtIso,
      actor: cleanActor,
      action: 'ROLLBACK_ROUTING',
      summaryFa: `بازگشت (Rollback) تنظیمات مسیریابی هوش مصنوعی به آخرین نسخه تاییدشده توسط ${cleanActor}`,
    });
    if (this.auditTrail.length > 500) this.auditTrail.length = 500;
    return this.getCurrentConfig();
  }
}
export const globalAiRoutingManager = new AiModelRoutingManager();
export function buildCloudflareAiGatewayEndpoint(params: {
  accountId?: string;
  gatewayId?: string;
  provider: 'google-ai-studio' | 'workers-ai';
  modelId: string;
}): { configured: boolean; endpointUrl: string | null; redactedPreviewUrl: string } {
  const cleanAccount = (params.accountId || '').trim();
  const cleanGateway = (params.gatewayId || '').trim();
  const cleanModel = (params.modelId || '').trim();
  const isModelValid = /^[@a-zA-Z0-9._/-]{2,80}$/.test(cleanModel) && !cleanModel.includes('..') && !cleanModel.startsWith('/');
  const safeModelLabel = isModelValid ? cleanModel : 'invalid-model-id';
  const safePath =
    params.provider === 'workers-ai'
      ? `workers-ai/${safeModelLabel}`
      : `google-ai-studio/v1beta/models/${safeModelLabel}:generateContent`;
  if (!isModelValid || !/^[a-f0-9]{32}$/i.test(cleanAccount) || !/^[a-zA-Z0-9_-]{2,64}$/.test(cleanGateway)) {
    return {
      configured: false,
      endpointUrl: null,
      redactedPreviewUrl: `https://gateway.ai.cloudflare.com/v1/[ACCOUNT_ID_UNSET]/[GATEWAY_ID_UNSET]/${safePath}`,
    };
  }
  return {
    configured: true,
    endpointUrl: `https://gateway.ai.cloudflare.com/v1/${cleanAccount}/${cleanGateway}/${safePath}`,
    redactedPreviewUrl: `https://gateway.ai.cloudflare.com/v1/••••${cleanAccount.slice(-4)}/${cleanGateway}/${safePath}`,
  };
}
export interface StructuredPersianHousingQuery {
  cityId: 'tehran' | 'karaj' | 'mashhad' | 'isfahan' | 'shiraz';
  dealMode: 'buy' | 'rent';
  maxBuyPerSqmMillions: number | null;
  maxRahnMillions: number | null;
  targetZone: number | null;
  positiveGrowthOnly: boolean;
  mentionedHoodKeywords: string[];
  injectionBlocked: boolean;
  isSimulated: boolean;
  simulationBanner: typeof MANDATORY_AI_SIMULATION_BANNER | null;
  resolvedModelId: string;
  displayAreaUnitLabel?: string;
  maxBudgetIntlText?: string;
}
export function parseNaturalPersianHousingQuery(
  rawQuery: string,
  options?: { isLiveModelVerified?: boolean; modelId?: string; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode }
): StructuredPersianHousingQuery {
  const clean = sanitizeInput(rawQuery || '', 400);
  const normalizedDigits = clean.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/(\d)[٬،,](?=\d)/g, '$1').replace(/٫/g, '.');
  const injection = detectPromptInjection(normalizedDigits);
  const cityId: StructuredPersianHousingQuery['cityId'] = normalizedDigits.includes('کرج') ? 'karaj' : normalizedDigits.includes('مشهد') ? 'mashhad' : normalizedDigits.includes('اصفهان') ? 'isfahan' : normalizedDigits.includes('شیراز') ? 'shiraz' : 'tehran';
  const dealMode: 'buy' | 'rent' = /(رهن|اجاره|ودیعه)/.test(normalizedDigits) ? 'rent' : 'buy';
  const zoneMatch = /منطقه\s*(\d{1,2})/.exec(normalizedDigits);
  const targetZone = zoneMatch ? Math.min(22, Math.max(1, Number(zoneMatch[1]))) : null;
  const billionMatch = /(?:تا|زیر|حداکثر)\s*(\d+(?:\.\d+)?)\s*میلیارد/.exec(normalizedDigits);
  const priceMatch = /(?:تا|زیر|حداکثر|متری)\s*(\d{2,4})\s*(?:میلیون)?/.exec(normalizedDigits);
  const extractedVal = billionMatch ? Math.round(Number(billionMatch[1]) * 1000) : priceMatch ? Number(priceMatch[1]) : null;
  const positiveGrowthOnly = /(رشد\s*مثبت|رو\s*به\s*رشد|بازدهی\s*بالا)/.test(normalizedDigits);
  const knownKeywords = ['پونک', 'جنت‌آباد', 'سعادت‌آباد', 'ونک', 'تهرانپارس', 'نارمک', 'پیروزی', 'اکباتان', 'مرزداران', 'الهیه'];
  const spaceNormalizedQuery = normalizedDigits.replace(/\u200c/g, ' ').replace(/\s+/g, ' ');
  const mentionedHoodKeywords = knownKeywords.filter((kw) => normalizedDigits.includes(kw) || spaceNormalizedQuery.includes(kw.replace(/\u200c/g, ' ')));
  const isSimulated = options?.isLiveModelVerified !== true;
  const resolvedUnit = options?.areaUnit ?? getStoredAreaUnit();
  const resolvedCurrency = options?.intlCurrency ?? getStoredIntlCurrency();
  const maxBuyPerSqmMillions = dealMode === 'buy' && extractedVal ? Math.min(1500, Math.max(20, billionMatch ? Math.round(extractedVal / 85) : extractedVal)) : null;
  const maxRahnMillions = dealMode === 'rent' && extractedVal ? Math.min(10000, Math.max(100, extractedVal)) : null;
  const verifiedRegistryId = options?.modelId && OFFICIAL_AI_MODEL_REGISTRY.some((m) => m.modelId === options.modelId)
    ? options.modelId
    : globalAiRoutingManager.getCurrentConfig().routes.intelligent_search;
  return {
    cityId, dealMode, maxBuyPerSqmMillions, maxRahnMillions, targetZone, positiveGrowthOnly, mentionedHoodKeywords,
    injectionBlocked: injection.blocked, isSimulated,
    simulationBanner: isSimulated ? MANDATORY_AI_SIMULATION_BANNER : null,
    resolvedModelId: isSimulated ? 'local-deterministic-rule-engine-v1' : verifiedRegistryId,
    displayAreaUnitLabel: formatAreaUnitLabel(resolvedUnit),
    maxBudgetIntlText: formatMillionTomanAsIntlCurrency(maxBuyPerSqmMillions ?? maxRahnMillions ?? 180, resolvedCurrency),
  };
}
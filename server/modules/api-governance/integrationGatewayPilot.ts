/** @file server/modules/api-governance/integrationGatewayPilot.ts — Stage 26 Integration Gateway Pilot Extending ssrfGuard */
import crypto from 'node:crypto';
import { validateWebhookDestinationUrl } from './ssrfGuard';

export type ExternalProviderLifecycle = 'PENDING' | 'SANDBOX_ACTIVE' | 'LIMITED_PROD' | 'SUSPENDED' | 'REVOKED';

export interface ExternalProviderRegistryEntry {
  providerId: string;
  nameFa: string;
  lifecycle: ExternalProviderLifecycle;
  baseEndpointUrl: string;
  allowedMimeTypes: string[];
  maxPayloadBytes: number;
  maxRedirects: number;
  requiresTls: boolean;
  secretRefAlias: string;
  lastRotatedAtIso: string;
  rateLimitPerMinute: number;
  circuitState: 'CLOSED' | 'OPEN';
  consecutiveFailures: number;
}

export interface NormalizedGatewayEnvelope {
  envelopeId: string;
  providerId: string;
  retrievedAtIso: string;
  observedAtIso: string;
  mimeType: string;
  payloadBytes: number;
  sandboxMode: boolean;
  data: Record<string, unknown>;
}

export class IntegrationGatewayPilotService {
  private readonly providers: ExternalProviderRegistryEntry[] = [
    {
      providerId: 'mock-openmeteo-air',
      nameFa: 'درگاه سندباکس کیفیت هوا و اقلیم',
      lifecycle: 'SANDBOX_ACTIVE',
      baseEndpointUrl: 'https://api.open-meteo.com/v1/forecast',
      allowedMimeTypes: ['application/json'],
      maxPayloadBytes: 256 * 1024,
      maxRedirects: 0,
      requiresTls: true,
      secretRefAlias: 'SECRET_META_OPENMETEO_NONE',
      lastRotatedAtIso: '2026-11-01T00:00:00.000Z',
      rateLimitPerMinute: 60,
      circuitState: 'CLOSED',
      consecutiveFailures: 0,
    },
    {
      providerId: 'mock-listing-feed',
      nameFa: 'تامین‌کننده آزمایشی آگهی تاییدشده (Sandbox)',
      lifecycle: 'SANDBOX_ACTIVE',
      baseEndpointUrl: 'https://sandbox-partner.example.ir/listings',
      allowedMimeTypes: ['application/json'],
      maxPayloadBytes: 512 * 1024,
      maxRedirects: 0,
      requiresTls: true,
      secretRefAlias: 'SECRET_META_SANDBOX_PARTNER_V1',
      lastRotatedAtIso: '2026-11-10T00:00:00.000Z',
      rateLimitPerMinute: 30,
      circuitState: 'CLOSED',
      consecutiveFailures: 0,
    },
  ];

  validateOutboundRequestContract(params: {
    providerId: string;
    targetUrl: string;
    mimeType?: string;
    payloadBytes?: number;
    redirectCount?: number;
  }): { allowed: boolean; reasonFa?: string; normalizedUrl?: string } {
    const provider = this.providers.find((p) => p.providerId === params.providerId);
    if (!provider) return { allowed: false, reasonFa: 'تامین‌کننده در رجیستری ثبت نشده است.' };
    if (provider.lifecycle === 'SUSPENDED' || provider.lifecycle === 'REVOKED' || provider.lifecycle === 'PENDING') {
      return { allowed: false, reasonFa: `وضعیت تامین‌کننده (${provider.lifecycle}) مجاز به ارسال درخواست نیست.` };
    }
    if (provider.circuitState === 'OPEN') {
      return { allowed: false, reasonFa: 'مدار حفاظتی (Circuit Breaker) برای این تامین‌کننده باز است.' };
    }

    const ssrf = validateWebhookDestinationUrl(params.targetUrl, {
      environment: 'production',
      allowHttpInDevelopment: !provider.requiresTls,
    });
    if (!ssrf.valid) {
      return { allowed: false, reasonFa: ssrf.rejectionReason || 'خطای امنیتی SSRF' };
    }
    if ((params.redirectCount ?? 0) > provider.maxRedirects) {
      return { allowed: false, reasonFa: 'تغییر مسیر (Redirect) خروجی برای این تامین‌کننده مسدود است.' };
    }
    if (params.mimeType && !provider.allowedMimeTypes.includes(params.mimeType)) {
      return { allowed: false, reasonFa: 'نوع رسانه (MIME Type) پاسخ خارج از فهرست مجاز است.' };
    }
    if (typeof params.payloadBytes === 'number' && params.payloadBytes > provider.maxPayloadBytes) {
      return { allowed: false, reasonFa: 'حجم پاسخ از سقف مجاز درگاه بیشتر است.' };
    }
    return { allowed: true, normalizedUrl: ssrf.normalizedUrl };
  }

  executeSandboxPilotCall(providerId: string, observedAtIso?: string): {
    ok: boolean;
    reasonFa?: string;
    envelope?: NormalizedGatewayEnvelope;
  } {
    const provider = this.providers.find((p) => p.providerId === providerId);
    if (!provider) return { ok: false, reasonFa: 'تامین‌کننده یافت نشد.' };
    const check = this.validateOutboundRequestContract({
      providerId,
      targetUrl: provider.baseEndpointUrl,
      mimeType: 'application/json',
      payloadBytes: 512,
      redirectCount: 0,
    });
    if (!check.allowed) return { ok: false, reasonFa: check.reasonFa };

    const nowIso = new Date().toISOString();
    return {
      ok: true,
      envelope: {
        envelopeId: `gw_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
        providerId,
        retrievedAtIso: nowIso,
        observedAtIso: observedAtIso || nowIso,
        mimeType: 'application/json',
        payloadBytes: 256,
        sandboxMode: true,
        data: { hoodCode: 2, sampleMetricStatus: 'SANDBOX_MOCK_ONLY' },
      },
    };
  }

  listProvidersSanitized() {
    return this.providers.map((p) => ({
      providerId: p.providerId,
      nameFa: p.nameFa,
      lifecycle: p.lifecycle,
      baseEndpointUrl: p.baseEndpointUrl,
      secretRefAlias: p.secretRefAlias,
      secretValueExposed: false,
      lastRotatedAtIso: p.lastRotatedAtIso,
      circuitState: p.circuitState,
      rateLimitPerMinute: p.rateLimitPerMinute,
    }));
  }
}

export const defaultIntegrationGatewayPilot = new IntegrationGatewayPilotService();

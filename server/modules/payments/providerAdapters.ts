import type {
  PaymentProviderAdapter,
  ProviderInitiateResult,
  ProviderVerifyResult,
} from './types';

/**
 * Fallback provider adapter when no payment gateway credentials or endpoints
 * are configured in the environment.
 * Strictly avoids inventing successful payment flows or falsifying transaction references.
 */
export class UnavailablePaymentProviderAdapter implements PaymentProviderAdapter {
  public readonly providerId = 'unavailable_provider';

  async initiatePayment(): Promise<ProviderInitiateResult> {
    return {
      ok: false,
      failureReason: 'No real payment gateway is configured in the environment.',
      normalizedErrorCode: 'PROVIDER_NOT_CONFIGURED',
    };
  }

  async verifyPayment(): Promise<ProviderVerifyResult> {
    return {
      verified: false,
      providerTxRef: 'none',
      amount: 0,
      currency: 'IRT',
      failureReason: 'Payment provider unavailable in this environment.',
      normalizedErrorCode: 'PROVIDER_NOT_CONFIGURED',
    };
  }

  async verifyCallbackSignature(): Promise<{ valid: boolean; reason?: string }> {
    return { valid: false, reason: 'Provider adapter is unconfigured.' };
  }

  async lookupTransaction(): Promise<{ found: boolean; status: 'failed'; amount?: number }> {
    return { found: false, status: 'failed' };
  }

  async executeRefund(): Promise<{ ok: boolean; failureReason?: string }> {
    return { ok: false, failureReason: 'Refund provider unavailable.' };
  }

  normalizeError(): string {
    return 'PROVIDER_NOT_CONFIGURED';
  }
}

export function resolvePaymentProvider(params: {
  requestedProviderId?: string | null;
  defaultProviderId?: string;
  adapters?: Map<string, PaymentProviderAdapter>;
  fallback: PaymentProviderAdapter;
}): PaymentProviderAdapter {
  const { requestedProviderId, defaultProviderId, adapters, fallback } = params;
  if (requestedProviderId && adapters?.has(requestedProviderId)) {
    return adapters.get(requestedProviderId)!;
  }
  if (defaultProviderId && adapters?.has(defaultProviderId)) {
    return adapters.get(defaultProviderId)!;
  }
  return fallback;
}

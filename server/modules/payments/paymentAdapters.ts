/**
 * @file server/modules/payments/paymentAdapters.ts
 * @description Provider-agnostic payment gateway adapters and callback verification interfaces.
 */

import crypto from 'node:crypto';
import type { PaymentCurrency } from './paymentTypes';

export interface InitiatePaymentParams {
  readonly intentId: string;
  readonly amount: number; // Integer minor units
  readonly currency: PaymentCurrency;
  readonly callbackUrl: string;
  readonly customerUid: string;
  readonly descriptionFa: string;
}

export interface InitiatePaymentResult {
  readonly success: boolean;
  readonly redirectUrl?: string;
  readonly providerTransactionReference?: string;
  readonly errorCode?: string;
  readonly errorMessageFa?: string;
}

export interface VerifyPaymentParams {
  readonly intentId: string;
  readonly providerTransactionReference: string;
  readonly expectedAmount: number;
  readonly expectedCurrency: PaymentCurrency;
  readonly rawCallbackPayload?: Record<string, unknown>;
}

export interface VerifyPaymentResult {
  readonly isSuccess: boolean;
  readonly verifiedAmount?: number;
  readonly verifiedCurrency?: PaymentCurrency;
  readonly providerRefId?: string;
  readonly cardMasked?: string;
  readonly errorCode?: string;
  readonly errorMessageFa?: string;
}

export interface ExecuteRefundParams {
  readonly refundId: string;
  readonly providerTransactionReference: string;
  readonly refundAmount: number;
  readonly currency: PaymentCurrency;
  readonly reasonFa: string;
}

export interface ExecuteRefundResult {
  readonly isSuccess: boolean;
  readonly providerRefundReference?: string;
  readonly errorCode?: string;
  readonly errorMessageFa?: string;
}

export interface PaymentProviderAdapter {
  readonly providerId: string;
  readonly isConfigured: boolean;
  initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult>;
  verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult>;
  executeRefund(params: ExecuteRefundParams): Promise<ExecuteRefundResult>;
}

/**
 * Truthful unavailable adapter used when no operational gateway credentials exist.
 */
export class UnavailablePaymentProviderAdapter implements PaymentProviderAdapter {
  public readonly providerId = 'UNAVAILABLE_GATEWAY';
  public readonly isConfigured = false;

  public async initiatePayment(): Promise<InitiatePaymentResult> {
    return {
      success: false,
      errorCode: 'GATEWAY_UNAVAILABLE',
      errorMessageFa: 'درگاه پرداخت بانکی در محیط توسعه پیکربندی نشده است.',
    };
  }

  public async verifyPayment(): Promise<VerifyPaymentResult> {
    return {
      isSuccess: false,
      errorCode: 'GATEWAY_UNAVAILABLE',
      errorMessageFa: 'امکان اعتبارسنجی تراکنش به دلیل عدم اتصال به درگاه میسر نیست.',
    };
  }

  public async executeRefund(): Promise<ExecuteRefundResult> {
    return {
      isSuccess: false,
      errorCode: 'GATEWAY_UNAVAILABLE',
      errorMessageFa: 'امکان استرداد وجه بانکی به دلیل عدم اتصال به درگاه میسر نیست.',
    };
  }
}

/**
 * Deterministic Mock Adapter for test suites.
 */
export class MockTestPaymentProviderAdapter implements PaymentProviderAdapter {
  public readonly providerId = 'MOCK_TEST_GATEWAY';
  public readonly isConfigured = true;
  private readonly transactions = new Map<string, { amount: number; currency: PaymentCurrency; verified: boolean }>();

  public setTransaction(ref: string, amount: number, currency: PaymentCurrency, verified: boolean): void {
    this.transactions.set(ref, { amount, currency, verified });
  }

  public async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const providerRef = `ptx_${crypto.randomBytes(6).toString('hex')}`;
    this.transactions.set(providerRef, {
      amount: params.amount,
      currency: params.currency,
      verified: true,
    });

    return {
      success: true,
      redirectUrl: `https://mock-gateway.local/pay/${providerRef}?callback=${encodeURIComponent(params.callbackUrl)}`,
      providerTransactionReference: providerRef,
    };
  }

  public async verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult> {
    const tx = this.transactions.get(params.providerTransactionReference);
    if (!tx) {
      return { isSuccess: false, errorCode: 'TX_NOT_FOUND', errorMessageFa: 'تراکنش در درگاه یافت نشد.' };
    }

    if (tx.amount !== params.expectedAmount) {
      return {
        isSuccess: false,
        errorCode: 'AMOUNT_MISMATCH',
        errorMessageFa: `مبلغ پرداختی (${tx.amount}) با مبلغ سفارش (${params.expectedAmount}) مطابقت ندارد.`,
      };
    }

    if (tx.currency !== params.expectedCurrency) {
      return {
        isSuccess: false,
        errorCode: 'CURRENCY_MISMATCH',
        errorMessageFa: 'واحد پولی تراکنش مغایرت دارد.',
      };
    }

    return {
      isSuccess: tx.verified,
      verifiedAmount: tx.amount,
      verifiedCurrency: tx.currency,
      providerRefId: `bank_ref_${crypto.randomBytes(4).toString('hex')}`,
      cardMasked: '۶۰۳۷۹۹******۱۲۳۴',
    };
  }

  public async executeRefund(params: ExecuteRefundParams): Promise<ExecuteRefundResult> {
    const tx = this.transactions.get(params.providerTransactionReference);
    if (!tx) {
      return { isSuccess: false, errorCode: 'TX_NOT_FOUND' };
    }
    if (params.refundAmount > tx.amount) {
      return { isSuccess: false, errorCode: 'REFUND_EXCEEDS_PAYMENT' };
    }

    return {
      isSuccess: true,
      providerRefundReference: `ref_out_${crypto.randomBytes(6).toString('hex')}`,
    };
  }
}

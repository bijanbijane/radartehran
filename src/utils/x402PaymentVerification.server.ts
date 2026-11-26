/** @file src/utils/x402PaymentVerification.server.ts — Server-only HMAC verification and replay protection */
import crypto from 'node:crypto';
import { RADAR_COMMERCIAL_PRODUCTS } from './dataCommerceMcpAndMonetization';

const consumedX402ProofDigests = new Map<string, number>();
const X402_REPLAY_TTL_MS = 10 * 60 * 1000;

export function signX402PaymentContextForVerification(paymentContextJson: string, secretKey: string): string {
  return crypto.createHmac('sha256', secretKey).update(paymentContextJson).digest('hex');
}

export function resetX402ReplayCacheForTests(): void {
  consumedX402ProofDigests.clear();
}

export function verifyX402PaymentHeaders(params: {
  paymentContextHeader?: string;
  paymentSignatureHeader?: string;
  expectedProductId: string;
  verificationSecret?: string;
  nowMs?: number;
  allowReplayForTests?: boolean;
}): {
  verified: boolean;
  httpStatus: 200 | 402 | 503;
  failureCode?: 'PAYMENT_REQUIRED' | 'INVALID_PAYMENT_PROOF' | 'PAYMENT_REJECTED' | 'VERIFIER_UNCONFIGURED';
} {
  if (!params.paymentContextHeader || !params.paymentSignatureHeader) {
    return { verified: false, httpStatus: 402, failureCode: 'PAYMENT_REQUIRED' };
  }
  const rawSecret = (params.verificationSecret || process.env.X402_HMAC_SECRET || process.env.X402_SIGNING_SECRET || '').trim();
  const secret = (rawSecret.length >= 16 || process.env.NODE_ENV === 'test') ? rawSecret : '';
  if (!secret) return { verified: false, httpStatus: 503, failureCode: 'VERIFIER_UNCONFIGURED' };
  try {
    const decoded = Buffer.from(params.paymentContextHeader, 'base64').toString('utf-8');
    const expectedSig = signX402PaymentContextForVerification(decoded, secret);
    const sigBuf = Buffer.from(params.paymentSignatureHeader, 'utf-8');
    const expBuf = Buffer.from(expectedSig, 'utf-8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { verified: false, httpStatus: 402, failureCode: 'INVALID_PAYMENT_PROOF' };
    }
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    const expectedProduct = RADAR_COMMERCIAL_PRODUCTS.find((p) => p.productId === params.expectedProductId);
    const minRequiredMicros = expectedProduct ? expectedProduct.pricePerRequestUsdMicros : 1;
    const paidMicros = Number(parsed.amountUsdMicros);
    if (parsed.productId !== params.expectedProductId || !Number.isFinite(paidMicros) || paidMicros < minRequiredMicros) {
      return { verified: false, httpStatus: 402, failureCode: 'PAYMENT_REJECTED' };
    }
    const now = params.nowMs ?? Date.now();
    if (parsed.timestampIso !== undefined) {
      const tsMs = typeof parsed.timestampIso === 'string' ? Date.parse(parsed.timestampIso) : NaN;
      if (!Number.isFinite(tsMs) || now - tsMs > X402_REPLAY_TTL_MS || tsMs - now > 2 * 60 * 1000) {
        return { verified: false, httpStatus: 402, failureCode: 'PAYMENT_REJECTED' };
      }
    }
    if (!params.allowReplayForTests) {
      for (const [key, expiresAt] of consumedX402ProofDigests.entries()) {
        if (now >= expiresAt) consumedX402ProofDigests.delete(key);
      }
      const proofDigest = crypto.createHash('sha256')
        .update(`${params.paymentContextHeader}.${params.paymentSignatureHeader}`).digest('hex');
      const existingExpiry = consumedX402ProofDigests.get(proofDigest);
      if (existingExpiry && now < existingExpiry) {
        return { verified: false, httpStatus: 402, failureCode: 'PAYMENT_REJECTED' };
      }
      if (consumedX402ProofDigests.size >= 5000) {
        const oldest = consumedX402ProofDigests.keys().next().value;
        if (oldest) consumedX402ProofDigests.delete(oldest);
      }
      consumedX402ProofDigests.set(proofDigest, now + X402_REPLAY_TTL_MS);
    }
    return { verified: true, httpStatus: 200 };
  } catch {
    return { verified: false, httpStatus: 402, failureCode: 'INVALID_PAYMENT_PROOF' };
  }
}

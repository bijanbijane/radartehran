/** @file src/features/admin/services/trustSafetyApiClient.ts — Stage 5 Trust & Safety Moderation Lifecycle Admin Client */
import type { User } from 'firebase/auth';
import { createCommunityIdempotencyKey } from '../../community/services/communityApiClient';

export type TrustSafetyDecision = 'dismiss' | 'hide' | 'lock' | 'soft_delete' | 'warn_author' | 'escalate';

export interface TrustSafetyCaseItem {
  id: string;
  targetType: 'discussion_post' | 'question' | 'comment' | 'user';
  targetId: string;
  status: 'OPEN' | 'CLAIMED' | 'DECIDED' | 'ESCALATED' | 'APPEALED' | 'CLOSED';
  reportIds: string[];
  reportCount: number;
  claimedByUid: string | null;
  claimLeaseExpiresAtIso: string | null;
  lastDecision: TrustSafetyDecision | null;
  lastDecidedByUid: string | null;
  lastDecisionReasonFa: string | null;
  createdAtIso: string;
  updatedAtIso: string;
}

async function getBearerHeader(currentUser?: User | null): Promise<Record<string, string>> {
  if (!currentUser || typeof currentUser.getIdToken !== 'function') return {};
  try {
    const token = await currentUser.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export async function listTrustSafetyCases(
  currentUser?: User | null,
  statusFilter?: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; cases: TrustSafetyCaseItem[]; errorFa?: string }> {
  const auth = await getBearerHeader(currentUser);
  if (!auth.Authorization) return { ok: false, cases: [], errorFa: 'نشست مدیر تایید نشده است.' };
  const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
  try {
    const res = await fetch(`/api/v1/trust-safety/cases${qs}`, { headers: { Accept: 'application/json', ...auth }, signal });
    const body = (await res.json().catch(() => ({}))) as { cases?: TrustSafetyCaseItem[]; messageFa?: string; code?: string };
    if (!res.ok) return { ok: false, cases: [], errorFa: body.messageFa || body.code || 'خطا در دریافت پرونده‌های ایمنی' };
    return { ok: true, cases: Array.isArray(body.cases) ? body.cases : [] };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return { ok: false, cases: [] };
    return { ok: false, cases: [], errorFa: 'عدم دسترسی به سرویس Trust & Safety' };
  }
}

export async function claimTrustSafetyCase(caseId: string, currentUser?: User | null): Promise<{ ok: boolean; errorFa?: string }> {
  const auth = await getBearerHeader(currentUser);
  if (!auth.Authorization) return { ok: false, errorFa: 'احراز هویت الزامی است.' };
  const res = await fetch(`/api/v1/trust-safety/cases/${encodeURIComponent(caseId)}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': createCommunityIdempotencyKey('ts-claim'), ...auth },
  });
  const body = (await res.json().catch(() => ({}))) as { messageFa?: string; code?: string };
  return res.ok ? { ok: true } : { ok: false, errorFa: body.messageFa || body.code || 'خطا در قفل‌گذاری پرونده' };
}

export async function applyTrustSafetyDecision(
  caseId: string,
  decision: TrustSafetyDecision,
  reasonFa: string,
  currentUser?: User | null,
): Promise<{ ok: boolean; errorFa?: string }> {
  const auth = await getBearerHeader(currentUser);
  if (!auth.Authorization) return { ok: false, errorFa: 'احراز هویت الزامی است.' };
  const res = await fetch(`/api/v1/trust-safety/cases/${encodeURIComponent(caseId)}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': createCommunityIdempotencyKey('ts-dec'), ...auth },
    body: JSON.stringify({ decision, reasonFa }),
  });
  const body = (await res.json().catch(() => ({}))) as { messageFa?: string; code?: string };
  return res.ok ? { ok: true } : { ok: false, errorFa: body.messageFa || body.code || 'ثبت تصمیم ناموفق بود.' };
}

export async function resolveTrustSafetyAppeal(
  caseId: string,
  decision: 'upheld' | 'overturned',
  reviewerNoteFa: string,
  currentUser?: User | null,
): Promise<{ ok: boolean; errorFa?: string }> {
  const auth = await getBearerHeader(currentUser);
  if (!auth.Authorization) return { ok: false, errorFa: 'احراز هویت الزامی است.' };
  const res = await fetch(`/api/v1/trust-safety/cases/${encodeURIComponent(caseId)}/appeal-resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': createCommunityIdempotencyKey('ts-app'), ...auth },
    body: JSON.stringify({ decision, reviewerNoteFa }),
  });
  const body = (await res.json().catch(() => ({}))) as { messageFa?: string; code?: string };
  return res.ok ? { ok: true } : { ok: false, errorFa: body.messageFa || body.code || 'رسیدگی به اعتراض ناموفق بود.' };
}

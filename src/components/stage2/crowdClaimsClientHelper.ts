/**
 * @file src/components/stage2/crowdClaimsClientHelper.ts
 * @description Pure Firebase-authenticated client request builders and state helpers
 * for NeighborhoodCrowdClaimsPanel (no random client-side UIDs).
 */
import type { IntlCurrencyCode } from '../../utils/areaUnit';

export interface CrowdAuthUserLike {
  uid: string;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
}

export interface CrowdClaimSubmitPayloadInput {
  hoodId: number;
  cityKey: string;
  authorDisplayName: string;
  category: string;
  claimType: 'VERIFIED_FACT_CANDIDATE' | 'SUBJECTIVE_EXPERIENCE';
  streetName: string;
  narrativeText: string;
  basePriceSqm?: number;
  intlCurrency: IntlCurrencyCode;
}

export async function getCrowdAuthorizedHeaders(
  user: CrowdAuthUserLike | null | undefined,
): Promise<{ ok: true; headers: Record<string, string> } | { ok: false; messageFa: string }> {
  if (!user || !user.uid) {
    return {
      ok: false,
      messageFa: 'برای ثبت گزارش یا رأی دادن ابتدا وارد حساب کاربری خود شوید.',
    };
  }
  try {
    const token = (await user.getIdToken()).trim();
    if (!token) {
      return {
        ok: false,
        messageFa: 'توکن احراز هویت دریافت نشد. لطفاً دوباره وارد حساب خود شوید.',
      };
    }
    return {
      ok: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    };
  } catch {
    return {
      ok: false,
      messageFa: 'دریافت توکن احراز هویت ناموفق بود. لطفاً دوباره وارد شوید.',
    };
  }
}

export function buildCrowdClaimRequestBody(input: CrowdClaimSubmitPayloadInput): Record<string, unknown> {
  return {
    hoodId: input.hoodId,
    cityId: input.cityKey,
    authorDisplayName: input.authorDisplayName.trim() || 'شهروند رادار',
    category: input.category,
    targetLevel: input.claimType === 'VERIFIED_FACT_CANDIDATE' ? 'STREET_SEGMENT' : 'HOOD',
    streetName: input.streetName.trim(),
    narrativeText: input.narrativeText.trim(),
    baseHoodPriceSqmOverride: input.basePriceSqm,
    intlCurrency: input.intlCurrency,
  };
}

export function buildCrowdVoteRequestBody(direction: 'UP' | 'DOWN'): Record<string, unknown> {
  return { direction };
}

export function resolveCrowdMutationHttpError(status: number, errData: Record<string, unknown>): string {
  if (status === 401) {
    return 'نشست کاربری شما منقضی یا نامعتبر است. لطفاً دوباره وارد حساب خود شوید.';
  }
  if (status === 403) {
    return String(errData.message || 'دسترسی شما برای انجام این عملیات مجاز نیست یا ایمیل حساب تایید نشده است.');
  }
  if (status === 429) {
    return 'تعداد درخواست‌های شما بیش از حد مجاز است. لطفاً چند لحظه بعد تلاش کنید.';
  }
  return String(
    errData.message ||
      errData.code ||
      'گزارش ارسالی شرایط اعتبارسنجی معرفتی (حداقل طول یا امنیت محتوا) را احراز نکرد.',
  );
}

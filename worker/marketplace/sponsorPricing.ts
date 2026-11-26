export interface CanonicalSponsorPricing {
  planMonths: 1 | 3;
  monthlyTariffMillion: number;
  totalPayableMillion: number;
  durationDays: 30 | 90;
  campaignDiscountPercent: number;
}

/** Price is derived from the server-owned D1 market projection, never from client totals. */
export function calculateCanonicalD1SponsorPricing(
  rawBuyPerSqmMillion: unknown,
  rawCampaignDiscountPercent: unknown,
  rawPlanMonths: unknown,
): CanonicalSponsorPricing | null {
  const buyPerSqm = typeof rawBuyPerSqmMillion === 'number'
    ? rawBuyPerSqmMillion
    : Number(rawBuyPerSqmMillion);
  if (!Number.isFinite(buyPerSqm) || buyPerSqm <= 0 || buyPerSqm > 1_000_000) return null;

  const rawDiscount = typeof rawCampaignDiscountPercent === 'number'
    ? rawCampaignDiscountPercent
    : Number(rawCampaignDiscountPercent);
  const campaignDiscountPercent = Number.isFinite(rawDiscount) && rawDiscount >= 0 && rawDiscount <= 100
    ? Math.round(rawDiscount)
    : 0;

  const planMonths: 1 | 3 = rawPlanMonths === 3 || rawPlanMonths === '3' ? 3 : 1;
  const baseTariff = buyPerSqm >= 190 ? 14 : buyPerSqm >= 140 ? 10 : buyPerSqm >= 100 ? 7.5 : 5;
  const monthlyTariffMillion = Math.round(baseTariff * (1 - campaignDiscountPercent / 100) * 10) / 10;
  const totalPayableMillion = planMonths === 3
    ? Math.round(monthlyTariffMillion * 3 * 0.8 * 10) / 10
    : monthlyTariffMillion;

  return {
    planMonths,
    monthlyTariffMillion,
    totalPayableMillion,
    durationDays: planMonths === 3 ? 90 : 30,
    campaignDiscountPercent,
  };
}

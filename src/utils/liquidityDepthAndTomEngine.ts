/**
 * @file src/utils/liquidityDepthAndTomEngine.ts
 * @description Iranian Real Estate Liquidity Depth & Time-on-Market (TOM) Engine.
 * Solves the paper-wealth illusion by estimating realistic sale timelines and instant-cash liquidation discounts.
 */
import { toPersianNum } from '../data/neighborhoods';

export interface LiquidityParameters {
  basePriceSqm: number;
  unitAreaSqm: number;
  zone: string;
  hasElevator: boolean;
  floor: number;
  isBargainPrice: boolean;
}

export interface LiquidityAssessmentOutput {
  estimatedDaysToLiquidate: number;      // Days on market under normal conditions
  liquidityScore: number;                 // 1..10
  fireSaleDiscountPct: number;            // Discount needed to sell in < 20 days
  normalDealPriceSqm: number;
  fireSaleCashPriceSqm: number;
  liquidityTierFa: 'بسیار نقدشونده (شبه‌پول)' | 'نقدشوندگی متوسط' | 'سخت‌فروش و قفل سرمایه';
  diagnosticExplanationFa: string;
}

export function computeLiquidityDepthAndTom(p: LiquidityParameters): LiquidityAssessmentOutput {
  const area = Math.max(25, p.unitAreaSqm);
  const priceSqm = Math.max(1, p.basePriceSqm);

  // 1. Base Days by Area Bracket (sweet spot in Tehran is 50-80 sqm)
  let baseDays = 60;
  if (area <= 65) baseDays = 40;
  else if (area <= 90) baseDays = 55;
  else if (area <= 130) baseDays = 90;
  else if (area <= 200) baseDays = 150;
  else baseDays = 240; // Luxury/penthouse

  // 2. Zone Velocity Adjustment
  const normalizedZone = p.zone
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
  const z = normalizedZone.replace(/[^\d]/g, '');
  const zoneNum = parseInt(z, 10);
  if (zoneNum === 5 || zoneNum === 10 || zoneNum === 9 || zoneNum === 4) {
    baseDays *= 0.80; // High liquidity transit & consumer zones
  } else if (zoneNum === 1 || zoneNum === 2 || zoneNum === 3) {
    baseDays *= 1.35; // Heavy capital ticket, longer buyer search cycle
  } else if (zoneNum >= 15 && zoneNum <= 20) {
    baseDays *= 0.85; // Affordable units move quickly
  }

  // 3. Walk-up friction (Floor >= 3 without elevator is notoriously illiquid)
  if (!p.hasElevator && p.floor >= 3) {
    baseDays *= 1.45;
  }

  // 4. Bargain pricing velocity boost
  if (p.isBargainPrice) {
    baseDays *= 0.70;
  }

  const finalDays = Math.max(15, Math.round(baseDays));

  // Liquidity Score (10 is immediate cash, 1 is frozen asset)
  let score = 10 - Math.min(8.5, (finalDays / 250) * 8.5);
  score = Number(Math.max(1.5, Math.min(9.8, score)).toFixed(1));

  // Fire-Sale discount to liquidate in < 20 days
  let fireSalePct = 12;
  if (finalDays > 180) fireSalePct = 24;
  else if (finalDays > 100) fireSalePct = 18;
  else if (finalDays > 60) fireSalePct = 14;
  else fireSalePct = 10;

  const fireSaleCashPriceSqm = Math.round(priceSqm * ((100 - fireSalePct) / 100));

  let tier: LiquidityAssessmentOutput['liquidityTierFa'] = 'نقدشوندگی متوسط';
  if (score >= 7.5) tier = 'بسیار نقدشونده (شبه‌پول)';
  else if (score <= 4.5) tier = 'سخت‌فروش و قفل سرمایه';

  const diagnosticExplanationFa = score >= 7.5
    ? `این واحد به دلیل متراژ خوش‌دست (${toPersianNum(area)} متر) و کشش منطقه، شبه‌پول محسوب می‌شود و زمان فروش تخمینی آن حدود ${toPersianNum(finalDays)} روز است.`
    : score <= 4.5
      ? `هشدار انجماد سرمایه: فروش این واحد در شرایط عادی نیازمند صبوری ${toPersianNum(finalDays)} روزه است. برای تبدیل به نقدینگی در کمتر از ۲۰ روز، کسر ${toPersianNum(fireSalePct)}٪ از قیمت معامله الزامی است.`
      : `زمان فروش استاندارد در بازار فعلی حدود ${toPersianNum(finalDays)} روز برآورد می‌شود.`;

  return {
    estimatedDaysToLiquidate: finalDays,
    liquidityScore: score,
    fireSaleDiscountPct: fireSalePct,
    normalDealPriceSqm: priceSqm,
    fireSaleCashPriceSqm,
    liquidityTierFa: tier,
    diagnosticExplanationFa,
  };
}

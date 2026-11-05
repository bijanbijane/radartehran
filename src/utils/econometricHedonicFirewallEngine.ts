// filepath: src/utils/econometricHedonicFirewallEngine.ts
import Decimal from 'decimal.js';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode, type RadarLocale } from './areaUnit';

function computeIsomorphicHmac256Hex(secret: string, message: string): string {
  const input = `${secret}::hmac256::${message}`;
  const lanes = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    const laneIdx = i & 7;
    lanes[laneIdx] = Math.imul(lanes[laneIdx] ^ code, 0x01000193) ^ ((lanes[(laneIdx + 3) & 7] >>> 5) | (lanes[(laneIdx + 5) & 7] << 27));
  }
  for (let r = 0; r < 16; r++) {
    const idx = r & 7;
    lanes[idx] = Math.imul(lanes[idx] ^ (lanes[(idx + 1) & 7] >>> 11), 0x85ebca6b) ^ Math.imul(lanes[(idx + 4) & 7], 0xc2b2ae35);
  }
  return lanes.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

export type HedonicCohortType = 'Standard_60_100m' | 'Klengi_Land' | 'Luxury_Penthouse';
export type RenovationExecutionModel = 'DIY_MATERIAL_ONLY' | 'CONTRACTOR_TURNKEY';

export interface StratifiedHedonicAuditResult {
  readonly cohort: HedonicCohortType;
  readonly deedAreaSqm: Decimal;
  readonly effectiveAskingPerSqmMillion: Decimal;
  readonly closingDiscountHaircutRate: Decimal;
  readonly deviationPercent: Decimal;
  readonly estimatedMonthsToSell: number;
  readonly liquidityStagnationIndex: Decimal;
  readonly neutralProbabilisticBannerFa: string;
  readonly status: 'VERIFIED_COHORT_NORMAL' | 'OUTLIER_PENDING_AUDIT';
  readonly intlFairUnitPrice: string;
}

export function stratifyCohortAndAuditOutlier(input: {
  deedAreaSqm: Decimal | number | string;
  usableAreaSqm?: Decimal | number | string;
  buildingAgeYears: number;
  isPenthouseOrUltraLuxury?: boolean;
  askingPricePerSqmMillion: Decimal | number | string;
  cohortHedonicMeanMillion: Decimal | number | string;
  cohortQ3Million: Decimal | number | string;
  cohortSigmaMillion: Decimal | number | string;
  stagflationSpreadRatio?: number;
  userBlindAppraisalSubmitted: boolean;
  currency?: IntlCurrencyCode;
  locale?: RadarLocale;
}): StratifiedHedonicAuditResult {
  if (!input.userBlindAppraisalSubmitted) {
    throw new Error('BLIND_APPRAISAL_REQUIRED: User per-sqm estimate must be collected before revealing asking or hedonic price');
  }
  const deedAreaSqm = new Decimal(input.deedAreaSqm);
  const asking = new Decimal(input.askingPricePerSqmMillion);
  const mean = Decimal.max(new Decimal(1), new Decimal(input.cohortHedonicMeanMillion));
  const q3 = new Decimal(input.cohortQ3Million);
  const sigma = new Decimal(input.cohortSigmaMillion);

  const cohort: HedonicCohortType = input.isPenthouseOrUltraLuxury
    ? 'Luxury_Penthouse'
    : input.buildingAgeYears >= 25
      ? 'Klengi_Land'
      : 'Standard_60_100m';

  const stagflation = Math.max(0, Math.min(1, input.stagflationSpreadRatio ?? 0.4));
  const haircut = new Decimal('0.03').plus(new Decimal('0.05').mul(stagflation));
  const effectiveAsking = asking.mul(new Decimal(1).minus(haircut));
  const deviationPercent = asking.minus(mean).div(mean).mul(100).toDecimalPlaces(1);
  const exceedsMean30 = asking.minus(mean).abs().div(mean).gt(new Decimal('0.30'));
  const exceedsQ3Plus2Sigma = asking.gt(q3.plus(sigma.mul(2)));
  const status = exceedsMean30 || exceedsQ3Plus2Sigma ? 'OUTLIER_PENDING_AUDIT' : 'VERIFIED_COHORT_NORMAL';

  const estimatedMonthsToSell = Math.max(1, Math.min(18, Math.round(2 + Math.max(0, deviationPercent.toNumber()) * 0.25 + stagflation * 4)));
  const liquidityStagnationIndex = new Decimal(stagflation * 100).toDecimalPlaces(1);
  const signPrefix = deviationPercent.gte(0) ? '+' : '';

  return {
    cohort,
    deedAreaSqm,
    effectiveAskingPerSqmMillion: effectiveAsking.toDecimalPlaces(2),
    closingDiscountHaircutRate: haircut.toDecimalPlaces(4),
    deviationPercent,
    estimatedMonthsToSell,
    liquidityStagnationIndex,
    neutralProbabilisticBannerFa: `انحراف از کشش تقاضای ثبت‌شده منطقه: ${signPrefix}${deviationPercent.toString()}% | زمان انتظار تخمینی فروش: ${estimatedMonthsToSell} ماه`,
    status,
    intlFairUnitPrice: formatMillionTomanAsIntlCurrency(mean.toNumber(), input.currency ?? 'USD', input.locale ?? 'fa'),
  };
}

export function evaluateRenovationRegressionAndRoi(input: {
  preRenovationValueMillion: Decimal | number | string;
  renovationSpendMillion: Decimal | number | string;
  neighborhoodCeilingCapMillion: Decimal | number | string;
  deedAreaSqm: Decimal | number | string;
  executionModel: RenovationExecutionModel;
  housingInflationRate: Decimal | number | string;
  commissionAndSleepRate?: Decimal | number | string;
  hasVerifiedPayanKarOrDeedImage: boolean;
  unbuiltMetroProgressRatio?: number;
}): {
  cappedPostRenovationMillion: Decimal;
  realAdjustedRoiPercent: Decimal;
  budgetClassification: 'STANDARD_VERIFIED_BUDGET' | 'NON_STANDARD_EXPERIMENTAL_BUDGET';
  landShareStatus: 'VERIFIED_OFFICIAL_DEED' | 'TENTATIVE_ESTIMATE';
  effectiveTransitPremiumMultiplier: Decimal;
} {
  const preVal = new Decimal(input.preRenovationValueMillion);
  const spend = new Decimal(input.renovationSpendMillion);
  const ceiling = new Decimal(input.neighborhoodCeilingCapMillion);
  const sqm = Decimal.max(new Decimal(1), new Decimal(input.deedAreaSqm));
  const spendPerSqm = spend.div(sqm);
  const nationalFloorPerSqm = input.executionModel === 'DIY_MATERIAL_ONLY' ? new Decimal('4.5') : new Decimal('8.0');

  const rawPostVal = preVal.plus(spend.mul(new Decimal('1.25')));
  const cappedPostRenovationMillion = Decimal.min(ceiling, rawPostVal);
  const inflation = new Decimal(input.housingInflationRate);
  const frictionCost = new Decimal(input.commissionAndSleepRate ?? '0.06');
  const realCostBasis = preVal.plus(spend).mul(new Decimal(1).plus(inflation).plus(frictionCost));
  const realAdjustedRoiPercent = cappedPostRenovationMillion
    .minus(realCostBasis)
    .div(Decimal.max(new Decimal(1), realCostBasis))
    .mul(100)
    .toDecimalPlaces(2);

  const metroProgress = input.unbuiltMetroProgressRatio ?? 1;
  const effectiveTransitPremiumMultiplier = metroProgress < 0.3 ? new Decimal('0.30') : new Decimal('1.00');

  return {
    cappedPostRenovationMillion: cappedPostRenovationMillion.toDecimalPlaces(2),
    realAdjustedRoiPercent,
    budgetClassification: spendPerSqm.lt(nationalFloorPerSqm)
      ? 'NON_STANDARD_EXPERIMENTAL_BUDGET'
      : 'STANDARD_VERIFIED_BUDGET',
    landShareStatus: input.hasVerifiedPayanKarOrDeedImage ? 'VERIFIED_OFFICIAL_DEED' : 'TENTATIVE_ESTIMATE',
    effectiveTransitPremiumMultiplier,
  };
}

export function enforceForumSafetyAndLegalFirewall(input: {
  rawPostText: string;
  verifiedUnitVoteCount: number;
  isIndividualUnitCommentAttempt: boolean;
  authorPostsLast30Days: number;
  authorVerifiedEvidenceCount: number;
  projectPositiveRepliesCount: number;
  projectShareholderPositiveCount: number;
  authorNegativeVotesLast2Hours: number;
  voterPropertyDistanceMeters: number | null;
  threadReplyCount: number;
  authorRequestedAccountDelete: boolean;
  hasUploadedContractOrDeedEvidence: boolean;
  detailedPlanVersion?: string;
}): {
  sanitizedText: string;
  unitScoreVisible: boolean;
  openUnitThreadAllowed: false;
  authorityWeight: Decimal;
  pinShareholderBiasWarning: boolean;
  quarantinedRageAccount: boolean;
  neutralizeNeighborConflictVote: boolean;
  preservedDeletedAuthorLabel: string | null;
  quarantineUnverifiedLegalOrDefectClaim: boolean;
  blockedForSecurityOrExternalLink: boolean;
  poachingCoordinateGeneralized: boolean;
  buildingSafetyBoxWarningFa: string | null;
  regulatoryVersionTag: string;
} {
  let sanitizedText = input.rawPostText.replace(/(?:برج|ساختمان|مجتمع)\s+[\u0600-\u06FF0-9A-Za-z_-]+/gu, 'ساختمان مسکونی منطقه');
  const hasExternalLinkOrPhone = /(?:https?:\/\/|t\.me\/|@[A-Za-z0-9_]{4,}|09\d{9}|۰۹[۰-۹]{9}|پیش\s*فروش\s*تعاونی\s*فاقد\s*مجوز)/u.test(sanitizedText);
  const exposesSecurityFlaw = /(?:دوربین\s*مداربسته\s*خراب|قفل\s*ورودی\s*شکسته|رمز\s*درب\s*ورودی)/u.test(sanitizedText);
  const combinesPoachingVectors = /طبقه\s*[۰-۹0-9]+/u.test(sanitizedText) && /مالک\s*(?:مسن|سالمند|\d+\s*ساله)/u.test(sanitizedText) && /بن\s*بست|بن‌بست/u.test(sanitizedText);
  const hasSeriousClaim = /(?:ترک\s*سازه|نشست\s*فونداسیون|مشارکت\s*ثبت\s*نشده|اوقافی|ستادی|مصادره\s*ای)/u.test(sanitizedText);

  if (hasSeriousClaim && !input.hasUploadedContractOrDeedEvidence) {
    sanitizedText += ' [سلب مسئولیت حقوقی: استعلام رسمی وضعیت ثبتی صرفاً از طریق سازمان ثبت اسناد و املاک کشور معتبر است]';
  }

  const isLoudmouth = input.authorPostsLast30Days > 30 && input.authorVerifiedEvidenceCount === 0;
  const authorityWeight = isLoudmouth ? new Decimal('0.15') : new Decimal('1.00');
  const shareholderRatio =
    input.projectPositiveRepliesCount > 0 ? input.projectShareholderPositiveCount / input.projectPositiveRepliesCount : 0;

  return {
    sanitizedText,
    unitScoreVisible: input.verifiedUnitVoteCount >= 10,
    openUnitThreadAllowed: false,
    authorityWeight,
    pinShareholderBiasWarning: shareholderRatio > 0.7,
    quarantinedRageAccount: input.authorNegativeVotesLast2Hours > 5,
    neutralizeNeighborConflictVote: input.voterPropertyDistanceMeters !== null && input.voterPropertyDistanceMeters <= 50,
    preservedDeletedAuthorLabel: input.authorRequestedAccountDelete && input.threadReplyCount >= 3 ? '[کاربر حذف‌شده]' : null,
    quarantineUnverifiedLegalOrDefectClaim: hasSeriousClaim && !input.hasUploadedContractOrDeedEvidence,
    blockedForSecurityOrExternalLink: hasExternalLinkOrPhone || exposesSecurityFlaw,
    poachingCoordinateGeneralized: combinesPoachingVectors,
    buildingSafetyBoxWarningFa: /(?:لوله\s*کشی\s*گاز|برق\s*کاری|حذف\s*ستون|دیوار\s*باربر)/u.test(sanitizedText)
      ? 'هشدار ایمنی مقررات ملی ساختمان (مبحث ۱۴ و ۱۹): هرگونه تغییر در تأسیسات گاز، برق یا دیوارهای باربر نیازمند تأیید مهندس ناظر است.'
      : null,
    regulatoryVersionTag: input.detailedPlanVersion ?? 'TEHRAN_DETAILED_PLAN_1405_R2',
  };
}

export function createZeroKnowledgeDealNullifier(input: {
  userId: string;
  contractCode: string;
  closingPriceToman: Decimal | number | string;
  deedAreaSqm: Decimal | number | string;
  h3CellRes9: string;
  serverSecret: string;
}): {
  nullifierHash: string;
  anonymizedClosingRecord: {
    nullifierHash: string;
    h3CellRes9: string;
    closingPriceDecimal18_4: string;
    deedAreaDecimal18_4: string;
    judicialWatermarkFa: string;
  };
} {
  const nullifierHash = computeIsomorphicHmac256Hex(
    input.serverSecret,
    `${input.userId.trim()}:${input.contractCode.trim()}`,
  );

  return {
    nullifierHash,
    anonymizedClosingRecord: {
      nullifierHash,
      h3CellRes9: input.h3CellRes9,
      closingPriceDecimal18_4: new Decimal(input.closingPriceToman).toFixed(4),
      deedAreaDecimal18_4: new Decimal(input.deedAreaSqm).toFixed(4),
      judicialWatermarkFa: 'ارقام جدول صرفاً جنبه تحلیلی داشته و فاقد اعتبار استناد قضایی یا مالیاتی است.',
    },
  };
}

/**
 * @file src/utils/serverLegalRuleEngine.ts
 * @description Deterministic Iranian Real Estate Legal Rule-Engine Fallback for `/api/contract-check`.
 */

import type { ContractCheckResponse } from '../types/models';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
import { hasAffirmativeMatch } from '../data/realMarketPriceAggregator';

export type { ContractCheckResponse };

export const MAX_LEGAL_CLAUSE_LENGTH = 8000;

export function runLocalLegalRuleEngine(
  rawText: string,
  rawContractType = 'قرارداد ملکی',
  areaUnit: AreaUnit = 'sqm',
  intlCurrency: IntlCurrencyCode = 'USD',
  referenceValuationMillionToman = 120
): ContractCheckResponse & { displayAreaUnitLabel?: string; referenceValuationIntlText?: string } {
  const text = String(rawText || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u200D-\u200F\u202A-\u202E\u2066-\u2069\uFEFF<>]/g, '')
    .replace(/\u200C+/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .trim()
    .slice(0, MAX_LEGAL_CLAUSE_LENGTH);
  const contractType = String(rawContractType || '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, 64) || 'قرارداد ملکی';
  const traps: string[] = [];
  const missingGuarantees: string[] = [];
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

  const hasAsghaneh = hasAffirmativeMatch(text, /(?:اسقاط\s*کافه\s*خیار|خیار\s*غبن)/);
  const hasFaskhDrop = hasAffirmativeMatch(text, /(?:سقوط\s*حق\s*فسخ|سلب\s*حق\s*فسخ|فسخ\s*یکطرفه|منفسخ)/);
  const hasImmediateEviction = hasAffirmativeMatch(text, /(?:تخلیه\s*فوری\s*بدون\s*حکم|تخلیه\s*بدون\s*دستور\s*قضایی|تخلیه\s*فوری)/);
  const hasPenalty = hasAffirmativeMatch(text, /(?:وجه\s*التزام|خسارت\s*تاخیر|روزانه)/);
  const hasVekalat = hasAffirmativeMatch(text, /(?:وکالت|وکالتنامه|وکالت‌نامه|قولنامه\s*عادی)/);
  const hasBelaAvaz = hasAffirmativeMatch(text, /(?:بلاعوض|حامل|نقدی\s*بدون\s*رسید)/);
  const hasSayad = hasAffirmativeMatch(text, /(?:صیاد|صیادی|شبا|کد\s*رهگیری)/);

  if (hasAsghaneh) {
    riskLevel = 'HIGH';
    traps.push('عبارت «اسقاط کافه خیارات ولو خیار غبن فاحش و افحش» حق هرگونه اعتراض قانونی در صورت گران‌فروشی شدید یا عیب پنهان ملک را از شما سلب می‌کند.');
  }
  if (hasFaskhDrop) {
    if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
    traps.push('شرط سقوط حق فسخ یا سلب حق اعتراض یک‌طرفه، امکان فسخ قانونی قرارداد در صورت تخلف صریح طرف مقابل را سلب می‌نماید.');
  }
  if (hasImmediateEviction) {
    riskLevel = 'HIGH';
    traps.push('شرط تخلیه فوری بدون حکم قضایی فاقد وجاهت قانونی است و ریسک سلب تصرف عدوانی خارج از رویه دادگاه را در پی دارد.');
  }
  if (hasVekalat) {
    riskLevel = 'HIGH';
    traps.push('معامله صرفاً با وکالت‌نامه بدون انتقال رسمی سند تک‌برگ، ریسک فروش مال غیر یا ابطال وکالت به دلیل فوت/حجر موکل را به همراه دارد.');
  }
  if (hasBelaAvaz) {
    riskLevel = 'HIGH';
    traps.push('پرداخت وجه نقد یا چک در وجه حامل بدون درج شناسه صیادی به نام مالک رسمی، در مراجع قضایی قابل استرداد فوری نیست.');
  }
  if (!hasPenalty) {
    if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
    missingGuarantees.push('عدم تعیین «وجه التزام روزانه دقیق» برای تاخیر در تحویل ملک یا عدم حضور در دفترخانه اسناد رسمی.');
  }
  if (!hasSayad) {
    missingGuarantees.push('عدم اشاره به شماره سریال چک‌های صیادی و شرط ثبت در سامانه خودنویس / کاتب.');
  }

  if (traps.length === 0) {
    traps.push('در ظاهر متن ارسالی عبارت فریبنده مستقیم دیده نشد، اما عبارات کلی مانند «طبق عرف» باید به تاریخ و مبلغ دقیق تبدیل شوند.');
  }
  if (missingGuarantees.length === 0) {
    missingGuarantees.push('شرط استعلام عدم بازداشت و عدم رهن بانک در سامانه «ثبت من» پیش از تحویل چک مرحله دوم اضافه شود.');
  }

  const penaltiesWarning = hasPenalty
    ? 'در بند شما به خسارت/وجه التزام اشاره شده؛ دقت کنید عبارت «علاوه بر انجام اصل تعهد» حتماً قید شود تا فروشنده نتواند با پرداخت جریمه از انتقال سند شانه خالی کند.'
    : 'هیچ وجه التزام مشخصی در این بند دیده نمی‌شود! حتماً خسارت روزانه عدم حضور در محضر و تاخیر تحویل را به عدد و حروف درج کنید.';

  const detectedHighOrMedTrapCount = (hasAsghaneh ? 1 : 0) + (hasFaskhDrop ? 1 : 0) + (hasImmediateEviction ? 1 : 0) + (hasVekalat ? 1 : 0) + (hasBelaAvaz ? 1 : 0);
  const riskScore =
    riskLevel === 'HIGH'
      ? Math.min(98, 80 + Math.max(1, detectedHighOrMedTrapCount) * 5)
      : riskLevel === 'MEDIUM'
        ? Math.min(75, 45 + Math.max(1, detectedHighOrMedTrapCount + (!hasPenalty ? 1 : 0)) * 5)
        : 20;
  const summary = `بررسی حقوقی بند ارسالی (${contractType}) انجام شد. سطح ریسک شناسایی‌شده: ${
    riskLevel === 'HIGH' ? 'بالا (نیازمند اصلاح فوری)' : riskLevel === 'MEDIUM' ? 'متوسط (نیازمند تکمیل تضامین)' : 'پایین (ایمن با رعایت شروط تکمیلی)'
  }.`;

  return {
    status: 'ok' as const,
    source: 'RULE_ENGINE' as const,
    analysisSource: 'RULE_ENGINE' as const,
    riskScore,
    riskLevel,
    warnings: traps,
    legalCitation: 'مواد ۳۹۶ تا ۴۵۶ قانون مدنی (خیارات) و قانون الزام به ثبت رسمی معاملات اموال غیرمنقول',
    summary,
    legalAdvice: `${summary} ${penaltiesWarning}`,
    traps,
    detectedTraps: traps,
    penaltiesWarning,
    missingGuarantees,
    safeRewrite:
      '«فروشنده اقرار نمود ملک مورد معامله در رهن، بازداشت یا مصادره نمی‌باشد. در صورت عدم حضور هر یک از طرفین در دفترخانه در تاریخ مقرر، طرف متخلف ملزم به پرداخت روزانه ... میلیون تومان به عنوان وجه التزام تاخیر تادیه علاوه بر اجرای اصل تعهد خواهد بود و کلیه چک‌های ثمن صرفاً در سامانه صیاد به نام مالک رسمی ثبت می‌گردد.»',
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(referenceValuationMillionToman, intlCurrency, 'en'),
  };
}

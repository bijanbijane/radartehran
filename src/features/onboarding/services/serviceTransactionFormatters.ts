/** @file src/features/onboarding/services/serviceTransactionFormatters.ts — Stage 44 Toman-Only Persian Words, Currency & Stage 40 CSV Export */
import type { ServiceTransactionDossier } from './serviceTransactionTypes';

const ONES_FA = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS_FA = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS_FA = ['', 'ده', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS_FA = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES_FA = ['', 'هزار', 'میلیون', 'میلیارد'];

function threeDigitsToWordsFa(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (h > 0) parts.push(HUNDREDS_FA[h]);
  if (rem >= 10 && rem < 20) {
    parts.push(TEENS_FA[rem - 10]);
  } else {
    const t = Math.floor(rem / 10);
    const o = rem % 10;
    if (t > 0) parts.push(TENS_FA[t]);
    if (o > 0) parts.push(ONES_FA[o]);
  }
  return parts.join(' و ');
}

export function numberToPersianWordsToman(amountToman: number): string {
  const safe = Math.round(Number.isFinite(amountToman) ? Math.max(0, amountToman) : 0);
  if (safe === 0) return 'صفر تومان';
  const chunks: string[] = [];
  let rem = safe;
  let scaleIdx = 0;
  while (rem > 0 && scaleIdx < SCALES_FA.length) {
    const group = rem % 1000;
    if (group > 0) {
      const words = threeDigitsToWordsFa(group);
      chunks.unshift(SCALES_FA[scaleIdx] ? `${words} ${SCALES_FA[scaleIdx]}` : words);
    }
    rem = Math.floor(rem / 1000);
    scaleIdx += 1;
  }
  return `${chunks.join(' و ')} تومان`;
}

export function formatTomanCurrency(amountToman: number): string {
  const safe = Math.round(Number.isFinite(amountToman) ? Math.max(0, amountToman) : 0);
  return `${safe.toLocaleString('fa-IR')} تومان`;
}

export function buildStage44FinancialExportCsv(dossier: ServiceTransactionDossier): string {
  const header = ['شناسه تراکنش', 'تاریخ', 'صورت‌حساب', 'مبلغ (تومان)', 'واحد', 'روش', 'وضعیت', 'کد پیگیری'].join(',');
  const rows = dossier.payments.map((p) =>
    [p.paymentId, p.createdAtFa, p.invoiceNumber, String(p.amountToman), 'تومان', p.methodLabelFa, p.status, p.trackingCode || 'نامشخص'].join(','),
  );
  return [header, ...rows].join('\n');
}

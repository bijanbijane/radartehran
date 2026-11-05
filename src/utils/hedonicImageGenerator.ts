/**
 * @file src/utils/hedonicImageGenerator.ts
 * @description مولد تصویر گرافیکی برگه کارشناسی قیمت ملک (الگوریتم Hedonic) با HTML5 Canvas
 * جهت دانلود مستقیم فایل PNG و اشتراک‌گذاری در واتساپ و تلگرام.
 */

import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatAreaValue, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from './areaUnit';

const toPersianDigits = (val: string | number): string =>
  String(val).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

export function sanitizeHedonicCanvasText(raw: unknown, maxLen = 80): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function buildSafeHedonicDownloadFilename(hoodId: unknown, sqm: unknown): string {
  const safeHood = Math.max(1, Math.min(9999, Math.round(Number(hoodId) || 1)));
  const safeSqm = Math.max(10, Math.min(5000, Math.round(Number(sqm) || 85)));
  return `hedonic-valuation-${safeHood}-${safeSqm}m.png`;
}

export interface HedonicCardFactorItem {
  id: string;
  label: string;
  valueLabel: string;
  impactPercent: number;
  impactPerSqmMillion: number;
  explanation: string;
}

export interface HedonicCardPayload {
  hoodId: number;
  hoodName: string;
  hoodZone: string;
  sqm: number;
  buildYear: number;
  buildingAgeYears: number;
  floor: number;
  renovationLabel: string;
  hoodBasePerSqm: number;
  hedonicPerSqm: number;
  hedonicTotalMillion: number;
  hedonicTotalBillion: number;
  estimatedRahnMillion: number;
  netAdjustmentPercent: number;
  diffFromHoodAvgPercent: number;
  confidenceRangeMillion: {
    min: number;
    max: number;
  };
  factors: HedonicCardFactorItem[];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string,
  strokeStyle?: string
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export async function downloadHedonicValuationCardPng(
  valuation: HedonicCardPayload
): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    const grad = ctx.createLinearGradient(0, 0, 1080, 1480);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#064e3b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1480);

    ctx.direction = 'rtl';
    ctx.textAlign = 'right';

    drawRoundedRect(ctx, 56, 56, 968, 1368, 36, 'rgba(15, 23, 42, 0.86)', 'rgba(16, 185, 129, 0.45)');

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 26px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText('گزارش برآورد الگوریتمی قیمت ملک · مدل Hedonic', 964, 125);

    const safeHoodName = sanitizeHedonicCanvasText(valuation.hoodName, 50);
    const safeHoodZone = sanitizeHedonicCanvasText(valuation.hoodZone, 40);
    const safeRenovationLabel = sanitizeHedonicCanvasText(valuation.renovationLabel, 40);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 48px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText(`محله ${safeHoodName} (${safeHoodZone})`, 964, 195);

    const ageLabel =
      valuation.buildingAgeYears === 0
        ? 'نوساز'
        : `${toPersianDigits(valuation.buildingAgeYears)} ساله`;
    const areaUnit = getStoredAreaUnit();
    const intlCurrency = getStoredIntlCurrency();
    const areaDisplayText = formatAreaValue(valuation.sqm, areaUnit);
    const areaUnitLabel = formatAreaUnitLabel(areaUnit);
    const unitHedonicPrice = convertPricePerSqmToUnit(valuation.hedonicPerSqm, areaUnit);
    const unitHoodBasePrice = convertPricePerSqmToUnit(valuation.hoodBasePerSqm, areaUnit);
    const totalIntlText = formatMillionTomanAsIntlCurrency(valuation.hedonicTotalMillion, intlCurrency);
    const rahnIntlSuffix = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(valuation.estimatedRahnMillion, intlCurrency)})` : '';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 26px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText(
      `متراژ: ${areaDisplayText}  |  ساخت: ${toPersianDigits(valuation.buildYear)} (${ageLabel})  |  طبقه: ${toPersianDigits(valuation.floor)}  |  ${safeRenovationLabel}`,
      964,
      250
    );

    // Main Price Box
    drawRoundedRect(ctx, 96, 290, 888, 250, 28, 'rgba(6, 78, 59, 0.55)', '#10b981');
    ctx.fillStyle = '#a7f3d0';
    ctx.font = 'bold 26px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText('ارزش کل برآوردی ملک (مدل هدونیک):', 944, 345);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 64px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText(
      `${toPersianDigits(valuation.hedonicTotalBillion)} میلیارد تومان (${totalIntlText})`,
      944,
      430
    );

    const minB = toPersianDigits((valuation.confidenceRangeMillion.min / 1000).toFixed(2));
    const maxB = toPersianDigits((valuation.confidenceRangeMillion.max / 1000).toFixed(2));
    ctx.fillStyle = '#6ee7b7';
    ctx.font = 'bold 25px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText(
      `هر ${areaUnitLabel}: ${toPersianDigits(unitHedonicPrice)} میلیون تومان  |  بازه منصفانه معامله: ${minB} تا ${maxB} میلیارد`,
      944,
      498
    );

    // Neighborhood Comparison & Rahn Row
    drawRoundedRect(ctx, 96, 566, 888, 130, 24, 'rgba(30, 41, 59, 0.85)', 'rgba(148, 163, 184, 0.28)');
    const diffSign = valuation.diffFromHoodAvgPercent > 0 ? '+' : '';
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 26px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText(
      `میانگین پایه محله ${safeHoodName}: هر ${areaUnitLabel} ${toPersianDigits(unitHoodBasePrice)} میلیون (${diffSign}${toPersianDigits(valuation.diffFromHoodAvgPercent)}٪ تراز هدونیک)`,
      944,
      620
    );
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(
      `رهن کامل برآوردی این واحد: ${toPersianDigits(valuation.estimatedRahnMillion)} میلیون تومان${rahnIntlSuffix}`,
      944,
      668
    );

    // 5 Hedonic Factors Table
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '900 28px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText('کالبدشکافی ۵ ضریب ارزش‌گذاری هدونیک:', 964, 750);

    valuation.factors.slice(0, 5).forEach((f, idx) => {
      const rowY = 780 + idx * 104;
      drawRoundedRect(ctx, 96, rowY, 888, 88, 18, 'rgba(30, 41, 59, 0.65)', 'rgba(148, 163, 184, 0.2)');
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Vazirmatn, Tahoma, sans-serif';
      ctx.fillText(`${sanitizeHedonicCanvasText(f.label, 40)}: ${sanitizeHedonicCanvasText(f.valueLabel, 40)}`, 954, rowY + 38);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '20px Vazirmatn, Tahoma, sans-serif';
      ctx.fillText(sanitizeHedonicCanvasText(f.explanation, 68), 954, rowY + 70);

      ctx.textAlign = 'left';
      const sign = f.impactPercent > 0 ? '+' : '';
      ctx.fillStyle = f.impactPercent > 0 ? '#34d399' : f.impactPercent < 0 ? '#fb7185' : '#cbd5e1';
      ctx.font = '900 26px Vazirmatn, Tahoma, sans-serif';
      ctx.fillText(`${sign}${toPersianDigits(f.impactPercent)}٪`, 126, rowY + 52);
    });

    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 20px Vazirmatn, Tahoma, sans-serif';
    const todayFa = new Date().toLocaleDateString('fa-IR');
    ctx.fillText(`رادار هوشمند مسکن  |  تاریخ گزارش: ${todayFa}  |  برآورد الگوریتمی مبتنی بر داده‌های پیکربندی (غیررسمی)`, 964, 1375);

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = buildSafeHedonicDownloadFilename(valuation.hoodId, valuation.sqm);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch {
    return false;
  }
}

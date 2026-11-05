import React, { useState } from 'react';
import { formatMillionToVerbalPersian, formatJalaliMonthYear } from '../../utils/persianFinancials';
import { formatAreaShort, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from '../../utils/areaUnit';

export interface ShareableCardProps {
  hoodNameFa: string;
  districtNumber: number;
  avgPricePerSqmMillion: number;
  benchmark100SqmTotalMillion: number;
  monthlyChangePercent: number;
}

export const ShareableNeighborhoodCard: React.FC<ShareableCardProps> = ({
  hoodNameFa,
  districtNumber,
  avgPricePerSqmMillion,
  benchmark100SqmTotalMillion,
  monthlyChangePercent,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const areaUnit = getStoredAreaUnit();
  const intlCurrency = getStoredIntlCurrency();

  const handleExportPng = async () => {
    setIsExporting(true);
    try {
      if (typeof document !== 'undefined' && 'fonts' in document) {
        await document.fonts.ready;
      }

      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1350;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Dark Executive Background
      const grad = ctx.createLinearGradient(0, 0, 1080, 1350);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1350);

      // Emerald Accent Frame
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 6;
      ctx.strokeRect(48, 48, 984, 1254);

      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      const fmt = new Intl.NumberFormat('fa-IR');

      // Header
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 38px Vazirmatn, Tahoma, sans-serif';
      ctx.fillText('رادار هوشمند مسکن تهران | گزارش تحلیلی محله', 960, 150);

      // Hood Name
      ctx.fillStyle = '#ffffff';
      ctx.font = 'extrabold 76px Vazirmatn, Tahoma, sans-serif';
      ctx.fillText(`محله ${hoodNameFa} (منطقه ${fmt.format(districtNumber)})`, 960, 280);

      // Price Box
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(96, 360, 888, 320);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '36px Vazirmatn, Tahoma, sans-serif';
      ctx.fillText('میانگین قیمت هر متر مربع (واحد استاندارد):', 910, 445);

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 72px Vazirmatn, Tahoma, sans-serif';
      ctx.fillText(`${fmt.format(avgPricePerSqmMillion)} میلیون تومان`, 910, 560);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '34px Vazirmatn, Tahoma, sans-serif';
      ctx.fillText(
        `برآورد واحد ${formatAreaShort(100, areaUnit)}: ${formatMillionToVerbalPersian(benchmark100SqmTotalMillion)} (${formatMillionTomanAsIntlCurrency(benchmark100SqmTotalMillion, intlCurrency)})`,
        910,
        640
      );

      // Monthly Trend
      ctx.fillStyle = monthlyChangePercent >= 0 ? '#f59e0b' : '#38bdf8';
      ctx.font = 'bold 42px Vazirmatn, Tahoma, sans-serif';
      const sign = monthlyChangePercent > 0 ? '+' : '';
      ctx.fillText(
        `تغییرات ماهانه: ${sign}${fmt.format(monthlyChangePercent)}٪ (${formatJalaliMonthYear(Date.now())})`,
        960,
        810
      );

      // Footer
      ctx.fillStyle = '#64748b';
      ctx.font = '30px Vazirmatn, Tahoma, sans-serif';
      ctx.fillText('استخراج‌شده از سامانه رادار تهران • بدون نیاز به ثبت‌نام', 960, 1220);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `tehran-radar-${hoodNameFa}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }, 'image/png');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      type="button"
      disabled={isExporting}
      onClick={handleExportPng}
      data-area-unit={areaUnit}
      data-intl-currency={intlCurrency}
      className="radar-interactive-chip inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
    >
      <span>{isExporting ? 'در حال ساخت تصویر...' : 'دانلود کارت گرافیکی گزارش محله (مناسب تلگرام و واتس‌اپ)'}</span>
    </button>
  );
};


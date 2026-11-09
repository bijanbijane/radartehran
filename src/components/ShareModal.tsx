import React, { useState } from 'react';
import { AlertCircle, Check, Copy, Download, Image as ImageIcon, Loader2, Share2, X } from 'lucide-react';
import { BubbleReport, EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../data/realMarketPriceAggregator';
import { type AreaUnit, convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency, formatUnitBuyPriceTitle, type IntlCurrencyCode, type RadarLocale } from '../utils/areaUnit';
import { AreaUnitToggle, useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import { clampNumber, recordDiagnosticEvent, sanitizeInput } from '../utils/security';
import { useDialogFocus } from './useDialogFocus';

export interface ShareModalProps {
  open: boolean; onClose: () => void; selectedHood: EvaluatedNeighborhood; marketReport: BubbleReport;
  bestIndicator: { label: string; score: number }; copiedShare: boolean; onCopyShareCard: () => void;
  activeCityNameFa?: string; areaUnit?: string; intlCurrency?: string;
}

function drawSafeRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

async function generateStoryImage(
  hood: EvaluatedNeighborhood, marketReport: BubbleReport, bestIndicator: { label: string; score: number },
  cityNameFa: string = 'تهران', hostLabel: string = 'TehranRadar.ir', areaUnit: AreaUnit = 'sqm',
  intlCurrency: IntlCurrencyCode = 'IRT', locale: RadarLocale = 'fa'
): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready;
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1920;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas 2D context is not available');
  const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1920);
  bgGrad.addColorStop(0, '#090d16'); bgGrad.addColorStop(0.4, '#0f172a'); bgGrad.addColorStop(0.85, '#064e3b'); bgGrad.addColorStop(1, '#022c22');
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, 1080, 1920);
  const radialGlow = ctx.createRadialGradient(540, 480, 50, 540, 480, 600);
  radialGlow.addColorStop(0, 'rgba(16, 185, 129, 0.22)'); radialGlow.addColorStop(1, 'rgba(16, 185, 129, 0)');
  ctx.fillStyle = radialGlow; ctx.fillRect(0, 0, 1080, 1920);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.4)'; ctx.lineWidth = 3;
  ctx.beginPath(); drawSafeRoundRect(ctx, 290, 140, 500, 70, 35); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#34d399'; ctx.font = 'bold 30px "Vazirmatn", "IRANSans", "Tahoma", sans-serif';
  ctx.fillText(`رادار هوشمند مسکن ${cityNameFa} ۱۴۰۵`, 540, 175);
  ctx.fillStyle = '#94a3b8'; ctx.font = '600 36px "Vazirmatn", "IRANSans", "Tahoma", sans-serif';
  ctx.fillText(hood.zone, 540, 270);
  ctx.fillStyle = '#ffffff'; ctx.font = '900 86px "Vazirmatn", "IRANSans", "Tahoma", sans-serif';
  ctx.fillText(`محله ${hood.name}`, 540, 360);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'; ctx.strokeStyle = 'rgba(52, 211, 153, 0.5)'; ctx.lineWidth = 4;
  ctx.beginPath(); drawSafeRoundRect(ctx, 140, 450, 800, 240, 36); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#94a3b8'; ctx.font = '600 32px "Vazirmatn", "IRANSans", "Tahoma", sans-serif';
  ctx.fillText('امتیاز جامع کیفیت سکونت و سرمایه‌گذاری', 540, 510);
  ctx.fillStyle = '#10b981'; ctx.font = '900 96px "Vazirmatn", "IRANSans", "Tahoma", sans-serif';
  ctx.fillText(`${toPersianNum(hood.overallScore)}`, 500, 600);
  ctx.fillStyle = '#64748b'; ctx.font = '500 42px "Vazirmatn", "IRANSans", "Tahoma", sans-serif';
  ctx.fillText(' / ۱۰', 630, 610);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'; ctx.lineWidth = 2;
  ctx.beginPath(); drawSafeRoundRect(ctx, 140, 730, 385, 220, 28); ctx.fill(); ctx.stroke();
  const storyUnitBuy = convertPricePerSqmToUnit(hood.baseBuyPerSqm ?? hood.buyPerSqm, areaUnit);
  const storyBuyFx = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(storyUnitBuy, intlCurrency, locale)})` : '';
  const storyRahnFx = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(hood.rahn80m, intlCurrency, locale)})` : '';
  ctx.fillStyle = '#cbd5e1'; ctx.font = '500 28px "Vazirmatn", "IRANSans", "Tahoma", sans-serif';
  ctx.fillText(formatUnitBuyPriceTitle(areaUnit), 332, 790);
  ctx.fillStyle = '#f8fafc'; ctx.font = intlCurrency !== 'IRT' ? '800 36px "Vazirmatn"' : '900 52px "Vazirmatn"';
  ctx.fillText(`${toPersianNum(storyUnitBuy)} م${storyBuyFx}`, 332, 875);
  ctx.beginPath(); drawSafeRoundRect(ctx, 555, 730, 385, 220, 28); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#cbd5e1'; ctx.font = '500 28px "Vazirmatn", "IRANSans", "Tahoma", sans-serif';
  ctx.fillText(`رهن کامل (${formatAreaShort(80, areaUnit)})`, 747, 790);
  ctx.fillStyle = '#34d399'; ctx.font = intlCurrency !== 'IRT' ? '800 36px "Vazirmatn"' : '900 52px "Vazirmatn"';
  ctx.fillText(`${toPersianNum(hood.rahn80m)} م${storyRahnFx}`, 747, 875);
  if (hood.bargains?.[0]) {
    ctx.fillText(`شکار امروز (${formatAreaShort(hood.bargains[0].sqm, areaUnit)}): ${hood.bargains[0].priceText}`, 540, 980);
  }
  const dataUrl = canvas.toDataURL('image/png', 0.95);
  const downloadLink = document.createElement('a'); downloadLink.href = dataUrl;
  downloadLink.download = `tehran-radar-story-${hood.id}-${hood.name}.png`;
  document.body.appendChild(downloadLink); downloadLink.click(); document.body.removeChild(downloadLink);
}

export function ShareModal({
  open, onClose, selectedHood, marketReport, bestIndicator, copiedShare, onCopyShareCard,
  activeCityNameFa = 'تهران', areaUnit: propAreaUnit, intlCurrency: propIntlCurrency,
}: ShareModalProps): React.ReactElement | null {
  const [ctxAreaUnit] = useAreaUnit(); const [locale] = useRadarLocale(); const [ctxIntlCurrency] = useIntlCurrency();
  const areaUnit = (propAreaUnit as any) ?? ctxAreaUnit; const intlCurrency = (propIntlCurrency as any) ?? ctxIntlCurrency;
  const isEn = locale === 'en';
  const storyTotal80mMillions = (selectedHood?.buyPerSqm ?? 100) * 80;
  const monthlyRent80mMillions = Math.round((selectedHood?.rahn80m ?? 1000) * 0.03);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [storyGeneratedSuccess, setStoryGeneratedSuccess] = useState(false);
  const dialogRef = useDialogFocus(open, onClose);

  if (!open) return null;
  const hostLabel = typeof window !== 'undefined' && window.location.host && !window.location.host.includes('localhost') && !window.location.host.includes('127.0.0.1') ? window.location.host : 'TehranRadar.ir';

  const handleSafeCopyClick = (): void => {
    try {
      onCopyShareCard();
      recordDiagnosticEvent('ShareModal', `Copied share card for ${selectedHood?.name || 'hood'}`, 'success');
    } catch {
      recordDiagnosticEvent('ShareModal', 'Failed to copy share card', 'fallback');
    }
  };

  const handleDownloadStoryClick = async (): Promise<void> => {
    if (!selectedHood) return;
    setIsGeneratingStory(true);
    try {
      await generateStoryImage(selectedHood, marketReport, bestIndicator, activeCityNameFa, hostLabel, areaUnit, intlCurrency, locale);
      setStoryGeneratedSuccess(true);
      recordDiagnosticEvent('ShareModal', `Generated story PNG for ${selectedHood.name}`, 'success');
      setTimeout(() => setStoryGeneratedSuccess(false), 3000);
    } catch (err) {
      recordDiagnosticEvent('ShareModal', `Story PNG generation failed: ${String(err)}`, 'fallback');
    } finally {
      setIsGeneratingStory(false);
    }
  };

  if (!selectedHood) {
    return (
      <div role="dialog" aria-modal="true" aria-label="کارت کارنامه محله" onClick={onClose} className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="apple-window-sheet bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 text-center space-y-3 focus:outline-none">
          <AlertCircle className="w-6 h-6 stroke-[1.75] text-amber-600 mx-auto" />
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">محله‌ای برای اشتراک‌گذاری انتخاب نشده است.</p>
          <button type="button" aria-label={isEn ? 'Close' : 'بستن کارت اشتراک‌گذاری'} onClick={onClose} className="px-4 py-2 rounded-[10px] bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer">بستن</button>
        </div>
      </div>
    );
  }

  const safeZone = sanitizeInput(selectedHood.zone, 80) || 'تهران';
  const safeName = sanitizeInput(selectedHood.name, 60) || 'محله';
  const safeOverall = clampNumber(selectedHood.overallScore, 1, 10, 8.0);
  const safeBuy = clampNumber(selectedHood.baseBuyPerSqm ?? selectedHood.buyPerSqm, 10, 2000, 120);
  const safeRahn = clampNumber(selectedHood.rahn80m, 50, 25000, 1400);
  const safeBadge = sanitizeInput((marketReport?.badgeText || 'متعادل').replace(/^[💎⚖️🔥🟢🟡🔴]+\s*/, ''), 80);
  const safeBestLabel = sanitizeInput(bestIndicator?.label || 'کیفیت محله', 60);
  const safeBestScore = clampNumber(bestIndicator?.score, 1, 10, 8.5);

  return (
    <div dir={isEn ? 'ltr' : 'rtl'} role="dialog" aria-modal="true" aria-label={isEn ? 'Neighborhood Scorecard' : 'کارت کارنامه محله'} onClick={onClose} className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="apple-window-sheet bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl max-w-sm w-full p-5 space-y-3.5 max-h-[92vh] overflow-y-auto focus:outline-none shadow-2xl">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200/70 dark:border-slate-800">
          <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Share2 className="w-3.5 h-3.5 stroke-[1.75]" />
            </span>
            <span>{isEn ? 'Neighborhood Scorecard & Story' : 'کارت کارنامه و استوری محله'}</span>
          </span>
          <div className="flex items-center gap-1.5">
            <AreaUnitToggle compact showIntlControls />
            <button type="button" aria-label={isEn ? 'Close' : 'بستن کارت اشتراک‌گذاری'} onClick={onClose} className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer transition">
              <X className="w-4 h-4 stroke-[1.75]" />
            </button>
          </div>
        </div>

        <div className="apple-grouped-card bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3">
            <div>
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">{safeZone}</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{isEn ? safeName : `محله ${safeName}`}</div>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 rounded-xl px-3 py-1.5 text-center">
              <div className="text-[10px] text-slate-500 dark:text-slate-400">{isEn ? 'Score' : 'امتیاز کل'}</div>
              <div className="text-lg font-black text-emerald-700 dark:text-emerald-400 tabular-nums">{toPersianNum(safeOverall)}<span className="text-xs font-normal text-slate-400"> / ۱۰</span></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 p-2.5 rounded-xl">
              <div className="text-slate-500 dark:text-slate-400 text-[11px]">{formatUnitBuyPriceTitle(areaUnit)}:</div>
              <div className="font-extrabold text-slate-900 dark:text-white text-sm mt-0.5 tabular-nums">{toPersianNum(convertPricePerSqmToUnit(safeBuy, areaUnit))} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(safeBuy, areaUnit), intlCurrency, locale)})` : ''}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">معامله v6.4: {toPersianNum(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, safeBuy, []).estimatedDealPricePerSqm, areaUnit))} م</div>
            </div>
            <div className="bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 p-2.5 rounded-xl">
              <div className="text-slate-500 dark:text-slate-400 text-[11px]">{isEn ? 'Full Deposit (80m²):' : `رهن کامل ${formatAreaShort(80, areaUnit)}:`}</div>
              <div className="font-extrabold text-emerald-700 dark:text-emerald-400 text-sm mt-0.5 tabular-nums">{toPersianNum(safeRahn)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(safeRahn, intlCurrency, locale)})` : ''}</div>
              <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5 tabular-nums">{isEn ? `Rent: ${toPersianNum(Math.round(safeRahn * 0.03))}M` : `اجاره ماهانه: ${toPersianNum(Math.round(safeRahn * 0.03))} م`}</div>
            </div>
          </div>

          <div className="space-y-2 text-xs bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">{isEn ? 'Market Status:' : 'وضعیت بازار:'}</span>
              <span className="font-bold text-slate-900 dark:text-white">{safeBadge}</span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60 dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400">{isEn ? 'Best Indicator:' : 'بهترین شاخص محله:'}</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{safeBestLabel} ({toPersianNum(safeBestScore)} / ۱۰)</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-[11px] text-center bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 p-2 rounded-xl tabular-nums text-slate-600 dark:text-slate-300">
            <div>هوا: <strong className="text-slate-900 dark:text-white">{toPersianNum(selectedHood.air)}</strong></div>
            <div>آب و برق: <strong className="text-slate-900 dark:text-white">{toPersianNum(selectedHood.powerWater)}</strong></div>
            <div>اینترنت: <strong className="text-slate-900 dark:text-white">{toPersianNum(selectedHood.internet)}</strong></div>
            <div>مترو: <strong className="text-slate-900 dark:text-white">{toPersianNum(selectedHood.metro)}</strong></div>
            <div>امنیت: <strong className="text-slate-900 dark:text-white">{toPersianNum(selectedHood.security)}</strong></div>
            <div>همواری: <strong className="text-slate-900 dark:text-white">{toPersianNum(selectedHood.flatTerrain)}</strong></div>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <button type="button" onClick={handleDownloadStoryClick} disabled={isGeneratingStory} aria-label={isEn ? 'Download Story Image' : 'دانلود تصویر آماده استوری'} className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs transition flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-60">
            {isGeneratingStory ? (
              <><Loader2 className="w-4 h-4 animate-spin" /><span>{isEn ? 'Rendering Story (1080×1920)...' : 'در حال رندر تصویر استوری (1080×1920)...'}</span></>
            ) : storyGeneratedSuccess ? (
              <><Check className="w-4 h-4 stroke-[1.75]" /><span>{isEn ? 'Story downloaded!' : 'تصویر استوری دانلود شد!'}</span></>
            ) : (
              <><ImageIcon className="w-4 h-4 stroke-[1.75]" /><Download className="w-4 h-4 stroke-[1.75]" /><span>{isEn ? 'Download Story Image (PNG HD)' : 'دانلود تصویر آماده استوری (PNG HD)'}</span></>
            )}
          </button>
          <button type="button" onClick={handleSafeCopyClick} aria-label={isEn ? 'Copy text summary' : 'کپی متن کارنامه برای پیام‌رسان‌ها'} className="w-full py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer">
            {copiedShare ? (
              <><Check className="w-4 h-4 stroke-[1.75]" /><span>{isEn ? 'Copied to clipboard!' : 'کپی شد! آماده ارسال'}</span></>
            ) : (
              <><Copy className="w-4 h-4 stroke-[1.75]" /><span>{isEn ? 'Copy text summary' : 'کپی متن کارنامه برای تلگرام / واتساپ'}</span></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
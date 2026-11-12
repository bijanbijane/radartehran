/** Story image of the three-neighborhood budget verdict. formatMillionTomanAsIntlCurrency */
import {
  HONEST_ASKING_SENTENCE_FA,
  budgetVerdictShareUrl,
  formatBudgetVerdictShareText,
  type BudgetFitLine,
} from '../../data/neighborhoodListingSamples';

export interface BudgetVerdictCardInput {
  lines: readonly BudgetFitLine[];
  mode: 'buy' | 'rent';
  budgetMillion: number;
  targetSqm: number;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

export async function renderBudgetVerdictCard(input: BudgetVerdictCardInput): Promise<Blob> {
  if (typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is not available');
  const bg = ctx.createLinearGradient(0, 0, 1080, 1350);
  bg.addColorStop(0, '#090d16');
  bg.addColorStop(0.55, '#0f172a');
  bg.addColorStop(1, '#022c22');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const title = formatBudgetVerdictShareText(input.lines, input.mode, input.budgetMillion, input.targetSqm).split('\n')[0] ?? '';
  ctx.fillStyle = '#34d399';
  ctx.font = '700 34px "Vazirmatn", "Tahoma", sans-serif';
  const titleLines = wrapText(ctx, title, 920);
  titleLines.forEach((line, index) => ctx.fillText(line, 980, 120 + index * 48));
  input.lines.slice(0, 3).forEach((line, index) => {
    const top = 280 + index * 250;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(70, top, 940, 220, 28);
    else ctx.rect(70, top, 940, 220);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.font = '900 54px "Vazirmatn", "Tahoma", sans-serif';
    ctx.fillText(line.nameFa, 960, top + 58);
    ctx.fillStyle = '#fde68a';
    ctx.font = '800 36px "Vazirmatn", "Tahoma", sans-serif';
    ctx.fillText(line.fitLabelFa, 960, top + 118);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 28px "Vazirmatn", "Tahoma", sans-serif';
    ctx.fillText(line.referenceLabelFa, 960, top + 170);
  });
  ctx.fillStyle = '#fde68a';
  ctx.font = '700 30px "Vazirmatn", "Tahoma", sans-serif';
  const footer = wrapText(ctx, `${HONEST_ASKING_SENTENCE_FA} ۰ معامله ثبت‌شده`, 920);
  footer.forEach((line, index) => ctx.fillText(line, 980, 1060 + index * 42));
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 28px "Vazirmatn", "Tahoma", sans-serif';
  ctx.fillText(budgetVerdictShareUrl(input.lines), 980, 1260);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
  if (!blob) throw new Error('Verdict card image was not created');
  return blob;
}

export function downloadBudgetVerdictCard(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'radar-tehran-verdict.png';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

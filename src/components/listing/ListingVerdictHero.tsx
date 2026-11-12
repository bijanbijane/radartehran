/** @file ListingVerdictHero — primary day-one entry: paste listing, get epistemic verdict. OP-DEC-001: formatMillionTomanAsIntlCurrency */
import React, { useState, useEffect } from 'react';
import { ShieldAlert, Sparkles, ExternalLink } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import { toPersianNum } from '../../data/neighborhoods';
import type { CityId } from '../../types/models';
import { LABEL_ADS_NOT_TRANSACTIONS_FA } from '../../utils/epistemicUiLabels';
import { buildListingVerdict, type ListingVerdictOk } from '../../utils/listingVerdictService';

export interface ListingVerdictHeroProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  cityKey?: CityId | string;
  defaultHoodName?: string;
  initialListingText?: string;
  onOpenFullModal?: () => void;
}

export function ListingVerdictHero({
  evaluatedNeighborhoods,
  cityKey = 'tehran',
  defaultHoodName = 'پونک',
  initialListingText = '',
  onOpenFullModal,
}: ListingVerdictHeroProps): React.ReactElement {
  const [text, setText] = useState(initialListingText);
  const [hoodName, setHoodName] = useState(defaultHoodName);
  const [loading, setLoading] = useState(false);
  const [verdict, setVerdict] = useState<ListingVerdictOk | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialListingText) setText(initialListingText);
  }, [initialListingText]);

  useEffect(() => {
    if (defaultHoodName) setHoodName(defaultHoodName);
  }, [defaultHoodName]);

  const hoodOptions = evaluatedNeighborhoods.slice(0, 40);

  const runVerdict = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setVerdict(null);
    try {
      const result = await buildListingVerdict({
        city: cityKey,
        hoodName,
        listingText: text,
        mode: 'buy',
      });
      if (result.status === 'error') {
        setError(result.messageFa);
        return;
      }
      setVerdict(result);
    } catch {
      setError('بررسی آگهی انجام نشد. اتصال یا دادهٔ زنده را دوباره امتحان کنید.');
    } finally {
      setLoading(false);
    }
  };

  const d = verdict?.diagnosis;

  return (
    <section
      className="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50/90 to-white dark:from-emerald-950/30 dark:to-slate-900 p-4 sm:p-5 space-y-3"
      data-testid="listing-verdict-hero"
    >
      <div className="flex items-start gap-2">
        <div className="p-2 rounded-xl bg-emerald-600 text-white shrink-0">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">حکم آگهی — مقایسه با فایل‌های مشابه</h2>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">متن یا لینک آگهی را بگذارید. خروجی قابل‌چک است؛ آگهی ≠ معاملهٔ ثبت‌شده.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-center text-[10px]">
        <label htmlFor="listing-verdict-hood" className="text-slate-500 shrink-0">محله:</label>
        <select
          id="listing-verdict-hood"
          aria-label="محله برای مقایسه آگهی"
          value={hoodName}
          onChange={(e) => setHoodName(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-bold text-xs"
        >
          {hoodOptions.length > 0
            ? hoodOptions.map((h) => <option key={h.id} value={h.name}>{h.name}</option>)
            : <option value={hoodName}>{hoodName}</option>}
        </select>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="لینک divar.ir یا متن آگهی: متراژ، قیمت، محله..."
        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-xs"
        aria-label="متن یا لینک آگهی"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading || !text.trim()}
          onClick={() => void runVerdict()}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer flex items-center gap-1"
        >
          <Sparkles className="w-3.5 h-3.5" /> {loading ? 'در حال خواندن…' : 'بررسی فوری'}
        </button>
        {onOpenFullModal && (
          <button
            type="button"
            onClick={onOpenFullModal}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer"
          >
            کارشناسی کامل + تله‌ها
          </button>
        )}
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">{error}</p>}
      {verdict && d && (
        <div className="space-y-2 text-xs border-t border-emerald-100 dark:border-emerald-900/40 pt-3">
          {verdict.hoodMismatchWarningFa && (
            <p
              className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-2"
              data-testid="listing-verdict-hood-mismatch"
            >
              {verdict.hoodMismatchWarningFa}
            </p>
          )}
          <p className="font-bold text-slate-800 dark:text-slate-100">{d.verdictLabelFa}</p>
          <p>
            آگهی: متری {toPersianNum(d.parsed.askingPricePerSqm)} م · جمع {toPersianNum(d.parsed.askingPriceTotalMillion)} م
            {' · '}
            مرجع: {d.benchmarkLabelFa} ({toPersianNum(d.referenceBenchmarkPerSqm)} م/م)
          </p>
          {d.comparables.length > 0 ? (
            <ul className="max-h-36 overflow-y-auto space-y-1">
              {d.comparables.slice(0, 8).map((c) => (
                <li key={c.token || c.title} className="flex justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-1">
                  <span className="truncate">{c.title.slice(0, 48)} · {toPersianNum(c.sqm)}م · {toPersianNum(c.perSqmMillion)} م/م</span>
                  <a href={c.divarUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-emerald-700 font-bold flex items-center gap-0.5">
                    دیوار <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              ))}
            </ul>
          ) : d.insufficientLiveSample ? (
            <p className="text-amber-700 dark:text-amber-400">نمونهٔ زندهٔ کافی برای میانهٔ دقیق نیست؛ مرجع داخلی نمایش داده شد.</p>
          ) : null}
          <p className="text-[10px] text-slate-500">{verdict.disclaimerFa || LABEL_ADS_NOT_TRANSACTIONS_FA}</p>
        </div>
      )}
    </section>
  );
}

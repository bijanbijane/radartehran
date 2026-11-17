/**
 * @file src/components/modals/ContractRoomShieldModal.tsx
 * @description Stages 198–200: Interactive Contract-Room Shield with controlled amount lifecycle,
 * range-aligned validation, async race-safe clipboard handling, and WCAG dialog + tablist accessibility.
 */

import React, { useState, useMemo, useEffect, useRef, useId } from 'react';
import { X, ShieldCheck, Scale, AlertTriangle, Copy, Check, FileText, Clock, HelpCircle } from 'lucide-react';
import { toPersianNum as toPersianDigits } from '../../data/neighborhoods';
import { calculateContractShield, STAGING_PROFILES, type StagingProfileId } from '../../utils/contractRoomShieldEngine';
import {
  CONTRACT_SHIELD_MAX_MILLION,
  CONTRACT_SHIELD_MIN_MILLION,
  validateContractTotalMillion,
} from '../../features/tools/services/toolsCatalogEngine';
import { formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';
import { useExchangeRateSnapshot, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { useDialogFocus } from '../useDialogFocus';

export type ContractShieldTabId = 'staging' | 'clauses' | 'counterTactics';

export interface ContractRoomShieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTotalMillion?: number;
  contextKey?: string;
}

type CopyFeedbackState =
  | { status: 'idle' }
  | { status: 'copied'; id: string }
  | { status: 'error'; id: string; messageFa: string };

const TAB_ITEMS: ReadonlyArray<{ id: ContractShieldTabId; label: string; icon: typeof Clock }> = [
  { id: 'staging', label: 'تقویم ۳ مرحله‌ای پرداخت و چک‌ها', icon: Clock },
  { id: 'clauses', label: 'بندهای طلایی دست‌نویس در توضیحات', icon: FileText },
  { id: 'counterTactics', label: 'پاتک به شگردهای روانی بنگاه', icon: HelpCircle },
];

export function ContractRoomShieldModal({
  isOpen,
  onClose,
  initialTotalMillion = 12000,
  contextKey,
}: ContractRoomShieldModalProps) {
  const baseUid = useId();
  const titleId = `${baseUid}-title`;
  const [totalInputText, setTotalInputText] = useState<string>(() => String(initialTotalMillion));
  const [profileId, setProfileId] = useState<StagingProfileId>('READY_DEED_STANDARD');
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedbackState>({ status: 'idle' });
  const [activeTab, setActiveTab] = useState<ContractShieldTabId>('staging');
  const [intlCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();
  const rateState = useExchangeRateSnapshot();
  const dialogRef = useDialogFocus(isOpen, onClose);
  const copyTimerRef = useRef<number | null>(null);
  const copyOpIdRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const prevOpenRef = useRef<boolean>(false);
  const prevInitialRef = useRef<number>(initialTotalMillion);
  const prevContextKeyRef = useRef<string | undefined>(contextKey);
  const tabButtonRefs = useRef<Record<ContractShieldTabId, HTMLButtonElement | null>>({
    staging: null,
    clauses: null,
    counterTactics: null,
  });

  const clearCopyTimer = () => {
    if (copyTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      copyOpIdRef.current += 1;
      clearCopyTimer();
    };
  }, []);

  useEffect(() => {
    const justOpened = isOpen && !prevOpenRef.current;
    const contextChanged = prevInitialRef.current !== initialTotalMillion || prevContextKeyRef.current !== contextKey;

    if (!isOpen) {
      copyOpIdRef.current += 1;
      clearCopyTimer();
      if (prevOpenRef.current) setCopyFeedback({ status: 'idle' });
    } else if (justOpened || contextChanged) {
      setTotalInputText(String(initialTotalMillion));
      setCopyFeedback({ status: 'idle' });
      if (justOpened) setActiveTab('staging');
    }

    prevOpenRef.current = isOpen;
    prevInitialRef.current = initialTotalMillion;
    prevContextKeyRef.current = contextKey;
  }, [isOpen, initialTotalMillion, contextKey]);

  const validation = useMemo(() => validateContractTotalMillion(totalInputText), [totalInputText]);
  const shieldData = useMemo(
    () => (validation.valid && validation.value !== null ? calculateContractShield(validation.value, profileId) : null),
    [validation.valid, validation.value, profileId],
  );

  if (!isOpen) return null;

  const fxTag = (m: number) => (intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(m, intlCurrency, radarLocale, rateState.snapshot)})` : '');

  const handleCopy = async (id: string, text: string) => {
    const opId = ++copyOpIdRef.current;
    clearCopyTimer();
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clipboard || typeof clipboard.writeText !== 'function') {
      if (isMountedRef.current && copyOpIdRef.current === opId) {
        setCopyFeedback({
          status: 'error',
          id,
          messageFa: 'دسترسی به کلیپ‌بورد در این مرورگر فعال نیست؛ لطفاً متن را به‌صورت دستی کپی کنید.',
        });
      }
      return;
    }
    try {
      await clipboard.writeText(text);
      if (!isMountedRef.current || copyOpIdRef.current !== opId) return;
      setCopyFeedback({ status: 'copied', id });
      copyTimerRef.current = window.setTimeout(() => {
        copyTimerRef.current = null;
        if (isMountedRef.current && copyOpIdRef.current === opId) {
          setCopyFeedback({ status: 'idle' });
        }
      }, 2500);
    } catch {
      if (!isMountedRef.current || copyOpIdRef.current !== opId) return;
      setCopyFeedback({
        status: 'error',
        id,
        messageFa: 'کپی متن انجام نشد؛ دسترسی کلیپ‌بورد مسدود است یا خطایی رخ داد.',
      });
    }
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIdx: number) => {
    let nextIdx: number | null = null;
    if (e.key === 'ArrowLeft') nextIdx = (currentIdx + 1) % TAB_ITEMS.length;
    else if (e.key === 'ArrowRight') nextIdx = (currentIdx - 1 + TAB_ITEMS.length) % TAB_ITEMS.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = TAB_ITEMS.length - 1;
    if (nextIdx !== null) {
      e.preventDefault();
      const targetTab = TAB_ITEMS[nextIdx].id;
      setActiveTab(targetTab);
      tabButtonRefs.current[targetTab]?.focus();
    }
  };

  const copiedId = copyFeedback.status === 'copied' ? copyFeedback.id : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm" dir="rtl">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl text-slate-100 overflow-hidden font-sans">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 id={titleId} tabIndex={-1} data-dialog-initial-focus className="text-base sm:text-lg font-black text-white flex items-center gap-2 focus:outline-none">
                <span>سپر و دستیار زنده اتاق قرارداد</span>
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">ویژه نشست</span>
              </h2>
              <p className="text-xs text-slate-400">تقویم امن چک‌ها، وجه التزام متقارن و پاتک به شگردهای روانی مشاور املاک</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="بستن" className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 bg-slate-950/60 border-b border-slate-800/80 space-y-3">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <label htmlFor="total-price-input" className="text-xs text-slate-300 whitespace-nowrap font-medium">مبلغ کل معامله:</label>
              <div className="relative w-44 sm:w-48">
                <input
                  id="total-price-input"
                  type="number"
                  dir="ltr"
                  min={CONTRACT_SHIELD_MIN_MILLION}
                  max={CONTRACT_SHIELD_MAX_MILLION}
                  aria-invalid={!validation.valid}
                  aria-describedby={!validation.valid ? `${baseUid}-price-err` : undefined}
                  value={totalInputText}
                  onChange={(e) => setTotalInputText(e.target.value)}
                  className={`w-full pl-11 pr-3 py-1.5 rounded-lg bg-slate-800 border text-sm font-bold text-amber-400 text-left tabular-nums focus:outline-none ${validation.valid ? 'border-slate-700 focus:border-amber-500' : 'border-rose-500 focus:border-rose-400'}`}
                />
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">م.ت</span>
              </div>
              {intlCurrency !== 'IRT' && validation.valid && validation.value !== null && (
                <span className="text-[11px] text-emerald-300 font-semibold tabular-nums">
                  {formatMillionTomanAsIntlCurrency(validation.value, intlCurrency, radarLocale, rateState.snapshot)}
                </span>
              )}
              <div className="flex gap-1">
                {[8000, 15000, 25000].map((preset) => (
                  <button key={preset} type="button" onClick={() => setTotalInputText(String(preset))} className="px-2 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition-colors cursor-pointer">
                    {toPersianDigits(preset / 1000)}B
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(STAGING_PROFILES) as StagingProfileId[]).map((pid) => (
                <button
                  key={pid}
                  type="button"
                  aria-pressed={profileId === pid}
                  onClick={() => setProfileId(pid)}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${profileId === pid ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800'}`}
                >
                  {STAGING_PROFILES[pid].labelFa.split('(')[0]}
                </button>
              ))}
            </div>
          </div>
          {!validation.valid && validation.errorFa && (
            <p id={`${baseUid}-price-err`} role="alert" className="text-xs font-bold text-rose-400">
              {validation.errorFa}
            </p>
          )}
        </div>

        <div role="tablist" aria-label="بخش‌های سپر قرارداد" className="flex border-b border-slate-800 bg-slate-900/60 px-4">
          {TAB_ITEMS.map((tab, idx) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => { tabButtonRefs.current[tab.id] = el; }}
                id={`${baseUid}-tab-${tab.id}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`${baseUid}-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${selected ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <div role="status" aria-live="polite" className="sr-only">
            {copyFeedback.status === 'copied' ? 'متن انتخاب‌شده با موفقیت کپی شد.' : copyFeedback.status === 'error' ? copyFeedback.messageFa : ''}
          </div>
          {copyFeedback.status === 'error' && (
            <div role="alert" className="p-3 rounded-xl bg-rose-950/60 border border-rose-700/70 text-xs font-bold text-rose-200">
              {copyFeedback.messageFa}
            </div>
          )}

          {!shieldData ? (
            <div data-testid="contract-shield-invalid-state" className="p-6 rounded-xl bg-slate-800/60 border border-rose-500/40 text-center space-y-2">
              <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto" />
              <p className="text-sm font-bold text-white">محاسبه مراحل پرداخت متوقف شده است</p>
              <p className="text-xs text-slate-300">{validation.errorFa || 'لطفاً مبلغ معتبری وارد کنید.'}</p>
            </div>
          ) : (
            <>
              <div id={`${baseUid}-panel-staging`} role="tabpanel" aria-labelledby={`${baseUid}-tab-staging`} hidden={activeTab !== 'staging'} className="space-y-4">
                {activeTab === 'staging' && (
                  <>
                    <div className="p-3.5 rounded-xl bg-blue-950/40 border border-blue-800/60 flex items-start gap-3 text-xs">
                      <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-blue-300">{shieldData.katebSystemMandate.title}</h4>
                        <p className="text-blue-200/80 mt-1 leading-relaxed">{shieldData.katebSystemMandate.description}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {shieldData.stages.map((st, idx) => (
                        <div key={st.id} className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                              <span className="font-bold text-amber-400">{toPersianDigits(st.recommendedPct)}٪ ثمن</span>
                              <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">گام {toPersianDigits(idx + 1)}</span>
                            </div>
                            <h4 className="text-sm font-bold text-white mb-2">{st.stageName}</h4>
                            <div className="text-lg font-black text-amber-300 mb-2 tabular-nums">
                              {toPersianDigits(st.amountMillionToman.toLocaleString())} <span className="text-xs font-normal text-slate-300">میلیون تومان{fxTag(st.amountMillionToman)}</span>
                            </div>
                            <div className="text-[11px] text-slate-300 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 mb-2">
                              <strong className="text-emerald-400 block mb-1">موعد:</strong> {st.dueMilestone}
                            </div>
                          </div>
                          <div className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-700/50 pt-2">
                            <strong className="text-amber-400 block mb-0.5">کنترل امنیتی:</strong> {st.safetyCheck}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <span>وجه التزام تأخیر متقارن روزانه (پیشنهاد رادار):</span>
                        </div>
                        <p className="text-xs text-slate-300 mt-1">
                          روزانه <strong className="text-white font-bold">{toPersianDigits(shieldData.symmetricDailyPenaltyMillion)} میلیون تومان{fxTag(shieldData.symmetricDailyPenaltyMillion)}</strong> به ازای هر روز تأخیر طرفین در تخلیه یا محضر.
                        </p>
                      </div>
                      <button type="button" onClick={() => void handleCopy('penalty', shieldData.safetyClauses[0].clauseDraft)} aria-label={copiedId === 'penalty' ? 'متن بند وجه‌التزام کپی شد' : 'کپی متن بند وجه‌التزام'} className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer">
                        {copiedId === 'penalty' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedId === 'penalty' ? 'کپی شد' : 'کپی متن بند وجه‌التزام'}</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div id={`${baseUid}-panel-clauses`} role="tabpanel" aria-labelledby={`${baseUid}-tab-clauses`} hidden={activeTab !== 'clauses'} className="space-y-3">
                {activeTab === 'clauses' && (
                  <>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      این ۴ بند را با دست‌خط در بخش <strong>«توضیحات مبایعه‌نامه یا پیش‌نویس کاتب»</strong> درج و امضای طرفین را اخذ کنید تا ریسک‌های میلیاردی خنثی شوند:
                    </p>
                    {shieldData.safetyClauses.map((clause) => (
                      <div key={clause.id} className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/80">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-amber-400">{clause.title}</span>
                          <button type="button" onClick={() => void handleCopy(clause.id, clause.clauseDraft)} aria-label={copiedId === clause.id ? `${clause.title} کپی شد` : `کپی ${clause.title}`} className="text-xs text-slate-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer">
                            {copiedId === clause.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedId === clause.id ? 'کپی شد' : 'کپی متن'}</span>
                          </button>
                        </div>
                        <p className="text-xs text-slate-200 leading-relaxed font-mono bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 mb-2 select-all">«{clause.clauseDraft}»</p>
                        <p className="text-[11px] text-slate-400 leading-normal"><strong className="text-slate-300">چرا حیاتی است:</strong> {clause.whyCrucial}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div id={`${baseUid}-panel-counterTactics`} role="tabpanel" aria-labelledby={`${baseUid}-tab-counterTactics`} hidden={activeTab !== 'counterTactics'} className="space-y-3">
                {activeTab === 'counterTactics' && (
                  <>
                    <p className="text-xs text-slate-400 leading-relaxed">در مواجهه با هریک از فشارهای روانی مرسوم در اتاق نشست بنگاه، خونسرد باشید و از این پاسخ‌های منطقی و قاطع استفاده کنید:</p>
                    {shieldData.psychologicalCounterTactics.map((tac) => (
                      <div key={tac.id} className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/80 space-y-2">
                        <div className="text-xs text-red-300 font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400 shrink-0" /><span>فشار مشاور: {tac.brokerTrap}</span></div>
                        <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded-lg border border-slate-800"><strong className="text-slate-300">واقعیت پشت‌پرده:</strong> {tac.realTruth}</div>
                        <div className="text-xs text-emerald-300 bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-800/40 flex items-start justify-between gap-2">
                          <p className="leading-relaxed"><strong className="text-emerald-400 block mb-0.5">پاتک کلامی شما:</strong> {tac.calmCounterResponse}</p>
                          <button type="button" onClick={() => void handleCopy(tac.id, tac.calmCounterResponse)} className="shrink-0 p-1.5 rounded bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 transition-colors cursor-pointer" aria-label={copiedId === tac.id ? 'پاسخ کپی شد' : 'کپی پاسخ'} title="کپی پاسخ">
                            {copiedId === tac.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400">
          <span>رادار مسکن · سنگر بی‌طرف خریدار</span>
          <button type="button" onClick={onClose} className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors cursor-pointer">
            بستن پنجره
          </button>
        </div>
      </div>
    </div>
  );
}

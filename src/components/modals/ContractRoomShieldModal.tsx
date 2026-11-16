/**
 * @file src/components/modals/ContractRoomShieldModal.tsx
 * @description Interactive Contract-Room Shield and Live Negotiation Defense Assistant.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { X, ShieldCheck, Scale, AlertTriangle, Copy, Check, FileText, Clock, HelpCircle } from 'lucide-react';
import { toPersianNum as toPersianDigits } from '../../data/neighborhoods';
import { calculateContractShield, STAGING_PROFILES, type StagingProfileId } from '../../utils/contractRoomShieldEngine';
import { formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';
import { useExchangeRateSnapshot, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';

interface ContractRoomShieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTotalMillion?: number;
}

export function ContractRoomShieldModal({ isOpen, onClose, initialTotalMillion = 12000 }: ContractRoomShieldModalProps) {
  const [totalMillion, setTotalMillion] = useState<number>(initialTotalMillion);
  const [profileId, setProfileId] = useState<StagingProfileId>('READY_DEED_STANDARD');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'staging' | 'clauses' | 'counterTactics'>('staging');
  const [intlCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();
  useExchangeRateSnapshot();
  const fxTag = (m: number) => (intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(m, intlCurrency, radarLocale)})` : '');

  const shieldData = useMemo(() => calculateContractShield(totalMillion, profileId), [totalMillion, profileId]);
  useEffect(() => {
    if (isOpen) setTotalMillion(initialTotalMillion);
  }, [isOpen, initialTotalMillion]);

  if (!isOpen) return null;

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="contract-shield-title">
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl text-slate-100 overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 id="contract-shield-title" className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>سپر و دستیار زنده اتاق قرارداد</span>
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">ویژه نشست</span>
              </h2>
              <p className="text-xs text-slate-400">تقویم امن چک‌ها، وجه التزام متقارن و پاتک به شگردهای روانی مشاور املاک</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="بستن" className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Price & Profile Bar */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800/80 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <label htmlFor="total-price-input" className="text-xs text-slate-300 whitespace-nowrap font-medium">مبلغ کل معامله:</label>
            <div className="relative flex-1 sm:w-48">
              <input
                id="total-price-input"
                type="number"
                value={totalMillion}
                onChange={(e) => setTotalMillion(Math.max(500, parseInt(e.target.value, 10) || 500))}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm font-bold text-amber-400 focus:outline-none focus:border-amber-500"
              />
              <span className="absolute left-2.5 top-2 text-[10px] text-slate-400">م.ت</span>
            </div>
            {intlCurrency !== 'IRT' && (
              <span className="text-[11px] text-emerald-300 font-semibold tabular-nums">
                {formatMillionTomanAsIntlCurrency(totalMillion, intlCurrency, radarLocale)}
              </span>
            )}
            <div className="flex gap-1">
              {[8000, 15000, 25000].map((preset) => (
                <button key={preset} onClick={() => setTotalMillion(preset)} className="px-2 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition-colors">
                  {toPersianDigits(preset / 1000)}B
                </button>
              ))}
            </div>
          </div>

          {/* Profile selector */}
          <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0">
            {(Object.keys(STAGING_PROFILES) as StagingProfileId[]).map((pid) => (
              <button
                key={pid}
                onClick={() => setProfileId(pid)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium whitespace-nowrap transition-colors ${
                  profileId === pid ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {STAGING_PROFILES[pid].labelFa.split('(')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/60 px-4">
          <button
            onClick={() => setActiveTab('staging')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'staging' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>تقویم ۳ مرحله‌ای پرداخت و چک‌ها</span>
          </button>
          <button
            onClick={() => setActiveTab('clauses')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'clauses' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>بندهای طلایی دست‌نویس در توضیحات</span>
          </button>
          <button
            onClick={() => setActiveTab('counterTactics')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'counterTactics' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>پاتک به شگردهای روانی بنگاه</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {activeTab === 'staging' && (
            <div className="space-y-4">
              {/* Mandatory Kateb Notice */}
              <div className="p-3.5 rounded-xl bg-blue-950/40 border border-blue-800/60 flex items-start gap-3 text-xs">
                <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-blue-300">{shieldData.katebSystemMandate.title}</h4>
                  <p className="text-blue-200/80 mt-1 leading-relaxed">{shieldData.katebSystemMandate.description}</p>
                </div>
              </div>

              {/* 3 Staging Cards */}
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

              {/* Daily Penalty Box */}
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
                <button
                  onClick={() => handleCopy('penalty', shieldData.safetyClauses[0].clauseDraft)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0"
                >
                  {copiedId === 'penalty' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === 'penalty' ? 'کپی شد' : 'کپی متن بند وجه‌التزام'}</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'clauses' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 leading-relaxed">
                این ۴ بند را با دست‌خط در بخش <strong>«توضیحات مبایعه‌نامه یا پیش‌نویس کاتب»</strong> درج و امضای طرفین را اخذ کنید تا ریسک‌های میلیاردی خنثی شوند:
              </p>
              {shieldData.safetyClauses.map((clause) => (
                <div key={clause.id} className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-400">{clause.title}</span>
                    <button
                      onClick={() => handleCopy(clause.id, clause.clauseDraft)}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 transition-colors"
                    >
                      {copiedId === clause.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === clause.id ? 'کپی شد' : 'کپی متن'}</span>
                    </button>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed font-mono bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 mb-2 select-all">
                    «{clause.clauseDraft}»
                  </p>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    <strong className="text-slate-300">چرا حیاتی است:</strong> {clause.whyCrucial}
                  </p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'counterTactics' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 leading-relaxed">
                در مواجهه با هریک از فشارهای روانی مرسوم در اتاق نشست بنگاه، خونسرد باشید و از این پاسخ‌های منطقی و قاطع استفاده کنید:
              </p>
              {shieldData.psychologicalCounterTactics.map((tac) => (
                <div key={tac.id} className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/80 space-y-2">
                  <div className="text-xs text-red-300 font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>فشار مشاور: {tac.brokerTrap}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                    <strong className="text-slate-300">واقعیت پشت‌پرده:</strong> {tac.realTruth}
                  </div>
                  <div className="text-xs text-emerald-300 bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-800/40 flex items-start justify-between gap-2">
                    <p className="leading-relaxed">
                      <strong className="text-emerald-400 block mb-0.5">پاتک کلامی شما:</strong> {tac.calmCounterResponse}
                    </p>
                    <button
                      onClick={() => handleCopy(tac.id, tac.calmCounterResponse)}
                      className="shrink-0 p-1.5 rounded bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 transition-colors"
                      title="کپی پاسخ"
                    >
                      {copiedId === tac.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400">
          <span>رادار مسکن · سنگر بی‌طرف خریدار</span>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors">
            بستن پنجره
          </button>
        </div>
      </div>
    </div>
  );
}

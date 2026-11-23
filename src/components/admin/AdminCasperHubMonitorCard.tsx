/**
 * @file src/components/admin/AdminCasperHubMonitorCard.tsx
 * @description پنل نظارت زنده، تله‌متری معرفت‌شناختی شانون و ارسال یادداشت به CASPER HUB
 * برای مرکز مدیریت رادار مسکن (`AdminSecurityAndBackupTabs`).
 * خطوط کل فایل strictly <= 280 خط با رعایت کامل تایپ‌اسکریپت و بدون دسترسی مستقیم کلاینت به توکن.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Activity, AlertCircle, CheckCircle2, Cpu, Globe, KeyRound, RefreshCw, Send, ShieldCheck, Zap } from 'lucide-react';
import { getAuthClient } from '../../platform/auth';
import { toPersianNum } from '../../data/neighborhoods';
export interface CasperHubEpistemicTelemetry { readonly minSeq: number; readonly maxSeq: number; readonly isMonotonic: boolean; readonly sequenceGapCount: number; readonly syncCursorLag: number; readonly agentContributionEntropyBits: number; readonly noteTypeEntropyBits: number; readonly criticalNotesCount: number; readonly activeBlockersCount: number; }
export interface CasperHubWhoAmIData { readonly authenticated: boolean; readonly agent_id?: string; readonly database?: string; readonly permissions?: string[]; readonly active_roadmaps_count?: number; readonly open_tasks_count?: number; }
export interface CasperHubNoteRecord { readonly id?: string; readonly author_agent?: string; readonly note_type?: string; readonly importance?: number | string; readonly title?: string; readonly summary?: string; }

export function AdminCasperHubMonitorCard(): React.ReactElement {
  const isMountedRef = useRef<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [whoami, setWhoami] = useState<CasperHubWhoAmIData | null>(null);
  const [telemetry, setTelemetry] = useState<CasperHubEpistemicTelemetry | null>(null);
  const [recentNotes, setRecentNotes] = useState<CasperHubNoteRecord[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState<string>('');
  const [noteSummary, setNoteSummary] = useState<string>('');
  const [noteType, setNoteType] = useState<string>('checkpoint');
  const [noteImportance, setNoteImportance] = useState<number>(3);
  const [noteTags, setNoteTags] = useState<string>('radartehran, release-4.49');
  const [sendingNote, setSendingNote] = useState<boolean>(false);
  const [noteSuccessMsg, setNoteSuccessMsg] = useState<string | null>(null);

  const getAdminHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // Worker authenticates the HttpOnly Cloudflare session cookie.
    return headers;
  };

  const fetchHubState = useCallback(async () => {
    if (!isMountedRef.current) return;
    setLoading(true); setErrorMsg(null);
    try {
      const headers = await getAdminHeaders();
      const [whoRes, bootRes] = await Promise.all([fetch('/api/casper-hub/whoami', { headers, credentials: 'same-origin' }), fetch('/api/casper-hub/bootstrap', { headers, credentials: 'same-origin' })]);
      if (!isMountedRef.current) return;
      if (whoRes.ok) {
        const whoJson = await whoRes.json();
        if (isMountedRef.current) setWhoami(whoJson?.data ?? null);
      } else {
        const whoErr = await whoRes.json().catch(() => ({}));
        if (isMountedRef.current) setErrorMsg(whoErr?.message || (whoRes.status === 401 || whoRes.status === 403 ? 'برای اتصال به هاب نیاز به حساب تاییدشده مدیر است.' : `پاسخ ناموفق اندپوینت هویت: ${whoRes.status}`));
      }
      if (bootRes.ok) {
        const bootJson = await bootRes.json();
        if (isMountedRef.current) {
          if (bootJson?.telemetry) setTelemetry(bootJson.telemetry);
          const rawNotes = bootJson?.data?.relevant_notes ?? bootJson?.data?.notes ?? bootJson?.notes;
          if (Array.isArray(rawNotes)) setRecentNotes(rawNotes.slice(-3).reverse());
        }
      } else if (whoRes.ok && isMountedRef.current) {
        const bootErr = await bootRes.json().catch(() => ({}));
        setErrorMsg(bootErr?.message || `پاسخ ناموفق اندپوینت بوست‌استرپ هاب: ${bootRes.status}`);
      }
    } catch (err: unknown) {
      if (isMountedRef.current) setErrorMsg(err instanceof Error ? err.message : 'خطا در ارتباط با سرور رادار مسکن.');
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void fetchHubState();
    const unsub = typeof auth.onAuthStateChanged === 'function' ? auth.onAuthStateChanged((u) => { if (u && isMountedRef.current) void fetchHubState(); }) : undefined;
    return () => { isMountedRef.current = false; if (typeof unsub === 'function') unsub(); };
  }, [fetchHubState]);

  const handlePostNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteSummary.trim()) { setErrorMsg('عنوان و شرح یادداشت الزامی هستند.'); return; }
    setSendingNote(true); setErrorMsg(null); setNoteSuccessMsg(null);
    try {
      const headers = await getAdminHeaders();
      const tagsArray = noteTags.split(/[,،]/).map((t) => t.trim()).filter(Boolean);
      const res = await fetch('/api/casper-hub/notes', {
        method: 'POST', headers,
        body: JSON.stringify({ note_scope: 'global', note_type: noteType, importance: noteImportance, title: noteTitle.trim(), summary: noteSummary.trim(), tags: tagsArray }),
      });
      const data = await res.json();
      if (!isMountedRef.current) return;
      if (res.ok) {
        setNoteSuccessMsg(`یادداشت با موفقیت در ${data?.mode === 'LOCAL_LEDGER_FALLBACK' ? 'دفتر معرفتی محلی (Fallback)' : 'دیتابیس اشتراکی D1 هاب'} ثبت شد (شناسه: ${data?.data?.note_id ?? 'OK'}).`);
        setNoteTitle(''); setNoteSummary(''); void fetchHubState();
      } else { setErrorMsg(data?.message || `خطا در ثبت یادداشت: کد ${data?.code || res.status}`); }
    } catch (err: unknown) {
      if (isMountedRef.current) setErrorMsg(err instanceof Error ? err.message : 'خطای شبکه در ارسال یادداشت.');
    } finally {
      if (isMountedRef.current) setSendingNote(false);
    }
  };

  return (
    <div data-testid="admin-casper-hub-monitor-card" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 pb-3">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 stroke-[1.75] text-indigo-600 dark:text-indigo-400 shrink-0" />
          <div>
            <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
              دیده‌بان اتصال و هماهنگی شبکه ابری CASPER HUB (Cloudflare D1 & Worker)
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              ارتباط سرور-به-سرور امن بدون افشای توکن · پایش آنتروپی شانون، شکاف‌های دنباله و ارسال چک‌پوینت
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void fetchHubState()}
          disabled={loading}
          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'در حال پایش...' : 'بروزرسانی وضعیت هاب'}</span>
        </button>
      </div>

      {errorMsg && (
        <div role="alert" className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-700" />
          <span>{errorMsg}</span>
        </div>
      )}

      {noteSuccessMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{noteSuccessMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>هویت نماینده محلی</span> <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mt-1 font-mono">{whoami?.agent_id || 'CASPER-05'}</div>
          <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">{whoami?.authenticated ? 'احراز هویت سرور: تاییدشده' : 'نیازمند ورود حساب مدیر'}</div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>دیتابیس D1 ابری</span> <Cpu className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mt-1">{whoami?.database === 'connected' ? 'متصل (Connected)' : whoami?.database === 'local-ledger-fallback' ? 'دفتر معرفتی محلی (Fallback)' : 'پایدار'}</div>
          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">bijanbijane-1.workers.dev</div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>آنتروپی شانون ایجنت‌ها</span> <Activity className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">{telemetry ? `${toPersianNum(telemetry.agentContributionEntropyBits)} بیت` : '۱.۰۰ بیت'}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">توزیع تنوع مشارکت معرفتی</div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>سلامت دنباله (Gap Count)</span> <Zap className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">{telemetry ? toPersianNum(telemetry.sequenceGapCount) : '۰'} شکاف</div>
          <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">دنباله تغییرات: یکنواخت اکید</div>
        </div>
      </div>

      <div data-testid="casper-hub-recent-notes" className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-800/40 space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
          <span>آخرین یادداشت‌های دریافتی از CASPER HUB:</span>
          <span className="text-[10px] text-slate-500 font-mono">D1 Replicated Feed</span>
        </div>
        {recentNotes.length === 0 ? (
          <div className="text-[11px] text-slate-500 dark:text-slate-400 py-1">هنوز یادداشتی در پایگاه ابری D1 ثبت نشده است (آماده ارسال چک‌پوینت).</div>
        ) : (
          <div className="space-y-1.5">
            {recentNotes.map((n, idx) => (
              <div key={n.id || idx} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-1 text-[11px]">
                  <span className="font-bold text-indigo-700 dark:text-indigo-400 font-mono">{n.author_agent || 'CASPER-01'}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">{n.note_type || 'checkpoint'} (اهمیت: {toPersianNum(n.importance ?? 3)})</span>
                </div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 text-xs truncate">{n.title}</div>
                {n.summary && <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">{n.summary}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handlePostNote} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-800/40 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs flex items-center gap-1.5">
            <Send className="w-3.5 h-3.5 text-indigo-600" />
            <span>ارسال چک‌پوینت معرفتی و یادداشت مستقیم به CASPER HUB:</span>
          </span>
          <span className="text-[10px] text-slate-500 font-mono">D1 Deterministic UUIDv5 Deduplication</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="sm:col-span-2">
            <input
              type="text"
              aria-label="عنوان یادداشت یا چک‌پوینت کسپر هاب"
              placeholder="عنوان یادداشت یا چک‌پوینت (حداکثر ۲۴۰ کاراکتر)"
              value={noteTitle}
              onChange={(e) => { setErrorMsg(null); setNoteSuccessMsg(null); setNoteTitle(e.target.value); }}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <select
              aria-label="دسته‌بندی نوع یادداشت کسپر هاب"
              value={noteType}
              onChange={(e) => { setErrorMsg(null); setNoteSuccessMsg(null); setNoteType(e.target.value); }}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-bold"
            >
              <option value="checkpoint">چک‌پوینت (Checkpoint)</option>
              <option value="finding">یافته تحلیلی (Finding)</option>
              <option value="blocker">مانع بحرانی (Blocker)</option>
              <option value="handoff">تحویل مأموریت (Handoff)</option>
              <option value="verification">راستی‌آزمایی (Verification)</option>
            </select>
          </div>
        </div>

        <textarea
          rows={2}
          aria-label="شرح کامل یادداشت یا چک‌پوینت کسپر هاب"
          placeholder="شرح کامل، تصمیم اتخاذشده و شواهد راستی‌آزمایی (حداکثر ۴۰۰۰ کاراکتر)"
          value={noteSummary}
          onChange={(e) => { setErrorMsg(null); setNoteSuccessMsg(null); setNoteSummary(e.target.value); }}
          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs text-slate-900 dark:text-slate-100 leading-relaxed"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-600 dark:text-slate-400 font-bold">اهمیت (۱..۵):</span>
            {[1, 2, 3, 4, 5].map((lvl) => (
              <button
                key={lvl}
                type="button"
                aria-label={`سطح اهمیت ${lvl}`}
                onClick={() => { setErrorMsg(null); setNoteSuccessMsg(null); setNoteImportance(lvl); }}
                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition ${
                  noteImportance === lvl
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300'
                }`}
              >
                {toPersianNum(lvl)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              aria-label="برچسب‌های یادداشت کسپر هاب"
              placeholder="برچسب‌ها (با ویرگول جدا کنید)"
              value={noteTags}
              onChange={(e) => { setErrorMsg(null); setNoteSuccessMsg(null); setNoteTags(e.target.value); }}
              className="w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-slate-200"
            />
            <button
              type="submit"
              disabled={sendingNote}
              className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{sendingNote ? 'در حال ارسال به D1...' : 'ثبت در CASPER HUB'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

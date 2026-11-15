import React, { useMemo, useState } from 'react';
import { BellRing, BookmarkCheck, FolderKanban, ShieldCheck } from 'lucide-react';
import {
  RT_FE_ENGAGEMENT_022_SPEC_ID, RT_FE_STAGE23_BRIDGE_SPEC_ID,
  RT_ENG_CONCEPTS_10, RT_ENG_LAYERS_9, RT_ENG_FOLLOW_SCOPES_6,
  RT_ENG_WATCH_RULE_TYPES_8, RT_ENG_DELIVERABLES_35,
  evaluateConceptSeparationPolicy, evaluateEntityReferenceAndFavorite,
  evaluateTagUniqueness, evaluateWatchRuleAndNoiseFilter,
  evaluateNoteConflictAndShareAccess, evaluateNotificationPipelineAndTelemetry,
} from '../services/rtFeEngagement022Engine';

type EngTabId = 'concepts_reference' | 'tags_collections' | 'watch_noise' | 'notes_deliverables';

export const RtFeEngagement022Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<EngTabId>('concepts_reference');
  const [deleteAction, setDeleteAction] = useState<'remove_favorite' | 'delete_collection' | 'cancel_follow'>('remove_favorite');
  const [spoofUserId, setSpoofUserId] = useState<boolean>(true);
  const [tagInput, setTagInput] = useState<string>('گزينه\u200Cخريد');
  const [vagueRule, setVagueRule] = useState<boolean>(true);
  const [digitNoiseOnly, setDigitNoiseOnly] = useState<boolean>(true);
  const [clientNoteVer, setClientNoteVer] = useState<number>(2);
  const [tokenRevoked, setTokenRevoked] = useState<boolean>(true);

  const sepOut = useMemo(() => evaluateConceptSeparationPolicy({ action: deleteAction }), [deleteAction]);

  const refOut = useMemo(
    () =>
      evaluateEntityReferenceAndFavorite({
        entityType: 'property',
        entityId: 'prop-1042',
        existingFavoriteKeySet: ['property:prop-1042'],
        clientSentOwnerUserId: spoofUserId ? 'user-spoofed' : undefined,
        embedsFullEntitySnapshot: false,
      }),
    [spoofUserId],
  );

  const tagOut = useMemo(
    () =>
      evaluateTagUniqueness({
        title: tagInput,
        existingNormalizedTags: ['گزینه خرید', 'نیازمند بررسی'],
      }),
    [tagInput],
  );

  const watchOut = useMemo(
    () =>
      evaluateWatchRuleAndNoiseFilter({
        field: 'askingSalePrice',
        operator: 'decrease_percent',
        threshold: 5,
        unit: 'percent',
        isVagueNaturalPhrase: vagueRule,
        previousRawText: '۱۴۵۰۰',
        currentRawText: digitNoiseOnly ? '14500' : '۱۳۷۵۰',
        previousCanonicalValue: 14500,
        currentCanonicalValue: digitNoiseOnly ? 14500 : 13750,
      }),
    [vagueRule, digitNoiseOnly],
  );

  const noteShareOut = useMemo(
    () =>
      evaluateNoteConflictAndShareAccess({
        clientNoteVersion: clientNoteVer,
        serverNoteVersion: 3,
        shareTokenExpired: false,
        shareTokenRevoked: tokenRevoked,
        clientClaimedRole: 'editor',
        grantedRole: 'viewer',
      }),
    [clientNoteVer, tokenRevoked],
  );

  const notifyOut = useMemo(
    () =>
      evaluateNotificationPipelineAndTelemetry({
        incomingEventId: 'evt-900',
        seenEventIds: [],
        incomingPriority: 'critical',
        targetBatchHasNormalAlerts: true,
        quietHoursActive: true,
        telemetryPayload: { action: 'create_watch_rule', noteContent: 'محرمانه', entityType: 'property' },
      }),
    [],
  );

  return (
    <div dir="rtl" data-testid="rt-fe-engagement-022-panel" className="space-y-4 text-right">
      <div className="rounded-xl border border-teal-500/30 bg-slate-900/95 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-teal-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-300" dir="ltr">
                {RT_FE_ENGAGEMENT_022_SPEC_ID}
              </span>
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                ۱۰ مفهوم مجزا · ۹ لایه · ۸ نوع Watch Rule · ۳۵ خروجی OUT
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله بیست‌ودوم: نظام علاقه‌مندی‌ها، دنبال‌کردن موجودیت‌ها، فهرست‌های شخصی و رصد تغییرات
            </h4>
          </div>
          <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 text-xs font-bold text-emerald-300 whitespace-nowrap shrink-0" dir="ltr">
            Tenant Isolation · No IDOR
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'concepts_reference', label: '۱. تفکیک Favorite / Follow / Collection / Watch Rule و مالکیت نشست' },
            { id: 'tags_collections', label: '۲. نرمال‌سازی فارسی Tagها (ي/ی و نیم‌فاصله) و ۹ لایه Engagement' },
            { id: 'watch_noise', label: '۳. ممنوعیت Watch Rule مبهم و فیلتر نویز ارقام/قالب در Change Monitoring' },
            { id: 'notes_deliverables', label: '۴. تعارض نسخه یادداشت، ابطال توکن اشتراک و ۳۵ خروجی OUT-001..035' },
          ].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as EngTabId)} data-testid={`rt-fe-eng-tab-${tab.id}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === tab.id ? 'bg-teal-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'concepts_reference' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-teal-300 flex items-center gap-1.5"><BookmarkCheck className="w-4 h-4 shrink-0" /> <span>استقلال حذف و کنترل مالکیت نشست (§۲۲.۳.۲ & §۲۲.۶.۲)</span></h5>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="rt-fe-eng-del-fav" onClick={() => setDeleteAction('remove_favorite')} className={`rounded px-2.5 py-1 text-[11px] font-bold ${deleteAction === 'remove_favorite' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>حذف Favorite</button>
              <button type="button" data-testid="rt-fe-eng-del-col" onClick={() => setDeleteAction('delete_collection')} className={`rounded px-2.5 py-1 text-[11px] font-bold ${deleteAction === 'delete_collection' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>حذف Collection</button>
              <button type="button" data-testid="rt-fe-eng-del-follow" onClick={() => setDeleteAction('cancel_follow')} className={`rounded px-2.5 py-1 text-[11px] font-bold ${deleteAction === 'cancel_follow' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>لغو Follow</button>
            </div>
            <div data-testid="rt-fe-eng-sep-verdict" className="rounded bg-slate-950 p-2.5 text-[11px] text-emerald-200 font-bold">
              {sepOut.summaryFa}
            </div>
            <button type="button" data-testid="rt-fe-eng-toggle-spoof" onClick={() => setSpoofUserId((v) => !v)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${spoofUserId ? 'bg-rose-700 text-white' : 'bg-emerald-700 text-white'}`}>
              {spoofUserId ? 'ارسال userId جعلی کلاینت (مسدود)' : 'تشخیص مالک از نشست معتبر سرور'}
            </button>
            <div data-testid="rt-fe-eng-ref-verdict" className={`rounded p-2.5 text-[11px] font-bold ${refOut.valid ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}>
              {refOut.valid ? 'مالک از نشست معتبر استخراج شد و Idempotency ثبت مکرر را مهار کرد.' : refOut.issues[0]}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1 max-h-80 overflow-y-auto">
            <h5 className="font-bold text-cyan-300">مرزبندی ۱۰ مفهوم کلیدی Engagement (§۲۲.۳)</h5>
            {RT_ENG_CONCEPTS_10.map((c) => (
              <div key={c.concept} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[11px]">
                <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-cyan-300 ml-1.5" dir="ltr">{c.concept}</span>
                <span className="text-slate-200">{c.roleFa}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'tags_collections' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-indigo-300 flex items-center gap-1.5"><FolderKanban className="w-4 h-4 shrink-0" /> <span>نرمال‌سازی فارسی Tagها و جلوگیری از تکرار (§۲۲.۱۰.۳)</span></h5>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="rt-fe-eng-tag-dup" onClick={() => setTagInput('گزينه\u200Cخريد')} className={`rounded px-2.5 py-1 text-[11px] font-bold ${tagInput.includes('ي') ? 'bg-rose-700 text-white' : 'bg-slate-800 text-slate-300'}`}>برچسب عربی/نیم‌فاصله (تکراری)</button>
              <button type="button" data-testid="rt-fe-eng-tag-unique" onClick={() => setTagInput('سرمایه‌گذاری')} className={`rounded px-2.5 py-1 text-[11px] font-bold ${tagInput === 'سرمایه‌گذاری' ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-300'}`}>برچسب یکتا (سرمایه‌گذاری)</button>
            </div>
            <div data-testid="rt-fe-eng-tag-verdict" className={`rounded p-2.5 text-[11px] font-bold ${tagOut.valid ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}>
              {tagOut.reasonFa}
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {RT_ENG_FOLLOW_SCOPES_6.map((sc) => <span key={sc} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-cyan-200" dir="ltr">{sc}</span>)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1 max-h-80 overflow-y-auto">
            <h5 className="font-bold text-teal-300">۹ لایه معماری نظام Engagement (§۲۲.۴)</h5>
            {RT_ENG_LAYERS_9.map((l) => (
              <div key={l.layer} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[11px]">
                <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-teal-300 ml-1.5" dir="ltr">{l.layer}. {l.nameEn}</span>
                <span className="text-slate-200">{l.roleFa}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'watch_noise' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-amber-300 flex items-center gap-1.5"><BellRing className="w-4 h-4 shrink-0" /> <span>رد قاعده مبهم و سرکوب نویز ارقام/قالب (§۲۲.۱۲ & §۲۲.۱۳)</span></h5>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="rt-fe-eng-toggle-vague" onClick={() => setVagueRule((v) => !v)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${vagueRule ? 'bg-rose-700 text-white' : 'bg-emerald-700 text-white'}`}>
                {vagueRule ? 'قاعده مبهم («مناسب شد خبر بده»)' : 'قاعده ساختاریافته (کاهش > ۵٪)'}
              </button>
              <button type="button" data-testid="rt-fe-eng-toggle-noise" onClick={() => setDigitNoiseOnly((v) => !v)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${digitNoiseOnly ? 'bg-amber-700 text-white' : 'bg-teal-600 text-white'}`}>
                {digitNoiseOnly ? 'تغییر صرفاً ارقام (۱۴۵۰۰ ← 14500)' : 'کاهش واقعی قیمت (۱۴۵۰۰ ← ۱۳۷۵۰)'}
              </button>
            </div>
            <div data-testid="rt-fe-eng-watch-verdict" className={`rounded p-2.5 text-[11px] font-bold ${!watchOut.ruleAccepted ? 'bg-rose-950/60 text-rose-200' : watchOut.noiseSuppressed ? 'bg-amber-950/60 text-amber-200' : 'bg-emerald-950/60 text-emerald-200'}`}>
              {watchOut.reasonFa}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-cyan-300">۸ الگوی رسمی Watch Rule و حفاظت Quiet Hours (§۲۲.۱۴)</h5>
            <div className="flex flex-wrap gap-1">
              {RT_ENG_WATCH_RULE_TYPES_8.map((w) => <span key={w} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-indigo-200" dir="ltr">{w}</span>)}
            </div>
            <div className="rounded bg-slate-950 p-2.5 text-[11px] text-slate-200">
              ادغام بحرانی در دسته عادی: <strong className="text-rose-300">{notifyOut.canMergeIntoNormalBatch ? 'مجاز' : 'ممنوع (جداگانه)'}</strong> · حذف خودکار PII یادداشت و توکن از Telemetry: <strong className="font-mono text-emerald-300" dir="ltr">{notifyOut.strippedPiiKeys.join(', ')}</strong>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'notes_deliverables' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-amber-300 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 shrink-0" /> <span>تعارض نسخه یادداشت و ابطال توکن اشتراک</span></h5>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="rt-fe-eng-toggle-note-ver" onClick={() => setClientNoteVer((v) => (v === 2 ? 3 : 2))} className={`rounded px-2 py-1 text-[11px] font-bold ${clientNoteVer < 3 ? 'bg-rose-700 text-white' : 'bg-emerald-700 text-white'}`}>
                {clientNoteVer < 3 ? 'نسخه قدیمی کلاینت (v2 vs v3)' : 'نسخه همگام (v3 vs v3)'}
              </button>
              <button type="button" data-testid="rt-fe-eng-toggle-token" onClick={() => setTokenRevoked((v) => !v)} className={`rounded px-2 py-1 text-[11px] font-bold ${tokenRevoked ? 'bg-rose-700 text-white' : 'bg-emerald-700 text-white'}`}>
                {tokenRevoked ? 'توکن اشتراک لغو‌شده' : 'توکن اشتراک معتبر'}
              </button>
            </div>
            <div data-testid="rt-fe-eng-note-verdict" className={`rounded p-2 text-[10px] space-y-1 ${noteShareOut.noteSaveAllowed && noteShareOut.shareAccessAllowed ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200 font-bold'}`}>
              {noteShareOut.issues.length > 0 ? noteShareOut.issues.map((i) => <div key={i}>{i}</div>) : <div>ذخیره یادداشت و دسترسی با نقش Viewer مجاز است.</div>}
            </div>
            <div className="pt-1 text-[10px] text-emerald-300">مرز انتقال به مرحله ۲۳: <code className="font-mono" dir="ltr">{RT_FE_STAGE23_BRIDGE_SPEC_ID}</code></div>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">۳۵ خروجی نهایی مرحله بیست‌ودوم (RT-FE-ENGAGEMENT-OUT-001 تا 035)</h5>
            <div className="max-h-72 overflow-y-auto grid grid-cols-1 gap-1 sm:grid-cols-2">
              {RT_ENG_DELIVERABLES_35.map((del) => (
                <div key={del.id} className="rounded border border-slate-800 bg-slate-950/60 p-1.5 text-[11px] text-slate-200">
                  <span className="font-mono font-bold text-emerald-300" dir="ltr">✓ {del.id}</span> <span>{del.titleFa}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

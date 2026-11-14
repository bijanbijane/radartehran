/** @file src/features/admin/components/AdminCommunicationsPanel.tsx — Admin Communication Operations Center (RT-UI-COMMS-001) */
import React, { useState } from 'react';
import { Activity, AlertTriangle, FileCode2, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import {
  COMMS_TEMPLATE_REGISTRY,
  EVENT_POLICY_REGISTRY,
} from '../../communications/registries/eventPolicyAndTemplateRegistry';
import {
  loadCommsWorkspaceState,
  replayDeadLetterClient,
} from '../../communications/services/commsClientService';

export interface AdminCommunicationsPanelProps {
  isVerifiedAdmin: boolean;
}

export const AdminCommunicationsPanel: React.FC<AdminCommunicationsPanelProps> = ({ isVerifiedAdmin }) => {
  const [tab, setTab] = useState<'overview' | 'queues' | 'templates' | 'audit'>('overview');
  const [tick, setTick] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  void tick;

  const state = loadCommsWorkspaceState();
  const pendingDlq = state.deadLetters.filter((d) => !d.replayed);
  const deliveredCount = state.deliveries.filter((d) => d.status === 'DELIVERED' || d.status === 'DISPATCHED').length;

  const handleReplay = (dlqId: string) => {
    if (!isVerifiedAdmin) {
      setFeedback('اجرای Replay نیازمند احراز نشست ادمین تأییدشده است.');
      return;
    }
    replayDeadLetterClient(dlqId, 'admin-comms-ops');
    setFeedback(`رکورد صف خطای ${dlqId} به‌صورت کنترل‌شده و idempotent مجدداً صف‌بندی شد.`);
    setTick((t) => t + 1);
  };

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 text-xs" data-testid="admin-communications-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <Send className="w-4 h-4 text-emerald-600" />
            <span>مرکز عملیات اعلان‌ها و ارتباطات (Communication Ops)</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            پایش ارسال کانال‌ها، صف‌های اولویت‌دار، DLQ و رجیستری قالب‌ها (بدون دسترسی به متن خصوصی پیام‌های کاربران).
          </p>
        </div>
        <span className="text-[10.5px] font-bold text-slate-500 tabular-nums">
          پیام‌های خصوصی: محافظت‌شده · خطاهای DLQ باز: {toPersianNum(pendingDlq.length)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { id: 'overview' as const, label: 'نمای کلی و کانال‌ها', Icon: Activity },
          { id: 'queues' as const, label: `صف‌ها و DLQ (${toPersianNum(pendingDlq.length)})`, Icon: AlertTriangle },
          { id: 'templates' as const, label: 'قالب‌ها و سیاست‌ها', Icon: FileCode2 },
          { id: 'audit' as const, label: `گزارش تخلف و ممیزی (${toPersianNum(state.audits.length + state.reports.length)})`, Icon: ShieldCheck },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer ${
              tab === id ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {feedback && (
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-bold">
          {feedback}
        </div>
      )}

      {tab === 'overview' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
              <div className="text-[10.5px] text-slate-500">تلاش‌های موفق ارسال</div>
              <div className="text-base font-black text-emerald-700 dark:text-emerald-300 tabular-nums mt-0.5">{toPersianNum(deliveredCount)}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
              <div className="text-[10.5px] text-slate-500">صف خطای نهایی (DLQ)</div>
              <div className="text-base font-black text-rose-700 dark:text-rose-300 tabular-nums mt-0.5">{toPersianNum(pendingDlq.length)}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
              <div className="text-[10.5px] text-slate-500">رویدادهای رجیستری</div>
              <div className="text-base font-black text-slate-900 dark:text-white tabular-nums mt-0.5">{toPersianNum(Object.keys(EVENT_POLICY_REGISTRY).length)}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
              <div className="text-[10.5px] text-slate-500">گزارش‌های مزاحمت باز</div>
              <div className="text-base font-black text-amber-700 dark:text-amber-300 tabular-nums mt-0.5">
                {toPersianNum(state.reports.filter((r) => r.status === 'PENDING').length)}
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
            {state.deliveries.slice(0, 8).map((d) => (
              <div key={d.attemptId} className="p-2.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{d.eventCode}</span>
                  <span className="text-slate-500 mx-1.5">·</span>
                  <span className="text-slate-600 dark:text-slate-300 font-bold">{d.channel}</span>
                  <span className="text-slate-500 mx-1.5">·</span>
                  <span className="font-mono text-[10.5px] text-slate-500">{d.queueName}</span>
                </div>
                <span className={`text-[10.5px] font-bold ${d.status === 'DEAD_LETTERED' ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-300'}`}>
                  {d.status} ({toPersianNum(d.attemptNumber)})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'queues' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(['comms.critical', 'comms.transactional', 'comms.standard', 'comms.digest', 'comms.retry', 'comms.dead-letter'] as const).map((q) => (
              <div key={q} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 flex items-center justify-between">
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{q}</span>
                <span className="text-emerald-700 dark:text-emerald-300 font-bold">فعال</span>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <h3 className="font-black text-slate-900 dark:text-white">مدیریت صف خطای نهایی (DLQ)</h3>
            {state.deadLetters.map((item) => (
              <div key={item.dlqId} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    <span className="font-mono">{item.eventCode}</span> · {item.channel} · {item.reasonCode}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{item.reasonFa}</div>
                </div>
                {item.replayed ? (
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">بازارسال شد (Idempotent)</span>
                ) : (
                  <button
                    type="button"
                    data-testid={`dlq-replay-btn-${item.dlqId}`}
                    onClick={() => handleReplay(item.dlqId)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>بازارسال کنترل‌شده (Replay)</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'templates' && (
        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl">
          {Object.values(EVENT_POLICY_REGISTRY).map((pol) => {
            const tpl = COMMS_TEMPLATE_REGISTRY[pol.eventCode];
            return (
              <div key={pol.eventCode} className="p-3 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{pol.eventCode}</span>
                  <span className="text-[10.5px] font-bold text-slate-500">
                    {pol.severity} · {pol.queueName} · نسخه {toPersianNum(tpl.version)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-700 dark:text-slate-300">{tpl.titleTemplateFa}</div>
                <div className="text-[10.5px] text-slate-500">{pol.descriptionFa}</div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'audit' && (
        <div className="space-y-3">
          {state.reports.length > 0 && (
            <div className="space-y-1.5">
              <strong className="text-slate-900 dark:text-white block">گزارش‌های مزاحمت پیام‌رسانی ({toPersianNum(state.reports.length)})</strong>
              {state.reports.map((r) => (
                <div key={r.reportId} className="p-2.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                  <span className="font-mono text-[10.5px]">{r.conversationId}</span> · {r.reasonFa} ({r.status})
                </div>
              ))}
            </div>
          )}
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl">
            {state.audits.map((a) => (
              <div key={a.auditId} className="p-2.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">{a.actionCode} · {a.targetId}</div>
                  <div className="text-[11px] text-slate-500">{a.summaryFa}</div>
                </div>
                <span className="font-mono text-[10.5px] text-slate-400">{a.actorUid}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

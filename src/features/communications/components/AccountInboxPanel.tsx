/** @file src/features/communications/components/AccountInboxPanel.tsx — Context-Scoped Messaging Inbox & Thread Panel */
import React, { useState } from 'react';
import { Archive, Ban, Flag, MessageSquare, Send, VolumeX } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import {
  mutateConversationControl,
  sendScopedConversationMessage,
} from '../services/commsClientService';
import type { ConversationRecord } from '../types/comms.types';

export interface AccountInboxPanelProps {
  uid: string;
  conversations: ConversationRecord[];
  onChanged: () => void;
}

const CONTEXT_LABEL_FA: Record<ConversationRecord['type'], string> = {
  SERVICE_REQUEST: 'پرونده درخواست خدمت',
  LISTING_INQUIRY: 'استعلام فایل ملکی',
  SUPPORT: 'پرونده پشتیبانی',
  ADMIN_CASE: 'ارجاع حاکمیتی',
  SYSTEM_CONVERSATION: 'پیام رسمی سامانه',
};

export const AccountInboxPanel: React.FC<AccountInboxPanelProps> = ({ uid, conversations, onChanged }) => {
  const [selectedId, setSelectedId] = useState<string>(conversations[0]?.conversationId || '');
  const [showArchived, setShowArchived] = useState(false);
  const [draftBody, setDraftBody] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');

  const visibleList = conversations.filter((c) => {
    const me = c.participants.find((p) => p.uid === uid);
    return showArchived ? Boolean(me?.archived) : !me?.archived;
  });

  const activeConv =
    visibleList.find((c) => c.conversationId === selectedId) || visibleList[0] || null;
  const myParticipant = activeConv?.participants.find((p) => p.uid === uid);

  const handleSend = () => {
    if (!activeConv) return;
    const res = sendScopedConversationMessage(activeConv.conversationId, draftBody, uid);
    if (!res.ok) {
      setFeedback({ ok: false, msg: res.errorFa || 'خطا در ارسال پیام.' });
      return;
    }
    setDraftBody('');
    setFeedback(null);
    onChanged();
  };

  const handleControl = (action: 'mute' | 'archive' | 'block' | 'mark_read') => {
    if (!activeConv) return;
    mutateConversationControl(activeConv.conversationId, action, uid);
    setFeedback({
      ok: true,
      msg:
        action === 'mute'
          ? 'وضعیت سکوت گفت‌وگو به‌روزرسانی شد.'
          : action === 'archive'
            ? 'وضعیت بایگانی گفت‌وگو تغییر یافت.'
            : action === 'block'
              ? 'وضعیت مسدودسازی طرف گفت‌وگو اعمال شد.'
              : 'همه پیام‌ها خوانده شدند.',
    });
    onChanged();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs" data-testid="account-comms-inbox">
      <div className="lg:col-span-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <strong className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>گفت‌وگوهای مرتبط ({toPersianNum(visibleList.length)})</span>
          </strong>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="text-[11px] font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            {showArchived ? 'گفت‌وگوهای فعال' : 'بایگانی‌شده'}
          </button>
        </div>

        <p className="text-[11px] text-slate-500">
          پیام‌رسانی فقط در بستر پرونده‌های واقعی (درخواست خدمت، استعلام آگهی و پشتیبانی) مجاز است.
        </p>

        {visibleList.length === 0 ? (
          <div className="p-4 text-center text-slate-500 rounded-xl bg-slate-50 dark:bg-slate-800/50">
            گفت‌وگویی در این بخش وجود ندارد.
          </div>
        ) : (
          <div className="space-y-2">
            {visibleList.map((conv) => {
              const isSelected = activeConv?.conversationId === conv.conversationId;
              const lastMsg = conv.messages[conv.messages.length - 1];
              const other = conv.participants.find((p) => p.uid !== uid);
              return (
                <button
                  key={conv.conversationId}
                  type="button"
                  onClick={() => { setSelectedId(conv.conversationId); setFeedback(null); }}
                  className={`w-full text-start p-3 rounded-xl border transition cursor-pointer ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="text-[10.5px] font-bold text-slate-500">
                    {CONTEXT_LABEL_FA[conv.type]} · {other?.displayNameFa || 'کاربر سامانه'}
                  </div>
                  <div className="font-black text-slate-900 dark:text-white mt-0.5 truncate">{conv.contextTitleFa}</div>
                  {lastMsg && (
                    <div className="text-[11px] text-slate-500 mt-1 truncate">{lastMsg.bodyFa}</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="lg:col-span-8 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3">
        {!activeConv ? (
          <div className="py-12 text-center text-slate-500">یک گفت‌وگو را از فهرست انتخاب کنید.</div>
        ) : (
          <>
            <div className="pb-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold text-slate-500">
                  {CONTEXT_LABEL_FA[activeConv.type]} · شناسه <span className="font-mono">{activeConv.contextEntityId}</span>
                </div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white mt-0.5">{activeConv.contextTitleFa}</h3>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => handleControl('mute')} className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold flex items-center gap-1 cursor-pointer">
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>{myParticipant?.muted ? 'لغو سکوت' : 'بی‌صدا'}</span>
                </button>
                <button type="button" onClick={() => handleControl('archive')} className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold flex items-center gap-1 cursor-pointer">
                  <Archive className="w-3.5 h-3.5" />
                  <span>{myParticipant?.archived ? 'خروج از بایگانی' : 'بایگانی'}</span>
                </button>
                <button type="button" onClick={() => handleControl('block')} className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold flex items-center gap-1 cursor-pointer">
                  <Ban className="w-3.5 h-3.5" />
                  <span>{myParticipant?.blockedOtherParticipant ? 'رفع مسدودی' : 'مسدودسازی'}</span>
                </button>
                <button type="button" onClick={() => setReportOpen((v) => !v)} className="px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-bold flex items-center gap-1 cursor-pointer">
                  <Flag className="w-3.5 h-3.5" />
                  <span>گزارش تخلف</span>
                </button>
              </div>
            </div>

            {reportOpen && (
              <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="دلیل گزارش مزاحمت یا نقض قوانین ارتباطی..."
                  className="flex-1 min-w-[200px] p-2 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (reportReason.trim().length < 4) return;
                    mutateConversationControl(activeConv.conversationId, 'report', uid, reportReason);
                    setReportOpen(false);
                    setReportReason('');
                    setFeedback({ ok: true, msg: 'گزارش تخلف با موفقیت برای بررسی ثبت شد.' });
                    onChanged();
                  }}
                  className="px-3 py-2 rounded-lg bg-amber-600 text-white font-bold cursor-pointer"
                >
                  ثبت گزارش
                </button>
              </div>
            )}

            <div className="space-y-2.5 max-h-[340px] overflow-y-auto py-1">
              {activeConv.messages.map((m) => {
                const isMine = m.senderUid === uid;
                const isSystem = m.senderType === 'SYSTEM';
                return (
                  <div
                    key={m.messageId}
                    className={`p-3 rounded-xl border ${
                      isSystem
                        ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        : isMine
                          ? 'bg-emerald-50/60 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[10.5px] text-slate-500">
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {m.senderLabelFa} · {m.senderType === 'SYSTEM' ? 'سیستمی' : m.senderType === 'SUPPORT_AGENT' ? 'پشتیبانی' : 'عضو پرونده'}
                      </span>
                      <span className="tabular-nums">
                        {m.status === 'READ' ? 'خوانده‌شده' : m.status === 'DELIVERED' ? 'تحویل‌شده' : m.status === 'REDACTED' ? 'مخفی‌شده' : 'ارسال‌شده'}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-800 dark:text-slate-100 leading-relaxed">{m.bodyFa}</p>
                  </div>
                );
              })}
            </div>

            {feedback && (
              <div className={`p-2.5 rounded-xl font-bold ${feedback.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                {feedback.msg}
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <input
                type="text"
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                placeholder={myParticipant?.blockedOtherParticipant ? 'گفت‌وگو مسدود است...' : 'پاسخ مرتبط با این پرونده را بنویسید...'}
                disabled={Boolean(myParticipant?.blockedOtherParticipant)}
                className="flex-1 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
              <button
                type="button"
                data-testid="inbox-send-message-btn"
                onClick={handleSend}
                disabled={Boolean(myParticipant?.blockedOtherParticipant)}
                className="px-4 py-2.5 rounded-xl bg-[var(--color-brand-600)] text-white font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>ارسال</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

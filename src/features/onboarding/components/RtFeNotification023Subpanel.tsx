import React, { useMemo, useState } from 'react';
import { Bell, Link2, MailWarning, ShieldAlert } from 'lucide-react';
import {
  RT_FE_NOTIFICATION_023_SPEC_ID,
  RT_FE_STAGE24_MESSAGING_BRIDGE_SPEC_ID,
  RT_FE_STAGE24_ACCOUNT_BRIDGE_SPEC_ID,
  RT_NOTIF_LAYERS_10,
  RT_NOTIF_TYPES_10,
  RT_NOTIF_STATUSES_4,
  RT_NOTIF_DELIVERY_STATUSES_9,
  RT_NOTIF_ENDPOINTS_13,
  RT_NOTIF_DELIVERABLES_36,
  formatUnreadBadgeCount,
  evaluateDeliveryChannelIsolation,
  evaluateReadStateAndPanelIsolation,
  evaluateSecurityAndPreferencePolicy,
  evaluateNotificationDeepLink,
} from '../services/rtFeNotification023Engine';

type NotifTabId = 'layers_badge' | 'delivery_isolation' | 'security_deeplink' | 'endpoints_deliverables';

export const RtFeNotification023Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NotifTabId>('layers_badge');
  const [unreadInput, setUnreadInput] = useState<number | null>(124);
  const [fetchError, setFetchError] = useState<boolean>(false);
  const [treatSentDelivered, setTreatSentDelivered] = useState<boolean>(true);
  const [emailStatus, setEmailStatus] = useState<'sent' | 'failed' | 'delivered'>('sent');
  const [groupAutoMark, setGroupAutoMark] = useState<boolean>(false);
  const [disableSecMandatory, setDisableSecMandatory] = useState<boolean>(true);
  const [openRedirectAttempt, setOpenRedirectAttempt] = useState<boolean>(true);

  const badgeOut = useMemo(
    () => formatUnreadBadgeCount({ unreadCount: unreadInput, fetchFailed: fetchError, lastKnownCount: 4 }),
    [unreadInput, fetchError],
  );

  const deliveryOut = useMemo(
    () =>
      evaluateDeliveryChannelIsolation({
        inboxSaved: true,
        emailDeliveryStatus: emailStatus,
        pushDeliveryStatus: 'delivered',
        treatSentAsDelivered: treatSentDelivered,
      }),
    [emailStatus, treatSentDelivered],
  );

  const readOut = useMemo(
    () =>
      evaluateReadStateAndPanelIsolation({
        openingGroupAutoMarksAllRead: groupAutoMark,
        type: 'property',
        clientVersion: 1,
        serverVersion: 1,
      }),
    [groupAutoMark],
  );

  const secOut = useMemo(
    () =>
      evaluateSecurityAndPreferencePolicy({
        type: 'security',
        priority: 'critical',
        requestedDisableMandatorySecurity: disableSecMandatory,
        quietHoursTimezone: disableSecMandatory ? '' : 'Asia/Tehran',
        quietHoursStart: '23:00',
        quietHoursEnd: '07:00',
        implicitWebPushWithoutUserAction: disableSecMandatory,
      }),
    [disableSecMandatory],
  );

  const deepLinkOut = useMemo(
    () =>
      evaluateNotificationDeepLink({
        routeKey: 'property.detail',
        rawExternalUrl: openRedirectAttempt ? 'https://untrusted.example.com' : undefined,
        allowedRouteKeys: ['property.detail', 'notifications.center'],
        queryHasSensitivePii: false,
        requiresAuthentication: true,
        isAuthenticated: true,
        hasEntityPermission: true,
      }),
    [openRedirectAttempt],
  );

  return (
    <div dir="rtl" data-testid="rt-fe-notification-023-panel" className="space-y-4 text-right">
      <div className="rounded-xl border border-teal-500/30 bg-slate-900/95 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-teal-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-300" dir="ltr">
                {RT_FE_NOTIFICATION_023_SPEC_ID}
              </span>
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                ۱۰ لایه · ۱۰ نوع · ۱۳ قرارداد ارتباطی · ۳۶ خروجی تحویلی
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله بیست‌وسوم: نظام مرکز اعلان‌ها، ارتباطات چندکاناله و مدیریت ترجیحات ارتباطی کاربران
            </h4>
          </div>
          <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 text-xs font-bold text-emerald-300 whitespace-nowrap shrink-0" dir="ltr">
            Inbox !== Delivery · Safe Deep Links
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'layers_badge', label: '۱. ده لایه معماری اعلان‌ها و نشانگر خوانده‌نشده' },
            { id: 'delivery_isolation', label: '۲. تفکیک وضعیت ارسال، پنل سریع و گروه‌بندی امن' },
            { id: 'security_deeplink', label: '۳. مصونیت الزامات امنیتی، ساعات سکوت و لینک امن' },
            { id: 'endpoints_deliverables', label: '۴. فهرست ۱۳ مسیر رابط، ۳۶ خروجی نهایی و مرز مرحله ۲۴' },
          ].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as NotifTabId)} data-testid={`rt-fe-notif-tab-${tab.id}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === tab.id ? 'bg-teal-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'layers_badge' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-teal-300 flex items-center gap-1.5"><Bell className="w-4 h-4 shrink-0" /> <span>شبیه‌ساز نشانگر زنگوله و همگام‌سازی (§۲۳.۹.۱)</span></h5>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="rt-fe-notif-badge-124" onClick={() => { setUnreadInput(124); setFetchError(false); }} className={`rounded px-2 py-1 text-[11px] font-bold ${unreadInput === 124 && !fetchError ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>۱۲۴ مورد (99+)</button>
              <button type="button" data-testid="rt-fe-notif-badge-0" onClick={() => { setUnreadInput(0); setFetchError(false); }} className={`rounded px-2 py-1 text-[11px] font-bold ${unreadInput === 0 && !fetchError ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>۰ (پنهان)</button>
              <button type="button" data-testid="rt-fe-notif-badge-err" onClick={() => setFetchError(true)} className={`rounded px-2 py-1 text-[11px] font-bold ${fetchError ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-300'}`}>خطای شبکه (Stale = 4)</button>
            </div>
            <div data-testid="rt-fe-notif-badge-verdict" className="rounded bg-slate-950 p-2.5 text-[11px] space-y-1 text-cyan-200 font-bold">
              <div>نمایش شمارنده — <span className="font-mono text-emerald-300" dir="ltr">{badgeOut.showNumericBadge ? badgeOut.badgeText : 'HIDDEN'}</span> {badgeOut.isStale ? '(Stale)' : ''}</div>
              <div className="text-slate-300 font-normal">{badgeOut.noteFa}</div>
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {RT_NOTIF_TYPES_10.map((c) => <span key={c} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-cyan-200" dir="ltr">{c}</span>)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1 max-h-80 overflow-y-auto">
            <h5 className="font-bold text-cyan-300">۱۰ لایه معماری نظام اعلان‌ها (§۲۳.۵)</h5>
            {RT_NOTIF_LAYERS_10.map((l) => (
              <div key={l.layer} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[11px]">
                <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-cyan-300 ml-1.5" dir="ltr">{l.layer}. {l.nameEn}</span>
                <span className="text-slate-200">{l.roleFa}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'delivery_isolation' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-amber-300 flex items-center gap-1.5"><MailWarning className="w-4 h-4 shrink-0" /> <span>استقلال Inbox از Delivery و گروه‌بندی (§۲۳.۱۲ & §۲۳.۲۲)</span></h5>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="rt-fe-notif-email-accepted" onClick={() => { setEmailStatus('sent'); setTreatSentDelivered(true); }} className={`rounded px-2 py-1 text-[11px] font-bold ${emailStatus === 'sent' ? 'bg-rose-700 text-white' : 'bg-slate-800 text-slate-300'}`}>sent !== delivered</button>
              <button type="button" data-testid="rt-fe-notif-email-failed" onClick={() => { setEmailStatus('failed'); setTreatSentDelivered(false); }} className={`rounded px-2 py-1 text-[11px] font-bold ${emailStatus === 'failed' ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-300'}`}>شکست ایمیل (حفظ Inbox)</button>
              <button type="button" data-testid="rt-fe-notif-email-delivered" onClick={() => { setEmailStatus('delivered'); setTreatSentDelivered(false); }} className={`rounded px-2 py-1 text-[11px] font-bold ${emailStatus === 'delivered' ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-300'}`}>delivered تاییدشده</button>
              <button type="button" data-testid="rt-fe-notif-toggle-automark" onClick={() => setGroupAutoMark((v) => !v)} className={`rounded px-2 py-1 text-[11px] font-bold ${groupAutoMark ? 'bg-rose-700 text-white' : 'bg-slate-800 text-slate-300'}`}>
                {groupAutoMark ? 'خطا: خواندن خودکار اعضای گروه' : 'تفکیک بازشدن گروه از خواندن اعضا'}
              </button>
            </div>
            <div data-testid="rt-fe-notif-delivery-verdict" className={`rounded p-2.5 text-[11px] font-bold ${deliveryOut.issues.length > 0 || !readOut.valid ? 'bg-rose-950/60 text-rose-200' : 'bg-emerald-950/60 text-emerald-200'}`}>
              {readOut.issues[0] ?? deliveryOut.summaryFa}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-teal-300">تفکیک ۴ وضعیت Inbox از ۹ وضعیت Delivery (§۲۳.۷ & §۲۳.۲۲)</h5>
            <div className="flex flex-wrap gap-1">
              {RT_NOTIF_STATUSES_4.map((s) => <span key={s} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-emerald-200" dir="ltr">{s}</span>)}
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {RT_NOTIF_DELIVERY_STATUSES_9.map((d) => <span key={d} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-indigo-200" dir="ltr">{d}</span>)}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'security_deeplink' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-rose-300 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 shrink-0" /> <span>حفاظت امنیتی، تایید Push و Quiet Hours (§۲۳.۱۵–۲۱)</span></h5>
            <button type="button" data-testid="rt-fe-notif-toggle-sec" onClick={() => setDisableSecMandatory((v) => !v)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${disableSecMandatory ? 'bg-rose-700 text-white' : 'bg-emerald-700 text-white'}`}>
              {disableSecMandatory ? 'خاموش‌کردن امنیت یا Push بدون تایید (مسدود)' : 'سیاست مجاز · Asia/Tehran و Push با تایید صریح'}
            </button>
            <div data-testid="rt-fe-notif-sec-verdict" className={`rounded p-2.5 text-[11px] space-y-1 ${secOut.allowed ? 'bg-emerald-950/60 text-emerald-200 font-bold' : 'bg-rose-950/60 text-rose-200 font-bold'}`}>
              {secOut.allowed ? 'تنظیمات امنیتی، Consent و IANA Timezone تایید شدند.' : secOut.issues.map((i) => <div key={i}>{i}</div>)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-cyan-300 flex items-center gap-1.5"><Link2 className="w-4 h-4 shrink-0" /> <span>مسیریابی از Route Registry و مهار Open Redirect (§۲۳.۸)</span></h5>
            <button type="button" data-testid="rt-fe-notif-toggle-redirect" onClick={() => setOpenRedirectAttempt((v) => !v)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${openRedirectAttempt ? 'bg-rose-700 text-white' : 'bg-emerald-700 text-white'}`}>
              {openRedirectAttempt ? 'URL آزاد و غیرمجاز (مسدود)' : 'مسیر معتبر Route Registry با بررسی دسترسی'}
            </button>
            <div data-testid="rt-fe-notif-deeplink-verdict" className={`rounded p-2.5 text-[11px] font-bold ${deepLinkOut.safeToNavigate ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}>
              {deepLinkOut.safeToNavigate ? 'انتقال امن به مقصد پس از بررسی دسترسی Backend تایید شد.' : deepLinkOut.blockedReasonFa}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'endpoints_deliverables' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1 max-h-80 overflow-y-auto">
            <h5 className="font-bold text-cyan-300">۱۳ قرارداد API مرکز اعلان (§۲۳.۲۵)</h5>
            {RT_NOTIF_ENDPOINTS_13.map((ep) => (
              <div key={ep} className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1 font-mono text-[10px] text-indigo-200 break-all" dir="ltr">{ep}</div>
            ))}
            <div className="pt-1 text-[10px] text-emerald-300 space-y-0.5">
              <div>مرز پیام‌رسانی و گفتگوهای مرحله ۲۴ (§۲۳.۴۱) <code className="font-mono block" dir="ltr">{RT_FE_STAGE24_MESSAGING_BRIDGE_SPEC_ID}</code></div>
              <div>مرز حساب کاربری <code className="font-mono block" dir="ltr">{RT_FE_STAGE24_ACCOUNT_BRIDGE_SPEC_ID}</code></div>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">۳۶ خروجی تحویلی مرحله بیست‌وسوم (§۲۳.۳۹)</h5>
            <div className="max-h-72 overflow-y-auto grid grid-cols-1 gap-1 sm:grid-cols-2">
              {RT_NOTIF_DELIVERABLES_36.map((del) => (
                <div key={del.id} className="rounded border border-slate-800 bg-slate-950/60 p-1.5 text-[11px] text-slate-200 flex flex-col gap-0.5">
                  <span className="font-mono font-bold text-emerald-300 text-[10px]" dir="ltr">✓ {del.id}</span>
                  <span dir="auto">{del.titleFa}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

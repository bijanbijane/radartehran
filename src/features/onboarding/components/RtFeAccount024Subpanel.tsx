import React, { useMemo, useState } from 'react';
import { BadgeCheck, KeyRound, ShieldCheck, UserCheck } from 'lucide-react';
import {
  RT_FE_USER_ACCOUNT_024_SPEC_ID, RT_FE_STAGE25_BRIDGE_SPEC_ID,
  RT_ACCOUNT_LAYERS_8, RT_ACCOUNT_CONCEPTS_6, RT_ACCOUNT_LIFECYCLE_STATUSES_10,
  RT_PROFILE_VISIBILITY_5, RT_VERIFICATION_STATUSES_9, RT_ACCOUNT_API_ENDPOINTS_29, RT_ACCOUNT_DELIVERABLES_40,
  evaluateIdentityAndLifecyclePolicy, evaluateProfileSeparationAndAvatar,
  evaluateVerificationAndTrustBadges, evaluateSecuritySessionAndLifecycle,
} from '../services/rtFeAccount024Engine';

type AccountTabId = 'identity_lifecycle' | 'profile_privacy_avatar' | 'verification_security' | 'endpoints_deliverables';

export const RtFeAccount024Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AccountTabId>('identity_lifecycle');
  const [leakAuthSubject, setLeakAuthSubject] = useState<boolean>(true);
  const [accountStatus, setAccountStatus] = useState<(typeof RT_ACCOUNT_LIFECYCLE_STATUSES_10)[number]>('restricted');
  const [includePrivInPublic, setIncludePrivInPublic] = useState<boolean>(true);
  const [clientVer, setClientVer] = useState<number>(2);
  const [avatarFmt, setAvatarFmt] = useState<'svg' | 'webp'>('svg');
  const [profStatus, setProfStatus] = useState<(typeof RT_VERIFICATION_STATUSES_9)[number]>('expired');
  const [reauthOk, setReauthOk] = useState<boolean>(false);

  const identityOut = useMemo(
    () =>
      evaluateIdentityAndLifecyclePolicy({
        exposeAuthSubjectPublicly: leakAuthSubject,
        professionGrantAutoPermission: false,
        accountStatus,
        mergedTargetUserId: accountStatus === 'merged' ? 'usr-target-2' : undefined,
      }),
    [leakAuthSubject, accountStatus],
  );

  const profileOut = useMemo(
    () =>
      evaluateProfileSeparationAndAvatar({
        publicPayloadIncludesPrivateFields: includePrivInPublic,
        clientVersion: clientVer,
        serverVersion: 3,
        avatarFormat: avatarFmt,
        svgSanitized: false,
        completionImpliesVerification: false,
      }),
    [includePrivInPublic, clientVer, avatarFmt],
  );

  const badgeOut = useMemo(
    () =>
      evaluateVerificationAndTrustBadges({
        phoneVerified: true,
        identityVerified: false,
        professionalStatus: profStatus,
        deleteProfessionalProfile: true,
      }),
    [profStatus],
  );

  const secOut = useMemo(
    () =>
      evaluateSecuritySessionAndLifecycle({
        activeLoginMethodsCount: 1,
        requestRemoveLastLoginMethod: !reauthOk,
        sessionRevokedInBackend: true,
        reauthVerifiedForSensitiveAction: reauthOk,
        actionType: 'account_deletion',
      }),
    [reauthOk],
  );

  return (
    <div dir="rtl" data-testid="rt-fe-account-024-panel" className="space-y-4 text-right">
      <div className="rounded-xl border border-teal-500/30 bg-slate-900/95 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-teal-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-300" dir="ltr">
                {RT_FE_USER_ACCOUNT_024_SPEC_ID}
              </span>
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                ۸ لایه · ۶ مفهوم مجزا · ۲۹ API · ۴۰ خروجی OUT
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله بیست‌وچهارم: نظام حساب کاربری، پروفایل، هویت دیجیتال و مدیریت اطلاعات شخصی کاربران
            </h4>
          </div>
          <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 text-xs font-bold text-emerald-300 whitespace-nowrap shrink-0" dir="ltr">
            Identity !== Profile !== Permission
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'identity_lifecycle', label: '۱. هویت پایه، تفکیک ۶ مفهوم و چرخه عمر ۱۰ وضعیتی حساب' },
            { id: 'profile_privacy_avatar', label: '۲. پروفایل عمومی/خصوصی، تعارض نسخه ویرایش و امنیت Avatar' },
            { id: 'verification_security', label: '۳. تفکیک نشان‌های تایید، امنیت نشست و احراز هویت مجدد' },
            { id: 'endpoints_deliverables', label: '۴. فهرست ۲۹ قرارداد رابط کاربری، ۴۰ خروجی نهایی و مرز مرحله ۲۵' },
          ].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as AccountTabId)} data-testid={`rt-fe-account-tab-${tab.id}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === tab.id ? 'bg-teal-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'identity_lifecycle' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-teal-300 flex items-center gap-1.5"><UserCheck className="w-4 h-4 shrink-0" /> <span>هویت پایه، <span dir="ltr">authSubject</span> و چرخه عمر حساب (§۲۴.۶ & §۲۴.۷)</span></h5>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="rt-fe-acc-toggle-authsub" onClick={() => setLeakAuthSubject((v) => !v)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${leakAuthSubject ? 'bg-rose-700 text-white' : 'bg-emerald-700 text-white'}`}>
                {leakAuthSubject ? 'نشت authSubject در نمای عمومی (مسدود)' : 'تفکیک userId پایدار از authSubject'}
              </button>
              <select aria-label="وضعیت چرخه عمر حساب" value={accountStatus} onChange={(e) => setAccountStatus(e.target.value as (typeof RT_ACCOUNT_LIFECYCLE_STATUSES_10)[number])} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-white" dir="ltr">
                {RT_ACCOUNT_LIFECYCLE_STATUSES_10.map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>
            <div data-testid="rt-fe-acc-id-verdict" className={`rounded p-2.5 text-[11px] font-bold ${identityOut.valid ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}>
              {identityOut.summaryFa}
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {RT_ACCOUNT_CONCEPTS_6.map((c) => <span key={c.concept} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-cyan-200" dir="ltr">{c.concept}</span>)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1 max-h-80 overflow-y-auto">
            <h5 className="font-bold text-cyan-300">۸ لایه معماری کلان حساب کاربری (§۲۴.۴)</h5>
            {RT_ACCOUNT_LAYERS_8.map((l) => (
              <div key={l.layer} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[11px]">
                <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-cyan-300 ml-1.5" dir="ltr">{l.layer}. {l.nameEn}</span>
                <span className="text-slate-200">{l.roleFa}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'profile_privacy_avatar' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-indigo-300 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 shrink-0" /> <span>جداسازی پروفایل عمومی/خصوصی، نسخه ویرایش و Avatar (§۲۴.۱۲–۱۴)</span></h5>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="rt-fe-acc-toggle-priv-leak" onClick={() => setIncludePrivInPublic((v) => !v)} className={`rounded px-2 py-1 text-[11px] font-bold ${includePrivInPublic ? 'bg-rose-700 text-white' : 'bg-emerald-700 text-white'}`}>
                {includePrivInPublic ? 'ارسال فیلد Private در API عمومی (مسدود)' : 'جداسازی کامل Public API'}
              </button>
              <button type="button" data-testid="rt-fe-acc-toggle-ver" onClick={() => setClientVer((v) => (v === 2 ? 3 : 2))} className={`rounded px-2 py-1 text-[11px] font-bold ${clientVer < 3 ? 'bg-amber-700 text-white' : 'bg-teal-600 text-white'}`}>
                {clientVer < 3 ? 'تعارض نسخه (v2 vs v3)' : 'نسخه همگام (v3)'}
              </button>
              <button type="button" data-testid="rt-fe-acc-toggle-avatar" onClick={() => setAvatarFmt((f) => (f === 'svg' ? 'webp' : 'svg'))} className={`rounded px-2 py-1 text-[11px] font-bold ${avatarFmt === 'svg' ? 'bg-rose-700 text-white' : 'bg-emerald-700 text-white'}`}>
                {avatarFmt === 'svg' ? 'SVG تاییدنشده (رد)' : 'WebP ایمن'}
              </button>
            </div>
            <div data-testid="rt-fe-acc-profile-verdict" className={`rounded p-2.5 text-[11px] space-y-1 ${profileOut.saveAllowed ? 'bg-emerald-950/60 text-emerald-200 font-bold' : 'bg-rose-950/60 text-rose-200 font-bold'}`}>
              {profileOut.saveAllowed ? 'پروفایل بدون افشای داده خصوصی، با نسخه همگام و تصویر ایمن آماده ذخیره است.' : profileOut.issues.map((i) => <div key={i}>{i}</div>)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-teal-300">۵ سطح نمایش فیلدها و جداسازی Cache کاربر (§۲۴.۱۴ & §۲۴.۴۵)</h5>
            <div className="flex flex-wrap gap-1">
              {RT_PROFILE_VISIBILITY_5.map((v) => <span key={v} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-cyan-200" dir="ltr">{v}</span>)}
            </div>
            <p className="text-[11px] text-slate-300">در زمان Logout تمام Cacheهای خصوصی کاربر باید بی‌اعتبار شوند و کلیدهای Query با userId تفکیک می‌شوند.</p>
          </div>
        </div>
      )}

      {activeTab === 'verification_security' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-cyan-300 flex items-center gap-1.5"><BadgeCheck className="w-4 h-4 shrink-0" /> <span>استقلال تاییدها و انقضای نشان (§۲۴.۱۸–۲۰)</span></h5>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="rt-fe-acc-badge-exp" onClick={() => setProfStatus('expired')} className={`rounded px-2 py-1 text-[11px] font-bold ${profStatus === 'expired' ? 'bg-rose-700 text-white' : 'bg-slate-800 text-slate-300'}`}>وضعیت منقضی (Expired)</button>
              <button type="button" data-testid="rt-fe-acc-badge-ver" onClick={() => setProfStatus('verified')} className={`rounded px-2 py-1 text-[11px] font-bold ${profStatus === 'verified' ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-300'}`}>تایید معتبر (Verified)</button>
            </div>
            <div data-testid="rt-fe-acc-badge-verdict" className={`rounded p-2.5 text-[11px] font-bold ${badgeOut.showProfessionalBadge ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}>
              {badgeOut.issues[0] ?? 'نشان تایید حرفه‌ای فعال است و حذف پروفایل تخصصی باعث حذف حساب پایه نمی‌شود.'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-amber-300 flex items-center gap-1.5"><KeyRound className="w-4 h-4 shrink-0" /> <span>حذف روش ورود، Re-auth و حذف حساب (§۲۴.۲۶–۳۲)</span></h5>
            <button type="button" data-testid="rt-fe-acc-toggle-reauth" onClick={() => setReauthOk((v) => !v)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${reauthOk ? 'bg-emerald-700 text-white' : 'bg-rose-700 text-white'}`}>
              {reauthOk ? 'احراز هویت مجدد تاییدشده + روش جایگزین فعال' : 'تلاش حذف بدون Re-auth یا حذف آخرین روش ورود'}
            </button>
            <div data-testid="rt-fe-acc-sec-verdict" className={`rounded p-2.5 text-[11px] space-y-1 ${secOut.actionAllowed ? 'bg-emerald-950/60 text-emerald-200 font-bold' : 'bg-rose-950/60 text-rose-200 font-bold'}`}>
              {secOut.actionAllowed ? secOut.summaryFa : secOut.issues.map((i) => <div key={i}>{i}</div>)}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'endpoints_deliverables' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1 max-h-80 overflow-y-auto">
            <h5 className="font-bold text-cyan-300">۲۹ قرارداد API حساب کاربری (§۲۴.۳۴)</h5>
            {RT_ACCOUNT_API_ENDPOINTS_29.map((ep) => (
              <div key={ep} className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1 font-mono text-[10px] text-indigo-200 break-all" dir="ltr">{ep}</div>
            ))}
            <div className="pt-1 text-[10px] text-emerald-300">مرز انتقال به مرحله ۲۵ <code className="font-mono block mt-0.5" dir="ltr">{RT_FE_STAGE25_BRIDGE_SPEC_ID}</code></div>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">۴۰ خروجی نهایی مرحله بیست‌وچهارم (RT-FE-ACCOUNT-OUT-001 تا 040)</h5>
            <div className="max-h-72 overflow-y-auto grid grid-cols-1 gap-1 sm:grid-cols-2">
              {RT_ACCOUNT_DELIVERABLES_40.map((del) => (
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

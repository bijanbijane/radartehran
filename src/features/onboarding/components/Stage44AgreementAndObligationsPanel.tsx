/** @file src/features/onboarding/components/Stage44AgreementAndObligationsPanel.tsx — Stage 44 Agreement Versions, Diff & Party Obligations */
import React, { useState } from 'react';
import {
  approveAgreementVersion,
  dossierActiveVersion,
  formatTomanCurrency,
  numberToPersianWordsToman,
  proposeAgreementRevision,
} from '../services/serviceTransactionEngine';
import type { ObligationStatus, ServiceTransactionDossier } from '../services/serviceTransactionTypes';

export interface Stage44AgreementAndObligationsPanelProps {
  section: 'agreement' | 'obligations';
  dossier: ServiceTransactionDossier;
  onUpdateDossier: (next: ServiceTransactionDossier) => void;
  onFeedbackFa: (msg: string) => void;
}

export const Stage44AgreementAndObligationsPanel: React.FC<Stage44AgreementAndObligationsPanelProps> = ({
  section,
  dossier,
  onUpdateDossier,
  onFeedbackFa,
}) => {
  const activeVersion = dossierActiveVersion(dossier);
  const [revAmountToman, setRevAmountToman] = useState(String(activeVersion.amountToman + 300_000));
  const [revScopeNote, setRevScopeNote] = useState('بررسی رطوبت‌سنجی دیوارهای ضلع شمالی و عایق پشت‌بام');
  const [revReasonFa, setRevReasonFa] = useState('درخواست متقاضی برای بازدید تکمیلی عایق‌کاری');

  const handleProposeRevision = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(revAmountToman.replace(/[^0-9]/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      onFeedbackFa('مبلغ پیشنهادی نسخه جدید باید عددی معتبر به تومان باشد.');
      return;
    }
    const next = proposeAgreementRevision({
      dossier,
      newAmountToman: numeric,
      newScopeNoteFa: revScopeNote,
      reasonFa: revReasonFa,
      actorNameFa: dossier.provider.displayNameFa,
    });
    onUpdateDossier(next);
    onFeedbackFa(`نسخه جدید ${dossierActiveVersion(next).versionLabel} ایجاد شد؛ نسخه قبلی در تاریخچه محفوظ ماند و تأیید مجدد طرفین الزامی است.`);
  };

  const handleApprove = (role: 'applicant' | 'provider') => {
    const res = approveAgreementVersion(dossier, role);
    onUpdateDossier(res.dossier);
    onFeedbackFa(res.contractSignatureNoticeFa);
  };

  const handleCycleObligationStatus = (obligationId: string) => {
    const order: ObligationStatus[] = ['انجام‌نشده', 'در حال انجام', 'نیازمند بررسی', 'انجام‌شده'];
    onUpdateDossier({
      ...dossier,
      obligations: dossier.obligations.map((o) => {
        if (o.obligationId !== obligationId) return o;
        const idx = order.indexOf(o.status);
        return { ...o, status: order[(idx + 1) % order.length] };
      }),
    });
    onFeedbackFa('وضعیت تعهد مستقل از وضعیت پرداخت به‌روزرسانی شد.');
  };

  if (section === 'obligations') {
    return (
      <div className="space-y-3" data-testid="txn-obligations-panel">
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-200">
          تفکیک شفاف تعهدات طرفین (TXN-06 · TXN-07): وضعیت انجام تعهدات درخواست‌کننده و ارائه‌دهنده کاملاً مستقل از وضعیت پرداخت ثبت می‌شود و یک بند مبهم شامل چند تعهد مختلف نیست.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {dossier.obligations.map((obl) => (
            <div key={obl.obligationId} className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${obl.responsibleRole === 'applicant' ? 'bg-cyan-950 text-cyan-200 border border-cyan-700' : 'bg-emerald-950 text-emerald-200 border border-emerald-700'}`}>
                    مسئول: {obl.responsibleLabelFa}
                  </span>
                  <h4 className="mt-1 text-xs font-bold text-white">{obl.titleFa}</h4>
                </div>
                <button
                  type="button"
                  onClick={() => handleCycleObligationStatus(obl.obligationId)}
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-slate-200 hover:border-cyan-500 cursor-pointer"
                >
                  {obl.status}
                </button>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">{obl.descriptionFa}</p>
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>زمان/شرط اجرا: {obl.dueConditionFa}</span>
                <span>{obl.linkedStageFa}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="txn-agreement-panel">
      <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <div>
            <span className="text-[10px] font-bold text-cyan-400">سند توافق نسخه فعال {activeVersion.versionLabel} ({activeVersion.status}) · TXN-02 · TXN-03</span>
            <h4 className="text-xs font-bold text-white mt-0.5">{activeVersion.subjectTitleFa}</h4>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              data-testid="txn-approve-applicant-btn"
              onClick={() => handleApprove('applicant')}
              className="rounded border border-emerald-600 bg-emerald-950/50 px-2.5 py-1 text-[11px] font-bold text-emerald-200 cursor-pointer"
            >
              تأیید درخواست‌کننده ({activeVersion.applicantApproved ? 'تأییدشده' : 'در انتظار'})
            </button>
            <button
              type="button"
              data-testid="txn-approve-provider-btn"
              onClick={() => handleApprove('provider')}
              className="rounded border border-cyan-600 bg-cyan-950/50 px-2.5 py-1 text-[11px] font-bold text-cyan-200 cursor-pointer"
            >
              تأیید ارائه‌دهنده ({activeVersion.providerApproved ? 'تأییدشده' : 'در انتظار'})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2.5 space-y-1">
            <div className="font-bold text-slate-200">۱. مشخصات طرفین و حدود نمایندگی</div>
            <div className="text-slate-300">درخواست‌کننده: {dossier.applicant.displayNameFa} ({dossier.applicant.verifiedIdentityLabelFa})</div>
            <div className="text-slate-300">ارائه‌دهنده: {dossier.provider.displayNameFa} ({dossier.provider.representativeNoteFa})</div>
            <div className="text-slate-400">محدوده ملک: {dossier.locationSummaryFa}</div>
          </div>
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2.5 space-y-1">
            <div className="font-bold text-slate-200">۲. خلاصه مالی به تومان (TXN-13)</div>
            <div className="text-emerald-300 font-bold tabular-nums">
              مبلغ پایه: {formatTomanCurrency(activeVersion.amountToman)} ({numberToPersianWordsToman(activeVersion.amountToman)})
            </div>
            <div className="text-slate-300 tabular-nums">
              هزینه بازدید مجزا: {formatTomanCurrency(activeVersion.sideCostsToman)} · کارمزد رادار تهران: {formatTomanCurrency(activeVersion.platformFeeToman)}
            </div>
            <div className="text-slate-400">{activeVersion.paymentTermsFa}</div>
          </div>
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2.5 space-y-1">
            <div className="font-bold text-emerald-300">۳. موارد داخل تعهد خدمت</div>
            <ul className="list-disc list-inside text-slate-300 space-y-0.5">
              {activeVersion.scopeIncludedFa.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </div>
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2.5 space-y-1">
            <div className="font-bold text-rose-300">۴. موارد خارج از تعهد و شرایط لغو/اختلاف</div>
            <ul className="list-disc list-inside text-slate-300 space-y-0.5">
              {activeVersion.outOfScopeFa.map((s) => <li key={s}>{s}</li>)}
            </ul>
            <div className="text-slate-400 pt-1">{activeVersion.supplementaryTermsFa.cancellationFa}</div>
          </div>
        </div>

        <div className="rounded border border-amber-600/40 bg-amber-950/20 px-2.5 py-1.5 text-[11px] text-amber-200">
          توضیح ساده و حقوقی: این صفحه توافق مستند درون‌پلتفرمی است؛ فشردن دکمه تأیید/«موافقم» بدون الزامات قانونی، جایگزین قرارداد رسمی امضاشده محسوب نمی‌شود.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2" data-testid="txn-version-history">
          <div className="text-xs font-bold text-white">تاریخچه تغییرناپذیر نسخه‌های توافق و تفاوت تغییرات (TXN-04 · TXN-05)</div>
          <div className="space-y-2">
            {dossier.agreementVersions.map((ver) => (
              <div key={ver.versionId} className="rounded border border-slate-800 bg-slate-900/70 p-2 text-[11px] space-y-1">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-cyan-300">نسخه {ver.versionLabel} — {ver.status}</span>
                  <span className="text-slate-400 tabular-nums">{formatTomanCurrency(ver.amountToman)}</span>
                </div>
                <div className="text-slate-300">{ver.changeSummaryFa}</div>
                <div className="text-[10px] text-amber-300">تغییرات: {ver.changesFromPreviousFa.join(' · ')}</div>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleProposeRevision} className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2">
          <div className="text-xs font-bold text-white">پیشنهاد اصلاح مبلغ/دامنه (ایجاد نسخه جدید با الزام تأیید مجدد)</div>
          <label className="block text-[11px] text-slate-300 space-y-1">
            <span>مبلغ پایه جدید (تومان):</span>
            <input
              type="text"
              aria-label="مبلغ پایه جدید توافق به تومان"
              data-testid="txn-revise-amount-input"
              value={revAmountToman}
              onChange={(e) => setRevAmountToman(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
            />
          </label>
          <label className="block text-[11px] text-slate-300 space-y-1">
            <span>بند جدید دامنه کار:</span>
            <input
              type="text"
              aria-label="بند جدید دامنه توافق"
              value={revScopeNote}
              onChange={(e) => setRevScopeNote(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
            />
          </label>
          <label className="block text-[11px] text-slate-300 space-y-1">
            <span>دلیل تغییر:</span>
            <input
              type="text"
              aria-label="دلیل اصلاح توافق"
              value={revReasonFa}
              onChange={(e) => setRevReasonFa(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
            />
          </label>
          <button
            type="submit"
            data-testid="txn-propose-revision-btn"
            className="w-full rounded-lg bg-cyan-600 hover:bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 cursor-pointer"
          >
            ثبت نسخه جدید توافق (بدون حذف نسخه قبلی)
          </button>
        </form>
      </div>
    </div>
  );
};

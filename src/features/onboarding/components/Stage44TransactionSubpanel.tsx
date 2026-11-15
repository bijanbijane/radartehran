/** @file src/features/onboarding/components/Stage44TransactionSubpanel.tsx — Stage 44 Service Agreements, Payments & Financial Transparency */
import React, { useState } from 'react';
import { canAccessTransactionDossier } from '../services/serviceTransactionEngine';
import { EIGHT_FINANCIAL_CONCEPTS, type ServiceTransactionDossier, type TransactionViewerRole } from '../services/serviceTransactionTypes';
import { INITIAL_STAGE44_DOSSIER } from '../services/stage44TransactionFixtures';
import { Stage44AgreementAndObligationsPanel } from './Stage44AgreementAndObligationsPanel';
import { Stage44InvoicesAndPaymentsPanel } from './Stage44InvoicesAndPaymentsPanel';

type DossierTabId = 'agreement' | 'obligations' | 'invoices' | 'payments' | 'receipts' | 'provider';

export const Stage44TransactionSubpanel: React.FC = () => {
  const [dossier, setDossier] = useState<ServiceTransactionDossier>(INITIAL_STAGE44_DOSSIER);
  const [activeTab, setActiveTab] = useState<DossierTabId>('agreement');
  const [viewerRole, setViewerRole] = useState<TransactionViewerRole>('applicant');
  const [feedbackFa, setFeedbackFa] = useState<string>('');

  const viewerUserId =
    viewerRole === 'applicant'
      ? dossier.applicant.userId
      : viewerRole === 'provider'
        ? dossier.provider.userId
        : viewerRole === 'admin'
          ? 'usr-admin-1'
          : 'usr-stranger-99';

  const access = canAccessTransactionDossier(dossier, viewerUserId, viewerRole);

  return (
    <div className="space-y-4" data-testid="stage44-transaction-subpanel" dir="rtl">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white">مرحله ۴۴: توافق خدمت، پرداخت شفاف و پرونده مالی (RT-UI-SERVICE-TRANSACTION-001)</h3>
            <p className="mt-1 text-xs text-slate-400">
              متصل به درخواست {dossier.requestId} · پیشنهاد {dossier.quoteId} · واحد انحصاری تومان + نمایش حروفی · تفکیک ۸ مفهوم مالی
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-slate-400">نقش بیننده (کنترل دسترسی):</span>
            <select
              aria-label="نقش بیننده پرونده مالی"
              data-testid="txn-viewer-role-select"
              value={viewerRole}
              onChange={(e) => setViewerRole(e.target.value as TransactionViewerRole)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-white"
            >
              <option value="applicant">درخواست‌کننده ({dossier.applicant.displayNameFa})</option>
              <option value="provider">ارائه‌دهنده ({dossier.provider.displayNameFa})</option>
              <option value="admin">مدیر ممیزی سامانه</option>
              <option value="unauthorized_third_party">کاربر غیرمجاز شخص ثالث</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="txn-eight-concepts-strip">
          {EIGHT_FINANCIAL_CONCEPTS.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2 text-[10px] space-y-0.5">
              <div className="font-bold text-cyan-300">{c.titleFa}</div>
              <div className="text-slate-300">{c.boundaryRuleFa}</div>
            </div>
          ))}
        </div>

        {!access.allowed ? (
          <div data-testid="txn-access-denied-banner" className="rounded-lg border border-rose-600/60 bg-rose-950/40 p-4 text-xs font-bold text-rose-200">
            {access.reasonFa}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="بخش‌های پرونده مالی مرحله ۴۴">
              {(
                [
                  ['agreement', '۱. توافق نهایی و نسخه‌ها'],
                  ['obligations', '۲. تعهدات طرفین'],
                  ['invoices', '۳. پیش‌فاکتور و صورت‌حساب'],
                  ['payments', '۴. پرداخت و مراحل اجرا'],
                  ['receipts', '۵. رسیدها، لغو و بازپرداخت'],
                  ['provider', '۶. پنل مالی ارائه‌دهنده'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  data-testid={`txn-tab-${id}`}
                  onClick={() => setActiveTab(id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold cursor-pointer ${
                    activeTab === id ? 'border-cyan-500 bg-cyan-950/50 text-cyan-200' : 'border-slate-700 bg-slate-950 text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {feedbackFa && (
              <div data-testid="stage44-feedback-banner" className="rounded-lg border border-cyan-500/40 bg-cyan-950/30 px-3 py-1.5 text-[11px] text-cyan-200">
                {feedbackFa}
              </div>
            )}

            {(activeTab === 'agreement' || activeTab === 'obligations') && (
              <Stage44AgreementAndObligationsPanel section={activeTab} dossier={dossier} onUpdateDossier={setDossier} onFeedbackFa={setFeedbackFa} />
            )}

            {(activeTab === 'invoices' || activeTab === 'payments' || activeTab === 'receipts' || activeTab === 'provider') && (
              <Stage44InvoicesAndPaymentsPanel section={activeTab} dossier={dossier} onUpdateDossier={setDossier} onFeedbackFa={setFeedbackFa} />
            )}
          </>
        )}

        <div className="text-[10px] text-slate-500">
          حریم خصوصی مالی (TXN-30): شماره کارت کامل، رمز بانکی و شناسه حساس پرداخت‌کننده هرگز در سابقه عمومی یا رابط کاربری ذخیره و نمایش داده نمی‌شوند.
        </div>
      </div>
    </div>
  );
};
export default Stage44TransactionSubpanel;

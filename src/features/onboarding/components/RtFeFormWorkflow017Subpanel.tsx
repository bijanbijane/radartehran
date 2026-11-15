import React, { useMemo, useState } from 'react';
import { FileCheck2, GitMerge, Languages, ShieldAlert } from 'lucide-react';
import {
  RT_FE_FORM_WORKFLOW_017_SPEC_ID, RT_FE_STAGE18_BRIDGE_SPEC_ID,
  RT_FORM_LAYERS_8, RT_FORM_REGISTRY_SAMPLE_7, RT_FORM_ADMIN_RISK_5,
  RT_FORM_EXECUTION_PHASES_12, RT_FORM_DELIVERABLES_30,
  normalizePersianNumericInput, convertMoneyValue,
  validatePropertyAndListingForm, evaluateDraftAndAutosaveTransition,
  evaluateWorkflowTransition,
} from '../services/rtFeFormWorkflow017Engine';

type FormTabId = 'layers_normalization' | 'validation_money' | 'draft_workflow' | 'phases_deliverables';

export const RtFeFormWorkflow017Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<FormTabId>('layers_normalization');
  const [rawNumInput, setRawNumInput] = useState<string>('۱۲٬۵۰۰٬۰۰۰٬۰۰۰');
  const [dealType, setDealType] = useState<'sale' | 'rent'>('sale');
  const [areaSqm, setAreaSqm] = useState<number>(100);
  const [salePriceToman, setSalePriceToman] = useState<number>(35000);
  const [expectedVer, setExpectedVer] = useState<number>(2);
  const [hasReviewerRole, setHasReviewerRole] = useState<boolean>(false);
  const [hasMethodology, setHasMethodology] = useState<boolean>(true);

  const normOut = useMemo(() => normalizePersianNumericInput(rawNumInput), [rawNumInput]);
  const irrConverted = useMemo(
    () => (normOut.parsedNumber !== null ? convertMoneyValue({ amount: normOut.parsedNumber, currency: 'IRT' }, 'IRR') : null),
    [normOut.parsedNumber],
  );
  const validationOut = useMemo(
    () => validatePropertyAndListingForm({ areaSqm, dealType, salePriceToman, depositToman: 2000, neighborhoodMedianPerSqmToman: 120 }),
    [areaSqm, dealType, salePriceToman],
  );
  const draftOut = useMemo(
    () => evaluateDraftAndAutosaveTransition({ isSensitiveForm: true, storageTarget: 'server_draft_api', expectedVersion: expectedVer, serverVersion: 3, isOffline: false, serverConfirmedSave: true }),
    [expectedVer],
  );
  const wfOut = useMemo(
    () => evaluateWorkflowTransition({ from: 'review', to: 'published', hasReviewerPermission: hasReviewerRole, hasUnitPeriodAndSource: hasMethodology }),
    [hasReviewerRole, hasMethodology],
  );

  return (
    <div dir="rtl" data-testid="rt-fe-form-017-panel" className="space-y-4 text-right">
      <div className="rounded-xl border border-teal-500/30 bg-slate-900/95 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-teal-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-300" dir="ltr">
                {RT_FE_FORM_WORKFLOW_017_SPEC_ID}
              </span>
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                ۸ لایه · ۱۱ فیلد معنایی · ۹ وضعیت گردش‌کار · ۳۰ خروجی OUT
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله هفدهم: نظام فرم‌ها، ورود اطلاعات فارسی، اعتبارسنجی و گردش‌کارهای کاربری
            </h4>
          </div>
          <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 text-xs font-bold text-emerald-300 whitespace-nowrap shrink-0" dir="ltr">
            Draft ≠ Submission ≠ Published
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'layers_normalization', label: '۱. ۸ لایه فرم، Registry و نرمال‌ساز فارسی/تومان' },
            { id: 'validation_money', label: '۲. اعتبارسنجی Error vs Warning و تفکیک ملک/آگهی' },
            { id: 'draft_workflow', label: '۳. تعارض نسخه Draft، گردش‌کار انتشار و M0-M4' },
            { id: 'phases_deliverables', label: '۴. نقشه ۱۲فازی و ۳۰ خروجی OUT-001..030' },
          ].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as FormTabId)} data-testid={`rt-fe-form-tab-${tab.id}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === tab.id ? 'bg-teal-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'layers_normalization' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-teal-300 flex items-center gap-1.5"><Languages className="w-4 h-4 shrink-0" /> <span>تبدیل ارقام فارسی/عربی (<span className="whitespace-nowrap">§۱۷.۱۲</span>) و واحد پولی تک‌لایه (<span className="whitespace-nowrap">§۱۷.۱۴</span>)</span></h5>
            <input type="text" aria-label="ورودی عددی فارسی یا عربی" data-testid="rt-fe-form-num-input" value={rawNumInput} onChange={(e) => setRawNumInput(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-white" dir="ltr" />
            <div data-testid="rt-fe-form-num-result" className="rounded bg-slate-950 p-2.5 text-[11px] space-y-1 text-slate-200">
              <div>متن خام حفظ‌شده: <span className="text-amber-300">{normOut.rawPreserved}</span></div>
              <div>عدد استاندارد داخلی (IRT): <strong className="font-mono text-emerald-300" dir="ltr">{normOut.parsedNumber ?? 'نامعتبر'}</strong></div>
              <div>معادل تک‌لایه ریال (IRR): <strong className="font-mono text-cyan-300" dir="ltr">{irrConverted ? irrConverted.amount.toLocaleString('en-US') : '—'}</strong></div>
            </div>
            <div className="space-y-1 pt-1">
              {RT_FORM_REGISTRY_SAMPLE_7.slice(0, 5).map((f) => (
                <div key={f.id} className="flex justify-between rounded bg-slate-950/70 px-2 py-1 text-[10px]">
                  <span className="font-mono font-bold text-indigo-300" dir="ltr">{f.id} (v{f.schemaVersion})</span>
                  <span className="text-slate-300">{f.titleFa}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5">
            <h5 className="font-bold text-cyan-300">معماری ۸لایه نظام فرم‌ها و سازگاری <span dir="ltr">Cloudflare</span> (<span className="whitespace-nowrap">§۱۷.۵</span> و <span className="whitespace-nowrap">§۱۷.۴۳</span>)</h5>
            {RT_FORM_LAYERS_8.map((l) => (
              <div key={l.layer} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[11px]">
                <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-cyan-300 ml-1.5" dir="ltr">{l.layer}. {l.nameEn}</span>
                <span className="text-slate-200">{l.roleFa}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'validation_money' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-indigo-300 flex items-center gap-1.5"><FileCheck2 className="w-4 h-4" /> موتور اعتبارسنجی: تفکیک Error مسدودکننده از Warning (§۱۷.۱۱.۱)</h5>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="rt-fe-form-deal-sale" onClick={() => setDealType('sale')} className={`rounded px-2.5 py-1 text-[11px] font-bold ${dealType === 'sale' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>معامله فروش</button>
              <button type="button" data-testid="rt-fe-form-deal-rent" onClick={() => setDealType('rent')} className={`rounded px-2.5 py-1 text-[11px] font-bold ${dealType === 'rent' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>معامله رهن/اجاره</button>
              <button type="button" data-testid="rt-fe-form-bad-area" onClick={() => setAreaSqm((a) => (a === 0 ? 100 : 0))} className="rounded bg-rose-900/60 px-2.5 py-1 text-[11px] font-bold text-rose-200">
                {areaSqm === 0 ? 'تنظیم متراژ ۱۰۰متر' : 'تست متراژ ۰ (Error تقسیم بر صفر)'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-slate-300">قیمت کل فروش (میلیون تومان):</label>
              <input type="number" aria-label="قیمت کل فروش" value={salePriceToman} onChange={(e) => setSalePriceToman(Number(e.target.value))} className="w-28 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white" dir="ltr" />
            </div>
            <div data-testid="rt-fe-form-validation-verdict" className="rounded bg-slate-950 p-2.5 space-y-1 text-[11px]">
              <div className={validationOut.canSubmit ? 'text-emerald-300 font-bold' : 'text-rose-300 font-bold'}>
                امکان ارسال فرم: {validationOut.canSubmit ? 'مجاز (بدون Error مسدودکننده)' : 'مسدود تا رفع خطا'}
              </div>
              {validationOut.issues.map((iss) => (
                <div key={iss.code} className={iss.severity === 'error' ? 'text-rose-300' : 'text-amber-300'}>• [{iss.severity}] {iss.messageFa}</div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-teal-300 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" /> سطوح ریسک فرم‌های مدیریتی (M0 تا M4 — §۱۷.۲۷)</h5>
            {RT_FORM_ADMIN_RISK_5.map((m) => (
              <div key={m.level} className="rounded border border-slate-800 bg-slate-950/70 p-2 text-[11px]">
                <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-amber-300 ml-1.5" dir="ltr">{m.level}</span>
                <span className="text-slate-200">{m.labelFa}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'draft_workflow' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-cyan-300">کنترل تعارض نسخه Draft و Autosave (§۱۷.۲۰ & §۱۷.۳۰)</h5>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="rt-fe-form-ver-conflict" onClick={() => setExpectedVer(2)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${expectedVer === 2 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-300'}`}>شبیه‌سازی نسخه قدیمی (v2 در برابر v3)</button>
              <button type="button" data-testid="rt-fe-form-ver-match" onClick={() => setExpectedVer(3)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${expectedVer === 3 ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-300'}`}>نسخه همگام (v3)</button>
            </div>
            <div data-testid="rt-fe-form-draft-verdict" className={`rounded p-2.5 text-[11px] font-bold ${draftOut.status === 'Saved' ? 'bg-emerald-950/60 text-emerald-200' : 'bg-amber-950/60 text-amber-200'}`}>
              <span className="font-mono ml-1.5" dir="ltr">[{draftOut.status}]</span>{draftOut.reasonFa}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-indigo-300 flex items-center gap-1.5"><GitMerge className="w-4 h-4" /> گیت گردش‌کار Review ← Published و الزام منبع/واحد (§۱۷.۲۸)</h5>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-1.5 text-slate-200 cursor-pointer">
                <input type="checkbox" data-testid="rt-fe-form-wf-role" checked={hasReviewerRole} onChange={(e) => setHasReviewerRole(e.target.checked)} />
                مجوز بازبین رسمی
              </label>
              <label className="flex items-center gap-1.5 text-slate-200 cursor-pointer">
                <input type="checkbox" data-testid="rt-fe-form-wf-source" checked={hasMethodology} onChange={(e) => setHasMethodology(e.target.checked)} />
                دارای واحد، دوره و منبع معتبر
              </label>
            </div>
            <div data-testid="rt-fe-form-wf-verdict" className={`rounded p-2.5 text-[11px] font-bold ${wfOut.allowed ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}>
              {wfOut.reasonFa}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'phases_deliverables' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1 max-h-80 overflow-y-auto">
            <h5 className="font-bold text-cyan-300">نقشه اجرای ۱۲فازی (§۱۷.۴۲)</h5>
            {RT_FORM_EXECUTION_PHASES_12.map((ph) => (
              <div key={ph.phase} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[10px]">
                <strong className="text-teal-300">فاز {ph.phase}: </strong><span className="text-slate-200">{ph.titleFa}</span> <span className="font-mono text-indigo-300" dir="ltr">({ph.outputId})</span>
              </div>
            ))}
            <div className="pt-1 text-[10px] text-emerald-300">مرز انتقال به مرحله ۱۸: <code className="font-mono" dir="ltr">{RT_FE_STAGE18_BRIDGE_SPEC_ID}</code></div>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">۳۰ خروجی نهایی مرحله هفدهم (OUT-001 تا OUT-030)</h5>
            <div className="max-h-72 overflow-y-auto grid grid-cols-1 gap-1 sm:grid-cols-2">
              {RT_FORM_DELIVERABLES_30.map((del) => (
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

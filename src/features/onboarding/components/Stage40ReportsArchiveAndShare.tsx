/** @file src/features/onboarding/components/Stage40ReportsArchiveAndShare.tsx — RPT-15..18 Archive, Versions & Secure Share */
import React, { useState } from 'react';
import { NumericDraftInput } from '../../../components/ui/NumericDraftInput';
import {
  applyReportMetadataOrVersionUpdate,
  evaluateReportSharePermissions,
  type ReportShareMode,
  type StoredReportDocument,
} from '../services/reportsAndDocumentsEngine';

interface Props {
  documents: StoredReportDocument[];
  onUpdateDocument: (doc: StoredReportDocument) => void;
  onDeleteDocument: (reportId: string) => void;
}

export const Stage40ReportsArchiveAndShare: React.FC<Props> = ({
  documents,
  onUpdateDocument,
  onDeleteDocument,
}) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string>(documents[0]?.reportId ?? '');
  const [requestedShareMode, setRequestedShareMode] = useState<ReportShareMode>('private');
  const [expiryDays, setExpiryDays] = useState<number>(7);
  const [shareFeedbackFa, setShareFeedbackFa] = useState<string>('');

  const filtered = documents.filter((d) => filterType === 'all' || d.type === filterType);
  const activeDoc = documents.find((d) => d.reportId === selectedId) ?? documents[0];

  const handleNewVersion = (doc: StoredReportDocument) => {
    const res = applyReportMetadataOrVersionUpdate(doc, {
      kind: 'new_analytical_version',
      newDataRefDateFa: '۱۴ آبان ۱۴۰۵ (تازه‌سازی آگاهانه)',
      noteFa: 'به‌روزرسانی داده‌ها بدون تغییر نسخه ثابت قبلی',
    });
    onUpdateDocument(res.updatedDoc);
  };

  const handleRenameOnly = (doc: StoredReportDocument) => {
    const res = applyReportMetadataOrVersionUpdate(doc, {
      kind: 'rename',
      newTitleFa: `${doc.titleFa} (بازبینی عنوان)`,
    });
    onUpdateDocument(res.updatedDoc);
  };

  const handleApplyShare = () => {
    if (!activeDoc) return;
    const perm = evaluateReportSharePermissions({
      requestedMode: requestedShareMode,
      containsPrivatePii: activeDoc.containsPrivatePii,
      expiryDays,
      allowDownload: true,
    });
    setShareFeedbackFa(perm.reasonFa);
    onUpdateDocument({ ...activeDoc, shareMode: perm.effectiveMode, shareToken: perm.shareToken, shareExpiryDays: expiryDays });
  };

  return (
    <div className="space-y-3 text-xs" data-testid="stage40-archive-share" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-white">آرشیو گزارش‌های من و مدیریت نسخه‌ها (RPT-15 & RPT-17)</span>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label="فیلتر نوع گزارش" className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white">
          <option value="all">همه انواع گزارش ({documents.length})</option>
          <option value="neighborhood">گزارش محله</option>
          <option value="comparison">گزارش مقایسه</option>
          <option value="property">گزارش ملک</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-center text-slate-400">
          هنوز گزارشی در این دسته ثبت نشده است (RPT-20).
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => (
            <div key={d.reportId} className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-white">{d.titleFa} (نسخه {d.currentVersion})</div>
                  <div className="text-[10.5px] text-slate-400">
                    شناسه: <span dir="ltr">{d.reportId}</span> · نوع رفتار: {d.mode === 'snapshot' ? 'ثابت (Snapshot)' : 'پویا'} · دسترسی: {d.shareMode}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" data-testid={`new-ver-${d.reportId}`} onClick={() => handleNewVersion(d)} className="rounded border border-emerald-500/40 bg-emerald-950/30 px-2 py-1 text-[10.5px] font-bold text-emerald-300">
                    ساخت نسخه جدید
                  </button>
                  <button type="button" onClick={() => handleRenameOnly(d)} className="rounded border border-slate-700 px-2 py-1 text-[10.5px] text-slate-200">
                    تغییر نام (بدون نسخه جدید)
                  </button>
                  <button type="button" onClick={() => setSelectedId(d.reportId)} className="rounded border border-cyan-500/40 px-2 py-1 text-[10.5px] text-cyan-200">
                    اشتراک‌گذاری و تاریخچه
                  </button>
                  <button type="button" onClick={() => onDeleteDocument(d.reportId)} className="rounded border border-rose-500/40 px-2 py-1 text-[10.5px] text-rose-300">
                    حذف
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-300">
                {d.versions.map((v) => (
                  <span key={v.versionId} className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5">
                    v{v.version} ({v.dataReferenceDateLabelFa} · {v.snapshotFrozen ? 'ثابت/قفل‌شده' : 'پویا'})
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeDoc && (
        <div data-testid="stage40-share-dialog" className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 space-y-2">
          <div className="font-bold text-white">تنظیمات اشتراک‌گذاری کنترل‌شده (RPT-18) — {activeDoc.titleFa}</div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={requestedShareMode} onChange={(e) => setRequestedShareMode(e.target.value as ReportShareMode)} aria-label="حالت اشتراک‌گذاری" className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white">
              <option value="private">خصوصی (پیش‌فرض)</option>
              <option value="limited_link">لینک محدود (دارای انقضا)</option>
              <option value="public">خروجی عمومی</option>
            </select>
            <label className="flex items-center gap-1 text-[11px] text-slate-300">
              <span>انقضا (روز):</span>
              <NumericDraftInput min={1} max={90} fallback={7} value={expiryDays} onValueChange={setExpiryDays} className="w-14 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-white" />
            </label>
            <button type="button" data-testid="stage40-apply-share-btn" onClick={handleApplyShare} className="rounded bg-cyan-600 px-2.5 py-1 text-[11px] font-bold text-white">
              اعمال کنترل دسترسی
            </button>
          </div>
          {shareFeedbackFa && <div className="text-[11px] text-amber-300" data-testid="stage40-share-feedback">{shareFeedbackFa}</div>}
          {activeDoc.shareToken && <div className="text-[10.5px] text-emerald-300" dir="ltr">Token: {activeDoc.shareToken} (Expires in {activeDoc.shareExpiryDays}d)</div>}
        </div>
      )}
    </div>
  );
};

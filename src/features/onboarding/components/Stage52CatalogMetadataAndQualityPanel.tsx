/** @file src/features/onboarding/components/Stage52CatalogMetadataAndQualityPanel.tsx — Stage 52 Catalog, Provenance, Quality & Dictionary Panel */
import React, { useState } from 'react';
import {
  compareUrbanDatasetsByPurpose,
  evaluateDatasetAccessAndActions,
} from '../services/urbanDataAtlasEngine';
import {
  STAGE52_BOUNDARIES_8,
  type SpecialMissingValueKind,
  type UrbanDatasetCatalogRecord,
} from '../services/urbanDataAtlasTypes';

const SPECIAL_MISSING_DESCRIPTIONS: Record<SpecialMissingValueKind, string> = {
  صفر: 'صفر واقعی اندازه‌گیری‌شده (مثلاً ۰ مرکز درمانی در محدوده؛ با مقدار گمشده یکسان نیست).',
  'مقدار نامشخص': 'وضعیت واقعی موجودیت در منبع مشخص نشده است.',
  'اطلاعات ثبت نشده': 'فیلد در فرم یا سامانه منبع پر نشده است.',
  'اطلاعات قابل اعمال نیست': 'این ویژگی ذاتاً برای این نوع موجودیت موضوعیت ندارد.',
  'مقدار حذف‌شده': 'به‌دلیل حریم خصوصی یا اصلاح مرجع از نسخه عمومی کنار گذاشته شده است.',
  'مقدار در انتظار تأیید': 'مقدار پیشنهادی ثبت شده اما هنوز توسط ناظر تأیید نشده است.',
};

export const Stage52CatalogMetadataAndQualityPanel: React.FC<{
  section: 'catalog_metadata_and_quality' | 'dictionary_and_comparison';
  datasets: UrbanDatasetCatalogRecord[];
  onFeedbackFa: (msg: string) => void;
}> = ({ section, datasets, onFeedbackFa }) => {
  const [selectedId, setSelectedId] = useState(datasets[0]?.datasetId ?? 'RT-DATA-URBAN-0001');
  const [userRole, setUserRole] = useState<'visitor' | 'logged_in_user' | 'professional' | 'data_admin'>('logged_in_user');
  const [missingKind, setMissingKind] = useState<SpecialMissingValueKind>('صفر');
  const [intendedUse, setIntendedUse] = useState<'نمایش نقاط روی نقشه' | 'تحلیل فاصله' | 'بررسی پوشش خدمات' | 'تحلیل زمانی'>('تحلیل فاصله');

  const activeDataset = datasets.find((d) => d.datasetId === selectedId) ?? datasets[0];
  const accessState = evaluateDatasetAccessAndActions({ dataset: activeDataset, userRole });
  const comparison = compareUrbanDatasetsByPurpose({
    datasetA: datasets[0],
    datasetB: datasets[1],
    intendedUseFa: intendedUse,
  });

  if (section === 'dictionary_and_comparison') {
    return (
      <div className="space-y-3 text-[11px]" data-testid="stage52-dictionary-comparison-panel">
        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5">
          <h4 className="font-bold text-cyan-300 text-xs">
            ۵۲.۱۲ فرهنگ داده، تفکیک ۶ حالت خالی/صفر و معانی چندگانه واژگان (UA-22..UA-24)
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(SPECIAL_MISSING_DESCRIPTIONS) as SpecialMissingValueKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  setMissingKind(kind);
                  onFeedbackFa(`حالت «${kind}» در فرهنگ داده انتخاب شد تا با صفر واقعی اشتباه گرفته نشود.`);
                }}
                data-testid={`ua-missing-btn-${kind}`}
                className={`rounded-lg border px-2.5 py-1 text-[10.5px] cursor-pointer ${
                  missingKind === kind
                    ? 'border-cyan-400 bg-cyan-950/40 text-cyan-200 font-bold'
                    : 'border-slate-800 bg-slate-900/70 text-slate-300'
                }`}
              >
                {kind}
              </button>
            ))}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 text-slate-200">
            <strong>تفسیر دقیق «{missingKind}»:</strong> {SPECIAL_MISSING_DESCRIPTIONS[missingKind]}
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-2.5 text-amber-200 text-[10.5px]">
            <strong>هشدار اصطلاح چندمعنایی («سن بنا» — اتصال به واژه‌نامه مرحله ۴۷):</strong>{' '}
            در این مجموعه‌داده، «سن بنا» بر اساس تاریخ صدور پروانه محاسبه شده است و ممکن است با سن مبتنی بر پایان‌کار یا بازسازی اساسی متفاوت باشد.
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-emerald-300 text-xs">
              ۵۲.۱۰ مقایسه مجموعه‌داده‌ها بر اساس هدف استفاده — بدون برنده بر اساس تعداد رکورد (UA-34..UA-35)
            </h4>
            <select
              value={intendedUse}
              onChange={(e) => {
                const next = e.target.value as typeof intendedUse;
                setIntendedUse(next);
                onFeedbackFa(`مقایسه مجموعه‌داده‌ها برای کاربرد «${next}» به‌روزرسانی شد.`);
              }}
              aria-label="هدف استفاده از داده"
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10.5px] text-white"
            >
              <option value="نمایش نقاط روی نقشه">نمایش نقاط روی نقشه</option>
              <option value="تحلیل فاصله">تحلیل فاصله</option>
              <option value="بررسی پوشش خدمات">بررسی پوشش خدمات</option>
              <option value="تحلیل زمانی">تحلیل زمانی</option>
            </select>
          </div>
          <div className="space-y-1.5" data-testid="ua-dataset-comparison-rows">
            {comparison.comparisonRows.map((row) => (
              <div key={row.criterionFa} className="grid grid-cols-1 md:grid-cols-3 gap-2 rounded border border-slate-800 bg-slate-900/60 p-2 text-[10.5px]">
                <div className="font-bold text-cyan-300">{row.criterionFa}</div>
                <div className="text-slate-200">الف: {row.aValFa}</div>
                <div className="text-slate-200">ب: {row.bValFa}</div>
              </div>
            ))}
          </div>
          <div className="text-[10.5px] text-slate-400">
            قضاوت صرفاً با تعداد رکورد: <strong className="text-emerald-300">{comparison.judgedSolelyByRecordCount ? 'بله' : 'خیر (ممنوع)'}</strong> · اعلام برنده مطلق: <strong>{comparison.declaresAbsoluteWinner ? 'بله' : 'خیر (وابسته به کاربرد)'}</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-[11px]" data-testid="stage52-catalog-metadata-panel">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
        {STAGE52_BOUNDARIES_8.map((b) => (
          <div key={b.prevStageFa} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-[10px]">
            <div className="font-bold text-indigo-300">{b.prevStageFa}</div>
            <div className="text-slate-300 mt-0.5">{b.roleFa}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {datasets.map((ds) => (
              <button
                key={ds.datasetId}
                type="button"
                onClick={() => {
                  setSelectedId(ds.datasetId);
                  onFeedbackFa(`شناسنامه مجموعه‌داده ${ds.datasetId} (${ds.titleFa}) باز شد.`);
                }}
                data-testid={`ua-select-dataset-${ds.datasetId}`}
                className={`rounded-lg border px-2.5 py-1 text-[10.5px] cursor-pointer ${
                  activeDataset.datasetId === ds.datasetId
                    ? 'border-indigo-400 bg-indigo-950/40 text-white font-bold'
                    : 'border-slate-800 bg-slate-900/70 text-slate-300'
                }`}
              >
                {ds.datasetId}: {ds.categoryFa}
              </button>
            ))}
          </div>
          <select
            value={userRole}
            onChange={(e) => setUserRole(e.target.value as typeof userRole)}
            data-testid="ua-role-selector"
            aria-label="نقش کاربر برای بررسی مجوز"
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10.5px] text-white"
          >
            <option value="visitor">بازدیدکننده</option>
            <option value="logged_in_user">کاربر واردشده</option>
            <option value="professional">کاربر حرفه‌ای</option>
            <option value="data_admin">مدیر داده</option>
          </select>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-mono text-[10px] text-indigo-300">{activeDataset.datasetId} · {activeDataset.technicalName}</span>
              <h4 className="font-bold text-white text-xs mt-0.5">{activeDataset.titleFa}</h4>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              <span className="rounded bg-slate-950 px-2 py-0.5 text-cyan-300 border border-slate-800">{activeDataset.originKind}</span>
              <span className="rounded bg-slate-950 px-2 py-0.5 text-amber-300 border border-slate-800">{activeDataset.lifecycleStatus}</span>
              <span className="rounded bg-slate-950 px-2 py-0.5 text-emerald-300 border border-slate-800">{activeDataset.accessLevel}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[10.5px]">
            <div className="rounded border border-slate-800 bg-slate-950/70 p-2"><strong>ناشر اصلی:</strong> {activeDataset.publisherFa}</div>
            <div className="rounded border border-slate-800 bg-slate-950/70 p-2"><strong>تأمین‌کننده:</strong> {activeDataset.supplierFa}</div>
            <div className="rounded border border-slate-800 bg-slate-950/70 p-2"><strong>پردازش‌کننده:</strong> {activeDataset.processorFa}</div>
            <div className="rounded border border-slate-800 bg-slate-950/70 p-2"><strong>تاریخ اعتبار:</strong> {activeDataset.validAtDateFa}</div>
            <div className="rounded border border-slate-800 bg-slate-950/70 p-2"><strong>تاریخ دریافت:</strong> {activeDataset.receivedAtDateFa}</div>
            <div className="rounded border border-slate-800 bg-slate-950/70 p-2"><strong>آخرین بررسی:</strong> {activeDataset.lastReviewedAtFa}</div>
          </div>

          <div className="rounded border border-cyan-500/30 bg-cyan-950/20 p-2 text-[10.5px] text-cyan-200" data-testid="ua-availability-notice">
            <strong>تفکیک موجودبودن از اجازه انتشار:</strong> {accessState.availabilityLabelFa} · {accessState.restrictionNoticeFa}
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { key: 'preview', label: 'مشاهده پیش‌نمایش', allowed: accessState.canViewDataPreview },
              { key: 'map', label: 'افزودن به نقشه', allowed: accessState.canAddToMap },
              { key: 'analysis', label: 'استفاده در تحلیل', allowed: accessState.canUseInAnalysis },
              { key: 'download', label: 'دریافت فایل خام', allowed: accessState.canDownloadRawFile },
            ].map((act) => (
              <button
                key={act.key}
                type="button"
                disabled={!act.allowed}
                data-testid={`ua-action-${act.key}`}
                onClick={() => onFeedbackFa(`عملیات «${act.label}» طبق مجوز برای ${activeDataset.datasetId} اجرا شد.`)}
                className={`rounded-lg px-2.5 py-1 text-[10.5px] border ${
                  act.allowed
                    ? 'border-emerald-500/50 bg-emerald-950/30 text-emerald-200 cursor-pointer'
                    : 'border-slate-800 bg-slate-900/50 text-slate-500 cursor-not-allowed'
                }`}
              >
                {act.label} ({act.allowed ? 'مجاز' : 'مسدود طبق مجوز/دسترسی'})
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2">
          <div className="font-bold text-slate-200 text-xs">
            ارزیابی ۹بُعدی کیفیت (بدون امتیاز مبهم تک‌عددی ۰ تا ۱۰۰) و تناسب کاربرد
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5 text-[10px] text-slate-300">
            <div><strong>کامل‌بودن:</strong> {activeDataset.quality.completenessFa}</div>
            <div><strong>دقت:</strong> {activeDataset.quality.accuracyFa}</div>
            <div><strong>سازگاری:</strong> {activeDataset.quality.consistencyFa}</div>
            <div><strong>به‌روزبودن:</strong> {activeDataset.quality.freshnessFa}</div>
            <div><strong>اعتبار ساختاری:</strong> {activeDataset.quality.validityFa}</div>
            <div><strong>یکتایی:</strong> {activeDataset.quality.uniquenessFa}</div>
            <div><strong>دقت مکانی:</strong> {activeDataset.quality.positionalAccuracyFa}</div>
            <div><strong>پوشش:</strong> {activeDataset.quality.coverageFa}</div>
            <div><strong>ردیابی‌پذیری:</strong> {activeDataset.quality.traceabilityFa}</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px]">
            <div className="text-emerald-300"><strong>مناسب برای:</strong> {activeDataset.suitableForFa.join('، ') || 'محدود'}</div>
            <div className="text-rose-300"><strong>نامناسب برای:</strong> {activeDataset.notSuitableForFa.join('، ')}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

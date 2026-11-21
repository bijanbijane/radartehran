/**
 * @file src/components/AdminWeeklyDatabaseHealthChart.tsx
 * @description نمودار فشرده Recharts در پنل مدیریت برای نمایش تعداد داکیومنت‌های دارای داده‌های نامعتبر
 * در طول ۷ روز هفته، به همراه بازرس مراجع یتیم (Orphaned hoodId) و پنل اصلاح خودکار اسناد معیوب.
 */

import React, { useMemo } from 'react'; import { Activity, ShieldCheck, AlertTriangle, Link2Off, Wrench, CheckCircle2 } from 'lucide-react'; import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis, } from 'recharts'; import { toPersianNum } from '../data/neighborhoods'; import { buildWeeklyInvalidDocumentsTrend, DatabaseIntegrityIssue,
  FirestoreDataAuditReport, OrphanedReferenceIssue, RawDocumentAuditSample, sanitizeCorruptedDocumentPayload,
} from '../data/firestoreDataAuditor'; import { AreaUnit, convertPricePerSqmToUnit, formatAreaShort, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, IntlCurrencyCode } from '../utils/areaUnit'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';

export interface AdminWeeklyDatabaseHealthChartProps { auditReport: FirestoreDataAuditReport; orphanedIssues?: OrphanedReferenceIssue[]; integrityIssues?: DatabaseIntegrityIssue[];
  extraSamples?: RawDocumentAuditSample[]; onApplyAutoSanitize?: (collection: string, docId: string, sanitizedData: Record<string, unknown>) => void; onRemoveSampleDoc?: (collection: string, docId: string) => void; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; }

export function AdminWeeklyDatabaseHealthChart({ auditReport, orphanedIssues = [], integrityIssues = [], extraSamples = [], onApplyAutoSanitize, onRemoveSampleDoc, areaUnit: propAreaUnit, intlCurrency: propIntlCurrency }: AdminWeeklyDatabaseHealthChartProps): React.ReactElement {
  const [hookAreaUnit] = useAreaUnit(); const [hookIntlCurrency] = useIntlCurrency(); const [locale] = useRadarLocale(); const areaUnit = propAreaUnit ?? hookAreaUnit; const intlCurrency = propIntlCurrency ?? hookIntlCurrency; const sampleAuditUnitPrice = convertPricePerSqmToUnit(120, areaUnit); const sample80mTotalMillions = 120 * 80; const sampleMonthlyRentMillions = 45;
  const weeklyData = useMemo(() => buildWeeklyInvalidDocumentsTrend(auditReport), [auditReport]);
  const todayPoint = weeklyData[weeklyData.length - 1];
  const weekTotalInvalid = useMemo(() => weeklyData.reduce((acc, item) => acc + item.invalidDocsCount, 0), [weeklyData]);
  const overallHealthPercent = todayPoint ? todayPoint.healthScorePercent : 100;
  const isHealthy = auditReport.invalidDocumentsCount === 0 && orphanedIssues.length === 0 && integrityIssues.length === 0;
  const sanitizePreviews = useMemo(
    () => extraSamples.map((s) => sanitizeCorruptedDocumentPayload(s.collection, s.docId, s.data)).filter((p) => p.appliedFixesFa.length > 0),
    [extraSamples]
  );

  return (
    <div className="space-y-3">
      <div data-testid="admin-weekly-db-health-chart" className="border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/70 dark:bg-slate-800/60 p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-700 pb-2.5">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400 shrink-0" />
            <div>
              <div className="font-extrabold text-slate-900 dark:text-slate-100 text-xs">
                نمودار هفتگی داکیومنت‌های نامعتبر و سلامت کلی دیتابیس (۷ روز اخیر)
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                روند روزانه اسناد نامعتبر در Firestore · واحد ممیزی ({formatAreaUnitLabel(areaUnit)}): {toPersianNum(sampleAuditUnitPrice)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(sampleAuditUnitPrice, intlCurrency, locale)})` : ''} · معیار {formatAreaShort(80, areaUnit)}: {toPersianNum(sample80mTotalMillions)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(sample80mTotalMillions, intlCurrency, locale)})` : ''} · اجاره ماهانه: {toPersianNum(sampleMonthlyRentMillions)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(sampleMonthlyRentMillions, intlCurrency, locale)})` : ''}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1 border ${isHealthy ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'}`}>
              {isHealthy ? <ShieldCheck className="w-3.5 h-3.5 text-[var(--color-brand-600)] dark:text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />}
              <span>سلامت فعلی دیتابیس: {toPersianNum(overallHealthPercent)}٪ ({isHealthy ? 'سالم' : 'نیازمند بررسی'})</span>
            </span>
            <span className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold">
              مجموع خطاهای هفته: {toPersianNum(weekTotalInvalid)} سند
            </span>
          </div>
        </div>

        <div className="h-40 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData} margin={{ top: 8, right: 12, left: -18, bottom: 2 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="dayLabelFa"
                tick={{ fontSize: 10, fill: '#475569', fontWeight: 700 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                domain={[0, (dataMax: number) => Math.max(4, dataMax + 1)]}
              />
              <Tooltip
                cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const pt = payload[0].payload;
                  return (
                    <div
                      dir="rtl"
                      className="bg-slate-900 text-white rounded-xl px-3 py-2 text-[11px] shadow-lg border border-slate-700 space-y-1"
                    >
                      <div className="font-extrabold text-emerald-400 border-b border-slate-700 pb-1">
                        {pt.dayLabelFa} ({pt.dayKey})
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-300">داکیومنت‌های نامعتبر:</span>
                        <strong className="font-mono text-white">{toPersianNum(pt.invalidDocsCount)} سند</strong>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-rose-300">فیلدهای عددی منفی:</span>
                        <strong className="font-mono text-rose-300">{toPersianNum(pt.negativeFieldsCount)} مورد</strong>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-amber-300">فیلد ناقص / خارج از بازه:</span>
                        <strong className="font-mono text-amber-300">{toPersianNum(pt.incompleteOrRangeCount)} مورد</strong>
                      </div>
                      <div className="flex items-center justify-between gap-4 pt-0.5 border-t border-slate-800">
                        <span className="text-emerald-300">شاخص سلامت روز:</span>
                        <strong className="font-mono text-emerald-300">{toPersianNum(pt.healthScorePercent)}٪</strong>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="invalidDocsCount" name="داکیومنت نامعتبر" radius={[6, 6, 0, 0]} maxBarSize={34}>
                {weeklyData.map((entry) => {
                  const hasNegative = entry.negativeFieldsCount > 0;
                  const hasInvalid = entry.invalidDocsCount > 0;
                  const fill = hasNegative
                    ? '#e11d48'
                    : hasInvalid
                      ? '#f59e0b'
                      : entry.isToday
                        ? '#10b981'
                        : '#94a3b8';
                  return <Cell key={entry.dayKey} fill={fill} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* بازرس مراجع یتیم (Orphaned hoodId) و موتور اصلاح خودکار (Auto-Sanitize) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div data-testid="admin-orphaned-refs-section" className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
          <div className="bg-slate-50 dark:bg-slate-800 px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="font-extrabold text-slate-800 dark:text-slate-100 text-xs flex items-center gap-1.5">
              <Link2Off className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>بازرس کلیدهای خارجی و مراجع یتیم ({toPersianNum(orphanedIssues.length)} مورد)</span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">تطبیق hoodId با جدول محله‌ها</span>
          </div>
          <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {orphanedIssues.length === 0 ? (
              <div className="py-4 px-3 text-center text-emerald-700 dark:text-emerald-400 font-semibold flex items-center justify-center gap-1.5 text-xs">
                <CheckCircle2 className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400" />
                <span>هیچ رکورد یتیمی (Orphaned hoodId) در آگهی‌ها، آرا یا فرم‌های CRM یافت نشد.</span>
              </div>
            ) : (
              orphanedIssues.map((orp) => (
                <div key={orp.id} className="px-3 py-2 flex items-center justify-between gap-2 text-[11px] hover:bg-amber-50/40 dark:hover:bg-amber-950/30">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <code className="font-mono font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {orp.collection}/{orp.docId}
                      </code>
                      <span className="font-bold text-slate-900 dark:text-slate-100">{orp.titleOrLabel}</span>
                    </div>
                    <div className="text-[10px] text-amber-800 dark:text-amber-300">{orp.reasonFa}</div>
                  </div>
                  <code className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 font-mono text-[10px]" dir="ltr">
                    hoodId={String(orp.referencedHoodId ?? 'null')}
                  </code>
                </div>
              ))
            )}
          </div>
        </div>
        <div data-testid="admin-auto-sanitize-section" className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
          <div className="bg-slate-50 dark:bg-slate-800 px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="font-extrabold text-slate-800 dark:text-slate-100 text-xs flex items-center gap-1.5">
              <Wrench className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400" />
              <span>تعمیر خودکار اسناد معیوب (Auto-Sanitize) ({toPersianNum(sanitizePreviews.length)} سند)</span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">اصلاح اعداد منفی و فیلدهای ناقص</span>
          </div>
          <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {sanitizePreviews.length === 0 ? (
              <div className="py-4 px-3 text-center text-slate-400 text-xs">
                سند معیوبی جهت اعمال اصلاح خودکار در صف قرار ندارد.
              </div>
            ) : (
              sanitizePreviews.map((item) => (
                <div key={`${item.collection}:${item.docId}`} className="px-3 py-2 space-y-1.5 text-[11px] hover:bg-emerald-50/30 dark:hover:bg-emerald-950/30">
                  <div className="flex items-center justify-between gap-2">
                    <code className="font-mono font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded" dir="ltr">
                      {item.collection}/{item.docId}
                    </code>
                    <div className="flex items-center gap-1">
                      {onApplyAutoSanitize && (
                        <button
                          type="button"
                          onClick={() => onApplyAutoSanitize(item.collection, item.docId, item.sanitizedData)}
                          className="px-2 py-0.5 rounded-lg bg-[var(--color-brand-600)] hover:bg-emerald-500 text-white font-bold text-[10px] cursor-pointer transition"
                        >
                          اعمال اصلاح خودکار
                        </button>
                      )}
                      {onRemoveSampleDoc && (
                        <button
                          type="button"
                          onClick={() => onRemoveSampleDoc(item.collection, item.docId)}
                          className="px-2 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold text-[10px] cursor-pointer transition"
                        >
                          قرنطینه / حذف
                        </button>
                      )}
                    </div>
                  </div>
                  <ul className="text-[10px] text-slate-600 dark:text-slate-300 space-y-0.5 list-disc list-inside">
                    {item.appliedFixesFa.map((fix, idx) => (
                      <li key={idx}>{fix}</li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      {/* بازرس یکپارچگی رابطه‌ای، نسبت اقتصادی رهن/خرید، اسناد تکراری و قواعد امنیتی Firestore */}
      <div data-testid="admin-relational-integrity-section" className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
        <div className="bg-slate-50 dark:bg-slate-800 px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
          <div className="font-extrabold text-slate-800 dark:text-slate-100 text-xs flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400" />
            <span>
              بازرس یکپارچگی رابطه‌ای، اسناد تکراری (Shadowed Overrides) و انطباق با firestore.rules ({toPersianNum(integrityIssues.length)} مورد)
            </span>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            بررسی تداخل hood_X/X، نسبت رهن به خرید، انقضای حامیان و فرمت موبایل
          </span>
        </div>
        <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {integrityIssues.length === 0 ? (
            <div className="py-3.5 px-3 text-center text-emerald-700 dark:text-emerald-400 font-semibold flex items-center justify-center gap-1.5 text-xs">
              <CheckCircle2 className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400" />
              <span>تمامی اسناد از نظر عدم تکرار کلید، نسبت اقتصادی رهن/خرید، اعتبار زمانی حامیان و قیود firestore.rules سالم هستند.</span>
            </div>
          ) : (
            integrityIssues.map((item) => (
              <div key={item.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[10px]">
                      {item.category}
                    </span>
                    <code className="font-mono font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded" dir="ltr">
                      {item.collection}/{item.docId}
                    </code>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{item.summaryFa}</span>
                  </div>
                  <div className="text-[10px] text-slate-600 dark:text-slate-300">{item.detailFa}</div>
                </div>
                {item.hoodId !== null && (
                  <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-mono text-[10px]" dir="ltr">
                    hoodId={item.hoodId}
                  </code>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
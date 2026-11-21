import React, { useEffect, useMemo, useState } from 'react'; import { AlertTriangle, Bug, CheckCircle2, Database, FileWarning, FlaskConical, MapPinOff, RefreshCw, ShieldAlert, Trash2, } from 'lucide-react'; import { clearFirestoreErrorLogs, FirestoreErrorLogEntry, getFirestoreErrorLogs, OperationType, recordFirestoreQueryError, } from '../firebase'; import { BuyerAlertLeadItem, Neighborhood, SponsorCrmRequestItem, toPersianNum, } from '../data/neighborhoods'; import { auditLocalRadarDatasets, checkDatabaseRelationalAndSchemaIntegrity, checkNeighborhoodGeoAndCityHealth, checkOrphanedHoodReferences, DataAnomalySeverity, DatabaseIntegrityIssue, fetchLiveFirestoreSamplesForAudit, NeighborhoodGeoCityCandidate, NeighborhoodGeoCityHealthIssue, RawDocumentAuditSample, sanitizeCorruptedDocumentPayload, } from '../data/firestoreDataAuditor'; import { quarantineDeleteFirestoreDocument, repairFirestoreDocumentInCloud, } from '../data/firestoreNeighborhoodRepository'; import { aggregateNeighborhoodMarketMetrics, aggregateMarketMetricsForHood, aggregateMarketMetricsForScalars } from '../data/realMarketPriceAggregator'; import { convertPricePerSqmToUnit, formatAreaShort, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';
import { AdminWeeklyDatabaseHealthChart } from './AdminWeeklyDatabaseHealthChart'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; export { checkDatabaseRelationalAndSchemaIntegrity, checkNeighborhoodGeoAndCityHealth, checkOrphanedHoodReferences, sanitizeCorruptedDocumentPayload, }; export type { DatabaseIntegrityIssue, NeighborhoodGeoCityCandidate, NeighborhoodGeoCityHealthIssue }; export interface AdminPanelProps { neighborhoods: Neighborhood[]; sponsorRequests: SponsorCrmRequestItem[]; buyerLeads: BuyerAlertLeadItem[]; isVerifiedAdmin?: boolean; }
export function AdminPanel({ neighborhoods, sponsorRequests, buyerLeads, isVerifiedAdmin = true, }: AdminPanelProps): React.ReactElement { const [areaUnit] = useAreaUnit(); const [intlCurrency] = useIntlCurrency(); const [locale] = useRadarLocale(); const avgBuySqm = neighborhoods.length > 0 ? Math.round(neighborhoods.reduce((acc, h) => acc + h.buyPerSqm, 0) / neighborhoods.length) : 120; const avgUnitBuy = convertPricePerSqmToUnit(avgBuySqm, areaUnit); const avgUnitDeal = convertPricePerSqmToUnit(aggregateMarketMetricsForScalars(1, "تهران", avgBuySqm).estimatedDealPricePerSqm, areaUnit); const [errorLogs, setErrorLogs] = useState<FirestoreErrorLogEntry[]>(() => getFirestoreErrorLogs()); const [extraSamples, setExtraSamples] = useState<RawDocumentAuditSample[]>([]);
  const [extraGeoCandidates, setExtraGeoCandidates] = useState<NeighborhoodGeoCityCandidate[]>([]); const [scanningCloud, setScanningCloud] = useState<boolean>(false); const [severityFilter, setSeverityFilter] = useState<'ALL' | DataAnomalySeverity>('ALL'); useEffect(() => {
    setErrorLogs(getFirestoreErrorLogs()); }, [neighborhoods, sponsorRequests, buyerLeads]); const auditReport = useMemo(
    () => auditLocalRadarDatasets({ neighborhoods, sponsorRequests, buyerLeads, extraSamples }), [neighborhoods, sponsorRequests, buyerLeads, extraSamples]
  ); const geoCityIssues = useMemo( () => checkNeighborhoodGeoAndCityHealth([...(neighborhoods as unknown as NeighborhoodGeoCityCandidate[]), ...extraGeoCandidates]), [neighborhoods, extraGeoCandidates]
  ); const orphanedIssues = useMemo( () => checkOrphanedHoodReferences({ validHoodIds: neighborhoods.map((h) => h.id), sponsorRequests, buyerLeads, extraSamples }), [neighborhoods, sponsorRequests, buyerLeads, extraSamples] );
  const integrityIssues = useMemo( () => checkDatabaseRelationalAndSchemaIntegrity({ neighborhoods, sponsorRequests, buyerLeads, extraSamples }), [neighborhoods, sponsorRequests, buyerLeads, extraSamples] );
  const handleApplyAutoSanitize = (collectionName: string, docId: string, sanitizedData: Record<string, unknown>) => { setExtraSamples((prev) =>
      prev.map((item) => (item.collection === collectionName && item.docId === docId ? { ...item, data: sanitizedData } : item)) ); if (!docId.startsWith('sim_')) void repairFirestoreDocumentInCloud(collectionName, docId, sanitizedData); }; const handleRemoveSampleDoc = (collectionName: string, docId: string) => {
    setExtraSamples((prev) => prev.filter((item) => !(item.collection === collectionName && item.docId === docId))); if (!docId.startsWith('sim_')) void quarantineDeleteFirestoreDocument(collectionName, docId); }; const filteredIssues = useMemo(() => { if (severityFilter === 'ALL') return auditReport.issues;
    return auditReport.issues.filter((item) => item.severity === severityFilter); }, [auditReport.issues, severityFilter]); const handleRunLiveCloudAudit = async () => { setScanningCloud(true);
    try { const liveDocs = await fetchLiveFirestoreSamplesForAudit(isVerifiedAdmin);
      setExtraSamples(liveDocs); setErrorLogs(getFirestoreErrorLogs());
    } finally { setScanningCloud(false); }
  }; const handleInjectDiagnosticSamples = () => {
    recordFirestoreQueryError(
      new Error('Missing or insufficient permissions: Simulated query error on unindexed/negative filter'),
      OperationType.LIST,
      'neighborhoodOverrides?where=buyPerSqm<0'
    );
    setExtraSamples([
      { collection: 'neighborhoodOverrides', docId: 'sim_negative_hood_12', data: { hoodId: 12, buyPerSqm: -145, rahn80m: -1800, air: -3 } },
      { collection: 'bargains', docId: 'sim_broken_bargain_99', data: { hoodId: 5, title: '', priceText: 'متری ۱۲۰ میلیون', street: '', sqm: -75, discountPercent: 85 } },
      { collection: 'sponsorRequests', docId: 'sim_invalid_crm_44', data: { hoodId: 1050, hoodName: 'پونک', agencyName: '', phone: '09120000000', monthlyTariffMillion: -15, experienceYears: -4 } },
    ]);
    setExtraGeoCandidates([
      { id: 888, name: 'محله آزمایشی بدون مختصات', cityId: 'tehran', zone: 'شمال تهران', lat: 0, lng: -51.4 },
      { id: 950, name: 'محله آزمایشی فاقد شناسه منطقه (cityId)', cityId: '', zone: '', lat: 35.72, lng: 51.41 },
    ]);
    setErrorLogs(getFirestoreErrorLogs());
  };
  const handleClearDiagnostics = () => {
    clearFirestoreErrorLogs();
    setErrorLogs([]);
    setExtraSamples([]);
    setExtraGeoCandidates([]);
  };
  return (
    <div
      data-testid="admin-firestore-diagnostics-panel"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-4 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 pb-3">
        <div className="flex items-center gap-2">
          <Bug className="w-5 h-5 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400 shrink-0" />
          <div>
            <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
              ابزار گزارش‌گیری خطاهای کوئری Firestore و بازرس داکیومنت‌های نامعتبر (Database Debugger)
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              شناسایی آنی فیلدهای عددی منفی، مقادیر خارج از بازه، فیلدهای ناقص و خطاهای قواعد امنیتی فایراستور · میانگین {formatAreaShort(80, areaUnit)} ({formatAreaUnitLabel(areaUnit)}): {toPersianNum(avgUnitBuy)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(avgUnitBuy, intlCurrency, locale)})` : ''} · سناریو v6.4 (غیرثبتی): {toPersianNum(avgUnitDeal)} م · آخرین بررسی: {auditReport.scannedAtFa}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleRunLiveCloudAudit} disabled={scanningCloud} className="px-3 py-1.5 rounded-xl bg-[var(--color-brand-600)] hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${scanningCloud ? 'animate-spin' : ''}`} />
            <span>{scanningCloud ? 'در حال اسکن کلود...' : 'اسکن زنده کالکشن‌های Firestore'}</span>
          </button>
          <button type="button" onClick={handleInjectDiagnosticSamples} className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800 font-bold text-[11px] flex items-center gap-1.5 transition cursor-pointer">
            <FlaskConical className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
            <span>تست شبیه‌سازی داده منفی و خطای کوئری</span>
          </button>
          {(errorLogs.length > 0 || extraSamples.length > 0) && (
            <button type="button" onClick={handleClearDiagnostics} className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer">
              <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <span>پاکسازی لاگ و نمونه</span>
            </button>
          )}
        </div>
      </div>
      {/* کارت‌های خلاصه وضعیت ممیزی */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>داکیومنت‌های بررسی‌شده</span>
            <Database className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          </div>
          <div className="text-sm font-black text-slate-900 dark:text-slate-100 mt-1">
            {toPersianNum(auditReport.totalDocumentsScanned)} سند
          </div>
        </div>
        <div className={`border rounded-xl p-2.5 ${auditReport.negativeFieldsCount > 0 ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'}`}>
          <div className="text-[11px] opacity-80 flex items-center justify-between">
            <span>فیلدهای عددی منفی</span>
            <AlertTriangle className={`w-3.5 h-3.5 ${auditReport.negativeFieldsCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--color-brand-600)] dark:text-emerald-400'}`} />
          </div>
          <div className="text-sm font-black mt-1">
            {toPersianNum(auditReport.negativeFieldsCount)} مورد
          </div>
        </div>
        <div className={`border rounded-xl p-2.5 ${auditReport.incompleteFieldsCount + auditReport.outOfRangeCount > 0 ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'}`}>
          <div className="text-[11px] opacity-80 flex items-center justify-between">
            <span>داده‌های ناقص / خارج از بازه</span>
            <FileWarning className={`w-3.5 h-3.5 ${auditReport.incompleteFieldsCount + auditReport.outOfRangeCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--color-brand-600)] dark:text-emerald-400'}`} />
          </div>
          <div className="text-sm font-black mt-1">
            {toPersianNum(auditReport.incompleteFieldsCount + auditReport.outOfRangeCount)} مورد
          </div>
        </div>
        <div className={`border rounded-xl p-2.5 ${errorLogs.length > 0 ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'}`}>
          <div className="text-[11px] opacity-80 flex items-center justify-between">
            <span>خطاهای کوئری Firestore</span>
            <ShieldAlert className={`w-3.5 h-3.5 ${errorLogs.length > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--color-brand-600)] dark:text-emerald-400'}`} />
          </div>
          <div className="text-sm font-black mt-1">
            {toPersianNum(errorLogs.length)} خطا
          </div>
        </div>
      </div>
      {/* نمودار هفتگی Recharts تعداد داکیومنت‌های نامعتبر، بازرس مراجع یتیم و پنل تعمیر خودکار */}
      <AdminWeeklyDatabaseHealthChart
        auditReport={auditReport}
        orphanedIssues={orphanedIssues}
        integrityIssues={integrityIssues}
        extraSamples={extraSamples}
        onApplyAutoSanitize={handleApplyAutoSanitize}
        onRemoveSampleDoc={handleRemoveSampleDoc}
      />
      {/* بخش ۱: لیست داکیومنت‌های دارای داده‌های ناقص یا نامعتبر */}
      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-800 px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
          <div className="font-extrabold text-slate-800 dark:text-slate-100 text-xs flex items-center gap-1.5">
            <FileWarning className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>لیست داکیومنت‌های دارای داده‌های ناقص یا نامعتبر ({toPersianNum(filteredIssues.length)} مورد)</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {[
              { id: 'ALL' as const, label: 'همه' },
              { id: 'CRITICAL_NEGATIVE' as const, label: 'اعداد منفی' },
              { id: 'INCOMPLETE_FIELD' as const, label: 'فیلد ناقص' },
              { id: 'OUT_OF_RANGE' as const, label: 'خارج از بازه' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSeverityFilter(f.id)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                  severityFilter === f.id
                    ? 'bg-slate-900 dark:bg-[var(--color-brand-600)] text-white'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {filteredIssues.length === 0 ? (
            <div className="py-5 px-3 text-center text-emerald-700 dark:text-emerald-400 font-semibold flex items-center justify-center gap-1.5 text-xs">
              <CheckCircle2 className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400" />
              <span>تمامی داکیومنت‌های بررسی‌شده سالم هستند (هیچ فیلد عددی منفی یا داده ناقصی یافت نشد).</span>
            </div>
          ) : (
            filteredIssues.map((issue) => (
              <div
                key={issue.id}
                className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-[11px]"
              >
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <span
                    className={`px-1.5 py-0.5 rounded font-extrabold text-[10px] ${
                      issue.severity === 'CRITICAL_NEGATIVE'
                        ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                        : issue.severity === 'OUT_OF_RANGE'
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {issue.severity === 'CRITICAL_NEGATIVE'
                      ? 'عدد منفی'
                      : issue.severity === 'OUT_OF_RANGE'
                        ? 'خارج از بازه'
                        : 'فیلد ناقص'}
                  </span>
                  <code className="font-mono font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                    {issue.collection}/{issue.docId}
                  </code>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{issue.reasonFa}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0" dir="ltr">
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{issue.field}=</span>
                  <code className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-mono font-bold text-[10px]">
                    {issue.invalidValue}
                  </code>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {/* بخش ۲: لاگ خطاهای کوئری‌های Firestore */}
      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-800 px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="font-extrabold text-slate-800 dark:text-slate-100 text-xs flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            <span>لاگ خطاهای کوئری و عملیات Firestore ({toPersianNum(errorLogs.length)} مورد)</span>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">ثبت خودکار از handleFirestoreError و onSnapshot</span>
        </div>
        <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {errorLogs.length === 0 ? (
            <div className="py-5 px-3 text-center text-slate-400 text-xs">
              هیچ خطای کوئری یا رد مجوز امنیتی در نشست فعلی ثبت نشده است.
            </div>
          ) : (
            errorLogs.map((log) => (
              <div key={log.id} className="px-3 py-2 space-y-1 hover:bg-rose-50/40 dark:hover:bg-rose-950/30 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 font-mono font-extrabold text-[10px] uppercase">
                      {log.operationType}
                    </span>
                    <code className="font-mono font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded" dir="ltr">
                      {log.path || 'unknown-path'}
                    </code>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      کاربر: <code className="font-mono">{log.authInfo.email || log.authInfo.userId || 'مهمان (Unauthenticated)'}</code>
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 tabular-nums">{log.timeFa}</span>
                </div>
                <div className="text-rose-700 dark:text-rose-300 font-mono text-[10px] bg-rose-50/80 dark:bg-rose-950/50 border border-rose-200/70 dark:border-rose-800 rounded px-2 py-1 break-all" dir="ltr">
                  {log.error} </div>
              </div>
            ))
          )} </div>
      </div>
      {/* بخش ۳: بررسی سلامت مختصات جغرافیایی (lat/lng) و شناسه منطقه‌ای (cityId) محله‌ها */}
      <div data-testid="admin-geo-city-health-section" className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-800 px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
          <div className="font-extrabold text-slate-800 dark:text-slate-100 text-xs flex items-center gap-1.5">
            <MapPinOff className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400" />
            <span>
              بررسی سلامت مختصات جغرافیایی (lat/lng) و شناسه منطقه‌ای (cityId) محله‌ها ({toPersianNum(geoCityIssues.length)} مورد نامعتبر)
            </span>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            محدوده مجاز ایران: lat [۲۵..۴۰] · lng [۴۴..۶۴] · شهرهای مجاز: ۵ کلان‌شهر
          </span>
        </div>
        <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {geoCityIssues.length === 0 ? (
            <div className="py-4 px-3 text-center text-emerald-700 dark:text-emerald-400 font-semibold flex items-center justify-center gap-1.5 text-xs">
              <CheckCircle2 className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400" />
              <span>تمامی محله‌های موجود در دیتابیس دارای مختصات جغرافیایی (lat/lng) و شناسه منطقه‌ای (cityId) معتبر هستند.</span>
            </div>
          ) : (
            geoCityIssues.map((item) => (
              <div key={item.docId} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 hover:bg-rose-50/30 dark:hover:bg-rose-950/30 text-[11px]">
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <code className="font-mono font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      {item.docId} </code>
                    <span className="font-extrabold text-slate-900 dark:text-slate-100">{item.name}</span>
                    {!item.hasValidCoordinates && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 font-extrabold text-[10px]">
                        مختصات نامعتبر
                      </span>
                    )} {!item.hasValidCityId && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 font-extrabold text-[10px]">
                        فاقد cityId معتبر
                      </span>
                    )} </div>
                  <div className="text-slate-600 dark:text-slate-300 text-[10px]">{item.reasonsFa.join(' · ')}</div>
                </div>
                <div className="font-mono text-[10px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded" dir="ltr">
                  cityId={item.rawCityId ?? 'null'} | lat={String(item.lat)} | lng={String(item.lng)} </div>
              </div>
            ))
          )} </div>
      </div>
    </div>
  ); } export const AdminFirestoreDiagnosticsPanel = AdminPanel; export default AdminPanel;
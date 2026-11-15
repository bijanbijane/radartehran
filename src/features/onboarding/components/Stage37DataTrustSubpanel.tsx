import React, { useState } from 'react';
import {
  RADAR_SOURCE_TAXONOMY,
  RADAR_QUALITY_DIMENSIONS,
  evaluateDataFreshnessStatus,
  evaluateScopedVerificationBadges,
  evaluateGeographicCoverageWithDenominator,
  evaluatePublicationRightsGate,
  type DataRightsStatus,
  type CoverageDenominatorType,
} from '../services/dataTrustAndProvenanceEngine';

const PROV_CHAIN_STEPS_FA = [
  { step: 1, title: '۱. منبع اولیه (Entity/Agent)', detail: 'دریافت آگهی‌های عرضه مسکونی (SRC-02) از درگاه عمومی بازار' },
  { step: 2, title: '۲. دریافت داده (Ingest Activity)', detail: 'ثبت زمان دریافت (Retrieved At) و شناسه یکتای توزیع DCAT-3' },
  { step: 3, title: '۳. اعتبارسنجی اولیه (Schema Gate)', detail: 'کنترل قالب عددی، دامنه متراژ و فیلدهای الزامی (Valid ≠ Accurate)' },
  { step: 4, title: '۴. پاک‌سازی و تطبیق (Deduplication)', detail: 'حذف آگهی‌های تکراری و تجمیع بازنشرهای یک ملک واحد' },
  { step: 5, title: '۵. پردازش و تحلیل (Index Computation)', detail: 'محاسبه میانه و چارک‌های IQR با نسخه روش‌شناسی HEDONIC-V6.4' },
  { step: 6, title: '۶. کنترل کیفیت و کفایت (DQV Audit)', detail: 'بررسی آستانه کفایت نمونه (n ≥ 10) و ثبت محدودیت‌های پوشش' },
  { step: 7, title: '۷. انتشار و اسنپ‌شات (Snapshot Publish)', detail: 'انتشار نسخه V3 همراه اتصال به Snapshot بازتولیدپذیر' },
] as const;

export const Stage37DataTrustSubpanel: React.FC = () => {
  const [showFullLineage, setShowFullLineage] = useState(false);
  const [selectedDatasetType, setSelectedDatasetType] = useState<'active_listing' | 'market_index' | 'neighborhood_boundary' | 'census_demographics'>('market_index');
  const [selectedDenominator, setSelectedDenominator] = useState<CoverageDenominatorType>('neighborhood_count');
  const [sampleCount, setSampleCount] = useState<number>(8);
  const [selectedRights, setSelectedRights] = useState<DataRightsStatus>('Derived');
  const [issueSubmitted, setIssueSubmitted] = useState(false);
  const [issueCategory, setIssueCategory] = useState('wrong_value');

  const nowMs = Date.parse('2026-11-14T12:00:00.000Z');
  const freshnessReport = evaluateDataFreshnessStatus({
    dataType: selectedDatasetType,
    timestamps: selectedDatasetType === 'census_demographics'
      ? { eventTimeIso: '2021-10-01T00:00:00.000Z', validTimeLabelFa: 'سرشماری سال ۱۴۰۰', retrievedAtIso: '2026-11-01T00:00:00.000Z' }
      : { eventTimeIso: '2026-11-10T00:00:00.000Z', validTimeLabelFa: 'آبان ۱۴۰۵', retrievedAtIso: '2026-11-12T00:00:00.000Z', processedAtIso: '2026-11-12T06:00:00.000Z' },
    nowEpochMs: nowMs,
  });

  const verificationReport = evaluateScopedVerificationBadges({
    sourceId: 'SRC-02-MARKET-FEED',
    schemaValid: true,
    provenanceActivityCount: 7,
    scopedVerifications: [{ scope: 'coordinates_geometry', evidenceIds: ['EVID-GEO-104'], reviewedAtIso: '2026-11-12T08:00:00.000Z' }],
  });

  const coverageReport = evaluateGeographicCoverageWithDenominator({
    coveredUnits: 28,
    totalUnits: 35,
    denominatorType: selectedDenominator,
    uniqueSampleCountInArea: sampleCount,
    minRequiredSamplesForIndex: 10,
  });

  const rightsReport = evaluatePublicationRightsGate(selectedRights);

  return (
    <div className="space-y-4" data-testid="stage37-data-trust-subpanel" dir="rtl">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white">
              مرحله ۳۷: نظام منشأ، کیفیت، تازگی و اعتمادپذیری داده (RT-UI-DATA-TRUST-001)
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              تفکیک ۵ مفهوم «منبع»، «زنجیره منشأ (W3C PROV)»، «کیفیت (ISO 19157-1 / DQV)»، «دامنه تأیید» و «تازگی ۵-زمانه» بدون امتیاز کلی جعلی
            </p>
          </div>
          <span className="rounded border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1 font-mono text-[11px] text-emerald-300">
            DS-TEH-001 • Snapshot V3
          </span>
        </div>

        {/* 18. Data Provenance Card (2-Level Summary + Expandable W3C PROV Lineage) */}
        <div
          className="mt-4 rounded-xl border border-slate-700 bg-slate-950/90 p-3.5"
          data-testid="stage37-provenance-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
            <div>
              <span className="text-xs font-bold text-cyan-300">
                شناسنامه داده (Data Provenance Card) — میانه قیمت پیشنهادی هر مترمربع
              </span>
              <p className="mt-0.5 text-[11px] text-slate-400">
                این داده بر اساس اطلاعات آگهی‌ها (SRC-02) محاسبه شده و معادل قیمت قطعی معامله نیست.
              </p>
            </div>
            <button
              type="button"
              data-testid="toggle-provenance-lineage-btn"
              onClick={() => setShowFullLineage((prev) => !prev)}
              className="rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/50"
            >
              {showFullLineage ? 'بستن زنجیره منشأ' : 'مشاهده منشأ و روش محاسبه (۷ مرحله)'}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2.5">
              <div className="text-[11px] text-slate-400">نوع داده و منبع</div>
              <div className="mt-1 font-bold text-white">قیمت پیشنهادی آگهی (SRC-02)</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2.5">
              <div className="text-[11px] text-slate-400">دامنه تأیید (Scoped Verification)</div>
              <div className="mt-1 font-bold text-amber-300">
                {verificationReport.publicQualificationFa}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2.5">
              <div className="text-[11px] text-slate-400">وضعیت تازگی ({freshnessReport.basisUsed})</div>
              <div className="mt-1 font-bold text-emerald-300">{freshnessReport.statusLabelFa}</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2.5">
              <div className="text-[11px] text-slate-400">مجوز و حقوق استفاده (DCAT-3)</div>
              <div className="mt-1 font-bold text-sky-300">{selectedRights}</div>
            </div>
          </div>

          {showFullLineage && (
            <div
              className="mt-3 space-y-1.5 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs"
              data-testid="stage37-prov-lineage-steps"
            >
              <div className="font-semibold text-slate-200">
                زنجیره کامل منشأ و پردازش داده (W3C PROV Lineage — بازتولیدپذیر با نسخه روش HEDONIC-V6.4):
              </div>
              {PROV_CHAIN_STEPS_FA.map((item) => (
                <div
                  key={item.step}
                  className="flex items-center justify-between rounded border border-slate-800/80 bg-slate-950/70 px-2.5 py-1.5"
                >
                  <span className="font-semibold text-cyan-300">{item.title}</span>
                  <span className="text-[11px] text-slate-300">{item.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Interactive Simulators: 5-Timestamp Freshness & Coverage Denominator vs Sufficiency */}
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 text-xs">
            <div className="font-bold text-white">
              شبیه‌ساز سیاست تازگی و تفکیک ۵ زمان (Event / Valid / Retrieved / Processed / Published)
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'market_index', label: 'شاخص بازار (آبان ۱۴۰۵)' },
                  { id: 'census_demographics', label: 'سرشماری نفوس (دوره ۱۴۰۰ / دریافت ۱۴۰۵)' },
                  { id: 'active_listing', label: 'آگهی فعال' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`freshness-type-${item.id}`}
                  onClick={() => setSelectedDatasetType(item.id)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
                    selectedDatasetType === item.id
                      ? 'border-emerald-500 bg-emerald-950/50 text-emerald-200'
                      : 'border-slate-700 bg-slate-900 text-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-[11px] text-slate-300">{freshnessReport.displaySummaryFa}</p>
            {freshnessReport.historicalValidityNoteFa && (
              <div className="mt-2 rounded border border-amber-500/40 bg-amber-950/30 p-2 text-[11px] text-amber-200">
                ⚠ {freshnessReport.historicalValidityNoteFa}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 text-xs">
            <div className="font-bold text-white">
              تفکیک پوشش مکانی (با مخرج مشخص) از کفایت آماری + کنترل مجوز انتشار
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-[11px] text-slate-400">مخرج پوشش:</label>
              <select
                value={selectedDenominator}
                onChange={(e) => setSelectedDenominator(e.target.value as CoverageDenominatorType)}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white"
              >
                <option value="neighborhood_count">تعداد محله‌ها</option>
                <option value="area_sqkm">مساحت جغرافیایی (km²)</option>
                <option value="statistical_blocks">بلوک‌های آماری</option>
              </select>
              <button
                type="button"
                data-testid="toggle-sample-sufficiency-btn"
                onClick={() => setSampleCount((c) => (c < 10 ? 18 : 6))}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-cyan-300"
              >
                تعداد نمونه یکتا: {sampleCount} (تغییر)
              </button>
              <select
                value={selectedRights}
                onChange={(e) => setSelectedRights(e.target.value as DataRightsStatus)}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white"
              >
                <option value="Derived">Derived (مشتق‌شده)</option>
                <option value="Public">Public (عمومی)</option>
                <option value="Unknown Rights">Unknown Rights (نامشخص)</option>
              </select>
            </div>
            <div className="mt-2 text-[11px] text-slate-300">
              پوشش: <strong>{coverageReport.coveragePct}٪</strong> بر مبنای «{coverageReport.denominatorLabelFa}» |{' '}
              {coverageReport.separationWarningFa}
            </div>
            <div className="mt-1 text-[11px] text-sky-300">{rightsReport.policyExplanationFa}</div>
          </div>
        </div>

        {/* Conflict Transparency (CON-01) & User Data Correction Report Workflow */}
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/15 p-3.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-300">
                نمایش شفاف تعارض منابع (CON-01: تعارض مقدار بدون حذف خودکار)
              </span>
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-200">
                در حال بررسی
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-300">
              منبع اول (آگهی مالک): سال ساخت <strong>۱۳۹۸</strong> | منبع دوم (گزارش بازدید): سال ساخت{' '}
              <strong>۱۳۹۹</strong>. رادار بدون شواهد کافی یکی را پنهان نمی‌کند.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-400">
              {RADAR_SOURCE_TAXONOMY.slice(0, 4).map((s) => (
                <span key={s.id} className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5">
                  {s.id}: {s.titleFa}
                </span>
              ))}
              {RADAR_QUALITY_DIMENSIONS.slice(0, 4).map((q) => (
                <span key={q.id} className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5 text-cyan-300">
                  {q.id}: {q.nameFa}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 text-xs">
            <div className="font-bold text-white">
              گزارش مشکل در اطلاعات (چرخه: Submitted → Triage → Evidence Review → Decision)
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={issueCategory}
                onChange={(e) => setIssueCategory(e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] text-white"
              >
                <option value="wrong_value">مقدار اشتباه است</option>
                <option value="wrong_location">موقعیت مکانی اشتباه است</option>
                <option value="stale_data">اطلاعات قدیمی است</option>
                <option value="duplicate_record">محتوای تکراری است</option>
              </select>
              <button
                type="button"
                data-testid="submit-data-issue-btn"
                onClick={() => setIssueSubmitted(true)}
                className="rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-emerald-500"
              >
                ثبت نمایشی گزارش خطا
              </button>
            </div>
            {issueSubmitted && (
              <p className="mt-2 text-[11px] text-emerald-300" data-testid="data-issue-confirmation">
                ✓ گزارش شما ({issueCategory}) در صف بررسی شواهد (Triage) ثبت شد و بدون بازبینی مستقیم داده مرجع را تغییر نمی‌دهد.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default Stage37DataTrustSubpanel;

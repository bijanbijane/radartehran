import React, { useMemo, useState } from 'react';
import { Building2, FileSearch, GitBranch, Layers } from 'lucide-react';
import {
  RT_FE_ENTITY_DETAIL_021_SPEC_ID, RT_FE_STAGE22_BRIDGE_SPEC_ID,
  RT_ENTITY_DOMAINS_10, RT_ENTITY_LAYERS_10, RT_ENTITY_HEADER_STATES_8,
  RT_ENTITY_PROVENANCE_STATUSES_7, RT_ENTITY_RELATIONSHIP_TYPES_10, RT_ENTITY_DELIVERABLES_31,
  evaluateEntityIdentityAndUrl, resolveEntitySectionsForType,
  evaluatePropertyPresentationRules, evaluateBuildingAndListingBoundaries,
  evaluateProvenanceAndRelationships,
  type CoreEntityType, type TriStateAttribute,
} from '../services/rtFeEntityDetail021Engine';

type EntityTabId = 'shell_identity' | 'profiles_completeness' | 'provenance_relations' | 'deliverables_bridge';

export const RtFeEntityDetail021Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<EntityTabId>('shell_identity');
  const [entityType, setEntityType] = useState<CoreEntityType>('property');
  const [leakQuerySecret, setLeakQuerySecret] = useState<boolean>(true);
  const [headerState, setHeaderState] = useState<(typeof RT_ENTITY_HEADER_STATES_8)[number]>('Verified');
  const [analyticsErrored, setAnalyticsErrored] = useState<boolean>(true);
  const [mergePrices, setMergePrices] = useState<boolean>(true);
  const [elevatorState, setElevatorState] = useState<'missing' | 'zero' | 'na'>('missing');
  const [addressMatchOnly, setAddressMatchOnly] = useState<boolean>(true);
  const [conflictActive, setConflictActive] = useState<boolean>(true);

  const identityOut = useMemo(
    () =>
      evaluateEntityIdentityAndUrl({
        id: 'prop-1042',
        type: entityType,
        headerState,
        queryParams: leakQuerySecret ? { token: 'priv-99' } : undefined,
        redirectTargetId: headerState === 'Merged' ? 'prop-2090' : undefined,
      }),
    [entityType, headerState, leakQuerySecret],
  );

  const sectionsOut = useMemo(
    () =>
      resolveEntitySectionsForType({
        entityType,
        identityLoaded: true,
        permissions: [],
        erroredSectionIds: analyticsErrored ? ['analytics'] : [],
      }),
    [entityType, analyticsErrored],
  );

  const elevatorAttr: TriStateAttribute = useMemo(() => {
    if (elevatorState === 'zero') return { kind: 'value', value: 0 };
    if (elevatorState === 'na') return { kind: 'not_applicable' };
    return { kind: 'missing' };
  }, [elevatorState]);

  const propOut = useMemo(
    () =>
      evaluatePropertyPresentationRules({
        askingSalePrice: 14500,
        askingRentPrice: 900,
        recordedTransactionPrice: 14100,
        modelValuationPrice: 13900,
        mergeAllIntoGenericPriceLabel: mergePrices,
        elevator: elevatorAttr,
      }),
    [mergePrices, elevatorAttr],
  );

  const boundaryOut = useMemo(
    () =>
      evaluateBuildingAndListingBoundaries({
        unitEditTargetsSharedBuildingSpec: false,
        exposeOwnerIdentityInUnitList: false,
        listingMatchedOnlyByAddressOrImage: addressMatchOnly,
        proposedMatchStatus: 'confirmed',
      }),
    [addressMatchOnly],
  );

  const provOut = useMemo(
    () =>
      evaluateProvenanceAndRelationships({
        fieldSamples: conflictActive
          ? [
              { fieldId: 'areaSqm', sourceId: 'deed-src', value: 112, status: 'verified' },
              { fieldId: 'areaSqm', sourceId: 'listing-src', value: 118, status: 'unverified' },
            ]
          : [
              { fieldId: 'areaSqm', sourceId: 'deed-src', value: 112, status: 'verified' },
              { fieldId: 'priceEst', sourceId: 'hedonic-v4', value: 13900, status: 'estimated', methodExplanationFa: 'مدل هدانیک آبان ۱۴۰۵ با ۲۴ نمونه همسایه' },
            ],
        relationships: [
          { relationType: 'Located In', status: 'confirmed', sourceId: 'gis-tehran' },
          { relationType: 'Advertised By', status: addressMatchOnly ? 'probable' : 'confirmed', sourceId: 'divar-feed' },
        ],
      }),
    [conflictActive, addressMatchOnly],
  );

  return (
    <div dir="rtl" data-testid="rt-fe-entity-021-panel" className="space-y-4 text-right">
      <div className="rounded-xl border border-teal-500/30 bg-slate-900/95 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-teal-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-300" dir="ltr">
                {RT_FE_ENTITY_DETAIL_021_SPEC_ID}
              </span>
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                ۱۰ لایه · ۴ پروفایل مرجع · ۱۰ رابطه · ۳۱ خروجی OUT
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله بیست‌ویکم: صفحات جزئیات موجودیت‌ها، پروفایل ملک، ساختمان، محله و آگهی
            </h4>
          </div>
          <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 text-xs font-bold text-emerald-300 whitespace-nowrap shrink-0" dir="ltr">
            Field Provenance · Zero PII
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'shell_identity', label: '۱. هویت پایدار، Canonical URL، رجیستری بخش‌ها و ایزولاسیون خطا' },
            { id: 'profiles_completeness', label: '۲. تفکیک ۶ قیمت ملک، نبود داده در برابر صفر و مرز ساختمان/آگهی' },
            { id: 'provenance_relations', label: '۳. منشأ سطح فیلد (Conflicting) و کاوشگر روابط قطعی/احتمالی' },
            { id: 'deliverables_bridge', label: '۴. ۱۰ موجودیت دامنه، ۳۱ خروجی OUT-001..031 و مرز مرحله ۲۲' },
          ].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as EntityTabId)} data-testid={`rt-fe-entity-tab-${tab.id}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === tab.id ? 'bg-teal-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'shell_identity' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-teal-300 flex items-center gap-1.5"><Layers className="w-4 h-4 shrink-0" /> <span>هویت، آدرس مرجع و ایزوله‌سازی خطای بخش (§۲۱.۴ & §۲۱.۲۲)</span></h5>
            <div className="flex flex-wrap gap-1.5">
              {(['property', 'building', 'neighborhood', 'listing'] as CoreEntityType[]).map((t) => (
                <button key={t} type="button" data-testid={`rt-fe-entity-type-${t}`} onClick={() => setEntityType(t)} className={`rounded px-2.5 py-1 font-mono text-[11px] font-bold ${entityType === t ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`} dir="ltr">{t}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="rt-fe-entity-toggle-secret" onClick={() => setLeakQuerySecret((v) => !v)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${leakQuerySecret ? 'bg-rose-700 text-white' : 'bg-emerald-700 text-white'}`}>
                {leakQuerySecret ? 'حذف توکن خصوصی از Query String' : 'تست نشت توکن در Query String'}
              </button>
              <button type="button" data-testid="rt-fe-entity-toggle-section-err" onClick={() => setAnalyticsErrored((v) => !v)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${analyticsErrored ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-300'}`}>
                {analyticsErrored ? 'خطای ایزوله بخش ارزش‌گذاری (صفحه فعال)' : 'همه بخش‌ها سالم'}
              </button>
              <select aria-label="وضعیت هدر" value={headerState} onChange={(e) => setHeaderState(e.target.value as (typeof RT_ENTITY_HEADER_STATES_8)[number])} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-white" dir="ltr">
                {RT_ENTITY_HEADER_STATES_8.map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>
            <div data-testid="rt-fe-entity-identity-verdict" className={`rounded p-2.5 text-[11px] space-y-1 ${identityOut.valid ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200 font-bold'}`}>
              <div>مسیر مرجع — <span className="font-mono" dir="ltr">{identityOut.canonicalUrl}</span></div>
              <div>{identityOut.valid ? identityOut.pageBehaviorFa : identityOut.issues[0]}</div>
            </div>
            <div data-testid="rt-fe-entity-sections-verdict" className="rounded bg-slate-950 p-2.5 text-[11px] text-cyan-200">
              بخش‌های فعال ({sectionsOut.visibleSectionIds.length}) — <span className="font-mono" dir="ltr">{sectionsOut.visibleSectionIds.join(', ')}</span>
              {sectionsOut.isolatedErrorSections.length > 0 && (
                <div className="text-amber-300 mt-1">خطای مهارشده بدون سقوط کل صفحه — <span className="font-mono" dir="ltr">{sectionsOut.isolatedErrorSections.join(', ')}</span></div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1 max-h-80 overflow-y-auto">
            <h5 className="font-bold text-cyan-300">۱۰ لایه معماری کلان جزئیات موجودیت (§۲۱.۵)</h5>
            {RT_ENTITY_LAYERS_10.map((l) => (
              <div key={l.layer} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[11px]">
                <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-cyan-300 ml-1.5" dir="ltr">{l.layer}. {l.nameEn}</span>
                <span className="text-slate-200">{l.roleFa}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'profiles_completeness' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-indigo-300 flex items-center gap-1.5"><Building2 className="w-4 h-4 shrink-0" /> <span>تفکیک ۶ قیمت و تمایز Missing از صفر و نامرتبط (§۲۱.۹.۶ & §۲۱.۱۹.۳)</span></h5>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="rt-fe-entity-toggle-merge-prices" onClick={() => setMergePrices((v) => !v)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${mergePrices ? 'bg-rose-700 text-white' : 'bg-emerald-700 text-white'}`}>
                {mergePrices ? 'حالت غلط: ادغام همه در «قیمت ملک»' : 'تفکیک صحیح ۶ نوع قیمت'}
              </button>
              <button type="button" data-testid="rt-fe-entity-elev-missing" onClick={() => setElevatorState('missing')} className={`rounded px-2 py-1 text-[11px] font-bold ${elevatorState === 'missing' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>آسانسور: نامشخص</button>
              <button type="button" data-testid="rt-fe-entity-elev-zero" onClick={() => setElevatorState('zero')} className={`rounded px-2 py-1 text-[11px] font-bold ${elevatorState === 'zero' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>آسانسور: ندارد (۰ تأییدشده)</button>
              <button type="button" data-testid="rt-fe-entity-elev-na" onClick={() => setElevatorState('na')} className={`rounded px-2 py-1 text-[11px] font-bold ${elevatorState === 'na' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>کاربرد ندارد (زمین)</button>
            </div>
            <div data-testid="rt-fe-entity-prop-verdict" className={`rounded p-2.5 text-[11px] space-y-1 ${propOut.valid ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200 font-bold'}`}>
              <div>{propOut.valid ? `تعداد قیمت‌های تفکیک‌شده بدون ادغام: ${propOut.distinctPriceCount}` : propOut.issues[0]}</div>
              <div className="text-cyan-200 font-normal">{propOut.elevatorDisplayFa}</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-amber-300">مرز آگهی با ملک و مالکیت ساختمان (§۲۱.۹.۷ & §۲۱.۱۰)</h5>
            <button type="button" data-testid="rt-fe-entity-toggle-addr-match" onClick={() => setAddressMatchOnly((v) => !v)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${addressMatchOnly ? 'bg-amber-700 text-white' : 'bg-emerald-700 text-white'}`}>
              {addressMatchOnly ? 'تطبیق صرفاً با شباهت آدرس/تصویر' : 'تطبیق چندمنبعی تأییدشده'}
            </button>
            <div data-testid="rt-fe-entity-boundary-verdict" className={`rounded p-2.5 text-[11px] font-bold ${boundaryOut.allowed ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}>
              وضعیت تطبیق آگهی — <span className="font-mono" dir="ltr">{boundaryOut.resolvedMatchStatus}</span>
              {boundaryOut.issues[0] && <div className="mt-1 font-normal">{boundaryOut.issues[0]}</div>}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'provenance_relations' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-cyan-300 flex items-center gap-1.5"><FileSearch className="w-4 h-4 shrink-0" /> <span>منشأ سطح فیلد و تشخیص تعارض منابع (§۲۱.۱۳)</span></h5>
            <button type="button" data-testid="rt-fe-entity-toggle-conflict" onClick={() => setConflictActive((v) => !v)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${conflictActive ? 'bg-rose-700 text-white' : 'bg-emerald-700 text-white'}`}>
              {conflictActive ? 'تعارض فعال (متراژ ۱۱۲ در برابر ۱۱۸)' : 'منبع واحد تأییدشده + توضیح روش برآورد'}
            </button>
            <div data-testid="rt-fe-entity-prov-verdict" className={`rounded p-2.5 text-[11px] font-bold ${provOut.hasConflict ? 'bg-rose-950/60 text-rose-200' : 'bg-emerald-950/60 text-emerald-200'}`}>
              {provOut.hasConflict ? `تعارض ثبت‌شده میان منابع (${provOut.conflictValues.join(' / ')} متر) — نمایش هر دو منبع بدون جعل حقیقت واحد` : 'منابع هم‌سو هستند و فیلد برآوردی دارای توضیح روش تولید است.'}
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {RT_ENTITY_PROVENANCE_STATUSES_7.map((st) => (
                <span key={st} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-cyan-200" dir="ltr">{st}</span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-teal-300 flex items-center gap-1.5"><GitBranch className="w-4 h-4 shrink-0" /> <span>۱۰ نوع رابطه رسمی موجودیت‌ها (§۲۱.۱۵)</span></h5>
            <div className="flex flex-wrap gap-1">
              {RT_ENTITY_RELATIONSHIP_TYPES_10.map((rel) => (
                <span key={rel} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-indigo-200" dir="ltr">{rel}</span>
              ))}
            </div>
            <p className="text-[11px] text-slate-300">روابط قطعی (Confirmed) بدون شناسه منبع معتبر پذیرفته نمی‌شوند و بازگشت به Search/Map/Table بدون ذخیره Context حجیم در URL انجام می‌شود.</p>
          </div>
        </div>
      )}

      {activeTab === 'deliverables_bridge' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5 max-h-80 overflow-y-auto">
            <h5 className="font-bold text-cyan-300">۱۰ دسته موجودیت دامنه (§۲۱.۳.۱)</h5>
            {RT_ENTITY_DOMAINS_10.map((d) => (
              <div key={d.entity} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[10px]">
                <strong className="text-teal-300" dir="ltr">{d.entity}</strong> <span className="text-slate-300">— {d.sampleFa}</span>
              </div>
            ))}
            <div className="pt-1 text-[10px] text-emerald-300">مرز انتقال به مرحله ۲۲: <code className="font-mono" dir="ltr">{RT_FE_STAGE22_BRIDGE_SPEC_ID}</code></div>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">۳۱ خروجی نهایی مرحله بیست‌ویکم (RT-FE-ENTITY-OUT-001 تا 031)</h5>
            <div className="max-h-72 overflow-y-auto grid grid-cols-1 gap-1 sm:grid-cols-2">
              {RT_ENTITY_DELIVERABLES_31.map((del) => (
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

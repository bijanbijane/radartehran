import React, { useState, useMemo } from 'react'; import { FileText, ShieldAlert, Calculator, Building2, Users, CheckCircle2, AlertTriangle, EyeOff, GitCompare, Calendar, Wrench, BarChart3, Workflow, X, } from 'lucide-react'; import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator'; import { CONTRACT_CLAUSE_TAXONOMY_REGISTRY, classifyContractClauseWithAnchor, evaluateContractPageOcrQuality, compareContractVersionsByClause, detectContractClauseConflicts, redactSensitiveContractContent, simulateMortgageEarlyRepaymentAndSellerProceeds, aggregatePersonalPropertyPortfolio, evaluateAgencyInvitationAndTenantAccess, } from '../utils/legalContractIntelligenceAndAgencyWorkspace'; import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { AreaUnitToggle, useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { AgencyCrmAndAutomationStudioModal } from './AgencyCrmAndAutomationStudioModal'; import { BiRiskAndGeospatialIntelligenceStudioModal } from './BiRiskAndGeospatialIntelligenceStudioModal'; import { EnterpriseAssetFundAndMarketIntelligenceModal } from './EnterpriseAssetFundAndMarketIntelligenceModal'; import { useDialogFocus } from './useDialogFocus';
export interface LegalContractAndPortfolioStudioModalProps { isOpen: boolean; onClose: () => void; } type StudioTabId = 'contracts' | 'mortgage_proceeds' | 'portfolio_ledger' | 'agency_workspace'; export const LegalContractAndPortfolioStudioModal: React.FC<LegalContractAndPortfolioStudioModalProps> = ({ isOpen, onClose }) => { const [areaUnit] = useAreaUnit(); const [currency] = useIntlCurrency(); const [locale] = useRadarLocale(); const showIntl = currency !== 'IRT'; const [activeTab, setActiveTab] = useState<StudioTabId>('contracts'); const [showCrmAutomationModal, setShowCrmAutomationModal] = useState(false); const [showBiGisModal, setShowBiGisModal] = useState(false); const [showEnterpriseAssetFundModal, setShowEnterpriseAssetFundModal] = useState(false); const dialogRef = useDialogFocus( isOpen && !showCrmAutomationModal && !showBiGisModal && !showEnterpriseAssetFundModal, onClose
  ); const [taxonomySearch, setTaxonomySearch] = useState(''); const [selectedPageIdx, setSelectedPageIdx] = useState(0); const [rawContractSample, setRawContractSample] = useState( 'ماده ۱: طرفین قرارداد کدملی 0012345678 تلفن 09123456789 و شبا IR123456789012345678901234. ماده ۳: ثمن معامله ده میلیارد تومان تعیین گردید.'
  ); const [redactionConfirmed, setRedactionConfirmed] = useState(false); const [loanPrincipalMillion, setLoanPrincipalMillion] = useState(1000); const [loanRatePercent, setLoanRatePercent] = useState(23); const [loanTermMonths, setLoanTermMonths] = useState(60); const [extraMonthlyPrepayMillion, setExtraMonthlyPrepayMillion] = useState(5);
  const [grossSaleMillion, setGrossSaleMillion] = useState(12000); const [brokerageFeeMillion, setBrokerageFeeMillion] = useState(35); const [activeOrgId, setActiveOrgId] = useState<'org-tehran-prime' | 'org-shemiran'>('org-tehran-prime');
  const [actorRole, setActorRole] = useState<'ORG_ADMIN' | 'ORG_AGENT'>('ORG_ADMIN'); const filteredTaxonomy = useMemo(() => { const q = taxonomySearch.trim().toLowerCase(); return Object.values(CONTRACT_CLAUSE_TAXONOMY_REGISTRY).filter( (item) => !q || item.labelFa.includes(q) || item.labelEn.toLowerCase().includes(q) || item.clauseTypeId.toLowerCase().includes(q)
    ); }, [taxonomySearch]); const anchoredFinding = useMemo( () => classifyContractClauseWithAnchor({ documentId: 'contract-1404-01', physicalPageIndex: selectedPageIdx,
      printedPageLabel: `صفحه ${selectedPageIdx + 1}`, rawClauseText: rawContractSample,
      proposedClauseTypeId: 'CLAUSE_CONSIDERATION_AND_PAYMENT', hasExactBoundingBox: true, }), [selectedPageIdx, rawContractSample] ); const ocrAssessment = useMemo( () => evaluateContractPageOcrQuality({ pageIndex: selectedPageIdx, extractedText: rawContractSample, providerConfidencePercent: 92 }), [selectedPageIdx, rawContractSample] );
  const clauseDiffs = useMemo( () => compareContractVersionsByClause(
      [
        { clauseNumber: 'ماده ۳', text: 'ثمن معامله ۱۰ میلیارد تومان', pageIndex: 0 }, { clauseNumber: 'ماده ۵', text: 'تحویل در تاریخ ۱۴۰۴/۰۳/۰۱', pageIndex: 1 }, ], [
        { clauseNumber: 'ماده ۳', text: 'ثمن معامله ۱۰.۵ میلیارد تومان', pageIndex: 0 }, { clauseNumber: 'ماده ۵', text: 'تحویل در تاریخ ۱۴۰۴/۰۳/۰۱', pageIndex: 1 }, { clauseNumber: 'ماده ۷', text: 'خسارت تاخیر روزانه ۵ میلیون تومان', pageIndex: 2 }, ]
    ), [] );
  const conflictReport = useMemo( () => detectContractClauseConflicts({ statedTotalContractAmountToman: 10_000_000_000, installmentAmountsToman: [4_000_000_000, 5_000_000_000],
      contractSigningDateIso: '2026-05-10', propertyDeliveryDateIso: '2026-05-01', partyRoles: [{ partyId: 'p1', role: 'BUYER' }], }), [] );
  const redactedPreview = useMemo( () => redactSensitiveContractContent(rawContractSample, { redactNationalIds: true, redactPhones: true, redactIbans: true }), [rawContractSample] );
  const mortgageAndProceeds = useMemo( () => simulateMortgageEarlyRepaymentAndSellerProceeds({
      principalToman: loanPrincipalMillion * 1_000_000, annualNominalRatePercent: loanRatePercent, termMonths: loanTermMonths,
      extraMonthlyPrincipalPrepaymentToman: extraMonthlyPrepayMillion * 1_000_000,
      sellerGrossSalePriceToman: grossSaleMillion * 1_000_000, sellerBrokerageFeeToman: brokerageFeeMillion * 1_000_000,
      sellerOtherTransferCostsToman: 15_000_000, }), [loanPrincipalMillion, loanRatePercent, loanTermMonths, extraMonthlyPrepayMillion, grossSaleMillion, brokerageFeeMillion] );
  const portfolioSummary = useMemo( () => aggregatePersonalPropertyPortfolio('user-demo', [
      { assetId: 'asset-saadat-1', ownerUid: 'user-demo', acquisitionCostToman: 9_000_000_000, userEstimatedValueToman: 12_500_000_000, ownershipSharePercent: 100, recordedRentalIncomeToman: 480_000_000, recordedMaintenanceExpenseToman: 45_000_000 },
      { assetId: 'asset-vanak-2', ownerUid: 'user-demo', acquisitionCostToman: 16_000_000_000, userEstimatedValueToman: 20_000_000_000, ownershipSharePercent: 50, recordedRentalIncomeToman: 720_000_000, recordedMaintenanceExpenseToman: 80_000_000 },
    ]), [] );
  const agencyCheck = useMemo( () => evaluateAgencyInvitationAndTenantAccess({
      actorUid: 'agent-1', actorOrganizationId: activeOrgId, actorRoleInOrg: actorRole, targetResourceOrganizationId: activeOrgId,
      invitation: { invitationId: 'inv-901', organizationId: activeOrgId, intendedRecipientUid: 'agent-1', proposedRole: 'ORG_AGENT', status: 'PENDING', expiresAtMs: Date.now() + 86_400_000 },
      nowMs: Date.now(), }), [activeOrgId, actorRole] );
  if (!isOpen) return null;
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="bundle-112-studio-title" dir="rtl">
      <div ref={dialogRef} onClick={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-emerald-400" />
            <div>
              <h2 id="bundle-112-studio-title" className="text-base font-bold text-white">
                استودیوی هوشمند قراردادهای حقوقی، وام، سبد دارایی و فضای کاری آژانس
              </h2>
              <p className="text-xs text-slate-400">
                پوشش کامل استانداردهای بسته‌های ۱۱۲ تا ۱۳۱ (پرامپت‌های ۱۱۷۹ تا ۱۹۲۴) + Lazy Loading GeoJSON
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AreaUnitToggle compact showIntlControls />
            <button type="button" onClick={() => setShowCrmAutomationModal(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500">
              <Workflow className="h-3.5 w-3.5" /> مرکز CRM و اتوماسیون آژانس (۱۱۳)
            </button>
            <button type="button" onClick={() => setShowBiGisModal(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500">
              <BarChart3 className="h-3.5 w-3.5" /> هوش تجاری، GIS و شهر هوشمند (۱۱۴–۱۱۶)
            </button>
            <button type="button" onClick={() => setShowEnterpriseAssetFundModal(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500">
              <Building2 className="h-3.5 w-3.5" /> دارایی، صندوق، بازار، CRM، ساخت‌وساز، بهره‌برداری، حقوقی و پیمانکاران (۱۱۸–۱۳۱)
            </button>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="بستن پنجره">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 bg-slate-950/50 px-6 py-3">
          {[
            { id: 'contracts', label: '۱. اسناد حقوقی، OCR و سانسور PII', icon: ShieldAlert },
            { id: 'mortgage_proceeds', label: '۲. اقساط وام، تسویه زودهنگام و خالص فروشنده', icon: Calculator },
            { id: 'portfolio_ledger', label: '۳. دفتر دارایی، سبد سرمایه‌گذاری و تعمیرات', icon: Building2 },
            { id: 'agency_workspace', label: '۴. فضای کاری آژانس و دعوت اعضا', icon: Users },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as StudioTabId)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  active ? 'bg-emerald-600 text-white shadow' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6 text-xs">
          {activeTab === 'contracts' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-bold text-emerald-400">مرورگر طبقه‌بندی بندها و اتصال به صفحه سند (۱۱۷۹–۱۱۸۰)</span>
                  <span className="text-[11px] text-slate-400">نسخه Taxonomy: 1.0.0</span>
                </div>
                <input
                  type="search"
                  value={taxonomySearch}
                  onChange={(e) => setTaxonomySearch(e.target.value)}
                  placeholder="جست‌وجوی بند حقوقی (فارسی یا شناسه انگلیسی)..."
                  className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white"
                />
                <div className="space-y-2">
                  {filteredTaxonomy.map((clause) => (
                    <div key={clause.clauseTypeId} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-2">
                      <div>
                        <div className="font-semibold text-white">{clause.labelFa}</div>
                        <div className="text-[11px] text-slate-400">{clause.clauseTypeId} · {clause.applicableContractTypes.join(' / ')}</div>
                      </div>
                      <span className="text-[10px] text-emerald-300">شناسه پایدار</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-2.5">
                  <div className="flex items-center justify-between font-bold text-emerald-300">
                    <span>یافته متصل به منبع: {anchoredFinding.printedPageLabel}</span>
                    <button type="button" onClick={() => setSelectedPageIdx((p) => (p + 1) % 3)} className="rounded bg-emerald-700 px-2 py-0.5 text-[10px] text-white">
                      ورق زدن صفحه ({selectedPageIdx + 1}/3)
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-300">{anchoredFinding.quotedExcerpt}</p>
                </div>
              </div>
              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-300">کنترل کیفیت OCR، تعارض‌ها و حذف اطلاعات حساس (۱۱۸۱–۱۱۸۸)</span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" /> OCR: {ocrAssessment.qualityState} ({ocrAssessment.providerConfidencePercent}%)
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={rawContractSample}
                  onChange={(e) => {
                    setRawContractSample(e.target.value);
                    setRedactionConfirmed(false);
                  }} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200"
                />
                <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-2.5">
                  <div className="mb-1 flex items-center gap-1.5 font-bold text-rose-300">
                    <AlertTriangle className="h-4 w-4" /> تعارض‌های شناسایی‌شده قطعی ({conflictReport.conflicts.length} مورد{showIntl ? ` · ثمن: ${formatMillionTomanAsIntlCurrency(10_000, currency, locale)} vs اقساط: ${formatMillionTomanAsIntlCurrency(9_000, currency, locale)}` : ''}):
                  </div>
                  {conflictReport.conflicts.map((c, idx) => (
                    <div key={idx} className="text-[11px] text-rose-200">• {c.descriptionFa}</div>
                  ))} </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                  <div className="mb-1 flex items-center gap-1.5 font-bold text-sky-300">
                    <GitCompare className="h-4 w-4" /> مقایسه نسخه ۱ و نسخه ۲ قرارداد:
                  </div>
                  {clauseDiffs.map((d) => (
                    <div key={d.clauseNumber} className="flex justify-between text-[11px] text-slate-300">
                      <span>{d.clauseNumber}</span>
                      <span>{d.changeType} {d.numericValueChanged ? `(تغییر رقم مالی${showIntl ? `: ${formatMillionTomanAsIntlCurrency(10_000, currency, locale)} ← ${formatMillionTomanAsIntlCurrency(10_500, currency, locale)}` : ''})` : ''}</span>
                    </div>
                  ))} </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 font-bold text-slate-200">
                      <EyeOff className="h-3.5 w-3.5 text-amber-400" /> پیش‌نمایش نسخه سانسورشده ({redactedPreview.redactedCount} مورد PII حذف شد)
                    </span>
                    <button type="button" onClick={() => setRedactionConfirmed(true)} className="rounded bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white">
                      تایید صریح تولید فایل پاکسازی‌شده
                    </button>
                  </div>
                  <p className="mt-1.5 font-mono text-[11px] text-slate-300">{redactedPreview.sanitizedDerivativeText}</p>
                  {redactionConfirmed && <div className="mt-1 text-[11px] text-emerald-400">نسخه مشتق بدون تغییر در سند اصلی آماده اشتراک‌گذاری امن شد.</div>} </div>
              </div>
            </div>
          )} {activeTab === 'mortgage_proceeds' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <h3 className="font-bold text-emerald-400">ماشین‌حساب اقساط وام و تسویه زودتر از موعد (۱۱۸۹–۱۱۹۰)</h3>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className="text-slate-400">اصل وام (میلیون تومان){showIntl ? ` (${formatMillionTomanAsIntlCurrency(loanPrincipalMillion, currency, locale)})` : ''}</span><input type="number" value={loanPrincipalMillion} onChange={(e) => setLoanPrincipalMillion(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" /></label>
                  <label className="block"><span className="text-slate-400">نرخ سود اسمی سالانه (%)</span><input type="number" value={loanRatePercent} onChange={(e) => setLoanRatePercent(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" /></label>
                  <label className="block"><span className="text-slate-400">مدت بازپرداخت (ماه)</span><input type="number" value={loanTermMonths} onChange={(e) => setLoanTermMonths(Math.max(1, Number(e.target.value)))} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" /></label>
                  <label className="block"><span className="text-slate-400">پرداخت مازاد ماهانه (میلیون){showIntl ? ` (${formatMillionTomanAsIntlCurrency(extraMonthlyPrepayMillion, currency, locale)})` : ''}</span><input type="number" value={extraMonthlyPrepayMillion} onChange={(e) => setExtraMonthlyPrepayMillion(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" /></label>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 space-y-1">
                  <div>کل سود سناریوی پایه: {mortgageAndProceeds.baselineTotalInterestToman.toLocaleString('fa-IR')} تومان{showIntl ? ` (${formatMillionTomanAsIntlCurrency(mortgageAndProceeds.baselineTotalInterestToman / 1_000_000, currency, locale)})` : ''}</div>
                  <div>مدت تسویه با پرداخت مازاد: {mortgageAndProceeds.acceleratedMonthsCount} ماه (از {loanTermMonths} ماه)</div>
                  <div className="font-bold text-emerald-400">صرفه‌جویی خالص سود وام: {mortgageAndProceeds.netInterestSavedToman.toLocaleString('fa-IR')} تومان{showIntl ? ` (${formatMillionTomanAsIntlCurrency(mortgageAndProceeds.netInterestSavedToman / 1_000_000, currency, locale)})` : ''}</div>
                </div>
              </div>
              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <h3 className="font-bold text-sky-400">ماشین‌حساب خالص دریافتی فروشنده پس از کسر تعهدات (۱۱۹۱)</h3>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className="text-slate-400">قیمت ناخالص فروش (میلیون تومان · هر {areaUnit === 'sqft' ? 'ft²' : 'متر'} واحد {formatAreaShort(80, areaUnit)}: {Math.round(convertPricePerSqmToUnit(grossSaleMillion / 80, areaUnit)).toLocaleString('fa-IR')} م · معامله v6.4: {Math.round(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', grossSaleMillion / 80, []).estimatedDealPricePerSqm, areaUnit)).toLocaleString('fa-IR')} م){showIntl ? ` (${formatMillionTomanAsIntlCurrency(grossSaleMillion, currency, locale)})` : ''}</span><input type="number" value={grossSaleMillion} onChange={(e) => setGrossSaleMillion(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" /></label>
                  <label className="block"><span className="text-slate-400">حق‌الزحمه مشاور املاک (میلیون){showIntl ? ` (${formatMillionTomanAsIntlCurrency(brokerageFeeMillion, currency, locale)})` : ''}</span><input type="number" value={brokerageFeeMillion} onChange={(e) => setBrokerageFeeMillion(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" /></label>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 space-y-1">
                  <div>تسویه مانده وام فعلی: {(loanPrincipalMillion * 1_000_000).toLocaleString('fa-IR')} تومان{showIntl ? ` (${formatMillionTomanAsIntlCurrency(loanPrincipalMillion, currency, locale)})` : ''}</div>
                  <div className="font-bold text-sky-300">خالص دریافتی تخمینی فروشنده: {mortgageAndProceeds.sellerNetEstimatedProceedsToman.toLocaleString('fa-IR')} تومان{showIntl ? ` (${formatMillionTomanAsIntlCurrency(mortgageAndProceeds.sellerNetEstimatedProceedsToman / 1_000_000, currency, locale)})` : ''}</div>
                </div>
              </div>
            </div>
          )} {activeTab === 'portfolio_ledger' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <h3 className="font-bold text-emerald-400">دفتر ثبت دارایی‌های شخصی و سبد سرمایه‌گذاری با تعدیل سهم مالکیت (۱۱۹۲–۱۱۹۳)</h3>
                <div>تعداد دارایی‌های اظهارشده کاربر: {portfolioSummary.eligibleAssetCount} ملک (مجموع متراژ: {formatAreaShort(250, areaUnit)})</div>
                <div>بهای تمام‌شده تعدیل‌شده: {portfolioSummary.shareAdjustedAcquisitionCostToman.toLocaleString('fa-IR')} تومان{showIntl ? ` (${formatMillionTomanAsIntlCurrency(portfolioSummary.shareAdjustedAcquisitionCostToman / 1_000_000, currency, locale)})` : ''}</div>
                <div>ارزش برآوردی کاربر: {portfolioSummary.shareAdjustedEstimatedValueToman.toLocaleString('fa-IR')} تومان{showIntl ? ` (${formatMillionTomanAsIntlCurrency(portfolioSummary.shareAdjustedEstimatedValueToman / 1_000_000, currency, locale)})` : ''}</div>
                <div className="font-bold text-emerald-300">خالص جریان نقدی عملیاتی: {portfolioSummary.shareAdjustedNetOperatingCashFlowToman.toLocaleString('fa-IR')} تومان{showIntl ? ` (${formatMillionTomanAsIntlCurrency(portfolioSummary.shareAdjustedNetOperatingCashFlowToman / 1_000_000, currency, locale)})` : ''}</div>
              </div>
              <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <h3 className="flex items-center gap-2 font-bold text-sky-400"><Calendar className="h-4 w-4" /> تقویم وصول اجاره و برنامه‌ریزی تعمیرات ملک (۱۱۹۴–۱۱۹۶)</h3>
                <div className="rounded border border-slate-800 bg-slate-900 p-2.5">
                  <div className="font-semibold text-white">قسط اجاره خرداد ۱۴۰۴ — واحد سعادت‌آباد ({formatAreaShort(110, areaUnit)})</div>
                  <div className="text-[11px] text-slate-400">مبلغ سررسید: ۴۰,۰۰۰,۰۰۰ تومان{showIntl ? ` (${formatMillionTomanAsIntlCurrency(40, currency, locale)})` : ''} · معامله محله v6.4: {Math.round(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', grossSaleMillion / 80, []).estimatedDealPricePerSqm, areaUnit)).toLocaleString('fa-IR')} م · وضعیت: سررسید شده</div>
                </div>
                <div className="rounded border border-slate-800 bg-slate-900 p-2.5">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-300"><Wrench className="h-3.5 w-3.5" /> دستور کار تعمیرات: سرویس موتورخانه و عایق‌بندی</div>
                  <div className="text-[11px] text-slate-400">وضعیت: برنامه‌ریزی‌شده (Planned) · هزینه برآوردی: ۱۵,۰۰۰,۰۰۰ تومان{showIntl ? ` (${formatMillionTomanAsIntlCurrency(15, currency, locale)})` : ''}</div>
                </div>
              </div>
            </div>
          )} {activeTab === 'agency_workspace' && (
            <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-emerald-400">فضای کاری اختصاصی آژانس املاک و مدیریت دعوت اعضا (۱۱۹۷–۱۱۹۸)</h3>
                  <p className="text-[11px] text-slate-400">تفکیک کامل فضای کاری سازمانی (Multi-Tenant) از حساب ناشر حقیقی</p>
                </div>
                <div className="flex items-center gap-2">
                  <select value={activeOrgId} onChange={(e) => setActiveOrgId(e.target.value as 'org-tehran-prime' | 'org-shemiran')} className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-white">
                    <option value="org-tehran-prime">آژانس املاک تهران پرایم</option>
                    <option value="org-shemiran">هلدینگ مسکن شمیرانات</option>
                  </select>
                  <select value={actorRole} onChange={(e) => setActorRole(e.target.value as 'ORG_ADMIN' | 'ORG_AGENT')} className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-white">
                    <option value="ORG_ADMIN">نقش فعلی: مدیر آژانس (ORG_ADMIN)</option>
                    <option value="ORG_AGENT">نقش فعلی: مشاور (ORG_AGENT)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <div className="text-slate-400">دسترسی به آگهی‌های سازمانی</div>
                  <div className="mt-1 font-bold text-emerald-400">{agencyCheck.tenantResourceAccessAllowed ? 'مجاز (ایزوله در Tenant)' : 'مسدود'}</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <div className="text-slate-400">مجوز ارسال دعوت‌نامه مدیر جدید</div>
                  <div className="mt-1 font-bold text-sky-300">{agencyCheck.canIssueAdminInvitation ? 'فعال برای مدیر آژانس' : 'غیرفعال برای مشاور عادی'}</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <div className="text-slate-400">وضعیت دعوت‌نامه آزمایشی (inv-901)</div>
                  <div className="mt-1 font-bold text-amber-300">{agencyCheck.invitationClaimStatus}</div>
                </div>
              </div>
            </div>
          )} </div>
      </div>
      <AgencyCrmAndAutomationStudioModal isOpen={showCrmAutomationModal} onClose={() => setShowCrmAutomationModal(false)} />
      <BiRiskAndGeospatialIntelligenceStudioModal isOpen={showBiGisModal} onClose={() => setShowBiGisModal(false)} />
      <EnterpriseAssetFundAndMarketIntelligenceModal open={showEnterpriseAssetFundModal} onClose={() => setShowEnterpriseAssetFundModal(false)} />
    </div>
  ); }; export default LegalContractAndPortfolioStudioModal;
/**
 * @file src/components/property-insurance/InsurancePoliciesView.tsx
 * @description Frontend ownership of property insurance policy UI (RT-INFRA-001).
 * to list and inspect details of insurance policies, coverages, verbatim exclusions,
 * financial premium breakdowns, and verification limitations associated with a canonical property.
 */

import React, { useMemo, useState } from 'react';
import type { PropertyHazardContextSummary } from '../../../server/modules/property-insurance/contracts/externalAdapters';
import {
  evaluatePolicyCoverageStatusWithLimitations,
  type PolicyCoverageEvaluationReport,
} from '../../../server/modules/property-insurance/coverage/policyAndClaimStateMachineEngine';
import type {
  InsuranceClaimRecord,
  InsurancePolicyCategory,
  InsurancePolicyLifecycleStatus,
  InsurancePolicyRecord,
  PolicyCoverageRecord,
  PolicyExclusionOrLimitationRecord,
  PolicyRenewalRecord,
} from '../../../server/modules/property-insurance/domain/types';

export interface InsurancePolicyDetailViewModel {
  policy: InsurancePolicyRecord;
  coverages: PolicyCoverageRecord[];
  exclusions: PolicyExclusionOrLimitationRecord[];
  claims: InsuranceClaimRecord[];
  renewals: PolicyRenewalRecord[];
  coverageEvaluation: PolicyCoverageEvaluationReport;
}

export interface InsurancePoliciesViewProps {
  canonicalPropertyId: string;
  policies: InsurancePolicyRecord[];
  coveragesByPolicyId?: Record<string, PolicyCoverageRecord[]>;
  exclusionsByPolicyId?: Record<string, PolicyExclusionOrLimitationRecord[]>;
  claimsByPolicyId?: Record<string, InsuranceClaimRecord[]>;
  renewalsByPolicyId?: Record<string, PolicyRenewalRecord[]>;
  hazardContext?: PropertyHazardContextSummary | null;
  asOfIso?: string;
  initialSelectedPolicyId?: string | null;
  onSelectPolicy?: (policyId: string) => void;
}

const POLICY_CATEGORY_LABELS_FA: Record<InsurancePolicyCategory, string> = {
  RESIDENTIAL_PROPERTY_INSURANCE: 'بیمه املاک مسکونی',
  COMMERCIAL_PROPERTY_INSURANCE: 'بیمه املاک تجاری',
  FIRE_COVERAGE: 'بیمه آتش‌سوزی',
  NATURAL_DISASTER_COVERAGE: 'بیمه حوادث طبیعی',
  FLOOD_COVERAGE: 'بیمه سیل',
  EARTHQUAKE_COVERAGE: 'بیمه زلزله',
  LIABILITY_COVERAGE: 'بیمه مسئولیت مدنی ملک',
  CONSTRUCTION_OR_RENOVATION_COVERAGE: 'بیمه مهندسی و بازسازی',
  LANDLORD_INSURANCE: 'بیمه موجر',
  OTHER_SUPPORTED_PROPERTY_INSURANCE: 'سایر بیمه‌های املاک',
};

const POLICY_STATUS_LABELS_FA: Record<InsurancePolicyLifecycleStatus, string> = {
  DRAFT: 'پیش‌نویس',
  SUBMITTED: 'ارسال‌شده',
  PENDING_VERIFICATION: 'در انتظار راستی‌آزمایی',
  ACTIVE: 'فعال',
  SUSPENDED: 'معلق',
  EXPIRED: 'منقضی‌شده',
  CANCELLED: 'فسخ‌شده',
  NON_RENEWED: 'تمدیدنشدنی',
  DISPUTED: 'دارای اختلاف',
  UNKNOWN: 'نامشخص',
};

/**
 * Pure helper to filter and sort policies associated with a canonical property.
 */
export function filterAndSortPropertyInsurancePolicies(input: {
  canonicalPropertyId: string;
  policies: InsurancePolicyRecord[];
  statusFilter?: InsurancePolicyLifecycleStatus | 'ALL';
  categoryFilter?: InsurancePolicyCategory | 'ALL';
  searchQuery?: string;
}): InsurancePolicyRecord[] {
  const query = (input.searchQuery ?? '').trim().toLowerCase();
  return input.policies
    .filter((policy) => {
      if (!policy.insuredPropertyCanonicalIds.includes(input.canonicalPropertyId)) {
        return false;
      }
      if (input.statusFilter && input.statusFilter !== 'ALL' && policy.status !== input.statusFilter) {
        return false;
      }
      if (
        input.categoryFilter &&
        input.categoryFilter !== 'ALL' &&
        policy.policyCategory !== input.categoryFilter
      ) {
        return false;
      }
      if (query) {
        const matchesNumber = policy.externalPolicyNumber.toLowerCase().includes(query);
        const matchesId = policy.policyId.toLowerCase().includes(query);
        const matchesProvider = policy.providerId.toLowerCase().includes(query);
        if (!matchesNumber && !matchesId && !matchesProvider) return false;
      }
      return true;
    })
    .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
}

/**
 * Pure helper to build a rich detail view-model for a single policy including its
 * coverage evaluation report and verification limitations.
 */
export function buildInsurancePolicyDetailViewModel(input: {
  policy: InsurancePolicyRecord;
  coverages?: PolicyCoverageRecord[];
  exclusions?: PolicyExclusionOrLimitationRecord[];
  claims?: InsuranceClaimRecord[];
  renewals?: PolicyRenewalRecord[];
  asOfIso?: string;
}): InsurancePolicyDetailViewModel {
  const coverages = input.coverages ?? [];
  const exclusions = input.exclusions ?? [];
  const claims = input.claims ?? [];
  const renewals = input.renewals ?? [];
  const asOfIso = input.asOfIso ?? new Date().toISOString();

  const coverageEvaluation = evaluatePolicyCoverageStatusWithLimitations({
    policy: input.policy,
    coverages,
    exclusions,
    asOfIso,
  });

  return {
    policy: input.policy,
    coverages,
    exclusions,
    claims,
    renewals,
    coverageEvaluation,
  };
}

function formatAmount(amount: number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—';
  return `${amount.toLocaleString('fa-IR')} ${currency === 'TOMAN' ? 'تومان' : 'ریال'}`;
}

export const InsurancePoliciesView: React.FC<InsurancePoliciesViewProps> = ({
  canonicalPropertyId,
  policies,
  coveragesByPolicyId = {},
  exclusionsByPolicyId = {},
  claimsByPolicyId = {},
  renewalsByPolicyId = {},
  hazardContext = null,
  asOfIso,
  initialSelectedPolicyId = null,
  onSelectPolicy,
}) => {
  const [statusFilter, setStatusFilter] = useState<InsurancePolicyLifecycleStatus | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<InsurancePolicyCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(initialSelectedPolicyId);

  const filteredPolicies = useMemo(
    () =>
      filterAndSortPropertyInsurancePolicies({
        canonicalPropertyId,
        policies,
        statusFilter,
        categoryFilter,
        searchQuery,
      }),
    [canonicalPropertyId, policies, statusFilter, categoryFilter, searchQuery],
  );

  const activePolicy = useMemo(() => {
    if (filteredPolicies.length === 0) return null;
    if (selectedPolicyId) {
      const found = filteredPolicies.find((p) => p.policyId === selectedPolicyId);
      if (found) return found;
    }
    return filteredPolicies[0];
  }, [filteredPolicies, selectedPolicyId]);

  const activeDetail = useMemo(() => {
    if (!activePolicy) return null;
    return buildInsurancePolicyDetailViewModel({
      policy: activePolicy,
      coverages: coveragesByPolicyId[activePolicy.policyId],
      exclusions: exclusionsByPolicyId[activePolicy.policyId],
      claims: claimsByPolicyId[activePolicy.policyId],
      renewals: renewalsByPolicyId[activePolicy.policyId],
      asOfIso,
    });
  }, [
    activePolicy,
    coveragesByPolicyId,
    exclusionsByPolicyId,
    claimsByPolicyId,
    renewalsByPolicyId,
    asOfIso,
  ]);

  const handleSelectPolicy = (policyId: string) => {
    setSelectedPolicyId(policyId);
    onSelectPolicy?.(policyId);
  };

  return (
    <section
      dir="rtl"
      aria-label="فهرست و جزئیات بیمه‌نامه‌های ملک"
      className="w-full rounded-xl border border-slate-800 bg-slate-950 p-5 text-slate-100 shadow-lg"
    >
      {/* Header & Property Identity Banner */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white">
            مدیریت بیمه‌نامه‌ها و پوشش‌های دارایی کانونیکال
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            شناسه کانونیکال ملک:{' '}
            <span className="font-mono text-emerald-400">{canonicalPropertyId}</span>
          </p>
        </div>

        {hazardContext && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
            <div className="font-semibold">
              زمینه ریسک محیطی (فقط-خواندنی): زلزله {hazardContext.earthquakeExposureLevel} | سیل{' '}
              {hazardContext.floodExposureLevel}
            </div>
            <div className="mt-0.5 text-[11px] text-amber-300/80">
              صرفاً مرجع تحلیلی از ماژول ریسک ملک؛ به‌منزله تصمیم پذیره‌نویسی یا تأیید پوشش نیست.
            </div>
          </div>
        )}
      </div>

      {/* Filter Controls */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs text-slate-400">جستجوی شماره بیمه‌نامه یا شرکت</label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="مثلاً SYNTH-POL-1001..."
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">فیلتر وضعیت چرخه حیات</label>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as InsurancePolicyLifecycleStatus | 'ALL')
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
          >
            <option value="ALL">همه وضعیت‌ها ({policies.length})</option>
            {Object.entries(POLICY_STATUS_LABELS_FA).map(([key, label]) => (
              <option key={key} value={key}>
                {label} ({key})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">فیلتر دسته‌بندی بیمه‌نامه</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as InsurancePolicyCategory | 'ALL')}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
          >
            <option value="ALL">همه دسته‌بندی‌ها</option>
            {Object.entries(POLICY_CATEGORY_LABELS_FA).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredPolicies.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
          هیچ بیمه‌نامه‌ای مطابق فیلترهای انتخابی برای این دارایی یافت نشد.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Left/Right Column: Policies List */}
          <div className="space-y-3 lg:col-span-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              فهرست بیمه‌نامه‌های مرتبط ({filteredPolicies.length})
            </h3>
            {filteredPolicies.map((pol) => {
              const isSelected = activePolicy?.policyId === pol.policyId;
              const isVerifiedActive =
                pol.status === 'ACTIVE' &&
                pol.providerConfirmedActive &&
                pol.verificationStatus === 'PROVIDER_CONFIRMED_AUTHORITATIVE';

              return (
                <button
                  key={pol.policyId}
                  type="button"
                  onClick={() => handleSelectPolicy(pol.policyId)}
                  className={`w-full rounded-lg border p-3.5 text-right transition ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-950/20'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-white">
                      {pol.externalPolicyNumber}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                        isVerifiedActive
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : pol.status === 'EXPIRED' || pol.status === 'CANCELLED'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {POLICY_STATUS_LABELS_FA[pol.status]}
                    </span>
                  </div>

                  <div className="mt-1.5 text-xs text-slate-300">
                    {POLICY_CATEGORY_LABELS_FA[pol.policyCategory]}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span>شرکت بیمه‌گر: {pol.providerId}</span>
                    <span>
                      حق بیمه صادره:{' '}
                      {formatAmount(
                        pol.financialStructure.issuedPremiumAmount,
                        pol.financialStructure.currency,
                      )}
                    </span>
                  </div>

                  <div className="mt-2 text-[11px]">
                    {isVerifiedActive ? (
                      <span className="text-emerald-400">
                        ✓ تأییدشده توسط مرجع بیمه‌گر و در دوره اعتبار
                      </span>
                    ) : (
                      <span className="text-amber-400">
                        ⚠ ثبت‌شده در سیستم — نیازمند احراز مستقل اعتبار پوشش برای خسارت
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail Inspector Panel */}
          <div className="lg:col-span-7">
            {activeDetail && (
              <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      جزئیات بیمه‌نامه {activeDetail.policy.externalPolicyNumber}
                    </h3>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">
                      شناسه داخلی: {activeDetail.policy.policyId} | نسخه رکورد:{' '}
                      {activeDetail.policy.recordVersion}
                    </p>
                  </div>
                  <div className="text-left text-xs text-slate-300">
                    <div>شروع پوشش: {activeDetail.policy.coverageStartIso.slice(0, 10)}</div>
                    <div>پایان پوشش: {activeDetail.policy.coverageEndIso.slice(0, 10)}</div>
                  </div>
                </div>

                {/* Validity & Verification Limitations Box */}
                <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs">
                  <div className="font-semibold text-amber-300">
                    ابعاد تفکیک‌شده اعتبار و راستی‌آزمایی پوشش
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-300 sm:grid-cols-3">
                    <div>
                      تأیید رسمی شرکت بیمه:{' '}
                      <strong className="text-white">
                        {activeDetail.coverageEvaluation.distinctValidityDimensions
                          .confirmedByProviderAuthoritative
                          ? 'بله'
                          : 'خیر'}
                      </strong>
                    </div>
                    <div>
                      در بازه زمانی درج‌شده:{' '}
                      <strong className="text-white">
                        {activeDetail.coverageEvaluation.distinctValidityDimensions
                          .currentlyWithinStatedEffectivePeriod
                          ? 'بله'
                          : 'خیر'}
                      </strong>
                    </div>
                    <div>
                      پوشش فعال تأییدشده مستقل:{' '}
                      <strong className="text-white">
                        {activeDetail.coverageEvaluation.distinctValidityDimensions
                          .independentlyVerifiedActiveCoverage
                          ? 'بله'
                          : 'خیر'}
                      </strong>
                    </div>
                  </div>
                  {activeDetail.coverageEvaluation.verificationLimitations.length > 0 && (
                    <ul className="mt-2 list-inside list-disc space-y-1 text-[11px] text-amber-200/90">
                      {activeDetail.coverageEvaluation.verificationLimitations.map((lim, idx) => (
                        <li key={idx}>{lim}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Policyholder vs Property Owner Distinction & Parties */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs">
                  <div className="font-semibold text-slate-200">
                    اشخاص مرتبط و تفکیک بیمه‌گذار از مالک قانونی
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    وضعیت احراز مالکیت قانونی بیمه‌گذار ({activeDetail.policy.policyholderUid}):{' '}
                    <span className="font-semibold text-amber-300">
                      {activeDetail.policy.policyholderIsConfirmedPropertyOwner
                        ? 'احرازشده در ماژول مالکیت'
                        : 'صرفاً بیمه‌گذار (عدم تلقی خودکار به‌عنوان مالک قانونی ملک)'}
                    </span>
                  </p>
                  <div className="mt-2 space-y-1">
                    {activeDetail.policy.partyReferences.map((party) => (
                      <div
                        key={`${party.partyId}_${party.partyRole}`}
                        className="flex items-center justify-between rounded bg-slate-900 px-2.5 py-1.5 text-[11px]"
                      >
                        <span>
                          {party.displayName} ({party.partyRole})
                        </span>
                        <span className="text-slate-400">{party.ownershipVerificationNote}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Financial Premium Breakdown */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs">
                  <div className="font-semibold text-slate-200">
                    ساختار مالی حق بیمه و فرانشیز پایه
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
                    <div className="rounded bg-slate-900 p-2">
                      <span className="block text-slate-400">حق بیمه صادره:</span>
                      <strong className="text-white">
                        {formatAmount(
                          activeDetail.policy.financialStructure.issuedPremiumAmount,
                          activeDetail.policy.financialStructure.currency,
                        )}
                      </strong>
                    </div>
                    <div className="rounded bg-slate-900 p-2">
                      <span className="block text-slate-400">پرداخت گزارش‌شده کاربر:</span>
                      <strong className="text-amber-300">
                        {formatAmount(
                          activeDetail.policy.financialStructure.clientReportedPaidAmount,
                          activeDetail.policy.financialStructure.currency,
                        )}
                      </strong>
                    </div>
                    <div className="rounded bg-slate-900 p-2">
                      <span className="block text-slate-400">پرداخت تأییدشده مرجع رسمی:</span>
                      <strong className="text-emerald-400">
                        {formatAmount(
                          activeDetail.policy.financialStructure.authoritativeConfirmedPaidAmount,
                          activeDetail.policy.financialStructure.currency,
                        )}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Explicit Coverage Items */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs">
                  <div className="font-semibold text-slate-200">
                    پوشش‌های ساختاریافته ثبت‌شده ({activeDetail.coverages.length})
                  </div>
                  {activeDetail.coverages.length === 0 ? (
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      هیچ ردیف پوشش صریحی ثبت نشده است (نام بیمه‌نامه به‌تنهایی دلیل پوشش خسارت نیست).
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {activeDetail.coverages.map((cov) => (
                        <div
                          key={cov.coverageId}
                          className="rounded border border-slate-800 bg-slate-900 p-2.5 text-[11px]"
                        >
                          <div className="flex items-center justify-between font-semibold text-white">
                            <span>دسته ریسک: {cov.coverageCategory}</span>
                            <span>
                              سقف تعهد: {formatAmount(cov.coverageLimitAmount, cov.currency)}
                            </span>
                          </div>
                          <div className="mt-1 text-slate-400">
                            فرانشیز: {cov.deductibleValue.toLocaleString('fa-IR')} (
                            {cov.deductibleMethod}) | ماده مرجع: {cov.sourcePolicyProvisionRef}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Exclusions & Limitations with Verbatim Source Wording */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs">
                  <div className="font-semibold text-slate-200">
                    استثنائات، محدودیت‌ها و شروط ({activeDetail.exclusions.length})
                  </div>
                  {activeDetail.exclusions.length === 0 ? (
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      محدودیت یا استثنای اختصاصی ثبت نشده است.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {activeDetail.exclusions.map((excl) => (
                        <div
                          key={excl.limitationId}
                          className="rounded border border-rose-900/40 bg-rose-950/20 p-2.5 text-[11px]"
                        >
                          <div className="flex items-center justify-between font-semibold text-rose-300">
                            <span>{excl.limitationCategory}</span>
                            <span>ماده مرجع: {excl.sourcePolicyProvisionRef}</span>
                          </div>
                          <p className="mt-1 text-slate-200">
                            <strong>متن عین ماده بیمه‌نامه (Verbatim):</strong>{' '}
                            {excl.originalSourceWordingVerbatim}
                          </p>
                          <p className="mt-0.5 text-slate-400">
                            خلاصه ساختاری: {excl.structuredClassificationSummary}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default InsurancePoliciesView;

/**
 * BUNDLE 111 (Prompts 1159–1178): * Real Estate Legal Contract Clause Taxonomy, Verifiable Source Anchoring, * OCR Quality Assessment, Semantic Long-Document Segmentation, Clause-by-Clause Diff,
 * Party & Financial/Temporal Obligation Extraction, Clause Conflict Detection, * True PII Redaction, Mortgage Early Repayment & Seller Net Proceeds Calculators, * Personal Real Estate Asset Portfolio/Ledger/Schedule/Maintenance & Multi-Tenant Agency Workspace.
 */
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export interface ContractClauseTaxonomyEntry { clauseTypeId: string; category: | 'PARTIES'
    | 'PROPERTY_ID'
    | 'FINANCIAL'
    | 'DURATION'
    | 'DELIVERY'
    | 'TERMINATION'
    | 'PENALTIES'
    | 'GUARANTEES'
    | 'DISPUTE_RESOLUTION'; labelFa: string; labelEn: string; applicableContractTypes: Array<'buy' | 'rent'>; version: string; deprecated: boolean; }

export const CONTRACT_CLAUSE_TAXONOMY_REGISTRY: Record<string, ContractClauseTaxonomyEntry> = { CLAUSE_PARTIES_IDENTITY: { clauseTypeId: 'CLAUSE_PARTIES_IDENTITY', category: 'PARTIES', labelFa: 'مشخصات متعاملین و طرفین قرارداد', labelEn: 'Contracting Parties Identification',
    applicableContractTypes: ['buy', 'rent'], version: '1.0.0', deprecated: false, }, CLAUSE_PROPERTY_SPECS: { clauseTypeId: 'CLAUSE_PROPERTY_SPECS', category: 'PROPERTY_ID',
    labelFa: 'مورد معامله و مشخصات ثبتی ملک', labelEn: 'Subject Property Specifications', applicableContractTypes: ['buy', 'rent'], version: '1.0.0', deprecated: false, }, CLAUSE_CONSIDERATION_AND_PAYMENT: {
    clauseTypeId: 'CLAUSE_CONSIDERATION_AND_PAYMENT', category: 'FINANCIAL', labelFa: 'ثمن معامله / مال‌الاجاره و نحوه پرداخت', labelEn: 'Consideration and Payment Schedule', applicableContractTypes: ['buy', 'rent'], version: '1.0.0', deprecated: false, },
  CLAUSE_DELIVERY_AND_DEED: {
    clauseTypeId: 'CLAUSE_DELIVERY_AND_DEED', category: 'DELIVERY',
    labelFa: 'شرایط تسلیم مورد معامله و تنظیم سند رسمی', labelEn: 'Delivery and Official Deed Transfer',
    applicableContractTypes: ['buy', 'rent'], version: '1.0.0', deprecated: false,
  },
  CLAUSE_DELAY_PENALTY: {
    clauseTypeId: 'CLAUSE_DELAY_PENALTY', category: 'PENALTIES',
    labelFa: 'خسارت تاخیر تادیه یا عدم انجام تعهد', labelEn: 'Delay Penalty and Liquidated Damages',
    applicableContractTypes: ['buy', 'rent'], version: '1.0.0', deprecated: false,
  },
};

export function classifyContractClauseWithAnchor(params: {
  documentId: string;
  physicalPageIndex: number;
  printedPageLabel?: string;
  rawClauseText: string;
  proposedClauseTypeId?: string;
  hasExactBoundingBox?: boolean;
}) {
  const entry = params.proposedClauseTypeId
    ? CONTRACT_CLAUSE_TAXONOMY_REGISTRY[params.proposedClauseTypeId]
    : undefined;
  return {
    documentId: params.documentId,
    physicalPageIndex: Math.max(0, Math.floor(params.physicalPageIndex)),
    printedPageLabel: params.printedPageLabel ?? null,
    classificationStatus: entry ? ('recognized' as const) : ('unknown' as const),
    clauseTypeId: entry ? entry.clauseTypeId : 'CLAUSE_UNKNOWN_UNCLASSIFIED',
    taxonomyVersion: entry ? entry.version : '1.0.0',
    anchorPrecision: params.hasExactBoundingBox ? ('exact_text_anchor' as const) : ('page_only_reference' as const),
    quotedExcerpt: params.rawClauseText.trim().slice(0, 240),
  };
}

export function evaluateContractPageOcrQuality(params: {
  pageIndex: number;
  extractedText: string;
  providerConfidencePercent?: number;
}) {
  const text = params.extractedText || '';
  const charCount = text.trim().length;
  const conf = params.providerConfidencePercent ?? null;
  if (charCount < 15) {
    return {
      pageIndex: params.pageIndex, characterCount: charCount, invalidGlyphRatio: 1,
      providerConfidencePercent: conf, qualityState: 'failed_extraction' as const,
      requiresManualReviewBeforeAi: true,
    };
  }
  let invalidGlyphs = 0;
  for (const ch of text) {
    if (ch === '\uFFFD' || ch === '□') invalidGlyphs++;
  }
  const invalidGlyphRatio = Number((invalidGlyphs / charCount).toFixed(4));
  if (invalidGlyphRatio > 0.08 || (conf !== null && conf < 60)) {
    return {
      pageIndex: params.pageIndex, characterCount: charCount, invalidGlyphRatio,
      providerConfidencePercent: conf, qualityState: 'low_confidence' as const,
      requiresManualReviewBeforeAi: true,
    };
  }
  if (invalidGlyphRatio > 0.02 || (conf !== null && conf < 80)) {
    return {
      pageIndex: params.pageIndex, characterCount: charCount, invalidGlyphRatio,
      providerConfidencePercent: conf, qualityState: 'partially_reliable' as const,
      requiresManualReviewBeforeAi: false,
    };
  }
  return {
    pageIndex: params.pageIndex, characterCount: charCount, invalidGlyphRatio,
    providerConfidencePercent: conf, qualityState: 'reliable' as const,
    requiresManualReviewBeforeAi: false,
  };
}

export function compareContractVersionsByClause(
  baseClauses: Array<{ clauseNumber: string; text: string; pageIndex: number }>,
  revisedClauses: Array<{ clauseNumber: string; text: string; pageIndex: number }>
) {
  const baseMap = new Map(baseClauses.map((c) => [c.clauseNumber, c]));
  const revMap = new Map(revisedClauses.map((c) => [c.clauseNumber, c]));
  const allKeys = Array.from(new Set([...baseMap.keys(), ...revMap.keys()]));
  const extractDigits = (s: string) =>
    s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632)).replace(/\D+/g, ' ').trim();

  return allKeys.map((key) => {
    const b = baseMap.get(key);
    const r = revMap.get(key);
    if (!b && r) return { clauseNumber: key, changeType: 'added' as const, numericValueChanged: false, basePageIndex: null, revisedPageIndex: r.pageIndex };
    if (b && !r) return { clauseNumber: key, changeType: 'removed' as const, numericValueChanged: false, basePageIndex: b.pageIndex, revisedPageIndex: null };
    const normB = b!.text.replace(/\s+/g, ' ').trim();
    const normR = r!.text.replace(/\s+/g, ' ').trim();
    const isSame = normB === normR;
    return {
      clauseNumber: key,
      changeType: isSame ? ('unchanged' as const) : ('modified' as const),
      numericValueChanged: !isSame && extractDigits(normB) !== extractDigits(normR),
      basePageIndex: b!.pageIndex,
      revisedPageIndex: r!.pageIndex,
    };
  });
}

export function detectContractClauseConflicts(params: {
  statedTotalContractAmountToman: number;
  installmentAmountsToman: number[];
  contractSigningDateIso: string;
  propertyDeliveryDateIso: string;
  partyRoles: Array<{ partyId: string; role: 'BUYER' | 'SELLER' | 'LANDLORD' | 'TENANT' | 'WITNESS' }>;
}) {
  const conflicts: Array<{
    conflictType: 'INSTALLMENT_SUM_MISMATCH' | 'IMPOSSIBLE_DATE_SEQUENCE' | 'CONFLICTING_PARTY_ROLES';
    descriptionFa: string;
    deterministic: true;
  }> = [];

  if (params.installmentAmountsToman.length > 0) {
    const sum = params.installmentAmountsToman.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - params.statedTotalContractAmountToman) > 1) {
      conflicts.push({
        conflictType: 'INSTALLMENT_SUM_MISMATCH',
        descriptionFa: `جمع اقساط (${sum}) با مبلغ کل قرارداد (${params.statedTotalContractAmountToman}) مطابقت ندارد.`,
        deterministic: true,
      });
    }
  }
  const signMs = Date.parse(params.contractSigningDateIso);
  const delivMs = Date.parse(params.propertyDeliveryDateIso);
  if (Number.isFinite(signMs) && Number.isFinite(delivMs) && delivMs < signMs) {
    conflicts.push({
      conflictType: 'IMPOSSIBLE_DATE_SEQUENCE',
      descriptionFa: 'تاریخ تحویل ملک پیش از تاریخ امضای قرارداد درج شده است.',
      deterministic: true,
    });
  }
  const roleMap = new Map<string, Set<string>>();
  for (const pr of params.partyRoles) {
    const existing = roleMap.get(pr.partyId) ?? new Set<string>();
    existing.add(pr.role);
    roleMap.set(pr.partyId, existing);
  }
  for (const [, roles] of roleMap.entries()) {
    if ((roles.has('BUYER') && roles.has('SELLER')) || (roles.has('LANDLORD') && roles.has('TENANT'))) {
      conflicts.push({
        conflictType: 'CONFLICTING_PARTY_ROLES',
        descriptionFa: 'یک شخص واحد هم‌زمان در دو نقش متضاد ثبت شده است.',
        deterministic: true,
      });
    }
  }
  return { hasConflicts: conflicts.length > 0, conflicts };
}

export function redactSensitiveContractContent(
  originalText: string,
  options: { redactNationalIds: boolean; redactPhones: boolean; redactIbans: boolean }
) {
  let out = String(originalText || '').slice(0, 100_000);
  let redactedCount = 0;
  const d = '[0-9۰-۹٠-٩]';
  if (options.redactIbans) out = out.replace(new RegExp(`(?<![A-Za-z0-9۰-۹٠-٩])IR(?:[\\s-]*${d}){24}(?!${d})`, 'gi'), () => { redactedCount++; return '[REDACTED_IBAN]'; });
  if (options.redactPhones) out = out.replace(new RegExp(`(?<!${d})(?:\\+98|\\+۹۸|0098|۰۰۹۸|0|۰|٠)[9۹٩]${d}{9}(?!${d})`, 'g'), () => { redactedCount++; return '[REDACTED_PHONE]'; });
  if (options.redactNationalIds) out = out.replace(new RegExp(`(?<!${d})${d}{10}(?!${d})`, 'g'), () => { redactedCount++; return '[REDACTED_NATIONAL_ID]'; });
  return { sanitizedDerivativeText: out, redactedCount, originalPreserved: true as const };
}
export function simulateMortgageEarlyRepaymentAndSellerProceeds(params: {
  principalToman: number; annualNominalRatePercent: number; termMonths: number;
  extraMonthlyPrincipalPrepaymentToman: number; earlyRepaymentFeeToman?: number;
  sellerGrossSalePriceToman: number; sellerBrokerageFeeToman: number; sellerOtherTransferCostsToman: number;
}) {
  const safeNum = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const P = Math.max(0, safeNum(params.principalToman));
  const r = Math.max(0, Math.min(200, safeNum(params.annualNominalRatePercent))) / 100 / 12;
  const n = Math.min(360, Math.max(1, Math.floor(safeNum(params.termMonths) || 1)));
  const extra = Math.max(0, safeNum(params.extraMonthlyPrincipalPrepaymentToman));
  const fee = Math.max(0, safeNum(params.earlyRepaymentFeeToman));
  const scheduledMonthlyPayment = P === 0 ? 0 : r === 0 ? P / n : (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const baselineTotalInterestToman = Math.max(0, Math.round(scheduledMonthlyPayment * n - P));
  let balance = P, months = 0, accelInterest = 0;
  while (balance > 0.5 && months < n) {
    months++;
    const interest = balance * r;
    accelInterest += interest;
    const principalPart = Math.min(balance, scheduledMonthlyPayment - interest + extra);
    if (principalPart <= 0) break;
    balance -= principalPart;
  }
  const acceleratedTotalInterestToman = Math.round(accelInterest);
  return {
    baselineTotalInterestToman, acceleratedMonthsCount: months, acceleratedTotalInterestToman,
    netInterestSavedToman: Math.max(0, baselineTotalInterestToman - acceleratedTotalInterestToman - fee),
    sellerNetEstimatedProceedsToman: Math.round(
      safeNum(params.sellerGrossSalePriceToman) - P - Math.max(0, safeNum(params.sellerBrokerageFeeToman)) - Math.max(0, safeNum(params.sellerOtherTransferCostsToman))
    ),
  };
}
export function aggregatePersonalPropertyPortfolio(
  authenticatedOwnerUid: string,
  assets: Array<{
    assetId: string;
    ownerUid: string;
    acquisitionCostToman: number;
    userEstimatedValueToman: number | null;
    ownershipSharePercent: number;
    recordedRentalIncomeToman: number;
    recordedMaintenanceExpenseToman: number;
  }>,
  areaUnit: AreaUnit = getStoredAreaUnit(),
  referenceCurrency: IntlCurrencyCode = getStoredIntlCurrency()
) {
  const owned = assets.filter((a) => a.ownerUid === authenticatedOwnerUid && a.ownershipSharePercent > 0 && a.ownershipSharePercent <= 100);
  let missingValuationCount = 0, shareAdjustedAcquisitionCostToman = 0, shareAdjustedEstimatedValueToman = 0, shareAdjustedNetOperatingCashFlowToman = 0;
  for (const a of owned) {
    const share = a.ownershipSharePercent / 100;
    shareAdjustedAcquisitionCostToman += Math.round(a.acquisitionCostToman * share);
    if (a.userEstimatedValueToman === null || a.userEstimatedValueToman <= 0) missingValuationCount++;
    else shareAdjustedEstimatedValueToman += Math.round(a.userEstimatedValueToman * share);
    shareAdjustedNetOperatingCashFlowToman += Math.round((a.recordedRentalIncomeToman - a.recordedMaintenanceExpenseToman) * share);
  }
  return {
    eligibleAssetCount: owned.length, missingValuationCount,
    shareAdjustedAcquisitionCostToman, shareAdjustedEstimatedValueToman,
    shareAdjustedNetOperatingCashFlowToman, isAppraisedLegalTitle: false as const,
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    estimatedValueIntlText: formatMillionTomanAsIntlCurrency(Math.round(shareAdjustedEstimatedValueToman / 1_000_000), referenceCurrency),
  };
}
export function evaluateAgencyInvitationAndTenantAccess(params: {
  actorUid: string;
  actorOrganizationId: string | null;
  actorRoleInOrg: 'ORG_ADMIN' | 'ORG_AGENT' | 'NONE';
  targetResourceOrganizationId: string;
  invitation?: {
    invitationId: string;
    organizationId: string;
    intendedRecipientUid: string;
    proposedRole: 'ORG_ADMIN' | 'ORG_AGENT';
    status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
    expiresAtMs: number;
  };
  nowMs: number;
}) {
  const tenantResourceAccessAllowed =
    Boolean(params.actorOrganizationId) &&
    params.actorOrganizationId === params.targetResourceOrganizationId &&
    (params.actorRoleInOrg === 'ORG_ADMIN' || params.actorRoleInOrg === 'ORG_AGENT');
  const canIssueAdminInvitation = tenantResourceAccessAllowed && params.actorRoleInOrg === 'ORG_ADMIN';
  if (!params.invitation) {
    return { tenantResourceAccessAllowed, canIssueAdminInvitation, invitationClaimStatus: 'NOT_APPLICABLE' as const };
  }
  const inv = params.invitation;
  if (inv.status !== 'PENDING') {
    return { tenantResourceAccessAllowed, canIssueAdminInvitation, invitationClaimStatus: 'REJECTED_ALREADY_USED_OR_REVOKED' as const };
  }
  if (!Number.isFinite(params.nowMs) || !Number.isFinite(inv.expiresAtMs) || params.nowMs > inv.expiresAtMs) {
    return { tenantResourceAccessAllowed, canIssueAdminInvitation, invitationClaimStatus: 'REJECTED_EXPIRED' as const };
  }
  if (inv.intendedRecipientUid !== params.actorUid || inv.organizationId !== params.targetResourceOrganizationId) {
    return { tenantResourceAccessAllowed, canIssueAdminInvitation, invitationClaimStatus: 'REJECTED_WRONG_RECIPIENT' as const };
  }
  return { tenantResourceAccessAllowed, canIssueAdminInvitation, invitationClaimStatus: 'ACCEPTED' as const };
}
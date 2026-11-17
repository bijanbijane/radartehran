/** @file server/modules/legal-regulatory/ecosystemLegalGovernance.ts — Stage 19 Legal, IP, Privacy, Consent, Takedown & Regulatory Matrix */
import crypto from 'node:crypto';
import { sanitizeInput } from '../../../src/utils/security';

export interface PolicyDocumentVersion {
  docType: 'PRIVACY_POLICY' | 'TERMS_OF_SERVICE' | 'IP_AND_UGC_LICENSE' | 'PARTNER_DATA_DPA';
  version: string;
  effectiveAtIso: string;
  requiresExplicitReconsent: boolean;
  summaryFa: string;
}

export interface ConsentRecord {
  id: string;
  uid: string;
  docType: PolicyDocumentVersion['docType'];
  version: string;
  granted: boolean;
  recordedAtIso: string;
}

export interface TakedownRequestRecord {
  id: string;
  claimType: 'COPYRIGHT_DMCA' | 'PRIVACY_PII' | 'DEFAMATION' | 'UNLICENSED_DATA';
  targetId: string;
  requesterRef: string;
  reasonFa: string;
  status: 'RECEIVED' | 'LEGAL_HOLD' | 'REMOVED' | 'REJECTED';
  createdAtIso: string;
}

export interface RegulatoryCheckItem {
  requirementCode: string;
  jurisdictionScope: string;
  status: 'IMPLEMENTED_IN_CODE' | 'REQUIRES_LEGAL_COUNSEL';
  counselReviewRequired: boolean;
  notesFa: string;
}

export class EcosystemLegalGovernanceService {
  private readonly policyVersions: PolicyDocumentVersion[] = [
    { docType: 'PRIVACY_POLICY', version: '2026.11-v1', effectiveAtIso: '2026-11-01T00:00:00.000Z', requiresExplicitReconsent: true, summaryFa: 'تفکیک PII، نگهداری ۹۰ روزه لید خریدار و حذف بدون قید.' },
    { docType: 'TERMS_OF_SERVICE', version: '2026.11-v1', effectiveAtIso: '2026-11-01T00:00:00.000Z', requiresExplicitReconsent: true, summaryFa: 'سلب مسئولیت مشاوره مالی قطعی و حدود استفاده از داده‌های محله.' },
    { docType: 'IP_AND_UGC_LICENSE', version: '2026.11-v1', effectiveAtIso: '2026-11-01T00:00:00.000Z', requiresExplicitReconsent: false, summaryFa: 'حفظ مالکیت نویسنده بر محتوا با مجوز نمایش غیرانحصاری در پلتفرم.' },
    { docType: 'PARTNER_DATA_DPA', version: '2026.11-v1', effectiveAtIso: '2026-11-01T00:00:00.000Z', requiresExplicitReconsent: true, summaryFa: 'الزام مجوز کتبی منبع پیش از ورود داده تجاری به موتور قیمت‌گذاری.' },
  ];
  private readonly consents: ConsentRecord[] = [];
  private readonly takedowns: TakedownRequestRecord[] = [];
  private readonly activeLegalHolds = new Map<string, { targetId: string; reasonFa: string; createdAtIso: string }>();

  getLegalReadinessOverview() {
    const regulatoryMatrix: RegulatoryCheckItem[] = [
      { requirementCode: 'DATA-MINIMIZATION-PII', jurisdictionScope: 'Jurisdiction-Agnostic', status: 'IMPLEMENTED_IN_CODE', counselReviewRequired: false, notesFa: 'پالایش موبایل/ایمیل/شبا در تله‌متری و تفکیک حساب و محتوای عمومی.' },
      { requirementCode: 'FINANCIAL-VALUATION-DISCLAIMER', jurisdictionScope: 'Local Commercial Law', status: 'REQUIRES_LEGAL_COUNSEL', counselReviewRequired: true, notesFa: 'متن نهایی سلب مسئولیت برآورد قیمت هدونیک نیازمند تایید وکیل است.' },
      { requirementCode: 'REAL-ESTATE-BROKER-LICENSING', jurisdictionScope: 'Iran Syndicate & Trade Rules', status: 'REQUIRES_LEGAL_COUNSEL', counselReviewRequired: true, notesFa: 'تفکیک انتشار آگهی تحلیلی از دلالی رسمی نیازمند تایید حقوقی محلی است.' },
      { requirementCode: 'TAKEDOWN-AND-LEGAL-HOLD', jurisdictionScope: 'Jurisdiction-Agnostic', status: 'IMPLEMENTED_IN_CODE', counselReviewRequired: false, notesFa: 'مسیر ثبت اخطار حقوقی و قفل نگهداری داده پیش از پاک‌سازی فعال است.' },
    ];
    return {
      readinessStatus: 'LEGAL_READY_WITH_LIMITATIONS',
      policyVersions: this.policyVersions,
      activeLegalHoldsCount: this.activeLegalHolds.size,
      takedownsCount: this.takedowns.length,
      regulatoryMatrix,
    };
  }

  recordConsent(params: { uid: string; docType: PolicyDocumentVersion['docType']; version: string; granted: boolean }): ConsentRecord {
    const rec: ConsentRecord = {
      id: `cns_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      uid: params.uid,
      docType: params.docType,
      version: params.version,
      granted: params.granted,
      recordedAtIso: new Date().toISOString(),
    };
    this.consents.push(rec);
    return rec;
  }

  submitTakedown(params: {
    claimType: TakedownRequestRecord['claimType'];
    targetId: string;
    requesterRef: string;
    reasonFa: string;
  }): TakedownRequestRecord {
    const rec: TakedownRequestRecord = {
      id: `tkd_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      claimType: params.claimType,
      targetId: sanitizeInput(params.targetId, 80),
      requesterRef: sanitizeInput(params.requesterRef, 80),
      reasonFa: sanitizeInput(params.reasonFa, 280),
      status: 'RECEIVED',
      createdAtIso: new Date().toISOString(),
    };
    this.takedowns.unshift(rec);
    return rec;
  }

  placeLegalHold(targetId: string, reasonFa: string): { targetId: string; reasonFa: string; createdAtIso: string } {
    const hold = {
      targetId: sanitizeInput(targetId, 80),
      reasonFa: sanitizeInput(reasonFa, 200),
      createdAtIso: new Date().toISOString(),
    };
    this.activeLegalHolds.set(hold.targetId, hold);
    return hold;
  }

  isUnderLegalHold(targetId: string): boolean {
    return this.activeLegalHolds.has(targetId);
  }
}

export const defaultEcosystemLegalGovernance = new EcosystemLegalGovernanceService();

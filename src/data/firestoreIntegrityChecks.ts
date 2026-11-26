/**
 * @file src/data/firestoreIntegrityChecks.ts
 * @description بررسی‌های پیشرفته یکپارچگی رابطه‌ای، اقتصادی و انطباق با قوانین امنیتی (firestore.rules):
 * ۱. شناسایی اسناد تکراری یا متناقض در neighborhoodOverrides (مثلاً وجود همزمان 14 و hood_14 یا عدم تطابق docId با hoodId)
 * ۲. شناسایی ناهنجاری نسبت اقتصادی رهن به خرید (rahn80m نسبت به buyPerSqm * 80)
 * ۳. شناسایی حامیان منقضی‌شده (Expired Sponsors) که هنوز وضعیت فعال دارند
 * ۴. بررسی انطباق فرمت موبایل (09xxxxxxxxx) و شناسه قطعی داکیومنت‌ها ({userId}_hood_{hoodId}) با firestore.rules
 */

import type { BuyerAlertLeadItem, Neighborhood, SponsorCrmRequestItem } from './neighborhoods';
import type { RawDocumentAuditSample } from './firestoreDataAuditor';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit';

export type IntegrityIssueCategory =
  | 'DUPLICATE_OVERRIDE_DOC'
  | 'DOC_ID_MISMATCH'
  | 'ECONOMIC_RATIO_ANOMALY'
  | 'EXPIRED_SPONSOR_RECORD'
  | 'RULES_FORMAT_VIOLATION';

export interface DatabaseIntegrityIssue {
  id: string;
  category: IntegrityIssueCategory;
  collection: string;
  docId: string;
  hoodId: number | null;
  summaryFa: string;
  detailFa: string;
  displayAreaUnitLabel?: string;
  economicBuy80mIntlText?: string;
}

const IRAN_MOBILE_REGEX = /^09[0-9]{9}$/;

/**
 * بررسی جامع یکپارچگی رابطه‌ای، نسبت‌های اقتصادی مسکن و تطابق با قیود firestore.rules.
 */
export function checkDatabaseRelationalAndSchemaIntegrity(params: {
  neighborhoods: readonly Neighborhood[];
  sponsorRequests?: readonly SponsorCrmRequestItem[];
  buyerLeads?: readonly BuyerAlertLeadItem[];
  extraSamples?: readonly RawDocumentAuditSample[];
  nowMs?: number;
  areaUnit?: AreaUnit;
  referenceCurrency?: IntlCurrencyCode;
}): DatabaseIntegrityIssue[] {
  const issues: DatabaseIntegrityIssue[] = [];
  const nowMs = params.nowMs ?? Date.now();
  const displayAreaUnitLabel = formatAreaUnitLabel(params.areaUnit ?? getStoredAreaUnit());
  const referenceCurrency = params.referenceCurrency ?? getStoredIntlCurrency();
  const overrideDocIdsByHood = new Map<number, string[]>();

  // ۱. بررسی ناهنجاری نسبت رهن به قیمت خرید در محله‌ها و انقضای حامیان محله
  for (const hood of params.neighborhoods || []) {
    const total80mBuy = (hood.buyPerSqm || 0) * 80;
    if (total80mBuy > 0 && hood.rahn80m > 0) {
      const ratio = hood.rahn80m / total80mBuy;
      if (ratio > 0.8 || ratio < 0.02) {
        const economicBuy80mIntlText = formatMillionTomanAsIntlCurrency(total80mBuy, referenceCurrency);
        issues.push({
          id: `econ:neighborhoods:hood_${hood.id}`,
          category: 'ECONOMIC_RATIO_ANOMALY',
          collection: 'neighborhoods',
          docId: `hood_${hood.id}`,
          hoodId: hood.id,
          summaryFa: `نسبت غیرمتعارف رهن به قیمت خرید در محله «${hood.name}» (${Math.round(ratio * 100)}٪)`,
          detailFa: `رهن ۸۰ متری (${hood.rahn80m}M) نسبت به ارزش خرید ۸۰ متری (${total80mBuy}M | ${economicBuy80mIntlText}) خارج از دامنه اقتصادی متعارف [۲٪ تا ۸۰٪] است.`,
          displayAreaUnitLabel,
          economicBuy80mIntlText,
        });
      }
    }

    if (hood.sponsor?.expiresAtIso) {
      const expMs = Date.parse(hood.sponsor.expiresAtIso);
      if (Number.isFinite(expMs) && expMs <= nowMs) {
        issues.push({
          id: `expired:neighborhoods:hood_${hood.id}`,
          category: 'EXPIRED_SPONSOR_RECORD',
          collection: 'neighborhoods',
          docId: `hood_${hood.id}`,
          hoodId: hood.id,
          summaryFa: `انقضای مهلت قرارداد حامی فعال در محله «${hood.name}»`,
          detailFa: `تاریخ انقضای حامی (${hood.sponsor.name}) برابر ${hood.sponsor.expiresAtIso} بوده و منقضی شده است.`,
        });
      }
    }
  }

  // ۲. بررسی درخواست‌های CRM حامیان (sponsorRequests)
  for (const req of params.sponsorRequests || []) {
    if (req.status === 'approved' && req.expiresAtIso) {
      const expMs = Date.parse(req.expiresAtIso);
      if (Number.isFinite(expMs) && expMs <= nowMs) {
        issues.push({
          id: `expired:sponsorRequests:${req.id}`,
          category: 'EXPIRED_SPONSOR_RECORD',
          collection: 'sponsorRequests',
          docId: String(req.id),
          hoodId: req.hoodId,
          summaryFa: `قرارداد تاییدشده منقضی در CRM حامیان (${req.agencyName})`,
          detailFa: `وضعیت رکورد همچنان approved است اما تاریخ انقضا (${req.expiresAtIso}) گذشته است.`,
        });
      }
    }
  }

  // ۳. بررسی سرنخ‌های خریداران (buyerAlerts) از نظر فرمت شماره موبایل firestore.rules
  for (const lead of params.buyerLeads || []) {
    if (typeof lead.phone === 'string' && !IRAN_MOBILE_REGEX.test(lead.phone)) {
      issues.push({
        id: `rules:buyerAlerts:${lead.id}:phone`,
        category: 'RULES_FORMAT_VIOLATION',
        collection: 'buyerAlerts',
        docId: String(lead.id),
        hoodId: lead.hoodId,
        summaryFa: `عدم تطابق شماره موبایل خریدار (${lead.fullName}) با الگوی firestore.rules`,
        detailFa: `مقدار phone="${lead.phone}" با الگوی اجباری ^09[0-9]{9}$ در قواعد امنیتی Firestore مطابقت ندارد.`,
      });
    }
  }

  // ۴. بررسی داکیومنت‌های خام کلود / نمونه‌های اسکن‌شده
  for (const sample of params.extraSamples || []) {
    const rawHoodId = sample.data.hoodId;
    const hoodId = typeof rawHoodId === 'number' && Number.isInteger(rawHoodId) && rawHoodId >= 1 && rawHoodId <= 999 ? rawHoodId : null;

    if (sample.collection === 'neighborhoodOverrides') {
      const docIdMatch = /^(?:hood_)?([1-9]\d{0,2})$/.exec(String(sample.docId || '').trim());
      const parsedFromDocId = docIdMatch ? Number.parseInt(docIdMatch[1], 10) : NaN;
      if (!docIdMatch) {
        issues.push({
          id: `rules:neighborhoodOverrides:${sample.docId}:docId`,
          category: 'RULES_FORMAT_VIOLATION',
          collection: 'neighborhoodOverrides',
          docId: sample.docId,
          hoodId,
          summaryFa: `فرمت نامعتبر شناسه سند بازنویسی محله (${sample.docId})`,
          detailFa: `شناسه سند "${sample.docId}" با الگوی اجباری ^(?:hood_)?[1-9][0-9]{0,2}$ در قواعد امنیتی Firestore مطابقت ندارد.`,
        });
      } else if (hoodId !== null && parsedFromDocId !== hoodId) {
        issues.push({
          id: `mismatch:neighborhoodOverrides:${sample.docId}`,
          category: 'DOC_ID_MISMATCH',
          collection: 'neighborhoodOverrides',
          docId: sample.docId,
          hoodId,
          summaryFa: `عدم تطابق شناسه سند (${sample.docId}) با فیلد داخلی hoodId (${hoodId})`,
          detailFa: `قواعد امنیتی Firestore ایجاب می‌کند شناسه سند دقیقاً برابر "${hoodId}" یا "hood_${hoodId}" باشد.`,
        });
      }
      const effectiveHoodId = hoodId ?? (Number.isInteger(parsedFromDocId) ? parsedFromDocId : null);
      if (effectiveHoodId !== null && effectiveHoodId >= 1 && effectiveHoodId <= 999) {
        const list = overrideDocIdsByHood.get(effectiveHoodId) || [];
        list.push(sample.docId);
        overrideDocIdsByHood.set(effectiveHoodId, list);
      }

      const buyPerSqm = Number(sample.data.buyPerSqm);
      const rahn80m = Number(sample.data.rahn80m);
      if (Number.isFinite(buyPerSqm) && buyPerSqm > 0 && Number.isFinite(rahn80m) && rahn80m > 0) {
        const ratio = rahn80m / (buyPerSqm * 80);
        if (ratio > 0.8 || ratio < 0.02) {
          issues.push({
            id: `econ:neighborhoodOverrides:${sample.docId}`,
            category: 'ECONOMIC_RATIO_ANOMALY',
            collection: 'neighborhoodOverrides',
            docId: sample.docId,
            hoodId: effectiveHoodId,
            summaryFa: `نسبت غیرمتعارف رهن به خرید در بازنویسی محله (${Math.round(ratio * 100)}٪)`,
            detailFa: `رهن ۸۰ متری (${rahn80m}M) در مقایسه با قیمت خرید ۸۰ متری (${buyPerSqm * 80}M) غیرعادی است.`,
          });
        }
      }
    }

    if ((sample.collection === 'votes' || sample.collection === 'buyerAlerts') && typeof sample.data.userId === 'string' && hoodId !== null) {
      const expectedDocId = `${sample.data.userId}_hood_${hoodId}`;
      if (!sample.docId.startsWith('sim_') && sample.docId !== expectedDocId) {
        issues.push({
          id: `mismatch:${sample.collection}:${sample.docId}`,
          category: 'DOC_ID_MISMATCH',
          collection: sample.collection,
          docId: sample.docId,
          hoodId,
          summaryFa: `عدم تطابق شناسه سند با کلید ترکیبی استاندارد در ${sample.collection}`,
          detailFa: `شناسه فعلی "${sample.docId}" با الگوی اجباری "${expectedDocId}" در firestore.rules همخوانی ندارد.`,
        });
      }
    }

    if (sample.collection === 'buyerAlerts' && typeof sample.data.phone === 'string' && !IRAN_MOBILE_REGEX.test(sample.data.phone)) {
      issues.push({
        id: `rules:buyerAlerts:${sample.docId}:phone`,
        category: 'RULES_FORMAT_VIOLATION',
        collection: 'buyerAlerts',
        docId: sample.docId,
        hoodId,
        summaryFa: `شماره تماس نامعتبر در سرنخ خریدار (${sample.docId})`,
        detailFa: `فیلد phone="${sample.data.phone}" دارای ارقام فارسی یا فرمت غیرموبایل است و توسط firestore.rules رد می‌شود.`,
      });
    }

    if (sample.collection === 'sponsorRequests' && sample.data.status === 'approved' && typeof sample.data.expiresAtIso === 'string') {
      const expMs = Date.parse(sample.data.expiresAtIso);
      if (Number.isFinite(expMs) && expMs <= nowMs) {
        issues.push({
          id: `expired:sponsorRequests:${sample.docId}`,
          category: 'EXPIRED_SPONSOR_RECORD',
          collection: 'sponsorRequests',
          docId: sample.docId,
          hoodId,
          summaryFa: `قرارداد تاییدشده منقضی در CRM حامیان (${sample.docId})`,
          detailFa: `وضعیت رکورد همچنان approved است اما تاریخ انقضا (${sample.data.expiresAtIso}) گذشته است.`,
        });
      }
    }
  }

  for (const [hoodId, docIds] of overrideDocIdsByHood.entries()) {
    if (docIds.length > 1) {
      issues.push({
        id: `dup:neighborhoodOverrides:hood_${hoodId}`,
        category: 'DUPLICATE_OVERRIDE_DOC',
        collection: 'neighborhoodOverrides',
        docId: docIds.join(' , '),
        hoodId,
        summaryFa: `اسناد تکراری (Shadowed Overrides) برای محله شناسه ${hoodId}`,
        detailFa: `اسناد [${docIds.join(' و ')}] همزمان به محله ${hoodId} اشاره می‌کنند که موجب بازنویسی ناخواسته قیمت در کش می‌شود.`,
      });
    }
  }

  return issues;
}

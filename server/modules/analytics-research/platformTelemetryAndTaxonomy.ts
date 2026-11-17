/** @file server/modules/analytics-research/platformTelemetryAndTaxonomy.ts — Stage 8 Governed Event Taxonomy, PII Scrubber & K-Anonymous Rollups */
import crypto from 'node:crypto';

export type TelemetryRetentionBucket = 'OPERATIONAL_SHORT_7D' | 'PRODUCT_AGGREGATED_90D';

export interface TelemetryEventSchema {
  eventCode: string;
  domain: 'navigation' | 'search' | 'community' | 'valuation' | 'moderation' | 'automation';
  retentionBucket: TelemetryRetentionBucket;
  descriptionFa: string;
}

export const OFFICIAL_EVENT_TAXONOMY: readonly TelemetryEventSchema[] = [
  { eventCode: 'radar.map.neighborhood_select', domain: 'navigation', retentionBucket: 'PRODUCT_AGGREGATED_90D', descriptionFa: 'انتخاب محله روی نقشه' },
  { eventCode: 'radar.search.query_executed', domain: 'search', retentionBucket: 'PRODUCT_AGGREGATED_90D', descriptionFa: 'اجرای جست‌وجوی محله یا آگهی' },
  { eventCode: 'radar.community.tab_view', domain: 'community', retentionBucket: 'PRODUCT_AGGREGATED_90D', descriptionFa: 'بازدید از تب‌های جامعه کاربران' },
  { eventCode: 'radar.valuation.hedonic_estimate', domain: 'valuation', retentionBucket: 'PRODUCT_AGGREGATED_90D', descriptionFa: 'اجرای محاسبه ارزش هدونیک' },
  { eventCode: 'radar.moderation.case_action', domain: 'moderation', retentionBucket: 'OPERATIONAL_SHORT_7D', descriptionFa: 'ثبت اقدام نظارتی در پرونده ایمنی' },
  { eventCode: 'radar.automation.workflow_step', domain: 'automation', retentionBucket: 'OPERATIONAL_SHORT_7D', descriptionFa: 'اجرای گام گردش‌کار خودکار' },
];

const TAXONOMY_SET = new Set(OFFICIAL_EVENT_TAXONOMY.map((e) => e.eventCode));

export function scrubTelemetryPii(input: string): string {
  return String(input || '')
    .replace(/[0۰٠][9۹٩][0-9۰-۹٠-٩]{9}/g, '[REDACTED_MOBILE]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
    .replace(/IR\d{24}/gi, '[REDACTED_IBAN]')
    .replace(/\b\d{10,16}\b/g, '[REDACTED_NUMERIC_ID]')
    .slice(0, 240);
}

export function hashShortLivedSession(rawSessionHint: string, rotationBucket = new Date().toISOString().slice(0, 10)): string {
  return crypto.createHash('sha256').update(`${rotationBucket}:${rawSessionHint}`).digest('hex').slice(0, 16);
}

export interface TelemetryIngestRecord {
  eventCode: string;
  sessionHash: string;
  neighborhoodId?: number;
  durationScore0To10: number;
  retentionBucket: TelemetryRetentionBucket;
  sanitizedLabel: string;
  suspectedBot: boolean;
  recordedAtMs: number;
}

export class PlatformTelemetryTaxonomyService {
  private readonly records: TelemetryIngestRecord[] = [];
  private readonly sessionWindowCounts = new Map<string, { count: number; windowStartMs: number }>();

  ingestEvent(params: {
    eventCode: string;
    sessionHint: string;
    neighborhoodId?: number;
    engagementScore?: number;
    label?: string;
    nowMs?: number;
  }): { accepted: boolean; reason?: string; record?: TelemetryIngestRecord } {
    if (!TAXONOMY_SET.has(params.eventCode)) {
      return { accepted: false, reason: 'UNKNOWN_EVENT_TAXONOMY_CODE' };
    }
    const schema = OFFICIAL_EVENT_TAXONOMY.find((e) => e.eventCode === params.eventCode)!;
    const nowMs = params.nowMs ?? Date.now();
    const sessionHash = hashShortLivedSession(params.sessionHint || 'anon');

    const prev = this.sessionWindowCounts.get(sessionHash);
    const windowValid = prev && nowMs - prev.windowStartMs < 10_000;
    const nextCount = windowValid ? prev.count + 1 : 1;
    this.sessionWindowCounts.set(sessionHash, {
      count: nextCount,
      windowStartMs: windowValid ? prev!.windowStartMs : nowMs,
    });
    const suspectedBot = nextCount > 25;

    const rawScore = Number.isFinite(params.engagementScore) ? Number(params.engagementScore) : 5;
    const clampedScore = Math.max(0, Math.min(10, Math.round(rawScore * 10) / 10));

    const rec: TelemetryIngestRecord = {
      eventCode: params.eventCode,
      sessionHash,
      neighborhoodId: typeof params.neighborhoodId === 'number' ? params.neighborhoodId : undefined,
      durationScore0To10: clampedScore,
      retentionBucket: schema.retentionBucket,
      suspectedBot,
      sanitizedLabel: scrubTelemetryPii(params.label || ''),
      recordedAtMs: nowMs,
    };
    this.records.push(rec);
    if (this.records.length > 2000) this.records.shift();
    return { accepted: true, record: rec };
  }

  getKAnonymousRollup(minK = 5) {
    const byEvent = new Map<string, { sessions: Set<string>; scores: number[]; botFlagged: number; bucket: TelemetryRetentionBucket }>();
    for (const r of this.records) {
      const entry = byEvent.get(r.eventCode) || {
        sessions: new Set<string>(),
        scores: [],
        botFlagged: 0,
        bucket: r.retentionBucket,
      };
      entry.sessions.add(r.sessionHash);
      entry.scores.push(r.durationScore0To10);
      if (r.suspectedBot) entry.botFlagged += 1;
      byEvent.set(r.eventCode, entry);
    }

    const rollups = Array.from(byEvent.entries()).map(([eventCode, data]) => {
      const distinctSessions = data.sessions.size;
      const kSuppressed = distinctSessions < minK;
      const avgScore = kSuppressed || data.scores.length === 0
        ? null
        : Number((data.scores.reduce((a, b) => a + b, 0) / data.scores.length).toFixed(2));
      return {
        eventCode,
        retentionBucket: data.bucket,
        distinctSessions: kSuppressed ? null : distinctSessions,
        totalEvents: kSuppressed ? null : data.scores.length,
        avgEngagementScore0To10: avgScore,
        kSuppressed,
        minKThreshold: minK,
        botFlaggedEvents: data.botFlagged,
        epistemicCaveatFa: 'توجه کاربر (کلیک/بازدید) نشانگر تقاضای قطعی بازار یا معامله واقعی نیست.',
      };
    });

    return {
      status: this.records.length === 0 ? 'NOT_MEASURED' : 'AVAILABLE',
      totalIngestedEvents: this.records.length,
      kThreshold: minK,
      rollups,
    };
  }
}

export const defaultPlatformTelemetryTaxonomy = new PlatformTelemetryTaxonomyService();

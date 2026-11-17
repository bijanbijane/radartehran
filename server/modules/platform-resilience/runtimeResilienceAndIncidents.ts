/** @file server/modules/platform-resilience/runtimeResilienceAndIncidents.ts — Stage 9 Failure Isolation Matrix, Health Tiers, Consistency & Incidents */
import crypto from 'node:crypto';
import { SOCIAL_COLLECTIONS, type CommunityDatabaseStore } from '../community/communityFirestoreAdapter';
import { communityUnifiedRepository } from '../community/communityUnifiedRepository';

export type HealthTierStatus = 'LIVE' | 'READY' | 'DEGRADED';
export type IncidentSeverity = 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4';

export interface FailureIsolationPolicy {
  domainId: string;
  timeoutMs: number;
  circuitThresholdFailures: number;
  fallbackBehaviorFa: string;
  isolatesBlastRadiusFromCoreMap: boolean;
}

export const FAILURE_ISOLATION_MATRIX_10: readonly FailureIsolationPolicy[] = [
  { domainId: 'community-social', timeoutMs: 4000, circuitThresholdFailures: 5, fallbackBehaviorFa: 'نمایش پیام خطا بدون اخلال در نقشه اصلی', isolatesBlastRadiusFromCoreMap: true },
  { domainId: 'trust-safety', timeoutMs: 4000, circuitThresholdFailures: 3, fallbackBehaviorFa: 'نگهداری صف در حالت Fail-Closed', isolatesBlastRadiusFromCoreMap: true },
  { domainId: 'notifications-outbox', timeoutMs: 3000, circuitThresholdFailures: 5, fallbackBehaviorFa: 'صف‌بندی پایدار با Backoff و انتقال به DLQ', isolatesBlastRadiusFromCoreMap: true },
  { domainId: 'search-discovery', timeoutMs: 3500, circuitThresholdFailures: 5, fallbackBehaviorFa: 'فهرست محلی محله‌ها بدون نتایج اجتماعی', isolatesBlastRadiusFromCoreMap: true },
  { domainId: 'telemetry-analytics', timeoutMs: 2000, circuitThresholdFailures: 5, fallbackBehaviorFa: 'رد بی‌صدا بدون مسدود کردن UX', isolatesBlastRadiusFromCoreMap: true },
  { domainId: 'market-pulse-sync', timeoutMs: 6000, circuitThresholdFailures: 3, fallbackBehaviorFa: 'استفاده از کش دیسک با برچسب STALE', isolatesBlastRadiusFromCoreMap: true },
  { domainId: 'ai-gateway', timeoutMs: 8000, circuitThresholdFailures: 3, fallbackBehaviorFa: 'مدل قطعی هدونیک و قواعد حقوقی محلی', isolatesBlastRadiusFromCoreMap: true },
  { domainId: 'external-gateway', timeoutMs: 5000, circuitThresholdFailures: 3, fallbackBehaviorFa: 'قطع مدار خودکار و حالت سندباکس', isolatesBlastRadiusFromCoreMap: true },
  { domainId: 'object-storage', timeoutMs: 7000, circuitThresholdFailures: 3, fallbackBehaviorFa: 'محدودیت آپلود رسانه بدون قطع متن', isolatesBlastRadiusFromCoreMap: true },
  { domainId: 'automation-workers', timeoutMs: 10000, circuitThresholdFailures: 3, fallbackBehaviorFa: 'Kill Switch مستقل و توقف خودکار امن', isolatesBlastRadiusFromCoreMap: true },
];

export interface IncidentRecord {
  id: string;
  severity: IncidentSeverity;
  domainId: string;
  summaryFa: string;
  status: 'OPEN' | 'MITIGATED' | 'RESOLVED';
  createdAtIso: string;
  resolvedAtIso: string | null;
}

export class RuntimeResilienceAndIncidentsService {
  private readonly incidents: IncidentRecord[] = [];
  private readonly circuitFailures = new Map<string, number>();

  constructor(private readonly storeProvider: () => CommunityDatabaseStore = () => communityUnifiedRepository.getStore()) {}

  recordDependencyFailure(domainId: string): { openCircuit: boolean; failureCount: number } {
    const policy = FAILURE_ISOLATION_MATRIX_10.find((p) => p.domainId === domainId);
    const threshold = policy?.circuitThresholdFailures ?? 5;
    const next = (this.circuitFailures.get(domainId) ?? 0) + 1;
    this.circuitFailures.set(domainId, next);
    return { openCircuit: next >= threshold, failureCount: next };
  }

  resetDependencyCircuit(domainId: string): void {
    this.circuitFailures.set(domainId, 0);
  }

  getHealthTiers(): {
    overallTier: HealthTierStatus;
    openCircuits: string[];
    openIncidentsCount: number;
    matrixCount: number;
  } {
    const openCircuits: string[] = [];
    for (const p of FAILURE_ISOLATION_MATRIX_10) {
      if ((this.circuitFailures.get(p.domainId) ?? 0) >= p.circuitThresholdFailures) {
        openCircuits.push(p.domainId);
      }
    }
    const openIncidents = this.incidents.filter((i) => i.status !== 'RESOLVED');
    const overallTier: HealthTierStatus = openCircuits.length > 0 || openIncidents.some((i) => i.severity === 'SEV-1')
      ? 'DEGRADED'
      : 'READY';
    return {
      overallTier,
      openCircuits,
      openIncidentsCount: openIncidents.length,
      matrixCount: FAILURE_ISOLATION_MATRIX_10.length,
    };
  }

  async verifyCrossDomainConsistency(): Promise<{
    consistent: boolean;
    checkedPosts: number;
    checkedCases: number;
    orphanedCases: string[];
    checkedAtIso: string;
  }> {
    const store = this.storeProvider();
    const [postsPage, casesPage] = await Promise.all([
      store.queryDocs<Record<string, unknown>>(SOCIAL_COLLECTIONS.posts, { limit: 200 }),
      store.queryDocs<Record<string, unknown>>(SOCIAL_COLLECTIONS.moderationCases, { limit: 200 }),
    ]);
    const postIds = new Set(postsPage.items.map((p) => String(p.id || '')));
    const orphanedCases: string[] = [];
    for (const c of casesPage.items) {
      if (c.targetType === 'discussion_post' || c.targetType === 'question') {
        const tid = String(c.targetId || '');
        if (tid && !tid.startsWith('seed_') && !postIds.has(tid)) orphanedCases.push(String(c.id || tid));
      }
    }
    return {
      consistent: orphanedCases.length === 0,
      checkedPosts: postsPage.items.length,
      checkedCases: casesPage.items.length,
      orphanedCases,
      checkedAtIso: new Date().toISOString(),
    };
  }

  openIncident(params: { severity: IncidentSeverity; domainId: string; summaryFa: string }): IncidentRecord {
    const rec: IncidentRecord = {
      id: `inc_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      severity: params.severity,
      domainId: params.domainId,
      summaryFa: params.summaryFa.slice(0, 200),
      status: 'OPEN',
      createdAtIso: new Date().toISOString(),
      resolvedAtIso: null,
    };
    this.incidents.unshift(rec);
    return rec;
  }

  resolveIncident(id: string): IncidentRecord | null {
    const target = this.incidents.find((i) => i.id === id);
    if (!target) return null;
    target.status = 'RESOLVED';
    target.resolvedAtIso = new Date().toISOString();
    return target;
  }

  listIncidents(): IncidentRecord[] {
    return [...this.incidents];
  }
}

export const defaultRuntimeResilience = new RuntimeResilienceAndIncidentsService();

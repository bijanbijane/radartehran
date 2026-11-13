/**
 * @file src/utils/serverSponsorFirestoreHelper.ts
 * @description Schema-strict Firestore payload builders (aligned with firestore.rules)
 * and caller-token Firestore REST fallbacks when Admin ADC credentials are absent.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { EXPECTED_FIREBASE_PROJECT_ID, EXPECTED_FIRESTORE_DATABASE_ID } from './serverAdminAndTelegramSecurity';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from './areaUnit';

export function formatSponsorTariffIntl(millionToman: number, currency: IntlCurrencyCode = 'USD'): string {
  return formatMillionTomanAsIntlCurrency(millionToman, currency);
}

const FS_REST_COMMIT = `https://firestore.googleapis.com/v1/projects/${EXPECTED_FIREBASE_PROJECT_ID}/databases/${EXPECTED_FIRESTORE_DATABASE_ID}/documents:commit`;
const FS_DOC_PREFIX = `projects/${EXPECTED_FIREBASE_PROJECT_ID}/databases/${EXPECTED_FIRESTORE_DATABASE_ID}/documents`;

export interface OverrideSponsorFirestorePayload {
  name: string;
  phone: string;
  specialty: string;
  experienceYears: number;
  expiresAtIso?: string;
  planType?: 'free' | 'paid_1m' | 'paid_3m';
}

export function buildSponsorRequestFirestoreDoc(params: {
  hoodId: number;
  hoodName: string;
  agencyName: string;
  phone: string;
  specialty: string;
  experienceYears: number;
  monthlyTariffMillion: number;
  planMonths: 1 | 3;
  totalPayableMillion: number;
  trackingCode: string;
  status?: 'pending' | 'approved';
  expiresAtIso?: string;
}): Record<string, unknown> {
  return {
    hoodId: params.hoodId,
    hoodName: params.hoodName.slice(0, 80),
    agencyName: params.agencyName.slice(0, 120),
    phone: params.phone.slice(0, 30),
    specialty: params.specialty.slice(0, 140),
    experienceYears: Math.min(60, Math.max(1, Math.round(params.experienceYears))),
    monthlyTariffMillion: params.monthlyTariffMillion,
    planMonths: params.planMonths,
    totalPayableMillion: params.totalPayableMillion,
    trackingCode: params.trackingCode.slice(0, 80),
    ...(params.expiresAtIso ? { expiresAtIso: params.expiresAtIso.slice(0, 60) } : {}),
    status: params.status === 'approved' ? 'approved' : 'pending',
    createdAt: FieldValue.serverTimestamp(),
  };
}

export function buildOverrideSponsorFirestorePayload(
  raw: Record<string, unknown>,
  fallbackPlanMonths: 1 | 3,
  expiresAtIso: string,
): OverrideSponsorFirestorePayload {
  const expRaw = Number(raw.experienceYears);
  const experienceYears = Number.isFinite(expRaw) ? Math.min(60, Math.max(0, Math.round(expRaw))) : 5;
  const rawPlanType = raw.planType;
  const planType: 'free' | 'paid_1m' | 'paid_3m' =
    rawPlanType === 'free' || rawPlanType === 'paid_1m' || rawPlanType === 'paid_3m'
      ? rawPlanType
      : fallbackPlanMonths === 3
        ? 'paid_3m'
        : 'paid_1m';
  return {
    name: String(raw.name || 'مشاور منتخب محله').slice(0, 120),
    phone: String(raw.phone || '09120000000').slice(0, 30),
    specialty: String(raw.specialty || 'فروش و رهن تخصصی').slice(0, 140),
    experienceYears,
    expiresAtIso: String(raw.expiresAtIso || expiresAtIso).slice(0, 60),
    planType,
  };
}

export function buildBargainModerationFirestorePayload(
  targetStatus: 'approved' | 'rejected',
  adminUid: string,
): Record<string, unknown> {
  return {
    status: targetStatus,
    updatedAt: FieldValue.serverTimestamp(),
    ...(targetStatus === 'approved'
      ? { approvedAt: FieldValue.serverTimestamp(), approvedBy: String(adminUid || 'admin').slice(0, 128) }
      : {}),
  };
}

export function extractBearerToken(rawHeader?: string | string[]): string {
  const s = Array.isArray(rawHeader) ? rawHeader[0] || '' : String(rawHeader || '').trim();
  return s.toLowerCase().startsWith('bearer ') ? s.slice(7).trim() : '';
}

export function isMissingAdminCredentialsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /default credentials|FIREBASE_ADMIN_CREDENTIALS_MISSING|Could not load|metadata|UNAUTHENTICATED|ENOENT.*credential/i.test(msg);
}

function toFsValue(val: unknown): Record<string, unknown> {
  if (val === null) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map((v) => toFsValue(v)) } };
  if (val && typeof val === 'object') {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) fields[k] = toFsValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val ?? '') };
}

async function runRestCommit(bearer: string, writes: unknown[], fetchFn: typeof fetch = fetch): Promise<void> {
  if (!bearer) throw new Error('FIREBASE_REST_BEARER_MISSING');
  if (process.env.PREVENT_PROD_FIREBASE_IN_TEST === 'true' && fetchFn === fetch) {
    throw new Error('TEST_ISOLATION_GUARD: Production Firebase REST blocked in test.');
  }
  const res = await fetchFn(FS_REST_COMMIT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`FIRESTORE_REST_COMMIT_FAILED_${res.status}:${detail.slice(0, 120)}`);
  }
}

export async function commitSponsorReserveViaRest(
  requestId: string,
  data: Record<string, unknown>,
  rawAuthHeader?: string | string[],
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const bearer = extractBearerToken(rawAuthHeader);
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k !== 'createdAt' && v !== undefined) fields[k] = toFsValue(v);
  }
  await runRestCommit(bearer, [
    {
      update: { name: `${FS_DOC_PREFIX}/sponsorRequests/${encodeURIComponent(requestId)}`, fields },
      updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
    },
  ], fetchFn);
}

export async function commitSponsorApprovalViaRest(params: {
  requestId?: string;
  hoodId: number;
  buyPerSqm: number;
  rahn80m: number;
  sponsor: OverrideSponsorFirestorePayload;
  expiresAtIso: string;
  manualLockUntilMs: number;
}, rawAuthHeader?: string | string[], fetchFn: typeof fetch = fetch): Promise<void> {
  const bearer = extractBearerToken(rawAuthHeader);
  const writes: unknown[] = [];
  if (params.requestId) {
    writes.push({
      update: {
        name: `${FS_DOC_PREFIX}/sponsorRequests/${encodeURIComponent(params.requestId)}`,
        fields: { status: toFsValue('approved'), expiresAtIso: toFsValue(params.expiresAtIso) },
      },
      updateMask: { fieldPaths: ['status', 'expiresAtIso'] },
    });
  }
  writes.push({
    update: {
      name: `${FS_DOC_PREFIX}/neighborhoodOverrides/${params.hoodId}`,
      fields: {
        hoodId: toFsValue(params.hoodId),
        buyPerSqm: toFsValue(params.buyPerSqm),
        rahn80m: toFsValue(params.rahn80m),
        sponsor: toFsValue(params.sponsor),
        overrideSource: toFsValue('ADMIN_MANUAL'),
        manualLockUntilMs: toFsValue(params.manualLockUntilMs),
      },
    },
    updateMask: { fieldPaths: ['hoodId', 'buyPerSqm', 'rahn80m', 'sponsor', 'overrideSource', 'manualLockUntilMs'] },
    updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
  });
  await runRestCommit(bearer, writes, fetchFn);
}

export async function commitSponsorReleaseViaRest(params: {
  hoodId: number;
  buyPerSqm: number;
  rahn80m: number;
}, rawAuthHeader?: string | string[], fetchFn: typeof fetch = fetch): Promise<void> {
  const bearer = extractBearerToken(rawAuthHeader);
  await runRestCommit(bearer, [
    {
      update: {
        name: `${FS_DOC_PREFIX}/neighborhoodOverrides/${params.hoodId}`,
        fields: {
          hoodId: toFsValue(params.hoodId),
          buyPerSqm: toFsValue(params.buyPerSqm),
          rahn80m: toFsValue(params.rahn80m),
          sponsor: toFsValue(null),
          overrideSource: toFsValue('ADMIN_MANUAL'),
        },
      },
      updateMask: { fieldPaths: ['hoodId', 'buyPerSqm', 'rahn80m', 'sponsor', 'overrideSource'] },
      updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
    },
  ], fetchFn);
}

export async function commitBargainModerationViaRest(
  bargainId: string,
  targetStatus: 'approved' | 'rejected',
  adminUid: string,
  rawAuthHeader?: string | string[],
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const bearer = extractBearerToken(rawAuthHeader);
  const fields: Record<string, unknown> = { status: toFsValue(targetStatus) };
  const fieldPaths = ['status'];
  const transforms: Array<{ fieldPath: string; setToServerValue: string }> = [
    { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
  ];
  if (targetStatus === 'approved') {
    fields.approvedBy = toFsValue(String(adminUid || 'admin').slice(0, 128));
    fieldPaths.push('approvedBy');
    transforms.push({ fieldPath: 'approvedAt', setToServerValue: 'REQUEST_TIME' });
  }
  await runRestCommit(bearer, [
    {
      update: { name: `${FS_DOC_PREFIX}/bargains/${encodeURIComponent(bargainId)}`, fields },
      updateMask: { fieldPaths },
      updateTransforms: transforms,
    },
  ], fetchFn);
}

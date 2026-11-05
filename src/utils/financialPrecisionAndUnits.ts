import fs from 'fs'; import path from 'path'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from './areaUnit'; export type MonetaryRoundingPolicy = | 'ROUND_HALF_UP_INT_MILLION'
  | 'ROUND_ONE_DECIMAL_MILLION'
  | 'ROUND_TWO_DECIMAL_BILLION'
  | 'ROUND_EXACT_TOMAN'; export function assertFiniteSafeNumber(value: number, fieldName = 'monetaryValue'): number { if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`FINANCIAL_PRECISION_ERROR: ${fieldName} must be a finite number`);
  } if (Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    throw new Error(`FINANCIAL_OVERFLOW_ERROR: ${fieldName} exceeds Number.MAX_SAFE_INTEGER`);
  } return Object.is(value, -0) ? 0 : value; } const SCALE_FACTOR = 10_000; export function toScaledInteger(value: number, fieldName = 'value'): number { const safe = assertFiniteSafeNumber(value, fieldName); const scaled = (safe < 0 ? -1 : 1) * Math.round((Math.abs(safe) + Number.EPSILON) * SCALE_FACTOR); if (Math.abs(scaled) > Number.MAX_SAFE_INTEGER) {
    throw new Error(`FINANCIAL_SCALED_OVERFLOW: ${fieldName} exceeds safe integer range`);
  }
  return Object.is(scaled, -0) ? 0 : scaled; }
export function fromScaledInteger(scaled: number): number { const result = scaled / SCALE_FACTOR; return Object.is(result, -0) ? 0 : result; }
export function addExactMonetary(values: number[]): number { let sumScaled = 0; for (let i = 0; i < values.length; i++) {
    sumScaled += toScaledInteger(values[i], `term[${i}]`);
    if (Math.abs(sumScaled) > Number.MAX_SAFE_INTEGER) { throw new Error('FINANCIAL_SUM_OVERFLOW: Accumulated sum exceeds Number.MAX_SAFE_INTEGER'); } }
  return fromScaledInteger(sumScaled); }
export function multiplyAreaByRateExact( areaSqm: number, ratePerSqmMillion: number, policy: MonetaryRoundingPolicy = 'ROUND_ONE_DECIMAL_MILLION', ): number { const safeArea = assertFiniteSafeNumber(areaSqm, 'areaSqm');
  const safeRate = assertFiniteSafeNumber(ratePerSqmMillion, 'ratePerSqmMillion'); if (safeArea < 0 || safeRate < 0) { throw new Error('FINANCIAL_NEGATIVE_INPUT: areaSqm and ratePerSqmMillion must be non-negative'); }
  const areaScaled = Math.round((safeArea + Number.EPSILON) * 100); const rateScaled = Math.round((safeRate + Number.EPSILON) * 100); const productScaled = areaScaled * rateScaled; if (Math.abs(productScaled) > Number.MAX_SAFE_INTEGER) {
    throw new Error('FINANCIAL_PRODUCT_OVERFLOW: Area * Rate exceeds safe integer range'); }
  return applyRoundingPolicy(productScaled / 10_000, policy); }
export function convertMillionToBillionExact(millionToman: number): number {
  const scaled = toScaledInteger(millionToman, 'millionToman');
  const result = scaled / (SCALE_FACTOR * 1000);
  return Object.is(result, -0) ? 0 : Number(result.toFixed(6));
}
export function convertBillionToMillionExact(billionToman: number): number {
  const safe = assertFiniteSafeNumber(billionToman, 'billionToman');
  const scaled = (safe < 0 ? -1 : 1) * Math.round((Math.abs(safe) + Number.EPSILON) * 1_000_000);
  const result = scaled / 1_000;
  return Object.is(result, -0) ? 0 : result;
}
export function applyRoundingPolicy(value: number, policy: MonetaryRoundingPolicy): number {
  const safe = assertFiniteSafeNumber(value, 'roundingInput');
  const sign = safe < 0 ? -1 : 1;
  const abs = Math.abs(safe);
  let roundedAbs: number;
  switch (policy) {
    case 'ROUND_HALF_UP_INT_MILLION':
      roundedAbs = Math.floor(abs + 0.5 + 1e-12);
      break;
    case 'ROUND_ONE_DECIMAL_MILLION':
      roundedAbs = Math.floor(abs * 10 + 0.5 + 1e-12) / 10;
      break;
    case 'ROUND_TWO_DECIMAL_BILLION':
      roundedAbs = Math.floor(abs * 100 + 0.5 + 1e-12) / 100;
      break;
    case 'ROUND_EXACT_TOMAN':
      roundedAbs = Math.floor(abs * 1_000_000 + 0.5 + 1e-12) / 1_000_000;
      break;
  }
  const signed = sign * roundedAbs;
  return Object.is(signed, -0) ? 0 : signed;
}
export type UnitCode =
  | 'SQM' | 'MILLION_TOMAN' | 'BILLION_TOMAN' | 'TOMAN' | 'RIAL' | 'MILLION_TOMAN_PER_SQM'
  | 'KM' | 'METER' | 'PERCENT_0_100' | 'RATIO_0_1' | 'MONTH' | 'YEAR' | 'CELSIUS' | 'AQI_US';
export interface DimensionalValue<U extends UnitCode = UnitCode> {
  value: number;
  unit: U;
}
export function createDimensionalValue<U extends UnitCode>(value: number, unit: U): DimensionalValue<U> {
  return { value: assertFiniteSafeNumber(value, `DimensionalValue(${unit})`), unit };
}
export function convertDimensionedValue<From extends UnitCode, To extends UnitCode>(
  input: DimensionalValue<From>,
  targetUnit: To,
): DimensionalValue<To> {
  const v = assertFiniteSafeNumber(input.value, input.unit);
  if ((input.unit as UnitCode) === (targetUnit as UnitCode)) {
    return { value: v, unit: targetUnit };
  }
  const currencyToToman: Partial<Record<UnitCode, number>> = {
    RIAL: 0.1,
    TOMAN: 1,
    MILLION_TOMAN: 1_000_000,
    BILLION_TOMAN: 1_000_000_000,
  };
  if (currencyToToman[input.unit] !== undefined && currencyToToman[targetUnit] !== undefined) {
    const out = (v * currencyToToman[input.unit]!) / currencyToToman[targetUnit]!;
    return { value: Object.is(out, -0) ? 0 : Number(out.toFixed(6)), unit: targetUnit };
  }
  if (input.unit === 'METER' && targetUnit === 'KM') return { value: Number((v / 1000).toFixed(6)), unit: targetUnit };
  if (input.unit === 'KM' && targetUnit === 'METER') return { value: Number((v * 1000).toFixed(3)), unit: targetUnit };
  if (input.unit === 'PERCENT_0_100' && targetUnit === 'RATIO_0_1') return { value: Number((v / 100).toFixed(6)), unit: targetUnit };
  if (input.unit === 'RATIO_0_1' && targetUnit === 'PERCENT_0_100') return { value: Number((v * 100).toFixed(4)), unit: targetUnit };
  if (input.unit === 'MONTH' && targetUnit === 'YEAR') return { value: Number((v / 12).toFixed(6)), unit: targetUnit };
  if (input.unit === 'YEAR' && targetUnit === 'MONTH') return { value: Number((v * 12).toFixed(4)), unit: targetUnit };
  throw new Error(`INCOMPATIBLE_UNIT_CONVERSION: Cannot convert ${input.unit} to ${targetUnit}`);
}
export function addDimensionedValues<U extends UnitCode>(
  left: DimensionalValue<U>,
  right: DimensionalValue<UnitCode>,
): DimensionalValue<U> {
  const rightConverted = convertDimensionedValue(right, left.unit);
  return { value: addExactMonetary([left.value, rightConverted.value]), unit: left.unit };
}
export function multiplyAreaByPerSqmPrice(
  area: DimensionalValue<'SQM'>,
  pricePerSqm: DimensionalValue<'MILLION_TOMAN_PER_SQM'>,
): DimensionalValue<'MILLION_TOMAN'> {
  if (area.unit !== 'SQM' || pricePerSqm.unit !== 'MILLION_TOMAN_PER_SQM') {
    throw new Error('DIMENSIONAL_MISMATCH: Expected SQM * MILLION_TOMAN_PER_SQM');
  }
  return {
    value: multiplyAreaByRateExact(area.value, pricePerSqm.value, 'ROUND_ONE_DECIMAL_MILLION'),
    unit: 'MILLION_TOMAN',
  };
}
export type WorkflowDomain = 'LISTING_PUBLICATION' | 'MEDIA_CLEANUP' | 'BACKUP_RESTORE' | 'SPONSOR_MODERATION';
export interface WorkflowInstance {
  workflowId: string;
  domain: WorkflowDomain;
  currentState: string;
  completedSteps: string[];
  version: number;
  terminal: boolean;
  history: Array<{ from: string; to: string; actorId: string; timestampIso: string }>;
}
const WORKFLOW_TRANSITIONS: Record<WorkflowDomain, { initial: string; terminals: string[]; allowed: Record<string, string[]> }> = {
  LISTING_PUBLICATION: {
    initial: 'DRAFT',
    terminals: ['ARCHIVED', 'REJECTED'],
    allowed: {
      DRAFT: ['VALIDATED'],
      VALIDATED: ['MEDIA_VERIFIED', 'DRAFT'],
      MEDIA_VERIFIED: ['PENDING_MODERATION'],
      PENDING_MODERATION: ['PUBLISHED', 'REJECTED'],
      PUBLISHED: ['ARCHIVED'],
      REJECTED: [],
      ARCHIVED: [],
    },
  },
  MEDIA_CLEANUP: {
    initial: 'SCANNED',
    terminals: ['PURGED', 'ABORTED'],
    allowed: {
      SCANNED: ['ORPHAN_CONFIRMED', 'ABORTED'],
      ORPHAN_CONFIRMED: ['QUARANTINED', 'ABORTED'],
      QUARANTINED: ['PURGED', 'ABORTED'],
      PURGED: [],
      ABORTED: [],
    },
  },
  BACKUP_RESTORE: {
    initial: 'INITIATED',
    terminals: ['COMPLETED', 'ROLLED_BACK'],
    allowed: {
      INITIATED: ['MANIFEST_VERIFIED', 'ROLLED_BACK'],
      MANIFEST_VERIFIED: ['PRE_RESTORE_SNAPSHOT_TAKEN', 'ROLLED_BACK'],
      PRE_RESTORE_SNAPSHOT_TAKEN: ['APPLIED', 'ROLLED_BACK'],
      APPLIED: ['COMPLETED', 'ROLLED_BACK'],
      COMPLETED: [],
      ROLLED_BACK: [],
    },
  },
  SPONSOR_MODERATION: {
    initial: 'SUBMITTED',
    terminals: ['EXPIRED', 'REJECTED'],
    allowed: {
      SUBMITTED: ['UNDER_REVIEW'],
      UNDER_REVIEW: ['APPROVED', 'REJECTED'],
      APPROVED: ['ACTIVE'],
      ACTIVE: ['EXPIRED'],
      REJECTED: [],
      EXPIRED: [],
    },
  },
};
export class MultiStepWorkflowEngine {
  private readonly instances = new Map<string, WorkflowInstance>();
  startWorkflow(workflowId: string, domain: WorkflowDomain, actorId: string, nowIso = new Date().toISOString()): WorkflowInstance {
    const spec = WORKFLOW_TRANSITIONS[domain];
    const cleanActor = String(actorId || '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim();
    if (!workflowId?.trim() || !spec || !cleanActor) throw new Error(`WORKFLOW_INVALID_PARAMETERS: ${workflowId}`);
    if (this.instances.has(workflowId)) throw new Error(`WORKFLOW_ALREADY_EXISTS: ${workflowId}`);
    if (this.instances.size >= 2_000) { const oldest = this.instances.keys().next().value; if (oldest !== undefined) this.instances.delete(oldest); }
    const instance: WorkflowInstance = {
      workflowId, domain, currentState: spec.initial, completedSteps: [spec.initial], version: 1, terminal: false,
      history: [{ from: 'NONE', to: spec.initial, actorId: cleanActor, timestampIso: nowIso }],
    };
    this.instances.set(workflowId, instance);
    return { ...instance, completedSteps: [...instance.completedSteps], history: [...instance.history] };
  }
  transition(workflowId: string, targetState: string, expectedVersion: number, actorId: string, nowIso = new Date().toISOString()): WorkflowInstance {
    const inst = this.instances.get(workflowId);
    const cleanActor = String(actorId || '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim();
    if (!inst || !cleanActor) throw new Error(`WORKFLOW_NOT_FOUND: ${workflowId}`);
    if (inst.version !== expectedVersion) throw new Error(`WORKFLOW_CONCURRENCY_CONFLICT`);
    if (inst.terminal) throw new Error(`WORKFLOW_TERMINAL_IMMUTABLE`);
    const spec = WORKFLOW_TRANSITIONS[inst.domain];
    if (!(spec.allowed[inst.currentState] || []).includes(targetState)) {
      throw new Error(`WORKFLOW_INVALID_TRANSITION: ${inst.currentState} -> ${targetState}`);
    }
    const prev = inst.currentState;
    inst.currentState = targetState;
    inst.completedSteps.push(targetState);
    inst.version += 1;
    inst.terminal = spec.terminals.includes(targetState);
    if (inst.history.length >= 200) inst.history.shift();
    inst.history.push({ from: prev, to: targetState, actorId: cleanActor, timestampIso: nowIso });
    return { ...inst, completedSteps: [...inst.completedSteps], history: [...inst.history] };
  }
}
export const UNIFIED_SCHEMA_VERSION = '2026.10.v2';
export type UnifiedEntityKind = 'property_listing' | 'neighborhood_override' | 'buyer_alert' | 'feature_flags' | 'user_preferences';
export function validateUnifiedSchemaContract(kind: UnifiedEntityKind, rawPayload: unknown) {
  const errors: Array<{ field: string; code: string; message: string }> = [];
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return { valid: false, schemaVersion: UNIFIED_SCHEMA_VERSION, migratedFromLegacy: false, errors: [{ field: '$root', code: 'INVALID_OBJECT', message: 'Object required' }] };
  }
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawPayload as Record<string, unknown>)) {
    if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') obj[k] = v;
  }
  const migratedFromLegacy = !obj.schemaVersion;
  obj.schemaVersion = obj.schemaVersion ?? UNIFIED_SCHEMA_VERSION;
  if (kind === 'property_listing') {
    const title = typeof obj.title === 'string' ? obj.title.replace(/[\u0000-\u001F\u007F<>]/g, '').trim() : '';
    const areaSqm = Number(obj.areaSqm);
    const priceMillion = Number(obj.priceMillion);
    if (title.length < 3 || title.length > 160) errors.push({ field: 'title', code: 'STRING_BOUNDS', message: 'Invalid title' });
    if (!Number.isFinite(areaSqm) || areaSqm < 20 || areaSqm > 5000) errors.push({ field: 'areaSqm', code: 'NUMBER_BOUNDS', message: 'Invalid areaSqm' });
    if (!Number.isFinite(priceMillion) || priceMillion <= 0 || priceMillion > 5_000_000) errors.push({ field: 'priceMillion', code: 'NUMBER_BOUNDS', message: 'Invalid priceMillion' });
    obj.title = title;
  } else if (kind === 'neighborhood_override') {
    if (!Number.isInteger(Number(obj.id)) || Number(obj.id) <= 0) errors.push({ field: 'id', code: 'INVALID_ID', message: 'Invalid id' });
    if (!Number.isFinite(Number(obj.buyPerSqm)) || Number(obj.buyPerSqm) < 5) errors.push({ field: 'buyPerSqm', code: 'NUMBER_BOUNDS', message: 'Invalid buyPerSqm' });
  }
  return { valid: errors.length === 0, schemaVersion: UNIFIED_SCHEMA_VERSION, migratedFromLegacy, normalizedPayload: errors.length === 0 ? obj : undefined, errors, displayAreaUnitLabel: formatAreaUnitLabel(getStoredAreaUnit()), referenceValuationIntlText: formatMillionTomanAsIntlCurrency(Number(obj.priceMillion || obj.buyPerSqm || 10_000), getStoredIntlCurrency()) };
}
export function analyzeRepositoryChangeImpact(modifiedFiles: string[], repoRoot = process.cwd()) {
  const normalizedModified = modifiedFiles.map((f) => path.posix.normalize(String(f || '').replace(/\\/g, '/')).replace(/^(\.\.\/)+|^\/+/g, ''));
  const reverseDeps = new Map<string, Set<string>>();
  const allFiles: string[] = ['server.ts'];
  for (const dir of ['src', 'tests']) {
    const absDir = path.join(repoRoot, dir);
    if (!fs.existsSync(absDir)) continue;
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) allFiles.push(path.relative(repoRoot, full).replace(/\\/g, '/'));
      }
    };
    walk(absDir);
  }
  const importRegex = /from\s+['"](\.[^'"]+)['"]/g;
  for (const relFile of allFiles) {
    const absFile = path.join(repoRoot, relFile);
    if (!fs.existsSync(absFile)) continue;
    const content = fs.readFileSync(absFile, 'utf8');
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const resolvedBase = path.posix.normalize(path.posix.join(path.posix.dirname(relFile), match[1]));
      const target = [`${resolvedBase}.ts`, `${resolvedBase}.tsx`].find((c) => allFiles.includes(c)) || `${resolvedBase}.ts`;
      if (!reverseDeps.has(target)) reverseDeps.set(target, new Set());
      reverseDeps.get(target)!.add(relFile);
    }
  }
  const direct = new Set<string>();
  for (const mod of normalizedModified) {
    for (const dep of reverseDeps.get(mod) || []) if (!normalizedModified.includes(dep)) direct.add(dep);
  }
  const transitive = new Set<string>(direct);
  const queue = [...direct];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const nextDep of reverseDeps.get(curr) || []) {
      if (!transitive.has(nextDep) && !normalizedModified.includes(nextDep)) {
        transitive.add(nextDep);
        queue.push(nextDep);
      }
    }
  }
  const sharedContractsAffected = normalizedModified.some(
    (f) => f.includes('src/types/') || f.includes('src/utils/security.ts') || f.includes('hedonicPricingEngine.ts'),
  );
  return {
    modifiedFiles: normalizedModified,
    directDependents: [...direct].sort(), transitiveDependents: [...transitive].sort(), sharedContractsAffected, riskLevel: sharedContractsAffected ? 'CRITICAL' : transitive.size > 10 ? 'HIGH' : direct.size > 2 ? 'MEDIUM' : 'LOW', }; }
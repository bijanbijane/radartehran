/**
 * Stage 18 — Executable Search Normalization, Query AST Validation, NL Draft & Scoped Cache Engine
 * Spec ID: RT-FE-SEARCH-FILTER-018
 */

import { RT_SEARCH_OPERATORS_17, RT_SEARCH_REGISTRY_6 } from './rtFeSearchFilter018Specs';

export * from './rtFeSearchFilter018Specs';

export interface SearchText {
  original: string;
  normalized: string;
}

export interface SearchContext {
  domain: string;
  entityType?: string;
  cityId?: string;
  neighborhoodId?: string;
  workspaceId?: string;
  locale: 'fa-IR';
  accessScope: 'public' | 'private';
}

export type QueryNode =
  | { type: 'condition'; field: string; operator: string; value: unknown }
  | { type: 'group'; operator: 'AND' | 'OR'; children: QueryNode[] };

const DIGIT_MAP: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

/** Separates raw user search text from normalized matching text without overwriting original (§18.9.1). */
export function normalizeSearchTextPair(original: string): SearchText {
  const digits = [...original].map((ch) => DIGIT_MAP[ch] ?? ch).join('');
  const normalized = digits
    .replace(/\u200c/g, ' ')
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[٬،]/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return { original, normalized };
}

/** Validates QueryNode AST against depth, condition ceiling, field Allowlist, operator bounds & injection guards (§18.14.3, §18.15, §18.32). */
export function validateQueryTree(input: {
  definitionId: string;
  node: QueryNode;
  maxDepth?: number;
  maxConditions?: number;
}): { valid: boolean; conditionCount: number; maxObservedDepth: number; reasonFa: string } {
  const def = RT_SEARCH_REGISTRY_6.find((d) => d.id === input.definitionId);
  if (!def) {
    return { valid: false, conditionCount: 0, maxObservedDepth: 0, reasonFa: 'شناسه Search Definition در رجیستری ثبت نشده است.' };
  }
  const depthLimit = input.maxDepth ?? 3;
  const countLimit = input.maxConditions ?? 12;
  let conditionCount = 0;
  let maxObservedDepth = 1;
  let errorMsg: string | null = null;

  const visit = (node: QueryNode, depth: number) => {
    if (errorMsg) return;
    if (depth > maxObservedDepth) maxObservedDepth = depth;
    if (depth > depthLimit) {
      errorMsg = `عمق گروه‌بندی Query (${depth}) از حد مجاز ${depthLimit} بیشتر است (§۱۸.۱۴.۳).`;
      return;
    }
    if (node.type === 'group') {
      node.children.forEach((child) => visit(child, depth + 1));
      return;
    }
    conditionCount += 1;
    if (conditionCount > countLimit) {
      errorMsg = `تعداد شرط‌ها از سقف ${countLimit} فراتر رفت.`;
      return;
    }
    if (!(def.filterableFields as readonly string[]).includes(node.field)) {
      errorMsg = `فیلد «${node.field}» در Allowlist مدل ${def.id} مجاز نیست (FORBIDDEN_FIELD).`;
      return;
    }
    if (!(RT_SEARCH_OPERATORS_17 as readonly string[]).includes(node.operator)) {
      errorMsg = `عملگر ناشناخته «${node.operator}» رد شد.`;
      return;
    }
    if ((node.operator === 'near' || node.operator === 'within' || node.operator === 'intersects') && node.field !== 'location') {
      errorMsg = `عملگر مکانی «${node.operator}» فقط روی فیلد جغرافیایی مجاز است (§۱۸.۱۵).`;
      return;
    }
    if (node.operator === 'between') {
      const tuple = Array.isArray(node.value) ? node.value : [];
      if (tuple.length !== 2 || typeof tuple[0] !== 'number' || typeof tuple[1] !== 'number' || tuple[0] > tuple[1]) {
        errorMsg = 'عملگر between نیازمند بازه دوعددی معتبر [حداقل، حداکثر] است.';
        return;
      }
    }
    if (typeof node.value === 'string' && /(;|drop\s+table|union\s+select)/i.test(node.value)) {
      errorMsg = 'الگوی مشکوک به SQL Injection در مقدار شرط مسدود شد (§۱۸.۳۲).';
    }
  };

  visit(input.node, 1);
  return {
    valid: errorMsg === null,
    conditionCount,
    maxObservedDepth,
    reasonFa: errorMsg ?? `Query با ${conditionCount} شرط در عمق ${maxObservedDepth} کاملاً معتبر و آماده ارسال به Search API است.`,
  };
}

/** Builds scope-isolated Search Cache key preventing private data leaks across users (§18.28). */
export function buildSearchCacheKey(input: {
  definitionId: string;
  accessScope: 'public' | 'private';
  ownerId?: string;
  normalizedQuery: string;
  sortField: string;
  cursor?: string;
}): string {
  const scopeSegment = input.accessScope === 'private' ? `private:${input.ownerId ?? 'anon'}` : 'public';
  return `${input.definitionId}|${scopeSegment}|q=${input.normalizedQuery}|sort=${input.sortField}|c=${input.cursor ?? 'head'}`;
}

/** Sanitizes URL query parameters: strips secrets/unknown keys and invalidates cursor when filters change (§18.19.2 & §18.20.3). */
export function sanitizeUrlQueryParams(rawQuery: string, filterChanged: boolean): {
  safeParams: Record<string, string>;
  strippedKeys: string[];
  cursorResetApplied: boolean;
} {
  const allowed = new Set(['q', 'minArea', 'maxArea', 'sort', 'neighborhood', 'cursor']);
  const params = new URLSearchParams(rawQuery.startsWith('?') ? rawQuery.slice(1) : rawQuery);
  const safeParams: Record<string, string> = {};
  const strippedKeys: string[] = [];
  for (const [k, v] of params.entries()) {
    if (!allowed.has(k) || /(token|secret|password|auth)/i.test(k)) {
      strippedKeys.push(k);
    } else if (!(filterChanged && k === 'cursor')) {
      safeParams[k] = v;
    }
  }
  return { safeParams, strippedKeys, cursorResetApplied: filterChanged && params.has('cursor') };
}

/** Extracts an unconfirmed Query Draft from Persian natural language while flagging ambiguous criteria without fake numbers (§18.24). */
export function evaluateNaturalLanguageQueryDraft(sentence: string): {
  extractedConditions: { field: string; operator: string; value: string }[];
  ambiguousTerms: string[];
  requiresUserConfirmation: boolean;
  noteFa: string;
} {
  const norm = normalizeSearchTextPair(sentence).normalized;
  const extractedConditions: { field: string; operator: string; value: string }[] = [];
  const ambiguousTerms: string[] = [];

  if (norm.includes('خانه') || norm.includes('آپارتمان')) {
    extractedConditions.push({ field: 'propertyType', operator: 'eq', value: norm.includes('آپارتمان') ? 'apartment' : 'residential' });
  }
  if (norm.includes('نزدیک مترو')) {
    extractedConditions.push({ field: 'location', operator: 'near', value: 'metro_station' });
  }
  if (norm.includes('شمال تهران')) {
    extractedConditions.push({ field: 'neighborhoodId', operator: 'in', value: 'north_tehran_districts' });
  }
  if (norm.includes('قیمت مناسب') || norm.includes('ارزان')) {
    ambiguousTerms.push('قیمت مناسب (معیار مبهم — تبدیل به عدد ساختگی ممنوع است)');
  }
  return {
    extractedConditions,
    ambiguousTerms,
    requiresUserConfirmation: true,
    noteFa: ambiguousTerms.length > 0
      ? 'پیش‌نویس Query نیازمند تأیید کاربر و تعیین بازه واقعی برای عبارات مبهم است (§۱۸.۲۴).'
      : 'پیش‌نویس Query استخراج شد و پس از تأیید کاربر اجرا می‌شود.',
  };
}

/** Strips private free-text queries, addresses & PII from Search Telemetry (§18.39). */
export function sanitizeSearchTelemetryEvent(raw: {
  event: 'search_executed' | 'search_empty' | 'saved_search_created' | 'query_rejected';
  definitionId: string;
  durationMs: number;
  resultCount: number;
  extra?: Record<string, unknown>;
}): { safeEvent: Record<string, unknown>; strippedSensitiveFields: string[] } {
  const forbidden = ['privateQueryText', 'exactAddress', 'phoneNumber', 'userId', 'sensitivePayload'];
  const strippedSensitiveFields = Object.keys(raw.extra ?? {}).filter((k) => forbidden.includes(k));
  return {
    safeEvent: {
      event: raw.event,
      definitionId: raw.definitionId,
      durationMs: raw.durationMs,
      resultCount: raw.resultCount,
      timestamp: new Date().toISOString(),
    },
    strippedSensitiveFields,
  };
}

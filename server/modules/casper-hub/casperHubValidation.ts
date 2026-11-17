import crypto from 'node:crypto';
import {
  ALLOWED_CASPER_AGENT_IDS,
  CASPER_AGENT_ID,
  CasperHubClientError,
  CONTROL_BIDI_RE,
  PROMPT_INJECTION_PATTERNS,
  parseImportanceValue,
} from './casperHubTypes';

function normalizePersianOrthography(raw: unknown): string {
  return String(raw ?? '')
    .replace(CONTROL_BIDI_RE, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0x0f))
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFC');
}

export function seedToUuidV5(canonical: string): string {
  const hex = crypto.createHash('sha256').update(canonical).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function generateDeterministicNoteIdempotencyKey(payload: Record<string, unknown>, explicitKey?: string): string {
  if (typeof explicitKey === 'string' && explicitKey.trim().length > 0) return explicitKey.trim();
  const title = normalizePersianOrthography(payload.title);
  const summary = normalizePersianOrthography(payload.summary);
  const scope = normalizePersianOrthography(payload.note_scope || 'global').toLowerCase();
  const imp = parseImportanceValue(payload.importance);
  const tagsPart = Array.isArray(payload.tags)
    ? `|tags:${Array.from(new Set(payload.tags.map((t) => normalizePersianOrthography(t)))).sort().join(',')}`
    : '';
  const extra = scope !== 'global' ? `|${scope}|${normalizePersianOrthography(payload.roadmap_id)}|${normalizePersianOrthography(payload.task_id)}` : '';
  const impPart = imp !== 3 ? `|imp:${imp}` : '';
  return seedToUuidV5(`${CASPER_AGENT_ID}|${title.length}:${title}|${summary.length}:${summary}${extra}${impPart}${tagsPart}`);
}
export const deriveDeterministicNoteIdempotencyKey = generateDeterministicNoteIdempotencyKey;

export function buildDeterministicNoteIdempotencyKey(payload: Record<string, unknown>): string {
  const title = normalizePersianOrthography(payload.title);
  const summary = normalizePersianOrthography(payload.summary);
  const scope = normalizePersianOrthography(payload.note_scope || 'global').toLowerCase();
  const type = normalizePersianOrthography(payload.note_type || 'finding').toLowerCase();
  const imp = parseImportanceValue(payload.importance);
  const hex = crypto.createHash('sha256').update(`casper-04|${scope}|${type}|${imp}|${title.length}:${title}|${summary.length}:${summary}`).digest('hex');
  return `casper-04-${hex.slice(0, 32)}`;
}

export function validateCasperHubNotePayload(
  payload: unknown,
  secretToken?: string,
): { valid: boolean; error?: string; statusCode?: number; sanitized?: Record<string, unknown> } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, error: 'Note payload must be a JSON object', statusCode: 400 };
  }
  const obj = payload as Record<string, unknown>;
  const meta = (obj.metadata && typeof obj.metadata === 'object' ? obj.metadata : {}) as Record<string, unknown>;
  const spoofedAgent = obj.agent_id ?? obj.author_agent_id ?? obj.created_by_agent_id ?? meta.agent_id;
  if (spoofedAgent !== undefined && String(spoofedAgent).trim() !== '' && !ALLOWED_CASPER_AGENT_IDS.has(String(spoofedAgent).trim())) {
    return { valid: false, error: 'Agent identity spoofing attempt rejected (AGENT_IDENTITY_SPOOF_REJECTED)', statusCode: 403 };
  }
  const cleanStr = (v: unknown) => (typeof v === 'string' ? v.replace(CONTROL_BIDI_RE, '').trim().normalize('NFC') : '');
  const title = cleanStr(obj.title);
  const summary = cleanStr(obj.summary);
  if (title.length < 1 || title.length > 160) return { valid: false, error: 'Note title must be between 1 and 160 characters', statusCode: 422 };
  if (summary.length < 1 || summary.length > 4000 || /^(.)\1{500,}$/.test(summary)) {
    return { valid: false, error: 'Note summary must be between 1 and 600/4000 valid characters', statusCode: 422 };
  }
  const scope = cleanStr(obj.note_scope || 'global').toLowerCase();
  if (!['global', 'roadmap', 'task'].includes(scope)) return { valid: false, error: 'Invalid note_scope', statusCode: 422 };
  const roadmapId = cleanStr(obj.roadmap_id);
  const taskId = cleanStr(obj.task_id ?? obj.related_task_id);
  if (scope === 'roadmap' && !roadmapId) return { valid: false, error: 'roadmap_id is required when note_scope is roadmap', statusCode: 422 };
  if (scope === 'task' && !taskId) return { valid: false, error: 'task_id is required when note_scope is task', statusCode: 422 };
  if (roadmapId.length > 128 || taskId.length > 128) return { valid: false, error: 'Identifier length exceeds 128 characters', statusCode: 422 };
  const detailRef = cleanStr(obj.detail_ref);
  if (detailRef && !detailRef.startsWith('https://')) return { valid: false, error: 'detail_ref must be an https:// URL', statusCode: 422 };
  const tags = Array.isArray(obj.tags)
    ? Array.from(new Set(obj.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean))).slice(0, 10)
    : undefined;
  const combined = `${title}\n${summary}\n${roadmapId}\n${taskId}\n${detailRef}\n${(tags || []).join(' ')}`;
  const tok = (secretToken ?? process.env.CASPER_HUB_TOKEN ?? '').trim();
  if (tok && tok.length >= 4) {
    const b64 = Buffer.from(tok, 'utf8').toString('base64');
    if (combined.includes(tok) || combined.includes(b64) || combined.includes(encodeURIComponent(tok))) {
      return { valid: false, error: 'CASPER_HUB_NOTE_SECURITY_VIOLATION: secret token leakage detected', statusCode: 422 };
    }
  }
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(combined)) return { valid: false, error: 'CASPER_HUB_NOTE_SECURITY_VIOLATION: prompt-injection or credential detected', statusCode: 422 };
  }
  const rawType = cleanStr(obj.note_type || 'checkpoint').toLowerCase();
  const normalizedType = rawType === 'decision' ? 'finding' : rawType;
  const importance = parseImportanceValue(obj.importance);
  return {
    valid: true,
    sanitized: {
      title, summary, note_scope: scope, note_type: normalizedType, importance,
      ...(roadmapId ? { roadmap_id: roadmapId } : {}),
      ...(taskId ? { task_id: taskId, related_task_id: taskId } : {}),
      ...(detailRef ? { detail_ref: detailRef } : {}),
      ...(tags ? { tags } : {}),
    },
  };
}

export function normalizeCasperHubNotePayload(payload: Record<string, unknown>, secretToken?: string): Record<string, unknown> {
  const res = validateCasperHubNotePayload(payload, secretToken);
  if (!res.valid || !res.sanitized) {
    throw new CasperHubClientError('CASPER_HUB_INVALID_NOTE', res.error || 'Invalid CASPER HUB note payload', res.statusCode || 422);
  }
  return res.sanitized;
}

export function analyzeCasperHubEpistemicState(input: Record<string, unknown>) {
  const rawEvents = Array.isArray(input.change_feed) ? input.change_feed : Array.isArray(input.events) ? input.events : [];
  const rawNotes = Array.isArray(input.notes) ? input.notes : Array.isArray(input.relevant_notes) ? input.relevant_notes : [];
  let monotonicSequenceValid = true, sequenceGapCount = 0, prevSeq: number | null = null, spoofedEventsCount = 0, minSeq = 0, maxSeq = 0;
  const sequenceGaps: Array<{ from: number; to: number }> = [];
  for (const item of rawEvents) {
    const ev = item as Record<string, unknown>, seq = Number(ev.seq ?? ev.event_seq ?? 0);
    if (minSeq === 0 || seq < minSeq) minSeq = seq;
    if (seq > maxSeq) maxSeq = seq;
    if (prevSeq !== null) {
      if (seq <= prevSeq) monotonicSequenceValid = false;
      else if (seq > prevSeq + 1) { sequenceGaps.push({ from: prevSeq + 1, to: seq - 1 }); sequenceGapCount += seq - prevSeq - 1; }
    }
    prevSeq = seq;
    const actor = String(ev.actor_agent ?? ev.agent_id ?? '');
    if (actor && !/^CASPER-\d{2}$/.test(actor)) spoofedEventsCount += 1;
  }
  let verifiedAgentNotesCount = 0, untrustedNotesCount = 0, criticalNotesCount = 0, activeBlockersCount = 0;
  const authorCounts = new Map<string, number>(), typeCounts = new Map<string, number>();
  for (const item of rawNotes) {
    const n = item as Record<string, unknown>;
    const author = String(n.author_agent ?? n.author_agent_id ?? n.agent_id ?? 'unknown');
    const nType = String(n.note_type ?? 'checkpoint').toLowerCase();
    authorCounts.set(author, (authorCounts.get(author) ?? 0) + 1);
    typeCounts.set(nType, (typeCounts.get(nType) ?? 0) + 1);
    if (/^CASPER-\d{2}$/.test(author)) verifiedAgentNotesCount += 1; else untrustedNotesCount += 1;
    if (Number(n.importance ?? 0) >= 4) criticalNotesCount += 1;
    if (nType === 'blocker') activeBlockersCount += 1;
  }
  const calcEntropy = (counts: Map<string, number>) => {
    if (rawNotes.length === 0) return 0;
    let h = 0;
    for (const c of counts.values()) { const p = c / rawNotes.length; if (p > 0) h -= p * Math.log2(p); }
    return Number(h.toFixed(4));
  };
  const cursorObj = (input.sync_cursor && typeof input.sync_cursor === 'object' ? input.sync_cursor : {}) as Record<string, unknown>;
  const cursorSeq = Number(cursorObj.latest_event_id ?? cursorObj.last_seq ?? maxSeq);
  return {
    minSeq, maxSeq, isMonotonic: monotonicSequenceValid, monotonicSequenceValid, sequenceGaps, sequenceGapCount,
    spoofedEventsCount, verifiedAgentNotesCount, untrustedNotesCount, criticalNotesCount, activeBlockersCount,
    agentContributionEntropyBits: calcEntropy(authorCounts), noteTypeEntropyBits: calcEntropy(typeCounts),
    syncCursorLag: Math.max(0, maxSeq - cursorSeq),
  };
}

/**
 * @file server/modules/casper-hub/casperHubTelemetry.ts
 * @description Epistemic Shannon entropy and change-feed telemetry analysis for CASPER HUB.
 */

export interface CasperHubEpistemicTelemetry {
  readonly minSeq: number; readonly maxSeq: number; readonly isMonotonic: boolean;
  readonly sequenceGapCount: number; readonly syncCursorLag: number;
  readonly agentContributionEntropyBits: number; readonly noteTypeEntropyBits: number;
  readonly criticalNotesCount: number; readonly activeBlockersCount: number;
}

function canonicalizeUnicodeText(v: unknown): string {
  return typeof v === 'string' ? v.normalize('NFC').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[٠-٩]/g, (c) => String.fromCharCode(c.charCodeAt(0) + (0x06f0 - 0x0660))).trim() : '';
}

function normalizeNoteImportance(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(1, Math.min(5, Math.trunc(raw)));
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (s === '5' || s === 'critical' || s === 'p0') return 5;
    if (s === '4' || s === 'high' || s === 'p1') return 4;
    if (s === '2' || s === 'low' || s === 'p3') return 2;
    if (s === '1' || s === 'p4') return 1;
  }
  return 3;
}

export function analyzeCasperHubEpistemicState(payload: Record<string, unknown> | null | undefined): CasperHubEpistemicTelemetry {
  const rawFeed = payload?.change_feed ?? payload?.events ?? payload?.changes;
  const feed = Array.isArray(rawFeed) ? (rawFeed as Array<Record<string, unknown>>) : [];
  const rawNotes = payload?.notes ?? payload?.recent_notes;
  const notes = Array.isArray(rawNotes) ? (rawNotes as Array<Record<string, unknown>>) : [];
  const seqs = feed.map((item) => Number(item?.seq ?? item?.event_seq ?? item?.id)).filter((n) => Number.isFinite(n) && n >= 0);
  let isMonotonic = true, sequenceGapCount = 0;
  for (let i = 1; i < seqs.length; i++) {
    if (seqs[i] <= seqs[i - 1]) isMonotonic = false;
    else if (seqs[i] - seqs[i - 1] > 1) sequenceGapCount += seqs[i] - seqs[i - 1] - 1;
  }
  const minSeq = seqs.length > 0 ? Math.min(...seqs) : 0, maxSeq = seqs.length > 0 ? Math.max(...seqs) : 0;
  const cursorObj = payload?.sync_cursor as Record<string, unknown> | undefined;
  const lastSeq = Number(cursorObj?.last_seq ?? payload?.next_cursor ?? maxSeq);
  const syncCursorLag = Number.isFinite(lastSeq) ? Math.max(0, maxSeq - lastSeq) : 0;
  const agentCounts = new Map<string, number>(), typeCounts = new Map<string, number>();
  let criticalNotesCount = 0, activeBlockersCount = 0;
  for (const n of notes) {
    const a = canonicalizeUnicodeText(n?.author_agent ?? n?.author_agent_id ?? n?.agent_id) || 'UNKNOWN';
    const t = canonicalizeUnicodeText(n?.note_type) || 'checkpoint';
    agentCounts.set(a, (agentCounts.get(a) ?? 0) + 1); typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    if (normalizeNoteImportance(n?.importance) >= 4) criticalNotesCount++;
    if (t === 'blocker') activeBlockersCount++;
  }
  if (notes.length === 0 && feed.length > 0) {
    for (const ev of feed) {
      const a = canonicalizeUnicodeText(ev?.actor_agent_id ?? ev?.author_agent ?? ev?.agent_id) || 'UNKNOWN';
      const t = canonicalizeUnicodeText(ev?.event_type ?? ev?.note_type) || 'event';
      agentCounts.set(a, (agentCounts.get(a) ?? 0) + 1); typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    }
  }
  const sampleTotal = notes.length > 0 ? notes.length : feed.length;
  const ent = (m: Map<string, number>, tot: number) => {
    if (tot <= 1 || m.size <= 1) return 0;
    let s = 0; for (const c of m.values()) { if (c > 0) { const p = c / tot; s -= p * Math.log2(p); } }
    return Math.round(s * 1000) / 1000;
  };
  return {
    minSeq, maxSeq, isMonotonic, sequenceGapCount, syncCursorLag,
    agentContributionEntropyBits: ent(agentCounts, sampleTotal), noteTypeEntropyBits: ent(typeCounts, sampleTotal),
    criticalNotesCount, activeBlockersCount,
  };
}

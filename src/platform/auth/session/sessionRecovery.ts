import { getTemporaryStorage } from '../../storage';

export interface PreservedSessionDraft {
  routePath: string;
  searchParams: string;
  formDrafts: Record<string, unknown>;
  savedAt: number;
}

const DRAFT_RECOVERY_KEY = 'session_expiry_preserved_draft';

export function preserveSessionDraftOnExpiry(draft: Omit<PreservedSessionDraft, 'savedAt'>): PreservedSessionDraft {
  const fullDraft: PreservedSessionDraft = {
    ...draft,
    savedAt: Date.now(),
  };
  getTemporaryStorage().set(DRAFT_RECOVERY_KEY, fullDraft, 30 * 60 * 1000);
  return fullDraft;
}

export function recoverPreservedSessionDraft(): PreservedSessionDraft | null {
  return getTemporaryStorage().get<PreservedSessionDraft | null>(DRAFT_RECOVERY_KEY, null);
}

export function clearPreservedSessionDraft(): void {
  getTemporaryStorage().remove(DRAFT_RECOVERY_KEY);
}

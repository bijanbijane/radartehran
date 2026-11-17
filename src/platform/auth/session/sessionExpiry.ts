import { getAuthClient } from '../core/authClient';
import { preserveSessionDraftOnExpiry, PreservedSessionDraft } from './sessionRecovery';

export interface SessionExpiryContext {
  reason: 'TOKEN_EXPIRED' | 'REFRESH_FAILED' | 'REVOKED' | 'IDLE_TIMEOUT';
  routePath: string;
  searchParams?: string;
  formDrafts?: Record<string, unknown>;
}

export function handleSessionExpiry(context: SessionExpiryContext): PreservedSessionDraft {
  const preserved = preserveSessionDraftOnExpiry({
    routePath: context.routePath,
    searchParams: context.searchParams ?? '',
    formDrafts: context.formDrafts ?? {},
  });
  const client = getAuthClient();
  client.transition('SESSION_EXPIRED', {
    reason: context.reason,
    preservedRoute: context.routePath,
  });
  return preserved;
}

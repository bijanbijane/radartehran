/**
 * Worker-safe deletion job bootstrap helpers (no Node I/O).
 */

import { ALL_USER_OWNED_DOMAIN_SOURCES, type DomainDeletionStepJournal, type UserOwnedDomainSource } from './types.ts';

export function createInitialDomainSteps(nowIso: string): Record<UserOwnedDomainSource, DomainDeletionStepJournal> {
  const steps = {} as Record<UserOwnedDomainSource, DomainDeletionStepJournal>;
  for (const source of ALL_USER_OWNED_DOMAIN_SOURCES) {
    steps[source] = {
      source,
      status: 'PENDING',
      resumableCursor: null,
      batchesProcessed: 0,
      permanentlyDeletedIds: [],
      retainedRecords: [],
      attempts: 0,
      updatedAtIso: nowIso,
    };
  }
  return steps;
}
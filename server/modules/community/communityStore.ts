/** @file server/modules/community/communityStore.ts — Unified Repository Compatibility Facade & Test Reset (Stage 3 Converged) */
import { MockFirestoreCommunityStore } from './communityFirestoreAdapter';
import { communityUnifiedRepository } from './communityUnifiedRepository';

/**
 * Legacy file-based JSON store is deprecated (RT-SOCIAL-WAVE1-COMMUNITY-FIRESTORE-003).
 * All primary runtime operations flow exclusively through CommunityUnifiedRepository.
 */
export function resetCommunityServerStoreForTests(): void {
  communityUnifiedRepository.rateLimiter.resetForTests();
  const mockStore = new MockFirestoreCommunityStore();
  communityUnifiedRepository.setStore(mockStore);
}

export { communityUnifiedRepository };

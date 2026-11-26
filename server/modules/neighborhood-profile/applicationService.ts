import type { NipsNeighborhoodProfile } from './types';
import type { NipsProfileAssemblyInput } from './assembly';
import { assembleNipsNeighborhoodProfile } from './assembly';
import type { NipsProfileRepository, NipsPublicationScope } from './repository';
import type { NipsPublicationPolicy } from './validation';
import { NIPS_DEFAULT_PUBLICATION_POLICY } from './validation';
import type { NipsPublicationAudience } from './publication';
import { createApprovedNipsPublicationRecord } from './publication';
import { NipsProfileReadService, type NipsPublicProfileView } from './repository';

export interface NipsPublishSnapshotInput {
  readonly snapshotId: string;
  readonly canonicalEntityId: string;
  readonly publicationId: string;
  readonly productKey: string;
  readonly audience: NipsPublicationAudience;
  readonly decidedAt: string;
  readonly actorReference: string | null;
}

/**
 * Application boundary for the NIPS domain. It coordinates domain services
 * with a persistence port but intentionally does not choose a database binding.
 */
export class NipsProfileApplicationService {
  private readonly readService: NipsProfileReadService;

  constructor(
    private readonly repository: NipsProfileRepository,
    private readonly policy: NipsPublicationPolicy = NIPS_DEFAULT_PUBLICATION_POLICY
  ) {
    this.readService = new NipsProfileReadService(repository, policy);
  }

  async assembleAndSaveDraft(input: NipsProfileAssemblyInput): Promise<NipsNeighborhoodProfile> {
    const profile = await assembleNipsNeighborhoodProfile(input);
    await this.repository.saveImmutableSnapshot(profile);
    return profile;
  }

  async publishSnapshot(input: NipsPublishSnapshotInput): Promise<void> {
    const profile = await this.repository.findSnapshotById(input.snapshotId);
    if (!profile) throw new Error('NIPS_SNAPSHOT_NOT_FOUND');
    if (profile.identity.data.canonicalEntityId !== input.canonicalEntityId) {
      throw new Error('NIPS_SNAPSHOT_CANONICAL_ENTITY_MISMATCH');
    }

    const scope: NipsPublicationScope = {
      canonicalEntityId: input.canonicalEntityId,
      productKey: input.productKey,
      audience: input.audience,
    };
    const current = await this.repository.findActivePublication(scope);
    const publication = await createApprovedNipsPublicationRecord({
      profile,
      snapshotId: input.snapshotId,
      canonicalEntityId: input.canonicalEntityId,
      publicationId: input.publicationId,
      productKey: input.productKey,
      audience: input.audience,
      decidedAt: input.decidedAt,
      actorReference: input.actorReference,
      policy: this.policy,
    });

    await this.repository.activatePublication({
      publication,
      expectedActivePublicationId: current?.publicationId ?? null,
    });
  }

  getActivePublicProfile(
    scope: Omit<NipsPublicationScope, 'audience'>
  ): Promise<NipsPublicProfileView | null> {
    return this.readService.getActivePublicProfile(scope);
  }
}

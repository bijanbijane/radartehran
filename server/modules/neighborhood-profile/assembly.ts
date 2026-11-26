import { NIPS_PROFILE_SCHEMA_VERSION, NIPS_DOMAIN_IDS, type NipsNeighborhoodProfile, type NipsProfileDomainMap, type NipsProfileQuality } from './types';
import { computeNipsProfileContentHash } from './canonicalHash';
import { validateNipsNeighborhoodProfile } from './validation';

export interface NipsProfileAssemblyInput {
  readonly profileId: string;
  readonly profileVersion: number;
  readonly canonicalEntityId: string;
  readonly identity: NipsProfileDomainMap['identity'];
  readonly domains: Omit<NipsProfileDomainMap, 'identity'>;
  readonly createdAt: string;
  readonly assembledAt: string;
  readonly assemblyBuildId: string;
  readonly methodologyVersion: string;
  readonly publicationPolicyVersion: string;
  readonly sourceWatermarks: Readonly<Record<string, string>>;
}

export class NipsProfileAssemblyError extends Error {
  readonly code: string;
  readonly issues: readonly { readonly code: string; readonly path: string; readonly message: string }[];

  constructor(
    code: string,
    message: string,
    issues: readonly { readonly code: string; readonly path: string; readonly message: string }[] = []
  ) {
    super(message);
    this.name = 'NipsProfileAssemblyError';
    this.code = code;
    this.issues = issues;
  }
}

function createQualitySummary(profile: Pick<NipsNeighborhoodProfile, 'identity' | 'domains'>): NipsProfileQuality {
  const envelopes = [profile.identity, ...Object.values(profile.domains)];
  return {
    domainCount: NIPS_DOMAIN_IDS.length,
    readyDomainCount: envelopes.filter((domain) => domain.state === 'READY').length,
    partialDomainCount: envelopes.filter((domain) => domain.state === 'PARTIAL').length,
    blockedDomainCount: envelopes.filter((domain) => domain.state === 'BLOCKED').length,
    staleDomainCount: envelopes.filter((domain) => domain.state === 'STALE').length,
    publishableMetricCount: envelopes.reduce((total, domain) => total + domain.readiness.publishableMetricCount, 0),
    blockedMetricCount: envelopes.reduce((total, domain) => total + domain.readiness.blockedMetricCount, 0),
    unavailableMetricCount: envelopes.reduce((total, domain) => total + domain.readiness.unavailableMetricCount, 0),
    overallReasons: [...new Set(envelopes.flatMap((domain) => domain.readiness.reasons))],
  };
}

/**
 * Assembles an immutable draft read-model from already-authorized providers.
 * This function does not resolve geography, ingest source data, or write to a DB.
 */
export async function assembleNipsNeighborhoodProfile(
  input: NipsProfileAssemblyInput
): Promise<NipsNeighborhoodProfile> {
  const requiredDomains = NIPS_DOMAIN_IDS.filter((domainId): domainId is Exclude<typeof NIPS_DOMAIN_IDS[number], 'identity'> => domainId !== 'identity');
  const actualDomains = Object.keys(input.domains ?? {});
  if (
    actualDomains.length !== requiredDomains.length ||
    requiredDomains.some((domainId) => !actualDomains.includes(domainId))
  ) {
    throw new NipsProfileAssemblyError(
      'NIPS_DOMAIN_SET_INCOMPLETE',
      'A NIPS snapshot must contain every non-identity profile domain exactly once.'
    );
  }

  const identity = input.identity?.data;
  if (
    !identity ||
    identity.canonicalEntityId !== input.canonicalEntityId ||
    identity.identityStatus !== 'CONFIRMED_CANONICAL' ||
    !Number.isSafeInteger(identity.registryRevision) ||
    identity.registryRevision < 1
  ) {
    throw new NipsProfileAssemblyError(
      'NIPS_CANONICAL_IDENTITY_NOT_CONFIRMED',
      'Snapshot assembly requires a confirmed canonical identity and positive registry revision.'
    );
  }

  if (input.identity.domainId !== 'identity' || input.identity.state !== 'READY') {
    throw new NipsProfileAssemblyError(
      'NIPS_IDENTITY_ENVELOPE_NOT_READY',
      'The identity envelope must be READY before a neighborhood snapshot can be assembled.'
    );
  }

  for (const domainId of requiredDomains) {
    if (input.domains[domainId].domainId !== domainId) {
      throw new NipsProfileAssemblyError(
        'NIPS_DOMAIN_ENVELOPE_KEY_MISMATCH',
        'Domain envelope ID does not match its canonical profile key: ' + domainId
      );
    }
  }

  const profileWithoutHash: NipsNeighborhoodProfile = {
    metadata: {
      profileId: input.profileId,
      schemaVersion: NIPS_PROFILE_SCHEMA_VERSION,
      profileVersion: input.profileVersion,
      publicationState: 'DRAFT',
      createdAt: input.createdAt,
      assembledAt: input.assembledAt,
      publishedAt: null,
      assemblyBuildId: input.assemblyBuildId,
      methodologyVersion: input.methodologyVersion,
      publicationPolicyVersion: input.publicationPolicyVersion,
      sourceWatermarks: input.sourceWatermarks,
      contentHash: null,
    },
    identity: input.identity,
    domains: input.domains,
    quality: createQualitySummary({ identity: input.identity, domains: input.domains }),
  };

  const validationIssues = validateNipsNeighborhoodProfile(profileWithoutHash);
  if (validationIssues.length > 0) {
    throw new NipsProfileAssemblyError(
      'NIPS_PROFILE_VALIDATION_FAILED',
      'Snapshot assembly stopped because the assembled profile violates its domain contract.',
      validationIssues
    );
  }

  const contentHash = await computeNipsProfileContentHash(profileWithoutHash);
  return {
    ...profileWithoutHash,
    metadata: { ...profileWithoutHash.metadata, contentHash },
  };
}

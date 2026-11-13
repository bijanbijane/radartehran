import { CasperHubClient, getCasperHubConfigStatus } from './casperHubClient';
import { CASPER_AGENT_ID } from './casperHubTypes';

export * from './casperHubClient';
export * from './casperHubRoutes';
export {
  CASPER_AGENT_ID,
  CASPER_AGENT_ROADMAP_ID,
  CasperHubClientError,
  redactSensitiveText,
  redactSensitiveTokenText,
  buildDeterministicNoteIdempotencyKey,
  registerRuntimeHubTokenForRedaction,
  assertCasper02Identity,
  resolveCasperHubConfig,
} from './casperHubTypes';
export type {
  CasperHubAgentIdentity,
  CasperHubBootstrapData,
  CasperHubChangeEvent,
  CasperHubChangesData,
  CasperHubChangesQuery,
  CasperHubNotePayload,
  CasperHubNoteRecord,
  CasperHubWhoamiData,
  CasperHubErrorCode,
} from './casperHubTypes';

export function getCasperHubClient(opts?: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch } | Record<string, string | undefined>): CasperHubClient {
  if (opts && typeof opts === 'object' && 'env' in opts && (opts as any).env !== undefined) {
    return new CasperHubClient(opts as { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch });
  }
  return new CasperHubClient({ env: opts as Record<string, string | undefined> });
}

export function getCasperHubStatus(env: Record<string, string | undefined> = process.env) {
  const token = env?.CASPER_HUB_TOKEN?.trim();
  const tokenConfigured = Boolean(token);
  return {
    ...getCasperHubConfigStatus(env),
    agentId: env?.EXPECTED_AGENT_ID || CASPER_AGENT_ID,
    connectionState: tokenConfigured ? 'CONFIGURED_READY_TO_VERIFY' : 'UNCONFIGURED_AWAITING_SECRET',
  };
}

/** @file server/modules/data-governance/dgovRepository.ts — Durable Server Repository for Data Governance & Provenance */
import crypto from 'node:crypto';
import { AtomicJsonRepository } from '../shared/atomicJsonRepository';
import {
  DataGovernanceEngine,
  INITIAL_DATA_SOURCES,
  INITIAL_METHODOLOGIES,
} from '../../../src/features/data-governance/services/dataGovernanceEngine';
import type {
  DataClaimRecord,
  DataCorrectionProposal,
  DataSourceRecord,
  EntityVersionRecord,
  EvidenceRecord,
  MethodologyRecord,
  ProvenanceEdge,
  ReconciliationCase,
} from '../../../src/features/data-governance/models/dataGovernance.types';

export interface PersistedDgovSnapshot {
  schemaVersion: number;
  sources: DataSourceRecord[];
  claims: DataClaimRecord[];
  evidences: EvidenceRecord[];
  lineageEdges: ProvenanceEdge[];
  reconciliationCases: ReconciliationCase[];
  entityVersions: EntityVersionRecord[];
  methodologies: MethodologyRecord[];
  correctionProposals: DataCorrectionProposal[];
  auditLogs: Array<{ id: string; actor: string; action: string; targetId: string; reasonFa: string; timestamp: string }>;
  updatedAtIso: string;
}

const dgovFileRepo = new AtomicJsonRepository<PersistedDgovSnapshot>('data-governance-state.json');

export function createCleanDgovSnapshot(): PersistedDgovSnapshot {
  return {
    schemaVersion: 2,
    sources: INITIAL_DATA_SOURCES.map((s) => ({ ...s, usagePolicy: { ...s.usagePolicy } })),
    claims: [],
    evidences: [],
    lineageEdges: [],
    reconciliationCases: [],
    entityVersions: [],
    methodologies: INITIAL_METHODOLOGIES.map((m) => ({ ...m })),
    correctionProposals: [],
    auditLogs: [],
    updatedAtIso: new Date().toISOString(),
  };
}

let serverDgovEngineInstance: DataGovernanceEngine | null = null;

export function getServerDgovEngine(): DataGovernanceEngine {
  if (serverDgovEngineInstance) return serverDgovEngineInstance;
  const snap = dgovFileRepo.load(createCleanDgovSnapshot);
  const engine = new DataGovernanceEngine({ seedDemo: false });
  engine.hydrateState(snap);
  serverDgovEngineInstance = engine;
  return engine;
}

export function persistServerDgovEngine(immediate = false): void {
  if (!serverDgovEngineInstance) return;
  const exported = serverDgovEngineInstance.exportState();
  const snap: PersistedDgovSnapshot = {
    schemaVersion: 2,
    ...exported,
    updatedAtIso: new Date().toISOString(),
  };
  if (immediate) dgovFileRepo.writeImmediate(snap);
  else dgovFileRepo.saveDebounced(snap);
}

export function resetServerDgovRepositoryForTests(seedDemo = false): DataGovernanceEngine {
  dgovFileRepo.resetInMemoryCacheForTests();
  const engine = new DataGovernanceEngine({ seedDemo });
  serverDgovEngineInstance = engine;
  return engine;
}

export function recordCorrectionProposalInDgov(input: {
  entityType?: DataClaimRecord['entityType'];
  entityId: string;
  attribute: string;
  currentValue: string | number;
  proposedValue: string | number;
  reasonFa: string;
  proposerUserId: string;
  proposerVerifiedIdentity: boolean;
  evidenceId?: string;
}): { proposal: DataCorrectionProposal; trackingCode: string } {
  const engine = getServerDgovEngine();
  const id = `corr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const proposal: DataCorrectionProposal = {
    id,
    entityType: input.entityType || 'NEIGHBORHOOD',
    entityId: input.entityId,
    attribute: input.attribute,
    currentValue: input.currentValue,
    proposedValue: input.proposedValue,
    reasonFa: input.reasonFa,
    evidenceId: input.evidenceId,
    proposerUserId: input.proposerUserId,
    proposerVerifiedIdentity: input.proposerVerifiedIdentity,
    proposerVerifiedCredential: false,
    status: 'TRIAGED',
    createdAt: new Date().toISOString(),
  };
  engine.addCorrectionProposal(proposal);
  persistServerDgovEngine();
  return { proposal, trackingCode: id };
}

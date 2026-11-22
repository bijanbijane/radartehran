/**
 * @file tests/package4-domain-rules-and-gate.test.ts
 * @description RT-DOMAIN-CRITICAL-032 — Verifies fail-closed Firestore security rules,
 * query-derived composite indexes, firebase-blueprint.json integrity, route catalog parity,
 * and zero mock/in-memory reachability from server.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REGISTERED_API_ROUTES } from '../src/utils/expressRouteCatalog';

const root = path.resolve(import.meta.dirname, '..');
const readText = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

const BACKEND_ONLY_PACKAGE4_COLLECTIONS = [
  // Trust & Safety (RT-TS-CRITICAL-026..029)
  'socialModerationCases',
  'socialModerationEvents',
  'socialModerationAppeals',
  'socialActiveReportLocks',
  // Real Estate Transactions (RT-TRANSACTION-CRITICAL-030)
  'real_estate_transactions',
  'real_estate_transaction_participants',
  'real_estate_transaction_offers',
  'real_estate_transaction_negotiations',
  'real_estate_transaction_terms',
  'real_estate_transaction_conditions',
  'real_estate_transaction_milestones',
  'real_estate_transaction_contracts',
  'real_estate_transaction_closings',
  'real_estate_transaction_handovers',
  'real_estate_transaction_terminations',
  'real_estate_transaction_completed_records',
  'real_estate_transaction_history',
  'real_estate_transaction_idempotency',
  'real_estate_transaction_outbox',
  // Dispute Resolution (RT-DISPUTE-CRITICAL-031)
  'dispute_cases',
  'dispute_parties',
  'dispute_claims',
  'dispute_responses',
  'dispute_evidence',
  'dispute_communications',
  'dispute_deadlines',
  'dispute_mediation_sessions',
  'dispute_settlement_proposals',
  'dispute_settlements',
  'dispute_resolution_outcomes',
  'dispute_case_history',
  'dispute_idempotency',
  'dispute_notification_outbox',
  // Canonical Cross-Module Authority
  'pr_canonical_properties',
  'property_ownership_rights',
  'property_ownership_transfers',
  'brokerage_mandates',
  'payment_intents',
  'media_object_metadata_v2',
] as const;

test('RT-DOMAIN-CRITICAL-032: firestore.rules enforces backend-only deny on all Package 4 collections', () => {
  const rules = readText('firestore.rules');
  for (const col of BACKEND_ONLY_PACKAGE4_COLLECTIONS) {
    const pattern = new RegExp(`match\\s+/${col}/\\{[A-Za-z0-9_]+\\}\\s*\\{\\s*allow\\s+read,\\s*write:\\s*if\\s+false;\\s*\\}`);
    assert.match(rules, pattern, `Expected explicit backend-only deny rule in firestore.rules for /${col}/{...}`);
  }
});

test('RT-DOMAIN-CRITICAL-032: firestore.indexes.json contains all query-derived composite indexes', () => {
  const parsed = JSON.parse(readText('firestore.indexes.json')) as {
    indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string; order?: string }> }>;
  };
  assert.ok(Array.isArray(parsed.indexes));
  const hasIndex = (col: string, fields: string[]) =>
    parsed.indexes.some(
      (idx) =>
        idx.collectionGroup === col &&
        idx.fields.length === fields.length &&
        idx.fields.every((f, i) => f.fieldPath === fields[i]),
    );

  assert.equal(hasIndex('socialModerationCases', ['status', 'updatedAtIso']), true);
  assert.equal(hasIndex('socialReports', ['caseId', 'createdAtIso']), true);
  assert.equal(hasIndex('socialModerationEvents', ['caseId', 'createdAtIso']), true);
  assert.equal(hasIndex('socialModerationAppeals', ['caseId', 'submittedAtIso']), true);
  assert.equal(hasIndex('real_estate_transactions', ['propertyId', 'createdAt']), true);
  assert.equal(hasIndex('real_estate_transaction_history', ['transactionId', 'recordedAtIso']), true);
  assert.equal(hasIndex('dispute_cases', ['propertyReferenceId', 'createdAtIso']), true);
  assert.equal(hasIndex('dispute_case_history', ['caseId', 'recordedAtIso']), true);
  assert.equal(hasIndex('property_ownership_rights', ['propertyId', 'partyId', 'status']), true);
  assert.equal(hasIndex('brokerage_mandates', ['propertyId', 'partyId', 'status']), true);
});

test('RT-DOMAIN-CRITICAL-032: firebase-blueprint.json maps every new Package 4 collection to a declared entity', () => {
  const blueprint = JSON.parse(readText('firebase-blueprint.json')) as {
    entities: Record<string, unknown>;
    firestore: Record<string, { schema: { $ref: string } }>;
  };
  for (const col of BACKEND_ONLY_PACKAGE4_COLLECTIONS) {
    const entry = Object.entries(blueprint.firestore).find(([k]) => k.startsWith(`/${col}/`));
    assert.ok(entry, `Missing /${col}/{...} in firebase-blueprint.json`);
    const refName = entry[1].schema.$ref.replace('#/entities/', '');
    assert.ok(blueprint.entities[refName], `Broken entity $ref ${entry[1].schema.$ref} for /${col}`);
  }
});

test('RT-DOMAIN-CRITICAL-032: server.ts mounts Real Estate Transactions & Dispute Resolution fail-closed with zero mock stores', () => {
  const serverSrc = readText('server.ts');
  assert.equal(serverSrc.includes('registerRealEstateTransactionsRoutes(app, { service: null })'), true);
  assert.equal(serverSrc.includes('registerDisputeResolutionRoutes(app, { service: null })'), true);
  assert.equal(serverSrc.includes('createInMemoryRealEstateTransactionsModule'), false);
  assert.equal(serverSrc.includes('createInMemoryDisputeResolutionModule'), false);
  assert.equal(serverSrc.includes('InMemoryRealEstateTransactionStore'), false);
  assert.equal(serverSrc.includes('InMemoryDisputeStore'), false);
});

test('RT-DOMAIN-CRITICAL-032: expressRouteCatalog includes all new Trust & Safety, Transactions, and Dispute endpoints', () => {
  const paths = new Set(REGISTERED_API_ROUTES.map((r) => `${r.method} ${r.path}`));
  assert.equal(paths.has('GET /api/v1/trust-safety/cases/:id/reports'), true);
  assert.equal(paths.has('POST /api/v1/trust-safety/cases/:id/appeals'), true);
  assert.equal(paths.has('POST /api/v1/trust-safety/appeals/:appealId/resolve'), true);
  assert.equal(paths.has('POST /api/v1/real-estate-transactions/cases'), true);
  assert.equal(paths.has('GET /api/v1/real-estate-transactions/properties/:canonicalPropertyId/history'), true);
  assert.equal(paths.has('POST /api/disputes/cases'), true);
  assert.equal(paths.has('GET /api/disputes/cases/:caseId/timeline'), true);
});

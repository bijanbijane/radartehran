import assert from 'node:assert/strict';
import { classifyExportFromRegistry, lookupDatasetRegistry } from '../server/modules/analytics-research/datasetClassificationRegistry';

const reg = lookupDatasetRegistry('analytics.place.metric_snapshot');
assert.ok(reg);
assert.equal(reg?.dataClassification, 'PUBLIC');

const fromClient = classifyExportFromRegistry('analytics.place.metric_snapshot', 'INTERNAL');
assert.equal(fromClient.classification, 'PUBLIC');
assert.equal(fromClient.clientMismatch, true);

const honest = classifyExportFromRegistry('analytics.place.metric_snapshot', 'PUBLIC');
assert.equal(honest.clientMismatch, false);

console.log('analytics-server-derived-classification.test.ts PASS');
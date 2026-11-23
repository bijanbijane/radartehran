import assert from 'node:assert/strict';
import { validateAndSanitizeTelemetryItem } from '../server/modules/telemetry/telemetryValidator';

const fraud = validateAndSanitizeTelemetryItem(
  { eventName: 'fraud_probe', category: 'FRAUD_SECURITY', sessionSeed: 'a' },
  { origin: 'web_client' },
);
assert.equal(fraud.valid, false);
assert.equal(fraud.errorCode, 'FORBIDDEN_CLIENT_CATEGORY');

const healthBackend = validateAndSanitizeTelemetryItem(
  { eventName: 'worker_boot', category: 'SYSTEM_HEALTH', sessionSeed: 'svc' },
  { origin: 'backend_service', dailySalt: 'salt-test-12345678901234567890' },
);
assert.equal(healthBackend.valid, true);
assert.equal(healthBackend.sanitizedEvent?.category, 'SYSTEM_HEALTH');

console.log('telemetry-privacy-classification.test.ts PASS');
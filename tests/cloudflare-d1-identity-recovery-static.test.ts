import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const scriptPath = path.resolve(process.cwd(), 'scripts/cloudflare/recover-user-d1-identity-migrations.mjs');
const source = fs.readFileSync(scriptPath, 'utf8');

test('production identity recovery is pinned to the known Cloudflare account and USER_DB UUID', () => {
  assert.match(source, /EXPECTED_ACCOUNT_ID = '5bafb2033937006704e81afcc0b18b38'/);
  assert.match(source, /EXPECTED_DATABASE_ID = 'fbb98e6b-5200-4047-b4bc-15a51c06aa84'/);
  assert.match(source, /EXPECTED_BINDING = 'USER_DB'/);
  assert.match(source, /binding\.database_id\s*!==\s*EXPECTED_DATABASE_ID/);
});

test('production identity recovery defaults to dry-run and requires an explicit --apply', () => {
  assert.match(source, /return \{ apply: argv\.includes\('--apply'\) \}/);
  assert.match(source, /if \(apply\) await query\(target, ddl\)/);
  assert.match(source, /if \(apply\) await query\(target, sql\)/);
  assert.match(source, /Dry-run complete\. No DDL or migration-ledger writes were performed\./);
});

test('production identity recovery contains no destructive table/data operations or 0010 migration', () => {
  assert.doesNotMatch(source, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(source, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(source, /\bUPDATE\s+(?:user_profiles|user_sessions|auth_identities)\b/i);
  assert.doesNotMatch(source, /0010_/);
  assert.match(source, /0007_cloudflare_native_identity_and_sessions\.sql/);
  assert.match(source, /0008_sms_otp_ip_rate_limit\.sql/);
  assert.match(source, /0009_sms_otp_code_digest\.sql/);
});

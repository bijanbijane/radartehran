import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(
  path.resolve(process.cwd(), 'scripts/cloudflare/recover-user-d1-identity-migrations.mjs'),
  'utf8',
);

test('USER_DB recovery is pinned to the Radar Cloudflare account and exact production database UUID', () => {
  assert.match(source, /EXPECTED_ACCOUNT_ID = '5bafb2033937006704e81afcc0b18b38'/);
  assert.match(source, /EXPECTED_DATABASE_NAME = 'radar-user-db'/);
  assert.match(source, /EXPECTED_DATABASE_ID = 'fbb98e6b-5200-4047-b4bc-15a51c06aa84'/);
  assert.match(source, /configuredAccountId !== EXPECTED_ACCOUNT_ID/);
  assert.match(source, /String\(binding\.database_id \|\| ''\) !== EXPECTED_DATABASE_ID/);
  assert.doesNotMatch(source, /config\.account_id/);
});

test('USER_DB recovery remains dry-run by default and requires explicit --apply for DDL and ledger writes', () => {
  assert.match(source, /return \{ apply: argv\.includes\('--apply'\) \}/);
  assert.match(source, /if \(apply\) await query\(target, ddl\)/);
  assert.match(source, /if \(apply\) await query\(target, sql\)/);
  assert.match(source, /if \(!apply\)[\s\S]*?Dry-run complete\. No DDL or migration-ledger writes were performed\./);
});

test('USER_DB recovery only reconciles migrations 0007–0009 and contains no destructive DML/DDL', () => {
  assert.match(source, /0007_cloudflare_native_identity_and_sessions\.sql/);
  assert.match(source, /0008_sms_otp_ip_rate_limit\.sql/);
  assert.match(source, /0009_sms_otp_code_digest\.sql/);
  assert.doesNotMatch(source, /0010_/);
  assert.doesNotMatch(source, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(source, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(source, /\bUPDATE\s+(?:user_profiles|user_sessions|auth_identities)\b/i);
});

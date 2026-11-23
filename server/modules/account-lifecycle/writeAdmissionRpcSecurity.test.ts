/**
 * D-H2-01A — RPC HMAC binding security tests (unit, Web Crypto).
 */

import assert from 'node:assert/strict';
import {
  signWriteAdmissionRpcRequest,
  verifyWriteAdmissionRpcRequest,
  sha256BodyDigestHex,
  buildWriteAdmissionRpcSignaturePayload,
} from './writeAdmissionRpcAuth.ts';
import { INTERNAL_WRITE_ADMISSION_RPC_PATH } from './writeAdmissionRpcContract.ts';

const SECRET = 'test-write-admission-rpc-secret-32b';

async function run(): Promise<void> {
  const body = '{"targetUid":"u1"}';
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = 'nonce_sec_test_1';
  const sig = await signWriteAdmissionRpcRequest({ secret: SECRET, method: 'POST', timestamp: ts, nonce, bodyJson: body });

  assert.equal((await verifyWriteAdmissionRpcRequest({
    secret: SECRET, method: 'POST', timestamp: ts, nonce, bodyJson: body, providedSignature: sig,
  })).ok, true);

  assert.equal((await verifyWriteAdmissionRpcRequest({
    secret: SECRET, method: 'PATCH', timestamp: ts, nonce, bodyJson: body, providedSignature: sig,
  })).ok, false);

  const digest = await sha256BodyDigestHex(body);
  const forgedPayload = buildWriteAdmissionRpcSignaturePayload({
    method: 'POST',
    path: '/api/wrong/path',
    timestamp: ts,
    nonce,
    bodyDigestHex: digest,
  });
  assert.notEqual(forgedPayload, `${'POST'}\n${INTERNAL_WRITE_ADMISSION_RPC_PATH}\n${ts}\n${nonce}\n${digest}`);

  const badBodySig = await signWriteAdmissionRpcRequest({
    secret: SECRET, method: 'POST', timestamp: ts, nonce, bodyJson: '{"targetUid":"u2"}',
  });
  assert.equal((await verifyWriteAdmissionRpcRequest({
    secret: SECRET, method: 'POST', timestamp: ts, nonce, bodyJson: body, providedSignature: badBodySig,
  })).ok, false);

  const badNonceSig = await signWriteAdmissionRpcRequest({
    secret: SECRET, method: 'POST', timestamp: ts, nonce: 'other_nonce', bodyJson: body,
  });
  assert.equal((await verifyWriteAdmissionRpcRequest({
    secret: SECRET, method: 'POST', timestamp: ts, nonce, bodyJson: body, providedSignature: badNonceSig,
  })).ok, false);

  const futureTs = String(Math.floor(Date.now() / 1000) + 3600);
  const futureSig = await signWriteAdmissionRpcRequest({ secret: SECRET, method: 'POST', timestamp: futureTs, nonce, bodyJson: body });
  assert.equal((await verifyWriteAdmissionRpcRequest({
    secret: SECRET, method: 'POST', timestamp: futureTs, nonce, bodyJson: body, providedSignature: futureSig,
  })).ok, false);

  assert.equal((await verifyWriteAdmissionRpcRequest({
    secret: '', method: 'POST', timestamp: ts, nonce, bodyJson: body, providedSignature: sig,
  })).ok, false);

  console.log('writeAdmissionRpcSecurity.test.ts: PASSED (unit)');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
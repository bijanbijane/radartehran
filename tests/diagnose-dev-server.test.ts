import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {
  auditAllEnvironmentVariables,
  runDevServerDiagnostics,
  validateProxyTargetReachability,
} from '../scripts/diagnose-dev-server';

test('auditAllEnvironmentVariables iterates all vars, validates VITE_DEV_PORT and VITE_API_PROXY_TARGET, and redacts secrets', () => {
  const audit = auditAllEnvironmentVariables({
    NODE_ENV: 'development',
    PORT: '8080',
    VITE_DEV_PORT: '8080',
    VITE_API_PROXY_TARGET: 'http://user:pass123@127.0.0.1:3001/',
    RADAR_DEV_SPLIT: '1',
    GEMINI_API_KEY: 'AIzaSySecretKeyDoNotLeak123456789',
    ADMIN_API_SECRET: 'super-secret-admin-password-value',
    CUSTOM_PRIVATE_TOKEN: 'tok_live_987654321',
  });

  assert.equal(audit.totalEnvVarsScanned, 8);
  assert.equal(audit.viteDevPort.parsedPort, 8080);
  assert.equal(audit.viteDevPort.valid, true);
  assert.equal(
    audit.viteDevPort.warnings.includes('VITE_DEV_PORT_8080_CONFLICTS_WITH_INGRESS_NGINX'),
    true,
  );
  assert.equal(audit.viteApiProxyTarget.devSplitEnabled, true);
  assert.equal(audit.viteApiProxyTarget.effectiveTargetSanitized, 'http://127.0.0.1:3001');

  const serialized = JSON.stringify(audit);
  assert.equal(serialized.includes('pass123'), false);
  assert.equal(serialized.includes('AIzaSySecretKey'), false);
  assert.equal(serialized.includes('super-secret-admin'), false);
  assert.equal(serialized.includes('tok_live_987654321'), false);

  const geminiEntry = audit.allEntries.find((e) => e.key === 'GEMINI_API_KEY');
  assert.equal(geminiEntry?.category, 'redacted');
  assert.match(geminiEntry?.displayValue ?? '', /^\[REDACTED len=\d+\]$/);
});

test('auditAllEnvironmentVariables flags invalid VITE_DEV_PORT and inactive proxy target', () => {
  const audit = auditAllEnvironmentVariables({
    VITE_DEV_PORT: '99999',
    VITE_API_PROXY_TARGET: 'http://127.0.0.1:3001',
  });

  assert.equal(audit.viteDevPort.valid, false);
  assert.equal(audit.viteDevPort.warnings.includes('INVALID_VITE_DEV_PORT:99999'), true);
  assert.equal(
    audit.viteApiProxyTarget.warnings.includes('VITE_API_PROXY_TARGET_SET_BUT_RADAR_DEV_SPLIT_DISABLED'),
    true,
  );
});

test('validateProxyTargetReachability confirms DNS, TCP, and HTTP /api/healthz against a live local target', async () => {
  const mockApi = http.createServer((req, res) => {
    if (req.url === '/api/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => mockApi.listen(0, '127.0.0.1', () => resolve()));
  const addr = mockApi.address();
  assert.ok(addr && typeof addr === 'object');

  try {
    const report = await validateProxyTargetReachability(`http://127.0.0.1:${addr.port}`);
    assert.equal(report.urlValid, true);
    assert.equal(report.dnsResolved, true);
    assert.equal(report.tcpReachable, true);
    assert.equal(report.httpChecked, true);
    assert.equal(report.httpReachable, true);
    assert.equal(report.httpStatus, 200);
    assert.equal(report.reachable, true);
  } finally {
    await new Promise<void>((resolve) => mockApi.close(() => resolve()));
  }
});

test('validateProxyTargetReachability detects ECONNREFUSED on a closed local port and malformed URLs', async () => {
  const tempSrv = net.createServer();
  await new Promise<void>((resolve) => tempSrv.listen(0, '127.0.0.1', () => resolve()));
  const addr = tempSrv.address();
  assert.ok(addr && typeof addr === 'object');
  const closedPort = addr.port;
  await new Promise<void>((resolve) => tempSrv.close(() => resolve()));

  const refused = await validateProxyTargetReachability(`http://127.0.0.1:${closedPort}`);
  assert.equal(refused.urlValid, true);
  assert.equal(refused.dnsResolved, true);
  assert.equal(refused.tcpReachable, false);
  assert.equal(refused.tcpErrorCode, 'ECONNREFUSED');
  assert.equal(refused.reachable, false);
  assert.ok(refused.remediationHint?.includes('npm run dev:api'));

  const malformed = await validateProxyTargetReachability('not-a-valid-url');
  assert.equal(malformed.urlValid, false);
  assert.equal(malformed.reachable, false);
});

test('runDevServerDiagnostics flags unreachable active split proxy as blocking issue', async () => {
  const tempSrv = net.createServer();
  await new Promise<void>((resolve) => tempSrv.listen(0, '127.0.0.1', () => resolve()));
  const addr = tempSrv.address();
  assert.ok(addr && typeof addr === 'object');
  const closedPort = addr.port;
  await new Promise<void>((resolve) => tempSrv.close(() => resolve()));

  const report = await runDevServerDiagnostics({
    envOverride: {
      NODE_ENV: 'development',
      RADAR_DEV_SPLIT: '1',
      VITE_DEV_PORT: '5199',
      VITE_API_PROXY_TARGET: `http://127.0.0.1:${closedPort}`,
      K_SERVICE: 'ais-dev-test',
    },
  });

  assert.equal(report.ok, false);
  assert.equal(report.proxyReachability?.tcpErrorCode, 'ECONNREFUSED');
  assert.ok(report.blockingIssues.some((msg) => msg.includes('ECONNREFUSED')));
  assert.equal(report.hostResolution.dnsResolved, true);
});

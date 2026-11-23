import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {
  checkViteDevPortAvailability,
  diagnoseDevEnvironment,
  inspectVitePrefixedEnvVars,
} from '../scripts/diagnose-dev-environment';

test('inspectVitePrefixedEnvVars discovers all VITE_ variables, strips URL credentials, and redacts secret keys', () => {
  const summary = inspectVitePrefixedEnvVars({
    NODE_ENV: 'development',
    GEMINI_API_KEY: 'ignored-non-vite-secret',
    VITE_API_PROXY_TARGET: 'http://devuser:devpass@127.0.0.1:3001/',
    VITE_DEV_PORT: '5173',
    VITE_CUSTOM_FEATURE_FLAG: 'enabled',
    VITE_INTERNAL_AUTH_TOKEN: 'tok_super_secret_value_123',
    VITE_WHITESPACE_VAR: '  padded  ',
  });

  assert.equal(summary.totalViteVarsPresent, 5);
  assert.equal(
    summary.entries.some((e) => e.key === 'GEMINI_API_KEY'),
    false,
  );

  const proxyEntry = summary.entries.find((e) => e.key === 'VITE_API_PROXY_TARGET');
  assert.equal(proxyEntry?.displayValue, 'http://127.0.0.1:3001');

  const tokenEntry = summary.entries.find((e) => e.key === 'VITE_INTERNAL_AUTH_TOKEN');
  assert.equal(tokenEntry?.redacted, true);
  assert.match(tokenEntry?.displayValue ?? '', /^\[REDACTED len=\d+\]$/);

  const whitespaceEntry = summary.entries.find((e) => e.key === 'VITE_WHITESPACE_VAR');
  assert.equal(
    whitespaceEntry?.warnings.includes('LEADING_OR_TRAILING_WHITESPACE'),
    true,
  );

  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes('devpass'), false);
  assert.equal(serialized.includes('tok_super_secret'), false);
});

test('checkViteDevPortAvailability verifies free port, occupied localhost port, and invalid port values', async () => {
  const blocker = net.createServer();
  await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', () => resolve()));
  const addr = blocker.address();
  assert.ok(addr && typeof addr === 'object');
  const occupiedPort = addr.port;

  try {
    const busy = await checkViteDevPortAvailability({ VITE_DEV_PORT: String(occupiedPort) });
    assert.equal(busy.validPort, true);
    assert.equal(busy.localhostDnsResolved, true);
    assert.equal(busy.available, false);
    assert.equal(busy.errorCode, 'EADDRINUSE');
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }

  const free = await checkViteDevPortAvailability({ VITE_DEV_PORT: String(occupiedPort) });
  assert.equal(free.validPort, true);
  assert.equal(free.available, true);
  assert.equal(free.errorCode, null);

  const invalid = await checkViteDevPortAvailability({ VITE_DEV_PORT: 'not-a-port' });
  assert.equal(invalid.validPort, false);
  assert.equal(invalid.available, false);
  assert.equal(invalid.errorCode, 'INVALID_PORT');
});

test('diagnoseDevEnvironment validates live proxy connectivity and free localhost port end-to-end', async () => {
  const apiServer = http.createServer((req, res) => {
    if (req.url === '/api/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', () => resolve()));
  const apiAddr = apiServer.address();
  assert.ok(apiAddr && typeof apiAddr === 'object');

  const portHelper = net.createServer();
  await new Promise<void>((resolve) => portHelper.listen(0, '127.0.0.1', () => resolve()));
  const freePortAddr = portHelper.address();
  assert.ok(freePortAddr && typeof freePortAddr === 'object');
  const freePort = freePortAddr.port;
  await new Promise<void>((resolve) => portHelper.close(() => resolve()));

  try {
    const report = await diagnoseDevEnvironment({
      envOverride: {
        NODE_ENV: 'development',
        RADAR_DEV_SPLIT: '1',
        VITE_DEV_PORT: String(freePort),
        VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiAddr.port}`,
        K_SERVICE: 'ais-dev-test',
      },
    });

    assert.equal(report.stage, 'pre-vite-boot');
    assert.equal(report.ok, true);
    assert.equal(report.devPortCheck.available, true);
    assert.equal(report.proxyConnectivity.status, 'reachable');
    assert.equal(report.proxyConnectivity.report?.httpStatus, 200);
  } finally {
    await new Promise<void>((resolve) => apiServer.close(() => resolve()));
  }
});

test('diagnoseDevEnvironment reports blocking issue when VITE_DEV_PORT is busy or active proxy is unreachable', async () => {
  const blocker = net.createServer();
  await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', () => resolve()));
  const busyAddr = blocker.address();
  assert.ok(busyAddr && typeof busyAddr === 'object');

  const closedPortHelper = net.createServer();
  await new Promise<void>((resolve) => closedPortHelper.listen(0, '127.0.0.1', () => resolve()));
  const closedAddr = closedPortHelper.address();
  assert.ok(closedAddr && typeof closedAddr === 'object');
  const closedPort = closedAddr.port;
  await new Promise<void>((resolve) => closedPortHelper.close(() => resolve()));

  try {
    const report = await diagnoseDevEnvironment({
      envOverride: {
        NODE_ENV: 'development',
        VITE_RADAR_DEV_SPLIT: '1',
        VITE_DEV_PORT: String(busyAddr.port),
        VITE_API_PROXY_TARGET: `http://127.0.0.1:${closedPort}`,
      },
    });

    assert.equal(report.ok, false);
    assert.equal(report.devPortCheck.available, false);
    assert.equal(report.proxyConnectivity.status, 'unreachable');
    assert.ok(report.blockingIssues.some((msg) => msg.includes('EADDRINUSE')));
    assert.ok(report.blockingIssues.some((msg) => msg.includes('ECONNREFUSED')));
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
});

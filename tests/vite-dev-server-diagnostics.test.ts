import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {
  collectSafeViteEnvSnapshot,
  detectAllowedHostsMergeAnomaly,
  probeTcpPortConflict,
  resolveViteDevAllowedHostsSafe,
  resolveViteDevProxyConfig,
  resolveViteDevServerHost,
  sanitizeUrlForDiagnosticLog,
  verifyServerHostResolution,
} from '../src/utils/viteDevServerDiagnostics';

test('collectSafeViteEnvSnapshot logs only allowlisted dev vars and strips credentials/secrets', () => {
  const snapshot = collectSafeViteEnvSnapshot({
    NODE_ENV: 'development',
    PORT: '8080',
    APP_URL: 'https://user:secretpass@ais-dev.example.run.app/',
    VITE_API_PROXY_TARGET: 'http://admin:topsecret@127.0.0.1:3001/',
    GEMINI_API_KEY: 'AIzaSyFakeSecretValueThatMustNeverAppear',
    ADMIN_API_SECRET: 'super-secret-admin-token-123456',
    TELEGRAM_BOT_TOKEN: '123456:ABCDEF_secret',
  });

  assert.equal(snapshot.NODE_ENV, 'development');
  assert.equal(snapshot.PORT, '8080');
  assert.equal(snapshot.APP_URL, 'https://ais-dev.example.run.app');
  assert.equal(snapshot.VITE_API_PROXY_TARGET, 'http://127.0.0.1:3001');
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes('secretpass'), false);
  assert.equal(serialized.includes('topsecret'), false);
  assert.equal(serialized.includes('AIzaSyFake'), false);
  assert.equal(serialized.includes('super-secret-admin-token'), false);
  assert.equal(serialized.includes('123456:ABCDEF'), false);
});

test('resolveViteDevServerHost honors explicit VITE_DEV_HOST, HOST, container defaults, and local fallback', () => {
  assert.deepEqual(resolveViteDevServerHost({ VITE_DEV_HOST: '127.0.0.1', HOST: '0.0.0.0' }), {
    host: '127.0.0.1',
    lookupHost: '127.0.0.1',
    source: 'env:VITE_DEV_HOST',
  });
  assert.deepEqual(resolveViteDevServerHost({ VITE_DEV_HOST: 'true' }), {
    host: true,
    lookupHost: '0.0.0.0',
    source: 'env:VITE_DEV_HOST',
  });
  assert.deepEqual(resolveViteDevServerHost({ HOST: '0.0.0.0' }), {
    host: '0.0.0.0',
    lookupHost: '0.0.0.0',
    source: 'env:HOST',
  });
  assert.deepEqual(resolveViteDevServerHost({ K_SERVICE: 'ais-dev-svc' }), {
    host: '0.0.0.0',
    lookupHost: '0.0.0.0',
    source: 'default:container-0.0.0.0',
  });
  assert.deepEqual(resolveViteDevServerHost({}), {
    host: 'localhost',
    lookupHost: 'localhost',
    source: 'default:localhost',
  });
});

test('resolveViteDevAllowedHostsSafe captures fallback reason on invalid wildcard host', () => {
  const valid = resolveViteDevAllowedHostsSafe({
    APP_URL: 'https://ais-dev.example.run.app',
  });
  assert.equal(valid.fallbackReason, null);
  assert.equal(valid.allowedHosts.includes('ais-dev.example.run.app'), true);

  const invalid = resolveViteDevAllowedHostsSafe({
    VITE_ALLOWED_HOSTS: '*.evil.example',
  });
  assert.ok(invalid.fallbackReason);
  assert.deepEqual(invalid.allowedHosts, ['localhost', '127.0.0.1']);
});

test('detectAllowedHostsMergeAnomaly catches Vite array+boolean merge corruption', () => {
  assert.equal(detectAllowedHostsMergeAnomaly(['localhost', '127.0.0.1']), null);
  assert.equal(detectAllowedHostsMergeAnomaly(true), null);
  const anomaly = detectAllowedHostsMergeAnomaly(['localhost', true]);
  assert.ok(anomaly && anomaly.includes('NON_STRING_ALLOWED_HOSTS_ENTRIES'));
});

test('resolveViteDevProxyConfig handles disabled split mode, valid split mode, and self-loop warning', () => {
  const disabled = resolveViteDevProxyConfig({});
  assert.equal(disabled.devSplitEnabled, false);
  assert.equal(disabled.proxy, undefined);
  assert.equal(disabled.warnings.length, 0);

  const enabled = resolveViteDevProxyConfig({ RADAR_DEV_SPLIT: '1' }, 5173);
  assert.equal(enabled.devSplitEnabled, true);
  assert.equal(enabled.configuredProxyTarget, 'http://127.0.0.1:3001');
  assert.equal(enabled.proxy?.['/api']?.target, 'http://127.0.0.1:3001');
  assert.equal(enabled.warnings.length, 0);

  const selfLoop = resolveViteDevProxyConfig(
    { RADAR_DEV_SPLIT: '1', VITE_API_PROXY_TARGET: 'http://127.0.0.1:5173' },
    5173,
  );
  assert.equal(selfLoop.warnings.includes('PROXY_SELF_LOOP_PORT_5173'), true);
});

test('sanitizeUrlForDiagnosticLog handles malformed URLs safely', () => {
  assert.equal(sanitizeUrlForDiagnosticLog('http://u:p@127.0.0.1:3001/'), 'http://127.0.0.1:3001');
  assert.equal(sanitizeUrlForDiagnosticLog('not a url //user:pass@host'), 'not a url //[REDACTED]@host');
  assert.equal(sanitizeUrlForDiagnosticLog(''), null);
});

test('verifyServerHostResolution resolves 0.0.0.0 and localhost in current environment', async () => {
  const zeroCheck = await verifyServerHostResolution(
    { host: '0.0.0.0', lookupHost: '0.0.0.0', source: 'default:container-0.0.0.0' },
    '0.0.0.0',
  );
  assert.equal(zeroCheck.dnsResolved, true);
  assert.equal(zeroCheck.dnsError, null);
  assert.ok(zeroCheck.resolvedAddresses.some((r) => r.address === '0.0.0.0'));

  const localCheck = await verifyServerHostResolution(
    { host: 'localhost', lookupHost: 'localhost', source: 'default:localhost' },
    'localhost',
  );
  assert.equal(localCheck.dnsResolved, true);
  assert.ok(localCheck.resolvedAddresses.length >= 1);
});

test('probeTcpPortConflict detects an occupied port and a free port without binding', async () => {
  const srv = net.createServer();
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', () => resolve()));
  const addr = srv.address();
  assert.ok(addr && typeof addr === 'object');
  const busyPort = addr.port;

  const busyResult = await probeTcpPortConflict(busyPort, '127.0.0.1');
  assert.equal(busyResult.status, 'in_use');

  await new Promise<void>((resolve) => srv.close(() => resolve()));

  const freeResult = await probeTcpPortConflict(busyPort, '127.0.0.1');
  assert.equal(freeResult.status, 'free');
});

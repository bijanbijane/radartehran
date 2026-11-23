import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import {
  probeTcpPortConflict,
  resolveViteDevAllowedHostsSafe,
  resolveViteDevProxyConfig,
  resolveViteDevServerHost,
  sanitizeUrlForDiagnosticLog,
  verifyServerHostResolution,
  type HostResolutionDiagnostic,
  type PortConflictProbeResult,
} from '../src/utils/viteDevServerDiagnostics';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const DEV_CRITICAL_ENV_KEYS = [
  'VITE_API_PROXY_TARGET',
  'VITE_DEV_PORT',
  'VITE_DEV_HOST',
  'RADAR_DEV_SPLIT',
  'VITE_RADAR_DEV_SPLIT',
  'NODE_ENV',
  'PORT',
  'HOST',
  'APP_URL',
  'VITE_APP_URL',
  'VITE_ALLOWED_HOSTS',
  'VITE_DEV_ALLOWED_HOSTS',
  'DISABLE_HMR',
  'CLOUDFLARE_VITE',
  'K_SERVICE',
  'CI',
  'TRUST_PROXY_HOPS',
] as const;

const SAFE_PLAINTEXT_ENV_KEYS = new Set<string>([
  ...DEV_CRITICAL_ENV_KEYS,
  'PWD',
  'HOME',
  'SHELL',
  'TERM',
  'LANG',
  'TZ',
  'USER',
  'HOSTNAME',
  'NODE_VERSION',
  'NPM_CONFIG_USER_AGENT',
  'npm_lifecycle_event',
  'npm_package_name',
  'K_REVISION',
  'K_CONFIGURATION',
  'GOOGLE_CLOUD_PROJECT',
]);

const URL_ENV_KEYS = new Set<string>([
  'VITE_API_PROXY_TARGET',
  'APP_URL',
  'VITE_APP_URL',
]);

const SENSITIVE_KEY_PATTERN =
  /(KEY|SECRET|TOKEN|PASS|PWD_HASH|AUTH|CRED|PRIVATE|CERT|COOKIE|SESSION|SIGN|WEBHOOK|DATABASE_URL|CONNECTION|FIREBASE|GEMINI|TELEGRAM|STRIPE|AWS|S3|R2|OAUTH|SMTP|API_KEY)/i;

export interface EnvAuditEntry {
  key: string;
  category: 'dev-critical' | 'safe-runtime' | 'redacted';
  present: boolean;
  displayValue: string;
  warnings: string[];
}

export interface EnvAuditSummary {
  totalEnvVarsScanned: number;
  devCriticalEntries: EnvAuditEntry[];
  allEntries: EnvAuditEntry[];
  viteDevPort: {
    raw: string | null;
    parsedPort: number | null;
    effectiveVitePort: number;
    valid: boolean;
    warnings: string[];
  };
  viteApiProxyTarget: {
    rawSanitized: string | null;
    effectiveTargetSanitized: string | null;
    devSplitEnabled: boolean;
    active: boolean;
    warnings: string[];
  };
  warnings: string[];
}

export interface ProxyReachabilityReport {
  targetUrl: string;
  sanitizedUrl: string;
  protocol: string | null;
  hostname: string | null;
  port: number | null;
  urlValid: boolean;
  dnsResolved: boolean;
  resolvedAddresses: Array<{ address: string; family: number }>;
  dnsLatencyMs: number | null;
  dnsError: string | null;
  tcpReachable: boolean;
  tcpLatencyMs: number | null;
  tcpErrorCode: string | null;
  httpChecked: boolean;
  httpReachable: boolean;
  httpStatus: number | null;
  httpLatencyMs: number | null;
  httpError: string | null;
  reachable: boolean;
  diagnosis: string;
  remediationHint: string | null;
}

export interface DevServerDiagnosticReport {
  timestampIso: string;
  mode: string;
  repoRoot: string;
  ok: boolean;
  blockingIssues: string[];
  warnings: string[];
  envAudit: EnvAuditSummary;
  allowedHosts: {
    configured: string[];
    fallbackReason: string | null;
  };
  hostResolution: HostResolutionDiagnostic;
  portProbes: PortConflictProbeResult[];
  proxyReachability: ProxyReachabilityReport | null;
}

function inspectValueAnomalies(raw: string): string[] {
  const warnings: string[] = [];
  if (raw.length === 0) warnings.push('EMPTY_STRING');
  if (raw !== raw.trim()) warnings.push('LEADING_OR_TRAILING_WHITESPACE');
  if (/[\r\n]/.test(raw)) warnings.push('CONTAINS_NEWLINE');
  return warnings;
}

export function auditAllEnvironmentVariables(
  env: Record<string, string | undefined>,
): EnvAuditSummary {
  const criticalSet = new Set<string>(DEV_CRITICAL_ENV_KEYS);
  const allKeys = Array.from(new Set([...DEV_CRITICAL_ENV_KEYS, ...Object.keys(env)])).sort();
  const allEntries: EnvAuditEntry[] = [];
  const devCriticalEntries: EnvAuditEntry[] = [];
  const warnings: string[] = [];

  for (const key of allKeys) {
    const raw = env[key];
    const present = typeof raw === 'string';
    const isCritical = criticalSet.has(key);
    const isSafePlaintext = SAFE_PLAINTEXT_ENV_KEYS.has(key) && !SENSITIVE_KEY_PATTERN.test(key);
    const category: EnvAuditEntry['category'] = isCritical
      ? 'dev-critical'
      : isSafePlaintext
        ? 'safe-runtime'
        : 'redacted';

    const entryWarnings = present ? inspectValueAnomalies(raw) : [];
    let displayValue = '<unset>';

    if (present) {
      if (category === 'redacted') {
        displayValue = `[REDACTED len=${raw.length}]`;
      } else if (URL_ENV_KEYS.has(key)) {
        displayValue = sanitizeUrlForDiagnosticLog(raw) ?? '<empty>';
      } else {
        displayValue = raw.length > 140 ? `${raw.slice(0, 140)}... (len=${raw.length})` : raw;
      }
    }

    const entry: EnvAuditEntry = {
      key,
      category,
      present,
      displayValue,
      warnings: entryWarnings,
    };
    allEntries.push(entry);
    if (isCritical) {
      devCriticalEntries.push(entry);
      for (const w of entryWarnings) {
        warnings.push(`ENV_${key}_${w}`);
      }
    }
  }

  const rawViteDevPort = typeof env.VITE_DEV_PORT === 'string' && env.VITE_DEV_PORT.trim()
    ? env.VITE_DEV_PORT.trim()
    : null;
  const portWarnings: string[] = [];
  let parsedPort: number | null = null;
  let portValid = true;

  if (rawViteDevPort !== null) {
    const num = Number(rawViteDevPort);
    if (!Number.isInteger(num) || num < 1 || num > 65535) {
      portValid = false;
      portWarnings.push(`INVALID_VITE_DEV_PORT:${rawViteDevPort}`);
    } else {
      parsedPort = num;
      if (num === 8080) {
        portWarnings.push('VITE_DEV_PORT_8080_CONFLICTS_WITH_INGRESS_NGINX');
      } else if (num < 1024) {
        portWarnings.push(`VITE_DEV_PORT_PRIVILEGED_${num}`);
      }
    }
  }
  const effectiveVitePort = parsedPort ?? 5173;

  const proxyConfig = resolveViteDevProxyConfig(env, parsedPort ?? undefined);
  const rawProxySanitized = sanitizeUrlForDiagnosticLog(env.VITE_API_PROXY_TARGET);
  const proxyWarnings = [...proxyConfig.warnings];

  if (!proxyConfig.devSplitEnabled && rawProxySanitized) {
    proxyWarnings.push('VITE_API_PROXY_TARGET_SET_BUT_RADAR_DEV_SPLIT_DISABLED');
  }
  if (env.PORT?.trim() === '8080') {
    warnings.push('ENV_PORT_8080_RESERVED_FOR_INGRESS_EXPRESS_REMAPS_TO_3000');
  }

  warnings.push(...portWarnings, ...proxyWarnings);

  return {
    totalEnvVarsScanned: Object.keys(env).length,
    devCriticalEntries,
    allEntries,
    viteDevPort: {
      raw: rawViteDevPort,
      parsedPort,
      effectiveVitePort,
      valid: portValid,
      warnings: portWarnings,
    },
    viteApiProxyTarget: {
      rawSanitized: rawProxySanitized,
      effectiveTargetSanitized: proxyConfig.configuredProxyTarget,
      devSplitEnabled: proxyConfig.devSplitEnabled,
      active: proxyConfig.devSplitEnabled,
      warnings: proxyWarnings,
    },
    warnings,
  };
}

function probeHttpEndpoint(
  urlObj: URL,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number | null; latencyMs: number; error: string | null }> {
  return new Promise((resolve) => {
    const started = Date.now();
    const client = urlObj.protocol === 'https:' ? https : http;
    const probePath =
      urlObj.pathname && urlObj.pathname !== '/'
        ? `${urlObj.pathname.replace(/\/$/, '')}/api/healthz`
        : '/api/healthz';
    const req = client.request(
      {
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: probePath,
        method: 'GET',
        timeout: timeoutMs,
        rejectUnauthorized: false,
      },
      (res) => {
        res.resume();
        const status = res.statusCode ?? null;
        resolve({
          ok: status !== null && status >= 200 && status < 500,
          status,
          latencyMs: Date.now() - started,
          error: null,
        });
      },
    );
    req.once('timeout', () => {
      req.destroy(new Error(`HTTP probe timed out after ${timeoutMs}ms`));
    });
    req.once('error', (err: NodeJS.ErrnoException) => {
      resolve({
        ok: false,
        status: null,
        latencyMs: Date.now() - started,
        error: `${err.code ?? 'HTTP_ERROR'}: ${err.message}`,
      });
    });
    req.end();
  });
}

export async function validateProxyTargetReachability(
  targetUrl: string,
  options: { tcpTimeoutMs?: number; httpTimeoutMs?: number } = {},
): Promise<ProxyReachabilityReport> {
  const tcpTimeoutMs = options.tcpTimeoutMs ?? 1500;
  const httpTimeoutMs = options.httpTimeoutMs ?? 2000;
  const sanitizedUrl = sanitizeUrlForDiagnosticLog(targetUrl) ?? targetUrl;

  let parsed: URL;
  try {
    parsed = new URL(targetUrl.trim());
  } catch {
    return {
      targetUrl: sanitizedUrl,
      sanitizedUrl,
      protocol: null,
      hostname: null,
      port: null,
      urlValid: false,
      dnsResolved: false,
      resolvedAddresses: [],
      dnsLatencyMs: null,
      dnsError: null,
      tcpReachable: false,
      tcpLatencyMs: null,
      tcpErrorCode: null,
      httpChecked: false,
      httpReachable: false,
      httpStatus: null,
      httpLatencyMs: null,
      httpError: null,
      reachable: false,
      diagnosis: 'Invalid proxy target URL format.',
      remediationHint: 'Set VITE_API_PROXY_TARGET to a valid http(s) URL such as http://127.0.0.1:3001.',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      targetUrl: sanitizedUrl,
      sanitizedUrl,
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: null,
      urlValid: false,
      dnsResolved: false,
      resolvedAddresses: [],
      dnsLatencyMs: null,
      dnsError: null,
      tcpReachable: false,
      tcpLatencyMs: null,
      tcpErrorCode: null,
      httpChecked: false,
      httpReachable: false,
      httpStatus: null,
      httpLatencyMs: null,
      httpError: null,
      reachable: false,
      diagnosis: `Unsupported proxy protocol "${parsed.protocol}".`,
      remediationHint: 'Use http:// or https:// for VITE_API_PROXY_TARGET.',
    };
  }

  const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
  const dnsStart = Date.now();
  let resolvedAddresses: Array<{ address: string; family: number }> = [];
  let dnsError: string | null = null;

  try {
    const records = await dns.promises.lookup(parsed.hostname, { all: true });
    resolvedAddresses = records.map((r) => ({ address: r.address, family: r.family }));
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    dnsError = `${e.code ?? 'DNS_ERROR'}: ${e.message}`;
  }
  const dnsLatencyMs = Date.now() - dnsStart;

  if (dnsError || resolvedAddresses.length === 0) {
    return {
      targetUrl: sanitizedUrl,
      sanitizedUrl,
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port,
      urlValid: true,
      dnsResolved: false,
      resolvedAddresses: [],
      dnsLatencyMs,
      dnsError: dnsError ?? 'DNS_NO_RECORDS',
      tcpReachable: false,
      tcpLatencyMs: null,
      tcpErrorCode: null,
      httpChecked: false,
      httpReachable: false,
      httpStatus: null,
      httpLatencyMs: null,
      httpError: null,
      reachable: false,
      diagnosis: `Proxy host "${parsed.hostname}" failed DNS resolution (${dnsError ?? 'no records'}).`,
      remediationHint: 'Verify VITE_API_PROXY_TARGET hostname or use 127.0.0.1 for local API processes.',
    };
  }

  const connectHost = resolvedAddresses[0].address;
  const tcpStart = Date.now();
  const tcpResult = await new Promise<{ ok: boolean; code: string | null }>((resolve) => {
    const socket = net.createConnection({ host: connectHost, port });
    let done = false;
    const finish = (res: { ok: boolean; code: string | null }) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(res);
    };
    socket.setTimeout(tcpTimeoutMs);
    socket.once('connect', () => finish({ ok: true, code: null }));
    socket.once('timeout', () => finish({ ok: false, code: 'ETIMEDOUT' }));
    socket.once('error', (err: NodeJS.ErrnoException) =>
      finish({ ok: false, code: err.code ?? 'TCP_ERROR' }),
    );
  });
  const tcpLatencyMs = Date.now() - tcpStart;

  if (!tcpResult.ok) {
    const hint =
      tcpResult.code === 'ECONNREFUSED'
        ? `No backend is listening on ${parsed.hostname}:${port}. Start the API first (e.g. npm run dev:api) or unset RADAR_DEV_SPLIT to use Express middleware mode.`
        : `Network error (${tcpResult.code}) connecting to ${parsed.hostname}:${port}. Check firewall, container networking, or VITE_API_PROXY_TARGET.`;
    return {
      targetUrl: sanitizedUrl,
      sanitizedUrl,
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port,
      urlValid: true,
      dnsResolved: true,
      resolvedAddresses,
      dnsLatencyMs,
      dnsError: null,
      tcpReachable: false,
      tcpLatencyMs,
      tcpErrorCode: tcpResult.code,
      httpChecked: false,
      httpReachable: false,
      httpStatus: null,
      httpLatencyMs: null,
      httpError: null,
      reachable: false,
      diagnosis: `TCP connection to ${sanitizedUrl} (${connectHost}:${port}) failed with ${tcpResult.code}.`,
      remediationHint: hint,
    };
  }

  const httpRes = await probeHttpEndpoint(parsed, httpTimeoutMs);
  return {
    targetUrl: sanitizedUrl,
    sanitizedUrl,
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port,
    urlValid: true,
    dnsResolved: true,
    resolvedAddresses,
    dnsLatencyMs,
    dnsError: null,
    tcpReachable: true,
    tcpLatencyMs,
    tcpErrorCode: null,
    httpChecked: true,
    httpReachable: httpRes.ok,
    httpStatus: httpRes.status,
    httpLatencyMs: httpRes.latencyMs,
    httpError: httpRes.error,
    reachable: httpRes.ok,
    diagnosis: httpRes.ok
      ? `Proxy target ${sanitizedUrl} is reachable (TCP ${tcpLatencyMs}ms, HTTP ${httpRes.status} in ${httpRes.latencyMs}ms).`
      : `TCP connected to ${sanitizedUrl}, but HTTP /api/healthz probe failed (${httpRes.error ?? `status ${httpRes.status}`}).`,
    remediationHint: httpRes.ok
      ? null
      : 'Confirm the backend service on the proxy target is healthy and serving /api/healthz.',
  };
}

export async function runDevServerDiagnostics(options: {
  mode?: string;
  repoRoot?: string;
  envOverride?: Record<string, string | undefined>;
} = {}): Promise<DevServerDiagnosticReport> {
  const mode = options.mode ?? 'development';
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const mergedEnv: Record<string, string | undefined> = options.envOverride
    ? { ...options.envOverride }
    : {
        ...process.env,
        ...loadEnv(mode, repoRoot, ''),
      };

  const envAudit = auditAllEnvironmentVariables(mergedEnv);
  const { allowedHosts, fallbackReason } = resolveViteDevAllowedHostsSafe(mergedEnv);
  const hostConfig = resolveViteDevServerHost(mergedEnv);
  const hostResolution = await verifyServerHostResolution(hostConfig, hostConfig.host);

  const probePortList = Array.from(
    new Set([envAudit.viteDevPort.effectiveVitePort, 3000, 3001, 5173, 8080]),
  );
  const portProbes = await Promise.all(probePortList.map((p) => probeTcpPortConflict(p)));

  const targetToCheck =
    envAudit.viteApiProxyTarget.effectiveTargetSanitized ??
    (mergedEnv.VITE_API_PROXY_TARGET?.trim() ? mergedEnv.VITE_API_PROXY_TARGET.trim() : null);

  const proxyReachability = targetToCheck
    ? await validateProxyTargetReachability(
        envAudit.viteApiProxyTarget.active
          ? (mergedEnv.VITE_API_PROXY_TARGET?.trim() || 'http://127.0.0.1:3001')
          : mergedEnv.VITE_API_PROXY_TARGET!.trim(),
      )
    : null;

  const blockingIssues: string[] = [];
  const warnings: string[] = [...envAudit.warnings];

  if (!envAudit.viteDevPort.valid) {
    blockingIssues.push(`Invalid VITE_DEV_PORT: ${envAudit.viteDevPort.raw}`);
  }
  if (!hostResolution.dnsResolved) {
    blockingIssues.push(
      `server.host "${hostResolution.lookupHost}" failed DNS lookup: ${hostResolution.dnsError}`,
    );
  }
  if (fallbackReason) {
    warnings.push(`allowedHosts fallback triggered: ${fallbackReason}`);
  }

  const configuredVitePortProbe = portProbes.find(
    (p) => p.port === envAudit.viteDevPort.effectiveVitePort,
  );
  if (configuredVitePortProbe?.status === 'in_use') {
    warnings.push(
      `Configured Vite port ${envAudit.viteDevPort.effectiveVitePort} is already in use on 127.0.0.1.`,
    );
  }

  if (proxyReachability && !proxyReachability.reachable) {
    if (envAudit.viteApiProxyTarget.active) {
      blockingIssues.push(proxyReachability.diagnosis);
    } else {
      warnings.push(`Inactive VITE_API_PROXY_TARGET unreachable: ${proxyReachability.diagnosis}`);
    }
  }

  return {
    timestampIso: new Date().toISOString(),
    mode,
    repoRoot,
    ok: blockingIssues.length === 0,
    blockingIssues,
    warnings,
    envAudit,
    allowedHosts: {
      configured: allowedHosts,
      fallbackReason,
    },
    hostResolution,
    portProbes,
    proxyReachability,
  };
}

function formatHumanReport(report: DevServerDiagnosticReport): string {
  const lines: string[] = [];
  lines.push('================================================================');
  lines.push('PRE-VITE DEV SERVER DIAGNOSTIC REPORT');
  lines.push('================================================================');
  lines.push(`Timestamp: ${report.timestampIso} | Mode: ${report.mode}`);
  lines.push(`Overall Status: ${report.ok ? 'PASS' : 'BLOCKING_ISSUES_FOUND'}`);
  lines.push('');
  lines.push(`1. Environment Audit (${report.envAudit.totalEnvVarsScanned} vars scanned; secrets redacted):`);
  for (const entry of report.envAudit.devCriticalEntries) {
    const warnSuffix = entry.warnings.length > 0 ? ` [WARN: ${entry.warnings.join(', ')}]` : '';
    lines.push(`   - ${entry.key} = ${entry.displayValue}${warnSuffix}`);
  }
  const redactedCount = report.envAudit.allEntries.filter((e) => e.category === 'redacted').length;
  const safeRuntimeCount = report.envAudit.allEntries.filter((e) => e.category === 'safe-runtime').length;
  lines.push(`   (+ ${safeRuntimeCount} safe runtime vars, ${redactedCount} sensitive/other vars verified with values redacted)`);
  lines.push('');
  lines.push('2. Host & AllowedHosts Resolution:');
  lines.push(
    `   - server.host: ${String(report.hostResolution.configuredHost)} (${report.hostResolution.configuredHostSource}) -> DNS ${report.hostResolution.dnsResolved ? 'OK' : 'FAILED'} (${report.hostResolution.resolvedAddresses.map((a) => a.address).join(', ') || report.hostResolution.dnsError})`,
  );
  lines.push(`   - allowedHosts: [${report.allowedHosts.configured.join(', ')}]`);
  lines.push('');
  lines.push('3. Port Conflict Probes (non-binding TCP connect):');
  for (const probe of report.portProbes) {
    lines.push(`   - ${probe.host}:${probe.port} -> ${probe.status.toUpperCase()}${probe.code ? ` (${probe.code})` : ''}`);
  }
  lines.push('');
  lines.push('4. Proxy Target Pre-Flight Reachability:');
  if (!report.proxyReachability) {
    lines.push('   - Split proxy disabled (RADAR_DEV_SPLIT != 1) and VITE_API_PROXY_TARGET unset. Express middleware serves /api directly.');
  } else {
    lines.push(`   - Target: ${report.proxyReachability.sanitizedUrl} (active=${report.envAudit.viteApiProxyTarget.active})`);
    lines.push(`   - DNS: ${report.proxyReachability.dnsResolved ? 'OK' : 'FAIL'} | TCP: ${report.proxyReachability.tcpReachable ? 'OK' : `FAIL (${report.proxyReachability.tcpErrorCode ?? 'N/A'})`} | HTTP: ${report.proxyReachability.httpChecked ? (report.proxyReachability.httpReachable ? `OK (${report.proxyReachability.httpStatus})` : `FAIL (${report.proxyReachability.httpError ?? report.proxyReachability.httpStatus})`) : 'SKIPPED'}`);
    lines.push(`   - Diagnosis: ${report.proxyReachability.diagnosis}`);
    if (report.proxyReachability.remediationHint) {
      lines.push(`   - Hint: ${report.proxyReachability.remediationHint}`);
    }
  }
  if (report.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of report.warnings) lines.push(`   ! ${w}`);
  }
  if (report.blockingIssues.length > 0) {
    lines.push('');
    lines.push('Blocking Issues:');
    for (const issue of report.blockingIssues) lines.push(`   X ${issue}`);
  }
  lines.push('================================================================');
  return lines.join('\n');
}

const isDirectCliExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === __filename;

if (isDirectCliExecution) {
  const args = new Set(process.argv.slice(2));
  const jsonOutput = args.has('--json');
  const strictMode = args.has('--strict');
  const modeArgIdx = process.argv.indexOf('--mode');
  const mode = modeArgIdx !== -1 && process.argv[modeArgIdx + 1] ? process.argv[modeArgIdx + 1] : 'development';

  runDevServerDiagnostics({ mode })
    .then((report) => {
      if (jsonOutput) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatHumanReport(report));
      }
      if (strictMode && !report.ok) {
        process.exitCode = 1;
      }
    })
    .catch((err) => {
      console.error('[DIAGNOSE_DEV_SERVER_FATAL]', err);
      process.exitCode = 1;
    });
}

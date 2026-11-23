import dns from 'node:dns';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import {
  resolveViteDevAllowedHostsSafe,
  resolveViteDevProxyConfig,
  resolveViteDevServerHost,
  sanitizeUrlForDiagnosticLog,
} from '../src/utils/viteDevServerDiagnostics';
import {
  validateProxyTargetReachability,
  type ProxyReachabilityReport,
} from './diagnose-dev-server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const CORE_VITE_ENV_KEYS = [
  'VITE_API_PROXY_TARGET',
  'VITE_DEV_PORT',
  'VITE_DEV_HOST',
  'VITE_APP_URL',
  'VITE_ALLOWED_HOSTS',
  'VITE_DEV_ALLOWED_HOSTS',
  'VITE_RADAR_DEV_SPLIT',
] as const;

const VITE_SENSITIVE_KEY_PATTERN =
  /(SECRET|TOKEN|PASSWORD|PASS|PRIVATE|CREDENTIAL|AUTH_KEY|API_SECRET|SIGNING|COOKIE|SESSION)/i;

const VITE_URL_KEY_PATTERN = /(URL|TARGET|ENDPOINT|ORIGIN|HOST_URL)$/i;

export interface ViteEnvInspectionEntry {
  key: string;
  present: boolean;
  redacted: boolean;
  displayValue: string;
  warnings: string[];
}

export interface ViteEnvInspectionSummary {
  totalViteVarsPresent: number;
  entries: ViteEnvInspectionEntry[];
  warnings: string[];
}

export interface LocalhostPortAvailabilityReport {
  configuredRaw: string | null;
  targetPort: number;
  usedDefaultPort: boolean;
  validPort: boolean;
  localhostDnsResolved: boolean;
  localhostAddresses: string[];
  available: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  warnings: string[];
}

export interface DevEnvironmentDiagnosticReport {
  stage: 'pre-vite-boot';
  timestampIso: string;
  mode: string;
  repoRoot: string;
  ok: boolean;
  blockingIssues: string[];
  warnings: string[];
  viteEnv: ViteEnvInspectionSummary;
  devPortCheck: LocalhostPortAvailabilityReport;
  proxyConnectivity: {
    status: 'reachable' | 'unreachable' | 'not_configured';
    activeInVite: boolean;
    source: 'VITE_API_PROXY_TARGET' | 'default:split-3001' | 'none';
    report: ProxyReachabilityReport | null;
  };
  hostAndAllowedHosts: {
    resolvedHost: string | boolean;
    hostSource: string;
    allowedHosts: string[];
    allowedHostsFallbackReason: string | null;
  };
}

export function inspectVitePrefixedEnvVars(
  env: Record<string, string | undefined>,
): ViteEnvInspectionSummary {
  const discoveredViteKeys = Object.keys(env).filter((k) => k.startsWith('VITE_'));
  const allViteKeys = Array.from(new Set([...CORE_VITE_ENV_KEYS, ...discoveredViteKeys])).sort();
  const entries: ViteEnvInspectionEntry[] = [];
  const warnings: string[] = [];

  for (const key of allViteKeys) {
    const raw = env[key];
    const present = typeof raw === 'string';
    const entryWarnings: string[] = [];
    const redacted = present && VITE_SENSITIVE_KEY_PATTERN.test(key);
    let displayValue = '<unset>';

    if (present) {
      if (raw.length === 0) entryWarnings.push('EMPTY_STRING');
      if (raw !== raw.trim()) entryWarnings.push('LEADING_OR_TRAILING_WHITESPACE');
      if (/[\r\n]/.test(raw)) entryWarnings.push('CONTAINS_NEWLINE');

      if (redacted) {
        displayValue = `[REDACTED len=${raw.length}]`;
      } else if (VITE_URL_KEY_PATTERN.test(key)) {
        displayValue = sanitizeUrlForDiagnosticLog(raw) ?? '<empty>';
      } else {
        displayValue = raw.length > 140 ? `${raw.slice(0, 140)}... (len=${raw.length})` : raw;
      }

      for (const w of entryWarnings) {
        warnings.push(`${key}:${w}`);
      }
    }

    entries.push({
      key,
      present,
      redacted,
      displayValue,
      warnings: entryWarnings,
    });
  }

  return {
    totalViteVarsPresent: discoveredViteKeys.length,
    entries,
    warnings,
  };
}

export async function checkViteDevPortAvailability(
  env: Record<string, string | undefined>,
): Promise<LocalhostPortAvailabilityReport> {
  const raw = typeof env.VITE_DEV_PORT === 'string' && env.VITE_DEV_PORT.trim()
    ? env.VITE_DEV_PORT.trim()
    : null;
  const warnings: string[] = [];

  let localhostAddresses: string[] = [];
  let localhostDnsResolved = false;
  try {
    const records = await dns.promises.lookup('localhost', { all: true });
    localhostAddresses = records.map((r) => r.address);
    localhostDnsResolved = localhostAddresses.length > 0;
  } catch {
    localhostDnsResolved = false;
    warnings.push('LOCALHOST_DNS_LOOKUP_FAILED');
  }

  if (raw !== null) {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      return {
        configuredRaw: raw,
        targetPort: 5173,
        usedDefaultPort: false,
        validPort: false,
        localhostDnsResolved,
        localhostAddresses,
        available: false,
        errorCode: 'INVALID_PORT',
        errorMessage: `VITE_DEV_PORT "${raw}" must be an integer between 1 and 65535.`,
        warnings: [...warnings, `INVALID_VITE_DEV_PORT:${raw}`],
      };
    }
    if (parsed === 8080) {
      warnings.push('PORT_8080_CONFLICTS_WITH_CONTAINER_INGRESS_NGINX');
    } else if (parsed < 1024) {
      warnings.push(`PRIVILEGED_PORT_${parsed}_MAY_REQUIRE_ELEVATED_PERMISSIONS`);
    }
  }

  const targetPort = raw !== null ? Number(raw) : 5173;
  const bindHost = localhostAddresses.includes('127.0.0.1') ? '127.0.0.1' : 'localhost';

  const bindProbe = await new Promise<{
    available: boolean;
    errorCode: string | null;
    errorMessage: string | null;
  }>((resolve) => {
    const server = net.createServer();
    let settled = false;
    const finish = (res: {
      available: boolean;
      errorCode: string | null;
      errorMessage: string | null;
    }) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };

    server.once('error', (err: NodeJS.ErrnoException) => {
      finish({
        available: false,
        errorCode: err.code ?? 'BIND_ERROR',
        errorMessage: err.message,
      });
    });

    server.once('listening', () => {
      server.close(() => {
        finish({
          available: true,
          errorCode: null,
          errorMessage: null,
        });
      });
    });

    server.listen({ port: targetPort, host: bindHost, exclusive: true });
  });

  return {
    configuredRaw: raw,
    targetPort,
    usedDefaultPort: raw === null,
    validPort: true,
    localhostDnsResolved,
    localhostAddresses,
    available: bindProbe.available,
    errorCode: bindProbe.errorCode,
    errorMessage: bindProbe.errorMessage,
    warnings,
  };
}

export async function diagnoseDevEnvironment(options: {
  mode?: string;
  repoRoot?: string;
  envOverride?: Record<string, string | undefined>;
} = {}): Promise<DevEnvironmentDiagnosticReport> {
  const mode = options.mode ?? 'development';
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const mergedEnv: Record<string, string | undefined> = options.envOverride
    ? { ...options.envOverride }
    : {
        ...process.env,
        ...loadEnv(mode, repoRoot, ''),
      };

  const viteEnv = inspectVitePrefixedEnvVars(mergedEnv);
  const devPortCheck = await checkViteDevPortAvailability(mergedEnv);
  const proxyConfig = resolveViteDevProxyConfig(
    mergedEnv,
    devPortCheck.validPort ? devPortCheck.targetPort : undefined,
  );
  const hostConfig = resolveViteDevServerHost(mergedEnv);
  const { allowedHosts, fallbackReason: allowedHostsFallbackReason } =
    resolveViteDevAllowedHostsSafe(mergedEnv);

  const explicitProxyTarget = mergedEnv.VITE_API_PROXY_TARGET?.trim() || null;
  const proxySource: DevEnvironmentDiagnosticReport['proxyConnectivity']['source'] =
    explicitProxyTarget
      ? 'VITE_API_PROXY_TARGET'
      : proxyConfig.devSplitEnabled
        ? 'default:split-3001'
        : 'none';

  const targetUrlToValidate =
    explicitProxyTarget ?? (proxyConfig.devSplitEnabled ? 'http://127.0.0.1:3001' : null);

  const proxyReport = targetUrlToValidate
    ? await validateProxyTargetReachability(targetUrlToValidate)
    : null;

  const proxyStatus: DevEnvironmentDiagnosticReport['proxyConnectivity']['status'] =
    proxyReport === null
      ? 'not_configured'
      : proxyReport.reachable
        ? 'reachable'
        : 'unreachable';

  const blockingIssues: string[] = [];
  const warnings: string[] = [
    ...viteEnv.warnings,
    ...devPortCheck.warnings,
    ...proxyConfig.warnings,
  ];

  if (!devPortCheck.validPort) {
    blockingIssues.push(devPortCheck.errorMessage ?? `Invalid VITE_DEV_PORT: ${devPortCheck.configuredRaw}`);
  } else if (!devPortCheck.available) {
    blockingIssues.push(
      `VITE_DEV_PORT ${devPortCheck.targetPort} is unavailable on localhost (${devPortCheck.errorCode ?? 'UNKNOWN'}): ${devPortCheck.errorMessage ?? 'port occupied'}`,
    );
  }

  if (proxyReport && !proxyReport.reachable) {
    if (proxyConfig.devSplitEnabled) {
      blockingIssues.push(proxyReport.diagnosis);
    } else {
      warnings.push(
        `VITE_API_PROXY_TARGET is set (${proxyReport.sanitizedUrl}) while RADAR_DEV_SPLIT is disabled, and target is unreachable: ${proxyReport.diagnosis}`,
      );
    }
  }

  if (allowedHostsFallbackReason) {
    warnings.push(`allowedHosts fallback triggered: ${allowedHostsFallbackReason}`);
  }

  return {
    stage: 'pre-vite-boot',
    timestampIso: new Date().toISOString(),
    mode,
    repoRoot,
    ok: blockingIssues.length === 0,
    blockingIssues,
    warnings,
    viteEnv,
    devPortCheck,
    proxyConnectivity: {
      status: proxyStatus,
      activeInVite: proxyConfig.devSplitEnabled,
      source: proxySource,
      report: proxyReport,
    },
    hostAndAllowedHosts: {
      resolvedHost: hostConfig.host,
      hostSource: hostConfig.source,
      allowedHosts,
      allowedHostsFallbackReason,
    },
  };
}

export function logStructuredDevEnvironmentReport(
  report: DevEnvironmentDiagnosticReport,
  format: 'json' | 'compact' = 'compact',
): void {
  const payload =
    format === 'json' ? JSON.stringify(report, null, 2) : JSON.stringify(report);
  console.info(`[VITE_PREBOOT_ENV_DIAGNOSTICS] ${payload}`);
}

const isDirectCliExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === __filename;

if (isDirectCliExecution) {
  const args = new Set(process.argv.slice(2));
  const format: 'json' | 'compact' = args.has('--json') ? 'json' : 'compact';
  const strictMode = args.has('--strict');
  const modeArgIdx = process.argv.indexOf('--mode');
  const mode =
    modeArgIdx !== -1 && process.argv[modeArgIdx + 1]
      ? process.argv[modeArgIdx + 1]
      : 'development';

  diagnoseDevEnvironment({ mode })
    .then((report) => {
      logStructuredDevEnvironmentReport(report, format);
      if (strictMode && !report.ok) {
        process.exitCode = 1;
      }
    })
    .catch((err) => {
      console.error('[VITE_PREBOOT_ENV_DIAGNOSTICS_FATAL]', err);
      process.exitCode = 1;
    });
}

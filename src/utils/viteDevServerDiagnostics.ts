import dns from 'node:dns';
import net from 'node:net';
import os from 'node:os';
import type { PluginOption, ProxyOptions } from 'vite';
import { resolveAllowedViteDevHosts } from './serverConfigValidator';

export interface ResolvedViteHostConfig {
  host: string | boolean;
  lookupHost: string;
  source: 'env:VITE_DEV_HOST' | 'env:HOST' | 'default:container-0.0.0.0' | 'default:localhost';
}

export interface ResolvedViteProxyConfig {
  devSplitEnabled: boolean;
  configuredProxyTarget: string | null;
  proxy: Record<string, ProxyOptions> | undefined;
  warnings: string[];
}

export interface SafeViteEnvSnapshot {
  NODE_ENV: string | null;
  PORT: string | null;
  HOST: string | null;
  VITE_DEV_HOST: string | null;
  VITE_DEV_PORT: string | null;
  APP_URL: string | null;
  VITE_APP_URL: string | null;
  VITE_ALLOWED_HOSTS: string | null;
  VITE_DEV_ALLOWED_HOSTS: string | null;
  RADAR_DEV_SPLIT: string | null;
  VITE_RADAR_DEV_SPLIT: string | null;
  VITE_API_PROXY_TARGET: string | null;
  DISABLE_HMR: string | null;
  CLOUDFLARE_VITE: string | null;
  K_SERVICE: string | null;
  CI: string | null;
}

export interface HostResolutionDiagnostic {
  configuredHost: string | boolean;
  configuredHostSource: ResolvedViteHostConfig['source'];
  effectiveHost: string | boolean;
  lookupHost: string;
  dnsResolved: boolean;
  resolvedAddresses: Array<{ address: string; family: number }>;
  dnsError: string | null;
  localInterfaces: Array<{ name: string; address: string; family: string; internal: boolean }>;
}

export interface PortConflictProbeResult {
  port: number;
  host: string;
  status: 'free' | 'in_use' | 'timeout' | 'error';
  code?: string;
}

export interface ViteDevDiagnosticsPluginOptions {
  configSource: string;
  command: string;
  mode: string;
  env: Record<string, string | undefined>;
  hostConfig: ResolvedViteHostConfig;
  configuredAllowedHosts: string[];
  allowedHostsFallbackReason: string | null;
  proxyConfig: ResolvedViteProxyConfig;
}

export function sanitizeUrlForDiagnosticLog(raw: string | undefined | null): string | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) {
      parsed.username = '';
      parsed.password = '';
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return trimmed.replace(/\/\/[^/\s@]+@/g, '//[REDACTED]@');
  }
}

export function collectSafeViteEnvSnapshot(
  env: Record<string, string | undefined>,
): SafeViteEnvSnapshot {
  const readRaw = (key: string): string | null => {
    const value = env[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  };
  return {
    NODE_ENV: readRaw('NODE_ENV'),
    PORT: readRaw('PORT'),
    HOST: readRaw('HOST'),
    VITE_DEV_HOST: readRaw('VITE_DEV_HOST'),
    VITE_DEV_PORT: readRaw('VITE_DEV_PORT'),
    APP_URL: sanitizeUrlForDiagnosticLog(readRaw('APP_URL')),
    VITE_APP_URL: sanitizeUrlForDiagnosticLog(readRaw('VITE_APP_URL')),
    VITE_ALLOWED_HOSTS: readRaw('VITE_ALLOWED_HOSTS'),
    VITE_DEV_ALLOWED_HOSTS: readRaw('VITE_DEV_ALLOWED_HOSTS'),
    RADAR_DEV_SPLIT: readRaw('RADAR_DEV_SPLIT'),
    VITE_RADAR_DEV_SPLIT: readRaw('VITE_RADAR_DEV_SPLIT'),
    VITE_API_PROXY_TARGET: sanitizeUrlForDiagnosticLog(readRaw('VITE_API_PROXY_TARGET')),
    DISABLE_HMR: readRaw('DISABLE_HMR'),
    CLOUDFLARE_VITE: readRaw('CLOUDFLARE_VITE'),
    K_SERVICE: readRaw('K_SERVICE'),
    CI: readRaw('CI'),
  };
}

export function resolveViteDevServerHost(
  env: Record<string, string | undefined>,
): ResolvedViteHostConfig {
  const parseHostValue = (raw: string): { host: string | boolean; lookupHost: string } => {
    const trimmed = raw.trim();
    const lower = trimmed.toLowerCase();
    if (lower === 'true') return { host: true, lookupHost: '0.0.0.0' };
    if (lower === 'false') return { host: false, lookupHost: 'localhost' };
    return { host: trimmed, lookupHost: trimmed };
  };

  if (typeof env.VITE_DEV_HOST === 'string' && env.VITE_DEV_HOST.trim()) {
    return { ...parseHostValue(env.VITE_DEV_HOST), source: 'env:VITE_DEV_HOST' };
  }
  if (typeof env.HOST === 'string' && env.HOST.trim()) {
    return { ...parseHostValue(env.HOST), source: 'env:HOST' };
  }
  if (
    (typeof env.K_SERVICE === 'string' && env.K_SERVICE.trim()) ||
    (typeof env.APP_URL === 'string' && env.APP_URL.trim())
  ) {
    return { host: '0.0.0.0', lookupHost: '0.0.0.0', source: 'default:container-0.0.0.0' };
  }
  return { host: 'localhost', lookupHost: 'localhost', source: 'default:localhost' };
}

export function resolveViteDevAllowedHostsSafe(
  env: Record<string, string | undefined>,
): { allowedHosts: string[]; fallbackReason: string | null } {
  try {
    return {
      allowedHosts: resolveAllowedViteDevHosts(env),
      fallbackReason: null,
    };
  } catch (err) {
    return {
      allowedHosts: ['localhost', '127.0.0.1'],
      fallbackReason: err instanceof Error ? err.message : 'INVALID_ALLOWED_HOSTS',
    };
  }
}

export function resolveViteDevProxyConfig(
  env: Record<string, string | undefined>,
  vitePort?: number,
): ResolvedViteProxyConfig {
  const devSplitEnabled =
    env.RADAR_DEV_SPLIT === '1' || env.VITE_RADAR_DEV_SPLIT === '1';
  if (!devSplitEnabled) {
    return {
      devSplitEnabled: false,
      configuredProxyTarget: null,
      proxy: undefined,
      warnings: [],
    };
  }

  const rawTarget = (env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3001').trim();
  const warnings: string[] = [];
  try {
    const parsed = new URL(rawTarget);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      warnings.push(`UNSUPPORTED_PROXY_PROTOCOL:${parsed.protocol}`);
    }
    const targetPort = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
    const effectiveVitePort = vitePort ?? 5173;
    if (
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '0.0.0.0') &&
      targetPort === effectiveVitePort
    ) {
      warnings.push(`PROXY_SELF_LOOP_PORT_${effectiveVitePort}`);
    }
  } catch {
    warnings.push('MALFORMED_PROXY_TARGET_URL');
  }

  return {
    devSplitEnabled: true,
    configuredProxyTarget: sanitizeUrlForDiagnosticLog(rawTarget),
    proxy: {
      '/api': {
        target: rawTarget,
        changeOrigin: true,
        secure: false,
      },
    },
    warnings,
  };
}

export function detectAllowedHostsMergeAnomaly(effectiveAllowedHosts: unknown): string | null {
  if (effectiveAllowedHosts === true || effectiveAllowedHosts === undefined) return null;
  if (!Array.isArray(effectiveAllowedHosts)) {
    return `UNEXPECTED_ALLOWED_HOSTS_TYPE:${typeof effectiveAllowedHosts}`;
  }
  const nonStrings = effectiveAllowedHosts.filter((item) => typeof item !== 'string');
  if (nonStrings.length > 0) {
    return `NON_STRING_ALLOWED_HOSTS_ENTRIES:${JSON.stringify(nonStrings)}`;
  }
  return null;
}

export async function verifyServerHostResolution(
  configured: ResolvedViteHostConfig,
  effectiveHost: string | boolean | undefined,
): Promise<HostResolutionDiagnostic> {
  const normalizedEffective = effectiveHost ?? configured.host;
  const lookupHost =
    typeof normalizedEffective === 'string' && normalizedEffective.trim()
      ? normalizedEffective.trim()
      : normalizedEffective === true
        ? '0.0.0.0'
        : 'localhost';

  const localInterfaces: HostResolutionDiagnostic['localInterfaces'] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const entry of list ?? []) {
      localInterfaces.push({
        name,
        address: entry.address,
        family: String(entry.family),
        internal: entry.internal,
      });
    }
  }

  try {
    const records = await dns.promises.lookup(lookupHost, { all: true });
    return {
      configuredHost: configured.host,
      configuredHostSource: configured.source,
      effectiveHost: normalizedEffective,
      lookupHost,
      dnsResolved: records.length > 0,
      resolvedAddresses: records.map((r) => ({ address: r.address, family: r.family })),
      dnsError: null,
      localInterfaces,
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code ?? 'DNS_LOOKUP_FAILED';
    const message = err instanceof Error ? err.message : String(err);
    return {
      configuredHost: configured.host,
      configuredHostSource: configured.source,
      effectiveHost: normalizedEffective,
      lookupHost,
      dnsResolved: false,
      resolvedAddresses: [],
      dnsError: `${code}: ${message}`,
      localInterfaces,
    };
  }
}

/**
 * Non-binding TCP connect probe to detect whether a port is already occupied
 * without ever binding the port itself (zero race condition with server.listen).
 */
export function probeTcpPortConflict(
  port: number,
  host = '127.0.0.1',
  timeoutMs = 250,
): Promise<PortConflictProbeResult> {
  return new Promise((resolve) => {
    const connectHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
    const socket = net.createConnection({ port, host: connectHost });
    let settled = false;
    const done = (result: PortConflictProbeResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done({ port, host: connectHost, status: 'in_use' }));
    socket.once('timeout', () => done({ port, host: connectHost, status: 'timeout' }));
    socket.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNREFUSED') {
        done({ port, host: connectHost, status: 'free' });
      } else {
        done({ port, host: connectHost, status: 'error', code: err.code ?? 'UNKNOWN' });
      }
    });
  });
}

export function createViteDevDiagnosticsPlugin(
  options: ViteDevDiagnosticsPluginOptions,
): PluginOption {
  return {
    name: 'radar-dev-server-diagnostics',
    apply: 'serve',
    configureServer(server) {
      const effective = server.config.server;
      const effectivePort = effective.port ?? 5173;
      const effectiveProxyTargets = effective.proxy
        ? Object.entries(effective.proxy).map(([prefix, cfg]) => ({
            prefix,
            target: sanitizeUrlForDiagnosticLog(
              typeof cfg === 'string' ? cfg : String(cfg?.target ?? 'unknown'),
            ),
            changeOrigin: typeof cfg === 'object' ? Boolean(cfg?.changeOrigin) : false,
            secure: typeof cfg === 'object' ? cfg?.secure !== false : true,
          }))
        : [];
      const allowedHostsMergeAnomaly = detectAllowedHostsMergeAnomaly(effective.allowedHosts);
      const envSnapshot = collectSafeViteEnvSnapshot(options.env);
      const envPortConflictNote =
        envSnapshot.PORT === '8080'
          ? 'PORT=8080 is typically occupied by container ingress (nginx); Express remaps 8080 -> 3000.'
          : null;

      console.info(
        '[VITE_DEV_DIAGNOSTICS]',
        JSON.stringify({
          configSource: options.configSource,
          command: options.command,
          mode: options.mode,
          root: server.config.root,
          middlewareMode: Boolean(effective.middlewareMode),
          env: envSnapshot,
          host: effective.host ?? options.hostConfig.host,
          hostSource: options.hostConfig.source,
          port: effectivePort,
          configuredAllowedHosts: options.configuredAllowedHosts,
          effectiveAllowedHosts: effective.allowedHosts,
          ...(options.allowedHostsFallbackReason
            ? { allowedHostsFallbackReason: options.allowedHostsFallbackReason }
            : {}),
          ...(allowedHostsMergeAnomaly ? { allowedHostsMergeAnomaly } : {}),
          devSplitEnabled: options.proxyConfig.devSplitEnabled,
          configuredProxyTarget: options.proxyConfig.configuredProxyTarget,
          effectiveProxyTargets,
          ...(options.proxyConfig.warnings.length > 0
            ? { proxyWarnings: options.proxyConfig.warnings }
            : {}),
          ...(envPortConflictNote ? { envPortConflictNote } : {}),
          hmrEnabled: effective.hmr !== false,
        }),
      );

      const probePorts = Array.from(new Set([effectivePort, 3000, 3001, 5173, 8080]));
      void Promise.all([
        verifyServerHostResolution(options.hostConfig, effective.host),
        Promise.all(probePorts.map((p) => probeTcpPortConflict(p))),
      ])
        .then(([hostResolution, portProbes]) => {
          const conflictingPorts = portProbes.filter((p) => p.status === 'in_use').map((p) => p.port);
          console.info(
            '[VITE_DEV_NETWORK_CHECK]',
            JSON.stringify({
              configSource: options.configSource,
              hostResolution: {
                configuredHost: hostResolution.configuredHost,
                source: hostResolution.configuredHostSource,
                effectiveHost: hostResolution.effectiveHost,
                lookupHost: hostResolution.lookupHost,
                dnsResolved: hostResolution.dnsResolved,
                resolvedAddresses: hostResolution.resolvedAddresses,
                ...(hostResolution.dnsError ? { dnsError: hostResolution.dnsError } : {}),
                interfaceCount: hostResolution.localInterfaces.length,
              },
              portProbes,
              activeListenersDetected: conflictingPorts,
            }),
          );
          if (!hostResolution.dnsResolved) {
            console.warn(
              `[VITE_DEV_HOST_WARNING] server.host "${hostResolution.lookupHost}" failed DNS lookup: ${hostResolution.dnsError}`,
            );
          }
        })
        .catch(() => undefined);

      server.httpServer?.once('error', (err: NodeJS.ErrnoException) => {
        console.error(
          `[VITE_DEV_BIND_ERROR] Failed to bind Vite dev server on ${String(effective.host ?? options.hostConfig.host)}:${effectivePort} (${err.code ?? 'UNKNOWN'}): ${err.message}`,
        );
      });
    },
  };
}

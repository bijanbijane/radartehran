/** @file server/modules/shared/atomicJsonRepository.ts — Atomic Disk Persistence (0o600, Temp+Rename, Debounced Flush, Test Isolation) */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isDurableRepositoryProductionMode } from './repositoryPersistencePolicy';
import { isRepositoryRemotePersistenceActive } from './durableRepositorySnapshotStore';
import { loadRepositorySnapshot, persistRepositorySnapshot } from './durableRepositorySnapshotStore';

const DEFAULT_BASE_DIR = path.resolve(process.cwd(), '.cache', 'repositories');
let customBaseDirForTests: string | null = null;
const registeredFlushers = new Set<() => void>();
const registeredAsyncFlushers = new Set<() => Promise<void>>();

export function setRepositoryBaseDirForTests(dirPath: string | null): void {
  customBaseDirForTests = dirPath ? path.resolve(dirPath) : null;
}

export function getRepositoryBaseDir(): string {
  return customBaseDirForTests ?? DEFAULT_BASE_DIR;
}

export function flushAllRepositoriesSync(): void {
  for (const flusher of registeredFlushers) {
    try { flusher(); } catch { /* ignore shutdown flush errors */ }
  }
}

export async function flushAllRepositoriesAsync(): Promise<void> {
  for (const flusher of registeredAsyncFlushers) {
    try { await flusher(); } catch { /* ignore shutdown flush errors */ }
  }
}


const SENSITIVE_KEY_PATTERN = /^(token|idToken|accessToken|refreshToken|secret|password|apiKey|privateKey|botToken|adminSecret)$/i;

export function stripSecretKeysDeep<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => stripSecretKeysDeep(item)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) continue;
    out[k] = stripSecretKeysDeep(v);
  }
  return out as T;
}

export class AtomicJsonRepository<T> {
  private readonly fileName: string;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingData: T | null = null;
  private loaded = false;
  private cachedData: T | null = null;
  private durablePersistChain: Promise<void> = Promise.resolve();
  private lastPersistError: Error | null = null;
  private hydrating: Promise<void> | null = null;

  constructor(fileName: string) {
    this.fileName = fileName;
    registeredFlushers.add(() => this.flushSync());
    registeredAsyncFlushers.add(() => this.awaitPendingPersistence());
  }

  public getFilePath(): string {
    return path.join(getRepositoryBaseDir(), this.fileName);
  }

  public resetInMemoryCacheForTests(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingData = null;
    this.cachedData = null;
    this.loaded = false;
    this.durablePersistChain = Promise.resolve();
    this.lastPersistError = null;
    this.hydrating = null;
  }

  public getLastPersistError(): Error | null {
    return this.lastPersistError;
  }

  public async awaitPendingPersistence(): Promise<void> {
    await this.durablePersistChain;
    if (this.lastPersistError) throw this.lastPersistError;
  }

  public async ensureRemoteHydrated(defaultFactory: () => T): Promise<T> {
    if (!isRepositoryRemotePersistenceActive()) return this.load(defaultFactory);
    if (this.loaded && this.cachedData !== null) return this.cachedData;
    if (!this.hydrating) {
      this.hydrating = (async () => {
        try {
          const raw = await loadRepositorySnapshot(this.fileName);
          if (raw && raw.trim()) {
            this.cachedData = JSON.parse(raw) as T;
          } else {
            this.cachedData = defaultFactory();
          }
          this.loaded = true;
        } catch {
          this.cachedData = defaultFactory();
          this.loaded = true;
        }
      })();
    }
    await this.hydrating;
    return this.cachedData as T;
  }

  public load(defaultFactory: () => T): T {
    if (this.loaded && this.cachedData !== null) return this.cachedData;
    const filePath = this.getFilePath();
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        if (raw.trim()) {
          this.cachedData = JSON.parse(raw) as T;
          this.loaded = true;
          return this.cachedData;
        }
      }
    } catch {
      // Corrupt or unreadable file falls back cleanly to initial state
    }
    this.cachedData = defaultFactory();
    this.loaded = true;
    return this.cachedData;
  }

  public saveDebounced(data: T, delayMs = 80): void {
    this.cachedData = data;
    this.pendingData = data;
    this.loaded = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      const data = this.pendingData ?? this.cachedData;
      if (data === null) return;
      if (isRepositoryRemotePersistenceActive()) this.writeImmediate(data);
      else this.flushSync();
    }, delayMs);
    this.flushTimer.unref?.();
  }

  public writeImmediate(data: T): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.cachedData = data;
    this.pendingData = data;
    this.loaded = true;
    if (isRepositoryRemotePersistenceActive()) {
      this.lastPersistError = null;
      // A failed snapshot must not poison the queue permanently. Preserve the
      // failure for awaitPendingPersistence(), then allow the next write to retry.
      this.durablePersistChain = this.durablePersistChain.catch(() => undefined).then(async () => {
        this.lastPersistError = null;
        try {
          await persistRepositorySnapshot(this.fileName, targetDataForPersist(data));
        } catch (error) {
          this.lastPersistError = error instanceof Error ? error : new Error(String(error));
        }
      });
      return;
    }
    this.flushSync();
  }

  public async writeImmediateAwait(data: T): Promise<void> {
    this.writeImmediate(data);
    await this.awaitPendingPersistence();
  }

  public flushSync(): void {
    if (isRepositoryRemotePersistenceActive()) return;
    const targetData = this.pendingData ?? this.cachedData;
    if (targetData === null) return;
    this.pendingData = null;
    const filePath = this.getFilePath();
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const sanitized = stripSecretKeysDeep(targetData);
    const tmpPath = `${filePath}.tmp.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tmpPath, JSON.stringify(sanitized, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmpPath, filePath);
  }
}

function targetDataForPersist<T>(data: T): T {
  return stripSecretKeysDeep(data);
}

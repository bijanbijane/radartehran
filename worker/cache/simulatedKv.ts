/**
 * @file worker/cache/simulatedKv.ts
 * @description In-memory simulated Cloudflare Workers KV namespace binding for tests.
 */

import type { KVNamespaceBinding } from './types';

export class SimulatedKVNamespace implements KVNamespaceBinding {
  private readonly store = new Map<string, { value: any; expiration?: number; metadata?: any }>();

  public async get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream'; cacheTtl?: number }): Promise<any> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiration && Date.now() / 1000 > entry.expiration) {
      this.store.delete(key);
      return null;
    }
    if (options?.type === 'json' && typeof entry.value === 'string') {
      try {
        return JSON.parse(entry.value);
      } catch {
        return null;
      }
    }
    return entry.value;
  }

  public async getWithMetadata<T = unknown, M = unknown>(
    key: string,
    options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream'; cacheTtl?: number }
  ): Promise<{ value: T | null; metadata: M | null }> {
    const entry = this.store.get(key);
    if (!entry) return { value: null, metadata: null };
    const val = await this.get(key, options);
    return { value: val as T, metadata: (entry.metadata as M) ?? null };
  }

  public async put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: { expiration?: number; expirationTtl?: number; metadata?: any }
  ): Promise<void> {
    let exp = options?.expiration;
    if (!exp && options?.expirationTtl) {
      exp = Math.floor(Date.now() / 1000) + options.expirationTtl;
    }
    this.store.set(key, { value, expiration: exp, metadata: options?.metadata });
  }

  public async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  public async list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string; expiration?: number; metadata?: unknown }>;
    list_complete: boolean;
    cursor?: string;
  }> {
    const prefix = options?.prefix || '';
    const keys = Array.from(this.store.keys())
      .filter((k) => k.startsWith(prefix))
      .map((k) => ({
        name: k,
        expiration: this.store.get(k)?.expiration,
        metadata: this.store.get(k)?.metadata,
      }));
    return { keys, list_complete: true };
  }
}

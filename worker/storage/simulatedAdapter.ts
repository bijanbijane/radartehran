/**
 * @file worker/storage/simulatedAdapter.ts
 * @description In-memory deterministic storage provider for contract testing,
 * CI environments, and local development where R2 bindings are simulated.
 *
 * Implements the full `ObjectStorageProvider` and `R2BucketBinding` contract
 * without requiring Cloudflare Workers runtime or live credentials.
 */

import type {
  ObjectStorageProvider,
  R2BucketBinding,
  StorageConditionalConstraints,
  StorageGetOptions,
  StorageListOptions,
  StorageMultipartUpload,
  StorageObjectDescriptor,
  StorageObjectsList,
  StorageObjectWithBody,
  StorageProviderCapabilities,
  StoragePutOptions,
  StorageRange,
  StorageUploadedPart,
} from './types';

interface StoredEntry {
  key: string;
  bytes: Uint8Array;
  etag: string;
  httpEtag: string;
  version: string;
  uploaded: Date;
  httpMetadata?: Record<string, string>;
  customMetadata?: Record<string, string>;
}

export class SimulatedR2StorageAdapter implements ObjectStorageProvider, R2BucketBinding {
  private readonly store = new Map<string, StoredEntry>();
  private readonly multipartSessions = new Map<string, { key: string; options?: StoragePutOptions; parts: Map<number, Uint8Array> }>();
  public simulatedFailure: 'NONE' | 'NETWORK_ERROR' | 'CONDITIONAL_FAIL' | 'METADATA_FAIL' = 'NONE';

  public getCapabilities(): StorageProviderCapabilities {
    return {
      providerId: 'cloudflare_r2',
      supportsNativeR2Binding: true,
      supportsStreamingReads: true,
      supportsRangeRequests: true,
      supportsConditionalWrites: true,
      supportsMultipartUploads: true,
      supportsCustomMetadata: true,
      supportsPagination: true,
      supportsDirectPresignedUrls: false,
      notes: 'Simulated in-memory R2 provider for test suites and deterministic verification.',
    };
  }

  private checkFailure(): void {
    if (this.simulatedFailure === 'NETWORK_ERROR') {
      throw new Error('SIMULATED_R2_NETWORK_TIMEOUT');
    }
  }

  private matchesConditions(entry: StoredEntry | undefined, onlyIf?: StorageConditionalConstraints): boolean {
    if (!onlyIf) return true;
    if (onlyIf.etagMatches && entry?.etag !== onlyIf.etagMatches) return false;
    if (onlyIf.etagDoesNotMatch && entry?.etag === onlyIf.etagDoesNotMatch) return false;
    if (onlyIf.uploadedBefore && entry && entry.uploaded >= onlyIf.uploadedBefore) return false;
    if (onlyIf.uploadedAfter && entry && entry.uploaded <= onlyIf.uploadedAfter) return false;
    return true;
  }

  private sliceRange(bytes: Uint8Array, range?: StorageRange): Uint8Array {
    if (!range) return bytes;
    if ('suffix' in range) {
      const suffix = Math.min(bytes.byteLength, Math.max(0, range.suffix));
      return bytes.subarray(bytes.byteLength - suffix);
    }
    const offset = Math.max(0, range.offset);
    const length = range.length !== undefined ? Math.max(0, range.length) : bytes.byteLength - offset;
    return bytes.subarray(offset, Math.min(bytes.byteLength, offset + length));
  }

  public async put(
    key: string,
    value: ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | string | null | Blob,
    options?: StoragePutOptions
  ): Promise<StorageObjectDescriptor | null> {
    this.checkFailure();
    if (this.simulatedFailure === 'CONDITIONAL_FAIL') return null;

    let bytes: Uint8Array;
    if (value instanceof Uint8Array) {
      bytes = value;
    } else if (value instanceof ArrayBuffer) {
      bytes = new Uint8Array(value);
    } else if (ArrayBuffer.isView(value)) {
      bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    } else if (typeof value === 'string') {
      bytes = new TextEncoder().encode(value);
    } else if (value && typeof (value as Blob).arrayBuffer === 'function') {
      bytes = new Uint8Array(await (value as Blob).arrayBuffer());
    } else if (value && typeof (value as ReadableStream).getReader === 'function') {
      const reader = (value as ReadableStream<Uint8Array>).getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        if (chunk) {
          chunks.push(chunk);
          total += chunk.byteLength;
        }
      }
      bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
    } else {
      bytes = new Uint8Array(0);
    }

    const existing = this.store.get(key);
    if (!this.matchesConditions(existing, options?.onlyIf)) {
      return null;
    }

    const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
    const hashHex = Array.from(new Uint8Array(hashBuf), (b) => b.toString(16).padStart(2, '0')).join('');
    const etag = `"${hashHex.slice(0, 32)}"`;

    const entry: StoredEntry = {
      key,
      bytes,
      etag,
      httpEtag: etag,
      version: `v_${Date.now()}`,
      uploaded: new Date(),
      httpMetadata: options?.httpMetadata as Record<string, string> | undefined,
      customMetadata: options?.customMetadata as Record<string, string> | undefined,
    };

    this.store.set(key, entry);

    return {
      key: entry.key,
      version: entry.version,
      size: entry.bytes.byteLength,
      etag: entry.etag,
      httpEtag: entry.httpEtag,
      uploaded: entry.uploaded,
      httpMetadata: entry.httpMetadata,
      customMetadata: entry.customMetadata,
      writeHttpMetadata: (headers: Headers) => {
        if (entry.httpMetadata?.contentType) headers.set('Content-Type', entry.httpMetadata.contentType);
        if (entry.httpMetadata?.cacheControl) headers.set('Cache-Control', entry.httpMetadata.cacheControl);
        headers.set('ETag', entry.httpEtag);
      },
    };
  }

  public async putObject(
    key: string,
    data: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>,
    options?: StoragePutOptions
  ): Promise<StorageObjectDescriptor> {
    const res = await this.put(key, data, options);
    if (!res) throw new Error('SIMULATED_PRECONDITION_FAILED');
    return res;
  }

  public async get(key: string, options?: StorageGetOptions): Promise<StorageObjectWithBody | null> {
    this.checkFailure();
    const entry = this.store.get(key);
    if (!entry) return null;

    if (!this.matchesConditions(entry, options?.onlyIf)) {
      return null;
    }

    const sliced = this.sliceRange(entry.bytes, options?.range);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(sliced);
        controller.close();
      },
    });

    return {
      key: entry.key,
      version: entry.version,
      size: sliced.byteLength,
      etag: entry.etag,
      httpEtag: entry.httpEtag,
      uploaded: entry.uploaded,
      httpMetadata: entry.httpMetadata,
      customMetadata: entry.customMetadata,
      body: stream,
      bodyUsed: false,
      arrayBuffer: async () => sliced.buffer.slice(sliced.byteOffset, sliced.byteOffset + sliced.byteLength),
      text: async () => new TextDecoder().decode(sliced),
      json: async <T>() => JSON.parse(new TextDecoder().decode(sliced)) as T,
      blob: async () => new Blob([sliced], { type: entry.httpMetadata?.contentType }),
      writeHttpMetadata: (headers: Headers) => {
        if (entry.httpMetadata?.contentType) headers.set('Content-Type', entry.httpMetadata.contentType);
        if (entry.httpMetadata?.cacheControl) headers.set('Cache-Control', entry.httpMetadata.cacheControl);
        headers.set('ETag', entry.httpEtag);
      },
    };
  }

  public async getObject(key: string, options?: StorageGetOptions): Promise<StorageObjectWithBody | null> {
    return await this.get(key, options);
  }

  public async head(key: string): Promise<StorageObjectDescriptor | null> {
    this.checkFailure();
    const entry = this.store.get(key);
    if (!entry) return null;
    return {
      key: entry.key,
      version: entry.version,
      size: entry.bytes.byteLength,
      etag: entry.etag,
      httpEtag: entry.httpEtag,
      uploaded: entry.uploaded,
      httpMetadata: entry.httpMetadata,
      customMetadata: entry.customMetadata,
      writeHttpMetadata: (headers: Headers) => {
        if (entry.httpMetadata?.contentType) headers.set('Content-Type', entry.httpMetadata.contentType);
        headers.set('ETag', entry.httpEtag);
      },
    };
  }

  public async headObject(key: string): Promise<StorageObjectDescriptor | null> {
    return await this.head(key);
  }

  public async delete(keys: string | string[]): Promise<void> {
    this.checkFailure();
    const targetKeys = Array.isArray(keys) ? keys : [keys];
    for (const key of targetKeys) {
      this.store.delete(key);
    }
  }

  public async deleteObject(key: string): Promise<{ deleted: boolean; wasAlreadyMissing: boolean }> {
    const existed = this.store.has(key);
    await this.delete(key);
    return { deleted: true, wasAlreadyMissing: !existed };
  }

  public async deleteObjects(keys: string[]): Promise<{ deletedKeys: string[]; failedKeys: string[] }> {
    await this.delete(keys);
    return { deletedKeys: keys, failedKeys: [] };
  }

  public async list(options?: StorageListOptions): Promise<StorageObjectsList> {
    this.checkFailure();
    const prefix = options?.prefix || '';
    const limit = Math.max(1, Math.min(1000, options?.limit || 1000));
    const all = Array.from(this.store.values())
      .filter((e) => e.key.startsWith(prefix))
      .sort((a, b) => a.key.localeCompare(b.key));

    const paged = all.slice(0, limit);
    return {
      objects: paged.map((entry) => ({
        key: entry.key,
        version: entry.version,
        size: entry.bytes.byteLength,
        etag: entry.etag,
        httpEtag: entry.httpEtag,
        uploaded: entry.uploaded,
        httpMetadata: entry.httpMetadata,
        customMetadata: entry.customMetadata,
      })),
      truncated: all.length > limit,
      cursor: all.length > limit ? paged[paged.length - 1].key : undefined,
      delimitedPrefixes: [],
    };
  }

  public async listObjects(options?: StorageListOptions): Promise<StorageObjectsList> {
    return await this.list(options);
  }

  public async createMultipartUpload(key: string, options?: StoragePutOptions): Promise<StorageMultipartUpload> {
    this.checkFailure();
    const uploadId = `mp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session = { key, options, parts: new Map<number, Uint8Array>() };
    this.multipartSessions.set(uploadId, session);

    const self = this;
    return {
      key,
      uploadId,
      uploadPart: async (partNumber: number, value: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | string): Promise<StorageUploadedPart> => {
        let partBytes: Uint8Array;
        if (value instanceof Uint8Array) partBytes = value;
        else if (value instanceof ArrayBuffer) partBytes = new Uint8Array(value);
        else if (typeof value === 'string') partBytes = new TextEncoder().encode(value);
        else partBytes = new Uint8Array(0);

        session.parts.set(partNumber, partBytes);
        const hashBuf = await crypto.subtle.digest('SHA-256', partBytes);
        const etag = `"${Array.from(new Uint8Array(hashBuf), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)}"`;
        return { partNumber, etag };
      },
      abort: async () => {
        self.multipartSessions.delete(uploadId);
      },
      complete: async (uploadedParts: StorageUploadedPart[]): Promise<StorageObjectDescriptor> => {
        const sorted = [...uploadedParts].sort((a, b) => a.partNumber - b.partNumber);
        let total = 0;
        for (const p of sorted) {
          const buf = session.parts.get(p.partNumber);
          if (!buf) throw new Error(`MISSING_MULTIPART_PART: Part ${p.partNumber} not found.`);
          total += buf.byteLength;
        }

        const combined = new Uint8Array(total);
        let offset = 0;
        for (const p of sorted) {
          const buf = session.parts.get(p.partNumber)!;
          combined.set(buf, offset);
          offset += buf.byteLength;
        }

        self.multipartSessions.delete(uploadId);
        const res = await self.put(key, combined, options);
        if (!res) throw new Error('FAILED_TO_FINALIZE_MULTIPART');
        return res;
      },
    };
  }

  public async resumeMultipartUpload(key: string, uploadId: string): Promise<StorageMultipartUpload> {
    const session = this.multipartSessions.get(uploadId);
    if (!session || session.key !== key) {
      throw new Error('MULTIPART_SESSION_NOT_FOUND');
    }

    const self = this;
    return {
      key,
      uploadId,
      uploadPart: async (partNumber: number, value: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | string) => {
        let partBytes: Uint8Array;
        if (value instanceof Uint8Array) partBytes = value;
        else if (value instanceof ArrayBuffer) partBytes = new Uint8Array(value);
        else if (typeof value === 'string') partBytes = new TextEncoder().encode(value);
        else partBytes = new Uint8Array(0);

        session.parts.set(partNumber, partBytes);
        const hashBuf = await crypto.subtle.digest('SHA-256', partBytes);
        const etag = `"${Array.from(new Uint8Array(hashBuf), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)}"`;
        return { partNumber, etag };
      },
      abort: async () => {
        self.multipartSessions.delete(uploadId);
      },
      complete: async (uploadedParts: StorageUploadedPart[]) => {
        const sorted = [...uploadedParts].sort((a, b) => a.partNumber - b.partNumber);
        let total = 0;
        for (const p of sorted) {
          const buf = session.parts.get(p.partNumber);
          if (!buf) throw new Error(`MISSING_MULTIPART_PART: Part ${p.partNumber} not found.`);
          total += buf.byteLength;
        }

        const combined = new Uint8Array(total);
        let offset = 0;
        for (const p of sorted) {
          const buf = session.parts.get(p.partNumber)!;
          combined.set(buf, offset);
          offset += buf.byteLength;
        }

        self.multipartSessions.delete(uploadId);
        const res = await self.put(key, combined, session.options);
        if (!res) throw new Error('FAILED_TO_FINALIZE_MULTIPART');
        return res;
      },
    };
  }
}

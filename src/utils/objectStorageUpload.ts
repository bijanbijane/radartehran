import crypto from 'crypto'; import { isIP } from 'node:net'; import sharp from 'sharp'; import { ALLOWED_IMAGE_MIMES, ALLOWED_VIDEO_MIMES, ObjectStorageProviderId, } from './objectStorage'; import { detectMediaFormatByMagicBytes, hasPolyglotScriptBytes, isSvgOrXmlPayload, validateVideoContainerSafety } from './fileSignature'; import { validateStorageEndpointDnsResolution } from './serverConfigValidator'; import { getRuntimeEnvConfig } from './serverRuntimeEnvStore'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export const MAX_IMAGE_TARGET_WIDTH_PX = 800; export function validateObjectStorageEndpoint(rawEndpoint: string): URL { let parsed: URL; try { parsed = new URL(rawEndpoint); } catch { throw new Error('OBJECT_STORAGE_ENDPOINT must be a valid URL'); }
  if (parsed.protocol !== 'https:') throw new Error('OBJECT_STORAGE_ENDPOINT must use https:'); if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('OBJECT_STORAGE_ENDPOINT must not include URL credentials or query'); const host = parsed.hostname.toLowerCase(); const bareHost = host.replace(/^\[|\]$/g, ''); if (!bareHost.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || bareHost.includes(':') || isIP(bareHost) !== 0) { throw new Error('OBJECT_STORAGE_ENDPOINT must be a public DNS hostname'); } return parsed; }
export interface ResolvedObjectStorageConfig { provider: ObjectStorageProviderId; rawProviderName: string; bucket: string; region: string; endpoint: string; endpointHost: string; accessKey: string; secretKey: string; publicBaseUrl: string; maxImageMb: number; maxVideoMb: number; s3CredentialsConfigured: boolean; }
export function normalizeStorageProvider(raw: string): ObjectStorageProviderId { const clean = (raw || '').trim().toLowerCase(); if (clean === 'arvan' || clean === 'arvancloud') return 'arvancloud'; if (clean === 'liara') return 'liara'; if (clean === 'minio') return 'minio'; if (clean === 'firebase' || clean === 'firebase_storage') return 'firebase_storage'; if (clean === 'local' || clean === 'local_bucket') return 'local_bucket'; if (clean === 'r2' || clean === 'cloudflare_r2') return 'r2'; if (clean === 's3' || clean === 's3_compatible') return 's3_compatible'; return 'arvancloud';
} export function resolveObjectStorageRuntimeConfig( env: Record<string, string | undefined> = process.env
): ResolvedObjectStorageConfig { const rt = getRuntimeEnvConfig(env); const provider = normalizeStorageProvider(rt.OBJECT_STORAGE_PROVIDER); const bucket = rt.OBJECT_STORAGE_BUCKET || 'tehran-housing-radar-media'; const region = provider === 'r2' && !env.OBJECT_STORAGE_REGION ? 'auto' : (rt.OBJECT_STORAGE_REGION || 'ir-thr-at1');
  const r2AccountId = (env.R2_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID || '').trim().toLowerCase();
  const defaultR2Endpoint = provider === 'r2' && /^[a-z0-9-]{8,64}$/.test(r2AccountId) ? `https://${r2AccountId}.r2.cloudflarestorage.com` : 'https://s3.ir-thr-at1.arvanstorage.ir';
  const rawEndpoint = (env.OBJECT_STORAGE_ENDPOINT ? rt.OBJECT_STORAGE_ENDPOINT : '') || defaultR2Endpoint;
  let endpointUrl = new URL(defaultR2Endpoint);
  try { endpointUrl = validateObjectStorageEndpoint(rawEndpoint); } catch { endpointUrl = new URL(defaultR2Endpoint); }
  const endpoint = endpointUrl.toString().replace(/\/+$/, ''); const endpointHost = endpointUrl.host; const accessKey = rt.OBJECT_STORAGE_ACCESS_KEY || (env.R2_ACCESS_KEY_ID || '').trim(); const secretKey = rt.OBJECT_STORAGE_SECRET_KEY || (env.R2_SECRET_ACCESS_KEY || '').trim();
  let publicBaseUrl = provider === 'r2' ? `/api/object-storage/file` : `https://${bucket}.s3.${region}.arvanstorage.ir`;
  if (rt.OBJECT_STORAGE_PUBLIC_BASE_URL) { try { publicBaseUrl = validateObjectStorageEndpoint(rt.OBJECT_STORAGE_PUBLIC_BASE_URL).toString().replace(/\/+$/, ''); } catch { /* retain default */ } }
  return { provider, rawProviderName: rt.OBJECT_STORAGE_PROVIDER || 'arvan', bucket, region, endpoint, endpointHost, accessKey, secretKey, publicBaseUrl, maxImageMb: rt.OBJECT_STORAGE_MAX_IMAGE_MB, maxVideoMb: rt.OBJECT_STORAGE_MAX_VIDEO_MB, s3CredentialsConfigured: Boolean(accessKey.length >= 4 && secretKey.length >= 8), }; }
export function validateObjectStoragePayload(params: { buffer: Buffer; mediaType: 'image' | 'video'; mimeType: string; cfg: ResolvedObjectStorageConfig; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; referenceValuationMillionToman?: number; }): { ok: boolean; statusCode: 200 | 400 | 413; errorMessage?: string; displayAreaUnitLabel: string; referenceValuationIntlText: string } {
  const { buffer, mediaType, mimeType, cfg, areaUnit = 'sqm', intlCurrency = 'USD', referenceValuationMillionToman = 0 } = params;
  const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
  const referenceValuationIntlText = formatMillionTomanAsIntlCurrency(referenceValuationMillionToman, intlCurrency, 'en');
  if (isSvgOrXmlPayload(buffer, mimeType)) {
    return { ok: false, statusCode: 400, errorMessage: 'آپلود فایل‌های SVG/XML به دلایل امنیتی (XSS) اکیداً ممنوع است.', displayAreaUnitLabel, referenceValuationIntlText };
  }
  const allowedMimes = mediaType === 'video' ? ALLOWED_VIDEO_MIMES : ALLOWED_IMAGE_MIMES;
  if (!allowedMimes.includes(mimeType)) {
    return { ok: false, statusCode: 400, errorMessage: 'فرمت فایل ارسالی مجاز نیست (فقط JPG/PNG/WebP برای تصویر و MP4/WebM برای ویدیو).', displayAreaUnitLabel, referenceValuationIntlText };
  }
  const maxAllowedMb = mediaType === 'video' ? cfg.maxVideoMb : cfg.maxImageMb;
  const maxBytes = maxAllowedMb * 1024 * 1024;
  if (buffer.length > maxBytes) {
    return { ok: false, statusCode: 413, errorMessage: `حجم فایل ارسالی بیش از سقف مجاز (${maxAllowedMb} مگابایت برای ${mediaType === 'video' ? 'ویدیو' : 'تصویر'}) است.`, displayAreaUnitLabel, referenceValuationIntlText };
  }
  const detectedSig = detectMediaFormatByMagicBytes(buffer);
  if (!detectedSig || detectedSig.mediaType !== mediaType || !detectedSig.supportedMimeTypes.includes(mimeType)) {
    return { ok: false, statusCode: 400, errorMessage: 'امضای باینری فایل (Magic Bytes) با نوع فایل اعلام‌شده همخوانی ندارد.', displayAreaUnitLabel, referenceValuationIntlText };
  }
  if (mediaType === 'video') {
    const containerCheck = validateVideoContainerSafety(buffer, mimeType);
    if (!containerCheck.safe) {
      return { ok: false, statusCode: 400, errorMessage: 'ساختار کانتینر ویدیویی نامعتبر یا ناایمن است.', displayAreaUnitLabel, referenceValuationIntlText };
    }
  } else if (hasPolyglotScriptBytes(buffer)) {
    return { ok: false, statusCode: 400, errorMessage: 'فایل تصویری حاوی اسکریپت مخرب (Polyglot) است و مسدود شد.', displayAreaUnitLabel, referenceValuationIntlText };
  }
  return { ok: true, statusCode: 200, displayAreaUnitLabel, referenceValuationIntlText };
}
export interface ProcessedWebpImageResult { buffer: Buffer; mimeType: 'image/webp'; width: number; height: number; originalBytes: number; optimizedBytes: number; }
export const MAX_CONCURRENT_SHARP_JOBS = 2;
export const MAX_SHARP_QUEUE_LENGTH = 32;
export const MAX_SHARP_WAIT_QUEUE = 16;
let activeSharpJobs = 0;
const sharpWaitQueue: Array<() => void> = [];
async function acquireSharpSlot(): Promise<void> {
  if (activeSharpJobs < MAX_CONCURRENT_SHARP_JOBS) { activeSharpJobs += 1; return; }
  if (sharpWaitQueue.length >= MAX_SHARP_QUEUE_LENGTH) throw new Error('IMAGE_PROCESSING_QUEUE_FULL');
  await new Promise<void>((resolve) => { sharpWaitQueue.push(() => { activeSharpJobs += 1; resolve(); }); });
}
function releaseSharpSlot(): void {
  activeSharpJobs = Math.max(0, activeSharpJobs - 1);
  const next = sharpWaitQueue.shift();
  if (next) next();
}
export async function processImageToWebpMax800(inputBuffer: Buffer, maxWidth: number = MAX_IMAGE_TARGET_WIDTH_PX): Promise<ProcessedWebpImageResult> {
  const safeMaxWidth = Math.max(100, Math.min(1920, Math.round(maxWidth) || 800));
  if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length < 12) throw new Error('INVALID_IMAGE_INPUT');
  const originalBytes = inputBuffer.length;
  await acquireSharpSlot();
  try {
    const pipeline = sharp(inputBuffer, { failOn: 'error', limitInputPixels: 40_000_000 });
    const metadata = await pipeline.metadata();
    const allowedFormats = new Set(['jpeg', 'png', 'webp']);
    if (!metadata.format || !allowedFormats.has(metadata.format) || !Number.isInteger(metadata.width) || !Number.isInteger(metadata.height) || (metadata.width ?? 0) <= 0 || (metadata.height ?? 0) <= 0) {
      throw new Error('UNSUPPORTED_IMAGE_FORMAT');
    }
    const result = await pipeline.rotate().resize({ width: safeMaxWidth, withoutEnlargement: true, fit: 'inside' }).webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
    if (result.data.length === 0 || result.info.format !== 'webp' || !Number.isFinite(result.info.width) || !Number.isFinite(result.info.height) || result.info.width <= 0 || result.info.height <= 0 || result.info.width > safeMaxWidth) {
      throw new Error('INVALID_IMAGE_OUTPUT');
    }
    return { buffer: result.data, mimeType: 'image/webp', width: result.info.width, height: result.info.height, originalBytes, optimizedBytes: result.data.length };
  } catch {
    throw new Error('INVALID_IMAGE_INPUT');
  } finally {
    releaseSharpSlot();
  }
}
const DEFAULT_ALLOWED_OBJECT_STORAGE_HOSTS = [
  's3.ir-thr-at1.arvanstorage.ir',
];
const R2_HOST_PATTERN = /^[a-z0-9-]+\.r2\.cloudflarestorage\.com$/i;
export function buildValidatedS3TargetUrl(
  objectKey: string,
  cfg: ResolvedObjectStorageConfig,
  env: Record<string, string | undefined> = process.env
): URL | null {
  const supportedProviders = new Set(['arvancloud', 'liara', 'minio', 's3_compatible', 'r2']);
  if (!supportedProviders.has(cfg.provider)) return null;
  if (!cfg.bucket || !/^[A-Za-z0-9][A-Za-z0-9.-]{1,61}[A-Za-z0-9]$/.test(cfg.bucket)) return null;
  const validListingObjectKey =
    /^listings\/(tehran|karaj|mashhad|isfahan|shiraz)\/hood-[1-9]\d{0,2}\/(image|video)\/\d{4}-(0[1-9]|1[0-2])\/obj-\d{10,16}-[a-f0-9]{8}\.(jpg|jpeg|png|webp|mp4|webm|mov)$/i;
  const validTelemetryBatchKey =
    /^telemetry\/v1\/year=\d{4}\/month=(0[1-9]|1[0-2])\/day=(0[1-9]|[12]\d|3[01])\/batch-[A-Za-z0-9_-]{4,64}\.ndjson$/i;
  if (!validListingObjectKey.test(objectKey) && !validTelemetryBatchKey.test(objectKey)) return null;
  let endpoint: URL;
  try { endpoint = new URL(cfg.endpoint); } catch { return null; }
  if (
    endpoint.protocol !== 'https:' || !endpoint.hostname || endpoint.username ||
    endpoint.password || endpoint.search || endpoint.hash ||
    (endpoint.pathname !== '/' && endpoint.pathname !== '')
  ) { return null; }
  if (env.NODE_ENV === 'production' && endpoint.port !== '') return null;
  const hostLower = endpoint.hostname.toLowerCase();
  const configuredHosts = (env.OBJECT_STORAGE_ALLOWED_HOSTS || DEFAULT_ALLOWED_OBJECT_STORAGE_HOSTS.join(','))
    .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
  const isR2Enabled =
    cfg.provider === 'r2' ||
    cfg.rawProviderName.trim().toLowerCase() === 'r2' ||
    (env.OBJECT_STORAGE_PROVIDER || '').trim().toLowerCase() === 'r2' ||
    Boolean((env.R2_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID || '').trim());
  const isAllowedR2Host = isR2Enabled && R2_HOST_PATTERN.test(hostLower);
  if (!configuredHosts.includes(hostLower) && !isAllowedR2Host) return null;
  const encodedObjectKey = objectKey.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  const target = new URL(`/${encodeURIComponent(cfg.bucket)}/${encodedObjectKey}`, endpoint.origin);
  if (target.protocol !== 'https:' || target.hostname !== endpoint.hostname) return null;
  return target;
}
export async function uploadToRemoteS3Compatible(
  objectKey: string,
  buffer: Buffer,
  mimeType: string,
  cfg: ResolvedObjectStorageConfig
): Promise<boolean> {
  if (!cfg.s3CredentialsConfigured) return false;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || typeof mimeType !== 'string' || mimeType.length === 0) return false;
  const targetUrl = buildValidatedS3TargetUrl(objectKey, cfg);
  if (!targetUrl) {
    console.error('[OBJECT_STORAGE_UPLOAD_BLOCKED] Invalid or non-allowlisted S3 endpoint.');
    return false;
  }
  try {
    const dnsCheck = await validateStorageEndpointDnsResolution(targetUrl.hostname);
    if (!dnsCheck.safe) { console.error('[OBJECT_STORAGE_SSRF_BLOCKED]', dnsCheck.reason); return false; }
    const payloadHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const { authorization, amzDate } = computeSigV4('PUT', targetUrl, cfg, payloadHash, { 'content-type': mimeType });
    const response = await fetch(targetUrl.toString(), {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        Authorization: authorization,
      },
      body: new Uint8Array(buffer),
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
    });
    return response.ok;
  } catch { return false; }
}
export const uploadBufferToObjectStorage = uploadToRemoteS3Compatible;
export async function downloadFromRemoteS3Compatible(
  objectKey: string,
  cfg: ResolvedObjectStorageConfig = resolveObjectStorageRuntimeConfig()
): Promise<Buffer | null> {
  if (!cfg.s3CredentialsConfigured) return null;
  const targetUrl = buildValidatedS3TargetUrl(objectKey, cfg);
  if (!targetUrl) return null;
  try {
    const dnsCheck = await validateStorageEndpointDnsResolution(targetUrl.hostname);
    if (!dnsCheck.safe) return null;
    const payloadHash = crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex');
    const { authorization, amzDate } = computeSigV4('GET', targetUrl, cfg, payloadHash);
    const response = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: { 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, Authorization: authorization },
      signal: AbortSignal.timeout(20_000),
      redirect: 'error',
    });
    if (!response.ok) return null;
    const arr = await response.arrayBuffer();
    return arr.byteLength > 0 ? Buffer.from(arr) : null;
  } catch { return null; }
}
function computeSigV4(
  method: 'GET' | 'PUT' | 'DELETE',
  targetUrl: URL,
  cfg: ResolvedObjectStorageConfig,
  payloadHash: string,
  extraHeaders: Record<string, string> = {}
) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    ...extraHeaders,
    host: targetUrl.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedKeys = Object.keys(headers).map((k) => k.toLowerCase()).sort();
  const canonicalHeaders = signedKeys.map((k) => `${k}:${headers[k]}\n`).join('');
  const signedHeaders = signedKeys.join(';');
  const canonicalRequest = [method, targetUrl.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256', amzDate, credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  const hmac = (key: Buffer | string, data: string): Buffer => crypto.createHmac('sha256', key).update(data).digest();
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${cfg.secretKey}`, dateStamp), cfg.region), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { authorization, amzDate, payloadHash };
}
export async function deleteFromRemoteS3Compatible(
  objectKey: string,
  cfg: ResolvedObjectStorageConfig
): Promise<boolean> {
  if (!cfg.s3CredentialsConfigured) return false;
  const targetUrl = buildValidatedS3TargetUrl(objectKey, cfg);
  if (!targetUrl) return false;
  try {
    const dnsCheck = await validateStorageEndpointDnsResolution(targetUrl.hostname);
    if (!dnsCheck.safe) return false;
    const payloadHash = crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex');
    const { authorization, amzDate } = computeSigV4('DELETE', targetUrl, cfg, payloadHash);
    const response = await fetch(targetUrl.toString(), {
      method: 'DELETE',
      headers: { 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, Authorization: authorization },
      signal: AbortSignal.timeout(8000), redirect: 'error',
    });
    return response.ok || response.status === 404;
  } catch { return false; }
}
/**
 * Internal Write Admission RPC — authoritative D1 read for Express runtime (D-H2-01).
 * USER_DB and Stage D D1 use different persisted schemas and replay-protection tables.
 */
import { jsonWorkerResponse } from '../contextAndSecurity.ts';
import type { WorkerRequestContext } from '../types.ts';
import {
  INTERNAL_WRITE_ADMISSION_RPC_PATH,
  WRITE_ADMISSION_RPC_NONCE_HEADER,
  WRITE_ADMISSION_RPC_SIGNATURE_HEADER,
  WRITE_ADMISSION_RPC_TIMESTAMP_HEADER,
  WRITE_ADMISSION_RPC_SECRET_ENV,
  type WriteAdmissionRpcRequestBody,
} from '../../server/modules/account-lifecycle/writeAdmissionRpcContract.ts';
import { verifyWriteAdmissionRpcRequest } from '../../server/modules/account-lifecycle/writeAdmissionRpcAuth.ts';
import { resolveWriteAdmissionFromD1 } from '../account-lifecycle/d1WriteAdmissionResolver.ts';
import { resolveWriteAdmissionFromUserDb } from '../account-lifecycle/d1UserWriteAdmissionResolver.ts';
import { consumeLifecycleRpcNonce as consumeUserDbNonce } from '../account-lifecycle/d1InternalRpcNonceStore.ts';
import { consumeLifecycleRpcNonce as consumeStageDNonce } from '../account-lifecycle/d1WriteAdmissionNonceStore.ts';
import { requireUserDb } from '../db/bindingResolver.ts';
import { acquireMutationPermitInD1, releaseMutationPermitInD1 } from '../account-lifecycle/d1MutationPermit.ts';
import type { D1DatabaseBinding } from '../db/types.ts';

export function isInternalWriteAdmissionPath(pathname: string, method: string): boolean {
  return method === 'POST' && pathname === INTERNAL_WRITE_ADMISSION_RPC_PATH;
}

export async function handleInternalWriteAdmissionRoute(ctx: WorkerRequestContext): Promise<Response | null> {
  if (!isInternalWriteAdmissionPath(ctx.pathname, ctx.method)) return null;

  const secret = ctx.env[WRITE_ADMISSION_RPC_SECRET_ENV as keyof typeof ctx.env] as string | undefined;
  if (!secret?.trim()) {
    return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'RPC_SECRET_NOT_CONFIGURED' });
  }

  const timestamp = ctx.request.headers.get(WRITE_ADMISSION_RPC_TIMESTAMP_HEADER) ?? '';
  const nonce = ctx.request.headers.get(WRITE_ADMISSION_RPC_NONCE_HEADER) ?? '';
  const signature = ctx.request.headers.get(WRITE_ADMISSION_RPC_SIGNATURE_HEADER) ?? '';
  const bodyText = await ctx.request.text();
  if (!nonce || !timestamp || !signature) {
    return jsonWorkerResponse(ctx, 401, { status: 'error', code: 'RPC_AUTH_HEADERS_MISSING' });
  }

  const auth = await verifyWriteAdmissionRpcRequest({
    secret: secret.trim(),
    method: 'POST',
    timestamp,
    nonce,
    bodyJson: bodyText,
    providedSignature: signature,
  });
  if (auth.ok === false) {
    return jsonWorkerResponse(ctx, 401, { status: 'error', code: auth.code });
  }

  let body: WriteAdmissionRpcRequestBody;
  try {
    body = JSON.parse(bodyText) as WriteAdmissionRpcRequestBody;
  } catch {
    return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'RPC_BODY_INVALID' });
  }
  const targetUid = typeof body.targetUid === 'string' ? body.targetUid.trim() : '';
  if (!targetUid || targetUid.length > 128) {
    return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'TARGET_UID_INVALID' });
  }

  if (ctx.env.USER_DB) {
    const userDbResult = requireUserDb(ctx.env);
    if (userDbResult.ok === false) {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: userDbResult.code });
    }
    const nonceResult = await consumeUserDbNonce({ db: userDbResult.db, nonce });
    if (!nonceResult.consumed) {
      const status = nonceResult.code === 'RPC_NONCE_REPLAYED'
        ? 409
        : nonceResult.code === 'RPC_NONCE_INVALID'
          ? 401
          : 503;
      return jsonWorkerResponse(ctx, status, { status: 'error', code: nonceResult.code });
    }
    const userDb = userDbResult.db;
    const action = body.action ?? 'check';

    // Release is intentionally permitted after the write block is installed so
    // the deletion worker can drain already-admitted Express requests.
    if (action === 'release') {
      const permitId = typeof body.permitId === 'string' ? body.permitId.trim() : '';
      if (!permitId || permitId.length > 160) {
        return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'MUTATION_PERMIT_ID_INVALID' });
      }
      try {
        await releaseMutationPermitInD1({ userDb, permitId, uid: targetUid });
      } catch {
        return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'USER_DB_MUTATION_PERMIT_RELEASE_FAILED' });
      }
      return jsonWorkerResponse(ctx, 200, { status: 'ok', action: 'released' });
    }

    const decision = await resolveWriteAdmissionFromUserDb(userDb, targetUid);
    if (decision.status === 'UNAVAILABLE') {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: decision.code });
    }
    if (action === 'acquire') {
      const operationName = typeof body.operationName === 'string' ? body.operationName.trim() : '';
      if (!operationName || operationName.length > 240) {
        return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'MUTATION_OPERATION_NAME_INVALID' });
      }
      if (decision.status === 'CLOSED') {
        return jsonWorkerResponse(ctx, 423, { status: 'error', code: 'ACCOUNT_WRITE_BLOCKED' });
      }
      try {
        const permit = await acquireMutationPermitInD1({
          userDb,
          uid: targetUid,
          operationName,
          ttlMs: 120_000,
        });
        if (permit.ok === false) {
          return jsonWorkerResponse(ctx, 423, { status: 'error', code: permit.code });
        }
        return jsonWorkerResponse(ctx, 200, {
          status: 'ok',
          action: 'acquired',
          decision,
          permitId: permit.permitId,
          expiresAtMs: permit.expiresAtMs,
        });
      } catch {
        return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'USER_DB_MUTATION_PERMIT_ACQUIRE_FAILED' });
      }
    }
    if (action !== 'check') {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'WRITE_ADMISSION_ACTION_INVALID' });
    }
    return jsonWorkerResponse(ctx, 200, { status: 'ok', decision });
  }

  if (body.action === 'acquire' || body.action === 'release') {
    return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'USER_DB_REQUIRED_FOR_MUTATION_PERMITS' });
  }
  if (!ctx.env.DB) {
    return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'D1_BINDING_UNAVAILABLE' });
  }
  const db = ctx.env.DB as unknown as D1DatabaseBinding;
  const nonceResult = await consumeStageDNonce({ db, nonce });
  if (!nonceResult.consumed) {
    const status = nonceResult.code === 'RPC_NONCE_REPLAYED'
      ? 409
      : nonceResult.code === 'RPC_NONCE_INVALID'
        ? 401
        : 503;
    return jsonWorkerResponse(ctx, status, { status: 'error', code: nonceResult.code });
  }
  const decision = await resolveWriteAdmissionFromD1(db, targetUid);
  if (decision.status === 'UNAVAILABLE') {
    return jsonWorkerResponse(ctx, 503, { status: 'error', code: decision.code });
  }
  return jsonWorkerResponse(ctx, 200, { status: 'ok', decision });
}

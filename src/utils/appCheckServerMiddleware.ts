/**
 * @file src/utils/appCheckServerMiddleware.ts
 * @description Express App Check verification (firebase-admin only). Browser SDK lives in appCheck.ts / clientAppCheck.ts.
 * OP-DEC-001: formatMillionTomanAsIntlCurrency — see areaUnit.ts for UI currency parity.
 */
import crypto from 'node:crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { getAppCheck as getAdminAppCheck } from 'firebase-admin/app-check';
import { AUTHORITATIVE_FIREBASE_WEB_APP_ID, recordAppCheckVerificationDiagnostic } from './firebaseAppCheckSecurity901To920';
import {
  EXPECTED_FIREBASE_PROJECT_ID,
  extractSingleSecurityHeader,
  getFirebaseAdminApp,
  constantTimeSecretMatch,
} from './serverAdminAndTelegramSecurity';

export interface VerifiedAppCheckContext {
  verified: true;
  appId: string;
  projectId: string;
  token: string;
  alreadyConsumed: boolean;
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  verifiedAtIso: string;
}

declare global {
  namespace Express {
    interface Request {
      appCheck?: VerifiedAppCheckContext;
    }
  }
}

export interface AdminVerifyAppCheckTokenResponse {
  appId: string;
  alreadyConsumed?: boolean;
  token?: {
    sub?: string;
    iss?: string;
    aud?: string | string[];
    exp?: number;
    iat?: number;
    [key: string]: unknown;
  };
}

export interface RequireAppCheckMiddlewareOptions {
  consume?: boolean;
  expectedAppId?: string;
  expectedProjectId?: string;
  env?: Record<string, string | undefined>;
  verifyTokenFn?: (
    token: string,
    options?: { consume?: boolean },
  ) => Promise<AdminVerifyAppCheckTokenResponse>;
}

const consumedMiddlewareTokenHashes = new Set<string>();

export function resetConsumedMiddlewareTokensForTests(): void {
  consumedMiddlewareTokenHashes.clear();
}

export function createRequireAppCheckTokenMiddleware(
  options: RequireAppCheckMiddlewareOptions = {},
): RequestHandler {
  return async function requireAppCheckTokenMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const env = options.env ?? process.env;
    const expectedAppId = options.expectedAppId ?? AUTHORITATIVE_FIREBASE_WEB_APP_ID;
    const expectedProjectId = options.expectedProjectId ?? EXPECTED_FIREBASE_PROJECT_ID;
    const failClosed = (status: 400 | 401 | 403 | 503, code: string, message: string): void => {
      recordAppCheckVerificationDiagnostic(code);
      res.setHeader('Cache-Control', 'no-store');
      res.status(status).json({
        status: 'error',
        code,
        message,
      });
    };
    if (env.NODE_ENV === 'production') {
      const debugHeader = extractSingleSecurityHeader(
        req.headers as Record<string, string | string[] | undefined>,
        'x-firebase-appcheck-debug',
      );
      if (!debugHeader.ok || debugHeader.value) {
        failClosed(403, 'APP_CHECK_DEBUG_FORBIDDEN_IN_PROD', 'استفاده از توکن دیباگ App Check در محیط عملیاتی مسدود است.');
        return;
      }
    }
    const queryObj = (req.query ?? {}) as Record<string, unknown>;
    const bodyObj = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    if (
      queryObj.appCheckToken !== undefined ||
      queryObj['x-firebase-appcheck'] !== undefined ||
      bodyObj.appCheckToken !== undefined
    ) {
      failClosed(400, 'APP_CHECK_TOKEN_IN_URL_OR_BODY_FORBIDDEN', 'توکن App Check فقط باید در هدر X-Firebase-AppCheck ارسال شود.');
      return;
    }
    const headerExtracted = extractSingleSecurityHeader(
      req.headers as Record<string, string | string[] | undefined>,
      'x-firebase-appcheck',
    );
    if (!headerExtracted.ok) {
      failClosed(401, 'AMBIGUOUS_APP_CHECK_HEADER', 'هدر X-Firebase-AppCheck تکراری یا نامعتبر است.');
      return;
    }
    const rawToken = (headerExtracted.value ?? '').trim();
    if (!rawToken) {
      failClosed(401, 'APP_CHECK_TOKEN_MISSING', 'هدر امنیتی X-Firebase-AppCheck ارسال نشده است.');
      return;
    }
    const jwtParts = rawToken.split('.');
    if (
      jwtParts.length !== 3 ||
      jwtParts.some((part) => part.length === 0) ||
      rawToken.length < 20 ||
      rawToken.length > 8192 ||
      /\s/.test(rawToken)
    ) {
      failClosed(401, 'APP_CHECK_TOKEN_MALFORMED', 'ساختار توکن X-Firebase-AppCheck نامعتبر است.');
      return;
    }
    try {
      const shouldConsume = Boolean(options.consume);
      const verificationResult: AdminVerifyAppCheckTokenResponse = options.verifyTokenFn
        ? await options.verifyTokenFn(rawToken, shouldConsume ? { consume: true } : undefined)
        : await getAdminAppCheck(getFirebaseAdminApp(expectedProjectId, env)).verifyToken(
            rawToken,
            shouldConsume ? { consume: true } : undefined,
          );
      if (!verificationResult || typeof verificationResult.appId !== 'string' || !verificationResult.appId.trim()) {
        failClosed(403, 'INVALID_APP_CHECK_CLAIMS', 'پاسخ اعتبارسنجی App Check فاقد شناسه برنامه معتبر است.');
        return;
      }
      if (!constantTimeSecretMatch(verificationResult.appId, expectedAppId)) {
        failClosed(403, 'APP_CHECK_APP_ID_MISMATCH', 'شناسه برنامه در توکن App Check با اپلیکیشن رسمی مطابقت ندارد.');
        return;
      }
      const decodedToken = verificationResult.token ?? {};
      const nowSec = Math.floor(Date.now() / 1000);
      if (typeof decodedToken.exp === 'number' && (!Number.isFinite(decodedToken.exp) || decodedToken.exp <= nowSec)) {
        failClosed(401, 'APP_CHECK_TOKEN_EXPIRED', 'مهلت اعتبار توکن X-Firebase-AppCheck به پایان رسیده است.');
        return;
      }
      if (
        typeof decodedToken.iat === 'number' &&
        (!Number.isFinite(decodedToken.iat) ||
          decodedToken.iat > nowSec + 86400 ||
          (typeof decodedToken.exp === 'number' && decodedToken.iat > decodedToken.exp))
      ) {
        failClosed(401, 'APP_CHECK_TOKEN_FUTURE_IAT', 'زمان صدور توکن X-Firebase-AppCheck نامعتبر است.');
        return;
      }
      if (decodedToken.aud !== undefined) {
        const audList = Array.isArray(decodedToken.aud) ? decodedToken.aud : [decodedToken.aud];
        const matchesProject = audList.some(
          (entry) =>
            typeof entry === 'string' && (entry === expectedProjectId || entry === `projects/${expectedProjectId}`),
        );
        if (!matchesProject) {
          failClosed(403, 'APP_CHECK_PROJECT_MISMATCH', 'پروژه هدف توکن App Check معتبر نیست.');
          return;
        }
      }
      if (shouldConsume) {
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        if (verificationResult.alreadyConsumed || consumedMiddlewareTokenHashes.has(tokenHash)) {
          failClosed(403, 'APP_CHECK_TOKEN_REPLAYED', 'این توکن یک‌بارمصرف قبلاً استفاده شده است.');
          return;
        }
        if (consumedMiddlewareTokenHashes.size >= 5000) {
          const oldest = consumedMiddlewareTokenHashes.values().next().value;
          if (oldest) consumedMiddlewareTokenHashes.delete(oldest);
        }
        consumedMiddlewareTokenHashes.add(tokenHash);
      }
      req.appCheck = {
        verified: true,
        appId: verificationResult.appId,
        projectId: expectedProjectId,
        token: rawToken,
        alreadyConsumed: Boolean(verificationResult.alreadyConsumed),
        sub: typeof decodedToken.sub === 'string' ? decodedToken.sub : verificationResult.appId,
        iss: typeof decodedToken.iss === 'string' ? decodedToken.iss : undefined,
        aud: decodedToken.aud,
        exp: typeof decodedToken.exp === 'number' ? decodedToken.exp : undefined,
        iat: typeof decodedToken.iat === 'number' ? decodedToken.iat : undefined,
        verifiedAtIso: new Date().toISOString(),
      };
      recordAppCheckVerificationDiagnostic('OK');
      next();
    } catch {
      failClosed(403, 'APP_CHECK_VERIFICATION_FAILED', 'اعتبارسنجی توکن X-Firebase-AppCheck ناموفق بود (Fail-Closed).');
    }
  };
}

export const requireAppCheckToken: RequestHandler = createRequireAppCheckTokenMiddleware();
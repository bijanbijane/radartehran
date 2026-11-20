/**
 * @file src/cells/knowledge-crowd/crowdClaimsRoutes.ts
 * @description Stage 2.1 — Express REST Routes for Knowledge Graph & Crowd Claims Cell
 * Enforces fail-closed Firebase ID Token verification on all mutations and derives
 * authorUid / voterUid / authorRoleBadge exclusively from server-verified identity.
 */
import type { Express, Request, Response } from 'express';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
import { resolveCityIdForNeighborhood } from '../../data/multiCityData';
import { isValidFirestoreDocId, sanitizeInput } from '../../utils/security';
import { resolveCityParamOrReject, validateCityNeighborhoodOwnership } from '../../utils/geo/cityGeospatialResolver';
import { verifyFirebaseUserAuthorization } from '../../utils/serverAdminAndTelegramSecurity';
import { recordAbuseSignal } from '../../utils/serverDeliveryAndAbuseGuard';
import { IdempotencyLedger } from '../../utils/serverIdempotencyAndConcurrency';
import {
  getContributorProfileWithClaims,
  getOrCreateContributorProfile,
  hasContributorProfile,
  processClaimVoteAndPromotion,
  queryNeighborhoodCrowdClaims,
  submitCrowdClaim,
} from './crowdClaimsEngine';
import type {
  AlleySlopeType,
  ClaimVoteDirection,
  ContributorRoleBadge,
  CrowdClaimCategory,
  SpatialTargetLevel,
} from './crowdClaimsTypes';

const registeredCrowdClaimApps = new WeakSet<Express>();
const crowdIdempotencyLedger = new IdempotencyLedger({ ttlMs: 15 * 60_000 });
const extractIdempotencyKey = (req: Request): string =>
  typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'].trim().slice(0, 128) : '';

const UNTRUSTED_CROWD_IDENTITY_KEYS: ReadonlySet<string> = new Set([
  'uid',
  'userId',
  'authorUid',
  'voterUid',
  'actorUid',
  'authorRoleBadge',
  'role',
  'userRole',
  'isAdmin',
  'claims',
]);

function stripUntrustedCrowdIdentityFields(body: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(body)) {
    if (!UNTRUSTED_CROWD_IDENTITY_KEYS.has(key)) clean[key] = val;
  }
  return clean;
}

function normalizeVoteDirectionParam(raw: unknown): ClaimVoteDirection | null {
  if (typeof raw === 'string') {
    const upper = raw.trim().toUpperCase();
    if (upper === 'UP' || upper === 'UPVOTE' || upper === '+1') return 'UP';
    if (upper === 'DOWN' || upper === 'DOWNVOTE' || upper === '-1') return 'DOWN';
  }
  return raw === 1 ? 'UP' : raw === -1 ? 'DOWN' : null;
}

export interface CrowdClaimsRouteSecurityOptions {
  checkRateLimit?: (ip: string, bucket: 'general', maxRequests: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
  verifyUserAuth?: (req: Request) => Promise<{ authorized: boolean; statusCode: number; uid?: string; reason?: string }>;
}

export function registerCrowdClaimsRoutes(app: Express, options?: CrowdClaimsRouteSecurityOptions): void {
  if (registeredCrowdClaimApps.has(app)) return;
  registeredCrowdClaimApps.add(app);

  const clientIp = (req: Request): string => (options?.getClientIp ? options.getClientIp(req) : req.ip || '127.0.0.1');

  const verifyRequiredAuth = async (
    req: Request,
  ): Promise<{ authorized: boolean; statusCode: number; uid?: string; reason?: string }> => {
    const rawAuth = req.headers.authorization;
    if (!rawAuth || (typeof rawAuth === 'string' && rawAuth.trim().length === 0)) {
      return { authorized: false, statusCode: 401, reason: 'MISSING_BEARER_TOKEN' };
    }
    try {
      if (options?.verifyUserAuth) {
        const custom = await options.verifyUserAuth(req);
        if (!custom || typeof custom.authorized !== 'boolean') {
          return { authorized: false, statusCode: 503, reason: 'AUTH_PROVIDER_UNAVAILABLE' };
        }
        return custom;
      }
      const r = await verifyFirebaseUserAuthorization(req.headers as Record<string, string | string[] | undefined>);
      return { authorized: r.authorized, statusCode: r.statusCode, uid: r.uid, reason: r.reason };
    } catch {
      return { authorized: false, statusCode: 503, reason: 'AUTH_PROVIDER_UNAVAILABLE' };
    }
  };

  app.post('/api/v1/claims', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const ip = clientIp(req);
    if (options?.checkRateLimit && !options.checkRateLimit(ip, 'general', 20, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }

    try {
      const authState = await verifyRequiredAuth(req);
      if (!authState.authorized || !authState.uid) {
        if (authState.statusCode === 401 || authState.statusCode === 403) {
          recordAbuseSignal(ip, 'auth_failure');
        }
        res
          .status(authState.statusCode || 401)
          .json({ status: 'error', code: authState.reason || 'UNAUTHORIZED_TOKEN' });
        return;
      }

      const authenticatedUid = authState.uid.trim();
      if (!authenticatedUid || !isValidFirestoreDocId(authenticatedUid)) {
        res.status(401).json({ status: 'error', code: 'INVALID_AUTHENTICATED_UID' });
        return;
      }

      if (options?.checkRateLimit && !options.checkRateLimit(`acct:${authenticatedUid}`, 'general', 15, 60_000)) {
        res.status(429).json({ status: 'error', code: 'ACCOUNT_RATE_LIMIT_EXCEEDED' });
        return;
      }

      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const rawBodyAuthorUid = sanitizeInput(String(body.authorUid || body.uid || body.userId || ''), 128);
      if (rawBodyAuthorUid && rawBodyAuthorUid !== authenticatedUid) {
        recordAbuseSignal(ip, 'auth_failure');
        res.status(403).json({
          status: 'error',
          code: 'UID_SPOOFING_FORBIDDEN',
          message: 'جعل شناسه نویسنده گزارش مجاز نیست.',
        });
        return;
      }

      // Server-authoritative identity and role derivation only
      const authorUid = authenticatedUid;
      const authorRoleBadge: ContributorRoleBadge = hasContributorProfile(authorUid)
        ? getOrCreateContributorProfile(authorUid).roleBadge
        : 'CITIZEN';

      const authorDisplayName = sanitizeInput(String(body.authorDisplayName || 'کاربر رادار'), 80);
      const hoodId = Math.trunc(Number(body.hoodId));
      const streetName = sanitizeInput(String(body.streetName || body.streetNameNormalized || ''), 120);
      const narrativeText = sanitizeInput(String(body.narrativeText || ''), 1200);
      const category = String(body.category || 'ALLEY_LIVABILITY') as CrowdClaimCategory;
      const targetLevel = String(body.targetLevel || 'STREET_SEGMENT') as SpatialTargetLevel;
      const slopeType = body.slopeType ? (String(body.slopeType) as AlleySlopeType) : null;
      const intlCurrency: IntlCurrencyCode = ['IRT', 'USD', 'EUR', 'AED'].includes(String(body.intlCurrency))
        ? (body.intlCurrency as IntlCurrencyCode)
        : 'USD';

      if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 9999) {
        res.status(400).json({ status: 'error', code: 'INVALID_HOOD_ID', message: 'شناسه محله معتبر نیست.' });
        return;
      }
      const cityRes = resolveCityParamOrReject(body.cityId, { allowOmittedDefault: 'tehran' });
      if (!cityRes.ok) {
        res.status(400).json({ status: 'error', code: cityRes.code, message: cityRes.messageFa });
        return;
      }
      const postOwnership = validateCityNeighborhoodOwnership(cityRes.cityId, hoodId, resolveCityIdForNeighborhood);
      if (postOwnership.code === 'CITY_NEIGHBORHOOD_MISMATCH') {
        res.status(400).json({ status: 'error', code: postOwnership.code, message: postOwnership.messageFa });
        return;
      }
      if (narrativeText.length < 5) {
        res
          .status(400)
          .json({ status: 'error', code: 'NARRATIVE_TOO_SHORT', message: 'متن روایت گزارش باید حداقل ۵ کاراکتر باشد.' });
        return;
      }

      const idemKey = extractIdempotencyKey(req);
      const idemOutcome = idemKey
        ? crowdIdempotencyLedger.beginExecution<Record<string, unknown>>({
            scope: 'crowd_claim_submit',
            actorId: authorUid,
            idempotencyKey: idemKey,
            payload: stripUntrustedCrowdIdentityFields(body),
          })
        : null;
      if (idemOutcome?.status === 'CONFLICT_PAYLOAD_MISMATCH') {
        res.status(409).json({
          status: 'error',
          error: 'idempotency_key_reused_with_different_request',
          code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
          message: 'Use a new Idempotency-Key for a new request.',
        });
        return;
      }
      if (idemOutcome?.status === 'REPLAYED' && idemOutcome.record.responseBody) {
        res.status(idemOutcome.httpStatus || 201).json({ ...idemOutcome.record.responseBody, replayed: true });
        return;
      }

      const rawCoords = body.coords as { lat?: unknown; lng?: unknown } | undefined;
      const coords =
        rawCoords && Number.isFinite(Number(rawCoords.lat)) && Number.isFinite(Number(rawCoords.lng))
          ? { lat: Number(rawCoords.lat), lng: Number(rawCoords.lng) }
          : null;
      const estimatedPriceSqm =
        body.estimatedPriceSqm !== undefined && body.estimatedPriceSqm !== null && Number.isFinite(Number(body.estimatedPriceSqm))
          ? Number(body.estimatedPriceSqm)
          : null;

      const claim = await submitCrowdClaim({
        claimId: typeof body.claimId === 'string' ? body.claimId : undefined,
        targetLevel,
        cityId: cityRes.cityId,
        hoodId,
        streetName: streetName || 'کوچه اصلی',
        coords,
        category,
        estimatedPriceSqm,
        parkingScore: Number.isFinite(Number(body.parkingScore)) ? Number(body.parkingScore) : null,
        noiseLevelScore: Number.isFinite(Number(body.noiseLevelScore)) ? Number(body.noiseLevelScore) : null,
        safetyScore: Number.isFinite(Number(body.safetyScore)) ? Number(body.safetyScore) : null,
        slopeType,
        narrativeText,
        evidenceMediaObjectIds: Array.isArray(body.evidenceMediaObjectIds)
          ? (body.evidenceMediaObjectIds as string[])
          : [],
        authorUid,
        authorDisplayName,
        authorRoleBadge,
        baseHoodPriceSqmOverride: Number.isFinite(Number(body.baseHoodPriceSqmOverride))
          ? Number(body.baseHoodPriceSqmOverride)
          : undefined,
        intlCurrency,
      });

      const responseBody = {
        status: 'ok',
        claim,
        referencePriceIntlSample: formatMillionTomanAsIntlCurrency(claim.estimatedPriceSqm ?? 100, intlCurrency, 'fa'),
        replayed: false,
      };
      if (idemOutcome) {
        crowdIdempotencyLedger.completeExecution({
          scope: 'crowd_claim_submit',
          actorId: authorUid,
          idempotencyKey: idemKey,
          operationId: idemOutcome.record.operationId,
          httpStatus: 201,
          responseBody,
        });
      }
      res.status(201).json(responseBody);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'CLAIM_SUBMISSION_FAILED';
      if (code === 'PROMPT_INJECTION_DETECTED') recordAbuseSignal(ip, 'prompt_injection');
      res.status(400).json({ status: 'error', code });
    }
  });

  app.get('/api/v1/claims/hood/:hoodId', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (options?.checkRateLimit && !options.checkRateLimit(clientIp(req), 'general', 60, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }
    const hoodId = Math.trunc(Number(req.params.hoodId));
    if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 9999) {
      res.status(400).json({ status: 'error', code: 'INVALID_HOOD_ID' });
      return;
    }
    const streetName = typeof req.query.streetName === 'string' ? req.query.streetName : undefined;
    const cityRes = resolveCityParamOrReject(req.query.cityId, { allowOmittedDefault: 'tehran' });
    if (!cityRes.ok) {
      res.status(400).json({ status: 'error', code: cityRes.code, message: cityRes.messageFa });
      return;
    }
    const getOwnership = validateCityNeighborhoodOwnership(cityRes.cityId, hoodId, resolveCityIdForNeighborhood);
    if (getOwnership.code === 'CITY_NEIGHBORHOOD_MISMATCH') {
      res.status(400).json({ status: 'error', code: getOwnership.code, message: getOwnership.messageFa });
      return;
    }
    const explicitCityId = req.query.cityId !== undefined ? cityRes.cityId : undefined;
    const result = queryNeighborhoodCrowdClaims(hoodId, streetName, explicitCityId);
    res.status(200).json({
      status: 'ok',
      hoodId: result.hoodId,
      cityId: cityRes.cityId,
      streetNameFilterNormalized: result.streetNameFilterNormalized,
      VERIFIED_REFERENCE: result.verifiedReferenceClaims,
      STAGE_COMMUNITY: result.communityStageClaims,
      DISPUTED: result.disputedClaims,
      verifiedReferenceClaims: result.verifiedReferenceClaims,
      communityStageClaims: result.communityStageClaims,
      disputedClaims: result.disputedClaims,
      totalMatchedCount: result.totalMatchedCount,
      crowdVerifiedDealMedianPerSqm: result.crowdVerifiedDealMedianPerSqm ?? null,
      crowdPriceObservationCount: result.crowdPriceObservationCount ?? 0,
    });
  });

  app.post('/api/v1/claims/:claimId/vote', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const ip = clientIp(req);
    if (options?.checkRateLimit && !options.checkRateLimit(ip, 'general', 30, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }

    try {
      const authState = await verifyRequiredAuth(req);
      if (!authState.authorized || !authState.uid) {
        if (authState.statusCode === 401 || authState.statusCode === 403) {
          recordAbuseSignal(ip, 'auth_failure');
        }
        res
          .status(authState.statusCode || 401)
          .json({ status: 'error', code: authState.reason || 'UNAUTHORIZED_TOKEN' });
        return;
      }

      const authenticatedUid = authState.uid.trim();
      if (!authenticatedUid || !isValidFirestoreDocId(authenticatedUid)) {
        res.status(401).json({ status: 'error', code: 'INVALID_AUTHENTICATED_UID' });
        return;
      }

      if (options?.checkRateLimit && !options.checkRateLimit(`acct:${authenticatedUid}`, 'general', 25, 60_000)) {
        res.status(429).json({ status: 'error', code: 'ACCOUNT_RATE_LIMIT_EXCEEDED' });
        return;
      }

      const claimId = sanitizeInput(String(req.params.claimId || ''), 100);
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const rawBodyVoterUid = sanitizeInput(String(body.voterUid || body.uid || body.userId || ''), 128);
      if (rawBodyVoterUid && rawBodyVoterUid !== authenticatedUid) {
        recordAbuseSignal(ip, 'auth_failure');
        res.status(403).json({
          status: 'error',
          code: 'UID_SPOOFING_FORBIDDEN',
          message: 'جعل شناسه رأی‌دهنده مجاز نیست.',
        });
        return;
      }

      const voterUid = authenticatedUid;
      const direction = normalizeVoteDirectionParam(body.direction ?? body.vote ?? body.voteType);

      if (!claimId || !isValidFirestoreDocId(claimId)) {
        res.status(400).json({ status: 'error', code: 'INVALID_CLAIM_ID' });
        return;
      }
      if (!direction) {
        res.status(400).json({ status: 'error', code: 'INVALID_VOTE_DIRECTION' });
        return;
      }

      const idemKey = extractIdempotencyKey(req);
      const idemOutcome = idemKey
        ? crowdIdempotencyLedger.beginExecution<Record<string, unknown>>({
            scope: `crowd_claim_vote:${claimId}`,
            actorId: voterUid,
            idempotencyKey: idemKey,
            payload: { claimId, direction },
          })
        : null;
      if (idemOutcome?.status === 'CONFLICT_PAYLOAD_MISMATCH') {
        res.status(409).json({
          status: 'error',
          error: 'idempotency_key_reused_with_different_request',
          code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
          message: 'Use a new Idempotency-Key for a new request.',
        });
        return;
      }
      if (idemOutcome?.status === 'REPLAYED' && idemOutcome.record.responseBody) {
        res.status(idemOutcome.httpStatus || 200).json({ ...idemOutcome.record.responseBody, replayed: true });
        return;
      }

      const outcome = await processClaimVoteAndPromotion({ claimId, voterUid, direction });
      const responseBody = {
        status: 'ok',
        claim: outcome.claim,
        authorProfile: outcome.authorProfile,
        effectiveVoteWeight: outcome.effectiveVoteWeight,
        promotedToVerifiedReference: outcome.promotedToVerifiedReference,
        demotedFromVerifiedReference: outcome.demotedFromVerifiedReference ?? false,
        replayed: false,
      };
      if (idemOutcome) {
        crowdIdempotencyLedger.completeExecution({
          scope: `crowd_claim_vote:${claimId}`,
          actorId: voterUid,
          idempotencyKey: idemKey,
          operationId: idemOutcome.record.operationId,
          httpStatus: 200,
          responseBody,
        });
      }
      res.status(200).json(responseBody);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'VOTE_PROCESSING_FAILED';
      res.status(code === 'CLAIM_NOT_FOUND' ? 404 : 400).json({ status: 'error', code });
    }
  });

  app.get('/api/v1/contributors/:uid', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (options?.checkRateLimit && !options.checkRateLimit(clientIp(req), 'general', 60, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }
    const uid = sanitizeInput(String(req.params.uid || ''), 128);
    if (!uid || !isValidFirestoreDocId(uid)) {
      res.status(400).json({ status: 'error', code: 'INVALID_CONTRIBUTOR_UID' });
      return;
    }
    const { profile, submittedClaims, verifiedClaims } = getContributorProfileWithClaims(uid);
    res.status(200).json({ status: 'ok', profile, verifiedClaims, submittedClaims });
  });
}

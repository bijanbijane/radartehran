/**
 * @file src/cells/knowledge-crowd/crowdClaimsRoutes.ts
 * @description Stage 2.1 — Express REST Routes for Knowledge Graph & Crowd Claims Cell
 * Registers:
 * - POST /api/v1/claims
 * - GET  /api/v1/claims/hood/:hoodId
 * - POST /api/v1/claims/:claimId/vote
 * - GET  /api/v1/contributors/:uid
 */
import type { Express, Request, Response } from 'express';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
import { isValidFirestoreDocId, sanitizeInput } from '../../utils/security';
import {
  getContributorProfileWithClaims,
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

function normalizeVoteDirectionParam(raw: unknown): ClaimVoteDirection | null {
  if (typeof raw === 'string') {
    const upper = raw.trim().toUpperCase();
    if (upper === 'UP' || upper === 'UPVOTE' || upper === '+1') return 'UP';
    if (upper === 'DOWN' || upper === 'DOWNVOTE' || upper === '-1') return 'DOWN';
  }
  if (raw === 1) return 'UP';
  if (raw === -1) return 'DOWN';
  return null;
}

export interface CrowdClaimsRouteSecurityOptions {
  checkRateLimit?: (ip: string, bucket: 'general', maxRequests: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
}

export function registerCrowdClaimsRoutes(
  app: Express,
  options?: CrowdClaimsRouteSecurityOptions,
): void {
  if (registeredCrowdClaimApps.has(app)) return;
  registeredCrowdClaimApps.add(app);
  const clientIp = (req: Request): string =>
    options?.getClientIp ? options.getClientIp(req) : req.ip || '127.0.0.1';

  // 1. POST /api/v1/claims — Submit a new user-attributed crowd claim in immediate STAGE_COMMUNITY state
  app.post('/api/v1/claims', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (options?.checkRateLimit && !options.checkRateLimit(clientIp(req), 'general', 20, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const authorUid = sanitizeInput(String(body.authorUid || ''), 128);
      const authorDisplayName = sanitizeInput(String(body.authorDisplayName || 'کاربر رادار'), 80);
      const hoodId = Math.trunc(Number(body.hoodId));
      const streetName = sanitizeInput(String(body.streetName || body.streetNameNormalized || ''), 120);
      const narrativeText = sanitizeInput(String(body.narrativeText || ''), 1200);
      const category = String(body.category || 'ALLEY_LIVABILITY') as CrowdClaimCategory;
      const targetLevel = String(body.targetLevel || 'STREET_SEGMENT') as SpatialTargetLevel;
      const authorRoleBadge = String(body.authorRoleBadge || 'CITIZEN') as ContributorRoleBadge;
      const slopeType = body.slopeType ? (String(body.slopeType) as AlleySlopeType) : null;
      const intlCurrency: IntlCurrencyCode = ['IRT', 'USD', 'EUR', 'AED'].includes(String(body.intlCurrency))
        ? (body.intlCurrency as IntlCurrencyCode)
        : 'USD';

      if (!authorUid || !isValidFirestoreDocId(authorUid)) {
        res.status(400).json({ status: 'error', code: 'INVALID_AUTHOR_UID', message: 'شناسه کاربر ارسال‌کننده گزارش معتبر نیست.' });
        return;
      }
      if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 9999) {
        res.status(400).json({ status: 'error', code: 'INVALID_HOOD_ID', message: 'شناسه محله معتبر نیست.' });
        return;
      }
      if (narrativeText.length < 5) {
        res.status(400).json({ status: 'error', code: 'NARRATIVE_TOO_SHORT', message: 'متن روایت گزارش باید حداقل ۵ کاراکتر باشد.' });
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
        cityId: typeof body.cityId === 'string' ? body.cityId : 'tehran',
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

      res.status(201).json({
        status: 'ok',
        claim,
        referencePriceIntlSample: formatMillionTomanAsIntlCurrency(claim.estimatedPriceSqm ?? 100, intlCurrency, 'fa'),
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'CLAIM_SUBMISSION_FAILED';
      res.status(400).json({ status: 'error', code });
    }
  });

  // 2. GET /api/v1/claims/hood/:hoodId — Retrieve neighborhood claims split by VERIFIED_REFERENCE and STAGE_COMMUNITY
  app.get('/api/v1/claims/hood/:hoodId', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
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
    const result = queryNeighborhoodCrowdClaims(hoodId, streetName);
    res.status(200).json({
      status: 'ok',
      hoodId: result.hoodId,
      streetNameFilterNormalized: result.streetNameFilterNormalized,
      VERIFIED_REFERENCE: result.verifiedReferenceClaims,
      STAGE_COMMUNITY: result.communityStageClaims,
      verifiedReferenceClaims: result.verifiedReferenceClaims,
      communityStageClaims: result.communityStageClaims,
      disputedClaims: result.disputedClaims,
      totalMatchedCount: result.totalMatchedCount,
    });
  });

  // 3. POST /api/v1/claims/:claimId/vote — Cast weighted vote and auto-promote if threshold met
  app.post('/api/v1/claims/:claimId/vote', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (options?.checkRateLimit && !options.checkRateLimit(clientIp(req), 'general', 30, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }
    try {
      const claimId = sanitizeInput(String(req.params.claimId || ''), 100);
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const voterUid = sanitizeInput(String(body.voterUid || ''), 128);
      const direction = normalizeVoteDirectionParam(body.direction ?? body.vote ?? body.voteType);

      if (!claimId || !isValidFirestoreDocId(claimId)) {
        res.status(400).json({ status: 'error', code: 'INVALID_CLAIM_ID' });
        return;
      }
      if (!voterUid || !isValidFirestoreDocId(voterUid)) {
        res.status(400).json({ status: 'error', code: 'INVALID_VOTER_UID' });
        return;
      }
      if (!direction) {
        res.status(400).json({ status: 'error', code: 'INVALID_VOTE_DIRECTION' });
        return;
      }

      const outcome = await processClaimVoteAndPromotion({ claimId, voterUid, direction });
      res.status(200).json({
        status: 'ok',
        claim: outcome.claim,
        authorProfile: outcome.authorProfile,
        effectiveVoteWeight: outcome.effectiveVoteWeight,
        promotedToVerifiedReference: outcome.promotedToVerifiedReference,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'VOTE_PROCESSING_FAILED';
      const statusCode = code === 'CLAIM_NOT_FOUND' ? 404 : 400;
      res.status(statusCode).json({ status: 'error', code });
    }
  });

  // 4. GET /api/v1/contributors/:uid — Retrieve contributor honor profile & verified claim ledger
  app.get('/api/v1/contributors/:uid', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
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
    res.status(200).json({
      status: 'ok',
      profile,
      verifiedClaims,
      submittedClaims,
    });
  });
}

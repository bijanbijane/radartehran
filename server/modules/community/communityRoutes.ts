/** @file server/modules/community/communityRoutes.ts — Unified Firestore-Backed Express Community API Routes (Stage 3) */
import type { Express, Request, Response } from 'express';
import { sanitizeInput } from '../../../src/utils/security';
import type { CommunityAbuseReason, DataCorrectionCategory, ReactionType } from '../../../src/features/community/types/community.types';
import { createCommunityReadHandlers, extractIdempotencyKeyHeader, handleCommunityRouteError, requireCommunityAdmin, requireVerifiedMember } from './communityRoutesHandlers';
import { addQuestionAnswerOp, executeAdminCommunityModerationOp, resolveCommunityAppealOp, selectBestQuestionAnswerOp, voteResearchProposalOp, withdrawCorrectionOp } from './communityUnifiedExtraOps';
import { listCommunityTopicsFromStore } from './communityUnifiedQueries';
import { communityUnifiedRepository, type CommunityUnifiedRepository } from './communityUnifiedRepository';

export interface CommunityRoutesOptions {
  checkRateLimit?: (ip: string, bucket: 'general', max: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
  repository?: CommunityUnifiedRepository;
}

const VALID_REACTIONS = new Set<ReactionType>(['helpful', 'agree', 'needs_source', 'disagree']);
const registeredCommunityApps = new WeakSet<Express>();

export function registerCommunityRoutes(app: Express, options?: CommunityRoutesOptions): void {
  if (registeredCommunityApps.has(app)) return;
  registeredCommunityApps.add(app);

  const repo = options?.repository ?? communityUnifiedRepository;
  const getIp = options?.getClientIp ?? ((req: Request) => req.ip || '127.0.0.1');
  const allowRate = options?.checkRateLimit ?? (() => true);
  const reads = createCommunityReadHandlers(repo, getIp, allowRate);

  app.get(['/api/community/health', '/api/v1/community/health'], async (_req: Request, res: Response) => {
    const health = await repo.getStore().healthCheck();
    res.status(health.ok ? 200 : 503).json({ status: health.ok ? 'ok' : 'degraded', ...health });
  });

  app.get(['/api/community/overview', '/api/v1/community/overview'], reads.overview);
  app.get(['/api/community/topics', '/api/v1/community/topics'], reads.topics);
  app.get(['/api/community/discussions', '/api/v1/community/posts'], reads.discussions);
  app.get(['/api/community/discussions/:id', '/api/v1/community/posts/:id'], reads.discussionById);
  app.get(['/api/community/questions', '/api/v1/community/questions'], reads.questions);
  app.get(['/api/community/contributions', '/api/v1/community/contributions'], reads.contributions);
  app.get(['/api/community/research-proposals', '/api/v1/community/research-proposals'], reads.researchProposals);
  app.get(['/api/community/members', '/api/v1/community/profiles'], reads.members);
  app.get(['/api/community/members/:username', '/api/v1/community/profiles/:username'], reads.memberByUsername);
  app.get('/api/account/community', reads.accountSummary);
  app.get('/api/admin/community/moderation', reads.adminModerationQueue);

  app.post(['/api/community/topics/:id/follow', '/api/v1/community/follows'], async (req: Request, res: Response) => {
    try {
      const auth = await requireVerifiedMember(req, res, getIp);
      if (!auth) return;
      const scope = req.body?.scope === 'post' || req.body?.scope === 'user' ? req.body.scope : 'topic';
      const targetId = sanitizeInput(String(req.params.id || req.body?.targetId || ''), 64);
      if (scope === 'topic') {
        const topics = await listCommunityTopicsFromStore(repo.getStore(), auth.uid);
        if (!topics.some((t) => t.id === targetId)) { res.status(404).json({ status: 'error', code: 'TOPIC_NOT_FOUND' }); return; }
      }
      const result = await repo.toggleFollowTransactional(auth.uid, scope, targetId);
      const topics = await listCommunityTopicsFromStore(repo.getStore(), auth.uid);
      res.status(200).json({ status: 'ok', topics, ...result });
    } catch (err) { handleCommunityRouteError(res, err); }
  });

  app.post(['/api/community/discussions', '/api/v1/community/posts'], async (req: Request, res: Response) => {
    try {
      const auth = await requireVerifiedMember(req, res, getIp);
      if (!auth) return;
      const result = await repo.createDiscussion(
        { uid: auth.uid, emailVerified: true, displayNameFa: typeof req.body?.displayNameFa === 'string' ? req.body.displayNameFa : undefined },
        {
          titleFa: String(req.body?.titleFa || ''),
          bodyFa: String(req.body?.bodyFa || ''),
          neighborhoodId: req.body?.neighborhoodId ? Number(req.body.neighborhoodId) : 1,
          neighborhoodNameFa: req.body?.neighborhoodNameFa ? String(req.body.neighborhoodNameFa) : undefined,
          topicId: req.body?.topicId ? String(req.body.topicId) : undefined,
          track: req.body?.track ? String(req.body.track) : undefined,
          idempotencyKey: extractIdempotencyKeyHeader(req),
        },
      );
      res.status(result.idempotentReplay ? 200 : 201).json({ status: 'ok', ...result });
    } catch (err) { handleCommunityRouteError(res, err); }
  });

  app.patch(['/api/community/discussions/:id', '/api/v1/community/posts/:id'], async (req: Request, res: Response) => {
    try {
      const auth = await requireVerifiedMember(req, res, getIp);
      if (!auth) return;
      const item = await repo.updateDiscussion(auth.uid, String(req.params.id), {
        titleFa: String(req.body?.titleFa || ''),
        bodyFa: String(req.body?.bodyFa || ''),
        reasonFa: typeof req.body?.reasonFa === 'string' ? req.body.reasonFa : undefined,
      });
      res.status(200).json({ status: 'ok', item });
    } catch (err) { handleCommunityRouteError(res, err); }
  });

  app.delete(['/api/community/discussions/:id', '/api/v1/community/posts/:id'], async (req: Request, res: Response) => {
    try {
      const auth = await requireVerifiedMember(req, res, getIp);
      if (!auth) return;
      const result = await repo.softDeleteDiscussion(auth.uid, String(req.params.id));
      res.status(200).json({ status: 'ok', ...result });
    } catch (err) { handleCommunityRouteError(res, err); }
  });

  app.post('/api/community/discussions/:id/follow', async (req: Request, res: Response) => {
    try {
      const auth = await requireVerifiedMember(req, res, getIp);
      if (!auth) return;
      const result = await repo.toggleFollowTransactional(auth.uid, 'post', String(req.params.id));
      res.status(200).json({ status: 'ok', ...result });
    } catch (err) { handleCommunityRouteError(res, err); }
  });

  app.post(['/api/community/discussions/:id/replies', '/api/v1/community/posts/:id/comments'], async (req: Request, res: Response) => {
    try {
      const auth = await requireVerifiedMember(req, res, getIp);
      if (!auth) return;
      const post = await repo.addDiscussionComment(
        { uid: auth.uid, emailVerified: true, displayNameFa: typeof req.body?.displayNameFa === 'string' ? req.body.displayNameFa : undefined },
        String(req.params.id),
        { bodyFa: String(req.body?.bodyFa || ''), parentReplyId: req.body?.parentReplyId || null, idempotencyKey: extractIdempotencyKeyHeader(req) },
      );
      res.status(201).json({ status: 'ok', post });
    } catch (err) { handleCommunityRouteError(res, err); }
  });

  app.post(['/api/community/questions', '/api/v1/community/questions'], async (req: Request, res: Response) => {
    try {
      const auth = await requireVerifiedMember(req, res, getIp);
      if (!auth) return;
      const item = await repo.createQuestion(
        { uid: auth.uid, emailVerified: true, displayNameFa: typeof req.body?.displayNameFa === 'string' ? req.body.displayNameFa : undefined },
        { titleFa: String(req.body?.titleFa || ''), bodyFa: String(req.body?.bodyFa || ''), neighborhoodId: Number(req.body?.neighborhoodId) || 1, neighborhoodNameFa: req.body?.neighborhoodNameFa, topicId: req.body?.topicId },
      );
      res.status(201).json({ status: 'ok', item });
    } catch (err) { handleCommunityRouteError(res, err); }
  });

  app.post(['/api/community/questions/:id/answers', '/api/v1/community/questions/:id/answers'], async (req: Request, res: Response) => {
    try {
      const auth = await requireVerifiedMember(req, res, getIp);
      if (!auth) return;
      const result = await addQuestionAnswerOp(repo, { uid: auth.uid, emailVerified: true, displayNameFa: req.body?.displayNameFa }, String(req.params.id), {
        bodyFa: String(req.body?.bodyFa || ''),
        sourceReferenceFa: req.body?.sourceReferenceFa,
      });
      res.status(201).json({ status: 'ok', ...result });
    } catch (err) { handleCommunityRouteError(res, err); }
  });

  app.post(['/api/community/questions/:id/select-answer', '/api/v1/community/questions/:id/select-answer'], async (req: Request, res: Response) => {
    try {
      const auth = await requireVerifiedMember(req, res, getIp);
      if (!auth) return;
      const item = await selectBestQuestionAnswerOp(repo, auth.uid, String(req.params.id), String(req.body?.answerId || ''));
      res.status(200).json({ status: 'ok', item });
    } catch (err) { handleCommunityRouteError(res, err); }
  });

  app.post(['/api/community/contributions', '/api/v1/community/contributions'], async (req: Request, res: Response) => {
    try {
      const auth = await requireVerifiedMember(req, res, getIp);
      if (!auth) return;
      const item = await repo.createCorrection(
        { uid: auth.uid, emailVerified: true, displayNameFa: req.body?.displayNameFa },
        { titleFa: String(req.body?.titleFa || ''), evidenceSummaryFa: String(req.body?.evidenceSummaryFa || ''), neighborhoodId: Number(req.body?.neighborhoodId) || 1, neighborhoodNameFa: req.body?.neighborhoodNameFa, category: req.body?.category as DataCorrectionCategory, currentValueFa: req.body?.currentValueFa, suggestedValueFa: req.body?.suggestedValueFa, observedDateFa: req.body?.observedDateFa },
      );
      res.status(201).json({ status: 'ok', item });
    } catch (err) { handleCommunityRouteError(res, err); }
  });

  app.post(['/api/community/contributions/:id/withdraw', '/api/v1/community/contributions/:id/withdraw'], async (req: Request, res: Response) => {
    try {
      const auth = await requireVerifiedMember(req, res, getIp);
      if (!auth) return;
      const item = await withdrawCorrectionOp(repo, auth.uid, String(req.params.id));
      res.status(200).json({ status: 'ok', item });
    } catch (err) { handleCommunityRouteError(res, err); }
  });

  app.post(['/api/community/research-proposals', '/api/v1/community/research-proposals'], async (req: Request, res: Response) => {
    try {
      const auth = await requireVerifiedMember(req, res, getIp);
      if (!auth) return;
      const item = await repo.createResearchProposal({ uid: auth.uid, emailVerified: true, displayNameFa: req.body?.displayNameFa }, { titleFa: String(req.body?.titleFa || ''), questionFa: String(req.body?.questionFa || ''), neighborhoodNameFa: req.body?.neighborhoodNameFa, linkedKnowledgeTab: req.body?.linkedKnowledgeTab });
      res.status(201).json({ status: 'ok', item });
    } catch (err) { handleCommunityRouteError(res, err); }
  });

  app.post(['/api/community/research-proposals/:id/vote', '/api/v1/community/research-proposals/:id/vote'], async (req: Request, res: Response) => {
    try {
      const auth = await requireVerifiedMember(req, res, getIp);
      if (!auth) return;
      const item = await voteResearchProposalOp(repo, auth.uid, String(req.params.id));
      res.status(200).json({ status: 'ok', item });
    } catch (err) { handleCommunityRouteError(res, err); }
  });

  app.post(['/api/community/reactions', '/api/v1/community/reactions'], async (req: Request, res: Response) => {
    try {
      const auth = await requireVerifiedMember(req, res, getIp);
      if (!auth) return;
      const reaction = req.body?.reaction as ReactionType;
      if (!VALID_REACTIONS.has(reaction)) { res.status(400).json({ status: 'error', code: 'INVALID_REACTION' }); return; }
      const result = await repo.toggleReactionTransactional(auth.uid, String(req.body?.targetId || ''), reaction);
      res.status(200).json({ status: 'ok', ...result });
    } catch (err) { handleCommunityRouteError(res, err); }
  });

  app.post(['/api/community/reports', '/api/v1/community/reports'], async (req: Request, res: Response) => {
    try {
      const auth = await requireVerifiedMember(req, res, getIp);
      if (!auth) return;
      const item = await repo.submitReport(auth.uid, { targetType: req.body?.targetType, targetId: String(req.body?.targetId || ''), reason: req.body?.reason as CommunityAbuseReason, detailsFa: String(req.body?.detailsFa || '') });
      res.status(201).json({ status: 'ok', item });
    } catch (err) { handleCommunityRouteError(res, err); }
  });

  app.post(['/api/community/appeals', '/api/v1/community/appeals'], async (req: Request, res: Response) => {
    try {
      const auth = await requireVerifiedMember(req, res, getIp);
      if (!auth) return;
      const item = await repo.createAppeal(auth.uid, { moderationActionId: String(req.body?.moderationActionId || ''), targetId: String(req.body?.targetId || ''), argumentFa: String(req.body?.argumentFa || '') });
      res.status(201).json({ status: 'ok', item });
    } catch (err) { handleCommunityRouteError(res, err); }
  });

  app.patch('/api/account/community/privacy', async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const auth = await requireVerifiedMember(req, res, getIp);
      if (!auth) return;
      const rawPrivacy = (req.body?.privacy && typeof req.body.privacy === 'object' ? req.body.privacy : req.body) || {};
      const profile = await repo.updateProfilePrivacy(auth.uid, rawPrivacy);
      res.status(200).json({ status: 'ok', profile });
    } catch (err) { handleCommunityRouteError(res, err); }
  });

  app.post('/api/admin/community/moderation-actions', async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const auth = await requireCommunityAdmin(req, res, getIp);
      if (!auth) return;
      const action = await executeAdminCommunityModerationOp(repo, { uid: auth.uid, email: auth.email }, {
        targetId: String(req.body?.targetId || ''),
        targetType: req.body?.targetType,
        actionType: String(req.body?.actionType || ''),
        reasonFa: String(req.body?.reasonFa || ''),
      });
      res.status(201).json({ status: 'ok', action });
    } catch (err) { handleCommunityRouteError(res, err); }
  });

  app.post('/api/admin/community/appeals/:id/resolve', async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const auth = await requireCommunityAdmin(req, res, getIp);
      if (!auth) return;
      const appeal = await resolveCommunityAppealOp(repo, { uid: auth.uid, email: auth.email }, String(req.params.id), {
        reviewerNoteFa: String(req.body?.reviewerNoteFa || ''),
        decision: req.body?.decision,
      });
      res.status(200).json({ status: 'ok', appeal });
    } catch (err) { handleCommunityRouteError(res, err); }
  });
}

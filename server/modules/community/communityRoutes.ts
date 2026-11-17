/** @file server/modules/community/communityRoutes.ts — Express API Routes for RT-UI-COMMUNITY-001 (Public, Member & Admin Governance) */
import type { Express, Request, Response } from 'express';
import { sanitizeInput } from '../../../src/utils/security';
import { verifyAdminApiAuthorization, verifyAuthenticatedUserHeader } from '../../../src/utils/serverAdminAndTelegramSecurity';
import { recordAbuseSignal } from '../../../src/utils/serverDeliveryAndAbuseGuard';
import { validateCommunityTextSafety } from '../../../src/features/community/services/communityTrustService';
import type { CommunityAbuseReason, DataCorrectionCategory, ModerationActionRecord, ReactionType } from '../../../src/features/community/types/community.types';
import { appendServerAdminAuditLog } from '../account-admin/accountAdminRepository';
import {
  addServerDiscussionReply,
  communityServerStore,
  getPublicMemberByUsername,
  listAllCommunityTopics,
  persistCommunityServerStore,
  resolveServerAuthorProfile,
} from './communityStore';

export interface CommunityRoutesOptions {
  checkRateLimit?: (ip: string, bucket: 'general', max: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
}

const VALID_REACTIONS = new Set<ReactionType>(['helpful', 'agree', 'needs_source', 'disagree']);
const registeredCommunityApps = new WeakSet<Express>();

export function registerCommunityRoutes(app: Express, options?: CommunityRoutesOptions): void {
  if (registeredCommunityApps.has(app)) return;
  registeredCommunityApps.add(app);

  const getIp = options?.getClientIp ?? ((req: Request) => req.ip || '127.0.0.1');
  const allowRate = options?.checkRateLimit ?? (() => true);

  app.get('/api/community/overview', (req: Request, res: Response) => {
    if (!allowRate(getIp(req), 'general', 120, 60_000)) { res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' }); return; }
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.status(200).json({
      status: 'ok',
      topics: listAllCommunityTopics(),
      featuredDiscussions: communityServerStore.discussions.filter((d) => d.status !== 'hidden').slice(0, 6),
      recentQuestions: communityServerStore.questions.slice(0, 6),
      pendingCorrectionsCount: communityServerStore.corrections.filter((c) => !['applied', 'rejected', 'withdrawn'].includes(c.status)).length,
    });
  });

  app.get('/api/community/topics', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', topics: listAllCommunityTopics() });
  });

  app.get('/api/community/discussions', (req: Request, res: Response) => {
    const hoodId = req.query.neighborhoodId ? Number(req.query.neighborhoodId) : null;
    const topicId = typeof req.query.topicId === 'string' ? req.query.topicId.trim() : '';
    const items = communityServerStore.discussions.filter((d) =>
      d.status !== 'hidden' && (!hoodId || d.neighborhoodId === hoodId) && (!topicId || d.topicId === topicId),
    );
    res.status(200).json({ status: 'ok', items });
  });

  app.post('/api/community/discussions', async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { recordAbuseSignal(getIp(req), 'auth_failure'); res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const titleFa = sanitizeInput(String(req.body?.titleFa || ''), 120);
    const bodyFa = sanitizeInput(String(req.body?.bodyFa || ''), 500);
    const safety = validateCommunityTextSafety(bodyFa);
    if (titleFa.length < 5 || !safety.ok) { res.status(422).json({ status: 'error', code: 'INVALID_DISCUSSION_BODY', message: safety.errorFa || 'INVALID_TITLE' }); return; }
    const item = {
      id: `post-${Date.now()}`,
      track: req.body?.track === 'expert_qa' ? ('expert_qa' as const) : ('social_discussion' as const),
      neighborhoodId: Number(req.body?.neighborhoodId) || 1,
      neighborhoodNameFa: sanitizeInput(String(req.body?.neighborhoodNameFa || 'پونک'), 50),
      topicId: sanitizeInput(String(req.body?.topicId || 'topic-neighborhoods'), 50),
      titleFa, bodyFa, ownerUserId: auth.uid, authorProfile: resolveServerAuthorProfile(auth.uid),
      helpfulCount: 0, helpfulVoterIds: [],
      reactionCounts: { helpful: 0, agree: 0, needs_source: 0, disagree: 0 }, reactionsByUser: {},
      replies: [], status: 'published' as const, createdAtIso: new Date().toISOString(), createdAtFa: 'امروز',
    };
    communityServerStore.discussions.unshift(item);
    persistCommunityServerStore();
    res.status(201).json({ status: 'ok', item });
  });

  app.post('/api/community/discussions/:id/replies', async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const result = addServerDiscussionReply(req.params.id, String(req.body?.bodyFa || ''), req.body?.parentReplyId || null, auth.uid);
    if (!result.ok) { res.status(result.status).json({ status: 'error', code: result.message }); return; }
    res.status(201).json({ status: 'ok', post: result.post });
  });

  app.get('/api/community/questions', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', items: communityServerStore.questions });
  });

  app.post('/api/community/questions', async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const titleFa = sanitizeInput(String(req.body?.titleFa || ''), 140);
    const bodyFa = sanitizeInput(String(req.body?.bodyFa || ''), 500);
    const safety = validateCommunityTextSafety(bodyFa);
    if (titleFa.length < 8 || !safety.ok) { res.status(422).json({ status: 'error', code: 'INVALID_QUESTION', message: safety.errorFa }); return; }
    const q = {
      id: `q-${Date.now()}`, titleFa, bodyFa, neighborhoodId: Number(req.body?.neighborhoodId) || 1,
      neighborhoodNameFa: sanitizeInput(String(req.body?.neighborhoodNameFa || 'پونک'), 50),
      topicId: sanitizeInput(String(req.body?.topicId || 'topic-legal-contracts'), 50),
      tags: [], ownerUserId: auth.uid, authorProfile: resolveServerAuthorProfile(auth.uid),
      status: 'open' as const, answers: [], followerIds: [auth.uid], createdAtIso: new Date().toISOString(), createdAtFa: 'امروز',
    };
    communityServerStore.questions.unshift(q);
    persistCommunityServerStore();
    res.status(201).json({ status: 'ok', item: q });
  });

  app.post('/api/community/questions/:id/answers', async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const q = communityServerStore.questions.find((item) => item.id === req.params.id);
    if (!q) { res.status(404).json({ status: 'error', code: 'QUESTION_NOT_FOUND' }); return; }
    const bodyFa = sanitizeInput(String(req.body?.bodyFa || ''), 600);
    const safety = validateCommunityTextSafety(bodyFa);
    if (!safety.ok) { res.status(422).json({ status: 'error', code: 'INVALID_ANSWER', message: safety.errorFa }); return; }
    const sourceReferenceFa = req.body?.sourceReferenceFa ? sanitizeInput(String(req.body.sourceReferenceFa), 140) : undefined;
    const author = resolveServerAuthorProfile(auth.uid);
    const answer = {
      id: `ans-${Date.now()}`, questionId: q.id, authorProfile: author, bodyFa, sourceReferenceFa,
      markers: { isAskerSelected: false, hasCredibleSource: Boolean(sourceReferenceFa), isExpertReviewed: Boolean(author.verifiedCredentialFa), isOfficiallyVerified: false },
      reactionCounts: { helpful: 0, agree: 0, needs_source: 0, disagree: 0 }, reactionsByUser: {}, createdAtFa: 'امروز', status: 'visible' as const,
    };
    q.answers.push(answer);
    if (q.status === 'open') q.status = 'answered';
    persistCommunityServerStore();
    res.status(201).json({ status: 'ok', item: answer });
  });

  app.get('/api/community/contributions', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', items: communityServerStore.corrections });
  });

  app.post('/api/community/contributions', async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const titleFa = sanitizeInput(String(req.body?.titleFa || ''), 120);
    const evidenceSummaryFa = sanitizeInput(String(req.body?.evidenceSummaryFa || ''), 420);
    const safety = validateCommunityTextSafety(evidenceSummaryFa);
    if (titleFa.length < 5 || !safety.ok) { res.status(422).json({ status: 'error', code: 'INVALID_CORRECTION' }); return; }
    const proposal = {
      id: `corr-${Date.now()}`, neighborhoodId: Number(req.body?.neighborhoodId) || 1,
      neighborhoodNameFa: sanitizeInput(String(req.body?.neighborhoodNameFa || 'پونک'), 50),
      category: (req.body?.category as DataCorrectionCategory) || 'urban_facility', titleFa,
      currentValueFa: sanitizeInput(String(req.body?.currentValueFa || ''), 140) || undefined, evidenceSummaryFa,
      suggestedValueFa: sanitizeInput(String(req.body?.suggestedValueFa || ''), 160) || 'نیازمند بررسی',
      observedDateFa: sanitizeInput(String(req.body?.observedDateFa || 'امروز'), 30), evidenceAttachments: [],
      ownerUserId: auth.uid, authorProfile: resolveServerAuthorProfile(auth.uid),
      status: 'submitted' as const, appliedDataVersionId: null, createdAtIso: new Date().toISOString(), createdAtFa: 'امروز',
    };
    communityServerStore.corrections.unshift(proposal);
    persistCommunityServerStore();
    res.status(201).json({ status: 'ok', item: proposal });
  });

  app.post('/api/community/contributions/:id/withdraw', async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const item = communityServerStore.corrections.find((c) => c.id === req.params.id);
    if (!item) { res.status(404).json({ status: 'error', code: 'NOT_FOUND' }); return; }
    if (item.ownerUserId !== auth.uid) { res.status(403).json({ status: 'error', code: 'OWNER_MISMATCH' }); return; }
    if (item.status === 'applied' || item.status === 'approved' || item.status === 'verified') {
      res.status(409).json({ status: 'error', code: 'ALREADY_APPLIED' }); return;
    }
    item.status = 'withdrawn';
    persistCommunityServerStore();
    res.status(200).json({ status: 'ok', item });
  });

  app.post('/api/community/reactions', async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const reaction = req.body?.reaction as ReactionType;
    if (!VALID_REACTIONS.has(reaction)) { res.status(400).json({ status: 'error', code: 'INVALID_REACTION' }); return; }
    const post = communityServerStore.discussions.find((d) => d.id === req.body?.targetId);
    if (!post) { res.status(404).json({ status: 'error', code: 'TARGET_NOT_FOUND' }); return; }
    const byUser = post.reactionsByUser ?? (post.reactionsByUser = {});
    const counts = post.reactionCounts ?? (post.reactionCounts = { helpful: post.helpfulCount, agree: 0, needs_source: 0, disagree: 0 });
    const prev = byUser[auth.uid];
    if (prev === reaction) { counts[reaction] = Math.max(0, counts[reaction] - 1); delete byUser[auth.uid]; }
    else { if (prev) counts[prev] = Math.max(0, counts[prev] - 1); counts[reaction] += 1; byUser[auth.uid] = reaction; }
    post.helpfulCount = counts.helpful;
    persistCommunityServerStore();
    res.status(200).json({ status: 'ok', reactionCounts: counts });
  });

  app.get('/api/community/members/:username', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const profile = getPublicMemberByUsername(req.params.username, Boolean(req.headers.authorization));
    if (!profile) { res.status(404).json({ status: 'error', code: 'PROFILE_NOT_PUBLIC_OR_FOUND' }); return; }
    res.status(200).json({ status: 'ok', profile });
  });

  app.post('/api/community/reports', async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const report = {
      id: `abr-${Date.now()}`, targetType: req.body?.targetType || 'discussion_post',
      targetId: sanitizeInput(String(req.body?.targetId || ''), 60),
      reason: (req.body?.reason as CommunityAbuseReason) || 'spam_promo',
      detailsFa: sanitizeInput(String(req.body?.detailsFa || ''), 240),
      reporterUserId: auth.uid, status: 'submitted' as const, createdAtIso: new Date().toISOString(),
    };
    communityServerStore.abuseReports.unshift(report);
    persistCommunityServerStore();
    res.status(201).json({ status: 'ok', item: report });
  });

  app.post('/api/community/appeals', async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const appeal = {
      id: `apl-${Date.now()}`, moderationActionId: sanitizeInput(String(req.body?.moderationActionId || ''), 60),
      targetId: sanitizeInput(String(req.body?.targetId || ''), 60), appellantUserId: auth.uid,
      argumentFa: sanitizeInput(String(req.body?.argumentFa || ''), 320), status: 'submitted' as const, createdAtIso: new Date().toISOString(),
    };
    communityServerStore.appeals.unshift(appeal);
    persistCommunityServerStore();
    res.status(201).json({ status: 'ok', item: appeal });
  });

  app.get('/api/account/community', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    res.status(200).json({
      status: 'ok',
      myContributions: communityServerStore.corrections.filter((c) => c.ownerUserId === auth.uid),
      myReportsCount: communityServerStore.abuseReports.filter((r) => r.reporterUserId === auth.uid).length,
      myAppeals: communityServerStore.appeals.filter((a) => a.appellantUserId === auth.uid),
    });
  });

  app.get('/api/admin/community/moderation', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) { recordAbuseSignal(getIp(req), 'auth_failure'); res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    res.status(200).json({
      status: 'ok',
      corrections: communityServerStore.corrections, reports: communityServerStore.abuseReports,
      actions: communityServerStore.moderationActions, appeals: communityServerStore.appeals,
    });
  });

  app.post('/api/admin/community/moderation-actions', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const targetId = sanitizeInput(String(req.body?.targetId || ''), 60);
    const actionType = String(req.body?.actionType || '');
    const reasonFa = sanitizeInput(String(req.body?.reasonFa || ''), 200);
    if (!targetId || reasonFa.trim().length < 6) {
      res.status(400).json({ status: 'error', code: 'REASON_REQUIRED', messageFa: 'ثبت دلیل تصمیم مدیریتی (حداقل ۶ کاراکتر) الزامی است.' });
      return;
    }
    if (actionType === 'approve_data' || actionType === 'apply_data_version' || actionType === 'reject_data') {
      const target = communityServerStore.corrections.find((c) => c.id === targetId);
      if (!target) { res.status(404).json({ status: 'error', code: 'CORRECTION_NOT_FOUND' }); return; }
      if (target.status === 'withdrawn' || target.status === 'applied') {
        res.status(409).json({ status: 'error', code: 'INVALID_CORRECTION_TRANSITION', messageFa: 'پیشنهاد پس‌گرفته‌شده یا اعمال‌شده قابل تغییر نیست.' });
        return;
      }
      if (actionType === 'apply_data_version' && target.status !== 'approved' && target.status !== 'verified') {
        res.status(409).json({ status: 'error', code: 'APPROVAL_REQUIRED_BEFORE_APPLY', messageFa: 'پیش از اعمال به داده مرجع، پیشنهاد باید در مرحله قبل تایید (approved) شده باشد.' });
        return;
      }
      target.status = actionType === 'approve_data' ? 'approved' : actionType === 'apply_data_version' ? 'applied' : 'rejected';
      target.moderatorNoteFa = reasonFa;
      if (actionType === 'apply_data_version') target.appliedDataVersionId = `canon-ver-${new Date().toISOString().slice(0, 10)}`;
    } else if (actionType === 'resolve_report' || actionType === 'dismiss_report') {
      const rep = communityServerStore.abuseReports.find((r) => r.id === targetId);
      if (rep) rep.status = actionType === 'resolve_report' ? 'decision_made' : 'dismissed';
    }
    const action = {
      id: `mact-${Date.now()}`, targetType: req.body?.targetType || 'data_correction', targetId,
      actionType: actionType as ModerationActionRecord['actionType'], reasonFa,
      actorRole: auth.email || auth.uid || 'admin', createdAtIso: new Date().toISOString(),
    };
    communityServerStore.moderationActions.unshift(action);
    persistCommunityServerStore();
    appendServerAdminAuditLog({
      actorRole: 'content_moderator', actorLabelFa: auth.email || 'ادمین نظارت انجمن',
      actionCode: `COMMUNITY_${actionType.toUpperCase()}`, targetType: 'listing', targetId, reasonFa, severity: 'info',
    });
    res.status(201).json({ status: 'ok', action });
  });

  app.post('/api/admin/community/appeals/:id/resolve', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const reviewerNoteFa = sanitizeInput(String(req.body?.reviewerNoteFa || ''), 200);
    if (reviewerNoteFa.trim().length < 6) {
      res.status(400).json({ status: 'error', code: 'REASON_REQUIRED', messageFa: 'ثبت توضیح بررسی اعتراض (حداقل ۶ کاراکتر) الزامی است.' });
      return;
    }
    const appeal = communityServerStore.appeals.find((a) => a.id === req.params.id);
    if (!appeal) { res.status(404).json({ status: 'error', code: 'APPEAL_NOT_FOUND' }); return; }
    if (appeal.status === 'overturned' || appeal.status === 'upheld') {
      res.status(409).json({ status: 'error', code: 'APPEAL_ALREADY_RESOLVED' });
      return;
    }
    appeal.status = req.body?.decision === 'overturned' ? 'overturned' : 'upheld';
    appeal.reviewerNoteFa = reviewerNoteFa;
    persistCommunityServerStore();
    appendServerAdminAuditLog({
      actorRole: 'content_moderator', actorLabelFa: auth.email || 'ادمین نظارت',
      actionCode: `APPEAL_${appeal.status.toUpperCase()}`, targetType: 'listing', targetId: appeal.id, reasonFa: reviewerNoteFa, severity: 'info',
    });
    res.status(200).json({ status: 'ok', appeal });
  });
}

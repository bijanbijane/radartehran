/** @file src/features/community/tests/communityTrust.test.ts — Stage 25 Community Trust Separation, Anti-Spam & Moderation Unit Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCommunityOwner,
  buildUserTrustProfile,
  moderateCommunityPost,
  moderateDataCorrectionProposal,
  submitCommunityAbuseReport,
  submitCommunityPost,
  submitDataCorrectionProposal,
  submitResearchTopicProposal,
  validateCommunityTextSafety,
  voteResearchTopicProposal,
} from '../services/communityTrustService';

test('Trust Separation Principle: High participation score NEVER grants verified professional credential', () => {
  const activeParticipant = buildUserTrustProfile({
    userId: 'u-active',
    displayNameFa: 'ساکن فعال محله',
    isPhoneVerified: true,
    participationScore: 999,
    verifiedCredentialFa: null,
  });
  assert.equal(activeParticipant.participationTierFa, 'مشارکت‌کننده فعال');
  assert.equal(activeParticipant.verifiedCredentialFa, null);
  assert.equal(activeParticipant.identityStatus, 'verified_phone');
});

test('Anti-spam rejects external promo links and phone leaks while allowing genuine negative feedback', () => {
  const spamPromo = validateCommunityTextSafety('برای خرید ارزان عضو https://t.me/spamgroup شوید');
  assert.equal(spamPromo.ok, false);

  const phoneLeak = validateCommunityTextSafety('با شماره 09123456789 تماس بگیرید تا هماهنگ کنیم');
  assert.equal(phoneLeak.ok, false);

  const honestNegativeReview = validateCommunityTextSafety('فشار آب در طبقات بالایی عصرها بسیار کم است و جای پارک محدود است.');
  assert.equal(honestNegativeReview.ok, true);
});

test('Ownership guard prevents unauthorized mutation by non-owners unless admin', () => {
  assert.equal(assertCommunityOwner('u-1', 'u-2', false).ok, false);
  assert.equal(assertCommunityOwner('u-2', 'u-2', false).ok, true);
  assert.equal(assertCommunityOwner('admin-1', 'u-2', true).ok, true);
});

test('Data corrections, discussions, abuse reports, and research proposals execute end-to-end', () => {
  const author = buildUserTrustProfile({
    userId: 'u-tester',
    displayNameFa: 'کاربر آزمایشی',
    isPhoneVerified: true,
    participationScore: 20,
  });

  const corrRes = submitDataCorrectionProposal({
    neighborhoodId: 1,
    neighborhoodNameFa: 'پونک',
    category: 'urban_facility',
    titleFa: 'ثبت بوستان تازه تاسیس شمال بلوار عدل',
    evidenceSummaryFa: 'بوستان محلی با زمین بازی کودک هفته گذشته در ضلع شمالی افتتاح شده است.',
    suggestedValueFa: 'افزودن شاخص فضای سبز +۰.۴',
    authorProfile: author,
  });
  assert.equal(corrRes.ok, true);
  const createdId = corrRes.items[0].id;
  const verifiedList = moderateDataCorrectionProposal({
    proposalId: createdId,
    status: 'verified',
    moderatorNoteFa: 'تصویر ماهواره‌ای و نقشه شهرداری تطبیق داده شد.',
  });
  assert.equal(verifiedList[0].status, 'verified');

  const postRes = submitCommunityPost({
    track: 'expert_qa',
    neighborhoodId: 1,
    neighborhoodNameFa: 'پونک',
    titleFa: 'ضابطه ارتفاع مجاز در گذر ۱۰ متری',
    bodyFa: 'در پهنه‌بندی R122 گذر ده متری، حداکثر چند طبقه جواز مسکونی صادر می‌شود؟',
    authorProfile: author,
  });
  assert.equal(postRes.ok, true);
  const postId = postRes.items[0].id;

  const reports = submitCommunityAbuseReport({
    targetType: 'discussion_post',
    targetId: postId,
    reason: 'spam_promo',
    detailsFa: 'بررسی تکراری بودن سؤال',
    reporterUserId: 'u-reporter',
  });
  assert.equal(reports[0].targetId, postId);

  const moderatedPosts = moderateCommunityPost(postId, 'hidden');
  assert.equal(moderatedPosts.find((p) => p.id === postId)?.status, 'hidden');

  const rpRes = submitResearchTopicProposal({
    titleFa: 'بررسی کیفیت ساخت‌وسازهای نوساز منطقه ۵',
    questionFa: 'میزان عایق صوتی در ساختمان‌های نوساز چقدر مطابق مبحث ۱۸ است؟',
    neighborhoodNameFa: 'منطقه ۵',
    authorProfile: author,
  });
  assert.equal(rpRes.ok, true);
  const rpId = rpRes.items[0].id;
  const votedList = voteResearchTopicProposal(rpId, 'u-voter-2');
  assert.equal(votedList.find((r) => r.id === rpId)?.votesCount, 2);
});

import express from 'express';
import http from 'node:http';
import {
  editCommunityPost,
  loadCommunityQuestions,
  submitCommunityQuestion,
  submitQuestionAnswer,
  togglePostReaction,
} from '../services/communityEngagementService';
import {
  findSimilarQuestionTitles,
  loadCommunityPosts,
  replyToCommunityPost,
  resolveReplyDepth,
  sanitizePublicProfile,
} from '../services/communityTrustService';
import { registerCommunityRoutes } from '../../../../server/modules/community/communityRoutes';

test('Stage 25 engagement: 4-reaction dedup, max-depth-2 replies, edit history, Q&A duplicate hints & zero-PII masking', () => {
  const author = buildUserTrustProfile({
    userId: 'u-eng-1',
    displayNameFa: 'ساکن سعادت‌آباد',
    isPhoneVerified: true,
    participationScore: 40,
  });

  const qRes = submitCommunityQuestion({
    titleFa: 'کیفیت آنتن‌دهی و آب در بلوار سرو',
    bodyFa: 'در محدوده بلوار سرو افت فشار آب شبانه وجود دارد یا خیر؟',
    neighborhoodId: 5,
    neighborhoodNameFa: 'سعادت‌آباد',
    topicId: 'topic-neighborhoods',
    authorProfile: author,
  });
  assert.equal(qRes.ok, true);
  const similar = findSimilarQuestionTitles('آنتن‌دهی بلوار سرو', loadCommunityQuestions());
  assert.ok(similar.length >= 1);

  const ansRes = submitQuestionAnswer({
    questionId: qRes.items[0].id,
    bodyFa: 'ساختمان‌های دارای مخزن ذخیره مشکلی ندارند ولی طبقات بالای پنج بدون پمپ افت فشار دارند.',
    sourceReferenceFa: 'تجربه سکونت سه ساله',
    authorProfile: author,
  });
  assert.equal(ansRes.ok, true);

  const post = submitCommunityPost({
    track: 'social_discussion',
    neighborhoodId: 5,
    neighborhoodNameFa: 'سعادت‌آباد',
    titleFa: 'وضعیت جای پارک در کوچه فرعی',
    bodyFa: 'ساعات عصر در خیابان‌های فرعی جای پارک محدود است و طرح ترافیک ندارد.',
    authorProfile: author,
  }).items[0];

  const reacted = togglePostReaction(post.id, 'u-voter-a', 'helpful').find((p) => p.id === post.id)!;
  assert.equal(reacted.reactionCounts?.helpful, 1);
  const toggledOff = togglePostReaction(post.id, 'u-voter-a', 'helpful').find((p) => p.id === post.id)!;
  assert.equal(toggledOff.reactionCounts?.helpful, 0);

  const r1 = replyToCommunityPost({ postId: post.id, bodyFa: 'در کوچه‌های شرقی وضعیت بهتر است.', parentReplyId: null, authorProfile: author });
  assert.equal(r1.ok, true);
  const lvl1Id = r1.items.find((p) => p.id === post.id)!.replies[0].id;
  const depthCheck = resolveReplyDepth(r1.items.find((p) => p.id === post.id)!.replies, lvl1Id);
  assert.equal(depthCheck.depth, 2);
  const r2 = replyToCommunityPost({ postId: post.id, bodyFa: 'کاملاً درسته، خصوصاً بعد از ساعت ۸ شب.', parentReplyId: lvl1Id, authorProfile: author });
  assert.equal(r2.ok, true);

  const edited = editCommunityPost({
    postId: post.id,
    actorUserId: 'u-eng-1',
    titleFa: 'وضعیت جای پارک در کوچه فرعی',
    bodyFa: 'ساعات عصر در خیابان‌های فرعی جای پارک محدود است و دسترسی مترو مناسب است.',
  });
  assert.equal(edited.ok, true);
  assert.equal((loadCommunityPosts().find((p) => p.id === post.id)?.revisionHistory?.length ?? 0) >= 1, true);

  const maskedPublic = sanitizePublicProfile(
    {
      userId: 'u-hidden',
      username: 'hidden_user',
      displayNameFa: 'نام محرمانه',
      identityStatus: 'verified_phone',
      verifiedCredentialFa: null,
      reputation: { data: 10, community: 10, research: 0, sources: 0, professional: 0 },
      badges: [],
      bioFa: 'توضیح پروفایل',
      memberSinceFa: '۱۴۰۴',
      visibility: 'private',
      showBadges: false,
      showContributions: false,
      showFollowedTopics: false,
      followedTopicIds: [],
      recentPublicSummaryFa: [],
    },
    false,
    false,
  );
  assert.equal(maskedPublic, null);
});

test('Stage 25 community Express routes enforce authentication on write/admin endpoints', async () => {
  const app = express();
  app.use(express.json());
  registerCommunityRoutes(app);

  const srv = http.createServer(app);
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const port = (srv.address() as { port: number }).port;
  try {
    const pubRes = await fetch(`http://127.0.0.1:${port}/api/community/overview`);
    assert.equal(pubRes.status, 200);
    const pubJson = await pubRes.json();
    assert.equal(pubJson.status, 'ok');
    assert.ok(Array.isArray(pubJson.topics));

    const writeUnauth = await fetch(`http://127.0.0.1:${port}/api/community/discussions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titleFa: 'تست غیرمجاز', bodyFa: 'متن تست طولانی' }),
    });
    assert.equal(writeUnauth.status, 401);
  } finally {
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  }
});

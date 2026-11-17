/** @file src/features/community/components/CommunityDiscussionsTab.tsx — Stage 25 Threaded Discussions (Max-2 Nesting, 4 Reactions, Edit Revisions & Spatial Link) */
import React, { useMemo, useState } from 'react';
import { Bookmark, Edit3, Flag, Lock, MessageCircle, Pin } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { computeDiscussionMultiFactorRank } from '../services/communityTrustService';
import {
  ABUSE_REASON_LABELS_FA,
  REACTION_LABELS_FA,
  type CommunityAbuseReason,
  type CommunityDiscussionPost,
  type ReactionType,
} from '../types/community.types';
import { CommunityAuthorBadges } from './CommunityTrustBanner';

interface Props {
  selectedHood: EvaluatedNeighborhood;
  posts: CommunityDiscussionPost[];
  currentUserId: string;
  onSubmitPost: (input: { titleFa: string; bodyFa: string; topicId: string }) => Promise<{ ok: boolean; errorFa?: string }> | { ok: boolean; errorFa?: string };
  onReplyPost: (postId: string, bodyFa: string, parentReplyId?: string | null) => Promise<{ ok: boolean; errorFa?: string }> | { ok: boolean; errorFa?: string };
  onEditPost: (postId: string, titleFa: string, bodyFa: string) => Promise<{ ok: boolean; errorFa?: string }> | { ok: boolean; errorFa?: string };
  onToggleReaction: (postId: string, reaction: ReactionType) => void;
  onToggleFollow: (postId: string) => void;
  onReportAbuse: (postId: string, reason: CommunityAbuseReason, detailsFa: string) => void;
  onSelectAuthor: (username: string) => void;
  onOpenResidentVoteTab: () => void;
}

const REACTIONS_LIST: ReactionType[] = ['helpful', 'agree', 'needs_source', 'disagree'];

export const CommunityDiscussionsTab: React.FC<Props> = ({
  selectedHood,
  posts,
  currentUserId,
  onSubmitPost,
  onReplyPost,
  onEditPost,
  onToggleReaction,
  onToggleFollow,
  onReportAbuse,
  onSelectAuthor,
  onOpenResidentVoteTab,
}) => {
  const [titleFa, setTitleFa] = useState('');
  const [bodyFa, setBodyFa] = useState('');
  const [topicId, setTopicId] = useState('topic-neighborhoods');
  const [sortMode, setSortMode] = useState<'rank' | 'recent'>('rank');
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyParentByPost, setReplyParentByPost] = useState<Record<string, string | null>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [abuseReason, setAbuseReason] = useState<CommunityAbuseReason>('spam_promo');
  const [abuseDetails, setAbuseDetails] = useState('');

  const orderedPosts = useMemo(() => {
    const visible = posts.filter((p) => p.status !== 'hidden');
    if (sortMode === 'recent') return [...visible].sort((a, b) => Date.parse(b.createdAtIso) - Date.parse(a.createdAtIso));
    return [...visible].sort((a, b) => computeDiscussionMultiFactorRank(b, selectedHood.id) - computeDiscussionMultiFactorRank(a, selectedHood.id));
  }, [posts, sortMode, selectedHood.id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await onSubmitPost({ titleFa, bodyFa, topicId });
    if (res.ok) {
      setTitleFa('');
      setBodyFa('');
      setFeedback({ ok: true, msg: 'گفت‌وگوی شما با برچسب مکانی محله منتشر شد.' });
    } else {
      setFeedback({ ok: false, msg: res.errorFa || 'خطا در ثبت گفت‌وگو' });
    }
  };

  return (
    <div className="space-y-4 text-xs" data-testid="community-discussions-tab">
      <div className="p-3.5 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div>
          <strong className="text-[#182522] dark:text-white block">تجربه زیسته محله {selectedHood.name} vs شاخص رسمی</strong>
          <span className="text-[11px] text-[#586760] dark:text-slate-400">برای امتیاز عددی هوا، مترو و امنیت از رأی‌دهی ساختاریافته ساکنان استفاده کنید.</span>
        </div>
        <button type="button" onClick={onOpenResidentVoteTab} className="px-3 py-1.5 rounded-[8px] bg-[#176B63] text-white font-bold cursor-pointer whitespace-nowrap">
          ثبت رأی کیفیت زیست
        </button>
      </div>

      <form onSubmit={handleCreate} className="p-4 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black text-[#182522] dark:text-white">آغاز گفت‌وگوی جدید در محله {selectedHood.name}</h2>
          <select aria-label="موضوع گفت‌وگو" value={topicId} onChange={(e) => setTopicId(e.target.value)} className="p-1.5 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold">
            <option value="topic-neighborhoods">محله‌ها و زیست‌پذیری</option>
            <option value="topic-tehran-market">بازار مسکن تهران</option>
            <option value="topic-rent-deposit">رهن و اجاره</option>
            <option value="topic-buy-sell">خرید و فروش</option>
          </select>
        </div>
        <input type="text" aria-label="عنوان گفت‌وگو" value={titleFa} onChange={(e) => setTitleFa(e.target.value)} placeholder="عنوان دقیق گفت‌وگو (مثلاً وضعیت ترافیک و جای پارک بلوار عدل...)" className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 text-[#182522] dark:text-slate-100" />
        <textarea rows={2} aria-label="متن گفت‌وگو" value={bodyFa} onChange={(e) => setBodyFa(e.target.value)} placeholder="دیدگاه مستند و محترمانه خود را بنویسید؛ درج شماره تماس و لینک تبلیغاتی مجاز نیست." className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 text-[#182522] dark:text-slate-100" />
        {feedback && (
          <div className={`p-2 rounded-[8px] font-bold ${feedback.ok ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-200' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-200'}`}>
            {feedback.msg}
          </div>
        )}
        <button type="submit" data-testid="submit-discussion-btn" className="px-4 py-2 rounded-[8px] bg-[#176B63] text-white font-bold cursor-pointer">
          انتشار گفت‌وگو
        </button>
      </form>

      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-[#586760] dark:text-slate-400 tabular-nums">{toPersianNum(orderedPosts.length)} گفت‌وگو قابل مشاهده</span>
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button type="button" onClick={() => setSortMode('rank')} className={`px-2.5 py-1 rounded-md font-bold cursor-pointer ${sortMode === 'rank' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white' : 'text-slate-500'}`}>رتبه چندعاملی</button>
          <button type="button" onClick={() => setSortMode('recent')} className={`px-2.5 py-1 rounded-md font-bold cursor-pointer ${sortMode === 'recent' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white' : 'text-slate-500'}`}>تازه‌ترین</button>
        </div>
      </div>

      <div className="space-y-3">
        {orderedPosts.map((post) => {
          const isLocked = post.status === 'locked' || post.status === 'archived';
          const isOwner = post.ownerUserId === currentUserId;
          const isFollowed = (post.followerIds || []).includes(currentUserId);
          const level1Replies = post.replies.filter((r) => !r.parentReplyId && r.status !== 'hidden');
          const parentTarget = replyParentByPost[post.id] || null;
          return (
            <article key={post.id} className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#586760] dark:text-slate-400">
                <div className="flex flex-wrap items-center gap-1.5">
                  {post.pinned && <Pin className="w-3.5 h-3.5 text-[#176B63]" />}
                  {isLocked && <Lock className="w-3.5 h-3.5 text-amber-600" />}
                  <span>محله {post.neighborhoodNameFa} · {post.createdAtFa}</span>
                  {(post.revisionHistory?.length ?? 0) > 0 && <span className="tabular-nums">· ویرایش‌شده ({toPersianNum(post.revisionHistory!.length)})</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => onToggleFollow(post.id)} className={`inline-flex items-center gap-1 font-bold cursor-pointer ${isFollowed ? 'text-[#176B63] dark:text-emerald-400' : 'text-[#586760]'}`}>
                    <Bookmark className="w-3.5 h-3.5" /><span>{isFollowed ? 'دنبال‌شده' : 'پیگیری'}</span>
                  </button>
                  {isOwner && !isLocked && (
                    <button type="button" onClick={() => { setEditingId(editingId === post.id ? null : post.id); setEditTitle(post.titleFa); setEditBody(post.bodyFa); }} className="inline-flex items-center gap-1 text-[#586760] hover:text-[#182522] dark:hover:text-white cursor-pointer">
                      <Edit3 className="w-3.5 h-3.5" /><span>ویرایش</span>
                    </button>
                  )}
                  <button type="button" onClick={() => setReportingId(reportingId === post.id ? null : post.id)} className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400 cursor-pointer">
                    <Flag className="w-3.5 h-3.5" /><span>گزارش</span>
                  </button>
                </div>
              </div>

              {editingId === post.id ? (
                <div className="space-y-2 p-3 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800/70">
                  <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full p-2 rounded border border-[#DCE3DF] dark:border-slate-700 bg-white dark:bg-slate-900" />
                  <textarea rows={2} value={editBody} onChange={(e) => setEditBody(e.target.value)} className="w-full p-2 rounded border border-[#DCE3DF] dark:border-slate-700 bg-white dark:bg-slate-900" />
                  <div className="flex gap-2">
                    <button type="button" onClick={async () => { const res = await onEditPost(post.id, editTitle, editBody); if (res.ok) setEditingId(null); else setFeedback({ ok: false, msg: res.errorFa || 'خطا' }); }} className="px-3 py-1 rounded bg-[#176B63] text-white font-bold cursor-pointer">ذخیره ویرایش با سابقه</button>
                    <button type="button" onClick={() => setEditingId(null)} className="px-3 py-1 rounded border border-[#DCE3DF] dark:border-slate-700 cursor-pointer">انصراف</button>
                  </div>
                </div>
              ) : (
                <>
                  <h3 className="font-black text-sm text-[#182522] dark:text-white">{post.titleFa}</h3>
                  <p className="text-[#34433E] dark:text-slate-300 leading-relaxed">{post.bodyFa}</p>
                </>
              )}

              <CommunityAuthorBadges profile={post.authorProfile} onSelectUsername={onSelectAuthor} />

              <div className="pt-2 border-t border-[#DCE3DF] dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {REACTIONS_LIST.map((rKey) => {
                    const active = post.reactionsByUser?.[currentUserId] === rKey || (rKey === 'helpful' && !post.reactionsByUser && post.helpfulVoterIds.includes(currentUserId));
                    const count = post.reactionCounts?.[rKey] ?? (rKey === 'helpful' ? post.helpfulCount : 0);
                    return (
                      <button
                        key={rKey}
                        type="button"
                        onClick={() => onToggleReaction(post.id, rKey)}
                        className={`px-2 py-1 rounded-[7px] font-bold tabular-nums border cursor-pointer transition ${active ? 'bg-[#176B63] text-white border-[#176B63]' : 'border-[#DCE3DF] dark:border-slate-700 text-[#34433E] dark:text-slate-200 hover:border-[#176B63]'}`}
                      >
                        {REACTION_LABELS_FA[rKey]} ({toPersianNum(count)})
                      </button>
                    );
                  })}
                </div>
                <span className="text-[11px] text-[#586760] inline-flex items-center gap-1 tabular-nums">
                  <MessageCircle className="w-3.5 h-3.5" /><span>{toPersianNum(post.replies.length)} پاسخ</span>
                </span>
              </div>

              {reportingId === post.id && (
                <div className="p-2.5 rounded-[8px] bg-rose-50/70 dark:bg-rose-950/20 flex flex-wrap gap-2">
                  <select aria-label="علت گزارش" value={abuseReason} onChange={(e) => setAbuseReason(e.target.value as CommunityAbuseReason)} className="p-1.5 rounded bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 font-bold">
                    {(Object.keys(ABUSE_REASON_LABELS_FA) as CommunityAbuseReason[]).map((r) => (<option key={r} value={r}>{ABUSE_REASON_LABELS_FA[r]}</option>))}
                  </select>
                  <input type="text" value={abuseDetails} onChange={(e) => setAbuseDetails(e.target.value)} placeholder="توضیح کوتاه برای ناظر..." className="flex-1 min-w-[160px] p-1.5 rounded bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800" />
                  <button type="button" onClick={() => { onReportAbuse(post.id, abuseReason, abuseDetails); setReportingId(null); setAbuseDetails(''); }} className="px-3 py-1 rounded bg-rose-600 text-white font-bold cursor-pointer">ثبت گزارش</button>
                </div>
              )}

              {level1Replies.length > 0 && (
                <div className="space-y-2 pr-3 border-r border-[#DCE3DF] dark:border-slate-700">
                  {level1Replies.map((rep) => {
                    const level2 = post.replies.filter((c) => c.parentReplyId === rep.id && c.status !== 'hidden');
                    return (
                      <div key={rep.id} className="space-y-1.5">
                        <div className="p-2.5 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800/60 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <CommunityAuthorBadges profile={rep.authorProfile} onSelectUsername={onSelectAuthor} />
                            {!isLocked && (
                              <button type="button" onClick={() => setReplyParentByPost({ ...replyParentByPost, [post.id]: parentTarget === rep.id ? null : rep.id })} className="text-[10.5px] font-bold text-[#176B63] dark:text-emerald-400 cursor-pointer shrink-0">
                                {parentTarget === rep.id ? 'لغو پاسخ سطح ۲' : 'پاسخ به این نظر'}
                              </button>
                            )}
                          </div>
                          <p className="text-[#34433E] dark:text-slate-300">{rep.bodyFa}</p>
                        </div>
                        {level2.length > 0 && (
                          <div className="mr-4 space-y-1 pr-3 border-r border-[#DCE3DF] dark:border-slate-700">
                            {level2.map((sub) => (
                              <div key={sub.id} className="p-2 rounded-[8px] bg-[#F8F9FA]/70 dark:bg-slate-800/40 space-y-0.5">
                                <CommunityAuthorBadges profile={sub.authorProfile} onSelectUsername={onSelectAuthor} />
                                <p className="text-[#34433E] dark:text-slate-300">{sub.bodyFa}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {!isLocked && (
                <div className="flex gap-2 pt-1">
                  <input type="text" aria-label={`پاسخ به ${post.titleFa}`} value={replyDrafts[post.id] || ''} onChange={(e) => setReplyDrafts({ ...replyDrafts, [post.id]: e.target.value })} placeholder={parentTarget ? 'پاسخ سطح ۲ در ادامه نظر انتخاب‌شده...' : 'پاسخ یا تجربه تکمیلی خود را بنویسید...'} className="flex-1 p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700" />
                  <button type="button" onClick={async () => { const res = await onReplyPost(post.id, replyDrafts[post.id] || '', parentTarget); if (res.ok) { setReplyDrafts({ ...replyDrafts, [post.id]: '' }); setReplyParentByPost({ ...replyParentByPost, [post.id]: null }); } else setFeedback({ ok: false, msg: res.errorFa || 'خطا' }); }} className="px-3.5 py-2 rounded-[8px] bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold cursor-pointer whitespace-nowrap">
                    ارسال پاسخ
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
};

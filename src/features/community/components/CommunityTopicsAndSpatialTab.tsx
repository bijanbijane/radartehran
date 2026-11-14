/** @file src/features/community/components/CommunityTopicsAndSpatialTab.tsx — Stage 25 14 Official Topics & Spatial Reality vs Benchmark View */
import React, { useState } from 'react';
import { Bell, BellOff, Compass, LineChart } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { CommunityDiscussionPost, CommunityQuestionItem, TopicItem } from '../types/community.types';
import { CommunityAuthorBadges } from './CommunityTrustBanner';

interface Props {
  mode: 'topics' | 'neighborhoods';
  selectedHood: EvaluatedNeighborhood;
  topics: TopicItem[];
  followedTopicIds: string[];
  posts: CommunityDiscussionPost[];
  questions: CommunityQuestionItem[];
  onToggleFollowTopic: (topicId: string) => void;
  onSelectAuthor: (username: string) => void;
  onOpenHoodMarket: () => void;
}

export const CommunityTopicsAndSpatialTab: React.FC<Props> = ({
  mode,
  selectedHood,
  topics,
  followedTopicIds,
  posts,
  questions,
  onToggleFollowTopic,
  onSelectAuthor,
  onOpenHoodMarket,
}) => {
  const [selectedTopicId, setSelectedTopicId] = useState<string>(topics[0]?.id || 'topic-tehran-market');
  const activeTopic = topics.find((t) => t.id === selectedTopicId) || topics[0];

  if (mode === 'topics') {
    const topicPosts = posts.filter((p) => p.topicId === selectedTopicId && p.status !== 'hidden');
    const topicQuestions = questions.filter((q) => q.topicId === selectedTopicId);

    return (
      <div className="space-y-5 text-xs" data-testid="community-topics-tab">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {topics.map((topic) => {
            const followed = followedTopicIds.includes(topic.id);
            const selected = selectedTopicId === topic.id;
            return (
              <div
                key={topic.id}
                className={`p-4 rounded-[12px] bg-white dark:bg-slate-900 border space-y-2 transition ${selected ? 'border-[#176B63]' : 'border-[#DCE3DF] dark:border-slate-800'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => setSelectedTopicId(topic.id)} className="text-start font-black text-sm text-[#182522] dark:text-white hover:text-[#176B63] cursor-pointer">
                    {topic.titleFa}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleFollowTopic(topic.id)}
                    className={`px-2.5 py-1 rounded-[7px] font-bold inline-flex items-center gap-1 cursor-pointer shrink-0 ${followed ? 'bg-[#176B63] text-white' : 'border border-[#DCE3DF] dark:border-slate-700 text-[#34433E] dark:text-slate-300'}`}
                  >
                    {followed ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                    <span>{followed ? 'دنبال‌شده' : 'دنبال‌کردن'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-[#586760] dark:text-slate-400 leading-relaxed">{topic.descriptionFa}</p>
                <div className="text-[11px] text-[#586760] dark:text-slate-400 tabular-nums">
                  حوزه: {topic.categoryFa} · {toPersianNum(topic.followersCount)} دنبال‌کننده · {toPersianNum(topic.activeThreadsCount)} بحث فعال
                </div>
              </div>
            );
          })}
        </div>

        {activeTopic && (
          <section className="p-4 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-black text-[#182522] dark:text-white">محتوای مرتبط با «{activeTopic.titleFa}»</h3>
            {topicPosts.length === 0 && topicQuestions.length === 0 ? (
              <p className="text-[#586760] dark:text-slate-400">هنوز گفت‌وگویی با این برچسب موضوعی ثبت نشده است.</p>
            ) : (
              <div className="divide-y divide-[#DCE3DF] dark:divide-slate-800">
                {topicPosts.map((p) => (
                  <div key={p.id} className="py-2.5 space-y-1">
                    <div className="font-bold text-[#182522] dark:text-white">{p.titleFa}</div>
                    <CommunityAuthorBadges profile={p.authorProfile} onSelectUsername={onSelectAuthor} />
                  </div>
                ))}
                {topicQuestions.map((q) => (
                  <div key={q.id} className="py-2.5 space-y-1">
                    <div className="font-bold text-[#14534E] dark:text-emerald-300">پرسش: {q.titleFa}</div>
                    <CommunityAuthorBadges profile={q.authorProfile} onSelectUsername={onSelectAuthor} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    );
  }

  const hoodPosts = posts.filter((p) => p.neighborhoodId === selectedHood.id && p.status !== 'hidden');
  return (
    <div className="space-y-4 text-xs" data-testid="community-spatial-neighborhoods-tab">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="p-4 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-[#182522] dark:text-white flex items-center gap-1.5">
              <LineChart className="w-4 h-4 text-[#176B63]" />
              <span>شاخص رسمی سامانه برای محله {selectedHood.name}</span>
            </h3>
            <button type="button" onClick={onOpenHoodMarket} className="text-[11px] font-bold text-[#176B63] dark:text-emerald-400 hover:underline cursor-pointer">
              تحلیل بازار محله
            </button>
          </div>
          <p className="text-[11px] text-[#586760] dark:text-slate-400">
            این ارقام از مدل محاسباتی و رصد بازار استخراج شده‌اند و از تجربه شخصی کاربران مجزا هستند:
          </p>
          <div className="grid grid-cols-3 gap-2 pt-1 tabular-nums">
            <div className="p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800/60">
              <span className="text-[10.5px] text-[#586760] block">کیفیت کلی</span>
              <strong className="text-sm font-black text-[#182522] dark:text-white">{toPersianNum(selectedHood.overallScore)} / ۱۰</strong>
            </div>
            <div className="p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800/60">
              <span className="text-[10.5px] text-[#586760] block">هوا و سکوت</span>
              <strong className="text-sm font-black text-[#182522] dark:text-white">{toPersianNum(selectedHood.air)} / ۱۰</strong>
            </div>
            <div className="p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800/60">
              <span className="text-[10.5px] text-[#586760] block">دسترسی مترو</span>
              <strong className="text-sm font-black text-[#182522] dark:text-white">{toPersianNum(selectedHood.metro)} / ۱۰</strong>
            </div>
          </div>
        </section>

        <section className="p-4 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-2.5">
          <h3 className="text-sm font-black text-[#182522] dark:text-white flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-sky-600" />
            <span>تجربه زیسته و مشاهدات ساکنان در {selectedHood.name}</span>
          </h3>
          {hoodPosts.length === 0 ? (
            <p className="text-[#586760] dark:text-slate-400">هنوز تجربه زیسته‌ای برای این محله ثبت نشده است.</p>
          ) : (
            <div className="divide-y divide-[#DCE3DF] dark:divide-slate-800">
              {hoodPosts.map((p) => (
                <div key={p.id} className="py-2 first:pt-0 last:pb-0 space-y-1">
                  <div className="font-bold text-[#182522] dark:text-white">{p.titleFa}</div>
                  <p className="text-[#34433E] dark:text-slate-300 leading-relaxed">{p.bodyFa}</p>
                  <CommunityAuthorBadges profile={p.authorProfile} onSelectUsername={onSelectAuthor} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

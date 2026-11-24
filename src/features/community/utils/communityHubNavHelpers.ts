/** @file src/features/community/utils/communityHubNavHelpers.ts — Tab & Member URL helpers for CommunityHubPage */
import type { ContributionsSubTabId } from '../../../navigation/registry/route.types';
import type { CommunityHubTabId } from '../types/community.types';
import { sanitizePublicNavigationQuery } from '../../../navigation/url/navigationUrlContract';
import { commitManagedHistoryTransition } from '../../../navigation/url/historySingleWriter';

export const COMMUNITY_PRIMARY_TABS: Array<{
  id: CommunityHubTabId;
  labelFa: string;
  href: string;
  matches: readonly CommunityHubTabId[];
}> = [
  { id: 'overview', labelFa: 'نمای کلی', href: '/community', matches: ['overview'] },
  { id: 'discussions', labelFa: 'گفت‌وگوها', href: '/community/discussions', matches: ['discussions', 'social_discussion', 'topics', 'neighborhoods'] },
  { id: 'questions', labelFa: 'پرسش‌وپاسخ', href: '/community/questions', matches: ['questions', 'expert_qa'] },
  { id: 'data_contribution', labelFa: 'اصلاح داده و پیشنهادها', href: '/community/contributions', matches: ['data_contribution', 'research_proposals'] },
  { id: 'members', labelFa: 'انجمن و قوانین', href: '/community/members', matches: ['members', 'guidelines'] },
];

export const COMMUNITY_HUB_TABS: Array<{ id: CommunityHubTabId; labelFa: string }> = [
  { id: 'overview', labelFa: 'خانه جامعه' },
  { id: 'discussions', labelFa: 'گفت‌وگوها' },
  { id: 'questions', labelFa: 'پرسش و پاسخ' },
  { id: 'data_contribution', labelFa: 'اصلاح داده' },
  { id: 'topics', labelFa: 'موضوعات' },
  { id: 'neighborhoods', labelFa: 'محله و بازار' },
  { id: 'research_proposals', labelFa: 'پیشنهاد پژوهش' },
  { id: 'members', labelFa: 'اعضا' },
  { id: 'guidelines', labelFa: 'آیین‌نامه' },
];

export function mapSubTabToHubTab(subTab?: ContributionsSubTabId): CommunityHubTabId {
  if (subTab === 'discussions' || subTab === 'points') return 'discussions';
  if (subTab === 'questions') return 'questions';
  if (subTab === 'submit' || subTab === 'contributions' || subTab === 'reports' || subTab === 'verify') return 'data_contribution';
  if (subTab === 'topics') return 'topics';
  if (subTab === 'neighborhoods' || subTab === 'market') return 'neighborhoods';
  if (subTab === 'research') return 'research_proposals';
  if (subTab === 'members') return 'members';
  if (subTab === 'guidelines' || subTab === 'help') return 'guidelines';
  return 'overview';
}

export function mapHubTabToSubTab(tab: CommunityHubTabId): ContributionsSubTabId {
  if (tab === 'discussions' || tab === 'social_discussion') return 'discussions';
  if (tab === 'questions' || tab === 'expert_qa') return 'questions';
  if (tab === 'data_contribution') return 'contributions';
  if (tab === 'topics') return 'topics';
  if (tab === 'neighborhoods') return 'neighborhoods';
  if (tab === 'research_proposals') return 'research';
  if (tab === 'members') return 'members';
  if (tab === 'guidelines') return 'guidelines';
  return 'overview';
}

export function readMemberUsernameFromPath(): string | null {
  if (typeof window === 'undefined') return null;
  const cleaned = window.location.pathname.replace(/\/+$/, '');
  if (!cleaned.startsWith('/community/members/')) return null;
  try {
    const raw = decodeURIComponent(cleaned.slice('/community/members/'.length)).trim();
    return raw || null;
  } catch {
    return null;
  }
}

export function pushMemberProfileUrl(username: string | null): void {
  if (typeof window === 'undefined') return;
  const targetPath = username ? `/community/members/${encodeURIComponent(username)}` : '/community/members';
  if (window.location.pathname === targetPath) return;
  const safeQs = sanitizePublicNavigationQuery(
    new URLSearchParams(window.location.search.startsWith('?') ? window.location.search.slice(1) : window.location.search),
  ).toString();
  const targetUrl = `${targetPath}${safeQs ? `?${safeQs}` : ''}`;
  commitManagedHistoryTransition({
    domain: 'page_route',
    mode: 'push',
    targetUrl,
  });
}

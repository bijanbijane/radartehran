/** @file src/features/community/utils/communityHubNavHelpers.ts — Tab & Member URL helpers for CommunityHubPage */
import type { ContributionsSubTabId } from '../../../navigation/registry/route.types';
import type { CommunityHubTabId } from '../types/community.types';

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
  try {
    const targetPath = username ? `/community/members/${encodeURIComponent(username)}` : '/community/members';
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  } catch { /* ignore restricted history contexts */ }
}

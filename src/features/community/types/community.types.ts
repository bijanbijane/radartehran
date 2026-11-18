/** @file src/features/community/types/community.types.ts — RT-UI-COMMUNITY-001 Discussions, Q&A, Data Corrections & Moderation Contracts */
export * from './communityDomain.types';
import type {
  CommunityActivityTrack,
  CommunityTrustBadgeProfile,
  EntityLink,
  ReactionCounts,
  ReactionType,
  SocialContentContext,
} from './communityDomain.types';

export type DataCorrectionCategory =
  | 'metro_transit'
  | 'urban_facility'
  | 'price_anomaly'
  | 'map_boundary'
  | 'air_noise';

/** Canonical pipeline: draft -> submitted -> initial_validation -> under_review -> needs_evidence -> approved -> applied | rejected | withdrawn (§25.7) */
export type DataCorrectionModerationStatus =
  | 'draft'
  | 'submitted'
  | 'initial_validation'
  | 'under_review'
  | 'needs_evidence'
  | 'approved'
  | 'applied'
  | 'rejected'
  | 'withdrawn'
  | 'pending'
  | 'verified';

export interface EvidenceAttachment {
  id: string;
  fileName: string;
  kind: 'image' | 'pdf' | 'field_note';
  observedDateFa: string;
  summaryFa: string;
}

export interface DataCorrectionProposal {
  id: string;
  neighborhoodId: number;
  neighborhoodNameFa: string;
  category: DataCorrectionCategory;
  titleFa: string;
  currentValueFa?: string;
  evidenceSummaryFa: string;
  suggestedValueFa: string;
  observedDateFa?: string;
  evidenceAttachments?: EvidenceAttachment[];
  socialContext?: SocialContentContext;
  ownerUserId: string;
  authorProfile: CommunityTrustBadgeProfile;
  status: DataCorrectionModerationStatus;
  appliedDataVersionId?: string | null;
  moderatorNoteFa?: string;
  initialModeratorUid?: string;
  createdAtIso: string;
  createdAtFa: string;
  updatedAtIso?: string;
  createdBy?: string;
  updatedBy?: string;
  source?: 'seed' | 'user';
  schemaVersion?: number;
  revision?: number;
}

export interface DiscussionRevision {
  version: number;
  titleFa: string;
  bodyFa: string;
  editedAtFa: string;
  reasonFa: string;
}

export interface CommunityReplyItem {
  id: string;
  parentReplyId?: string | null;
  depth?: 1 | 2;
  ownerUserId?: string;
  authorProfile: CommunityTrustBadgeProfile;
  bodyFa: string;
  createdAtFa: string;
  reactionCounts?: ReactionCounts;
  reactionsByUser?: Record<string, ReactionType>;
  status?: 'visible' | 'hidden';
}

export type DiscussionModerationStatus = 'draft' | 'visible' | 'published' | 'locked' | 'archived' | 'under_review' | 'hidden';

export interface CommunityDiscussionPost {
  id: string;
  track: Extract<CommunityActivityTrack, 'social_discussion' | 'expert_qa'>;
  neighborhoodId: number;
  neighborhoodNameFa: string;
  topicId?: string;
  tags?: string[];
  entityLink?: EntityLink;
  socialContext?: SocialContentContext;
  pinned?: boolean;
  followerIds?: string[];
  revisionHistory?: DiscussionRevision[];
  titleFa: string;
  bodyFa: string;
  ownerUserId: string;
  authorProfile: CommunityTrustBadgeProfile;
  helpfulCount: number;
  helpfulVoterIds: string[];
  reactionCounts?: ReactionCounts;
  reactionsByUser?: Record<string, ReactionType>;
  replies: CommunityReplyItem[];
  replyCount?: number;
  status: DiscussionModerationStatus;
  createdAtIso: string;
  createdAtFa: string;
  updatedAtIso?: string;
  createdBy?: string;
  updatedBy?: string;
  source?: 'seed' | 'user';
  schemaVersion?: number;
  revision?: number;
}

/** Structured Q&A (§25.6) */
export type QuestionWorkflowStatus =
  | 'open'
  | 'answered'
  | 'resolved'
  | 'needs_clarification'
  | 'under_review'
  | 'closed'
  | 'archived';

export interface AnswerStatusMarkers {
  isAskerSelected: boolean;
  hasCredibleSource: boolean;
  isExpertReviewed: boolean;
  isOfficiallyVerified: boolean;
}

export interface CommunityAnswerItem {
  id: string;
  questionId: string;
  ownerUserId?: string;
  authorProfile: CommunityTrustBadgeProfile;
  bodyFa: string;
  sourceReferenceFa?: string;
  markers: AnswerStatusMarkers;
  reactionCounts: ReactionCounts;
  reactionsByUser: Record<string, ReactionType>;
  createdAtFa: string;
  status: 'visible' | 'hidden';
}

export interface CommunityQuestionItem {
  id: string;
  titleFa: string;
  bodyFa: string;
  neighborhoodId: number;
  neighborhoodNameFa: string;
  topicId: string;
  tags: string[];
  socialContext?: SocialContentContext;
  ownerUserId: string;
  authorProfile: CommunityTrustBadgeProfile;
  status: QuestionWorkflowStatus;
  answers: CommunityAnswerItem[];
  followerIds: string[];
  createdAtIso: string;
  createdAtFa: string;
  updatedAtIso?: string;
  createdBy?: string;
  updatedBy?: string;
  source?: 'seed' | 'user';
  schemaVersion?: number;
  revision?: number;
}

/** 10 Moderation Abuse Categories (§25.14) */
export type CommunityAbuseReason =
  | 'spam_promo'
  | 'harassment'
  | 'fake_price_shill'
  | 'pii_leak'
  | 'misinformation'
  | 'off_topic'
  | 'conflict_of_interest'
  | 'impersonation'
  | 'copyright_violation'
  | 'abuse_of_reporting';

export type ReportWorkflowStatus = 'submitted' | 'initial_triage' | 'investigating' | 'decision_made' | 'dismissed' | 'open' | 'reviewed';

export interface CommunityAbuseReport {
  id: string;
  targetType: 'discussion_post' | 'data_correction' | 'question' | 'answer' | 'reply';
  targetId: string;
  reason: CommunityAbuseReason;
  detailsFa: string;
  reporterUserId: string;
  status: ReportWorkflowStatus;
  moderatorActionNoteFa?: string;
  createdAtIso: string;
  updatedAtIso?: string;
  source?: 'seed' | 'user';
  schemaVersion?: number;
  revision?: number;
}

export interface ModerationActionRecord {
  id: string;
  targetType: CommunityAbuseReport['targetType'];
  targetId: string;
  actionType:
    | 'hide'
    | 'lock'
    | 'warn'
    | 'suspend_7d'
    | 'restore'
    | 'initial_validation'
    | 'under_review'
    | 'needs_evidence'
    | 'approve_data'
    | 'apply_data_version'
    | 'reject_data'
    | 'resolve_report'
    | 'dismiss_report';
  reasonFa: string;
  actorRole: string;
  actorUid?: string;
  createdAtIso: string;
  source?: 'seed' | 'user';
  schemaVersion?: number;
  revision?: number;
}

export interface ModerationAppeal {
  id: string;
  moderationActionId: string;
  targetId: string;
  appellantUserId: string;
  argumentFa: string;
  status: 'submitted' | 'under_review' | 'upheld' | 'overturned';
  reviewerNoteFa?: string;
  reviewerUid?: string;
  createdAtIso: string;
  updatedAtIso?: string;
  source?: 'seed' | 'user';
  schemaVersion?: number;
  revision?: number;
}

export interface ResearchTopicProposal {
  id: string;
  titleFa: string;
  questionFa: string;
  neighborhoodNameFa: string;
  socialContext?: SocialContentContext;
  ownerUserId?: string;
  authorProfile: CommunityTrustBadgeProfile;
  votesCount: number;
  voterIds: string[];
  linkedKnowledgeTab: 'reports' | 'methodology';
  status: 'open' | 'queued_for_research' | 'published';
  createdAtFa: string;
  createdAtIso?: string;
  updatedAtIso?: string;
  source?: 'seed' | 'user';
  schemaVersion?: number;
  revision?: number;
}

export const DATA_CORRECTION_CATEGORY_LABELS_FA: Record<DataCorrectionCategory, string> = {
  metro_transit: 'مترو و دسترسی حمل‌ونقل',
  urban_facility: 'امکانات و کاربری شهری',
  price_anomaly: 'نابهنجاری قیمت و فایل ساختگی',
  map_boundary: 'مرز محله و اطلاعات مکانی',
  air_noise: 'کیفیت هوا و آلودگی صوتی',
};

export const DATA_CORRECTION_STATUS_LABELS_FA: Record<DataCorrectionModerationStatus, string> = {
  draft: 'پیش‌نویس محلی',
  submitted: 'ثبت‌شده',
  initial_validation: 'اعتبارسنجی اولیه',
  under_review: 'در حال بررسی ناظر داده',
  needs_evidence: 'نیازمند مدرک تکمیلی',
  approved: 'تأییدشده (در انتظار اعمال در نسخه داده)',
  applied: 'اعمال‌شده در داده مرجع',
  rejected: 'ردشده با توضیح ممیزی',
  withdrawn: 'انصراف توسط ثبت‌کننده',
  pending: 'ثبت‌شده',
  verified: 'تأییدشده (در انتظار اعمال در نسخه داده)',
};

export const ABUSE_REASON_LABELS_FA: Record<CommunityAbuseReason, string> = {
  spam_promo: 'تبلیغات، رپورتاژ یا لینک اسپم',
  harassment: 'توهین، حمله شخصی یا نقض احترام جمعی',
  fake_price_shill: 'قیمت‌سازی هماهنگ یا آگهی طعمه',
  pii_leak: 'افشای شماره شخصی یا حریم خصوصی',
  misinformation: 'اطلاعات گمراه‌کننده یا خلاف واقع مستند',
  off_topic: 'خارج از موضوع تخصصی املاک و محله',
  conflict_of_interest: 'تضاد منافع یا تبلیغ پنهان آژانس/پروژه',
  impersonation: 'جعل هویت کارشناس یا مقام رسمی',
  copyright_violation: 'نقض حق نشر پژوهش یا تصویر',
  abuse_of_reporting: 'سوءاستفاده از گزارش تخلف علیه دیگران',
};

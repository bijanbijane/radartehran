/**
 * Stage 24 — Spec Constants, Domain Contracts & Query Keys for RT-FE-USER-ACCOUNT-024
 * Frontend User Account, Profile, Digital Identity & Personal Information Management Architecture
 */

export const RT_FE_USER_ACCOUNT_024_SPEC_ID = 'RT-FE-USER-ACCOUNT-024' as const;
export const RT_FE_STAGE25_BRIDGE_SPEC_ID = 'RT-FE-USER-ACCESS-CONTROL-025' as const;

export const RT_ACCOUNT_LAYERS_8 = [
  { layer: 1, nameEn: 'Identity Layer', roleFa: 'هویت پایه واحد، شناسه پایدار userId، صفات هویتی و وضعیت هویت' },
  { layer: 2, nameEn: 'Account Layer', roleFa: 'چرخه عمر ۱۰ وضعیتی حساب، ثبت‌نام و تنظیمات عمومی حساب' },
  { layer: 3, nameEn: 'Authentication Integration', roleFa: 'روش‌های ورود، مدیریت نشست‌ها، دستگاه‌های متصل و بازیابی امن' },
  { layer: 4, nameEn: 'Profile Layer', roleFa: 'جداسازی Basic Profile، Public Profile، Private Profile و پروفایل‌های حرفه‌ای' },
  { layer: 5, nameEn: 'Verification Layer', roleFa: 'تفکیک تأیید تماس، هویت حقیقی، سازمانی و صلاحیت/مدارک حرفه‌ای' },
  { layer: 6, nameEn: 'Privacy Layer', roleFa: 'سطح نمایش فیلدها، حریم پروفایل، اشتراک‌گذاری و پیوند با Consent' },
  { layer: 7, nameEn: 'Account Management Layer', roleFa: 'ویرایش نسخه‌دار پروفایل، تاریخچه تغییرات، غیرفعال‌سازی و حذف حساب' },
  { layer: 8, nameEn: 'Integration Layer', roleFa: 'اتصال با نقش‌ها، مجوزها، اعلان‌ها، علاقه‌مندی‌ها، آگهی‌ها و خدمات' },
] as const;

export const RT_ACCOUNT_CONCEPTS_6 = [
  { concept: 'Identity', roleFa: 'مشخص‌کردن اینکه کاربر چه حساب پایه و شناسه پایداری دارد' },
  { concept: 'Profile', roleFa: 'معرفی اطلاعات نمایشی و ویژگی‌های شخصی/حرفه‌ای بدون اعطای مجوز' },
  { concept: 'Role', roleFa: 'تعیین جایگاه یا مسئولیت در محصول یا سازمان' },
  { concept: 'Permission', roleFa: 'تعیین عملیات مجاز تحت کنترل Backend Authorization' },
  { concept: 'Verification', roleFa: 'وضعیت بررسی و اعتبار یک ادعا، تماس یا مدرک مشخص' },
  { concept: 'Session', roleFa: 'مدیریت نشست احراز هویت‌شده بدون افشای Token در UI' },
] as const;

export const RT_ACCOUNT_LIFECYCLE_STATUSES_10 = [
  'pending', 'active', 'restricted', 'suspended', 'deactivation_requested',
  'deactivated', 'deletion_requested', 'deletion_processing', 'deleted', 'merged',
] as const;

export type AccountStatus = (typeof RT_ACCOUNT_LIFECYCLE_STATUSES_10)[number];

export const RT_PROFILE_VISIBILITY_5 = [
  'public', 'registered_users', 'connections', 'private', 'restricted',
] as const;

export type ProfileVisibility = (typeof RT_PROFILE_VISIBILITY_5)[number];

export const RT_VERIFICATION_STATUSES_9 = [
  'not_submitted', 'submitted', 'pending_review', 'under_review',
  'verified', 'rejected', 'expired', 'revoked', 'needs_information',
] as const;

export type VerificationStatus = (typeof RT_VERIFICATION_STATUSES_9)[number];

export type ProfessionalProfileStatus =
  | 'draft' | 'pending_review' | 'verified' | 'rejected' | 'suspended' | 'archived';

export interface UserIdentity {
  userId: string;
  identityStatus: 'active' | 'pending' | 'restricted' | 'merged' | 'deleted';
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface BasicUserProfile {
  profileId: string;
  userId: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  biography?: string;
  avatarMediaId?: string;
  locale: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ProfessionalProfile {
  professionalProfileId: string;
  userId: string;
  professionType: string;
  displayName: string;
  introduction?: string;
  expertiseAreas: string[];
  serviceLocations: string[];
  experienceSummary?: string;
  status: ProfessionalProfileStatus;
  verificationLevel?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface UserSession {
  sessionId: string;
  deviceLabel?: string;
  browserLabel?: string;
  operatingSystem?: string;
  createdAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
  status: 'active' | 'revoked' | 'expired';
}

export interface AccountDeletionRequest {
  requestId: string;
  userId: string;
  status: 'requested' | 'identity_check' | 'scheduled' | 'processing' | 'completed' | 'cancelled' | 'rejected';
  requestedAt: string;
  scheduledAt?: string;
  completedAt?: string;
  cancellationAllowed: boolean;
}

export interface AccountApiResponse<T> {
  data: T;
  meta: {
    version?: number;
    updatedAt?: string;
    requestId: string;
  };
}

export const accountKeys = {
  root: ['account'] as const,
  overview: (userId: string) => [...accountKeys.root, userId, 'overview'] as const,
  profile: (userId: string) => [...accountKeys.root, userId, 'profile'] as const,
  privacy: (userId: string) => [...accountKeys.root, userId, 'privacy'] as const,
  sessions: (userId: string) => [...accountKeys.root, userId, 'sessions'] as const,
  verifications: (userId: string) => [...accountKeys.root, userId, 'verifications'] as const,
  professionalProfiles: (userId: string) => [...accountKeys.root, userId, 'professional-profiles'] as const,
};

export const RT_ACCOUNT_API_ENDPOINTS_29 = [
  'GET /api/account',
  'GET /api/account/identity',
  'GET /api/account/profile',
  'PUT /api/account/profile',
  'GET /api/account/public-profile',
  'PUT /api/account/public-profile',
  'GET /api/users/:publicUserId/profile',
  'GET /api/account/privacy',
  'PUT /api/account/privacy',
  'GET /api/account/preferences',
  'PUT /api/account/preferences',
  'GET /api/account/contact-methods',
  'POST /api/account/contact-methods',
  'DELETE /api/account/contact-methods/:id',
  'GET /api/account/sessions',
  'DELETE /api/account/sessions/:id',
  'POST /api/account/sessions/revoke-others',
  'GET /api/account/login-methods',
  'POST /api/account/login-methods',
  'DELETE /api/account/login-methods/:id',
  'GET /api/account/verifications',
  'POST /api/account/verifications',
  'GET /api/account/professional-profiles',
  'POST /api/account/professional-profiles',
  'PUT /api/account/professional-profiles/:id',
  'GET /api/account/history',
  'POST /api/account/deactivation',
  'POST /api/account/deletion',
  'GET /api/account/deletion/:requestId',
] as const;

export const RT_ACCOUNT_DELIVERABLES_40 = [
  { id: 'RT-FE-ACCOUNT-OUT-001', titleFa: 'سند معماری کلان حساب کاربری' },
  { id: 'RT-FE-ACCOUNT-OUT-002', titleFa: 'User Identity Model' },
  { id: 'RT-FE-ACCOUNT-OUT-003', titleFa: 'Account Lifecycle Model' },
  { id: 'RT-FE-ACCOUNT-OUT-004', titleFa: 'Account Overview Page' },
  { id: 'RT-FE-ACCOUNT-OUT-005', titleFa: 'Basic Profile Model' },
  { id: 'RT-FE-ACCOUNT-OUT-006', titleFa: 'Personal Profile Page' },
  { id: 'RT-FE-ACCOUNT-OUT-007', titleFa: 'Public Profile Architecture' },
  { id: 'RT-FE-ACCOUNT-OUT-008', titleFa: 'Private Profile Architecture' },
  { id: 'RT-FE-ACCOUNT-OUT-009', titleFa: 'Profile Visibility Model' },
  { id: 'RT-FE-ACCOUNT-OUT-010', titleFa: 'Profile Privacy Settings' },
  { id: 'RT-FE-ACCOUNT-OUT-011', titleFa: 'Avatar Management' },
  { id: 'RT-FE-ACCOUNT-OUT-012', titleFa: 'Contact Information Management' },
  { id: 'RT-FE-ACCOUNT-OUT-013', titleFa: 'Professional Profile Model' },
  { id: 'RT-FE-ACCOUNT-OUT-014', titleFa: 'Multi-Profile Architecture' },
  { id: 'RT-FE-ACCOUNT-OUT-015', titleFa: 'Organization Membership Integration' },
  { id: 'RT-FE-ACCOUNT-OUT-016', titleFa: 'Verification Domain Model' },
  { id: 'RT-FE-ACCOUNT-OUT-017', titleFa: 'Verification Status Interface' },
  { id: 'RT-FE-ACCOUNT-OUT-018', titleFa: 'Professional Verification Interface' },
  { id: 'RT-FE-ACCOUNT-OUT-019', titleFa: 'Trust Badge Architecture' },
  { id: 'RT-FE-ACCOUNT-OUT-020', titleFa: 'Account Preferences' },
  { id: 'RT-FE-ACCOUNT-OUT-021', titleFa: 'Account Security Center' },
  { id: 'RT-FE-ACCOUNT-OUT-022', titleFa: 'Session Management Interface' },
  { id: 'RT-FE-ACCOUNT-OUT-023', titleFa: 'Login Methods Management' },
  { id: 'RT-FE-ACCOUNT-OUT-024', titleFa: 'MFA Integration' },
  { id: 'RT-FE-ACCOUNT-OUT-025', titleFa: 'Account Recovery Interface' },
  { id: 'RT-FE-ACCOUNT-OUT-026', titleFa: 'Account History Timeline' },
  { id: 'RT-FE-ACCOUNT-OUT-027', titleFa: 'Account Deactivation Workflow' },
  { id: 'RT-FE-ACCOUNT-OUT-028', titleFa: 'Account Deletion Workflow' },
  { id: 'RT-FE-ACCOUNT-OUT-029', titleFa: 'User Context Integration' },
  { id: 'RT-FE-ACCOUNT-OUT-030', titleFa: 'Account API Contract' },
  { id: 'RT-FE-ACCOUNT-OUT-031', titleFa: 'Cloudflare Integration Architecture' },
  { id: 'RT-FE-ACCOUNT-OUT-032', titleFa: 'Security and Privacy Specification' },
  { id: 'RT-FE-ACCOUNT-OUT-033', titleFa: 'Responsive and Accessibility Specification' },
  { id: 'RT-FE-ACCOUNT-OUT-034', titleFa: 'Performance Specification' },
  { id: 'RT-FE-ACCOUNT-OUT-035', titleFa: 'Cache and Synchronization Strategy' },
  { id: 'RT-FE-ACCOUNT-OUT-036', titleFa: 'Test and Quality Assurance Plan' },
  { id: 'RT-FE-ACCOUNT-OUT-037', titleFa: 'Telemetry and KPI Specification' },
  { id: 'RT-FE-ACCOUNT-OUT-038', titleFa: 'Implementation Roadmap' },
  { id: 'RT-FE-ACCOUNT-OUT-039', titleFa: 'Data Migration and Compatibility Plan' },
  { id: 'RT-FE-ACCOUNT-OUT-040', titleFa: 'Final Acceptance Report' },
] as const;

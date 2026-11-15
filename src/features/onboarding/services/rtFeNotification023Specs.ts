/**
 * Stage 23 — Spec Constants, Conceptual Entities & API Contracts for RT-FE-NOTIFICATION-COMMUNICATION-023 (§23.1–§23.41)
 * Frontend Notification Center, Multi-Channel Communication & User Communication Preferences Architecture
 */

export const RT_FE_NOTIFICATION_023_SPEC_ID = 'RT-FE-NOTIFICATION-COMMUNICATION-023' as const;
export const RT_FE_STAGE24_MESSAGING_BRIDGE_SPEC_ID = 'RT-FE-MESSAGING-COMMUNICATION-024' as const;
export const RT_FE_STAGE24_ACCOUNT_BRIDGE_SPEC_ID = 'RT-FE-USER-ACCOUNT-024' as const;

export const RT_NOTIF_LAYERS_10 = [
  { layer: 1, nameEn: 'Notification Experience Layer', roleFa: 'آیکون Header، Quick Panel، مرکز کامل اعلان‌ها، تنظیمات ارتباطی و اطلاعیه‌ها' },
  { layer: 2, nameEn: 'Notification Presentation Layer', roleFa: 'تبدیل داده API به کارت پیام، گروه‌بندی، اولویت، زمان نسبی/دقیق و خطا' },
  { layer: 3, nameEn: 'Notification Application Layer', roleFa: 'مدیریت Use Caseها: دریافت، خواندن، آرشیو، حذف نمایشی، بازیابی و ثبت Push' },
  { layer: 4, nameEn: 'Notification State & Synchronization Layer', roleFa: 'Cache مدیریت‌شده، Optimistic Update قابل Rollback و همگام‌سازی چنددستگاهی' },
  { layer: 5, nameEn: 'Communication Preferences Layer', roleFa: 'تنظیمات ۴سطحی: حساب، دسته‌بندی، کانال ارتباطی، Quiet Hours و Consent' },
  { layer: 6, nameEn: 'Notification API Layer', roleFa: 'API Client، اعتبارسنجی قراردادها، AbortSignal و Pagination مبتنی بر Cursor' },
  { layer: 7, nameEn: 'Backend Notification Services', roleFa: 'ساخت اعلان، Eligibility، Template Rendering، اشتراک‌ها و نگهداری' },
  { layer: 8, nameEn: 'Asynchronous Processing Layer', roleFa: 'صف ارسال Email/Push/SMS، Retry کنترل‌شده و جلوگیری از تکرار' },
  { layer: 9, nameEn: 'Communication Providers', roleFa: 'آداپتورهای مستقل Email، Web Push و SMS بدون افشای جزئیات داخلی در UI' },
  { layer: 10, nameEn: 'Persistence & Observability', roleFa: 'نگهداری رکوردها، Delivery Logs، Audit و Telemetry بدون متن خصوصی پیام' },
] as const;

export const RT_NOTIF_ENTITIES_13 = [
  'Notification',
  'Notification Delivery',
  'Notification Category',
  'Notification Template',
  'Notification Preference',
  'Channel Subscription',
  'Device Subscription',
  'Notification Group',
  'Public Announcement',
  'Notification Action',
  'Notification Read State',
  'Delivery Attempt',
  'Notification Consent',
] as const;

export const RT_NOTIF_TYPES_10 = [
  'system',
  'personal',
  'security',
  'market',
  'property',
  'neighborhood',
  'research',
  'service',
  'workflow',
  'announcement',
] as const;
export type NotificationType = (typeof RT_NOTIF_TYPES_10)[number];

export const RT_NOTIF_PRIORITIES_4 = ['critical', 'high', 'normal', 'low'] as const;
export type NotificationPriority = (typeof RT_NOTIF_PRIORITIES_4)[number];

export const RT_NOTIF_STATUSES_4 = ['unread', 'read', 'archived', 'deleted'] as const;
export type NotificationStatus = (typeof RT_NOTIF_STATUSES_4)[number];

export const RT_NOTIF_ACTION_TYPES_6 = [
  'open_entity',
  'open_listing',
  'open_workflow',
  'open_announcement',
  'open_settings',
  'open_internal_page',
] as const;
export type NotificationActionType = (typeof RT_NOTIF_ACTION_TYPES_6)[number];

export const RT_NOTIF_CHANNELS_4 = ['in_app', 'email', 'web_push', 'sms'] as const;
export type NotificationChannel = (typeof RT_NOTIF_CHANNELS_4)[number];

export const RT_NOTIF_DELIVERY_STATUSES_9 = [
  'queued',
  'processing',
  'sent',
  'delivered',
  'failed',
  'retrying',
  'cancelled',
  'expired',
  'unknown',
] as const;
export type DeliveryStatus = (typeof RT_NOTIF_DELIVERY_STATUSES_9)[number];

export type EmailChannelStatus = 'not_configured' | 'pending_verification' | 'verified' | 'disabled' | 'bounced' | 'restricted';
export type PushPermissionStatus = 'unsupported' | 'default' | 'granted' | 'denied';
export type PushSubscriptionStatus = 'inactive' | 'pending' | 'active' | 'expired' | 'revoked' | 'failed';
export type ConsentStatus = 'granted' | 'withdrawn' | 'not_required' | 'pending';
export type PolicyDecision = 'allow' | 'defer' | 'suppress_optional' | 'deny';

export interface NotificationAction {
  id: string;
  label: string;
  type: NotificationActionType;
  target: { entityType?: string; entityId?: string; routeKey?: string; resourceId?: string };
  requiresAuthentication: boolean;
  requiresConfirmation?: boolean;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  type: NotificationType;
  category: string;
  priority: NotificationPriority;
  title: string;
  body: string;
  summary?: string;
  createdAt: string;
  expiresAt?: string;
  readAt?: string;
  archivedAt?: string;
  deletedAt?: string;
  source?: { feature: string; entityType?: string; entityId?: string; eventId?: string };
  action?: NotificationAction;
  group?: { groupId: string; groupCount: number };
  metadata?: Record<string, unknown>;
  schemaVersion: number;
}

export interface NotificationListQuery {
  cursor?: string;
  limit?: number;
  type?: NotificationType[];
  priority?: NotificationPriority[];
  status?: NotificationStatus[];
  category?: string[];
  search?: string;
  from?: string;
  to?: string;
  sort?: 'newest' | 'oldest';
}

export const RT_NOTIF_ENDPOINTS_13 = [
  'GET /api/notifications',
  'GET /api/notifications/unread-count',
  'GET /api/notifications/:id',
  'PATCH /api/notifications/:id/read',
  'PATCH /api/notifications/:id/archive',
  'PATCH /api/notifications/:id/restore',
  'DELETE /api/notifications/:id',
  'POST /api/notifications/mark-all-read',
  'GET /api/notification-preferences',
  'PUT /api/notification-preferences',
  'GET /api/notification-announcements',
  'POST /api/notification-subscriptions/push',
  'DELETE /api/notification-subscriptions/push/:id',
] as const;

export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => ['notifications', 'list'] as const,
  list: (query: NotificationListQuery) => ['notifications', 'list', query] as const,
  detail: (id: string) => ['notifications', 'detail', id] as const,
  unreadCount: () => ['notifications', 'unread-count'] as const,
  preferences: () => ['notifications', 'preferences'] as const,
  announcements: () => ['notifications', 'announcements'] as const,
};

export const RT_NOTIF_DELIVERABLES_36 = [
  { id: 'RT-FE-NOTIFICATION-OUT-001', titleFa: 'سند معماری کلان Notification' },
  { id: 'RT-FE-NOTIFICATION-OUT-002', titleFa: 'مدل دامنه اعلان‌ها' },
  { id: 'RT-FE-NOTIFICATION-OUT-003', titleFa: 'قرارداد Notification' },
  { id: 'RT-FE-NOTIFICATION-OUT-004', titleFa: 'قرارداد Notification Delivery' },
  { id: 'RT-FE-NOTIFICATION-OUT-005', titleFa: 'قرارداد Notification Action' },
  { id: 'RT-FE-NOTIFICATION-OUT-006', titleFa: 'طراحی Notification Center' },
  { id: 'RT-FE-NOTIFICATION-OUT-007', titleFa: 'طراحی Quick Notification Panel' },
  { id: 'RT-FE-NOTIFICATION-OUT-008', titleFa: 'طراحی Inbox' },
  { id: 'RT-FE-NOTIFICATION-OUT-009', titleFa: 'طراحی دسته‌بندی و فیلتر' },
  { id: 'RT-FE-NOTIFICATION-OUT-010', titleFa: 'طراحی Notification Grouping' },
  { id: 'RT-FE-NOTIFICATION-OUT-011', titleFa: 'طراحی Read State' },
  { id: 'RT-FE-NOTIFICATION-OUT-012', titleFa: 'طراحی Communication Preferences' },
  { id: 'RT-FE-NOTIFICATION-OUT-013', titleFa: 'طراحی Channel Management' },
  { id: 'RT-FE-NOTIFICATION-OUT-014', titleFa: 'طراحی Consent Management' },
  { id: 'RT-FE-NOTIFICATION-OUT-015', titleFa: 'طراحی Quiet Hours' },
  { id: 'RT-FE-NOTIFICATION-OUT-016', titleFa: 'طراحی Template Architecture' },
  { id: 'RT-FE-NOTIFICATION-OUT-017', titleFa: 'طراحی Priority Model' },
  { id: 'RT-FE-NOTIFICATION-OUT-018', titleFa: 'طراحی Public Announcement' },
  { id: 'RT-FE-NOTIFICATION-OUT-019', titleFa: 'طراحی Security Notification' },
  { id: 'RT-FE-NOTIFICATION-OUT-020', titleFa: 'طراحی Delivery Status' },
  { id: 'RT-FE-NOTIFICATION-OUT-021', titleFa: 'طراحی Retry و Failure Handling' },
  { id: 'RT-FE-NOTIFICATION-OUT-022', titleFa: 'طراحی Multi-device Synchronization' },
  { id: 'RT-FE-NOTIFICATION-OUT-023', titleFa: 'طراحی Notification API Contract' },
  { id: 'RT-FE-NOTIFICATION-OUT-024', titleFa: 'طراحی Cache و State Management' },
  { id: 'RT-FE-NOTIFICATION-OUT-025', titleFa: 'طراحی Push Integration' },
  { id: 'RT-FE-NOTIFICATION-OUT-026', titleFa: 'طراحی Cloudflare Integration' },
  { id: 'RT-FE-NOTIFICATION-OUT-027', titleFa: 'طراحی Security & Privacy' },
  { id: 'RT-FE-NOTIFICATION-OUT-028', titleFa: 'طراحی Accessibility و RTL' },
  { id: 'RT-FE-NOTIFICATION-OUT-029', titleFa: 'طراحی Responsive Experience' },
  { id: 'RT-FE-NOTIFICATION-OUT-030', titleFa: 'طراحی Performance Strategy' },
  { id: 'RT-FE-NOTIFICATION-OUT-031', titleFa: 'ساختار پوشه و Module Ownership' },
  { id: 'RT-FE-NOTIFICATION-OUT-032', titleFa: 'سناریوهای اجرایی' },
  { id: 'RT-FE-NOTIFICATION-OUT-033', titleFa: 'برنامه آزمون' },
  { id: 'RT-FE-NOTIFICATION-OUT-034', titleFa: 'داشبورد Telemetry' },
  { id: 'RT-FE-NOTIFICATION-OUT-035', titleFa: 'نقشه اجرای ۱۲ فاز' },
  { id: 'RT-FE-NOTIFICATION-OUT-036', titleFa: 'معیارهای پذیرش نهایی' },
] as const;

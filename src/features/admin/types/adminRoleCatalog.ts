import type { AdminRoleDefinition } from './admin.types';

export const ADMIN_ROLE_DEFINITIONS: readonly AdminRoleDefinition[] = [
  {
    role: 'super_admin',
    labelFa: 'مدیر ارشد حاکمیت (Super Admin)',
    scopeSummaryFa: 'دسترسی کامل به ممیزی، انتشار داده، پرچم قابلیت‌ها و عملیات حساس دومرحله‌ای',
    canMutateData: true,
    permissions: [
      'admin:view_overview',
      'admin:moderate_content',
      'admin:verify_providers',
      'admin:resolve_disputes',
      'admin:edit_market_data',
      'admin:manage_flags',
      'admin:run_dangerous_ops',
      'admin:view_audit_security',
    ],
  },
  {
    role: 'content_moderator',
    labelFa: 'ناظر محتوا و آگهی‌ها',
    scopeSummaryFa: 'بررسی آگهی‌های ثبت‌شده، گزارش‌های تخطی و اصلاح/رد با ثبت دلیل',
    canMutateData: true,
    permissions: ['admin:view_overview', 'admin:moderate_content'],
  },
  {
    role: 'service_verifier',
    labelFa: 'ممیز متخصصان و شکایات',
    scopeSummaryFa: 'احراز مدارک ۴-مسیره ارائه‌دهندگان خدمات و رسیدگی به شکایات خصوصی',
    canMutateData: true,
    permissions: ['admin:view_overview', 'admin:verify_providers', 'admin:resolve_disputes'],
  },
  {
    role: 'data_analyst',
    labelFa: 'تحلیلگر داده و مدل (فقط مشاهده و نرخ مرجع)',
    scopeSummaryFa: 'بررسی رجیستری مدل ارزش‌گذاری و نرخ‌های مرجع بدون دسترسی به عملیات مخرب',
    canMutateData: true,
    permissions: ['admin:view_overview', 'admin:edit_market_data'],
  },
  {
    role: 'security_auditor',
    labelFa: 'ممیز امنیت و لاگ (Read-Only)',
    scopeSummaryFa: 'مشاهده وضعیت کلی، ممیزی لاگ‌های حاکمیتی و کنترل دسترسی‌ها بدون حق تغییر داده',
    canMutateData: false,
    permissions: ['admin:view_overview', 'admin:view_audit_security'],
  },
];

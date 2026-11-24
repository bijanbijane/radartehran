import { AppShellLayoutKind } from '../application-shell';
import { AppRole, PermissionKey } from '../../platform/auth';

export interface RouteRegistration {
  id: string;
  path: string;
  canonicalRedirectPath?: string;
  titleFa: string;
  layout: AppShellLayoutKind;
  requiresAuth: boolean;
  guestOnly?: boolean;
  allowedRoles?: AppRole[];
  requiredPermissions?: PermissionKey[];
  lazyBoundary: boolean;
}

export const CENTRAL_ROUTE_REGISTRY: readonly RouteRegistration[] = [
  {
    id: 'radar-map',
    path: '/',
    titleFa: 'نقشه هوشمند و رادار قیمت مسکن تهران',
    layout: 'main',
    requiresAuth: false,
    lazyBoundary: false,
  },
  {
    id: 'auth-login',
    path: '/login',
    canonicalRedirectPath: '/account',
    titleFa: 'ورود به حساب کاربری رادار تهران',
    layout: 'public',
    requiresAuth: false,
    guestOnly: true,
    lazyBoundary: true,
  },
  {
    id: 'profile',
    path: '/profile',
    canonicalRedirectPath: '/account/profile',
    titleFa: 'پروفایل و پرتفوی شخصی',
    layout: 'authenticated',
    requiresAuth: true,
    lazyBoundary: true,
  },
  {
    id: 'saved-searches',
    path: '/saved-searches',
    canonicalRedirectPath: '/account/saved-searches',
    titleFa: 'جستجوهای ذخیره‌شده و هشدارها',
    layout: 'authenticated',
    requiresAuth: true,
    lazyBoundary: true,
  },
  {
    id: 'escrow-deals',
    path: '/escrow',
    canonicalRedirectPath: '/tools',
    titleFa: 'معاملات امن و حساب امانی',
    layout: 'authenticated',
    requiresAuth: true,
    requiredPermissions: ['escrow:initiate'],
    lazyBoundary: true,
  },
  {
    id: 'agency-workspace',
    path: '/agency/workspace',
    canonicalRedirectPath: '/services/agencies',
    titleFa: 'میزکار آژانس املاک و مشاوران',
    layout: 'authenticated',
    requiresAuth: true,
    allowedRoles: ['agency_agent', 'agency_admin', 'admin'],
    requiredPermissions: ['lead:manage'],
    lazyBoundary: true,
  },
  {
    id: 'service-workspace',
    path: '/service/orders',
    canonicalRedirectPath: '/services',
    titleFa: 'میزکار ارائه‌دهندگان خدمات ملکی',
    layout: 'authenticated',
    requiresAuth: true,
    allowedRoles: ['service_provider', 'admin'],
    requiredPermissions: ['service_order:fulfill'],
    lazyBoundary: true,
  },
  {
    id: 'admin-governance',
    path: '/admin/governance',
    canonicalRedirectPath: '/admin',
    titleFa: 'پنل حاکمیت و مدیریت رادار تهران',
    layout: 'admin',
    requiresAuth: true,
    allowedRoles: ['admin'],
    requiredPermissions: ['admin:governance'],
    lazyBoundary: true,
  },
] as const;

export function findRegisteredRoute(path: string): RouteRegistration | undefined {
  return CENTRAL_ROUTE_REGISTRY.find(
    (r) => r.path === path || (r.path !== '/' && path.startsWith(r.path))
  ) ?? CENTRAL_ROUTE_REGISTRY[0];
}

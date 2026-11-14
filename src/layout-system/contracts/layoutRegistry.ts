/** @file src/layout-system/contracts/layoutRegistry.ts — RT-UI-LAYOUT-001 Spatial & Layout Contract Registry (Pure TS, zero React) */
import type { RouteDestinationId } from '../../navigation/registry/route.types';

export type LayoutTemplateId =
  | 'RT-L01'
  | 'RT-L02'
  | 'RT-L03'
  | 'RT-L04'
  | 'RT-L05'
  | 'RT-L06'
  | 'RT-L07'
  | 'RT-L08'
  | 'RT-L09'
  | 'RT-L10'
  | 'RT-L11'
  | 'RT-L12';

export interface LayoutContract {
  id: LayoutTemplateId;
  viewId: RouteDestinationId;
  nameEn: string;
  nameFa: string;
  pattern: string;
  maxWidthClass: string;
  maxWidthPx: number | 'flexible';
  desktopColumns: 12 | 4 | 'split' | 'canvas';
  mobileColumns: 4 | 1;
  shell: 'public' | 'admin';
  headerBehavior: 'sticky' | 'compact' | 'isolated_admin';
  supportsSplitMapCompanion: boolean;
}

/** 4px spatial scale tokens defined in RT-UI-LAYOUT-001 §1.3 */
export const SPACING_SCALE_PX = {
  S1: 4,
  S2: 8,
  S3: 12,
  S4: 16,
  S5: 20,
  S6: 24,
  S8: 32,
  S10: 40,
  S12: 48,
  S16: 64,
} as const;

export const LAYOUT_REFERENCE_VIEWPORTS = [
  { id: 'desktop_lg', labelFa: 'دسکتاپ بزرگ', width: 1440, height: 900 },
  { id: 'laptop', labelFa: 'لپ‌تاپ', width: 1280, height: 800 },
  { id: 'tablet', labelFa: 'تبلت', width: 768, height: 1024 },
  { id: 'mobile_std', labelFa: 'موبایل استاندارد', width: 390, height: 844 },
  { id: 'mobile_sm', labelFa: 'موبایل کوچک', width: 360, height: 800 },
] as const;

export const STANDARD_LAYOUT_STATES = [
  'ST01_INITIAL',
  'ST02_LOADING',
  'ST03_EMPTY',
  'ST04_ERROR',
  'ST05_PARTIAL',
  'ST06_DISABLED',
  'ST07_SUCCESS',
  'ST08_STALE_DATA',
  'ST09_NO_PERMISSION',
  'ST10_OFFLINE',
] as const;

export const LAYOUT_CONTRACT_REGISTRY: readonly LayoutContract[] = [
  {
    id: 'RT-L01',
    viewId: 'home',
    nameEn: 'Home Layout',
    nameFa: 'چیدمان خانه هدایتگر',
    pattern: 'Multi-Section Navigator (max 1320px)',
    maxWidthClass: 'max-w-[1320px]',
    maxWidthPx: 1320,
    desktopColumns: 12,
    mobileColumns: 4,
    shell: 'public',
    headerBehavior: 'sticky',
    supportsSplitMapCompanion: true,
  },
  {
    id: 'RT-L02',
    viewId: 'map',
    nameEn: 'Map Explorer Layout',
    nameFa: 'بوم تمام‌صفحه نقشه',
    pattern: 'Full-width Canvas + Floating Tool Rail + Context Panel',
    maxWidthClass: 'max-w-full',
    maxWidthPx: 'flexible',
    desktopColumns: 'canvas',
    mobileColumns: 4,
    shell: 'public',
    headerBehavior: 'compact',
    supportsSplitMapCompanion: false,
  },
  {
    id: 'RT-L03',
    viewId: 'discover',
    nameEn: 'Directory & Neighborhoods Layout',
    nameFa: 'فهرست و کاشف محله‌ها',
    pattern: 'Directory Filters + Responsive Grid/List (max 1280px)',
    maxWidthClass: 'max-w-7xl',
    maxWidthPx: 1280,
    desktopColumns: 12,
    mobileColumns: 4,
    shell: 'public',
    headerBehavior: 'sticky',
    supportsSplitMapCompanion: true,
  },
  {
    id: 'RT-L05',
    viewId: 'intelligence',
    nameEn: 'Analytics Layout',
    nameFa: 'بازار و تحلیل داده‌محور',
    pattern: 'Full-width Analytics Hierarchy (max 1360px)',
    maxWidthClass: 'max-w-[1360px]',
    maxWidthPx: 1360,
    desktopColumns: 12,
    mobileColumns: 4,
    shell: 'public',
    headerBehavior: 'sticky',
    supportsSplitMapCompanion: true,
  },
  {
    id: 'RT-L06',
    viewId: 'properties',
    nameEn: 'Property Search & Detail Layout',
    nameFa: 'جست‌وجوی املاک (فهرست + نقشه)',
    pattern: 'List Right + Interactive Map Left / Detail Split',
    maxWidthClass: 'max-w-[1360px]',
    maxWidthPx: 'flexible',
    desktopColumns: 'split',
    mobileColumns: 4,
    shell: 'public',
    headerBehavior: 'sticky',
    supportsSplitMapCompanion: true,
  },
  {
    id: 'RT-L08',
    viewId: 'tools',
    nameEn: 'Valuation & Transaction Toolkit Layout',
    nameFa: 'ابزار ارزش‌گذاری و محاسبه‌گرها',
    pattern: 'Step-based Context & Calculators Grid (max 1280px)',
    maxWidthClass: 'max-w-7xl',
    maxWidthPx: 1280,
    desktopColumns: 12,
    mobileColumns: 4,
    shell: 'public',
    headerBehavior: 'sticky',
    supportsSplitMapCompanion: true,
  },
  {
    id: 'RT-L09',
    viewId: 'knowledge',
    nameEn: 'Editorial & Research Layout',
    nameFa: 'دانشنامه و گزارش‌های پژوهشی',
    pattern: 'Content (8 cols) + Table of Contents Sidebar (4 cols)',
    maxWidthClass: 'max-w-7xl',
    maxWidthPx: 1280,
    desktopColumns: 12,
    mobileColumns: 4,
    shell: 'public',
    headerBehavior: 'sticky',
    supportsSplitMapCompanion: true,
  },
  {
    id: 'RT-L10',
    viewId: 'userspace',
    nameEn: 'Account Workspace Layout',
    nameFa: 'حساب کاربری و علاقه‌مندی‌ها',
    pattern: 'Structured Personal Dashboard (max 1280px)',
    maxWidthClass: 'max-w-7xl',
    maxWidthPx: 1280,
    desktopColumns: 12,
    mobileColumns: 4,
    shell: 'public',
    headerBehavior: 'sticky',
    supportsSplitMapCompanion: true,
  },
  {
    id: 'RT-L11',
    viewId: 'admin',
    nameEn: 'Admin Shell Layout',
    nameFa: 'محیط مستقل مدیریت و عملیات',
    pattern: 'Independent Admin Topbar + Right Sidebar + Operational Content',
    maxWidthClass: 'max-w-[1440px]',
    maxWidthPx: 'flexible',
    desktopColumns: 'split',
    mobileColumns: 1,
    shell: 'admin',
    headerBehavior: 'isolated_admin',
    supportsSplitMapCompanion: false,
  },
];

export function resolveLayoutContractForView(viewId: RouteDestinationId): LayoutContract {
  return (
    LAYOUT_CONTRACT_REGISTRY.find((c) => c.viewId === viewId) ||
    LAYOUT_CONTRACT_REGISTRY.find((c) => c.id === 'RT-L03')!
  );
}

export function resolveViewContainerClass(viewId: RouteDestinationId): string {
  const contract = resolveLayoutContractForView(viewId);
  return `${contract.maxWidthClass} mx-auto px-4 sm:px-6 lg:px-8`;
}

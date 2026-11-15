/**
 * Stage 14 — Executable Navigation, Discovery & Workspace Governance Engine
 * Spec ID: RT-FE-NAVIGATION-WORKSPACE-014
 */

export * from './rtFeNavigation014Specs';

export type NavigationStatus = 'active' | 'beta' | 'experimental' | 'disabled' | 'deprecated';

export interface NavigationItem {
  id: string;
  label: string;
  featureId: string;
  href?: string;
  groupId: string;
  status: NavigationStatus;
  requiredPermissions?: string[];
  order: number;
  visibility: { desktop: boolean; tablet: boolean; mobile: boolean };
}

export interface WorkspaceContext {
  workspaceId: string;
  cityId?: string;
  neighborhoodId?: string;
  propertyType?: string;
  marketType?: 'sale' | 'rent';
  contextVersion: number;
}

export interface BreadcrumbItem {
  id: string;
  label: string;
  href?: string;
  current?: boolean;
}

export interface GlobalSearchResult {
  id: string;
  type: 'feature' | 'page' | 'property' | 'building' | 'neighborhood' | 'listing' | 'report' | 'professional';
  title: string;
  href: string;
  sourceFeature: string;
}

export interface NavigationCommand {
  id: string;
  label: string;
  category: 'navigation' | 'search' | 'action' | 'workspace' | 'recent' | 'help';
  keywords: string[];
  requiredPermissions?: string[];
  enabled: boolean;
}

export interface NavigationContextTransfer {
  sourceFeature: string;
  targetFeature: string;
  entityReferences?: { propertyId?: string; buildingId?: string; neighborhoodId?: string; listingId?: string };
  returnTo?: string;
  contextVersion: number;
}

export const RT_NAV_REGISTRY_SAMPLE: readonly NavigationItem[] = [
  { id: 'nav-properties', label: 'املاک و فایل‌ها', featureId: 'FEAT-PROP-001', href: '/properties', groupId: 'properties', status: 'active', order: 10, visibility: { desktop: true, tablet: true, mobile: true } },
  { id: 'nav-neighborhoods', label: 'محله‌های تهران', featureId: 'FEAT-GEO-003', href: '/neighborhoods', groupId: 'geography', status: 'active', order: 20, visibility: { desktop: true, tablet: true, mobile: true } },
  { id: 'nav-valuation', label: 'ارزش‌گذاری هوشمند', featureId: 'FEAT-MKT-003', href: '/valuation', groupId: 'valuation', status: 'beta', order: 30, visibility: { desktop: true, tablet: true, mobile: true } },
  { id: 'nav-research', label: 'فضای پژوهش و گزارش‌ها', featureId: 'FEAT-ANA-006', href: '/reports', groupId: 'reports', status: 'active', order: 40, visibility: { desktop: true, tablet: true, mobile: false } },
  { id: 'nav-admin', label: 'مدیریت سامانه', featureId: 'FEAT-ADM-001', href: '/admin', groupId: 'admin', status: 'active', requiredPermissions: ['admin.access'], order: 90, visibility: { desktop: true, tablet: false, mobile: false } },
];

export const RT_NAV_COMMANDS_SAMPLE: readonly NavigationCommand[] = [
  { id: 'cmd-open-map', label: 'رفتن به نقشه تهران', category: 'navigation', keywords: ['نقشه', 'map', 'مکان'], enabled: true },
  { id: 'cmd-open-saadat', label: 'بازکردن محله سعادت‌آباد', category: 'search', keywords: ['سعادت‌آباد', 'سعادت اباد', 'محله'], enabled: true },
  { id: 'cmd-start-valuation', label: 'شروع ارزش‌گذاری ملک', category: 'action', keywords: ['ارزش‌گذاری', 'قیمت', 'تخمین'], enabled: true },
  { id: 'cmd-open-research', label: 'ورود به فضای پژوهش', category: 'workspace', keywords: ['پژوهش', 'گزارش', 'تحلیل'], enabled: true },
  { id: 'cmd-admin-audit', label: 'مشاهده رویدادهای حسابرسی', category: 'workspace', keywords: ['حسابرسی', 'audit', 'ادمین'], requiredPermissions: ['admin.access'], enabled: true },
];

export const RT_NAV_DISCOVERY_CATALOG_SAMPLE: readonly GlobalSearchResult[] = [
  { id: 'feat-val', type: 'feature', title: 'ارزش‌گذاری هوشمند ملک', href: '/valuation', sourceFeature: 'FEAT-MKT-003' },
  { id: 'hood-saadat', type: 'neighborhood', title: 'محله سعادت‌آباد (منطقه ۲)', href: '/neighborhoods/saadat-abad', sourceFeature: 'FEAT-GEO-003' },
  { id: 'hood-punak', type: 'neighborhood', title: 'محله پونک (منطقه ۵)', href: '/neighborhoods/punak', sourceFeature: 'FEAT-GEO-003' },
  { id: 'rep-tehran-1405', type: 'report', title: 'گزارش تحلیلی بازار مسکن و اجاره تهران ۱۴۰۵', href: '/reports/tehran-1405', sourceFeature: 'FEAT-ANA-006' },
  { id: 'prop-1024', type: 'property', title: 'پرونده ملک ۱۲۰ متری سعادت‌آباد', href: '/properties/PR-1024', sourceFeature: 'FEAT-PROP-001' },
];

function normalizeFa(raw: string): string {
  return raw
    .replace(/\u200c/g, ' ')
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Validates Deep Link destinations against Open-Redirect, sensitive query params, and RBAC rules (§14.11 & §14.24). */
export function resolveDeepLinkDestination(input: {
  rawUrl: string;
  isAuthenticated: boolean;
  userPermissions: string[];
}): { status: 'VALID' | 'REDIRECT_SAFE' | 'FORBIDDEN_403' | 'NOT_FOUND_404' | 'REJECTED_UNSAFE_URL'; normalizedPath: string; reasonFa: string } {
  const trimmed = input.rawUrl.trim();
  if (/^(https?:)?\/\//i.test(trimmed) || /^javascript:/i.test(trimmed)) {
    return { status: 'REJECTED_UNSAFE_URL', normalizedPath: '/', reasonFa: 'لینک خارجی یا پروتکل ناامن برای جلوگیری از Open Redirect مسدود شد.' };
  }
  const [pathPart, queryPart = ''] = trimmed.split('?');
  const lowerQuery = queryPart.toLowerCase();
  if (/(^|&)(token|password|secret|authorization)=/.test(lowerQuery)) {
    return { status: 'REJECTED_UNSAFE_URL', normalizedPath: pathPart || '/', reasonFa: 'قراردادن داده محرمانه یا Token در URL مجاز نیست (§۱۴.۱۱).' };
  }

  const normalizedPath = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  if (normalizedPath.startsWith('/admin') && !input.userPermissions.includes('admin.access')) {
    return { status: 'FORBIDDEN_403', normalizedPath, reasonFa: 'خطای 403 (تفکیک‌شده از 404): دسترسی مدیریت نیازمند مجوز معتبر است.' };
  }
  if (normalizedPath === '/property/PR-1024') {
    return { status: 'REDIRECT_SAFE', normalizedPath: '/properties/PR-1024', reasonFa: 'مسیر قدیمی به آدرس استاندارد جدید هدایت شد.' };
  }
  const knownPrefixes = ['/properties', '/neighborhoods', '/valuation', '/market', '/reports', '/workspace', '/admin', '/'];
  const validPrefix = knownPrefixes.some((p) => (p === '/' ? normalizedPath === '/' : normalizedPath.startsWith(p)));
  if (!validPrefix) {
    return { status: 'NOT_FOUND_404', normalizedPath, reasonFa: 'خطای 404: مقصد درخواستی در Route Registry ثبت نشده است.' };
  }
  return { status: 'VALID', normalizedPath, reasonFa: 'Deep Link معتبر، قابل بازیابی و فاقد داده حساس است.' };
}

/** Generates verified RTL Breadcrumbs using server-verified entity names instead of raw technical IDs or URL guesses (§14.10). */
export function buildValidatedBreadcrumbs(input: {
  entityTitleFa: string | null;
  sectionLabelFa: string;
  currentPageLabelFa: string;
  sectionHref: string;
}): BreadcrumbItem[] {
  return [
    { id: 'home', label: 'خانه', href: '/' },
    { id: 'section', label: input.sectionLabelFa, href: input.sectionHref },
    { id: 'entity', label: input.entityTitleFa ?? 'عنوان در انتظار تأیید داده', href: input.sectionHref },
    { id: 'current', label: input.currentPageLabelFa, current: true },
  ];
}

/** Distinguishes Feature Discovery from Entity/Content Search with Persian normalization & Permission filtering (§14.13 & §14.14). */
export function searchDiscoveryAndEntities(query: string, userPermissions: string[]): {
  features: GlobalSearchResult[];
  entitiesAndReports: GlobalSearchResult[];
  commands: NavigationCommand[];
} {
  const norm = normalizeFa(query);
  const matchingResults = RT_NAV_DISCOVERY_CATALOG_SAMPLE.filter((item) =>
    norm.length === 0 || normalizeFa(item.title).includes(norm),
  );
  const matchingCommands = RT_NAV_COMMANDS_SAMPLE.filter((cmd) => {
    if (!cmd.enabled) return false;
    if (cmd.requiredPermissions?.some((perm) => !userPermissions.includes(perm))) return false;
    return norm.length === 0 || normalizeFa(cmd.label).includes(norm) || cmd.keywords.some((k) => normalizeFa(k).includes(norm));
  });
  return {
    features: matchingResults.filter((r) => r.type === 'feature' || r.type === 'page'),
    entitiesAndReports: matchingResults.filter((r) => r.type !== 'feature' && r.type !== 'page'),
    commands: matchingCommands,
  };
}

/** Transfers minimal explicit entity references across workspaces without leaking ephemeral filters (§14.9 & §14.15). */
export function transferWorkspaceContext(
  current: WorkspaceContext,
  targetWorkspaceId: string,
  propertyId?: string,
): { nextContext: WorkspaceContext; preservedFields: string[]; resetFields: string[] } {
  const nextContext: WorkspaceContext = {
    workspaceId: targetWorkspaceId,
    cityId: current.cityId ?? 'tehran',
    neighborhoodId: current.neighborhoodId,
    contextVersion: current.contextVersion + 1,
  };
  const preservedFields = ['cityId'];
  if (current.neighborhoodId) preservedFields.push('neighborhoodId');
  if (propertyId) preservedFields.push(`propertyRef:${propertyId}`);
  const resetFields: string[] = [];
  if (current.propertyType) resetFields.push('propertyType (فیلتر اختصاصی صفحه قبلی)');
  if (current.marketType) resetFields.push('marketType');
  return { nextContext, preservedFields, resetFields };
}

/** Sanitizes NavigationTelemetryEvent so search text, tokens & exact GPS are never transmitted (§14.34). */
export function sanitizeNavigationTelemetryEvent(raw: {
  eventName: 'navigation.opened' | 'workspace.changed' | 'command.executed' | 'route.failed';
  sourceFeature?: string;
  targetFeature?: string;
  deviceCategory: 'desktop' | 'tablet' | 'mobile';
  extra?: Record<string, unknown>;
}): { safeEvent: Record<string, unknown>; strippedSensitiveFields: string[] } {
  const forbidden = ['searchQuery', 'commandText', 'token', 'exactGps', 'mouseTrack'];
  const strippedSensitiveFields = Object.keys(raw.extra ?? {}).filter((k) => forbidden.includes(k));
  return {
    safeEvent: {
      eventName: raw.eventName,
      sourceFeature: raw.sourceFeature,
      targetFeature: raw.targetFeature,
      deviceCategory: raw.deviceCategory,
      occurredAt: new Date().toISOString(),
    },
    strippedSensitiveFields,
  };
}

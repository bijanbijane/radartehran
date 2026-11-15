/**
 * @file src/features/onboarding/services/rtFeIa002RoutingAndUrlEngine.ts
 * @description RT-FE-IA-002 (Part 2 of 28) — Central Route Matcher, Guard Pipeline, URL State & Lifecycle Engine.
 */
import { formatMillionTomanAsIntlCurrency } from '../../../utils/areaUnit';
import {
  RT_FE_IA_CENTRAL_ROUTE_REGISTRY,
  RT_FE_IA_DELIVERABLES_15,
  RT_FE_IA_PRINCIPLES_10,
  RT_FE_IA_ROUTE_REQUIREMENTS_15,
  type AccessLevel,
  type IaRouteDefinition,
  type LayoutType,
} from './rtFeIa002InformationArchitectureTypes';

export const RT_FE_IA_ROUTING_FX_SAMPLE = formatMillionTomanAsIntlCurrency(15000, 'USD', 'en');

export const RT_FE_IA_LEGACY_REDIRECT_RULES = [
  { legacyPattern: '/property/:propertyId', targetPattern: '/properties/:propertyId', rationaleFa: 'یکسان‌سازی نام جمع در مسیرهای موجودیت ملک' },
  { legacyPattern: '/neighborhood/:neighborhoodId', targetPattern: '/neighborhoods/:neighborhoodId', rationaleFa: 'هدایت مسیر مفرد محله به ساختار استاندارد /neighborhoods' },
  { legacyPattern: '/building/:buildingId', targetPattern: '/buildings/:buildingId', rationaleFa: 'هدایت مسیر قدیمی ساختمان به /buildings/:buildingId' },
  { legacyPattern: '/account/saved-properties', targetPattern: '/account/saved/properties', rationaleFa: 'سازگاری با ساختار سلسله‌مراتبی فضای حساب کاربری' },
] as const;

export function resolveLegacyRedirect(pathname: string): { redirected: boolean; targetPath: string; ruleMatched?: string } {
  const clean = String(pathname || '/').split('?')[0].replace(/\/+$/, '') || '/';
  const propMatch = clean.match(/^\/property\/([^/]+)$/);
  if (propMatch) return { redirected: true, targetPath: `/properties/${propMatch[1]}`, ruleMatched: '/property/:propertyId' };
  const hoodMatch = clean.match(/^\/neighborhood\/([^/]+)$/);
  if (hoodMatch) return { redirected: true, targetPath: `/neighborhoods/${hoodMatch[1]}`, ruleMatched: '/neighborhood/:neighborhoodId' };
  const bldMatch = clean.match(/^\/building\/([^/]+)$/);
  if (bldMatch) return { redirected: true, targetPath: `/buildings/${bldMatch[1]}`, ruleMatched: '/building/:buildingId' };
  if (clean === '/account/saved-properties') return { redirected: true, targetPath: '/account/saved/properties', ruleMatched: '/account/saved-properties' };
  return { redirected: false, targetPath: clean };
}

export function matchIaRoutePath(pathname: string): {
  matchedRoute: IaRouteDefinition | null;
  pathParams: Record<string, string>;
  redirectTarget?: string;
} {
  const redir = resolveLegacyRedirect(pathname);
  const effectivePath = redir.targetPath;

  for (const route of RT_FE_IA_CENTRAL_ROUTE_REGISTRY) {
    const routeSegments = route.path.split('/').filter(Boolean);
    const actualSegments = effectivePath.split('/').filter(Boolean);
    if (routeSegments.length !== actualSegments.length) continue;

    const params: Record<string, string> = {};
    let isMatch = true;
    for (let i = 0; i < routeSegments.length; i++) {
      const rSeg = routeSegments[i];
      const aSeg = actualSegments[i];
      if (rSeg.startsWith(':')) {
        params[rSeg.slice(1)] = decodeURIComponent(aSeg);
      } else if (rSeg !== aSeg) {
        isMatch = false;
        break;
      }
    }
    if (isMatch) {
      return { matchedRoute: route, pathParams: params, redirectTarget: redir.redirected ? redir.targetPath : undefined };
    }
  }
  return { matchedRoute: null, pathParams: {} };
}

export interface RouteAccessEvaluationInput {
  requestedPath: string;
  isAuthenticated: boolean;
  userRole: AccessLevel;
  entityExists?: boolean;
  networkError?: boolean;
}

export interface RouteAccessEvaluationResult {
  resolution: 'ALLOW' | 'LEGACY_REDIRECT' | 'REDIRECT_TO_LOGIN' | 'ACCESS_DENIED_403' | 'NOT_FOUND_404' | 'NETWORK_ERROR_RETRY';
  httpEquivalentStatus: 200 | 301 | 302 | 403 | 404 | 503;
  effectivePath: string;
  redirectTo?: string;
  selectedLayout: LayoutType;
  breadcrumbsFa: string[];
  reasonFa: string;
}

const ROLE_RANK: Record<AccessLevel, number> = {
  public: 0,
  guest: 0,
  authenticated: 1,
  verified_user: 2,
  professional: 3,
  permission: 3,
  moderator: 4,
  admin: 5,
  super_admin: 6,
};

export function evaluateIaRouteAccessAndLifecycle(input: RouteAccessEvaluationInput): RouteAccessEvaluationResult {
  const redir = resolveLegacyRedirect(input.requestedPath);
  if (redir.redirected) {
    return {
      resolution: 'LEGACY_REDIRECT',
      httpEquivalentStatus: 301,
      effectivePath: redir.targetPath,
      redirectTo: redir.targetPath,
      selectedLayout: 'PublicLayout',
      breadcrumbsFa: ['خانه', 'تغییر مسیر استاندارد'],
      reasonFa: `مسیر قدیمی به مسیر استاندارد «${redir.targetPath}» هدایت شد.`,
    };
  }

  const matched = matchIaRoutePath(input.requestedPath);
  if (!matched.matchedRoute) {
    return {
      resolution: 'NOT_FOUND_404',
      httpEquivalentStatus: 404,
      effectivePath: '/404',
      selectedLayout: 'SystemLayout',
      breadcrumbsFa: ['خانه', '۴۰۴ - مسیر ناموجود'],
      reasonFa: 'مسیر درخواستی در دفتر ثبت مرکزی مسیرها وجود ندارد.',
    };
  }

  const route = matched.matchedRoute;
  if (route.access !== 'public') {
    if (!input.isAuthenticated) {
      const encoded = encodeURIComponent(input.requestedPath);
      return {
        resolution: 'REDIRECT_TO_LOGIN',
        httpEquivalentStatus: 302,
        effectivePath: '/auth/login',
        redirectTo: `/auth/login?redirect=${encoded}`,
        selectedLayout: 'SystemLayout',
        breadcrumbsFa: ['خانه', 'ورود به حساب'],
        reasonFa: 'کاربر وارد حساب نشده است؛ انتقال به صفحه ورود با حفظ مسیر بازگشت.',
      };
    }
    if (ROLE_RANK[input.userRole] < ROLE_RANK[route.access]) {
      return {
        resolution: 'ACCESS_DENIED_403',
        httpEquivalentStatus: 403,
        effectivePath: '/403',
        selectedLayout: 'SystemLayout',
        breadcrumbsFa: ['خانه', '۴۰۳ - عدم مجوز دسترسی'],
        reasonFa: `نقش فعلی (${input.userRole}) مجوز کافی برای سطح دسترسی (${route.access}) این مسیر را ندارد.`,
      };
    }
  }

  if (input.networkError) {
    return {
      resolution: 'NETWORK_ERROR_RETRY',
      httpEquivalentStatus: 503,
      effectivePath: '/network-error',
      selectedLayout: 'SystemLayout',
      breadcrumbsFa: ['خانه', 'خطای ارتباط شبکه'],
      reasonFa: 'ارتباط شبکه برقرار نشد؛ نمایش وضعیت تلاش مجدد متمایز از ۴۰۴.',
    };
  }

  if (Object.keys(matched.pathParams).length > 0 && input.entityExists === false) {
    return {
      resolution: 'NOT_FOUND_404',
      httpEquivalentStatus: 404,
      effectivePath: '/404',
      selectedLayout: 'SystemLayout',
      breadcrumbsFa: ['خانه', route.title, 'موجودیت یافت نشد'],
      reasonFa: 'شناسه موجودیت در سرور یافت نشد (تفکیک از خطای شبکه و ۴۰۳).',
    };
  }

  return {
    resolution: 'ALLOW',
    httpEquivalentStatus: 200,
    effectivePath: route.path,
    selectedLayout: route.layout,
    breadcrumbsFa: ['خانه', route.title],
    reasonFa: `دسترسی مجاز به «${route.title}» در قالب «${route.layout}».`,
  };
}

export function sanitizeAndParseShareableUrlQuery(rawQuery: string): {
  canonicalQueryString: string;
  query: { priceMin: number; priceMax: number; page: number; sort: string };
  sanitizationWarningsFa: string[];
} {
  const params = new URLSearchParams(rawQuery.startsWith('?') ? rawQuery.slice(1) : rawQuery);
  const warnings: string[] = [];
  let pMin = Math.max(0, Number(params.get('priceMin') || 0));
  let pMax = Math.max(0, Number(params.get('priceMax') || 0));
  if (pMin > 0 && pMax > 0 && pMin > pMax) {
    const tmp = pMin;
    pMin = pMax;
    pMax = tmp;
    warnings.push('بازه حداقل و حداکثر قیمت جابه‌جا شده بود و به‌صورت خودکار اصلاح شد.');
  }
  let page = Math.floor(Number(params.get('page') || 1));
  if (!Number.isFinite(page) || page < 1) {
    page = 1;
    warnings.push('شماره صفحه نامعتبر به ۱ بازنشانی شد.');
  }
  const rawSort = params.get('sort') || 'newest';
  const validSorts = new Set(['newest', 'price_asc', 'price_desc', 'area_desc']);
  const sort = validSorts.has(rawSort) ? rawSort : 'newest';
  if (sort !== rawSort) warnings.push(`مرتب‌سازی نامعتبر (${rawSort}) به پیش‌فرض (newest) تغییر یافت.`);

  const out = new URLSearchParams();
  if (pMin > 0) out.set('priceMin', String(pMin));
  if (pMax > 0) out.set('priceMax', String(pMax));
  out.set('page', String(page));
  out.set('sort', sort);

  return { canonicalQueryString: out.toString(), query: { priceMin: pMin, priceMax: pMax, page, sort }, sanitizationWarningsFa: warnings };
}

export function validateUrlNamingStandard(candidatePath: string): { valid: boolean; violationsFa: string[] } {
  const violations: string[] = [];
  if (!candidatePath.startsWith('/')) violations.push('مسیر باید با / آغاز شود.');
  const staticPart = candidatePath.replace(/\/:[a-zA-Z0-9_]+/g, '').replace(/\/PR-\d+/g, '');
  if (/[A-Z]/.test(staticPart)) violations.push('حروف بزرگ در بخش ثابت مسیر مجاز نیست (فقط kebab-case).');
  return { valid: violations.length === 0, violationsFa: violations };
}

export type IaLifecycleState = 'Idle' | 'Validating' | 'Loading' | 'Ready' | 'Empty' | 'Error' | 'Updating';
export function transitionRouteLifecycleState(current: IaLifecycleState, event: 'USER_FILTER_OR_ACTION' | 'RESOLVE_OK'): IaLifecycleState {
  if (current === 'Ready' && event === 'USER_FILTER_OR_ACTION') return 'Updating';
  if (event === 'RESOLVE_OK') return 'Ready';
  return current;
}

export function evaluateRtFeIa002Stage3Gate(): { readyForStage3: boolean; totalRegisteredRoutes: number } {
  return {
    readyForStage3:
      RT_FE_IA_PRINCIPLES_10.length === 10 &&
      RT_FE_IA_CENTRAL_ROUTE_REGISTRY.length >= 50 &&
      RT_FE_IA_ROUTE_REQUIREMENTS_15.length === 15 &&
      RT_FE_IA_DELIVERABLES_15.length === 15,
    totalRegisteredRoutes: RT_FE_IA_CENTRAL_ROUTE_REGISTRY.length,
  };
}

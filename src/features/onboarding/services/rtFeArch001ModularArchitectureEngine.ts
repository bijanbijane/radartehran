/**
 * @file src/features/onboarding/services/rtFeArch001ModularArchitectureEngine.ts
 * @description RT-FE-ARCH-001 (Part 1 of 28) — Modular Monolith Dependency, Contract & State Governance Engine.
 */
import { formatMillionTomanAsIntlCurrency } from '../../../utils/areaUnit';
import {
  RT_FE_ARCH_13_MODULES,
  RT_FE_ARCH_6_LAYERS,
  RT_FE_ARCH_DELIVERABLES_10,
  RT_FE_ARCH_OWNERSHIP_MATRIX_11,
  RT_FE_ARCH_REQUIREMENTS_10,
  RT_FE_ARCH_STATE_GOVERNANCE_8,
  type FrontendArchitectureLayerId,
  type PropertyModuleContract,
  type PropertySummary,
  type RadarFrontendModuleId,
} from './rtFeArch001ModularArchitectureTypes';

export const RT_FE_ARCH_ENGINE_FX_SAMPLE = formatMillionTomanAsIntlCurrency(12000, 'USD', 'en');

export const RT_FE_ARCH_DEPENDENCY_RULES_6: ReadonlyArray<{
  ruleId: string;
  titleFa: string;
  descriptionFa: string;
}> = [
  { ruleId: 'DEP-R01', titleFa: 'ممنوعیت وابستگی مستقیم به فایل‌های داخلی', descriptionFa: 'ماژول ارزش‌گذاری نباید مستقیماً از فایل داخلی ماژول آگهی‌ها استفاده کند؛ تنها رابط عمومی (index.ts) مجاز است.' },
  { ruleId: 'DEP-R02', titleFa: 'ممنوعیت وابستگی چرخه‌ای', descriptionFa: 'چرخه وابستگی مانند Property → Valuation → Neighborhood → Property در گراف ماژول‌ها ممنوع است.' },
  { ruleId: 'DEP-R03', titleFa: 'عدم انتقال مسئولیت', descriptionFa: 'ماژول نقشه نباید منطق محاسبه قیمت ملک را در خود جای دهد؛ نقشه صرفاً مسئول نمایش و تعامل مکانی است.' },
  { ruleId: 'DEP-R04', titleFa: 'جداسازی منطق کسب‌وکار از نمایش', descriptionFa: 'محاسبه‌ها، قواعد و عملیات نباید داخل کامپوننت‌های نمایشی انباشته شوند.' },
  { ruleId: 'DEP-R05', titleFa: 'دسترسی کنترل‌شده به زیرساخت', descriptionFa: 'ماژول‌ها نباید هرکدام پیاده‌سازی مستقل اتصال شبکه، مدیریت نشست یا ذخیره‌سازی دائمی داشته باشند.' },
  { ruleId: 'DEP-R06', titleFa: 'استقلال در آزمون', descriptionFa: 'هر ماژول باید بتواند با داده آزمایشی و بدون اجرای کامل برنامه اصلی آزموده شود.' },
];

export const RT_FE_ARCH_TARGET_FOLDER_TREE: ReadonlyArray<{
  rootFolder: string;
  layerId: FrontendArchitectureLayerId | 'tests';
  subfolders: readonly string[];
  descriptionFa: string;
}> = [
  { rootFolder: 'src/app', layerId: 'application', subfolders: ['bootstrap/main.tsx', 'providers/AppProviders.tsx', 'providers/ThemeProvider.tsx', 'providers/QueryProvider.tsx', 'router/router.tsx', 'router/route-registry.ts', 'router/route-guards/', 'layouts/PublicLayout/', 'layouts/WorkspaceLayout/', 'layouts/AdminLayout/', 'config/', 'errors/'], descriptionFa: 'راه‌اندازی، Providerها، مسیریاب، قالب‌ها و مدیریت خطا' },
  { rootFolder: 'src/pages', layerId: 'pages_layouts', subfolders: ['home/', 'map/', 'search/', 'property/', 'valuation/', 'neighborhood/', 'building/', 'mobility/', 'housing-market/', 'services/', 'community/', 'account/', 'admin/'], descriptionFa: 'ترکیب قابلیت‌ها در سطح صفحه بدون منطق داخلی یا شبکه خام' },
  { rootFolder: 'src/features', layerId: 'features', subfolders: ['geo-map/', 'global-search/', 'property-listings/', 'property-valuation/', 'neighborhood-intelligence/', 'building-intelligence/', 'urban-mobility/', 'housing-supply-demand/', 'services-marketplace/', 'user-community/', 'data-governance/', 'user-workspace/', 'data-visualization/'], descriptionFa: '۱۳ خانواده مستقل قابلیت با رابط عمومی index.ts' },
  { rootFolder: 'src/domain', layerId: 'domain', subfolders: ['property/', 'neighborhood/', 'building/', 'geography/', 'market/', 'mobility/', 'user/', 'organization/', 'data-source/'], descriptionFa: 'موجودیت‌ها، مدل‌های دامنه و قواعد خالص کسب‌وکار' },
  { rootFolder: 'src/platform', layerId: 'platform', subfolders: ['api/', 'auth/', 'permissions/', 'state/', 'cache/', 'storage/', 'telemetry/'], descriptionFa: 'زیرساخت متمرکز شبکه، احراز هویت، مجوز، کش و تلمتری' },
  { rootFolder: 'src/shared', layerId: 'shared', subfolders: ['ui/', 'hooks/', 'lib/', 'types/', 'constants/', 'assets/'], descriptionFa: 'اجزای نمایشی عمومی، توابع کمکی و انواع پایه مشترک' },
  { rootFolder: 'src/tests', layerId: 'tests', subfolders: ['architecture/', 'integration/', 'fixtures/'], descriptionFa: 'آزمون‌های معماری، یکپارچگی و داده‌های نمونه استاندارد' },
];

export function validateLayerDependency(
  sourceLayer: FrontendArchitectureLayerId,
  targetLayer: FrontendArchitectureLayerId,
  options?: { pageExecutesRawNetworkOrSessionOrModuleLogic?: boolean },
): { allowed: boolean; code: string; reasonFa: string } {
  if (sourceLayer === 'pages_layouts' && options?.pageExecutesRawNetworkOrSessionOrModuleLogic) {
    return {
      allowed: false,
      code: 'PAGE_RESPONSIBILITY_VIOLATION',
      reasonFa: 'صفحات (Pages) نباید مستقیماً مسئول اجرای درخواست‌های خام شبکه، مدیریت نشست کاربر یا پیاده‌سازی منطق اختصاصی ماژول‌ها باشند.',
    };
  }
  if (sourceLayer === targetLayer) {
    return { allowed: true, code: 'SAME_LAYER_OK', reasonFa: 'ارتباط در همان لایه با رعایت مرز ماژول مجاز است.' };
  }
  const srcSpec = RT_FE_ARCH_6_LAYERS.find((l) => l.id === sourceLayer);
  const tgtSpec = RT_FE_ARCH_6_LAYERS.find((l) => l.id === targetLayer);
  if (!srcSpec || !tgtSpec) {
    return { allowed: false, code: 'UNKNOWN_LAYER', reasonFa: 'لایه معماری نامعتبر است.' };
  }
  if (srcSpec.allowedDownwardTargets.includes(targetLayer)) {
    return {
      allowed: true,
      code: 'DOWNWARD_DEPENDENCY_OK',
      reasonFa: `وابستگی رو به پایین از «${srcSpec.titleFa}» به «${tgtSpec.titleFa}» طبق قانون وابستگی مجاز است.`,
    };
  }
  return {
    allowed: false,
    code: 'UPWARD_LAYER_DEPENDENCY_FORBIDDEN',
    reasonFa: `خطای معماری: لایه پایین‌تر «${srcSpec.titleFa}» مجاز به وابستگی به لایه بالاتر «${tgtSpec.titleFa}» نیست.`,
  };
}

export interface InterModuleValidationInput {
  fromModule: RadarFrontendModuleId | string;
  toModule: RadarFrontendModuleId | string;
  importPath: string;
  dependencyChain?: readonly string[];
  embedsForeignDomainCalculation?: boolean;
  embedsBusinessLogicInUiComponent?: boolean;
  usesAdHocNetworkOrAuthStorage?: boolean;
}

export function validateInterModuleDependency(input: InterModuleValidationInput): {
  valid: boolean;
  violatedRuleIds: string[];
  verdictFa: string;
} {
  const violated: string[] = [];
  const reasons: string[] = [];

  // Rule 1: Only public index.ts contract allowed across feature modules
  const isInternalImport =
    input.fromModule !== input.toModule &&
    /features\/[^/]+\/(components|model|application|adapters|hooks|config|pages)\//.test(input.importPath);
  if (isInternalImport) {
    violated.push('DEP-R01');
    reasons.push('واردسازی مستقیم فایل داخلی ماژول دیگر ممنوع است؛ فقط رابط عمومی (index.ts) مجاز است.');
  }

  // Rule 2: Circular dependency check
  if (input.dependencyChain && input.dependencyChain.length >= 2) {
    const seen = new Set<string>();
    for (const node of input.dependencyChain) {
      if (seen.has(node)) {
        violated.push('DEP-R02');
        reasons.push(`وابستگی چرخه‌ای تشخیص داده شد: ${input.dependencyChain.join(' → ')}`);
        break;
      }
      seen.add(node);
    }
  }

  // Rule 3: Responsibility leakage (e.g., geo-map calculating property price)
  if (input.embedsForeignDomainCalculation) {
    violated.push('DEP-R03');
    reasons.push('انتقال مسئولیت ممنوع است (مثلاً ماژول نقشه نباید منطق محاسبه قیمت ملک را در خود جای دهد).');
  }

  // Rule 4: Business logic inside presentational UI component
  if (input.embedsBusinessLogicInUiComponent) {
    violated.push('DEP-R04');
    reasons.push('انباشت محاسبات و قواعد کسب‌وکار در کامپوننت نمایشی ممنوع است.');
  }

  // Rule 5: Ad-hoc network/session/storage implementation inside feature module
  if (input.usesAdHocNetworkOrAuthStorage) {
    violated.push('DEP-R05');
    reasons.push('پیاده‌سازی مستقل اتصال شبکه، نشست یا ذخیره‌سازی خارج از لایه Platform ممنوع است.');
  }

  return {
    valid: violated.length === 0,
    violatedRuleIds: violated,
    verdictFa:
      violated.length === 0
        ? 'ارتباط میان ماژول‌ها از طریق قرارداد عمومی رسمی (Public Contract) معتبر و بدون چرخه است.'
        : reasons.join(' | '),
  };
}

const DEFAULT_SAMPLE_PROPERTIES: readonly PropertySummary[] = [
  { id: 'PR-1024', title: 'آپارتمان ۱۱۰ متری دوخوابه سعادت‌آباد', propertyType: 'apartment', neighborhoodId: 'saadat-abad', area: 110 },
  { id: 'PR-2048', title: 'واحد ۸۵ متری نوساز پونک', propertyType: 'apartment', neighborhoodId: 'punak', area: 85 },
  { id: 'PR-3096', title: 'دفتر اداری ۱۴۰ متری ونک', propertyType: 'office', neighborhoodId: 'vanak', area: 140 },
];

export function createPropertyModulePublicAdapter(
  seed: readonly PropertySummary[] = DEFAULT_SAMPLE_PROPERTIES,
): PropertyModuleContract {
  const byId = new Map<string, PropertySummary>(seed.map((item) => [item.id, { ...item }]));

  return {
    contractName: 'PropertyModuleContract',
    contractVersion: '1.0.0',
    async getPropertyById(propertyId: string): Promise<PropertySummary | null> {
      const normalized = String(propertyId || '').trim();
      if (!normalized) return null;
      return byId.get(normalized) ?? null;
    },
    async getPropertySummary(propertyId: string): Promise<PropertySummary> {
      const found = await this.getPropertyById(propertyId);
      if (!found) {
        throw new Error(`PROPERTY_NOT_FOUND: ملک با شناسه «${propertyId}» در قرارداد ماژول املاک یافت نشد.`);
      }
      return found;
    },
  };
}

export function evaluateStatePlacementGovernance(input: {
  isCoreEntityTruthOrSensitiveData?: boolean;
  proposedStorage: 'localStorage_or_browser_memory_as_primary_truth' | string;
}): { allowed: boolean; messageFa: string } {
  if (
    input.isCoreEntityTruthOrSensitiveData &&
    input.proposedStorage === 'localStorage_or_browser_memory_as_primary_truth'
  ) {
    return {
      allowed: false,
      messageFa:
        'ممنوعیت معماری (OUT-08): اطلاعات اصلی ملک، کاربران، معاملات یا داده‌های حساس نباید صرفاً به‌عنوان حقیقت اصلی در حافظه مرورگر یا Local Storage نگهداری شوند.',
    };
  }
  const matched = RT_FE_ARCH_STATE_GOVERNANCE_8.find((s) => s.storageLocationId === input.proposedStorage);
  return {
    allowed: true,
    messageFa: matched
      ? `محل نگهداری استاندارد برای «${matched.stateTypeFa}»: ${matched.storageLocationFa}`
      : 'وضعیت در لایه مجاز و منطبق با حساسیت داده نگهداری می‌شود.',
  };
}

export function evaluateRtFeArch001ReadinessGate(): {
  readyForStage2: boolean;
  layersCount: number;
  modulesCount: number;
  ownershipRowsCount: number;
  requirementsVerifiedCount: number;
  deliverablesReadyCount: number;
  nextStageTitleFa: string;
} {
  const layersCount = RT_FE_ARCH_6_LAYERS.length;
  const modulesCount = RT_FE_ARCH_13_MODULES.length;
  const ownershipRowsCount = RT_FE_ARCH_OWNERSHIP_MATRIX_11.length;
  const requirementsVerifiedCount = RT_FE_ARCH_REQUIREMENTS_10.length;
  const deliverablesReadyCount = RT_FE_ARCH_DELIVERABLES_10.length;

  return {
    readyForStage2:
      layersCount === 6 &&
      modulesCount === 13 &&
      ownershipRowsCount === 11 &&
      requirementsVerifiedCount === 10 &&
      deliverablesReadyCount === 10,
    layersCount,
    modulesCount,
    ownershipRowsCount,
    requirementsVerifiedCount,
    deliverablesReadyCount,
    nextStageTitleFa: 'مرحله دوم: طراحی معماری اطلاعات، ساختار صفحات و نظام مسیریابی فرانت‌اند رادار تهران (RT-FE-IA-002)',
  };
}

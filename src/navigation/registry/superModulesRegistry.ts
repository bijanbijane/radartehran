/** @file src/navigation/registry/superModulesRegistry.ts — Lightweight Super-Modules Tab & Tool Count Registry */
import type { FeatureFlags } from '../../types/models';

export type SuperModuleTabId =
  | 'valuation'
  | 'fake_detector'
  | 'mortgage'
  | 'tax_inheritance'
  | 'tenant_rights'
  | 'municipality'
  | 'swap_suburb'
  | 'visit_checklist'
  | 'school_traffic'
  | 'realtor_studio';

export interface SuperModuleTabDescriptor {
  id: SuperModuleTabId;
  label: string;
  flagKey: keyof FeatureFlags;
  toolCount: number;
}

export const SUPER_MODULE_TABS_REGISTRY: readonly SuperModuleTabDescriptor[] = [
  { id: 'valuation', label: 'کارشناسی ارزش، قدرالسهم و طلا', flagKey: 'enableAiValuation', toolCount: 5 },
  { id: 'fake_detector', label: 'مچ‌گیر آگهی، چانه‌زنی و مزایده', flagKey: 'enableFakeAdDetector', toolCount: 5 },
  { id: 'mortgage', label: 'خرید با رهن، وام و آربیتراژ طلا', flagKey: 'enableMortgageSimulator', toolCount: 5 },
  { id: 'tax_inheritance', label: 'مالیات، تقسیم ارث و مهریه‌یار', flagKey: 'enableTenantRights', toolCount: 5 },
  { id: 'tenant_rights', label: 'داور موجر/مستأجر، مدیر و ثنا', flagKey: 'enableTenantRights', toolCount: 5 },
  { id: 'municipality', label: 'شهرداری، موقعیت اداری و لابی', flagKey: 'enableMunicipalityCalc', toolCount: 5 },
  { id: 'swap_suburb', label: 'تهاتر، چیتگر و مهاجرت کلانشهر', flagKey: 'enablePropertySwap', toolCount: 5 },
  { id: 'visit_checklist', label: 'چک‌لیست بازدید، آب و نویز', flagKey: 'enableVisitChecklist', toolCount: 5 },
  { id: 'school_traffic', label: 'مدارس، مترو آینده و گسل', flagKey: 'enableSchoolRadar', toolCount: 5 },
  { id: 'realtor_studio', label: 'استودیو املاک، اسباب‌کشی و سئو', flagKey: 'enableRealtorStudio', toolCount: 7 },
] as const;

export function getVisibleSuperModulesSummary(featureFlags?: Partial<FeatureFlags> | null): {
  tabCount: number;
  toolCount: number;
} {
  const visible = SUPER_MODULE_TABS_REGISTRY.filter((tab) => {
    if (!featureFlags) return true;
    return featureFlags[tab.flagKey] !== false;
  });
  return {
    tabCount: visible.length,
    toolCount: visible.reduce((sum, tab) => sum + tab.toolCount, 0),
  };
}

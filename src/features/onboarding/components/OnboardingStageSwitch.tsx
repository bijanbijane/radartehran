/** @file src/features/onboarding/components/OnboardingStageSwitch.tsx — Lazy-Loaded Stage 34–84 Subpanel Router */
import React, { Suspense, lazy } from 'react';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { OnboardingHelpStageTabId } from '../types/onboardingStageTabs';

const Stage34AccessibilitySubpanel = lazy(() =>
  import('./Stage34AccessibilitySubpanel').then((m) => ({ default: m.Stage34AccessibilitySubpanel })),
);
const RadarMotionLabSubpanel = lazy(() =>
  import('./RadarMotionLabSubpanel').then((m) => ({ default: m.RadarMotionLabSubpanel })),
);
const Stage36DataVisSubpanel = lazy(() =>
  import('./Stage36DataVisSubpanel').then((m) => ({ default: m.Stage36DataVisSubpanel })),
);

export interface LazyStageComponentEntry {
  readonly id: OnboardingHelpStageTabId;
  readonly Loader: React.LazyExoticComponent<React.ComponentType<Record<string, never>>>;
}

const LAZY_STAGE_COMPONENTS: Partial<
  Record<OnboardingHelpStageTabId, React.LazyExoticComponent<React.ComponentType<Record<string, never>>>>
> = {
  stage37: lazy(() => import('./Stage37DataTrustSubpanel').then((m) => ({ default: m.Stage37DataTrustSubpanel }))),
  stage38: lazy(() => import('./Stage38ComparisonSubpanel').then((m) => ({ default: m.Stage38ComparisonSubpanel }))),
  stage39: lazy(() => import('./Stage39MonitoringAlertsSubpanel').then((m) => ({ default: m.Stage39MonitoringAlertsSubpanel }))),
  stage40: lazy(() => import('./Stage40ReportsSubpanel').then((m) => ({ default: m.Stage40ReportsSubpanel }))),
  stage41: lazy(() => import('./Stage41WorkspaceSubpanel').then((m) => ({ default: m.Stage41WorkspaceSubpanel }))),
  stage42: lazy(() => import('./Stage42VerificationSubpanel').then((m) => ({ default: m.Stage42VerificationSubpanel }))),
  stage43: lazy(() => import('./Stage43ProMarketplaceSubpanel').then((m) => ({ default: m.Stage43ProMarketplaceSubpanel }))),
  stage44: lazy(() => import('./Stage44TransactionSubpanel').then((m) => ({ default: m.Stage44TransactionSubpanel }))),
  stage45: lazy(() => import('./Stage45DeliverySubpanel').then((m) => ({ default: m.Stage45DeliverySubpanel }))),
  stage46: lazy(() => import('./Stage46QualitySubpanel').then((m) => ({ default: m.Stage46QualitySubpanel }))),
  stage47: lazy(() => import('./Stage47ProfessionalKnowledgeSubpanel').then((m) => ({ default: m.Stage47ProfessionalKnowledgeSubpanel }))),
  stage48: lazy(() => import('./Stage48DecisionToolsSubpanel').then((m) => ({ default: m.Stage48DecisionToolsSubpanel }))),
  stage49: lazy(() => import('./Stage49MarketMonitoringSubpanel').then((m) => ({ default: m.Stage49MarketMonitoringSubpanel }))),
  stage50: lazy(() => import('./Stage50MarketReportingSubpanel').then((m) => ({ default: m.Stage50MarketReportingSubpanel }))),
  stage51: lazy(() => import('./Stage51GeospatialIntelligenceSubpanel').then((m) => ({ default: m.Stage51GeospatialIntelligenceSubpanel }))),
  stage52: lazy(() => import('./Stage52UrbanDataAtlasSubpanel').then((m) => ({ default: m.Stage52UrbanDataAtlasSubpanel }))),
  stage53: lazy(() => import('./Stage53UrbanProjectsSubpanel').then((m) => ({ default: m.Stage53UrbanProjectsSubpanel }))),
  stage54: lazy(() => import('./Stage54BuiltEnvironmentSubpanel').then((m) => ({ default: m.Stage54BuiltEnvironmentSubpanel }))),
  stage55: lazy(() => import('./Stage55UrbanRegulationSubpanel').then((m) => ({ default: m.Stage55UrbanRegulationSubpanel }))),
  stage56: lazy(() => import('./Stage56UrbanInfrastructureSubpanel').then((m) => ({ default: m.Stage56UrbanInfrastructureSubpanel }))),
  stage57: lazy(() => import('./Stage57UrbanEnvironmentSubpanel').then((m) => ({ default: m.Stage57UrbanEnvironmentSubpanel }))),
  stage58: lazy(() => import('./Stage58UrbanRiskSubpanel').then((m) => ({ default: m.Stage58UrbanRiskSubpanel }))),
  stage59: lazy(() => import('./Stage59UrbanDemographicsSubpanel').then((m) => ({ default: m.Stage59UrbanDemographicsSubpanel }))),
  stage60: lazy(() => import('./Stage60UrbanEconomySubpanel').then((m) => ({ default: m.Stage60UrbanEconomySubpanel }))),
  stage61: lazy(() => import('./Stage61UrbanLandUseSubpanel').then((m) => ({ default: m.Stage61UrbanLandUseSubpanel }))),
  stage63: lazy(() => import('./Stage63UrbanPublicRealmSubpanel').then((m) => ({ default: m.Stage63UrbanPublicRealmSubpanel }))),
  stage64: lazy(() => import('./Stage64UrbanMobilitySubpanel').then((m) => ({ default: m.Stage64UrbanMobilitySubpanel }))),
  stage65: lazy(() => import('./Stage65UrbanRiskResilienceSubpanel').then((m) => ({ default: m.Stage65UrbanRiskResilienceSubpanel }))),
  stage66: lazy(() => import('./Stage66EnvironmentalSustainabilitySubpanel').then((m) => ({ default: m.Stage66EnvironmentalSustainabilitySubpanel }))),
  stage67: lazy(() => import('./Stage67DemographicSocialSubpanel').then((m) => ({ default: m.Stage67DemographicSocialSubpanel }))),
  stage68: lazy(() => import('./Stage68EconomicIntelligenceSubpanel').then((m) => ({ default: m.Stage68EconomicIntelligenceSubpanel }))),
  stage69: lazy(() => import('./Stage69LandUseFunctionalSubpanel').then((m) => ({ default: m.Stage69LandUseFunctionalSubpanel }))),
  stage70: lazy(() => import('./Stage70DemographicIntelligenceSubpanel').then((m) => ({ default: m.Stage70DemographicIntelligenceSubpanel }))),
  stage71: lazy(() => import('./Stage71SpatialEquitySubpanel').then((m) => ({ default: m.Stage71SpatialEquitySubpanel }))),
  stage72: lazy(() => import('./Stage72HousingAffordabilitySubpanel').then((m) => ({ default: m.Stage72HousingAffordabilitySubpanel }))),
  stage73: lazy(() => import('./Stage73PopulationMobilitySubpanel').then((m) => ({ default: m.Stage73PopulationMobilitySubpanel }))),
  stage74: lazy(() => import('./Stage74MarketEquilibriumSubpanel').then((m) => ({ default: m.Stage74MarketEquilibriumSubpanel }))),
  stage75: lazy(() => import('./Stage75BuildingLifecycleSubpanel').then((m) => ({ default: m.Stage75BuildingLifecycleSubpanel }))),
  stage77: lazy(() => import('./Stage77RentalMarketSubpanel').then((m) => ({ default: m.Stage77RentalMarketSubpanel }))),
  stage78: lazy(() => import('./Stage78SalesLiquiditySubpanel').then((m) => ({ default: m.Stage78SalesLiquiditySubpanel }))),
  stage79: lazy(() => import('./Stage79InvestmentOpportunitySubpanel').then((m) => ({ default: m.Stage79InvestmentOpportunitySubpanel }))),
  stage80: lazy(() => import('./Stage80ConstructionEconomicsSubpanel').then((m) => ({ default: m.Stage80ConstructionEconomicsSubpanel }))),
  stage81: lazy(() => import('./Stage81UrbanLandMarketSubpanel').then((m) => ({ default: m.Stage81UrbanLandMarketSubpanel }))),
  stage82: lazy(() => import('./Stage82UrbanRegenerationSubpanel').then((m) => ({ default: m.Stage82UrbanRegenerationSubpanel }))),
  stage83: lazy(() => import('./Stage83UrbanInvestmentSubpanel').then((m) => ({ default: m.Stage83UrbanInvestmentSubpanel }))),
  stage84: lazy(() => import('./Stage84UrbanMacroeconomicsSubpanel').then((m) => ({ default: m.Stage84UrbanMacroeconomicsSubpanel }))),
};

const StageLoadingSkeleton: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    data-testid="onboarding-stage-suspense-fallback"
    className="p-6 rounded-[12px] border border-[#DCE3DF] dark:border-[var(--color-border-subtle)] bg-[#F6F8F6] dark:bg-[var(--color-bg-muted)] text-xs text-[#586760] dark:text-[var(--color-text-secondary)] animate-pulse"
  >
    در حال بارگذاری ماژول تخصصی مرحله انتخاب‌شده...
  </div>
);

export const OnboardingStageSwitch: React.FC<{
  stageTab: OnboardingHelpStageTabId;
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  wcagTextSpacing: boolean;
  onToggleWcagTextSpacing: () => void;
  reducedMotion: boolean;
  onToggleReducedMotion: () => void;
  onAnnounceStatus: (msg: string) => void;
}> = ({
  stageTab,
  evaluatedNeighborhoods,
  wcagTextSpacing,
  onToggleWcagTextSpacing,
  reducedMotion,
  onToggleReducedMotion,
  onAnnounceStatus,
}) => {
  const LazyTarget = LAZY_STAGE_COMPONENTS[stageTab];
  return (
    <Suspense fallback={<StageLoadingSkeleton />}>
      {stageTab === 'stage34' && (
        <Stage34AccessibilitySubpanel
          evaluatedNeighborhoods={evaluatedNeighborhoods}
          wcagTextSpacing={wcagTextSpacing}
          onToggleWcagTextSpacing={onToggleWcagTextSpacing}
          reducedMotion={reducedMotion}
          onToggleReducedMotion={onToggleReducedMotion}
          onAnnounceStatus={onAnnounceStatus}
        />
      )}
      {stageTab === 'stage35' && <RadarMotionLabSubpanel onAnnounceStatus={onAnnounceStatus} />}
      {stageTab === 'stage36' && <Stage36DataVisSubpanel onAnnounceStatus={onAnnounceStatus} />}
      {LazyTarget ? <LazyTarget /> : null}
    </Suspense>
  );
};

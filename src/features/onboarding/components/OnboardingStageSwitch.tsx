/** @file src/features/onboarding/components/OnboardingStageSwitch.tsx — Extracted Stage 34–46 Subpanel Router */
import React from 'react';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { OnboardingHelpStageTabId } from '../types/onboardingStageTabs';
import { RadarMotionLabSubpanel } from './RadarMotionLabSubpanel';
import { Stage34AccessibilitySubpanel } from './Stage34AccessibilitySubpanel';
import { Stage36DataVisSubpanel } from './Stage36DataVisSubpanel';
import { Stage37DataTrustSubpanel } from './Stage37DataTrustSubpanel';
import { Stage38ComparisonSubpanel } from './Stage38ComparisonSubpanel';
import { Stage39MonitoringAlertsSubpanel } from './Stage39MonitoringAlertsSubpanel';
import { Stage40ReportsSubpanel } from './Stage40ReportsSubpanel';
import { Stage41WorkspaceSubpanel } from './Stage41WorkspaceSubpanel';
import { Stage42VerificationSubpanel } from './Stage42VerificationSubpanel';
import { Stage43ProMarketplaceSubpanel } from './Stage43ProMarketplaceSubpanel';
import { Stage44TransactionSubpanel } from './Stage44TransactionSubpanel';
import { Stage45DeliverySubpanel } from './Stage45DeliverySubpanel';
import { Stage46QualitySubpanel } from './Stage46QualitySubpanel';
import { Stage47ProfessionalKnowledgeSubpanel } from './Stage47ProfessionalKnowledgeSubpanel';
import { Stage48DecisionToolsSubpanel } from './Stage48DecisionToolsSubpanel';
import { Stage49MarketMonitoringSubpanel } from './Stage49MarketMonitoringSubpanel';
import { Stage50MarketReportingSubpanel } from './Stage50MarketReportingSubpanel';
import { Stage51GeospatialIntelligenceSubpanel } from './Stage51GeospatialIntelligenceSubpanel';
import { Stage52UrbanDataAtlasSubpanel } from './Stage52UrbanDataAtlasSubpanel';
import { Stage53UrbanProjectsSubpanel } from './Stage53UrbanProjectsSubpanel';
import { Stage54BuiltEnvironmentSubpanel } from './Stage54BuiltEnvironmentSubpanel';
import { Stage55UrbanRegulationSubpanel } from './Stage55UrbanRegulationSubpanel';
import { Stage56UrbanInfrastructureSubpanel } from './Stage56UrbanInfrastructureSubpanel';
import { Stage57UrbanEnvironmentSubpanel } from './Stage57UrbanEnvironmentSubpanel';
import { Stage58UrbanRiskSubpanel } from './Stage58UrbanRiskSubpanel';
import { Stage59UrbanDemographicsSubpanel } from './Stage59UrbanDemographicsSubpanel';
import { Stage60UrbanEconomySubpanel } from './Stage60UrbanEconomySubpanel';
import { Stage61UrbanLandUseSubpanel } from './Stage61UrbanLandUseSubpanel';
import { Stage63UrbanPublicRealmSubpanel } from './Stage63UrbanPublicRealmSubpanel';
import { Stage64UrbanMobilitySubpanel } from './Stage64UrbanMobilitySubpanel';
import { Stage65UrbanRiskResilienceSubpanel } from './Stage65UrbanRiskResilienceSubpanel';
import { Stage66EnvironmentalSustainabilitySubpanel } from './Stage66EnvironmentalSustainabilitySubpanel';
import { Stage67DemographicSocialSubpanel } from './Stage67DemographicSocialSubpanel';
import { Stage68EconomicIntelligenceSubpanel } from './Stage68EconomicIntelligenceSubpanel';
import { Stage69LandUseFunctionalSubpanel } from './Stage69LandUseFunctionalSubpanel';
import { Stage70DemographicIntelligenceSubpanel } from './Stage70DemographicIntelligenceSubpanel';
import { Stage71SpatialEquitySubpanel } from './Stage71SpatialEquitySubpanel';
import { Stage72HousingAffordabilitySubpanel } from './Stage72HousingAffordabilitySubpanel';
import { Stage73PopulationMobilitySubpanel } from './Stage73PopulationMobilitySubpanel';
import { Stage74MarketEquilibriumSubpanel } from './Stage74MarketEquilibriumSubpanel';
import { Stage75BuildingLifecycleSubpanel } from './Stage75BuildingLifecycleSubpanel';
import { Stage77RentalMarketSubpanel } from './Stage77RentalMarketSubpanel';
import { Stage78SalesLiquiditySubpanel } from './Stage78SalesLiquiditySubpanel';
import { Stage79InvestmentOpportunitySubpanel } from './Stage79InvestmentOpportunitySubpanel';
import { Stage80ConstructionEconomicsSubpanel } from './Stage80ConstructionEconomicsSubpanel';
import { Stage81UrbanLandMarketSubpanel } from './Stage81UrbanLandMarketSubpanel';
import { Stage82UrbanRegenerationSubpanel } from './Stage82UrbanRegenerationSubpanel';
import { Stage83UrbanInvestmentSubpanel } from './Stage83UrbanInvestmentSubpanel';
import { Stage84UrbanMacroeconomicsSubpanel } from './Stage84UrbanMacroeconomicsSubpanel';

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
}) => (
  <>
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
    {stageTab === 'stage37' && <Stage37DataTrustSubpanel />}
    {stageTab === 'stage38' && <Stage38ComparisonSubpanel />}
    {stageTab === 'stage39' && <Stage39MonitoringAlertsSubpanel />}
    {stageTab === 'stage40' && <Stage40ReportsSubpanel />}
    {stageTab === 'stage41' && <Stage41WorkspaceSubpanel />}
    {stageTab === 'stage42' && <Stage42VerificationSubpanel />}
    {stageTab === 'stage43' && <Stage43ProMarketplaceSubpanel />}
    {stageTab === 'stage44' && <Stage44TransactionSubpanel />}
    {stageTab === 'stage45' && <Stage45DeliverySubpanel />}
    {stageTab === 'stage46' && <Stage46QualitySubpanel />}
    {stageTab === 'stage47' && <Stage47ProfessionalKnowledgeSubpanel />}
    {stageTab === 'stage48' && <Stage48DecisionToolsSubpanel />}
    {stageTab === 'stage49' && <Stage49MarketMonitoringSubpanel />}
    {stageTab === 'stage50' && <Stage50MarketReportingSubpanel />}
    {stageTab === 'stage51' && <Stage51GeospatialIntelligenceSubpanel />}
    {stageTab === 'stage52' && <Stage52UrbanDataAtlasSubpanel />}
    {stageTab === 'stage53' && <Stage53UrbanProjectsSubpanel />}
    {stageTab === 'stage54' && <Stage54BuiltEnvironmentSubpanel />}
    {stageTab === 'stage55' && <Stage55UrbanRegulationSubpanel />}
    {stageTab === 'stage56' && <Stage56UrbanInfrastructureSubpanel />}
    {stageTab === 'stage57' && <Stage57UrbanEnvironmentSubpanel />}
    {stageTab === 'stage58' && <Stage58UrbanRiskSubpanel />}
    {stageTab === 'stage59' && <Stage59UrbanDemographicsSubpanel />}
    {stageTab === 'stage60' && <Stage60UrbanEconomySubpanel />}
    {stageTab === 'stage61' && <Stage61UrbanLandUseSubpanel />}
    {stageTab === 'stage63' && <Stage63UrbanPublicRealmSubpanel />}
    {stageTab === 'stage64' && <Stage64UrbanMobilitySubpanel />}
    {stageTab === 'stage65' && <Stage65UrbanRiskResilienceSubpanel />}
    {stageTab === 'stage66' && <Stage66EnvironmentalSustainabilitySubpanel />}
    {stageTab === 'stage67' && <Stage67DemographicSocialSubpanel />}
    {stageTab === 'stage68' && <Stage68EconomicIntelligenceSubpanel />}
    {stageTab === 'stage69' && <Stage69LandUseFunctionalSubpanel />}
    {stageTab === 'stage70' && <Stage70DemographicIntelligenceSubpanel />}
    {stageTab === 'stage71' && <Stage71SpatialEquitySubpanel />}
    {stageTab === 'stage72' && <Stage72HousingAffordabilitySubpanel />}
    {stageTab === 'stage73' && <Stage73PopulationMobilitySubpanel />}
    {stageTab === 'stage74' && <Stage74MarketEquilibriumSubpanel />}
    {stageTab === 'stage75' && <Stage75BuildingLifecycleSubpanel />}
    {stageTab === 'stage77' && <Stage77RentalMarketSubpanel />}
    {stageTab === 'stage78' && <Stage78SalesLiquiditySubpanel />}
    {stageTab === 'stage79' && <Stage79InvestmentOpportunitySubpanel />}
    {stageTab === 'stage80' && <Stage80ConstructionEconomicsSubpanel />}
    {stageTab === 'stage81' && <Stage81UrbanLandMarketSubpanel />}
    {stageTab === 'stage82' && <Stage82UrbanRegenerationSubpanel />}
    {stageTab === 'stage83' && <Stage83UrbanInvestmentSubpanel />}
    {stageTab === 'stage84' && <Stage84UrbanMacroeconomicsSubpanel />}
  </>
);

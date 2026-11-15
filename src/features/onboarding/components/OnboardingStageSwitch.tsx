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
  </>
);

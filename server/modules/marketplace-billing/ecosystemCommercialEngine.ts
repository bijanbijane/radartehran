/** @file server/modules/marketplace-billing/ecosystemCommercialEngine.ts — Stages 17, 18, 20 Contributor Tiers, Unit Economics & Commercial Readiness */
import crypto from 'node:crypto';
import { sanitizeInput } from '../../../src/utils/security';

export type EcosystemParticipantTier = 'COMMUNITY_MEMBER' | 'VERIFIED_CONTRIBUTOR' | 'LOCAL_AGENCY_PARTNER' | 'DATA_RESEARCH_PARTNER';
export type CommercialOnboardingStage = 'DISCOVERY' | 'VETTING' | 'SANDBOX_TRIAL' | 'ACTIVE_LIMITED' | 'RETENTION_REVIEW';

export interface UnitEconomicsAssumption {
  streamId: string;
  titleFa: string;
  epistemicTag: 'ASSUMPTION';
  livePaymentGatewayEnabled: false;
  trustSafeguardFa: string;
  estimatedArpuBandFa: string;
}

export interface PilotMarketCandidate {
  cityId: 'tehran' | 'karaj' | 'isfahan';
  districtFocusFa: string;
  selectedForWave1: boolean;
  supplyDensityStatus: 'NOT_VERIFIED' | 'PARTIAL_SEED';
}

export class EcosystemCommercialEngine {
  private readonly onboardingRecords: Array<{
    id: string;
    partnerNameFa: string;
    tier: EcosystemParticipantTier;
    stage: CommercialOnboardingStage;
    wtpSignalFa: string;
    createdAtIso: string;
  }> = [];

  private readonly unitEconomicsModel: readonly UnitEconomicsAssumption[] = [
    {
      streamId: 'hood-sponsor-verified',
      titleFa: 'حمایت محلی آژانس تاییدشده (با افشای شفاف برچسب اسپانسر)',
      epistemicTag: 'ASSUMPTION',
      livePaymentGatewayEnabled: false,
      trustSafeguardFa: 'جایگاه اسپانسر هرگز رتبه شاخص یا امتیاز کیفیت محله را تغییر نمی‌دهد.',
      estimatedArpuBandFa: '[فرض اولیه] اشتراک ماهانه آزمایشی بدون پیش‌پرداخت بلندمدت',
    },
    {
      streamId: 'dossier-report-pro',
      titleFa: 'گزارش تحلیلی محله و برآورد هدونیک با افشای عدم قطعیت',
      epistemicTag: 'ASSUMPTION',
      livePaymentGatewayEnabled: false,
      trustSafeguardFa: 'الزام نمایش فاصله اطمینان و تمایز قیمت پیشنهادی از معامله واقعی.',
      estimatedArpuBandFa: '[فرض اولیه] گزارش تک‌موردی یا بسته محدود مشاوران',
    },
  ];

  private readonly pilotMarkets: readonly PilotMarketCandidate[] = [
    { cityId: 'tehran', districtFocusFa: 'منطقه ۲ و ۵ (سعادت‌آباد / پونک)', selectedForWave1: true, supplyDensityStatus: 'PARTIAL_SEED' },
    { cityId: 'karaj', districtFocusFa: 'گوهردشت و مهرشهر', selectedForWave1: true, supplyDensityStatus: 'NOT_VERIFIED' },
    { cityId: 'isfahan', districtFocusFa: 'جلفا و شیخ‌صدوق', selectedForWave1: false, supplyDensityStatus: 'NOT_VERIFIED' },
  ];

  getCommercialReadinessReport() {
    const selectedMarkets = this.pilotMarkets.filter((m) => m.selectedForWave1);
    return {
      commercialStatus: 'COMMERCIAL_READY_WITH_LIMITATIONS',
      commercialEntryGate: 'NOT_VERIFIED',
      liveBillingEnabled: false,
      maxPilotMarketsConstraint: 3,
      selectedMarketsCount: selectedMarkets.length,
      pilotMarkets: this.pilotMarkets,
      unitEconomicsModel: this.unitEconomicsModel,
      supportSlaTargets: {
        sev1Minutes: 30,
        partnerTicketHours: 24,
        measuredInProduction: false,
      },
      onboardingRecordsCount: this.onboardingRecords.length,
    };
  }

  registerPilotPartnerLead(params: {
    partnerNameFa: string;
    tier: EcosystemParticipantTier;
    wtpSignalFa: string;
  }) {
    const rec = {
      id: `eco_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      partnerNameFa: sanitizeInput(params.partnerNameFa, 100),
      tier: params.tier,
      stage: 'DISCOVERY' as CommercialOnboardingStage,
      wtpSignalFa: sanitizeInput(params.wtpSignalFa, 160),
      createdAtIso: new Date().toISOString(),
    };
    this.onboardingRecords.unshift(rec);
    return rec;
  }
}

export const defaultEcosystemCommercialEngine = new EcosystemCommercialEngine();

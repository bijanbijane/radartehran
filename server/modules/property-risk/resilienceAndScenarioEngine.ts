/**
 * Resilience Assessment & Risk Mitigation Scenario Engine
 * (`server/modules/property-risk/resilienceAndScenarioEngine.ts`)
 * Exclusive ownership: `server/modules/property-risk/`
 */

import { randomUUID } from 'node:crypto';
import {
  HazardCategoryType,
  MitigationScenarioInput,
  MitigationScenarioResult,
  OverallRiskClass,
  ResilienceAssessmentRecord
} from './types.js';

export function evaluatePropertyResilience(params: {
  propertyId: string;
  hazardCategory: HazardCategoryType;
  verifiedProtectiveSystems: string[];
  reviewerId?: string;
}): ResilienceAssessmentRecord {
  const { propertyId, hazardCategory, verifiedProtectiveSystems, reviewerId } = params;
  const deficiencies: string[] = [];
  const recommendations: string[] = [];

  let score = 30; // Base baseline

  if (hazardCategory === 'earthquake_shaking' || hazardCategory === 'surface_fault_rupture') {
    if (verifiedProtectiveSystems.includes('automatic_gas_shutoff_valve')) {
      score += 20;
    } else {
      deficiencies.push('عدم وجود شیر قطع‌کن خودکار گاز حساس به امواج زلزله');
      recommendations.push('نصب شیر قطع‌کن اتوماتیک گاز در ورودی علمک گاز ساختمان');
    }

    if (verifiedProtectiveSystems.includes('seismic_joint_and_bracing')) {
      score += 35;
    } else {
      deficiencies.push('عدم وجود گواهی مقاوم‌سازی مهندسی در برابر بارهای جانبی زلزله');
      recommendations.push('انجام ممیزی سازه‌ای و اجرای مهاربندهای فولادی یا ژاکت بتنی');
    }

    if (verifiedProtectiveSystems.includes('emergency_power_generator')) {
      score += 15;
    }
  } else if (hazardCategory === 'river_flood' || hazardCategory === 'flash_flood_surface_water') {
    if (verifiedProtectiveSystems.includes('backflow_prevention_valve')) {
      score += 35;
    } else {
      deficiencies.push('فقدان شیر یکطرفه عدم بازگشت فاضلاب و مهار سیلاب');
      recommendations.push('نصب دریچه‌های خودکار ضدسیل و پمپ‌های خودمکش کف‌کش در چاهک موتورخانه');
    }

    if (verifiedProtectiveSystems.includes('elevated_electrical_panels')) {
      score += 30;
    } else {
      deficiencies.push('استقرار تابلوهای اصلی برق در تراز پایین‌تر از کف معبر');
      recommendations.push('انتقال تابلوهای توزیع برق به تراز بالاتر از بیشینه پیش‌بینی سیلاب');
    }
  }

  return {
    assessmentId: randomUUID(),
    propertyId,
    hazardCategory,
    verifiedProtectiveSystems,
    identifiedDeficienciesFa: deficiencies,
    resilienceScorePercent: Math.min(100, score),
    recommendationsFa: recommendations,
    assessmentDateIso: new Date().toISOString(),
    reviewerId
  };
}

export function modelRiskMitigationScenario(
  input: MitigationScenarioInput
): MitigationScenarioResult {
  let projectedRiskClass: OverallRiskClass = input.baselineRiskClass;
  let projectedImprovement = '';
  const prerequisites: string[] = [];

  if (input.proposedInterventionKey === 'seismic_steel_bracing_retrofit') {
    if (input.baselineRiskClass === 'critical') projectedRiskClass = 'moderate';
    else if (input.baselineRiskClass === 'high') projectedRiskClass = 'moderate';
    else projectedRiskClass = 'low';

    projectedImprovement = 'ارتقای سطح شکل‌پذیری سازه و کاهش خسارت کالبدی در زلزله‌های با دوره بازگشت ۴۷۵ سال';
    prerequisites.push('تهیه نقشه‌های اجرایی مصوب سازمان نظام مهندسی ساختمان');
    prerequisites.push('آزمایش مقاومت فشاری بتن و اسکن اتصالات تیر و ستون');
  } else if (input.proposedInterventionKey === 'automatic_flood_gates_and_valves') {
    if (input.baselineRiskClass === 'critical' || input.baselineRiskClass === 'high') {
      projectedRiskClass = 'low';
    } else {
      projectedRiskClass = 'minimal';
    }

    projectedImprovement = 'جلوگیری کامل از ورود روان‌آب سطحی و پس‌زدگی شبکه فاضلاب به زیرزمین و پارکینگ';
    prerequisites.push('تامین منبع برق اضطراری جهت تداوم کار پمپ‌های تخلیه');
  } else if (input.proposedInterventionKey === 'foundation_micropile_underpinning') {
    projectedRiskClass = input.baselineRiskClass === 'critical' ? 'moderate' : 'low';
    projectedImprovement = 'مهار نشست‌های نامتقارن پی ساختمان و جلوگیری از گسترش ترک‌های برشی';
    prerequisites.push('مطالعات ژئوتکنیک و خاک‌شناسی جهت تعیین عمق استقرار میکروپایل‌ها');
  }

  return {
    scenarioId: randomUUID(),
    propertyId: input.propertyId,
    hazardCategory: input.hazardCategory,
    baselineRiskClass: input.baselineRiskClass,
    projectedRiskClass,
    proposedIntervention: input,
    projectedVulnerabilityImprovement: projectedImprovement,
    implementationPrerequisitesFa: prerequisites,
    disclaimerFa:
      'این مدل‌سازی کاهش ریسک صرفاً سناریوی تحلیلی و فرضی بوده و اثرگذاری قطعی منوط به طراحی، تایید و نظارت مهندسان ناظر صاحب صلاحیت می‌باشد.',
    modeledAtIso: new Date().toISOString()
  };
}

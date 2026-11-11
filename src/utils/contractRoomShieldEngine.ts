/**
 * @file src/utils/contractRoomShieldEngine.ts
 * @description Contract-Room Survival Shield, Safe Payment Staging, and Clause Antidote Engine.
 */

import { toPersianNum as toPersianDigits } from '../data/neighborhoods';

export type StagingProfileId = 'READY_DEED_STANDARD' | 'BRAND_NEW_PENDING_DEED' | 'HOT_MARKET_COMPETITIVE' | 'PRE_CONSTRUCTION';

export interface PaymentStageItem {
  id: string;
  stageName: string;
  recommendedPct: number;
  amountMillionToman: number;
  dueMilestone: string;
  safetyCheck: string;
}

export interface ContractShieldDiagnosis {
  totalPriceMillion: number;
  profileId: StagingProfileId;
  profileLabelFa: string;
  stages: PaymentStageItem[];
  symmetricDailyPenaltyMillion: number;
  katebSystemMandate: {
    appliesToGreenDeeds: boolean;
    title: string;
    description: string;
  };
  safetyClauses: {
    id: string;
    title: string;
    clauseDraft: string;
    whyCrucial: string;
  }[];
  psychologicalCounterTactics: {
    id: string;
    brokerTrap: string;
    realTruth: string;
    calmCounterResponse: string;
  }[];
}

export const STAGING_PROFILES: Record<StagingProfileId, { labelFa: string; descFa: string; contractPct: number; handoverPct: number; deedPct: number }> = {
  READY_DEED_STANDARD: {
    labelFa: 'ملک آماده با سند تک‌برگ شخصی',
    descFa: 'رایج‌ترین حالت برای املاک با سابقه؛ سند آزاد و بدون رهن بانکی.',
    contractPct: 50,
    handoverPct: 40,
    deedPct: 10,
  },
  BRAND_NEW_PENDING_DEED: {
    labelFa: 'نوساز کلیدنخورده (سند تفکیکی در راه)',
    descFa: 'پایان‌کار یا صورتمجلس تفکیکی زمان‌بر است؛ سهم دفترخانه باید سنگین‌تر باشد.',
    contractPct: 40,
    handoverPct: 35,
    deedPct: 25,
  },
  HOT_MARKET_COMPETITIVE: {
    labelFa: 'بازار رقابتی و ملک زیرقیمت (فروشنده دست‌بالا)',
    descFa: 'فروشنده متقاضی نقدینگی فوری است؛ افزایش سهم قرارداد با ضمانت چک صیادی.',
    contractPct: 60,
    handoverPct: 30,
    deedPct: 10,
  },
  PRE_CONSTRUCTION: {
    labelFa: 'پیش‌خرید واحد در حال ساخت',
    descFa: 'پرداخت متناظر با مراحل سفت‌کاری و نازک‌کاری بر اساس قانون پیش‌فروش ساختمان.',
    contractPct: 30,
    handoverPct: 50,
    deedPct: 20,
  },
};

export function calculateContractShield(totalPriceMillion: number, profileId: StagingProfileId = 'READY_DEED_STANDARD'): ContractShieldDiagnosis {
  const safeTotal = Math.max(500, Math.min(2_000_000, Math.round(totalPriceMillion || 10_000)));
  const profile = STAGING_PROFILES[profileId] || STAGING_PROFILES.READY_DEED_STANDARD;

  const contractAmt = Math.round((safeTotal * profile.contractPct) / 100);
  const deedAmt = Math.round((safeTotal * profile.deedPct) / 100);
  const handoverAmt = safeTotal - contractAmt - deedAmt;

  const stages: PaymentStageItem[] = [
    {
      id: 'stage_contract',
      stageName: 'مرحله ۱: امضای قرارداد / ثبت پیش‌نویس در سامانه کاتب',
      recommendedPct: profile.contractPct,
      amountMillionToman: contractAmt,
      dueMilestone: 'همزمان با دریافت کد رهگیری رسمی و احراز هویت ثنا',
      safetyCheck: 'چک تضمین‌شده یا واریز فقط به شماره حساب منطبق با نام مالک مندرج در سند.',
    },
    {
      id: 'stage_handover',
      stageName: 'مرحله ۲: تحویل فیزیکی، تخلیه کامل و تست تأسیسات',
      recommendedPct: profile.handoverPct,
      amountMillionToman: handoverAmt,
      dueMilestone: 'روز تحویل کلید و امضای صورت‌جلسه تحویل ممهور به امضای طرفین',
      safetyCheck: 'تطبیق کنتورها، تسویه‌حساب شارژ ساختمان و دریافت کارت پارکینگ و ریموت.',
    },
    {
      id: 'stage_deed',
      stageName: 'مرحله ۳: انتقال قطعی سند رسمی در دفتر اسناد رسمی',
      recommendedPct: profile.deedPct,
      amountMillionToman: deedAmt,
      dueMilestone: 'روز حضور در دفترخانه و پس از رؤیت استعلام ثبت و بنچاق قطعی',
      safetyCheck: 'ارائه مفاصاحساب شهرداری، دارایی و استعلام برخط ثبت اسناد توسط سردفتر.',
    },
  ];

  // Daily delay penalty: roughly 0.15% of total value per day
  const dailyPenalty = Math.max(5, Math.round(safeTotal * 0.0015));

  return {
    totalPriceMillion: safeTotal,
    profileId,
    profileLabelFa: profile.labelFa,
    stages,
    symmetricDailyPenaltyMillion: dailyPenalty,
    katebSystemMandate: {
      appliesToGreenDeeds: true,
      title: 'الزام قانونی سامانه کاتب (قانون مصوب ۱۴۰۳)',
      description: 'برای اسناد مالکیت تک‌برگ سبز صادره از تیر ۱۴۰۳، مشاور املاک حق انعقاد مبایعه‌نامه سنتی ندارد و موظف است پیش‌نویس را فقط در سامانه کاتب ثبت و به دفتر اسناد رسمی ارسال کند.',
    },
    safetyClauses: [
      {
        id: 'cl_symmetric_penalty',
        title: 'بند ۱: وجه التزام متقارن تأخیر طرفین',
        clauseDraft: `در صورت تأخیر فروشنده در تحویل فیزیکی یا حضور در دفترخانه شماره (...) جهت انتقال قطعی، یا تأخیر خریدار در پرداخت ثمن، طرف متخلف مکلف به پرداخت روزانه مبلغ ${toPersianDigits(dailyPenalty)} میلیون تومان به عنوان وجه التزام به طرف دیگر است.`,
        whyCrucial: 'جلوگیری از زیاده‌خواهی در صورت جهش قیمت مسکن تا روز محضر.',
      },
      {
        id: 'cl_square_meter_deficit',
        title: 'بند ۲: تسویه اضافه و کسری متراژ بر اساس قیمت متری قطعی',
        clauseDraft: 'ملاک دقیق متراژ، مساحت مندرج در صورت‌مجلس تفکیکی کاداستر است. هرگونه کسری یا اضافه متراژ نسبت به مساحت تقریبی، بر پایه ثمن هر مترمربع توافق‌شده نقداً تسویه خواهد شد.',
        whyCrucial: 'در املاک نوساز، اختلاف متراژ بین پایان‌کار و واقعیت بسیار محتمل است.',
      },
      {
        id: 'cl_bank_mortgage_clearance',
        title: 'بند ۳: فک رهن قطعی و پرداخت تسهیلات بانکی',
        clauseDraft: 'فروشنده متعهد است حداقل ۷ روز کاری پیش از موعد دفترخانه، کلیه بدهی‌های بانکی پلاک ثبتی را تسویه و تأییدیه فک رهن ممهور به مهر بانک مربوطه را به سردفتر ارائه کند.',
        whyCrucial: 'مانع از گرو ماندن سند در گروی وام‌های پرداخت‌نشده مالک قبلی می‌شود.',
      },
      {
        id: 'cl_exclusive_privilege_boundary',
        title: 'بند ۴: استثنا کردن خیار غبن فاحش و عیوب پنهان',
        clauseDraft: 'اسقاط کافه خیارات، شامل خیار تدلیس، خیار غبن فاحش و افحش و عیوب اساسی پنهان در سازه و تأسیسات نمی‌گردد و حقوق قانونی خریدار در این موارد محفوظ است.',
        whyCrucial: 'ابطال اثر فاجعه‌بار امضای کورکورانه فرم‌های پیش‌فرض بنگاه.',
      },
    ],
    psychologicalCounterTactics: [
      {
        id: 'tactic_travel_urgency',
        brokerTrap: '«مالک فردا عازم سفر خارج است و امشب اگر امضا نکنید فایل از دست می‌رود!»',
        realTruth: 'شگرد کلاسیک ایجاد اضطراب زمان محدود؛ مالکی که واقعاً قصد فروش دارد، ۲۴ ساعت برای معامله میلیاردی صبر می‌کند.',
        calmCounterResponse: '«اگر پرواز دارند که برای انتقال سند هم حاضر نخواهند بود! ما ابتدا فردا استعلام ثبت و کاتب را می‌گیریم و بعد با وکیل رسمی یا در آرامش عقد می‌کنیم.»',
      },
      {
        id: 'tactic_other_cash_buyer',
        brokerTrap: '«یک خریدار دیگر با دسته‌چک آماده نشسته و اگر سر ۲ میلیارد چانه بزنید به او می‌فروشیم!»',
        realTruth: 'بلوف بزرگ بنگاه برای متوقف کردن چانه‌زنی و جلوگیری از تخفیف کف بازار.',
        calmCounterResponse: '«به سلامت! اگر مشتری نقد بالاتر از بودجه من دارند معطل نکنید و بفروشید. ما به وقت و پول خودمان احترام می‌گذاریم.»',
      },
      {
        id: 'tactic_commission_shaving',
        brokerTrap: '«کمیسیون توافقی ۱ درصد از طرفین است و تخفیف ندارد چون فایل شخصی است!»',
        realTruth: 'نرخ قانونی تعرفه اتحادیه مصوب بسیار کمتر از ۱ درصد است و دریافت مازاد تخلف تعزیراتی است.',
        calmCounterResponse: '«حق‌التحریر و کمیسیون دقیقاً بر اساس فرمول رسمی تعرفه اتحادیه با ثبت فاکتور رسمی و کد رهگیری محاسبه خواهد شد.»',
      },
    ],
  };
}

/** @file src/features/services/services/serviceTaxonomyAndVerification.ts — 10-Category Taxonomy & 4-Track Verification Engine */
import type {
  ProviderCredential,
  ServiceCanonicalCategory,
  ServiceCategory,
  ServiceDefinition,
  ServiceListingTier,
  VerificationTrackRecord,
  VerificationTrackStatus,
} from '../types/service.types';

export const IDENTITY_NOT_CREDENTIAL_NOTE_FA =
  'ثبت یا تأیید نام دفتر/هویت در دایرکتوری به‌معنی گواهی صلاحیت فنی یا پروانه تخصصی رسمی نیست.';
export const PAST_RATING_DISCLAIMER_FA =
  'سابقه حضور یا بازخوردهای گذشته تضمین‌کننده کیفیت کار آینده یا نتیجه حقوقی معامله نیست.';

export const CANONICAL_SERVICE_DEFINITIONS: readonly ServiceDefinition[] = [
  {
    serviceId: 'advisory.buy-sell-match',
    slug: 'advisory-buy-sell',
    category: 'advisory',
    legacyCategory: 'brokerage',
    titleFa: 'مشاوره خرید، فروش و رهن در محله',
    summaryFa: 'تطبیق فایل‌های منطبق با بودجه، هماهنگی بازدید و مشاوره معامله محلی.',
    deliveryModes: ['onsite', 'hybrid'],
    requiredFields: ['dealSide', 'budgetRange'],
  },
  {
    serviceId: 'legal.contract-review',
    slug: 'legal-contract-review',
    category: 'legal',
    legacyCategory: 'legal_valuation',
    titleFa: 'بازبینی حقوقی مبایعه‌نامه و اجاره‌نامه',
    summaryFa: 'کنترل بندهای فسخ، تعهدات سند، چک صیادی، کد رهگیری و اصالت وکالت‌نامه.',
    deliveryModes: ['remote', 'hybrid', 'onsite'],
    requiredFields: ['contractType', 'urgency'],
  },
  {
    serviceId: 'valuation.hedonic-review',
    slug: 'valuation-field-expert',
    category: 'valuation',
    legacyCategory: 'legal_valuation',
    titleFa: 'ارزش‌گذاری و برآورد کارشناسی ملک',
    summaryFa: 'ارزیابی ارزش روز با بررسی قدرالسهم، موقعیت کوچه، سن واقعی و معاملات هم‌تراز.',
    deliveryModes: ['onsite', 'hybrid'],
    requiredFields: ['valuationPurpose', 'areaSqm'],
  },
  {
    serviceId: 'inspection.technical-50',
    slug: 'technical-building-inspection',
    category: 'inspection',
    legacyCategory: 'inspection',
    titleFa: 'بازرسی فنی سازه، تأسیسات و رطوبت پیش از خرید',
    summaryFa: 'چک‌لیست ۵۰ نقطه‌ای شامل لوله‌کشی، برق، موتورخانه، عایق‌بندی و وضعیت آسانسور.',
    deliveryModes: ['onsite'],
    requiredFields: ['buildingAgeYears', 'inspectionFocus'],
  },
  {
    serviceId: 'architecture.interior-plan',
    slug: 'architecture-design',
    category: 'architecture',
    legacyCategory: 'architecture',
    titleFa: 'طراحی پلان، معماری داخلی و بهینه‌سازی فضا',
    summaryFa: 'بازطراحی نقشه واحد، نورپردازی، آشپزخانه و برآورد دقیق اقلام اجرایی.',
    deliveryModes: ['hybrid', 'remote', 'onsite'],
    requiredFields: ['designScope', 'areaSqm'],
  },
  {
    serviceId: 'renovation.turnkey',
    slug: 'renovation-contracting',
    category: 'renovation',
    legacyCategory: 'renovation_repair',
    titleFa: 'بازسازی کامل و تعمیرات تخصصی ساختمان',
    summaryFa: 'اجرای تخریب، تأسیسات، کناف، کابینت و تحویل زمان‌بندی‌شده با قرارداد شفاف.',
    deliveryModes: ['onsite'],
    requiredFields: ['renovationScope', 'targetDuration'],
  },
  {
    serviceId: 'finance.mortgage-advisory',
    slug: 'mortgage-finance-advisory',
    category: 'mortgage_finance',
    legacyCategory: 'legal_valuation',
    titleFa: 'مشاوره تسهیلات اوراق و تأمین مالی مسکن',
    summaryFa: 'برآورد ظرفیت وام، هزینه‌های کارمزد و زمان‌بندی ترهین سند.',
    deliveryModes: ['remote', 'hybrid'],
    requiredFields: ['loanNeedMillion'],
  },
  {
    serviceId: 'moving.insured-relocation',
    slug: 'moving-settlement',
    category: 'moving_settlement',
    legacyCategory: 'materials',
    titleFa: 'اسباب‌کشی، بسته‌بندی و استقرار واحد',
    summaryFa: 'حمل ایمن اثاثیه با برآورد شفاف طبقه، پله/آسانسور باربر و بیمه بار.',
    deliveryModes: ['onsite'],
    requiredFields: ['originFloor', 'destFloor'],
  },
  {
    serviceId: 'municipality.r122-permit',
    slug: 'municipality-r122',
    category: 'documentation_municipality',
    legacyCategory: 'contractor',
    titleFa: 'استعلام ضوابط شهرداری (R122)، تراکم و پایان‌کار',
    summaryFa: 'بررسی جواز ساخت، اصلاحی معبر، خلافی ماده ۱۰۰ و امور ثبتی ملک.',
    deliveryModes: ['hybrid', 'onsite'],
    requiredFields: ['parcelType'],
  },
  {
    serviceId: 'management.building-ops',
    slug: 'property-building-management',
    category: 'property_management',
    legacyCategory: 'brokerage',
    titleFa: 'مدیریت شارژ، نگهداری و بهره‌برداری ساختمان',
    summaryFa: 'شفافیت هزینه‌های مشاعات، سرویس دوره‌ای آسانسور/تأسیسات و حسابداری ساختمان.',
    deliveryModes: ['onsite', 'hybrid'],
    requiredFields: ['unitsCount'],
  },
];

export function mapLegacyCategoryToCanonical(legacy: Exclude<ServiceCategory, 'all'>): ServiceCanonicalCategory {
  if (legacy === 'brokerage') return 'advisory';
  if (legacy === 'inspection') return 'inspection';
  if (legacy === 'legal_valuation') return 'legal';
  if (legacy === 'architecture') return 'architecture';
  if (legacy === 'contractor') return 'documentation_municipality';
  if (legacy === 'renovation_repair') return 'renovation';
  return 'moving_settlement';
}

export function mapCanonicalToLegacyCategory(canonical: ServiceCanonicalCategory): Exclude<ServiceCategory, 'all'> {
  const def = CANONICAL_SERVICE_DEFINITIONS.find((d) => d.category === canonical);
  return def ? def.legacyCategory : 'brokerage';
}

export interface AdaptiveFieldPrompt {
  key: string;
  labelFa: string;
  placeholderFa: string;
}

export function resolveCategoryAdaptiveQuestions(canonical: ServiceCanonicalCategory): AdaptiveFieldPrompt[] {
  if (canonical === 'legal') {
    return [
      { key: 'contractType', labelFa: 'نوع سند یا قرارداد', placeholderFa: 'مثال: مبایعه‌نامه واحد مسکونی / مشارکت در ساخت' },
      { key: 'urgency', labelFa: 'زمان جلسه قرارداد', placeholderFa: 'مثال: ۴۸ ساعت آینده' },
    ];
  }
  if (canonical === 'inspection') {
    return [
      { key: 'buildingAgeYears', labelFa: 'سن تقریبی بنا (سال)', placeholderFa: 'مثال: ۱۲ سال' },
      { key: 'inspectionFocus', labelFa: 'اولویت بازرسی فنی', placeholderFa: 'مثال: موتورخانه، رطوبت سرویس‌ها و اسکلت' },
    ];
  }
  if (canonical === 'renovation' || canonical === 'architecture') {
    return [
      { key: 'renovationScope', labelFa: 'دامنه بازسازی یا طراحی', placeholderFa: 'مثال: آشپزخانه، تعویض لوله‌کشی و کف‌پوش' },
      { key: 'targetDuration', labelFa: 'افق زمانی مدنظر', placeholderFa: 'مثال: ۴۵ روز آینده' },
    ];
  }
  if (canonical === 'documentation_municipality') {
    return [
      { key: 'parcelType', labelFa: 'وضعیت فعلی ملک', placeholderFa: 'مثال: کلنگی با نیاز به بررسی تراکم و بر و کف' },
    ];
  }
  return [
    { key: 'dealSide', labelFa: 'نوع نیاز ملکی', placeholderFa: 'مثال: خرید مصرفی / کارشناسی پیش از قرارداد' },
  ];
}

export interface TrackSeedInput {
  identityStatus?: VerificationTrackStatus;
  businessStatus?: VerificationTrackStatus;
  qualificationStatus?: VerificationTrackStatus;
  qualificationExpiresAtIso?: string | null;
  licenseCodeMasked?: string | null;
  portfolioStatus?: VerificationTrackStatus;
  listingTier?: ServiceListingTier;
}

export function evaluateProviderVerificationTracks(
  seed: TrackSeedInput,
  nowMs: number = Date.now(),
): ProviderCredential {
  const resolveStatus = (
    raw: VerificationTrackStatus | undefined,
    expiresAtIso?: string | null,
  ): VerificationTrackStatus => {
    const base = raw || 'not_submitted';
    if (base === 'verified' && expiresAtIso) {
      const exp = Date.parse(expiresAtIso);
      if (Number.isFinite(exp) && exp <= nowMs) return 'expired';
    }
    return base;
  };

  const identityStatus = resolveStatus(seed.identityStatus ?? 'not_submitted');
  const businessStatus = resolveStatus(seed.businessStatus ?? 'not_submitted');
  const qualificationStatus = resolveStatus(
    seed.qualificationStatus ?? 'not_submitted',
    seed.qualificationExpiresAtIso,
  );
  const portfolioStatus = resolveStatus(seed.portfolioStatus ?? 'not_submitted');

  const statusBadge = (s: VerificationTrackStatus): string => {
    if (s === 'verified') return 'تأییدشده';
    if (s === 'pending') return 'در انتظار بررسی';
    if (s === 'revision_required') return 'نیازمند اصلاح';
    if (s === 'rejected') return 'ردشده';
    if (s === 'expired') return 'منقضی‌شده';
    if (s === 'suspended') return 'تعلیق‌شده';
    return 'ثبت‌نشده';
  };

  const tracks: VerificationTrackRecord[] = [
    {
      track: 'identity',
      status: identityStatus,
      labelFa: 'احراز هویت متقاضی',
      badgeTextFa: statusBadge(identityStatus),
      verifiedByFa: identityStatus === 'verified' ? 'بررسی مدارک هویتی رادار' : null,
      issuedAtIso: null,
      expiresAtIso: null,
      licenseCodeMasked: null,
      noteFa: identityStatus === 'verified' ? 'هویت شخص/مسئول دفتر احراز شده است.' : 'هویت به‌صورت رسمی در این رسته استعلام نشده است.',
    },
    {
      track: 'business',
      status: businessStatus,
      labelFa: 'احراز کسب‌وکار / دفتر',
      badgeTextFa: statusBadge(businessStatus),
      verifiedByFa: businessStatus === 'verified' ? 'انطباق شناسه کسب‌وکار' : null,
      issuedAtIso: null,
      expiresAtIso: null,
      licenseCodeMasked: null,
      noteFa: businessStatus === 'verified' ? 'نشانی و اطلاعات ثبتی دفتر مطابقت دارد.' : 'اطلاعات دفتر بر مبنای خوداظهاری نمایش داده می‌شود.',
    },
    {
      track: 'qualification',
      status: qualificationStatus,
      labelFa: 'تأیید صلاحیت و پروانه تخصصی',
      badgeTextFa: statusBadge(qualificationStatus),
      verifiedByFa: qualificationStatus === 'verified' ? 'استعلام پروانه / گواهی تخصصی' : null,
      issuedAtIso: null,
      expiresAtIso: seed.qualificationExpiresAtIso || null,
      licenseCodeMasked: seed.licenseCodeMasked || null,
      noteFa:
        qualificationStatus === 'expired'
          ? 'اعتبار پروانه ثبت‌شده منقضی شده و تا تمدید معتبر محسوب نمی‌شود.'
          : qualificationStatus === 'verified'
          ? 'پروانه یا صلاحیت تخصصی ثبت و تا تاریخ اعتبار معتبر است.'
          : 'پروانه تخصصی رسمی برای این پروفایل تأیید نشده است.',
    },
    {
      track: 'portfolio',
      status: portfolioStatus,
      labelFa: 'تأیید نمونه‌کار و سابقه اجرا',
      badgeTextFa: statusBadge(portfolioStatus),
      verifiedByFa: portfolioStatus === 'verified' ? 'بازبینی مستندات پروژه' : null,
      issuedAtIso: null,
      expiresAtIso: null,
      licenseCodeMasked: null,
      noteFa: portfolioStatus === 'verified' ? 'مستندات نمونه پروژه‌های قبلی بررسی شده است.' : 'سابقه بدون پرونده نمونه‌کار راستی‌آزمایی‌شده است.',
    },
  ];

  // Paid placement MUST NEVER inflate credential status
  let overallStatus: ProviderCredential['status'] = 'self_declared';
  let statusLabelFa = 'اطلاعات خوداظهار دفتر (بدون استعلام ثبتی پروانه)';
  if (qualificationStatus === 'verified') {
    overallStatus = 'license_verified';
    statusLabelFa = 'پروانه / صلاحیت تخصصی تأییدشده';
  } else if (qualificationStatus === 'expired') {
    overallStatus = 'unverified';
    statusLabelFa = 'پروانه منقضی‌شده (در انتظار تمدید)';
  } else if (identityStatus === 'verified') {
    overallStatus = 'identity_verified';
    statusLabelFa = 'هویت احرازشده (پروانه تخصصی تأییدنشده)';
  }

  return {
    status: overallStatus,
    statusLabelFa,
    licenseNumber: qualificationStatus === 'verified' ? seed.licenseCodeMasked || null : null,
    separationNoteFa: IDENTITY_NOT_CREDENTIAL_NOTE_FA,
    tracks,
  };
}

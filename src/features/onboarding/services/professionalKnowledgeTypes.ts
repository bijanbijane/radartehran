/** @file src/features/onboarding/services/professionalKnowledgeTypes.ts — Stage 47 (RT-UI-PROFESSIONAL-KNOWLEDGE-001) Types & Catalogs */

export type ProfessionalContentType =
  | 'educational_article'
  | 'practical_guide'
  | 'checklist'
  | 'standard_regulation'
  | 'expert_interpretation'
  | 'faq'
  | 'glossary'
  | 'template_form'
  | 'case_study'
  | 'comparison_guide';

export type SourceOriginType =
  | 'official_source'
  | 'standard_document'
  | 'scientific_source'
  | 'expert_opinion'
  | 'field_experience'
  | 'community_content'
  | 'editorial_content';

export type KnowledgeSourceStatus =
  | 'active_verifiable'
  | 'needs_review'
  | 'amended'
  | 'superseded'
  | 'obsolete'
  | 'unavailable'
  | 'unknown_validity';

export type ContentTrustLabel =
  | 'منبع رسمی پیوست دارد'
  | 'منبع تخصصی دارد'
  | 'بازبینی تخصصی شده'
  | 'محتوای تحریریه'
  | 'مشارکت جامعه'
  | 'نیازمند بازبینی';

export type EpistemicClaimLayer =
  | 'اطلاعات قطعی منبع'
  | 'تفسیر نویسنده'
  | 'برآورد'
  | 'تجربه موردی'
  | 'فرضیه یا پیشنهاد';

export type ChecklistItemStatus =
  | 'بررسی نشده'
  | 'بررسی شد'
  | 'نیازمند پیگیری'
  | 'قابل اعمال نیست'
  | 'نیازمند متخصص';

export type EditorialPubStatus =
  | 'پیش‌نویس'
  | 'آماده بازبینی'
  | 'در بازبینی تخصصی'
  | 'در بررسی منابع'
  | 'نیازمند اصلاح'
  | 'آماده انتشار'
  | 'منتشرشده'
  | 'نیازمند بازبینی'
  | 'به‌روزرسانی‌شده'
  | 'منسوخ‌شده'
  | 'تعلیق‌شده';

export type DocumentPublicationPermission =
  | 'internal_review_only'
  | 'case_parties_only'
  | 'anonymized_educational'
  | 'public_licensed';

export interface KnowledgeSourceMetadata {
  sourceId: string;
  fullTitleFa: string;
  publisherFa: string;
  authorFa?: string;
  documentCodeOrVersion?: string;
  publishedDateFa: string;
  effectiveDateFa?: string;
  geographicScopeFa: string;
  thematicScopeFa: string;
  status: KnowledgeSourceStatus;
  accessLocationFa: string;
  lastVerifiedDateFa: string;
  replacementSourceId?: string;
}

export interface ProfessionalChecklistItem {
  itemId: string;
  titleFa: string;
  explanationFa: string;
  status: ChecklistItemStatus;
  userNoteFa: string;
  linkedGuideId: string;
}

export interface ProfessionalChecklistRecord {
  checklistId: string;
  titleFa: string;
  purposeFa: string;
  targetAudienceFa: string;
  usageConditionFa: string;
  version: string;
  updatedAtFa: string;
  nonCertificationDisclaimerFa: string;
  items: ProfessionalChecklistItem[];
}

export interface ProfessionalGlossaryEntry {
  termId: string;
  termFa: string;
  termEn: string;
  aliasesFa: string[];
  simpleDefinitionFa: string;
  technicalDefinitionFa: string;
  usageContextFa: string;
  relatedTermsFa: string[];
  sourceTitleFa: string;
  reviewStatus: 'بازبینی‌شده' | 'نیازمند بررسی';
  lastReviewedFa: string;
}

export interface ContentErrorReportRecord {
  reportId: string;
  guideId: string;
  targetSectionFa: string;
  problemType:
    | 'خطای نگارشی'
    | 'خطای مفهومی'
    | 'منبع نامعتبر'
    | 'اطلاعات منسوخ'
    | 'ادعای تخصصی نادرست'
    | 'محتوای آسیب‌زا یا گمراه‌کننده'
    | 'نقض حقوق محتوا';
  descriptionFa: string;
  suggestedSourceFa?: string;
  routingPathFa: string;
  status:
    | 'دریافت‌شده'
    | 'در انتظار بررسی'
    | 'نیازمند اطلاعات بیشتر'
    | 'پذیرفته‌شده'
    | 'پذیرفته‌شده به‌صورت جزئی'
    | 'ردشده با توضیح'
    | 'اعمال‌شده در نسخه جدید'
    | 'بسته‌شده';
}

export interface ProfessionalGuideRecord {
  guideId: string;
  categoryFa: string;
  titleFa: string;
  summaryWhatFa: string;
  summaryForWhomFa: string;
  summaryNextActionFa: string;
  contentType: ProfessionalContentType;
  trustLabel: ContentTrustLabel;
  targetAudienceFa: string;
  geographicAndTopicScopeFa: string;
  publishedDateFa: string;
  lastReviewedDateFa: string;
  nextReviewDueIso: string;
  authorNameFa: string;
  expertReviewerNameFa: string;
  readingMinutes: number;
  version: string;
  publicationStatus: EditorialPubStatus;
  tableOfContentsFa: string[];
  sections: Array<{
    sectionId: string;
    headingFa: string;
    sourceFactFa: string;
    authorInterpretationFa: string;
    editorialNoteFa: string;
    claimLayer: EpistemicClaimLayer;
  }>;
  sources: KnowledgeSourceMetadata[];
  limitationNoticeFa: string;
  relatedChecklistId: string;
}

export const STAGE47_BOUNDARIES_5 = [
  { prevStageFa: 'مرحله ۲۳: مرکز دانش و پژوهش', prevRoleFa: 'دانش عمومی، منابع، پژوهش و تحلیل', stage47BoundaryFa: 'محتوای کاربردی و تخصصی مرتبط با تصمیم‌ها و خدمات' },
  { prevStageFa: 'مرحله ۳۳: راهنما و پشتیبانی', prevRoleFa: 'آموزش استفاده از خود سامانه و حل مشکلات کاربری', stage47BoundaryFa: 'آموزش موضوعات املاک، ساختمان و خدمات حرفه‌ای' },
  { prevStageFa: 'مرحله ۴۲: اعتبار حرفه‌ای', prevRoleFa: 'هویت، احراز و اعتبار ارائه‌دهنده', stage47BoundaryFa: 'آموزش کاربر برای فهم صلاحیت‌ها و ارزیابی ادعاها' },
  { prevStageFa: 'مرحله ۴۵: اجرای خدمت', prevRoleFa: 'مدیریت پروژه و تحویل', stage47BoundaryFa: 'راهنمایی برای تعریف صحیح کار و فهم خروجی مورد انتظار' },
  { prevStageFa: 'مرحله ۴۶: کنترل کیفیت', prevRoleFa: 'رسیدگی به شکایت و اختلاف', stage47BoundaryFa: 'آموزش پیشگیرانه برای کاهش خطا و اختلاف' },
] as const;

export const STAGE47_CONTENT_CATEGORIES_14 = [
  'خرید ملک', 'فروش ملک', 'اجاره', 'شناخت محله', 'بررسی ساختمان', 'نگهداری', 'ساخت‌وساز',
  'بازسازی', 'خدمات کارشناسی', 'خدمات حقوقی و ثبتی', 'خدمات فنی', 'مدیریت ساختمان', 'استانداردها', 'ایمنی',
] as const;

export const FORBIDDEN_TRUST_CLAIMS_FA = ['کاملاً معتبر', 'تضمین‌شده', 'صددرصد صحیح'] as const;

export const SERVICE_GUIDE_SECTIONS_15 = [
  'معرفی خدمت', 'مسئله‌ای که خدمت حل می‌کند', 'موارد کاربرد', 'مواردی که خدمت پوشش نمی‌دهد',
  'اطلاعات موردنیاز پیش از سفارش', 'مراحل اجرای خدمت', 'خروجی‌های مورد انتظار', 'مدارک و مستندات قابل دریافت',
  'معیارهای انتخاب ارائه‌دهنده', 'عوامل اثرگذار بر هزینه', 'محدودیت‌ها و ریسک‌ها', 'پرسش‌های ضروری پیش از توافق',
  'معیارهای کنترل کیفیت', 'خطاهای رایج', 'منابع مرتبط',
] as const;

export const STAGE47_EDITORIAL_ROLES_8 = [
  'مدیر محتوا', 'نویسنده', 'متخصص موضوعی', 'مسئول منابع', 'ویراستار', 'بازبین ریسک', 'ناشر', 'مدیر دانش',
] as const;

export const STAGE47_UX_EVENTS_14 = [
  'professional_knowledge_opened', 'knowledge_search_submitted', 'knowledge_filter_applied',
  'knowledge_section_opened', 'knowledge_source_opened', 'knowledge_saved', 'knowledge_feedback_submitted',
  'knowledge_error_reported', 'knowledge_checklist_started', 'knowledge_checklist_completed',
  'knowledge_tool_used', 'knowledge_content_correction_accepted', 'knowledge_content_updated',
  'contextual_guide_opened',
] as const;

export const STAGE47_PK_COMPONENT_IDS_40 = Array.from(
  { length: 40 },
  (_, idx) => `PK-${String(idx + 1).padStart(2, '0')}`,
);

export const STAGE47_UI_PK_TASKS_30 = Array.from(
  { length: 30 },
  (_, idx) => `UI-PK-${String(idx + 1).padStart(2, '0')}`,
);

export const STAGE48_DECISION_TOOL_AXES_15 = [
  'ابزار مقایسه چند ملک', 'ابزار مقایسه چند محله', 'ابزار مقایسه پیشنهادهای خدماتی',
  'ابزار ارزیابی اولیه وضعیت ملک', 'ابزار برآورد مقدماتی هزینه بازسازی', 'ابزار برنامه‌ریزی زمان اجرای پروژه',
  'ابزار محاسبه متراژ و مساحت', 'ابزار مدیریت هزینه‌های نگهداری ملک', 'ابزار ارزیابی عوامل مؤثر بر ارزش ملک',
  'ابزار انتخاب معیارهای شخصی خرید یا اجاره', 'ابزار مقایسه سناریوهای تصمیم‌گیری', 'توضیح روش محاسبه و فرض‌های هر ابزار',
  'نمایش عدم‌قطعیت و محدودیت داده', 'ذخیره و بازبینی سناریوها', 'اتصال ابزارها به نقشه، محله، ملک و بازار خدمات',
] as const;

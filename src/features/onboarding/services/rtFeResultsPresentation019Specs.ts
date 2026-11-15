/**
 * Stage 19 — Spec Constants & Catalogs for RT-FE-RESULTS-PRESENTATION-019
 * Frontend Results Presentation, Data Lists, Tables & Comparison Views Architecture
 */

export const RT_FE_RESULTS_PRESENTATION_019_SPEC_ID = 'RT-FE-RESULTS-PRESENTATION-019' as const;
export const RT_FE_STAGE20_BRIDGE_SPEC_ID = 'RT-FE-DATA-VISUALIZATION-020' as const;

export const RT_RESULTS_LAYERS_9 = [
  { layer: 1, nameEn: 'Result Source', roleFa: 'داده دریافتی از Search API، Query یا قابلیت تخصصی' },
  { layer: 2, nameEn: 'Result Contract', roleFa: 'قرارداد استاندارد ResultItem و ResultSet با شناسه و وضعیت کامل‌بودن' },
  { layer: 3, nameEn: 'Display Schema', roleFa: 'جداسازی مدل داده از مدل نمایشی در ۴ سطح Compact تا Analytical' },
  { layer: 4, nameEn: 'Formatter & Renderer Registry', roleFa: 'قالب‌بندی واحد (تومان/ریال، شمسی، درصد) و تفکیک صفر واقعی از داده ناموجود' },
  { layer: 5, nameEn: 'Result Composition', roleFa: 'ترکیب Data Card، Data List، Data Table و Comparison View' },
  { layer: 6, nameEn: 'Selection & Actions', roleFa: 'تفکیک انتخاب صفحه از کل Query و کنترل عملیات ردیفی/گروهی با مجوز سرور' },
  { layer: 7, nameEn: 'View Synchronization', roleFa: 'هم‌زمانی انتخاب و فیلتر میان Table، List، Map و Chart روی یک Result Set' },
  { layer: 8, nameEn: 'Interaction & Persistence', roleFa: 'ذخیره تنظیمات ستون و Density با اولویت User > Workspace > Default' },
  { layer: 9, nameEn: 'Presentation Observability', roleFa: 'سنجش خطای Renderer و زمان بارگذاری View بدون ثبت داده خصوصی' },
] as const;

export const RT_RESULTS_VIEW_REGISTRY_9 = [
  { id: 'card', labelFa: 'کارت داده (Data Card)', capabilities: { selectable: true, sortable: true, groupable: false, comparable: true } },
  { id: 'list', labelFa: 'فهرست عمودی (Data List)', capabilities: { selectable: true, sortable: true, groupable: true, comparable: true } },
  { id: 'table', labelFa: 'جدول تخصصی (Data Table)', capabilities: { selectable: true, sortable: true, groupable: true, comparable: true } },
  { id: 'compact', labelFa: 'نمای فشرده (Compact)', capabilities: { selectable: true, sortable: true, groupable: false, comparable: false } },
  { id: 'comparison', labelFa: 'نمای مقایسه‌ای (Comparison)', capabilities: { selectable: false, sortable: false, groupable: false, comparable: true } },
  { id: 'timeline', labelFa: 'خط زمانی (Timeline)', capabilities: { selectable: false, sortable: false, groupable: true, comparable: false } },
  { id: 'grouped', labelFa: 'فهرست گروه‌بندی‌شده (Grouped)', capabilities: { selectable: true, sortable: true, groupable: true, comparable: false } },
  { id: 'map_linked', labelFa: 'نمای همگام با نقشه (Map-linked)', capabilities: { selectable: true, sortable: true, groupable: false, comparable: true } },
  { id: 'analytical', labelFa: 'نمای تحلیلی/آماری (Analytical)', capabilities: { selectable: true, sortable: true, groupable: true, comparable: true } },
] as const;

export const RT_RESULTS_STATES_10 = [
  'Initial', 'Loading', 'Success', 'Empty', 'Partial',
  'Stale', 'Error', 'Forbidden', 'Refreshing', 'Processing',
] as const;

export const RT_RESULTS_COLUMN_PRESETS_4 = [
  { id: 'public', titleFa: 'عمومی', columns: ['propertyType', 'area', 'neighborhood', 'totalPrice'] },
  { id: 'expert', titleFa: 'کارشناسی', columns: ['buildingAge', 'floor', 'amenities', 'pricePerSqm'] },
  { id: 'research', titleFa: 'پژوهشی', columns: ['sourceId', 'updatedAt', 'qualityStatus', 'version'] },
  { id: 'admin', titleFa: 'مدیریتی', columns: ['recordId', 'workflowState', 'recordOwner', 'modifiedAt'] },
] as const;

export const RT_RESULTS_EXECUTION_PHASES_12 = [
  { phase: 1, outputId: 'RT-FE-RESULTS-OUT-001', titleFa: 'شناسایی کارت‌ها، جدول‌ها و الگوهای موجود' },
  { phase: 2, outputId: 'RT-FE-RESULTS-OUT-002', titleFa: 'طراحی ResultItem، ResultSet و وضعیت کامل‌بودن' },
  { phase: 3, outputId: 'RT-FE-RESULTS-OUT-003', titleFa: 'طراحی Display Schema و View Registry' },
  { phase: 4, outputId: 'RT-FE-RESULTS-OUT-004', titleFa: 'ساخت Result Formatter و Renderer Registry' },
  { phase: 5, outputId: 'RT-FE-RESULTS-OUT-005', titleFa: 'ساخت Data Card و Data List استاندارد' },
  { phase: 6, outputId: 'RT-FE-RESULTS-OUT-006', titleFa: 'ساخت Data Table و جدول آماری/مدیریتی' },
  { phase: 7, outputId: 'RT-FE-RESULTS-OUT-007', titleFa: 'طراحی Column Registry، Presetها و Preferences' },
  { phase: 8, outputId: 'RT-FE-RESULTS-OUT-008', titleFa: 'طراحی Selection Model و عملیات ردیفی/گروهی' },
  { phase: 9, outputId: 'RT-FE-RESULTS-OUT-009', titleFa: 'طراحی Comparison View با تطابق واحد و دوره' },
  { phase: 10, outputId: 'RT-FE-RESULTS-OUT-010', titleFa: 'همگام‌سازی Table، List، Map و Chart' },
  { phase: 11, outputId: 'RT-FE-RESULTS-OUT-011', titleFa: 'پیاده‌سازی Virtualization، RTL و دسترس‌پذیری AA' },
  { phase: 12, outputId: 'RT-FE-RESULTS-OUT-012', titleFa: 'مهاجرت صفحات موجود و حذف الگوهای تکراری' },
] as const;

export const RT_RESULTS_DELIVERABLES_23 = [
  { id: 'RT-FE-RESULTS-OUT-001', titleFa: 'Inventory نمایش نتایج موجود' },
  { id: 'RT-FE-RESULTS-OUT-002', titleFa: 'Result Contract' },
  { id: 'RT-FE-RESULTS-OUT-003', titleFa: 'Display Schema و Registry' },
  { id: 'RT-FE-RESULTS-OUT-004', titleFa: 'Formatter & Renderer Registry' },
  { id: 'RT-FE-RESULTS-OUT-005', titleFa: 'Data Card Architecture' },
  { id: 'RT-FE-RESULTS-OUT-006', titleFa: 'Data List Architecture' },
  { id: 'RT-FE-RESULTS-OUT-007', titleFa: 'Data Table Architecture' },
  { id: 'RT-FE-RESULTS-OUT-008', titleFa: 'Column Registry' },
  { id: 'RT-FE-RESULTS-OUT-009', titleFa: 'Column Preferences' },
  { id: 'RT-FE-RESULTS-OUT-010', titleFa: 'Selection Architecture' },
  { id: 'RT-FE-RESULTS-OUT-011', titleFa: 'Row & Bulk Action Architecture' },
  { id: 'RT-FE-RESULTS-OUT-012', titleFa: 'Comparison Architecture' },
  { id: 'RT-FE-RESULTS-OUT-013', titleFa: 'Analytical Table Specification' },
  { id: 'RT-FE-RESULTS-OUT-014', titleFa: 'Result Quality Presentation' },
  { id: 'RT-FE-RESULTS-OUT-015', titleFa: 'Result Synchronization' },
  { id: 'RT-FE-RESULTS-OUT-016', titleFa: 'Virtualization Specification' },
  { id: 'RT-FE-RESULTS-OUT-017', titleFa: 'Responsive Results Design' },
  { id: 'RT-FE-RESULTS-OUT-018', titleFa: 'Accessibility Specification' },
  { id: 'RT-FE-RESULTS-OUT-019', titleFa: 'Performance Specification' },
  { id: 'RT-FE-RESULTS-OUT-020', titleFa: 'Testing Strategy' },
  { id: 'RT-FE-RESULTS-OUT-021', titleFa: 'Telemetry Specification' },
  { id: 'RT-FE-RESULTS-OUT-022', titleFa: 'Migration Plan' },
  { id: 'RT-FE-RESULTS-OUT-023', titleFa: 'Acceptance Test Suite' },
] as const;

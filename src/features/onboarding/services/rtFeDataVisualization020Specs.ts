/**
 * Stage 20 — Spec Constants & Catalogs for RT-FE-DATA-VISUALIZATION-020
 * Frontend Data Visualization, Charts, Analytical Dashboards & Data-driven Interactions Architecture
 */

export const RT_FE_DATA_VISUALIZATION_020_SPEC_ID = 'RT-FE-DATA-VISUALIZATION-020' as const;
export const RT_FE_STAGE21_BRIDGE_SPEC_ID = 'RT-FE-ENTITY-DETAIL-021' as const;

export const RT_VIS_LAYERS_11 = [
  { layer: 1, nameEn: 'Data Source', roleFa: 'داده معتبر دریافتی از Analytics API و لایه داده رسمی' },
  { layer: 2, nameEn: 'Visualization Contract', roleFa: 'قرارداد نقطه داده با واحد، زمان، منبع و وضعیت کامل‌بودن' },
  { layer: 3, nameEn: 'Metric & Dimension Registry', roleFa: 'ثبت مرکزی تعریف شاخص، فرمول، مالک و ابعاد تفکیک‌پذیر' },
  { layer: 4, nameEn: 'Visualization Schema', roleFa: 'تعیین نوع نمودار، محورها، مقیاس، Legend و Annotation' },
  { layer: 5, nameEn: 'Data Adapter', roleFa: 'نگاشت داده API به سری نمودار بدون محاسبه پنهان شاخص جدید' },
  { layer: 6, nameEn: 'Chart Registry', roleFa: 'ثبت ۱۸ الگوی نمودار با قابلیت‌ها و جلوگیری از انتخاب نامناسب' },
  { layer: 7, nameEn: 'Rendering Engine', roleFa: 'موتور واحد رندر با Responsive، Decimation و مدیریت حافظه' },
  { layer: 8, nameEn: 'Interaction Engine', roleFa: 'تعاملات Hover، Zoom، Brush، Drill-down و Cross-filtering بدون حلقه' },
  { layer: 9, nameEn: 'Dashboard Composition', roleFa: 'ترکیب Widgetهای مستقل دارای چرخه عمر Register تا Dispose' },
  { layer: 10, nameEn: 'Export & Presentation', roleFa: 'خروجی PNG/SVG/PDF/CSV/XLSX همراه با Manifest و مجوز' },
  { layer: 11, nameEn: 'Observability', roleFa: 'پایش خطای رندر، Dispose منابع و زمان نمایش داشبورد بدون PII' },
] as const;

export const RT_VIS_CHART_REGISTRY_18 = [
  { type: 'line', labelFa: 'خطی (Line)', shape: 'temporal', accessibleAlternative: true },
  { type: 'bar', labelFa: 'میله‌ای (Bar)', shape: 'categorical', accessibleAlternative: true },
  { type: 'stacked_bar', labelFa: 'میله‌ای پشته‌ای (Stacked Bar)', shape: 'part_to_whole', accessibleAlternative: true },
  { type: 'grouped_bar', labelFa: 'میله‌ای گروهی (Grouped Bar)', shape: 'categorical', accessibleAlternative: true },
  { type: 'area', labelFa: 'مساحتی (Area)', shape: 'temporal', accessibleAlternative: true },
  { type: 'scatter', labelFa: 'پراکندگی (Scatter)', shape: 'bivariate', accessibleAlternative: true },
  { type: 'bubble', labelFa: 'حبابی (Bubble)', shape: 'bivariate', accessibleAlternative: true },
  { type: 'histogram', labelFa: 'هیستوگرام (Histogram)', shape: 'distribution', accessibleAlternative: true },
  { type: 'boxplot', labelFa: 'جعبه‌ای (Box Plot)', shape: 'distribution', accessibleAlternative: true },
  { type: 'heatmap', labelFa: 'ماتریس شدت (Heatmap)', shape: 'matrix', accessibleAlternative: true },
  { type: 'pie', labelFa: 'دایره‌ای (Pie)', shape: 'part_to_whole', accessibleAlternative: true },
  { type: 'donut', labelFa: 'حلقه‌ای (Donut)', shape: 'part_to_whole', accessibleAlternative: true },
  { type: 'radar', labelFa: 'رادار (Radar)', shape: 'multidimensional', accessibleAlternative: true },
  { type: 'treemap', labelFa: 'درختی (Treemap)', shape: 'hierarchical', accessibleAlternative: true },
  { type: 'waterfall', labelFa: 'آبشاری (Waterfall)', shape: 'decomposition', accessibleAlternative: true },
  { type: 'funnel', labelFa: 'قیفی (Funnel)', shape: 'funnel', accessibleAlternative: true },
  { type: 'candlestick', labelFa: 'شمعی (Candlestick)', shape: 'ohlc', accessibleAlternative: true },
  { type: 'calendar_heatmap', labelFa: 'نقشه حرارتی تقویم', shape: 'temporal', accessibleAlternative: true },
] as const;

export const RT_VIS_METRIC_CATEGORIES_10 = [
  { id: 'housing_market', titleFa: 'بازار مسکن', owner: 'Market & Valuation', samplesFa: 'قیمت هر متر، تعداد معاملات، حجم عرضه' },
  { id: 'properties', titleFa: 'املاک', owner: 'Properties', samplesFa: 'متراژ، سن بنا، تعداد اتاق' },
  { id: 'demographics', titleFa: 'جمعیت', owner: 'Demographics', samplesFa: 'جمعیت، تراکم، نرخ رشد' },
  { id: 'urban_economy', titleFa: 'اقتصاد شهری', owner: 'Urban Economy', samplesFa: 'درآمد، هزینه مسکن، قدرت خرید' },
  { id: 'construction', titleFa: 'ساخت‌وساز', owner: 'Urban Projects', samplesFa: 'پروانه، زیربنا، تراکم ساختمانی' },
  { id: 'mobility', titleFa: 'حمل‌ونقل', owner: 'Mobility', samplesFa: 'زمان دسترسی، ترافیک، پوشش حمل‌ونقل' },
  { id: 'environment', titleFa: 'محیط زیست', owner: 'Environment', samplesFa: 'آلودگی، فضای سبز، بارش' },
  { id: 'urban_services', titleFa: 'خدمات شهری', owner: 'Urban Services', samplesFa: 'دسترسی مدرسه، بیمارستان و مراکز خدماتی' },
  { id: 'supply_demand', titleFa: 'عرضه و تقاضا', owner: 'Market Equilibrium', samplesFa: 'تعداد عرضه، تقاضای برآوردی، شکاف' },
  { id: 'built_quality', titleFa: 'کیفیت کالبدی', owner: 'Built Environment', samplesFa: 'سن ساختمان، وضعیت بافت، کیفیت سازه‌ای' },
] as const;

export const RT_VIS_DASHBOARD_TYPES_8 = [
  'Public Dashboard', 'Market Dashboard', 'Neighborhood Dashboard', 'Research Dashboard',
  'Professional Dashboard', 'Administrative Dashboard', 'Data Quality Dashboard', 'Operations Dashboard',
] as const;

export const RT_VIS_CHOROPLETH_METHODS_5 = [
  'Equal Interval', 'Quantile', 'Natural Breaks', 'Standard Deviation', 'Custom Thresholds',
] as const;

export const RT_VIS_DELIVERABLES_33 = [
  { id: 'RT-FE-VIS-OUT-001', titleFa: 'Visualization Architecture Inventory' },
  { id: 'RT-FE-VIS-OUT-002', titleFa: 'Visualization Contract' },
  { id: 'RT-FE-VIS-OUT-003', titleFa: 'Metric Registry' },
  { id: 'RT-FE-VIS-OUT-004', titleFa: 'Dimension Registry' },
  { id: 'RT-FE-VIS-OUT-005', titleFa: 'Chart Registry' },
  { id: 'RT-FE-VIS-OUT-006', titleFa: 'Visualization Schema' },
  { id: 'RT-FE-VIS-OUT-007', titleFa: 'Chart Renderer Architecture' },
  { id: 'RT-FE-VIS-OUT-008', titleFa: 'Data Adapter Architecture' },
  { id: 'RT-FE-VIS-OUT-009', titleFa: 'Time Series Visualization' },
  { id: 'RT-FE-VIS-OUT-010', titleFa: 'Distribution Visualization' },
  { id: 'RT-FE-VIS-OUT-011', titleFa: 'Scatter Plot Architecture' },
  { id: 'RT-FE-VIS-OUT-012', titleFa: 'Spatial Visualization' },
  { id: 'RT-FE-VIS-OUT-013', titleFa: 'Dashboard Architecture' },
  { id: 'RT-FE-VIS-OUT-014', titleFa: 'Dashboard Registry' },
  { id: 'RT-FE-VIS-OUT-015', titleFa: 'Widget Architecture' },
  { id: 'RT-FE-VIS-OUT-016', titleFa: 'Dashboard Layout Management' },
  { id: 'RT-FE-VIS-OUT-017', titleFa: 'Drill-down Architecture' },
  { id: 'RT-FE-VIS-OUT-018', titleFa: 'Cross-filtering Architecture' },
  { id: 'RT-FE-VIS-OUT-019', titleFa: 'Temporal Comparison' },
  { id: 'RT-FE-VIS-OUT-020', titleFa: 'Spatial Comparison' },
  { id: 'RT-FE-VIS-OUT-021', titleFa: 'Uncertainty Visualization' },
  { id: 'RT-FE-VIS-OUT-022', titleFa: 'Annotation Architecture' },
  { id: 'RT-FE-VIS-OUT-023', titleFa: 'KPI Visualization' },
  { id: 'RT-FE-VIS-OUT-024', titleFa: 'Interaction Registry' },
  { id: 'RT-FE-VIS-OUT-025', titleFa: 'Responsive Visualization' },
  { id: 'RT-FE-VIS-OUT-026', titleFa: 'Accessibility Specification' },
  { id: 'RT-FE-VIS-OUT-027', titleFa: 'Export & Print Architecture' },
  { id: 'RT-FE-VIS-OUT-028', titleFa: 'Performance Specification' },
  { id: 'RT-FE-VIS-OUT-029', titleFa: 'Cloudflare Integration Specification' },
  { id: 'RT-FE-VIS-OUT-030', titleFa: 'Testing Strategy' },
  { id: 'RT-FE-VIS-OUT-031', titleFa: 'Telemetry Specification' },
  { id: 'RT-FE-VIS-OUT-032', titleFa: 'Migration Plan' },
  { id: 'RT-FE-VIS-OUT-033', titleFa: 'Final Acceptance Test Suite' },
] as const;

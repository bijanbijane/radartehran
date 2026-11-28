/**
 * @file src/design-system/componentFamilyCoverage.ts
 * Evidence-bounded mapping from the design-system catalog to implemented families.
 */
import { COMPONENT_CATALOG } from './componentSystem';

export type ComponentFamilyCoverageStatus = 'contract_verified' | 'partial' | 'not_verified';

export interface ComponentFamilyCoverage {
  readonly catalogId: string;
  readonly group: string;
  readonly status: ComponentFamilyCoverageStatus;
  readonly owner: string;
  readonly implementationRefs: readonly string[];
  readonly contractEvidence: string;
  readonly stateMatrix: string;
  readonly qaAcceptance: string;
  readonly knownGaps: string;
}

/**
 * Coverage is intentionally evidence-bounded. "partial" means a real implementation
 * exists but the catalog family is not yet represented by one complete shared contract.
 */
export const COMPONENT_FAMILY_COVERAGE: readonly ComponentFamilyCoverage[] = [
  {
    catalogId: 'C01', group: 'Buttons', status: 'contract_verified',
    owner: 'src/components/common and src/components/ui',
    implementationRefs: ['src/components/common/RadarButton.tsx', 'src/components/ui/RadarPrimitives.tsx'],
    contractEvidence: 'Canonical RadarButtonProps plus explicit legacy variant/size adapter maps.',
    stateMatrix: 'Default, hover, pressed, focus-visible, disabled and loading are specified; legacy adapter inherits canonical states.',
    qaAcceptance: 'RT-UI-COMP-002 and RT-UI-COMP-BEH-001/002; canonical and adapter SSR semantics verified.',
    knownGaps: 'Mounted pointer/keyboard activation tests and full icon-only consumer audit remain open.',
  },
  {
    catalogId: 'C02', group: 'Inputs', status: 'partial',
    owner: 'src/components/common and src/components/ui',
    implementationRefs: ['src/components/common/RadarInput.tsx', 'src/components/common/RadarField.tsx', 'src/components/ui/RadarPrimitives.tsx'],
    contractEvidence: 'RadarInputProps, RadarInputFieldProps and RadarSearchInput props are typed in their implementations.',
    stateMatrix: 'Default, focus, invalid, disabled, read-only, helper/error and filled-value states are represented across the implementations.',
    qaAcceptance: 'RT-UI-COMP-BEH-003/004/008 verify invalid state, label/error association and search accessible naming.',
    knownGaps: 'Select, multi-select, date, range and autocomplete contracts are not unified in the shared primitive layer.',
  },
  {
    catalogId: 'C03', group: 'Navigation', status: 'partial',
    owner: 'src/components/ui and src/components/navigation',
    implementationRefs: ['src/components/ui/RadarPrimitives.tsx', 'src/components/navigation/ModuleSecondaryNav.tsx'],
    contractEvidence: 'RadarTabs exposes a controlled typed contract; ModuleSecondaryNav owns contextual secondary navigation.',
    stateMatrix: 'Active/inactive tab, selected roving tabIndex and keyboard arrow/Home/End transitions are implemented in RadarTabs.',
    qaAcceptance: 'RT-UI-COMP-BEH-007 verifies tablist semantics, selected state and mobile target class.',
    knownGaps: 'Breadcrumb, sidebar, pagination and global navigation do not yet share one component-level contract registry.',
  },
  {
    catalogId: 'C04', group: 'Controls', status: 'partial',
    owner: 'Feature-local controls under src/components and src/features',
    implementationRefs: ['src/components/TopBarProvinceControl.tsx', 'src/features/properties/filters/PropertyFilterPanel.tsx'],
    contractEvidence: 'Province selection and property filter controls have feature-local TypeScript props/state contracts.',
    stateMatrix: 'Selection, expanded/collapsed filter and applied/draft filter states are implemented locally.',
    qaAcceptance: 'Existing feature tests and browser flows cover portions of these controls; no shared control-family regression suite was found in the audited paths.',
    knownGaps: 'Checkbox, radio, switch, select and range controls remain distributed; no canonical shared control owner is established.',
  },
  {
    catalogId: 'C05', group: 'Cards', status: 'partial',
    owner: 'src/components/common, src/components/ui and src/features/properties',
    implementationRefs: ['src/components/common/RadarSurfaceCard.tsx', 'src/components/common/RadarCard.tsx', 'src/components/common/RadarDataBadges.tsx', 'src/components/ui/RadarPrimitives.tsx', 'src/features/properties/results/PropertyCard.tsx'],
    contractEvidence: 'The passive data/UI Card wrappers now delegate to RadarSurfaceCard; semantic common RadarCard and property-domain PropertyCard retain distinct contracts.',
    stateMatrix: 'Shared passive surface, metric presentation, semantic article content and experimental interactive-article states are recorded per API.',
    qaAcceptance: 'RT-UI-COMP-BEH-005 verifies semantic article/passive wrapper differences; RT-UI-COMP-BEH-011 verifies shared surface classes and legacy padding mappings.',
    knownGaps: 'No unified Card migration is justified yet; common RadarCard interactive mode remains Experimental pending consumer and nested-interactive review.',
  },
  {
    catalogId: 'C06', group: 'Map Components', status: 'partial',
    owner: 'src/components and src/shared/geo-ui',
    implementationRefs: ['src/components/MapLegend.tsx', 'src/shared/geo-ui/MapLegend.tsx'],
    contractEvidence: 'Two separately typed MapLegend implementations exist with distinct responsibilities and contracts.',
    stateMatrix: 'Legend visibility, category/data swatches and map-control states are implemented within their owning modules.',
    qaAcceptance: 'Map-specific tests and Stage 07 GIS UI audit evidence cover portions of map controls and legend behavior.',
    knownGaps: 'MapCanvas, toolbar, layer selector, legend and contextual controls do not yet have one complete shared family registry.',
  },
  {
    catalogId: 'C07', group: 'Panels', status: 'partial',
    owner: 'src/components and src/features/properties',
    implementationRefs: ['src/components/NeighborhoodInspectorDrawer.tsx', 'src/features/properties/filters/PropertyFilterPanel.tsx', 'src/components/ui/RadarPrimitives.tsx'],
    contractEvidence: 'Inspector drawer, property filter panel and RadarSheet expose separate domain/modal props.',
    stateMatrix: 'Open/closed, responsive drawer/sheet and scrollable panel states exist in their individual implementations.',
    qaAcceptance: 'Existing mobile and modal-stack browser regressions cover selected sheet/panel lifecycle behavior.',
    knownGaps: 'Context, filter, detail and settings panels do not yet share one responsive panel contract.',
  },
  {
    catalogId: 'C08', group: 'Overlays', status: 'partial',
    owner: 'src/components and src/utils/interactions',
    implementationRefs: ['src/components/useDialogFocus.ts', 'src/utils/interactions/dialogStack.ts', 'src/components/ui/RadarPrimitives.tsx'],
    contractEvidence: 'useDialogFocus, dialogStack and RadarSheet define focus, topmost ownership, scroll-lock and modal lifecycle contracts.',
    stateMatrix: 'Open/closed, topmost/non-topmost, Escape, Tab trap, focus restoration, reference-counted body scroll lock and topmost-modal aria-hidden isolation are implemented; native inert isolation is not implemented.',
    qaAcceptance: 'Modal stack tests, Stage 12 frontend Playwright and RT-UI-COMP-BEH-009 cover modal ownership and rendered dialog semantics.',
    knownGaps: 'Native inert isolation is not used; aria-hidden isolation is covered by fake-DOM sibling/nested-portal tests but needs mounted browser and assistive-technology verification. Popover, tooltip and toast families are outside this modal contract.',
  },
  {
    catalogId: 'C09', group: 'Data Display', status: 'partial',
    owner: 'src/components/common and src/components',
    implementationRefs: ['src/components/common/RadarDataBadges.tsx', 'src/components/ExpandableComparisonTable.tsx'],
    contractEvidence: 'DataCredibilityBadge, DataProvenanceBar, RadarMetricCard and comparison table have typed source contracts.',
    stateMatrix: 'Verified/estimated/incomplete/stale credibility tones and expanded/collapsed comparison states are represented.',
    qaAcceptance: 'RT-UI-COMP-BEH-006/010 verify localized credibility and metric source/unit content.',
    knownGaps: 'A common DataTable/Chart source-unit-provenance contract and visual variant suite are not yet established.',
  },
  {
    catalogId: 'C10', group: 'Feedback', status: 'partial',
    owner: 'src/components/common',
    implementationRefs: ['src/components/common/RadarSkeleton.tsx', 'src/components/common/RadarField.tsx'],
    contractEvidence: 'RadarSkeleton and RadarEmptyStateCard have explicit props; field errors use helper/error descriptions.',
    stateMatrix: 'Loading skeleton, empty content, helper text and error alert states are represented.',
    qaAcceptance: 'RT-UI-COMP-BEH-004/010 verify field error and empty-state content; skeleton-specific visual coverage remains separate.',
    knownGaps: 'Toast, global notification, error-boundary and loading feedback variants are not yet covered by a single acceptance matrix.',
  },
  {
    catalogId: 'C11', group: 'Domain Components', status: 'partial',
    owner: 'src/features/properties and src/components/common',
    implementationRefs: ['src/features/properties/results/PropertyCard.tsx', 'src/components/common/RadarDataBadges.tsx'],
    contractEvidence: 'PropertyCard and RadarMetricCard have domain-facing props and distinct data/credibility responsibilities.',
    stateMatrix: 'Property lifecycle/status and metric credibility states are represented in their owning modules.',
    qaAcceptance: 'Stage 12 property/QA semantic-token regression and RT-UI-COMP-BEH-010 verify selected domain/data states.',
    knownGaps: 'RTD01–RTD10 domain component family ownership and cross-domain contract coverage remain incomplete.',
  },
] as const satisfies readonly ComponentFamilyCoverage[];

export interface ComponentFamilyCoverageIssue {
  readonly code: 'duplicate_catalog_id' | 'unknown_catalog_id' | 'catalog_group_mismatch' | 'invalid_coverage_status' | 'missing_catalog_family' | 'missing_owner' | 'missing_implementation_reference' | 'missing_contract_evidence' | 'missing_state_matrix' | 'missing_qa_acceptance' | 'missing_known_gap';
  readonly catalogId: string;
}

export function validateComponentFamilyCoverage(
  entries: readonly ComponentFamilyCoverage[] = COMPONENT_FAMILY_COVERAGE,
): ComponentFamilyCoverageIssue[] {
  const issues: ComponentFamilyCoverageIssue[] = [];
  const catalogById = new Map(COMPONENT_CATALOG.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.catalogId)) issues.push({ code: 'duplicate_catalog_id', catalogId: entry.catalogId });
    seen.add(entry.catalogId);
    const catalogEntry = catalogById.get(entry.catalogId);
    if (!catalogEntry) issues.push({ code: 'unknown_catalog_id', catalogId: entry.catalogId });
    else if (catalogEntry.group !== entry.group) issues.push({ code: 'catalog_group_mismatch', catalogId: entry.catalogId });
    if (!['contract_verified', 'partial', 'not_verified'].includes(entry.status)) {
      issues.push({ code: 'invalid_coverage_status', catalogId: entry.catalogId });
    }
    if (!entry.owner.trim()) issues.push({ code: 'missing_owner', catalogId: entry.catalogId });
    if (entry.implementationRefs.length === 0 || entry.implementationRefs.some((path) => !path.startsWith('src/'))) {
      issues.push({ code: 'missing_implementation_reference', catalogId: entry.catalogId });
    }
    if (!entry.contractEvidence.trim()) issues.push({ code: 'missing_contract_evidence', catalogId: entry.catalogId });
    if (!entry.stateMatrix.trim()) issues.push({ code: 'missing_state_matrix', catalogId: entry.catalogId });
    if (!entry.qaAcceptance.trim()) issues.push({ code: 'missing_qa_acceptance', catalogId: entry.catalogId });
    if (!entry.knownGaps.trim()) issues.push({ code: 'missing_known_gap', catalogId: entry.catalogId });
  }

  for (const entry of COMPONENT_CATALOG) {
    if (!seen.has(entry.id)) issues.push({ code: 'missing_catalog_family', catalogId: entry.id });
  }

  return issues;
}

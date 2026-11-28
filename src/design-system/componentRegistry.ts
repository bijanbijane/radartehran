/**
 * @file src/design-system/componentRegistry.ts
 * Machine-checked implementation inventory for the shared UI primitives.
 *
 * This registry intentionally lists only components whose implementation and
 * public contract were inspected. It is not a claim that every catalog family
 * is fully implemented or runtime-verified.
 */
import { MANDATORY_COMPONENT_SPEC_FIELDS } from './componentSystem';
import type { ComponentArchitectureLayer, ComponentGovernanceStatus } from './componentSystem';

export type ComponentSpecField = (typeof MANDATORY_COMPONENT_SPEC_FIELDS)[number];
export type ComponentSpec = Readonly<Record<ComponentSpecField, string>>;

export interface ComponentRegistryEntry {
  readonly id: string;
  readonly name: string;
  readonly layer: ComponentArchitectureLayer;
  readonly owner: string;
  readonly implementation: string;
  readonly publicContract: string;
  readonly governance: ComponentGovernanceStatus;
  readonly spec: ComponentSpec;
}

const spec = (values: ComponentSpec): ComponentSpec => values;

export const COMPONENT_IMPLEMENTATION_REGISTRY = [
  {
    id: 'RT-COMP-BUTTON-001',
    name: 'RadarButton',
    layer: 'primitive',
    owner: 'src/components/common',
    implementation: 'src/components/common/RadarButton.tsx',
    publicContract: 'RadarButtonProps',
    governance: 'Stable',
    spec: spec({
      id_and_name: 'RT-COMP-BUTTON-001 — RadarButton',
      purpose: 'Canonical semantic button primitive for application actions.',
      anatomy: 'Native button; optional leading icon; text content; optional trailing icon; loading spinner.',
      dimensions: 'Four sizes xs/sm/md/lg; mobile minimum height 44px except lg 48px.',
      color_and_typography: 'Six semantic variants backed by canonical CSS variables; inherited typography uses semibold 1.4 line-height.',
      interactive_states: 'Default, hover, pressed, focus-visible, disabled and loading; disabled/loading suppress activation.',
      desktop_behavior: 'Native button semantics; caller controls placement and width; fullWidth is opt-in.',
      mobile_behavior: 'Touch targets are at least 44px high for xs/sm/md and 48px for lg.',
      accessibility: 'Native button, disabled state, aria-busy while loading, accessibleLabel/aria-label support, visible focus ring.',
      allowed_usage: 'Primitive actions and form submission controls with a clear action label.',
      forbidden_usage: 'Navigation destinations; use an anchor/link. Do not use icon-only variant without an accessible name.',
      props_contract: 'RadarButtonProps; native button attributes plus variant, size, loading, fullWidth, icons and accessibleLabel.',
      qa_acceptance: 'SSR contract tests assert native button, disabled/loading semantics, accessible name and variant class mapping.',
    }),
  },
  {
    id: 'RT-COMP-BUTTON-LEGACY-001',
    name: 'RadarPrimitives.RadarButton',
    layer: 'primitive',
    owner: 'src/components/ui',
    implementation: 'src/components/ui/RadarPrimitives.tsx',
    publicContract: 'RadarButtonProps',
    governance: 'Stable',
    spec: spec({
      id_and_name: 'RT-COMP-BUTTON-LEGACY-001 — RadarPrimitives.RadarButton',
      purpose: 'Backward-compatible adapter for the historical UI button API.',
      anatomy: 'Delegates rendering to common/RadarButton; preserves legacy leadingIcon and class contract.',
      dimensions: 'Legacy sm/md/lg map to canonical sizes; sm preserves the minimum width contract.',
      color_and_typography: 'Legacy primary/secondary/outline/ghost/danger map to canonical semantic variants.',
      interactive_states: 'Inherits canonical focus, disabled and loading behavior; legacy API does not expose loading separately.',
      desktop_behavior: 'Retains legacy whitespace-nowrap and shrink-0 layout behavior.',
      mobile_behavior: 'Legacy sm keeps a 44px minimum width on mobile and 36px at md+.',
      accessibility: 'Inherits native button semantics and accessible attributes from the canonical primitive.',
      allowed_usage: 'Existing consumers that still import RadarButton from ui/RadarPrimitives.',
      forbidden_usage: 'New code; import common/RadarButton directly for the canonical contract.',
      props_contract: 'Legacy RadarButtonProps with five variants and three sizes; explicit mapping constants.',
      qa_acceptance: 'Regression tests assert all legacy variant/size mappings and SSR tests assert native button output.',
    }),
  },
  {
    id: 'RT-COMP-INPUT-001',
    name: 'RadarInput',
    layer: 'primitive',
    owner: 'src/components/common',
    implementation: 'src/components/common/RadarInput.tsx',
    publicContract: 'RadarInputProps',
    governance: 'Stable',
    spec: spec({
      id_and_name: 'RT-COMP-INPUT-001 — RadarInput',
      purpose: 'Low-level composable native text/search input.',
      anatomy: 'Single native input with forwarded ref and optional validation styling.',
      dimensions: 'sm/md/lg; mobile minimum height 44px for sm/md and 48px for lg.',
      color_and_typography: 'Surface, text, placeholder, border and danger states use semantic theme tokens.',
      interactive_states: 'Default, focus, invalid, disabled and native read-only states.',
      desktop_behavior: 'Fills the available inline width; caller owns label, helper and layout composition.',
      mobile_behavior: 'Maintains 44–48px minimum touch height.',
      accessibility: 'Native input semantics; invalid prop sets aria-invalid; labels and descriptions are provided by the composing field.',
      allowed_usage: 'Low-level input composition where caller owns label and validation messaging.',
      forbidden_usage: 'Standalone unlabeled form control; use RadarInputField or provide an accessible label.',
      props_contract: 'RadarInputProps extends native input attributes; inputSize and invalid are component-specific.',
      qa_acceptance: 'SSR tests assert native input, aria-invalid for invalid state and forwarded native attributes.',
    }),
  },
  {
    id: 'RT-COMP-FIELD-001',
    name: 'RadarInputField',
    layer: 'composite',
    owner: 'src/components/common',
    implementation: 'src/components/common/RadarField.tsx',
    publicContract: 'RadarInputFieldProps',
    governance: 'Stable',
    spec: spec({
      id_and_name: 'RT-COMP-FIELD-001 — RadarInputField',
      purpose: 'Labeled input composite with numeric normalization and inline validation feedback.',
      anatomy: 'Label/required marker; native input; optional leading/trailing icon or unit; helper/error text.',
      dimensions: 'compact 36px; standard 44px; comfortable 48px; touch 52px minimum heights.',
      color_and_typography: 'Semantic surface, text, border, focus and danger tokens with 13–15px functional typography.',
      interactive_states: 'Default, focus, filled, invalid, disabled and read-only.',
      desktop_behavior: 'Label and helper/error copy remain associated with the input; optional unit is placed at inline end.',
      mobile_behavior: 'Standard and larger presets meet or exceed 44px touch target.',
      accessibility: 'useId-generated label association, aria-invalid, aria-describedby, required and role=alert for errors.',
      allowed_usage: 'Forms requiring a visible label, helper text, numeric digit normalization or unit context.',
      forbidden_usage: 'Generic button-like or non-form content; do not duplicate label IDs manually.',
      props_contract: 'RadarInputFieldProps; controlled value/onChangeValue; optional numeric, unit, size, helper/error and disabled/readOnly.',
      qa_acceptance: 'SSR tests assert label/input association, invalid description and helper association.',
    }),
  },
  {
    id: 'RT-COMP-CARD-001',
    name: 'RadarCard',
    layer: 'primitive',
    owner: 'src/components/common',
    implementation: 'src/components/common/RadarCard.tsx',
    publicContract: 'RadarCardProps',
    governance: 'Experimental',
    spec: spec({
      id_and_name: 'RT-COMP-CARD-001 — common RadarCard',
      purpose: 'Semantic article surface with optional title, subtitle and content density.',
      anatomy: 'Optional heading/subtitle block followed by a content container.',
      dimensions: 'sm/md/lg padding presets; responsive md/lg spacing.',
      color_and_typography: 'Uses shared card surface, focus ring, primary and muted text class maps.',
      interactive_states: 'Non-interactive article by default; interactive mode currently uses button role and keyboard activation.',
      desktop_behavior: 'Content follows article flow; interactive behavior is enabled only when both interactive and onClick are provided.',
      mobile_behavior: 'Padding scales by preset; no separate responsive interaction mode.',
      accessibility: 'Article semantics by default; interactive mode is keyboard-focusable with Enter/Space activation. Native-control semantics and disabled support are not yet established.',
      allowed_usage: 'Non-interactive information/metric/action grouping; interactive mode requires explicit accessibility review.',
      forbidden_usage: 'Do not nest links/buttons inside interactive mode; do not use as a navigation link.',
      props_contract: 'RadarCardProps: variant, title, subtitle, padding, interactive, className, children, onClick.',
      qa_acceptance: 'SSR tests cover article semantics and title/subtitle; interactive runtime keyboard behavior remains a follow-up.',
    }),
  },
  {
    id: 'RT-COMP-CARD-002',
    name: 'RadarDataBadges.RadarCard',
    layer: 'primitive',
    owner: 'src/components/common',
    implementation: 'src/components/common/RadarDataBadges.tsx',
    publicContract: 'RadarCardProps',
    governance: 'Stable',
    spec: spec({
      id_and_name: 'RT-COMP-CARD-002 — RadarDataBadges.RadarCard',
      purpose: 'Simple surface wrapper used by metric and design-lab content.',
      anatomy: 'Single div surface with children.',
      dimensions: 'compact/standard/large padding presets.',
      color_and_typography: 'Semantic surface, border and optional elevation shadow tokens.',
      interactive_states: 'Non-interactive surface; no built-in hover or focus state.',
      desktop_behavior: 'Block-level content wrapper; caller owns composition.',
      mobile_behavior: 'Padding remains compact/standard/large; no interactive target implied.',
      accessibility: 'Neutral grouping only; caller provides headings and semantics for contained content.',
      allowed_usage: 'Metric cards and passive grouped data content.',
      forbidden_usage: 'Clickable surface or standalone navigation/action control.',
      props_contract: 'padding, elevated, className and required children.',
      qa_acceptance: 'SSR tests assert passive div surface and padding preset; no interactive role is emitted.',
    }),
  },
  {
    id: 'RT-COMP-CARD-003',
    name: 'RadarPrimitives.RadarCard',
    layer: 'primitive',
    owner: 'src/components/ui',
    implementation: 'src/components/ui/RadarPrimitives.tsx',
    publicContract: 'RadarCardProps',
    governance: 'Experimental',
    spec: spec({
      id_and_name: 'RT-COMP-CARD-003 — RadarPrimitives.RadarCard',
      purpose: 'Generic passive card wrapper retained for legacy UI consumers.',
      anatomy: 'Single div surface with optional padding and children.',
      dimensions: 'Boolean padded switch selects standard or zero padding.',
      color_and_typography: 'Semantic surface, subtle border and 12px radius.',
      interactive_states: 'Passive container; no click, hover or focus behavior.',
      desktop_behavior: 'Block-level wrapper; caller owns content layout.',
      mobile_behavior: 'Same padding switch at all widths.',
      accessibility: 'No interactive role; semantics are provided by descendants and surrounding context.',
      allowed_usage: 'Existing passive wrapper consumers.',
      forbidden_usage: 'Clickable card or domain-specific card content; use a domain component.',
      props_contract: 'className, padded and required children.',
      qa_acceptance: 'SSR tests assert div semantics, border and padded/unpadded class behavior.',
    }),
  },
] as const satisfies readonly ComponentRegistryEntry[];

export interface ComponentRegistryIssue {
  readonly code: 'duplicate_id' | 'missing_spec_field' | 'empty_spec_field' | 'missing_implementation' | 'missing_contract';
  readonly componentId: string;
  readonly field?: string;
}

export function validateComponentRegistry(
  entries: readonly ComponentRegistryEntry[] = COMPONENT_IMPLEMENTATION_REGISTRY,
): ComponentRegistryIssue[] {
  const issues: ComponentRegistryIssue[] = [];
  const seenIds = new Set<string>();

  for (const entry of entries) {
    if (seenIds.has(entry.id)) issues.push({ code: 'duplicate_id', componentId: entry.id });
    seenIds.add(entry.id);

    if (!entry.implementation.trim()) issues.push({ code: 'missing_implementation', componentId: entry.id });
    if (!entry.publicContract.trim()) issues.push({ code: 'missing_contract', componentId: entry.id });

    for (const field of MANDATORY_COMPONENT_SPEC_FIELDS) {
      if (!(field in entry.spec)) issues.push({ code: 'missing_spec_field', componentId: entry.id, field });
      else if (!entry.spec[field].trim()) issues.push({ code: 'empty_spec_field', componentId: entry.id, field });
    }
  }

  return issues;
}

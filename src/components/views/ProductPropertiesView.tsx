/** @file src/components/views/ProductPropertiesView.tsx — Real Estate Listings, Split Map Toggle (RT-L06) & Property Detail View (RT-L07 / RT-UI-PROPERTY-001) */
import React from 'react';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import type { PrimaryViewId } from '../../utils/areaUnit';
import type { PropertiesSubTabId } from '../../navigation/registry/route.types';
import { PropertyExplorerPage } from '../../features/properties/pages/PropertyExplorerPage';

export interface ProductPropertiesViewProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  activeSubTab?: PropertiesSubTabId;
  onChangeSubTab?: (tab: PropertiesSubTabId) => void;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onOpenInspector: (hood: EvaluatedNeighborhood) => void;
  onOpenHedonicForProperty: (hood: EvaluatedNeighborhood, params?: { sqm?: number }) => void;
  onNavigateView: (view: PrimaryViewId) => void;
  targetSqm: number;
  splitMapMode?: boolean;
  onToggleSplitMap?: () => void;
}

class PropertiesSectionErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 m-4 rounded-xl border border-amber-300 bg-amber-50 text-xs text-amber-900">
          بخش املاک با خطای موقت مواجه شد. لطفاً صفحه را تازه‌سازی یا فیلترها را بازنشانی کنید.
        </div>
      );
    }
    return this.props.children;
  }
}

export function ProductPropertiesView(p: ProductPropertiesViewProps): React.ReactElement {
  return (
    <PropertiesSectionErrorBoundary>
      <PropertyExplorerPage
        evaluatedNeighborhoods={p.evaluatedNeighborhoods}
        selectedHood={p.selectedHood}
        activeSubTab={p.activeSubTab}
        onChangeSubTab={p.onChangeSubTab}
        onSelectNeighborhood={p.onSelectNeighborhood}
        onOpenInspector={p.onOpenInspector}
        onOpenHedonicForProperty={p.onOpenHedonicForProperty}
        onNavigateView={p.onNavigateView}
        targetSqm={p.targetSqm}
        splitMapMode={p.splitMapMode}
        onToggleSplitMap={p.onToggleSplitMap}
      />
    </PropertiesSectionErrorBoundary>
  );
}

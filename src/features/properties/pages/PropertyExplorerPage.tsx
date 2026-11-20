/** @file src/features/properties/pages/PropertyExplorerPage.tsx — Stage 19 Main Orchestrator */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { resolveCityIdForNeighborhood, type CityId } from '../../../data/multiCityData';
import { type PrimaryViewId } from '../../../utils/areaUnit';
import { useAreaUnit, useExchangeRateSnapshot, useIntlCurrency, useRadarLocale } from '../../../components/AreaUnitToggle';
import type { PropertiesSubTabId } from '../../../navigation/registry/route.types';
import {
  commitPropertyFilterDraft,
  createDefaultPropertyFilters,
  isPropertyFilterDirty,
  type AppliedPropertyFilters,
  type PropertyFilterDraft,
} from '../filters/PropertyFilterDraft';
import { buildHonestListingHistory, buildPropertyListingRecords } from '../services/propertyDataAdapter';
import { filterAndSortProperties, getSimilarListings, StaleRequestGuard } from '../services/propertySearchService';
import {
  loadMyListings,
  loadSavedProperties,
  loadUserListingHistory,
  saveMyListings,
  saveSavedProperties,
  submitListingReport,
  toggleSavedProperty,
  type SavedPropertySnapshot,
} from '../services/listingService';
import { ACCOUNT_WORKSPACE_UPDATED_EVENT } from '../../account/services/accountStorageScope';
import { optimisticUpdateListing } from '../moderation/ListingValidation';
import { trackPropertyEvent } from '../state/propertyUrlAdapter';
import type { PropertyListingRecord } from '../types/listing.types';
import { PropertyFilterBar, type PropertyExplorerViewMode } from '../filters/PropertyFilterBar';
import { PropertyFilterPanel } from '../filters/PropertyFilterPanel';
import { PropertyExplorerHeader, type ExplorerSectionTab } from '../results/PropertyExplorerHeader';
import { PropertyDiscoveryGrid } from '../results/PropertyDiscoveryGrid';
import { PropertyDetailPage } from '../detail/PropertyDetailPage';
import { PropertyComparisonModal } from '../comparison/PropertyComparisonModal';
import { ListingSubmissionPage } from '../submission/ListingSubmissionPage';
import { MyListingsAndSavedView } from '../account/MyListingsAndSavedView';

export interface PropertyExplorerPageProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  activeCity?: CityId;
  activeSubTab?: PropertiesSubTabId;
  currentUserUid?: string | null;
  onChangeSubTab?: (tab: PropertiesSubTabId) => void;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onOpenInspector: (hood: EvaluatedNeighborhood) => void;
  onOpenHedonicForProperty: (hood: EvaluatedNeighborhood, params?: { sqm?: number }) => void;
  onNavigateView: (view: PrimaryViewId) => void;
  targetSqm: number;
  splitMapMode?: boolean;
  onToggleSplitMap?: () => void;
}

export const PropertyExplorerPage: React.FC<PropertyExplorerPageProps> = (p) => {
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [radarLocale] = useRadarLocale();
  useExchangeRateSnapshot();
  const isEn = radarLocale === 'en';
  const resolvedCityId = p.activeCity || resolveCityIdForNeighborhood(p.selectedHood.id);
  const reqGuardRef = useRef(new StaleRequestGuard());

  const [sectionTab, setSectionTab] = useState<ExplorerSectionTab>('discover');
  const [myListings, setMyListings] = useState<PropertyListingRecord[]>(() => loadMyListings(p.currentUserUid));
  const [savedItems, setSavedItems] = useState<SavedPropertySnapshot[]>(() => loadSavedProperties(p.currentUserUid));
  useEffect(() => {
    const syncScopedListings = () => {
      setMyListings(loadMyListings(p.currentUserUid));
      setSavedItems(loadSavedProperties(p.currentUserUid));
    };
    syncScopedListings();
    window.addEventListener(ACCOUNT_WORKSPACE_UPDATED_EVENT, syncScopedListings);
    return () => window.removeEventListener(ACCOUNT_WORKSPACE_UPDATED_EVENT, syncScopedListings);
  }, [p.currentUserUid]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<PropertyExplorerViewMode>(p.splitMapMode ? 'list' : 'split');

  const initialTx = p.activeSubTab === 'rent' ? 'rent' : p.activeSubTab === 'buy' ? 'sale' : 'all';
  const [draft, setDraft] = useState<PropertyFilterDraft>(() => createDefaultPropertyFilters(initialTx));
  const [applied, setApplied] = useState<AppliedPropertyFilters>(() => commitPropertyFilterDraft(draft));

  useEffect(() => {
    setSelectedListingId(null);
    if (p.activeSubTab === 'all') {
      setDraft((prev) => {
        const next: PropertyFilterDraft = { ...prev, transactionType: 'all', propertyType: 'all' };
        setApplied(commitPropertyFilterDraft(next));
        return next;
      });
    } else if (p.activeSubTab === 'buy') {
      setDraft((prev) => {
        const next: PropertyFilterDraft = { ...prev, transactionType: 'sale', propertyType: 'all' };
        setApplied(commitPropertyFilterDraft(next));
        return next;
      });
    } else if (p.activeSubTab === 'rent') {
      setDraft((prev) => {
        const next: PropertyFilterDraft = { ...prev, transactionType: 'rent', propertyType: 'all' };
        setApplied(commitPropertyFilterDraft(next));
        return next;
      });
    } else if (p.activeSubTab === 'commercial' || p.activeSubTab === 'office') {
      const targetPt = p.activeSubTab;
      setDraft((prev) => {
        const next: PropertyFilterDraft = { ...prev, propertyType: targetPt };
        setApplied(commitPropertyFilterDraft(next));
        return next;
      });
    }
  }, [p.activeSubTab]);

  const allRecords = useMemo(
    () => buildPropertyListingRecords(p.evaluatedNeighborhoods, myListings, resolvedCityId),
    [p.evaluatedNeighborhoods, myListings, resolvedCityId],
  );

  const filteredRecords = useMemo(
    () => filterAndSortProperties(allRecords, applied, p.selectedHood.id),
    [allRecords, applied, p.selectedHood.id],
  );

  const activeDetailRecord = useMemo(
    () => (selectedListingId ? allRecords.find((r) => r.listing.listingId === selectedListingId) || null : null),
    [allRecords, selectedListingId],
  );

  const commitFilters = (nextDraft?: PropertyFilterDraft) => {
    const token = reqGuardRef.current.nextToken();
    const committed = commitPropertyFilterDraft(nextDraft || draft);
    if (!reqGuardRef.current.isLatest(token)) return;
    setApplied(committed);
    trackPropertyEvent('property_filter_applied', { tx: committed.transactionType, pt: committed.propertyType });
  };

  const resetAllFilters = () => {
    const def = createDefaultPropertyFilters('all');
    setDraft(def);
    setApplied(commitPropertyFilterDraft(def));
    p.onChangeSubTab?.('all');
  };

  const handleToggleCompare = (listingId: string) => {
    setCompareIds((prev) =>
      prev.includes(listingId) ? prev.filter((x) => x !== listingId) : [...prev, listingId].slice(0, 4),
    );
    trackPropertyEvent('property_compare_toggled', { listingId });
  };

  const handleToggleSave = (rec: PropertyListingRecord) => {
    setSavedItems(toggleSavedProperty(rec));
    trackPropertyEvent('property_saved_toggled', { listingId: rec.listing.listingId });
  };

  const handleOpenDetail = (listingId: string) => {
    setSelectedListingId(listingId);
    trackPropertyEvent('property_detail_opened', { listingId });
  };

  if (activeDetailRecord) {
    const detailHood = p.evaluatedNeighborhoods.find((h) => h.id === activeDetailRecord.property.hoodId) || p.selectedHood;
    return (
      <PropertyDetailPage
        record={activeDetailRecord}
        hood={detailHood}
        similarRecords={getSimilarListings(activeDetailRecord, allRecords)}
        historyEvents={buildHonestListingHistory(activeDetailRecord, loadUserListingHistory())}
        areaUnit={areaUnit}
        intlCurrency={intlCurrency}
        radarLocale={radarLocale}
        isSaved={savedItems.some((s) => s.listingId === activeDetailRecord.listing.listingId)}
        isCompared={compareIds.includes(activeDetailRecord.listing.listingId)}
        onBack={() => setSelectedListingId(null)}
        onOpenOtherDetail={handleOpenDetail}
        onToggleSave={handleToggleSave}
        onToggleCompare={handleToggleCompare}
        onSelectNeighborhood={p.onSelectNeighborhood}
        onNavigateView={p.onNavigateView}
        onOpenInspector={p.onOpenInspector}
        onOpenValuation={(rec) => p.onOpenHedonicForProperty(detailHood, { sqm: rec.property.areaSqm || p.targetSqm })}
        onReportSubmitted={(listingId, reason, details) => {
          submitListingReport({ id: `rep-${Date.now()}`, listingId, reason, details, createdAtIso: new Date().toISOString() });
          trackPropertyEvent('property_reported', { listingId, reason });
        }}
      />
    );
  }

  return (
    <div className="w-full max-w-[1360px] mx-auto px-4 py-6 space-y-5 animate-fadeIn" data-testid="product-properties-view">
      <PropertyExplorerHeader
        isEn={isEn}
        sectionTab={sectionTab}
        viewMode={viewMode}
        splitMapMode={p.splitMapMode}
        savedCount={savedItems.length}
        myListingsCount={myListings.length}
        compareCount={compareIds.length}
        onChangeSection={setSectionTab}
        onToggleSplitMap={p.onToggleSplitMap}
        onToggleViewMode={() => setViewMode((v) => (v === 'split' ? 'list' : 'split'))}
        onOpenValuation={() => p.onOpenHedonicForProperty(p.selectedHood, { sqm: p.targetSqm })}
        onOpenCompare={() => setCompareOpen(true)}
      />

      {sectionTab === 'submit' ? (
        <ListingSubmissionPage
          evaluatedNeighborhoods={p.evaluatedNeighborhoods}
          selectedHood={p.selectedHood}
          existingRecords={allRecords}
          currentUserUid={p.currentUserUid}
          onCancel={() => setSectionTab('discover')}
          onSubmitted={(created) => {
            setMyListings((prev) => [created, ...prev]);
            setSectionTab('my_listings');
          }}
        />
      ) : sectionTab !== 'discover' ? (
        <MyListingsAndSavedView
          mode={sectionTab}
          savedItems={savedItems}
          allRecords={allRecords}
          myListings={myListings}
          onOpenDetail={handleOpenDetail}
          onRemoveSaved={(target) => {
            if ('listing' in target) setSavedItems(toggleSavedProperty(target));
            else {
              const filtered = savedItems.filter((x) => x.listingId !== target.listingId);
              saveSavedProperties(filtered);
              setSavedItems(filtered);
            }
          }}
          onTogglePublishStatus={(listingId) => {
            const next = myListings.map((r) => {
              if (r.listing.listingId !== listingId) return r;
              const nextStatus = r.listing.status === 'published' ? 'stale' : 'published';
              const res = optimisticUpdateListing(r.listing, { status: nextStatus }, r.listing.version);
              return res.ok ? { ...r, listing: res.updated } : r;
            });
            setMyListings(next);
            saveMyListings(next);
          }}
          onDeleteMyListing={(listingId) => {
            const next = myListings.filter((r) => r.listing.listingId !== listingId);
            setMyListings(next);
            saveMyListings(next);
          }}
          onOpenSubmitWizard={() => setSectionTab('submit')}
        />
      ) : (
        <>
          <PropertyFilterBar
            draft={draft}
            applied={applied}
            isDirty={isPropertyFilterDirty(draft, applied)}
            totalResults={filteredRecords.length}
            selectedHoodName={p.selectedHood.name}
            viewMode={viewMode}
            onChangeViewMode={setViewMode}
            onUpdateDraft={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
            onApply={commitFilters}
            onReset={resetAllFilters}
            onOpenFilterDrawer={() => setFilterModalOpen(true)}
          />
          <PropertyDiscoveryGrid
            records={filteredRecords}
            evaluatedNeighborhoods={p.evaluatedNeighborhoods}
            selectedHood={p.selectedHood}
            applied={applied}
            viewMode={viewMode}
            splitMapMode={p.splitMapMode}
            areaUnit={areaUnit}
            intlCurrency={intlCurrency}
            radarLocale={radarLocale}
            savedItems={savedItems}
            compareIds={compareIds}
            highlightedId={highlightedId}
            targetSqm={p.targetSqm}
            onHighlight={setHighlightedId}
            onChangeViewMode={setViewMode}
            onOpenDetail={handleOpenDetail}
            onToggleSave={handleToggleSave}
            onToggleCompare={handleToggleCompare}
            onOpenValuation={p.onOpenHedonicForProperty}
            onSearchInViewport={(bounds) => {
              const next = { ...draft, mapBounds: bounds, onlyInMapBounds: true };
              setDraft(next); commitFilters(next);
            }}
            onClearViewportBounds={() => {
              const next = { ...draft, mapBounds: null, onlyInMapBounds: false };
              setDraft(next); commitFilters(next);
            }}
            onNavigateView={p.onNavigateView}
            onResetAll={resetAllFilters}
          />
        </>
      )}

      <PropertyFilterPanel
        open={filterModalOpen}
        draft={draft}
        selectedHoodName={p.selectedHood.name}
        onClose={() => setFilterModalOpen(false)}
        onUpdateDraft={setDraft}
        onApply={() => commitFilters()}
        onReset={resetAllFilters}
      />

      <PropertyComparisonModal
        open={compareOpen}
        items={allRecords.filter((r) => compareIds.includes(r.listing.listingId))}
        areaUnit={areaUnit}
        onClose={() => setCompareOpen(false)}
        onRemoveItem={handleToggleCompare}
        onOpenDetail={handleOpenDetail}
      />
    </div>
  );
};

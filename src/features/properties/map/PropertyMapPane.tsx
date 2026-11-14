/** @file src/features/properties/map/PropertyMapPane.tsx — Synced Split Map View with Privacy Precision & Viewport Search */
import React, { useMemo, useState } from 'react';
import { Compass, Layers, MapPin, Shield, ZoomIn, ZoomOut } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import { buildPropertyMapProjection } from '../services/propertyMapService';
import type { GeoBounds } from '../filters/PropertyFilterDraft';
import type { PropertyListingRecord } from '../types/listing.types';

export interface PropertyMapPaneProps {
  records: PropertyListingRecord[];
  highlightedListingId: string | null;
  selectedHoodName: string;
  boundsActive: boolean;
  onHighlightListing: (listingId: string | null) => void;
  onOpenDetail: (listingId: string) => void;
  onSearchInViewport: (bounds: GeoBounds) => void;
  onClearViewportBounds: () => void;
  onOpenFullMap: () => void;
}

export const PropertyMapPane: React.FC<PropertyMapPaneProps> = ({
  records,
  highlightedListingId,
  selectedHoodName,
  boundsActive,
  onHighlightListing,
  onOpenDetail,
  onSearchInViewport,
  onClearViewportBounds,
  onOpenFullMap,
}) => {
  const [zoom, setZoom] = useState(12);
  const [viewportDirty, setViewportDirty] = useState(false);

  const projection = useMemo(
    () => buildPropertyMapProjection(records, zoom, highlightedListingId),
    [records, zoom, highlightedListingId],
  );

  const { bounds } = projection;
  const latSpan = Math.max(0.02, bounds.north - bounds.south + 0.02);
  const lngSpan = Math.max(0.02, bounds.east - bounds.west + 0.02);

  const toPercentPos = (lat: number, lng: number) => {
    const x = ((lng - (bounds.west - 0.01)) / lngSpan) * 86 + 7;
    const y = (1 - (lat - (bounds.south - 0.01)) / latSpan) * 82 + 9;
    return { x: Math.min(93, Math.max(7, x)), y: Math.min(91, Math.max(9, y)) };
  };

  const handleZoom = (delta: number) => {
    setZoom((z) => Math.min(15, Math.max(11, z + delta)));
    setViewportDirty(true);
  };

  const focusedCluster = projection.clusters.find((c) =>
    c.items.some((it) => it.listing.listingId === highlightedListingId),
  );

  return (
    <div
      data-testid="property-map-pane"
      className="rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 overflow-hidden flex flex-col h-[460px] lg:h-[620px] lg:sticky lg:top-4"
    >
      <div className="px-3.5 py-2.5 border-b border-[#DCE3DF] dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 font-bold text-[#182522] dark:text-white">
          <MapPin className="w-4 h-4 text-[#176B63]" />
          <span>نقشه همگام فایل‌ها ({toPersianNum(projection.mappedCount)} موقعیت روی نقشه)</span>
        </div>
        <div className="flex items-center gap-1.5">
          {projection.unavailableCount > 0 && (
            <span className="text-[10.5px] text-[#875000] dark:text-amber-300 font-bold">
              {toPersianNum(projection.unavailableCount)} مورد بدون مختصات دقیق
            </span>
          )}
          <button
            type="button"
            onClick={onOpenFullMap}
            className="px-2.5 py-1 rounded-[7px] border border-[#DCE3DF] dark:border-slate-700 text-[11px] font-bold text-[#176B63] dark:text-emerald-400 hover:bg-[#F1F4F2] dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>نقشه کامل محله ({selectedHoodName})</span>
          </button>
        </div>
      </div>

      {/* Interactive coordinate canvas */}
      <div className="relative flex-1 bg-[#EEF3F0] dark:bg-slate-950 overflow-hidden select-none">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full opacity-35">
          <defs>
            <pattern id="prop-grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#9BB0A6" strokeWidth="0.3" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#prop-grid)" />
        </svg>

        {projection.clusters.map((cl) => {
          const pos = toPercentPos(cl.lat, cl.lng);
          const isActive = cl.items.some((it) => it.listing.listingId === highlightedListingId);
          return (
            <button
              key={cl.id}
              type="button"
              onMouseEnter={() => onHighlightListing(cl.primaryItem.listing.listingId)}
              onClick={() => {
                if (cl.count === 1) onOpenDetail(cl.primaryItem.listing.listingId);
                else {
                  setZoom(14);
                  onHighlightListing(cl.primaryItem.listing.listingId);
                }
              }}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer group focus:outline-none"
              aria-label={cl.isCluster ? `خوشه ${toPersianNum(cl.count)} فایل` : cl.primaryItem.listing.title}
            >
              {cl.precision !== 'exact' && (
                <span
                  className={`block rounded-full border border-dashed ${
                    isActive ? 'w-11 h-11 border-[#176B63] bg-[#176B63]/15' : 'w-8 h-8 border-[#176B63]/40 bg-[#176B63]/10'
                  } -translate-x-1/2 -translate-y-1/2 absolute left-1/2 top-1/2 pointer-events-none`}
                />
              )}
              <span
                className={`relative z-10 px-2 py-0.5 rounded-full text-[10.5px] font-black shadow-sm border transition tabular-nums whitespace-nowrap inline-flex items-center gap-1 ${
                  isActive
                    ? 'bg-[#182522] text-white border-white scale-110'
                    : cl.isCluster
                    ? 'bg-[#176B63] text-white border-white'
                    : 'bg-white dark:bg-slate-900 text-[#182522] dark:text-white border-[#176B63]/60'
                }`}
              >
                {cl.isCluster
                  ? `${toPersianNum(cl.count)} فایل`
                  : cl.primaryItem.listing.price.priceType === 'undisclosed'
                  ? 'توافقی'
                  : cl.primaryItem.listing.price.saleTotalMillion
                  ? `${toPersianNum((cl.primaryItem.listing.price.saleTotalMillion / 1000).toFixed(1))} م.د`
                  : `${toPersianNum(Math.round(cl.primaryItem.listing.price.depositMillion || 0))} م رهن`}
              </span>
            </button>
          );
        })}

        {/* Zoom & Viewport Search Controls */}
        <div className="absolute top-3 left-3 flex flex-col gap-1 z-20">
          <button
            type="button"
            onClick={() => handleZoom(1)}
            aria-label="بزرگنمایی نقشه"
            className="w-8 h-8 rounded-[8px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700 flex items-center justify-center text-[#182522] dark:text-white shadow-sm cursor-pointer"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleZoom(-1)}
            aria-label="کوچک‌نمایی نقشه"
            className="w-8 h-8 rounded-[8px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700 flex items-center justify-center text-[#182522] dark:text-white shadow-sm cursor-pointer"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>

        {(viewportDirty || boundsActive) && (
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
            {viewportDirty && (
              <button
                type="button"
                onClick={() => {
                  const shrink = zoom >= 14 ? 0.45 : zoom >= 13 ? 0.75 : 1;
                  const cLat = (bounds.north + bounds.south) / 2;
                  const cLng = (bounds.east + bounds.west) / 2;
                  const halfLat = Math.max(0.01, ((bounds.north - bounds.south) / 2) * shrink);
                  const halfLng = Math.max(0.01, ((bounds.east - bounds.west) / 2) * shrink);
                  onSearchInViewport({
                    north: cLat + halfLat,
                    south: cLat - halfLat,
                    east: cLng + halfLng,
                    west: cLng - halfLng,
                  });
                  setViewportDirty(false);
                }}
                className="px-3 py-1.5 rounded-[8px] bg-[#182522] text-white text-[11px] font-bold shadow-md flex items-center gap-1 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>جست‌وجو در این محدوده</span>
              </button>
            )}
            {boundsActive && (
              <button
                type="button"
                onClick={onClearViewportBounds}
                className="px-2.5 py-1.5 rounded-[8px] bg-white dark:bg-slate-900 border border-[#DCE3DF] text-[11px] font-bold text-[#B3261E] cursor-pointer shadow-sm"
              >
                حذف محدوده نقشه
              </button>
            )}
          </div>
        )}

        {/* Active Selected Cluster Preview Card */}
        {focusedCluster && (
          <div className="absolute bottom-3 left-3 right-3 z-20 p-3 rounded-[10px] bg-white/95 dark:bg-slate-900/95 border border-[#DCE3DF] dark:border-slate-700 shadow-lg flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <div className="font-black text-[#182522] dark:text-white truncate">{focusedCluster.primaryItem.listing.title}</div>
              <div className="text-[10.5px] text-[#586760] dark:text-slate-400">
                {focusedCluster.primaryItem.property.hoodName} · {focusedCluster.precision === 'approximate' ? `موقعیت تقریبی (شعاع ~${toPersianNum(focusedCluster.privacyRadiusMeters)} متر)` : 'سطح محله'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenDetail(focusedCluster.primaryItem.listing.listingId)}
              className="px-3 py-1.5 rounded-[8px] bg-[#176B63] text-white font-bold text-[11px] shrink-0 cursor-pointer"
            >
              مشاهده
            </button>
          </div>
        )}
      </div>

      <div className="px-3.5 py-2 border-t border-[#DCE3DF] dark:border-slate-800 bg-[#F8F9FA] dark:bg-slate-950 text-[10.5px] text-[#586760] dark:text-slate-400 flex items-center gap-1.5">
        <Shield className="w-3.5 h-3.5 text-[#176B63] shrink-0" />
        <span>برای حفظ حریم خصوصی مالکان، موقعیت فایل‌ها با محدوده تقریبی محله و شعاع حفاظتی نمایش داده می‌شود.</span>
      </div>
    </div>
  );
};

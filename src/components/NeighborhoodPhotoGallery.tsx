import React, { useState, useMemo } from 'react';
import { Camera, ChevronLeft, ChevronRight, Compass, Image as ImageIcon, Maximize2, TrainFront, Wind, ShoppingBag, HeartPulse, Building, X } from 'lucide-react';
import { calcDistanceKm, EvaluatedNeighborhood, LocalLandmark, toPersianNum } from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator';
import { updateMapAdvancedOverlayState } from './mapAdvancedLayers';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';

export interface GalleryItem {
  id: string; title: string; category: string; desc: string;
  icon: React.ReactNode; svgDataUri: string; landmark?: LocalLandmark;
}

export function buildNeighborhoodSvg(
  hoodName: string, type: 'residential' | 'metro' | 'park' | 'shopping' | 'health', score: number = 8.5
): string {
  const safeName = hoodName.replace(/</g, '').replace(/>/g, '');
  let bgGradient = '<stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/>';
  let artElements = ''; let badgeColor = '#059669'; let badgeLabel = 'بافت مسکونی';
  if (type === 'park') {
    bgGradient = '<stop offset="0%" stop-color="#064e3b"/><stop offset="100%" stop-color="#022c22"/>';
    badgeColor = '#10b981'; badgeLabel = 'بوستان و فضای سبز';
    artElements = `
      <polygon points="20,150 100,50 180,150" fill="#047857" opacity="0.3"/>
      <polygon points="120,150 220,30 320,150" fill="#059669" opacity="0.4"/>
      <polygon points="240,150 310,70 380,150" fill="#10b981" opacity="0.2"/>
      <rect y="140" width="400" height="80" fill="#065f46"/>
      <circle cx="80" cy="130" r="28" fill="#10b981"/><rect x="76" y="130" width="8" height="24" fill="#78350f"/>
      <circle cx="150" cy="120" r="34" fill="#34d399"/><rect x="145" y="125" width="10" height="25" fill="#78350f"/>
      <circle cx="230" cy="128" r="26" fill="#059669"/><rect x="226" y="130" width="8" height="22" fill="#78350f"/>
      <circle cx="320" cy="122" r="30" fill="#6ee7b7"/><rect x="316" y="125" width="8" height="25" fill="#78350f"/>
      <path d="M0,200 Q150,165 400,190 L400,220 L0,220 Z" fill="#334155" opacity="0.5"/>
    `;
  } else if (type === 'metro') {
    bgGradient = '<stop offset="0%" stop-color="#1e1b4b"/><stop offset="100%" stop-color="#0f172a"/>';
    badgeColor = '#6366f1'; badgeLabel = 'ایستگاه مترو و بی‌آرتی';
    artElements = `
      <path d="M40,150 Q200,60 360,150" stroke="#818cf8" stroke-width="6" fill="none"/>
      <line x1="200" y1="80" x2="200" y2="170" stroke="#4f46e5" stroke-width="4"/>
      <rect x="60" y="120" width="280" height="48" rx="14" fill="#312e81"/>
      <rect x="80" y="128" width="45" height="22" rx="4" fill="#38bdf8"/>
      <rect x="140" y="128" width="45" height="22" rx="4" fill="#fde68a"/>
      <rect x="200" y="128" width="45" height="22" rx="4" fill="#38bdf8"/>
      <rect x="260" y="128" width="60" height="26" rx="8" fill="#e0e7ff"/>
      <rect y="170" width="400" height="50" fill="#1e293b"/>
      <line x1="0" y1="182" x2="400" y2="182" stroke="#64748b" stroke-width="3"/>
      <line x1="0" y1="192" x2="400" y2="192" stroke="#64748b" stroke-width="3"/>
    `;
  } else if (type === 'shopping') {
    bgGradient = '<stop offset="0%" stop-color="#451a03"/><stop offset="100%" stop-color="#18181b"/>';
    badgeColor = '#f59e0b'; badgeLabel = 'مرکز خرید و تجاری';
    artElements = `
      <rect x="50" y="50" width="300" height="130" rx="6" fill="#27272a"/>
      <polygon points="50,50 200,20 350,50" fill="#3f3f46"/>
      <rect x="70" y="70" width="55" height="90" fill="#fde68a" opacity="0.8"/>
      <rect x="140" y="70" width="55" height="90" fill="#fef08a" opacity="0.9"/>
      <rect x="210" y="70" width="55" height="90" fill="#fed7aa" opacity="0.8"/>
      <rect x="280" y="70" width="50" height="90" fill="#fef08a" opacity="0.8"/>
      <rect y="180" width="400" height="40" fill="#1c1917"/>
      <circle cx="100" cy="180" r="5" fill="#fbbf24"/>
      <circle cx="200" cy="180" r="5" fill="#fbbf24"/>
      <circle cx="300" cy="180" r="5" fill="#fbbf24"/>
    `;
  } else if (type === 'health') {
    bgGradient = '<stop offset="0%" stop-color="#134e4a"/><stop offset="100%" stop-color="#0f172a"/>';
    badgeColor = '#06b6d4'; badgeLabel = 'مرکز درمانی و سلامت';
    artElements = `
      <rect x="80" y="60" width="240" height="120" rx="8" fill="#1e293b"/>
      <rect x="185" y="25" width="30" height="10" fill="#ef4444" rx="2"/>
      <rect x="195" y="15" width="10" height="30" fill="#ef4444" rx="2"/>
      <rect x="105" y="80" width="40" height="28" rx="3" fill="#67e8f9" opacity="0.8"/>
      <rect x="160" y="80" width="40" height="28" rx="3" fill="#67e8f9" opacity="0.8"/>
      <rect x="215" y="80" width="40" height="28" rx="3" fill="#67e8f9" opacity="0.8"/>
      <rect x="270" y="80" width="35" height="28" rx="3" fill="#67e8f9" opacity="0.8"/>
      <rect y="180" width="400" height="40" fill="#0f172a"/>
    `;
  } else {
    bgGradient = '<stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/>';
    badgeColor = '#10b981'; badgeLabel = 'بافت مسکونی و بلوار';
    artElements = `
      <rect x="35" y="45" width="65" height="135" rx="4" fill="#334155"/>
      <rect x="115" y="25" width="80" height="155" rx="4" fill="#1e293b"/>
      <rect x="210" y="55" width="70" height="125" rx="4" fill="#334155"/>
      <rect x="295" y="35" width="75" height="145" rx="4" fill="#1e293b"/>
      <rect x="50" y="60" width="16" height="14" fill="#fde68a" opacity="0.9"/>
      <rect x="74" y="60" width="16" height="14" fill="#38bdf8" opacity="0.9"/>
      <rect x="50" y="88" width="16" height="14" fill="#38bdf8" opacity="0.9"/>
      <rect x="74" y="88" width="16" height="14" fill="#fde68a" opacity="0.9"/>
      <rect x="135" y="45" width="20" height="16" fill="#fde68a" opacity="0.9"/>
      <rect x="165" y="45" width="20" height="16" fill="#38bdf8" opacity="0.9"/>
      <rect x="135" y="75" width="20" height="16" fill="#38bdf8" opacity="0.9"/>
      <rect x="165" y="75" width="20" height="16" fill="#fde68a" opacity="0.9"/>
      <rect x="230" y="75" width="18" height="15" fill="#fde68a" opacity="0.9"/>
      <rect x="315" y="55" width="18" height="15" fill="#38bdf8" opacity="0.9"/>
      <rect y="180" width="400" height="40" fill="#047857"/>
      <circle cx="90" cy="178" r="14" fill="#10b981"/>
      <circle cx="190" cy="178" r="16" fill="#34d399"/>
      <circle cx="280" cy="178" r="14" fill="#10b981"/>
    `;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220" viewBox="0 0 400 220">
    <defs><linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">${bgGradient}</linearGradient></defs>
    <rect width="400" height="220" fill="url(#bg)"/>
    ${artElements}
    <rect x="14" y="14" width="130" height="24" rx="6" fill="${badgeColor}" opacity="0.9"/>
    <text x="79" y="30" text-anchor="middle" fill="#ffffff" font-family="Vazirmatn,Tahoma,sans-serif" font-size="11" font-weight="bold">${badgeLabel}</text>
    <rect y="180" width="400" height="40" fill="#000000" opacity="0.55"/>
    <text x="20" y="205" text-anchor="start" fill="#ffffff" font-family="Vazirmatn,Tahoma,sans-serif" font-size="13" font-weight="900">محله ${safeName}</text>
    <text x="380" y="205" text-anchor="end" fill="#cbd5e1" font-family="Vazirmatn,Tahoma,sans-serif" font-size="11" font-weight="bold">امتیاز: ${toPersianNum(score)} / ۱۰</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export interface NeighborhoodPhotoGalleryProps {
  selectedHood: EvaluatedNeighborhood; hoodLandmarks: LocalLandmark[]; onFocusLandmarkOnMap?: (lm: LocalLandmark) => void;
}

export function NeighborhoodPhotoGallery({ selectedHood, hoodLandmarks, onFocusLandmarkOnMap }: NeighborhoodPhotoGalleryProps): React.ReactElement {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [areaUnit] = useAreaUnit(); const [intlCurrency] = useIntlCurrency(); const [radarLocale] = useRadarLocale();
  const [showLightbox, setShowLightbox] = useState<boolean>(false);
  const isEn = radarLocale === 'en';
  React.useEffect(() => { setActiveIndex(0); }, [selectedHood.id]);

  const galleryItems = useMemo<GalleryItem[]>(() => {
    const items: GalleryItem[] = [
      {
        id: 'residential',
        title: isEn ? `Residential Fabric & Boulevards of ${selectedHood.name}` : `بافت مسکونی و بلوارهای اصلی ${selectedHood.name}`,
        category: isEn ? 'Residential Fabric' : 'بافت مسکونی',
        desc: isEn ? `Urban density, architectural layout, and street terrain in ${selectedHood.name}` : `فضای معماری، تراکم شهری و شاخص همواری زمین در محله ${selectedHood.name}`,
        icon: <Building className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />,
        svgDataUri: buildNeighborhoodSvg(selectedHood.name, 'residential', selectedHood.overallScore),
      },
    ];
    hoodLandmarks.forEach((lm) => {
      let type: 'residential' | 'metro' | 'park' | 'shopping' | 'health' = 'residential';
      let icon = <Building className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
      if (lm.category === 'مترو و حمل‌ونقل') { type = 'metro'; icon = <TrainFront className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />; }
      else if (lm.category === 'پارک و فضای سبز') { type = 'park'; icon = <Wind className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />; }
      else if (lm.category === 'مرکز خرید و رفاهی') { type = 'shopping'; icon = <ShoppingBag className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />; }
      else if (lm.category === 'درمانی و بیمارستان') { type = 'health'; icon = <HeartPulse className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />; }
      items.push({
        id: `lm-${lm.name}`, title: lm.name, category: lm.category, desc: lm.desc, icon,
        svgDataUri: buildNeighborhoodSvg(selectedHood.name, type, selectedHood.overallScore), landmark: lm,
      });
    });
    return items;
  }, [selectedHood, hoodLandmarks, isEn]);

  const activeItem = galleryItems[activeIndex] || galleryItems[0];
  const monthlyRent80mMillions = Math.round(selectedHood.rahn80m * 0.03);
  const handleNext = () => setActiveIndex((prev) => (prev + 1) % galleryItems.length);
  const handlePrev = () => setActiveIndex((prev) => (prev - 1 + galleryItems.length) % galleryItems.length);

  return (
    <div className="my-3 apple-grouped-card overflow-hidden border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs rounded-2xl">
      <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-[8px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/50">
            <Camera className="w-4 h-4 stroke-[1.75]" />
          </div>
          <div>
            <div className="text-xs font-black text-slate-900 dark:text-white">
              {isEn ? 'Neighborhood Photos & Landmarks' : 'گالری تصاویر و نمادهای محله'}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              {selectedHood.name} · {areaUnit === 'sqft' ? 'ft²' : 'متر'}: {toPersianNum(convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit))} م · {formatAreaShort(80, areaUnit)}: {toPersianNum(monthlyRent80mMillions)} م اجاره{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit), intlCurrency, radarLocale)})` : ''} · معامله v6.4: {toPersianNum(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, selectedHood.buyPerSqm, []).estimatedDealPricePerSqm, areaUnit))} م
            </div>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-[7px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10.5px] font-extrabold tabular-nums">
          {toPersianNum(galleryItems.length)} {isEn ? 'Photos' : 'تصویر'}
        </span>
      </div>

      <div className="p-3 space-y-2.5">
        <div className="relative rounded-[14px] overflow-hidden bg-slate-900 group aspect-[16/9] flex items-center justify-center">
          <img src={activeItem.svgDataUri} alt={activeItem.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-102" />
          <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between pointer-events-none">
            <span className="px-2 py-0.5 rounded-[6px] bg-black/60 backdrop-blur-md text-white text-[10px] font-extrabold flex items-center gap-1 pointer-events-auto">
              {activeItem.icon}
              <span>{activeItem.category}</span>
            </span>
            <button type="button" onClick={() => setShowLightbox(true)} title={isEn ? 'Fullscreen' : 'مشاهده تمام‌صفحه'} className="p-1 rounded-[6px] bg-black/60 hover:bg-black/80 backdrop-blur-md text-white transition cursor-pointer pointer-events-auto">
              <Maximize2 className="w-3.5 h-3.5 stroke-[2]" />
            </button>
          </div>
          {galleryItems.length > 1 && (
            <>
              <button type="button" onClick={handlePrev} aria-label={isEn ? 'Previous' : 'تصویر قبلی'} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-md text-white transition cursor-pointer">
                <ChevronRight className="w-4 h-4 stroke-[2]" />
              </button>
              <button type="button" onClick={handleNext} aria-label={isEn ? 'Next' : 'تصویر بعدی'} className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-md text-white transition cursor-pointer">
                <ChevronLeft className="w-4 h-4 stroke-[2]" />
              </button>
            </>
          )}
          <div className="absolute bottom-0 inset-x-0 p-2.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white text-right">
            <div className="font-black text-xs truncate">{activeItem.title}</div>
            <div className="text-[10px] text-slate-300 line-clamp-1 mt-0.5">{activeItem.desc}</div>
          </div>
        </div>

        {activeItem.landmark && onFocusLandmarkOnMap && (() => {
          const distKm = Number((calcDistanceKm(selectedHood.lat, selectedHood.lng, selectedHood.lat + (activeItem.landmark.latOffset || 0), selectedHood.lng + (activeItem.landmark.lngOffset || 0)) ?? 0.5).toFixed(1));
          const walkMin = Math.max(3, Math.round(distKm * 12));
          return (
            <button
              type="button"
              onClick={() => {
                if (activeItem.landmark?.category === 'مترو و حمل‌ونقل') updateMapAdvancedOverlayState({ showMetroLines: true });
                onFocusLandmarkOnMap(activeItem.landmark!);
              }}
              className="w-full py-1.5 px-3 rounded-[9px] bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center justify-between gap-1.5 transition cursor-pointer"
            >
              <span className="flex items-center gap-1.5 truncate">
                <Compass className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 stroke-[2] shrink-0" />
                <span className="truncate">{isEn ? 'Focus on map' : 'تمرکز و مسیریابی روی نقشه'}</span>
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-white/90 dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700 text-[10px] font-black text-emerald-900 dark:text-emerald-300 tabular-nums shrink-0">
                ~{toPersianNum(distKm)} km ({toPersianNum(walkMin)} {isEn ? 'min walk' : 'دقیقه پیاده'})
              </span>
            </button>
          );
        })()}

        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar pt-1">
          {galleryItems.map((item, idx) => (
            <button
              key={item.id} type="button" onClick={() => setActiveIndex(idx)}
              className={`relative rounded-[9px] overflow-hidden shrink-0 w-16 h-11 border-2 transition-all cursor-pointer ${
                activeIndex === idx ? 'border-emerald-600 scale-105 shadow-xs' : 'border-slate-200 dark:border-slate-700 opacity-65 hover:opacity-100 hover:border-slate-400'
              }`}
            >
              <img src={item.svgDataUri} alt={item.title} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      {showLightbox && (
        <div onClick={() => setShowLightbox(false)} className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in-0 duration-200">
          <div onClick={(e) => e.stopPropagation()} className="relative max-w-xl w-full bg-slate-900 rounded-[20px] overflow-hidden border border-white/10 shadow-2xl space-y-3 p-4 text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-emerald-400" />
                <span className="font-black text-sm">{activeItem.title}</span>
              </div>
              <button type="button" onClick={() => setShowLightbox(false)} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition cursor-pointer">
                <X className="w-4 h-4 stroke-[2]" />
              </button>
            </div>
            <div className="relative rounded-[12px] overflow-hidden aspect-[16/9]">
              <img src={activeItem.svgDataUri} alt={activeItem.title} className="w-full h-full object-cover" />
            </div>
            <div className="text-right space-y-1">
              <span className="px-2 py-0.5 rounded-[6px] bg-emerald-500/20 text-emerald-300 text-[10.5px] font-bold">{activeItem.category}</span>
              <p className="text-xs text-slate-300 pt-1 leading-relaxed">{activeItem.desc}</p>
            </div>
            {activeItem.landmark && onFocusLandmarkOnMap && (
              <button type="button" onClick={() => { setShowLightbox(false); onFocusLandmarkOnMap(activeItem.landmark!); }} className="w-full py-2 px-3 rounded-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition">
                <Compass className="w-4 h-4 stroke-[2]" />
                <span>{isEn ? 'View location on aerial map' : 'مشاهده موقعیت روی نقشه هوایی'}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
import React from 'react';

export interface MainLayoutProps {
  header?: React.ReactNode;
  mapViewport?: React.ReactNode;
  sidePanel?: React.ReactNode;
  bottomDrawer?: React.ReactNode;
  children?: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  header,
  mapViewport,
  sidePanel,
  bottomDrawer,
  children,
}) => {
  return (
    <div data-layout="MainLayout" className="app-viewport-locked flex flex-col w-full bg-slate-950 text-slate-100" dir="rtl">
      {header && <div className="shrink-0 z-30">{header}</div>}
      <div className="flex-1 relative flex overflow-hidden">
        {sidePanel && <aside className="w-80 lg:w-96 shrink-0 h-full overflow-y-auto z-20">{sidePanel}</aside>}
        <div className="flex-1 relative h-full overflow-hidden">
          {mapViewport}
          {children}
        </div>
      </div>
      {bottomDrawer && <div className="shrink-0 z-30">{bottomDrawer}</div>}
    </div>
  );
};

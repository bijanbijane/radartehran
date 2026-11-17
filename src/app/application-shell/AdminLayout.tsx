import React from 'react';
import { AuthenticatedLayoutProps } from './AuthenticatedLayout';

export const AdminLayout: React.FC<AuthenticatedLayoutProps> = ({
  header,
  sidebar,
  banner,
  footer,
  children,
}) => {
  return (
    <div data-layout="AdminLayout" className="min-h-screen flex flex-col bg-slate-950 text-slate-100" dir="rtl">
      {banner}
      <header className="w-full border-b border-amber-500/30 bg-slate-900/90 px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-bold text-amber-400">پنل مدیریت و حاکمیت رادار تهران</span>
        {header}
      </header>
      <div className="flex-1 flex flex-col lg:flex-row w-full">
        {sidebar && <aside className="w-full lg:w-64 border-l border-slate-800 bg-slate-900/50">{sidebar}</aside>}
        <main className="flex-1 w-full p-4">{children}</main>
      </div>
      {footer && <footer className="w-full border-t border-slate-800">{footer}</footer>}
    </div>
  );
};

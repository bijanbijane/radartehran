import React from 'react';
import { LayoutProps } from './PublicLayout';

export interface AuthenticatedLayoutProps extends LayoutProps {
  sidebar?: React.ReactNode;
  banner?: React.ReactNode;
}

export const AuthenticatedLayout: React.FC<AuthenticatedLayoutProps> = ({
  header,
  sidebar,
  banner,
  footer,
  children,
}) => {
  return (
    <div data-layout="AuthenticatedLayout" className="min-h-screen flex flex-col bg-slate-950 text-slate-100" dir="rtl">
      {banner}
      {header && <header className="w-full border-b border-slate-800">{header}</header>}
      <div className="flex-1 flex flex-col lg:flex-row w-full">
        {sidebar && <aside className="w-full lg:w-72 border-l border-slate-800">{sidebar}</aside>}
        <main className="flex-1 w-full">{children}</main>
      </div>
      {footer && <footer className="w-full border-t border-slate-800">{footer}</footer>}
    </div>
  );
};

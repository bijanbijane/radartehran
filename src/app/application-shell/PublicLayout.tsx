import React from 'react';

export interface LayoutProps {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export const PublicLayout: React.FC<LayoutProps> = ({ header, footer, children }) => {
  return (
    <div data-layout="PublicLayout" className="min-h-screen flex flex-col bg-slate-950 text-slate-100" dir="rtl">
      {header && <header className="w-full border-b border-slate-800">{header}</header>}
      <main className="flex-1 w-full">{children}</main>
      {footer && <footer className="w-full border-t border-slate-800">{footer}</footer>}
    </div>
  );
};

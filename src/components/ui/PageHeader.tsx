import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle: string;
  children?: ReactNode;
}

export default function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="font-display text-xl font-bold text-white tracking-tight">{title}</h1>
        <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  );
}

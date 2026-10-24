import type { ReactNode } from 'react';
import Icon from './Icon';

interface KpiCardProps {
  titre: string;
  icon: string;
  iconClass?: string;
  valeur: ReactNode;
  valeurClass?: string;
  suffixe?: ReactNode;
  droite?: ReactNode;
  progression?: number;
}

// Carte indicateur (même gabarit que les KPI des maquettes)
export default function KpiCard({ titre, icon, iconClass = 'text-brand-400', valeur, valeurClass = 'text-white', suffixe, droite, progression }: KpiCardProps) {
  return (
    <div className="bg-[#182234] p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{titre}</span>
        <Icon name={icon} className={`text-[18px] ${iconClass}`} />
      </div>
      <div className="mt-3">
        <div className={`flex items-baseline justify-between gap-2 ${progression !== undefined ? 'mb-2' : ''}`}>
          <div className="flex items-baseline gap-1.5">
            <span className={`font-display text-2xl font-bold ${valeurClass}`}>{valeur}</span>
            {suffixe && <span className="text-xs text-slate-400 font-medium">{suffixe}</span>}
          </div>
          {droite}
        </div>
        {progression !== undefined && (
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.min(100, Math.max(0, progression))}%` }}></div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Pastille à droite de la valeur d'un KPI */
export function KpiPastille({ children, tone = 'emerald' }: { children: ReactNode; tone?: 'emerald' | 'brand' | 'amber' | 'rose' | 'slate' }) {
  const classes = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    brand: 'text-brand-400 bg-brand-500/10 border-brand-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    slate: 'text-slate-400 bg-slate-800 border-slate-700',
  }[tone];
  return <span className={`text-xs font-medium border px-2 py-0.5 rounded whitespace-nowrap ${classes}`}>{children}</span>;
}

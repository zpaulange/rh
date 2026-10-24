import type { ReactNode } from 'react';
import Icon from './Icon';

interface CardProps {
  titre: string;
  icon?: string;
  sousTitre?: string;
  droite?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
  id?: string;
}

// Panneau standard : en-tête titre + contenu (tableau en pleine largeur si flush)
export default function Card({ titre, icon, sousTitre, droite, children, className = '', flush = false, id }: CardProps) {
  return (
    <div className={`bg-[#182234] rounded-xl border border-slate-800 shadow-sm overflow-hidden scroll-mt-24 ${className}`} id={id}>
      <div className="px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <Icon name={icon} className="text-[18px] text-brand-400" />}
          <div className="min-w-0">
            <h2 className="font-display text-sm font-semibold text-white">{titre}</h2>
            {sousTitre && <p className="text-xs text-slate-400 mt-0.5">{sousTitre}</p>}
          </div>
        </div>
        {droite}
      </div>
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </div>
  );
}

export const TH = 'py-3 px-4';
export const THEAD_ROW =
  'border-b border-slate-800/80 bg-slate-900/50 text-slate-400 text-xs uppercase tracking-wider font-semibold';

export function LigneVide({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td className="py-8 px-5 text-center text-xs text-slate-500" colSpan={colSpan}>
        {children}
      </td>
    </tr>
  );
}

import { dateCourte, jourMois, nombre } from '../lib/time';
import type { DemandeConge } from '../types';

export const periodeConge = (c: DemandeConge): string =>
  c.debut === c.fin ? `${dateCourte(c.debut)} (${c.jours === 0.5 ? '½ jour' : '1 jour'})` : `${jourMois(c.debut)} — ${dateCourte(c.fin)}`;

export const dureeLibelle = (c: DemandeConge): string => `${nombre(c.jours)} ${c.jours > 1 ? 'jours' : 'jour'}${c.type === 'conge_paye' ? ' ouvrables' : ''}`;

export function BadgeStatutConge({ statut, attenteLabel = 'En attente' }: { statut: DemandeConge['statut']; attenteLabel?: string }) {
  if (statut === 'en_attente')
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
        {attenteLabel}
      </span>
    );
  if (statut === 'refuse')
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">Refusé</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Approuvé</span>;
}


import type { StatutJour } from '../../lib/rules';
import Badge, { type Tone } from '../ui/Badge';

const STATUTS: Record<StatutJour, { label: string; tone: Tone }> = {
  present: { label: 'Présent', tone: 'emerald' },
  en_pause: { label: 'En pause', tone: 'amber' },
  parti: { label: 'Parti', tone: 'slate' },
  conge: { label: 'En congé', tone: 'brand' },
  ferie: { label: 'Jour férié', tone: 'slate' },
  absent: { label: 'Absent', tone: 'rose' },
  non_ouvre: { label: 'Jour non ouvré', tone: 'slate' },
  non_pointe: { label: 'Non pointé', tone: 'amber' },
  hors_contrat: { label: 'Pas encore en poste', tone: 'slate' },
};

export default function StatutJourBadge({ statut }: { statut: StatutJour }) {
  const s = STATUTS[statut];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

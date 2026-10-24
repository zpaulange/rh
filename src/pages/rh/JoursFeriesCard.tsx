import { useState } from 'react';
import { DatePicker, Field, Select, TextInput } from '../../components/form';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import { useDialog } from '../../components/ui/Dialog';
import Icon from '../../components/ui/Icon';
import { joursFeriesBenin } from '../../lib/feries';
import { dateLongue, estOuvre } from '../../lib/time';
import type { JourFerie } from '../../types';

interface Props {
  joursFeries: JourFerie[];
  onChange: (j: JourFerie[]) => void;
  anneeCourante: number;
}

// Calendrier des jours fériés (chômés et payés) : exclus des retards, absences, congés ; heures majorées
export default function JoursFeriesCard({ joursFeries, onChange, anneeCourante }: Props) {
  const dialog = useDialog();
  const [annee, setAnnee] = useState(String(anneeCourante));
  const [date, setDate] = useState('');
  const [libelle, setLibelle] = useState('');
  const liste = joursFeries.filter((j) => j.date.startsWith(annee)).sort((a, b) => a.date.localeCompare(b.date));
  const annees = [anneeCourante - 1, anneeCourante, anneeCourante + 1].map(String);

  const ajouter = async () => {
    if (!date || !libelle.trim()) {
      await dialog.alert({ titre: 'Champs incomplets', tone: 'warning', message: 'Indiquez la date et le libellé du jour férié.' });
      return;
    }
    if (joursFeries.some((j) => j.date === date)) {
      await dialog.alert({ titre: 'Date déjà présente', tone: 'warning', message: 'Ce jour est déjà déclaré férié.' });
      return;
    }
    onChange([...joursFeries, { date, libelle: libelle.trim(), estime: false }]);
    setDate('');
    setLibelle('');
  };

  const confirmer = (j: JourFerie) => onChange(joursFeries.map((x) => (x.date === j.date ? { ...x, estime: false } : x)));

  const retirer = async (j: JourFerie) => {
    const ok = await dialog.confirm({ titre: `Retirer « ${j.libelle} » ?`, tone: 'danger', message: `${dateLongue(j.date)} redeviendra un jour travaillé.`, confirmer: 'Retirer' });
    if (ok) onChange(joursFeries.filter((x) => x.date !== j.date));
  };

  const charger = async () => {
    const ok = await dialog.confirm({
      titre: `Charger le calendrier officiel ${annee} ?`,
      tone: 'info',
      icon: 'event',
      message: "Les jours fériés légaux du Bénin seront ajoutés pour l'année. Les fêtes musulmanes sont des dates estimées, à confirmer selon le décret annuel.",
      confirmer: 'Charger',
    });
    if (!ok) return;
    const existants = new Set(joursFeries.map((j) => j.date));
    onChange([...joursFeries, ...joursFeriesBenin(Number(annee)).filter((j) => !existants.has(j.date))]);
  };

  return (
    <Card
      droite={
        <div className="flex items-center gap-2">
          <Select ariaLabel="Année" className="w-28" onChange={setAnnee} options={annees.map((a) => ({ value: a, label: a }))} value={annee} variant="sombre" />
          <button className="h-[34px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium" onClick={() => void charger()} type="button">
            Calendrier officiel
          </button>
        </div>
      }
      icon="event"
      sousTitre="Chômés et payés : jamais comptés en absence ni en retard, exclus des congés, heures travaillées majorées"
      titre="Jours fériés"
    >
      <div className="flex flex-col divide-y divide-slate-800/70">
        {liste.length === 0 && <p className="text-xs text-slate-500 pb-3">Aucun jour férié déclaré pour {annee}.</p>}
        {liste.map((j) => (
          <div key={j.date} className="py-2 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-mono text-slate-300 w-24 shrink-0">{j.date.split('-').reverse().join('/')}</span>
              <span className="text-slate-200 truncate">{j.libelle}</span>
              {!estOuvre(j.date) && <Badge size="xs" tone="slate">week-end</Badge>}
              {j.estime && (
                <button onClick={() => confirmer(j)} title="Cliquer pour confirmer la date officielle" type="button">
                  <Badge icon="help" size="xs" tone="amber">
                    Date estimée
                  </Badge>
                </button>
              )}
            </div>
            <button aria-label={`Retirer ${j.libelle}`} className="text-slate-500 hover:text-rose-400 shrink-0" onClick={() => void retirer(j)} type="button">
              <Icon className="text-[16px]" name="delete" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-[150px_1fr_auto] gap-2 items-end">
        <Field label="Date">
          <DatePicker min={`${annee}-01-01`} max={`${annee}-12-31`} onChange={setDate} value={date} variant="sombre" />
        </Field>
        <Field label="Libellé">
          <TextInput maxLength={60} onChange={setLibelle} placeholder="Ex : Jour férié exceptionnel (décret n°…)" value={libelle} variant="sombre" />
        </Field>
        <button className="h-[34px] px-3 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-1.5" onClick={() => void ajouter()} type="button">
          <Icon className="text-[16px]" name="add" />
          Ajouter
        </button>
      </div>
    </Card>
  );
}

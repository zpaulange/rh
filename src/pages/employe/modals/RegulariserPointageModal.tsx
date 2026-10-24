import { useEffect, useState, type FormEvent } from 'react';
import { useUser } from '../../../auth/AuthContext';
import { DatePicker, Field, LABEL, PastilleRadio, RadioGroup, Textarea, TimePicker } from '../../../components/form';
import FileDrop from '../../../components/ui/FileDrop';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import { demanderRegularisation } from '../../../db/actions';
import { serverNow } from '../../../lib/serverTime';
import { dateKey, moisLong } from '../../../lib/time';
import type { TypeRegularisation } from '../../../types';

type RegType = TypeRegularisation;

const REG_TYPES: { value: RegType; label: string }[] = [
  { value: 'oubli', label: 'Oubli de pointage' },
  { value: 'retard', label: 'Retard justifié' },
  { value: 'mission', label: 'Mission externe' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  /** Pré-remplissage depuis une ligne du journal */
  datePreselection?: string;
}

export default function RegulariserPointageModal({ open, onClose, onSubmitted, datePreselection }: Props) {
  const user = useUser();
  const aujourdhui = dateKey(serverNow());
  const [regType, setRegType] = useState<RegType>('oubli');
  const [date, setDate] = useState(aujourdhui);
  const [entree, setEntree] = useState('08:00');
  const [depart, setDepart] = useState('17:30');
  const [motif, setMotif] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // Formulaire vierge à chaque ouverture
  useEffect(() => {
    if (!open) return;
    setRegType(datePreselection ? 'retard' : 'oubli');
    setDate(datePreselection ?? dateKey(serverNow()));
    setEntree('08:00');
    setDepart('17:30');
    setMotif('');
    setFichier(null);
    setErreur(null);
  }, [open, datePreselection]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      demanderRegularisation(user, { type: regType, date, entree, depart, motif: motif.trim(), justificatif: fichier?.name ?? null });
      onSubmitted();
      onClose();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Envoi impossible.');
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="bg-[#111827] border border-slate-700/80 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-slate-800 bg-[#182234] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600/20 text-brand-400 border border-brand-500/30 flex items-center justify-center shrink-0">
              <Icon name="edit_calendar" className="text-[19px]" />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-white leading-tight">Régulariser un pointage</h3>
              <p className="text-xs text-slate-400 mt-0.5">Formulaire de déclaration • Réf. REG-{aujourdhui.slice(0, 4)}-{moisLong(aujourdhui.slice(0, 7)).slice(0, 3).toUpperCase()}</p>
            </div>
          </div>
          <button
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>

        {/* Corps du Formulaire */}
        <form className="p-6 flex flex-col gap-4 text-xs" onSubmit={handleSubmit}>
          <Field label="Type de régularisation" labelClass={LABEL.modalClair}>
            <RadioGroup
              ariaLabel="Type de régularisation"
              carteActive="flex items-center gap-2 p-2.5 rounded-lg border border-brand-500/40 bg-brand-500/10 text-white cursor-pointer"
              carteInactive="flex items-center gap-2 p-2.5 rounded-lg border border-slate-800 bg-[#182234] hover:border-slate-700 text-slate-300 cursor-pointer transition-colors"
              className="grid grid-cols-1 sm:grid-cols-3 gap-2"
              onChange={setRegType}
              options={REG_TYPES.map((t) => ({
                value: t.value,
                contenu: (actif) => (
                  <>
                    <PastilleRadio active={actif} />
                    <span className="font-medium text-[11px] leading-tight">{t.label}</span>
                  </>
                ),
              }))}
              value={regType}
            />
          </Field>

          <Field label="Date concernée" labelClass={LABEL.modalClair}>
            <DatePicker max={aujourdhui} onChange={setDate} required value={date} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Heure d'entrée constatée" labelClass={LABEL.modalClair}>
              <TimePicker onChange={setEntree} required value={entree} />
            </Field>
            <Field label="Heure de départ prévue / réelle" labelClass={LABEL.modalClair}>
              <TimePicker onChange={setDepart} required value={depart} />
            </Field>
          </div>

          <Field label="Motif / Justification concis" labelClass={LABEL.modalClair}>
            <Textarea
              maxLength={300}
              onChange={setMotif}
              placeholder="Explication courte (ex: Badge oublié au domicile, vérification effectuée auprès du responsable d'équipe...)"
              required
              rows={2}
              value={motif}
            />
          </Field>

          <div>
            <label className="block font-medium text-slate-200 mb-1.5">Pièce justificative (optionnel)</label>
            <FileDrop
              file={fichier}
              onChange={setFichier}
              className="border border-dashed border-slate-700 hover:border-brand-500/60 bg-[#182234]/70 rounded-lg p-3 text-center cursor-pointer transition-colors flex items-center justify-center gap-2.5"
            >
              <Icon name="upload_file" className="text-[18px] text-slate-400" />
              <div className="text-left">
                <span className="text-[11px] font-medium text-slate-200 block">
                  Déposer un justificatif (PDF, PNG - max 5 Mo)
                </span>
                <span className="text-[10px] text-slate-500">Feuille d'émargement client, attestation de transport, etc.</span>
              </div>
            </FileDrop>
          </div>

          {erreur && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300">
              <Icon name="error" className="text-[15px]" />
              {erreur}
            </div>
          )}

          <div className="pt-3 mt-1 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              className="px-4 py-2 rounded-lg font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              onClick={onClose}
              type="button"
            >
              Annuler
            </button>
            <button
              className="px-4 py-2 rounded-lg font-medium bg-brand-600 hover:bg-brand-500 text-white shadow-sm shadow-brand-600/30 flex items-center gap-1.5 transition-colors"
              type="submit"
            >
              <Icon name="send" className="text-[15px]" />
              <span>Soumettre la régularisation</span>
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

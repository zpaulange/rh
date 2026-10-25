import { useEffect, useState, type FormEvent } from 'react';
import { useUser } from '../../../auth/AuthContext';
import { DatePicker, Field } from '../../../components/form';
import { messageErreur } from '../../../components/ui/Dialog';
import FileDrop from '../../../components/ui/FileDrop';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import { declarerAccouchement, prolongerMaternite } from '../../../db/api';
import { useDB } from '../../../db/store';
import { periodeMaternite } from '../../../lib/maternite';
import { serverNow } from '../../../lib/serverTime';
import { ajouterJours, dateCourte, dateKey } from '../../../lib/time';
import type { DemandeConge } from '../../../types';

interface Props {
  action: { conge: DemandeConge; mode: 'accouchement' | 'prolongation' } | null;
  onClose: () => void;
  onFait: (c: DemandeConge) => void;
}

// Suivi du congé de maternité : date réelle d'accouchement et prolongation pour maladie (CT art. 170)
export default function MaterniteModal({ action, onClose, onFait }: Props) {
  const user = useUser();
  const db = useDB();
  const today = dateKey(serverNow());
  const [date, setDate] = useState(today);
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!action) return;
    setDate(action.conge.dateAccouchementPresumee && action.conge.dateAccouchementPresumee < today ? action.conge.dateAccouchementPresumee : today);
    setFichier(null);
    setErreur(null);
  }, [action, today]);

  if (!action) return null;
  const { conge, mode } = action;
  const e = db.employes.find((x) => x.id === conge.employeId)!;
  const accouchement = mode === 'accouchement';
  const apercu = accouchement && conge.dateAccouchementPresumee ? periodeMaternite(conge.dateAccouchementPresumee, date, conge.prolongationMaladie) : { debut: conge.debut, fin: ajouterJours(conge.fin, 28) };

  const submit = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    try {
      onFait(accouchement ? await declarerAccouchement(user, conge.id, date) : await prolongerMaternite(user, conge.id, fichier?.name ?? ''));
    } catch (err) {
      setErreur(messageErreur(err));
    }
  };

  return (
    <Modal onClose={onClose} open>
      <div className="bg-[#111827] border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-800 bg-[#182234]/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
              <Icon className="text-[22px]" name="child_friendly" />
            </div>
            <div>
              <h4 className="font-display text-base font-semibold text-white tracking-tight">{accouchement ? "Déclarer l'accouchement" : 'Prolonger le congé de maternité'}</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                {e.prenom} {e.nom} • {conge.reference} • du {dateCourte(conge.debut)} au {dateCourte(conge.fin)}
              </p>
            </div>
          </div>
          <button aria-label="Fermer" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80" onClick={onClose} type="button">
            <Icon className="text-[19px]" name="close" />
          </button>
        </div>
        <form className="p-6 flex flex-col gap-4" onSubmit={submit}>
          {accouchement ? (
            <Field aide={conge.dateAccouchementPresumee ? `Date présumée : ${dateCourte(conge.dateAccouchementPresumee)}` : undefined} label="Date de l'accouchement">
              <DatePicker feries={db.parametres.joursFeries} max={today} min={conge.debut} onChange={setDate} required value={date} />
            </Field>
          ) : (
            <div>
              <span className="block text-xs font-medium text-slate-300 mb-1.5">Certificat médical (maladie résultant de la grossesse ou des couches)</span>
              <FileDrop
                className="border border-dashed border-slate-700 hover:border-brand-500/60 bg-[#182234]/40 rounded-xl p-3 text-center cursor-pointer flex flex-col items-center gap-1"
                file={fichier}
                onChange={setFichier}
              >
                <Icon className="text-[20px] text-slate-400" name="cloud_upload" />
                <div className="text-xs text-slate-300">
                  <span className="font-medium text-brand-400">Cliquez pour parcourir</span> ou glissez un fichier
                </div>
              </FileDrop>
            </div>
          )}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs text-slate-300">
            Nouvelle fin du congé : <strong className="text-white">{dateCourte(apercu.fin)}</strong> • reprise le {dateCourte(ajouterJours(apercu.fin, 1))}.
            <span className="block text-[11px] text-slate-400 mt-1">
              {accouchement
                ? 'Avant terme : repos prolongé jusqu’à 14 semaines au total ; après terme : 8 semaines après l’accouchement (CT art. 170).'
                : 'Prolongation unique de 4 semaines en cas de maladie dûment constatée (CT art. 170).'}
            </span>
          </div>
          {erreur && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300" role="alert">
              <Icon className="text-[15px] mt-px" name="error" />
              {erreur}
            </div>
          )}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60" onClick={onClose} type="button">
              Annuler
            </button>
            <button className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white flex items-center gap-2 disabled:opacity-50" disabled={!accouchement && !fichier} type="submit">
              <Icon className="text-[16px]" name="check" />
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

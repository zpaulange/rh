import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Field from '../form/Field';
import Textarea from '../form/Textarea';
import { messageErreur } from './Dialog';
import Icon from './Icon';
import Modal from './Modal';

interface MotifModalProps {
  open: boolean;
  titre: string;
  icone: string;
  tone: 'danger' | 'info';
  resume: ReactNode;
  /** Champs complémentaires (ex. choix du rôle) affichés avant le motif */
  children?: ReactNode;
  labelMotif: string;
  confirmer: string;
  /** Désactive la confirmation (ex. aucun changement) */
  bloque?: boolean;
  onClose: () => void;
  /** Peut lever une erreur métier (ou rejeter sa promesse) : elle est affichée dans la modale */
  onConfirm: (motif: string) => void | Promise<void>;
}

// Action sensible exigeant un motif écrit, conservé dans le journal d'audit
export default function MotifModal({ open, titre, icone, tone, resume, children, labelMotif, confirmer, bloque, onClose, onConfirm }: MotifModalProps) {
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setMotif('');
      setErreur(null);
    }
  }, [open]);

  const [envoi, setEnvoi] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (envoi) return;
    setEnvoi(true);
    try {
      await onConfirm(motif.trim());
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  };

  const danger = tone === 'danger';
  return (
    <Modal onClose={onClose} open={open}>
      <div className="bg-[#111827] border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-800 bg-[#182234]/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                danger ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-brand-500/10 border-brand-500/20 text-brand-400'
              }`}
            >
              <Icon className="text-[22px]" name={icone} />
            </div>
            <div>
              <h4 className="font-display text-base font-semibold text-white tracking-tight">{titre}</h4>
              <p className="text-xs text-slate-400 mt-0.5">Action tracée dans le journal d'audit</p>
            </div>
          </div>
          <button
            aria-label="Fermer"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
            onClick={onClose}
            type="button"
          >
            <Icon className="text-[19px]" name="close" />
          </button>
        </div>
        <form className="p-6 flex flex-col gap-4" onSubmit={submit}>
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs text-slate-300 leading-relaxed">{resume}</div>
          {children}
          <Field label={labelMotif}>
            <Textarea maxLength={300} onChange={setMotif} placeholder="Motif conservé dans le journal d'audit…" required rows={3} value={motif} />
          </Field>
          {erreur && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300" role="alert">
              <Icon className="text-[15px] mt-px" name="error" />
              {erreur}
            </div>
          )}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors" onClick={onClose} type="button">
              Annuler
            </button>
            <button
              className={`px-5 py-2.5 rounded-lg text-xs font-semibold text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-brand-600 hover:bg-brand-500'
              }`}
              disabled={bloque || !motif.trim() || envoi}
              type="submit"
            >
              <Icon className="text-[16px]" name={icone} />
              {confirmer}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

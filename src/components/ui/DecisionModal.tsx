import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Field from '../form/Field';
import Textarea from '../form/Textarea';
import Icon from './Icon';
import Modal from './Modal';

interface DecisionModalProps {
  open: boolean;
  approuver: boolean;
  titre: string;
  resume: ReactNode;
  onClose: () => void;
  /** Peut être asynchrone (action envoyée au serveur) : le bouton reste désactivé pendant l'envoi */
  onConfirm: (commentaire: string) => void | Promise<void>;
}

// Validation ou refus d'une demande, avec commentaire (obligatoire en cas de refus)
export default function DecisionModal({ open, approuver, titre, resume, onClose, onConfirm }: DecisionModalProps) {
  const [commentaire, setCommentaire] = useState('');
  useEffect(() => {
    if (open) setCommentaire('');
  }, [open]);

  const [envoi, setEnvoi] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (envoi) return;
    setEnvoi(true);
    try {
      await onConfirm(commentaire.trim());
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="bg-[#111827] border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-800 bg-[#182234]/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                approuver ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}
            >
              <Icon name={approuver ? 'task_alt' : 'block'} className="text-[22px]" />
            </div>
            <div>
              <h4 className="font-display text-base font-semibold text-white tracking-tight">{titre}</h4>
              <p className="text-xs text-slate-400 mt-0.5">Décision tracée dans le journal d'audit</p>
            </div>
          </div>
          <button
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" className="text-[19px]" />
          </button>
        </div>
        <form className="p-6 flex flex-col gap-4" onSubmit={submit}>
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs text-slate-300">{resume}</div>
          <Field
            label={
              <>
                {approuver ? 'Commentaire ' : 'Motif du refus '}
                <span className="text-slate-500">{approuver ? '(facultatif)' : '(obligatoire, transmis au collaborateur)'}</span>
              </>
            }
          >
            <Textarea
              autoFocus
              maxLength={300}
              onChange={setCommentaire}
              placeholder={approuver ? 'Ex : Passation validée avec le N+1.' : 'Ex : Période de clôture comptable, merci de décaler.'}
              required={!approuver}
              rows={3}
              value={commentaire}
            />
          </Field>
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
              onClick={onClose}
              type="button"
            >
              Annuler
            </button>
            <button
              className={`px-5 py-2.5 rounded-lg text-xs font-semibold text-white shadow-sm transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-wait ${
                approuver ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
              }`}
              disabled={envoi}
              type="submit"
            >
              <Icon name={approuver ? 'check' : 'close'} className="text-[16px]" />
              <span>{approuver ? 'Confirmer la validation' : 'Confirmer le refus'}</span>
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

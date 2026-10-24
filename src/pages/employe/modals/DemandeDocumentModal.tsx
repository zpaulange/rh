import { useEffect, useState, type FormEvent } from 'react';
import { useUser } from '../../../auth/AuthContext';
import { Field, LABEL, PastilleRadio, RadioGroup, Select, Textarea, TextInput } from '../../../components/form';
import { useDB } from '../../../db/store';
import { serverNow } from '../../../lib/serverTime';
import { dateKey, derniersMois, moisLong } from '../../../lib/time';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import { demanderDocument } from '../../../db/actions';
import type { FormatDelivrance, TypeDocumentDemande } from '../../../types';

type DocType = TypeDocumentDemande;
type DeliveryFormat = FormatDelivrance;

const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: 'attestation_travail', label: "Attestation d'emploi" },
  { value: 'attestation_salaire', label: 'Attestation de salaire' },
  { value: 'certificat_presence', label: 'Certificat de présence' },
  { value: 'duplicata_paie', label: 'Duplicata bulletin de paie' },
];

const DELIVERY_FORMATS: { value: DeliveryFormat; label: string }[] = [
  { value: 'digital', label: 'Numérique (PDF signé e-ID)' },
  { value: 'paper', label: 'Papier signé (Retrait agence)' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

export default function DemandeDocumentModal({ open, onClose, onSubmitted }: Props) {
  const user = useUser();
  const [docType, setDocType] = useState<DocType>('attestation_travail');
  const [destinataire, setDestinataire] = useState('');
  const [format, setFormat] = useState<DeliveryFormat>('digital');
  const [commentaire, setCommentaire] = useState('');
  const [mois, setMois] = useState('');
  const db = useDB();
  const today = dateKey(serverNow());
  const moisPayes = db.campagnesPaie
    .filter((c) => c.statut === 'payee' && c.lignes.some((l) => l.employeId === user.employeId))
    .map((c) => c.mois)
    .sort()
    .reverse();
  const moisProposes = docType === 'duplicata_paie' ? moisPayes : docType === 'certificat_presence' ? derniersMois(today, 12) : [];

  useEffect(() => {
    if (!open) return;
    setDocType('attestation_travail');
    setDestinataire('');
    setFormat('digital');
    setCommentaire('');
    setMois('');
  }, [open]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    demanderDocument(user, { type: docType, destinataire: destinataire.trim(), format, commentaire: commentaire.trim(), mois: moisProposes.length ? mois : undefined });
    onSubmitted();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="bg-[#111827] border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-800 bg-[#182234]/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
              <Icon name="description" className="text-[20px]" />
            </div>
            <div>
              <h4 className="font-display text-base font-semibold text-white tracking-tight">Demande de document</h4>
              <p className="text-xs text-slate-400 mt-0.5">Formulaire de transmission aux Ressources Humaines</p>
            </div>
          </div>
          <button
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" className="text-[19px]" />
          </button>
        </div>

        <form className="p-6 flex flex-col gap-5 overflow-y-auto max-h-[82vh]" onSubmit={handleSubmit}>
          <Field label="Document demandé" labelClass={LABEL.majuscules.replace('mb-1.5', 'mb-2')}>
            <RadioGroup
              ariaLabel="Document demandé"
              carteActive="flex items-center gap-2.5 p-3 rounded-lg border border-brand-500/60 bg-brand-500/10 cursor-pointer transition-colors"
              carteInactive="flex items-center gap-2.5 p-3 rounded-lg border border-slate-800 bg-[#182234]/50 hover:bg-[#182234] hover:border-slate-700 cursor-pointer transition-colors"
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
              onChange={setDocType}
              options={DOC_TYPES.map((t) => ({
                value: t.value,
                contenu: (checked) => (
                  <>
                    <PastilleRadio active={checked} />
                    <span className={`text-xs font-medium ${checked ? 'text-white' : 'text-slate-300'}`}>{t.label}</span>
                  </>
                ),
              }))}
              value={docType}
            />
          </Field>

          {moisProposes.length > 0 && (
            <Field
              aide={docType === 'duplicata_paie' ? 'Seuls les mois dont le salaire vous a été versé sont proposés.' : undefined}
              label={docType === 'duplicata_paie' ? 'Bulletin concerné' : 'Mois concerné'}
              labelClass={LABEL.majuscules}
            >
              <Select onChange={setMois} options={moisProposes.map((m) => ({ value: m, label: moisLong(m) }))} placeholder="Sélectionner le mois…" required value={mois} />
            </Field>
          )}

          <Field label="Motif / Organisme destinataire" labelClass={LABEL.majuscules}>
            <TextInput
              maxLength={120}
              onChange={setDestinataire}
              placeholder="Ex: BOA Bénin — Agence Principale Cotonou, Consulat de France..."
              required
              value={destinataire}
            />
          </Field>

          <Field label="Format de délivrance" labelClass={LABEL.majuscules}>
            <RadioGroup
              ariaLabel="Format de délivrance"
              carteActive="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-800 bg-[#182234]/50 hover:border-slate-700 cursor-pointer transition-colors"
              carteInactive="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-800 bg-[#182234]/50 hover:border-slate-700 cursor-pointer transition-colors"
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
              onChange={setFormat}
              options={DELIVERY_FORMATS.map((f) => ({
                value: f.value,
                contenu: (checked) => (
                  <>
                    <PastilleRadio active={checked} />
                    <span className="text-xs text-slate-200">{f.label}</span>
                  </>
                ),
              }))}
              value={format}
            />
          </Field>

          <Field
            label={
              <>
                Commentaire ou précision <span className="text-slate-500 font-normal lowercase">(facultatif)</span>
              </>
            }
            labelClass={LABEL.majuscules}
          >
            <Textarea
              maxLength={300}
              onChange={setCommentaire}
              placeholder="Ex : Préciser la confirmation de CDI et le salaire net moyen des 3 derniers mois."
              rows={2}
              value={commentaire}
            />
          </Field>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
              onClick={onClose}
              type="button"
            >
              Annuler
            </button>
            <button
              className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white shadow-sm shadow-brand-600/30 transition-colors cursor-pointer flex items-center gap-2"
              type="submit"
            >
              <Icon name="send" className="text-[16px]" />
              <span>Envoyer la demande</span>
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

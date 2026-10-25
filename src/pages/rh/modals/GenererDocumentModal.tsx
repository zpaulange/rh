import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useUser } from '../../../auth/AuthContext';
import { Field, LABEL, Select, TextInput } from '../../../components/form';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import { genererDocumentManuel, moisReference } from '../../../db/api';
import { getDB, useDB } from '../../../db/store';
import { LIBELLE_MODELE, MODELES_MENSUELS } from '../../../lib/documents';
import { telechargerPDF } from '../../../lib/pdfLazy';
import { LIBELLE_CONGE } from '../../../lib/rules';
import { serverNow } from '../../../lib/serverTime';
import { dateCourte, dateKey, derniersMois, moisLong } from '../../../lib/time';
import type { DocumentGenere, ModeleDocument } from '../../../types';

// Les bulletins (au versement de la paie) et les avenants (à chaque évolution) sont générés automatiquement
const MODELES: ModeleDocument[] = ['attestation_travail', 'attestation_salaire', 'certificat_presence', 'fiche_emargement', 'duplicata_paie', 'titre_conge'];

interface Props {
  open: boolean;
  employeId?: string;
  onClose: () => void;
  onGenere: (doc: DocumentGenere) => void;
}

const ICONES: Record<ModeleDocument, string> = {
  attestation_travail: 'badge',
  attestation_salaire: 'payments',
  certificat_presence: 'event_available',
  fiche_emargement: 'fingerprint',
  bulletin_paie: 'receipt_long',
  duplicata_paie: 'content_copy',
  titre_conge: 'beach_access',
  avenant: 'contract_edit',
  certificat_travail: 'workspace_premium',
  solde_tout_compte: 'receipt',
};

export default function GenererDocumentModal({ open, employeId, onClose, onGenere }: Props) {
  const user = useUser();
  const db = useDB();
  const [cible, setCible] = useState(employeId ?? '');
  const [modele, setModele] = useState<ModeleDocument>('attestation_travail');
  const [mois, setMois] = useState(moisReference());
  const [destinataire, setDestinataire] = useState('');
  const [congeId, setCongeId] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const moisDispo = useMemo(() => derniersMois(dateKey(serverNow()), 12), []);

  useEffect(() => {
    if (!open) return;
    setCible(employeId ?? '');
    setModele('attestation_travail');
    setMois(moisReference());
    setDestinataire('');
    setCongeId('');
    setErreur(null);
  }, [open, employeId]);

  const congesValides = db.conges.filter((c) => c.employeId === cible && c.statut === 'approuve' && c.type !== 'maladie');
  const mensuel = MODELES_MENSUELS.includes(modele);
  const moisPayes = db.campagnesPaie
    .filter((c) => c.statut === 'payee' && c.lignes.some((l) => l.employeId === cible))
    .map((c) => c.mois)
    .sort()
    .reverse();
  const attestation = modele === 'attestation_travail' || modele === 'attestation_salaire';

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const params: Record<string, string> = {};
      if (mensuel) params.mois = mois;
      if (attestation && destinataire.trim()) params.destinataire = destinataire.trim();
      if (modele === 'titre_conge') {
        const c = congesValides.find((x) => x.id === congeId);
        if (!c) throw new Error('Sélectionnez un congé validé.');
        params.congeId = c.id;
        params.periode = `${dateCourte(c.debut)} — ${dateCourte(c.fin)}`;
        params.jours = String(c.jours);
      }
      const doc = await genererDocumentManuel(user, cible, modele, params);
      telechargerPDF(getDB(), doc);
      onGenere(doc);
      onClose();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Génération impossible.');
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="bg-[#111827] border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-800 bg-[#182234]/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
              <Icon name="picture_as_pdf" className="text-[20px]" />
            </div>
            <div>
              <h4 className="font-display text-base font-semibold text-white tracking-tight">Générer un document PDF</h4>
              <p className="text-xs text-slate-400 mt-0.5">Signé, horodaté et vérifiable par code</p>
            </div>
          </div>
          <button className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80" onClick={onClose} type="button">
            <Icon name="close" className="text-[19px]" />
          </button>
        </div>
        <form className="p-6 flex flex-col gap-4" onSubmit={submit}>
          {!employeId && (
            <Field label="Collaborateur" labelClass={LABEL.majuscules}>
              <Select
                onChange={setCible}
                options={[...db.employes]
                  .sort((x, y) => x.nom.localeCompare(y.nom))
                  .map((e) => ({ value: e.id, label: `${e.nom} ${e.prenom}`, description: `${e.matricule} • ${e.departement}` }))}
                placeholder="Rechercher un collaborateur…"
                recherche
                required
                value={cible}
              />
            </Field>
          )}
          <Field label="Modèle" labelClass={LABEL.majuscules}>
            <Select
              onChange={setModele}
              options={MODELES.map((m) => ({ value: m, label: LIBELLE_MODELE[m], icone: ICONES[m] }))}
              value={modele}
            />
          </Field>
          {mensuel && (
            <Field aide={modele === 'duplicata_paie' ? 'Seuls les mois dont le salaire a été versé sont proposés.' : undefined} label="Période" labelClass={LABEL.majuscules}>
              <Select
                disabled={modele === 'duplicata_paie' && moisPayes.length === 0}
                onChange={setMois}
                options={(modele === 'duplicata_paie' ? moisPayes : moisDispo).map((m) => ({ value: m, label: moisLong(m) }))}
                placeholder={modele === 'duplicata_paie' ? (cible ? 'Aucune paie versée' : "Choisissez d'abord un collaborateur") : 'Sélectionner…'}
                required
                value={modele === 'duplicata_paie' && !moisPayes.includes(mois) ? '' : mois}
              />
            </Field>
          )}
          {attestation && (
            <Field
              label={
                <>
                  Destinataire <span className="text-slate-500 normal-case font-normal">(facultatif)</span>
                </>
              }
              labelClass={LABEL.majuscules}
            >
              <TextInput maxLength={120} onChange={setDestinataire} placeholder="Ex : BOA Bénin, Ambassade de France…" value={destinataire} />
            </Field>
          )}
          {modele === 'titre_conge' && (
            <Field label="Congé validé" labelClass={LABEL.majuscules}>
              <Select
                disabled={congesValides.length === 0}
                onChange={setCongeId}
                options={congesValides.map((c) => ({
                  value: c.id,
                  label: `${dateCourte(c.debut)} → ${dateCourte(c.fin)}`,
                  description: `${LIBELLE_CONGE[c.type]} • ${c.jours} j`,
                }))}
                placeholder={!cible ? "Choisissez d'abord un collaborateur" : congesValides.length ? 'Sélectionner…' : 'Aucun congé validé'}
                required
                value={congeId}
              />
            </Field>
          )}
          {erreur && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
              <Icon name="error" className="text-[15px]" />
              {erreur}
            </div>
          )}
          <p className="text-[11px] text-slate-500">Le document est ajouté au coffre-fort du collaborateur, qui est notifié automatiquement.</p>
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60" onClick={onClose} type="button">
              Annuler
            </button>
            <button
              className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white shadow-sm shadow-brand-600/30 flex items-center gap-2 disabled:opacity-50"
              disabled={!cible}
              type="submit"
            >
              <Icon name="picture_as_pdf" className="text-[16px]" />
              Générer et télécharger
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

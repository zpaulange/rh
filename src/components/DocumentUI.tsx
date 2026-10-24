import { useState } from 'react';
import { useUser } from '../auth/AuthContext';
import { journaliserTelechargement, verifierDocument } from '../db/actions';
import { getDB } from '../db/store';
import { CERTIFICATION, LIBELLE_CATEGORIE } from '../lib/documents';
import { telechargerPDF } from '../lib/pdfLazy';
import { dateHeure } from '../lib/time';
import type { DocumentGenere } from '../types';
import TextInput from './form/TextInput';
import Icon from './ui/Icon';
import Modal from './ui/Modal';

/** Télécharge le PDF (reconstruit depuis la base) et trace l'action */
export function useTelechargement() {
  const user = useUser();
  return (doc: DocumentGenere) => {
    telechargerPDF(getDB(), doc);
    journaliserTelechargement(user, doc);
  };
}

// Encadré « Vérification & Intégrité certifiée » (maquette Documents), fonctionnel
export function VerificationDocument() {
  const user = useUser();
  const [code, setCode] = useState('');
  const [resultat, setResultat] = useState<{ saisie: string; doc: DocumentGenere | null } | null>(null);

  const verifier = () => {
    const saisie = code.trim();
    if (!saisie) return;
    setResultat({ saisie, doc: verifierDocument(user, saisie) });
  };

  const titulaire = resultat?.doc ? getDB().employes.find((e) => e.id === resultat.doc!.employeId) : undefined;

  return (
    <div className="bg-[#182234] rounded-xl border border-slate-800 p-5 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Icon name="security" className="text-[18px] text-brand-400" />
            <h3 className="font-display text-sm font-semibold text-white">Vérification &amp; Intégrité certifiée</h3>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Conforme APDP Bénin</span>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              verifier();
            }}
          >
            <TextInput
              aria-label="Code de vérification, référence ou empreinte"
              className="flex-1"
              mono
              onChange={(v) => {
                setCode(v);
                setResultat(null);
              }}
              placeholder="Code document ou hash..."
              value={code}
              variant="sombre"
            />
            <button
              className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-colors disabled:opacity-40"
              disabled={!code.trim()}
              type="submit"
            >
              Vérifier
            </button>
          </form>
          {resultat &&
            (resultat.doc ? (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-start gap-2.5">
                <Icon name="verified" className="text-[18px] text-emerald-400" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-emerald-300">Document authentique</span>
                  <span className="text-slate-200">{resultat.doc.titre}</span>
                  <span className="text-slate-400">
                    {titulaire ? `${titulaire.prenom} ${titulaire.nom} • ` : ''}Réf. {resultat.doc.reference} • émis le {dateHeure(resultat.doc.date)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs flex items-start gap-2.5">
                <Icon name="gpp_bad" className="text-[18px] text-rose-400" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-rose-300">Aucun document certifié ne correspond</span>
                  <span className="text-slate-400">« {resultat.saisie} » — document falsifié ou code erroné.</span>
                </div>
              </div>
            ))}
          <div className="flex items-center gap-3 mt-1">
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <Icon name="check_circle" className="text-[14px] text-emerald-400" />
              Horodatage certifié
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <Icon name="fingerprint" className="text-[14px] text-brand-400" />
              Empreinte SHA-256
            </span>
          </div>
        </div>
      </div>
      <div className="pt-3 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
        <span>Souveraineté des données République du Bénin</span>
        <span className="font-mono text-[11px]">SikaID v3.2</span>
      </div>
    </div>
  );
}

// Détail d'un document généré (référence, code et empreinte)
export function DocumentDetailModal({ doc, onClose, titulaire }: { doc: DocumentGenere | null; onClose: () => void; titulaire?: string }) {
  const telecharger = useTelechargement();
  return (
    <Modal open={doc !== null} onClose={onClose}>
      {doc && (
        <div className="bg-[#111827] border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 bg-[#182234]/70 flex items-center justify-between">
            <div className="min-w-0">
              <h4 className="font-display text-base font-semibold text-white truncate">{doc.titre}</h4>
              <p className="text-xs text-slate-400 mt-0.5">{doc.sousTitre}</p>
            </div>
            <button className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80" onClick={onClose} type="button">
              <Icon name="close" className="text-[19px]" />
            </button>
          </div>
          <div className="p-6 flex flex-col divide-y divide-slate-800/70 text-xs">
            {[
              ['Référence', doc.reference],
              ...(titulaire ? [['Titulaire', titulaire]] : []),
              ['Catégorie', LIBELLE_CATEGORIE[doc.categorie]],
              ['Émis le', dateHeure(doc.date)],
              ['Généré par', doc.generePar],
              ['Certification', CERTIFICATION[doc.categorie].libelle],
              ['Code de vérification', doc.code],
            ].map(([l, v]) => (
              <div key={l} className="py-2.5 flex justify-between gap-4">
                <span className="text-slate-400 shrink-0">{l}</span>
                <span className="text-slate-200 text-right font-mono">{v}</span>
              </div>
            ))}
            <div className="py-2.5 flex flex-col gap-1">
              <span className="text-slate-400">Empreinte SHA-256</span>
              <span className="text-slate-300 font-mono text-[10px] break-all">{doc.empreinte}</span>
            </div>
            <div className="pt-4 flex justify-end">
              <button
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white shadow-sm flex items-center gap-2 transition-colors"
                onClick={() => telecharger(doc)}
                type="button"
              >
                <Icon name="download" className="text-[16px]" />
                Télécharger le PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

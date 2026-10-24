import type { CategorieDocument, DocumentGenere, Employe, ModeleDocument, TypeDocumentDemande } from '../types';
import { codeVerification, sha256 } from './hash';
import { dateKey, moisLong } from './time';

export const LIBELLE_DEMANDE_DOCUMENT: Record<TypeDocumentDemande, string> = {
  attestation_travail: "Attestation d'emploi",
  attestation_salaire: 'Attestation de salaire',
  certificat_presence: 'Certificat de présence',
  duplicata_paie: 'Duplicata bulletin de paie',
};

export const LIBELLE_MODELE: Record<ModeleDocument, string> = {
  attestation_travail: "Attestation de travail & d'emploi",
  attestation_salaire: 'Attestation de salaire',
  certificat_presence: 'Certificat de présence',
  duplicata_paie: 'Duplicata bulletin de paie',
  bulletin_paie: 'Bulletin de paie',
  titre_conge: 'Titre officiel de congé',
  fiche_emargement: "Fiche d'émargement mensuelle",
  avenant: 'Avenant au contrat de travail',
  certificat_travail: 'Certificat de travail',
  solde_tout_compte: 'Reçu pour solde de tout compte',
};

/** Modèles qui nécessitent un mois de référence */
export const MODELES_MENSUELS: ModeleDocument[] = ['certificat_presence', 'duplicata_paie', 'bulletin_paie', 'fiche_emargement'];

const CATEGORIE: Record<ModeleDocument, CategorieDocument> = {
  attestation_travail: 'attestations',
  attestation_salaire: 'attestations',
  certificat_presence: 'attestations',
  duplicata_paie: 'bulletins',
  bulletin_paie: 'bulletins',
  titre_conge: 'titres_conge',
  fiche_emargement: 'pointages',
  avenant: 'contrats',
  certificat_travail: 'contrats',
  solde_tout_compte: 'bulletins',
};

export const LIBELLE_CATEGORIE: Record<CategorieDocument, string> = {
  bulletins: 'Rémunération',
  titres_conge: 'Congés & Absences',
  attestations: 'Attestation',
  contrats: 'Contrat',
  pointages: 'Pointages',
};

export const STYLE_CATEGORIE: Record<CategorieDocument, { icon: string; iconClass: string }> = {
  bulletins: { icon: 'picture_as_pdf', iconClass: 'bg-rose-500/10 text-rose-400 border border-rose-500/20' },
  titres_conge: { icon: 'event_note', iconClass: 'bg-brand-500/10 text-brand-400 border border-brand-500/20' },
  attestations: { icon: 'badge', iconClass: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' },
  contrats: { icon: 'description', iconClass: 'bg-slate-800 text-slate-300 border border-slate-700' },
  pointages: { icon: 'fingerprint', iconClass: 'bg-slate-800 text-slate-300 border border-slate-700' },
};

export const CERTIFICATION: Record<CategorieDocument, { icon: string; libelle: string; className: string }> = {
  bulletins: { icon: 'verified', libelle: 'Signé e-ID', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
  titres_conge: { icon: 'verified', libelle: 'Signé e-ID', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
  attestations: { icon: 'shield', libelle: 'Certifié APDP', className: 'bg-brand-500/10 text-brand-400 border border-brand-500/20' },
  contrats: { icon: 'verified', libelle: 'Signé e-ID', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
  pointages: { icon: 'fingerprint', libelle: 'Conforme', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
};

const PREFIXE: Record<ModeleDocument, string> = {
  attestation_travail: 'AT-EMP',
  attestation_salaire: 'AT-SAL',
  certificat_presence: 'CP-PRE',
  duplicata_paie: 'PAIE-DUP',
  bulletin_paie: 'PAIE',
  titre_conge: 'CG',
  fiche_emargement: 'FE',
  avenant: 'AV',
  certificat_travail: 'CT',
  solde_tout_compte: 'STC',
};

interface ConstruireOptions {
  id: string;
  employe: Employe;
  modele: ModeleDocument;
  params: Record<string, string>;
  dateISO: string;
  generePar: string;
  sequence: number;
}

/** Construit l'enregistrement d'un document certifié (titre, référence, empreinte et code de vérification) */
export function construireDocument({ id, employe, modele, params, dateISO, generePar, sequence }: ConstruireOptions): DocumentGenere {
  const jour = dateKey(new Date(dateISO));
  const annee = jour.slice(0, 4);
  const mois = params.mois;
  let titre = LIBELLE_MODELE[modele];
  let sousTitre = '';
  let reference = `${PREFIXE[modele]}-${annee}-${String(sequence).padStart(4, '0')}`;

  switch (modele) {
    case 'bulletin_paie':
      titre = `Bulletin de paie — ${moisLong(mois)}`;
      reference = `PAIE-${mois}-${employe.matricule}`;
      sousTitre = params.net ? `Net payé ${params.net} • ${params.datePaiement}` : `Réf. ${reference} • Direction Financière`;
      break;
    case 'duplicata_paie':
      titre = `Duplicata bulletin de paie — ${moisLong(mois)}`;
      sousTitre = `Réf. ${reference} • Direction Financière`;
      break;
    case 'fiche_emargement':
      titre = `Fiche d'émargement mensuelle — ${moisLong(mois)}`;
      reference = `FE-${mois}`;
      sousTitre = 'Registre biométrique Cotonou HQ';
      break;
    case 'certificat_presence':
      titre = `Certificat de présence — ${moisLong(mois)}`;
      sousTitre = `Réf. ${reference} • Registre des pointages`;
      break;
    case 'titre_conge':
      titre = `Titre officiel de congé (${params.periode})`;
      sousTitre = `Réf. ${reference} • ${params.jours} jour(s) ouvrable(s)`;
      break;
    case 'avenant':
      titre = `Avenant au contrat — ${params.typeLibelle} (effet ${params.dateEffet})`;
      sousTitre = `Réf. ${reference} • ${params.poste}`;
      break;
    case 'certificat_travail':
      sousTitre = `Réf. ${reference} • Sortie le ${params.dateSortie} (Code du travail art. 62)`;
      break;
    case 'solde_tout_compte':
      sousTitre = `Réf. ${reference} • Net versé ${params.net}`;
      break;
    case 'attestation_salaire':
      sousTitre = params.destinataire ? `Destinataire : ${params.destinataire}` : 'Usage officiel légal';
      break;
    case 'attestation_travail':
      sousTitre = 'Usage officiel légal • Validité 1 an';
      break;
  }

  const empreinte = sha256(JSON.stringify({ reference, employe: employe.id, modele, titre, date: dateISO, params }));
  return {
    id,
    reference,
    employeId: employe.id,
    modele,
    categorie: CATEGORIE[modele],
    titre,
    sousTitre,
    date: dateISO,
    code: codeVerification(empreinte),
    empreinte,
    generePar,
    params,
  };
}

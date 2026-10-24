import type { CampagnePaie, LignePaie } from '../types';
import { dateKey, dernierDuMois, moisLong } from './time';

// Écritures de paie selon le plan comptable SYSCOHADA révisé (Acte uniforme OHADA relatif au droit comptable, 2017).
//  Charges : 661x rémunérations directes, 663x indemnités forfaitaires, 6641 charges sociales, 6413 taxes sur salaires.
//  Tiers   : 422 personnel (rémunérations dues), 421 avances, 431 sécurité sociale, 4472 impôts sur salaires retenus,
//            4478 autres contributions, 4421 impôts d'État (VPS) ; 781 transferts de charges (avantages en nature) ; 521 banque.
// ⚠ Plan de comptes et ventilation à faire valider par l'expert-comptable de l'entreprise.

export const COMPTES = {
  '6611': 'Appointements, salaires et commissions',
  '6612': 'Primes et gratifications',
  '6613': 'Congés payés',
  '6614': 'Indemnités de préavis, de licenciement et de recherche d’embauche',
  '6617': 'Avantages en nature',
  '6618': 'Autres rémunérations directes',
  '6631': 'Indemnités de logement',
  '6632': 'Indemnités de représentation',
  '6638': 'Autres indemnités et avantages divers',
  '6641': 'Charges sociales sur rémunération du personnel national',
  '6413': 'Taxes sur appointements et salaires',
  '421': 'Personnel, avances et acomptes',
  '422': 'Personnel, rémunérations dues',
  '431': 'Sécurité sociale',
  '4421': 'Impôts et taxes d’État',
  '4472': 'Impôts sur salaires',
  '4478': 'Autres impôts et contributions',
  '781': 'Transferts de charges d’exploitation',
  '521': 'Banques locales',
} as const;

export type Compte = keyof typeof COMPTES;

export interface Ecriture {
  date: string;
  journal: 'PAIE' | 'BANQUE';
  piece: string;
  compte: Compte;
  libelle: string;
  debit: number;
  credit: number;
}

/** Compte de charge d'une prime fixe selon sa nature */
function comptePrime(libelle: string, remboursementFrais: boolean): Compte {
  if (/logement/i.test(libelle)) return '6631';
  if (/repr[ée]sentation/i.test(libelle)) return '6632';
  if (remboursementFrais || /transport/i.test(libelle)) return '6638';
  return '6612';
}

/** Ventilation des charges d'une ligne de paie par compte */
function chargesLigne(l: LignePaie): Partial<Record<Compte, number>> {
  const c: Partial<Record<Compte, number>> = {};
  const ajouter = (compte: Compte, montant: number) => {
    if (montant) c[compte] = (c[compte] ?? 0) + montant;
  };
  ajouter('6611', l.salaireBase + l.heuresSup.montant - l.retenueAbsences - l.retenueMaladie);
  ajouter('6612', l.primeAnciennete);
  l.primesFixes.forEach((p) => ajouter(comptePrime(p.libelle, p.remboursementFrais), p.montant));
  l.elements.filter((x) => x.nature === 'prime').forEach((x) => ajouter('6612', x.montant));
  ajouter('6613', l.complementAllocationConge);
  (l.indemnitesRupture ?? []).forEach((r) => ajouter(r.code === 'conges' ? '6613' : r.code === 'retraite' || r.code === 'deces' ? '6618' : '6614', r.montant));
  (l.avantagesNature ?? []).forEach((a) => ajouter('6617', a.montant));
  return c;
}

/** Journal de paie d'une campagne (une écriture équilibrée) et, si elle est versée, l'écriture de règlement */
export function ecrituresPaie(campagne: CampagnePaie): Ecriture[] {
  const date = dernierDuMois(campagne.mois);
  const piece = campagne.reference;
  const libelle = `Paie ${moisLong(campagne.mois)}`;
  const lignes: Ecriture[] = [];
  const debit = (compte: Compte, montant: number, lib = libelle) => montant > 0 && lignes.push({ date, journal: 'PAIE', piece, compte, libelle: lib, debit: montant, credit: 0 });
  const credit = (compte: Compte, montant: number, lib = libelle) => montant > 0 && lignes.push({ date, journal: 'PAIE', piece, compte, libelle: lib, debit: 0, credit: montant });

  // Charges, regroupées par compte
  const charges: Partial<Record<Compte, number>> = {};
  campagne.lignes.forEach((l) =>
    Object.entries(chargesLigne(l)).forEach(([compte, montant]) => {
      charges[compte as Compte] = (charges[compte as Compte] ?? 0) + (montant ?? 0);
    }),
  );
  (Object.keys(charges) as Compte[]).sort().forEach((compte) => debit(compte, charges[compte]!, `${libelle} — ${COMPTES[compte]}`));
  const somme = (f: (l: LignePaie) => number) => campagne.lignes.reduce((t, l) => t + f(l), 0);
  debit('6641', somme((l) => l.cnssPatronale), `${libelle} — CNSS part patronale`);
  debit('6413', somme((l) => l.vps), `${libelle} — Versement patronal sur salaires`);

  // Dettes : organismes sociaux, État, personnel
  credit('431', somme((l) => l.cnssSalariale + l.cnssPatronale), `${libelle} — CNSS (parts salariale et patronale)`);
  credit('4472', somme((l) => l.its), `${libelle} — ITS retenu à la source`);
  credit('4478', somme((l) => l.redevanceOrtb), `${libelle} — Redevance ORTB`);
  credit('4421', somme((l) => l.vps), `${libelle} — VPS dû`);
  credit('421', somme((l) => l.autresRetenues), `${libelle} — Retenues (avances, acomptes)`);
  credit('781', somme((l) => (l.avantagesNature ?? []).reduce((t, a) => t + a.montant, 0)), `${libelle} — Avantages en nature (transfert de charges)`);
  campagne.lignes.forEach((l) => credit('422', l.net, `${libelle} — Net à payer ${l.matricule} ${l.nom}`));

  // Règlement des salaires
  if (campagne.statut === 'payee' && campagne.datePaiement) {
    const dp = dateKey(new Date(campagne.datePaiement));
    const total = somme((l) => l.net);
    lignes.push({ date: dp, journal: 'BANQUE', piece, compte: '422', libelle: `Règlement des salaires ${moisLong(campagne.mois)}`, debit: total, credit: 0 });
    lignes.push({ date: dp, journal: 'BANQUE', piece, compte: '521', libelle: `Règlement des salaires ${moisLong(campagne.mois)} (${campagne.modePaiement ?? 'virement'})`, debit: 0, credit: total });
  }
  return lignes;
}

/** Contrôle d'équilibre par journal (débit = crédit) */
export function equilibre(ecritures: Ecriture[]): { journal: string; debit: number; credit: number; ecart: number }[] {
  return (['PAIE', 'BANQUE'] as const)
    .map((journal) => {
      const e = ecritures.filter((x) => x.journal === journal);
      const debit = e.reduce((t, x) => t + x.debit, 0);
      const credit = e.reduce((t, x) => t + x.credit, 0);
      return { journal, debit, credit, ecart: debit - credit };
    })
    .filter((x) => x.debit || x.credit);
}

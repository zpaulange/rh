import type { Database, Employe } from '../types';
import { sousContrat } from './contrat';
import { estJourTravaille, joursTravaillesEntre } from './feries';
import { ajouterJours, dernierDuMois, moisComplets, moisDe } from './time';

// Congés payés selon le Code du travail (art. 158 à 165) et la CCGT de 2005 (art. 50 à 54).
//  - 2 jours ouvrables par mois de service effectif (24 j/an) ; jours ouvrables = lundi → samedi hors fériés ;
//  - suppléments : ancienneté (+2/+4/+6 j après 20/25/30 ans), mères de famille, moins de 18 ans (30 j) ; total ≤ 30 j/an ;
//  - le droit de jouissance s'acquiert au terme d'une période de référence d'un an (art. 160) ;
//  - le congé doit être pris dans les 12 mois suivants (art. 161) ; le droit ne se perd pas automatiquement
//    (prescription de 3 ans seulement si l'employeur a offert la possibilité de le prendre, art. 163).

export type StatutPeriode = 'en_acquisition' | 'jouissable' | 'en_retard';

export interface PeriodeConges {
  annee: string;
  acquis: number;
  pris: number;
  restant: number;
  jouissableDu: string;
  aPrendreAvant: string;
  statut: StatutPeriode;
}

export interface SoldeConges {
  periodes: PeriodeConges[];
  /** Jours acquis sur la période en cours (pas encore jouissables sauf anticipation) */
  enCours: number;
  /** Jours jouissables non pris (reliquats compris) */
  jouissables: number;
  enAttente: number;
  /** Disponible pour une nouvelle demande */
  disponible: number;
  /** Total pris sur l'année civile en cours */
  prisAnnee: number;
  /** Mois de service effectif acquis sur la période en cours */
  moisEnCours: number;
}

const arrondi = (n: number) => Math.round(n * 10) / 10;
const anneesRevolues = (debut: string, fin: string) => Math.floor(moisComplets(debut, fin) / 12);

/** Droit annuel en jours ouvrables à la date donnée (art. 158) */
export function droitAnnuel(db: Database, e: Employe, key: string): number {
  const p = db.parametres;
  const age = anneesRevolues(e.dateNaissance, key);
  let jours = age < 18 ? 30 : p.cpParMois * 12;
  const anciennete = anneesRevolues(e.dateEmbauche, key);
  jours += anciennete >= 30 ? 6 : anciennete >= 25 ? 4 : anciennete >= 20 ? 2 : 0;
  if (e.civilite === 'Mme' && e.enfantsACharge > 0) {
    const enfants = age < 21 ? e.enfantsACharge : Math.max(0, e.enfantsACharge - 3);
    jours += enfants * 2;
  }
  return Math.min(Math.max(jours, p.cpParMois * 12), 30);
}

/**
 * Part du mois constituant du service effectif.
 * Sont assimilés (art. 158 dernier al., CCGT art. 53) : congés, permissions, maladie (≤ 6 mois), accident du travail.
 * Ne le sont pas : absences injustifiées et congés sans solde.
 */
function ratioServiceEffectif(db: Database, e: Employe, mois: string, aujourdhui: string): number {
  const debut = `${mois}-01`;
  const fin = dernierDuMois(mois);
  const prevus = joursTravaillesEntre(db.parametres, debut, fin);
  if (prevus.length === 0) return 0;
  let effectifs = 0;
  for (const k of prevus) {
    if (!sousContrat(e, k)) continue;
    effectifs += 1;
    // Jours non encore écoulés (sortie planifiée) ou antérieurs au registre : pas de contrôle de présence
    if (k < db.parametres.dateDebutPointage || k >= aujourdhui) continue;
    const conge = db.conges.find((c) => c.employeId === e.id && c.statut === 'approuve' && c.debut <= k && k <= c.fin);
    if (conge?.type === 'sans_solde') effectifs -= 1;
    else if (!conge && !db.pointages.some((pt) => pt.employeId === e.id && pt.date === k) && estJourTravaille(db.parametres, k)) effectifs -= 1;
  }
  return Math.max(0, effectifs) / prevus.length;
}

/** Nombre de jours ouvrables d'un congé (lundi → samedi, hors fériés), demi-journées comprises */
export function joursOuvrables(db: Database, debut: string, fin: string, debutMidi = false, finMidi = false): number {
  const feries = new Set(db.parametres.joursFeries.map((j) => j.date));
  const ouvrable = (k: string) => new Date(`${k}T12:00:00Z`).getUTCDay() !== 0 && !feries.has(k);
  let n = 0;
  for (let k = debut; k <= fin; k = ajouterJours(k, 1)) if (ouvrable(k)) n += 1;
  if (debutMidi && ouvrable(debut)) n -= 0.5;
  if (finMidi && ouvrable(fin)) n -= 0.5;
  return Math.max(0, n);
}

/**
 * Solde de congés payés par période de référence (année civile), avec reliquats.
 * `aujourdhui` (jour réel) permet un calcul projeté à une date future, ex. une sortie planifiée.
 */
export function soldeConges(db: Database, e: Employe, todayKey: string, aujourdhui: string = todayKey): SoldeConges {
  const p = db.parametres;
  const debutSuivi = e.dateEmbauche > p.dateRepriseSoldes ? e.dateEmbauche : p.dateRepriseSoldes;
  const moisCourant = moisDe(todayKey);
  const periodes: PeriodeConges[] = [];
  let moisEnCours = 0;

  for (let annee = Number(debutSuivi.slice(0, 4)); annee <= Number(todayKey.slice(0, 4)); annee++) {
    const debutPeriode = `${annee}-01-01` > debutSuivi ? `${annee}-01-01` : debutSuivi;
    let acquis = 0;
    let mois = 0;
    // Droits acquis au terme de chaque mois écoulé
    for (let m = moisDe(debutPeriode); m <= `${annee}-12` && m < moisCourant; m = moisDe(ajouterJours(dernierDuMois(m), 1))) {
      const ratio = ratioServiceEffectif(db, e, m, aujourdhui);
      acquis += (droitAnnuel(db, e, dernierDuMois(m)) / 12) * ratio;
      mois += ratio;
    }
    // Jouissance après une période de référence d'un an (art. 160), au plus tôt le 1er janvier suivant
    const unAnApresEmbauche = `${Number(e.dateEmbauche.slice(0, 4)) + 1}${e.dateEmbauche.slice(4)}`;
    const jouissableDu = [`${annee + 1}-01-01`, unAnApresEmbauche].sort().pop()!;
    const aPrendreAvant = ajouterJours(`${Number(jouissableDu.slice(0, 4)) + 1}${jouissableDu.slice(4)}`, -1);
    const statut: StatutPeriode = todayKey < jouissableDu ? 'en_acquisition' : todayKey <= aPrendreAvant ? 'jouissable' : 'en_retard';
    if (statut === 'en_acquisition' && annee === Number(todayKey.slice(0, 4))) moisEnCours = mois;
    periodes.push({ annee: String(annee), acquis: arrondi(acquis), pris: 0, restant: 0, jouissableDu, aPrendreAvant, statut });
  }

  // Imputation des congés pris : sur la période jouissable la plus ancienne (ou en cours si anticipation)
  const pris = db.conges
    .filter((c) => c.employeId === e.id && c.type === 'conge_paye' && c.statut === 'approuve' && c.debut >= debutSuivi && sousContrat(e, c.debut))
    .sort((a, b) => a.debut.localeCompare(b.debut));
  for (const c of pris) {
    let reste = c.jours;
    const utilisables = periodes.filter((pe) => pe.jouissableDu <= c.debut || p.anticipationConges);
    for (const pe of utilisables) {
      const dispo = pe.acquis - pe.pris;
      if (dispo <= 0) continue;
      const pris = Math.min(dispo, reste);
      pe.pris += pris;
      reste -= pris;
      if (reste <= 0) break;
    }
    // Avance sur droits : imputée sur la période la plus récente
    if (reste > 0 && periodes.length) periodes[periodes.length - 1].pris += reste;
  }
  periodes.forEach((pe) => {
    pe.pris = arrondi(pe.pris);
    pe.restant = arrondi(pe.acquis - pe.pris);
  });

  const enAttente = db.conges.filter((c) => c.employeId === e.id && c.type === 'conge_paye' && c.statut === 'en_attente').reduce((s, c) => s + c.jours, 0);
  const jouissables = arrondi(periodes.filter((pe) => pe.statut !== 'en_acquisition').reduce((s, pe) => s + pe.restant, 0));
  const enCours = arrondi(periodes.filter((pe) => pe.statut === 'en_acquisition').reduce((s, pe) => s + pe.restant, 0));
  const annee = todayKey.slice(0, 4);
  return {
    periodes,
    enCours,
    jouissables,
    enAttente,
    disponible: arrondi(jouissables + (p.anticipationConges ? enCours : 0) - enAttente),
    prisAnnee: arrondi(pris.filter((c) => c.debut.startsWith(annee)).reduce((s, c) => s + c.jours, 0)),
    moisEnCours: arrondi(moisEnCours),
  };
}

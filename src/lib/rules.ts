import { MOTIFS_PERMISSION } from '../config/paie';
import { PAIE } from '../config/paie';
import type { Database, DemandeConge, DebutPeriode, Employe, FinPeriode, Parametres, Pointage, Regularisation, TypeConge } from '../types';
import { soldeConges, type SoldeConges } from './conges';
import { sousContrat } from './contrat';
import { ensembleFeries, estJourTravaille, jourFerie, joursTravaillesEntre } from './feries';
import { ajouterJours, dateKey, estOuvre, heureHM, jourSemaine as jourSemaineCle, lundi, minutesDepuisMinuit, moisDe } from './time';

/* ================= Pointage & retards ================= */

/** Détection automatique du retard : minutes au-delà de l'heure d'embauche (jours travaillés uniquement, hors fériés) */
export function calculerRetard(arriveeISO: string, params: Parametres): number {
  if (!estJourTravaille(params, dateKey(new Date(arriveeISO)))) return 0;
  return Math.max(0, minutesDepuisMinuit(heureHM(arriveeISO)) - minutesDepuisMinuit(params.heureDebut));
}

/** Un retard n'est compté qu'au-delà de la tolérance */
export const estEnRetard = (p: Pointage, params: Parametres): boolean => p.retardMinutes > params.toleranceRetard;

/** Minutes effectivement travaillées (pause déduite, journée en cours comprise) */
export function minutesTravaillees(p: Pointage, now: Date): number {
  const fin = p.depart ? new Date(p.depart).getTime() : now.getTime();
  let pause = p.pauseMinutes;
  if (p.pauseDebut && !p.depart) pause += (now.getTime() - new Date(p.pauseDebut).getTime()) / 60000;
  return Math.max(0, (fin - new Date(p.arrivee).getTime()) / 60000 - pause);
}

export type StatutPointage = 'en_poste' | 'en_pause' | 'a_l_heure' | 'retard' | 'retard_justifie';

export function retardJustifie(db: Database, p: Pointage): boolean {
  return (
    p.source === 'regularisation' ||
    db.regularisations.some(
      (r) => r.employeId === p.employeId && r.date === p.date && r.statut === 'approuve' && r.type !== 'oubli',
    )
  );
}

export function statutPointage(db: Database, p: Pointage): StatutPointage {
  if (!p.depart) return p.pauseDebut ? 'en_pause' : 'en_poste';
  if (estEnRetard(p, db.parametres)) return retardJustifie(db, p) ? 'retard_justifie' : 'retard';
  return 'a_l_heure';
}

export const pointageDuJour = (db: Database, employeId: string, key: string): Pointage | undefined =>
  db.pointages.find((p) => p.employeId === employeId && p.date === key);

export function congeCouvrant(db: Database, employeId: string, key: string): DemandeConge | undefined {
  return db.conges.find((c) => c.employeId === employeId && c.statut === 'approuve' && c.debut <= key && key <= c.fin);
}

export type StatutJour = 'present' | 'en_pause' | 'parti' | 'conge' | 'ferie' | 'absent' | 'non_ouvre' | 'non_pointe' | 'hors_contrat';

/** Situation d'un collaborateur pour une journée donnée */
export function statutJour(db: Database, employeId: string, key: string, todayKey: string, now: Date): StatutJour {
  // Avant la date d'embauche, le collaborateur n'est pas attendu (jamais compté absent)
  const employe = db.employes.find((e) => e.id === employeId);
  if (employe && !sousContrat(employe, key)) return 'hors_contrat';
  const p = pointageDuJour(db, employeId, key);
  if (p) return p.depart ? 'parti' : p.pauseDebut ? 'en_pause' : 'present';
  // Un jour férié est chômé et payé : jamais compté comme absence
  if (estOuvre(key) && jourFerie(db.parametres, key)) return 'ferie';
  if (congeCouvrant(db, employeId, key)) return 'conge';
  if (!estOuvre(key)) return 'non_ouvre';
  if (key === todayKey) {
    const fin = minutesDepuisMinuit(db.parametres.heureFin);
    const nowMin = minutesDepuisMinuit(heureHM(now));
    return nowMin >= fin ? 'absent' : 'non_pointe';
  }
  return key < todayKey ? 'absent' : 'non_pointe';
}

export const LIBELLE_REGULARISATION: Record<Regularisation['type'], string> = {
  oubli: 'Oubli de pointage',
  retard: 'Retard justifié',
  mission: 'Mission externe',
};

/* ================= Congés ================= */

export const LIBELLE_CONGE: Record<TypeConge, string> = {
  conge_paye: 'Congé Annuel Payé',
  permission: 'Permission Exceptionnelle (Événement familial)',
  maladie: 'Repos médical / Maladie',
  rtt: 'RTT / Récupération (non applicable — art. 147)',
  sans_solde: 'Congé sans solde',
  maternite: 'Congé de maternité',
  liberte_preavis: 'Jour de liberté (recherche d’emploi pendant le préavis)',
};

/**
 * Durée d'un congé en jours ouvrables : tous les jours sauf le repos hebdomadaire (dimanche)
 * et les jours fériés (Code du travail art. 158, CCGT art. 50). Demi-journées comprises.
 */
export function dureeConge(debut: string, fin: string, debutPeriode: DebutPeriode, finPeriode: FinPeriode, feries: Set<string>): number {
  if (!debut || !fin || fin < debut) return 0;
  const ouvrable = (k: string) => jourSemaineCle(k) !== 0 && !feries.has(k);
  let total = 0;
  for (let k = debut; k <= fin; k = ajouterJours(k, 1)) if (ouvrable(k)) total += 1;
  if (debutPeriode === 'midi' && ouvrable(debut)) total -= 0.5;
  if (finPeriode === 'midi' && ouvrable(fin)) total -= 0.5;
  return Math.max(total, 0);
}

/* ================= Heures supplémentaires ================= */

export interface DecompteHeuresSup {
  minutes12: number;
  minutes35: number;
  minutesNuit: number;
  minutesDimancheFerie: number;
  minutesDimancheFerieNuit: number;
  minutesComplementaires: number;
  /** Total des heures majorées (hors heures complémentaires) */
  total: number;
}

/**
 * Décompte hebdomadaire des heures au-delà de l'horaire (Code du travail art. 142 et 147, CCGT art. 66) :
 *  - les heures du lundi au samedi s'additionnent ; au-delà de 40 h : +12 % jusqu'à la 48e, +35 % ensuite ;
 *    une heure supplémentaire accomplie entre 21 h et 5 h est majorée de +50 % (nuit) ;
 *  - toute heure travaillée un dimanche ou un jour férié : +50 % de jour, +100 % de nuit ;
 *  - temps partiel : les heures entre l'horaire contractuel et 40 h sont des heures complémentaires, payées sans majoration.
 * La pause est déduite à partir de midi. Une semaine est rattachée au mois qui contient son dimanche.
 */
export function decompteHeuresSup(db: Database, employe: Employe, garderSemaine: (dimanche: string) => boolean): DecompteHeuresSup {
  const feries = ensembleFeries(db.parametres);
  const semaines = new Map<string, Pointage[]>();
  for (const p of db.pointages) {
    if (p.employeId !== employe.id || !p.depart) continue;
    const debutSemaine = lundi(p.date);
    if (!garderSemaine(ajouterJours(debutSemaine, 6))) continue;
    semaines.set(debutSemaine, [...(semaines.get(debutSemaine) ?? []), p]);
  }
  const contrat = employe.heuresHebdo * 60;
  const legal = PAIE.dureeLegaleHebdo * 60;
  const tranche = (PAIE.dureeLegaleHebdo + PAIE.heuresPremiereTranche) * 60;
  const d = { minutes12: 0, minutes35: 0, minutesNuit: 0, minutesDimancheFerie: 0, minutesDimancheFerieNuit: 0, minutesComplementaires: 0, total: 0 };

  for (const pointages of semaines.values()) {
    let cumul = 0;
    for (const p of pointages.sort((a, b) => a.arrivee.localeCompare(b.arrivee))) {
      const debut = Math.floor(new Date(p.arrivee).getTime() / 60000);
      const fin = Math.floor(new Date(p.depart!).getTime() / 60000);
      let pause = p.pauseMinutes;
      let jourCourant = -1;
      let repos = false;
      for (let t = debut; t < fin; t++) {
        const local = t + 60; // fuseau du Bénin (UTC+1, sans heure d'été)
        const jour = Math.floor(local / 1440);
        const minuteJour = local - jour * 1440;
        if (jour !== jourCourant) {
          jourCourant = jour;
          const key = new Date(jour * 86400000).toISOString().slice(0, 10);
          repos = jourSemaineCle(key) === 0 || feries.has(key);
        }
        const nuit = minuteJour >= PAIE.nuitDebut || minuteJour < PAIE.nuitFin;
        if (pause > 0 && !nuit && minuteJour >= 12 * 60) {
          pause -= 1;
          continue;
        }
        if (repos) {
          if (nuit) d.minutesDimancheFerieNuit += 1;
          else d.minutesDimancheFerie += 1;
          continue;
        }
        cumul += 1;
        if (cumul <= contrat) continue;
        if (cumul <= legal) d.minutesComplementaires += 1;
        else if (nuit) d.minutesNuit += 1;
        else if (cumul <= tranche) d.minutes12 += 1;
        else d.minutes35 += 1;
      }
    }
  }
  d.total = d.minutes12 + d.minutes35 + d.minutesNuit + d.minutesDimancheFerie + d.minutesDimancheFerieNuit;
  return d;
}

export interface Solde {
  acquis: number;
  consomme: number;
  enAttente: number;
  restant: number;
}

export interface Droits {
  annee: string;
  /** Mois de service effectif acquis sur la période de référence en cours */
  moisAcquis: number;
  /** Congés payés : acquis jouissables (reliquats compris, + période en cours si anticipation autorisée) */
  cp: Solde;
  detailCp: SoldeConges;
  /** Permissions familiales non déductibles (art. 159 : 10 j/an maximum) */
  permissions: Solde;
  maladie: number;
  sansSolde: number;
}

const arrondi = (n: number) => Math.round(n * 10) / 10;

/** Calcul automatique des droits à congés (Code du travail art. 158 à 165, CCGT art. 50 à 54) */
export function calculerDroits(db: Database, employe: Employe, todayKey: string): Droits {
  const annee = todayKey.slice(0, 4);
  const params = db.parametres;
  const detailCp = soldeConges(db, employe, todayKey);
  const comptees = detailCp.periodes.filter((pe) => pe.statut !== 'en_acquisition' || params.anticipationConges);
  const acquis = arrondi(comptees.reduce((s, pe) => s + pe.acquis, 0));
  const consomme = arrondi(comptees.reduce((s, pe) => s + pe.pris, 0));

  const demandes = db.conges.filter((c) => c.employeId === employe.id && c.debut.startsWith(annee));
  const somme = (type: TypeConge, statut: DemandeConge['statut']) =>
    demandes.filter((c) => c.type === type && c.statut === statut).reduce((s, c) => s + c.jours, 0);
  // Seules les permissions pour événements familiaux s'imputent sur le plafond de l'art. 159
  const familiales = (statut: DemandeConge['statut']) =>
    demandes
      .filter((c) => c.type === 'permission' && c.statut === statut && (!c.motifPermission || MOTIFS_PERMISSION[c.motifPermission]?.familial))
      .reduce((s, c) => s + c.jours, 0);
  const permPrises = familiales('approuve');

  return {
    annee,
    moisAcquis: detailCp.moisEnCours,
    cp: { acquis, consomme, enAttente: detailCp.enAttente, restant: arrondi(acquis - consomme) },
    detailCp,
    permissions: { acquis: params.quotaPermissions, consomme: permPrises, enAttente: familiales('en_attente'), restant: arrondi(params.quotaPermissions - permPrises) },
    maladie: somme('maladie', 'approuve'),
    sansSolde: somme('sans_solde', 'approuve'),
  };
}

/** Solde réellement disponible pour une nouvelle demande : déduit aussi les demandes déjà en attente (null = sans décompte) */
export function disponiblePour(droits: Droits, type: TypeConge): number | null {
  const s = type === 'conge_paye' ? droits.cp : type === 'permission' ? droits.permissions : null;
  return s ? Math.round((s.restant - s.enAttente) * 10) / 10 : null;
}

/** Solde acquis non consommé pour un type de congé (null = sans décompte) */
export function soldePour(droits: Droits, type: TypeConge): number | null {
  if (type === 'conge_paye') return droits.cp.restant;
  if (type === 'permission') return droits.permissions.restant;
  return null;
}

/* ================= Statistiques ================= */

export interface StatsMois {
  joursOuvres: number;
  joursTravailles: number;
  minutes: number;
  retards: number;
  retardsJustifies: number;
  absences: number;
  joursConge: number;
}

/** Statistiques mensuelles d'un collaborateur, arrêtées à aujourd'hui */
export function statsMois(db: Database, employeId: string, mois: string, todayKey: string, now: Date): StatsMois {
  const fin = `${mois}-31` < todayKey ? `${mois}-31` : todayKey;
  const employe = db.employes.find((e) => e.id === employeId);
  const jours = joursTravaillesEntre(db.parametres, `${mois}-01`, fin).filter((k) => moisDe(k) === mois && (!employe || sousContrat(employe, k)));
  const joursAttendus = new Set(jours);
  const pointages = db.pointages.filter((p) => p.employeId === employeId && moisDe(p.date) === mois);
  let retards = 0;
  let retardsJustifies = 0;
  pointages.forEach((p) => {
    if (!estEnRetard(p, db.parametres)) return;
    if (retardJustifie(db, p)) retardsJustifies += 1;
    else retards += 1;
  });
  let absences = 0;
  let joursConge = 0;
  jours.forEach((k) => {
    if (pointages.some((p) => p.date === k)) return;
    if (congeCouvrant(db, employeId, k)) joursConge += 1;
    else if (k < todayKey) absences += 1;
  });
  return {
    joursOuvres: jours.length,
    // Jours ouvrés effectivement travaillés (un pointage le week-end ou un jour férié n'en fait pas partie)
    joursTravailles: pointages.filter((p) => joursAttendus.has(p.date)).length,
    minutes: pointages.reduce((s, p) => s + minutesTravaillees(p, now), 0),
    retards,
    retardsJustifies,
    absences,
    joursConge,
  };
}

/** Nombre de jours travaillés dans le mois complet (hors week-ends et jours fériés) */
export const joursOuvresDuMois = (mois: string, params: Pick<Parametres, 'joursFeries'>): number =>
  joursTravaillesEntre(params, `${mois}-01`, `${mois}-31`).filter((k) => moisDe(k) === mois).length;

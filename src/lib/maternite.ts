import type { Database, DemandeConge, Employe } from '../types';
import { ajouterJours, ajouterMois, ecartJours } from './time';

// Congé de maternité et repos pour allaitement (Code du travail art. 170 à 173).
//  - 14 semaines : début obligatoire 6 semaines avant la date présumée, fin 8 semaines après l'accouchement ;
//  - accouchement avant terme : repos prolongé jusqu'à 14 semaines ; après terme : 8 semaines après l'accouchement ;
//  - prolongation de 4 semaines en cas de maladie résultant de la grossesse ou des couches (certificat) ;
//  - salaire intégral, payé selon les modalités de la CNSS ; repos pour allaitement d'1 h par jour pendant 15 mois.

export const MATERNITE = { avant: 42, apres: 56, total: 98, prolongation: 28, moisAllaitement: 15 };

/** Période du congé (bornes incluses) à partir de la date présumée et, le cas échéant, de la date réelle */
export function periodeMaternite(presumee: string, reelle?: string, prolongation = false): { debut: string; fin: string } {
  const debut = ajouterJours(presumee, -MATERNITE.avant);
  const accouchement = reelle ?? presumee;
  // 8 semaines à compter du jour de l'accouchement, et au moins 14 semaines au total
  let fin = ajouterJours(accouchement, MATERNITE.apres - 1);
  const minimum = ajouterJours(debut, MATERNITE.total - 1);
  if (fin < minimum) fin = minimum;
  if (prolongation) fin = ajouterJours(fin, MATERNITE.prolongation);
  return { debut, fin };
}

/** Nombre de jours calendaires d'un congé (bornes incluses) */
export const joursCalendaires = (debut: string, fin: string): number => ecartJours(debut, fin) + 1;

/** Dernier congé de maternité validé (ou en attente) d'une collaboratrice */
export const congeMaternite = (db: Database, employeId: string): DemandeConge | undefined =>
  db.conges
    .filter((c) => c.employeId === employeId && c.type === 'maternite' && c.statut !== 'refuse')
    .sort((a, b) => b.debut.localeCompare(a.debut))[0];

/** Fin du droit au repos pour allaitement : 15 mois à compter de la reprise (CT art. 173) */
export function finAllaitement(c: DemandeConge): string {
  return ajouterJours(ajouterMois(ajouterJours(c.fin, 1), MATERNITE.moisAllaitement), -1);
}

/** Repos pour allaitement en cours à une date (congé validé, accouchement déclaré ou non) */
export function allaitementEnCours(db: Database, e: Employe, key: string): { jusquau: string } | null {
  const c = db.conges
    .filter((x) => x.employeId === e.id && x.type === 'maternite' && x.statut === 'approuve' && x.fin < key)
    .sort((a, b) => b.fin.localeCompare(a.fin))[0];
  if (!c) return null;
  const jusquau = finAllaitement(c);
  return key <= jusquau ? { jusquau } : null;
}

/** Protection contre le licenciement : grossesse ou congé de maternité en cours sur la période (CT art. 171) */
export const materniteProtegee = (db: Database, employeId: string, debut: string, fin: string): DemandeConge | undefined =>
  db.conges.find((c) => c.employeId === employeId && c.type === 'maternite' && c.statut !== 'refuse' && c.debut <= fin && debut <= c.fin);

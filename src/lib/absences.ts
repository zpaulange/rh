import type { Database, DemandeConge, Employe } from '../types';
import { estJourTravaille } from './feries';
import { congeCouvrant, statutJour } from './rules';
import { ajouterJours } from './time';

// Absences sur une période, à partir du registre de pointage et des congés validés :
//  - non justifiée : jour travaillé passé, sans pointage ni absence autorisée ;
//  - justifiée : jour couvert par un congé, une permission, un arrêt maladie ou une absence sans solde validés.

export interface PeriodeAbsence {
  employe: Employe;
  debut: string;
  fin: string;
  /** Jours travaillés concernés (hors week-end et fériés) */
  jours: string[];
  justifiee: boolean;
  conge: DemandeConge | null;
}

/**
 * Regroupe les jours d'absence consécutifs (les jours non travaillés intercalés ne coupent pas la période).
 * Les jours antérieurs au registre de pointage ne sont pas analysés.
 */
export function absencesPeriode(db: Database, debut: string, fin: string, todayKey: string, now: Date, employes: Employe[] = db.employes): PeriodeAbsence[] {
  const borneDebut = debut < db.parametres.dateDebutPointage ? db.parametres.dateDebutPointage : debut;
  const borneFin = fin > todayKey ? todayKey : fin;
  const resultat: PeriodeAbsence[] = [];
  for (const e of employes) {
    let courante: PeriodeAbsence | null = null;
    for (let k = borneDebut; k <= borneFin; k = ajouterJours(k, 1)) {
      if (!estJourTravaille(db.parametres, k)) continue;
      const statut = statutJour(db, e.id, k, todayKey, now);
      const conge = statut === 'conge' ? (congeCouvrant(db, e.id, k) ?? null) : null;
      const absent = statut === 'absent';
      if (!absent && !conge) {
        courante = null;
        continue;
      }
      const memeNature = courante && courante.justifiee === !absent && (courante.conge?.id ?? null) === (conge?.id ?? null);
      if (courante && memeNature) {
        courante.fin = k;
        courante.jours.push(k);
      } else {
        courante = { employe: e, debut: k, fin: k, jours: [k], justifiee: !absent, conge };
        resultat.push(courante);
      }
    }
  }
  return resultat.sort((a, b) => b.debut.localeCompare(a.debut) || a.employe.nom.localeCompare(b.employe.nom));
}

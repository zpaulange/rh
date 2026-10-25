import { serverNow } from '../lib/serverTime';
import { ajouterJours, dateKey, moisDe } from '../lib/time';
import type { Database, Notification, User } from '../types';

// Lectures calculées localement sur les données reçues de l'API (aucune modification)

/** Mois de référence des documents mensuels : le mois précédent */
export const moisReference = (): string => moisDe(ajouterJours(`${moisDe(dateKey(serverNow()))}-01`, -1));

/** Notifications destinées à l'utilisateur, les plus récentes d'abord */
export const notificationsPour = (db: Database, user: User): Notification[] =>
  db.notifications
    .filter((n) => n.pour.employeId === user.employeId || n.pour.role === user.role)
    .sort((a, b) => b.date.localeCompare(a.date));

/** Données à conserver qui empêchent la suppression d'un dossier (le serveur applique la même règle) */
export function motifsBlocageSuppression(db: Database, employeId: string): string[] {
  const motifs: string[] = [];
  const paies = db.campagnesPaie.filter((c) => c.lignes.some((l) => l.employeId === employeId)).length;
  if (paies) motifs.push(`${paies} paie(s) calculée(s) ou versée(s)`);
  const docs = db.documents.filter((d) => d.employeId === employeId).length;
  if (docs) motifs.push(`${docs} document(s) certifié(s)`);
  const pointages = db.pointages.filter((p) => p.employeId === employeId).length;
  if (pointages) motifs.push(`${pointages} pointage(s) au registre de présence`);
  const conges = db.conges.filter((c) => c.employeId === employeId && c.statut === 'approuve').length;
  if (conges) motifs.push(`${conges} absence(s) validée(s)`);
  if (db.evolutions.some((ev) => ev.employeId === employeId && ev.type !== 'embauche' && ev.statut === 'appliquee')) motifs.push('des évolutions de carrière appliquées');
  return motifs;
}

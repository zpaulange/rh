import type { JourFerie, Parametres } from '../types';
import { ajouterJours, estOuvre } from './time';

/** Dimanche de Pâques (calendrier grégorien, algorithme de Meeus/Jones/Butcher) */
export function paques(annee: number): string {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

// Fêtes musulmanes : dates estimées, à confirmer chaque année par le décret gouvernemental
const FETES_MUSULMANES: Record<number, { ramadan: string; tabaski: string; maouloud: string }> = {
  2024: { ramadan: '2024-04-10', tabaski: '2024-06-16', maouloud: '2024-09-15' },
  2025: { ramadan: '2025-03-30', tabaski: '2025-06-06', maouloud: '2025-09-04' },
  2026: { ramadan: '2026-03-20', tabaski: '2026-05-27', maouloud: '2026-08-25' },
  2027: { ramadan: '2027-03-10', tabaski: '2027-05-17', maouloud: '2027-08-15' },
  2028: { ramadan: '2028-02-27', tabaski: '2028-05-05', maouloud: '2028-08-03' },
};

/** Deuxième vendredi de janvier : fête annuelle des religions traditionnelles (loi n° 2024-32 du 2 septembre 2024) */
export function feteReligionsTraditionnelles(annee: number): string {
  let k = `${annee}-01-01`;
  while (new Date(`${k}T12:00:00Z`).getUTCDay() !== 5) k = ajouterJours(k, 1);
  return ajouterJours(k, 7);
}

/**
 * Jours fériés chômés et payés (lois n° 90-019 du 27 juillet 1990, n° 97-031 du 20 août 1997 et n° 2024-32 du 2 septembre 2024).
 * Les journées nationales (16 janvier, 28 février, 8 mars) ne sont pas chômées. Les jours exceptionnels décrétés par le
 * gouvernement s'ajoutent depuis les paramètres.
 */
export function joursFeriesBenin(annee: number): JourFerie[] {
  const p = paques(annee);
  const vodun = feteReligionsTraditionnelles(annee);
  const liste: JourFerie[] = [
    { date: `${annee}-01-01`, libelle: "Jour de l'an", estime: false },
    { date: ajouterJours(vodun, -1), libelle: 'Veille de la fête des religions traditionnelles', estime: false },
    { date: vodun, libelle: 'Fête des religions traditionnelles (Vodun)', estime: false },
    { date: ajouterJours(p, 1), libelle: 'Lundi de Pâques', estime: false },
    { date: `${annee}-05-01`, libelle: 'Fête du Travail', estime: false },
    { date: ajouterJours(p, 39), libelle: 'Ascension', estime: false },
    { date: ajouterJours(p, 50), libelle: 'Lundi de Pentecôte', estime: false },
    { date: `${annee}-08-01`, libelle: 'Fête nationale (Indépendance)', estime: false },
    { date: `${annee}-08-15`, libelle: 'Assomption', estime: false },
    { date: `${annee}-11-01`, libelle: 'Toussaint', estime: false },
    { date: `${annee}-12-25`, libelle: 'Noël', estime: false },
  ];
  const m = FETES_MUSULMANES[annee];
  if (m) {
    liste.push(
      { date: m.ramadan, libelle: 'Aïd el-Fitr (Ramadan)', estime: true },
      { date: m.tabaski, libelle: 'Aïd el-Kébir (Tabaski)', estime: true },
      { date: m.maouloud, libelle: 'Maouloud', estime: true },
    );
  }
  return liste.sort((a, b) => a.date.localeCompare(b.date));
}

/** Ensemble des dates fériées paramétrées */
export const ensembleFeries = (p: Pick<Parametres, 'joursFeries'>): Set<string> => new Set(p.joursFeries.map((j) => j.date));

export const jourFerie = (p: Pick<Parametres, 'joursFeries'>, key: string): JourFerie | undefined => p.joursFeries.find((j) => j.date === key);

/** Jour normalement travaillé : du lundi au vendredi, hors jour férié */
export const estJourTravaille = (p: Pick<Parametres, 'joursFeries'>, key: string): boolean => estOuvre(key) && !jourFerie(p, key);

/** Jours travaillés (lundi-vendredi hors fériés) entre deux dates incluses */
export function joursTravaillesEntre(p: Pick<Parametres, 'joursFeries'>, debut: string, fin: string): string[] {
  const feries = ensembleFeries(p);
  const out: string[] = [];
  for (let k = debut; k <= fin; k = ajouterJours(k, 1)) if (estOuvre(k) && !feries.has(k)) out.push(k);
  return out;
}

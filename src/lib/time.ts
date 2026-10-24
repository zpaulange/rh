// Toutes les dates métier sont exprimées dans le fuseau du Bénin (UTC+1, sans heure d'été).
export const TIMEZONE = 'Africa/Porto-Novo';
const OFFSET = '+01:00';

const keyFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const hmFormatter = new Intl.DateTimeFormat('fr-FR', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false });
const hmsFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const MOIS_COURT = ['Jan', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/** "YYYY-MM-DD" dans le fuseau du Bénin */
export const dateKey = (d: Date): string => keyFormatter.format(d);

/** "HH:MM" dans le fuseau du Bénin */
export const heureHM = (iso: string | Date): string => hmFormatter.format(typeof iso === 'string' ? new Date(iso) : iso);

export const heureHMS = (d: Date): string => hmsFormatter.format(d);

/** Construit un instant ISO à partir d'une date clé et d'une heure locale "HH:MM" */
export const instant = (key: string, hm: string): string => new Date(`${key}T${hm}:00${OFFSET}`).toISOString();

/** Date à midi (évite tout effet de fuseau pour les calculs calendaires) */
const midi = (key: string): Date => new Date(`${key}T12:00:00Z`);

export const jourSemaine = (key: string): number => midi(key).getUTCDay();
export const estOuvre = (key: string): boolean => {
  const d = jourSemaine(key);
  return d !== 0 && d !== 6;
};

export const ajouterJours = (key: string, n: number): string => {
  const d = midi(key);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const ecartJours = (a: string, b: string): number => Math.round((midi(b).getTime() - midi(a).getTime()) / 86400000);

/** Lundi de la semaine de la date */
export const lundi = (key: string): string => {
  const d = jourSemaine(key);
  return ajouterJours(key, d === 0 ? -6 : 1 - d);
};

/** Jours ouvrés (lun-ven) entre deux dates incluses */
export function joursOuvresEntre(debut: string, fin: string): string[] {
  const out: string[] = [];
  for (let k = debut; k <= fin; k = ajouterJours(k, 1)) if (estOuvre(k)) out.push(k);
  return out;
}

export const moisDe = (key: string): string => key.slice(0, 7);
export const premierDuMois = (mois: string): string => `${mois}-01`;
export const dernierDuMois = (mois: string): string => {
  const [y, m] = mois.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10);
};

/** Numéro de semaine ISO */
export function numeroSemaine(key: string): number {
  const d = midi(key);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** "Jeudi 24 Octobre 2024" */
export function dateLongue(key: string): string {
  const d = midi(key);
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Mercredi 23 Oct" */
export function dateJourCourt(key: string): string {
  const d = midi(key);
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS_COURT[d.getUTCMonth()]}`;
}

/** "24 Oct 2024" */
export function dateCourte(key: string): string {
  const d = midi(key);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MOIS_COURT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "24 Oct" */
export function jourMois(key: string): string {
  const d = midi(key);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MOIS_COURT[d.getUTCMonth()]}`;
}

/** "21 Octobre" */
export function jourMoisLong(key: string): string {
  const d = midi(key);
  return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}

/** "Octobre 2024" */
export function moisLong(mois: string): string {
  const [y, m] = mois.split('-').map(Number);
  return `${MOIS[m - 1]} ${y}`;
}

export const abreviationJour = (key: string): string => JOURS[jourSemaine(key)].slice(0, 3);

/** "24 Oct 2024 à 14:32" pour un instant ISO */
export const dateHeure = (iso: string): string => `${dateCourte(dateKey(new Date(iso)))} à ${heureHM(iso)}`;

/** "8h 15m" */
export function dureeHM(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** "01:00" */
export function dureeHHMM(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export const minutesDepuisMinuit = (hm: string): number => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

/** Format "18.5" sans zéros inutiles */
/** Nombre à une décimale, virgule française (ex. 14,5) */
export const nombre = (n: number): string => String(Math.round(n * 10) / 10).replace('.', ',');

/** Les n derniers mois (le plus récent d'abord), au format "YYYY-MM" */
export function derniersMois(todayKey: string, n: number): string[] {
  const out: string[] = [];
  let m = moisDe(todayKey);
  for (let i = 0; i < n; i++) {
    out.push(m);
    m = moisDe(ajouterJours(`${m}-01`, -1));
  }
  return out;
}

/** "01 Mars 2021" */
export function dateMoisLong(key: string): string {
  const [, , d] = key.split('-');
  return `${d} ${moisLong(key.slice(0, 7))}`;
}

/** Nombre de mois complets écoulés entre deux dates (ancienneté exacte au jour près) */
export function moisComplets(debut: string, fin: string): number {
  if (fin < debut) return 0;
  const [y1, m1, d1] = debut.split('-').map(Number);
  const [y2, m2, d2] = fin.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

/** Ajoute des mois de quantième à quantième (fin de mois si le jour n'existe pas) */
export function ajouterMois(key: string, n: number): string {
  const [a, m, j] = key.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  const annee = Math.floor(total / 12);
  const mois = (total % 12) + 1;
  const dernier = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  return `${annee}-${String(mois).padStart(2, '0')}-${String(Math.min(j, dernier)).padStart(2, '0')}`;
}

import type { Employe } from '../types';

/** Le collaborateur est-il sous contrat ce jour-là (entre l'embauche et la sortie incluses) ? */
export const sousContrat = (e: Pick<Employe, 'dateEmbauche' | 'dateSortie'>, key: string): boolean => key >= e.dateEmbauche && (!e.dateSortie || key <= e.dateSortie);

/** Le collaborateur a-t-il quitté l'entreprise à cette date ? */
export const estSorti = (e: Pick<Employe, 'dateSortie'>, key: string): boolean => Boolean(e.dateSortie && e.dateSortie < key);

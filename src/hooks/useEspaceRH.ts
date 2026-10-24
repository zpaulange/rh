import { useUser } from '../auth/AuthContext';
import { useDB } from '../db/store';
import { useServerClock } from '../lib/serverTime';
import { dateKey } from '../lib/time';
import { useBaseGestion } from './useBaseGestion';

/** Contexte courant des écrans de gestion (RH ou admin) : base, gestionnaire connecté, heure serveur et racine des liens */
export function useEspaceRH() {
  const user = useUser();
  const db = useDB();
  const now = useServerClock();
  const base = useBaseGestion();
  return { user, db, now, today: dateKey(now), base };
}

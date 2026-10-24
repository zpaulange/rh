import { useMemo } from 'react';
import { useUser } from '../auth/AuthContext';
import { useDB } from '../db/store';
import { useServerClock } from '../lib/serverTime';
import { dateKey } from '../lib/time';

/** Contexte courant de l'espace employé : base, collaborateur connecté et heure serveur */
export function useEspaceEmploye() {
  const user = useUser();
  const db = useDB();
  const now = useServerClock();
  const today = dateKey(now);
  const employe = useMemo(() => db.employes.find((e) => e.id === user.employeId)!, [db, user.employeId]);
  return { user, db, now, today, employe };
}

import { useEffect, useState } from 'react';

// Horodatage sécurisé : l'heure de référence est celle du serveur, jamais l'horloge du poste.
// Côté navigateur, l'écart avec le serveur est mesuré sur l'en-tête HTTP « Date » de l'API (affichage) ;
// les pointages et décisions sont horodatés par le backend.

/** Racine de l'API (proxy Vite en développement, même origine en production) */
export const API_URL: string = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_URL ?? '/api';

let offsetMs = 0;
let source: 'serveur' | 'local' = 'local';
let syncPromise: Promise<void> | null = null;

async function synchroniser(): Promise<void> {
  try {
    const t0 = Date.now();
    const res = await fetch(`${API_URL}/horloge?t=${t0}`, { method: 'HEAD', cache: 'no-store' });
    const t1 = Date.now();
    const header = res.headers.get('Date');
    if (!header) return;
    const serveur = new Date(header).getTime();
    if (Number.isNaN(serveur)) return;
    // L'en-tête est à la seconde : on vise le milieu de la seconde et de l'aller-retour
    offsetMs = serveur + 500 + (t1 - t0) / 2 - t1;
    source = 'serveur';
  } catch {
    source = 'local';
  }
}

export function syncServerTime(): Promise<void> {
  if (!syncPromise) {
    syncPromise = synchroniser();
    window.setInterval(() => void synchroniser(), 5 * 60 * 1000);
  }
  return syncPromise;
}

export const serverNow = (): Date => new Date(Date.now() + offsetMs);
export const serverNowISO = (): string => serverNow().toISOString();
export const timeSource = (): 'serveur' | 'local' => source;

/** Heure serveur rafraîchie chaque seconde */
export function useServerClock(): Date {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    void syncServerTime().then(() => setNow(serverNow()));
    const id = window.setInterval(() => setNow(serverNow()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

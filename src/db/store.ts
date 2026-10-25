import { useSyncExternalStore } from 'react';
import type { Database } from '../types';

// Cache, côté navigateur, des données visibles par l'utilisateur connecté.
// La source de vérité est le serveur (API + MySQL) : ce cache est remplacé par la vue renvoyée
// à la connexion, après chaque action et à chaque nouvelle révision signalée en temps réel.
// Rien n'est conservé dans le stockage du navigateur.

/** Données avant connexion : aucun enregistrement, paramètres par défaut */
export function baseVide(): Database {
  return {
    version: 0,
    comptes: [],
    employes: [],
    pointages: [],
    conges: [],
    regularisations: [],
    demandesDocuments: [],
    documents: [],
    notifications: [],
    audit: [],
    evolutions: [],
    campagnesPaie: [],
    departements: [],
    sorties: [],
    permissions: { admin: [], rh: [], employe: [] },
    parametres: {
      heureDebut: '08:00',
      heureFin: '17:00',
      toleranceRetard: 10,
      heuresJour: 8,
      site: { nom: '', lat: 0, lng: 0, rayon: 200 },
      geolocObligatoire: true,
      photoObligatoire: true,
      cpParMois: 2,
      quotaPermissions: 10,
      anticipationConges: false,
      dateRepriseSoldes: '2000-01-01',
      dateDebutPointage: '2000-01-01',
      sessionMinutes: 30,
      tentativesMax: 5,
      verrouillageMinutes: 15,
      joursFeries: [],
    },
  };
}

let state: Database = baseVide();
const listeners = new Set<() => void>();

const emettre = () => listeners.forEach((l) => l());

export const getDB = (): Database => state;

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Remplace le cache par une vue du serveur ; une vue plus ancienne que celle affichée est ignorée */
export function definirEtat(db: Database): void {
  if (db.version < state.version) return;
  state = db;
  emettre();
}

/** Vide le cache (déconnexion) */
export function viderEtat(): void {
  state = baseVide();
  emettre();
}

export function useDB(): Database {
  return useSyncExternalStore(subscribe, getDB);
}

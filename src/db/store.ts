import { useSyncExternalStore } from 'react';
import type { Database } from '../types';
import { creerBaseInitiale } from './seed';

// Base de données centralisée côté client (en attendant l'API) :
// - une seule source de vérité partagée par les espaces Employé, RH et Admin ;
// - persistée dans le navigateur ;
// - synchronisée en direct entre onglets (un employé qui pointe apparaît aussitôt côté RH).

const STORAGE_KEY = 'sikarh.db';
export const DB_VERSION = 8;

let state: Database = charger();
const listeners = new Set<() => void>();

function charger(): Database {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Database;
      if (parsed.version === DB_VERSION) return parsed;
    }
  } catch {
    // stockage indisponible ou corrompu : on repart de la base initiale
  }
  const initiale = creerBaseInitiale();
  persister(initiale);
  return initiale;
}

function persister(db: Database): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Quota dépassé (photos) : on retire les photos les plus anciennes et on réessaie
    try {
      const allege: Database = {
        ...db,
        pointages: db.pointages.map((p, i) => (i < db.pointages.length - 50 ? { ...p, photo: null } : p)),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allege));
    } catch {
      // la base reste en mémoire pour la session
    }
  }
}

function emettre(): void {
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      const next = JSON.parse(e.newValue) as Database;
      if (next.version === DB_VERSION) {
        state = next;
        emettre();
      }
    } catch {
      // ignore
    }
  });
}

export const getDB = (): Database => state;

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Applique une modification sur une copie de la base, puis persiste et notifie */
export function mutate<T = void>(recipe: (db: Database) => T): T {
  const draft = structuredClone(state);
  const result = recipe(draft);
  state = draft;
  persister(state);
  emettre();
  return result;
}

/** Réinitialise la base de démonstration */
export function reinitialiserBase(): void {
  state = creerBaseInitiale();
  persister(state);
  emettre();
}

export function useDB(): Database {
  return useSyncExternalStore(subscribe, getDB);
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

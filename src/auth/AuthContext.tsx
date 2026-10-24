import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { authentifier, journaliserDeconnexion } from '../db/actions';
import { getDB, useDB } from '../db/store';
import { syncServerTime } from '../lib/serverTime';
import type { Database, User } from '../types';

const SESSION_KEY = 'sikarh.session';
const EXPIRATION_KEY = 'sikarh.session-expiree';

interface Session {
  compteId: string;
  persistante: boolean;
}

interface AuthContextValue {
  user: User | null;
  login: (email: string, password: string, remember: boolean) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function lireSession(): Session | null {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const raw = storage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw) as Session;
    } catch {
      // stockage indisponible ou corrompu : on ignore
    }
  }
  return null;
}

function effacerSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // rien à nettoyer
  }
}

/** Utilisateur connecté, reconstruit depuis la base (un compte désactivé perd immédiatement l'accès) */
function construireUser(db: Database, compteId: string): User | null {
  const compte = db.comptes.find((c) => c.id === compteId);
  if (!compte || !compte.actif) return null;
  const e = db.employes.find((x) => x.id === compte.employeId);
  if (!e) return null;
  return {
    compteId: compte.id,
    employeId: e.id,
    email: compte.email,
    role: compte.role,
    prenom: e.prenom,
    nom: e.nom,
    departement: e.departement,
    matricule: e.matricule,
    avatarUrl: e.avatarUrl,
  };
}

/** Indique (une seule fois) si la dernière session s'est terminée par inactivité */
export function consommerExpiration(): boolean {
  try {
    const expiree = sessionStorage.getItem(EXPIRATION_KEY) === '1';
    sessionStorage.removeItem(EXPIRATION_KEY);
    return expiree;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const db = useDB();
  const [session, setSession] = useState<Session | null>(lireSession);
  const user = useMemo(() => (session ? construireUser(db, session.compteId) : null), [db, session]);
  const derniereActivite = useRef(Date.now());

  useEffect(() => {
    void syncServerTime();
  }, []);

  // Accès retiré par les RH pendant la session
  useEffect(() => {
    if (session && !user) {
      effacerSession();
      setSession(null);
    }
  }, [session, user]);

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    await Promise.all([new Promise((resolve) => setTimeout(resolve, 900)), syncServerTime()]);
    const resultat = authentifier(email, password);
    if (!resultat.ok) throw new Error(resultat.erreur);
    const next: Session = { compteId: resultat.compte.id, persistante: remember };
    try {
      (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(next));
    } catch {
      // la session reste en mémoire si le stockage est bloqué
    }
    const connecte = construireUser(getDB(), next.compteId);
    if (!connecte) throw new Error('Compte inaccessible.');
    derniereActivite.current = Date.now();
    setSession(next);
    return connecte;
  }, []);

  const terminer = useCallback(
    (expiree: boolean) => {
      if (user) journaliserDeconnexion(user, expiree);
      effacerSession();
      if (expiree) {
        try {
          sessionStorage.setItem(EXPIRATION_KEY, '1');
        } catch {
          // ignore
        }
      }
      setSession(null);
    },
    [user],
  );

  const logout = useCallback(() => terminer(false), [terminer]);

  // Expiration de session après inactivité (sauf « Se souvenir de moi »)
  const sessionMinutes = db.parametres.sessionMinutes;
  useEffect(() => {
    if (!user || session?.persistante) return;
    const activite = () => {
      derniereActivite.current = Date.now();
    };
    const evenements = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    evenements.forEach((e) => window.addEventListener(e, activite, { passive: true }));
    const id = window.setInterval(() => {
      if (Date.now() - derniereActivite.current > sessionMinutes * 60000) terminer(true);
    }, 15000);
    return () => {
      evenements.forEach((e) => window.removeEventListener(e, activite));
      window.clearInterval(id);
    };
  }, [user, session?.persistante, sessionMinutes, terminer]);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}

/** Utilisateur connecté (pages protégées uniquement) */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('Utilisateur non connecté');
  return user;
}

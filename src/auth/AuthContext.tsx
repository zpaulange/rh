import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { connexion, deconnexion, ErreurApi, quandSessionPerdue, reprendreSession, suivreRevisions } from '../db/api';
import { definirEtat, getDB, useDB, viderEtat } from '../db/store';
import { syncServerTime } from '../lib/serverTime';
import type { Database, User } from '../types';

// Session : le jeton est un cookie httpOnly posé par le serveur (inaccessible au JavaScript).
// Le navigateur ne mémorise que le choix « Se souvenir de moi », qui désactive l'expiration après inactivité.
const PERSISTANTE_KEY = 'sikarh.session-persistante';
const EXPIRATION_KEY = 'sikarh.session-expiree';

interface Session {
  compteId: string;
  persistante: boolean;
}

interface AuthContextValue {
  user: User | null;
  /** La reprise de session au chargement est terminée */
  pret: boolean;
  /** Serveur en mode démonstration (réinitialisation des données autorisée) */
  demo: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function memoriserPersistance(persistante: boolean) {
  try {
    if (persistante) localStorage.setItem(PERSISTANTE_KEY, '1');
    else localStorage.removeItem(PERSISTANTE_KEY);
  } catch {
    // stockage indisponible : la session expirera après inactivité
  }
}

function lirePersistance(): boolean {
  try {
    return localStorage.getItem(PERSISTANTE_KEY) === '1';
  } catch {
    return false;
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
  const [session, setSession] = useState<Session | null>(null);
  const [pret, setPret] = useState(false);
  const [demo, setDemo] = useState(false);
  const user = useMemo(() => (session ? construireUser(db, session.compteId) : null), [db, session]);
  const derniereActivite = useRef(Date.now());

  // Reprise de la session existante (cookie) au chargement de l'application
  useEffect(() => {
    void syncServerTime();
    let actif = true;
    reprendreSession()
      .then((r) => {
        if (!actif) return;
        definirEtat(r.etat);
        setDemo(r.serveur.demo);
        derniereActivite.current = Date.now();
        setSession({ compteId: r.compteId, persistante: lirePersistance() });
      })
      .catch(() => undefined)
      .finally(() => actif && setPret(true));
    return () => {
      actif = false;
    };
  }, []);

  // Session expirée ou accès retiré côté serveur
  useEffect(() => {
    quandSessionPerdue(() => {
      viderEtat();
      setSession(null);
    });
    return () => quandSessionPerdue(null);
  }, []);

  // Mises à jour en temps réel pendant la session
  useEffect(() => {
    if (!session) return;
    return suivreRevisions();
  }, [session]);

  // Accès retiré pendant la session (compte désactivé dans les données reçues)
  useEffect(() => {
    if (session && !user && getDB().version > 0) {
      viderEtat();
      setSession(null);
    }
  }, [session, user]);

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    // Délai minimal constant : ne renseigne pas sur l'existence du compte
    const [r] = await Promise.all([
      connexion(email, password, remember).catch((err: unknown) => {
        throw new Error(err instanceof ErreurApi ? err.message : 'Connexion impossible.');
      }),
      new Promise((resolve) => setTimeout(resolve, 900)),
      syncServerTime(),
    ]);
    viderEtat();
    definirEtat(r.etat);
    setDemo(r.serveur.demo);
    memoriserPersistance(remember);
    const connecte = construireUser(r.etat, r.compteId);
    if (!connecte) throw new Error('Compte inaccessible.');
    derniereActivite.current = Date.now();
    setSession({ compteId: r.compteId, persistante: remember });
    return connecte;
  }, []);

  const terminer = useCallback((expiree: boolean) => {
    void deconnexion(expiree).catch(() => undefined);
    memoriserPersistance(false);
    if (expiree) {
      try {
        sessionStorage.setItem(EXPIRATION_KEY, '1');
      } catch {
        // ignore
      }
    }
    viderEtat();
    setSession(null);
  }, []);

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

  const value = useMemo(() => ({ user, pret, demo, login, logout }), [user, pret, demo, login, logout]);
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

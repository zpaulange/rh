import { useUser } from '../auth/AuthContext';

/**
 * Racine des écrans de gestion partagés entre RH et administrateur (/rh ou /admin).
 * Les liens internes des écrans RH passent par ce préfixe pour rester dans l'espace courant.
 */
export function useBaseGestion(): '/rh' | '/admin' {
  return useUser().role === 'admin' ? '/admin' : '/rh';
}

/** Adapte un lien enregistré pour le RH (notifications, alertes) à l'espace de l'utilisateur */
export const lienEspace = (lien: string, base: '/rh' | '/admin'): string => (lien.startsWith('/rh/') ? base + lien.slice(3) : lien);

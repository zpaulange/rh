import { peutUne } from '../../lib/permissions';
import type { Database, NavItem, Role, User } from '../../types';

export const NAVIGATION: Record<Role, NavItem[]> = {
  employe: [
    { to: '/employe/tableau-de-bord', label: 'Tableau de bord', icon: 'dashboard' },
    { to: '/employe/pointages', label: 'Pointages', icon: 'history' },
    { to: '/employe/conges', label: 'Congés', icon: 'event_note' },
    { to: '/employe/documents', label: 'Documents', icon: 'folder_open' },
    { to: '/employe/profil', label: 'Mon profil', icon: 'account_circle' },
  ],
  rh: [
    { to: '/rh/tableau-de-bord', label: 'Tableau de bord', icon: 'dashboard', permission: 'tableau_bord.consulter' },
    { to: '/rh/employes', label: 'Collaborateurs', icon: 'groups', permission: 'collaborateurs.gerer' },
    { to: '/rh/organisation', label: 'Organisation', icon: 'account_tree', permission: 'organisation.gerer' },
    { to: '/rh/pointages', label: 'Pointages & retards', icon: 'history', badge: 'regularisations', permission: 'presences.gerer' },
    { to: '/rh/absences', label: 'Absences', icon: 'person_off', badge: 'absences', permission: 'absences.gerer' },
    { to: '/rh/conges', label: 'Congés', icon: 'event_note', badge: 'conges', permission: ['conges.valider', 'permissions.valider'] },
    { to: '/rh/documents', label: 'Documents', icon: 'folder_open', badge: 'documents', permission: 'documents.gerer' },
    { to: '/rh/paie', label: 'Paie', icon: 'payments', badge: 'paie', permission: 'paie.gerer' },
    { to: '/rh/rapports', label: 'Rapports', icon: 'analytics', permission: 'rapports.consulter' },
    { to: '/rh/audit', label: "Journal d'audit", icon: 'policy', permission: 'audit.consulter' },
    { to: '/rh/parametres', label: 'Paramètres', icon: 'tune', permission: 'parametres.gerer' },
  ],
  admin: [
    { to: '/admin/tableau-de-bord', label: 'Vue d’ensemble', icon: 'monitoring' },
    { to: '/admin/tableau-rh', label: 'Tableau de bord RH', icon: 'dashboard' },
    { to: '/admin/demandes', label: 'Demandes en attente', icon: 'inbox', badge: 'demandes' },
    { to: '/admin/organisation', label: 'Organisation', icon: 'account_tree' },
    { to: '/admin/employes', label: 'Collaborateurs', icon: 'groups' },
    { to: '/admin/pointages', label: 'Présences & retards', icon: 'history', badge: 'regularisations' },
    { to: '/admin/absences', label: 'Absences', icon: 'person_off', badge: 'absences' },
    { to: '/admin/conges', label: 'Congés & permissions', icon: 'event_note', badge: 'conges' },
    { to: '/admin/documents', label: 'Documents', icon: 'folder_open', badge: 'documents' },
    { to: '/admin/rapports', label: 'Rapports', icon: 'analytics' },
    { to: '/admin/utilisateurs', label: 'Utilisateurs & rôles', icon: 'admin_panel_settings' },
    { to: '/admin/audit', label: 'Historique & audit', icon: 'policy' },
    { to: '/admin/parametres', label: 'Paramètres', icon: 'tune' },
  ],
};

/** Entrées du menu accessibles à l'utilisateur selon la matrice des permissions */
export const navigationPour = (db: Database, user: User): NavItem[] => NAVIGATION[user.role].filter((i) => !i.permission || peutUne(db, user, i.permission));

/** Page d'accueil : première entrée accessible du menu */
export const accueilPour = (db: Database, user: User): string => navigationPour(db, user)[0]?.to ?? '/login';

import type { Database, Permission, Role, User } from '../types';

// Matrice des droits de gestion par rôle.
//  - admin : tous les droits, non modifiable (évite de perdre l'administration de l'application) ;
//  - rh : droits attribués par l'admin ;
//  - employe : libre-service uniquement (pointage, demandes, documents, profil), aucun droit de gestion.
// Les rôles eux-mêmes ne s'attribuent que par un admin (séparation des pouvoirs).

export interface DefinitionPermission {
  cle: Permission;
  libelle: string;
  description: string;
}

export const GROUPES_PERMISSIONS: { groupe: string; icone: string; permissions: DefinitionPermission[] }[] = [
  {
    groupe: 'Pilotage',
    icone: 'dashboard',
    permissions: [
      { cle: 'tableau_bord.consulter', libelle: 'Tableau de bord RH', description: 'Indicateurs du jour, alertes et demandes en attente' },
      { cle: 'rapports.consulter', libelle: 'Rapports & exports', description: 'Rapports de présence, retards et congés, exports CSV / PDF' },
      { cle: 'audit.consulter', libelle: "Journal d'audit", description: 'Historique horodaté de toutes les actions' },
    ],
  },
  {
    groupe: 'Personnel',
    icone: 'groups',
    permissions: [
      { cle: 'collaborateurs.gerer', libelle: 'Créer et modifier les collaborateurs', description: 'Dossiers, évolutions de carrière, accès des comptes' },
      { cle: 'collaborateurs.supprimer', libelle: 'Supprimer un collaborateur', description: 'Uniquement un dossier sans paie ni document (erreur de saisie)' },
      { cle: 'donnees_sensibles.consulter', libelle: 'Données sensibles', description: 'Salaires, CNSS, IFU, RIB, NPI (consultation journalisée)' },
      { cle: 'organisation.gerer', libelle: 'Départements et services', description: "Structure de l'organisation et responsables" },
    ],
  },
  {
    groupe: 'Temps & absences',
    icone: 'schedule',
    permissions: [
      { cle: 'presences.gerer', libelle: 'Présences quotidiennes et retards', description: 'Suivi des pointages, validation des régularisations' },
      { cle: 'absences.gerer', libelle: 'Absences justifiées / non justifiées', description: 'Justifier une absence ou relancer le collaborateur' },
      { cle: 'conges.valider', libelle: 'Valider les congés', description: 'Congés payés, maladie, sans solde' },
      { cle: 'permissions.valider', libelle: 'Valider les permissions', description: 'Permissions exceptionnelles (CCGT art. 54)' },
    ],
  },
  {
    groupe: 'Administration',
    icone: 'admin_panel_settings',
    permissions: [
      { cle: 'documents.gerer', libelle: 'Documents administratifs', description: 'Traitement des demandes, génération de documents certifiés' },
      { cle: 'paie.gerer', libelle: 'Paie', description: 'Préparation, validation et versement des salaires' },
      { cle: 'parametres.gerer', libelle: 'Paramètres', description: 'Horaires, zone de pointage, congés, jours fériés, sécurité' },
      { cle: 'comptes.gerer', libelle: 'Comptes utilisateurs', description: 'Activer, désactiver, déverrouiller, réinitialiser un mot de passe' },
    ],
  },
];

export const TOUTES_PERMISSIONS: Permission[] = GROUPES_PERMISSIONS.flatMap((g) => g.permissions.map((p) => p.cle));

export const LIBELLE_PERMISSION = Object.fromEntries(GROUPES_PERMISSIONS.flatMap((g) => g.permissions.map((p) => [p.cle, p.libelle]))) as Record<Permission, string>;

/** Droits par défaut : le RH garde tout ce qu'il faisait déjà ; suppression et organisation réservées à l'admin */
export const PERMISSIONS_PAR_DEFAUT: Record<Role, Permission[]> = {
  admin: TOUTES_PERMISSIONS,
  rh: TOUTES_PERMISSIONS.filter((p) => p !== 'collaborateurs.supprimer' && p !== 'organisation.gerer'),
  employe: [],
};

/** Le rôle dispose-t-il de la permission ? (l'admin dispose toujours de toutes) */
export function roleA(db: Database, role: Role, permission: Permission): boolean {
  if (role === 'admin') return true;
  if (role === 'employe') return false;
  return (db.permissions?.[role] ?? PERMISSIONS_PAR_DEFAUT[role]).includes(permission);
}

export const peut = (db: Database, user: Pick<User, 'role'>, permission: Permission): boolean => roleA(db, user.role, permission);

/** Au moins une des permissions (ex. page Congés : congés ou permissions exceptionnelles) */
export const peutUne = (db: Database, user: Pick<User, 'role'>, permissions: Permission | Permission[]): boolean =>
  (Array.isArray(permissions) ? permissions : [permissions]).some((p) => peut(db, user, p));

export const LIBELLE_ROLE_LONG: Record<Role, string> = {
  employe: 'Employé',
  rh: 'Ressources Humaines',
  admin: 'Administrateur',
};

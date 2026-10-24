import { Link } from 'react-router-dom';
import { useUser } from '../../auth/AuthContext';
import { useDB } from '../../db/store';
import { useBaseGestion } from '../../hooks/useBaseGestion';
import { peut } from '../../lib/permissions';
import type { Employe } from '../../types';
import Avatar from '../ui/Avatar';

// Cellule « collaborateur » des tableaux RH (avatar, nom, matricule / département)
export default function EmployeCell({ employe, detail, lien = true }: { employe: Employe; detail?: string; lien?: boolean }) {
  const base = useBaseGestion();
  // Lien vers la fiche seulement si le rôle peut la consulter
  const versFiche = lien && peut(useDB(), useUser(), 'collaborateurs.gerer');
  const contenu = (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar nom={employe.nom} prenom={employe.prenom} size="sm" url={employe.avatarUrl} />
      <div className="flex flex-col min-w-0">
        <span className="font-medium text-slate-200 truncate group-hover:text-white">
          {employe.prenom} {employe.nom}
        </span>
        <span className="text-xs text-slate-400 truncate">{detail ?? `${employe.matricule} • ${employe.departement}`}</span>
      </div>
    </div>
  );
  return versFiche ? (
    <Link className="group block" to={`${base}/employes/${employe.id}`}>
      {contenu}
    </Link>
  ) : (
    contenu
  );
}

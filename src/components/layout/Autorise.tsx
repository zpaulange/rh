import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../../auth/AuthContext';
import { useDB } from '../../db/store';
import { LIBELLE_PERMISSION, peutUne } from '../../lib/permissions';
import type { Permission } from '../../types';
import Icon from '../ui/Icon';
import PageHeader from '../ui/PageHeader';
import { accueilPour } from './navigation';

/** Affiche l'écran seulement si le rôle dispose de la permission (contrôle doublé côté actions) */
export default function Autorise({ permission, children }: { permission: Permission | Permission[]; children: ReactNode }) {
  const user = useUser();
  const db = useDB();
  if (peutUne(db, user, permission)) return <>{children}</>;
  const requis = (Array.isArray(permission) ? permission : [permission]).map((p) => LIBELLE_PERMISSION[p]).join(' ou ');
  return (
    <>
      <PageHeader subtitle="Cette section ne fait pas partie des droits de votre rôle" title="Accès restreint" />
      <div className="bg-[#182234] rounded-xl border border-slate-800 p-10 shadow-sm flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
          <Icon className="text-[24px]" name="lock" />
        </div>
        <h2 className="font-display text-sm font-semibold text-white">Droit requis : {requis}</h2>
        <p className="text-xs text-slate-400 max-w-md">Les droits de chaque rôle sont attribués par l'administrateur depuis « Utilisateurs & rôles ». Contactez-le si vous avez besoin de cet accès.</p>
        <Link className="mt-2 text-xs font-medium text-brand-400 hover:text-brand-300" to={accueilPour(db, user)}>
          Retour à l'accueil
        </Link>
      </div>
    </>
  );
}

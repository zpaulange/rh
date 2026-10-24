import { useAuth } from '../../auth/AuthContext';
import { useDB } from '../../db/store';
import { pointageDuJour } from '../../lib/rules';
import { serverNow } from '../../lib/serverTime';
import { dateKey } from '../../lib/time';
import Avatar from '../ui/Avatar';
import NotificationBell from './NotificationBell';

export default function Topbar() {
  const { user } = useAuth();
  const db = useDB();
  if (!user) return null;
  const fullName = `${user.prenom} ${user.nom}`;
  const p = pointageDuJour(db, user.employeId, dateKey(serverNow()));
  const presence = !p || p.depart
    ? { className: 'bg-slate-500', title: 'Hors poste' }
    : p.pauseDebut
      ? { className: 'bg-amber-400', title: 'En pause' }
      : { className: 'bg-emerald-500', title: 'En poste' };

  return (
    <header className="h-16 bg-[#111827]/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-30 px-8 flex items-center justify-end gap-5">
      <NotificationBell user={user} />
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-sm font-semibold text-white leading-tight">{fullName}</div>
          <div className="text-xs text-slate-400">
            {user.departement} • #{user.matricule}
          </div>
        </div>
        <div className="relative">
          <Avatar prenom={user.prenom} nom={user.nom} url={user.avatarUrl} />
          <span
            className={`absolute bottom-0 right-0 w-2.5 h-2.5 ${presence.className} rounded-full ring-2 ring-[#111827]`}
            title={presence.title}
          ></span>
        </div>
      </div>
    </header>
  );
}

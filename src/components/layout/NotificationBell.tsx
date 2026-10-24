import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { marquerLues, notificationsPour } from '../../db/actions';
import { lienEspace } from '../../hooks/useBaseGestion';
import { useDB } from '../../db/store';
import { depuis } from '../../lib/relatif';
import { serverNow } from '../../lib/serverTime';
import type { Notification, User } from '../../types';
import Icon from '../ui/Icon';

const STYLE: Record<Notification['niveau'], { icon: string; className: string }> = {
  info: { icon: 'notifications', className: 'bg-brand-500/10 text-brand-400 border-brand-500/20' },
  succes: { icon: 'check_circle', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  alerte: { icon: 'warning', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
};

export default function NotificationBell({ user }: { user: User }) {
  const db = useDB();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const notifications = useMemo(() => notificationsPour(db, user), [db, user]);
  const nonLues = notifications.filter((n) => !n.lu);
  const now = serverNow();

  useEffect(() => {
    if (!open) return;
    const fermer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', fermer);
    document.addEventListener('keydown', echap);
    return () => {
      document.removeEventListener('mousedown', fermer);
      document.removeEventListener('keydown', echap);
    };
  }, [open]);

  const ouvrir = (n: Notification) => {
    marquerLues([n.id]);
    setOpen(false);
    if (n.lien) navigate(user.role === 'admin' ? lienEspace(n.lien, '/admin') : n.lien);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        aria-label={`Notifications (${nonLues.length} non lues)`}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <Icon name="notifications" className="text-[21px]" filled={nonLues.length > 0} />
        {nonLues.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center ring-2 ring-[#111827]">
            {nonLues.length > 9 ? '9+' : nonLues.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-96 max-w-[calc(100vw-2rem)] bg-[#182234] border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <span className="font-display text-sm font-semibold text-white">Notifications</span>
            {nonLues.length > 0 && (
              <button
                className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
                onClick={() => marquerLues(nonLues.map((n) => n.id))}
                type="button"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-800/80">
            {notifications.length === 0 && <div className="px-4 py-8 text-center text-xs text-slate-500">Aucune notification.</div>}
            {notifications.slice(0, 30).map((n) => {
              const style = STYLE[n.niveau];
              return (
                <button
                  key={n.id}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-800/40 transition-colors ${n.lu ? '' : 'bg-brand-500/[0.04]'}`}
                  onClick={() => ouvrir(n)}
                  type="button"
                >
                  <div className={`w-7 h-7 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${style.className}`}>
                    <Icon name={style.icon} className="text-[16px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs truncate ${n.lu ? 'font-medium text-slate-300' : 'font-semibold text-white'}`}>{n.titre}</span>
                      <span className="text-[10px] text-slate-500 shrink-0">{depuis(n.date, now)}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                  </div>
                  {!n.lu && <span className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-2 shrink-0"></span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

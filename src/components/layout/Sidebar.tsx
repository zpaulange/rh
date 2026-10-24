import { useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useDB } from '../../db/store';
import { absencesPeriode } from '../../lib/absences';
import { pointageDuJour } from '../../lib/rules';
import { serverNow } from '../../lib/serverTime';
import { ajouterJours, dateKey, heureHM, moisDe } from '../../lib/time';
import { useDialog } from '../ui/Dialog';
import type { NavItem } from '../../types';
import Icon from '../ui/Icon';
import Logo from '../ui/Logo';
import { navigationPour } from './navigation';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const db = useDB();
  const navigate = useNavigate();
  const dialog = useDialog();
  const items = user ? navigationPour(db, user) : [];
  const today = dateKey(serverNow());
  const avecAbsences = items.some((i) => i.badge === 'absences');
  // Absences non justifiées des 30 derniers jours (périodes)
  const absences = useMemo(
    () => (avecAbsences ? absencesPeriode(db, ajouterJours(today, -30), today, today, serverNow()).filter((a) => !a.justifiee).length : 0),
    [db, today, avecAbsences],
  );

  const moisPrecedent = moisDe(ajouterJours(`${moisDe(today)}-01`, -1));
  const conges = db.conges.filter((c) => c.statut === 'en_attente').length;
  const regularisations = db.regularisations.filter((r) => r.statut === 'en_attente').length;
  const documents = db.demandesDocuments.filter((d) => d.statut === 'en_attente').length;
  const compteurs: Record<NonNullable<NavItem['badge']>, number> = {
    conges,
    regularisations,
    documents,
    // Paie du mois précédent pas encore versée
    paie: db.campagnesPaie.find((c) => c.mois === moisPrecedent)?.statut === 'payee' ? 0 : 1,
    demandes: conges + regularisations + documents,
    absences,
  };
  const TITRES: Partial<Record<NonNullable<NavItem['badge']>, string>> = {
    paie: 'Paie du mois précédent non versée',
    absences: 'Absence(s) non justifiée(s) sur 30 jours',
  };

  const handleLogout = async () => {
    if (!user) return;
    const p = pointageDuJour(db, user.employeId, dateKey(serverNow()));
    const enPoste = p && !p.depart;
    const ok = await dialog.confirm({
      titre: 'Se déconnecter ?',
      tone: enPoste ? 'warning' : 'danger',
      icon: 'logout',
      message: enPoste
        ? `Vous êtes toujours en poste (arrivée pointée à ${heureHM(p.arrivee)}). La déconnexion ne pointe pas votre départ.`
        : 'Votre session sera fermée sur cet appareil. Vous devrez saisir à nouveau vos identifiants.',
      details: enPoste ? 'Pensez à utiliser « Pointer le départ » depuis le tableau de bord avant de quitter.' : undefined,
      confirmer: 'Se déconnecter',
      annuler: 'Rester connecté',
    });
    if (!ok) return;
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-[#111827] border-r border-slate-800/80 z-40 flex flex-col justify-between">
      <div className="flex flex-col min-h-0">
        <Logo />
        <nav className="p-3 flex flex-col gap-1 overflow-y-auto">
          {items.map((item) => {
            const compteur = item.badge ? compteurs[item.badge] : 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive
                    ? 'flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium bg-brand-600 text-white shadow-sm shadow-brand-600/30 transition-colors'
                    : 'flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors'
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      name={item.icon}
                      className={`text-[20px] ${isActive ? 'text-white' : 'text-slate-400'}`}
                      filled={isActive}
                    />
                    <span className={isActive ? 'font-semibold' : ''}>{item.label}</span>
                    {compteur > 0 && (
                      <span
                        className={`ml-auto min-w-[20px] text-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          isActive ? 'bg-white/20 text-white' : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        }`}
                        title={(item.badge && TITRES[item.badge]) ?? `${compteur} demande(s) en attente`}
                      >
                        {compteur}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>
      <div className="p-3 border-t border-slate-800 flex flex-col">
        <button
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          onClick={() => void handleLogout()}
          type="button"
        >
          <Icon name="logout" className="text-[19px]" />
          <span>Déconnexion</span>
        </button>
      </div>
    </aside>
  );
}

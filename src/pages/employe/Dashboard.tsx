import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import { messageErreur, useDialog } from '../../components/ui/Dialog';
import { basculerPause, notificationsPour, pointerDepart } from '../../db/actions';
import { useEspaceEmploye } from '../../hooks/useEspaceEmploye';
import { jourFerie } from '../../lib/feries';
import { localiser, versGeoPoint } from '../../lib/geo';
import { serverNow } from '../../lib/serverTime';
import { depuis } from '../../lib/relatif';
import {
  calculerDroits,
  congeCouvrant,
  estEnRetard,
  joursOuvresDuMois,
  minutesTravaillees,
  pointageDuJour,
  retardJustifie,
  statsMois,
} from '../../lib/rules';
import {
  abreviationJour,
  ajouterJours,
  dateLongue,
  heureHM,
  heureHMS,
  jourMoisLong,
  lundi,
  moisDe,
  nombre,
  numeroSemaine,
} from '../../lib/time';
import PointageModal from './modals/PointageModal';

const compact = (minutes: number) => {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const dialog = useDialog();
  const { user, db, now, today, employe } = useEspaceEmploye();
  const [modalOpen, setModalOpen] = useState(false);
  const [departEnCours, setDepartEnCours] = useState(false);
  const params = db.parametres;
  const p = pointageDuJour(db, user.employeId, today);
  const congeAujourdhui = congeCouvrant(db, user.employeId, today);

  const mois = moisDe(today);
  const stats = useMemo(() => statsMois(db, user.employeId, mois, today, now), [db, user.employeId, mois, today, now]);
  const statsPrec = useMemo(() => {
    const prec = moisDe(ajouterJours(`${mois}-01`, -1));
    return statsMois(db, user.employeId, prec, today, now);
  }, [db, user.employeId, mois, today, now]);
  const droits = useMemo(() => calculerDroits(db, employe, today), [db, employe, today]);

  // Objectif selon le contrat du collaborateur (temps partiel compris)
  const heuresParJour = employe.heuresHebdo / 5;
  const objectifMinutes = joursOuvresDuMois(mois, db.parametres) * heuresParJour * 60;
  const pctHeures = objectifMinutes ? Math.round((stats.minutes / objectifMinutes) * 100) : 0;
  const assiduite = (s: typeof stats) => {
    const attendus = s.joursTravailles + s.absences;
    return attendus ? Math.round((s.joursTravailles / attendus) * 100) : 100;
  };
  const tauxAssiduite = assiduite(stats);
  const ecartAssiduite = tauxAssiduite - assiduite(statsPrec);

  const semaine = Array.from({ length: 5 }, (_, i) => ajouterJours(lundi(today), i));
  const totalSemaine = semaine.reduce((s, k) => {
    const pt = pointageDuJour(db, user.employeId, k);
    return s + (pt ? minutesTravaillees(pt, now) : 0);
  }, 0);
  const misesAJour = notificationsPour(db, user).slice(0, 3);

  const presence = p
    ? p.depart
      ? { label: 'Journée terminée', className: 'bg-slate-800 text-slate-300 border-slate-700', dot: 'bg-slate-400' }
      : p.pauseDebut
        ? { label: 'En pause', className: 'bg-amber-500/10 text-amber-300 border-amber-500/20', dot: 'bg-amber-400' }
        : p.geo && !p.geo.dansZone
          ? { label: 'Présent hors site', className: 'bg-amber-500/10 text-amber-300 border-amber-500/20', dot: 'bg-amber-400' }
          : { label: 'Présent sur site', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' }
    : congeAujourdhui
      ? { label: 'En congé', className: 'bg-brand-500/10 text-brand-400 border-brand-500/20', dot: 'bg-brand-400' }
      : { label: 'Non pointé', className: 'bg-slate-800 text-slate-300 border-slate-700', dot: 'bg-slate-400' };

  const handlePause = () => {
    try {
      basculerPause(user);
    } catch (e) {
      void dialog.alert({ titre: 'Action impossible', tone: 'danger', message: messageErreur(e) });
    }
  };

  const handleDepart = async () => {
    if (!p) return;
    const ok = await dialog.confirm({
      titre: "Valider votre sortie définitive pour aujourd'hui ?",
      tone: 'warning',
      icon: 'logout',
      message: `Arrivée à ${heureHM(p.arrivee)} • ${compact(minutesTravaillees(p, serverNow()))} travaillées. Après validation, vous ne pourrez plus pointer aujourd'hui.`,
      details: 'Votre position sera relevée et l’heure du serveur fera foi.',
      confirmer: 'Pointer le départ',
    });
    if (!ok) return;
    setDepartEnCours(true);
    let geo = null;
    try {
      geo = versGeoPoint(await localiser(), params.site);
    } catch {
      // le départ reste enregistré même sans position
    }
    try {
      pointerDepart(user, geo);
      await dialog.alert({
        titre: 'Départ enregistré',
        tone: 'success',
        icon: 'task_alt',
        message: `Sortie enregistrée à ${heureHM(serverNow())} (heure serveur). Bonne fin de journée !`,
        details: geo ? `Position : ${geo.dansZone ? 'sur site' : 'hors zone'} (${geo.distance} m du site)` : 'Position non disponible : départ enregistré sans localisation.',
      });
    } catch (e) {
      await dialog.alert({ titre: 'Départ non enregistré', tone: 'danger', message: messageErreur(e) });
    }
    setDepartEnCours(false);
  };

  return (
    <>
      {/* En-tête de page */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-white tracking-tight">Tableau de bord</h1>
          <p className="text-sm text-slate-400 mt-0.5">{dateLongue(today)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${presence.className}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${presence.dot}`}></span>
            {presence.label}
          </span>
        </div>
      </div>

      {/* Bloc Pointage direct rapide */}
      <div className="bg-[#182234] rounded-xl border border-slate-800 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
            <Icon name="timer" className="text-[24px]" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              {p && !p.depart ? 'Session active' : 'Heure serveur'}
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="font-display font-bold text-2xl text-white tracking-tight">{heureHMS(now)}</span>
              <span className="text-xs text-slate-400 font-medium">
                {p
                  ? `Pointé à ${heureHM(p.arrivee)}${p.depart ? ` • Sorti à ${heureHM(p.depart)}` : ` • ${compact(minutesTravaillees(p, now))} travaillées`}`
                  : congeAujourdhui
                    ? 'Vous êtes en congé aujourd’hui'
                    : "Pas encore pointé aujourd'hui"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {!p ? (
            <button
              className="h-10 px-4 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium flex items-center gap-2 shadow-sm transition-colors"
              onClick={() => setModalOpen(true)}
              type="button"
            >
              <Icon name="login" className="text-[18px]" />
              <span>Pointer l'arrivée</span>
            </button>
          ) : (
            <>
              <button
                className={`h-10 px-4 rounded-lg hover:bg-slate-700 border text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-40 disabled:hover:bg-slate-800 ${
                  p.pauseDebut ? 'bg-brand-500/20 text-brand-300 border-brand-500/30' : 'bg-slate-800 text-slate-200 border-slate-700'
                }`}
                disabled={Boolean(p.depart)}
                onClick={handlePause}
                type="button"
              >
                <Icon name={p.pauseDebut ? 'play_arrow' : 'pause'} className="text-[18px]" />
                <span>{p.pauseDebut ? 'Reprendre' : 'Pause déjeuner'}</span>
              </button>
              {p.depart ? (
                <button
                  className="h-10 px-4 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 text-sm font-medium flex items-center gap-2 shadow-sm transition-colors"
                  disabled
                  type="button"
                >
                  <Icon name="check" className="text-[18px]" />
                  <span>Départ validé</span>
                </button>
              ) : (
                <button
                  className="h-10 px-4 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium flex items-center gap-2 shadow-sm transition-colors disabled:opacity-60"
                  disabled={departEnCours}
                  onClick={() => void handleDepart()}
                  type="button"
                >
                  <Icon name="logout" className="text-[18px]" />
                  <span>{departEnCours ? 'Localisation…' : 'Pointer le départ'}</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 4 Métriques clés */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#182234] p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Heures ce mois</span>
            <Icon name="timelapse" className="text-[18px] text-brand-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-2xl font-bold text-white">{Math.floor(stats.minutes / 60)}h</span>
              <span className="text-xs text-slate-400 font-medium">/ {objectifMinutes / 60}h</span>
            </div>
            <span className="text-xs font-medium text-brand-400 bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 rounded">{pctHeures}%</span>
          </div>
        </div>
        <div className="bg-[#182234] p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Taux d'assiduité</span>
            <Icon name="check_circle" className="text-[18px] text-brand-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-white">{tauxAssiduite}%</span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded border ${
                ecartAssiduite >= 0 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
              }`}
              title="Écart avec le mois précédent"
            >
              {ecartAssiduite >= 0 ? '+' : ''}
              {ecartAssiduite}%
            </span>
          </div>
        </div>
        <div className="bg-[#182234] p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Congés restants</span>
            <Icon name="date_range" className="text-[18px] text-brand-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-white">{droits.cp.restant} j</span>
            <span className="text-xs font-medium text-slate-400">Solde CP</span>
          </div>
        </div>
        <div className="bg-[#182234] p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Retards cumulés</span>
            <Icon name="schedule" className="text-[18px] text-brand-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-white">{stats.retards}</span>
            {stats.retards === 0 ? (
              <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">Conforme</span>
            ) : (
              <span className="text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">À justifier</span>
            )}
          </div>
        </div>
      </div>

      {/* Deux sections principales */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 bg-[#182234] rounded-xl border border-slate-800 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-white">Pointages de la semaine</h2>
            <span className="text-xs font-medium text-slate-400">
              Semaine {numeroSemaine(today)} • {compact(totalSemaine)}
            </span>
          </div>
          <div className="divide-y divide-slate-800/80">
            {semaine.map((k) => {
              const pt = pointageDuJour(db, user.employeId, k);
              const jour = abreviationJour(k).toUpperCase();
              const ferie = jourFerie(params, k);
              if (k === today) {
                return (
                  <div key={k} className="px-5 py-3.5 flex items-center justify-between text-sm bg-brand-500/10 border-y border-brand-500/20">
                    <div className="flex items-center gap-3">
                      <span className="w-8 font-semibold text-xs text-brand-400">{jour}</span>
                      <span className="font-semibold text-white">{jourMoisLong(k)}</span>
                      <span className="text-xs text-brand-400">{pt ? `Entrée ${heureHM(pt.arrivee)}` : ferie ? `Férié — ${ferie.libelle}` : congeAujourdhui ? 'Congé' : 'Non pointé'}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-semibold text-brand-400 text-xs">{pt ? (pt.depart ? compact(minutesTravaillees(pt, now)) : 'En cours') : '—'}</span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-brand-500/20 text-brand-300 border border-brand-500/30">
                        {pt ? (pt.depart ? 'Terminé' : 'Actif') : ferie ? 'Férié' : 'En attente'}
                      </span>
                    </div>
                  </div>
                );
              }
              if (k > today) {
                const conge = congeCouvrant(db, user.employeId, k);
                return (
                  <div key={k} className="px-5 py-3.5 flex items-center justify-between text-sm text-slate-500">
                    <div className="flex items-center gap-3">
                      <span className="w-8 font-medium text-xs">{jour}</span>
                      <span className="text-slate-400">{jourMoisLong(k)}</span>
                      <span className="text-xs text-slate-500">{ferie ? `Férié — ${ferie.libelle}` : conge ? 'Congé planifié' : `Prévu ${params.heureDebut}`}</span>
                    </div>
                    <span className="text-xs font-medium">{ferie ? 'Jour chômé payé' : conge ? 'Absence validée' : `${nombre(heuresParJour)}h planifiées`}</span>
                  </div>
                );
              }
              const conge = congeCouvrant(db, user.employeId, k);
              const retard = pt && estEnRetard(pt, params) && !retardJustifie(db, pt);
              return (
                <div key={k} className="px-5 py-3.5 flex items-center justify-between text-sm hover:bg-slate-800/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="w-8 font-medium text-xs text-slate-400">{jour}</span>
                    <span className="font-medium text-slate-200">{jourMoisLong(k)}</span>
                    <span className="text-xs text-slate-400">
                      {pt ? `${heureHM(pt.arrivee)} — ${pt.depart ? heureHM(pt.depart) : '—'}` : ferie ? ferie.libelle : conge ? 'Congé' : 'Aucun pointage'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-medium text-slate-300 text-xs">{pt ? compact(minutesTravaillees(pt, now)) : '—'}</span>
                    {pt ? (
                      retard ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">Retard</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">Validé</span>
                      )
                    ) : ferie ? (
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">Férié</span>
                    ) : conge ? (
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-brand-500/10 text-brand-400 border border-brand-500/20">Congé</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">Absent</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-[#182234] rounded-xl border border-slate-800 p-5 shadow-sm">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-400 mb-3">Actions rapides</h3>
            <div className="grid grid-cols-1 gap-2">
              <button
                className="w-full h-10 px-3.5 rounded-lg bg-slate-800/70 hover:bg-slate-800 hover:text-white text-slate-300 text-sm font-medium flex items-center justify-between transition-colors border border-slate-700"
                onClick={() => navigate('/employe/conges?nouveau=1')}
                type="button"
              >
                <span className="flex items-center gap-2">
                  <Icon name="add_circle" className="text-[18px] text-brand-400" />
                  <span>Poser un congé</span>
                </span>
                <Icon name="chevron_right" className="text-[16px] text-slate-400" />
              </button>
              <button
                className="w-full h-10 px-3.5 rounded-lg bg-slate-800/70 hover:bg-slate-800 hover:text-white text-slate-300 text-sm font-medium flex items-center justify-between transition-colors border border-slate-700"
                onClick={() => navigate('/employe/documents?nouveau=1')}
                type="button"
              >
                <span className="flex items-center gap-2">
                  <Icon name="description" className="text-[18px] text-brand-400" />
                  <span>Demander attestation</span>
                </span>
                <Icon name="chevron_right" className="text-[16px] text-slate-400" />
              </button>
            </div>
          </div>

          <div className="bg-[#182234] rounded-xl border border-slate-800 p-5 shadow-sm">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-400 mb-3">Mises à jour récentes</h3>
            <div className="flex flex-col gap-3">
              {misesAJour.length === 0 && <span className="text-xs text-slate-500">Aucune mise à jour.</span>}
              {misesAJour.map((maj, i) => (
                <div key={maj.id} className={`flex items-start justify-between gap-2 ${i < misesAJour.length - 1 ? 'pb-2.5 border-b border-slate-800' : ''}`}>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-200">{maj.titre}</span>
                    <span className="text-xs text-slate-400">{maj.message}</span>
                  </div>
                  <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">{depuis(maj.date, now)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <PointageModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onPointe={async (pt) => {
          if (!estEnRetard(pt, params)) {
            await dialog.alert({ titre: 'Arrivée enregistrée', tone: 'success', icon: 'how_to_reg', message: `Pointage validé à ${heureHM(pt.arrivee)} (heure serveur). Bonne journée !` });
            return;
          }
          const choix = await dialog.alert({
            titre: 'Arrivée enregistrée avec retard',
            tone: 'warning',
            icon: 'schedule',
            message: `Pointage à ${heureHM(pt.arrivee)} : ${pt.retardMinutes} min de retard, signalé automatiquement aux RH.`,
            details: 'Si ce retard est justifié (mission, transport…), soumettez une régularisation avec un justificatif.',
            actions: [
              { label: 'Plus tard', value: 'plus_tard', variant: 'secondary' },
              { label: 'Justifier maintenant', value: 'justifier', variant: 'primary', icon: 'edit_calendar' },
            ],
          });
          if (choix === 'justifier') navigate(`/employe/pointages?justifier=${pt.date}`);
        }}
      />
    </>
  );
}

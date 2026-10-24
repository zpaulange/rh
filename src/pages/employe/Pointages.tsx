import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PointageDetailModal from '../../components/PointageDetailModal';
import Icon from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import SelectChip from '../../components/ui/SelectChip';
import TableFooter, { paginer } from '../../components/ui/TableFooter';
import { useDialog } from '../../components/ui/Dialog';
import { useEspaceEmploye } from '../../hooks/useEspaceEmploye';
import { jourFerie } from '../../lib/feries';
import { congeCouvrant, joursOuvresDuMois, minutesTravaillees, pointageDuJour, statsMois, statutPointage, type StatutPointage } from '../../lib/rules';
import {
  abreviationJour,
  ajouterJours,
  dateJourCourt,
  derniersMois,
  dureeHHMM,
  dureeHM,
  heureHM,
  jourMois,
  jourMoisLong,
  lundi,
  moisLong,
  nombre,
  numeroSemaine,
} from '../../lib/time';
import type { Pointage, Regularisation } from '../../types';
import RegulariserPointageModal from './modals/RegulariserPointageModal';

const STATUT_BADGE: Record<StatutPointage, { label: string; className: string }> = {
  en_poste: { label: 'En poste', className: 'font-semibold bg-brand-500/20 text-brand-300 border border-brand-500/30' },
  en_pause: { label: 'En pause', className: 'font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20' },
  a_l_heure: { label: "À l'heure", className: 'font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
  retard: { label: 'Retard', className: 'font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20' },
  retard_justifie: { label: 'Retard justifié', className: 'font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20' },
};

const TERMINAL_ICON: Record<Pointage['source'], string> = {
  biometrique: 'fingerprint',
  web: 'language',
  mobile: 'smartphone',
  regularisation: 'language',
};

type FiltreStatut = 'tous' | 'a_l_heure' | 'retards' | 'justifies';
const PAR_PAGE = 6;

function CarteRegularisation({ r }: { r: Regularisation }) {
  const s =
    r.statut === 'en_attente'
      ? { label: 'En attente', icon: 'hourglass_empty', cls: 'bg-amber-500/10 text-amber-300 border border-amber-500/20', iconCls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20', detail: 'En cours de traitement RH' }
      : r.statut === 'refuse'
        ? { label: 'Refusé', icon: 'cancel', cls: 'bg-rose-500/10 text-rose-400 border border-rose-500/20', iconCls: 'bg-rose-500/10 text-rose-400 border border-rose-500/20', detail: r.commentaireRH || `Refusé par ${r.traitePar}` }
        : r.type === 'oubli'
          ? { label: 'Traité', icon: 'task_alt', cls: 'bg-slate-800 text-slate-300 border border-slate-700', iconCls: 'bg-slate-800 text-slate-300 border border-slate-700', detail: `${jourMois(r.date)} • ${r.motif}` }
          : { label: 'Validé', icon: 'check_circle', cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20', iconCls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20', detail: `${r.motif} • Approuvé par ${r.traitePar}` };
  const retardMin = Math.max(0, Number(r.entree.slice(0, 2)) * 60 + Number(r.entree.slice(3)) - 8 * 60);
  const titre =
    r.type === 'oubli'
      ? `Oubli de pointage (${jourMois(r.date)})`
      : r.type === 'retard'
        ? `Retard du ${jourMois(r.date)}${retardMin ? ` (${retardMin} min)` : ''}`
        : `Mission externe du ${jourMois(r.date)}`;
  return (
    <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-start gap-3">
      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${s.iconCls}`}>
        <Icon name={s.icon} className="text-[16px]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-semibold text-white truncate">{titre}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${s.cls}`}>{s.label}</span>
        </div>
        <p className="text-xs text-slate-400 mt-1 truncate">{s.detail}</p>
        <div className="mt-2 text-[11px] text-slate-500">Réf. #{r.reference}</div>
      </div>
    </div>
  );
}

export default function Pointages() {
  const { user, db, now, today, employe } = useEspaceEmploye();
  // Horaires contractuels du collaborateur (temps partiel compris)
  const heuresParJour = employe.heuresHebdo / 5;
  // Objectif de la semaine hors jours fériés
  const objectifSemaine = nombre(Array.from({ length: 5 }, (_, i) => ajouterJours(lundi(today), i)).filter((k) => !jourFerie(db.parametres, k)).length * heuresParJour);
  const dialog = useDialog();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const justifier = searchParams.get('justifier');
  const [modal, setModal] = useState<{ open: boolean; date?: string }>(justifier ? { open: true, date: justifier } : { open: false });
  const [detail, setDetail] = useState<Pointage | null>(null);
  const moisDisponibles = useMemo(() => derniersMois(today, 6), [today]);
  const [mois, setMois] = useState(moisDisponibles[0]);
  const [filtre, setFiltre] = useState<FiltreStatut>('tous');
  const [page, setPage] = useState(0);
  const params = db.parametres;

  const stats = useMemo(() => statsMois(db, user.employeId, mois, today, now), [db, user.employeId, mois, today, now]);
  const joursMois = joursOuvresDuMois(mois, db.parametres);
  const joursEcoules = stats.joursTravailles + stats.absences;
  const pctJours = joursEcoules ? Math.round((stats.joursTravailles / joursEcoules) * 100) : 0;
  const ponctualite = stats.joursTravailles
    ? Math.round(((stats.joursTravailles - stats.retards - stats.retardsJustifies) / stats.joursTravailles) * 1000) / 10
    : 100;
  const anomalies = stats.retards + stats.retardsJustifies;

  const journal = useMemo(() => {
    const lignes = db.pointages
      .filter((p) => p.employeId === user.employeId && p.date.startsWith(mois))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((p) => ({ p, statut: statutPointage(db, p) }));
    return lignes.filter(({ statut }) =>
      filtre === 'tous'
        ? true
        : filtre === 'a_l_heure'
          ? statut === 'a_l_heure'
          : filtre === 'retards'
            ? statut === 'retard'
            : statut === 'retard_justifie',
    );
  }, [db, user.employeId, mois, filtre]);
  const pagination = paginer(journal, page, PAR_PAGE);

  const semaine = Array.from({ length: 5 }, (_, i) => ajouterJours(lundi(today), i));
  const totalSemaine = semaine.reduce((s, k) => {
    const p = pointageDuJour(db, user.employeId, k);
    return s + (p ? minutesTravaillees(p, now) : 0);
  }, 0);
  const regularisations = db.regularisations
    .filter((r) => r.employeId === user.employeId)
    .sort((a, b) => b.dateDemande.localeCompare(a.dateDemande))
    .slice(0, 3);

  const changerFiltre = (f: FiltreStatut) => {
    setFiltre(f);
    setPage(0);
  };

  return (
    <>
      <PageHeader title="Pointages" subtitle="Historique et registre des émargements">
        <SelectChip
          ariaLabel="Mois affiché"
          icon="calendar_month"
          onChange={(m) => {
            setMois(m);
            setPage(0);
          }}
          options={moisDisponibles.map((m) => ({ value: m, label: moisLong(m) }))}
          value={mois}
        />
        <SelectChip
          ariaLabel="Filtrer par statut"
          icon="filter_list"
          onChange={changerFiltre}
          options={[
            { value: 'tous', label: 'Tous' },
            { value: 'a_l_heure', label: "À l'heure" },
            { value: 'retards', label: 'Retards' },
            { value: 'justifies', label: 'Retards justifiés' },
          ]}
          prefixe="Statut:"
          value={filtre}
        />
        <button
          className="h-9 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          onClick={() => setModal({ open: true })}
          type="button"
        >
          <Icon name="add" className="text-[16px]" />
          <span>Régulariser un pointage</span>
        </button>
      </PageHeader>

      {/* 4 Cartes KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#182234] p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Jours travaillés</span>
            <Icon name="event_available" className="text-[18px] text-brand-400" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between mb-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-bold text-white">{stats.joursTravailles}</span>
                <span className="text-xs text-slate-400 font-medium">/ {joursMois} j</span>
              </div>
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">{pctJours}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full" style={{ width: `${joursMois ? (stats.joursTravailles / joursMois) * 100 : 0}%` }}></div>
            </div>
          </div>
        </div>
        <div className="bg-[#182234] p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total heures</span>
            <Icon name="timelapse" className="text-[18px] text-brand-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-2xl font-bold text-white">{dureeHM(stats.minutes)}</span>
            </div>
            <span className="text-xs text-slate-400 font-medium">Objectif : {nombre(joursMois * heuresParJour)}h</span>
          </div>
        </div>
        <div className="bg-[#182234] p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Ponctualité</span>
            <Icon name="verified" className="text-[18px] text-brand-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-white">{ponctualite}%</span>
            <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">Taux d'assiduité</span>
          </div>
        </div>
        <div className="bg-[#182234] p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Anomalies / Retards</span>
            <Icon name="warning" className="text-[18px] text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-white">{anomalies}</span>
            {stats.retards === 0 ? (
              <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                {anomalies ? 'Régularisé' : 'Aucune'}
              </span>
            ) : (
              <span className="text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                {stats.retards} à justifier
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Journal d'émargement */}
      <div className="bg-[#182234] rounded-xl border border-slate-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="view_list" className="text-[18px] text-brand-400" />
            <h2 className="font-display text-sm font-semibold text-white">Journal d'émargement mensuel</h2>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Affichage des {pagination.lignes.length} dernières sessions • {journal.length} enregistrées
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-900/50 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                <th className="py-3 px-5">Date</th>
                <th className="py-3 px-4">Heure d'arrivée</th>
                <th className="py-3 px-4">Heure de départ</th>
                <th className="py-3 px-4">Pause</th>
                <th className="py-3 px-4">Cumul journalier</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4">Terminal</th>
                <th className="py-3 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {pagination.lignes.map(({ p, statut }) => {
                const auj = p.date === today;
                const badge = STATUT_BADGE[statut];
                const enRetard = statut === 'retard' || statut === 'retard_justifie';
                return (
                  <tr key={p.id} className={`hover:bg-slate-800/40 transition-colors ${auj ? 'bg-brand-500/[0.03]' : ''}`}>
                    {auj ? (
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse"></span>
                          <span className="font-semibold text-white">Aujourd'hui, {jourMois(p.date)}</span>
                        </div>
                      </td>
                    ) : (
                      <td className="py-3.5 px-5 font-medium text-slate-200">{dateJourCourt(p.date)}</td>
                    )}
                    <td className={`py-3.5 px-4 font-mono text-xs ${auj ? 'text-white' : enRetard ? 'text-amber-300' : 'text-slate-300'}`}>{heureHM(p.arrivee)}</td>
                    <td className={`py-3.5 px-4 font-mono text-xs ${p.depart ? 'text-slate-300' : 'text-slate-500'}`}>{p.depart ? heureHM(p.depart) : '—'}</td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-400">{dureeHHMM(p.pauseMinutes)}</td>
                    {!p.depart ? (
                      <td className="py-3.5 px-4 font-mono text-xs font-semibold text-brand-300">
                        {dureeHM(minutesTravaillees(p, now))} <span className="text-[11px] text-slate-400 font-sans font-normal">(en cours)</span>
                      </td>
                    ) : (
                      <td className="py-3.5 px-4 font-mono text-xs font-medium text-slate-200">{dureeHM(minutesTravaillees(p, now))}</td>
                    )}
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] ${badge.className}`}>{badge.label}</span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <Icon name={TERMINAL_ICON[p.source]} className={`text-[15px] ${auj ? 'text-brand-400' : 'text-slate-400'}`} />
                        {p.terminal}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {statut === 'retard' && (
                          <button
                            className="text-xs font-medium text-amber-300 hover:text-amber-200 transition-colors"
                            onClick={() => setModal({ open: true, date: p.date })}
                            type="button"
                          >
                            Justifier
                          </button>
                        )}
                        <button
                          className={`text-xs font-medium transition-colors ${auj ? 'text-brand-400 hover:text-brand-300' : 'text-slate-400 hover:text-white'}`}
                          onClick={() => setDetail(p)}
                          type="button"
                        >
                          Détails
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {journal.length === 0 && (
                <tr>
                  <td className="py-8 px-5 text-center text-xs text-slate-500" colSpan={8}>
                    Aucun pointage pour cette période.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TableFooter
          nextDisabled={pagination.page >= pagination.pages - 1}
          onNext={() => setPage(pagination.page + 1)}
          onPrevious={() => setPage(pagination.page - 1)}
          previousDisabled={pagination.page === 0}
        >
          {mois === moisDisponibles[0]
            ? `Semaine ${numeroSemaine(today)} en cours d'enregistrement`
            : `${moisLong(mois)} • page ${pagination.page + 1} / ${pagination.pages}`}
        </TableFooter>
      </div>

      {/* Bas de page : 2 cartes côte à côte */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-[#182234] rounded-xl border border-slate-800 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="font-display text-sm font-semibold text-white">Synthèse horaire de la semaine</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Semaine {numeroSemaine(today)} • Objectif hebdomadaire {objectifSemaine}h
              </p>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-display text-base font-bold text-white">{dureeHM(totalSemaine)}</span>
              <span className="text-xs text-slate-400">/ {objectifSemaine}h</span>
            </div>
          </div>
          <div className="divide-y divide-slate-800/60 mt-2">
            {semaine.map((k) => {
              const p = pointageDuJour(db, user.employeId, k);
              const minutes = p ? minutesTravaillees(p, now) : 0;
              const progression = Math.min(100, (minutes / (heuresParJour * 60)) * 100);
              if (k === today) {
                return (
                  <div key={k} className="py-2.5 flex items-center justify-between text-xs bg-brand-500/[0.04] px-2 -mx-2 rounded">
                    <div className="flex items-center gap-3">
                      <span className="w-10 font-semibold text-brand-400 uppercase">{abreviationJour(k)}</span>
                      <span className="text-white font-medium">{jourMoisLong(k)} (Aujourd'hui)</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-32 hidden sm:block h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-400 rounded-full" style={{ width: `${progression}%` }}></div>
                      </div>
                      <span className="font-mono font-semibold text-brand-300">{dureeHM(minutes)}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-500/20 text-brand-300 border border-brand-500/30">
                        {p ? (p.depart ? 'Terminé' : 'En cours') : 'Non pointé'}
                      </span>
                    </div>
                  </div>
                );
              }
              if (k > today || !p) {
                return (
                  <div key={k} className="py-2.5 flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-3">
                      <span className="w-10 font-semibold text-slate-500 uppercase">{abreviationJour(k)}</span>
                      <span>{jourMoisLong(k)}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-32 hidden sm:block h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-slate-700 rounded-full" style={{ width: '0%' }}></div>
                      </div>
                      <span className="font-mono text-slate-500">0h 00m</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                        {jourFerie(params, k) ? 'Férié' : congeCouvrant(db, user.employeId, k) ? 'Congé' : k > today ? `Prévu ${nombre(heuresParJour)}h` : 'Absent'}
                      </span>
                    </div>
                  </div>
                );
              }
              return (
                <div key={k} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="w-10 font-semibold text-slate-400 uppercase">{abreviationJour(k)}</span>
                    <span className="text-slate-300">{jourMoisLong(k)}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-32 hidden sm:block h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full" style={{ width: `${progression}%` }}></div>
                    </div>
                    <span className="font-mono font-medium text-slate-200">{dureeHM(minutes)}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Validé</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 bg-[#182234] rounded-xl border border-slate-800 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-display text-sm font-semibold text-white">Dernières régularisations</h3>
              <span className="text-xs text-slate-400">{moisLong(moisDisponibles[0])}</span>
            </div>
            <div className="flex flex-col gap-3 mt-3">
              {regularisations.length === 0 && <p className="text-xs text-slate-500">Aucune demande de régularisation.</p>}
              {regularisations.map((r) => (
                <CarteRegularisation key={r.id} r={r} />
              ))}
            </div>
          </div>
          <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Besoin d'une modification ?</span>
            <button className="text-brand-400 hover:text-brand-300 font-medium transition-colors" onClick={() => setModal({ open: true })} type="button">
              Nouvelle demande →
            </button>
          </div>
        </div>
      </div>

      <RegulariserPointageModal
        datePreselection={modal.date}
        onClose={() => {
          setModal({ open: false });
          if (justifier) setSearchParams({}, { replace: true });
        }}
        onSubmitted={async () => {
          const choix = await dialog.alert({
            titre: 'Demande transmise',
            tone: 'success',
            icon: 'send',
            message: 'Votre demande de régularisation a été transmise aux RH. Vous serez notifié de leur décision.',
            actions: [
              { label: 'Retour au tableau de bord', value: 'accueil', variant: 'secondary' },
              { label: 'Compris', value: 'ok', variant: 'primary' },
            ],
          });
          if (choix === 'accueil') navigate('/employe/tableau-de-bord');
        }}
        open={modal.open}
      />
      <PointageDetailModal onClose={() => setDetail(null)} pointage={detail} />
    </>
  );
}

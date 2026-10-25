import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import PageHeader from '../../components/ui/PageHeader';
import SelectChip from '../../components/ui/SelectChip';
import TabFilter from '../../components/ui/TabFilter';
import TableFooter, { paginer } from '../../components/ui/TableFooter';
import { useDialog } from '../../components/ui/Dialog';
import { journaliserTelechargement } from '../../db/api';
import { useEspaceEmploye } from '../../hooks/useEspaceEmploye';
import { telechargerPDF } from '../../lib/pdfLazy';
import { calculerDroits, LIBELLE_CONGE } from '../../lib/rules';
import { ajouterJours, dateCourte, dateHeure, dateKey, dateLongue, ecartJours, estOuvre, jourMois, nombre } from '../../lib/time';
import type { DemandeConge, TypeConge } from '../../types';
import DemandeCongeModal from './modals/DemandeCongeModal';
import { BadgeStatutConge, dureeLibelle, periodeConge } from '../../components/CongeUI';

type Onglet = 'toutes' | 'conge_paye' | 'permission' | 'maladie';

const ONGLETS: { value: Onglet; label: string }[] = [
  { value: 'toutes', label: 'Toutes les demandes' },
  { value: 'conge_paye', label: 'Congés payés' },
  { value: 'permission', label: 'Permissions' },
  { value: 'maladie', label: 'Maladie' },
];

const PAR_PAGE = 5;

export default function Conges() {
  const { user, db, today, employe } = useEspaceEmploye();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(searchParams.get('nouveau') === '1');
  const [detail, setDetail] = useState<DemandeConge | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('toutes');
  const anneeCourante = today.slice(0, 4);
  const [annee, setAnnee] = useState(anneeCourante);
  const [typeFiltre, setTypeFiltre] = useState<'tous' | TypeConge>('tous');
  const [page, setPage] = useState(0);
  const dialog = useDialog();
  const params = db.parametres;

  const droits = useMemo(() => calculerDroits(db, employe, today), [db, employe, today]);

  const closeModal = () => {
    setModalOpen(false);
    if (searchParams.has('nouveau')) setSearchParams({}, { replace: true });
  };

  const mesDemandes = useMemo(
    () => db.conges.filter((c) => c.employeId === user.employeId).sort((a, b) => b.dateDemande.localeCompare(a.dateDemande)),
    [db, user.employeId],
  );
  const demandesAnnee = mesDemandes.filter((c) => c.debut.startsWith(annee));
  const demandes = demandesAnnee.filter(
    (d) => (onglet === 'toutes' || d.type === onglet) && (typeFiltre === 'tous' || d.type === typeFiltre),
  );
  const pagination = paginer(demandes, page, PAR_PAGE);
  const enAttente = mesDemandes.filter((c) => c.statut === 'en_attente').length;
  const consommeTotal = droits.detailCp.prisAnnee + droits.permissions.consomme;
  const periodeEnCours = droits.detailCp.periodes.find((pe) => pe.statut === 'en_acquisition');
  const reliquats = droits.detailCp.periodes.filter((pe) => pe.statut !== 'en_acquisition' && pe.restant > 0);

  const prochaine = mesDemandes
    .filter((c) => c.statut !== 'refuse' && c.fin >= today)
    .sort((a, b) => a.debut.localeCompare(b.debut))[0];
  let reprise = prochaine ? ajouterJours(prochaine.fin, 1) : '';
  while (reprise && !estOuvre(reprise)) reprise = ajouterJours(reprise, 1);

  const titrePour = (c: DemandeConge) => db.documents.find((d) => d.modele === 'titre_conge' && d.params.congeId === c.id);
  const telecharger = (c: DemandeConge) => {
    const doc = titrePour(c);
    if (!doc) return;
    telechargerPDF(db, doc);
    void journaliserTelechargement(user, doc).catch(() => undefined);
  };

  const annees = [anneeCourante, String(Number(anneeCourante) - 1)];

  return (
    <>
      <PageHeader title="Congés & Permissions" subtitle="Gestion des soldes et suivi des demandes d'absence">
        <SelectChip
          ariaLabel="Année"
          icon="calendar_month"
          onChange={(a) => {
            setAnnee(a);
            setPage(0);
          }}
          options={annees.map((a) => ({ value: a, label: `Année ${a}` }))}
          value={annee}
        />
        <SelectChip
          ariaLabel="Type de congé"
          icon="filter_list"
          onChange={(t) => {
            setTypeFiltre(t);
            setPage(0);
          }}
          options={[{ value: 'tous' as const, label: 'Tous les types' }, ...(Object.keys(LIBELLE_CONGE) as TypeConge[]).map((t) => ({ value: t, label: LIBELLE_CONGE[t] }))]}
          value={typeFiltre}
        />
        <button
          className="h-9 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          onClick={() => setModalOpen(true)}
          type="button"
        >
          <Icon name="add" className="text-[16px]" />
          <span>Poser un congé</span>
        </button>
      </PageHeader>

      {/* 4 Cartes KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#182234] p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Congés payés restants</span>
            <Icon name="beach_access" className="text-[18px] text-brand-400" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between mb-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-bold text-white">{nombre(droits.cp.restant)} j</span>
                <span className="text-xs text-slate-400 font-medium">/ {nombre(droits.cp.acquis)} j</span>
              </div>
              {droits.cp.restant > 0 ? (
                <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">Disponible</span>
              ) : (
                <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">Épuisé</span>
              )}
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full" style={{ width: `${droits.cp.acquis ? (droits.cp.restant / droits.cp.acquis) * 100 : 0}%` }}></div>
            </div>
          </div>
        </div>
        <div className="bg-[#182234] p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Permissions exceptionnelles</span>
            <Icon name="event_available" className="text-[18px] text-brand-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-2xl font-bold text-white">{nombre(droits.permissions.restant)} j</span>
              <span className="text-xs text-slate-400 font-medium">/ {droits.permissions.acquis} j</span>
            </div>
            <span className="text-xs text-slate-400 font-medium">Utilisés : {nombre(droits.permissions.consomme)} j</span>
          </div>
        </div>
        <div className="bg-[#182234] p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">En attente de validation</span>
            <Icon name="hourglass_top" className="text-[18px] text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-amber-300">{enAttente}</span>
            <span className="text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">Validation N+1/RH</span>
          </div>
        </div>
        <div className="bg-[#182234] p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Congés consommés</span>
            <Icon name="check_circle" className="text-[18px] text-brand-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-white">{nombre(consommeTotal)} j</span>
            <span className="text-xs text-slate-400 font-medium">Année en cours</span>
          </div>
        </div>
      </div>

      {/* Historique des demandes */}
      <div className="bg-[#182234] rounded-xl border border-slate-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="format_list_bulleted" className="text-[18px] text-brand-400" />
            <h2 className="font-display text-sm font-semibold text-white">Historique des demandes &amp; permissions</h2>
          </div>
          <TabFilter
            options={ONGLETS}
            value={onglet}
            onChange={(o) => {
              setOnglet(o);
              setPage(0);
            }}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-900/50 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                <th className="py-3 px-5">Type de congé</th>
                <th className="py-3 px-4">Période</th>
                <th className="py-3 px-4">Durée</th>
                <th className="py-3 px-4">Date de demande</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4">Validateur</th>
                <th className="py-3 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {pagination.lignes.map((d) => {
                const attente = d.statut === 'en_attente';
                const titre = titrePour(d);
                return (
                  <tr key={d.id} className={`hover:bg-slate-800/40 transition-colors ${attente ? 'bg-brand-500/[0.03]' : ''}`}>
                    {attente ? (
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                          <span className="font-semibold text-white">{LIBELLE_CONGE[d.type]}</span>
                        </div>
                      </td>
                    ) : (
                      <td className="py-3.5 px-5 font-medium text-slate-200">{LIBELLE_CONGE[d.type]}</td>
                    )}
                    <td className={`py-3.5 px-4 font-mono text-xs ${attente ? 'text-white' : 'text-slate-300'}`}>{periodeConge(d)}</td>
                    <td className={`py-3.5 px-4 font-mono text-xs ${attente ? 'text-slate-200' : 'text-slate-300'}`}>{dureeLibelle(d)}</td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-400">{dateCourte(dateKey(new Date(d.dateDemande)))}</td>
                    <td className="py-3.5 px-4">
                      <BadgeStatutConge statut={d.statut} />
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-300">{d.traitePar ?? d.validateur}</td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          className={`text-xs font-medium transition-colors ${attente ? 'text-brand-400 hover:text-brand-300' : 'text-slate-400 hover:text-white'}`}
                          onClick={() => setDetail(d)}
                          type="button"
                        >
                          Détails
                        </button>
                        {titre && (
                          <button className="text-slate-400 hover:text-brand-400 transition-colors" onClick={() => telecharger(d)} title="Télécharger titre de congé" type="button">
                            <Icon name="download" className="text-[16px]" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {demandes.length === 0 && (
                <tr>
                  <td className="py-6 px-5 text-center text-xs text-slate-500" colSpan={7}>
                    Aucune demande dans cette catégorie.
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
          {demandesAnnee.length} demandes enregistrées sur l'exercice {annee}
        </TableFooter>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Solde et droits */}
        <div className="lg:col-span-8 bg-[#182234] rounded-xl border border-slate-800 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                <Icon name="pie_chart" className="text-[18px]" />
              </div>
              <div>
                <h3 className="font-display text-sm font-semibold text-white tracking-tight">Solde et droits aux congés {droits.annee}</h3>
                <p className="text-xs text-slate-400">Synthèse des quotas alloués et consommation courante</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-400 bg-brand-500/10 border border-brand-500/20 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400"></span>Exercice actif
            </span>
          </div>
          <div className="divide-y divide-slate-800/60 mt-1">
            {[
              {
                libelle: 'Congés payés jouissables',
                precision: reliquats.length
                  ? `(${reliquats.map((pe) => `période ${pe.annee} : ${nombre(pe.restant)} j à prendre avant le ${dateCourte(pe.aPrendreAvant)}`).join(' • ')})`
                  : '(reliquats des périodes de référence échues — art. 160)',
                solde: droits.cp,
                barre: 'bg-brand-500',
                droite: (
                  <span>
                    En attente : <strong className="text-amber-400 font-medium">{nombre(droits.cp.enAttente)} j</strong>
                  </span>
                ),
              },
              ...(periodeEnCours
                ? [
                    {
                      libelle: `Congés en cours d’acquisition ${periodeEnCours.annee}`,
                      precision: `(${nombre(params.cpParMois)} j ouvrables / mois • ${nombre(droits.moisAcquis)} mois acquis)`,
                      solde: { acquis: periodeEnCours.acquis, consomme: periodeEnCours.pris, enAttente: 0, restant: periodeEnCours.restant },
                      barre: 'bg-brand-400',
                      droite: (
                        <span className="text-slate-400">
                          {params.anticipationConges ? 'Anticipation autorisée' : `Jouissables à partir du ${dateCourte(periodeEnCours.jouissableDu)}`}
                        </span>
                      ),
                    },
                  ]
                : []),
              {
                libelle: 'Permissions familiales',
                precision: '(non déductibles du congé, 10 j / an maximum — art. 159)',
                solde: droits.permissions,
                barre: 'bg-emerald-500',
                droite: <span className="text-slate-400">Décès, mariage, naissance (CCGT art. 54)</span>,
              },
            ].map((s) => (
              <div key={s.libelle} className="py-3.5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-200">{s.libelle}</span>
                    <span className="text-[11px] text-slate-400">{s.precision}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-sm font-bold text-white">{nombre(s.solde.restant)} j</span>
                    <span className="text-slate-400 text-xs">/ {nombre(s.solde.acquis)} j</span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-slate-900/60 border border-slate-800/80 rounded-full overflow-hidden">
                  <div className={`h-full ${s.barre} rounded-full`} style={{ width: `${s.solde.acquis ? Math.max(0, (s.solde.restant / s.solde.acquis) * 100) : 0}%` }}></div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    Consommé : <strong className="text-slate-300 font-medium">{nombre(s.solde.consomme)} j</strong>
                  </span>
                  {s.droite}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Prochaine absence */}
        <div className="lg:col-span-4 bg-[#182234] rounded-xl border border-slate-800 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Icon name="calendar_today" className="text-[18px] text-brand-400" />
                <h3 className="font-display text-sm font-semibold text-white tracking-tight">Prochaine absence</h3>
              </div>
              {prochaine && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-500/10 text-brand-400 border border-brand-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse"></span>
                  {prochaine.debut <= today ? 'En cours' : `Dans ${ecartJours(today, prochaine.debut)} j`}
                </span>
              )}
            </div>
            {prochaine ? (
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 mt-4 flex flex-col gap-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{LIBELLE_CONGE[prochaine.type]}</span>
                  <BadgeStatutConge attenteLabel="En attente N+1" statut={prochaine.statut} />
                </div>
                <div>
                  <div className="font-display text-base font-bold text-white tracking-tight">
                    {prochaine.debut === prochaine.fin ? dateCourte(prochaine.debut) : `${jourMois(prochaine.debut)} — ${dateCourte(prochaine.fin)}`}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Icon name="timelapse" className="text-[15px] text-slate-400" />
                    <span className="text-xs text-slate-300 font-medium">{dureeLibelle(prochaine)} consécutifs</span>
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Reprise prévue</span>
                  <span className="font-medium text-slate-200">
                    {dateLongue(reprise).split(' ').slice(0, 3).join(' ')} à {params.heureDebut}
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-500">Aucune absence planifiée.</p>
            )}
          </div>
          <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">Besoin d'anticiper ?</span>
            <button
              className="inline-flex items-center gap-1.5 text-brand-400 hover:text-brand-300 font-medium transition-colors cursor-pointer"
              onClick={() => setModalOpen(true)}
              type="button"
            >
              <span>Simuler l'impact solde</span>
              <Icon name="arrow_forward" className="text-[14px]" />
            </button>
          </div>
        </div>
      </div>

      <DemandeCongeModal open={modalOpen} onClose={closeModal} onSubmitted={() =>
          void dialog.alert({
            titre: 'Demande soumise',
            tone: 'success',
            icon: 'event_available',
            message: 'Votre demande a bien été soumise à validation. Le solde sera mis à jour dès l’approbation, et le titre de congé ajouté à vos documents.',
          })
        } />

      <Modal open={detail !== null} onClose={() => setDetail(null)}>
        {detail && (
          <div className="bg-[#111827] border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 bg-[#182234]/70 flex items-center justify-between">
              <div>
                <h4 className="font-display text-base font-semibold text-white">{LIBELLE_CONGE[detail.type]}</h4>
                <p className="text-xs text-slate-400 mt-0.5">Réf. {detail.reference}</p>
              </div>
              <button className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80" onClick={() => setDetail(null)} type="button">
                <Icon name="close" className="text-[19px]" />
              </button>
            </div>
            <div className="p-6 flex flex-col divide-y divide-slate-800/70 text-xs">
              {[
                ['Période', `${dateLongue(detail.debut)} (${detail.debutPeriode === 'midi' ? 'midi' : 'matin'}) → ${dateLongue(detail.fin)} (${detail.finPeriode === 'midi' ? 'midi' : 'fin de journée'})`],
                ['Durée', dureeLibelle(detail)],
                ['Demandée le', dateHeure(detail.dateDemande)],
                ['Motif', detail.motif || '—'],
                ['Justificatif', detail.justificatif ?? '—'],
                ['Traitée par', detail.traitePar ? `${detail.traitePar} le ${dateHeure(detail.dateTraitement!)}` : 'En attente'],
                ['Commentaire RH', detail.commentaireRH || '—'],
              ].map(([l, v]) => (
                <div key={l} className="py-2.5 flex justify-between gap-4">
                  <span className="text-slate-400 shrink-0">{l}</span>
                  <span className="text-slate-200 text-right">{v}</span>
                </div>
              ))}
              <div className="pt-3 flex justify-end">
                <BadgeStatutConge statut={detail.statut} />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

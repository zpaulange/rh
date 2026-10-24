import { useMemo, useState } from 'react';
import { BadgeStatutConge, dureeLibelle, periodeConge } from '../../components/CongeUI';
import EmployeCell from '../../components/rh/EmployeCell';
import Badge from '../../components/ui/Badge';
import Card, { THEAD_ROW } from '../../components/ui/Card';
import DecisionModal from '../../components/ui/DecisionModal';
import Icon from '../../components/ui/Icon';
import KpiCard, { KpiPastille } from '../../components/ui/KpiCard';
import PageHeader from '../../components/ui/PageHeader';
import SelectChip from '../../components/ui/SelectChip';
import TabFilter from '../../components/ui/TabFilter';
import { messageErreur, useDialog } from '../../components/ui/Dialog';
import { deciderConge, journaliserExport } from '../../db/actions';
import { peut } from '../../lib/permissions';
import MaterniteModal from './modals/MaterniteModal';
import { getDB } from '../../db/store';
import { useTelechargement } from '../../components/DocumentUI';
import { useEspaceRH } from '../../hooks/useEspaceRH';
import { exporterCSV } from '../../lib/export';
import { exporterRapportPDF } from '../../lib/pdfLazy';
import { LIBELLE_CONGE, calculerDroits, dureeConge, soldePour } from '../../lib/rules';
import { ensembleFeries, jourFerie } from '../../lib/feries';
import { abreviationJour, ajouterJours, dateCourte, dateHeure, dernierDuMois, estOuvre, jourSemaine, moisDe, moisLong, nombre } from '../../lib/time';
import type { DemandeConge, TypeConge } from '../../types';

type Onglet = 'en_attente' | 'approuve' | 'refuse' | 'toutes';
const HORIZON = 28;

export default function Conges() {
  const { user, db, today } = useEspaceRH();
  const dialog = useDialog();
  const [onglet, setOnglet] = useState<Onglet>('en_attente');
  const [type, setType] = useState<'tous' | TypeConge>('tous');
  const [departement, setDepartement] = useState('tous');
  const [decision, setDecision] = useState<{ c: DemandeConge; approuver: boolean } | null>(null);
  const [maternite, setMaternite] = useState<{ conge: DemandeConge; mode: 'accouchement' | 'prolongation' } | null>(null);
  const telecharger = useTelechargement();

  const departements = useMemo(() => [...new Set(db.employes.map((e) => e.departement))].sort(), [db]);
  const employeDe = (id: string) => db.employes.find((e) => e.id === id)!;
  const droitsDe = useMemo(() => {
    const map = new Map(db.employes.map((e) => [e.id, calculerDroits(db, e, today)]));
    return (id: string) => map.get(id)!;
  }, [db, today]);

  const demandes = db.conges
    .filter((c) => (onglet === 'toutes' || c.statut === onglet) && (type === 'tous' || c.type === type))
    .filter((c) => departement === 'tous' || employeDe(c.employeId).departement === departement)
    .sort((a, b) => (onglet === 'en_attente' ? a.debut.localeCompare(b.debut) : b.dateDemande.localeCompare(a.dateDemande)));

  const enAttente = db.conges.filter((c) => c.statut === 'en_attente').length;
  const absentsAujourdhui = db.conges.filter((c) => c.statut === 'approuve' && c.debut <= today && today <= c.fin).length;
  const mois = moisDe(today);
  // Jours d'absence validés tombant dans le mois (un congé à cheval sur deux mois est réparti)
  const debutMois = `${mois}-01`;
  const finMois = dernierDuMois(mois);
  const feries = ensembleFeries(db.parametres);
  const joursMois = db.conges
    .filter((c) => c.statut === 'approuve' && c.debut <= finMois && c.fin >= debutMois)
    .reduce(
      (s, c) =>
        s +
        dureeConge(
          c.debut < debutMois ? debutMois : c.debut,
          c.fin > finMois ? finMois : c.fin,
          c.debut < debutMois ? 'matin' : c.debutPeriode,
          c.fin > finMois ? 'fin' : c.finPeriode,
          feries,
        ),
      0,
    );
  const soldeMoyen = db.employes.length ? db.employes.reduce((s, e) => s + droitsDe(e.id).cp.restant, 0) / db.employes.length : 0;

  /** Collègues du même département absents sur la même période (risque de sous-effectif) */
  const chevauchements = (c: DemandeConge) => {
    const dep = employeDe(c.employeId).departement;
    return db.conges.filter(
      (o) => o.id !== c.id && o.statut === 'approuve' && o.debut <= c.fin && c.debut <= o.fin && employeDe(o.employeId).departement === dep,
    );
  };

  const soldes = db.employes
    .filter((e) => departement === 'tous' || e.departement === departement)
    .sort((a, b) => a.nom.localeCompare(b.nom))
    .map((e) => ({ e, d: droitsDe(e.id) }));

  const colonnesSoldes = ['Matricule', 'Collaborateur', 'Département', 'CP acquis', 'CP consommés', 'CP en attente', 'CP restants', 'Permissions restantes', 'CP en acquisition', 'Maladie (j)'];
  const exporterSoldes = (format: 'CSV' | 'PDF') => {
    const data = soldes.map(({ e, d }) => [
      e.matricule,
      `${e.prenom} ${e.nom}`,
      e.departement,
      nombre(d.cp.acquis),
      nombre(d.cp.consomme),
      nombre(d.cp.enAttente),
      nombre(d.cp.restant),
      nombre(d.permissions.restant),
      nombre(d.detailCp.enCours),
      nombre(d.maladie),
    ]);
    if (format === 'CSV') exporterCSV(`soldes_conges_${today}.csv`, colonnesSoldes, data);
    else exporterRapportPDF(`Soldes de congés — exercice ${today.slice(0, 4)}`, `Arrêtés au ${dateCourte(today)} • ${db.parametres.cpParMois} j ouvrables CP / mois`, colonnesSoldes, data, `soldes_conges_${today}.pdf`, `${user.prenom} ${user.nom}`);
    journaliserExport(user, 'Soldes de congés', format, data.length);
  };

  // Planning des absences sur les 4 prochaines semaines
  const jours = Array.from({ length: HORIZON }, (_, i) => ajouterJours(today, i));
  const planning = db.conges
    .filter((c) => c.statut !== 'refuse' && c.fin >= today && c.debut <= jours[jours.length - 1])
    .filter((c) => departement === 'tous' || employeDe(c.employeId).departement === departement)
    .sort((a, b) => a.debut.localeCompare(b.debut));
  // Bandeau des mois couverts par le planning (nom du mois et année au-dessus des jours)
  const moisPlanning = jours.reduce<{ mois: string; nb: number }[]>((acc, k) => {
    const m = moisDe(k);
    if (acc.length && acc[acc.length - 1].mois === m) acc[acc.length - 1].nb += 1;
    else acc.push({ mois: m, nb: 1 });
    return acc;
  }, []);
  const debutDeMois = (k: string, i: number) => i > 0 && k.endsWith('-01');
  // Jours décomptés en congé : jours ouvrables, lundi → samedi hors fériés (CT art. 158)
  const ouvrable = (k: string) => jourSemaine(k) !== 0 && !jourFerie(db.parametres, k);

  return (
    <>
      <PageHeader subtitle="Validation des demandes, calcul automatique des droits et planning des absences" title="Congés & absences">
        <SelectChip
          ariaLabel="Département"
          icon="apartment"
          onChange={setDepartement}
          options={[{ value: 'tous', label: 'Tous les départements' }, ...departements.map((d) => ({ value: d, label: d }))]}
          value={departement}
        />
        <SelectChip
          ariaLabel="Type"
          icon="filter_list"
          onChange={setType}
          options={[{ value: 'tous' as const, label: 'Tous les types' }, ...(Object.keys(LIBELLE_CONGE) as TypeConge[]).map((t) => ({ value: t, label: LIBELLE_CONGE[t] }))]}
          value={type}
        />
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          droite={<KpiPastille tone={enAttente ? 'amber' : 'emerald'}>{enAttente ? 'À traiter' : 'À jour'}</KpiPastille>}
          icon="hourglass_top"
          iconClass="text-amber-400"
          titre="Demandes en attente"
          valeur={enAttente}
          valeurClass={enAttente ? 'text-amber-300' : 'text-white'}
        />
        <KpiCard droite={<KpiPastille tone="brand">Aujourd'hui</KpiPastille>} icon="beach_access" titre="Collaborateurs en congé" valeur={absentsAujourdhui} />
        <KpiCard droite={<KpiPastille tone="slate">{moisLong(mois)}</KpiPastille>} icon="event_available" suffixe="jours" titre="Congés validés ce mois" valeur={nombre(joursMois)} />
        <KpiCard
          droite={<KpiPastille>{db.parametres.cpParMois} j / mois</KpiPastille>}
          icon="pie_chart"
          suffixe="j"
          titre="Solde CP moyen"
          valeur={nombre(soldeMoyen)}
        />
      </div>

      <Card
        droite={
          <TabFilter
            onChange={setOnglet}
            options={[
              { value: 'en_attente', label: `En attente (${enAttente})` },
              { value: 'approuve', label: 'Approuvées' },
              { value: 'refuse', label: 'Refusées' },
              { value: 'toutes', label: 'Toutes' },
            ]}
            value={onglet}
          />
        }
        flush
        icon="format_list_bulleted"
        titre="Demandes de congé & permissions"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                <th className="py-3 px-5">Collaborateur</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Période</th>
                <th className="py-3 px-4">Durée</th>
                <th className="py-3 px-4">Solde après</th>
                <th className="py-3 px-4">Service</th>
                <th className="py-3 px-5 text-right">{onglet === 'en_attente' ? 'Décision' : 'Statut'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {demandes.map((c) => {
                const e = employeDe(c.employeId);
                const solde = soldePour(droitsDe(c.employeId), c.type);
                const apres = solde === null ? null : c.statut === 'en_attente' ? Math.round((solde - c.jours) * 10) / 10 : solde;
                const autres = chevauchements(c);
                return (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition-colors align-top">
                    <td className="py-3 px-5">
                      <EmployeCell detail={`Réf. ${c.reference} • demandé le ${dateHeure(c.dateDemande)}`} employe={e} />
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-300">
                      {LIBELLE_CONGE[c.type]}
                      {c.motif && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{c.motif}</p>}
                      {c.justificatif && (
                        <span className="inline-flex items-center gap-1 mt-0.5 text-[11px] text-brand-400">
                          <Icon name="attach_file" className="text-[13px]" />
                          {c.justificatif}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">{periodeConge(c)}</td>
                    <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">{dureeLibelle(c)}</td>
                    <td className="py-3 px-4">
                      {apres === null ? (
                        <span className="text-xs text-slate-500">Sans décompte</span>
                      ) : (
                        <Badge tone={apres < 0 ? 'rose' : 'slate'}>
                          {nombre(apres)} j{apres < 0 ? ' • insuffisant' : ''}
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {autres.length ? (
                        <span title={autres.map((o) => `${employeDe(o.employeId).prenom} ${employeDe(o.employeId).nom}`).join(', ')}>
                          <Badge icon="group_off" tone="amber">
                            {autres.length} absent(s)
                          </Badge>
                        </span>
                      ) : (
                        <Badge tone="emerald">Couvert</Badge>
                      )}
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      {c.statut === 'en_attente' && !peut(db, user, c.type === 'permission' ? 'permissions.valider' : 'conges.valider') ? (
                        <span className="text-[11px] text-slate-500" title="Ce type de demande ne fait pas partie des droits de votre rôle">
                          En attente • droit requis
                        </span>
                      ) : c.statut === 'en_attente' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                            onClick={() => setDecision({ c, approuver: true })}
                            type="button"
                          >
                            Approuver
                          </button>
                          <button
                            className="px-2.5 py-1 rounded-md text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                            onClick={() => setDecision({ c, approuver: false })}
                            type="button"
                          >
                            Refuser
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <BadgeStatutConge statut={c.statut} />
                          <span className="text-[11px] text-slate-500">{c.traitePar}</span>
                          {c.type === 'maternite' && c.statut === 'approuve' && peut(db, user, 'conges.valider') && (
                            <span className="flex gap-2">
                              {!c.dateAccouchement && (
                                <button className="text-[11px] font-medium text-brand-400 hover:text-brand-300" onClick={() => setMaternite({ conge: c, mode: 'accouchement' })} type="button">
                                  Déclarer l’accouchement
                                </button>
                              )}
                              {!c.prolongationMaladie && (
                                <button className="text-[11px] font-medium text-slate-400 hover:text-white" onClick={() => setMaternite({ conge: c, mode: 'prolongation' })} type="button">
                                  Prolonger
                                </button>
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {demandes.length === 0 && (
                <tr>
                  <td className="py-8 px-5 text-center text-xs text-slate-500" colSpan={7}>
                    Aucune demande.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card flush icon="calendar_view_month" sousTitre="Congés validés (plein) et en attente (hachuré) sur les 4 prochaines semaines" titre="Planning des absences">
        <div className="overflow-x-auto p-5">
          <div className="min-w-[760px]">
            <div className="grid items-end gap-px mb-1.5" style={{ gridTemplateColumns: `180px repeat(${HORIZON}, minmax(0, 1fr))` }}>
              <div></div>
              {moisPlanning.map(({ mois: m, nb }, i) => (
                <div
                  key={m}
                  className={`text-[11px] font-semibold text-slate-200 truncate pb-1 border-b border-slate-700 ${i > 0 ? 'border-l border-l-slate-600 pl-1.5' : ''}`}
                  style={{ gridColumn: `span ${nb}` }}
                  title={moisLong(m)}
                >
                  {nb >= 6 ? moisLong(m) : `${moisLong(m).slice(0, 3)}. ${m.slice(0, 4)}`}
                </div>
              ))}
            </div>
            <div className="grid items-end gap-px" style={{ gridTemplateColumns: `180px repeat(${HORIZON}, minmax(0, 1fr))` }}>
              <div></div>
              {jours.map((k, i) => (
                <div
                  key={k}
                  className={`text-center text-[10px] leading-tight ${debutDeMois(k, i) ? 'border-l border-slate-600' : ''} ${
                    k === today ? 'text-brand-400 font-semibold' : estOuvre(k) && !jourFerie(db.parametres, k) ? 'text-slate-400' : 'text-slate-600'
                  }`}
                  title={jourFerie(db.parametres, k)?.libelle}
                >
                  {abreviationJour(k).slice(0, 2)}
                  <br />
                  {k.slice(8)}
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {planning.length === 0 && <p className="text-xs text-slate-500 py-4">Aucune absence planifiée sur la période.</p>}
              {planning.map((c) => {
                const e = employeDe(c.employeId);
                return (
                  <div key={c.id} className="grid items-center gap-px" style={{ gridTemplateColumns: `180px repeat(${HORIZON}, minmax(0, 1fr))` }}>
                    <div className="text-xs text-slate-300 truncate pr-2" title={`${LIBELLE_CONGE[c.type]} • ${periodeConge(c)}`}>
                      {e.prenom} {e.nom}
                    </div>
                    {jours.map((k, i) => {
                      const travaille = estOuvre(k) && !jourFerie(db.parametres, k);
                      const dedans = c.debut <= k && k <= c.fin && ouvrable(k);
                      return (
                        <div
                          key={k}
                          className={`h-5 ${debutDeMois(k, i) ? 'border-l border-l-slate-600' : ''} ${
                            dedans
                              ? c.statut === 'approuve'
                                ? 'bg-brand-500/70'
                                : 'bg-[repeating-linear-gradient(135deg,rgba(217,119,6,0.55)_0_3px,transparent_3px_6px)] border border-amber-500/40'
                              : k === today
                                ? 'bg-brand-500/15'
                                : travaille
                                  ? 'bg-slate-900/50'
                                  : 'bg-slate-900/20'
                          }`}
                          title={dedans ? `${e.prenom} ${e.nom} — ${LIBELLE_CONGE[c.type]} (${c.statut === 'approuve' ? 'validé' : 'en attente'})` : undefined}
                        ></div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-4 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 bg-brand-500/70"></span>Validé
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 border border-amber-500/40 bg-[repeating-linear-gradient(135deg,rgba(217,119,6,0.55)_0_3px,transparent_3px_6px)]"></span>En attente
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card
        droite={
          <div className="flex gap-2">
            <button className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5" onClick={() => exporterSoldes('CSV')} type="button">
              <Icon name="table_view" className="text-[15px]" />
              CSV
            </button>
            <button className="h-8 px-3 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-1.5" onClick={() => exporterSoldes('PDF')} type="button">
              <Icon name="picture_as_pdf" className="text-[15px]" />
              PDF
            </button>
          </div>
        }
        flush
        icon="calculate"
        sousTitre={`Calcul automatique (CT art. 158 à 161) : ${db.parametres.cpParMois} j ouvrables par mois de service effectif, jouissables après la période de référence, reliquats reportés ; permissions familiales ${db.parametres.quotaPermissions} j / an maximum`}
        titre="Soldes des collaborateurs"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                <th className="py-3 px-5">Collaborateur</th>
                <th className="py-3 px-4">CP acquis</th>
                <th className="py-3 px-4">Consommés</th>
                <th className="py-3 px-4">En attente</th>
                <th className="py-3 px-4">CP restants</th>
                <th className="py-3 px-4">Permissions</th>
                <th className="py-3 px-4">En acquisition</th>
                <th className="py-3 px-5 text-right">Maladie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {soldes.map(({ e, d }) => (
                <tr key={e.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-5">
                    <EmployeCell employe={e} />
                  </td>
                  <td className="py-3 px-4 font-mono text-xs">{nombre(d.cp.acquis)} j</td>
                  <td className="py-3 px-4 font-mono text-xs">{nombre(d.cp.consomme)} j</td>
                  <td className={`py-3 px-4 font-mono text-xs ${d.cp.enAttente ? 'text-amber-300' : 'text-slate-500'}`}>{nombre(d.cp.enAttente)} j</td>
                  <td className="py-3 px-4">
                    <Badge tone={d.cp.restant < 0 ? 'rose' : d.cp.restant < 3 ? 'amber' : 'emerald'}>{nombre(d.cp.restant)} j</Badge>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs">
                    {nombre(d.permissions.restant)} / {d.permissions.acquis} j
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-400">{nombre(d.detailCp.enCours)} j</td>
                  <td className="py-3 px-5 text-right font-mono text-xs">{nombre(d.maladie)} j</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <MaterniteModal
        action={maternite}
        onClose={() => setMaternite(null)}
        onFait={(c) => {
          setMaternite(null);
          void dialog.alert({ titre: 'Congé de maternité mis à jour', tone: 'success', message: `Fin du congé le ${dateCourte(c.fin)} ; la salariée a été notifiée.` });
        }}
      />
      <DecisionModal
        approuver={decision?.approuver ?? true}
        onClose={() => setDecision(null)}
        onConfirm={(commentaire) => {
          if (!decision) return;
          try {
            const c = decision.c;
            deciderConge(user, c.id, decision.approuver, commentaire);
            const titre = getDB().documents.find((d) => d.modele === 'titre_conge' && d.params.congeId === c.id);
            if (decision.approuver) {
              void dialog
                .alert({
                  titre: 'Congé approuvé',
                  tone: 'success',
                  icon: 'event_available',
                  message: titre
                    ? `Le titre de congé PDF a été généré automatiquement et ajouté aux documents de ${employeDe(c.employeId).prenom} ${employeDe(c.employeId).nom}, qui a été notifié(e).`
                    : `${employeDe(c.employeId).prenom} ${employeDe(c.employeId).nom} a été notifié(e).`,
                  actions: titre
                    ? [
                        { label: 'Télécharger le titre', value: 'pdf', variant: 'secondary', icon: 'download' },
                        { label: 'Compris', value: 'ok', variant: 'primary' },
                      ]
                    : undefined,
                })
                .then((choix) => {
                  if (choix === 'pdf' && titre) telecharger(titre);
                });
            } else {
              void dialog.alert({ titre: 'Demande refusée', tone: 'info', message: 'Le collaborateur a été notifié avec le motif du refus.' });
            }
          } catch (err) {
            void dialog.alert({ titre: 'Action impossible', tone: 'danger', message: messageErreur(err) });
          }
          setDecision(null);
        }}
        open={decision !== null}
        resume={
          decision && (
            <>
              <strong className="text-white">
                {employeDe(decision.c.employeId).prenom} {employeDe(decision.c.employeId).nom}
              </strong>{' '}
              — {LIBELLE_CONGE[decision.c.type]} • {periodeConge(decision.c)} • {dureeLibelle(decision.c)}
              {(() => {
                const s = soldePour(droitsDe(decision.c.employeId), decision.c.type);
                if (s === null) return null;
                const apres = Math.round((s - decision.c.jours) * 10) / 10;
                return (
                  <span className={`block mt-1 ${apres < 0 ? 'text-rose-300' : 'text-slate-400'}`}>
                    Solde disponible : {nombre(s)} j → après validation : {nombre(apres)} j
                  </span>
                );
              })()}
              {chevauchements(decision.c).length > 0 && (
                <span className="block mt-1 text-amber-300">
                  Attention : {chevauchements(decision.c).length} collègue(s) du même service déjà absent(s) sur la période.
                </span>
              )}
            </>
          )
        }
        titre={decision?.approuver ? 'Approuver la demande' : 'Refuser la demande'}
      />
    </>
  );
}

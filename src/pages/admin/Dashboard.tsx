import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PresenceChart, RetardsDepartementChart, type JourPresence } from '../../components/rh/Charts';
import Card from '../../components/ui/Card';
import Icon from '../../components/ui/Icon';
import KpiCard, { KpiPastille } from '../../components/ui/KpiCard';
import PageHeader from '../../components/ui/PageHeader';
import { useEspaceRH } from '../../hooks/useEspaceRH';
import { absencesPeriode } from '../../lib/absences';
import { ACTIONS_AUDIT } from '../../lib/audit';
import { estJourTravaille } from '../../lib/feries';
import { fcfa, totaux } from '../../lib/paie';
import { LIBELLE_ROLE_LONG } from '../../lib/permissions';
import { depuis } from '../../lib/relatif';
import { estEnRetard, statsMois, statutJour } from '../../lib/rules';
import { timeSource } from '../../lib/serverTime';
import { abreviationJour, ajouterJours, dateLongue, heureHMS, moisDe, moisLong, nombre } from '../../lib/time';
import type { ActionAudit, Role } from '../../types';

const SECURITE: ActionAudit[] = ['ECHEC_CONNEXION', 'COMPTE_VERROUILLE', 'CHANGEMENT_ROLE', 'MODIFICATION_PERMISSIONS', 'DESACTIVATION_COMPTE', 'SUPPRESSION_EMPLOYE', 'REINITIALISATION_MOT_DE_PASSE'];

/** Barre horizontale d'une répartition (une seule teinte, valeur affichée en texte) */
function Repartition({ lignes }: { lignes: { libelle: string; valeur: number; detail?: string }[] }) {
  const [survol, setSurvol] = useState<string | null>(null);
  const max = Math.max(1, ...lignes.map((l) => l.valeur));
  return (
    <div className="flex flex-col gap-3">
      {lignes.map((l) => (
        <div
          key={l.libelle}
          className={`flex flex-col gap-1.5 transition-opacity ${survol && survol !== l.libelle ? 'opacity-50' : ''}`}
          onMouseEnter={() => setSurvol(l.libelle)}
          onMouseLeave={() => setSurvol(null)}
          title={`${l.libelle} : ${l.valeur}${l.detail ? ` • ${l.detail}` : ''}`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 truncate">{l.libelle}</span>
            <span className="font-mono text-slate-200">
              {l.valeur}
              {l.detail && <span className="text-slate-500 font-sans"> • {l.detail}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-900/70 overflow-hidden">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${(l.valeur / max) * 100}%` }}></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Vue d'ensemble de l'administrateur : statistiques globales de l'organisation, de la présence et de la sécurité
export default function AdminDashboard() {
  const { db, now, today } = useEspaceRH();
  const params = db.parametres;
  const mois = moisDe(today);

  const comptesActifs = useMemo(() => new Set(db.comptes.filter((c) => c.actif).map((c) => c.employeId)), [db]);
  const actifs = useMemo(() => db.employes.filter((e) => comptesActifs.has(e.id)), [db, comptesActifs]);

  // Présence du jour
  const situation = actifs.map((e) => statutJour(db, e.id, today, today, now));
  const presents = situation.filter((s) => ['present', 'en_pause', 'parti'].includes(s)).length;
  const attendus = estJourTravaille(params, today) ? situation.filter((s) => !['conge', 'ferie', 'hors_contrat', 'non_ouvre'].includes(s)).length : 0;
  const enConge = situation.filter((s) => s === 'conge').length;

  // Mois en cours : retards, absentéisme
  const stats = useMemo(() => actifs.map((e) => ({ e, st: statsMois(db, e.id, mois, today, now) })), [db, actifs, mois, today, now]);
  const retardsMois = stats.reduce((s, x) => s + x.st.retards + x.st.retardsJustifies, 0);
  const minutesRetard = db.pointages.filter((p) => p.date.startsWith(mois) && estEnRetard(p, params)).reduce((s, p) => s + p.retardMinutes, 0);
  const absences30 = useMemo(() => absencesPeriode(db, ajouterJours(today, -29), today, today, now, actifs), [db, today, now, actifs]);
  const absencesMois = absences30.filter((a) => a.fin >= `${mois}-01`);
  const joursNJ = absencesMois.filter((a) => !a.justifiee).reduce((s, a) => s + a.jours.filter((k) => k.startsWith(mois)).length, 0);
  const joursJ = absencesMois.filter((a) => a.justifiee).reduce((s, a) => s + a.jours.filter((k) => k.startsWith(mois)).length, 0);
  const joursAttendusMois = stats.reduce((s, x) => s + x.st.joursOuvres, 0);
  const tauxAbsenteisme = joursAttendusMois ? ((joursNJ + joursJ) / joursAttendusMois) * 100 : 0;

  const enAttente = db.conges.filter((c) => c.statut === 'en_attente').length + db.regularisations.filter((r) => r.statut === 'en_attente').length + db.demandesDocuments.filter((d) => d.statut === 'en_attente').length;
  const nonJustifiees30 = absences30.filter((a) => !a.justifiee);

  // Paie : dernière campagne versée
  const dernierePaie = [...db.campagnesPaie].filter((c) => c.statut === 'payee').sort((a, b) => b.mois.localeCompare(a.mois))[0];
  const totalPaie = dernierePaie ? totaux(dernierePaie.lignes) : null;

  // Sécurité
  const verrouilles = db.comptes.filter((c) => c.verrouilleJusqua && new Date(c.verrouilleJusqua) > now).length;
  const echecs24h = db.audit.filter((a) => a.action === 'ECHEC_CONNEXION' && now.getTime() - new Date(a.date).getTime() < 86_400_000).length;
  const evenementsSecurite = db.audit.filter((a) => SECURITE.includes(a.action)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const activite = [...db.audit].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);

  // Présence des 7 derniers jours travaillés
  const jours: JourPresence[] = useMemo(() => {
    const cles: string[] = [];
    for (let k = today; cles.length < 7; k = ajouterJours(k, -1)) if (estJourTravaille(params, k)) cles.unshift(k);
    return cles.map((k) => {
      const pts = db.pointages.filter((p) => p.date === k && comptesActifs.has(p.employeId));
      const retard = pts.filter((p) => estEnRetard(p, params)).length;
      const absents = actifs.filter((e) => statutJour(db, e.id, k, today, now) === 'absent').length;
      return { label: `${abreviationJour(k)} ${k.slice(8)}`, detail: dateLongue(k), aLHeure: pts.length - retard, retard, absents };
    });
  }, [db, actifs, comptesActifs, today, now, params]);

  const effectifDepartements = db.departements
    .map((d) => ({ libelle: d.nom, valeur: db.employes.filter((e) => e.departement === d.nom).length, detail: `${d.services.length} service(s)` }))
    .sort((a, b) => b.valeur - a.valeur);
  const retardsDepartements = db.departements
    .map((d) => {
      const membres = stats.filter((x) => x.e.departement === d.nom);
      return { departement: d.nom, retards: membres.reduce((s, x) => s + x.st.retards + x.st.retardsJustifies, 0), effectif: membres.length };
    })
    .filter((d) => d.retards > 0)
    .sort((a, b) => b.retards - a.retards);
  const parRole = (r: Role) => db.comptes.filter((c) => c.role === r && c.actif).length;
  const contrats = (['CDI', 'CDD', 'Stage'] as const).map((c) => ({ libelle: c, valeur: actifs.filter((e) => e.contrat === c).length }));

  const lienCarte = (to: string, texte: string) => (
    <Link className="text-xs font-medium text-brand-400 hover:text-brand-300" to={to}>
      {texte} →
    </Link>
  );

  return (
    <>
      <PageHeader subtitle={`${dateLongue(today)} • heure serveur ${heureHMS(now)}${timeSource() === 'serveur' ? '' : ' (horloge locale)'}`} title="Vue d’ensemble">
        <Link className="h-9 px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium inline-flex items-center gap-2" to="/admin/rapports">
          <Icon className="text-[16px]" name="analytics" />
          Rapports
        </Link>
        <Link className="h-9 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold inline-flex items-center gap-2 shadow-sm shadow-brand-600/30" to="/admin/demandes">
          <Icon className="text-[16px]" name="inbox" />
          Demandes en attente ({enAttente})
        </Link>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard droite={<KpiPastille tone="slate">{`${db.departements.length} départements`}</KpiPastille>} icon="groups" suffixe={`/ ${db.employes.length}`} titre="Effectif actif" valeur={actifs.length} />
        <KpiCard
          droite={<KpiPastille tone={attendus && presents < attendus ? 'amber' : 'emerald'}>{`${enConge} en congé`}</KpiPastille>}
          icon="how_to_reg"
          progression={attendus ? (presents / attendus) * 100 : 0}
          suffixe={`/ ${attendus}`}
          titre="Présents aujourd'hui"
          valeur={presents}
        />
        <KpiCard
          droite={<KpiPastille tone={enAttente ? 'amber' : 'emerald'}>{enAttente ? 'À traiter' : 'À jour'}</KpiPastille>}
          icon="inbox"
          iconClass="text-amber-400"
          titre="Demandes en attente"
          valeur={enAttente}
          valeurClass={enAttente ? 'text-amber-300' : 'text-white'}
        />
        <KpiCard
          droite={<KpiPastille tone={nonJustifiees30.length ? 'rose' : 'emerald'}>30 derniers jours</KpiPastille>}
          icon="person_off"
          iconClass="text-rose-400"
          titre="Absences non justifiées"
          valeur={nonJustifiees30.reduce((s, a) => s + a.jours.length, 0)}
          suffixe="j"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard droite={<KpiPastille tone="amber">{`${nombre(minutesRetard)} min cumulées`}</KpiPastille>} icon="schedule" iconClass="text-amber-400" titre={`Retards — ${moisLong(mois)}`} valeur={retardsMois} />
        <KpiCard
          droite={<KpiPastille tone={tauxAbsenteisme > 5 ? 'amber' : 'brand'}>{`${joursNJ} j non justifiés`}</KpiPastille>}
          icon="percent"
          suffixe="%"
          titre={`Absentéisme — ${moisLong(mois)}`}
          valeur={nombre(Math.round(tauxAbsenteisme * 10) / 10)}
        />
        <KpiCard
          droite={<KpiPastille tone="slate">{dernierePaie ? moisLong(dernierePaie.mois) : 'Aucune'}</KpiPastille>}
          icon="payments"
          titre="Masse salariale versée (brut)"
          valeur={<span className="text-lg">{totalPaie ? fcfa(totalPaie.brut) : '—'}</span>}
        />
        <KpiCard
          droite={<KpiPastille tone={verrouilles ? 'rose' : 'emerald'}>{`${echecs24h} échec(s) / 24 h`}</KpiPastille>}
          icon="shield"
          iconClass={verrouilles ? 'text-rose-400' : 'text-emerald-400'}
          titre="Comptes verrouillés"
          valeur={verrouilles}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <Card className="lg:col-span-7" droite={lienCarte('/admin/pointages', 'Présences')} icon="bar_chart" sousTitre="Collaborateurs actifs pointés, par jour" titre="Présence des 7 derniers jours travaillés">
          <PresenceChart effectif={actifs.length} jours={jours} />
        </Card>
        <Card className="lg:col-span-5" droite={lienCarte('/admin/organisation', 'Organisation')} icon="account_tree" sousTitre="Collaborateurs rattachés" titre="Effectif par département">
          <Repartition lignes={effectifDepartements} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <Card className="lg:col-span-5" icon="insights" sousTitre="Retards détectés automatiquement (justifiés inclus)" titre={`Retards par département — ${moisLong(mois)}`}>
          {retardsDepartements.length ? <RetardsDepartementChart donnees={retardsDepartements} /> : <p className="text-xs text-slate-500">Aucun retard ce mois-ci.</p>}
        </Card>
        <Card className="lg:col-span-7" droite={lienCarte('/admin/utilisateurs', 'Utilisateurs')} icon="pie_chart" sousTitre="Comptes actifs et contrats" titre="Répartition">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Rôles</div>
              <Repartition lignes={(['employe', 'rh', 'admin'] as Role[]).map((r) => ({ libelle: LIBELLE_ROLE_LONG[r], valeur: parRole(r) }))} />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Contrats</div>
              <Repartition lignes={contrats} />
            </div>
          </div>
          {totalPaie && dernierePaie && (
            <div className="mt-5 pt-4 border-t border-slate-800 grid grid-cols-3 gap-3 text-xs">
              {[
                ['Net versé', totalPaie.net],
                ['Charges patronales', totalPaie.cnssPatronale + totalPaie.vps],
                ['Coût employeur', totalPaie.coutEmployeur],
              ].map(([l, v]) => (
                <div key={l as string} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
                  <div className="text-slate-400">{l}</div>
                  <div className="font-mono text-slate-200 mt-0.5">{fcfa(v as number)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card droite={lienCarte('/admin/audit', 'Journal')} icon="gpp_maybe" sousTitre="Connexions, verrouillages, rôles, permissions" titre="Événements de sécurité">
          <ListeAudit entrees={evenementsSecurite} now={now} vide="Aucun événement de sécurité." />
        </Card>
        <Card droite={lienCarte('/admin/audit', 'Historique complet')} icon="policy" sousTitre="Dernières actions enregistrées" titre="Activité récente">
          <ListeAudit entrees={activite} now={now} vide="Aucune activité." />
        </Card>
      </div>
    </>
  );
}

function ListeAudit({ entrees, now, vide }: { entrees: ReturnType<typeof useEspaceRH>['db']['audit']; now: Date; vide: string }) {
  if (entrees.length === 0) return <p className="text-xs text-slate-500">{vide}</p>;
  return (
    <div className="flex flex-col gap-3">
      {entrees.map((a) => {
        const meta = ACTIONS_AUDIT[a.action];
        return (
          <div key={a.id} className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <Icon className={`text-[16px] mt-0.5 ${meta.tone === 'rose' ? 'text-rose-400' : meta.tone === 'amber' ? 'text-amber-400' : 'text-slate-400'}`} name={meta.icon} />
              <div className="min-w-0">
                <div className="text-xs text-slate-200 truncate">
                  <span className="font-semibold">{a.acteur}</span> • {meta.label}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {a.cible} — {a.details}
                </div>
              </div>
            </div>
            <span className="text-[11px] text-slate-500 shrink-0">{depuis(a.date, now)}</span>
          </div>
        );
      })}
    </div>
  );
}

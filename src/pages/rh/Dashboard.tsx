import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PointageDetailModal from '../../components/PointageDetailModal';
import { PresenceChart, RetardsDepartementChart, type JourPresence } from '../../components/rh/Charts';
import EmployeCell from '../../components/rh/EmployeCell';
import GeoBadge from '../../components/rh/GeoBadge';
import StatutJourBadge from '../../components/rh/StatutJourBadge';
import Badge from '../../components/ui/Badge';
import Card, { THEAD_ROW } from '../../components/ui/Card';
import Icon from '../../components/ui/Icon';
import KpiCard, { KpiPastille } from '../../components/ui/KpiCard';
import PhotoLightbox, { PhotoMiniature } from '../../components/ui/PhotoLightbox';
import { useEspaceRH } from '../../hooks/useEspaceRH';
import { ACTIONS_AUDIT } from '../../lib/audit';
import { estJourTravaille, jourFerie } from '../../lib/feries';
import { depuis } from '../../lib/relatif';
import { LIBELLE_CONGE, estEnRetard, retardJustifie, statsMois, statutJour } from '../../lib/rules';
import { timeSource } from '../../lib/serverTime';
import { abreviationJour, ajouterJours, dateCourte, dateLongue, ecartJours, estOuvre, heureHM, heureHMS, jourMois, moisDe, moisLong } from '../../lib/time';
import type { Pointage } from '../../types';

export default function Dashboard() {
  const { db, now, today, base } = useEspaceRH();
  const [photo, setPhoto] = useState<{ src: string; legende: string } | null>(null);
  const [detail, setDetail] = useState<Pointage | null>(null);
  const params = db.parametres;

  const actifs = useMemo(() => {
    const comptesActifs = new Set(db.comptes.filter((c) => c.actif).map((c) => c.employeId));
    return db.employes.filter((e) => comptesActifs.has(e.id));
  }, [db]);
  const departements = useMemo(() => new Set(actifs.map((e) => e.departement)), [actifs]);

  const situation = actifs.map((e) => ({ e, statut: statutJour(db, e.id, today, today, now) }));
  const presents = situation.filter((s) => ['present', 'en_pause', 'parti'].includes(s.statut)).length;
  // Attendus aujourd'hui : ni en congé, ni pas encore embauchés ; aucun attendu un jour férié ou non ouvré
  const attendus = estJourTravaille(params, today) ? situation.filter((s) => !['conge', 'ferie', 'hors_contrat', 'non_ouvre'].includes(s.statut)).length : 0;
  const pointagesJour = db.pointages.filter((p) => p.date === today).sort((a, b) => b.arrivee.localeCompare(a.arrivee));
  const retardsJour = pointagesJour.filter((p) => estEnRetard(p, params));
  const mois = moisDe(today);
  const retardsMois = actifs.reduce((s, e) => {
    const st = statsMois(db, e.id, mois, today, now);
    return s + st.retards + st.retardsJustifies;
  }, 0);

  const attente = {
    conges: db.conges.filter((c) => c.statut === 'en_attente'),
    regs: db.regularisations.filter((r) => r.statut === 'en_attente'),
    docs: db.demandesDocuments.filter((d) => d.statut === 'en_attente'),
  };
  const totalAttente = attente.conges.length + attente.regs.length + attente.docs.length;

  // Présence sur les 7 derniers jours ouvrés
  const jours: JourPresence[] = useMemo(() => {
    const cles: string[] = [];
    for (let k = today; cles.length < 7; k = ajouterJours(k, -1)) if (estJourTravaille(params, k)) cles.unshift(k);
    return cles.map((k) => {
      const pts = db.pointages.filter((p) => p.date === k && actifs.some((e) => e.id === p.employeId));
      const retard = pts.filter((p) => estEnRetard(p, params)).length;
      const absents = actifs.filter((e) => statutJour(db, e.id, k, today, now) === 'absent').length;
      return { label: `${abreviationJour(k)} ${k.slice(8)}`, detail: dateLongue(k), aLHeure: pts.length - retard, retard, absents };
    });
  }, [db, actifs, today, now, params]);

  const parDepartement = useMemo(
    () =>
      [...departements]
        .map((dep) => {
          const membres = actifs.filter((e) => e.departement === dep);
          const retards = membres.reduce((s, e) => {
            const st = statsMois(db, e.id, mois, today, now);
            return s + st.retards + st.retardsJustifies;
          }, 0);
          return { departement: dep, retards, effectif: membres.length };
        })
        .filter((d) => d.retards > 0)
        .sort((a, b) => b.retards - a.retards),
    [db, actifs, mois, today, now, departements],
  );

  const employeDe = (id: string) => db.employes.find((e) => e.id === id)!;

  // Alertes générées automatiquement à partir des règles
  const alertes: { icon: string; tone: 'amber' | 'rose' | 'brand'; titre: string; detail: string; lien: string }[] = [];
  retardsJour
    .filter((p) => !retardJustifie(db, p))
    .forEach((p) => {
      const e = employeDe(p.employeId);
      alertes.push({ icon: 'schedule', tone: 'amber', titre: `Retard — ${e.prenom} ${e.nom}`, detail: `Arrivée ${heureHM(p.arrivee)} • ${p.retardMinutes} min`, lien: `${base}/pointages` });
    });
  pointagesJour
    .filter((p) => p.geo && !p.geo.dansZone)
    .forEach((p) => {
      const e = employeDe(p.employeId);
      alertes.push({ icon: 'wrong_location', tone: 'amber', titre: `Hors zone — ${e.prenom} ${e.nom}`, detail: `Pointage à ${p.geo!.distance} m du site`, lien: `${base}/pointages` });
    });
  pointagesJour
    .filter((p) => (p.source === 'web' || p.source === 'mobile') && !p.photo)
    .forEach((p) => {
      const e = employeDe(p.employeId);
      alertes.push({ icon: 'no_photography', tone: 'brand', titre: `Sans photo — ${e.prenom} ${e.nom}`, detail: `Pointage ${p.terminal} à ${heureHM(p.arrivee)}`, lien: `${base}/pointages` });
    });
  db.comptes
    .filter((c) => c.verrouilleJusqua && new Date(c.verrouilleJusqua) > now)
    .forEach((c) => {
      const e = employeDe(c.employeId);
      alertes.push({ icon: 'lock_clock', tone: 'rose', titre: `Compte verrouillé — ${e.prenom} ${e.nom}`, detail: `Jusqu'à ${heureHM(c.verrouilleJusqua!)}`, lien: `${base}/employes/${e.id}` });
    });
  [...attente.conges, ...attente.regs].forEach((d) => {
    if (ecartJours(d.dateDemande.slice(0, 10), today) >= 2) {
      const e = employeDe(d.employeId);
      alertes.push({
        icon: 'hourglass_bottom',
        tone: 'rose',
        titre: `Demande en attente depuis ${ecartJours(d.dateDemande.slice(0, 10), today)} j`,
        detail: `${e.prenom} ${e.nom} • ${d.reference}`,
        lien: 'type' in d && d.type in LIBELLE_CONGE ? `${base}/conges` : `${base}/pointages`,
      });
    }
  });
  situation
    .filter((s) => s.statut === 'absent' && estOuvre(today))
    .forEach((s) =>
      alertes.push({ icon: 'person_off', tone: 'rose', titre: `Absence non justifiée — ${s.e.prenom} ${s.e.nom}`, detail: 'Aucun pointage ni congé aujourd’hui', lien: `${base}/employes/${s.e.id}` }),
    );

  const absencesAVenir = db.conges
    .filter((c) => c.statut === 'approuve' && c.fin >= today && c.debut <= ajouterJours(today, 30))
    .sort((a, b) => a.debut.localeCompare(b.debut))
    .slice(0, 5);
  const activite = [...db.audit].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const tauxPresence = attendus > 0 ? Math.min(100, Math.round((presents / attendus) * 100)) : 0;
  const ferieDuJour = jourFerie(params, today);

  return (
    <>
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-white tracking-tight">Tableau de bord RH</h1>
          <p className="text-sm text-slate-400 mt-0.5">{dateLongue(today)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-800/80 text-slate-300 border border-slate-700"
            title="Heure de référence utilisée pour tous les pointages"
          >
            <Icon name="dns" className="text-[14px] text-brand-400" />
            Heure {timeSource() === 'serveur' ? 'serveur' : 'locale'} <span className="font-mono text-white">{heureHMS(now)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Données en direct
          </span>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          droite={<KpiPastille tone="brand">{departements.size} départements</KpiPastille>}
          icon="groups"
          suffixe={`/ ${db.employes.length} dossiers`}
          titre="Effectif actif"
          valeur={actifs.length}
        />
        <KpiCard
          droite={<KpiPastille tone={tauxPresence >= 90 ? 'emerald' : 'amber'}>{ferieDuJour ? 'Férié' : estOuvre(today) ? `${tauxPresence}%` : 'Non ouvré'}</KpiPastille>}
          icon="how_to_reg"
          progression={tauxPresence}
          suffixe={`/ ${attendus} attendus`}
          titre="Présents aujourd'hui"
          valeur={presents}
        />
        <KpiCard
          droite={<KpiPastille tone="slate">Cumul mois : {retardsMois}</KpiPastille>}
          icon="schedule"
          iconClass="text-amber-400"
          titre="Retards du jour"
          valeur={retardsJour.length}
          valeurClass={retardsJour.length ? 'text-amber-300' : 'text-white'}
        />
        <KpiCard
          droite={
            <KpiPastille tone={totalAttente ? 'amber' : 'emerald'}>
              C {attente.conges.length} • R {attente.regs.length} • D {attente.docs.length}
            </KpiPastille>
          }
          icon="pending_actions"
          iconClass="text-amber-400"
          titre="Demandes à traiter"
          valeur={totalAttente}
          valeurClass={totalAttente ? 'text-amber-300' : 'text-white'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Pointages du jour */}
        <Card
          className="lg:col-span-8"
          droite={
            <Link className="text-xs font-medium text-brand-400 hover:text-brand-300" to={`${base}/pointages`}>
              Voir le registre complet →
            </Link>
          }
          flush
          icon="fingerprint"
          sousTitre={`${pointagesJour.length} pointage(s) • horodatage serveur • tolérance ${params.toleranceRetard} min après ${params.heureDebut}`}
          titre="Pointages du jour"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className={THEAD_ROW}>
                  <th className="py-3 px-5">Collaborateur</th>
                  <th className="py-3 px-4">Arrivée</th>
                  <th className="py-3 px-4">Retard</th>
                  <th className="py-3 px-4">Localisation</th>
                  <th className="py-3 px-4">Photo</th>
                  <th className="py-3 px-5 text-right">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {pointagesJour.slice(0, 8).map((p) => {
                  const e = employeDe(p.employeId);
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition-colors cursor-pointer" onClick={() => setDetail(p)}>
                      <td className="py-3 px-5">
                        <EmployeCell employe={e} lien={false} />
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-white">{heureHM(p.arrivee)}</td>
                      <td className="py-3 px-4">
                        {estEnRetard(p, params) ? (
                          <Badge tone={retardJustifie(db, p) ? 'amber' : 'rose'}>{p.retardMinutes} min</Badge>
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4" onClick={(ev) => ev.stopPropagation()}>
                        <GeoBadge geo={p.geo} />
                      </td>
                      <td className="py-3 px-4" onClick={(ev) => ev.stopPropagation()}>
                        <PhotoMiniature legende={`${e.prenom} ${e.nom} — ${heureHM(p.arrivee)}`} onOpen={setPhoto} src={p.photo} />
                      </td>
                      <td className="py-3 px-5 text-right">
                        <StatutJourBadge statut={p.depart ? 'parti' : p.pauseDebut ? 'en_pause' : 'present'} />
                      </td>
                    </tr>
                  );
                })}
                {pointagesJour.length === 0 && (
                  <tr>
                    <td className="py-8 px-5 text-center text-xs text-slate-500" colSpan={6}>
                      {estOuvre(today) ? "Aucun pointage pour l'instant." : 'Jour non ouvré : aucun pointage attendu.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Alertes automatiques */}
        <Card className="lg:col-span-4" icon="notifications_active" sousTitre="Générées par les règles de détection" titre="Alertes automatiques">
          <div className="flex flex-col gap-2.5 max-h-[380px] overflow-y-auto -mr-2 pr-2">
            {alertes.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <Icon name="verified" className="text-[18px]" />
                Aucune anomalie détectée.
              </div>
            )}
            {alertes.map((a, i) => (
              <Link key={i} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-start gap-3 hover:border-slate-700 transition-colors" to={a.lien}>
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 border ${
                    a.tone === 'rose'
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      : a.tone === 'amber'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-brand-500/10 text-brand-400 border-brand-500/20'
                  }`}
                >
                  <Icon name={a.icon} className="text-[16px]" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">{a.titre}</div>
                  <div className="text-xs text-slate-400 mt-0.5 truncate">{a.detail}</div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <Card className="lg:col-span-7" icon="bar_chart" sousTitre="Collaborateurs actifs pointés, par jour" titre="Présence des 7 derniers jours ouvrés">
          <PresenceChart effectif={actifs.length} jours={jours} />
        </Card>
        <Card className="lg:col-span-5" icon="insights" sousTitre="Retards détectés automatiquement (justifiés inclus)" titre={`Retards par département — ${moisLong(mois)}`}>
          <RetardsDepartementChart donnees={parDepartement} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card
          droite={
            <Link className="text-xs font-medium text-brand-400 hover:text-brand-300" to={`${base}/conges`}>
              Gérer les congés →
            </Link>
          }
          icon="beach_access"
          sousTitre="Congés validés sur les 30 prochains jours"
          titre="Absences planifiées"
        >
          <div className="flex flex-col gap-3">
            {absencesAVenir.length === 0 && <p className="text-xs text-slate-500">Aucune absence planifiée.</p>}
            {absencesAVenir.map((c) => {
              const e = employeDe(c.employeId);
              return (
                <div key={c.id} className="flex items-center justify-between gap-3">
                  <EmployeCell detail={LIBELLE_CONGE[c.type]} employe={e} />
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono text-slate-200">
                      {jourMois(c.debut)} → {dateCourte(c.fin)}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {c.debut <= today ? 'En cours' : `Dans ${ecartJours(today, c.debut)} j`} • {c.jours} j
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card
          droite={
            <Link className="text-xs font-medium text-brand-400 hover:text-brand-300" to={`${base}/audit`}>
              Journal complet →
            </Link>
          }
          icon="policy"
          sousTitre="Traçabilité des actions utilisateurs"
          titre="Activité récente"
        >
          <div className="flex flex-col gap-3">
            {activite.map((a) => {
              const meta = ACTIONS_AUDIT[a.action];
              return (
                <div key={a.id} className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Icon name={meta.icon} className="text-[16px] text-slate-400 mt-0.5" />
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
        </Card>
      </div>

      <PhotoLightbox onClose={() => setPhoto(null)} photo={photo} />
      <PointageDetailModal
        nom={detail ? `${employeDe(detail.employeId).prenom} ${employeDe(detail.employeId).nom}` : undefined}
        onClose={() => setDetail(null)}
        pointage={detail}
      />
    </>
  );
}

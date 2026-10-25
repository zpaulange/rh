import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EmployeCell from '../../components/rh/EmployeCell';
import Badge from '../../components/ui/Badge';
import Card, { LigneVide, THEAD_ROW } from '../../components/ui/Card';
import ActionMenu from '../../components/ui/ActionMenu';
import { messageErreur, useDialog } from '../../components/ui/Dialog';
import KpiCard, { KpiPastille } from '../../components/ui/KpiCard';
import PageHeader from '../../components/ui/PageHeader';
import SelectChip from '../../components/ui/SelectChip';
import TabFilter from '../../components/ui/TabFilter';
import TableFooter, { paginer } from '../../components/ui/TableFooter';
import { MOTIFS_PERMISSION } from '../../config/paie';
import { journaliserExport, relancerAbsence } from '../../db/api';
import { useEspaceRH } from '../../hooks/useEspaceRH';
import { absencesPeriode, type PeriodeAbsence } from '../../lib/absences';
import { exporterCSV } from '../../lib/export';
import { exporterRapportPDF } from '../../lib/pdfLazy';
import Icon from '../../components/ui/Icon';
import { sousContrat } from '../../lib/contrat';
import { estJourTravaille } from '../../lib/feries';
import { peut } from '../../lib/permissions';
import { LIBELLE_CONGE } from '../../lib/rules';
import { ajouterJours, dateCourte, dernierDuMois, moisDe, moisLong, nombre } from '../../lib/time';
import JustifierAbsenceModal from './modals/JustifierAbsenceModal';

type Periode = '7j' | '30j' | 'mois' | 'mois_precedent';
type Filtre = 'non_justifiees' | 'justifiees' | 'toutes';

const PAR_PAGE = 10;

export default function Absences() {
  const { user, db, now, today, base } = useEspaceRH();
  const navigate = useNavigate();
  const dialog = useDialog();
  const [periode, setPeriode] = useState<Periode>('30j');
  const [departement, setDepartement] = useState('tous');
  const [filtre, setFiltre] = useState<Filtre>('non_justifiees');
  const [page, setPage] = useState(0);
  const [aJustifier, setAJustifier] = useState<PeriodeAbsence | null>(null);

  const moisCourant = moisDe(today);
  const moisPrecedent = moisDe(ajouterJours(`${moisCourant}-01`, -1));
  const [debut, fin] = (
    {
      '7j': [ajouterJours(today, -6), today],
      '30j': [ajouterJours(today, -29), today],
      mois: [`${moisCourant}-01`, today],
      mois_precedent: [`${moisPrecedent}-01`, dernierDuMois(moisPrecedent)],
    } as Record<Periode, [string, string]>
  )[periode];

  const employes = useMemo(() => db.employes.filter((e) => departement === 'tous' || e.departement === departement), [db, departement]);
  const absences = useMemo(() => absencesPeriode(db, debut, fin, today, now, employes), [db, debut, fin, today, now, employes]);

  const nonJustifiees = absences.filter((a) => !a.justifiee);
  const justifiees = absences.filter((a) => a.justifiee);
  const joursNJ = nonJustifiees.reduce((s, a) => s + a.jours.length, 0);
  const joursJ = justifiees.reduce((s, a) => s + a.jours.length, 0);
  // Jours de travail attendus sur la période (depuis l'embauche et la mise en service du pointage)
  const joursAttendus = useMemo(() => {
    const borne = debut < db.parametres.dateDebutPointage ? db.parametres.dateDebutPointage : debut;
    let n = 0;
    for (const e of employes)
      for (let k = borne; k <= (fin < today ? fin : today); k = ajouterJours(k, 1)) if (sousContrat(e, k) && estJourTravaille(db.parametres, k)) n += 1;
    return n;
  }, [db, employes, debut, fin, today]);
  const taux = joursAttendus ? ((joursNJ + joursJ) / joursAttendus) * 100 : 0;
  const concernes = new Set(nonJustifiees.map((a) => a.employe.id)).size;

  const lignes = filtre === 'toutes' ? absences : filtre === 'justifiees' ? justifiees : nonJustifiees;
  const pagination = paginer(lignes, page, PAR_PAGE);
  const peutJustifier = peut(db, user, 'permissions.valider') || peut(db, user, 'conges.valider');

  const libelleMotif = (a: PeriodeAbsence) =>
    a.conge
      ? `${LIBELLE_CONGE[a.conge.type]}${a.conge.motifPermission ? ` — ${MOTIFS_PERMISSION[a.conge.motifPermission]?.libelle ?? ''}` : ''}`
      : 'Aucun pointage, aucune absence autorisée';

  const relancer = async (a: PeriodeAbsence) => {
    const ok = await dialog.confirm({
      titre: `Relancer ${a.employe.prenom} ${a.employe.nom} ?`,
      tone: 'info',
      icon: 'outgoing_mail',
      message: `Le collaborateur recevra une notification lui demandant de justifier ${a.jours.length > 1 ? `ses ${a.jours.length} jours d'absence` : "son absence"} (${a.jours.map(dateCourte).join(', ')}).`,
      confirmer: 'Envoyer la relance',
    });
    if (!ok) return;
    try {
      await relancerAbsence(user, a.employe.id, a.jours);
      await dialog.alert({ titre: 'Relance envoyée', tone: 'success', message: 'La relance est visible dans les notifications du collaborateur et tracée dans le journal d’audit.' });
    } catch (err) {
      await dialog.alert({ titre: 'Relance impossible', tone: 'danger', message: messageErreur(err) });
    }
  };

  const exporter = (format: 'CSV' | 'PDF') => {
    const colonnes = ['Matricule', 'Collaborateur', 'Département', 'Du', 'Au', 'Jours', 'Statut', 'Motif'];
    const data = lignes.map((a) => [
      a.employe.matricule,
      `${a.employe.prenom} ${a.employe.nom}`,
      a.employe.departement,
      dateCourte(a.debut),
      dateCourte(a.fin),
      String(a.jours.length),
      a.justifiee ? 'Justifiée' : 'Non justifiée',
      libelleMotif(a),
    ]);
    const titre = `Absences du ${dateCourte(debut)} au ${dateCourte(fin < today ? fin : today)}`;
    if (format === 'CSV') exporterCSV(`absences_${debut}_${fin}.csv`, colonnes, data);
    else exporterRapportPDF(titre, `${departement === 'tous' ? 'Tous les départements' : departement} • taux d'absentéisme ${nombre(Math.round(taux * 10) / 10)} %`, colonnes, data, `absences_${debut}_${fin}.pdf`, `${user.prenom} ${user.nom}`);
    void journaliserExport(user, 'Absences', format, data.length).catch(() => undefined);
  };

  return (
    <>
      <PageHeader subtitle="Absences justifiées et non justifiées, issues du registre de pointage et des absences validées" title="Absences">
        <SelectChip
          ariaLabel="Période"
          icon="date_range"
          onChange={(v) => {
            setPeriode(v);
            setPage(0);
          }}
          options={[
            { value: '7j', label: '7 derniers jours' },
            { value: '30j', label: '30 derniers jours' },
            { value: 'mois', label: moisLong(moisCourant) },
            { value: 'mois_precedent', label: moisLong(moisPrecedent) },
          ]}
          value={periode}
        />
        <SelectChip
          ariaLabel="Département"
          icon="apartment"
          onChange={(v) => {
            setDepartement(v);
            setPage(0);
          }}
          options={[{ value: 'tous', label: 'Tous les départements' }, ...db.departements.map((d) => ({ value: d.nom, label: d.nom }))]}
          value={departement}
        />
        <div className="flex gap-2">
          <button className="h-9 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5" onClick={() => exporter('CSV')} type="button">
            <Icon className="text-[15px]" name="table_view" />
            CSV
          </button>
          <button className="h-9 px-3 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-1.5" onClick={() => exporter('PDF')} type="button">
            <Icon className="text-[15px]" name="picture_as_pdf" />
            PDF
          </button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          droite={<KpiPastille tone={joursNJ ? 'rose' : 'emerald'}>{joursNJ ? 'À régulariser' : 'Aucune'}</KpiPastille>}
          icon="person_off"
          iconClass="text-rose-400"
          suffixe="j"
          titre="Absences non justifiées"
          valeur={joursNJ}
          valeurClass={joursNJ ? 'text-rose-300' : 'text-white'}
        />
        <KpiCard droite={<KpiPastille tone="slate">{concernes} collaborateur(s)</KpiPastille>} icon="group_off" titre="Concernés (non justifiées)" valeur={concernes} />
        <KpiCard droite={<KpiPastille tone="emerald">Validées</KpiPastille>} icon="fact_check" iconClass="text-emerald-400" suffixe="j" titre="Absences justifiées" valeur={joursJ} />
        <KpiCard
          droite={<KpiPastille tone={taux > 5 ? 'amber' : 'brand'}>{nombre(joursAttendus)} j attendus</KpiPastille>}
          icon="percent"
          suffixe="%"
          titre="Taux d'absentéisme"
          valeur={nombre(Math.round(taux * 10) / 10)}
        />
      </div>

      <Card
        droite={
          <TabFilter
            onChange={(v) => {
              setFiltre(v);
              setPage(0);
            }}
            options={[
              { value: 'non_justifiees', label: `Non justifiées (${nonJustifiees.length})` },
              { value: 'justifiees', label: `Justifiées (${justifiees.length})` },
              { value: 'toutes', label: 'Toutes' },
            ]}
            value={filtre}
          />
        }
        flush
        icon="event_busy"
        sousTitre={`Du ${dateCourte(debut)} au ${dateCourte(fin < today ? fin : today)} • jours travaillés uniquement (hors week-ends et jours fériés)`}
        titre="Registre des absences"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                <th className="py-3 px-5">Collaborateur</th>
                <th className="py-3 px-4">Période</th>
                <th className="py-3 px-4">Jours</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4">Motif</th>
                <th className="py-3 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {pagination.lignes.map((a) => (
                <tr key={`${a.employe.id}-${a.debut}-${a.justifiee}`} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-5">
                    <EmployeCell employe={a.employe} />
                  </td>
                  <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">
                    {dateCourte(a.debut)}
                    {a.fin !== a.debut && ` — ${dateCourte(a.fin)}`}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs">{a.jours.length} j</td>
                  <td className="py-3 px-4">
                    {a.justifiee ? (
                      <Badge icon="task_alt" tone="emerald">
                        Justifiée
                      </Badge>
                    ) : (
                      <Badge icon="person_off" tone="rose">
                        Non justifiée
                      </Badge>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-400 max-w-[280px]">
                    <span className="line-clamp-2">{libelleMotif(a)}</span>
                    {a.conge?.commentaireRH === 'Absence justifiée a posteriori' && <span className="text-[11px] text-emerald-400/80">Justifiée a posteriori par {a.conge.traitePar}</span>}
                  </td>
                  <td className="py-3 px-5 text-right">
                    <ActionMenu
                      ariaLabel={`Actions pour l'absence de ${a.employe.prenom} ${a.employe.nom}`}
                      items={
                        a.justifiee
                          ? [
                              { label: 'Voir les congés', icone: 'event_note', onSelect: () => navigate(`${base}/conges`) },
                              { label: 'Voir la fiche', icone: 'badge', onSelect: () => navigate(`${base}/employes/${a.employe.id}`) },
                            ]
                          : [
                              {
                                label: 'Justifier l’absence',
                                icone: 'fact_check',
                                tone: 'succes' as const,
                                onSelect: () => setAJustifier(a),
                                disabled: !peutJustifier,
                                description: peutJustifier ? 'Permission, maladie, congé ou sans solde' : 'Droit de validation des congés requis',
                              },
                              { label: 'Relancer le collaborateur', icone: 'outgoing_mail', onSelect: () => void relancer(a), description: 'Notification de demande de justificatif' },
                              { separateur: true as const },
                              { label: 'Voir la fiche', icone: 'badge', onSelect: () => navigate(`${base}/employes/${a.employe.id}`) },
                            ]
                      }
                      titre={`${a.employe.prenom} ${a.employe.nom}`}
                    />
                  </td>
                </tr>
              ))}
              {lignes.length === 0 && (
                <LigneVide colSpan={6}>{filtre === 'non_justifiees' ? 'Aucune absence non justifiée sur la période.' : 'Aucune absence sur la période.'}</LigneVide>
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
          {lignes.length ? `${pagination.premier}–${pagination.dernier} sur ${lignes.length} période(s) d'absence` : '0 absence'}
        </TableFooter>
      </Card>

      <JustifierAbsenceModal
        absence={aJustifier}
        onClose={() => setAJustifier(null)}
        onJustifiee={(c) => {
          setAJustifier(null);
          void dialog.alert({
            titre: 'Absence justifiée',
            tone: 'success',
            icon: 'fact_check',
            message: `${LIBELLE_CONGE[c.type]} enregistrée et validée (${c.jours} j). Le collaborateur est notifié et la paie du mois en tiendra compte.`,
            details: <span className="font-mono">Référence : {c.reference}</span>,
          });
        }}
      />
    </>
  );
}

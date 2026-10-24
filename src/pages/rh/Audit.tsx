import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Badge from '../../components/ui/Badge';
import Card, { THEAD_ROW } from '../../components/ui/Card';
import { SearchInput } from '../../components/form';
import Icon from '../../components/ui/Icon';
import KpiCard, { KpiPastille } from '../../components/ui/KpiCard';
import PageHeader from '../../components/ui/PageHeader';
import SelectChip from '../../components/ui/SelectChip';
import TableFooter, { paginer } from '../../components/ui/TableFooter';
import { journaliserExport } from '../../db/actions';
import { useEspaceRH } from '../../hooks/useEspaceRH';
import { ACTIONS_AUDIT, LIBELLE_ROLE } from '../../lib/audit';
import { exporterCSV } from '../../lib/export';
import { exporterRapportPDF } from '../../lib/pdfLazy';
import { ajouterJours, dateCourte, dateKey, heureHMS } from '../../lib/time';
import type { ActionAudit } from '../../types';

type Periode = '1' | '7' | '30' | 'tout';
type Famille = 'toutes' | 'securite' | 'pointage' | 'demandes' | 'donnees' | 'documents' | 'paie';

const FAMILLES: Record<Exclude<Famille, 'toutes'>, ActionAudit[]> = {
  securite: ['CONNEXION', 'DECONNEXION', 'ECHEC_CONNEXION', 'COMPTE_VERROUILLE', 'SESSION_EXPIREE', 'ACTIVATION_COMPTE', 'DESACTIVATION_COMPTE', 'DEVERROUILLAGE_COMPTE', 'REINITIALISATION_MOT_DE_PASSE'],
  pointage: ['POINTAGE_ARRIVEE', 'POINTAGE_DEPART', 'POINTAGE_PAUSE', 'RETARD_DETECTE', 'POINTAGE_HORS_ZONE'],
  demandes: ['DEMANDE_CONGE', 'VALIDATION_CONGE', 'REFUS_CONGE', 'DEMANDE_REGULARISATION', 'VALIDATION_REGULARISATION', 'REFUS_REGULARISATION', 'DEMANDE_DOCUMENT'],
  donnees: ['CONSULTATION_DONNEES_SENSIBLES', 'MODIFICATION_PROFIL', 'CREATION_EMPLOYE', 'MODIFICATION_EMPLOYE', 'MODIFICATION_PARAMETRES', 'EXPORT_RAPPORT'],
  documents: ['GENERATION_DOCUMENT', 'REFUS_DOCUMENT', 'TELECHARGEMENT_DOCUMENT', 'VERIFICATION_DOCUMENT'],
  paie: ['EVOLUTION_CARRIERE', 'APPLICATION_EVOLUTION', 'PREPARATION_PAIE', 'MODIFICATION_PAIE', 'VALIDATION_PAIE', 'REOUVERTURE_PAIE', 'PAIEMENT_SALAIRES'],
};

const PAR_PAGE = 15;

export default function Audit() {
  const { user, db, today, base } = useEspaceRH();
  const [recherche, setRecherche] = useState('');
  const [famille, setFamille] = useState<Famille>('toutes');
  const [role, setRole] = useState('tous');
  const [periode, setPeriode] = useState<Periode>('7');
  const [page, setPage] = useState(0);

  const entrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const depuis = periode === 'tout' ? '' : ajouterJours(today, -(Number(periode) - 1));
    return [...db.audit]
      .filter((a) => !depuis || dateKey(new Date(a.date)) >= depuis)
      .filter((a) => famille === 'toutes' || FAMILLES[famille].includes(a.action))
      .filter((a) => role === 'tous' || a.acteurRole === role)
      .filter((a) => !q || [a.acteur, a.cible, a.details, ACTIONS_AUDIT[a.action].label].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [db, recherche, famille, role, periode, today]);
  const pagination = paginer(entrees, page, PAR_PAGE);

  const duJour = db.audit.filter((a) => dateKey(new Date(a.date)) === today);
  const echecs = duJour.filter((a) => a.action === 'ECHEC_CONNEXION' || a.action === 'COMPTE_VERROUILLE').length;
  const sensibles = db.audit.filter((a) => a.action === 'CONSULTATION_DONNEES_SENSIBLES' && dateKey(new Date(a.date)) >= ajouterJours(today, -6)).length;
  const connexions = duJour.filter((a) => a.action === 'CONNEXION').length;

  const reinit = () => setPage(0);

  const exporter = (format: 'CSV' | 'PDF') => {
    const colonnes = ['Date', 'Heure', 'Acteur', 'Rôle', 'Action', 'Cible', 'Détails'];
    const data = entrees.map((a) => [dateCourte(dateKey(new Date(a.date))), heureHMS(new Date(a.date)), a.acteur, LIBELLE_ROLE[a.acteurRole], ACTIONS_AUDIT[a.action].label, a.cible, a.details]);
    if (format === 'CSV') exporterCSV(`journal_audit_${today}.csv`, colonnes, data);
    else exporterRapportPDF("Journal d'audit", `${data.length} événement(s) • export du ${dateCourte(today)}`, colonnes, data, `journal_audit_${today}.pdf`, `${user.prenom} ${user.nom}`);
    journaliserExport(user, "Journal d'audit", format, data.length);
  };

  const reglage = <T extends string>(set: (v: T) => void) => (v: T) => {
    set(v);
    reinit();
  };

  return (
    <>
      <PageHeader subtitle="Historique et traçabilité de toutes les actions des utilisateurs et du système" title="Journal d'audit">
        <SelectChip
          ariaLabel="Période"
          icon="calendar_month"
          onChange={reglage<Periode>(setPeriode)}
          options={[
            { value: '1', label: "Aujourd'hui" },
            { value: '7', label: '7 derniers jours' },
            { value: '30', label: '30 derniers jours' },
            { value: 'tout', label: 'Tout l’historique' },
          ]}
          value={periode}
        />
        <SelectChip
          ariaLabel="Famille d'actions"
          icon="category"
          onChange={reglage<Famille>(setFamille)}
          options={[
            { value: 'toutes', label: 'Toutes les actions' },
            { value: 'securite', label: 'Sécurité & accès' },
            { value: 'pointage', label: 'Pointages' },
            { value: 'demandes', label: 'Demandes' },
            { value: 'donnees', label: 'Données du personnel' },
            { value: 'documents', label: 'Documents' },
            { value: 'paie', label: 'Carrière & paie' },
          ]}
          value={famille}
        />
        <SelectChip
          ariaLabel="Rôle"
          icon="badge"
          onChange={reglage<string>(setRole)}
          options={[
            { value: 'tous', label: 'Tous' },
            { value: 'employe', label: 'Employés' },
            { value: 'rh', label: 'RH' },
            { value: 'admin', label: 'Admin' },
            { value: 'systeme', label: 'Système' },
          ]}
          prefixe="Acteur:"
          value={role}
        />
        <button className="h-9 px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-2" onClick={() => exporter('CSV')} type="button">
          <Icon name="table_view" className="text-[16px]" />
          CSV
        </button>
        <button className="h-9 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-2 shadow-sm" onClick={() => exporter('PDF')} type="button">
          <Icon name="picture_as_pdf" className="text-[16px]" />
          PDF
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard droite={<KpiPastille tone="slate">Aujourd'hui</KpiPastille>} icon="receipt_long" titre="Événements" valeur={duJour.length} />
        <KpiCard droite={<KpiPastille tone="brand">Aujourd'hui</KpiPastille>} icon="login" titre="Connexions réussies" valeur={connexions} />
        <KpiCard
          droite={<KpiPastille tone={echecs ? 'rose' : 'emerald'}>{echecs ? 'À surveiller' : 'RAS'}</KpiPastille>}
          icon="gpp_maybe"
          iconClass="text-rose-400"
          titre="Échecs / verrouillages"
          valeur={echecs}
          valeurClass={echecs ? 'text-rose-300' : 'text-white'}
        />
        <KpiCard droite={<KpiPastille tone="amber">7 jours</KpiPastille>} icon="visibility" iconClass="text-amber-400" titre="Accès données sensibles" valeur={sensibles} />
      </div>

      <Card
        droite={
          <SearchInput
              className="w-full sm:w-72"
              onChange={(v) => {
                setRecherche(v);
                reinit();
              }}
              placeholder="Acteur, cible, détail…"
              value={recherche}
            />
        }
        flush
        icon="policy"
        sousTitre="Horodatage serveur • journal en ajout seul (aucune suppression possible depuis l'interface)"
        titre="Événements"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                <th className="py-3 px-5">Date & heure</th>
                <th className="py-3 px-4">Acteur</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Cible</th>
                <th className="py-3 px-5">Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {pagination.lignes.map((a) => {
                const meta = ACTIONS_AUDIT[a.action];
                return (
                  <tr key={a.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-5 font-mono text-xs text-slate-300 whitespace-nowrap">
                      {dateCourte(dateKey(new Date(a.date)))} <span className="text-slate-500">{heureHMS(new Date(a.date))}</span>
                    </td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      <span className="text-slate-200 font-medium">{a.acteur}</span>
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-500">{LIBELLE_ROLE[a.acteurRole]}</span>
                    </td>
                    <td className="py-3 px-4">
                      <Badge icon={meta.icon} tone={meta.tone}>
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-300 whitespace-nowrap">
                      {a.employeId ? (
                        <Link className="hover:text-white" to={`${base}/employes/${a.employeId}`}>
                          {a.cible}
                        </Link>
                      ) : (
                        a.cible
                      )}
                    </td>
                    <td className="py-3 px-5 text-xs text-slate-400 max-w-md">{a.details}</td>
                  </tr>
                );
              })}
              {entrees.length === 0 && (
                <tr>
                  <td className="py-8 px-5 text-center text-xs text-slate-500" colSpan={5}>
                    Aucun événement pour ces critères.
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
          {entrees.length ? `${pagination.premier}–${pagination.dernier} sur ${entrees.length} événement(s)` : '0 événement'}
        </TableFooter>
      </Card>
    </>
  );
}

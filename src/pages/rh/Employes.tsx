import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchInput } from '../../components/form';
import EmployeCell from '../../components/rh/EmployeCell';
import StatutJourBadge from '../../components/rh/StatutJourBadge';
import Badge from '../../components/ui/Badge';
import { THEAD_ROW } from '../../components/ui/Card';
import Icon from '../../components/ui/Icon';
import KpiCard, { KpiPastille } from '../../components/ui/KpiCard';
import ActionMenu from '../../components/ui/ActionMenu';
import PageHeader from '../../components/ui/PageHeader';
import SelectChip from '../../components/ui/SelectChip';
import TableFooter, { paginer } from '../../components/ui/TableFooter';
import { creerEmploye, journaliserExport, modifierEmploye, motifsBlocageSuppression, supprimerEmploye } from '../../db/actions';
import MotifModal from '../../components/ui/MotifModal';
import { peut } from '../../lib/permissions';
import { useDialog } from '../../components/ui/Dialog';
import { useActionsCompte } from '../../hooks/useActionsCompte';
import { useEspaceRH } from '../../hooks/useEspaceRH';
import { exporterCSV } from '../../lib/export';
import { calculerDroits, statutJour } from '../../lib/rules';
import { dateCourte, moisComplets, nombre } from '../../lib/time';
import type { Employe } from '../../types';
import EmployeFormModal from './modals/EmployeFormModal';
import GenererDocumentModal from './modals/GenererDocumentModal';
import EvolutionModal from './modals/EvolutionModal';
import SortieModal from './modals/SortieModal';
import { fcfa } from '../../lib/paie';

const PAR_PAGE = 10;

const anciennete = (embauche: string, today: string) => {
  const mois = moisComplets(embauche, today);
  if (mois < 12) return `${mois} mois`;
  const ans = Math.floor(mois / 12);
  return `${ans} an${ans > 1 ? 's' : ''}${mois % 12 ? ` ${mois % 12} m` : ''}`;
};

export default function Employes() {
  const { user, db, now, today, base } = useEspaceRH();
  const navigate = useNavigate();
  const [recherche, setRecherche] = useState('');
  const [departement, setDepartement] = useState('tous');
  const [statutCompte, setStatutCompte] = useState<'tous' | 'actif' | 'inactif' | 'sortis'>('tous');
  const [page, setPage] = useState(0);
  const [creation, setCreation] = useState(false);
  const [edition, setEdition] = useState<Employe | null>(null);
  const [generation, setGeneration] = useState<Employe | null>(null);
  const [evolution, setEvolution] = useState<Employe | null>(null);
  const [suppression, setSuppression] = useState<Employe | null>(null);
  const [sortie, setSortie] = useState<Employe | null>(null);
  const dialog = useDialog();
  const droitDocuments = peut(db, user, 'documents.gerer');
  const droitComptes = peut(db, user, 'comptes.gerer');
  const droitSuppression = peut(db, user, 'collaborateurs.supprimer');
  // Un RH n'agit pas sur les comptes RH ou administrateur
  const compteProtege = (role: string) => role !== 'employe' && user.role !== 'admin';
  const raisonCompte = (role: string, soi: boolean) =>
    soi ? 'Impossible sur votre propre compte' : !droitComptes ? 'Droit « Comptes utilisateurs » requis' : compteProtege(role) ? 'Réservé à l’administrateur (compte RH ou admin)' : undefined;
  const { basculerAcces, deverrouiller, reinitialiser, afficherIdentifiants } = useActionsCompte();

  const departements = useMemo(() => db.departements.map((d) => d.nom).sort((a, b) => a.localeCompare(b)), [db]);

  const lignes = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return db.employes
      .map((e) => {
        const compte = db.comptes.find((c) => c.employeId === e.id);
        return { e, compte, droits: calculerDroits(db, e, today), statut: statutJour(db, e.id, today, today, now) };
      })
      .filter(({ e, compte }) => {
        if (departement !== 'tous' && e.departement !== departement) return false;
        if (statutCompte === 'actif' && !compte?.actif) return false;
        if (statutCompte === 'inactif' && compte?.actif) return false;
        if (statutCompte === 'sortis' && !e.dateSortie) return false;
        if (!q) return true;
        return [e.prenom, e.nom, e.matricule, e.poste, e.departement, e.service, e.emailPro].some((v) => v.toLowerCase().includes(q));
      })
      .sort((a, b) => a.e.nom.localeCompare(b.e.nom));
  }, [db, recherche, departement, statutCompte, today, now]);
  const pagination = paginer(lignes, page, PAR_PAGE);

  const actifs = db.comptes.filter((c) => c.actif).length;
  const cdi = db.employes.filter((e) => e.contrat === 'CDI').length;
  const verrouilles = db.comptes.filter((c) => c.verrouilleJusqua && new Date(c.verrouilleJusqua) > now).length;
  const masseSalariale = db.employes.reduce((s, e) => s + e.salaireBase, 0);

  const exporter = () => {
    const colonnes = ['Matricule', 'Civilité', 'Prénom', 'Nom', 'Poste', 'Département', 'Service', 'Contrat', "Date d'embauche", 'Email pro', 'Téléphone pro', 'Solde CP (j)', 'Statut accès'];
    const data = lignes.map(({ e, compte, droits }) => [
      e.matricule,
      e.civilite,
      e.prenom,
      e.nom,
      e.poste,
      e.departement,
      e.service || '—',
      e.contrat,
      dateCourte(e.dateEmbauche),
      e.emailPro,
      e.telPro,
      nombre(droits.cp.restant),
      compte?.actif ? 'Actif' : 'Désactivé',
    ]);
    exporterCSV(`effectif_${today}.csv`, colonnes, data);
    journaliserExport(user, 'Liste des collaborateurs', 'CSV', data.length);
  };

  return (
    <>
      <PageHeader subtitle="Dossiers du personnel, droits et accès" title="Collaborateurs">
        <SelectChip
          ariaLabel="Département"
          icon="apartment"
          onChange={(d) => {
            setDepartement(d);
            setPage(0);
          }}
          options={[{ value: 'tous', label: 'Tous les départements' }, ...departements.map((d) => ({ value: d, label: d }))]}
          value={departement}
        />
        <SelectChip
          ariaLabel="Statut du compte"
          icon="filter_list"
          onChange={(s) => {
            setStatutCompte(s);
            setPage(0);
          }}
          options={[
            { value: 'tous', label: 'Tous' },
            { value: 'actif', label: 'Actifs' },
            { value: 'inactif', label: 'Désactivés' },
            { value: 'sortis', label: 'Sorties' },
          ]}
          prefixe="Accès:"
          value={statutCompte}
        />
        <button
          className="h-9 px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-2 transition-colors"
          onClick={exporter}
          type="button"
        >
          <Icon name="file_download" className="text-[16px]" />
          <span>Exporter</span>
        </button>
        <button
          className="h-9 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-2 shadow-sm transition-colors"
          onClick={() => setCreation(true)}
          type="button"
        >
          <Icon name="person_add" className="text-[16px]" />
          <span>Ajouter un collaborateur</span>
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard droite={<KpiPastille>{actifs} accès actifs</KpiPastille>} icon="groups" suffixe="dossiers" titre="Effectif total" valeur={db.employes.length} />
        <KpiCard
          droite={<KpiPastille tone="brand">{db.employes.length ? Math.round((cdi / db.employes.length) * 100) : 0}% CDI</KpiPastille>}
          icon="work"
          suffixe={`CDI • ${db.employes.length - cdi} autres`}
          titre="Contrats"
          valeur={cdi}
        />
        <KpiCard droite={<KpiPastille tone="slate">Départements</KpiPastille>} icon="apartment" titre="Organisation" valeur={departements.length} />
        <KpiCard
          droite={<KpiPastille tone={verrouilles ? 'rose' : 'emerald'}>{verrouilles ? `${verrouilles} verrouillé(s)` : 'Aucun incident'}</KpiPastille>}
          icon="shield_lock"
          suffixe="FCFA / mois"
          titre="Masse salariale (base)"
          valeur={<span className="text-xl">{new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(masseSalariale)}</span>}
        />
      </div>

      <div className="bg-[#182234] rounded-xl border border-slate-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="badge" className="text-[18px] text-brand-400" />
            <h2 className="font-display text-sm font-semibold text-white">Registre du personnel</h2>
          </div>
          <SearchInput
            className="w-full sm:w-72"
            onChange={(v) => {
              setRecherche(v);
              setPage(0);
            }}
            placeholder="Nom, matricule, poste, email…"
            value={recherche}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                <th className="py-3 px-5">Collaborateur</th>
                <th className="py-3 px-4">Poste</th>
                <th className="py-3 px-4">Contrat</th>
                <th className="py-3 px-4">Ancienneté</th>
                <th className="py-3 px-4">Solde CP</th>
                <th className="py-3 px-4">Aujourd'hui</th>
                <th className="py-3 px-4">Accès</th>
                <th className="py-3 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {pagination.lignes.map(({ e, compte, droits, statut }) => (
                <tr key={e.id} className="hover:bg-slate-800/40 transition-colors cursor-pointer" onClick={() => navigate(`${base}/employes/${e.id}`)}>
                  <td className="py-3 px-5">
                    <EmployeCell employe={e} lien={false} />
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-300">{e.poste}</td>
                  <td className="py-3 px-4">
                    <Badge tone={e.contrat === 'CDI' ? 'slate' : 'amber'}>{e.contrat}</Badge>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-300">{anciennete(e.dateEmbauche, today)}</td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-200 whitespace-nowrap">
                    {nombre(droits.cp.restant)} j <span className="text-slate-500">/ {nombre(droits.cp.acquis)}</span>
                  </td>
                  <td className="py-3 px-4">
                    <StatutJourBadge statut={statut} />
                  </td>
                  <td className="py-3 px-4">
                    {e.dateSortie ? (
                      e.dateSortie < today ? (
                        <Badge icon="logout" tone="slate">
                          Sorti le {dateCourte(e.dateSortie)}
                        </Badge>
                      ) : (
                        <Badge icon="schedule" tone="amber">
                          Départ le {dateCourte(e.dateSortie)}
                        </Badge>
                      )
                    ) : !compte ? (
                      <Badge tone="slate">Aucun</Badge>
                    ) : !compte.actif ? (
                      <Badge icon="lock" tone="rose">Désactivé</Badge>
                    ) : compte.verrouilleJusqua && new Date(compte.verrouilleJusqua) > now ? (
                      <Badge icon="lock_clock" tone="amber">Verrouillé</Badge>
                    ) : (
                      <Badge tone="emerald">{compte.role === 'rh' ? 'Actif • RH' : compte.role === 'admin' ? 'Actif • Admin' : 'Actif'}</Badge>
                    )}
                  </td>
                  <td className="py-3 px-5 text-right">
                    <ActionMenu
                      ariaLabel={`Actions pour ${e.prenom} ${e.nom}`}
                      items={[
                        { label: 'Voir la fiche', icone: 'badge', onSelect: () => navigate(`${base}/employes/${e.id}`) },
                        { label: 'Modifier le dossier', icone: 'edit', onSelect: () => setEdition(e) },
                        { label: 'Promotion / augmentation', icone: 'trending_up', onSelect: () => setEvolution(e), description: 'Nouvelle évolution de carrière datée' },
                        {
                          label: 'Générer un document',
                          icone: 'picture_as_pdf',
                          onSelect: () => setGeneration(e),
                          disabled: !droitDocuments,
                          description: droitDocuments ? undefined : 'Droit « Documents administratifs » requis',
                        },
                        { label: 'Voir les pointages', icone: 'history', onSelect: () => navigate(`${base}/employes/${e.id}#pointages`) },
                        { separateur: true },
                        ...(compte
                          ? [
                              ...(compte.verrouilleJusqua && new Date(compte.verrouilleJusqua) > now
                                ? [
                                    {
                                      label: 'Déverrouiller le compte',
                                      icone: 'lock_open',
                                      tone: 'succes' as const,
                                      onSelect: () => void deverrouiller(e, compte),
                                      disabled: Boolean(raisonCompte(compte.role, false)),
                                      description: raisonCompte(compte.role, false),
                                    },
                                  ]
                                : []),
                              {
                                label: 'Réinitialiser le mot de passe',
                                icone: 'password',
                                onSelect: () => void reinitialiser(e),
                                disabled: Boolean(raisonCompte(compte.role, compte.id === user.compteId)),
                                description: raisonCompte(compte.role, compte.id === user.compteId),
                              },
                              {
                                label: compte.actif ? "Désactiver l'accès" : "Réactiver l'accès",
                                icone: compte.actif ? 'lock' : 'lock_open',
                                tone: compte.actif ? ('danger' as const) : ('succes' as const),
                                onSelect: () => void basculerAcces(e, compte),
                                disabled: Boolean(raisonCompte(compte.role, compte.id === user.compteId)),
                                description: raisonCompte(compte.role, compte.id === user.compteId),
                              },
                            ]
                          : []),
                        ...(!e.dateSortie && e.id !== user.employeId && (!compte || compte.role === 'employe' || user.role === 'admin')
                          ? [{ label: 'Enregistrer une sortie', icone: 'logout', tone: 'danger' as const, onSelect: () => setSortie(e), description: 'Démission, licenciement, fin de CDD, retraite…' }]
                          : []),
                        ...(user.role === 'admin'
                          ? [{ label: 'Gérer le rôle', icone: 'admin_panel_settings', onSelect: () => navigate(`/admin/utilisateurs?employe=${e.id}`) }]
                          : []),
                        ...(droitSuppression
                          ? (() => {
                              const blocages = motifsBlocageSuppression(db, e.id);
                              const soi = e.id === user.employeId;
                              return [
                                { separateur: true as const },
                                {
                                  label: 'Supprimer le dossier',
                                  icone: 'person_remove',
                                  tone: 'danger' as const,
                                  onSelect: () => setSuppression(e),
                                  disabled: soi || blocages.length > 0,
                                  description: soi ? 'Impossible sur votre propre dossier' : blocages.length ? 'Historique à conserver : désactivez l’accès' : 'Dossier sans historique (erreur de saisie)',
                                },
                              ];
                            })()
                          : []),
                      ]}
                      titre={`${e.prenom} ${e.nom}`}
                    />
                  </td>
                </tr>
              ))}
              {lignes.length === 0 && (
                <tr>
                  <td className="py-8 px-5 text-center text-xs text-slate-500" colSpan={8}>
                    Aucun collaborateur ne correspond à la recherche.
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
          {lignes.length ? `${pagination.premier}–${pagination.dernier} sur ${lignes.length} collaborateur(s)` : '0 collaborateur'}
        </TableFooter>
      </div>

      <EmployeFormModal
        onClose={() => setCreation(false)}
        onSave={(data, role) => {
          const { employe, motDePasse } = creerEmploye(user, data, role);
          setCreation(false);
          void afficherIdentifiants('Collaborateur créé', employe, employe.emailPro, motDePasse);
        }}
        open={creation}
      />
      <EmployeFormModal
        employe={edition ?? undefined}
        onClose={() => setEdition(null)}
        onSave={(data) => {
          if (!edition) return;
          modifierEmploye(user, edition.id, data);
          setEdition(null);
          void dialog.alert({ titre: 'Dossier mis à jour', tone: 'success', message: `Les modifications du dossier de ${data.prenom} ${data.nom} sont enregistrées et tracées dans le journal d'audit.` });
        }}
        open={edition !== null}
      />
      {evolution && (
        <EvolutionModal
          employe={evolution}
          onClose={() => setEvolution(null)}
          onEnregistree={(ev) =>
            void dialog.alert({
              titre: ev.statut === 'appliquee' ? 'Évolution appliquée' : 'Évolution planifiée',
              tone: 'success',
              icon: 'trending_up',
              message:
                ev.statut === 'appliquee'
                  ? `Nouvelle situation en vigueur : ${ev.apres.poste}, ${fcfa(ev.apres.salaireBase)}.`
                  : `Elle s'appliquera automatiquement le ${dateCourte(ev.dateEffet)}.`,
              details: "L'avenant au contrat a été généré et le collaborateur a été notifié.",
            })
          }
          open
        />
      )}
      <SortieModal
        employe={sortie}
        onClose={() => setSortie(null)}
        onEnregistree={(so) => {
          const nom = sortie ? `${sortie.prenom} ${sortie.nom}` : '';
          setSortie(null);
          void dialog.alert({
            titre: 'Sortie enregistrée',
            tone: 'success',
            icon: 'logout',
            message: so.statut === 'effective' ? `La sortie de ${nom} est effective : accès désactivé, certificat de travail généré.` : `Départ de ${nom} planifié au ${dateCourte(so.dateSortie)}.`,
            details: `Indemnités : ${fcfa(so.rubriques.reduce((t, r) => t + r.montant, 0))}, versées avec la dernière paie.`,
          });
        }}
      />
      <MotifModal
        confirmer="Supprimer définitivement"
        icone="person_remove"
        labelMotif="Motif de la suppression"
        onClose={() => setSuppression(null)}
        onConfirm={(motif) => {
          if (!suppression) return;
          supprimerEmploye(user, suppression.id, motif);
          const nom = `${suppression.prenom} ${suppression.nom}`;
          setSuppression(null);
          void dialog.alert({ titre: 'Dossier supprimé', tone: 'success', message: `Le dossier et le compte de ${nom} ont été supprimés. L'opération reste tracée dans le journal d'audit.` });
        }}
        open={suppression !== null}
        resume={
          suppression && (
            <>
              Vous allez supprimer définitivement le dossier de <strong className="text-white">{suppression.prenom} {suppression.nom}</strong> ({suppression.matricule}) et son compte
              d'accès. Cette suppression est réservée aux dossiers créés par erreur : aucun pointage, paie, document ni absence validée n'y est rattaché.
            </>
          )
        }
        titre="Supprimer le dossier ?"
        tone="danger"
      />
      <GenererDocumentModal
        employeId={generation?.id}
        onClose={() => setGeneration(null)}
        onGenere={(d) => void dialog.alert({ titre: 'Document généré', tone: 'success', icon: 'picture_as_pdf', message: `${d.titre} a été téléchargé et ajouté au coffre du collaborateur.`, details: <span className="font-mono">Code de vérification : {d.code}</span> })}
        open={generation !== null}
      />
    </>
  );
}

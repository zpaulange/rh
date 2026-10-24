import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Field, SearchInput, Select } from '../../components/form';
import EmployeCell from '../../components/rh/EmployeCell';
import ActionMenu from '../../components/ui/ActionMenu';
import Badge, { type Tone } from '../../components/ui/Badge';
import Card, { LigneVide, THEAD_ROW } from '../../components/ui/Card';
import { messageErreur, useDialog } from '../../components/ui/Dialog';
import Icon from '../../components/ui/Icon';
import KpiCard, { KpiPastille } from '../../components/ui/KpiCard';
import MotifModal from '../../components/ui/MotifModal';
import PageHeader from '../../components/ui/PageHeader';
import SelectChip from '../../components/ui/SelectChip';
import TabFilter from '../../components/ui/TabFilter';
import TableFooter, { paginer } from '../../components/ui/TableFooter';
import { changerRole, modifierPermissions } from '../../db/actions';
import { useActionsCompte } from '../../hooks/useActionsCompte';
import { useEspaceRH } from '../../hooks/useEspaceRH';
import { GROUPES_PERMISSIONS, LIBELLE_ROLE_LONG, PERMISSIONS_PAR_DEFAUT } from '../../lib/permissions';
import { dateHeure } from '../../lib/time';
import type { Compte, Employe, Permission, Role } from '../../types';

type Onglet = 'comptes' | 'permissions';
type FiltreRole = 'tous' | Role;

const TON_ROLE: Record<Role, Tone> = { employe: 'slate', rh: 'brand', admin: 'amber' };
const ICONE_ROLE: Record<Role, string> = { employe: 'person', rh: 'badge', admin: 'admin_panel_settings' };
const PAR_PAGE = 10;

export default function Utilisateurs() {
  const { user, db, now } = useEspaceRH();
  const dialog = useDialog();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { basculerAcces, deverrouiller, reinitialiser } = useActionsCompte();
  const [onglet, setOnglet] = useState<Onglet>('comptes');
  const [recherche, setRecherche] = useState('');
  const [filtreRole, setFiltreRole] = useState<FiltreRole>('tous');
  const [page, setPage] = useState(0);
  const [cibleRole, setCibleRole] = useState<{ e: Employe; compte: Compte } | null>(null);
  const [nouveauRole, setNouveauRole] = useState<Role>('employe');

  const lignes = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return db.comptes
      .map((compte) => ({ compte, e: db.employes.find((x) => x.id === compte.employeId)! }))
      .filter(({ e }) => e)
      .filter(({ compte }) => filtreRole === 'tous' || compte.role === filtreRole)
      .filter(({ compte, e }) => !q || [e.prenom, e.nom, e.matricule, compte.email, e.departement].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => ['admin', 'rh', 'employe'].indexOf(a.compte.role) - ['admin', 'rh', 'employe'].indexOf(b.compte.role) || a.e.nom.localeCompare(b.e.nom));
  }, [db, recherche, filtreRole]);
  const pagination = paginer(lignes, page, PAR_PAGE);

  const verrouille = (c: Compte) => Boolean(c.verrouilleJusqua && new Date(c.verrouilleJusqua) > now);
  const parRole = (r: Role) => db.comptes.filter((c) => c.role === r && c.actif).length;
  const verrouilles = db.comptes.filter(verrouille).length;
  const desactives = db.comptes.filter((c) => !c.actif).length;
  const echecs24h = db.audit.filter((a) => a.action === 'ECHEC_CONNEXION' && now.getTime() - new Date(a.date).getTime() < 86_400_000).length;

  const ouvrirRole = (e: Employe, compte: Compte) => {
    setNouveauRole(compte.role);
    setCibleRole({ e, compte });
  };

  // Lien « Gérer le rôle » depuis la liste des collaborateurs
  useEffect(() => {
    const id = params.get('employe');
    if (!id) return;
    const compte = db.comptes.find((c) => c.employeId === id);
    const e = db.employes.find((x) => x.id === id);
    if (compte && e) ouvrirRole(e, compte);
    setParams({}, { replace: true });
  }, [params]);

  /* ---------- Matrice des permissions ---------- */
  const [droitsRh, setDroitsRh] = useState<Set<Permission>>(() => new Set(db.permissions.rh));
  useEffect(() => setDroitsRh(new Set(db.permissions.rh)), [db.permissions.rh]);
  const modifie = droitsRh.size !== db.permissions.rh.length || db.permissions.rh.some((p) => !droitsRh.has(p));
  const basculer = (p: Permission) =>
    setDroitsRh((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  const enregistrerMatrice = async () => {
    const retirees = db.permissions.rh.filter((p) => !droitsRh.has(p));
    const ok = await dialog.confirm({
      titre: 'Appliquer les nouvelles permissions RH ?',
      tone: retirees.length ? 'warning' : 'info',
      icon: 'shield_person',
      message: `Les ${parRole('rh')} compte(s) RH actif(s) verront leurs menus et actions mis à jour immédiatement.`,
      details: retirees.length ? `${retirees.length} droit(s) retiré(s) : les écrans correspondants afficheront « Accès restreint ».` : undefined,
      confirmer: 'Appliquer',
    });
    if (!ok) return;
    try {
      modifierPermissions(user, 'rh', [...droitsRh]);
      await dialog.alert({ titre: 'Permissions mises à jour', tone: 'success', message: 'Les comptes RH ont été notifiés ; la modification est tracée dans le journal d’audit.' });
    } catch (err) {
      await dialog.alert({ titre: 'Enregistrement impossible', tone: 'danger', message: messageErreur(err) });
    }
  };

  return (
    <>
      <PageHeader subtitle="Comptes d'accès, attribution des rôles et matrice des permissions" title="Utilisateurs & rôles">
        <TabFilter
          onChange={setOnglet}
          options={[
            { value: 'comptes', label: `Comptes (${db.comptes.length})` },
            { value: 'permissions', label: 'Matrice des permissions' },
          ]}
          value={onglet}
        />
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          droite={<KpiPastille tone="slate">{`${parRole('employe')} empl. • ${parRole('rh')} RH • ${parRole('admin')} admin`}</KpiPastille>}
          icon="manage_accounts"
          titre="Comptes actifs"
          valeur={db.comptes.filter((c) => c.actif).length}
        />
        <KpiCard droite={<KpiPastille tone={parRole('admin') > 1 ? 'emerald' : 'amber'}>{parRole('admin') > 1 ? 'Relève assurée' : 'Un seul admin'}</KpiPastille>} icon="admin_panel_settings" iconClass="text-amber-400" titre="Administrateurs" valeur={parRole('admin')} />
        <KpiCard
          droite={<KpiPastille tone={verrouilles ? 'rose' : 'emerald'}>{`${echecs24h} échec(s) / 24 h`}</KpiPastille>}
          icon="lock_clock"
          iconClass={verrouilles ? 'text-rose-400' : 'text-brand-400'}
          titre="Comptes verrouillés"
          valeur={verrouilles}
        />
        <KpiCard droite={<KpiPastille tone="slate">Données conservées</KpiPastille>} icon="lock" titre="Accès désactivés" valeur={desactives} />
      </div>

      {onglet === 'comptes' ? (
        <Card
          droite={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                ariaLabel="Rechercher un utilisateur"
                onChange={(v) => {
                  setRecherche(v);
                  setPage(0);
                }}
                placeholder="Nom, email, matricule…"
                value={recherche}
              />
              <SelectChip
                ariaLabel="Rôle"
                icon="filter_list"
                onChange={(v) => {
                  setFiltreRole(v);
                  setPage(0);
                }}
                options={[
                  { value: 'tous' as const, label: 'Tous les rôles' },
                  { value: 'employe' as const, label: 'Employés' },
                  { value: 'rh' as const, label: 'Ressources Humaines' },
                  { value: 'admin' as const, label: 'Administrateurs' },
                ]}
                value={filtreRole}
              />
            </div>
          }
          flush
          icon="group"
          titre="Comptes utilisateurs"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className={THEAD_ROW}>
                  <th className="py-3 px-5">Utilisateur</th>
                  <th className="py-3 px-4">Identifiant</th>
                  <th className="py-3 px-4">Rôle</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4">Dernière connexion</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {pagination.lignes.map(({ compte, e }) => {
                  const soi = compte.id === user.compteId;
                  return (
                    <tr key={compte.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-5">
                        <EmployeCell employe={e} />
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-300">{compte.email}</td>
                      <td className="py-3 px-4">
                        <Badge icon={ICONE_ROLE[compte.role]} tone={TON_ROLE[compte.role]}>
                          {LIBELLE_ROLE_LONG[compte.role]}
                        </Badge>
                        {soi && <span className="ml-2 text-[11px] text-slate-500">(vous)</span>}
                      </td>
                      <td className="py-3 px-4">
                        {!compte.actif ? (
                          <Badge icon="lock" tone="rose">
                            Désactivé
                          </Badge>
                        ) : verrouille(compte) ? (
                          <Badge icon="lock_clock" tone="amber">
                            Verrouillé
                          </Badge>
                        ) : (
                          <Badge tone="emerald">Actif</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-400 whitespace-nowrap">{compte.derniereConnexion ? dateHeure(compte.derniereConnexion) : 'Jamais connecté'}</td>
                      <td className="py-3 px-5 text-right">
                        <ActionMenu
                          ariaLabel={`Actions pour le compte de ${e.prenom} ${e.nom}`}
                          items={[
                            {
                              label: 'Changer le rôle',
                              icone: 'admin_panel_settings',
                              onSelect: () => ouvrirRole(e, compte),
                              disabled: soi,
                              description: soi ? 'Impossible sur votre propre compte' : `Actuel : ${LIBELLE_ROLE_LONG[compte.role]}`,
                            },
                            ...(verrouille(compte) ? [{ label: 'Déverrouiller', icone: 'lock_open', tone: 'succes' as const, onSelect: () => void deverrouiller(e, compte) }] : []),
                            {
                              label: 'Réinitialiser le mot de passe',
                              icone: 'password',
                              onSelect: () => void reinitialiser(e),
                              disabled: soi,
                              description: soi ? 'Impossible sur votre propre compte' : undefined,
                            },
                            {
                              label: compte.actif ? "Désactiver l'accès" : "Réactiver l'accès",
                              icone: compte.actif ? 'lock' : 'lock_open',
                              tone: compte.actif ? ('danger' as const) : ('succes' as const),
                              onSelect: () => void basculerAcces(e, compte),
                              disabled: soi,
                              description: soi ? 'Impossible sur votre propre compte' : undefined,
                            },
                            { separateur: true },
                            { label: 'Voir la fiche', icone: 'badge', onSelect: () => navigate(`/admin/employes/${e.id}`) },
                          ]}
                          titre={`${e.prenom} ${e.nom}`}
                        />
                      </td>
                    </tr>
                  );
                })}
                {lignes.length === 0 && <LigneVide colSpan={6}>Aucun compte ne correspond à la recherche.</LigneVide>}
              </tbody>
            </table>
          </div>
          <TableFooter
            nextDisabled={pagination.page >= pagination.pages - 1}
            onNext={() => setPage(pagination.page + 1)}
            onPrevious={() => setPage(pagination.page - 1)}
            previousDisabled={pagination.page === 0}
          >
            {lignes.length ? `${pagination.premier}–${pagination.dernier} sur ${lignes.length} compte(s)` : '0 compte'}
          </TableFooter>
        </Card>
      ) : (
        <Card
          droite={
            <div className="flex items-center gap-2">
              <button
                className="h-8 px-3 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700"
                onClick={() => setDroitsRh(new Set(PERMISSIONS_PAR_DEFAUT.rh))}
                type="button"
              >
                Valeurs par défaut
              </button>
              <button
                className="h-8 px-3 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!modifie}
                onClick={() => void enregistrerMatrice()}
                type="button"
              >
                <Icon className="text-[15px]" name="save" />
                Enregistrer
              </button>
            </div>
          }
          flush
          icon="shield_person"
          sousTitre="Droits de gestion par rôle — contrôlés dans les menus, les écrans et chaque action"
          titre="Matrice des permissions"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className={THEAD_ROW}>
                  <th className="py-3 px-5">Droit</th>
                  <th className="py-3 px-4 text-center w-36">Administrateur</th>
                  <th className="py-3 px-4 text-center w-36">Ressources Humaines</th>
                  <th className="py-3 px-4 text-center w-36">Employé</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {GROUPES_PERMISSIONS.map((g) => (
                  <GroupeLignes key={g.groupe} actifs={droitsRh} groupe={g} onBasculer={basculer} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4 border-t border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-slate-400">
            <p className="flex gap-2">
              <Icon className="text-[15px] text-amber-400" name="admin_panel_settings" />
              L'administrateur conserve tous les droits : sa colonne n'est pas modifiable, pour ne jamais perdre l'administration de l'application.
            </p>
            <p className="flex gap-2">
              <Icon className="text-[15px] text-brand-400" name="gpp_good" />
              Réservés à l'administrateur : attribution des rôles, matrice des permissions, gestion des comptes RH et administrateur.
            </p>
            <p className="flex gap-2">
              <Icon className="text-[15px] text-slate-400" name="person" />
              L'employé dispose uniquement du libre-service : pointage, demandes de congé et de document, profil.
            </p>
          </div>
        </Card>
      )}

      <MotifModal
        bloque={!cibleRole || nouveauRole === cibleRole.compte.role}
        confirmer="Changer le rôle"
        icone="admin_panel_settings"
        labelMotif="Motif du changement"
        onClose={() => setCibleRole(null)}
        onConfirm={(motif) => {
          if (!cibleRole) return;
          changerRole(user, cibleRole.e.id, nouveauRole, motif);
          const nom = `${cibleRole.e.prenom} ${cibleRole.e.nom}`;
          setCibleRole(null);
          void dialog.alert({ titre: 'Rôle modifié', tone: 'success', message: `${nom} est désormais ${LIBELLE_ROLE_LONG[nouveauRole]}. Son menu est mis à jour immédiatement et il a été notifié.` });
        }}
        open={cibleRole !== null}
        resume={
          cibleRole && (
            <>
              Compte de <strong className="text-white">{cibleRole.e.prenom} {cibleRole.e.nom}</strong> ({cibleRole.compte.email}) — rôle actuel :{' '}
              <strong className="text-white">{LIBELLE_ROLE_LONG[cibleRole.compte.role]}</strong>.
            </>
          )
        }
        titre="Changer le rôle"
        tone="info"
      >
        <Field label="Nouveau rôle">
          <Select
            onChange={setNouveauRole}
            options={[
              { value: 'employe', label: 'Employé', description: 'Libre-service : pointage, congés, documents, profil', icone: 'person' },
              { value: 'rh', label: 'Ressources Humaines', description: 'Gestion selon la matrice des permissions RH', icone: 'badge' },
              { value: 'admin', label: 'Administrateur', description: 'Tous les droits, rôles, organisation', icone: 'admin_panel_settings' },
            ]}
            value={nouveauRole}
          />
        </Field>
      </MotifModal>
    </>
  );
}

function Interrupteur({ actif, onChange, label, verrouille }: { actif: boolean; onChange?: () => void; label: string; verrouille?: boolean }) {
  return (
    <button
      aria-checked={actif}
      aria-label={label}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${actif ? 'bg-brand-600' : 'bg-slate-700'} ${verrouille ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
      disabled={verrouille}
      onClick={onChange}
      role="switch"
      title={verrouille ? 'Non modifiable' : undefined}
      type="button"
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${actif ? 'translate-x-[18px]' : 'translate-x-0.5'}`}></span>
    </button>
  );
}

function GroupeLignes({ groupe, actifs, onBasculer }: { groupe: (typeof GROUPES_PERMISSIONS)[number]; actifs: Set<Permission>; onBasculer: (p: Permission) => void }) {
  return (
    <>
      <tr className="bg-slate-900/40 border-y border-slate-800">
        <td className="py-2 px-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400" colSpan={4}>
          <span className="inline-flex items-center gap-2">
            <Icon className="text-[15px]" name={groupe.icone} />
            {groupe.groupe}
          </span>
        </td>
      </tr>
      {groupe.permissions.map((p) => (
        <tr key={p.cle} className="border-b border-slate-800/60 hover:bg-slate-800/30">
          <td className="py-3 px-5">
            <div className="text-xs font-medium text-slate-200">{p.libelle}</div>
            <div className="text-[11px] text-slate-500">{p.description}</div>
          </td>
          <td className="py-3 px-4 text-center">
            <Interrupteur actif label={`${p.libelle} — administrateur`} verrouille />
          </td>
          <td className="py-3 px-4 text-center">
            <Interrupteur actif={actifs.has(p.cle)} label={`${p.libelle} — RH`} onChange={() => onBasculer(p.cle)} />
          </td>
          <td className="py-3 px-4 text-center text-slate-600">—</td>
        </tr>
      ))}
    </>
  );
}

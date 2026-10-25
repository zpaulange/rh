import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Field, SearchInput, Select, Textarea, TextInput } from '../../components/form';
import ActionMenu from '../../components/ui/ActionMenu';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import { messageErreur, useDialog } from '../../components/ui/Dialog';
import Icon from '../../components/ui/Icon';
import KpiCard, { KpiPastille } from '../../components/ui/KpiCard';
import Modal from '../../components/ui/Modal';
import PageHeader from '../../components/ui/PageHeader';
import {
  ajouterService,
  creerDepartement,
  modifierDepartement,
  modifierService,
  supprimerDepartement,
  supprimerService,
  type DonneesDepartement,
} from '../../db/api';
import { useEspaceRH } from '../../hooks/useEspaceRH';
import { estSorti } from '../../lib/contrat';
import type { Departement, Employe, Service } from '../../types';

const AUCUN = '__aucun__';

type Edition =
  | { nature: 'departement'; departement: Departement | null }
  | { nature: 'service'; departement: Departement; service: Service | null };

export default function Organisation() {
  const { user, db, today } = useEspaceRH();
  const dialog = useDialog();
  const [edition, setEdition] = useState<Edition | null>(null);
  const [recherche, setRecherche] = useState('');

  // Effectif présent : les collaborateurs sortis restent dans l'historique sans compter dans l'organisation
  const presents = db.employes.filter((e) => !estSorti(e, today));
  const membres = (d: Departement) => presents.filter((e) => e.departement === d.nom);
  const nom = (id: string | null) => {
    const e = id ? db.employes.find((x) => x.id === id) : undefined;
    return e ? `${e.prenom} ${e.nom}` : null;
  };
  const q = recherche.trim().toLowerCase();
  const departements = useMemo(
    () =>
      [...db.departements]
        .sort((a, b) => a.nom.localeCompare(b.nom))
        .filter((d) => !q || [d.nom, d.code, d.description, ...d.services.map((s) => s.nom)].some((v) => v.toLowerCase().includes(q))),
    [db, q],
  );
  const nbServices = db.departements.reduce((s, d) => s + d.services.length, 0);
  const sansResponsable = db.departements.filter((d) => !d.responsableId).length;
  const sansService = presents.filter((e) => !e.service && db.departements.find((d) => d.nom === e.departement)?.services.length).length;

  const supprimerDep = async (d: Departement) => {
    const ok = await dialog.confirm({
      titre: `Supprimer le département ${d.nom} ?`,
      tone: 'danger',
      icon: 'domain_disabled',
      message: `Le département et ses ${d.services.length} service(s) seront supprimés. Cette action est tracée dans le journal d'audit.`,
      confirmer: 'Supprimer',
    });
    if (!ok) return;
    try {
      await supprimerDepartement(user, d.id);
      await dialog.alert({ titre: 'Département supprimé', tone: 'success', message: `${d.nom} ne fait plus partie de l'organisation.` });
    } catch (err) {
      await dialog.alert({ titre: 'Suppression impossible', tone: 'danger', message: messageErreur(err) });
    }
  };

  const supprimerSrv = async (d: Departement, s: Service) => {
    const n = presents.filter((e) => e.departement === d.nom && e.service === s.nom).length;
    const ok = await dialog.confirm({
      titre: `Supprimer le service ${s.nom} ?`,
      tone: 'danger',
      icon: 'delete',
      message: n
        ? `${n} collaborateur(s) de ce service resteront dans le département ${d.nom}, sans service. Vous pourrez les rattacher à un autre service depuis leur dossier.`
        : `Le service ne compte aucun collaborateur.`,
      confirmer: 'Supprimer le service',
    });
    if (!ok) return;
    try {
      await supprimerService(user, d.id, s.id);
      await dialog.alert({ titre: 'Service supprimé', tone: 'success', message: `${s.nom} a été retiré de ${d.nom}.` });
    } catch (err) {
      await dialog.alert({ titre: 'Suppression impossible', tone: 'danger', message: messageErreur(err) });
    }
  };

  return (
    <>
      <PageHeader subtitle="Départements, services et responsables : structure utilisée par les dossiers, filtres et rapports" title="Organisation">
        <SearchInput ariaLabel="Rechercher un département ou un service" onChange={setRecherche} placeholder="Rechercher…" value={recherche} />
        <button
          className="h-9 px-4 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-sm shadow-brand-600/30 flex items-center gap-2"
          onClick={() => setEdition({ nature: 'departement', departement: null })}
          type="button"
        >
          <Icon className="text-[16px]" name="domain_add" />
          Nouveau département
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard droite={<KpiPastille tone="brand">Structure</KpiPastille>} icon="apartment" titre="Départements" valeur={db.departements.length} />
        <KpiCard droite={<KpiPastille tone="slate">Sous-unités</KpiPastille>} icon="lan" titre="Services" valeur={nbServices} />
        <KpiCard droite={<KpiPastille tone="emerald">Rattachés</KpiPastille>} icon="groups" titre="Collaborateurs" valeur={presents.length} />
        <KpiCard
          droite={<KpiPastille tone={sansResponsable ? 'amber' : 'emerald'}>{sansResponsable ? 'À compléter' : 'Complet'}</KpiPastille>}
          icon="supervisor_account"
          iconClass={sansResponsable ? 'text-amber-400' : 'text-brand-400'}
          titre="Départements sans responsable"
          valeur={sansResponsable}
        />
      </div>
      {sansService > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-200">
          <Icon className="text-[16px] text-amber-400" name="info" />
          {sansService} collaborateur(s) appartiennent à un département organisé en services sans être rattachés à l'un d'eux.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {departements.map((d) => {
          const equipe = membres(d);
          const directs = equipe.filter((e) => !e.service);
          return (
            <section key={d.id} className="bg-[#182234] rounded-xl border border-slate-800 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-800 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 font-mono text-[11px] font-bold shrink-0">
                    {d.code}
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display text-sm font-semibold text-white truncate">{d.nom}</h2>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{d.description || 'Aucune description.'}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {nom(d.responsableId) ? (
                        <Badge icon="person" tone="slate">
                          Resp. {nom(d.responsableId)}
                        </Badge>
                      ) : (
                        <Badge icon="warning" tone="amber">
                          Sans responsable
                        </Badge>
                      )}
                      <Badge tone="brand">{equipe.length} collaborateur(s)</Badge>
                    </div>
                  </div>
                </div>
                <ActionMenu
                  ariaLabel={`Actions pour ${d.nom}`}
                  items={[
                    { label: 'Modifier le département', icone: 'edit', onSelect: () => setEdition({ nature: 'departement', departement: d }) },
                    { label: 'Ajouter un service', icone: 'add', onSelect: () => setEdition({ nature: 'service', departement: d, service: null }) },
                    { separateur: true },
                    {
                      label: 'Supprimer le département',
                      icone: 'domain_disabled',
                      tone: 'danger',
                      onSelect: () => void supprimerDep(d),
                      disabled: equipe.length > 0,
                      description: equipe.length ? 'Mutez d’abord les collaborateurs rattachés' : undefined,
                    },
                  ]}
                  titre={d.nom}
                />
              </div>
              <div className="divide-y divide-slate-800/70">
                {d.services.map((s) => {
                  const membresService = equipe.filter((e) => e.service === s.nom);
                  return (
                    <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon className="text-[18px] text-slate-500" name="subdirectory_arrow_right" />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-200 truncate">{s.nom}</div>
                          <div className="text-[11px] text-slate-500">
                            {nom(s.responsableId) ? `Resp. ${nom(s.responsableId)}` : 'Sans responsable'} • {membresService.length} collaborateur(s)
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Equipe employes={membresService} />
                        <ActionMenu
                          ariaLabel={`Actions pour le service ${s.nom}`}
                          items={[
                            { label: 'Modifier le service', icone: 'edit', onSelect: () => setEdition({ nature: 'service', departement: d, service: s }) },
                            { label: 'Supprimer le service', icone: 'delete', tone: 'danger', onSelect: () => void supprimerSrv(d, s) },
                          ]}
                          titre={s.nom}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="px-5 py-3 flex items-center justify-between gap-3 bg-slate-900/30">
                  <div className="text-[11px] text-slate-400">
                    {d.services.length ? 'Rattachés directement au département' : 'Aucun service : collaborateurs rattachés au département'} • {directs.length}
                  </div>
                  <Equipe employes={directs} />
                </div>
              </div>
            </section>
          );
        })}
        {departements.length === 0 && <p className="text-xs text-slate-500">Aucun département ne correspond à la recherche.</p>}
      </div>

      <EditionModal edition={edition} onClose={() => setEdition(null)} />
    </>
  );
}

/** Pile d'avatars d'une équipe */
function Equipe({ employes }: { employes: Employe[] }) {
  if (employes.length === 0) return null;
  return (
    <div className="flex -space-x-2" title={employes.map((e) => `${e.prenom} ${e.nom}`).join(', ')}>
      {employes.slice(0, 4).map((e) => (
        <span key={e.id} className="ring-2 ring-[#182234] rounded-full">
          <Avatar nom={e.nom} prenom={e.prenom} size="sm" url={e.avatarUrl} />
        </span>
      ))}
      {employes.length > 4 && <span className="w-8 h-8 rounded-full bg-slate-800 ring-2 ring-[#182234] text-[10px] text-slate-300 flex items-center justify-center">+{employes.length - 4}</span>}
    </div>
  );
}

function EditionModal({ edition, onClose }: { edition: Edition | null; onClose: () => void }) {
  const { user, db } = useEspaceRH();
  const dialog = useDialog();
  const [f, setF] = useState<DonneesDepartement>({ code: '', nom: '', description: '', responsableId: null });
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!edition) return;
    setErreur(null);
    if (edition.nature === 'departement') {
      const d = edition.departement;
      setF(d ? { code: d.code, nom: d.nom, description: d.description, responsableId: d.responsableId } : { code: '', nom: '', description: '', responsableId: null });
    } else {
      const s = edition.service;
      setF({ code: '', nom: s?.nom ?? '', description: '', responsableId: s?.responsableId ?? null });
    }
  }, [edition]);

  if (!edition) return null;
  const estDep = edition.nature === 'departement';
  const creation = estDep ? !edition.departement : !edition.service;
  // Responsable de service : de préférence un membre du département
  const candidats = db.employes.filter((e) => !e.dateSortie).sort((a, b) => {
    const dep = edition.nature === 'service' ? edition.departement.nom : edition.departement?.nom;
    return Number(b.departement === dep) - Number(a.departement === dep) || a.nom.localeCompare(b.nom);
  });

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      if (edition.nature === 'departement') {
        if (edition.departement) await modifierDepartement(user, edition.departement.id, f);
        else await creerDepartement(user, f);
      } else if (edition.service) await modifierService(user, edition.departement.id, edition.service.id, { nom: f.nom, responsableId: f.responsableId });
      else await ajouterService(user, edition.departement.id, { nom: f.nom, responsableId: f.responsableId });
      onClose();
      void dialog.alert({
        titre: creation ? (estDep ? 'Département créé' : 'Service ajouté') : 'Modifications enregistrées',
        tone: 'success',
        message: estDep && !creation && edition.departement?.nom !== f.nom.trim() ? 'Les dossiers rattachés ont été mis à jour avec le nouveau nom.' : 'L’organisation est à jour ; l’action est tracée dans le journal d’audit.',
      });
    } catch (err) {
      setErreur(messageErreur(err));
    }
  };

  return (
    <Modal onClose={onClose} open>
      <div className="bg-[#111827] border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-800 bg-[#182234]/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
              <Icon className="text-[22px]" name={estDep ? 'apartment' : 'lan'} />
            </div>
            <div>
              <h4 className="font-display text-base font-semibold text-white tracking-tight">
                {estDep ? (creation ? 'Nouveau département' : `Modifier ${edition.departement!.nom}`) : creation ? `Nouveau service — ${edition.departement.nom}` : `Modifier le service ${edition.service!.nom}`}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">Action tracée dans le journal d'audit</p>
            </div>
          </div>
          <button aria-label="Fermer" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80" onClick={onClose} type="button">
            <Icon className="text-[19px]" name="close" />
          </button>
        </div>
        <form className="p-6 flex flex-col gap-4" onSubmit={submit}>
          {estDep ? (
            <div className="grid grid-cols-[110px_1fr] gap-3">
              <Field aide="2 à 6 caractères" label="Code">
                <TextInput maxLength={6} messageErreur="2 à 6 lettres ou chiffres." mono onChange={(v) => setF((x) => ({ ...x, code: v.toUpperCase() }))} pattern={'^[A-Za-z0-9]{2,6}$'} required value={f.code} />
              </Field>
              <Field label="Nom du département">
                <TextInput maxLength={60} onChange={(v) => setF((x) => ({ ...x, nom: v }))} required value={f.nom} />
              </Field>
            </div>
          ) : (
            <Field label="Nom du service">
              <TextInput maxLength={60} onChange={(v) => setF((x) => ({ ...x, nom: v }))} required value={f.nom} />
            </Field>
          )}
          {estDep && (
            <Field label="Description">
              <Textarea maxLength={200} onChange={(v) => setF((x) => ({ ...x, description: v }))} rows={2} value={f.description} />
            </Field>
          )}
          <Field label="Responsable">
            <Select
              onChange={(v) => setF((x) => ({ ...x, responsableId: v === AUCUN ? null : v }))}
              options={[
                { value: AUCUN, label: 'Aucun responsable' },
                ...candidats.map((e) => ({ value: e.id, label: `${e.prenom} ${e.nom}`, description: `${e.poste} • ${e.departement}` })),
              ]}
              recherche
              value={f.responsableId ?? AUCUN}
            />
          </Field>
          {!estDep && edition.service && (
            <p className="text-[11px] text-slate-400 -mt-1">Renommer le service met à jour le dossier des collaborateurs qui y sont rattachés.</p>
          )}
          {erreur && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300" role="alert">
              <Icon className="text-[15px] mt-px" name="error" />
              {erreur}
            </div>
          )}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60" onClick={onClose} type="button">
              Annuler
            </button>
            <button className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white flex items-center gap-2" type="submit">
              <Icon className="text-[16px]" name="save" />
              {creation ? 'Créer' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

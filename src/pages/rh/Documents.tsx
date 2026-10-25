import { useMemo, useState } from 'react';
import { DocumentDetailModal, useTelechargement, VerificationDocument } from '../../components/DocumentUI';
import EmployeCell from '../../components/rh/EmployeCell';
import Badge from '../../components/ui/Badge';
import Card, { THEAD_ROW } from '../../components/ui/Card';
import DecisionModal from '../../components/ui/DecisionModal';
import { SearchInput } from '../../components/form';
import Icon from '../../components/ui/Icon';
import KpiCard, { KpiPastille } from '../../components/ui/KpiCard';
import PageHeader from '../../components/ui/PageHeader';
import TabFilter from '../../components/ui/TabFilter';
import TableFooter, { paginer } from '../../components/ui/TableFooter';
import { messageErreur, useDialog } from '../../components/ui/Dialog';
import { refuserDemandeDocument, traiterDemandeDocument } from '../../db/api';
import { getDB } from '../../db/store';
import { useEspaceRH } from '../../hooks/useEspaceRH';
import { CERTIFICATION, LIBELLE_CATEGORIE, LIBELLE_DEMANDE_DOCUMENT, STYLE_CATEGORIE } from '../../lib/documents';
import { telechargerPDF } from '../../lib/pdfLazy';
import { dateCourte, dateHeure, dateKey, moisDe } from '../../lib/time';
import type { CategorieDocument, DemandeDocument, DocumentGenere } from '../../types';
import GenererDocumentModal from './modals/GenererDocumentModal';

const PAR_PAGE = 8;

export default function Documents() {
  const { user, db, today } = useEspaceRH();
  const dialog = useDialog();
  const telecharger = useTelechargement();
  const [ongletDemandes, setOngletDemandes] = useState<'attente' | 'traitees'>('attente');
  const [categorie, setCategorie] = useState<'toutes' | CategorieDocument>('toutes');
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(0);
  const [generation, setGeneration] = useState(false);
  const [detail, setDetail] = useState<DocumentGenere | null>(null);
  const [refus, setRefus] = useState<DemandeDocument | null>(null);

  const employeDe = (id: string) => db.employes.find((e) => e.id === id)!;

  const demandes = useMemo(() => {
    const toutes = [...db.demandesDocuments].sort((a, b) => b.dateDemande.localeCompare(a.dateDemande));
    return ongletDemandes === 'attente' ? toutes.filter((d) => d.statut === 'en_attente') : toutes.filter((d) => d.statut !== 'en_attente').slice(0, 15);
  }, [db, ongletDemandes]);
  const enAttente = db.demandesDocuments.filter((d) => d.statut === 'en_attente').length;
  const aRetirer = db.demandesDocuments.filter((d) => d.statut === 'pret' && d.format === 'paper').length;
  const generesMois = db.documents.filter((d) => moisDe(dateKey(new Date(d.date))) === moisDe(today)).length;

  const registre = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return [...db.documents]
      .filter((d) => categorie === 'toutes' || d.categorie === categorie)
      .filter((d) => {
        if (!q) return true;
        const e = db.employes.find((x) => x.id === d.employeId);
        return [d.titre, d.reference, d.code, e?.nom ?? '', e?.prenom ?? '', e?.matricule ?? ''].some((v) => v.toLowerCase().includes(q));
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [db, categorie, recherche]);
  const pagination = paginer(registre, page, PAR_PAGE);

  const generer = async (d: DemandeDocument) => {
    const e = employeDe(d.employeId);
    const ok = await dialog.confirm({
      titre: `Générer « ${LIBELLE_DEMANDE_DOCUMENT[d.type]} » ?`,
      tone: 'info',
      icon: 'picture_as_pdf',
      message: `Pour ${e.prenom} ${e.nom}, destinataire : ${d.destinataire}. Le PDF sera signé, horodaté et ajouté au coffre du collaborateur.`,
      details: d.commentaire ? `Précision demandée : « ${d.commentaire} »` : undefined,
      confirmer: 'Générer le PDF',
    });
    if (!ok) return;
    try {
      const doc = await traiterDemandeDocument(user, d.id);
      telechargerPDF(getDB(), doc);
      const choix = await dialog.alert({
        titre: 'Document généré',
        tone: 'success',
        icon: 'picture_as_pdf',
        message: `${doc.titre} — ${d.format === 'paper' ? 'exemplaire papier à imprimer et à faire signer' : 'disponible dans le coffre du collaborateur'}. ${e.prenom} ${e.nom} a été notifié(e).`,
        details: <span className="font-mono">Code de vérification : {doc.code}</span>,
        actions: [
          { label: 'Voir le détail', value: 'detail', variant: 'secondary' },
          { label: 'Compris', value: 'ok', variant: 'primary' },
        ],
      });
      if (choix === 'detail') setDetail(doc);
    } catch (err) {
      await dialog.alert({ titre: 'Génération impossible', tone: 'danger', message: messageErreur(err) });
    }
  };

  return (
    <>
      <PageHeader subtitle="Génération automatique des PDF certifiés, coffre-fort et vérification" title="Documents & attestations">
        <button
          className="h-9 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-2 shadow-sm transition-colors"
          onClick={() => setGeneration(true)}
          type="button"
        >
          <Icon name="picture_as_pdf" className="text-[16px]" />
          <span>Générer un document</span>
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          droite={<KpiPastille tone={enAttente ? 'amber' : 'emerald'}>{enAttente ? 'À traiter' : 'À jour'}</KpiPastille>}
          icon="pending_actions"
          iconClass="text-amber-400"
          titre="Demandes en attente"
          valeur={enAttente}
          valeurClass={enAttente ? 'text-amber-300' : 'text-white'}
        />
        <KpiCard droite={<KpiPastille tone="brand">Ce mois</KpiPastille>} icon="picture_as_pdf" titre="Documents générés" valeur={generesMois} />
        <KpiCard droite={<KpiPastille tone={aRetirer ? 'amber' : 'slate'}>Papier signé</KpiPastille>} icon="print" titre="À retirer au service RH" valeur={aRetirer} />
        <KpiCard droite={<KpiPastille>SHA-256</KpiPastille>} icon="lock" suffixe="certifiés" titre="Coffre-fort" valeur={db.documents.length} />
      </div>

      <Card
        droite={
          <TabFilter
            onChange={setOngletDemandes}
            options={[
              { value: 'attente', label: `En attente (${enAttente})` },
              { value: 'traitees', label: 'Traitées récemment' },
            ]}
            value={ongletDemandes}
          />
        }
        flush
        icon="inbox"
        sousTitre="Soumises depuis l'espace collaborateur"
        titre="Demandes de documents"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                <th className="py-3 px-5">Collaborateur</th>
                <th className="py-3 px-4">Document</th>
                <th className="py-3 px-4">Destinataire</th>
                <th className="py-3 px-4">Format</th>
                <th className="py-3 px-4">Demandé le</th>
                <th className="py-3 px-5 text-right">{ongletDemandes === 'attente' ? 'Action' : 'Statut'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {demandes.map((d) => {
                const doc = d.documentId ? db.documents.find((x) => x.id === d.documentId) : undefined;
                return (
                  <tr key={d.id} className="hover:bg-slate-800/40 transition-colors align-top">
                    <td className="py-3 px-5">
                      <EmployeCell employe={employeDe(d.employeId)} />
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span className="text-slate-200 font-medium">{LIBELLE_DEMANDE_DOCUMENT[d.type]}</span>
                      <span className="block text-[11px] text-slate-500">Réf. {d.reference}</span>
                      {d.commentaire && <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs line-clamp-2">« {d.commentaire} »</p>}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-300 max-w-[200px]">{d.destinataire}</td>
                    <td className="py-3 px-4">
                      <Badge icon={d.format === 'paper' ? 'print' : 'cloud_done'} tone={d.format === 'paper' ? 'amber' : 'brand'}>
                        {d.format === 'paper' ? 'Papier signé' : 'PDF e-ID'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400 whitespace-nowrap">{dateHeure(d.dateDemande)}</td>
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      {d.statut === 'en_attente' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="px-2.5 py-1 rounded-md text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white inline-flex items-center gap-1"
                            onClick={() => void generer(d)}
                            type="button"
                          >
                            <Icon name="picture_as_pdf" className="text-[14px]" />
                            Générer
                          </button>
                          <button
                            className="px-2.5 py-1 rounded-md text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                            onClick={() => setRefus(d)}
                            type="button"
                          >
                            Refuser
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          {d.statut === 'pret' ? <Badge tone="emerald">Délivré</Badge> : <Badge tone="rose">Refusé</Badge>}
                          {doc ? (
                            <button className="text-[11px] text-brand-400 hover:text-brand-300 font-mono" onClick={() => setDetail(doc)} type="button">
                              {doc.code}
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-500">{d.commentaireRH}</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {demandes.length === 0 && (
                <tr>
                  <td className="py-8 px-5 text-center text-xs text-slate-500" colSpan={6}>
                    {ongletDemandes === 'attente' ? 'Aucune demande en attente.' : 'Aucune demande traitée.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <Card
          className="lg:col-span-8"
          droite={
            <SearchInput
              className="w-full sm:w-60"
              onChange={(v) => {
                setRecherche(v);
                setPage(0);
              }}
              placeholder="Nom, référence, code…"
              value={recherche}
            />
          }
          flush
          icon="view_list"
          titre="Registre des documents certifiés"
        >
          <div className="px-5 pt-4">
            <TabFilter
              onChange={(c) => {
                setCategorie(c);
                setPage(0);
              }}
              options={[
                { value: 'toutes' as const, label: 'Tous' },
                ...(['bulletins', 'titres_conge', 'attestations', 'pointages'] as CategorieDocument[]).map((c) => ({ value: c, label: LIBELLE_CATEGORIE[c] })),
              ]}
              value={categorie}
            />
          </div>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className={THEAD_ROW}>
                  <th className="py-3 px-5">Document</th>
                  <th className="py-3 px-4">Collaborateur</th>
                  <th className="py-3 px-4">Émis le</th>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {pagination.lignes.map((d) => {
                  const style = STYLE_CATEGORIE[d.categorie];
                  const e = employeDe(d.employeId);
                  const certif = CERTIFICATION[d.categorie];
                  return (
                    <tr key={d.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${style.iconClass}`}>
                            <Icon name={style.icon} className="text-[16px]" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium text-slate-200 truncate max-w-[260px]">{d.titre}</span>
                            <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                              <Icon name={certif.icon} className="text-[12px]" />
                              {certif.libelle} • {d.generePar}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-300 whitespace-nowrap">
                        {e.prenom} {e.nom}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-300 whitespace-nowrap">{dateCourte(dateKey(new Date(d.date)))}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">{d.code}</td>
                      <td className="py-3 px-5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button className="text-xs font-medium text-slate-400 hover:text-white" onClick={() => setDetail(d)} type="button">
                            Détails
                          </button>
                          <button className="text-slate-400 hover:text-brand-400" onClick={() => telecharger(d)} title="Télécharger" type="button">
                            <Icon name="download" className="text-[16px]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {registre.length === 0 && (
                  <tr>
                    <td className="py-8 px-5 text-center text-xs text-slate-500" colSpan={5}>
                      Aucun document.
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
            {registre.length ? `${pagination.premier}–${pagination.dernier} sur ${registre.length} documents` : '0 document'}
          </TableFooter>
        </Card>

        <div className="lg:col-span-4 flex flex-col gap-6">
          <VerificationDocument />
          <Card icon="auto_awesome" titre="Générations automatiques">
            <ul className="flex flex-col gap-2.5 text-xs text-slate-300">
              {[
                ['task_alt', 'Titre de congé signé à chaque congé approuvé'],
                ['picture_as_pdf', 'Attestations et certificats à la validation d’une demande'],
                ['payments', 'Bulletins et fiches d’émargement mensuels'],
                ['verified', 'Code de vérification et empreinte SHA-256 sur chaque PDF'],
              ].map(([i, t]) => (
                <li key={t} className="flex items-start gap-2">
                  <Icon name={i} className="text-[16px] text-brand-400" />
                  {t}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <GenererDocumentModal onClose={() => setGeneration(false)} onGenere={(d) =>
          void dialog.alert({
            titre: 'Document généré',
            tone: 'success',
            icon: 'picture_as_pdf',
            message: `${d.titre} a été téléchargé et ajouté au coffre du collaborateur, qui a été notifié.`,
            details: <span className="font-mono">Code de vérification : {d.code}</span>,
          })
        } open={generation} />
      <DocumentDetailModal
        doc={detail}
        onClose={() => setDetail(null)}
        titulaire={detail ? `${employeDe(detail.employeId).prenom} ${employeDe(detail.employeId).nom}` : undefined}
      />
      <DecisionModal
        approuver={false}
        onClose={() => setRefus(null)}
        onConfirm={async (motif) => {
          if (!refus) return;
          try {
            await refuserDemandeDocument(user, refus.id, motif);
            void dialog.alert({ titre: 'Demande refusée', tone: 'info', message: 'Le collaborateur a été notifié avec le motif du refus.' });
          } catch (err) {
            void dialog.alert({ titre: 'Action impossible', tone: 'danger', message: messageErreur(err) });
          }
          setRefus(null);
        }}
        open={refus !== null}
        resume={
          refus && (
            <>
              <strong className="text-white">
                {employeDe(refus.employeId).prenom} {employeDe(refus.employeId).nom}
              </strong>{' '}
              — {LIBELLE_DEMANDE_DOCUMENT[refus.type]} pour {refus.destinataire}
            </>
          )
        }
        titre="Refuser la demande de document"
      />
    </>
  );
}

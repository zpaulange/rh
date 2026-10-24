import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DocumentDetailModal, useTelechargement, VerificationDocument } from '../../components/DocumentUI';
import Icon from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import SelectChip from '../../components/ui/SelectChip';
import TabFilter from '../../components/ui/TabFilter';
import TableFooter, { paginer } from '../../components/ui/TableFooter';
import { useDialog } from '../../components/ui/Dialog';
import { useEspaceEmploye } from '../../hooks/useEspaceEmploye';
import { CERTIFICATION, LIBELLE_CATEGORIE, LIBELLE_DEMANDE_DOCUMENT, STYLE_CATEGORIE } from '../../lib/documents';
import { ajouterJours, dateCourte, dateKey, jourMois, moisDe, moisLong } from '../../lib/time';
import type { CategorieDocument, DemandeDocument, DocumentGenere } from '../../types';
import DemandeDocumentModal from './modals/DemandeDocumentModal';

type Onglet = 'tous' | Exclude<CategorieDocument, 'pointages'>;

const ONGLETS: { value: Onglet; label: string }[] = [
  { value: 'tous', label: 'Tous les documents' },
  { value: 'bulletins', label: 'Bulletins de paie' },
  { value: 'titres_conge', label: 'Titres de congé' },
  { value: 'attestations', label: 'Attestations' },
  { value: 'contrats', label: 'Contrats' },
];

const PAR_PAGE = 4;
// Taille moyenne estimée d'un PDF certifié dans le coffre (Mo)
const TAILLE_DOC_MO = 0.14;
const QUOTA_COFFRE_MO = 50;

function statutDemande(d: DemandeDocument) {
  if (d.statut === 'pret')
    return {
      label: d.format === 'paper' ? 'Prêt — à retirer' : 'Prêt au téléchargement',
      cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
      icon: 'check_circle',
      iconCls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
      detail: `Traité le ${jourMois(dateKey(new Date(d.dateTraitement!)))} • Réf. #${d.reference}`,
    };
  if (d.statut === 'refuse')
    return {
      label: 'Refusée',
      cls: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
      icon: 'cancel',
      iconCls: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
      detail: d.commentaireRH || `Réf. #${d.reference}`,
    };
  return {
    label: 'En cours validation RH',
    cls: 'bg-amber-500/10 text-amber-300 border border-amber-500/20',
    icon: 'hourglass_empty',
    iconCls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    detail: `Soumis le ${jourMois(dateKey(new Date(d.dateDemande)))} • Estimation 24h`,
  };
}

export default function Documents() {
  const { user, db, today } = useEspaceEmploye();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(searchParams.get('nouveau') === '1');
  const [detail, setDetail] = useState<DocumentGenere | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('tous');
  const anneeCourante = today.slice(0, 4);
  const [annee, setAnnee] = useState(anneeCourante);
  const [page, setPage] = useState(0);
  const dialog = useDialog();
  const telecharger = useTelechargement();

  const closeModal = () => {
    setModalOpen(false);
    if (searchParams.has('nouveau')) setSearchParams({}, { replace: true });
  };

  const mesDocuments = useMemo(
    () => db.documents.filter((d) => d.employeId === user.employeId).sort((a, b) => b.date.localeCompare(a.date)),
    [db, user.employeId],
  );
  const documentsAnnee = mesDocuments.filter((d) => d.date.startsWith(annee));
  const documents = onglet === 'tous' ? documentsAnnee : documentsAnnee.filter((d) => d.categorie === onglet);
  const pagination = paginer(documents, page, PAR_PAGE);

  const bulletins = documentsAnnee.filter((d) => d.categorie === 'bulletins' && d.modele === 'bulletin_paie').length;
  const moisPrecedent = moisDe(ajouterJours(`${moisDe(today)}-01`, -1));
  const bulletinsAJour = mesDocuments.some((d) => d.modele === 'bulletin_paie' && d.params.mois === moisPrecedent);
  const titres = documentsAnnee.filter((d) => d.categorie === 'titres_conge').length;
  const attestations = documentsAnnee.filter((d) => d.categorie === 'attestations').length;
  const stockage = Math.round(mesDocuments.length * TAILLE_DOC_MO * 10) / 10;
  const mesDemandes = db.demandesDocuments
    .filter((d) => d.employeId === user.employeId)
    .sort((a, b) => b.dateDemande.localeCompare(a.dateDemande))
    .slice(0, 3);

  const annees = [anneeCourante, String(Number(anneeCourante) - 1)];

  return (
    <>
      <PageHeader title="Documents & Attestations" subtitle="Coffre-fort numérique et attestations certifiées">
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
          ariaLabel="Type de document"
          icon="filter_list"
          onChange={(o) => {
            setOnglet(o);
            setPage(0);
          }}
          options={ONGLETS.map((o) => ({ value: o.value, label: o.value === 'tous' ? 'Tous les types' : o.label }))}
          value={onglet}
        />
        <button
          className="h-9 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          onClick={() => setModalOpen(true)}
          type="button"
        >
          <Icon name="add" className="text-[16px]" />
          <span>Demander un document</span>
        </button>
      </PageHeader>

      {/* 4 Cartes KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#182234] p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Bulletins de paie</span>
            <Icon name="payments" className="text-[18px] text-brand-400" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between mb-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-bold text-white">{bulletins}</span>
                <span className="text-xs text-slate-400 font-medium">/ 12</span>
              </div>
              {bulletinsAJour ? (
                <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">À jour</span>
              ) : (
                <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">En attente</span>
              )}
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(bulletins / 12) * 100}%` }}></div>
            </div>
          </div>
        </div>
        <div className="bg-[#182234] p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Titres de congé</span>
            <Icon name="event_available" className="text-[18px] text-brand-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-white">{titres}</span>
            <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">Validés et signés</span>
          </div>
        </div>
        <div className="bg-[#182234] p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Attestations RH</span>
            <Icon name="badge" className="text-[18px] text-brand-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-white">{attestations}</span>
            <span className="text-xs font-medium text-brand-400 bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 rounded">Disponibles</span>
          </div>
        </div>
        <div className="bg-[#182234] p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Stockage coffre</span>
            <Icon name="lock" className="text-[18px] text-brand-400" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between mb-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-bold text-white">{stockage} Mo</span>
                <span className="text-xs text-slate-400 font-medium">/ {QUOTA_COFFRE_MO} Mo</span>
              </div>
              <span className="text-xs font-medium text-slate-400">{Math.round((stockage / QUOTA_COFFRE_MO) * 100)}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(stockage / QUOTA_COFFRE_MO) * 100}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Registre des documents */}
      <div className="bg-[#182234] rounded-xl border border-slate-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="view_list" className="text-[18px] text-brand-400" />
            <h2 className="font-display text-sm font-semibold text-white">Registre des documents officiels</h2>
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
                <th className="py-3 px-5">Document</th>
                <th className="py-3 px-4">Catégorie</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Statut / Certification</th>
                <th className="py-3 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {pagination.lignes.map((doc, i) => {
                const recent = pagination.page === 0 && i === 0;
                const style = STYLE_CATEGORIE[doc.categorie];
                const certif = CERTIFICATION[doc.categorie];
                return (
                  <tr key={doc.id} className={`hover:bg-slate-800/40 transition-colors ${recent ? 'bg-brand-500/[0.03]' : ''}`}>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${style.iconClass}`}>
                          <Icon name={style.icon} className="text-[16px]" />
                        </div>
                        <div className="flex flex-col">
                          <span className={recent ? 'font-semibold text-white' : 'font-medium text-slate-200'}>{doc.titre}</span>
                          <span className="text-xs text-slate-400">{doc.sousTitre}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-300">{LIBELLE_CATEGORIE[doc.categorie]}</td>
                    <td className={`py-3.5 px-4 font-mono text-xs ${recent ? 'text-white' : 'text-slate-300'}`}>{dateCourte(dateKey(new Date(doc.date)))}</td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${certif.className}`}>
                        <Icon name={certif.icon} className="text-[13px]" />
                        {certif.libelle}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          className={`text-xs font-medium transition-colors ${recent ? 'text-brand-400 hover:text-brand-300' : 'text-slate-400 hover:text-white'}`}
                          onClick={() => setDetail(doc)}
                          type="button"
                        >
                          Détails
                        </button>
                        <button className="text-slate-400 hover:text-brand-400 transition-colors" onClick={() => telecharger(doc)} title="Télécharger" type="button">
                          <Icon name="download" className="text-[16px]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {documents.length === 0 && (
                <tr>
                  <td className="py-6 px-5 text-center text-xs text-slate-500" colSpan={5}>
                    Aucun document dans cette catégorie.
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
          Affichage de {pagination.lignes.length} sur {documents.length} documents
        </TableFooter>
      </div>

      {/* Bas de page : 2 cartes 50/50 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-[#182234] rounded-xl border border-slate-800 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Icon name="pending_actions" className="text-[18px] text-brand-400" />
                <h3 className="font-display text-sm font-semibold text-white">Demandes d'attestation récentes</h3>
              </div>
              <span className="text-xs text-slate-400">{moisLong(moisDe(today))}</span>
            </div>
            <div className="flex flex-col gap-3 mt-3">
              {mesDemandes.length === 0 && <p className="text-xs text-slate-500">Aucune demande en cours.</p>}
              {mesDemandes.map((d) => {
                const s = statutDemande(d);
                const doc = d.documentId ? db.documents.find((x) => x.id === d.documentId) : undefined;
                return (
                  <div key={d.id} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${s.iconCls}`}>
                      <Icon name={s.icon} className="text-[16px]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-white truncate">
                          {LIBELLE_DEMANDE_DOCUMENT[d.type]} ({d.destinataire.split(' — ')[0]})
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${s.cls}`}>{s.label}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <p className="text-xs text-slate-400 truncate">{s.detail}</p>
                        {doc && d.format === 'digital' && (
                          <button className="text-[11px] font-medium text-brand-400 hover:text-brand-300 shrink-0" onClick={() => telecharger(doc)} type="button">
                            Télécharger
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Besoin d'un document spécifique ?</span>
            <button className="text-brand-400 hover:text-brand-300 font-medium transition-colors cursor-pointer" onClick={() => setModalOpen(true)} type="button">
              Nouvelle demande →
            </button>
          </div>
        </div>

        <VerificationDocument />
      </div>

      <DemandeDocumentModal
        open={modalOpen}
        onClose={closeModal}
        onSubmitted={() =>
          void dialog.alert({
            titre: 'Demande envoyée',
            tone: 'success',
            icon: 'send',
            message: 'Votre demande de document administratif a été transmise aux RH. Vous serez notifié dès que le document sera prêt.',
            details: 'Délai de traitement habituel : 24 h ouvrées.',
          })
        }
      />
      <DocumentDetailModal doc={detail} onClose={() => setDetail(null)} />
    </>
  );
}

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EmployeCell from '../../components/rh/EmployeCell';
import Badge, { type Tone } from '../../components/ui/Badge';
import Card, { LigneVide, THEAD_ROW } from '../../components/ui/Card';
import DecisionModal from '../../components/ui/DecisionModal';
import { messageErreur, useDialog } from '../../components/ui/Dialog';
import Icon from '../../components/ui/Icon';
import KpiCard, { KpiPastille } from '../../components/ui/KpiCard';
import MotifModal from '../../components/ui/MotifModal';
import PageHeader from '../../components/ui/PageHeader';
import TabFilter from '../../components/ui/TabFilter';
import { MOTIFS_PERMISSION } from '../../config/paie';
import { deciderConge, deciderRegularisation, refuserDemandeDocument, traiterDemandeDocument } from '../../db/api';
import { getDB } from '../../db/store';
import { useEspaceRH } from '../../hooks/useEspaceRH';
import { LIBELLE_DEMANDE_DOCUMENT } from '../../lib/documents';
import { telechargerPDF } from '../../lib/pdfLazy';
import { peut } from '../../lib/permissions';
import { LIBELLE_CONGE, LIBELLE_REGULARISATION } from '../../lib/rules';
import { dateCourte, dateHeure, dateKey, ecartJours } from '../../lib/time';
import type { DemandeConge, DemandeDocument, Permission, Regularisation } from '../../types';

type Categorie = 'conges' | 'permissions' | 'regularisations' | 'documents';
type Onglet = 'toutes' | Categorie;

type Demande =
  | { categorie: 'conges' | 'permissions'; id: string; date: string; employeId: string; c: DemandeConge }
  | { categorie: 'regularisations'; id: string; date: string; employeId: string; r: Regularisation }
  | { categorie: 'documents'; id: string; date: string; employeId: string; d: DemandeDocument };

const STYLE: Record<Categorie, { label: string; icone: string; tone: Tone; droit: Permission }> = {
  conges: { label: 'Congé', icone: 'beach_access', tone: 'brand', droit: 'conges.valider' },
  permissions: { label: 'Permission', icone: 'event_available', tone: 'emerald', droit: 'permissions.valider' },
  regularisations: { label: 'Régularisation', icone: 'edit_calendar', tone: 'amber', droit: 'presences.gerer' },
  documents: { label: 'Document', icone: 'description', tone: 'slate', droit: 'documents.gerer' },
};

// File unique des demandes en attente, de la plus ancienne à la plus récente
export default function Demandes() {
  const { user, db, today, base } = useEspaceRH();
  const navigate = useNavigate();
  const dialog = useDialog();
  const [onglet, setOnglet] = useState<Onglet>('toutes');
  const [decision, setDecision] = useState<{ demande: Demande; approuver: boolean } | null>(null);
  const [refusDoc, setRefusDoc] = useState<DemandeDocument | null>(null);

  const demandes = useMemo<Demande[]>(
    () =>
      [
        ...db.conges
          .filter((c) => c.statut === 'en_attente')
          .map((c) => ({ categorie: c.type === 'permission' ? ('permissions' as const) : ('conges' as const), id: c.id, date: c.dateDemande, employeId: c.employeId, c })),
        ...db.regularisations.filter((r) => r.statut === 'en_attente').map((r) => ({ categorie: 'regularisations' as const, id: r.id, date: r.dateDemande, employeId: r.employeId, r })),
        ...db.demandesDocuments.filter((d) => d.statut === 'en_attente').map((d) => ({ categorie: 'documents' as const, id: d.id, date: d.dateDemande, employeId: d.employeId, d })),
      ].sort((a, b) => a.date.localeCompare(b.date)),
    [db],
  );
  const nb = (c: Categorie) => demandes.filter((d) => d.categorie === c).length;
  const visibles = onglet === 'toutes' ? demandes : demandes.filter((d) => d.categorie === onglet);
  const plusAncienne = demandes[0];
  const attente = (d: Demande) => ecartJours(dateKey(new Date(d.date)), today);
  const employeDe = (id: string) => db.employes.find((e) => e.id === id)!;

  const detail = (d: Demande) => {
    if (d.categorie === 'documents') return { titre: LIBELLE_DEMANDE_DOCUMENT[d.d.type], sous: `Destinataire : ${d.d.destinataire}${d.d.commentaire ? ` • « ${d.d.commentaire} »` : ''}` };
    if (d.categorie === 'regularisations') return { titre: `${LIBELLE_REGULARISATION[d.r.type]} du ${dateCourte(d.r.date)}`, sous: `${d.r.entree} — ${d.r.depart} • ${d.r.motif}` };
    const c = d.c;
    return {
      titre: `${c.motifPermission ? MOTIFS_PERMISSION[c.motifPermission]?.libelle ?? LIBELLE_CONGE[c.type] : LIBELLE_CONGE[c.type]} • ${c.jours} j`,
      sous: `${dateCourte(c.debut)}${c.fin !== c.debut ? ` — ${dateCourte(c.fin)}` : ''}${c.motif ? ` • ${c.motif}` : ''}`,
    };
  };

  const genererDocument = async (d: DemandeDocument) => {
    const e = employeDe(d.employeId);
    const ok = await dialog.confirm({
      titre: `Générer « ${LIBELLE_DEMANDE_DOCUMENT[d.type]} » ?`,
      tone: 'info',
      icon: 'picture_as_pdf',
      message: `Pour ${e.prenom} ${e.nom}. Le PDF sera certifié, horodaté et ajouté au coffre du collaborateur.`,
      confirmer: 'Générer le PDF',
    });
    if (!ok) return;
    try {
      const doc = await traiterDemandeDocument(user, d.id);
      telechargerPDF(getDB(), doc);
      await dialog.alert({ titre: 'Document généré', tone: 'success', icon: 'picture_as_pdf', message: `${doc.titre} a été remis à ${e.prenom} ${e.nom}, qui a été notifié(e).`, details: <span className="font-mono">Code : {doc.code}</span> });
    } catch (err) {
      await dialog.alert({ titre: 'Génération impossible', tone: 'danger', message: messageErreur(err) });
    }
  };

  return (
    <>
      <PageHeader subtitle="Toutes les demandes des collaborateurs en attente d'une décision, de la plus ancienne à la plus récente" title="Demandes en attente" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          droite={<KpiPastille tone={demandes.length ? 'amber' : 'emerald'}>{demandes.length ? 'À traiter' : 'À jour'}</KpiPastille>}
          icon="inbox"
          iconClass="text-amber-400"
          titre="Demandes en attente"
          valeur={demandes.length}
          valeurClass={demandes.length ? 'text-amber-300' : 'text-white'}
        />
        <KpiCard droite={<KpiPastille tone="brand">{`${nb('permissions')} permission(s)`}</KpiPastille>} icon="event_note" titre="Congés & permissions" valeur={nb('conges') + nb('permissions')} />
        <KpiCard droite={<KpiPastille tone="slate">{`${nb('documents')} document(s)`}</KpiPastille>} icon="edit_calendar" titre="Régularisations" valeur={nb('regularisations')} />
        <KpiCard
          droite={<KpiPastille tone={plusAncienne && attente(plusAncienne) > 3 ? 'rose' : 'slate'}>{plusAncienne ? `depuis le ${dateCourte(dateKey(new Date(plusAncienne.date)))}` : '—'}</KpiPastille>}
          icon="hourglass_bottom"
          suffixe="j"
          titre="Plus ancienne demande"
          valeur={plusAncienne ? attente(plusAncienne) : 0}
        />
      </div>

      <Card
        droite={
          <TabFilter
            onChange={setOnglet}
            options={[
              { value: 'toutes', label: `Toutes (${demandes.length})` },
              { value: 'conges', label: `Congés (${nb('conges')})` },
              { value: 'permissions', label: `Permissions (${nb('permissions')})` },
              { value: 'regularisations', label: `Régularisations (${nb('regularisations')})` },
              { value: 'documents', label: `Documents (${nb('documents')})` },
            ]}
            value={onglet}
          />
        }
        flush
        icon="pending_actions"
        sousTitre="Chaque décision est notifiée au collaborateur et tracée dans le journal d'audit"
        titre="File des demandes"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                <th className="py-3 px-5">Collaborateur</th>
                <th className="py-3 px-4">Nature</th>
                <th className="py-3 px-4">Objet</th>
                <th className="py-3 px-4">Déposée</th>
                <th className="py-3 px-5 text-right">Décision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {visibles.map((d) => {
                const s = STYLE[d.categorie];
                const det = detail(d);
                const autorise = peut(db, user, s.droit);
                const jours = attente(d);
                return (
                  <tr key={d.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-5">
                      <EmployeCell employe={employeDe(d.employeId)} />
                    </td>
                    <td className="py-3 px-4">
                      <Badge icon={s.icone} tone={s.tone}>
                        {s.label}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 max-w-[320px]">
                      <div className="text-xs font-medium text-slate-200">{det.titre}</div>
                      <div className="text-[11px] text-slate-500 line-clamp-1">{det.sous}</div>
                    </td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      <div className="text-slate-300">{dateHeure(d.date)}</div>
                      <div className={`text-[11px] ${jours > 3 ? 'text-rose-400' : 'text-slate-500'}`}>{jours === 0 ? "aujourd'hui" : `il y a ${jours} j`}</div>
                    </td>
                    <td className="py-3 px-5">
                      <div className="flex items-center justify-end gap-2">
                        {!autorise ? (
                          <span className="text-[11px] text-slate-500">Droit requis</span>
                        ) : d.categorie === 'documents' ? (
                          <>
                            <button className="h-8 px-3 rounded-lg text-xs font-medium text-rose-300 hover:bg-rose-500/10 border border-rose-500/30" onClick={() => setRefusDoc(d.d)} type="button">
                              Refuser
                            </button>
                            <button className="h-8 px-3 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white flex items-center gap-1.5" onClick={() => void genererDocument(d.d)} type="button">
                              <Icon className="text-[15px]" name="picture_as_pdf" />
                              Générer
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="h-8 px-3 rounded-lg text-xs font-medium text-rose-300 hover:bg-rose-500/10 border border-rose-500/30" onClick={() => setDecision({ demande: d, approuver: false })} type="button">
                              Refuser
                            </button>
                            <button className="h-8 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5" onClick={() => setDecision({ demande: d, approuver: true })} type="button">
                              <Icon className="text-[15px]" name="task_alt" />
                              Approuver
                            </button>
                          </>
                        )}
                        <button
                          aria-label="Ouvrir la page de gestion"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"
                          onClick={() => navigate(`${base}/${d.categorie === 'documents' ? 'documents' : d.categorie === 'regularisations' ? 'pointages' : 'conges'}`)}
                          title="Ouvrir la page de gestion"
                          type="button"
                        >
                          <Icon className="text-[17px]" name="open_in_new" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibles.length === 0 && <LigneVide colSpan={5}>Aucune demande en attente.</LigneVide>}
            </tbody>
          </table>
        </div>
      </Card>

      <DecisionModal
        approuver={decision?.approuver ?? true}
        onClose={() => setDecision(null)}
        onConfirm={async (commentaire) => {
          if (!decision) return;
          const d = decision.demande;
          try {
            if (d.categorie === 'regularisations') await deciderRegularisation(user, d.r.id, decision.approuver, commentaire);
            else if (d.categorie !== 'documents') await deciderConge(user, d.c.id, decision.approuver, commentaire);
            setDecision(null);
            const e = employeDe(d.employeId);
            void dialog.alert({
              titre: decision.approuver ? 'Demande approuvée' : 'Demande refusée',
              tone: decision.approuver ? 'success' : 'info',
              message: `${e.prenom} ${e.nom} a été notifié(e).${decision.approuver && d.categorie !== 'regularisations' && d.categorie !== 'documents' && d.c.type !== 'maladie' ? ' Le titre de congé PDF a été ajouté à ses documents.' : ''}`,
            });
          } catch (err) {
            setDecision(null);
            void dialog.alert({ titre: 'Décision impossible', tone: 'danger', message: messageErreur(err) });
          }
        }}
        open={decision !== null}
        resume={
          decision && (
            <>
              <strong className="text-white">
                {employeDe(decision.demande.employeId).prenom} {employeDe(decision.demande.employeId).nom}
              </strong>{' '}
              — {detail(decision.demande).titre}
              <br />
              <span className="text-slate-400">{detail(decision.demande).sous}</span>
            </>
          )
        }
        titre={decision?.approuver ? 'Approuver la demande' : 'Refuser la demande'}
      />
      <MotifModal
        confirmer="Refuser la demande"
        icone="block"
        labelMotif="Motif du refus (transmis au collaborateur)"
        onClose={() => setRefusDoc(null)}
        onConfirm={async (motif) => {
          if (!refusDoc) return;
          await refuserDemandeDocument(user, refusDoc.id, motif);
          setRefusDoc(null);
          void dialog.alert({ titre: 'Demande refusée', tone: 'info', message: 'Le collaborateur a été notifié du motif.' });
        }}
        open={refusDoc !== null}
        resume={refusDoc && <>Demande de {LIBELLE_DEMANDE_DOCUMENT[refusDoc.type]} — {employeDe(refusDoc.employeId).prenom} {employeDe(refusDoc.employeId).nom}</>}
        titre="Refuser la demande de document"
        tone="danger"
      />
    </>
  );
}

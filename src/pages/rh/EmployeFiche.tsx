import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { DocumentDetailModal, useTelechargement } from '../../components/DocumentUI';
import PointageDetailModal from '../../components/PointageDetailModal';
import GeoBadge from '../../components/rh/GeoBadge';
import StatutJourBadge from '../../components/rh/StatutJourBadge';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import Card, { THEAD_ROW } from '../../components/ui/Card';
import Icon from '../../components/ui/Icon';
import ActionMenu from '../../components/ui/ActionMenu';
import { messageErreur, useDialog } from '../../components/ui/Dialog';
import { peut } from '../../lib/permissions';
import { annulerSortie, consulterDonneesSensibles, modifierEmploye } from '../../db/api';
import MotifModal from '../../components/ui/MotifModal';
import SortieModal from './modals/SortieModal';
import { allaitementEnCours } from '../../lib/maternite';
import { useActionsCompte } from '../../hooks/useActionsCompte';
import { useEspaceRH } from '../../hooks/useEspaceRH';
import { ACTIONS_AUDIT } from '../../lib/audit';
import { STYLE_CATEGORIE } from '../../lib/documents';
import { calculerDroits, decompteHeuresSup, estEnRetard, minutesTravaillees, retardJustifie, statsMois, statutJour } from '../../lib/rules';
import { ajouterJours, ajouterMois, dateCourte, dateHeure, dateKey, dateMoisLong, dureeHM, heureHM, jourMois, moisDe, moisLong, nombre } from '../../lib/time';
import type { DocumentGenere, Pointage } from '../../types';
import EmployeFormModal from './modals/EmployeFormModal';
import EvolutionModal from './modals/EvolutionModal';
import { LIBELLE_EVOLUTION, MOTIFS_SORTIE } from '../../config/paie';
import { getDB } from '../../db/store';
import { avantagesNatureMensuels, fcfa, mentionExoneration, simulerSalaire, tauxAncienneteAu } from '../../lib/paie';
import GenererDocumentModal from './modals/GenererDocumentModal';

function Ligne({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
      <span className="text-slate-400 font-medium">{label}</span>
      {children}
    </div>
  );
}

const masquer = (v: string) => `${'•'.repeat(Math.max(4, v.length - 4))}${v.slice(-4)}`;

export default function EmployeFiche() {
  const { id = '' } = useParams();
  const { user, db, now, today, base } = useEspaceRH();
  const dialog = useDialog();
  const actionsCompte = useActionsCompte();
  const { hash } = useLocation();
  const telecharger = useTelechargement();
  const [sensibleVisible, setSensibleVisible] = useState(false);
  const [edition, setEdition] = useState(false);
  const [generation, setGeneration] = useState(false);
  const [sortieOuverte, setSortieOuverte] = useState(false);
  const [annulation, setAnnulation] = useState(false);
  const [evolution, setEvolution] = useState(false);
  const [pointage, setPointage] = useState<Pointage | null>(null);
  const [document, setDocument] = useState<DocumentGenere | null>(null);

  const e = db.employes.find((x) => x.id === id);
  const compte = db.comptes.find((c) => c.employeId === id);
  const droits = useMemo(() => (e ? calculerDroits(db, e, today) : null), [db, e, today]);
  const mois = moisDe(today);
  const stats = useMemo(() => statsMois(db, id, mois, today, now), [db, id, mois, today, now]);

  // Lien « Voir les pointages » depuis la liste des collaborateurs
  useEffect(() => {
    if (hash) window.document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  if (!e || !droits) return <Navigate replace to={`${base}/employes`} />;

  const parcours = db.evolutions.filter((ev) => ev.employeId === id).sort((a, b) => b.dateEffet.localeCompare(a.dateEffet));
  const avantagesE = avantagesNatureMensuels(e, e.salaireBase);
  const simulation = simulerSalaire(e.salaireBase, e.primesFixes, tauxAncienneteAu(e, today), avantagesE.reduce((t, a) => t + a.montant, 0));
  const heuresSupAnnee = decompteHeuresSup(db, e, (dimanche) => dimanche.startsWith(today.slice(0, 4))).total;
  const dernierePaie = db.campagnesPaie
    .filter((c) => c.statut === 'payee')
    .sort((a, b) => b.mois.localeCompare(a.mois))
    .map((c) => ({ campagne: c, ligne: c.lignes.find((l) => l.employeId === id) }))
    .find((x) => x.ligne) as { campagne: (typeof db.campagnesPaie)[number]; ligne: NonNullable<(typeof db.campagnesPaie)[number]['lignes'][number]> } | undefined;
  const montant = (n: number) => (sensibleVisible ? fcfa(n) : '•••••• FCFA');
  const pointages = db.pointages.filter((p) => p.employeId === id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const documents = db.documents.filter((d) => d.employeId === id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const historique = db.audit.filter((a) => a.employeId === id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const statut = statutJour(db, id, today, today, now);
  const verrouille = compte?.verrouilleJusqua && new Date(compte.verrouilleJusqua) > now;

  // Droits du rôle connecté (contrôlés aussi dans les actions)
  const gereCompte = Boolean(compte) && compte!.id !== user.compteId && peut(db, user, 'comptes.gerer') && (compte!.role === 'employe' || user.role === 'admin');
  const droitDocuments = peut(db, user, 'documents.gerer');
  const sortie = db.sorties.find((x) => x.employeId === id && x.statut !== 'annulee');
  const peutSortie = !sortie && e.id !== user.employeId && peut(db, user, 'collaborateurs.gerer') && (!compte || compte.role === 'employe' || user.role === 'admin');
  const allaitement = allaitementEnCours(db, e, today);
  const docDe = (docId: string | null) => (docId ? db.documents.find((d) => d.id === docId) : undefined);

  const reveler = async () => {
    if (!sensibleVisible) {
      try {
        await consulterDonneesSensibles(user, id);
      } catch (err) {
        void dialog.alert({ titre: 'Accès refusé', tone: 'danger', icon: 'lock', message: messageErreur(err) });
        return;
      }
    }
    setSensibleVisible((v) => !v);
  };

  const sensible = (v: string, classe = 'text-white font-mono font-semibold') => (
    <span className={`${classe} ${sensibleVisible ? '' : 'tracking-wider text-slate-400'}`}>{sensibleVisible ? v : masquer(v)}</span>
  );

  return (
    <>
      <Link className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white -mb-3 w-fit" to={`${base}/employes`}>
        <Icon name="arrow_back" className="text-[16px]" />
        Collaborateurs
      </Link>

      {/* En-tête */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar nom={e.nom} prenom={e.prenom} size="lg" url={e.avatarUrl} />
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold font-display text-white tracking-tight">
                {e.prenom} {e.nom}
              </h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                {e.matricule} • {e.contrat}
              </span>
              {e.dateSortie && (
                <Badge icon="logout" tone={e.dateSortie < today ? 'slate' : 'amber'}>
                  {e.dateSortie < today ? `Sorti le ${dateCourte(e.dateSortie)}` : `Départ le ${dateCourte(e.dateSortie)}`}
                </Badge>
              )}
              {compte && !compte.actif && <Badge icon="lock" tone="rose">Accès désactivé</Badge>}
              {allaitement && (
                <Badge icon="child_care" tone="brand">
                  Repos d'allaitement 1 h / jour jusqu'au {dateCourte(allaitement.jusquau)}
                </Badge>
              )}
              {verrouille && <Badge icon="lock_clock" tone="amber">Verrouillé jusqu'à {heureHM(compte!.verrouilleJusqua!)}</Badge>}
              <StatutJourBadge statut={statut} />
            </div>
            <p className="text-sm text-slate-400 mt-1">
              {e.poste} • {compte?.email}
              {compte?.derniereConnexion && ` • dernière connexion ${dateHeure(compte.derniereConnexion)}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {droitDocuments && (
            <button
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-medium transition-colors"
              onClick={() => setGeneration(true)}
              type="button"
            >
              <Icon name="picture_as_pdf" className="text-[18px]" />
              Générer un document
            </button>
          )}
          {compte && gereCompte && (
            <button
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                compte.actif ? 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-300' : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
              }`}
              onClick={() => void actionsCompte.basculerAcces(e, compte)}
              type="button"
            >
              <Icon name={compte.actif ? 'lock' : 'lock_open'} className="text-[18px]" />
              {compte.actif ? "Désactiver l'accès" : "Réactiver l'accès"}
            </button>
          )}
          {peutSortie && (
            <button
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-sm font-medium transition-colors"
              onClick={() => setSortieOuverte(true)}
              type="button"
            >
              <Icon name="logout" className="text-[18px]" />
              Enregistrer une sortie
            </button>
          )}
          <button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all shadow-sm shadow-blue-600/20"
            onClick={() => setEdition(true)}
            type="button"
          >
            <Icon name="edit" className="text-[18px]" />
            Modifier le dossier
          </button>
          {compte && gereCompte && (
            <ActionMenu
              ariaLabel="Autres actions sur le compte"
              items={[
                { label: 'Réinitialiser le mot de passe', icone: 'password', onSelect: () => void actionsCompte.reinitialiser(e) },
                {
                  label: 'Déverrouiller le compte',
                  icone: 'lock_open',
                  tone: 'succes',
                  disabled: !verrouille,
                  description: verrouille ? undefined : "Le compte n'est pas verrouillé",
                  onSelect: () => void actionsCompte.deverrouiller(e, compte),
                },
              ]}
              titre="Compte d'accès"
            />
          )}
        </div>
      </div>

      {sortie && (
        <Card
          droite={
            <div className="flex flex-wrap items-center gap-2">
              {docDe(sortie.certificatId) && (
                <button className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5" onClick={() => telecharger(docDe(sortie.certificatId)!)} type="button">
                  <Icon className="text-[15px]" name="workspace_premium" />
                  Certificat de travail
                </button>
              )}
              {docDe(sortie.soldeId) && (
                <button className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5" onClick={() => telecharger(docDe(sortie.soldeId)!)} type="button">
                  <Icon className="text-[15px]" name="receipt" />
                  Solde de tout compte
                </button>
              )}
              {sortie.statut === 'planifiee' && peut(db, user, 'collaborateurs.gerer') && (
                <button className="h-8 px-3 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700" onClick={() => setAnnulation(true)} type="button">
                  Annuler la sortie
                </button>
              )}
            </div>
          }
          icon="logout"
          sousTitre={`${sortie.reference} • ${MOTIFS_SORTIE[sortie.motif].reference} • enregistrée par ${sortie.creePar}`}
          titre={`${MOTIFS_SORTIE[sortie.motif].libelle} — ${sortie.statut === 'effective' ? 'sortie effective' : 'départ planifié'}`}
        >
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs mb-4">
            {[
              ['Notification', dateCourte(sortie.dateNotification)],
              ['Dernier jour', dateCourte(sortie.dateSortie)],
              ['Préavis', sortie.preavis === 'sans_objet' ? 'Sans objet' : sortie.preavis === 'effectue' ? 'Effectué' : sortie.preavis === 'dispense_employeur' ? 'Dispensé (indemnisé)' : 'Non respecté'],
              ['Salaire moyen', fcfa(sortie.salaireMoyen)],
              ['Ancienneté', `${nombre(sortie.ancienneteAnnees)} an(s)`],
            ].map(([l, v]) => (
              <div key={l} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
                <div className="text-slate-400">{l}</div>
                <div className="text-slate-100 font-medium mt-0.5">{v}</div>
              </div>
            ))}
          </div>
          <div className="divide-y divide-slate-800/70 border border-slate-800 rounded-lg">
            {sortie.rubriques.map((r) => (
              <div key={r.code} className="px-4 py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-200">{r.libelle}</div>
                  <div className="text-[11px] text-slate-500">
                    {r.calcul} • {r.reference}
                    {mentionExoneration(r) ? ` • ${mentionExoneration(r)}` : ''}
                  </div>
                </div>
                <span className="font-mono text-xs text-white shrink-0">{fcfa(r.montant)}</span>
              </div>
            ))}
            {sortie.rubriques.length === 0 && <div className="px-4 py-3 text-xs text-slate-500">Aucune indemnité de rupture.</div>}
            <div className="px-4 py-2.5 flex items-center justify-between bg-slate-900/40">
              <span className="text-xs font-semibold text-white">Total des indemnités (versées avec la paie de {moisLong(moisDe(sortie.dateSortie))})</span>
              <span className="font-mono text-sm font-semibold text-white">{fcfa(sortie.rubriques.reduce((t, r) => t + r.montant, 0))}</span>
            </div>
          </div>
          {sortie.montantDuParSalarie > 0 && (
            <p className="mt-3 text-[11px] text-amber-300">Indemnité de préavis non respecté due par le salarié : {fcfa(sortie.montantDuParSalarie)} (information, aucune retenue automatique).</p>
          )}
          {sortie.observations && <p className="mt-2 text-[11px] text-slate-400">Observations : {sortie.observations}</p>}
        </Card>
      )}

      {/* Bandeau de synthèse */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 divide-y md:divide-y-0 md:divide-x divide-slate-800/70">
          {[
            ['Poste', e.poste],
            ['Département', e.service ? `${e.departement} › ${e.service}` : e.departement],
            ["Date d'embauche", dateMoisLong(e.dateEmbauche)],
            ['Responsable direct', e.responsable],
          ].map(([l, v], i) => (
            <div key={l} className={`flex flex-col ${i ? 'pt-4 md:pt-0 md:pl-6' : ''}`}>
              <span className="text-xs uppercase font-medium tracking-wider text-slate-400 mb-1">{l}</span>
              <span className="text-base font-semibold text-white">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 shadow-sm flex flex-col gap-5">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800">
            <Icon name="person" className="text-blue-400 text-[22px]" />
            <h2 className="text-base font-bold font-display text-white">Informations personnelles &amp; Coordonnées</h2>
          </div>
          <div className="flex flex-col divide-y divide-slate-800/60 text-sm">
            <Ligne label="Date de naissance & Nationalité">
              <span className="text-white font-medium">
                {dateMoisLong(e.dateNaissance).replace(/^0/, '')} • {e.nationalite}
              </span>
            </Ligne>
            <Ligne label="Téléphone professionnel">
              <span className="text-white font-semibold font-mono text-sm">{e.telPro}</span>
            </Ligne>
            <Ligne label="Téléphone personnel">
              <span className="text-slate-200 font-mono text-sm">{e.telPerso}</span>
            </Ligne>
            <Ligne label="Email professionnel">
              <span className="text-white font-medium">{e.emailPro}</span>
            </Ligne>
            <Ligne label="Email personnel">
              <span className="text-slate-200">{e.emailPerso || '—'}</span>
            </Ligne>
            <Ligne label="Adresse">
              <span className="text-white font-medium">{e.adresse}</span>
            </Ligne>
            <Ligne label="Contact d'urgence">
              <span className="text-white font-semibold">
                {e.urgenceNom} <span className="text-slate-400 font-mono font-normal">({e.urgenceTel})</span>
              </span>
            </Ligne>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 shadow-sm flex flex-col gap-5">
          <div className="flex items-center justify-between gap-2.5 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <Icon name="badge" className="text-blue-400 text-[22px]" />
              <h2 className="text-base font-bold font-display text-white">Données administratives &amp; Contrat</h2>
            </div>
            <button
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                sensibleVisible ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
              }`}
              onClick={reveler}
              title="La consultation des données sensibles est journalisée"
              type="button"
            >
              <Icon name={sensibleVisible ? 'visibility_off' : 'visibility'} className="text-[15px]" />
              {sensibleVisible ? 'Masquer' : 'Afficher les données sensibles'}
            </button>
          </div>
          <div className="flex flex-col divide-y divide-slate-800/60 text-sm">
            <Ligne label="Type de contrat">
              <span className="text-white font-semibold">{e.contrat}</span>
            </Ligne>
            <Ligne label="Régime horaire">
              <span className="text-white font-medium">{e.heuresHebdo}h / semaine</span>
            </Ligne>
            <Ligne label="Lieu de travail">
              <span className="text-white font-medium">{e.lieuTravail}</span>
            </Ligne>
            <Ligne label="N° CNSS">{sensible(e.cnss)}</Ligne>
            <Ligne label="N° IFU">{sensible(e.ifu)}</Ligne>
            <Ligne label="Compte bancaire">{sensible(e.compteBancaire, 'text-white font-mono text-xs sm:text-sm font-semibold truncate')}</Ligne>
            <Ligne label="NPI / CIP">
              <div className="flex items-center gap-2">
                {sensible(e.npi)}
                {e.npiVerifie ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Vérifié</span>
                ) : (
                  <button
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20"
                    onClick={async () => {
                      const ok = await dialog.confirm({
                        titre: 'Marquer le NPI comme vérifié ?',
                        tone: 'info',
                        icon: 'verified_user',
                        message: "Confirmez que le numéro a été contrôlé sur une pièce d'identité officielle.",
                        confirmer: 'Confirmer la vérification',
                      });
                      if (!ok) return;
                      try {
                        await modifierEmploye(user, id, { npiVerifie: true });
                        void dialog.alert({ titre: 'NPI vérifié', tone: 'success', message: `Le NPI de ${e.prenom} ${e.nom} est désormais marqué comme vérifié.` });
                      } catch (err) {
                        void dialog.alert({ titre: 'Action impossible', tone: 'danger', message: messageErreur(err) });
                      }
                    }}
                    type="button"
                  >
                    Marquer vérifié
                  </button>
                )}
              </div>
            </Ligne>
          </div>
        </div>
      </div>

      {/* Rémunération & carrière */}
      <Card
        droite={
          <div className="flex items-center gap-2">
            <button
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                sensibleVisible ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
              }`}
              onClick={reveler}
              type="button"
            >
              <Icon name={sensibleVisible ? 'visibility_off' : 'visibility'} className="text-[15px]" />
              {sensibleVisible ? 'Masquer les montants' : 'Afficher les montants'}
            </button>
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm"
              onClick={() => setEvolution(true)}
              type="button"
            >
              <Icon name="trending_up" className="text-[16px]" />
              Nouvelle évolution
            </button>
          </div>
        }
        icon="payments"
        id="remuneration"
        sousTitre="Salaire, primes et historique des promotions — modifiables uniquement par une évolution datée"
        titre="Rémunération & carrière"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 flex flex-col gap-3">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Salaire de base mensuel</div>
              <div className="font-display text-2xl font-bold text-white mt-1">{montant(e.salaireBase)}</div>
              <div className="mt-3 flex flex-col gap-1.5 text-xs">
                {e.primesFixes.map((p) => (
                  <div key={p.libelle} className="flex justify-between gap-3">
                    <span className="text-slate-400">
                      {p.libelle} {mentionExoneration(p) && <span className="text-[10px] text-emerald-400">({mentionExoneration(p)})</span>}
                    </span>
                    <span className="font-mono text-slate-200">{montant(p.montant)}</span>
                  </div>
                ))}
                {avantagesE.map((a) => (
                  <div key={a.code} className="flex justify-between gap-3">
                    <span className="text-slate-400">
                      Avantage en nature : {a.libelle} <span className="text-[10px] text-blue-300">(forfait CGI art. 123{e.dirigeant ? ', barème dirigeant' : ''})</span>
                    </span>
                    <span className="font-mono text-slate-200">{montant(a.montant)}</span>
                  </div>
                ))}
                {e.premierEmploi && <div className="text-[11px] text-emerald-400">Premier emploi : VPS exonéré jusqu'au {dateCourte(ajouterJours(ajouterMois(e.dateEmbauche, 24), -1))} (CGI art. 192-4)</div>}
                <div className="flex justify-between gap-3 pt-2 mt-1 border-t border-slate-800">
                  <span className="text-slate-400">Brut mensuel • net estimé</span>
                  <span className="font-mono text-white">
                    {montant(simulation.brut)} • {montant(simulation.net)}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400">Coût employeur estimé</span>
                  <span className="font-mono text-slate-300">{montant(simulation.cout)}</span>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Dernier salaire versé</div>
              {dernierePaie ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-300">
                    {moisLong(dernierePaie.campagne.mois)} • payé le {dateCourte(dateKey(new Date(dernierePaie.campagne.datePaiement!)))}
                  </span>
                  <span className="font-mono text-emerald-400 font-semibold">{montant(dernierePaie.ligne.net)}</span>
                </div>
              ) : (
                <span className="text-slate-500">Aucune paie versée.</span>
              )}
            </div>
          </div>
          <div className="lg:col-span-7">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-3">Parcours</div>
            <ol className="relative border-l border-slate-800 ml-2 flex flex-col gap-4">
              {parcours.map((ev) => {
                const avenant = ev.documentId ? db.documents.find((d) => d.id === ev.documentId) : undefined;
                const hausse = ev.avant && ev.avant.salaireBase ? ((ev.apres.salaireBase - ev.avant.salaireBase) / ev.avant.salaireBase) * 100 : 0;
                return (
                  <li key={ev.id} className="ml-5">
                    <span
                      className={`absolute -left-[7px] mt-1 w-3.5 h-3.5 rounded-full border-2 ${
                        ev.statut === 'planifiee' ? 'bg-slate-900 border-amber-400' : ev.type === 'embauche' ? 'bg-slate-600 border-slate-500' : 'bg-brand-500 border-brand-400'
                      }`}
                    ></span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-white">{LIBELLE_EVOLUTION[ev.type]}</span>
                      <span className="text-[11px] text-slate-500 font-mono">{dateCourte(ev.dateEffet)}</span>
                      {ev.statut === 'planifiee' && <Badge icon="schedule" tone="amber" size="xs">Planifiée</Badge>}
                      {hausse !== 0 && <Badge size="xs" tone={hausse > 0 ? 'emerald' : 'amber'}>{`${hausse > 0 ? '+' : ''}${hausse.toFixed(1)} %`}</Badge>}
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {ev.avant && ev.avant.poste !== ev.apres.poste ? (
                        <>
                          {ev.avant.poste} → <span className="text-white">{ev.apres.poste}</span>
                        </>
                      ) : (
                        ev.apres.poste
                      )}
                      {ev.avant && ev.avant.departement !== ev.apres.departement && <span className="text-slate-400"> • {ev.apres.departement}</span>}
                      <span className="text-slate-500"> • </span>
                      <span className="font-mono text-slate-400">{montant(ev.apres.salaireBase)}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {ev.motif} — décidé par {ev.decidePar}
                      {avenant && (
                        <button className="ml-2 text-brand-400 hover:text-brand-300 font-medium" onClick={() => telecharger(avenant)} type="button">
                          Avenant PDF
                        </button>
                      )}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <Card className="lg:col-span-5" icon="pie_chart" sousTitre={`Calcul automatique • ${nombre(droits.moisAcquis)} mois acquis en ${droits.annee}`} titre="Droits aux congés">
          <div className="flex flex-col gap-4">
            {[
              { l: 'Congés payés jouissables (reliquats compris)', s: droits.cp, c: 'bg-brand-500' },
              ...droits.detailCp.periodes
                .filter((pe) => pe.statut === 'en_acquisition')
                .map((pe) => ({
                  l: `En acquisition ${pe.annee} (jouissables le ${dateCourte(pe.jouissableDu)})`,
                  s: { acquis: pe.acquis, consomme: pe.pris, enAttente: 0, restant: pe.restant },
                  c: 'bg-brand-400',
                })),
              { l: 'Permissions familiales', s: droits.permissions, c: 'bg-emerald-500' },
            ].map(({ l, s, c }) => (
              <div key={l} className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">{l}</span>
                  <span className="font-mono text-white font-bold">
                    {nombre(s.restant)} j <span className="text-slate-400 font-normal">/ {nombre(s.acquis)} j</span>
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-900/60 border border-slate-800/80 rounded-full overflow-hidden">
                  <div className={`h-full ${c} rounded-full`} style={{ width: `${s.acquis ? Math.max(0, (s.restant / s.acquis) * 100) : 0}%` }}></div>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Consommé : {nombre(s.consomme)} j</span>
                  <span className={s.enAttente ? 'text-amber-400' : ''}>En attente : {nombre(s.enAttente)} j</span>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800 text-xs">
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
                <div className="text-slate-400">Maladie (année)</div>
                <div className="font-mono text-white font-semibold mt-0.5">{nombre(droits.maladie)} j</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
                <div className="text-slate-400">Heures supp. (année)</div>
                <div className="font-mono text-white font-semibold mt-0.5">{dureeHM(heuresSupAnnee)}</div>
              </div>
            </div>
          </div>
        </Card>

        <Card
          className="lg:col-span-7"
          droite={
            <div className="flex gap-2">
              <Badge tone="slate">{stats.joursTravailles} j travaillés</Badge>
              <Badge tone={stats.retards ? 'rose' : 'emerald'}>{stats.retards} retard(s) non justifié(s)</Badge>
              <Badge tone={stats.absences ? 'rose' : 'slate'}>{stats.absences} absence(s)</Badge>
            </div>
          }
          flush
          icon="history"
          id="pointages"
          sousTitre={`${moisLong(mois)} • ${dureeHM(stats.minutes)} travaillées`}
          titre="Pointages récents"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className={THEAD_ROW}>
                  <th className="py-3 px-5">Date</th>
                  <th className="py-3 px-4">Horaires</th>
                  <th className="py-3 px-4">Durée</th>
                  <th className="py-3 px-4">Retard</th>
                  <th className="py-3 px-5">Lieu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {pointages.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/40 transition-colors cursor-pointer" onClick={() => setPointage(p)}>
                    <td className="py-3 px-5 text-xs font-medium">{jourMois(p.date)}</td>
                    <td className="py-3 px-4 font-mono text-xs">
                      {heureHM(p.arrivee)} — {p.depart ? heureHM(p.depart) : '…'}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs">{dureeHM(minutesTravaillees(p, now))}</td>
                    <td className="py-3 px-4">
                      {estEnRetard(p, db.parametres) ? (
                        <Badge tone={retardJustifie(db, p) ? 'amber' : 'rose'}>
                          {p.retardMinutes} min{retardJustifie(db, p) ? ' • justifié' : ''}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-3 px-5" onClick={(ev) => ev.stopPropagation()}>
                      <GeoBadge geo={p.geo} />
                    </td>
                  </tr>
                ))}
                {pointages.length === 0 && (
                  <tr>
                    <td className="py-6 px-5 text-center text-xs text-slate-500" colSpan={5}>
                      Aucun pointage enregistré.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card icon="folder_open" sousTitre="Coffre-fort numérique du collaborateur" titre="Documents">
          <div className="flex flex-col gap-2.5">
            {documents.length === 0 && <p className="text-xs text-slate-500">Aucun document.</p>}
            {documents.map((d) => {
              const style = STYLE_CATEGORIE[d.categorie];
              return (
                <div key={d.id} className="flex items-center justify-between gap-3">
                  <button className="flex items-center gap-3 min-w-0 text-left" onClick={() => setDocument(d)} type="button">
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${style.iconClass}`}>
                      <Icon name={style.icon} className="text-[16px]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-200 truncate hover:text-white">{d.titre}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {d.code} • {dateCourte(dateKey(new Date(d.date)))}
                      </div>
                    </div>
                  </button>
                  <button className="text-slate-400 hover:text-brand-400 transition-colors" onClick={() => telecharger(d)} title="Télécharger" type="button">
                    <Icon name="download" className="text-[16px]" />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
        <Card icon="policy" sousTitre="Actions concernant ce collaborateur" titre="Historique & traçabilité">
          <div className="flex flex-col gap-3">
            {historique.length === 0 && <p className="text-xs text-slate-500">Aucune action enregistrée.</p>}
            {historique.map((a) => {
              const meta = ACTIONS_AUDIT[a.action];
              return (
                <div key={a.id} className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Icon name={meta.icon} className="text-[16px] text-slate-400 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-xs text-slate-200 truncate">
                        {meta.label} <span className="text-slate-500">par</span> {a.acteur}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{a.details}</div>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500 shrink-0">{dateHeure(a.date)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <EmployeFormModal
        employe={e}
        onClose={() => setEdition(false)}
        onSave={async (data) => {
          await modifierEmploye(user, id, data);
          setEdition(false);
          void dialog.alert({ titre: 'Dossier mis à jour', tone: 'success', message: "Les modifications sont enregistrées, le collaborateur est notifié et l'action est tracée dans le journal d'audit." });
        }}
        open={edition}
      />
      <EvolutionModal
        employe={e}
        onClose={() => setEvolution(false)}
        onEnregistree={async (ev) => {
          const avenant = ev.documentId ? getDB().documents.find((d) => d.id === ev.documentId) : undefined;
          const choix = await dialog.alert({
            titre: ev.statut === 'appliquee' ? 'Évolution appliquée' : 'Évolution planifiée',
            tone: 'success',
            icon: 'trending_up',
            message:
              ev.statut === 'appliquee'
                ? `${e.prenom} ${e.nom} occupe désormais le poste de ${ev.apres.poste}. La prochaine paie tiendra compte du nouveau salaire (au prorata si l'effet est en cours de mois).`
                : `La nouvelle situation de ${e.prenom} ${e.nom} s'appliquera automatiquement le ${dateCourte(ev.dateEffet)}.`,
            details: "L'avenant au contrat a été généré et le collaborateur a été notifié.",
            actions: avenant
              ? [
                  { label: "Télécharger l'avenant", value: 'pdf', variant: 'secondary', icon: 'download' },
                  { label: 'Compris', value: 'ok', variant: 'primary' },
                ]
              : undefined,
          });
          if (choix === 'pdf' && avenant) telecharger(avenant);
        }}
        open={evolution}
      />
      <GenererDocumentModal employeId={id} onClose={() => setGeneration(false)} onGenere={(d) =>
          void dialog.alert({
            titre: 'Document généré',
            tone: 'success',
            icon: 'picture_as_pdf',
            message: `${d.titre} a été téléchargé et ajouté au coffre de ${e.prenom} ${e.nom}, qui a été notifié.`,
            details: <span className="font-mono">Code de vérification : {d.code}</span>,
          })
        } open={generation} />
      <SortieModal
        employe={sortieOuverte ? e : null}
        onClose={() => setSortieOuverte(false)}
        onEnregistree={(so) => {
          setSortieOuverte(false);
          void dialog.alert({
            titre: 'Sortie enregistrée',
            tone: 'success',
            icon: 'logout',
            message:
              so.statut === 'effective'
                ? `La sortie de ${e.prenom} ${e.nom} est effective : son accès est désactivé et le certificat de travail a été généré.`
                : `Le départ de ${e.prenom} ${e.nom} est planifié au ${dateCourte(so.dateSortie)}. Son accès sera désactivé le lendemain et le certificat de travail généré automatiquement.`,
            details: `Les indemnités (${fcfa(so.rubriques.reduce((t, r) => t + r.montant, 0))}) seront versées avec la paie de ${moisLong(moisDe(so.dateSortie))}.`,
          });
        }}
      />
      <MotifModal
        confirmer="Annuler la sortie"
        icone="undo"
        labelMotif="Motif de l'annulation"
        onClose={() => setAnnulation(false)}
        onConfirm={async (motif) => {
          if (!sortie) return;
          await annulerSortie(user, sortie.id, motif);
          setAnnulation(false);
          void dialog.alert({ titre: 'Sortie annulée', tone: 'success', message: `${e.prenom} ${e.nom} reste en poste. L'annulation est tracée dans le journal d'audit.` });
        }}
        open={annulation}
        resume={sortie && <>Sortie {sortie.reference} — {MOTIFS_SORTIE[sortie.motif].libelle}, dernier jour prévu le {dateCourte(sortie.dateSortie)}.</>}
        titre="Annuler la sortie ?"
        tone="info"
      />
      <PointageDetailModal nom={`${e.prenom} ${e.nom}`} onClose={() => setPointage(null)} pointage={pointage} />
      <DocumentDetailModal doc={document} onClose={() => setDocument(null)} titulaire={`${e.prenom} ${e.nom}`} />
    </>
  );
}

import { useState, type ReactNode } from 'react';
import Icon from '../../components/ui/Icon';
import { useDialog } from '../../components/ui/Dialog';
import { modifierCoordonnees, type Coordonnees } from '../../db/api';
import { useEspaceEmploye } from '../../hooks/useEspaceEmploye';
import { LIBELLE_EVOLUTION } from '../../config/paie';
import { fcfa } from '../../lib/paie';
import { dateMoisLong, moisLong } from '../../lib/time';
import ModifierProfilModal from './modals/ModifierProfilModal';

function Ligne({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
      <span className="text-slate-400 font-medium">{label}</span>
      {children}
    </div>
  );
}

export default function Profil() {
  const { user, db, employe: profil } = useEspaceEmploye();
  const [montantsVisibles, setMontantsVisibles] = useState(false);
  const montant = (n: number) => (montantsVisibles ? fcfa(n) : '•••••• FCFA');
  const parcours = db.evolutions.filter((ev) => ev.employeId === profil.id).sort((a, b) => b.dateEffet.localeCompare(a.dateEffet));
  const dernierePaie = db.campagnesPaie
    .filter((c) => c.statut === 'payee')
    .sort((a, b) => b.mois.localeCompare(a.mois))
    .map((c) => ({ mois: moisLong(c.mois), net: c.lignes.find((l) => l.employeId === profil.id)?.net }))
    .find((x): x is { mois: string; net: number } => x.net !== undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const dialog = useDialog();

  const handleSave = async (coordonnees: Coordonnees) => {
    await modifierCoordonnees(user, coordonnees);
    void dialog.alert({ titre: 'Modifications enregistrées', tone: 'success', message: 'Vos coordonnées sont à jour. Le service RH en a été informé.' });
  };

  return (
    <>
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold font-display text-white tracking-tight">Mon Profil</h1>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            {profil.matricule} • {profil.contrat} Actif
          </span>
        </div>
        <div>
          <button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all shadow-sm shadow-blue-600/20"
            onClick={() => setModalOpen(true)}
            type="button"
          >
            <Icon name="edit" className="text-[18px]" />
            <span>Modifier les coordonnées</span>
          </button>
        </div>
      </div>

      {/* Bandeau de synthèse */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 divide-y md:divide-y-0 md:divide-x divide-slate-800/70">
          <div className="flex flex-col">
            <span className="text-xs uppercase font-medium tracking-wider text-slate-400 mb-1">Collaborateur</span>
            <span className="text-base font-semibold text-white">{profil.prenom} {profil.nom}</span>
          </div>
          <div className="flex flex-col pt-4 md:pt-0 md:pl-6">
            <span className="text-xs uppercase font-medium tracking-wider text-slate-400 mb-1">Poste</span>
            <span className="text-base font-semibold text-white">{profil.poste}</span>
          </div>
          <div className="flex flex-col pt-4 md:pt-0 md:pl-6">
            <span className="text-xs uppercase font-medium tracking-wider text-slate-400 mb-1">Département</span>
            <span className="text-base font-semibold text-white">{profil.departement}</span>
          </div>
          <div className="flex flex-col pt-4 md:pt-0 md:pl-6">
            <span className="text-xs uppercase font-medium tracking-wider text-slate-400 mb-1">Date d'embauche</span>
            <span className="text-base font-semibold text-white">{dateMoisLong(profil.dateEmbauche)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Informations personnelles & Coordonnées */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 shadow-sm flex flex-col gap-5">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800">
            <Icon name="person" className="text-blue-400 text-[22px]" />
            <h2 className="text-base font-bold font-display text-white">Informations personnelles &amp; Coordonnées</h2>
          </div>
          <div className="flex flex-col divide-y divide-slate-800/60 text-sm">
            <Ligne label="Date de naissance & Nationalité">
              <span className="text-white font-medium">{dateMoisLong(profil.dateNaissance).replace(/^0/, '')} • {profil.nationalite}</span>
            </Ligne>
            <Ligne label="Téléphone professionnel">
              <span className="text-white font-semibold font-mono text-sm">{profil.telPro}</span>
            </Ligne>
            <Ligne label="Téléphone personnel">
              <span className="text-slate-200 font-mono text-sm">{profil.telPerso}</span>
            </Ligne>
            <Ligne label="Email professionnel">
              <span className="text-white font-medium">{profil.emailPro}</span>
            </Ligne>
            <Ligne label="Email personnel">
              <span className="text-slate-200">{profil.emailPerso}</span>
            </Ligne>
            <Ligne label="Adresse">
              <span className="text-white font-medium">{profil.adresse}</span>
            </Ligne>
            <Ligne label="Contact d'urgence">
              <span className="text-white font-semibold">
                {profil.urgenceNom}{' '}
                <span className="text-slate-400 font-mono font-normal">({profil.urgenceTel})</span>
              </span>
            </Ligne>
          </div>
        </div>

        {/* Données administratives & Contrat */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 shadow-sm flex flex-col gap-5">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800">
            <Icon name="badge" className="text-blue-400 text-[22px]" />
            <h2 className="text-base font-bold font-display text-white">Données administratives &amp; Contrat</h2>
          </div>
          <div className="flex flex-col divide-y divide-slate-800/60 text-sm">
            <Ligne label="Type de contrat">
              <span className="text-white font-semibold">{profil.contrat}</span>
            </Ligne>
            <Ligne label="Régime horaire">
              <span className="text-white font-medium">{profil.heuresHebdo}h / semaine</span>
            </Ligne>
            <Ligne label="Responsable direct">
              <span className="text-white font-semibold">{profil.responsable}</span>
            </Ligne>
            <Ligne label="Lieu de travail">
              <span className="text-white font-medium">{profil.lieuTravail}</span>
            </Ligne>
            <Ligne label="N° CNSS">
              <span className="text-white font-mono font-semibold">{profil.cnss}</span>
            </Ligne>
            <Ligne label="N° IFU">
              <span className="text-white font-mono font-semibold">{profil.ifu}</span>
            </Ligne>
            <Ligne label="Compte bancaire">
              <span className="text-white font-mono text-xs sm:text-sm font-semibold truncate">{profil.compteBancaire}</span>
            </Ligne>
            <Ligne label="NPI / CIP">
              <div className="flex items-center gap-2">
                <span className="text-white font-mono font-semibold">{profil.npi}</span>
                {profil.npiVerifie && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Vérifié
                  </span>
                )}
              </div>
            </Ligne>
          </div>
        </div>
      </div>

      {/* Parcours & rémunération */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 shadow-sm flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Icon name="trending_up" className="text-blue-400 text-[22px]" />
            <h2 className="text-base font-bold font-display text-white">Parcours &amp; rémunération</h2>
          </div>
          <button
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border bg-slate-800 text-slate-300 border-slate-700 hover:text-white"
            onClick={() => setMontantsVisibles((v) => !v)}
            type="button"
          >
            <Icon name={montantsVisibles ? 'visibility_off' : 'visibility'} className="text-[15px]" />
            {montantsVisibles ? 'Masquer les montants' : 'Afficher les montants'}
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex flex-col divide-y divide-slate-800/60 text-sm">
            <Ligne label="Salaire de base mensuel brut">
              <span className="text-white font-mono font-semibold">{montant(profil.salaireBase)}</span>
            </Ligne>
            {profil.primesFixes.map((p) => (
              <Ligne key={p.libelle} label={p.libelle}>
                <span className="text-slate-200 font-mono">{montant(p.montant)}</span>
              </Ligne>
            ))}
            <Ligne label="Dernier salaire versé">
              {dernierePaie ? (
                <span className="text-emerald-400 font-mono font-semibold">
                  {montant(dernierePaie.net)} <span className="text-slate-400 font-sans font-normal text-xs">({dernierePaie.mois})</span>
                </span>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </Ligne>
            <p className="pt-3 text-xs text-slate-500">Vos bulletins de paie sont déposés automatiquement dans « Documents » à chaque versement de salaire.</p>
          </div>
          <ol className="relative border-l border-slate-800 ml-2 flex flex-col gap-4">
            {parcours.map((ev) => (
              <li key={ev.id} className="ml-5">
                <span
                  className={`absolute -left-[7px] mt-1 w-3.5 h-3.5 rounded-full border-2 ${
                    ev.statut === 'planifiee' ? 'bg-slate-900 border-amber-400' : ev.type === 'embauche' ? 'bg-slate-600 border-slate-500' : 'bg-blue-500 border-blue-400'
                  }`}
                ></span>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-white">{LIBELLE_EVOLUTION[ev.type]}</span>
                  <span className="text-slate-500 font-mono">{dateMoisLong(ev.dateEffet).replace(/^0/, '')}</span>
                  {ev.statut === 'planifiee' && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">À venir</span>
                  )}
                </div>
                <p className="text-sm text-slate-200 mt-0.5">
                  {ev.apres.poste} <span className="text-slate-500">• {ev.apres.departement}</span>
                </p>
                <p className="text-xs text-slate-500">{ev.motif}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <ModifierProfilModal open={modalOpen} profil={profil} onClose={() => setModalOpen(false)} onSave={handleSave} />
    </>
  );
}

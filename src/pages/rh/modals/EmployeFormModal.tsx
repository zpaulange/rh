import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { DatePicker, Field, LABEL, NumberInput, Select, TextInput, Toggle } from '../../../components/form';
import PrimesEditor from '../../../components/rh/PrimesEditor';
import Icon from '../../../components/ui/Icon';
import { serverNow } from '../../../lib/serverTime';
import { ajouterJours, dateKey } from '../../../lib/time';
import Modal from '../../../components/ui/Modal';
import { useUser } from '../../../auth/AuthContext';
import { useDB } from '../../../db/store';
import type { NouvelEmploye } from '../../../db/api';
import { AVANTAGES_NATURE, LIBELLE_CATEGORIE_PRO } from '../../../config/paie';
import { fcfa, smigApplicable } from '../../../lib/paie';
import type { CategorieProfessionnelle, Employe, Role, TypeAvantageNature } from '../../../types';

const AUCUN = '__aucun__';

const VIDE: NouvelEmploye = {
  civilite: 'M.',
  prenom: '',
  nom: '',
  dateNaissance: '',
  nationalite: 'Béninoise',
  poste: '',
  departement: '',
  service: '',
  dateEmbauche: '',
  contrat: 'CDI',
  categorie: 'execution',
  enfantsACharge: 0,
  avantagesNature: [],
  dirigeant: false,
  premierEmploi: false,
  heuresHebdo: 40,
  responsable: '',
  lieuTravail: 'Siège Cotonou',
  telPro: '+229 ',
  telPerso: '+229 ',
  emailPro: '',
  emailPerso: '',
  adresse: '',
  urgenceNom: '',
  urgenceTel: '+229 ',
  cnss: '',
  ifu: '',
  compteBancaire: '',
  npi: '',
  salaireBase: 0,
  primesFixes: [{ libelle: 'Indemnité de transport', montant: 20000, soumisCnss: false, soumisIts: true, remboursementFrais: true }],
};

function Section({ icon, titre, children }: { icon: string; titre: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
        <Icon name={icon} className="text-[18px] text-blue-400" />
        {titre}
      </legend>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{children}</div>
    </fieldset>
  );
}

const L = LABEL.majusculesDiscret;
const VIA_EVOLUTION = 'Modifiable par une évolution de carrière';
const TEL = "^\\+?[\\d\\s]{8,16}$";

interface Props {
  open: boolean;
  employe?: Employe;
  onClose: () => void;
  /** Enregistrement (envoyé au serveur) : une erreur métier est affichée dans le formulaire */
  onSave: (data: NouvelEmploye, role: Role) => void | Promise<void>;
}

export default function EmployeFormModal({ open, employe, onClose, onSave }: Props) {
  const db = useDB();
  const user = useUser();
  // Seul l'administrateur attribue un rôle autre qu'« employé » (séparation des pouvoirs)
  const choixRole = user.role === 'admin';
  const [f, setF] = useState<NouvelEmploye>(VIDE);
  const [role, setRole] = useState<Role>('employe');
  const [erreur, setErreur] = useState<string | null>(null);
  const edition = Boolean(employe);

  useEffect(() => {
    if (!open) return;
    if (employe) {
      const { id: _id, matricule: _m, avatarUrl: _a, npiVerifie: _n, dateSortie: _s, ...reste } = employe;
      void [_id, _m, _a, _n, _s];
      setF(reste);
    } else setF(VIDE);
    setRole('employe');
    setErreur(null);
  }, [open, employe]);

  const departement = db.departements.find((d) => d.nom === f.departement);
  const today = dateKey(serverNow());

  const set = <K extends keyof NouvelEmploye>(k: K, v: NouvelEmploye[K]) => setF((x) => ({ ...x, [k]: v }));

  const [envoi, setEnvoi] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await onSave({ ...f, prenom: f.prenom.trim(), nom: f.nom.trim(), emailPro: f.emailPro.trim() }, role);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} overlayClassName="bg-black/75">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-start justify-between p-6 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-bold font-display text-white tracking-tight">
              {edition ? `Modifier le dossier — ${employe!.prenom} ${employe!.nom}` : 'Nouveau collaborateur'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {edition ? 'Chaque modification est tracée dans le journal d’audit.' : 'Création du dossier et du compte d’accès (mot de passe temporaire généré).'}
            </p>
          </div>
          <button className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors" onClick={onClose} type="button">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>

        <form className="p-6 flex flex-col gap-6 overflow-y-auto" onSubmit={submit}>
          <Section icon="person" titre="Identité">
            <Field label="Civilité" labelClass={L}>
              <Select
                onChange={(v) => set('civilite', v)}
                options={[
                  { value: 'M.', label: 'M.' },
                  { value: 'Mme', label: 'Mme' },
                ]}
                value={f.civilite}
                variant="profil"
              />
            </Field>
            <Field label="Prénom" labelClass={L}>
              <TextInput autoComplete="off" maxLength={60} onChange={(v) => set('prenom', v)} required value={f.prenom} variant="profil" />
            </Field>
            <Field label="Nom" labelClass={L}>
              <TextInput autoComplete="off" maxLength={60} onChange={(v) => set('nom', v)} required value={f.nom} variant="profil" />
            </Field>
            <Field label="Date de naissance" labelClass={L}>
              <DatePicker max={ajouterJours(today, -16 * 365)} onChange={(v) => set('dateNaissance', v)} required value={f.dateNaissance} variant="profil" />
            </Field>
            <Field label="Nationalité" labelClass={L}>
              <TextInput maxLength={40} onChange={(v) => set('nationalite', v)} required value={f.nationalite} variant="profil" />
            </Field>
            <Field aide="16 chiffres" label="NPI / CIP" labelClass={L}>
              <TextInput
                inputMode="numeric"
                messageErreur="Le NPI comporte 16 chiffres."
                mono
                onChange={(v) => set('npi', v)}
                pattern={'^(\\d\\s*){16}$'}
                required
                value={f.npi}
                variant="profil"
              />
            </Field>
          </Section>

          <Section icon="badge" titre="Poste & contrat">
            <Field aide={edition ? VIA_EVOLUTION : undefined} className="md:col-span-2" label="Poste" labelClass={L}>
              <TextInput disabled={edition} maxLength={80} onChange={(v) => set('poste', v)} required value={f.poste} variant="profil" />
            </Field>
            <Field aide={edition ? VIA_EVOLUTION : 'Structure gérée dans « Organisation »'} label="Département" labelClass={L}>
              <Select
                disabled={edition}
                onChange={(v) => setF((x) => ({ ...x, departement: v, service: '' }))}
                options={db.departements.map((d) => ({ value: d.nom, label: d.nom, description: `${d.code} • ${d.services.length} service(s)` }))}
                placeholder="Sélectionner…"
                required
                value={f.departement}
                variant="profil"
              />
            </Field>
            <Field label="Service" labelClass={L}>
              <Select
                disabled={!departement}
                onChange={(v) => set('service', v === AUCUN ? '' : v)}
                options={[{ value: AUCUN, label: 'Aucun service', description: 'Rattaché directement au département' }, ...(departement?.services ?? []).map((x) => ({ value: x.nom, label: x.nom }))]}
                placeholder={departement ? 'Sélectionner…' : 'Choisir d’abord le département'}
                value={departement ? f.service || AUCUN : ''}
                variant="profil"
              />
            </Field>
            <Field label="Type de contrat" labelClass={L}>
              <Select
                onChange={(v) => set('contrat', v)}
                options={[
                  { value: 'CDI', label: 'CDI', description: 'Contrat à durée indéterminée' },
                  { value: 'CDD', label: 'CDD', description: 'Contrat à durée déterminée' },
                  { value: 'Stage', label: 'Stage', description: 'Convention de stage' },
                ]}
                value={f.contrat}
                variant="profil"
              />
            </Field>
            <Field aide="Détermine le préavis et le maintien du salaire en maladie (CT art. 38 et 53)" label="Catégorie professionnelle" labelClass={L}>
              <Select
                onChange={(v) => set('categorie', v)}
                options={(Object.keys(LIBELLE_CATEGORIE_PRO) as CategorieProfessionnelle[]).map((k) => ({ value: k, label: LIBELLE_CATEGORIE_PRO[k] }))}
                value={f.categorie}
                variant="profil"
              />
            </Field>
            <Field aide="Moins de 15 ans — congé supplémentaire des mères (art. 158)" label="Enfants à charge" labelClass={L}>
              <NumberInput max={20} min={0} onChange={(v) => set('enfantsACharge', v)} unite="enfant(s)" value={f.enfantsACharge} variant="profil" />
            </Field>
            <Field label="Date d'embauche" labelClass={L}>
              <DatePicker max={ajouterJours(today, 90)} min={f.dateNaissance || undefined} onChange={(v) => set('dateEmbauche', v)} required value={f.dateEmbauche} variant="profil" />
            </Field>
            <Field label="Heures / semaine" labelClass={L}>
              <TextInput
                inputMode="numeric"
                max={60}
                min={1}
                mono
                onChange={(v) => set('heuresHebdo', Number(v))}
                required
                suffixe={<span className="text-xs text-slate-500">h</span>}
                type="number"
                value={f.heuresHebdo}
                variant="profil"
              />
            </Field>
            <Field label="Responsable direct" labelClass={L}>
              <TextInput maxLength={80} onChange={(v) => set('responsable', v)} required value={f.responsable} variant="profil" />
            </Field>
            <Field label="Lieu de travail" labelClass={L}>
              <TextInput maxLength={80} onChange={(v) => set('lieuTravail', v)} required value={f.lieuTravail} variant="profil" />
            </Field>
            <Field
              aide={
                edition
                  ? VIA_EVOLUTION
                  : smigApplicable(f.heuresHebdo, f.contrat) !== null
                    ? `Mensuel brut • SMIG : ${fcfa(smigApplicable(f.heuresHebdo, f.contrat)!)} minimum pour ${f.heuresHebdo} h (CT art. 210)`
                    : 'Gratification de stage (hors SMIG)'
              }
              label="Salaire de base"
              labelClass={L}
            >
              <NumberInput disabled={edition} max={50_000_000} min={smigApplicable(f.heuresHebdo, f.contrat) ?? 1} onChange={(v) => set('salaireBase', v)} pas={5000} required unite="FCFA" value={f.salaireBase} variant="profil" />
            </Field>
          </Section>

          {!edition && (
            <fieldset className="flex flex-col gap-3">
              <legend className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
                <Icon name="payments" className="text-[18px] text-blue-400" />
                Primes et indemnités mensuelles
              </legend>
              <PrimesEditor onChange={(p) => set('primesFixes', p)} primes={f.primesFixes} variant="profil" />
            </fieldset>
          )}
          {edition && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-slate-300">
              <Icon name="trending_up" className="text-blue-400 text-[18px]" />
              <span>Le poste, le département, le salaire et les primes évoluent via « Nouvelle évolution » sur la fiche du collaborateur : chaque changement est historisé, daté et donne lieu à un avenant.</span>
            </div>
          )}

          <fieldset className="flex flex-col gap-3">
            <legend className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
              <Icon name="redeem" className="text-[18px] text-blue-400" />
              Avantages en nature &amp; fiscalité
            </legend>
            <p className="text-[11px] text-slate-400 -mt-2">
              Évalués chaque mois au forfait du CGI (art. 123), ajoutés à la base de l'ITS et du VPS puis déduits du net, puisqu'ils sont fournis en nature.
            </p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(AVANTAGES_NATURE) as TypeAvantageNature[]).map((code) => {
                const b = AVANTAGES_NATURE[code];
                const actif = f.avantagesNature.includes(code);
                const valeur = b.taux ? `${b.taux * 100} % du salaire de base` : fcfa(f.dirigeant ? b.cadre : b.employe);
                return (
                  <button
                    key={code}
                    aria-pressed={actif}
                    className={`px-3 py-2 rounded-lg border text-left text-xs transition-colors ${
                      actif ? 'bg-blue-500/10 border-blue-500/40 text-blue-200' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                    onClick={() => set('avantagesNature', actif ? f.avantagesNature.filter((x) => x !== code) : [...f.avantagesNature, code])}
                    type="button"
                  >
                    <span className="block font-semibold">{b.libelle}</span>
                    <span className="block text-[10px] opacity-80">{valeur} / mois</span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Toggle
                aide="Barème « dirigeants et cadres supérieurs » des forfaits (CGI art. 123-3)"
                label="Dirigeant ou cadre supérieur"
                onChange={(v) => set('dirigeant', v)}
                valeur={f.dirigeant}
              />
              <Toggle
                aide="Salarié béninois, premier emploi, déclaré à la CNSS : VPS exonéré 2 ans à compter de l'embauche (CGI art. 192-4)"
                label="Premier emploi"
                onChange={(v) => set('premierEmploi', v)}
                valeur={f.premierEmploi}
              />
            </div>
          </fieldset>

          <Section icon="contact_phone" titre="Coordonnées">
            <Field aide="Sert d'identifiant de connexion" label="Email professionnel" labelClass={L}>
              <TextInput autoComplete="off" onChange={(v) => set('emailPro', v)} required type="email" value={f.emailPro} variant="profil" />
            </Field>
            <Field label="Téléphone professionnel" labelClass={L}>
              <TextInput inputMode="tel" messageErreur="Numéro invalide (ex. +229 97 00 12 34)." mono onChange={(v) => set('telPro', v)} pattern={TEL} required type="tel" value={f.telPro} variant="profil" />
            </Field>
            <Field label="Téléphone personnel" labelClass={L}>
              <TextInput inputMode="tel" messageErreur="Numéro invalide (ex. +229 95 44 88 12)." mono onChange={(v) => set('telPerso', v)} pattern={TEL} required type="tel" value={f.telPerso} variant="profil" />
            </Field>
            <Field label="Email personnel" labelClass={L}>
              <TextInput onChange={(v) => set('emailPerso', v)} type="email" value={f.emailPerso} variant="profil" />
            </Field>
            <Field className="md:col-span-2" label="Adresse" labelClass={L}>
              <TextInput maxLength={150} onChange={(v) => set('adresse', v)} required value={f.adresse} variant="profil" />
            </Field>
            <Field label="Contact d'urgence (Nom)" labelClass={L}>
              <TextInput maxLength={80} onChange={(v) => set('urgenceNom', v)} required value={f.urgenceNom} variant="profil" />
            </Field>
            <Field label="Contact d'urgence (Tél)" labelClass={L}>
              <TextInput inputMode="tel" messageErreur="Numéro invalide." mono onChange={(v) => set('urgenceTel', v)} pattern={TEL} required type="tel" value={f.urgenceTel} variant="profil" />
            </Field>
          </Section>

          <Section icon="shield_lock" titre="Données administratives sensibles">
            <Field label="N° CNSS" labelClass={L}>
              <TextInput mono onChange={(v) => set('cnss', v)} required value={f.cnss} variant="profil" />
            </Field>
            <Field aide="13 chiffres" label="N° IFU" labelClass={L}>
              <TextInput inputMode="numeric" messageErreur="L'IFU comporte 13 chiffres." mono onChange={(v) => set('ifu', v)} pattern={'^\\d{13}$'} required value={f.ifu} variant="profil" />
            </Field>
            <Field label="Compte bancaire (RIB)" labelClass={L}>
              <TextInput mono onChange={(v) => set('compteBancaire', v)} required value={f.compteBancaire} variant="profil" />
            </Field>
            {!edition && choixRole && (
              <Field label="Rôle d'accès" labelClass={L}>
                <Select
                  onChange={setRole}
                  options={[
                    { value: 'employe', label: 'Employé', description: 'Pointage, congés, documents', icone: 'person' },
                    { value: 'rh', label: 'Ressources Humaines', description: 'Gestion du personnel selon les permissions RH', icone: 'badge' },
                    { value: 'admin', label: 'Administrateur', description: 'Tous les droits, rôles et organisation', icone: 'admin_panel_settings' },
                  ]}
                  value={role}
                  variant="profil"
                />
              </Field>
            )}
          </Section>

          {erreur && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
              <Icon name="error" className="text-[16px]" />
              {erreur}
            </div>
          )}

          <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 text-xs text-slate-400">
            <Icon name="lock" className="text-slate-400 text-[18px]" />
            <span>Les données sensibles (CNSS, IFU, RIB, NPI, salaire) sont masquées par défaut et leur consultation est journalisée.</span>
          </div>

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-800">
            <button className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors" onClick={onClose} type="button">
              Annuler
            </button>
            <button className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-sm shadow-blue-600/20 disabled:opacity-60 disabled:cursor-wait" disabled={envoi} type="submit">
              {edition ? 'Enregistrer les modifications' : 'Créer le collaborateur'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

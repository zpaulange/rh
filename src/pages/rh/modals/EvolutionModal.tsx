import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useUser } from '../../../auth/AuthContext';
import { DatePicker, Field, LABEL, NumberInput, PastilleRadio, RadioGroup, Select, Textarea, TextInput } from '../../../components/form';
import PrimesEditor from '../../../components/rh/PrimesEditor';
import { messageErreur, useDialog } from '../../../components/ui/Dialog';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import { LIBELLE_EVOLUTION } from '../../../config/paie';
import { enregistrerEvolution, type NouvelleEvolution } from '../../../db/actions';
import { useDB } from '../../../db/store';
import { fcfa, simulerSalaire, smigApplicable, tauxAncienneteAu } from '../../../lib/paie';
import { serverNow } from '../../../lib/serverTime';
import { ajouterJours, dateKey, dateMoisLong, dernierDuMois, moisDe } from '../../../lib/time';
import type { Employe, EvolutionCarriere, PrimeFixe } from '../../../types';

type TypeChoisi = NouvelleEvolution['type'];

const TYPES: { value: TypeChoisi; icone: string; description: string }[] = [
  { value: 'promotion', icone: 'trending_up', description: 'Nouveau poste, en général revalorisé' },
  { value: 'augmentation', icone: 'payments', description: 'Même poste, salaire revalorisé' },
  { value: 'mutation', icone: 'swap_horiz', description: 'Changement de département' },
  { value: 'reclassement', icone: 'tune', description: 'Ajustement de poste ou de classification' },
];

interface Props {
  open: boolean;
  employe: Employe;
  onClose: () => void;
  onEnregistree: (ev: EvolutionCarriere) => void;
}

const L = LABEL.majusculesDiscret;

export default function EvolutionModal({ open, employe, onClose, onEnregistree }: Props) {
  const user = useUser();
  const db = useDB();
  const dialog = useDialog();
  const today = dateKey(serverNow());
  const departements = useMemo(() => db.departements.map((d) => d.nom).sort((a, b) => a.localeCompare(b)), [db]);

  // Pas de modification rétroactive sur une paie déjà versée
  const dernierMoisPaye = db.campagnesPaie.filter((c) => c.statut === 'payee').map((c) => c.mois).sort().pop();
  const dateMin = [employe.dateEmbauche, dernierMoisPaye ? ajouterJours(dernierDuMois(dernierMoisPaye), 1) : ''].sort().pop()!;
  const premierMoisSuivant = ajouterJours(dernierDuMois(moisDe(today)), 1);

  const [type, setType] = useState<TypeChoisi>('promotion');
  const [dateEffet, setDateEffet] = useState(premierMoisSuivant);
  const [poste, setPoste] = useState(employe.poste);
  const [departement, setDepartement] = useState(employe.departement);
  const [salaire, setSalaire] = useState(employe.salaireBase);
  const [primes, setPrimes] = useState<PrimeFixe[]>(employe.primesFixes);
  const [motif, setMotif] = useState('');

  useEffect(() => {
    if (!open) return;
    setType('promotion');
    setDateEffet(premierMoisSuivant < dateMin ? dateMin : premierMoisSuivant);
    setPoste(employe.poste);
    setDepartement(employe.departement);
    setSalaire(employe.salaireBase);
    setPrimes(employe.primesFixes.map((p) => ({ ...p })));
    setMotif('');
  }, [open, employe]);

  const anciennete = tauxAncienneteAu(employe, dateEffet);
  const avant = simulerSalaire(employe.salaireBase, employe.primesFixes, anciennete);
  const apres = simulerSalaire(salaire, primes, anciennete);
  const hausse = employe.salaireBase ? ((salaire - employe.salaireBase) / employe.salaireBase) * 100 : 0;
  const inchange =
    poste.trim() === employe.poste && departement === employe.departement && salaire === employe.salaireBase && JSON.stringify(primes) === JSON.stringify(employe.primesFixes);

  const appliquerHausse = (pct: number) => setSalaire(Math.round((employe.salaireBase * (1 + pct / 100)) / 1000) * 1000);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (inchange) {
      await dialog.alert({ titre: 'Aucun changement', tone: 'warning', message: 'Modifiez au moins le poste, le département, le salaire ou les primes.' });
      return;
    }
    const immediate = dateEffet <= today;
    const ok = await dialog.confirm({
      titre: `Enregistrer cette ${LIBELLE_EVOLUTION[type].toLowerCase()} ?`,
      tone: 'info',
      icon: 'trending_up',
      message: immediate
        ? `Elle s'applique immédiatement (effet au ${dateMoisLong(dateEffet).replace(/^0/, '')}).`
        : `Elle sera appliquée automatiquement le ${dateMoisLong(dateEffet).replace(/^0/, '')}. Jusque-là, la situation actuelle reste en vigueur.`,
      details: (
        <div className="flex flex-col gap-1">
          <span>
            {employe.poste} → <strong className="text-white">{poste}</strong>
          </span>
          <span className="font-mono">
            {fcfa(employe.salaireBase)} → <strong className="text-white">{fcfa(salaire)}</strong> {hausse ? `(${hausse > 0 ? '+' : ''}${hausse.toFixed(1)} %)` : ''}
          </span>
          <span className="text-slate-400">Un avenant au contrat sera généré et le collaborateur notifié.</span>
        </div>
      ),
      confirmer: 'Enregistrer',
    });
    if (!ok) return;
    try {
      const ev = enregistrerEvolution(user, employe.id, {
        type,
        dateEffet,
        apres: { poste: poste.trim(), departement, salaireBase: salaire, primesFixes: primes.filter((p) => p.libelle.trim() && p.montant > 0) },
        motif: motif.trim(),
      });
      onClose();
      onEnregistree(ev);
    } catch (err) {
      await dialog.alert({ titre: 'Enregistrement impossible', tone: 'danger', message: messageErreur(err) });
    }
  };

  const ligne = (label: string, a: number, b: number) => (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono text-slate-300">
        {fcfa(a)} <span className="text-slate-600">→</span> <span className={b > a ? 'text-emerald-400' : b < a ? 'text-amber-300' : 'text-white'}>{fcfa(b)}</span>
      </span>
    </div>
  );

  return (
    <Modal onClose={onClose} open={open} overlayClassName="bg-black/75">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-start justify-between p-6 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-bold font-display text-white tracking-tight">Nouvelle évolution — {employe.prenom} {employe.nom}</h3>
            <p className="text-xs text-slate-400 mt-0.5">Promotion, augmentation, mutation ou reclassement • historisé avec avenant</p>
          </div>
          <button className="text-slate-400 hover:text-white p-1 rounded-lg" onClick={onClose} type="button">
            <Icon className="text-[20px]" name="close" />
          </button>
        </div>
        <form className="p-6 flex flex-col gap-5 overflow-y-auto" onSubmit={(e) => void submit(e)}>
          <Field label="Nature de l'évolution" labelClass={L}>
            <RadioGroup
              ariaLabel="Nature de l'évolution"
              carteActive="flex items-start gap-2.5 p-3 rounded-xl border border-brand-500/60 bg-brand-500/10 cursor-pointer"
              carteInactive="flex items-start gap-2.5 p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:border-slate-700 cursor-pointer"
              className="grid grid-cols-2 md:grid-cols-4 gap-2"
              onChange={setType}
              options={TYPES.map((t) => ({
                value: t.value,
                contenu: (actif) => (
                  <>
                    <PastilleRadio active={actif} />
                    <span className="min-w-0">
                      <span className={`flex items-center gap-1 text-xs font-semibold ${actif ? 'text-white' : 'text-slate-200'}`}>
                        <Icon className={`text-[15px] ${actif ? 'text-brand-400' : 'text-slate-400'}`} name={t.icone} />
                        {LIBELLE_EVOLUTION[t.value]}
                      </span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">{t.description}</span>
                    </span>
                  </>
                ),
              }))}
              value={type}
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field aide={dernierMoisPaye ? `Paie versée jusqu'à ${dateMoisLong(dernierDuMois(dernierMoisPaye)).slice(3)}` : undefined} label="Date d'effet" labelClass={L}>
              <DatePicker min={dateMin} onChange={setDateEffet} required value={dateEffet} variant="profil" />
            </Field>
            <Field className="md:col-span-2" label="Poste" labelClass={L}>
              <TextInput maxLength={80} onChange={setPoste} required value={poste} variant="profil" />
            </Field>
            <Field label="Département" labelClass={L}>
              <Select onChange={setDepartement} options={departements.map((d) => ({ value: d, label: d }))} required value={departement} variant="profil" />
            </Field>
            <Field className="md:col-span-2" label="Salaire de base mensuel" labelClass={L}>
              <div className="flex gap-2">
                <div className="flex-1">
                  <NumberInput max={50_000_000} min={smigApplicable(employe.heuresHebdo, employe.contrat) ?? 1} onChange={setSalaire} pas={5000} required unite="FCFA" value={salaire} variant="profil" />
                </div>
                {[5, 10, 15].map((p) => (
                  <button
                    key={p}
                    className="px-2.5 rounded-lg text-[11px] font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600"
                    onClick={() => appliquerHausse(p)}
                    type="button"
                  >
                    +{p} %
                  </button>
                ))}
              </div>
              <p className={`text-[11px] mt-1 ${hausse > 0 ? 'text-emerald-400' : hausse < 0 ? 'text-amber-300' : 'text-slate-500'}`}>
                {hausse ? `${hausse > 0 ? '+' : ''}${hausse.toFixed(1)} % (${hausse > 0 ? '+' : ''}${fcfa(salaire - employe.salaireBase)} / mois)` : 'Salaire inchangé'}
              </p>
            </Field>
          </div>

          <Field label="Primes et indemnités mensuelles" labelClass={L}>
            <PrimesEditor onChange={setPrimes} primes={primes} variant="profil" />
          </Field>

          <Field label="Motif (repris dans l'avenant)" labelClass={L}>
            <Textarea maxLength={250} onChange={setMotif} placeholder="Ex : Évaluation annuelle, prise en charge d'une équipe…" required rows={2} value={motif} variant="profil" />
          </Field>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Impact mensuel estimé (mois complet)</div>
            {ligne('Salaire brut', avant.brut, apres.brut)}
            {ligne('Net à payer estimé', avant.net, apres.net)}
            {ligne('Coût employeur (CNSS + VPS)', avant.cout, apres.cout)}
          </div>

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-800">
            <button className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/60" onClick={onClose} type="button">
              Annuler
            </button>
            <button className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-600/20" type="submit">
              Enregistrer l'évolution
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

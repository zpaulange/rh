import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useUser } from '../../../auth/AuthContext';
import { DatePicker, Field, NumberInput, PastilleRadio, RadioGroup, Select, Textarea } from '../../../components/form';
import { messageErreur } from '../../../components/ui/Dialog';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import { MOTIFS_SORTIE } from '../../../config/paie';
import { enregistrerSortie } from '../../../db/actions';
import { useDB } from '../../../db/store';
import { fcfa, mentionExoneration } from '../../../lib/paie';
import { serverNow } from '../../../lib/serverTime';
import { calculerSortie, finPreavis } from '../../../lib/sortie';
import { ajouterJours, dateCourte, dateKey, dernierDuMois, nombre } from '../../../lib/time';
import type { Employe, ExecutionPreavis, MotifSortie, Sortie } from '../../../types';

const PREAVIS: { value: Exclude<ExecutionPreavis, 'sans_objet'>; titre: string; aide: string }[] = [
  { value: 'effectue', titre: 'Préavis effectué', aide: 'Le collaborateur travaille jusqu’à la fin du préavis' },
  { value: 'dispense_employeur', titre: 'Dispense par l’employeur', aide: 'Indemnité compensatrice versée (CT art. 55)' },
  { value: 'non_effectue_salarie', titre: 'Non respecté par le salarié', aide: 'Indemnité due par le salarié, sans retenue automatique' },
];

interface Props {
  employe: Employe | null;
  onClose: () => void;
  onEnregistree: (s: Sortie) => void;
}

// Enregistrement de la sortie d'un collaborateur, avec le calcul des droits en direct (CT, CCGT, CGI)
export default function SortieModal({ employe, onClose, onEnregistree }: Props) {
  const user = useUser();
  const db = useDB();
  const today = dateKey(serverNow());
  const [motif, setMotif] = useState<MotifSortie>('demission');
  const [notification, setNotification] = useState(today);
  const [preavis, setPreavis] = useState<ExecutionPreavis>('effectue');
  const [dateSortie, setDateSortie] = useState(today);
  const [observations, setObservations] = useState('');
  const [joursLiberte, setJoursLiberte] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);

  // Première date possible : après le dernier mois de paie validé ou versé
  const dernierMoisVerrouille = db.campagnesPaie.filter((c) => c.statut !== 'brouillon').map((c) => c.mois).sort().pop();
  const dateMin = [employe?.dateEmbauche ?? today, dernierMoisVerrouille ? ajouterJours(dernierDuMois(dernierMoisVerrouille), 1) : ''].sort().pop()!;

  useEffect(() => {
    if (!employe) return;
    const m: MotifSortie = employe.contrat === 'CDI' ? 'demission' : 'fin_cdd';
    setMotif(m);
    setNotification(today);
    setPreavis(MOTIFS_SORTIE[m].preavis ? 'effectue' : 'sans_objet');
    setDateSortie(MOTIFS_SORTIE[m].preavis ? finPreavis(employe, today) : today < dateMin ? dateMin : today);
    setObservations('');
    setJoursLiberte(0);
    setErreur(null);
    // Réinitialisation à l'ouverture pour un collaborateur
  }, [employe]);

  const regle = MOTIFS_SORTIE[motif];
  const calcul = useMemo(
    () => (employe && dateSortie >= employe.dateEmbauche ? calculerSortie(db, employe, { motif, dateNotification: notification, dateSortie, preavis, joursLiberteNonUtilises: joursLiberte }, today) : null),
    [db, employe, motif, notification, dateSortie, preavis, joursLiberte, today],
  );

  if (!employe) return null;

  const changerMotif = (m: MotifSortie) => {
    setMotif(m);
    const avecPreavis = MOTIFS_SORTIE[m].preavis;
    const p: ExecutionPreavis = avecPreavis ? (preavis === 'sans_objet' ? 'effectue' : preavis) : 'sans_objet';
    setPreavis(p);
    if (avecPreavis && p === 'effectue') setDateSortie(finPreavis(employe, notification));
  };
  const changerNotification = (k: string) => {
    setNotification(k);
    if (regle.preavis && preavis === 'effectue') setDateSortie(finPreavis(employe, k));
    else if (dateSortie < k) setDateSortie(k);
  };
  const changerPreavis = (p: ExecutionPreavis) => {
    setPreavis(p);
    setDateSortie(p === 'effectue' ? finPreavis(employe, notification) : notification < dateMin ? dateMin : notification);
  };

  const bloquant = !calcul || dateSortie < dateMin || notification > dateSortie;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      onEnregistree(enregistrerSortie(user, employe.id, { motif, dateNotification: notification, dateSortie, preavis, observations, joursLiberteNonUtilises: preavis === 'effectue' ? joursLiberte : 0 }));
    } catch (err) {
      setErreur(messageErreur(err));
    }
  };

  return (
    <Modal onClose={onClose} open>
      <div className="bg-[#111827] border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        <div className="px-6 py-5 border-b border-slate-800 bg-[#182234]/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <Icon className="text-[22px]" name="logout" />
            </div>
            <div>
              <h4 className="font-display text-base font-semibold text-white tracking-tight">
                Sortie de {employe.prenom} {employe.nom}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                {employe.matricule} • {employe.contrat} • embauché(e) le {dateCourte(employe.dateEmbauche)} • calcul selon le Code du travail et la CCGT
              </p>
            </div>
          </div>
          <button aria-label="Fermer" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80" onClick={onClose} type="button">
            <Icon className="text-[19px]" name="close" />
          </button>
        </div>

        <form className="p-6 flex flex-col gap-4 overflow-y-auto" onSubmit={submit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Motif de la sortie">
              <Select
                onChange={changerMotif}
                options={(Object.keys(MOTIFS_SORTIE) as MotifSortie[]).map((m) => ({ value: m, label: MOTIFS_SORTIE[m].libelle, description: MOTIFS_SORTIE[m].reference }))}
                value={motif}
              />
            </Field>
            <Field aide="Lettre remise contre décharge ou recommandée (CCGT art. 30)" label="Date de notification écrite">
              <DatePicker feries={db.parametres.joursFeries} min={employe.dateEmbauche} onChange={changerNotification} required value={notification} />
            </Field>
          </div>

          {regle.preavis && (
            <Field label={`Préavis légal : ${employe.categorie === 'maitrise_cadre' ? '3 mois' : employe.categorie === 'occasionnel' ? '15 jours' : '1 mois'} (CT art. 53) — jusqu'au ${dateCourte(finPreavis(employe, notification))}`}>
              <RadioGroup
                ariaLabel="Exécution du préavis"
                carteActive="flex items-start gap-2.5 p-3 rounded-xl border border-brand-500/60 bg-brand-500/10 cursor-pointer"
                carteInactive="flex items-start gap-2.5 p-3 rounded-xl border border-slate-800 bg-[#182234]/50 hover:border-slate-700 cursor-pointer"
                className="grid grid-cols-1 md:grid-cols-3 gap-2"
                onChange={changerPreavis}
                options={PREAVIS.filter((p) => p.value !== 'non_effectue_salarie' || regle.initiative === 'salarie').map((p) => ({
                  value: p.value,
                  contenu: (actif) => (
                    <>
                      <PastilleRadio active={actif} />
                      <span>
                        <span className={`block text-xs font-semibold ${actif ? 'text-white' : 'text-slate-200'}`}>{p.titre}</span>
                        <span className="block text-[11px] text-slate-400 mt-0.5">{p.aide}</span>
                      </span>
                    </>
                  ),
                }))}
                value={preavis}
              />
            </Field>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field aide={`Au plus tôt le ${dateCourte(dateMin)} (paies antérieures validées)`} label="Dernier jour sous contrat">
              <DatePicker feries={db.parametres.joursFeries} min={dateMin < notification ? notification : dateMin} onChange={setDateSortie} required value={dateSortie} />
            </Field>
            {regle.preavis && preavis === 'effectue' && (
              <Field aide="Jours non pris à la demande de l'employeur : indemnité supplémentaire (CT art. 54)" label="Jours de liberté non utilisés">
                <NumberInput max={30} min={0} onChange={setJoursLiberte} unite="j" value={joursLiberte} />
              </Field>
            )}
            <Field label="Observations (facultatif)">
              <Textarea maxLength={300} onChange={setObservations} placeholder="Références de la lettre, contexte…" rows={2} value={observations} />
            </Field>
          </div>

          {calcul && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-slate-500">Salaire mensuel moyen</div>
                  <div className="font-mono text-slate-200">{fcfa(calcul.salaireMoyen)}</div>
                  <div className="text-[10px] text-slate-500">{calcul.moisReference ? `${calcul.moisReference} paie(s) versée(s)` : 'salaire du contrat'}</div>
                </div>
                <div>
                  <div className="text-slate-500">Ancienneté</div>
                  <div className="font-mono text-slate-200">{nombre(calcul.ancienneteAnnees)} an(s)</div>
                </div>
                <div>
                  <div className="text-slate-500">Congés non pris</div>
                  <div className="font-mono text-slate-200">{nombre(calcul.joursCongesRestants)} j</div>
                </div>
                <div>
                  <div className="text-slate-500">Âge à la sortie</div>
                  <div className="font-mono text-slate-200">{calcul.age} ans</div>
                </div>
              </div>
              <div className="divide-y divide-slate-800/70">
                {calcul.rubriques.map((r) => (
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
                {calcul.rubriques.length === 0 && <div className="px-4 py-3 text-xs text-slate-500">Aucune indemnité de rupture : seul le salaire jusqu'au dernier jour est dû.</div>}
                <div className="px-4 py-3 flex items-center justify-between bg-brand-500/5">
                  <span className="text-xs font-semibold text-white">Total des indemnités (brut, ajouté à la dernière paie)</span>
                  <span className="font-mono text-sm font-semibold text-white">{fcfa(calcul.total)}</span>
                </div>
                {calcul.montantDuParSalarie > 0 && (
                  <div className="px-4 py-2.5 text-[11px] text-amber-300 bg-amber-500/5">
                    Indemnité due par le salarié pour préavis non respecté : {fcfa(calcul.montantDuParSalarie)}. Elle n'est pas retenue sur la paie (CT art. 215 à 219) et figure pour information sur le reçu.
                  </div>
                )}
              </div>
            </div>
          )}

          {calcul?.alertes.map((a) => (
            <div key={a} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
              <Icon className="text-[15px] mt-px" name="info" />
              {a}
            </div>
          ))}
          <p className="text-[11px] text-slate-500">
            À la date de sortie : accès désactivé et certificat de travail généré (CT art. 62). Les indemnités sont recalculées et versées avec la paie du mois de sortie ; le reçu pour solde de tout compte est produit au versement (non
            opposable au salarié, CT art. 225).
          </p>
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
            <button
              className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={bloquant}
              type="submit"
            >
              <Icon className="text-[16px]" name="logout" />
              Enregistrer la sortie
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

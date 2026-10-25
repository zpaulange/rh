import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useUser } from '../../../auth/AuthContext';
import { DatePicker, Field, LABEL, PastilleRadio, RadioGroup, Select, Textarea } from '../../../components/form';
import FileDrop from '../../../components/ui/FileDrop';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import { demanderConge } from '../../../db/api';
import { useDB } from '../../../db/store';
import { calculerDroits, disponiblePour, dureeConge } from '../../../lib/rules';
import { joursCalendaires, periodeMaternite } from '../../../lib/maternite';
import { serverNow } from '../../../lib/serverTime';
import { ensembleFeries } from '../../../lib/feries';
import { ajouterJours, dateCourte, dateKey, estOuvre, nombre } from '../../../lib/time';
import { MOTIFS_PERMISSION } from '../../../config/paie';
import type { DebutPeriode, FinPeriode, MotifPermission, TypeConge } from '../../../types';

type LeaveType = Exclude<TypeConge, 'rtt'>;

/** Premier jour ouvré à au moins une semaine (date proposée par défaut) */
function dateParDefaut(): string {
  let k = ajouterJours(dateKey(serverNow()), 7);
  while (!estOuvre(k)) k = ajouterJours(k, 1);
  return k;
}

// Les congés se décomptent en jours ouvrables : lundi → samedi, hors jours fériés (art. 158)
const formatJours = (n: number) => `${nombre(n)} ${n > 1 ? 'jours ouvrables' : 'jour ouvrable'}`;

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

export default function DemandeCongeModal({ open, onClose, onSubmitted }: Props) {
  const user = useUser();
  const db = useDB();
  const today = dateKey(serverNow());
  const employe = db.employes.find((e) => e.id === user.employeId)!;
  const droits = useMemo(() => calculerDroits(db, employe, today), [db, employe, today]);

  const [leaveType, setLeaveType] = useState<LeaveType>('conge_paye');
  const [debut, setDebut] = useState(dateParDefaut);
  const [debutPeriode, setDebutPeriode] = useState<DebutPeriode>('matin');
  const [fin, setFin] = useState(dateParDefaut);
  const [finPeriode, setFinPeriode] = useState<FinPeriode>('fin');
  const [motif, setMotif] = useState('');
  const [motifPermission, setMotifPermission] = useState<MotifPermission>('naissance');
  const [dpa, setDpa] = useState(() => ajouterJours(today, 60));
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const d = dateParDefaut();
    setLeaveType('conge_paye');
    setDebut(d);
    setFin(d);
    setDebutPeriode('matin');
    setFinPeriode('fin');
    setMotif('');
    setMotifPermission('naissance');
    setDpa(ajouterJours(dateKey(serverNow()), 60));
    setFichier(null);
    setErreur(null);
  }, [open]);

  // Préavis en cours (sortie planifiée, préavis effectué) : jours de liberté pour rechercher un emploi (CT art. 54)
  const preavisEnCours = db.sorties.find((x) => x.employeId === employe.id && x.statut === 'planifiee' && x.preavis === 'effectue');
  const LEAVE_TYPES: { value: LeaveType; titre: string; detail: string; icon: string }[] = [
    { value: 'conge_paye', titre: 'Congé Annuel Payé', detail: `${nombre(disponiblePour(droits, 'conge_paye')!)} j dispo${droits.cp.enAttente ? ` (${nombre(droits.cp.enAttente)} j en attente)` : ''}`, icon: 'beach_access' },
    { value: 'permission', titre: 'Permission Exceptionnelle', detail: `Famille, événement (${nombre(disponiblePour(droits, 'permission')!)} j dispo)`, icon: 'event_available' },
    { value: 'maladie', titre: 'Repos Médical / Maladie', detail: 'Justificatif sous 48h', icon: 'medical_services' },
    { value: 'sans_solde', titre: 'Absence sans solde', detail: 'Non rémunérée, sur autorisation', icon: 'money_off' },
    ...(employe.civilite === 'Mme' ? [{ value: 'maternite' as const, titre: 'Congé de maternité', detail: '14 semaines, salaire intégral (art. 170)', icon: 'child_friendly' }] : []),
    ...(preavisEnCours ? [{ value: 'liberte_preavis' as const, titre: 'Jour de liberté (préavis)', detail: 'Recherche d’emploi, 2 j / semaine payés', icon: 'work_history' }] : []),
  ];

  const maternite = leaveType === 'maternite';
  const periodeMat = periodeMaternite(dpa);
  const duree = maternite ? joursCalendaires(periodeMat.debut, periodeMat.fin) : dureeConge(debut, fin, debutPeriode, finPeriode, ensembleFeries(db.parametres));
  const feriesPeriode = db.parametres.joursFeries.filter((j) => j.date >= debut && j.date <= fin && estOuvre(j.date));
  // Solde disponible : demandes déjà en attente déduites
  const solde = disponiblePour(droits, leaveType);
  const restant = solde === null ? null : Math.round((solde - duree) * 10) / 10;
  const maxPermission = leaveType === 'permission' ? MOTIFS_PERMISSION[motifPermission].jours : null;
  const depassePermission = maxPermission !== null && duree > maxPermission;
  const soldeSuffisant = (restant === null || restant >= 0) && !depassePermission;
  const justificatifRequis = (leaveType === 'maladie' || maternite) && !fichier;

  const [envoi, setEnvoi] = useState(false);
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (envoi) return;
    setEnvoi(true);
    try {
      await demanderConge(user, {
        type: leaveType,
        debut: maternite ? periodeMat.debut : debut,
        debutPeriode: maternite ? 'matin' : debutPeriode,
        fin: maternite ? periodeMat.fin : fin,
        finPeriode: maternite ? 'fin' : finPeriode,
        ...(maternite ? { dateAccouchementPresumee: dpa } : {}),
        motif: motif.trim(),
        justificatif: fichier?.name ?? null,
        ...(leaveType === 'permission' ? { motifPermission } : {}),
      });
      onSubmitted();
      onClose();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Envoi impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="bg-[#111827] border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-800 bg-[#182234]/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
              <Icon name="edit_calendar" className="text-[22px]" />
            </div>
            <div>
              <h4 className="font-display text-base font-semibold text-white tracking-tight">Nouvelle demande d'absence</h4>
              <p className="text-xs text-slate-400 mt-0.5">Formulaire de soumission • Exercice {today.slice(0, 4)}</p>
            </div>
          </div>
          <button
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" className="text-[19px]" />
          </button>
        </div>

        <form className="p-6 flex flex-col gap-5 overflow-y-auto max-h-[82vh]" onSubmit={handleSubmit}>
          <Field
            droite={<span className="text-[11px] text-slate-400">Sélectionnez la nature de l'absence</span>}
            label="Type de demande"
            labelClass={LABEL.majuscules.replace('mb-1.5', 'mb-2.5')}
          >
            <RadioGroup
              ariaLabel="Type de demande"
              carteActive="relative flex items-center gap-3 p-3 rounded-xl border border-brand-500/60 bg-brand-500/10 cursor-pointer transition-colors"
              carteInactive="relative flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-[#182234]/50 hover:bg-[#182234] hover:border-slate-700 cursor-pointer transition-colors"
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-1"
              onChange={setLeaveType}
              options={LEAVE_TYPES.map((t) => ({
                value: t.value,
                contenu: (checked) => (
                  <>
                    <PastilleRadio active={checked} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-semibold leading-tight ${checked ? 'text-white' : 'text-slate-200'}`}>{t.titre}</div>
                      <div className={`text-[11px] mt-0.5 ${checked ? 'text-emerald-400 font-medium' : 'text-slate-400'}`}>{t.detail}</div>
                    </div>
                    <Icon name={t.icon} className={`text-[18px] ${checked ? 'text-brand-400' : 'text-slate-400'}`} />
                  </>
                ),
              }))}
              value={leaveType}
            />
          </Field>

          {leaveType === 'permission' && (
            <Field label="Événement (CCGT art. 54)">
              <Select
                ariaLabel="Événement justifiant la permission"
                onChange={setMotifPermission}
                options={(Object.keys(MOTIFS_PERMISSION) as MotifPermission[]).map((k) => ({
                  value: k,
                  label: `${MOTIFS_PERMISSION[k].libelle} — ${MOTIFS_PERMISSION[k].jours === null ? 'durée des épreuves' : `${MOTIFS_PERMISSION[k].jours} j max.`}`,
                }))}
                value={motifPermission}
              />
            </Field>
          )}
          {leaveType === 'sans_solde' && (
            <p className="text-[11px] text-slate-400 -mt-2">
              Aucun salaire n'est dû pour ces jours (CT art. 209) et ils ne comptent pas comme service effectif pour l'acquisition des congés.
            </p>
          )}

          {maternite ? (
            <div className="space-y-3">
              <Field aide="Telle qu'indiquée sur le certificat médical" label="Date présumée de l'accouchement">
                <DatePicker feries={db.parametres.joursFeries} min={today} onChange={setDpa} required value={dpa} />
              </Field>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs text-slate-300 flex flex-col gap-1">
                <span>
                  Congé du <strong className="text-white">{dateCourte(periodeMat.debut)}</strong> au <strong className="text-white">{dateCourte(periodeMat.fin)}</strong> — {duree} jours (14 semaines), salaire intégral.
                </span>
                <span className="text-[11px] text-slate-400">
                  6 semaines avant la date présumée, 8 semaines après l'accouchement. La date réelle déclarée par le service RH ajuste la fin du congé ; prolongation de 4 semaines possible sur certificat (CT art. 170).
                </span>
              </div>
            </div>
          ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field label="Date de début">
                <div className="flex gap-1.5">
                  <DatePicker
                    className="flex-1"
                    feries={db.parametres.joursFeries}
                    max={leaveType === 'liberte_preavis' ? preavisEnCours?.dateSortie : undefined}
                    min={leaveType === 'maladie' ? undefined : today}
                    onChange={(v) => {
                      setDebut(v);
                      if (fin < v) setFin(v);
                    }}
                    required
                    value={debut}
                  />
                  <Select
                    ariaLabel="Demi-journée de début"
                    className="w-24"
                    onChange={setDebutPeriode}
                    options={[
                      { value: 'matin', label: 'Matin' },
                      { value: 'midi', label: 'Midi' },
                    ]}
                    value={debutPeriode}
                  />
                </div>
              </Field>
              <Field label="Date de fin (incluse)">
                <div className="flex gap-1.5">
                  <DatePicker className="flex-1" feries={db.parametres.joursFeries} min={debut} onChange={setFin} required value={fin} />
                  <Select
                    ariaLabel="Demi-journée de fin"
                    className="w-24"
                    onChange={setFinPeriode}
                    options={[
                      { value: 'midi', label: 'Midi' },
                      { value: 'fin', label: 'Fin jrn.' },
                    ]}
                    value={finPeriode}
                  />
                </div>
              </Field>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Icon name="timelapse" className="text-[16px] text-brand-400" />
                <span className="text-slate-300 font-medium">
                  Durée estimée : <strong className="text-white font-semibold">{formatJours(duree)}</strong>
                  {feriesPeriode.length > 0 && (
                    <span className="block text-[11px] text-slate-400 font-normal">
                      Hors jour(s) férié(s) : {feriesPeriode.map((j) => j.libelle).join(', ')}
                    </span>
                  )}
                </span>
              </div>
              {restant === null ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>Sans impact sur le solde
                </span>
              ) : depassePermission ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>Maximum {maxPermission} j pour cet événement
                </span>
              ) : soldeSuffisant ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Solde suffisant ({nombre(restant)} j restants)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>Solde insuffisant ({nombre(solde ?? 0)} j dispo)
                </span>
              )}
            </div>
          </div>
          )}

          <Field
            label={
              <>
                Motif ou précision <span className="text-slate-500">(facultatif pour congé annuel)</span>
              </>
            }
          >
            <Textarea
              maxLength={300}
              onChange={setMotif}
              placeholder="Précisez un motif ou consignes particulières de passation de dossiers..."
              required={leaveType !== 'conge_paye'}
              rows={2}
              value={motif}
            />
          </Field>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Pièce justificative <span className="text-slate-500">(si permission ou certificat médical)</span>
            </label>
            <FileDrop
              file={fichier}
              onChange={setFichier}
              className="border border-dashed border-slate-700 hover:border-brand-500/60 bg-[#182234]/40 rounded-xl p-3.5 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-1"
            >
              <Icon name="cloud_upload" className="text-[20px] text-slate-400" />
              <div className="text-xs text-slate-300">
                <span className="font-medium text-brand-400">Cliquez pour parcourir</span> ou glissez un fichier
              </div>
              <div className="text-[10px] text-slate-500">PDF, PNG, JPG jusqu'à 5 Mo</div>
            </FileDrop>
          </div>

          {erreur && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
              <Icon name="error" className="text-[15px]" />
              {erreur}
            </div>
          )}

          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
              onClick={onClose}
              type="button"
            >
              Annuler
            </button>
            <button
              className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white shadow-sm shadow-brand-600/30 transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={duree === 0 || !soldeSuffisant || justificatifRequis || envoi}
              title={justificatifRequis ? 'Certificat médical requis' : undefined}
              type="submit"
            >
              <Icon name="send" className="text-[16px]" />
              <span>Soumettre la demande</span>
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

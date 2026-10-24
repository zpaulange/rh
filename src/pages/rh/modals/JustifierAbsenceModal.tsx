import { useEffect, useState, type FormEvent } from 'react';
import { useUser } from '../../../auth/AuthContext';
import { DatePicker, Field, PastilleRadio, RadioGroup, Select, Textarea } from '../../../components/form';
import { messageErreur } from '../../../components/ui/Dialog';
import FileDrop from '../../../components/ui/FileDrop';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import { MOTIFS_PERMISSION } from '../../../config/paie';
import { justifierAbsence, type Justification } from '../../../db/actions';
import { useDB } from '../../../db/store';
import type { PeriodeAbsence } from '../../../lib/absences';
import { ensembleFeries } from '../../../lib/feries';
import { peut } from '../../../lib/permissions';
import { calculerDroits, disponiblePour, dureeConge } from '../../../lib/rules';
import { serverNow } from '../../../lib/serverTime';
import { dateCourte, dateKey, nombre } from '../../../lib/time';
import type { DemandeConge, MotifPermission } from '../../../types';

type TypeJustification = Justification['type'];

const TYPES: { value: TypeJustification; titre: string; effet: string; icon: string }[] = [
  { value: 'permission', titre: 'Permission exceptionnelle', effet: 'Payée, hors congé (événement familial, examen)', icon: 'event_available' },
  { value: 'maladie', titre: 'Maladie', effet: 'Certificat médical — maintien du salaire (CT art. 38)', icon: 'medical_services' },
  { value: 'conge_paye', titre: 'Congé payé', effet: 'Payé, déduit du solde de congés', icon: 'beach_access' },
  { value: 'sans_solde', titre: 'Absence autorisée sans solde', effet: 'Justifiée mais non rémunérée (CT art. 209)', icon: 'money_off' },
];

interface Props {
  absence: PeriodeAbsence | null;
  onClose: () => void;
  onJustifiee: (c: DemandeConge) => void;
}

// Justification a posteriori d'une absence non justifiée : elle devient une absence autorisée et validée
export default function JustifierAbsenceModal({ absence, onClose, onJustifiee }: Props) {
  const user = useUser();
  const db = useDB();
  const [type, setType] = useState<TypeJustification>('permission');
  const [motifPermission, setMotifPermission] = useState<MotifPermission>('deces_proche');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [motif, setMotif] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!absence) return;
    setType('permission');
    setMotifPermission('deces_proche');
    setDebut(absence.debut);
    setFin(absence.fin);
    setMotif('');
    setFichier(null);
    setErreur(null);
  }, [absence]);

  if (!absence) return null;

  const e = absence.employe;
  const jours = debut && fin && fin >= debut ? dureeConge(debut, fin, 'matin', 'fin', ensembleFeries(db.parametres)) : 0;
  const soldeCp = disponiblePour(calculerDroits(db, e, dateKey(serverNow())), 'conge_paye') ?? 0;
  const max = type === 'permission' ? MOTIFS_PERMISSION[motifPermission].jours : null;
  const droitType = peut(db, user, type === 'permission' ? 'permissions.valider' : 'conges.valider');
  const probleme =
    !droitType
      ? `Votre rôle ne peut pas valider ce type d'absence.`
      : max !== null && jours > max
        ? `Permission limitée à ${max} j pour cet événement (CCGT art. 54).`
        : type === 'conge_paye' && jours > soldeCp
          ? `Solde de congés insuffisant : ${nombre(soldeCp)} j disponible(s).`
          : type === 'maladie' && !fichier
            ? 'Joignez le certificat médical.'
            : null;

  const submit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    try {
      const c = justifierAbsence(user, e.id, debut, fin, {
        type,
        ...(type === 'permission' ? { motifPermission } : {}),
        motif,
        justificatif: fichier?.name ?? null,
      });
      onJustifiee(c);
    } catch (err) {
      setErreur(messageErreur(err));
    }
  };

  return (
    <Modal onClose={onClose} open>
      <div className="bg-[#111827] border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-800 bg-[#182234]/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Icon className="text-[22px]" name="fact_check" />
            </div>
            <div>
              <h4 className="font-display text-base font-semibold text-white tracking-tight">Justifier l'absence</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                {e.prenom} {e.nom} • {e.matricule} • {absence.jours.length} jour(s) non justifié(s)
              </p>
            </div>
          </div>
          <button aria-label="Fermer" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80" onClick={onClose} type="button">
            <Icon className="text-[19px]" name="close" />
          </button>
        </div>
        <form className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[78vh]" onSubmit={submit}>
          <RadioGroup
            ariaLabel="Nature de la justification"
            carteActive="relative flex items-center gap-3 p-3 rounded-xl border border-brand-500/60 bg-brand-500/10 cursor-pointer"
            carteInactive="relative flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-[#182234]/50 hover:border-slate-700 cursor-pointer"
            className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
            onChange={setType}
            options={TYPES.map((t) => ({
              value: t.value,
              contenu: (actif) => (
                <>
                  <PastilleRadio active={actif} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-semibold ${actif ? 'text-white' : 'text-slate-200'}`}>{t.titre}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{t.value === 'conge_paye' ? `${t.effet} (${nombre(soldeCp)} j dispo)` : t.effet}</div>
                  </div>
                  <Icon className={`text-[18px] ${actif ? 'text-brand-400' : 'text-slate-500'}`} name={t.icon} />
                </>
              ),
            }))}
            value={type}
          />

          {type === 'permission' && (
            <Field label="Événement (CCGT art. 54)">
              <Select
                onChange={setMotifPermission}
                options={(Object.keys(MOTIFS_PERMISSION) as MotifPermission[]).map((k) => ({
                  value: k,
                  label: `${MOTIFS_PERMISSION[k].libelle} — ${MOTIFS_PERMISSION[k].jours === null ? 'durée des épreuves' : `${MOTIFS_PERMISSION[k].jours} j max.`}`,
                }))}
                value={motifPermission}
              />
            </Field>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Du">
              <DatePicker
                feries={db.parametres.joursFeries}
                max={absence.fin}
                min={absence.debut}
                onChange={(v) => {
                  setDebut(v);
                  if (fin < v) setFin(v);
                }}
                required
                value={debut}
              />
            </Field>
            <Field label="Au (inclus)">
              <DatePicker feries={db.parametres.joursFeries} max={absence.fin} min={debut || absence.debut} onChange={setFin} required value={fin} />
            </Field>
          </div>
          <p className="text-[11px] text-slate-400 -mt-2">
            Période d'absence constatée : {dateCourte(absence.debut)}
            {absence.fin !== absence.debut ? ` — ${dateCourte(absence.fin)}` : ''} • durée retenue : <strong className="text-slate-200">{nombre(jours)} jour(s) ouvrable(s)</strong>
          </p>

          <Field label="Motif / justificatif présenté">
            <Textarea maxLength={300} onChange={setMotif} placeholder="Ex. : acte de décès présenté le…, certificat du Dr…" required rows={2} value={motif} />
          </Field>
          <div>
            <span className="block text-xs font-medium text-slate-300 mb-1.5">
              Pièce justificative <span className="text-slate-500">{type === 'maladie' ? '(certificat médical obligatoire)' : '(facultative)'}</span>
            </span>
            <FileDrop
              className="border border-dashed border-slate-700 hover:border-brand-500/60 bg-[#182234]/40 rounded-xl p-3 text-center cursor-pointer flex flex-col items-center gap-1"
              file={fichier}
              onChange={setFichier}
            >
              <Icon className="text-[20px] text-slate-400" name="cloud_upload" />
              <div className="text-xs text-slate-300">
                <span className="font-medium text-brand-400">Cliquez pour parcourir</span> ou glissez un fichier
              </div>
            </FileDrop>
          </div>

          {(erreur ?? probleme) && (
            <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${erreur ? 'bg-rose-500/10 border border-rose-500/20 text-rose-300' : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'}`} role="alert">
              <Icon className="text-[15px] mt-px" name={erreur ? 'error' : 'info'} />
              {erreur ?? probleme}
            </div>
          )}

          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60" onClick={onClose} type="button">
              Annuler
            </button>
            <button
              className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={jours === 0 || Boolean(probleme) || !motif.trim()}
              type="submit"
            >
              <Icon className="text-[16px]" name="fact_check" />
              Valider la justification
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { Field, LABEL, TextInput } from '../../../components/form';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import type { Coordonnees } from '../../../db/api';
import type { Employe } from '../../../types';

const INDICATIF = '+229';

interface Props {
  open: boolean;
  profil: Employe;
  onClose: () => void;
  /** Enregistrement sur le serveur ; une erreur est affichée dans la fenêtre */
  onSave: (coordonnees: Coordonnees) => Promise<void>;
}

const sansIndicatif = (tel: string) => tel.replace(INDICATIF, '').trim();

export default function ModifierProfilModal({ open, profil, onClose, onSave }: Props) {
  const [telephone, setTelephone] = useState(sansIndicatif(profil.telPerso));
  const [email, setEmail] = useState(profil.emailPerso);
  const [adresse, setAdresse] = useState(profil.adresse);
  const [urgenceNom, setUrgenceNom] = useState(profil.urgenceNom);
  const [urgenceTel, setUrgenceTel] = useState(profil.urgenceTel);

  // Repart des valeurs enregistrées à chaque ouverture
  useEffect(() => {
    if (!open) return;
    setTelephone(sansIndicatif(profil.telPerso));
    setEmail(profil.emailPerso);
    setAdresse(profil.adresse);
    setUrgenceNom(profil.urgenceNom);
    setUrgenceTel(profil.urgenceTel);
  }, [open, profil]);

  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    if (open) setErreur(null);
  }, [open]);
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await onSave({
        telPerso: `${INDICATIF} ${telephone.trim()}`,
        emailPerso: email.trim(),
        adresse: adresse.trim(),
        urgenceNom: urgenceNom.trim(),
        urgenceTel: urgenceTel.trim(),
      });
      onClose();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} overlayClassName="bg-black/75">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl p-6 shadow-2xl flex flex-col gap-5">
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-bold font-display text-white tracking-tight">Modifier mes coordonnées</h3>
            <p className="text-xs text-slate-400 mt-0.5">Mettre à jour vos informations de contact et adresse</p>
          </div>
          <button className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors" onClick={onClose} type="button">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Téléphone personnel" labelClass={LABEL.majusculesDiscret}>
              <TextInput
                inputMode="tel"
                messageErreur="Format attendu : 8 chiffres, ex. 95 44 88 12"
                mono
                onChange={setTelephone}
                pattern={'^\\s*(\\d\\s*){8,10}$'}
                prefixe={INDICATIF}
                required
                type="tel"
                value={telephone}
                variant="profil"
              />
            </Field>
            <Field aide="Attribué par l'entreprise" label="Téléphone professionnel" labelClass={LABEL.majusculesDiscret}>
              <TextInput mono readOnly type="text" value={profil.telPro} variant="profil" />
            </Field>
          </div>

          <Field label="Email personnel" labelClass={LABEL.majusculesDiscret}>
            <TextInput onChange={setEmail} required type="email" value={email} variant="profil" />
          </Field>

          <Field label="Adresse de résidence" labelClass={LABEL.majusculesDiscret}>
            <TextInput maxLength={150} onChange={setAdresse} required type="text" value={adresse} variant="profil" />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Contact d'urgence (Nom)" labelClass={LABEL.majusculesDiscret}>
              <TextInput maxLength={80} onChange={setUrgenceNom} required type="text" value={urgenceNom} variant="profil" />
            </Field>
            <Field label="Contact d'urgence (Tél)" labelClass={LABEL.majusculesDiscret}>
              <TextInput inputMode="tel" mono onChange={setUrgenceTel} required type="tel" value={urgenceTel} variant="profil" />
            </Field>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 text-xs text-slate-400">
            <Icon name="info" className="text-slate-400 text-[18px]" />
            <span>Pour modifier vos données contractuelles ou bancaires (RIB, CNSS), contactez le service RH.</span>
          </div>

          {erreur && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300" role="alert">
              <Icon name="error" className="text-[15px] mt-px" />
              {erreur}
            </div>
          )}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
              onClick={onClose}
              type="button"
            >
              Annuler
            </button>
            <button
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-sm shadow-blue-600/20 disabled:opacity-60 disabled:cursor-wait"
              disabled={envoi}
              type="submit"
            >
              Enregistrer les modifications
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

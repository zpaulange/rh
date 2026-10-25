import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useUser } from '../../../auth/AuthContext';
import { DatePicker, Field, LABEL, NumberInput, PastilleRadio, RadioGroup, Select, TextInput, Toggle } from '../../../components/form';
import { messageErreur, useDialog } from '../../../components/ui/Dialog';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import { PAIE } from '../../../config/paie';
import { ajouterElementVariable, supprimerElementVariable } from '../../../db/api';
import { fcfa, mentionExoneration, rubriquesHeuresSup } from '../../../lib/paie';
import { serverNow } from '../../../lib/serverTime';
import { dateKey, moisLong } from '../../../lib/time';
import type { CampagnePaie, LignePaie } from '../../../types';

function EnTete({ icone, titre, sousTitre, onClose }: { icone: string; titre: string; sousTitre: string; onClose: () => void }) {
  return (
    <div className="px-6 py-5 border-b border-slate-800 bg-[#182234]/70 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
          <Icon className="text-[22px]" name={icone} />
        </div>
        <div>
          <h4 className="font-display text-base font-semibold text-white tracking-tight">{titre}</h4>
          <p className="text-xs text-slate-400 mt-0.5">{sousTitre}</p>
        </div>
      </div>
      <button className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80" onClick={onClose} type="button">
        <Icon className="text-[19px]" name="close" />
      </button>
    </div>
  );
}

/* ================= Prime / retenue exceptionnelle ================= */

interface ElementProps {
  campagne: CampagnePaie;
  ligne: LignePaie | null;
  onClose: () => void;
}

export function ElementVariableModal({ campagne, ligne, onClose }: ElementProps) {
  const user = useUser();
  const dialog = useDialog();
  const [nature, setNature] = useState<'prime' | 'retenue'>('prime');
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState(0);
  const [soumisCnss, setSoumisCnss] = useState(true);
  const [soumisIts, setSoumisIts] = useState(true);

  useEffect(() => {
    if (!ligne) return;
    setNature('prime');
    setLibelle('');
    setMontant(0);
    setSoumisCnss(true);
    setSoumisIts(true);
  }, [ligne]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!ligne) return;
    if (montant <= 0) {
      await dialog.alert({ titre: 'Montant invalide', tone: 'warning', message: 'Saisissez un montant supérieur à zéro.' });
      return;
    }
    try {
      await ajouterElementVariable(user, campagne.id, ligne.employeId, { libelle: libelle.trim(), montant, nature, soumisCnss: nature === 'prime' && soumisCnss, soumisIts: nature === 'prime' && soumisIts });
      onClose();
    } catch (err) {
      await dialog.alert({ titre: 'Ajout impossible', tone: 'danger', message: messageErreur(err) });
    }
  };

  return (
    <Modal onClose={onClose} open={ligne !== null}>
      {ligne && (
        <div className="bg-[#111827] border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
          <EnTete icone="add_card" onClose={onClose} sousTitre={`${ligne.nom} • paie de ${moisLong(campagne.mois)}`} titre="Élément variable de paie" />
          <form className="p-6 flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
            <Field label="Nature" labelClass={LABEL.majuscules}>
              <RadioGroup
                ariaLabel="Nature"
                carteActive="flex items-center gap-2.5 p-3 rounded-lg border border-brand-500/60 bg-brand-500/10 cursor-pointer"
                carteInactive="flex items-center gap-2.5 p-3 rounded-lg border border-slate-800 bg-[#182234]/50 hover:border-slate-700 cursor-pointer"
                className="grid grid-cols-2 gap-2"
                onChange={setNature}
                options={[
                  { value: 'prime' as const, titre: 'Prime / gain', aide: 'Bonus, prime exceptionnelle…' },
                  { value: 'retenue' as const, titre: 'Retenue', aide: 'Avance sur salaire, acompte…' },
                ].map((o) => ({
                  value: o.value,
                  contenu: (actif: boolean) => (
                    <>
                      <PastilleRadio active={actif} />
                      <span>
                        <span className={`block text-xs font-semibold ${actif ? 'text-white' : 'text-slate-200'}`}>{o.titre}</span>
                        <span className="block text-[11px] text-slate-500">{o.aide}</span>
                      </span>
                    </>
                  ),
                }))}
                value={nature}
              />
            </Field>
            <Field label="Libellé (imprimé sur le bulletin)" labelClass={LABEL.majuscules}>
              <TextInput maxLength={60} onChange={setLibelle} placeholder={nature === 'prime' ? 'Ex : Prime de fin de projet' : 'Ex : Avance sur salaire du 10/10'} required value={libelle} />
            </Field>
            <Field label="Montant" labelClass={LABEL.majuscules}>
              <NumberInput max={50_000_000} min={0} onChange={setMontant} pas={5000} required unite="FCFA" value={montant} variant="modal" />
            </Field>
            {nature === 'prime' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Toggle aide="Entre dans l'assiette des cotisations CNSS." label="Soumise à la CNSS" onChange={setSoumisCnss} valeur={soumisCnss} />
                <Toggle aide="Entre dans l'assiette de l'impôt (ITS)." label="Soumise à l'ITS" onChange={setSoumisIts} valeur={soumisIts} />
              </div>
            )}
            <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
              <button className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60" onClick={onClose} type="button">
                Annuler
              </button>
              <button className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white flex items-center gap-2" type="submit">
                <Icon className="text-[16px]" name="add" />
                Ajouter à la paie
              </button>
            </div>
          </form>
        </div>
      )}
    </Modal>
  );
}

/* ================= Détail d'une ligne ================= */

function Rubrique({ label, gain, retenue, detail }: { label: ReactNode; gain?: number; retenue?: number; detail?: string }) {
  return (
    <div className="grid grid-cols-[1fr_110px_110px] gap-3 py-2 text-xs border-b border-slate-800/70">
      <span className="text-slate-300">
        {label}
        {detail && <span className="block text-[11px] text-slate-500">{detail}</span>}
      </span>
      <span className="text-right font-mono text-slate-200">{gain ? fcfa(gain) : ''}</span>
      <span className="text-right font-mono text-rose-300">{retenue ? `− ${fcfa(retenue)}` : ''}</span>
    </div>
  );
}

const heures = (m: number) => `${(m / 60).toFixed(2).replace('.', ',')} h`;

export function LignePaieModal({ campagne, ligne, onClose }: { campagne: CampagnePaie; ligne: LignePaie | null; onClose: () => void }) {
  const user = useUser();
  const dialog = useDialog();
  const modifiable = campagne.statut === 'brouillon';

  const retirer = async (id: string, libelle: string) => {
    if (!ligne) return;
    const ok = await dialog.confirm({ titre: `Retirer « ${libelle} » ?`, tone: 'danger', message: 'Le net à payer sera recalculé.', confirmer: 'Retirer' });
    if (!ok) return;
    try {
      await supprimerElementVariable(user, campagne.id, ligne.employeId, id);
    } catch (err) {
      await dialog.alert({ titre: 'Action impossible', tone: 'danger', message: messageErreur(err) });
    }
  };

  return (
    <Modal onClose={onClose} open={ligne !== null}>
      {ligne && (
        <div className="bg-[#111827] border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          <EnTete icone="receipt_long" onClose={onClose} sousTitre={`${ligne.poste} • ${ligne.matricule} • ${moisLong(campagne.mois)}`} titre={`Détail de paie — ${ligne.nom}`} />
          <div className="p-6 overflow-y-auto">
            <div className="grid grid-cols-[1fr_110px_110px] gap-3 pb-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 border-b border-slate-800">
              <span>Rubrique</span>
              <span className="text-right">Gains</span>
              <span className="text-right">Retenues</span>
            </div>
            <Rubrique
              detail={ligne.joursContrat < ligne.joursCalendaires ? `Prorata ${ligne.joursContrat}/${ligne.joursCalendaires} jours (salaire de référence ${fcfa(ligne.salaireReference)})` : `Salaire mensuel ${fcfa(ligne.salaireReference)}`}
              gain={ligne.salaireBase}
              label="Salaire de base"
            />
            {ligne.primesFixes.map((p) => (
              <Rubrique key={p.libelle} detail={`Prime fixe${mentionExoneration(p) ? ` ${mentionExoneration(p)}` : ''}`} gain={p.montant} label={p.libelle} />
            ))}
            {ligne.primeAnciennete > 0 && (
              <Rubrique detail={`${ligne.tauxAnciennete} % du salaire de base (CCGT art. 65)`} gain={ligne.primeAnciennete} label="Prime d’ancienneté" />
            )}
            {ligne.joursFeries > 0 && <Rubrique detail="Chômés et payés, non retenus" label={`Jours fériés du mois (${ligne.joursFeries} j)`} />}
            {rubriquesHeuresSup(ligne.heuresSup, ligne.tauxHoraire).map((r) => (
              <Rubrique key={r.libelle} detail={`${heures(r.minutes)} • taux horaire ${fcfa(ligne.tauxHoraire)}`} gain={r.montant} label={r.libelle} />
            ))}
            {ligne.joursCongePaye > 0 && (
              <Rubrique
                detail={
                  ligne.complementAllocationConge
                    ? 'Le 1/12 des gains des 12 derniers mois dépasse le salaire maintenu (CT art. 165)'
                    : 'Salaire maintenu, au moins égal au 1/12 des gains (CT art. 165)'
                }
                gain={ligne.complementAllocationConge || undefined}
                label={`Congés payés (${ligne.joursCongePaye} j ouvrables)`}
              />
            )}
            {(ligne.indemnitesRupture ?? []).map((r) => (
              <Rubrique
                key={r.code}
                detail={`${r.calcul} • ${r.reference}${mentionExoneration(r) ? ` • ${mentionExoneration(r)}` : ''}${r.exceptionnelle ? ' • ITS avec atténuation (CGI art. 126)' : ''}`}
                gain={r.montant}
                label={r.libelle}
              />
            ))}
            {(ligne.avantagesNature ?? []).map((a) => (
              <Rubrique key={a.code} detail="Forfait mensuel CGI art. 123, soumis à l'ITS et au VPS ; fourni en nature" gain={a.montant} label={`Avantage en nature : ${a.libelle}`} />
            ))}
            {ligne.elements.map((x) => (
              <Rubrique
                key={x.id}
                detail={x.nature === 'prime' ? `Élément variable${mentionExoneration(x) ? ` ${mentionExoneration(x)}` : ''}` : 'Retenue sur net'}
                gain={x.nature === 'prime' ? x.montant : undefined}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    {x.libelle}
                    {modifiable && (
                      <button aria-label={`Retirer ${x.libelle}`} className="text-slate-500 hover:text-rose-400" onClick={() => void retirer(x.id, x.libelle)} type="button">
                        <Icon className="text-[14px]" name="delete" />
                      </button>
                    )}
                  </span>
                }
                retenue={x.nature === 'retenue' ? x.montant : undefined}
              />
            ))}
            {ligne.retenueAbsences > 0 && (
              <Rubrique
                detail={`${ligne.joursAbsence} j d'absence non justifiée${ligne.joursSansSolde ? ` • ${ligne.joursSansSolde} j de congé sans solde` : ''}`}
                label="Absences non rémunérées (salaire et primes fixes)"
                retenue={ligne.retenueAbsences}
              />
            )}
            {ligne.joursMaternite > 0 && (
              <Rubrique
                detail="Salaire intégral maintenu ; paiement selon les modalités de la CNSS (CT art. 170)"
                label={`Congé de maternité (${ligne.joursMaternite} j calendaires)`}
              />
            )}
            {ligne.joursMaladie > 0 && (
              <Rubrique
                detail={
                  ligne.retenueMaladie
                    ? `${ligne.joursMaladieDemiTraitement} j à demi-salaire • ${ligne.joursMaladieNonIndemnises} j au-delà des droits (CT art. 38)`
                    : 'Salaire maintenu, sans délai de carence (CT art. 38, CCGT art. 23)'
                }
                label={`Maladie (${ligne.joursMaladie} j calendaires)`}
                retenue={ligne.retenueMaladie || undefined}
              />
            )}
            <div className="grid grid-cols-[1fr_110px_110px] gap-3 py-2.5 text-xs font-semibold border-b border-slate-700">
              <span className="text-white">Salaire brut</span>
              <span className="text-right font-mono text-white">{fcfa(ligne.brut)}</span>
              <span></span>
            </div>
            <Rubrique detail={`${(PAIE.tauxCnssSalarial * 100).toFixed(1)} % de ${fcfa(ligne.brutCotisable)}`} label="CNSS salariale" retenue={ligne.cnssSalariale} />
            <Rubrique detail={`Barème progressif sur ${fcfa(ligne.baseIts)} (brut arrondi au millier, CGI art. 122 et 125)`} label="ITS" retenue={ligne.its} />
            {(ligne.avantagesNature ?? []).length > 0 && (
              <Rubrique detail="Valeur des avantages déjà fournis" label="Avantages en nature (déduits du net)" retenue={ligne.avantagesNature.reduce((t, a) => t + a.montant, 0)} />
            )}
            {ligne.redevanceOrtb > 0 && <Rubrique detail="Majoration de l'ITS au profit de l'ORTB (CGI art. 125-2)" label="Redevance ORTB" retenue={ligne.redevanceOrtb} />}
            <div className="grid grid-cols-[1fr_110px_110px] gap-3 py-3 mt-1 rounded-lg bg-brand-500/10 border border-brand-500/20 px-3 text-sm font-semibold">
              <span className="text-white">Net à payer</span>
              <span></span>
              <span className="text-right font-mono text-white">{fcfa(ligne.net)}</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
              {[
                ['CNSS employeur', ligne.cnssPatronale],
                [ligne.vpsExonere ? `VPS (exonéré ${fcfa(ligne.vpsExonere)}, 1er emploi)` : 'VPS', ligne.vps],
                ['Coût employeur', ligne.coutEmployeur],
              ].map(([l, v]) => (
                <div key={l as string} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
                  <div className="text-slate-400">{l}</div>
                  <div className="font-mono text-slate-200 mt-0.5">{fcfa(v as number)}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[11px] text-slate-500">Virement sur {ligne.compteBancaire}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ================= Versement ================= */

interface PaiementProps {
  campagne: CampagnePaie | null;
  net: number;
  onClose: () => void;
  onConfirmer: (date: string, mode: string) => void;
}

const MODES = ['Virement bancaire', 'Mobile Money', 'Chèque', 'Espèces'];

export function PaiementModal({ campagne, net, onClose, onConfirmer }: PaiementProps) {
  const today = dateKey(serverNow());
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState(PAIE.modePaiement);
  useEffect(() => {
    if (!campagne) return;
    setDate(today);
    setMode(PAIE.modePaiement);
  }, [campagne, today]);

  return (
    <Modal onClose={onClose} open={campagne !== null}>
      {campagne && (
        <div className="bg-[#111827] border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
          <EnTete icone="payments" onClose={onClose} sousTitre={`${campagne.lignes.length} salarié(s) • net total ${fcfa(net)}`} titre={`Verser les salaires de ${moisLong(campagne.mois)}`} />
          <form
            className="p-6 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              onConfirmer(date, mode);
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date de versement" labelClass={LABEL.majuscules}>
                <DatePicker max={today} min={campagne.dateValidation ? dateKey(new Date(campagne.dateValidation)) : undefined} onChange={setDate} required value={date} />
              </Field>
              <Field label="Mode de paiement" labelClass={LABEL.majuscules}>
                <Select onChange={setMode} options={MODES.map((m) => ({ value: m, label: m }))} value={mode} />
              </Field>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-slate-300 flex items-start gap-2.5">
              <Icon className="text-[18px] text-emerald-400" name="mark_email_read" />
              <span>
                À la confirmation, chaque collaborateur reçoit <strong className="text-white">automatiquement son bulletin de paie certifié</strong> dans son espace Documents, avec une notification indiquant le net versé.
              </span>
            </div>
            <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
              <button className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60" onClick={onClose} type="button">
                Annuler
              </button>
              <button className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2" type="submit">
                <Icon className="text-[16px]" name="task_alt" />
                Confirmer le versement
              </button>
            </div>
          </form>
        </div>
      )}
    </Modal>
  );
}

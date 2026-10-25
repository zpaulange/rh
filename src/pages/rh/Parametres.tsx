import { useEffect, useState, type FormEvent } from 'react';
import { PAIE } from '../../config/paie';
import { Field, NumberInput, TextInput, TimePicker, Toggle } from '../../components/form';
import JoursFeriesCard from './JoursFeriesCard';
import Card from '../../components/ui/Card';
import Icon from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import { messageErreur, useDialog } from '../../components/ui/Dialog';
import { useAuth } from '../../auth/AuthContext';
import { modifierParametres, reinitialiserDemo } from '../../db/api';
import { useEspaceRH } from '../../hooks/useEspaceRH';
import { lienCarte, localiser } from '../../lib/geo';
import type { Parametres as P } from '../../types';

export default function Parametres() {
  const { demo } = useAuth();
  const { user, db, today } = useEspaceRH();
  const dialog = useDialog();
  const [p, setP] = useState<P>(db.parametres);
  const [localisation, setLocalisation] = useState(false);

  useEffect(() => setP(db.parametres), [db.parametres]);

  const modifie = JSON.stringify(p) !== JSON.stringify(db.parametres);
  const set = <K extends keyof P>(k: K, v: P[K]) => setP((x) => ({ ...x, [k]: v }));
  const setSite = <K extends keyof P['site']>(k: K, v: P['site'][K]) => setP((x) => ({ ...x, site: { ...x.site, [k]: v } }));

  const positionActuelle = async () => {
    setLocalisation(true);
    try {
      const pos = await localiser();
      setP((x) => ({ ...x, site: { ...x.site, lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) } }));
      void dialog.alert({ titre: 'Position relevée', tone: 'success', icon: 'my_location', message: `Coordonnées mises à jour (précision ±${Math.round(pos.coords.accuracy)} m). Pensez à enregistrer les paramètres.` });
    } catch (e) {
      void dialog.alert({ titre: 'Localisation impossible', tone: 'danger', icon: 'location_off', message: messageErreur(e) });
    }
    setLocalisation(false);
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (p.heureFin <= p.heureDebut) {
      void dialog.alert({ titre: 'Horaires incohérents', tone: 'warning', message: "L'heure de fin doit être postérieure à l'heure de début." });
      return;
    }
    try {
      await modifierParametres(user, p);
      void dialog.alert({ titre: 'Paramètres enregistrés', tone: 'success', message: "Les nouvelles règles s'appliquent immédiatement à tous les pointages, congés et connexions. La modification est tracée dans le journal d'audit." });
    } catch (err) {
      void dialog.alert({ titre: 'Enregistrement impossible', tone: 'danger', message: messageErreur(err) });
    }
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={submit}>
      <PageHeader subtitle="Règles appliquées automatiquement aux pointages, congés et accès" title="Paramètres">
        <button
          className="h-9 px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium disabled:opacity-40"
          disabled={!modifie}
          onClick={() => setP(db.parametres)}
          type="button"
        >
          Annuler les modifications
        </button>
        <button className="h-9 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-2 shadow-sm disabled:opacity-40" disabled={!modifie} type="submit">
          <Icon name="save" className="text-[16px]" />
          Enregistrer
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card icon="schedule" sousTitre="Base de la détection automatique des retards" titre="Horaires & retards">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Heure d'embauche">
              <TimePicker onChange={(v) => set('heureDebut', v)} required value={p.heureDebut} variant="sombre" />
            </Field>
            <Field label="Heure de fin de journée">
              <TimePicker onChange={(v) => set('heureFin', v)} required value={p.heureFin} variant="sombre" />
            </Field>
            <Field aide="Au-delà, l'arrivée est signalée comme retard aux RH." label="Tolérance de retard">
              <NumberInput max={60} min={0} onChange={(v) => set('toleranceRetard', v)} required unite="min" value={p.toleranceRetard} />
            </Field>
            <Field aide="Durée d’une journée de travail (demi-journées de congé, présence attendue)." label="Durée de travail journalière">
              <NumberInput max={12} min={1} onChange={(v) => set('heuresJour', v)} pas={0.5} required unite="h" value={p.heuresJour} />
            </Field>
          </div>
          <p className="mt-4 p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2">
            <Icon name="dns" className="text-[15px] text-brand-400" />
            Les pointages sont horodatés avec l'heure du serveur : modifier l'horloge du poste ou du téléphone n'a aucun effet.
          </p>
        </Card>

        <Card icon="location_on" sousTitre="Géolocalisation et photo lors du pointage" titre="Zone de pointage">
          <div className="flex flex-col gap-4">
            <Field label="Nom du site">
              <TextInput maxLength={80} onChange={(v) => setSite('nom', v)} required value={p.site.nom} variant="sombre" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Latitude">
                <NumberInput max={90} min={-90} onChange={(v) => setSite('lat', v)} pas={0.000001} required value={p.site.lat} />
              </Field>
              <Field label="Longitude">
                <NumberInput max={180} min={-180} onChange={(v) => setSite('lng', v)} pas={0.000001} required value={p.site.lng} />
              </Field>
              <Field label="Rayon autorisé">
                <NumberInput max={5000} min={20} onChange={(v) => setSite('rayon', v)} pas={10} required unite="m" value={p.site.rayon} />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                disabled={localisation}
                onClick={() => void positionActuelle()}
                type="button"
              >
                <Icon name="my_location" className="text-[15px]" />
                {localisation ? 'Localisation…' : 'Utiliser ma position actuelle'}
              </button>
              <a className="text-xs font-medium text-brand-400 hover:text-brand-300 inline-flex items-center gap-1" href={lienCarte(p.site.lat, p.site.lng)} rel="noreferrer" target="_blank">
                Voir le site sur la carte <Icon name="open_in_new" className="text-[14px]" />
              </a>
            </div>
            <Toggle
              aide="Sans position GPS, le pointage web/mobile est bloqué."
              label="Géolocalisation obligatoire"
              onChange={(v) => set('geolocObligatoire', v)}
              valeur={p.geolocObligatoire}
            />
            <Toggle
              aide="Une photo du collaborateur est prise par la caméra au moment du pointage."
              label="Photo obligatoire"
              onChange={(v) => set('photoObligatoire', v)}
              valeur={p.photoObligatoire}
            />
          </div>
        </Card>

        <Card icon="calculate" sousTitre="Calcul automatique des droits" titre="Congés">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field aide={`Jours ouvrables (lundi → samedi), soit ${Math.round(p.cpParMois * 12 * 10) / 10} j par an. Minimum légal : 2 j (art. 158).`} label="Congés payés acquis par mois">
              <NumberInput max={5} min={2} onChange={(v) => set('cpParMois', v)} pas={0.1} required unite="j" value={p.cpParMois} />
            </Field>
            <Field aide="Événements familiaux non déductibles du congé : 10 j par an au plus (art. 159)." label="Plafond annuel des permissions">
              <NumberInput max={10} min={0} onChange={(v) => set('quotaPermissions', v)} required unite="j" value={p.quotaPermissions} />
            </Field>
          </div>
          <div className="mt-4">
            <Toggle
              aide="Par défaut, les congés acquis sur l'année ne sont pris qu'après la fin de la période de référence (art. 160). L'activer est une disposition plus favorable."
              label="Autoriser la prise anticipée des congés en cours d'acquisition"
              onChange={(v) => set('anticipationConges', v)}
              valeur={p.anticipationConges}
            />
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Suppléments automatiques : ancienneté (+2 / +4 / +6 j après 20 / 25 / 30 ans), mères de famille (enfants de moins de 15 ans), moins de 18 ans (30 j) ; total plafonné à 30 j. Les reliquats non pris restent dus et sont reportés
            (art. 161 et 163).
          </p>
        </Card>

        <Card icon="shield_lock" sousTitre="Authentification et gestion des accès" titre="Sécurité">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field aide="Hors « Se souvenir de moi »." label="Expiration de session">
              <NumberInput max={480} min={5} onChange={(v) => set('sessionMinutes', v)} pas={5} required unite="min" value={p.sessionMinutes} />
            </Field>
            <Field label="Tentatives avant verrouillage">
              <NumberInput max={10} min={3} onChange={(v) => set('tentativesMax', v)} required value={p.tentativesMax} />
            </Field>
            <Field label="Durée de verrouillage">
              <NumberInput max={1440} min={1} onChange={(v) => set('verrouillageMinutes', v)} pas={5} required unite="min" value={p.verrouillageMinutes} />
            </Field>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card icon="more_time" sousTitre="Payées et majorées dans la paie du mois (CT art. 147) — la récupération en RTT n'est pas prévue par le Code" titre="Heures supplémentaires">
          <ul className="flex flex-col gap-1.5 text-[11px] text-slate-400">
            <li>• Décompte par semaine civile (lundi → dimanche), rattachée au mois de son dimanche ; seuil légal de {PAIE.dureeLegaleHebdo} h (art. 142), samedi compris.</li>
            <li>• Jours fériés chômés et absences : non comptés comme temps de travail effectif dans le seuil.</li>
            <li>
              • De l'horaire contractuel à {PAIE.dureeLegaleHebdo} h : heures complémentaires au taux normal ; de la 41e à la 48e h : +{PAIE.majorations.premieres * 100} % ; au-delà : +{PAIE.majorations.suivantes * 100} %.
            </li>
            <li>
              • Nuit (21 h → 5 h) : +{PAIE.majorations.nuit * 100} % ; dimanche ou férié de jour : +{PAIE.majorations.dimancheFerie * 100} % ; de nuit : +{PAIE.majorations.dimancheFerieNuit * 100} %.
            </li>
            <li>• Taux horaire = (salaire de base + prime d'ancienneté + primes fixes hors frais) / {String(PAIE.diviseurHoraire).replace('.', ',')} h (CCGT art. 66).</li>
          </ul>
        </Card>
        <JoursFeriesCard anneeCourante={Number(today.slice(0, 4))} joursFeries={p.joursFeries} onChange={(j) => set('joursFeries', j)} />
      </div>

      {demo && user.role === 'admin' && (
      <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-rose-300">Données de démonstration</div>
          <p className="text-xs text-slate-400 mt-0.5">
            Régénère toute la base du serveur (collaborateurs, pointages, demandes, paies, journal) pour tous les utilisateurs. Disponible uniquement lorsque le serveur est en mode démonstration.
          </p>
        </div>
        <button
          className="h-9 px-3.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium"
          onClick={async () => {
            const ok = await dialog.confirm({
              titre: 'Réinitialiser les données de démonstration ?',
              tone: 'danger',
              icon: 'restart_alt',
              message: 'Tous les pointages, demandes, documents, notifications et le journal d’audit seront remplacés par le jeu de démonstration. Cette action est irréversible.',
              confirmer: 'Réinitialiser',
            });
            if (!ok) return;
            try {
              await reinitialiserDemo();
              void dialog.alert({ titre: 'Base réinitialisée', tone: 'success', message: 'Les données de démonstration ont été régénérées à partir de la date du jour.' });
            } catch (err) {
              void dialog.alert({ titre: 'Réinitialisation impossible', tone: 'danger', message: messageErreur(err) });
            }
          }}
          type="button"
        >
          Réinitialiser la base
        </button>
      </div>
      )}
    </form>
  );
}

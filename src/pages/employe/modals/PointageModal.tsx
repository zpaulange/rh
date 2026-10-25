import { useCallback, useEffect, useState } from 'react';
import { useUser } from '../../../auth/AuthContext';
import CameraCapture from '../../../components/ui/CameraCapture';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import { pointerArrivee } from '../../../db/api';
import { useDB } from '../../../db/store';
import { formatDistance, lienCarte, localiser, versGeoPoint } from '../../../lib/geo';
import { calculerRetard } from '../../../lib/rules';
import { timeSource, useServerClock } from '../../../lib/serverTime';
import { heureHM, heureHMS } from '../../../lib/time';
import type { GeoPoint, Pointage } from '../../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onPointe: (p: Pointage) => void;
}

type EtatGeo = { statut: 'recherche' } | { statut: 'ok'; geo: GeoPoint } | { statut: 'erreur'; message: string };

// Pointage d'arrivée sécurisé : heure serveur + géolocalisation + photo
export default function PointageModal({ open, onClose, onPointe }: Props) {
  const user = useUser();
  const db = useDB();
  const now = useServerClock();
  const params = db.parametres;
  const [photo, setPhoto] = useState<string | null>(null);
  const [geo, setGeo] = useState<EtatGeo>({ statut: 'recherche' });
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const localiserPoste = useCallback(async () => {
    setGeo({ statut: 'recherche' });
    try {
      const pos = await localiser();
      setGeo({ statut: 'ok', geo: versGeoPoint(pos, params.site) });
    } catch (e) {
      setGeo({ statut: 'erreur', message: e instanceof Error ? e.message : 'Localisation impossible.' });
    }
  }, [params.site]);

  useEffect(() => {
    if (!open) return;
    setPhoto(null);
    setErreur(null);
    setEnvoi(false);
    void localiserPoste();
  }, [open, localiserPoste]);

  const retard = calculerRetard(now.toISOString(), params);
  const enRetard = retard > params.toleranceRetard;
  const photoManquante = params.photoObligatoire && !photo;
  const geoManquante = params.geolocObligatoire && geo.statut !== 'ok';
  const bloque = photoManquante || geoManquante || envoi;

  const valider = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const mobile = window.matchMedia('(pointer: coarse)').matches;
      const p = await pointerArrivee(user, {
        geo: geo.statut === 'ok' ? geo.geo : null,
        photo,
        source: mobile ? 'mobile' : 'web',
      });
      onPointe(p);
      onClose();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Pointage impossible.');
      setEnvoi(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="bg-[#111827] border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-800 bg-[#182234]/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
              <Icon name="fingerprint" className="text-[22px]" />
            </div>
            <div>
              <h4 className="font-display text-base font-semibold text-white tracking-tight">Pointer mon arrivée</h4>
              <p className="text-xs text-slate-400 mt-0.5">Horodatage serveur • Géolocalisation • Photo de présence</p>
            </div>
          </div>
          <button
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" className="text-[19px]" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[82vh]">
          {/* Heure serveur */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Icon name="dns" className="text-[20px] text-brand-400" />
              <div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                  Heure {timeSource() === 'serveur' ? 'du serveur' : 'locale (serveur injoignable)'}
                </div>
                <div className="font-display text-xl font-bold text-white tracking-tight">{heureHMS(now)}</div>
              </div>
            </div>
            {enRetard ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                <Icon name="schedule" className="text-[13px]" />
                Retard de {retard} min (début {params.heureDebut})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>À l'heure
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Photo */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Photo de présence {params.photoObligatoire ? '' : <span className="text-slate-500 normal-case font-normal">(facultatif)</span>}
              </label>
              {open && <CameraCapture photo={photo} onCapture={setPhoto} />}
            </div>

            {/* Géolocalisation */}
            <div className="flex flex-col">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Localisation {params.geolocObligatoire ? '' : <span className="text-slate-500 normal-case font-normal">(facultatif)</span>}
              </label>
              <div className="flex-1 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col gap-3 text-xs">
                {geo.statut === 'recherche' && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <Icon name="my_location" className="text-[18px] animate-pulse text-brand-400" />
                    Recherche de votre position…
                  </div>
                )}
                {geo.statut === 'erreur' && (
                  <>
                    <div className="flex items-start gap-2 text-rose-300">
                      <Icon name="location_off" className="text-[18px]" />
                      <span>{geo.message}</span>
                    </div>
                    <button
                      className="self-start px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 transition-colors"
                      onClick={() => void localiserPoste()}
                      type="button"
                    >
                      Réessayer
                    </button>
                  </>
                )}
                {geo.statut === 'ok' && (
                  <>
                    <div className="flex items-center gap-2">
                      <Icon name={geo.geo.dansZone ? 'where_to_vote' : 'wrong_location'} className={`text-[20px] ${geo.geo.dansZone ? 'text-emerald-400' : 'text-amber-400'}`} />
                      <span className={`font-semibold ${geo.geo.dansZone ? 'text-emerald-400' : 'text-amber-300'}`}>
                        {geo.geo.dansZone ? 'Dans la zone autorisée' : 'Hors de la zone autorisée'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5 text-slate-400">
                      <span>
                        Site : <span className="text-slate-200">{params.site.nom}</span>
                      </span>
                      <span>
                        Distance : <span className="text-slate-200 font-mono">{formatDistance(geo.geo.distance)}</span> (rayon {params.site.rayon} m)
                      </span>
                      <span>
                        Précision GPS : <span className="text-slate-200 font-mono">±{geo.geo.precision} m</span>
                      </span>
                    </div>
                    <a className="text-brand-400 hover:text-brand-300 font-medium inline-flex items-center gap-1" href={lienCarte(geo.geo.lat, geo.geo.lng)} rel="noreferrer" target="_blank">
                      Voir sur la carte <Icon name="open_in_new" className="text-[14px]" />
                    </a>
                    {!geo.geo.dansZone && <p className="text-[11px] text-amber-300/90">Le pointage reste possible mais sera signalé au service RH.</p>}
                  </>
                )}
              </div>
            </div>
          </div>

          {erreur && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
              <Icon name="error" className="text-[16px]" />
              {erreur}
            </div>
          )}

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500">
              {photoManquante ? 'Photo requise' : geoManquante ? 'Localisation requise' : `Arrivée enregistrée à ${heureHM(now)}`}
            </span>
            <div className="flex items-center gap-3">
              <button
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
                onClick={onClose}
                type="button"
              >
                Annuler
              </button>
              <button
                className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white shadow-sm shadow-brand-600/30 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={bloque}
                onClick={valider}
                type="button"
              >
                <Icon name="login" className="text-[16px]" />
                <span>Valider mon arrivée</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

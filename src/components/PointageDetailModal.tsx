import { useDB } from '../db/store';
import { formatDistance, lienCarte } from '../lib/geo';
import { estEnRetard, minutesTravaillees, retardJustifie } from '../lib/rules';
import { serverNow } from '../lib/serverTime';
import { dateLongue, dureeHM, heureHM } from '../lib/time';
import type { GeoPoint, Pointage } from '../types';
import Icon from './ui/Icon';
import Modal from './ui/Modal';

function Ligne({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5 flex items-center justify-between gap-3 text-xs">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200 text-right">{children}</span>
    </div>
  );
}

function Lieu({ geo }: { geo: GeoPoint | null }) {
  if (!geo) return <span className="text-slate-500">Non localisé</span>;
  return (
    <a className="inline-flex items-center gap-1 hover:text-white" href={lienCarte(geo.lat, geo.lng)} rel="noreferrer" target="_blank">
      <span className={geo.dansZone ? 'text-emerald-400' : 'text-amber-300'}>{geo.dansZone ? 'Dans la zone' : 'Hors zone'}</span>
      <span className="font-mono">• {formatDistance(geo.distance)} • ±{geo.precision} m</span>
      <Icon name="open_in_new" className="text-[13px]" />
    </a>
  );
}

interface Props {
  pointage: Pointage | null;
  nom?: string;
  onClose: () => void;
}

// Détail d'un pointage : horodatage, retard, localisation, photo
export default function PointageDetailModal({ pointage: p, nom, onClose }: Props) {
  const db = useDB();
  return (
    <Modal open={p !== null} onClose={onClose}>
      {p && (
        <div className="bg-[#111827] border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-800 bg-[#182234]/70 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                <Icon name="fingerprint" className="text-[20px]" />
              </div>
              <div>
                <h4 className="font-display text-base font-semibold text-white tracking-tight">Détail du pointage</h4>
                <p className="text-xs text-slate-400 mt-0.5">{nom ? `${nom} • ` : ''}{dateLongue(p.date)}</p>
              </div>
            </div>
            <button className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors" onClick={onClose} type="button">
              <Icon name="close" className="text-[19px]" />
            </button>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-5">
            <div className="divide-y divide-slate-800/70">
              <Ligne label="Arrivée">
                <span className="font-mono">{heureHM(p.arrivee)}</span>
              </Ligne>
              <Ligne label="Départ">
                <span className="font-mono">{p.depart ? heureHM(p.depart) : 'En poste'}</span>
              </Ligne>
              <Ligne label="Pause">
                <span className="font-mono">{dureeHM(p.pauseMinutes)}</span>
              </Ligne>
              <Ligne label="Temps de travail">
                <span className="font-mono">{dureeHM(minutesTravaillees(p, serverNow()))}</span>
              </Ligne>
              <Ligne label="Retard détecté">
                {estEnRetard(p, db.parametres) ? (
                  <span className={retardJustifie(db, p) ? 'text-amber-300' : 'text-rose-400'}>
                    {p.retardMinutes} min {retardJustifie(db, p) ? '(justifié)' : ''}
                  </span>
                ) : (
                  <span className="text-emerald-400">Aucun</span>
                )}
              </Ligne>
              <Ligne label="Horodatage">
                {p.horodatage === 'serveur' ? 'Heure serveur (sécurisée)' : 'Heure locale (serveur injoignable)'}
              </Ligne>
              <Ligne label="Terminal">{p.terminal}</Ligne>
              <Ligne label="Lieu d'arrivée">
                <Lieu geo={p.geo} />
              </Ligne>
              <Ligne label="Lieu de départ">
                <Lieu geo={p.geoDepart} />
              </Ligne>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Photo</div>
              {p.photo ? (
                <img alt="Photo de pointage" className="w-full aspect-[4/3] rounded-lg object-cover border border-slate-700" src={p.photo} />
              ) : (
                <div className="w-full aspect-[4/3] rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center gap-1 text-[11px] text-slate-500 text-center px-2">
                  <Icon name="no_photography" className="text-[20px]" />
                  {p.source === 'biometrique' ? 'Terminal biométrique' : 'Aucune photo'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

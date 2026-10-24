import { formatDistance, lienCarte } from '../../lib/geo';
import type { GeoPoint } from '../../types';
import Icon from '../ui/Icon';

// Résultat de la géolocalisation d'un pointage
export default function GeoBadge({ geo }: { geo: GeoPoint | null }) {
  if (!geo)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
        <Icon name="location_disabled" className="text-[14px]" />
        Non localisé
      </span>
    );
  return (
    <a
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
        geo.dansZone
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
          : 'bg-amber-500/10 text-amber-300 border-amber-500/20 hover:bg-amber-500/20'
      }`}
      href={lienCarte(geo.lat, geo.lng)}
      rel="noreferrer"
      target="_blank"
      title={`Précision ±${geo.precision} m — ouvrir la carte`}
    >
      <Icon name={geo.dansZone ? 'where_to_vote' : 'wrong_location'} className="text-[13px]" />
      {geo.dansZone ? 'Sur site' : 'Hors zone'} • {formatDistance(geo.distance)}
    </a>
  );
}

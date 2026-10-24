import { useState } from 'react';

// Palette validée (contraste et daltonisme) sur la surface #182234
const COULEUR_HEURE = '#3b82f6';
const COULEUR_RETARD = '#d97706';

export interface JourPresence {
  label: string;
  detail: string;
  aLHeure: number;
  retard: number;
  absents: number;
}

/** Présence des derniers jours ouvrés : barres empilées « à l'heure » / « en retard » */
export function PresenceChart({ jours, effectif }: { jours: JourPresence[]; effectif: number }) {
  const [survol, setSurvol] = useState<number | null>(null);
  const W = 560;
  const H = 210;
  const G = 30;
  const B = 24;
  const T = 10;
  const max = Math.max(effectif, 1);
  const pas = (W - G) / jours.length;
  const largeur = Math.min(44, pas * 0.55);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const ticks = Array.from(new Set([0, Math.round(max / 2), max]));

  return (
    <div className="relative">
      <div className="flex items-center gap-4 mb-3 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COULEUR_HEURE }}></span>À l'heure
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COULEUR_RETARD }}></span>En retard
        </span>
        <span className="ml-auto">Effectif : {effectif}</span>
      </div>
      <svg className="w-full h-auto" role="img" aria-label="Présence des derniers jours ouvrés" viewBox={`0 0 ${W} ${H}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line stroke="#1e293b" strokeWidth="1" x1={G} x2={W} y1={y(t)} y2={y(t)} />
            <text fill="#64748b" fontSize="10" textAnchor="end" x={G - 6} y={y(t) + 3}>
              {t}
            </text>
          </g>
        ))}
        {jours.map((j, i) => {
          const cx = G + pas * i + pas / 2;
          const x = cx - largeur / 2;
          const hHeure = y(0) - y(j.aLHeure);
          const hRetard = y(0) - y(j.retard);
          const actif = survol === i;
          return (
            <g key={j.label} opacity={survol === null || actif ? 1 : 0.45}>
              {hHeure > 0 && <rect fill={COULEUR_HEURE} height={Math.max(hHeure - (hRetard > 0 ? 2 : 0), 1)} rx="3" width={largeur} x={x} y={y(j.aLHeure)} />}
              {hRetard > 0 && <rect fill={COULEUR_RETARD} height={hRetard} rx="3" width={largeur} x={x} y={y(j.aLHeure + j.retard)} />}
              <text fill={actif ? '#e2e8f0' : '#94a3b8'} fontSize="10" textAnchor="middle" x={cx} y={H - 8}>
                {j.label}
              </text>
              <rect
                fill="transparent"
                height={H - B}
                onMouseEnter={() => setSurvol(i)}
                onMouseLeave={() => setSurvol(null)}
                width={pas}
                x={G + pas * i}
                y={0}
              />
            </g>
          );
        })}
      </svg>
      {survol !== null && (
        <div
          className="absolute pointer-events-none -translate-x-1/2 px-3 py-2 rounded-lg bg-[#0f172a] border border-slate-700 shadow-xl text-[11px] text-slate-300 whitespace-nowrap"
          style={{ left: `${((G + pas * survol + pas / 2) / W) * 100}%`, top: 24 }}
        >
          <div className="font-semibold text-white mb-1">{jours[survol].detail}</div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: COULEUR_HEURE }}></span>À l'heure : {jours[survol].aLHeure}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: COULEUR_RETARD }}></span>En retard : {jours[survol].retard}
          </div>
          <div className="text-slate-400">Absents : {jours[survol].absents}</div>
        </div>
      )}
    </div>
  );
}

export interface BarreDepartement {
  departement: string;
  retards: number;
  effectif: number;
}

/** Retards du mois par département (barres horizontales) */
export function RetardsDepartementChart({ donnees }: { donnees: BarreDepartement[] }) {
  const [survol, setSurvol] = useState<string | null>(null);
  const max = Math.max(1, ...donnees.map((d) => d.retards));
  return (
    <div className="flex flex-col gap-3">
      {donnees.map((d) => (
        <div
          key={d.departement}
          className={`flex flex-col gap-1.5 transition-opacity ${survol && survol !== d.departement ? 'opacity-50' : ''}`}
          onMouseEnter={() => setSurvol(d.departement)}
          onMouseLeave={() => setSurvol(null)}
          title={`${d.departement} : ${d.retards} retard(s) pour ${d.effectif} collaborateur(s)`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 truncate">{d.departement}</span>
            <span className="font-mono text-slate-200">
              {d.retards} <span className="text-slate-500">• {d.effectif} pers.</span>
            </span>
          </div>
          <div className="w-full h-2 bg-slate-900/60 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(d.retards / max) * 100}%`, background: COULEUR_RETARD }}></div>
          </div>
        </div>
      ))}
      {donnees.length === 0 && <p className="text-xs text-slate-500">Aucun retard ce mois-ci.</p>}
    </div>
  );
}

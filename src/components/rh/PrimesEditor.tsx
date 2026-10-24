import { NumberInput, TextInput } from '../form';
import Icon from '../ui/Icon';
import type { PrimeFixe } from '../../types';
import { fcfa } from '../../lib/paie';

interface PrimesEditorProps {
  primes: PrimeFixe[];
  onChange: (primes: PrimeFixe[]) => void;
  variant?: 'profil' | 'modal';
}

const SUGGESTIONS = ['Indemnité de transport', 'Indemnité de logement', 'Prime de responsabilité', "Prime d'astreinte", 'Indemnité de représentation'];

// Liste éditable des primes et indemnités mensuelles fixes
export default function PrimesEditor({ primes, onChange, variant = 'modal' }: PrimesEditorProps) {
  const maj = (i: number, p: Partial<PrimeFixe>) => onChange(primes.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const total = primes.reduce((s, p) => s + (p.montant || 0), 0);
  const restantes = SUGGESTIONS.filter((s) => !primes.some((p) => p.libelle === s));

  return (
    <div className="flex flex-col gap-2">
      {primes.length === 0 && <p className="text-xs text-slate-500">Aucune prime fixe.</p>}
      {primes.map((p, i) => (
        <div key={i} className="grid grid-cols-[1fr_170px_auto_auto_auto_auto] gap-2 items-start">
          <TextInput aria-label="Libellé de la prime" maxLength={60} onChange={(v) => maj(i, { libelle: v })} placeholder="Libellé" required value={p.libelle} variant={variant} />
          <NumberInput ariaLabel="Montant mensuel" max={10_000_000} min={0} onChange={(v) => maj(i, { montant: v })} pas={5000} required unite="FCFA" value={p.montant} variant={variant} />
          <button
            aria-label={`Remboursement de frais : ${p.remboursementFrais ? 'oui' : 'non'}`}
            aria-pressed={p.remboursementFrais}
            className={`h-[34px] w-[64px] rounded-lg border text-[11px] font-semibold transition-colors flex items-center justify-center ${
              p.remboursementFrais ? 'bg-sky-500/10 border-sky-500/30 text-sky-300' : 'bg-slate-900 border-slate-700 text-slate-500'
            }`}
            onClick={() => maj(i, { remboursementFrais: !p.remboursementFrais })}
            title="Remboursement de frais professionnels : exclu du taux horaire et de l'allocation de congé (non-salaire). Sinon, la prime est un élément du salaire, réduite en cas d'absence."
            type="button"
          >
            Frais
          </button>
          {(['soumisCnss', 'soumisIts'] as const).map((cle) => (
            <button
              key={cle}
              aria-label={`${cle === 'soumisCnss' ? 'Soumise à la CNSS' : "Soumise à l'ITS"} : ${p[cle] ? 'oui' : 'non'}`}
              aria-pressed={p[cle]}
              className={`h-[34px] w-[64px] rounded-lg border text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 ${
                p[cle] ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-slate-900 border-slate-700 text-slate-500 line-through'
              }`}
              onClick={() => maj(i, { [cle]: !p[cle] })}
              title={cle === 'soumisCnss' ? 'Entre dans l’assiette des cotisations CNSS' : 'Entre dans l’assiette de l’ITS et du VPS. N’exonérer que dans les cas prévus aux art. 120 et 124 du CGI.'}
              type="button"
            >
              {cle === 'soumisCnss' ? 'CNSS' : 'ITS'}
            </button>
          ))}
          <button
            aria-label={`Retirer ${p.libelle || 'la prime'}`}
            className="h-[34px] w-[34px] rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
            onClick={() => onChange(primes.filter((_, j) => j !== i))}
            type="button"
          >
            <Icon className="text-[18px]" name="delete" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
        <div className="flex flex-wrap gap-1.5">
          {restantes.slice(0, 3).map((s) => (
            <button
              key={s}
              className="px-2 py-1 rounded-md text-[11px] text-slate-300 bg-slate-800/70 border border-slate-700 hover:text-white hover:border-slate-600"
              onClick={() => {
                // Toute indemnité est imposable à l'ITS, transport compris (CGI art. 122) ; transport hors CNSS (à confirmer)
                const transport = s === 'Indemnité de transport';
                onChange([...primes, { libelle: s, montant: 0, soumisCnss: !transport, soumisIts: true, remboursementFrais: transport }]);
              }}
              type="button"
            >
              + {s}
            </button>
          ))}
          <button
            className="px-2 py-1 rounded-md text-[11px] font-medium text-brand-400 hover:text-brand-300"
            onClick={() => onChange([...primes, { libelle: '', montant: 0, soumisCnss: true, soumisIts: true, remboursementFrais: false }])}
            type="button"
          >
            + Autre prime
          </button>
        </div>
        {primes.length > 0 && (
          <span className="text-[11px] text-slate-400">
            Total mensuel : <span className="font-mono text-slate-200">{fcfa(total)}</span> • CNSS / ITS barré = exonéré • Frais = remboursement de frais (hors salaire)
          </span>
        )}
      </div>
    </div>
  );
}

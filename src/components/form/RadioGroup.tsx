import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface RadioOption<T extends string> {
  value: T;
  contenu: (selectionne: boolean) => ReactNode;
}

interface RadioGroupProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: RadioOption<T>[];
  ariaLabel: string;
  className?: string;
  /** Classes de la carte sélectionnée / non sélectionnée */
  carteActive: string;
  carteInactive: string;
}

/** Pastille radio personnalisée (même rendu que le radio des maquettes) */
export function PastilleRadio({ active }: { active: boolean }) {
  return (
    <span
      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
        active ? 'bg-brand-600 border-brand-600' : 'bg-slate-900 border-slate-600'
      }`}
    >
      {active && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
    </span>
  );
}

// Groupe de choix en cartes (navigation au clavier par flèches)
export default function RadioGroup<T extends string>({ value, onChange, options, ariaLabel, className, carteActive, carteInactive }: RadioGroupProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const clavier = (e: KeyboardEvent) => {
    const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const suivant = (index + delta + options.length) % options.length;
    onChange(options[suivant].value);
    refs.current[suivant]?.focus();
  };

  return (
    <div aria-label={ariaLabel} className={className} onKeyDown={clavier} role="radiogroup">
      {options.map((o, i) => {
        const actif = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            aria-checked={actif}
            className={`text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${actif ? carteActive : carteInactive}`}
            onClick={() => onChange(o.value)}
            role="radio"
            tabIndex={actif ? 0 : -1}
            type="button"
          >
            {o.contenu(actif)}
          </button>
        );
      })}
    </div>
  );
}

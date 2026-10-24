import { useEffect, useState } from 'react';
import Icon from '../ui/Icon';
import TextInput from './TextInput';
import type { ChampVariant } from './styles';

interface NumberInputProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  pas?: number;
  unite?: string;
  variant?: ChampVariant;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
}

const decimales = (pas: number) => (String(pas).split('.')[1] ?? '').length;

// Champ numérique avec boutons −/+, unité et bornes (saisie libre, valeur bornée à la sortie du champ)
export default function NumberInput({ value, onChange, min = -Infinity, max = Infinity, pas = 1, unite, variant = 'sombre', required, disabled, id, ariaLabel }: NumberInputProps) {
  const [texte, setTexte] = useState(String(value));
  useEffect(() => setTexte(String(value)), [value]);

  const borner = (n: number) => Number(Math.min(max, Math.max(min, n)).toFixed(decimales(pas)));
  const valider = (brut: string) => {
    const n = Number(brut.replace(',', '.'));
    const v = Number.isFinite(n) && brut.trim() !== '' ? borner(n) : value;
    setTexte(String(v));
    if (v !== value) onChange(v);
  };
  const incrementer = (sens: 1 | -1) => onChange(borner(value + sens * pas));

  const bouton = (sens: 1 | -1) => (
    <button
      aria-label={sens > 0 ? 'Augmenter' : 'Diminuer'}
      className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
      disabled={disabled || (sens > 0 ? value >= max : value <= min)}
      onClick={() => incrementer(sens)}
      tabIndex={-1}
      type="button"
    >
      <Icon className="text-[16px]" name={sens > 0 ? 'add' : 'remove'} />
    </button>
  );

  return (
    <TextInput
      aria-label={ariaLabel}
      aria-valuemax={Number.isFinite(max) ? max : undefined}
      aria-valuemin={Number.isFinite(min) ? min : undefined}
      aria-valuenow={value}
      disabled={disabled}
      id={id}
      inputMode={pas % 1 === 0 && min >= 0 ? 'numeric' : 'decimal'}
      mono
      onBlur={(e) => valider(e.target.value)}
      onChange={(v) => {
        setTexte(v);
        const n = Number(v.replace(',', '.'));
        if (v.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          incrementer(e.key === 'ArrowUp' ? 1 : -1);
        }
        if (e.key === 'Enter') valider((e.target as HTMLInputElement).value);
      }}
      required={required}
      role="spinbutton"
      suffixe={
        <span className="flex items-center gap-1">
          {unite && <span className="text-[11px] text-slate-500 mr-1">{unite}</span>}
          {bouton(-1)}
          {bouton(1)}
        </span>
      }
      type="text"
      value={texte}
      variant={variant}
    />
  );
}

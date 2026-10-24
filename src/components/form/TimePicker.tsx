import { useEffect, useRef, useState } from 'react';
import { serverNow } from '../../lib/serverTime';
import { heureHM } from '../../lib/time';
import Icon from '../ui/Icon';
import { useFieldId } from './Field';
import Popover, { defilerDans } from './Popover';
import { BOITE, DESACTIVE, ERREUR_BOITE, REMPLISSAGE, type ChampVariant } from './styles';

interface TimePickerProps {
  value: string;
  onChange: (v: string) => void;
  variant?: ChampVariant;
  required?: boolean;
  disabled?: boolean;
  /** Pas des minutes proposées */
  pas?: number;
  id?: string;
  ariaLabel?: string;
  className?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

// Sélecteur d'heure : colonnes heures / minutes (format 24 h)
export default function TimePicker({ value, onChange, variant = 'modal', required, disabled, pas = 5, id, ariaLabel, className = '' }: TimePickerProps) {
  const { id: champId, aideId } = useFieldId(id);
  const declencheur = useRef<HTMLButtonElement>(null);
  const colonnes = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [h, m] = value ? value.split(':') : ['', ''];

  const minutes = Array.from(new Set([...Array.from({ length: 60 / pas }, (_, i) => pad(i * pas)), ...(m ? [m] : [])])).sort();
  const heures = Array.from({ length: 24 }, (_, i) => pad(i));

  useEffect(() => {
    if (!open) return;
    // Fait défiler les colonnes jusqu'à la valeur courante
    requestAnimationFrame(() => colonnes.current?.querySelectorAll<HTMLElement>('[aria-selected="true"]').forEach((el) => defilerDans(el.parentElement, el, 'center')));
  }, [open]);

  const definir = (heure: string, minute: string, fermer: boolean) => {
    onChange(`${heure}:${minute}`);
    setErreur(null);
    if (fermer) {
      setOpen(false);
      declencheur.current?.focus({ preventScroll: true });
    }
  };

  const colonne = (valeurs: string[], courant: string, choisir: (v: string) => void, label: string) => (
    <div aria-label={label} className="flex-1 overflow-y-auto max-h-56 py-1" role="listbox">
      {valeurs.map((v) => (
        <button
          key={v}
          aria-selected={v === courant}
          className={`w-full py-1.5 rounded-lg text-xs font-mono transition-colors ${v === courant ? 'bg-brand-600 text-white font-semibold' : 'text-slate-300 hover:bg-slate-800'}`}
          onClick={() => choisir(v)}
          role="option"
          type="button"
        >
          {v}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`relative ${className}`}>
      <button
        ref={declencheur}
        aria-describedby={aideId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={erreur ? true : undefined}
        aria-label={ariaLabel}
        className={`w-full flex items-center gap-2 text-left focus:outline-none transition-colors ${BOITE[variant]} ${REMPLISSAGE[variant]} ${
          open ? '!border-brand-500' : ''
        } ${erreur ? ERREUR_BOITE : ''} ${disabled ? DESACTIVE : 'cursor-pointer'}`}
        disabled={disabled}
        id={champId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          // Flèches : ajuste de ±pas minutes sans ouvrir la liste
          if (!value || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
          e.preventDefault();
          const total = (Number(h) * 60 + Number(m) + (e.key === 'ArrowUp' ? pas : -pas) + 1440) % 1440;
          definir(pad(Math.floor(total / 60)), pad(total % 60), false);
        }}
        type="button"
      >
        <span className={`flex-1 font-mono ${value ? '' : 'text-slate-500'}`}>{value || '--:--'}</span>
        <Icon className="text-[16px] text-slate-400" name="schedule" />
      </button>
      {required && (
        <input
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px opacity-0 pointer-events-none"
          onChange={() => undefined}
          onInvalid={(e) => {
            e.preventDefault();
            setErreur('Veuillez choisir une heure.');
          }}
          required
          tabIndex={-1}
          value={value}
        />
      )}
      {erreur && (
        <p className="text-[11px] text-rose-400 mt-1" role="alert">
          {erreur}
        </p>
      )}
      <Popover ancre={declencheur} hauteurMax={300} largeur={180} onClose={() => setOpen(false)} open={open}>
        <div className="p-2">
          <div className="grid grid-cols-2 gap-1 mb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <span>Heure</span>
            <span>Min</span>
          </div>
          <div ref={colonnes} className="flex gap-1">
            {colonne(heures, h, (v) => definir(v, m || '00', false), 'Heures')}
            {colonne(minutes, m, (v) => definir(h || '08', v, true), 'Minutes')}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between text-xs">
            <button className="font-medium text-brand-400 hover:text-brand-300" onClick={() => definir(...(heureHM(serverNow()).split(':') as [string, string]), true)} type="button">
              Maintenant
            </button>
            <button className="font-medium text-slate-400 hover:text-white" onClick={() => setOpen(false)} type="button">
              OK
            </button>
          </div>
        </div>
      </Popover>
    </div>
  );
}

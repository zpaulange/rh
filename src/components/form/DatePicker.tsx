import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { serverNow } from '../../lib/serverTime';
import { ajouterJours, dateKey, dernierDuMois, estOuvre, jourSemaine, moisDe, moisLong } from '../../lib/time';
import Icon from '../ui/Icon';
import { useFieldId } from './Field';
import Popover from './Popover';
import { BOITE, DESACTIVE, ERREUR_BOITE, REMPLISSAGE, type ChampVariant } from './styles';

interface DatePickerProps {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  variant?: ChampVariant;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  className?: string;
  icone?: string;
  /** Jours fériés à signaler dans le calendrier */
  feries?: { date: string; libelle: string }[];
}

const JOURS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const afficher = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;
const moisVoisin = (mois: string, delta: number) => moisDe(delta > 0 ? ajouterJours(dernierDuMois(mois), 1) : ajouterJours(`${mois}-01`, -1));

// Sélecteur de date avec calendrier (semaine du lundi au dimanche, fuseau du Bénin)
export default function DatePicker({
  value,
  onChange,
  min,
  max,
  variant = 'modal',
  required,
  disabled,
  placeholder = 'jj/mm/aaaa',
  id,
  ariaLabel,
  className = '',
  icone = 'calendar_month',
  feries = [],
}: DatePickerProps) {
  const { id: champId, aideId } = useFieldId(id);
  const declencheur = useRef<HTMLButtonElement>(null);
  const grille = useRef<HTMLDivElement>(null);
  const today = dateKey(serverNow());
  const [open, setOpen] = useState(false);
  const [mois, setMois] = useState(moisDe(value || today));
  const [focus, setFocus] = useState(value || today);
  const [erreur, setErreur] = useState<string | null>(null);

  const horsBornes = (k: string) => Boolean((min && k < min) || (max && k > max));

  const ouvrir = () => {
    if (disabled) return;
    const depart = value || (min && today < min ? min : today);
    setMois(moisDe(depart));
    setFocus(depart);
    setOpen(true);
  };
  const choisir = (k: string) => {
    if (horsBornes(k)) return;
    onChange(k);
    setErreur(null);
    setOpen(false);
    declencheur.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (open) grille.current?.focus({ preventScroll: true });
  }, [open]);

  const deplacerFocus = (k: string) => {
    setFocus(k);
    setMois(moisDe(k));
  };

  const clavier = (e: KeyboardEvent) => {
    const actions: Record<string, () => void> = {
      ArrowLeft: () => deplacerFocus(ajouterJours(focus, -1)),
      ArrowRight: () => deplacerFocus(ajouterJours(focus, 1)),
      ArrowUp: () => deplacerFocus(ajouterJours(focus, -7)),
      ArrowDown: () => deplacerFocus(ajouterJours(focus, 7)),
      PageUp: () => deplacerFocus(ajouterJours(focus, -30)),
      PageDown: () => deplacerFocus(ajouterJours(focus, 30)),
      Enter: () => choisir(focus),
      ' ': () => choisir(focus),
    };
    if (actions[e.key]) {
      e.preventDefault();
      actions[e.key]();
    }
  };

  // Grille de 6 semaines commençant le lundi
  const premier = `${mois}-01`;
  const decalage = (jourSemaine(premier) + 6) % 7;
  const debutGrille = ajouterJours(premier, -decalage);
  const cases = Array.from({ length: 42 }, (_, i) => ajouterJours(debutGrille, i));

  return (
    <div className={`relative ${className}`}>
      <button
        ref={declencheur}
        aria-describedby={aideId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-invalid={erreur ? true : undefined}
        aria-label={ariaLabel ? `${ariaLabel}${value ? ` : ${afficher(value)}` : ''}` : undefined}
        className={`w-full flex items-center gap-2 text-left focus:outline-none transition-colors ${BOITE[variant]} ${REMPLISSAGE[variant]} ${
          open ? '!border-brand-500' : ''
        } ${erreur ? ERREUR_BOITE : ''} ${disabled ? DESACTIVE : 'cursor-pointer'}`}
        disabled={disabled}
        id={champId}
        onClick={() => (open ? setOpen(false) : ouvrir())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            ouvrir();
          }
        }}
        type="button"
      >
        <span className={`flex-1 truncate font-mono ${value ? '' : 'text-slate-500'}`}>{value ? afficher(value) : placeholder}</span>
        <Icon className="text-[16px] text-slate-400" name={icone} />
      </button>
      {required && (
        <input
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px opacity-0 pointer-events-none"
          onChange={() => undefined}
          onInvalid={(e) => {
            e.preventDefault();
            setErreur('Veuillez choisir une date.');
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

      <Popover alignement="gauche" ancre={declencheur} hauteurMax={400} largeur={280} onClose={() => setOpen(false)} open={open}>
        <div className="p-3" role="dialog" aria-label="Choisir une date">
          <div className="flex items-center justify-between mb-2">
            <button aria-label="Mois précédent" className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800" onClick={() => setMois(moisVoisin(mois, -1))} type="button">
              <Icon className="text-[18px]" name="chevron_left" />
            </button>
            <span className="text-sm font-semibold text-white font-display" aria-live="polite">
              {moisLong(mois)}
            </span>
            <button aria-label="Mois suivant" className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800" onClick={() => setMois(moisVoisin(mois, 1))} type="button">
              <Icon className="text-[18px]" name="chevron_right" />
            </button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {JOURS.map((j) => (
              <span key={j} className={`text-center text-[10px] font-semibold uppercase ${j === 'Sa' || j === 'Di' ? 'text-slate-600' : 'text-slate-500'}`}>
                {j}
              </span>
            ))}
          </div>
          <div ref={grille} className="grid grid-cols-7 gap-0.5 focus:outline-none" onKeyDown={clavier} role="grid" tabIndex={0}>
            {cases.map((k) => {
              const dansMois = moisDe(k) === mois;
              const selectionne = k === value;
              const interdit = horsBornes(k);
              const estFocus = k === focus;
              const ferie = feries.find((f) => f.date === k);
              return (
                <button
                  key={k}
                  aria-label={ferie ? `${k} — ${ferie.libelle}` : k}
                  aria-selected={selectionne}
                  className={`h-8 rounded-lg text-xs font-mono transition-colors ${
                    selectionne
                      ? 'bg-brand-600 text-white font-semibold'
                      : interdit
                        ? 'text-slate-700 cursor-not-allowed'
                        : `${dansMois ? (estOuvre(k) ? 'text-slate-200' : 'text-slate-500') : 'text-slate-600'} hover:bg-slate-800`
                  } ${k === today && !selectionne ? 'ring-1 ring-inset ring-brand-500/60' : ''} ${estFocus && !selectionne ? 'bg-slate-800/80' : ''} ${
                    ferie && dansMois && !selectionne ? '!text-amber-300 underline decoration-dotted underline-offset-4' : ''
                  }`}
                  disabled={interdit}
                  onClick={() => choisir(k)}
                  role="gridcell"
                  tabIndex={-1}
                  title={ferie ? `Férié : ${ferie.libelle}` : undefined}
                  type="button"
                >
                  {Number(k.slice(8))}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800 text-xs">
            <button
              className="font-medium text-brand-400 hover:text-brand-300 disabled:text-slate-600"
              disabled={horsBornes(today)}
              onClick={() => choisir(today)}
              type="button"
            >
              Aujourd'hui
            </button>
            {!required && value && (
              <button
                className="font-medium text-slate-400 hover:text-white"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                type="button"
              >
                Effacer
              </button>
            )}
          </div>
        </div>
      </Popover>
    </div>
  );
}

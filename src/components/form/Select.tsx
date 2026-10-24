import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Icon from '../ui/Icon';
import { useFieldId } from './Field';
import Popover, { defilerDans } from './Popover';
import { BOITE, DESACTIVE, ERREUR_BOITE, REMPLISSAGE, type ChampVariant } from './styles';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icone?: string;
  disabled?: boolean;
}

interface SelectProps<T extends string> {
  value: T | '';
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  variant?: ChampVariant;
  /** Icône à gauche (sélecteurs « chip ») */
  icone?: string;
  /** Texte avant la valeur, ex. « Statut: » */
  prefixe?: string;
  /** Recherche dans la liste (activée automatiquement au-delà de 8 options) */
  recherche?: boolean;
  required?: boolean;
  disabled?: boolean;
  mono?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
  largeurListe?: number;
  rendu?: (o: SelectOption<T>) => ReactNode;
}

const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Liste déroulante accessible (combobox + listbox), stylée comme les champs des maquettes
export default function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder = 'Sélectionner…',
  variant = 'modal',
  icone,
  prefixe,
  recherche,
  required,
  disabled,
  mono,
  id,
  ariaLabel,
  className = '',
  largeurListe,
  rendu,
}: SelectProps<T>) {
  const { id: champId, aideId } = useFieldId(id);
  const listeId = useId();
  const declencheur = useRef<HTMLButtonElement>(null);
  const champRecherche = useRef<HTMLInputElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [filtre, setFiltre] = useState('');
  const [actif, setActif] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const saisie = useRef({ texte: '', temps: 0 });

  const avecRecherche = recherche ?? options.length > 8;
  const visibles = useMemo(
    () => (filtre ? options.filter((o) => normaliser(`${o.label} ${o.description ?? ''}`).includes(normaliser(filtre))) : options),
    [options, filtre],
  );
  const courant = options.find((o) => o.value === value);

  const ouvrir = () => {
    if (disabled) return;
    setFiltre('');
    setActif(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const fermer = () => setOpen(false);
  const choisir = (o: SelectOption<T> | undefined) => {
    if (!o || o.disabled) return;
    onChange(o.value);
    setErreur(null);
    setOpen(false);
    declencheur.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return;
    if (avecRecherche) champRecherche.current?.focus({ preventScroll: true });
    else liste.current?.focus({ preventScroll: true });
  }, [open, avecRecherche]);

  useEffect(() => {
    if (!open) return;
    defilerDans(liste.current, liste.current?.querySelector<HTMLElement>(`[data-index="${actif}"]`) ?? null);
  }, [actif, open]);

  const deplacer = (delta: number) => {
    if (visibles.length === 0) return;
    let i = actif;
    for (let n = 0; n < visibles.length; n++) {
      i = (i + delta + visibles.length) % visibles.length;
      if (!visibles[i].disabled) break;
    }
    setActif(i);
  };

  const clavierListe = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      deplacer(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      deplacer(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActif(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActif(visibles.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choisir(visibles[actif]);
    } else if (e.key === 'Tab') {
      fermer();
    } else if (!avecRecherche && e.key.length === 1) {
      // Recherche par saisie rapide des premières lettres
      const maintenant = Date.now();
      saisie.current.texte = (maintenant - saisie.current.temps > 700 ? '' : saisie.current.texte) + normaliser(e.key);
      saisie.current.temps = maintenant;
      const i = visibles.findIndex((o) => normaliser(o.label).startsWith(saisie.current.texte));
      if (i >= 0) setActif(i);
    }
  };

  const clavierDeclencheur = (e: KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      ouvrir();
    }
  };

  const chip = variant === 'chip';

  return (
    <div className={`relative ${className}`}>
      <button
        ref={declencheur}
        aria-activedescendant={open && visibles[actif] ? `${listeId}-${actif}` : undefined}
        aria-controls={listeId}
        aria-describedby={aideId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={erreur ? true : undefined}
        aria-label={ariaLabel}
        className={`w-full flex items-center gap-2 text-left transition-colors focus:outline-none ${BOITE[variant]} ${REMPLISSAGE[variant]} ${
          open ? (variant === 'profil' ? '!border-blue-500' : '!border-brand-500') : ''
        } ${erreur ? ERREUR_BOITE : ''} ${disabled ? DESACTIVE : 'cursor-pointer'}`}
        disabled={disabled}
        id={champId}
        onClick={() => (open ? fermer() : ouvrir())}
        onKeyDown={clavierDeclencheur}
        role="combobox"
        type="button"
      >
        {icone && <Icon className={`text-[16px] ${chip ? 'text-slate-400' : 'text-slate-500'}`} name={icone} />}
        {courant?.icone && !icone && <Icon className="text-[16px] text-slate-400" name={courant.icone} />}
        <span className={`flex-1 min-w-0 truncate ${mono ? 'font-mono' : ''} ${courant ? (chip ? '' : 'text-inherit') : 'text-slate-500'}`}>
          {prefixe && courant ? (
            <>
              {prefixe} <span className="text-white">{courant.label}</span>
            </>
          ) : (
            (courant?.label ?? placeholder)
          )}
        </span>
        <Icon className={`${chip ? 'text-[14px]' : 'text-[18px]'} text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} name="expand_more" />
      </button>

      {/* Participe à la validation native du formulaire, message affiché dans notre style */}
      {required && (
        <input
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px opacity-0 pointer-events-none"
          onChange={() => undefined}
          onInvalid={(e) => {
            e.preventDefault();
            setErreur('Veuillez sélectionner une option.');
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

      <Popover ancre={declencheur} hauteurMax={avecRecherche ? 340 : 290} largeur={largeurListe ?? 'ancre'} onClose={fermer} open={open}>
        {avecRecherche && (
          <div className="p-2 border-b border-slate-800">
            <div className="flex items-center gap-2 bg-[#111827] border border-slate-700 rounded-lg px-2.5 focus-within:border-brand-500">
              <Icon className="text-[15px] text-slate-500" name="search" />
              <input
                ref={champRecherche}
                aria-controls={listeId}
                aria-label="Rechercher dans la liste"
                className="w-full bg-transparent border-0 p-0 py-1.5 text-xs text-white placeholder:text-slate-500 focus:ring-0 outline-none"
                onChange={(e) => {
                  setFiltre(e.target.value);
                  setActif(0);
                }}
                onKeyDown={clavierListe}
                placeholder="Rechercher…"
                value={filtre}
              />
            </div>
          </div>
        )}
        <div
          ref={liste}
          aria-label={ariaLabel}
          className="overflow-y-auto py-1 focus:outline-none"
          id={listeId}
          onKeyDown={avecRecherche ? undefined : clavierListe}
          role="listbox"
          style={{ maxHeight: avecRecherche ? 290 : 288 }}
          tabIndex={-1}
        >
          {visibles.length === 0 && <div className="px-3 py-3 text-xs text-slate-500">Aucun résultat.</div>}
          {visibles.map((o, i) => {
            const selectionne = o.value === value;
            return (
              <div
                key={o.value}
                aria-disabled={o.disabled}
                aria-selected={selectionne}
                className={`mx-1 px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-xs ${
                  o.disabled ? 'text-slate-600 cursor-not-allowed' : 'cursor-pointer text-slate-200'
                } ${i === actif && !o.disabled ? 'bg-slate-800/80 text-white' : ''}`}
                data-index={i}
                id={`${listeId}-${i}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choisir(o)}
                onMouseEnter={() => setActif(i)}
                role="option"
              >
                {o.icone && <Icon className={`text-[16px] ${selectionne ? 'text-brand-400' : 'text-slate-400'}`} name={o.icone} />}
                <div className="flex-1 min-w-0">
                  {rendu ? (
                    rendu(o)
                  ) : (
                    <>
                      <div className={`truncate ${mono ? 'font-mono' : ''} ${selectionne ? 'font-semibold text-white' : ''}`}>{o.label}</div>
                      {o.description && <div className="text-[11px] text-slate-500 truncate">{o.description}</div>}
                    </>
                  )}
                </div>
                {selectionne && <Icon className="text-[16px] text-brand-400" name="check" />}
              </div>
            );
          })}
        </div>
      </Popover>
    </div>
  );
}

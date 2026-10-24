import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import Popover from '../form/Popover';
import Icon from './Icon';

export type ActionMenuItem =
  | {
      label: string;
      icone: string;
      onSelect: () => void;
      tone?: 'normal' | 'danger' | 'succes';
      disabled?: boolean;
      description?: string;
    }
  | { separateur: true };

interface ActionMenuProps {
  items: ActionMenuItem[];
  ariaLabel: string;
  /** Titre affiché en tête du menu (ex. nom du collaborateur) */
  titre?: string;
}

const TONS = {
  normal: { texte: 'text-slate-200', icone: 'text-slate-400' },
  danger: { texte: 'text-rose-300', icone: 'text-rose-400' },
  succes: { texte: 'text-emerald-300', icone: 'text-emerald-400' },
};

// Bouton « trois points » ouvrant un menu d'actions (accessible au clavier)
export default function ActionMenu({ items, ariaLabel, titre }: ActionMenuProps) {
  const bouton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const actions = items.flatMap((it, i) => ('separateur' in it ? [] : [{ it, i }]));
  const [actif, setActif] = useState(0);

  useEffect(() => {
    if (!open) return;
    setActif(actions.findIndex(({ it }) => !it.disabled));
    requestAnimationFrame(() => menu.current?.focus({ preventScroll: true }));
  }, [open]);

  const executer = (index: number) => {
    const cible = actions[index]?.it;
    if (!cible || cible.disabled) return;
    setOpen(false);
    bouton.current?.focus({ preventScroll: true });
    cible.onSelect();
  };

  const deplacer = (delta: number) => {
    let i = actif;
    for (let n = 0; n < actions.length; n++) {
      i = (i + delta + actions.length) % actions.length;
      if (!actions[i].it.disabled) break;
    }
    setActif(i);
  };

  const clavier = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      deplacer(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      deplacer(-1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      executer(actif);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="inline-flex" onClick={(e) => e.stopPropagation()}>
      <button
        ref={bouton}
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
          open ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
        }`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        type="button"
      >
        <Icon className="text-[20px]" name="more_vert" />
      </button>
      <Popover alignement="droite" ancre={bouton} hauteurMax={420} largeur={240} onClose={() => setOpen(false)} open={open}>
        <div ref={menu} aria-label={ariaLabel} className="py-1.5 focus:outline-none" id={menuId} onKeyDown={clavier} role="menu" tabIndex={-1}>
          {titre && <div className="px-3.5 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">{titre}</div>}
          {items.map((it, i) => {
            if ('separateur' in it) return <div key={`sep-${i}`} className="my-1.5 border-t border-slate-800" role="separator" />;
            const index = actions.findIndex((a) => a.i === i);
            const ton = TONS[it.tone ?? 'normal'];
            return (
              <button
                key={it.label}
                aria-disabled={it.disabled}
                className={`w-full px-3.5 py-2 flex items-start gap-2.5 text-left text-xs transition-colors ${
                  it.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                } ${index === actif && !it.disabled ? 'bg-slate-800/80' : ''}`}
                onClick={() => executer(index)}
                onMouseEnter={() => setActif(index)}
                role="menuitem"
                tabIndex={-1}
                type="button"
              >
                <Icon className={`text-[17px] mt-px ${ton.icone}`} name={it.icone} />
                <span className="min-w-0">
                  <span className={`block font-medium ${ton.texte}`}>{it.label}</span>
                  {it.description && <span className="block text-[11px] text-slate-500 mt-0.5">{it.description}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </Popover>
    </div>
  );
}

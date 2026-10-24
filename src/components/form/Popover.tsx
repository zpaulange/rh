import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface PopoverProps {
  ancre: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Largeur : identique à l'ancre (par défaut) ou fixe */
  largeur?: 'ancre' | number;
  alignement?: 'gauche' | 'droite';
  hauteurMax?: number;
  className?: string;
}

const MARGE = 6;
// Position initiale hors flux : le panneau n'allonge jamais la page avant d'être placé
const CACHE: React.CSSProperties = { position: 'fixed', top: 0, left: 0, visibility: 'hidden' };

/** Fait défiler un conteneur pour rendre visible l'un de ses éléments, sans jamais faire défiler la page */
export function defilerDans(conteneur: HTMLElement | null, el: HTMLElement | null, bloc: 'nearest' | 'center' = 'nearest') {
  if (!conteneur || !el) return;
  const haut = el.getBoundingClientRect().top - conteneur.getBoundingClientRect().top + conteneur.scrollTop;
  if (bloc === 'center') conteneur.scrollTop = haut - (conteneur.clientHeight - el.offsetHeight) / 2;
  else if (haut < conteneur.scrollTop) conteneur.scrollTop = haut;
  else if (haut + el.offsetHeight > conteneur.scrollTop + conteneur.clientHeight) conteneur.scrollTop = haut + el.offsetHeight - conteneur.clientHeight;
}

// Fenêtre flottante rendue dans <body> : n'est jamais coupée par un tableau défilant ou une modale
export default function Popover({ ancre, open, onClose, children, largeur = 'ancre', alignement = 'gauche', hauteurMax = 300, className = '' }: PopoverProps) {
  const panneau = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>(CACHE);

  const placer = useCallback(() => {
    const a = ancre.current;
    const p = panneau.current;
    if (!a || !p) return;
    const r = a.getBoundingClientRect();
    const w = largeur === 'ancre' ? Math.max(r.width, 160) : largeur;
    const h = Math.min(p.scrollHeight, hauteurMax);
    const dessous = window.innerHeight - r.bottom - MARGE;
    const auDessus = dessous < h && r.top > dessous;
    let left = alignement === 'droite' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setStyle({
      position: 'fixed',
      left,
      width: w,
      maxHeight: hauteurMax,
      top: auDessus ? Math.max(8, r.top - h - MARGE) : r.bottom + MARGE,
      visibility: 'visible',
    });
  }, [ancre, largeur, alignement, hauteurMax]);

  useLayoutEffect(() => {
    if (open) placer();
    else setStyle(CACHE);
  }, [open, placer, children]);

  useEffect(() => {
    if (!open) return;
    const dehors = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panneau.current?.contains(t) || ancre.current?.contains(t)) return;
      onClose();
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Ne ferme que la fenêtre flottante, pas la modale qui la contient
        e.stopImmediatePropagation();
        onClose();
        ancre.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('mousedown', dehors);
    document.addEventListener('keydown', echap, true);
    window.addEventListener('resize', placer);
    window.addEventListener('scroll', placer, true);
    return () => {
      document.removeEventListener('mousedown', dehors);
      document.removeEventListener('keydown', echap, true);
      window.removeEventListener('resize', placer);
      window.removeEventListener('scroll', placer, true);
    };
  }, [open, onClose, placer, ancre]);

  if (!open) return null;
  return createPortal(
    <div
      ref={panneau}
      className={`z-[80] bg-[#182234] border border-slate-700 rounded-xl shadow-2xl shadow-black/40 overflow-hidden ${className}`}
      style={style}
    >
      {children}
    </div>,
    document.body,
  );
}

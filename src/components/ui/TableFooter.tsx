import type { ReactNode } from 'react';

interface TableFooterProps {
  children: ReactNode;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
}

export default function TableFooter({ children, previousDisabled = true, nextDisabled = false, onPrevious, onNext }: TableFooterProps) {
  return (
    <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/30 flex items-center justify-between text-xs text-slate-400">
      <span>{children}</span>
      <div className="flex items-center gap-2">
        <button
          className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-40"
          disabled={previousDisabled}
          onClick={onPrevious}
          type="button"
        >
          Précédent
        </button>
        <button
          className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-40"
          disabled={nextDisabled}
          onClick={onNext}
          type="button"
        >
          Suivant
        </button>
      </div>
    </div>
  );
}

/** Pagination simple côté client */
export function paginer<T>(items: T[], page: number, parPage: number) {
  const pages = Math.max(1, Math.ceil(items.length / parPage));
  const courante = Math.min(page, pages - 1);
  return {
    lignes: items.slice(courante * parPage, courante * parPage + parPage),
    page: courante,
    pages,
    premier: items.length === 0 ? 0 : courante * parPage + 1,
    dernier: Math.min(items.length, (courante + 1) * parPage),
  };
}

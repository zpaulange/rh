import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';

let compteur = 0;
import Icon from './Icon';

// Système de boîtes de dialogue (remplace window.alert / window.confirm)

export type DialogTone = 'info' | 'success' | 'warning' | 'danger';

export interface DialogAction {
  label: string;
  /** Valeur renvoyée par la promesse quand l'action est choisie */
  value: string;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: string;
}

interface DialogOptions {
  titre: string;
  message?: ReactNode;
  details?: ReactNode;
  tone?: DialogTone;
  icon?: string;
}

export interface ConfirmOptions extends DialogOptions {
  confirmer?: string;
  annuler?: string;
}

export interface AlertOptions extends DialogOptions {
  actions?: DialogAction[];
}

interface DialogState extends DialogOptions {
  actions: DialogAction[];
  /** Valeur renvoyée sur Échap / clic extérieur */
  annulation: string;
  id: number;
  resolve: (value: string) => void;
}

interface DialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<string>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

const TONES: Record<DialogTone, { icon: string; className: string }> = {
  info: { icon: 'info', className: 'bg-brand-500/10 border-brand-500/20 text-brand-400' },
  success: { icon: 'task_alt', className: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
  warning: { icon: 'warning', className: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
  danger: { icon: 'error', className: 'bg-rose-500/10 border-rose-500/20 text-rose-400' },
};

const BOUTONS: Record<NonNullable<DialogAction['variant']>, string> = {
  primary: 'bg-brand-600 hover:bg-brand-500 text-white shadow-sm shadow-brand-600/30',
  danger: 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm shadow-rose-600/30',
  secondary: 'text-slate-300 hover:text-white hover:bg-slate-800/60',
};

function DialogView({ dialog, onClose }: { dialog: DialogState; onClose: (value: string) => void }) {
  const titreId = useId();
  const messageId = useId();
  const panneau = useRef<HTMLDivElement>(null);
  const tone = TONES[dialog.tone ?? 'info'];
  const principale = [...dialog.actions].reverse().find((a) => a.variant !== 'secondary') ?? dialog.actions[dialog.actions.length - 1];

  useEffect(() => {
    const precedent = document.activeElement as HTMLElement | null;
    panneau.current?.querySelector<HTMLButtonElement>('[data-principale="true"]')?.focus();
    const clavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Empêche la modale sous-jacente de se fermer en même temps
        e.stopImmediatePropagation();
        onClose(dialog.annulation);
      }
      // Piège de focus : Tab reste dans la boîte de dialogue
      if (e.key === 'Tab' && panneau.current) {
        const focusables = panneau.current.querySelectorAll<HTMLElement>('button, a[href]');
        if (focusables.length === 0) return;
        const premier = focusables[0];
        const dernier = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === premier) {
          e.preventDefault();
          dernier.focus();
        } else if (!e.shiftKey && document.activeElement === dernier) {
          e.preventDefault();
          premier.focus();
        }
      }
    };
    document.addEventListener('keydown', clavier, true);
    return () => {
      document.removeEventListener('keydown', clavier, true);
      precedent?.focus?.();
    };
  }, [dialog, onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(dialog.annulation);
      }}
    >
      <div
        ref={panneau}
        aria-describedby={dialog.message ? messageId : undefined}
        aria-labelledby={titreId}
        aria-modal="true"
        className="bg-[#111827] border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        role="alertdialog"
      >
        <div className="p-6 flex gap-4">
          <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${tone.className}`}>
            <Icon name={dialog.icon ?? tone.icon} className="text-[24px]" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="font-display text-base font-semibold text-white tracking-tight" id={titreId}>
              {dialog.titre}
            </h2>
            {dialog.message && (
              <div className="text-sm text-slate-400 mt-1.5 leading-relaxed" id={messageId}>
                {dialog.message}
              </div>
            )}
            {dialog.details && <div className="mt-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs text-slate-300">{dialog.details}</div>}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-800 bg-[#182234]/50 flex flex-wrap items-center justify-end gap-2.5">
          {dialog.actions.map((a) => (
            <button
              key={a.value}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827] ${BOUTONS[a.variant ?? 'primary']}`}
              data-principale={a === principale}
              onClick={() => onClose(a.value)}
              type="button"
            >
              {a.icon && <Icon name={a.icon} className="text-[16px]" />}
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<DialogState[]>([]);

  const ouvrir = useCallback(
    (options: DialogOptions, actions: DialogAction[], annulation: string) =>
      new Promise<string>((resolve) => setFile((f) => [...f, { ...options, actions, annulation, resolve, id: ++compteur }])),
    [],
  );

  const confirm = useCallback(
    async ({ confirmer = 'Confirmer', annuler = 'Annuler', ...options }: ConfirmOptions) => {
      const tone = options.tone ?? 'warning';
      const choix = await ouvrir(
        { ...options, tone },
        [
          { label: annuler, value: 'non', variant: 'secondary' },
          { label: confirmer, value: 'oui', variant: tone === 'danger' ? 'danger' : 'primary' },
        ],
        'non',
      );
      return choix === 'oui';
    },
    [ouvrir],
  );

  const alert = useCallback(
    ({ actions, ...options }: AlertOptions) =>
      ouvrir(options, actions && actions.length ? actions : [{ label: 'Compris', value: 'ok', variant: 'primary' }], 'fermer'),
    [ouvrir],
  );

  const fermer = useCallback((valeur: string) => {
    setFile((f) => {
      f[0]?.resolve(valeur);
      return f.slice(1);
    });
  }, []);

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      {file[0] && <DialogView key={file[0].id} dialog={file[0]} onClose={fermer} />}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog doit être utilisé dans <DialogProvider>');
  return ctx;
}

/** Message d'erreur lisible à partir d'une exception */
export const messageErreur = (e: unknown, defaut = 'Action impossible.') => (e instanceof Error ? e.message : defaut);

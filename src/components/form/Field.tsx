import { createContext, useContext, useId, type ReactNode } from 'react';
import { LABEL } from './styles';

interface FieldContextValue {
  id: string;
  aideId?: string;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** Identifiant du champ courant (relie l'étiquette et le contrôle) */
export function useFieldId(id?: string): { id: string; aideId?: string } {
  const ctx = useContext(FieldContext);
  const genere = useId();
  return { id: id ?? ctx?.id ?? genere, aideId: ctx?.aideId };
}

interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  aide?: ReactNode;
  labelClass?: string;
  className?: string;
  droite?: ReactNode;
}

// Étiquette + contrôle + texte d'aide
export default function Field({ label, children, aide, labelClass = LABEL.modal, className, droite }: FieldProps) {
  const id = useId();
  const aideId = aide ? `${id}-aide` : undefined;
  return (
    <FieldContext.Provider value={{ id, aideId }}>
      <div className={className}>
        {droite ? (
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className={labelClass.replace('mb-1.5', '').replace('mb-2', '')} htmlFor={id}>
              {label}
            </label>
            {droite}
          </div>
        ) : (
          <label className={labelClass} htmlFor={id}>
            {label}
          </label>
        )}
        {children}
        {aide && (
          <p className="text-[11px] text-slate-500 mt-1" id={aideId}>
            {aide}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

/** Message de validation sous un champ */
export function MessageErreur({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1" role="alert">
      {message}
    </p>
  );
}

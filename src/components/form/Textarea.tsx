import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { useFieldId } from './Field';
import { BOITE, ERREUR_BOITE, REMPLISSAGE, type ChampVariant } from './styles';
import { useValidation } from './useValidation';

interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  variant?: ChampVariant;
  onChange?: (valeur: string) => void;
  /** Affiche le compteur de caractères si maxLength est fourni */
  compteur?: boolean;
}

// Zone de texte multiligne
const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { variant = 'modal', onChange, className = '', id, compteur = true, maxLength, value, ...props },
  ref,
) {
  const { id: champId, aideId } = useFieldId(id);
  const { erreur, onInvalid, effacer } = useValidation();
  const longueur = typeof value === 'string' ? value.length : 0;
  return (
    <div className={className}>
      <div className={`flex ${BOITE[variant]} ${erreur ? ERREUR_BOITE : ''}`}>
        <textarea
          ref={ref}
          aria-describedby={aideId}
          aria-invalid={erreur ? true : undefined}
          className={`w-full bg-transparent border-0 focus:ring-0 outline-none resize-none placeholder:text-slate-500 text-inherit text-[length:inherit] [line-height:inherit] ${REMPLISSAGE[variant]}`}
          id={champId}
          maxLength={maxLength}
          onChange={(e) => {
            effacer();
            onChange?.(e.target.value);
          }}
          onInvalid={onInvalid}
          value={value}
          {...props}
        />
      </div>
      {(erreur || (compteur && maxLength)) && (
        <div className="flex items-center justify-between mt-1 text-[11px]">
          <span className="text-rose-400" role={erreur ? 'alert' : undefined}>
            {erreur}
          </span>
          {compteur && maxLength && <span className={longueur >= maxLength ? 'text-amber-400' : 'text-slate-500'}>{`${longueur} / ${maxLength}`}</span>}
        </div>
      )}
    </div>
  );
});

export default Textarea;

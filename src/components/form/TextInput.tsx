import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import Icon from '../ui/Icon';
import { useFieldId } from './Field';
import { BOITE, DESACTIVE, ERREUR_BOITE, REMPLISSAGE, type ChampVariant } from './styles';
import { useValidation } from './useValidation';

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'onChange'> {
  variant?: ChampVariant;
  /** Icône Material Symbols à gauche */
  icone?: string;
  /** Préfixe fixe (ex. indicatif +229) */
  prefixe?: ReactNode;
  /** Élément à droite (bouton, unité…) */
  suffixe?: ReactNode;
  mono?: boolean;
  onChange?: (valeur: string) => void;
  messageErreur?: string;
  className?: string;
}

const ICONE_GAUCHE: Record<ChampVariant, string> = {
  modal: 'pl-3 text-[16px]',
  profil: 'pl-3 text-[18px]',
  sombre: 'pl-3 text-[16px]',
  login: 'pl-3.5 text-[20px]',
  chip: 'pl-3 text-[16px]',
};

// Champ texte (texte, email, téléphone, mot de passe, nombre, recherche)
const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { variant = 'modal', icone, prefixe, suffixe, mono, onChange, messageErreur, className = '', id, disabled, readOnly, ...props },
  ref,
) {
  const { id: champId, aideId } = useFieldId(id);
  const { erreur, onInvalid, effacer } = useValidation(messageErreur);
  const remplissage = REMPLISSAGE[variant];
  return (
    <div className={className}>
      <div
        className={`relative flex items-stretch overflow-hidden transition-all ${BOITE[variant]} ${erreur ? ERREUR_BOITE : ''} ${
          disabled || readOnly ? `${DESACTIVE} ${readOnly ? '!opacity-100 border-slate-800/60 bg-slate-950/60' : ''}` : ''
        }`}
      >
        {icone && (
          <span className={`flex items-center text-slate-500 pointer-events-none ${ICONE_GAUCHE[variant]}`}>
            <Icon className="text-[inherit]" name={icone} />
          </span>
        )}
        {prefixe && (
          <span className="inline-flex items-center px-3 text-xs font-mono text-slate-400 bg-slate-900 border-r border-slate-800 shrink-0">{prefixe}</span>
        )}
        <input
          ref={ref}
          aria-describedby={aideId}
          aria-invalid={erreur ? true : undefined}
          className={`w-full min-w-0 bg-transparent border-0 focus:ring-0 outline-none placeholder:text-slate-500 text-[length:inherit] [line-height:inherit] ${remplissage} ${
            icone ? (variant === 'login' ? '!pl-2.5' : '!pl-2') : ''
          } ${mono ? 'font-mono' : ''} ${readOnly ? 'text-slate-400 cursor-not-allowed' : 'text-inherit'}`}
          disabled={disabled}
          id={champId}
          onChange={(e) => {
            effacer();
            onChange?.(e.target.value);
          }}
          onInvalid={onInvalid}
          readOnly={readOnly}
          {...props}
        />
        {suffixe && <span className="flex items-center pr-3 shrink-0">{suffixe}</span>}
      </div>
      {erreur && (
        <p className="text-[11px] text-rose-400 mt-1" role="alert">
          {erreur}
        </p>
      )}
    </div>
  );
});

export default TextInput;

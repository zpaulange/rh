import { forwardRef, useState } from 'react';
import Icon from '../ui/Icon';
import TextInput, { type TextInputProps } from './TextInput';

// Mot de passe avec bouton afficher / masquer
const PasswordInput = forwardRef<HTMLInputElement, Omit<TextInputProps, 'type' | 'suffixe'>>(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <TextInput
      ref={ref}
      {...props}
      suffixe={
        <button
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          className="text-slate-500 hover:text-slate-300 transition-colors flex items-center justify-center p-0.5 focus:outline-none focus-visible:text-white"
          onClick={() => setVisible((v) => !v)}
          type="button"
        >
          <Icon className="text-[20px]" name={visible ? 'visibility_off' : 'visibility'} />
        </button>
      }
      type={visible ? 'text' : 'password'}
    />
  );
});

export default PasswordInput;

import { useCallback, useState, type FormEvent } from 'react';

/**
 * Validation sans bulle native du navigateur : le message est affiché sous le champ,
 * dans le style de l'application. La soumission du formulaire reste bloquée.
 */
export function useValidation(messagePersonnalise?: string) {
  const [erreur, setErreur] = useState<string | null>(null);

  const onInvalid = useCallback(
    (e: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.preventDefault();
      const champ = e.currentTarget;
      if (champ.validity.valueMissing) setErreur('Ce champ est obligatoire.');
      else if (champ.validity.typeMismatch && champ.type === 'email') setErreur('Adresse email invalide (ex. nom@domaine.bj).');
      else setErreur(messagePersonnalise ?? champ.validationMessage);
    },
    [messagePersonnalise],
  );

  const effacer = useCallback(() => setErreur(null), []);
  return { erreur, onInvalid, effacer, setErreur };
}

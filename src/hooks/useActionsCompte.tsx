import { useUser } from '../auth/AuthContext';
import { messageErreur, useDialog } from '../components/ui/Dialog';
import { changerAcces, deverrouillerCompte, reinitialiserMotDePasse } from '../db/api';
import { heureHM } from '../lib/time';
import type { Compte, Employe } from '../types';

/** Actions sur le compte d'accès d'un collaborateur, toutes confirmées par une boîte de dialogue */
export function useActionsCompte() {
  const user = useUser();
  const dialog = useDialog();
  const nom = (e: Employe) => `${e.prenom} ${e.nom}`;

  /** Affiche des identifiants une seule fois, avec copie dans le presse-papiers */
  const afficherIdentifiants = async (titre: string, e: Employe, email: string, motDePasse: string) => {
    const choix = await dialog.alert({
      titre,
      tone: 'success',
      icon: 'key',
      message: (
        <>
          Identifiants de <strong className="text-white">{nom(e)}</strong> ({e.matricule}). Ce mot de passe n'est affiché qu'une seule fois : transmettez-le par un canal sécurisé.
        </>
      ),
      details: (
        <div className="flex flex-col gap-2 font-mono">
          <div className="flex justify-between gap-3">
            <span className="text-slate-400 font-sans">Identifiant</span>
            <span className="text-white">{email}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-400 font-sans">Mot de passe temporaire</span>
            <span className="text-white">{motDePasse}</span>
          </div>
        </div>
      ),
      actions: [
        { label: 'Copier les identifiants', value: 'copier', variant: 'secondary', icon: 'content_copy' },
        { label: "J'ai noté les identifiants", value: 'ok', variant: 'primary' },
      ],
    });
    if (choix === 'copier') {
      try {
        await navigator.clipboard.writeText(`Identifiant : ${email}\nMot de passe temporaire : ${motDePasse}`);
        await dialog.alert({ titre: 'Identifiants copiés', tone: 'success', icon: 'content_copy', message: 'Collez-les dans un message sécurisé destiné au collaborateur.' });
      } catch {
        await dialog.alert({ titre: 'Copie impossible', tone: 'warning', message: 'Le navigateur a refusé l’accès au presse-papiers. Notez les identifiants manuellement.' });
        await afficherIdentifiants(titre, e, email, motDePasse);
      }
    }
  };

  const basculerAcces = async (e: Employe, compte: Compte) => {
    const activer = !compte.actif;
    const ok = await dialog.confirm({
      titre: activer ? `Réactiver l'accès de ${nom(e)} ?` : `Désactiver l'accès de ${nom(e)} ?`,
      tone: activer ? 'info' : 'danger',
      icon: activer ? 'lock_open' : 'lock',
      message: activer
        ? 'Le collaborateur pourra de nouveau se connecter avec ses identifiants.'
        : 'Le collaborateur sera déconnecté immédiatement et ne pourra plus pointer ni accéder à son espace. Ses données sont conservées.',
      confirmer: activer ? "Réactiver l'accès" : "Désactiver l'accès",
    });
    if (!ok) return;
    try {
      await changerAcces(user, e.id, activer);
      await dialog.alert({
        titre: activer ? 'Accès réactivé' : 'Accès désactivé',
        tone: activer ? 'success' : 'info',
        message: `${nom(e)} ${activer ? 'peut de nouveau se connecter' : "n'a plus accès à SikaRH"}. L'action est enregistrée dans le journal d'audit.`,
      });
    } catch (err) {
      await dialog.alert({ titre: 'Action impossible', tone: 'danger', message: messageErreur(err) });
    }
  };

  const deverrouiller = async (e: Employe, compte: Compte) => {
    const ok = await dialog.confirm({
      titre: `Déverrouiller le compte de ${nom(e)} ?`,
      tone: 'info',
      icon: 'lock_open',
      message: `Le compte est verrouillé jusqu'à ${compte.verrouilleJusqua ? heureHM(compte.verrouilleJusqua) : '—'} après plusieurs échecs de connexion. Vérifiez l'identité du collaborateur avant de le déverrouiller.`,
      confirmer: 'Déverrouiller',
    });
    if (!ok) return;
    try {
      await deverrouillerCompte(user, e.id);
      await dialog.alert({ titre: 'Compte déverrouillé', tone: 'success', message: `${nom(e)} a été notifié et peut se reconnecter.` });
    } catch (err) {
      await dialog.alert({ titre: 'Action impossible', tone: 'danger', message: messageErreur(err) });
    }
  };

  const reinitialiser = async (e: Employe) => {
    const ok = await dialog.confirm({
      titre: `Réinitialiser le mot de passe de ${nom(e)} ?`,
      tone: 'warning',
      icon: 'password',
      message: "L'ancien mot de passe cessera immédiatement de fonctionner. Un mot de passe temporaire sera généré.",
      confirmer: 'Générer un mot de passe',
    });
    if (!ok) return;
    try {
      const { email, motDePasse } = await reinitialiserMotDePasse(user, e.id);
      await afficherIdentifiants('Mot de passe réinitialisé', e, email, motDePasse);
    } catch (err) {
      await dialog.alert({ titre: 'Action impossible', tone: 'danger', message: messageErreur(err) });
    }
  };

  return { basculerAcces, deverrouiller, reinitialiser, afficherIdentifiants };
}

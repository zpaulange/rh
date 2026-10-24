import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { consommerExpiration, useAuth } from '../auth/AuthContext';
import { Checkbox, Field, LABEL, PasswordInput, TextInput } from '../components/form';
import { accueilPour } from '../components/layout/navigation';
import { getDB } from '../db/store';
import { useDialog } from '../components/ui/Dialog';
import { ENTREPRISE } from '../config/entreprise';
import Icon from '../components/ui/Icon';

type LoginState = 'idle' | 'loading' | 'success';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [state, setState] = useState<LoginState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [sessionExpiree] = useState(consommerExpiration);
  const dialog = useDialog();

  const motDePasseOublie = () =>
    dialog.alert({
      titre: 'Mot de passe oublié',
      tone: 'info',
      icon: 'key',
      message: 'Pour des raisons de sécurité, la réinitialisation est effectuée par le service des Ressources Humaines après vérification de votre identité.',
      details: (
        <div className="flex flex-col gap-1">
          <span>
            Email : <span className="font-mono text-white">{ENTREPRISE.contactRH.email}</span>
          </span>
          <span>
            Téléphone : <span className="font-mono text-white">{ENTREPRISE.contactRH.telephone}</span>
          </span>
        </div>
      ),
      actions: [{ label: 'Compris', value: 'ok', variant: 'primary' }],
    });

  if (user && state === 'idle') return <Navigate to={accueilPour(getDB(), user)} replace />;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setState('loading');
    try {
      const logged = await login(email, password, remember);
      setState('success');
      window.setTimeout(() => navigate(accueilPour(getDB(), logged), { replace: true }), 600);
    } catch (err) {
      setState('idle');
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
    }
  };

  const buttonText =
    state === 'loading' ? 'Vérification en cours...' : state === 'success' ? 'Connexion réussie...' : 'Se connecter';
  const buttonColor = state === 'success' ? 'bg-emerald-600' : 'bg-blue-600 hover:bg-blue-500';
  const busy = state !== 'idle';

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100 font-sans antialiased flex flex-col justify-between selection:bg-blue-600 selection:text-white">
      {/* Halo lumineux d'arrière-plan */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
        <div className="w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] -translate-y-16"></div>
      </div>
      <main className="w-full flex-1 flex flex-col items-center justify-center px-4 py-12 relative z-10">
        <div className="w-full max-w-md">
          <div className="rounded-2xl p-8 sm:p-10 relative">
            <div className="flex flex-col items-center text-center">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/30">
                  <Icon name="schedule" className="text-[24px]" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display text-2xl font-bold tracking-tight text-white">
                    Sika<span className="text-blue-500">RH</span>
                  </span>
                  <span className="text-xs uppercase font-semibold tracking-wider text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60">
                    PRO
                  </span>
                </div>
              </div>
              <h1 className="text-2xl font-display font-bold text-white mt-5">Connexion</h1>
            </div>

            <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit}>
              <Field label="Adresse email" labelClass={LABEL.majusculesDiscret}>
                <TextInput
                  autoComplete="email"
                  icone="mail"
                  name="email"
                  onChange={setEmail}
                  placeholder="nom.prenom@entreprise.bj"
                  required
                  type="email"
                  value={email}
                  variant="login"
                />
              </Field>

              <Field
                droite={
                  <button className="text-xs text-blue-400 hover:text-blue-300 transition-colors" onClick={() => void motDePasseOublie()} type="button">
                    Mot de passe oublié ?
                  </button>
                }
                label="Mot de passe"
                labelClass={LABEL.majusculesDiscret}
              >
                <PasswordInput
                  autoComplete="current-password"
                  icone="lock"
                  name="password"
                  onChange={setPassword}
                  placeholder="••••••••••••"
                  required
                  value={password}
                  variant="login"
                />
              </Field>

              <div className="flex items-center justify-between pt-0.5">
                <Checkbox checked={remember} id="remember" onChange={setRemember}>
                  Se souvenir de moi
                </Checkbox>
              </div>

              {sessionExpiree && !error && state === 'idle' && (
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300">
                  <Icon name="timer_off" className="text-[18px]" />
                  <span>Session expirée après inactivité. Reconnectez-vous.</span>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-300">
                  <Icon name="error" className="text-[18px]" />
                  <span>{error}</span>
                </div>
              )}

              <button
                className={`w-full h-12 mt-2 rounded-xl ${buttonColor} text-white font-semibold text-sm flex items-center justify-center gap-2 transition duration-200 active:scale-[0.99] shadow-lg shadow-blue-600/25 ${busy ? 'opacity-90 cursor-wait' : ''}`}
                disabled={busy}
                type="submit"
              >
                <span>{buttonText}</span>
                <Icon name="arrow_forward" className="text-[18px]" />
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

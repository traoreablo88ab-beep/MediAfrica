'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { Wordmark } from '@/components/Wordmark';
import { loginInputToEmail } from '@/lib/consultantAuth';

// Top-level browser navigation (not fetch) — the browser needs to carry
// cookies to Google and receive Set-Cookie from the callback's redirect.
// Same-origin Next.js API route, so a relative URL is enough.
const googleSignInHref = '/api/auth/oauth/google/start?next=/dashboard';

function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Erreur inconnue. Réessayez.';
  switch (err.code) {
    case 'INVALID_CREDENTIALS':
      return 'Email ou mot de passe incorrect.';
    case 'EMAIL_NOT_VERIFIED':
      return 'Veuillez d’abord vérifier votre email.';
    case 'LOCKED_OUT':
      return 'Compte temporairement verrouillé suite à plusieurs tentatives. Réessayez plus tard.';
    case 'ACCOUNT_SUSPENDED':
      return 'Ce compte a été suspendu. Contactez un administrateur.';
    case 'TOO_MANY_LOGIN_ATTEMPTS':
      return 'Trop de tentatives. Réessayez dans quelques minutes.';
    case 'TOTP_CODE_INVALID':
      return 'Code invalide. Vérifiez votre application d’authentification.';
    case 'TOTP_SESSION_EXPIRED':
      return 'Session expirée. Reconnectez-vous.';
    case 'TOO_MANY_2FA_ATTEMPTS':
      return 'Trop de tentatives. Réessayez dans quelques minutes.';
    default:
      return err.message || 'Erreur inconnue. Réessayez.';
  }
}

export function LoginView() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmitCredentials(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ twoFactorRequired?: boolean }>('/api/auth/login', {
        method: 'POST',
        body: { email: loginInputToEmail(email), password },
      });
      if (res.twoFactorRequired) {
        setStep('totp');
        return;
      }
      await refresh();
      router.push('/dashboard');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitTotp(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/2fa/verify', { method: 'POST', body: { code: totpCode } });
      await refresh();
      router.push('/dashboard');
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.code === 'TOTP_SESSION_EXPIRED') {
        setStep('credentials');
        setPassword('');
        setTotpCode('');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'totp') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#f9f9f7] px-4">
        <Link href="/" className="animate-fade-in-up mb-8 flex items-center gap-3">
          <Logo animated />
          <Wordmark className="text-[#0b0b0b]" />
        </Link>

        <div className="animate-fade-in-up w-full max-w-sm rounded-lg border border-[#e1e0d9] bg-white p-6 shadow-[0_8px_24px_-12px_rgba(42,120,214,0.25)]">
          <h1 className="text-center text-xl font-bold text-[#0b0b0b]">
            Vérification en deux étapes
          </h1>
          <p className="mt-1 text-center text-sm text-[#52514e]">
            Entrez le code de votre application d’authentification, ou l’un de vos codes de secours.
          </p>

          <form onSubmit={onSubmitTotp} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-[#0b0b0b]">Code</span>
              <input
                type="text"
                required
                autoFocus
                inputMode="text"
                autoComplete="one-time-code"
                maxLength={9}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.toUpperCase())}
                className="rounded-md border border-[#e1e0d9] px-3 py-2 text-center font-mono text-lg tracking-widest text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none"
              />
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-md bg-[#d03b3b]/10 px-3 py-2 text-sm text-[#d03b3b]"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 rounded-md bg-[#2a78d6] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
            >
              {submitting ? 'Vérification…' : 'Vérifier'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('credentials');
                setTotpCode('');
                setError(null);
              }}
              className="text-center text-sm text-[#52514e] hover:underline"
            >
              Retour
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f9f9f7] px-4">
      <Link
        href="/"
        className="animate-fade-in-up mb-8 flex items-center gap-3"
        style={{ animationDelay: '0ms' }}
      >
        <Logo animated />
        <Wordmark className="text-[#0b0b0b]" />
      </Link>

      <div
        className="animate-fade-in-up w-full max-w-sm rounded-lg border border-[#e1e0d9] bg-white p-6 shadow-[0_8px_24px_-12px_rgba(42,120,214,0.25)]"
        style={{ animationDelay: '60ms' }}
      >
        <div className="animate-fade-in-up" style={{ animationDelay: '140ms' }}>
          <h1 className="text-center text-xl font-bold text-[#0b0b0b]">Connexion</h1>
          <p className="mt-1 text-center text-sm text-[#52514e]">
            Accédez à l’espace de votre centre de santé.
          </p>
        </div>

        <form
          onSubmit={onSubmitCredentials}
          className="animate-fade-in-up mt-6 flex flex-col gap-4"
          style={{ animationDelay: '200ms' }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-[#0b0b0b]">Email ou identifiant</span>
            <input
              type="text"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-[#e1e0d9] px-3 py-2 text-sm text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-[#0b0b0b]">Mot de passe</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-[#e1e0d9] px-3 py-2 text-sm text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none"
            />
            <Link
              href="/forgot-password"
              className="self-end text-xs font-medium text-[#2a78d6] hover:underline"
            >
              Mot de passe oublié ?
            </Link>
          </label>

          {error && (
            <p role="alert" className="rounded-md bg-[#d03b3b]/10 px-3 py-2 text-sm text-[#d03b3b]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-md bg-[#2a78d6] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
          >
            {submitting ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <div
          className="animate-fade-in-up my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-[#898781]"
          style={{ animationDelay: '260ms' }}
        >
          <span className="h-px flex-1 bg-[#e1e0d9]" />
          ou
          <span className="h-px flex-1 bg-[#e1e0d9]" />
        </div>

        <a
          href={googleSignInHref}
          className="animate-fade-in-up inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#e1e0d9] bg-white px-4 py-2.5 text-sm font-medium text-[#0b0b0b] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-[#f9f9f7] hover:shadow-sm"
          style={{ animationDelay: '260ms' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Se connecter avec Google
        </a>

        <p
          className="animate-fade-in-up mt-6 text-center text-sm text-[#52514e]"
          style={{ animationDelay: '320ms' }}
        >
          Pas encore de compte ?{' '}
          <Link href="/signup" className="font-medium text-[#2a78d6] hover:underline">
            S’inscrire
          </Link>
        </p>
      </div>
    </main>
  );
}

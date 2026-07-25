'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { Wordmark } from '@/components/Wordmark';

function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Erreur inconnue. Réessayez.';
  switch (err.code) {
    case 'VERIFICATION_CODE_INVALID':
      return 'Code invalide. Vérifiez votre saisie.';
    case 'VERIFICATION_CODE_EXPIRED':
      return 'Ce code a expiré. Recommencez l’inscription pour en recevoir un nouveau.';
    case 'TOO_MANY_VERIFY_ATTEMPTS':
      return 'Trop de tentatives. Réessayez plus tard.';
    case 'TOO_MANY_RESEND_ATTEMPTS':
      return 'Trop de demandes de renvoi. Réessayez plus tard.';
    default:
      return err.message || 'Erreur inconnue. Réessayez.';
  }
}

function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  async function verify(emailValue: string, codeValue: string) {
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/verify-email', {
        method: 'POST',
        body: { email: emailValue, code: codeValue },
      });
      await refresh();
      router.push('/dashboard');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  // If the user followed the link from the email (both params present),
  // submit automatically — the form below is a fallback for manual entry.
  useEffect(() => {
    const qEmail = params.get('email');
    const qCode = params.get('code');
    if (qEmail && qCode) {
      void verify(qEmail, qCode);
    }
    // Intentionally runs once on mount to consume the email-link params.
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void verify(email, code);
  }

  async function onResend() {
    if (!email) {
      setError('Entrez votre email pour recevoir un nouveau code.');
      return;
    }
    setResending(true);
    setResendMessage(null);
    setError(null);
    try {
      await api('/api/auth/resend-verification', { method: 'POST', body: { email } });
      setResendMessage('Si un compte existe avec cet email, un nouveau code vient d’être envoyé.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResending(false);
    }
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
          <h1 className="text-center text-xl font-bold text-[#0b0b0b]">Vérifiez votre email</h1>
          <p className="mt-1 text-center text-sm text-[#52514e]">
            Nous avons envoyé un code à 8 caractères à votre adresse. Il expire dans 15 minutes.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="animate-fade-in-up mt-6 flex flex-col gap-4"
          style={{ animationDelay: '200ms' }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-[#0b0b0b]">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-[#e1e0d9] px-3 py-2 text-sm text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-[#0b0b0b]">Code de vérification</span>
            <input
              type="text"
              required
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              className="rounded-md border border-[#e1e0d9] px-3 py-2 text-sm uppercase tracking-widest text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-md bg-[#d03b3b]/10 px-3 py-2 text-sm text-[#d03b3b]">
              {error}
            </p>
          )}
          {resendMessage && (
            <p
              role="status"
              className="rounded-md bg-[#2a78d6]/10 px-3 py-2 text-sm text-[#2a78d6]"
            >
              {resendMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-md bg-[#2a78d6] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
          >
            {submitting ? 'Vérification…' : 'Vérifier'}
          </button>
        </form>

        <p
          className="animate-fade-in-up mt-6 text-center text-sm text-[#52514e]"
          style={{ animationDelay: '260ms' }}
        >
          Pas reçu de code ?{' '}
          <button
            type="button"
            onClick={() => void onResend()}
            disabled={resending}
            className="font-medium text-[#2a78d6] hover:underline disabled:opacity-50"
          >
            {resending ? 'Envoi…' : 'Renvoyer le code'}
          </button>
        </p>
      </div>
    </main>
  );
}

// Wrap in <Suspense> because useSearchParams() requires it under the App Router.
export function VerifyEmailView() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}

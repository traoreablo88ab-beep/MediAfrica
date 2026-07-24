'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { Logo } from '@/components/Logo';
import { Wordmark } from '@/components/Wordmark';
import { useClinicName } from '@/lib/useClinicName';

export default function ForgotPasswordPage() {
  const clinicName = useClinicName();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setSubmitted(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f9f9f7] px-4">
      <Link href="/" className="animate-fade-in-up mb-8 flex items-center gap-3">
        <Logo animated />
        <Wordmark className="text-[#0b0b0b]" />
      </Link>

      <div className="animate-fade-in-up w-full max-w-sm rounded-lg border border-[#e1e0d9] bg-white p-6 shadow-[0_8px_24px_-12px_rgba(42,120,214,0.25)]">
        {submitted ? (
          <div className="flex flex-col gap-4 text-center">
            <h1 className="text-xl font-bold text-[#0b0b0b]">Vérifiez votre email</h1>
            <p className="text-sm text-[#52514e]">
              Si un compte existe pour <strong>{email}</strong>, un code de réinitialisation vient
              d’être envoyé. Il expire dans 15 minutes.
            </p>
            <Link
              href={`/reset-password?email=${encodeURIComponent(email)}`}
              className="rounded-md bg-[#2a78d6] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#256abf]"
            >
              J’ai reçu mon code
            </Link>
            <Link href="/login" className="text-sm font-medium text-[#2a78d6] hover:underline">
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-center text-xl font-bold text-[#0b0b0b]">Mot de passe oublié</h1>
            <p className="mt-1 text-center text-sm text-[#52514e]">
              Indiquez l’email de votre compte {clinicName}, nous vous envoyons un code de
              réinitialisation.
            </p>

            <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
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
                {submitting ? 'Envoi…' : 'Envoyer le code'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-[#52514e]">
              <Link href="/login" className="font-medium text-[#2a78d6] hover:underline">
                Retour à la connexion
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

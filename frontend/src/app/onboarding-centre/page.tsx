'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { Wordmark } from '@/components/Wordmark';

function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.code === 'ALREADY_HAS_ORGANIZATION') {
    return 'Un centre est déjà lié à ce compte.';
  }
  return friendlyError(err, 'Erreur inconnue. Réessayez.');
}

export default function OnboardingCentrePage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const [clinicName, setClinicName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    // Already onboarded (or platform admin with no clinic of their own) —
    // nothing to do here.
    if (user.orgRole !== null) {
      router.replace('/dashboard');
    }
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/organizations/current', { method: 'POST', body: { clinicName } });
      await refresh();
      router.push('/dashboard');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user || user.orgRole !== null) return null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f9f9f7] px-4">
      <div className="animate-fade-in-up mb-8 flex items-center gap-3">
        <Logo animated />
        <Wordmark className="text-[#0b0b0b]" />
      </div>

      <div
        className="animate-fade-in-up w-full max-w-sm rounded-lg border border-[#e1e0d9] bg-white p-6 shadow-[0_8px_24px_-12px_rgba(42,120,214,0.25)]"
        style={{ animationDelay: '60ms' }}
      >
        <h1 className="text-center text-xl font-bold text-[#0b0b0b]">Bienvenue !</h1>
        <p className="mt-1 text-center text-sm text-[#52514e]">
          Donnez un nom à votre centre de santé pour continuer.
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-[#0b0b0b]">Nom du centre de santé</span>
            <input
              type="text"
              required
              autoFocus
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              placeholder="CSRéf de Kayes"
              className="rounded-md border border-[#e1e0d9] px-3 py-2 text-sm text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none"
            />
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
            {submitting ? 'Création…' : 'Continuer'}
          </button>
        </form>
      </div>
    </main>
  );
}

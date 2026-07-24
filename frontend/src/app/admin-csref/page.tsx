'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

interface ConsultantRow {
  id: string;
  email: string;
  name: string | null;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  createdAt: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function initials(nameOrIdentifiant: string): string {
  const parts = nameOrIdentifiant.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

const AVATAR_TONES = [
  { bg: 'bg-[#2a78d6]/10', text: 'text-[#2a78d6]' },
  { bg: 'bg-[#0ca30c]/10', text: 'text-[#0ca30c]' },
  { bg: 'bg-[#d08a1c]/10', text: 'text-[#d08a1c]' },
  { bg: 'bg-[#8a5cf6]/10', text: 'text-[#8a5cf6]' },
];

function avatarTone(seed: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

function emailToIdentifiant(email: string): string {
  return email.split('@')[0] ?? email;
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function AdminCsrefPage() {
  const user = useUser();
  const { toast } = useToast();
  const [rows, setRows] = useState<ConsultantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [identifiant, setIdentifiant] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);

  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ items: ConsultantRow[] }>('/api/organizations/current/consultants');
      setRows(res.items);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api('/api/organizations/current/consultants', {
        method: 'POST',
        body: { name, identifiant, password },
      });
      toast(
        `Consultant créé. Identifiant : "${identifiant.trim().toLowerCase()}" — communiquez-lui l’identifiant et le mot de passe.`,
      );
      setName('');
      setIdentifiant('');
      setPassword('');
      setShowCreate(false);
      await load();
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setCreating(false);
    }
  }

  async function onResetPassword(e: FormEvent, id: string) {
    e.preventDefault();
    setResetting(true);
    try {
      await api(`/api/organizations/current/consultants/${id}`, {
        method: 'PATCH',
        body: { password: resetPassword },
      });
      toast('Mot de passe réinitialisé.');
      setResettingId(null);
      setResetPassword('');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setResetting(false);
    }
  }

  if (!user) return null;
  const canManage = user.orgRole === 'OWNER' || user.orgRole === 'ADMIN';

  if (!canManage) {
    return (
      <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
        <AppHeader />
        <div className="mx-auto max-w-4xl px-6 py-6">
          <p role="alert" className="rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]">
            Accès réservé au propriétaire ou à un administrateur du centre.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader />
      <div className="animate-fade-in-up mx-auto max-w-4xl px-6 py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Admin CSRéf</h1>
            <p className="mt-1 text-sm text-[#52514e]">
              Autorisez vos consultants en leur attribuant un identifiant et un mot de passe — aucun
              email requis.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a78d6]/90"
          >
            {!showCreate && (
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
            {showCreate ? 'Annuler' : 'Nouveau consultant'}
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]"
          >
            {error}
          </p>
        )}

        {showCreate && (
          <form
            onSubmit={onCreate}
            className="mt-6 flex flex-col gap-3 rounded-xl border border-[#e1e0d9] bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.04)]"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="text-xs font-medium text-[#52514e]">Nom complet</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Aïcha Traoré"
                  className="mt-1 w-full rounded-md border border-[#e1e0d9] px-3 py-2 text-sm focus:border-[#2a78d6] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#52514e]">Identifiant</label>
                <input
                  type="text"
                  required
                  value={identifiant}
                  onChange={(e) => setIdentifiant(e.target.value)}
                  placeholder="atraore"
                  className="mt-1 w-full rounded-md border border-[#e1e0d9] px-3 py-2 text-sm focus:border-[#2a78d6] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#52514e]">Mot de passe</label>
                <div className="mt-1 flex gap-1.5">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={10}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-md border border-[#e1e0d9] px-3 py-2 text-sm focus:border-[#2a78d6] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    title={showPassword ? 'Masquer' : 'Afficher'}
                    className="shrink-0 rounded-md border border-[#e1e0d9] px-2 text-xs text-[#52514e] hover:bg-[#f9f9f7]"
                  >
                    {showPassword ? 'Masquer' : 'Afficher'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPassword(generatePassword());
                      setShowPassword(true);
                    }}
                    title="Générer un mot de passe"
                    className="shrink-0 rounded-md border border-[#e1e0d9] px-2 text-xs text-[#52514e] hover:bg-[#f9f9f7]"
                  >
                    Générer
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-[#898781]">
              Le consultant se connectera avec cet identifiant (pas besoin d’email) et ce mot de
              passe. Notez-les avant de valider — ils ne seront pas renvoyés ensuite.
            </p>
            <button
              type="submit"
              disabled={creating}
              className="self-start rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a78d6]/90 disabled:opacity-50"
            >
              {creating ? 'Création…' : 'Créer le compte'}
            </button>
          </form>
        )}

        <div className="mt-6 overflow-hidden overflow-x-auto rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#e1e0d9] bg-[#f9f9f7]/60 text-xs uppercase tracking-wide text-[#898781]">
                <th className="px-5 py-2.5 font-medium">Nom</th>
                <th className="px-5 py-2.5 font-medium">Identifiant</th>
                <th className="px-5 py-2.5 font-medium">Autorisé depuis</th>
                <th className="px-5 py-2.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tone = avatarTone(r.id);
                const idf = emailToIdentifiant(r.email);
                return (
                  <tr key={r.id} className="border-b border-[#e1e0d9] last:border-0">
                    <td className="px-5 py-3 font-medium text-[#0b0b0b]">
                      <span className="flex items-center gap-3">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tone.bg} ${tone.text}`}
                        >
                          {initials(r.name ?? idf)}
                        </span>
                        {r.name ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-[#52514e]">{idf}</td>
                    <td className="px-5 py-3 text-[#898781]">{formatDate(r.createdAt)}</td>
                    <td className="px-5 py-3">
                      {resettingId === r.id ? (
                        <form
                          onSubmit={(e) => onResetPassword(e, r.id)}
                          className="flex items-center gap-1.5"
                        >
                          <input
                            type="text"
                            required
                            minLength={10}
                            autoFocus
                            value={resetPassword}
                            onChange={(e) => setResetPassword(e.target.value)}
                            placeholder="Nouveau mot de passe"
                            className="w-40 rounded-md border border-[#e1e0d9] px-2 py-1 text-xs focus:border-[#2a78d6] focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={resetting}
                            className="rounded-md bg-[#2a78d6] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#2a78d6]/90 disabled:opacity-50"
                          >
                            Valider
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setResettingId(null);
                              setResetPassword('');
                            }}
                            className="rounded-md border border-[#e1e0d9] px-2.5 py-1 text-xs text-[#52514e] hover:bg-[#f9f9f7]"
                          >
                            Annuler
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setResettingId(r.id)}
                          className="text-xs font-medium text-[#2a78d6] hover:underline"
                        >
                          Réinitialiser le mot de passe
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && !error && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-sm text-[#898781]">
                    Aucun consultant pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

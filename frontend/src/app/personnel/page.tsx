'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

interface MemberRow {
  id: string;
  email: string;
  name: string | null;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  createdAt: string;
}

const ROLE_BADGE: Record<string, string> = {
  OWNER: 'bg-[#2a78d6] text-white',
  ADMIN: 'bg-[#2a78d6]/10 text-[#2a78d6]',
  MEMBER: 'bg-[#e1e0d9] text-[#52514e]',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function initials(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/\s+/);
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

export default function PersonnelPage() {
  const user = useUser();
  const { toast } = useToast();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ items: MemberRow[] }>('/api/organizations/current/members');
      setMembers(res.items);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      await api('/api/organizations/current/members', {
        method: 'POST',
        body: { email: inviteEmail, role: inviteRole },
      });
      setInviteEmail('');
      setInviteRole('MEMBER');
      setShowInvite(false);
      toast(
        'Invitation envoyée. Le membre pourra définir son mot de passe via le lien reçu par email.',
      );
      await load();
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setInviting(false);
    }
  }

  async function onRoleChange(member: MemberRow, role: 'OWNER' | 'ADMIN' | 'MEMBER') {
    if (role === member.role) return;
    if (
      !window.confirm(
        `Changer le rôle de ${member.name ?? member.email} : ${member.role} → ${role} ?`,
      )
    ) {
      return;
    }
    setBusyId(member.id);
    try {
      await api(`/api/organizations/current/members/${member.id}`, {
        method: 'PATCH',
        body: { role },
      });
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role } : m)));
      toast('Rôle mis à jour.');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (!user) return null;
  const canInvite = user.orgRole === 'OWNER' || user.orgRole === 'ADMIN';
  const canChangeRole = user.orgRole === 'OWNER';

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader />
      <div className="animate-fade-in-up mx-auto max-w-4xl px-6 py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Personnel</h1>
            <p className="mt-1 text-sm text-[#52514e]">Membres de votre centre de santé.</p>
          </div>
          {canInvite && (
            <button
              type="button"
              onClick={() => setShowInvite((v) => !v)}
              className="flex items-center gap-1.5 rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a78d6]/90"
            >
              {!showInvite && (
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                  <path
                    d="M12 5v14M5 12h14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
              {showInvite ? 'Annuler' : 'Inviter un membre'}
            </button>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]"
          >
            {error}
          </p>
        )}

        {showInvite && (
          <form
            onSubmit={onInvite}
            className="mt-6 flex flex-col gap-3 rounded-xl border border-[#e1e0d9] bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.04)] sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <label className="text-xs font-medium text-[#52514e]">Email</label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="collegue@example.com"
                className="mt-1 w-full rounded-md border border-[#e1e0d9] px-3 py-2 text-sm focus:border-[#2a78d6] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#52514e]">Rôle</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'ADMIN' | 'MEMBER')}
                className="mt-1 cursor-pointer rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm focus:border-[#2a78d6] focus:outline-none"
              >
                <option value="MEMBER">Membre</option>
                <option value="ADMIN">Administrateur</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting}
              className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a78d6]/90 disabled:opacity-50"
            >
              {inviting ? 'Envoi…' : 'Envoyer l’invitation'}
            </button>
          </form>
        )}

        <div className="mt-6 overflow-hidden overflow-x-auto rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#e1e0d9] bg-[#f9f9f7]/60 text-xs uppercase tracking-wide text-[#898781]">
                <th className="px-5 py-2.5 font-medium">Nom</th>
                <th className="px-5 py-2.5 font-medium">Email</th>
                <th className="px-5 py-2.5 font-medium">Rôle</th>
                <th className="px-5 py-2.5 font-medium">Membre depuis</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                members.length === 0 &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-[#e1e0d9] last:border-0">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3">
                        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                        <Skeleton className="h-4 w-28" />
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Skeleton className="h-4 w-40" />
                    </td>
                    <td className="px-5 py-3">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="px-5 py-3">
                      <Skeleton className="h-4 w-20" />
                    </td>
                  </tr>
                ))}
              {members.map((m) => {
                const tone = avatarTone(m.id);
                return (
                  <tr
                    key={m.id}
                    className="border-b border-[#e1e0d9] last:border-0 transition-colors hover:bg-[#f9f9f7]"
                  >
                    <td className="px-5 py-3 font-medium text-[#0b0b0b]">
                      <span className="flex items-center gap-3">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tone.bg} ${tone.text}`}
                        >
                          {initials(m.name ?? m.email)}
                        </span>
                        {m.name ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#52514e]">{m.email}</td>
                    <td className="px-5 py-3">
                      {canChangeRole ? (
                        <select
                          value={m.role}
                          disabled={busyId === m.id}
                          onChange={(e) =>
                            onRoleChange(m, e.target.value as 'OWNER' | 'ADMIN' | 'MEMBER')
                          }
                          className={`cursor-pointer rounded-full border-0 px-2 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#2a78d6]/40 disabled:opacity-50 ${ROLE_BADGE[m.role]}`}
                        >
                          <option value="MEMBER">MEMBER</option>
                          <option value="ADMIN">ADMIN</option>
                          <option value="OWNER">OWNER</option>
                        </select>
                      ) : (
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[m.role]}`}
                        >
                          {m.role}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[#898781]">{formatDate(m.createdAt)}</td>
                  </tr>
                );
              })}
              {!loading && members.length === 0 && !error && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-sm text-[#898781]">
                    Aucun membre.
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

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { useToast } from '@/contexts/ToastContext';

type Role = 'USER' | 'ADMIN' | 'SUPERADMIN';
type Status = 'ACTIVE' | 'SUSPENDED';

interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  status: Status;
  emailVerifiedAt: string | null;
  createdAt: string;
}

interface ListResponse {
  items: AdminUserRow[];
  nextCursor: string | null;
}

interface AdminMe {
  admin: { id: string; email: string; role: 'ADMIN' | 'SUPERADMIN' };
  can: string[];
}

const ROLE_BADGE: Record<Role, string> = {
  SUPERADMIN: 'bg-[#2a78d6] text-white',
  ADMIN: 'bg-[#2a78d6]/10 text-[#2a78d6]',
  USER: 'bg-[#e1e0d9] text-[#52514e]',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function AdminUsersPage() {
  const { toast } = useToast();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    api<AdminMe>('/api/admin/me')
      .then(setMe)
      .catch(() => {
        // Layout already redirected non-admins away — this call should not
        // fail here, but if it does, capability-gated actions simply stay hidden.
      });
  }, []);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (q) params.set('q', q);
      if (!reset && cursor) params.set('cursor', cursor);
      const res = await api<ListResponse>(`/api/admin/users?${params.toString()}`);
      setUsers((prev) => (reset ? res.items : [...prev, ...res.items]));
      setCursor(res.nextCursor);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);
  }, []);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    void load(true);
  }

  async function onRoleChange(userRow: AdminUserRow, role: Role) {
    if (role === userRow.role) return;
    if (!window.confirm(`Changer le rôle de ${userRow.email} : ${userRow.role} → ${role} ?`)) {
      return;
    }
    setBusyId(userRow.id);
    try {
      await api(`/api/admin/users/${userRow.id}/role`, { method: 'PATCH', body: { role } });
      setUsers((prev) => prev.map((u) => (u.id === userRow.id ? { ...u, role } : u)));
      toast('Rôle mis à jour.');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function onStatusChange(userRow: AdminUserRow, status: Status) {
    const verb = status === 'SUSPENDED' ? 'suspendre' : 'réactiver';
    if (!window.confirm(`Voulez-vous ${verb} le compte de ${userRow.email} ?`)) return;
    setBusyId(userRow.id);
    try {
      await api(`/api/admin/users/${userRow.id}/status`, { method: 'PATCH', body: { status } });
      setUsers((prev) => prev.map((u) => (u.id === userRow.id ? { ...u, status } : u)));
      toast(status === 'SUSPENDED' ? 'Compte suspendu.' : 'Compte réactivé.');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  const canChangeRole = me?.can.includes('users:role') ?? false;
  const canSuspend = me?.can.includes('users:status:suspend') ?? false;
  const canRestore = me?.can.includes('users:status:restore') ?? false;

  return (
    <div className="animate-fade-in-up flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0b0b0b]">Personnel</h1>
          <p className="mt-1 text-sm text-[#52514e]">
            Comptes du personnel, rôles et accès à l’application.
          </p>
        </div>
        <form onSubmit={onSearch} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="search"
            placeholder="Rechercher par nom ou email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none sm:w-64"
          />
          <button
            type="submit"
            className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
          >
            Rechercher
          </button>
        </form>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-[#e1e0d9] bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#e1e0d9] text-xs uppercase tracking-wide text-[#898781]">
              <th className="px-5 py-2 font-medium">Nom</th>
              <th className="px-5 py-2 font-medium">Email</th>
              <th className="px-5 py-2 font-medium">Rôle</th>
              <th className="px-5 py-2 font-medium">Statut</th>
              <th className="px-5 py-2 font-medium">Vérifié</th>
              <th className="px-5 py-2 font-medium">Inscrit</th>
              <th className="px-5 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-[#e1e0d9] last:border-0 hover:bg-[#f9f9f7]">
                <td className="px-5 py-3 font-medium text-[#0b0b0b]">{u.name ?? '—'}</td>
                <td className="px-5 py-3 text-[#52514e]">{u.email}</td>
                <td className="px-5 py-3">
                  {canChangeRole ? (
                    <select
                      aria-label={`Changer le rôle de ${u.email}`}
                      value={u.role}
                      disabled={busyId === u.id}
                      onChange={(e) => onRoleChange(u, e.target.value as Role)}
                      className="rounded-md border border-[#e1e0d9] bg-white px-2 py-1 text-xs text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none disabled:opacity-50"
                    >
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="SUPERADMIN">SUPERADMIN</option>
                    </select>
                  ) : (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[u.role]}`}
                    >
                      {u.role}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.status === 'SUSPENDED'
                        ? 'bg-[#d03b3b]/10 text-[#d03b3b]'
                        : 'bg-[#0ca30c]/10 text-[#0ca30c]'
                    }`}
                  >
                    {u.status === 'SUSPENDED' ? 'Suspendu' : 'Actif'}
                  </span>
                </td>
                <td className="px-5 py-3 text-[#52514e]">{u.emailVerifiedAt ? '✓' : '—'}</td>
                <td className="px-5 py-3 text-[#52514e]">{formatDate(u.createdAt)}</td>
                <td className="px-5 py-3">
                  {u.status === 'ACTIVE' && canSuspend && (
                    <button
                      type="button"
                      onClick={() => onStatusChange(u, 'SUSPENDED')}
                      disabled={busyId === u.id}
                      className="text-xs font-medium text-[#d03b3b] hover:underline disabled:opacity-50"
                    >
                      Suspendre
                    </button>
                  )}
                  {u.status === 'SUSPENDED' && canRestore && (
                    <button
                      type="button"
                      onClick={() => onStatusChange(u, 'ACTIVE')}
                      disabled={busyId === u.id}
                      className="text-xs font-medium text-[#2a78d6] hover:underline disabled:opacity-50"
                    >
                      Réactiver
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && users.length === 0 && !error && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-[#898781]">
                  Aucun compte ne correspond à cette recherche.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {cursor && (
        <button
          type="button"
          onClick={() => load(false)}
          disabled={loading}
          className="self-center rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7] disabled:opacity-50"
        >
          {loading ? 'Chargement…' : 'Charger plus'}
        </button>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';

interface AuditLogRow {
  id: string;
  actorId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface ListResponse {
  items: AuditLogRow[];
  nextCursor: string | null;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminAuditLogPage() {
  const [items, setItems] = useState<AuditLogRow[]>([]);
  const [action, setAction] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (action) params.set('action', action);
      if (!reset && cursor) params.set('cursor', cursor);
      const res = await api<ListResponse>(`/api/admin/audit-log?${params.toString()}`);
      setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
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

  function onFilter(e: FormEvent) {
    e.preventDefault();
    void load(true);
  }

  return (
    <div className="animate-fade-in-up flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0b0b0b]">Journal d’audit</h1>
          <p className="mt-1 text-sm text-[#52514e]">
            Historique des actions effectuées depuis l’administration.
          </p>
        </div>
        <form onSubmit={onFilter} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            placeholder="Filtrer par action (ex: user.role_change)"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none sm:w-72"
          />
          <button
            type="submit"
            className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
          >
            Filtrer
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
              <th className="px-5 py-2 font-medium">Date</th>
              <th className="px-5 py-2 font-medium">Action</th>
              <th className="px-5 py-2 font-medium">Cible</th>
              <th className="px-5 py-2 font-medium">Détails</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-b border-[#e1e0d9] last:border-0">
                <td className="px-5 py-3 text-[#52514e] whitespace-nowrap">
                  {formatDateTime(row.createdAt)}
                </td>
                <td className="px-5 py-3">
                  <span className="rounded-full bg-[#2a78d6]/10 px-2 py-0.5 text-xs font-medium text-[#2a78d6]">
                    {row.action}
                  </span>
                </td>
                <td className="px-5 py-3 text-[#52514e]">
                  {row.targetType ? `${row.targetType} · ${row.targetId ?? '—'}` : '—'}
                </td>
                <td className="px-5 py-3 font-mono text-xs text-[#898781]">
                  {row.metadata ? JSON.stringify(row.metadata) : '—'}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && !error && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-sm text-[#898781]">
                  Aucune entrée trouvée.
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

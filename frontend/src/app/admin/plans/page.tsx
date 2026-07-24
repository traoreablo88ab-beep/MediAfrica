'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { useToast } from '@/contexts/ToastContext';

interface Plan {
  id: string;
  name: string;
  priceAmount: number;
  currency: string;
  billingIntervalDays: number;
  isActive: boolean;
  subscriberCount: number;
  createdAt: string;
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' ' + currency;
}

export default function AdminPlansPage() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newInterval, setNewInterval] = useState('30');
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ items: Plan[] }>('/api/admin/plans');
      setPlans(res.items);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function startEdit(plan: Plan) {
    setEditingId(plan.id);
    setEditPrice(String(plan.priceAmount));
  }

  async function savePrice(plan: Plan) {
    const amount = Number(editPrice);
    if (!Number.isInteger(amount) || amount < 0) {
      toast('Le prix doit être un nombre entier positif.', 'error');
      return;
    }
    setBusyId(plan.id);
    try {
      const updated = await api<Plan>(`/api/admin/plans/${plan.id}`, {
        method: 'PATCH',
        body: { priceAmount: amount },
      });
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, ...updated } : p)));
      setEditingId(null);
      toast(
        'Prix mis à jour. Les abonnés actuels ne sont pas affectés avant leur prochain renouvellement.',
      );
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(plan: Plan) {
    setBusyId(plan.id);
    try {
      const updated = await api<Plan>(`/api/admin/plans/${plan.id}`, {
        method: 'PATCH',
        body: { isActive: !plan.isActive },
      });
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, ...updated } : p)));
      toast(updated.isActive ? 'Forfait réactivé.' : 'Forfait archivé.');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const amount = Number(newPrice);
    const interval = Number(newInterval);
    if (!newName.trim() || !Number.isInteger(amount) || amount < 0) {
      toast('Nom et prix (entier positif) requis.', 'error');
      return;
    }
    setCreating(true);
    try {
      await api('/api/admin/plans', {
        method: 'POST',
        body: { name: newName.trim(), priceAmount: amount, billingIntervalDays: interval },
      });
      setNewName('');
      setNewPrice('');
      setNewInterval('30');
      setShowCreate(false);
      toast('Forfait créé.');
      await load();
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="animate-fade-in-up flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0b0b0b]">Abonnements</h1>
          <p className="mt-1 text-sm text-[#52514e]">
            Modifier le prix d&apos;un forfait n&apos;affecte que les prochains renouvellements —
            jamais les abonnés en cours.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#2a78d6]/90"
        >
          {showCreate ? 'Annuler' : 'Nouveau forfait'}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]">
          {error}
        </p>
      )}

      {showCreate && (
        <form
          onSubmit={onCreate}
          className="flex flex-col gap-3 rounded-xl border border-[#e1e0d9] bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.04)] sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label className="text-xs font-medium text-[#52514e]">Nom</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex: Standard"
              className="mt-1 w-full rounded-md border border-[#e1e0d9] px-3 py-2 text-sm focus:border-[#2a78d6] focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#52514e]">Prix (FCFA)</label>
            <input
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              inputMode="numeric"
              placeholder="15000"
              className="mt-1 w-32 rounded-md border border-[#e1e0d9] px-3 py-2 text-sm focus:border-[#2a78d6] focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#52514e]">Intervalle (jours)</label>
            <input
              value={newInterval}
              onChange={(e) => setNewInterval(e.target.value)}
              inputMode="numeric"
              className="mt-1 w-28 rounded-md border border-[#e1e0d9] px-3 py-2 text-sm focus:border-[#2a78d6] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a78d6]/90 disabled:opacity-50"
          >
            {creating ? 'Création…' : 'Créer'}
          </button>
        </form>
      )}

      {!loading && plans.length === 0 && !error && (
        <p className="rounded-xl border border-dashed border-[#e1e0d9] bg-white px-5 py-10 text-center text-sm text-[#898781]">
          Aucun forfait pour le moment.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`relative overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)] transition-shadow hover:shadow-[0_8px_20px_-8px_rgba(11,11,11,0.12)] ${
              plan.isActive ? 'border-[#e1e0d9]' : 'border-[#e1e0d9] opacity-70'
            }`}
          >
            <div
              className="h-1.5 w-full"
              style={{ background: plan.isActive ? '#2a78d6' : '#c9c8c1' }}
            />
            <div className="p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-semibold text-[#0b0b0b]">{plan.name}</h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    plan.isActive ? 'bg-[#0ca30c]/10 text-[#0ca30c]' : 'bg-[#e1e0d9] text-[#52514e]'
                  }`}
                >
                  {plan.isActive ? 'Actif' : 'Archivé'}
                </span>
              </div>

              <div className="mt-4">
                {editingId === plan.id ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-1">
                      <input
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        inputMode="numeric"
                        autoFocus
                        className="w-32 rounded-md border border-[#2a78d6] px-2 py-1 text-lg font-bold focus:outline-none"
                      />
                      <span className="text-sm text-[#898781]">{plan.currency}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => savePrice(plan)}
                        disabled={busyId === plan.id}
                        className="text-xs font-medium text-[#2a78d6] hover:underline disabled:opacity-50"
                      >
                        Enregistrer
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-xs font-medium text-[#898781] hover:underline"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(plan)}
                    className="group/price flex items-baseline gap-1.5 text-left"
                  >
                    <span className="text-3xl font-bold tracking-tight text-[#0b0b0b] group-hover/price:text-[#2a78d6]">
                      {formatAmount(plan.priceAmount, plan.currency)}
                    </span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      className="h-3.5 w-3.5 text-[#898781] opacity-0 transition-opacity group-hover/price:opacity-100"
                      aria-hidden="true"
                    >
                      <path
                        d="M4 20l1-4L16.5 4.5a1.5 1.5 0 012 2L7 18l-4 1z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
                <p className="mt-1 text-xs text-[#898781]">
                  tous les {plan.billingIntervalDays} jours
                </p>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-[#e1e0d9] pt-4">
                <div className="flex items-center gap-1.5 text-sm text-[#52514e]">
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                    <circle cx="9" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.6" />
                    <path
                      d="M3.5 19c0-2.8 2.4-4.8 5.5-4.8s5.5 2 5.5 4.8"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="font-medium text-[#0b0b0b]">{plan.subscriberCount}</span>
                  abonné{plan.subscriberCount > 1 ? 's' : ''}
                </div>
                <button
                  type="button"
                  onClick={() => toggleActive(plan)}
                  disabled={busyId === plan.id}
                  className="text-xs font-medium text-[#52514e] hover:text-[#d03b3b] hover:underline disabled:opacity-50"
                >
                  {plan.isActive ? 'Archiver' : 'Réactiver'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

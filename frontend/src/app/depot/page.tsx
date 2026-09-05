'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useClinicName } from '@/lib/useClinicName';

interface Produit {
  id: string;
  nom: string;
  prixUnitaire: number;
  stockActuel: number;
  seuilAlerteStock: number | null;
  actif: boolean;
}

interface VenteLigne {
  id: string;
  produitId: string;
  produitNom: string;
  quantite: number;
  prixUnitaireApplique: number;
  sousTotal: number;
}

interface Vente {
  id: string;
  numeroSequence: number;
  patientNom: string;
  patientId: string | null;
  montantTotal: number;
  modePaiement: 'especes' | 'mobile_money' | 'exoneration';
  gerantId: string;
  gerantName: string;
  statut: 'emise' | 'annulee';
  createdAt: string;
  annulationMotif: string | null;
  annulationParId: string | null;
  annulationAt: string | null;
  lignes: VenteLigne[];
}

interface CartLine {
  produitId: string;
  quantite: number;
}

const MODE_LABELS: Record<string, string> = {
  especes: 'Espèces',
  mobile_money: 'Mobile Money',
  exoneration: 'Exonération',
};

function formatFcfa(n: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(n)} FCFA`;
}

function formatHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const inputClass =
  'w-full rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] placeholder:text-[#898781] focus:border-[#2a78d6] focus:outline-none';

export default function DepotPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const clinicName = useClinicName();
  const isAdmin = user?.orgRole === 'OWNER' || user?.orgRole === 'ADMIN';

  const [produits, setProduits] = useState<Produit[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [patientNom, setPatientNom] = useState('');
  const [modePaiement, setModePaiement] = useState<'especes' | 'mobile_money' | 'exoneration'>(
    'especes',
  );
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pickProduitId, setPickProduitId] = useState('');
  const [pickQuantite, setPickQuantite] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<Vente | null>(null);

  const [cancelTarget, setCancelTarget] = useState<Vente | null>(null);
  const [cancelMotif, setCancelMotif] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [produitsRes, ventesRes] = await Promise.all([
        api<{ produits: Produit[] }>('/api/depot/produits'),
        api<{ ventes: Vente[] }>('/api/depot/ventes'),
      ]);
      setProduits(produitsRes.produits.filter((p) => p.actif));
      setVentes(ventesRes.ventes);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const produitById = new Map(produits.map((p) => [p.id, p]));
  const cartTotal = cart.reduce((sum, l) => {
    const p = produitById.get(l.produitId);
    return sum + (p ? p.prixUnitaire * l.quantite : 0);
  }, 0);

  function addToCart() {
    setFormError(null);
    if (!pickProduitId) {
      setFormError('Sélectionnez un produit.');
      return;
    }
    const qty = Number(pickQuantite);
    if (!Number.isInteger(qty) || qty <= 0) {
      setFormError('La quantité doit être un entier positif.');
      return;
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.produitId === pickProduitId);
      if (existing) {
        return prev.map((l) =>
          l.produitId === pickProduitId ? { ...l, quantite: l.quantite + qty } : l,
        );
      }
      return [...prev, { produitId: pickProduitId, quantite: qty }];
    });
    setPickProduitId('');
    setPickQuantite('1');
  }

  function removeFromCart(produitId: string) {
    setCart((prev) => prev.filter((l) => l.produitId !== produitId));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!patientNom.trim()) {
      setFormError('Le nom du patient est obligatoire.');
      return;
    }
    if (cart.length === 0) {
      setFormError('Ajoutez au moins un produit au panier.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await api<Vente>('/api/depot/ventes', {
        method: 'POST',
        body: {
          patientNom: patientNom.trim(),
          modePaiement,
          lignes: cart.map((l) => ({ produitId: l.produitId, quantite: l.quantite })),
        },
      });
      setLastReceipt(created);
      setVentes((prev) => [...prev, created]);
      toast(`Vente n°${created.numeroSequence} émise.`);
      setPatientNom('');
      setModePaiement('especes');
      setCart([]);
      void load();
    } catch (err) {
      setFormError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  function openCancel(v: Vente) {
    setCancelTarget(v);
    setCancelMotif('');
    setCancelError(null);
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    if (cancelMotif.trim().length < 3) {
      setCancelError('Le motif doit contenir au moins 3 caractères.');
      return;
    }
    setCancelling(true);
    setCancelError(null);
    try {
      const updated = await api<{
        id: string;
        statut: string;
        annulationMotif: string;
        annulationParId: string;
        annulationAt: string;
      }>(`/api/depot/ventes/${cancelTarget.id}/annuler`, {
        method: 'POST',
        body: { motif: cancelMotif.trim() },
      });
      setVentes((prev) =>
        prev.map((v) =>
          v.id === updated.id
            ? {
                ...v,
                statut: 'annulee',
                annulationMotif: updated.annulationMotif,
                annulationParId: updated.annulationParId,
                annulationAt: updated.annulationAt,
              }
            : v,
        ),
      );
      toast('Vente annulée.');
      setCancelTarget(null);
      void load();
    } catch (err) {
      setCancelError(friendlyError(err));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader active="depot" />
      <div className="animate-fade-in-up mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Dépôt de vente de médicaments</h1>
            <p className="mt-1 text-sm text-[#52514e]">{clinicName}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/depot/cloture"
              className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
            >
              Clôturer ma caisse
            </Link>
            {isAdmin && (
              <Link
                href="/depot/produits"
                className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
              >
                Catalogue & fiche de stock
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/depot/rapports"
                className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
              >
                Rapports
              </Link>
            )}
            {user?.orgRole === 'OWNER' && (
              <Link
                href="/depot/alertes"
                className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
              >
                Centre de notifications
              </Link>
            )}
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]"
          >
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-6 rounded-lg border border-[#e1e0d9] bg-white p-5 lg:col-span-2"
          >
            <h2 className="font-semibold text-[#0b0b0b]">Émettre une vente</h2>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
                Nom du patient *
              </label>
              <input
                className={inputClass}
                placeholder="Ex: Fatoumata Keïta"
                value={patientNom}
                onChange={(e) => setPatientNom(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
                Mode de paiement *
              </label>
              <select
                className={inputClass}
                value={modePaiement}
                onChange={(e) => setModePaiement(e.target.value as typeof modePaiement)}
              >
                <option value="especes">Espèces</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="exoneration">Exonération</option>
              </select>
            </div>

            <div className="rounded-md border border-[#e1e0d9] p-3">
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-[#898781]">
                Ajouter un produit
              </label>
              {loading ? (
                <Skeleton className="h-10 w-full" />
              ) : produits.length === 0 ? (
                <p className="rounded-md border border-dashed border-[#e1e0d9] px-4 py-6 text-center text-sm text-[#898781]">
                  Aucun produit actif.{' '}
                  {isAdmin ? (
                    <Link href="/depot/produits" className="text-[#2a78d6] hover:underline">
                      Configurer le catalogue
                    </Link>
                  ) : (
                    'Contactez le responsable du centre.'
                  )}
                </p>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    className={inputClass}
                    value={pickProduitId}
                    onChange={(e) => setPickProduitId(e.target.value)}
                  >
                    <option value="">Sélectionner un produit…</option>
                    {produits.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.stockActuel <= 0}>
                        {p.nom} — {formatFcfa(p.prixUnitaire)}{' '}
                        {p.stockActuel <= 0 ? '(rupture)' : `(stock: ${p.stockActuel})`}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    className={`sm:w-24 ${inputClass}`}
                    value={pickQuantite}
                    onChange={(e) => setPickQuantite(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={addToCart}
                    className="whitespace-nowrap rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
                  >
                    + Ajouter
                  </button>
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="rounded-md border border-[#e1e0d9]">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#e1e0d9] text-xs uppercase tracking-wide text-[#898781]">
                      <th className="px-3 py-2 font-medium">Produit</th>
                      <th className="px-3 py-2 font-medium">Qté</th>
                      <th className="px-3 py-2 font-medium">Sous-total</th>
                      <th className="px-3 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((l) => {
                      const p = produitById.get(l.produitId);
                      return (
                        <tr key={l.produitId} className="border-b border-[#e1e0d9] last:border-0">
                          <td className="px-3 py-2 text-[#0b0b0b]">{p?.nom ?? l.produitId}</td>
                          <td className="px-3 py-2 text-[#52514e] [font-variant-numeric:tabular-nums]">
                            {l.quantite}
                          </td>
                          <td className="px-3 py-2 text-[#0b0b0b] [font-variant-numeric:tabular-nums]">
                            {formatFcfa((p?.prixUnitaire ?? 0) * l.quantite)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => removeFromCart(l.produitId)}
                              className="text-xs font-medium text-[#d03b3b] hover:underline"
                            >
                              Retirer
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} className="px-3 py-2 text-right font-medium text-[#0b0b0b]">
                        Total
                      </td>
                      <td
                        colSpan={2}
                        className="px-3 py-2 font-semibold text-[#0b0b0b] [font-variant-numeric:tabular-nums]"
                      >
                        {formatFcfa(cartTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {formError && (
              <p role="alert" className="text-sm text-[#d03b3b]">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
            >
              {submitting ? 'Émission…' : '✓ Émettre la vente'}
            </button>
          </form>

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-3 font-semibold text-[#0b0b0b]">Dernier ticket</h2>
            {lastReceipt ? (
              <div className="rounded-md border border-dashed border-[#e1e0d9] p-4 text-sm">
                <p className="text-center font-semibold text-[#0b0b0b]">{clinicName}</p>
                <p className="mb-3 text-center text-xs text-[#898781]">
                  Vente n° {lastReceipt.numeroSequence}
                </p>
                <dl className="flex flex-col gap-1.5">
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#898781]">Patient</dt>
                    <dd className="text-right font-medium text-[#0b0b0b]">
                      {lastReceipt.patientNom}
                    </dd>
                  </div>
                  {lastReceipt.lignes.map((l) => (
                    <div key={l.id} className="flex justify-between gap-3">
                      <dt className="text-[#898781]">
                        {l.produitNom} × {l.quantite}
                      </dt>
                      <dd className="text-right text-[#0b0b0b] [font-variant-numeric:tabular-nums]">
                        {formatFcfa(l.sousTotal)}
                      </dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-3 border-t border-[#e1e0d9] pt-1.5">
                    <dt className="text-[#898781]">Total</dt>
                    <dd className="text-right font-semibold text-[#0b0b0b] [font-variant-numeric:tabular-nums]">
                      {formatFcfa(lastReceipt.montantTotal)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#898781]">Paiement</dt>
                    <dd className="text-right text-[#0b0b0b]">
                      {MODE_LABELS[lastReceipt.modePaiement]}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#898781]">Date</dt>
                    <dd className="text-right text-[#0b0b0b]">
                      {formatDateLong(lastReceipt.createdAt)} — {formatHeure(lastReceipt.createdAt)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#898781]">Gérant</dt>
                    <dd className="text-right text-[#0b0b0b]">{lastReceipt.gerantName}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-[#e1e0d9] px-4 py-8 text-center text-sm text-[#898781]">
                Aucune vente émise pour l’instant.
              </p>
            )}
          </div>
        </div>

        <h2 className="mb-3 mt-8 font-semibold text-[#0b0b0b]">Historique du jour</h2>
        <div className="overflow-hidden overflow-x-auto rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#e1e0d9] text-xs uppercase tracking-wide text-[#898781]">
                <th className="px-5 py-2 font-medium">N°</th>
                <th className="px-5 py-2 font-medium">Heure</th>
                <th className="px-5 py-2 font-medium">Patient</th>
                <th className="px-5 py-2 font-medium">Produits</th>
                <th className="px-5 py-2 font-medium">Montant</th>
                <th className="px-5 py-2 font-medium">Paiement</th>
                {isAdmin && <th className="px-5 py-2 font-medium">Gérant</th>}
                <th className="px-5 py-2 font-medium">Statut</th>
                <th className="px-5 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                ventes.length === 0 &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-[#e1e0d9] last:border-0">
                    <td className="px-5 py-3" colSpan={isAdmin ? 9 : 8}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))}
              {!loading && ventes.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 9 : 8}
                    className="px-5 py-8 text-center text-sm text-[#898781]"
                  >
                    Aucune vente aujourd’hui.
                  </td>
                </tr>
              )}
              {ventes.map((v) => {
                const cancelled = v.statut === 'annulee';
                const canCancel = !cancelled && (isAdmin || v.gerantId === user?.id);
                const produitsSummary = v.lignes
                  .map((l) => `${l.produitNom} ×${l.quantite}`)
                  .join(', ');
                return (
                  <tr
                    key={v.id}
                    className={`border-b border-[#e1e0d9] last:border-0 hover:bg-[#f9f9f7] ${cancelled ? 'opacity-50' : ''}`}
                  >
                    <td className="px-5 py-3 text-[#898781] [font-variant-numeric:tabular-nums]">
                      {v.numeroSequence}
                    </td>
                    <td className="px-5 py-3 text-[#52514e] [font-variant-numeric:tabular-nums]">
                      {formatHeure(v.createdAt)}
                    </td>
                    <td
                      className={`px-5 py-3 font-medium text-[#0b0b0b] ${cancelled ? 'line-through' : ''}`}
                    >
                      {v.patientNom}
                    </td>
                    <td
                      className="max-w-[220px] truncate px-5 py-3 text-[#52514e]"
                      title={produitsSummary}
                    >
                      {produitsSummary}
                    </td>
                    <td className="px-5 py-3 text-[#0b0b0b] [font-variant-numeric:tabular-nums]">
                      {formatFcfa(v.montantTotal)}
                    </td>
                    <td className="px-5 py-3 text-[#52514e]">{MODE_LABELS[v.modePaiement]}</td>
                    {isAdmin && <td className="px-5 py-3 text-[#52514e]">{v.gerantName}</td>}
                    <td className="px-5 py-3">
                      {cancelled ? (
                        <span
                          title={v.annulationMotif ?? ''}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#d03b3b]/10 px-2 py-0.5 text-xs font-medium text-[#d03b3b]"
                        >
                          Annulée
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0ca30c]/10 px-2 py-0.5 text-xs font-medium text-[#0ca30c]">
                          Émise
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {canCancel && (
                        <button
                          type="button"
                          onClick={() => openCancel(v)}
                          className="text-xs font-medium text-[#d03b3b] hover:underline"
                        >
                          Annuler
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h3 className="mb-1 font-semibold text-[#0b0b0b]">
              Annuler la vente n° {cancelTarget.numeroSequence}
            </h3>
            <p className="mb-3 text-sm text-[#52514e]">
              {cancelTarget.patientNom} — {formatFcfa(cancelTarget.montantTotal)}
            </p>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
              Motif *
            </label>
            <textarea
              className={inputClass}
              rows={3}
              placeholder="Ex: Erreur de saisie du produit"
              value={cancelMotif}
              onChange={(e) => setCancelMotif(e.target.value)}
            />
            {cancelError && (
              <p role="alert" className="mt-2 text-sm text-[#d03b3b]">
                {cancelError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => void confirmCancel()}
                disabled={cancelling}
                className="rounded-md bg-[#d03b3b] px-4 py-2 text-sm font-medium text-white hover:bg-[#b83232] disabled:opacity-50"
              >
                {cancelling ? 'Annulation…' : 'Confirmer l’annulation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

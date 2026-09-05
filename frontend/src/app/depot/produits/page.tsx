'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';

interface Produit {
  id: string;
  nom: string;
  prixUnitaire: number;
  stockActuel: number;
  seuilAlerteStock: number | null;
  actif: boolean;
}

interface Mouvement {
  id: string;
  type: 'vente' | 'annulation_vente' | 'entree' | 'sortie';
  quantite: number;
  motif: string | null;
  venteId: string | null;
  stockAvant: number;
  stockApres: number;
  auteurName: string;
  createdAt: string;
}

const MOUVEMENT_LABELS: Record<Mouvement['type'], string> = {
  vente: 'Vente',
  annulation_vente: 'Annulation de vente',
  entree: 'Entrée',
  sortie: 'Sortie',
};

const INCREASING_TYPES = new Set<Mouvement['type']>(['entree', 'annulation_vente']);

function formatFcfa(n: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(n)} FCFA`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const inputClass =
  'w-full rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] placeholder:text-[#898781] focus:border-[#2a78d6] focus:outline-none';

export default function DepotProduitsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [produits, setProduits] = useState<Produit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nom, setNom] = useState('');
  const [prixUnitaire, setPrixUnitaire] = useState('');
  const [seuilAlerteStock, setSeuilAlerteStock] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [selectedProduitId, setSelectedProduitId] = useState('');
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [mouvementsLoading, setMouvementsLoading] = useState(false);
  const [mouvementsCursor, setMouvementsCursor] = useState<string | null>(null);
  const [mouvementsError, setMouvementsError] = useState<string | null>(null);

  const [movType, setMovType] = useState<'entree' | 'sortie'>('entree');
  const [movQuantite, setMovQuantite] = useState('');
  const [movMotif, setMovMotif] = useState('');
  const [movSubmitting, setMovSubmitting] = useState(false);
  const [movError, setMovError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ produits: Produit[] }>('/api/depot/produits');
      setProduits(res.produits);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMouvements = useCallback(async (produitId: string, cursor?: string) => {
    if (!produitId) return;
    setMouvementsLoading(true);
    setMouvementsError(null);
    try {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      const qs = params.toString();
      const res = await api<{ items: Mouvement[]; nextCursor: string | null }>(
        `/api/depot/produits/${produitId}/mouvements${qs ? `?${qs}` : ''}`,
      );
      setMouvements((prev) => (cursor ? [...prev, ...res.items] : res.items));
      setMouvementsCursor(res.nextCursor);
    } catch (err) {
      setMouvementsError(friendlyError(err));
    } finally {
      setMouvementsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProduitId) {
      setMouvements([]);
      setMouvementsCursor(null);
      void loadMouvements(selectedProduitId);
    }
  }, [selectedProduitId, loadMouvements]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!nom.trim() || prixUnitaire === '') {
      setCreateError('Le nom et le prix unitaire sont obligatoires.');
      return;
    }
    setCreating(true);
    try {
      const created = await api<Produit>('/api/depot/produits', {
        method: 'POST',
        body: {
          nom: nom.trim(),
          prixUnitaire: Number(prixUnitaire),
          ...(seuilAlerteStock !== '' ? { seuilAlerteStock: Number(seuilAlerteStock) } : {}),
        },
      });
      setProduits((prev) => [...prev, created].sort((a, b) => a.nom.localeCompare(b.nom)));
      toast('Produit ajouté.');
      setNom('');
      setPrixUnitaire('');
      setSeuilAlerteStock('');
    } catch (err) {
      setCreateError(friendlyError(err));
    } finally {
      setCreating(false);
    }
  }

  async function onToggleActif(p: Produit) {
    setBusyId(p.id);
    const previous = produits;
    setProduits((prev) => prev.map((x) => (x.id === p.id ? { ...x, actif: !x.actif } : x)));
    try {
      await api(`/api/depot/produits/${p.id}`, { method: 'PATCH', body: { actif: !p.actif } });
    } catch (err) {
      setProduits(previous);
      toast(friendlyError(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function onEditPrix(p: Produit) {
    const raw = window.prompt(
      `Nouveau prix unitaire pour "${p.nom}" (FCFA) :`,
      String(p.prixUnitaire),
    );
    if (raw === null) return;
    const next = Number(raw);
    if (!Number.isInteger(next) || next < 0) {
      toast('Prix invalide.', 'error');
      return;
    }
    setBusyId(p.id);
    const previous = produits;
    setProduits((prev) => prev.map((x) => (x.id === p.id ? { ...x, prixUnitaire: next } : x)));
    try {
      await api(`/api/depot/produits/${p.id}`, { method: 'PATCH', body: { prixUnitaire: next } });
      toast('Prix mis à jour.');
    } catch (err) {
      setProduits(previous);
      toast(friendlyError(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function onEditSeuil(p: Produit) {
    const raw = window.prompt(
      `Nouveau seuil d'alerte de stock pour "${p.nom}" (laisser vide pour aucun) :`,
      p.seuilAlerteStock !== null ? String(p.seuilAlerteStock) : '',
    );
    if (raw === null) return;
    const next = raw.trim() === '' ? null : Number(raw);
    if (next !== null && (!Number.isInteger(next) || next < 0)) {
      toast('Seuil invalide.', 'error');
      return;
    }
    setBusyId(p.id);
    const previous = produits;
    setProduits((prev) => prev.map((x) => (x.id === p.id ? { ...x, seuilAlerteStock: next } : x)));
    try {
      await api(`/api/depot/produits/${p.id}`, {
        method: 'PATCH',
        body: { seuilAlerteStock: next },
      });
      toast('Seuil mis à jour.');
    } catch (err) {
      setProduits(previous);
      toast(friendlyError(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function onSubmitMouvement(e: FormEvent) {
    e.preventDefault();
    setMovError(null);
    if (!selectedProduitId) {
      setMovError('Sélectionnez un produit.');
      return;
    }
    const qty = Number(movQuantite);
    if (!Number.isInteger(qty) || qty <= 0) {
      setMovError('La quantité doit être un entier positif.');
      return;
    }
    if (movMotif.trim().length < 3) {
      setMovError('Le motif doit contenir au moins 3 caractères.');
      return;
    }
    setMovSubmitting(true);
    try {
      const updated = await api<{ id: string; nom: string; stockActuel: number }>(
        `/api/depot/produits/${selectedProduitId}/mouvements`,
        { method: 'POST', body: { type: movType, quantite: qty, motif: movMotif.trim() } },
      );
      setProduits((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, stockActuel: updated.stockActuel } : p)),
      );
      toast(`${movType === 'entree' ? 'Entrée' : 'Sortie'} enregistrée.`);
      setMovQuantite('');
      setMovMotif('');
      setMouvements([]);
      setMouvementsCursor(null);
      void loadMouvements(selectedProduitId);
    } catch (err) {
      setMovError(friendlyError(err));
    } finally {
      setMovSubmitting(false);
    }
  }

  if (!user) return null;
  const canManage = user.orgRole === 'OWNER' || user.orgRole === 'ADMIN';

  if (!canManage) {
    return (
      <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
        <AppHeader active="depot" />
        <div className="mx-auto max-w-4xl px-6 py-6">
          <p role="alert" className="rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]">
            Accès réservé au propriétaire ou à un administrateur du centre.
          </p>
        </div>
      </main>
    );
  }

  const selectedProduit = produits.find((p) => p.id === selectedProduitId) ?? null;

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader active="depot" />
      <div className="animate-fade-in-up mx-auto max-w-4xl px-6 py-6">
        <p className="mb-4 text-sm text-[#898781]">
          <Link href="/depot" className="hover:underline">
            Dépôt
          </Link>{' '}
          / Catalogue & fiche de stock
        </p>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#0b0b0b]">Catalogue & fiche de stock</h1>
          <p className="mt-1 text-sm text-[#52514e]">
            Le stock d’un produit ne change jamais directement — chaque entrée, sortie, vente ou
            annulation est tracée dans la fiche de stock ci-dessous.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]"
          >
            {error}
          </p>
        )}

        <h2 className="mb-3 font-semibold text-[#0b0b0b]">Catalogue</h2>
        <form
          onSubmit={onCreate}
          className="mb-6 flex flex-col gap-3 rounded-lg border border-[#e1e0d9] bg-white p-5 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
              Nom du produit
            </label>
            <input
              className={inputClass}
              placeholder="Ex: Paracétamol 500mg"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
            />
          </div>
          <div className="sm:w-40">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
              Prix unitaire (FCFA)
            </label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={prixUnitaire}
              onChange={(e) => setPrixUnitaire(e.target.value)}
            />
          </div>
          <div className="sm:w-40">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
              Seuil d’alerte
            </label>
            <input
              type="number"
              min={0}
              className={inputClass}
              placeholder="Optionnel"
              value={seuilAlerteStock}
              onChange={(e) => setSeuilAlerteStock(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="whitespace-nowrap rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
          >
            {creating ? 'Ajout…' : '+ Ajouter'}
          </button>
        </form>
        {createError && (
          <p role="alert" className="mb-4 text-sm text-[#d03b3b]">
            {createError}
          </p>
        )}

        <div className="mb-8 overflow-hidden overflow-x-auto rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#e1e0d9] text-xs uppercase tracking-wide text-[#898781]">
                <th className="px-5 py-2 font-medium">Nom</th>
                <th className="px-5 py-2 font-medium">Prix</th>
                <th className="px-5 py-2 font-medium">Stock</th>
                <th className="px-5 py-2 font-medium">Seuil d’alerte</th>
                <th className="px-5 py-2 font-medium">Statut</th>
                <th className="px-5 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                produits.length === 0 &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-[#e1e0d9] last:border-0">
                    <td className="px-5 py-3" colSpan={6}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))}
              {!loading && produits.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-[#898781]">
                    Aucun produit configuré.
                  </td>
                </tr>
              )}
              {produits.map((p) => {
                const rupture = p.stockActuel <= 0;
                const alerte =
                  !rupture && p.seuilAlerteStock !== null && p.stockActuel <= p.seuilAlerteStock;
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-[#e1e0d9] last:border-0 hover:bg-[#f9f9f7] ${!p.actif ? 'opacity-50' : ''}`}
                  >
                    <td className="px-5 py-3 font-medium text-[#0b0b0b]">{p.nom}</td>
                    <td className="px-5 py-3 text-[#0b0b0b] [font-variant-numeric:tabular-nums]">
                      <button
                        type="button"
                        onClick={() => void onEditPrix(p)}
                        disabled={busyId === p.id}
                        className="hover:underline disabled:opacity-50"
                      >
                        {formatFcfa(p.prixUnitaire)}
                      </button>
                    </td>
                    <td
                      className={`px-5 py-3 [font-variant-numeric:tabular-nums] ${
                        rupture
                          ? 'font-semibold text-[#d03b3b]'
                          : alerte
                            ? 'font-semibold text-[#d08a1c]'
                            : 'text-[#0b0b0b]'
                      }`}
                    >
                      {p.stockActuel}
                    </td>
                    <td className="px-5 py-3 text-[#52514e] [font-variant-numeric:tabular-nums]">
                      <button
                        type="button"
                        onClick={() => void onEditSeuil(p)}
                        disabled={busyId === p.id}
                        className="hover:underline disabled:opacity-50"
                      >
                        {p.seuilAlerteStock ?? '—'}
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      {p.actif ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0ca30c]/10 px-2 py-0.5 text-xs font-medium text-[#0ca30c]">
                          Actif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e1e0d9] px-2 py-0.5 text-xs font-medium text-[#898781]">
                          Inactif
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => void onToggleActif(p)}
                        disabled={busyId === p.id}
                        className="text-xs font-medium text-[#2a78d6] hover:underline disabled:opacity-50"
                      >
                        {p.actif ? 'Désactiver' : 'Réactiver'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <h2 className="mb-3 font-semibold text-[#0b0b0b]">Fiche de stock</h2>
        <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
            Produit
          </label>
          <select
            className={inputClass}
            value={selectedProduitId}
            onChange={(e) => setSelectedProduitId(e.target.value)}
          >
            <option value="">Sélectionner un produit…</option>
            {produits.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom} (stock: {p.stockActuel})
              </option>
            ))}
          </select>

          {selectedProduit && (
            <>
              <form
                onSubmit={onSubmitMouvement}
                className="mt-4 flex flex-col gap-3 rounded-md border border-[#e1e0d9] p-4 sm:flex-row sm:items-end"
              >
                <div className="sm:w-36">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
                    Type
                  </label>
                  <select
                    className={inputClass}
                    value={movType}
                    onChange={(e) => setMovType(e.target.value as 'entree' | 'sortie')}
                  >
                    <option value="entree">Entrée</option>
                    <option value="sortie">Sortie</option>
                  </select>
                </div>
                <div className="sm:w-28">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
                    Quantité
                  </label>
                  <input
                    type="number"
                    min={1}
                    className={inputClass}
                    value={movQuantite}
                    onChange={(e) => setMovQuantite(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
                    Motif *
                  </label>
                  <input
                    className={inputClass}
                    placeholder="Ex: Réception livraison PPM"
                    value={movMotif}
                    onChange={(e) => setMovMotif(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={movSubmitting}
                  className="whitespace-nowrap rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
                >
                  {movSubmitting ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </form>
              {movError && (
                <p role="alert" className="mt-2 text-sm text-[#d03b3b]">
                  {movError}
                </p>
              )}

              <div className="mt-4 overflow-hidden overflow-x-auto rounded-xl border border-[#e1e0d9]">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#e1e0d9] text-xs uppercase tracking-wide text-[#898781]">
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 font-medium">Type</th>
                      <th className="px-4 py-2 font-medium">Qté</th>
                      <th className="px-4 py-2 font-medium">Stock avant → après</th>
                      <th className="px-4 py-2 font-medium">Motif</th>
                      <th className="px-4 py-2 font-medium">Auteur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mouvementsLoading && mouvements.length === 0 && (
                      <tr>
                        <td className="px-4 py-3" colSpan={6}>
                          <Skeleton className="h-4 w-full" />
                        </td>
                      </tr>
                    )}
                    {!mouvementsLoading && mouvements.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-sm text-[#898781]">
                          Aucun mouvement enregistré.
                        </td>
                      </tr>
                    )}
                    {mouvements.map((m) => (
                      <tr key={m.id} className="border-b border-[#e1e0d9] last:border-0">
                        <td className="px-4 py-2 text-[#52514e] [font-variant-numeric:tabular-nums]">
                          {formatDateTime(m.createdAt)}
                        </td>
                        <td className="px-4 py-2 text-[#0b0b0b]">{MOUVEMENT_LABELS[m.type]}</td>
                        <td
                          className={`px-4 py-2 [font-variant-numeric:tabular-nums] ${
                            INCREASING_TYPES.has(m.type) ? 'text-[#0ca30c]' : 'text-[#d03b3b]'
                          }`}
                        >
                          {INCREASING_TYPES.has(m.type) ? '+' : '-'}
                          {m.quantite}
                        </td>
                        <td className="px-4 py-2 text-[#52514e] [font-variant-numeric:tabular-nums]">
                          {m.stockAvant} → {m.stockApres}
                        </td>
                        <td className="px-4 py-2 text-[#52514e]">{m.motif ?? '—'}</td>
                        <td className="px-4 py-2 text-[#52514e]">{m.auteurName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {mouvementsError && (
                <p role="alert" className="mt-2 text-sm text-[#d03b3b]">
                  {mouvementsError}
                </p>
              )}
              {mouvementsCursor && (
                <button
                  type="button"
                  onClick={() => void loadMouvements(selectedProduitId, mouvementsCursor)}
                  disabled={mouvementsLoading}
                  className="mt-3 text-sm font-medium text-[#2a78d6] hover:underline disabled:opacity-50"
                >
                  {mouvementsLoading ? 'Chargement…' : 'Charger plus'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

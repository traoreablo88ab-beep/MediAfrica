// /settings — account-level controls.
//
// Two flows live here today:
//   1. Set / change password
//      - If the account was created via OAuth (hasPassword=false), the
//        "Set password" form calls POST /api/auth/set-password — no current
//        password required, because there isn't one.
//      - Otherwise the "Change password" form calls PUT /api/auth/change-password
//        with currentPassword + newPassword.
//   2. Link a provider (Google)
//      - When Google is not already linked, the button kicks the user to
//        GET /api/auth/oauth/google/start?next=/settings, which goes through
//        the normal OAuth dance and lands back on /settings linked.
//      - When already linked, we just show a "linked" pill — no unlink action
//        yet (would need a /api/auth/oauth/google/unlink endpoint with a
//        guard refusing to leave the user without any sign-in method).
//   3. Rename the clinic (ADMIN/SUPERADMIN only)
//      - Visibility is decided client-side by probing GET /api/admin/me
//        (200 = admin, 403 = not) — the actual PATCH is re-gated server-side
//        by requireAdmin, so a client that lies about admin-ness can't
//        actually rename anything.
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { useAuth, useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useApi, invalidateCache } from '@/lib/useApi';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';

interface ClinicSettingsResponse {
  name: string;
  heureOuverture: string | null;
  heureFermeture: string | null;
  joursFermeture: string[];
}

// Same 7 values the server validates joursFermeture against
// (lib/server/guichet/alertes.ts::WEEKDAY_NAMES_FR) — kept as a plain literal
// here since that module is server-only and can't be imported client-side.
const JOURS = [
  { value: 'lundi', label: 'Lundi' },
  { value: 'mardi', label: 'Mardi' },
  { value: 'mercredi', label: 'Mercredi' },
  { value: 'jeudi', label: 'Jeudi' },
  { value: 'vendredi', label: 'Vendredi' },
  { value: 'samedi', label: 'Samedi' },
  { value: 'dimanche', label: 'Dimanche' },
] as const;

export default function SettingsPage() {
  const user = useUser();
  const { refresh } = useAuth();
  const { toast } = useToast();

  // Clinic name + horaires section — only rendered once we know the user is
  // an admin. Both forms PATCH the same resource, so they share one fetch.
  const clinicSettingsQuery = useApi<ClinicSettingsResponse>('/api/settings/clinic');
  const clinicName = clinicSettingsQuery.data?.name ?? 'MediAfrica';
  const [isAdmin, setIsAdmin] = useState(false);
  const [clinicNameInput, setClinicNameInput] = useState('');
  const [clinicNameSynced, setClinicNameSynced] = useState(false);
  const [clinicSubmitting, setClinicSubmitting] = useState(false);
  const [clinicError, setClinicError] = useState<string | null>(null);

  const [heureOuverture, setHeureOuverture] = useState('');
  const [heureFermeture, setHeureFermeture] = useState('');
  const [joursFermeture, setJoursFermeture] = useState<string[]>([]);
  const [horairesSynced, setHorairesSynced] = useState(false);
  const [horairesSubmitting, setHorairesSubmitting] = useState(false);
  const [horairesError, setHorairesError] = useState<string | null>(null);

  useEffect(() => {
    api('/api/admin/me')
      .then(() => setIsAdmin(true))
      .catch(() => setIsAdmin(false));
  }, []);

  // Seed the input from the fetched name exactly once (avoid clobbering
  // what the admin is typing on every background refresh).
  useEffect(() => {
    if (!clinicNameSynced && clinicName) {
      setClinicNameInput(clinicName);
      setClinicNameSynced(true);
    }
  }, [clinicName, clinicNameSynced]);

  async function onSubmitClinicName(e: FormEvent) {
    e.preventDefault();
    setClinicError(null);
    const trimmed = clinicNameInput.trim();
    if (trimmed.length === 0) {
      setClinicError('Saisis un nom.');
      return;
    }
    setClinicSubmitting(true);
    try {
      await api('/api/settings/clinic', { method: 'PATCH', body: { name: trimmed } });
      invalidateCache('/api/settings/clinic');
      await clinicSettingsQuery.refresh();
      toast('Nom du centre mis à jour.', 'success');
    } catch (err) {
      setClinicError(friendlyError(err, 'Erreur réseau. Réessaie.'));
    } finally {
      setClinicSubmitting(false);
    }
  }

  // Seed the horaires form from the fetched settings exactly once — same
  // pattern as the clinic-name sync above.
  useEffect(() => {
    if (!horairesSynced && clinicSettingsQuery.data) {
      setHeureOuverture(clinicSettingsQuery.data.heureOuverture ?? '');
      setHeureFermeture(clinicSettingsQuery.data.heureFermeture ?? '');
      setJoursFermeture(clinicSettingsQuery.data.joursFermeture);
      setHorairesSynced(true);
    }
  }, [clinicSettingsQuery.data, horairesSynced]);

  function toggleJourFermeture(jour: string) {
    setJoursFermeture((prev) =>
      prev.includes(jour) ? prev.filter((j) => j !== jour) : [...prev, jour],
    );
  }

  async function onSubmitHoraires(e: FormEvent) {
    e.preventDefault();
    setHorairesError(null);
    if ((heureOuverture === '') !== (heureFermeture === '')) {
      setHorairesError(
        "Renseigne l'heure d'ouverture et de fermeture ensemble, ou laisse les deux vides.",
      );
      return;
    }
    setHorairesSubmitting(true);
    try {
      await api('/api/settings/clinic', {
        method: 'PATCH',
        body: {
          name: clinicSettingsQuery.data?.name ?? clinicName,
          heureOuverture: heureOuverture || null,
          heureFermeture: heureFermeture || null,
          joursFermeture,
        },
      });
      invalidateCache('/api/settings/clinic');
      await clinicSettingsQuery.refresh();
      toast('Horaires mis à jour.', 'success');
    } catch (err) {
      setHorairesError(friendlyError(err, 'Erreur réseau. Réessaie.'));
    } finally {
      setHorairesSubmitting(false);
    }
  }

  // Password form state — fields used by either branch.
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Display name — shown as "Soignant" on the consultation register and
  // dashboard. Only OAuth sign-in populates it automatically; email/password
  // accounts start with name=null until set here.
  const [name, setName] = useState(user?.name ?? '');
  const [nameSubmitting, setNameSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (user) setName(user.name ?? '');
  }, [user]);

  // 2FA (TOTP) section — ADMIN/SUPERADMIN only (same isAdmin probe as the
  // clinic-name section above). `totpStep` walks: idle → setup (QR shown) →
  // backup-codes (shown once, right after confirm) → back to idle.
  const [totpStep, setTotpStep] = useState<'idle' | 'setup' | 'backup-codes'>('idle');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpQrCodeDataUrl, setTotpQrCodeDataUrl] = useState('');
  const [totpConfirmCode, setTotpConfirmCode] = useState('');
  const [totpBackupCodes, setTotpBackupCodes] = useState<string[]>([]);
  const [totpSubmitting, setTotpSubmitting] = useState(false);
  const [totpError, setTotpError] = useState<string | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableSubmitting, setDisableSubmitting] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  async function onStartTotpSetup() {
    setTotpError(null);
    setTotpSubmitting(true);
    try {
      const res = await api<{ secret: string; qrCodeDataUrl: string }>('/api/auth/2fa/setup', {
        method: 'POST',
      });
      setTotpSecret(res.secret);
      setTotpQrCodeDataUrl(res.qrCodeDataUrl);
      setTotpConfirmCode('');
      setTotpStep('setup');
    } catch (err) {
      setTotpError(friendlyError(err, 'Erreur réseau. Réessaie.'));
    } finally {
      setTotpSubmitting(false);
    }
  }

  async function onConfirmTotp(e: FormEvent) {
    e.preventDefault();
    setTotpError(null);
    setTotpSubmitting(true);
    try {
      const res = await api<{ backupCodes: string[] }>('/api/auth/2fa/confirm', {
        method: 'POST',
        body: { code: totpConfirmCode },
      });
      setTotpBackupCodes(res.backupCodes);
      setTotpStep('backup-codes');
      await refresh();
    } catch (err) {
      setTotpError(friendlyError(err, 'Erreur réseau. Réessaie.'));
    } finally {
      setTotpSubmitting(false);
    }
  }

  function onAcknowledgeBackupCodes() {
    setTotpStep('idle');
    setTotpSecret('');
    setTotpQrCodeDataUrl('');
    setTotpBackupCodes([]);
  }

  async function onSubmitDisableTotp(e: FormEvent) {
    e.preventDefault();
    setDisableError(null);
    setDisableSubmitting(true);
    try {
      await api('/api/auth/2fa/disable', { method: 'POST', body: { password: disablePassword } });
      setDisabling(false);
      setDisablePassword('');
      toast('Authentification à deux facteurs désactivée.', 'success');
      await refresh();
    } catch (err) {
      setDisableError(friendlyError(err, 'Erreur réseau. Réessaie.'));
    } finally {
      setDisableSubmitting(false);
    }
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
        <AppHeader />
        <div className="mx-auto flex max-w-md flex-col gap-8 px-4 py-12">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="mt-1 h-4 w-56" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-lg border border-gray-200 p-5">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-2 h-9 w-full rounded-md" />
            </div>
          ))}
        </div>
      </main>
    );
  }

  const hasPassword = user.hasPassword;
  const googleLinked = user.linkedProviders.includes('google');

  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length === 0) {
      setError('Saisis un nouveau mot de passe.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }

    setSubmitting(true);
    try {
      if (hasPassword) {
        await api('/api/auth/change-password', {
          method: 'PUT',
          body: { currentPassword, newPassword },
        });
        toast('Mot de passe mis à jour.', 'success');
      } else {
        await api('/api/auth/set-password', {
          method: 'POST',
          body: { newPassword },
        });
        toast('Mot de passe défini. Tu peux maintenant te connecter par email.', 'success');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, string> = {
          INVALID_CREDENTIALS: 'Mot de passe actuel incorrect.',
          PASSWORD_BANNED: 'Ce mot de passe est trop courant.',
          PASSWORD_TOO_SHORT: err.message || 'Mot de passe trop court.',
          PASSWORD_PWNED: 'Ce mot de passe a fuité — choisis-en un autre.',
          PASSWORD_ALREADY_SET:
            'Un mot de passe est déjà défini. Utilise « changer le mot de passe ».',
          VALIDATION_FAILED: 'Champs invalides.',
        };
        setError(map[err.code] ?? friendlyError(err));
      } else {
        setError(friendlyError(err, 'Erreur réseau. Réessaie.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitName(e: FormEvent) {
    e.preventDefault();
    setNameError(null);
    if (name.trim().length === 0) {
      setNameError('Saisis un nom.');
      return;
    }
    setNameSubmitting(true);
    try {
      await api('/api/auth/me', { method: 'PATCH', body: { name: name.trim() } });
      toast('Nom mis à jour.', 'success');
      await refresh();
    } catch (err) {
      setNameError(friendlyError(err, 'Erreur réseau. Réessaie.'));
    } finally {
      setNameSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader />
      <div className="animate-fade-in-up mx-auto flex max-w-md flex-col gap-8 px-4 py-12">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Paramètres</h1>
          <p className="text-sm text-gray-600">Connecté en tant que {user.email}</p>
        </header>

        {/* ── Display name section ────────────────────────────────────── */}
        <section className="flex flex-col gap-3 rounded-lg border border-gray-200 p-5">
          <h2 className="text-lg font-semibold">Nom complet</h2>
          <p className="text-sm text-gray-600">
            Affiché comme soignant sur le registre de consultation et le tableau de bord.
          </p>
          <form onSubmit={onSubmitName} className="mt-2 flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Nom complet
              <input
                type="text"
                required
                placeholder="Ex: Amadou Diallo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
            {nameError && (
              <p role="alert" className="text-sm text-red-600">
                {nameError}
              </p>
            )}
            <button
              type="submit"
              disabled={nameSubmitting}
              className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {nameSubmitting ? 'Enregistrement…' : 'Enregistrer le nom'}
            </button>
          </form>
        </section>

        {/* ── Password section ─────────────────────────────────────────── */}
        <section className="flex flex-col gap-3 rounded-lg border border-gray-200 p-5">
          <h2 className="text-lg font-semibold">
            {hasPassword ? 'Changer le mot de passe' : 'Définir un mot de passe'}
          </h2>
          <p className="text-sm text-gray-600">
            {hasPassword
              ? 'Tu peux modifier ton mot de passe ici. Les autres sessions seront déconnectées.'
              : 'Tu t’es connecté via Google. Définis un mot de passe pour pouvoir aussi te connecter par email.'}
          </p>
          <form onSubmit={onSubmitPassword} className="mt-2 flex flex-col gap-4">
            {hasPassword && (
              <label className="flex flex-col gap-1 text-sm">
                Mot de passe actuel
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2"
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm">
              Nouveau mot de passe
              <input
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Confirmer le nouveau mot de passe
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {submitting
                ? 'Enregistrement…'
                : hasPassword
                  ? 'Changer le mot de passe'
                  : 'Définir le mot de passe'}
            </button>
          </form>
        </section>

        {/* ── Clinic name section (admin-only) ────────────────────────── */}
        {isAdmin && (
          <section className="flex flex-col gap-3 rounded-lg border border-gray-200 p-5">
            <h2 className="text-lg font-semibold">Nom du centre</h2>
            <p className="text-sm text-gray-600">
              Affiché sur les pages de connexion, d’inscription et dans l’application.
            </p>
            <form onSubmit={onSubmitClinicName} className="mt-2 flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm">
                Nom du centre
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={clinicNameInput}
                  onChange={(e) => setClinicNameInput(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2"
                />
              </label>
              {clinicError && (
                <p role="alert" className="text-sm text-red-600">
                  {clinicError}
                </p>
              )}
              <button
                type="submit"
                disabled={clinicSubmitting}
                className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {clinicSubmitting ? 'Enregistrement…' : 'Enregistrer le nom'}
              </button>
            </form>
          </section>
        )}

        {/* ── Horaires d'ouverture section (admin-only) ───────────────── */}
        {isAdmin && (
          <section className="flex flex-col gap-3 rounded-lg border border-gray-200 p-5">
            <h2 className="text-lg font-semibold">Horaires d’ouverture</h2>
            <p className="text-sm text-gray-600">
              Sert de référence aux alertes Guichet « activité hors horaires » et « inactivité
              anormale ». Laisse les heures vides pour désactiver ces deux alertes.
            </p>
            <form onSubmit={onSubmitHoraires} className="mt-2 flex flex-col gap-4">
              <div className="flex gap-4">
                <label className="flex flex-1 flex-col gap-1 text-sm">
                  Ouverture
                  <input
                    type="time"
                    value={heureOuverture}
                    onChange={(e) => setHeureOuverture(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-sm">
                  Fermeture
                  <input
                    type="time"
                    value={heureFermeture}
                    onChange={(e) => setHeureFermeture(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2"
                  />
                </label>
              </div>
              <fieldset className="flex flex-col gap-2 text-sm">
                <legend className="mb-1">Jours de fermeture hebdomadaire</legend>
                <div className="flex flex-wrap gap-3">
                  {JOURS.map((jour) => (
                    <label key={jour.value} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={joursFermeture.includes(jour.value)}
                        onChange={() => toggleJourFermeture(jour.value)}
                      />
                      {jour.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {horairesError && (
                <p role="alert" className="text-sm text-red-600">
                  {horairesError}
                </p>
              )}
              <button
                type="submit"
                disabled={horairesSubmitting || !clinicSettingsQuery.data}
                className="self-start rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {horairesSubmitting ? 'Enregistrement…' : 'Enregistrer les horaires'}
              </button>
            </form>
          </section>
        )}

        {/* ── 2FA (TOTP) section (admin-only) ─────────────────────────── */}
        {isAdmin && (
          <section className="flex flex-col gap-3 rounded-lg border border-gray-200 p-5">
            <h2 className="text-lg font-semibold">Authentification à deux facteurs</h2>

            {totpStep === 'backup-codes' ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-red-600">
                  Enregistrez ces codes maintenant — ils ne seront plus jamais affichés. Chacun ne
                  peut être utilisé qu’une seule fois, à la place du code de votre application, si
                  vous perdez l’accès à celle-ci.
                </p>
                <div className="grid grid-cols-2 gap-2 rounded-md bg-gray-50 p-4 font-mono text-sm">
                  {totpBackupCodes.map((code) => (
                    <span key={code}>{code}</span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={onAcknowledgeBackupCodes}
                  className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
                >
                  J’ai sauvegardé mes codes
                </button>
              </div>
            ) : totpStep === 'setup' ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-gray-600">
                  Scannez ce QR code avec votre application d’authentification (Google
                  Authenticator, Authy, etc.), puis entrez le code à 6 chiffres généré.
                </p>
                <img
                  src={totpQrCodeDataUrl}
                  alt="QR code d’activation 2FA"
                  className="h-40 w-40 self-center"
                />
                <p className="break-all rounded-md bg-gray-50 px-3 py-2 text-center font-mono text-xs text-gray-600">
                  {totpSecret}
                </p>
                <form onSubmit={onConfirmTotp} className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1 text-sm">
                    Code de vérification
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      maxLength={6}
                      autoComplete="one-time-code"
                      value={totpConfirmCode}
                      onChange={(e) => setTotpConfirmCode(e.target.value)}
                      className="rounded-md border border-gray-300 px-3 py-2 text-center font-mono tracking-widest"
                    />
                  </label>
                  {totpError && (
                    <p role="alert" className="text-sm text-red-600">
                      {totpError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={totpSubmitting}
                      className="flex-1 rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      {totpSubmitting ? 'Vérification…' : 'Confirmer'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTotpStep('idle');
                        setTotpError(null);
                      }}
                      className="rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              </div>
            ) : user.totpEnabled ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-600">
                    Activée — un code est demandé à chaque connexion.
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    Activée
                  </span>
                </div>
                {disabling ? (
                  <form onSubmit={onSubmitDisableTotp} className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1 text-sm">
                      Mot de passe
                      <input
                        type="password"
                        required
                        autoComplete="current-password"
                        value={disablePassword}
                        onChange={(e) => setDisablePassword(e.target.value)}
                        className="rounded-md border border-gray-300 px-3 py-2"
                      />
                    </label>
                    {disableError && (
                      <p role="alert" className="text-sm text-red-600">
                        {disableError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={disableSubmitting}
                        className="flex-1 rounded-md border border-red-300 px-5 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {disableSubmitting ? 'Désactivation…' : 'Confirmer la désactivation'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDisabling(false);
                          setDisablePassword('');
                          setDisableError(null);
                        }}
                        className="rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium hover:bg-gray-50"
                      >
                        Annuler
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDisabling(true)}
                    className="self-start rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
                  >
                    Désactiver
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-gray-600">
                  Ajoute une étape de vérification à la connexion, en plus du mot de passe.
                  Recommandé pour les comptes administrateur.
                </p>
                {totpError && (
                  <p role="alert" className="text-sm text-red-600">
                    {totpError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={onStartTotpSetup}
                  disabled={totpSubmitting}
                  className="self-start rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {totpSubmitting ? 'Préparation…' : 'Activer'}
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── Linked providers section ────────────────────────────────── */}
        <section className="flex flex-col gap-3 rounded-lg border border-gray-200 p-5">
          <h2 className="text-lg font-semibold">Comptes liés</h2>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium">Google</span>
              <span className="text-xs text-gray-500">
                {googleLinked
                  ? 'Tu peux te connecter via Google.'
                  : 'Lie ton compte Google pour te connecter en un clic.'}
              </span>
            </div>
            {googleLinked ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                Lié
              </span>
            ) : (
              <a
                href="/api/auth/oauth/google/start?next=/settings"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Lier Google
              </a>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

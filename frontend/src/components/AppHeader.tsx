// Shared staff-app nav — used by /dashboard, /consultations, /registres
// (index + consultation/maternité sub-registers), /patients, /settings,
// /personnel, /facturation so the nav stays identical everywhere instead of
// drifting page to page.
//
// On `md` and up, the tab list lives in a fixed left sidebar (`<aside>`) and
// pages reserve space for it via `md:pl-64` on their root `<main>`. Below
// `md`, the sidebar is hidden entirely and the same links collapse behind a
// hamburger button in the top bar that opens a full-width dropdown panel —
// without it, staff on a phone would have no way to reach
// Patients/Consultations/Registres at all (only /settings via the avatar).
'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { Logo } from '@/components/Logo';
import { Wordmark } from '@/components/Wordmark';

interface SubscriptionInfo {
  subscription: { status: string; currentPeriodEnd: string };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysRemaining(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS);
}

export type AppNavTab = 'dashboard' | 'patients' | 'consultations' | 'registres' | 'commentaires';

const TABS: Array<{ key: AppNavTab; label: string; href: string }> = [
  { key: 'dashboard', label: 'Tableau de bord', href: '/dashboard' },
  { key: 'patients', label: 'Patients', href: '/patients' },
  { key: 'consultations', label: 'Consultations', href: '/consultations' },
  { key: 'registres', label: 'Registres', href: '/registres' },
  { key: 'commentaires', label: 'Commentaires', href: '/commentaires' },
];

type IconProps = { className?: string };

function DashboardIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect
        x="13.5"
        y="3.5"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <rect
        x="3.5"
        y="13.5"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <rect
        x="13.5"
        y="13.5"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function PatientsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 20c0-3.9 3.13-6.5 7-6.5s7 2.6 7 6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ConsultationsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.5 5.5h15a1 1 0 011 1V15a1 1 0 01-1 1H9.5L5 20v-4H4.5a1 1 0 01-1-1V6.5a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RegistresIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 6h16M4 12h16M4 18h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CommentairesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 4.5c4.7 0 8.5 3 8.5 6.7s-3.8 6.7-8.5 6.7c-.85 0-1.67-.1-2.44-.28L5 19.5l1.2-3.4C4.6 14.9 3.5 13.15 3.5 11.2c0-3.7 3.8-6.7 8.5-6.7z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8.6" cy="11.2" r="0.9" fill="currentColor" />
      <circle cx="12" cy="11.2" r="0.9" fill="currentColor" />
      <circle cx="15.4" cy="11.2" r="0.9" fill="currentColor" />
    </svg>
  );
}

function AdminIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3.5l6.5 2.6v5.4c0 4.6-3.1 7.6-6.5 8.6-3.4-1-6.5-4-6.5-8.6V6.1L12 3.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StaffIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 9.5a2.75 2.75 0 100-5.5M18.5 20c0-2.9-2-5-4.5-5.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LogoutIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M15 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 12h10m0 0-3.5-3.5M20 12l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CsrefAdminIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="8" cy="15.5" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M11 12.5L18.5 5M18.5 5l2 2M16 7.5l1.8 1.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BillingIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="13"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6.5 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const TAB_ICONS: Record<AppNavTab, ComponentType<IconProps>> = {
  dashboard: DashboardIcon,
  patients: PatientsIcon,
  consultations: ConsultationsIcon,
  registres: RegistresIcon,
  commentaires: CommentairesIcon,
};

function initials(label: string): string {
  const parts = label.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

function StatusPill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e1e0d9] bg-[#2a78d6]/5 px-2.5 py-0.5 text-xs font-medium text-[#52514e]">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0ca30c] opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#0ca30c]" />
      </span>
      CSRéf
    </span>
  );
}

function SubscriptionBadge({ info }: { info: SubscriptionInfo | null }) {
  if (!info) return null;
  const { status, currentPeriodEnd } = info.subscription;

  if (status === 'PAST_DUE' || status === 'CANCELED') {
    return (
      <Link
        href="/facturation"
        className="inline-flex items-center gap-1.5 rounded-full border border-[#d03b3b]/30 bg-[#d03b3b]/10 px-2.5 py-0.5 text-xs font-medium text-[#d03b3b] hover:bg-[#d03b3b]/20"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[#d03b3b]" />
        Premium
      </Link>
    );
  }

  if (status === 'TRIALING') {
    const daysLeft = Math.max(daysRemaining(currentPeriodEnd), 0);
    const urgent = daysLeft <= 7;
    return (
      <Link
        href="/facturation"
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
          urgent
            ? 'border-[#d08a1c]/30 bg-[#d08a1c]/10 text-[#d08a1c] hover:bg-[#d08a1c]/20'
            : 'border-[#e1e0d9] bg-[#f9f9f7] text-[#52514e] hover:bg-[#f0efe9]'
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${urgent ? 'bg-[#d08a1c]' : 'bg-[#2a78d6]'}`} />
        Essai — {daysLeft}j
      </Link>
    );
  }

  // ACTIVE
  return (
    <Link
      href="/facturation"
      className="inline-flex items-center gap-1.5 rounded-full border border-[#e1e0d9] bg-[#0ca30c]/5 px-2.5 py-0.5 text-xs font-medium text-[#0ca30c] hover:bg-[#0ca30c]/10"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[#0ca30c]" />
      Actif
    </Link>
  );
}

function NavLink({
  href,
  active,
  onClick,
  icon: Icon,
  children,
}: {
  href: string;
  active: boolean;
  onClick?: () => void;
  icon: ComponentType<IconProps>;
  children: React.ReactNode;
}) {
  return active ? (
    <span className="animate-scale-in flex items-center gap-2.5 rounded-md bg-[#2a78d6]/10 px-3 py-2 text-sm font-medium text-[#2a78d6]">
      <Icon className="h-4 w-4" />
      {children}
    </span>
  ) : (
    <Link
      href={href}
      {...(onClick ? { onClick } : {})}
      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-[#52514e] transition-transform hover:translate-x-0.5 hover:bg-[#f9f9f7] hover:text-[#2a78d6]"
    >
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  );
}

export function AppHeader({ active }: { active?: AppNavTab }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const displayName = user?.name ?? user?.email ?? '';
  const [mobileOpen, setMobileOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);

  async function onLogout() {
    setMobileOpen(false);
    await logout();
    router.push('/login');
  }

  // Any org member (not just OWNER/ADMIN) can see their clinic's
  // subscription status — it affects everyone once access is locked out.
  // Platform-only staff (orgRole: null) never see this.
  useEffect(() => {
    if (!user || user.orgRole === null) {
      setSubscriptionInfo(null);
      return;
    }
    let cancelled = false;
    api<SubscriptionInfo>('/api/billing/subscription')
      .then((info) => {
        if (!cancelled) setSubscriptionInfo(info);
      })
      .catch(() => {
        if (!cancelled) setSubscriptionInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Google OAuth signup creates a User but no Organization (unlike
  // email/password signup, which creates both in one tx — see
  // /api/auth/signup). Every page that renders this header is org-scoped,
  // so catch that gap here once instead of per-page: a non-platform-staff
  // user with no clinic yet gets sent to set one up before touching
  // anything org-scoped. Platform ADMIN/SUPERADMIN accounts legitimately
  // have orgRole: null and are excluded.
  useEffect(() => {
    if (user && user.role === 'USER' && user.orgRole === null) {
      router.replace('/onboarding-centre');
    }
  }, [user, router]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setMobileOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen]);

  const canManageOrg = user && (user.orgRole === 'OWNER' || user.orgRole === 'ADMIN');
  const isPlatformStaff = user && user.role !== 'USER';

  return (
    <>
      {/* Desktop sidebar — hidden below md, pages offset their content with md:pl-64. */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-[#e1e0d9] bg-white md:flex">
        <div className="flex items-center gap-3 border-b border-[#e1e0d9] px-5 py-4">
          <Logo />
          <Wordmark className="text-[#0b0b0b]" />
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          <StatusPill />
          <SubscriptionBadge info={subscriptionInfo} />
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
          {TABS.map((tab) => (
            <NavLink
              key={tab.key}
              href={tab.href}
              active={tab.key === active}
              icon={TAB_ICONS[tab.key]}
            >
              {tab.label}
            </NavLink>
          ))}
          {canManageOrg && (
            <>
              <NavLink href="/personnel" active={false} icon={StaffIcon}>
                Personnel
              </NavLink>
              <NavLink href="/admin-csref" active={false} icon={CsrefAdminIcon}>
                Admin CSRéf
              </NavLink>
              <NavLink href="/facturation" active={false} icon={BillingIcon}>
                Facturation
              </NavLink>
            </>
          )}
          {isPlatformStaff && (
            <NavLink href="/admin/users" active={false} icon={AdminIcon}>
              Admin App
            </NavLink>
          )}
        </nav>
      </aside>

      <header ref={panelRef} className="sticky top-0 z-10 border-b border-[#e1e0d9] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-3">
          <div className="flex items-center gap-3 md:hidden">
            <button
              type="button"
              aria-label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-md text-[#52514e] hover:bg-[#f9f9f7]"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                {mobileOpen ? (
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d="M4 7h16M4 12h16M4 17h16"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </button>
            <Logo />
            <Wordmark className="text-[#0b0b0b]" />
            <span className="hidden items-center gap-2 sm:inline-flex">
              <StatusPill />
              <SubscriptionBadge info={subscriptionInfo} />
            </span>
          </div>

          <div className="flex items-center gap-1 md:ml-auto">
            <Link
              href="/settings"
              title="Paramètres du compte"
              className="flex items-center gap-3 rounded-md px-2 py-1 hover:bg-[#f9f9f7]"
            >
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-[#0b0b0b]">
                  {user?.name ?? 'Nom non renseigné'}
                </p>
                <p className="text-xs text-[#898781]">{user?.email ?? '—'}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e1e0d9] text-sm font-semibold text-[#52514e] transition-transform duration-200 hover:scale-105">
                {displayName ? initials(displayName) : '?'}
              </div>
            </Link>
            <button
              type="button"
              onClick={onLogout}
              title="Se déconnecter"
              aria-label="Se déconnecter"
              className="flex h-9 w-9 items-center justify-center rounded-md text-[#52514e] hover:bg-[#f9f9f7] hover:text-[#d03b3b]"
            >
              <LogoutIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="flex flex-col gap-1 border-t border-[#e1e0d9] px-4 py-3 md:hidden">
            <div className="mb-2 flex items-center gap-2 px-1 sm:hidden">
              <StatusPill />
              <SubscriptionBadge info={subscriptionInfo} />
            </div>
            {TABS.map((tab, i) => {
              const Icon = TAB_ICONS[tab.key];
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  onClick={() => setMobileOpen(false)}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className={
                    tab.key === active
                      ? 'animate-fade-in-up flex items-center gap-2 rounded-md bg-[#2a78d6]/10 px-3 py-2 text-sm font-medium text-[#2a78d6]'
                      : 'animate-fade-in-up flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[#52514e] hover:bg-[#f9f9f7] hover:text-[#2a78d6]'
                  }
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              );
            })}
            {canManageOrg && (
              <>
                <Link
                  href="/personnel"
                  onClick={() => setMobileOpen(false)}
                  style={{ animationDelay: `${TABS.length * 40}ms` }}
                  className="animate-fade-in-up flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[#52514e] hover:bg-[#f9f9f7] hover:text-[#2a78d6]"
                >
                  <StaffIcon className="h-4 w-4" />
                  Personnel
                </Link>
                <Link
                  href="/admin-csref"
                  onClick={() => setMobileOpen(false)}
                  style={{ animationDelay: `${(TABS.length + 1) * 40}ms` }}
                  className="animate-fade-in-up flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[#52514e] hover:bg-[#f9f9f7] hover:text-[#2a78d6]"
                >
                  <CsrefAdminIcon className="h-4 w-4" />
                  Admin CSRéf
                </Link>
                <Link
                  href="/facturation"
                  onClick={() => setMobileOpen(false)}
                  style={{ animationDelay: `${(TABS.length + 2) * 40}ms` }}
                  className="animate-fade-in-up flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[#52514e] hover:bg-[#f9f9f7] hover:text-[#2a78d6]"
                >
                  <BillingIcon className="h-4 w-4" />
                  Facturation
                </Link>
              </>
            )}
            {isPlatformStaff && (
              <Link
                href="/admin/users"
                onClick={() => setMobileOpen(false)}
                style={{ animationDelay: `${TABS.length * 40}ms` }}
                className="animate-fade-in-up flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[#52514e] hover:bg-[#f9f9f7] hover:text-[#2a78d6]"
              >
                <AdminIcon className="h-4 w-4" />
                Admin App
              </Link>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="animate-fade-in-up flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-[#52514e] hover:bg-[#f9f9f7] hover:text-[#d03b3b]"
            >
              <LogoutIcon className="h-4 w-4" />
              Se déconnecter
            </button>
          </nav>
        )}
      </header>
    </>
  );
}

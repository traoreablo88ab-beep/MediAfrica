// Every /admin/* route is gated behind GET /api/admin/me — 200 means the
// signed-in user is ADMIN or SUPERADMIN, 401/403 means they're not. Non-admins
// are bounced to /dashboard rather than /login (they may well be logged in,
// just not staff with back-office access).
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Logo } from '@/components/Logo';
import { Wordmark } from '@/components/Wordmark';

interface AdminMe {
  admin: { id: string; email: string; role: 'ADMIN' | 'SUPERADMIN' };
}

const NAV = [
  { href: '/admin', label: "Vue d'ensemble" },
  { href: '/admin/organizations', label: 'Centres' },
  { href: '/admin/plans', label: 'Abonnements' },
  { href: '/admin/subscriptions', label: 'Souscriptions' },
  { href: '/admin/transactions', label: 'Transactions' },
  { href: '/admin/signalements', label: 'Signalements' },
  { href: '/admin/users', label: 'Personnel' },
  { href: '/admin/audit-log', label: "Journal d'audit" },
  { href: '/admin/configuration', label: 'Configuration' },
];

// '/admin' is both a nav item and a prefix of every other admin route, so it
// needs an exact match — otherwise it (and the real section) would both
// light up as active on every /admin/* subpage.
function isNavActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(href + '/');
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<AdminMe['admin'] | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<AdminMe>('/api/admin/me');
        if (!cancelled) setAdmin(res.admin);
      } catch {
        // Any failure (401/403/network) fails safe: no back-office access.
        if (!cancelled) router.replace('/dashboard');
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!checked || !admin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f9f9f7]">
        <p className="text-sm text-[#52514e]">Vérification des droits d’accès…</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9f9f7]">
      <header className="sticky top-0 z-10 border-b border-[#e1e0d9] bg-white/95 shadow-[0_1px_2px_rgba(11,11,11,0.04)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-3">
          <div className="flex items-center gap-3">
            <Logo />
            <Wordmark className="text-[#0b0b0b]" />
            <span className="rounded-full border border-[#2a78d6]/20 bg-[#2a78d6]/5 px-2.5 py-0.5 text-xs font-medium text-[#2a78d6]">
              Admin App
            </span>
          </div>
          <nav className="hidden items-center gap-0.5 md:flex">
            {NAV.map((item) => {
              const isActive = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
                    isActive
                      ? 'text-[#2a78d6]'
                      : 'text-[#52514e] hover:bg-[#f9f9f7] hover:text-[#0b0b0b]'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute inset-x-2 -bottom-[13px] h-0.5 rounded-full bg-[#2a78d6]" />
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-medium text-[#0b0b0b]">{admin.email}</p>
              <p className="text-[11px] text-[#898781]">{admin.role}</p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2a78d6]/10 text-xs font-semibold text-[#2a78d6]">
              {admin.email.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-[#e1e0d9] px-6 py-2 md:hidden">
          {NAV.map((item) => {
            const isActive = isNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
                  isActive ? 'bg-[#2a78d6]/10 text-[#2a78d6]' : 'text-[#52514e] hover:bg-[#f9f9f7]'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}

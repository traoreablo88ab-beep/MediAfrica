'use client';

import { useApi } from './useApi';

// Fallback shown before the fetch resolves, and permanently on anonymous
// pages (forgot/reset-password) now that GET /api/settings/clinic is
// auth-required in the multi-tenant model — there's no single "the" clinic
// to name pre-login, so those pages show generic platform branding instead.
const DEFAULT_CLINIC_NAME = 'MediAfrica';

export function useClinicName(): string {
  const { data } = useApi<{ name: string }>('/api/settings/clinic');
  return data?.name ?? DEFAULT_CLINIC_NAME;
}

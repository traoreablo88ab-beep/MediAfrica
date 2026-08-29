// GET /api/rapports/activite?year=2026 — monthly activity counts for the
// whole year, across every patient-activity register (Consultation,
// Hospitalisation, Maternite × CPN/Accouchement/CPoN, Nutrition ×
// URENI/URENAS/URENAM, PlanificationFamiliale, Vaccination). Powers the
// /rapports dashboard: one fetch per year returns 12 monthly counts per
// category — the page itself derives quarterly/semester/annual averages
// client-side rather than the server computing every period combination.
//
// One findMany per category (selecting only the date column) instead of 12
// separate count() calls per category: fewer round-trips against the Neon
// pooled connection, and the per-month bucketing is a trivial in-memory
// reduce. A year of activity for a single clinic is a few thousand rows at
// most, so this stays cheap.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const YearParam = z.coerce.number().int().min(2000).max(2100);

function monthlyBuckets(dates: Date[]): number[] {
  const buckets = new Array(12).fill(0) as number[];
  for (const d of dates) {
    buckets[d.getMonth()] = (buckets[d.getMonth()] ?? 0) + 1;
  }
  return buckets;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    const subFail = await requireActiveSubscription(auth.orgMember.organizationId);
    if (subFail) {
      subFail.headers.set('x-request-id', ctx.requestId);
      return subFail;
    }

    const yearParsed = YearParam.safeParse(
      req.nextUrl.searchParams.get('year') ?? new Date().getFullYear(),
    );
    if (!yearParsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid year query param' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const year = yearParsed.data;
    const organizationId = auth.orgMember.organizationId;
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);

    const [
      consultations,
      hospitalisations,
      cpn,
      accouchements,
      cpon,
      ureni,
      urenas,
      urenam,
      pf,
      vaccinations,
    ] = await Promise.all([
      prisma.consultation.findMany({
        where: { patient: { organizationId }, date: { gte: yearStart, lt: yearEnd } },
        select: { date: true },
      }),
      prisma.hospitalisation.findMany({
        where: { patient: { organizationId }, dateHeureEntree: { gte: yearStart, lt: yearEnd } },
        select: { dateHeureEntree: true },
      }),
      prisma.maternite.findMany({
        where: { patient: { organizationId }, type: 'CPN', date: { gte: yearStart, lt: yearEnd } },
        select: { date: true },
      }),
      prisma.maternite.findMany({
        where: {
          patient: { organizationId },
          type: 'ACCOUCHEMENT',
          date: { gte: yearStart, lt: yearEnd },
        },
        select: { date: true },
      }),
      prisma.maternite.findMany({
        where: { patient: { organizationId }, type: 'CPON', date: { gte: yearStart, lt: yearEnd } },
        select: { date: true },
      }),
      prisma.nutrition.findMany({
        where: {
          patient: { organizationId },
          type: 'URENI',
          date: { gte: yearStart, lt: yearEnd },
        },
        select: { date: true },
      }),
      prisma.nutrition.findMany({
        where: {
          patient: { organizationId },
          type: 'URENAS',
          date: { gte: yearStart, lt: yearEnd },
        },
        select: { date: true },
      }),
      prisma.nutrition.findMany({
        where: {
          patient: { organizationId },
          type: 'URENAM',
          date: { gte: yearStart, lt: yearEnd },
        },
        select: { date: true },
      }),
      prisma.planificationFamiliale.findMany({
        where: { patient: { organizationId }, date: { gte: yearStart, lt: yearEnd } },
        select: { date: true },
      }),
      prisma.vaccination.findMany({
        where: { patient: { organizationId }, date: { gte: yearStart, lt: yearEnd } },
        select: { date: true },
      }),
    ]);

    const categories = [
      {
        key: 'consultations',
        label: 'Consultations',
        monthly: monthlyBuckets(consultations.map((r) => r.date)),
      },
      {
        key: 'hospitalisations',
        label: 'Hospitalisations',
        monthly: monthlyBuckets(hospitalisations.map((r) => r.dateHeureEntree)),
      },
      { key: 'cpn', label: 'CPN', monthly: monthlyBuckets(cpn.map((r) => r.date)) },
      {
        key: 'accouchements',
        label: 'Accouchements',
        monthly: monthlyBuckets(accouchements.map((r) => r.date)),
      },
      { key: 'cpon', label: 'CPoN', monthly: monthlyBuckets(cpon.map((r) => r.date)) },
      {
        key: 'ureni',
        label: 'URENI (admissions)',
        monthly: monthlyBuckets(ureni.map((r) => r.date)),
      },
      {
        key: 'urenas',
        label: 'URENAS (admissions)',
        monthly: monthlyBuckets(urenas.map((r) => r.date)),
      },
      {
        key: 'urenam',
        label: 'URENAM (épisodes)',
        monthly: monthlyBuckets(urenam.map((r) => r.date)),
      },
      {
        key: 'pf',
        label: 'Planification Familiale (visites)',
        monthly: monthlyBuckets(pf.map((r) => r.date)),
      },
      {
        key: 'vaccination',
        label: 'Vaccination (doses)',
        monthly: monthlyBuckets(vaccinations.map((r) => r.date)),
      },
    ];

    return NextResponse.json({ year, categories }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

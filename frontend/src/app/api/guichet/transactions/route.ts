// POST /api/guichet/transactions — emit a Guichet receipt (the anti-fraud
// core of the module: numeroSequence and createdAt are always server-
// derived, montant is always derived from the org's TypeRecette grid —
// see .planning/prd-guichet-entree.md § 2, 4.1, 6.6). Any org member
// (MEMBER+) can emit. Applying a remise (exceptional discount) requires
// ADMIN+ per § 5.2 ("gestion des remises exceptionnelles" is a responsable-
// de-centre capability, not a guichetier one).
//
// GET /api/guichet/transactions?date=YYYY-MM-DD — that day's transactions
// for the caller's org (defaults to today). A MEMBER only ever sees their
// own (§ 5.1 "historique du jour" is scoped to the guichetier connecté);
// ADMIN/OWNER see every guichetier's transactions for the day.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { GuichetTransaction, Prisma } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { ORG_ROLE_RANK } from '@/lib/server/middleware/require-org-role';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { generateNumeroSequence } from '@/lib/server/guichet/numero-sequence';
import { checkHorsHoraires } from '@/lib/server/guichet/alertes';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const MODES_PAIEMENT = ['especes', 'mobile_money', 'exoneration'] as const;

const EmitBody = z
  .object({
    patientNom: z.string().trim().min(1).max(200),
    patientId: z.string().min(1).optional(),
    typeRecetteId: z.string().min(1),
    modePaiement: z.enum(MODES_PAIEMENT),
    remiseAppliquee: z.number().int().positive().optional(),
    remiseMotif: z.string().trim().min(1).max(500).optional(),
  })
  .refine((b) => (b.remiseAppliquee === undefined) === (b.remiseMotif === undefined), {
    message: 'remiseAppliquee and remiseMotif must be provided together',
  });

type SerializableTransaction = GuichetTransaction & {
  typeRecette: { libelle: string };
  guichetier: { name: string | null; email: string };
};

function serialize(t: SerializableTransaction) {
  return {
    id: t.id,
    numeroSequence: t.numeroSequence,
    patientNom: t.patientNom,
    patientId: t.patientId,
    typeRecetteId: t.typeRecetteId,
    typeRecetteLibelle: t.typeRecette.libelle,
    montant: t.montant,
    modePaiement: t.modePaiement,
    guichetierId: t.guichetierId,
    guichetierName: t.guichetier.name ?? t.guichetier.email,
    statut: t.statut,
    createdAt: t.createdAt.toISOString(),
    annulationMotif: t.annulationMotif,
    annulationParId: t.annulationParId,
    annulationAt: t.annulationAt?.toISOString() ?? null,
    remiseAppliquee: t.remiseAppliquee,
    remiseMotif: t.remiseMotif,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    const subFail = await requireActiveSubscription(auth.orgMember.organizationId);
    if (subFail) {
      subFail.headers.set('x-request-id', ctx.requestId);
      return subFail;
    }

    const parsed = EmitBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Requête invalide.',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const d = parsed.data;
    const organizationId = auth.orgMember.organizationId;

    if (
      d.remiseAppliquee !== undefined &&
      ORG_ROLE_RANK[auth.orgMember.role] < ORG_ROLE_RANK.ADMIN
    ) {
      return NextResponse.json(
        {
          error: 'ORG_ROLE_INSUFFICIENT',
          message:
            'Seul un responsable de centre (ADMIN) peut appliquer une remise exceptionnelle.',
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const typeRecette = await prisma.typeRecette.findFirst({
      where: { id: d.typeRecetteId, organizationId },
    });
    if (!typeRecette || !typeRecette.actif) {
      return NextResponse.json(
        { error: 'TYPE_RECETTE_INVALID', message: 'Ce type de recette est inconnu ou désactivé.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (d.patientId) {
      const patient = await prisma.patient.findFirst({
        where: { id: d.patientId, organizationId },
        select: { id: true },
      });
      if (!patient) {
        return NextResponse.json(
          { error: 'PATIENT_NOT_FOUND', message: 'Patient introuvable.' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    // montant is always derived from the grid (± a traced remise), never
    // accepted from the client — the same principle as numeroSequence/
    // createdAt, closing off the "montant hors grille" alert case (§ 6.6)
    // at the source for every transaction issued through this route.
    const montant = typeRecette.tarif - (d.remiseAppliquee ?? 0);
    if (montant < 0) {
      return NextResponse.json(
        { error: 'REMISE_EXCEEDS_TARIF', message: 'La remise ne peut pas dépasser le tarif.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const createData: Omit<Prisma.GuichetTransactionCreateInput, 'numeroSequence'> = {
      organization: { connect: { id: organizationId } },
      patientNom: d.patientNom,
      typeRecette: { connect: { id: typeRecette.id } },
      montant,
      modePaiement: d.modePaiement,
      guichetier: { connect: { id: auth.user.sub } },
      ...(d.patientId ? { patient: { connect: { id: d.patientId } } } : {}),
      ...(d.remiseAppliquee !== undefined ? { remiseAppliquee: d.remiseAppliquee } : {}),
      ...(d.remiseMotif !== undefined ? { remiseMotif: d.remiseMotif } : {}),
    };

    // Same read-then-write race as generateDossierNumber — retry the whole
    // transaction on a numeroSequence collision rather than a raw 500.
    const MAX_ATTEMPTS = 5;
    let transaction: SerializableTransaction | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        transaction = await prisma.$transaction(async (tx) => {
          const numeroSequence = await generateNumeroSequence(tx, organizationId);
          return tx.guichetTransaction.create({
            data: { ...createData, numeroSequence },
            include: {
              typeRecette: { select: { libelle: true } },
              guichetier: { select: { name: true, email: true } },
            },
          });
        });
        break;
      } catch (err) {
        const isSequenceCollision =
          typeof err === 'object' &&
          err !== null &&
          (err as { code?: string }).code === 'P2002' &&
          ((err as { meta?: { target?: unknown } }).meta?.target as string[] | undefined)?.includes(
            'numeroSequence',
          );
        if (!isSequenceCollision || attempt === MAX_ATTEMPTS) throw err;
      }
    }

    // § 6.2 — évalué immédiatement contre les horaires déclarés du centre
    // (no-op si non déclarés).
    await checkHorsHoraires(prisma, {
      organizationId,
      transactionId: transaction!.id,
      createdAt: transaction!.createdAt,
    });

    return NextResponse.json(serialize(transaction!), {
      status: 201,
      headers: { 'x-request-id': ctx.requestId },
    });
  });
}

function parseDateParam(raw: string | null): Date {
  if (raw) {
    const parsed = new Date(`${raw}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
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

    const rangeStart = parseDateParam(req.nextUrl.searchParams.get('date'));
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 1);

    const isStaff = ORG_ROLE_RANK[auth.orgMember.role] < ORG_ROLE_RANK.ADMIN;

    const rows = await prisma.guichetTransaction.findMany({
      where: {
        organizationId: auth.orgMember.organizationId,
        createdAt: { gte: rangeStart, lt: rangeEnd },
        ...(isStaff ? { guichetierId: auth.user.sub } : {}),
      },
      orderBy: { numeroSequence: 'asc' },
      include: {
        typeRecette: { select: { libelle: true } },
        guichetier: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json(
      { transactions: rows.map(serialize) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

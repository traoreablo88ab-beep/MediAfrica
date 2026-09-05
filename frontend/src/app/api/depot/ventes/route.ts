// POST /api/depot/ventes — emit a medication sale (a multi-product cart) —
// the anti-fraud core of the Dépôt module (see
// .planning/prd-depot-medicaments.md § 2, 4.2, 4.3). numeroSequence and
// createdAt are always server-derived; montantTotal and each line's
// sousTotal are always derived from the catalogue's current prixUnitaire,
// never accepted from the client. Stock is decremented atomically per line
// via applyStockMovement — a request for more than what's in stock is
// refused, never partially fulfilled. Any org member (MEMBER+) can sell.
//
// GET /api/depot/ventes?date=YYYY-MM-DD — that day's sales for the caller's
// org (defaults to today). A MEMBER only ever sees their own; ADMIN/OWNER
// see every gérant's sales for the day.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { DepotVente, DepotVenteLigne, Prisma } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { ORG_ROLE_RANK } from '@/lib/server/middleware/require-org-role';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { generateNumeroSequence } from '@/lib/server/depot/numero-sequence';
import { applyStockMovement, StockInsuffisantError } from '@/lib/server/depot/stock';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const MODES_PAIEMENT = ['especes', 'mobile_money', 'exoneration'] as const;

const LigneBody = z.object({
  produitId: z.string().min(1),
  quantite: z.number().int().positive(),
});

const EmitBody = z.object({
  patientNom: z.string().trim().min(1).max(200),
  patientId: z.string().min(1).optional(),
  modePaiement: z.enum(MODES_PAIEMENT),
  lignes: z.array(LigneBody).min(1).max(50),
});

type SerializableLigne = DepotVenteLigne & { produit: { nom: string } };
type SerializableVente = DepotVente & {
  lignes: SerializableLigne[];
  gerant: { name: string | null; email: string };
};

function serialize(v: SerializableVente) {
  return {
    id: v.id,
    numeroSequence: v.numeroSequence,
    patientNom: v.patientNom,
    patientId: v.patientId,
    montantTotal: v.montantTotal,
    modePaiement: v.modePaiement,
    gerantId: v.gerantId,
    gerantName: v.gerant.name ?? v.gerant.email,
    statut: v.statut,
    createdAt: v.createdAt.toISOString(),
    annulationMotif: v.annulationMotif,
    annulationParId: v.annulationParId,
    annulationAt: v.annulationAt?.toISOString() ?? null,
    lignes: v.lignes.map((l) => ({
      id: l.id,
      produitId: l.produitId,
      produitNom: l.produit.nom,
      quantite: l.quantite,
      prixUnitaireApplique: l.prixUnitaireApplique,
      sousTotal: l.sousTotal,
    })),
  };
}

const VENTE_INCLUDE = {
  lignes: { include: { produit: { select: { nom: true } } } },
  gerant: { select: { name: true, email: true } },
} satisfies Prisma.DepotVenteInclude;

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

    // montant is always derived from the catalogue's current price — never
    // accepted from the client, same anti-fraud principle as Guichet.
    const produitIds = [...new Set(d.lignes.map((l) => l.produitId))];
    const produits = await prisma.medicamentProduit.findMany({
      where: { id: { in: produitIds }, organizationId },
    });
    const produitById = new Map(produits.map((p) => [p.id, p]));
    for (const produitId of produitIds) {
      const p = produitById.get(produitId);
      if (!p || !p.actif) {
        return NextResponse.json(
          { error: 'PRODUIT_INVALID', message: 'Un des produits est inconnu ou désactivé.' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const resolvedLignes = d.lignes.map((l) => {
      const produit = produitById.get(l.produitId)!;
      return {
        produitId: l.produitId,
        quantite: l.quantite,
        prixUnitaireApplique: produit.prixUnitaire,
        sousTotal: l.quantite * produit.prixUnitaire,
      };
    });
    const montantTotal = resolvedLignes.reduce((sum, l) => sum + l.sousTotal, 0);

    // Same read-then-write race as generateDossierNumber/generateNumeroSequence
    // — retry the whole transaction on a numeroSequence collision.
    const MAX_ATTEMPTS = 5;
    let vente: SerializableVente | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        vente = await prisma.$transaction(async (tx) => {
          const numeroSequence = await generateNumeroSequence(tx, organizationId);
          const created = await tx.depotVente.create({
            data: {
              organization: { connect: { id: organizationId } },
              numeroSequence,
              patientNom: d.patientNom,
              montantTotal,
              modePaiement: d.modePaiement,
              gerant: { connect: { id: auth.user.sub } },
              ...(d.patientId ? { patient: { connect: { id: d.patientId } } } : {}),
            },
          });

          for (const l of resolvedLignes) {
            await tx.depotVenteLigne.create({
              data: {
                organizationId,
                depotVenteId: created.id,
                produitId: l.produitId,
                quantite: l.quantite,
                prixUnitaireApplique: l.prixUnitaireApplique,
                sousTotal: l.sousTotal,
              },
            });
            await applyStockMovement(tx, {
              organizationId,
              produitId: l.produitId,
              type: 'vente',
              quantite: l.quantite,
              auteurId: auth.user.sub,
              venteId: created.id,
            });
          }

          return tx.depotVente.findUniqueOrThrow({
            where: { id: created.id },
            include: VENTE_INCLUDE,
          });
        });
        break;
      } catch (err) {
        if (err instanceof StockInsuffisantError) {
          return NextResponse.json(
            { error: 'STOCK_INSUFFISANT', message: err.message },
            { status: 400, headers: { 'x-request-id': ctx.requestId } },
          );
        }
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

    return NextResponse.json(serialize(vente!), {
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

    const rows = await prisma.depotVente.findMany({
      where: {
        organizationId: auth.orgMember.organizationId,
        createdAt: { gte: rangeStart, lt: rangeEnd },
        ...(isStaff ? { gerantId: auth.user.sub } : {}),
      },
      orderBy: { numeroSequence: 'asc' },
      include: VENTE_INCLUDE,
    });

    return NextResponse.json(
      { ventes: rows.map(serialize) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

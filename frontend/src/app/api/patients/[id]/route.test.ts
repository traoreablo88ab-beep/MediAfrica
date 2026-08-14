import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { GET, PATCH } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const authedCtx = {
  user: { sub: 'user-1', email: 'staff@example.com' },
  orgMember: { organizationId: 'org-1', role: 'OWNER' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/patients/pt-1', { method: 'GET' });
}

function makePatch(body: unknown): NextRequest {
  return new NextRequest('http://test/api/patients/pt-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function fullPatient() {
  return {
    id: 'pt-1',
    dossierNumber: 'P-20260001',
    nom: 'Keïta',
    prenom: 'Fatoumata',
    dateNaissance: new Date('1990-03-12T00:00:00Z'),
    sexe: 'F',
    telephonePrincipal: '+22376432109',
    telephoneSecondaire: null,
    communeResidence: 'Commune V, Bamako',
    quartierVillage: null,
    contactUrgenceNom: null,
    contactUrgenceTelephone: null,
    numeroRamed: null,
    numeroAmo: null,
    groupeSanguin: 'A+',
    allergiesConnues: 'Pénicilline',
    antecedentsPersonnels: null,
    antecedentsChirurgicaux: null,
    antecedentsFamiliaux: null,
    createdAt: new Date('2026-01-12T00:00:00Z'),
    updatedAt: new Date('2026-01-12T00:00:00Z'),
    consultations: [
      {
        id: 'c-1',
        date: new Date('2026-01-12T07:45:00Z'),
        motif: 'Paludisme simple',
        status: 'traite',
        diagnostic: 'Paludisme non compliqué',
        traitementPrescrit: 'Coartem',
        tensionArterielle: '118/76',
        poidsKg: 62,
        tailleCm: 95,
        perimetreBrachialCm: 13.5,
        statutPT: 'Normal',
        temperatureC: 38.4,
        typeCas: 'NC',
        mdo: false,
        mdoMaladie: null,
        tdr: 'Négatif',
        ge: null,
        indigent: true,
        telephoneContact: '76 00 00 00',
        localisationPrecise: 'Quartier Sabalibougou, rue 214',
        provider: { name: 'Amadou Diallo' },
      },
    ],
    maternites: [
      {
        id: 'm-1',
        date: new Date('2026-02-01T09:00:00Z'),
        type: 'CPN',
        cpnNumeroVisite: 2,
        ageGestationnelSemaines: 24,
        prochainRdv: new Date('2026-03-01T00:00:00Z'),
        modeAccouchement: null,
        issueGrossesse: null,
        sexeNouveauNe: null,
        poidsNaissanceG: null,
        observations: null,
        indigent: false,
        telephoneContact: '65 11 22 33',
        localisationPrecise: 'Quartier Hippodrome',
        provider: { name: 'Fatoumata Sow' },
      },
    ],
    nutritions: [
      {
        id: 'n-1',
        date: new Date('2026-01-20T09:00:00Z'),
        type: 'URENAM',
        numeroMas: null,
        telephoneContact: null,
        localisationPrecise: null,
        ageMois: 22,
        modeAdmission: null,
        typeCas: 'NC',
        poidsKg: 9.5,
        tailleCm: 72,
        perimetreBrachialCm: 11.2,
        ptIndice: null,
        oedemes: 'Non',
        pathologiesAssociees: null,
        nomPere: null,
        nomMere: null,
        allaite: null,
        jumeaux: null,
        parentsVivants: null,
        sourceAdmission: null,
        provenanceProgramme: null,
        carteVaccination: null,
        vaccinationAJour: null,
        dateSortie: null,
        poidsSortieKg: null,
        tailleSortieCm: null,
        perimetreBrachialSortieCm: null,
        ptIndiceSortie: null,
        oedemeSortie: null,
        typeSortie: null,
        destinationProgramme: null,
        datePoidsMinimum: null,
        poidsMinimumKg: null,
        seancesStimulationPsychocognitive: null,
        seancesCcsc: null,
        beneficiairePoudreNutritive: null,
        beneficiairePlaquette: null,
        dureeSejourJours: null,
        observations: null,
        visites: [
          { id: 'v-1', numeroVisite: 1, date: new Date('2026-01-27T09:00:00Z'), poidsKg: 9.7 },
        ],
        evenements: [
          {
            id: 'e-1',
            type: 'VAD',
            date: new Date('2026-01-30T09:00:00Z'),
            raison: 'Non retour',
            conclusion: 'Retour prévu',
            centre: null,
            resultat: null,
          },
        ],
        provider: { name: 'Amadou Diallo' },
      },
    ],
    vaccinations: [
      {
        id: 'v-1',
        date: new Date('2026-01-22T09:00:00Z'),
        antigene: 'BCG',
        numeroDose: null,
        siteInjection: 'Bras droit',
        dejaSousContraception: null,
        methodeContraceptivePrecedente: null,
        pfppCounselingPropose: null,
        methodePfAdoptee: null,
        conseilsAme: null,
        pratiqueAme: null,
        prochainRdv: null,
        observations: null,
        provider: { name: 'Amadou Diallo' },
      },
    ],
    hospitalisations: [
      {
        id: 'h-1',
        dateHeureEntree: new Date('2026-01-15T09:00:00Z'),
        motifAdmission: 'Paludisme grave',
        service: 'Pédiatrie',
        numeroHospitalisation: '2026-014',
        referenceOrigine: 'Cscom',
        profession: 'Ménagère',
        indigent: true,
        telephoneContact: '76 00 00 00',
        localisationPrecise: 'Quartier Sabalibougou, rue 214',
        diagnosticPrincipal: 'Paludisme sévère',
        traitementRecu: 'Artésunate IV',
        dateHeureSortie: null,
        issue: null,
        observations: null,
        provider: { name: 'Amadou Diallo' },
      },
    ],
    planificationsFamiliales: [
      {
        id: 'pf-1',
        date: new Date('2026-01-25T09:00:00Z'),
        typeVisite: 'Nouvelle acceptante',
        methodeChoisie: 'Implanon',
        actionMethode: 'Insertion',
        nbreCyclesDistribues: null,
        typeUtilisateur: 'Nouveau',
        ageDernierEnfantMois: null,
        pratiqueAme: null,
        enfantAJourVaccins: null,
        conseilsAlimentationComplement: null,
        serviceProvenance: null,
        ppi: null,
        prochainRdv: null,
        observations: null,
        provider: { name: 'Amadou Diallo' },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(authedCtx);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('GET /api/patients/[id]', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet(), ctxWith('pt-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 PATIENT_NOT_FOUND when the patient does not exist', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(null);
    const res = await GET(makeGet(), ctxWith('missing'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('PATIENT_NOT_FOUND');
  });

  it('happy path: includes patient fields and consultation history with provider name', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(fullPatient() as never);
    const res = await GET(makeGet(), ctxWith('pt-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dossierNumber).toBe('P-20260001');
    expect(body.dateNaissance).toBe('1990-03-12T00:00:00.000Z');
    expect(body.consultations).toHaveLength(1);
    expect(body.consultations[0].providerName).toBe('Amadou Diallo');
    expect(body.consultations[0].tensionArterielle).toBe('118/76');
    expect(body.consultations[0].tailleCm).toBe(95);
    expect(body.consultations[0].perimetreBrachialCm).toBe(13.5);
    expect(body.consultations[0].statutPT).toBe('Normal');
    expect(body.consultations[0].typeCas).toBe('NC');
    expect(body.consultations[0].mdo).toBe(false);
    expect(body.consultations[0].tdr).toBe('Négatif');
    expect(body.consultations[0].ge).toBe(null);
    expect(body.consultations[0].indigent).toBe(true);
    expect(body.consultations[0].telephoneContact).toBe('76 00 00 00');
    expect(body.consultations[0].localisationPrecise).toBe('Quartier Sabalibougou, rue 214');
    expect(body.maternites).toHaveLength(1);
    expect(body.maternites[0].type).toBe('CPN');
    expect(body.maternites[0].cpnNumeroVisite).toBe(2);
    expect(body.maternites[0].providerName).toBe('Fatoumata Sow');
    expect(body.maternites[0].indigent).toBe(false);
    expect(body.maternites[0].telephoneContact).toBe('65 11 22 33');
    expect(body.maternites[0].localisationPrecise).toBe('Quartier Hippodrome');
    expect(body.nutritions).toHaveLength(1);
    expect(body.nutritions[0].type).toBe('URENAM');
    expect(body.nutritions[0].typeCas).toBe('NC');
    expect(body.nutritions[0].ageMois).toBe(22);
    expect(body.nutritions[0].providerName).toBe('Amadou Diallo');
    expect(body.nutritions[0].visites).toHaveLength(1);
    expect(body.nutritions[0].visites[0].numeroVisite).toBe(1);
    expect(body.nutritions[0].visites[0].poidsKg).toBe(9.7);
    expect(body.nutritions[0].evenements).toHaveLength(1);
    expect(body.nutritions[0].evenements[0].type).toBe('VAD');
    expect(body.nutritions[0].evenements[0].raison).toBe('Non retour');
    expect(body.vaccinations).toHaveLength(1);
    expect(body.vaccinations[0].antigene).toBe('BCG');
    expect(body.vaccinations[0].providerName).toBe('Amadou Diallo');
    expect(body.vaccinations[0].conseilsAme).toBeNull();
    expect(body.vaccinations[0].pratiqueAme).toBeNull();
    expect(body.hospitalisations).toHaveLength(1);
    expect(body.hospitalisations[0].motifAdmission).toBe('Paludisme grave');
    expect(body.hospitalisations[0].dateHeureSortie).toBeNull();
    expect(body.hospitalisations[0].numeroHospitalisation).toBe('2026-014');
    expect(body.hospitalisations[0].referenceOrigine).toBe('Cscom');
    expect(body.hospitalisations[0].profession).toBe('Ménagère');
    expect(body.hospitalisations[0].indigent).toBe(true);
    expect(body.hospitalisations[0].telephoneContact).toBe('76 00 00 00');
    expect(body.hospitalisations[0].localisationPrecise).toBe('Quartier Sabalibougou, rue 214');
    expect(body.planificationsFamiliales).toHaveLength(1);
    expect(body.planificationsFamiliales[0].methodeChoisie).toBe('Implanon');
    expect(body.planificationsFamiliales[0].actionMethode).toBe('Insertion');
    expect(body.planificationsFamiliales[0].typeUtilisateur).toBe('Nouveau');
    expect(body.planificationsFamiliales[0].providerName).toBe('Amadou Diallo');
  });

  it('queries with the id-scoped consultations include, ordered desc, take 20', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(fullPatient() as never);
    await GET(makeGet(), ctxWith('pt-1'));
    const arg = prismaMock.patient.findFirst.mock.calls[0]?.[0];
    expect(arg?.where).toEqual({ id: 'pt-1', organizationId: 'org-1' });
    const consultInclude = (
      arg?.include as { consultations?: { orderBy?: unknown; take?: number } }
    )?.consultations;
    expect(consultInclude?.orderBy).toEqual({ date: 'desc' });
    expect(consultInclude?.take).toBe(20);
  });

  it('queries maternites filtered to CPN/ACCOUCHEMENT, ordered desc, take 20', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(fullPatient() as never);
    await GET(makeGet(), ctxWith('pt-1'));
    const arg = prismaMock.patient.findFirst.mock.calls[0]?.[0];
    const materniteInclude = (
      arg?.include as {
        maternites?: { where?: unknown; orderBy?: unknown; take?: number };
      }
    )?.maternites;
    expect(materniteInclude?.where).toEqual({ type: { in: ['CPN', 'ACCOUCHEMENT'] } });
    expect(materniteInclude?.orderBy).toEqual({ date: 'desc' });
    expect(materniteInclude?.take).toBe(20);
  });

  it('queries nutritions ordered desc, take 20', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(fullPatient() as never);
    await GET(makeGet(), ctxWith('pt-1'));
    const arg = prismaMock.patient.findFirst.mock.calls[0]?.[0];
    const nutritionInclude = (arg?.include as { nutritions?: { orderBy?: unknown; take?: number } })
      ?.nutritions;
    expect(nutritionInclude?.orderBy).toEqual({ date: 'desc' });
    expect(nutritionInclude?.take).toBe(20);
  });

  it('queries vaccinations ordered desc, take 20', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(fullPatient() as never);
    await GET(makeGet(), ctxWith('pt-1'));
    const arg = prismaMock.patient.findFirst.mock.calls[0]?.[0];
    const vaccinationInclude = (
      arg?.include as { vaccinations?: { orderBy?: unknown; take?: number } }
    )?.vaccinations;
    expect(vaccinationInclude?.orderBy).toEqual({ date: 'desc' });
    expect(vaccinationInclude?.take).toBe(20);
  });

  it('queries hospitalisations ordered by dateHeureEntree desc, take 20', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(fullPatient() as never);
    await GET(makeGet(), ctxWith('pt-1'));
    const arg = prismaMock.patient.findFirst.mock.calls[0]?.[0];
    const hospitalisationInclude = (
      arg?.include as { hospitalisations?: { orderBy?: unknown; take?: number } }
    )?.hospitalisations;
    expect(hospitalisationInclude?.orderBy).toEqual({ dateHeureEntree: 'desc' });
    expect(hospitalisationInclude?.take).toBe(20);
  });

  it('queries planificationsFamiliales ordered desc, take 20', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(fullPatient() as never);
    await GET(makeGet(), ctxWith('pt-1'));
    const arg = prismaMock.patient.findFirst.mock.calls[0]?.[0];
    const pfInclude = (
      arg?.include as { planificationsFamiliales?: { orderBy?: unknown; take?: number } }
    )?.planificationsFamiliales;
    expect(pfInclude?.orderBy).toEqual({ date: 'desc' });
    expect(pfInclude?.take).toBe(20);
  });
});

describe('PATCH /api/patients/[id]', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await PATCH(makePatch({ nom: 'Traoré' }), ctxWith('pt-1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when CSRF verification fails', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_FAILED' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ nom: 'Traoré' }), ctxWith('pt-1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 VALIDATION_FAILED on an invalid body', async () => {
    const res = await PATCH(makePatch({ sexe: 'X' }), ctxWith('pt-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('returns 404 PATIENT_NOT_FOUND when the patient does not exist', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(null);
    const res = await PATCH(makePatch({ nom: 'Traoré' }), ctxWith('missing'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('PATIENT_NOT_FOUND');
  });

  it('happy path: updates only the provided fields', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(fullPatient() as never);
    prismaMock.patient.update.mockResolvedValue({
      ...fullPatient(),
      nom: 'Traoré',
      prenom: 'Ablo',
    } as never);

    const res = await PATCH(makePatch({ nom: 'Traoré', prenom: 'Ablo' }), ctxWith('pt-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nom).toBe('Traoré');
    expect(body.prenom).toBe('Ablo');

    const arg = prismaMock.patient.update.mock.calls[0]?.[0];
    expect(arg?.where).toEqual({ id: 'pt-1' });
    expect(arg?.data).toEqual({ nom: 'Traoré', prenom: 'Ablo' });
  });

  it('passes through numeroAmo', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(fullPatient() as never);
    prismaMock.patient.update.mockResolvedValue({
      ...fullPatient(),
      numeroAmo: 'AMO-5678',
    } as never);

    await PATCH(makePatch({ numeroAmo: 'AMO-5678' }), ctxWith('pt-1'));

    const arg = prismaMock.patient.update.mock.calls[0]?.[0];
    expect(arg?.data).toEqual({ numeroAmo: 'AMO-5678' });
  });
});

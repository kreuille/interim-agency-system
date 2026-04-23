import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const agency = await prisma.agency.upsert({
    where: { ideNumber: 'CHE-123.456.789' },
    update: {},
    create: {
      legalName: 'Agence Pilote SA',
      ideNumber: 'CHE-123.456.789',
      canton: 'GE',
      iban: 'CH9300762011623852957',
      authorizations: {
        create: {
          canton: 'GE',
          authorityName: 'OCE Genève',
          authNumber: 'GE-LSE-0001',
          status: 'ACTIVE',
          grantedAt: new Date('2025-09-01T00:00:00Z'),
          expiresAt: new Date('2030-08-31T00:00:00Z'),
          bondAmountRappen: 5_000_000n,
        },
      },
    },
    include: { authorizations: true },
  });

  const [worker1, worker2] = await Promise.all([
    prisma.tempWorker.upsert({
      where: { agencyId_avs: { agencyId: agency.id, avs: '756.1234.5678.97' } },
      update: {},
      create: {
        agencyId: agency.id,
        firstName: 'Jean',
        lastName: 'Dupont',
        avs: '756.1234.5678.97',
        iban: 'CH9300762011623852957',
        residenceCanton: 'GE',
        email: 'jean.dupont@example.test',
        phone: '+41 78 000 00 01',
      },
    }),
    prisma.tempWorker.upsert({
      where: { agencyId_avs: { agencyId: agency.id, avs: '756.2345.6789.08' } },
      update: {},
      create: {
        agencyId: agency.id,
        firstName: 'Marie',
        lastName: 'Martin',
        avs: '756.2345.6789.08',
        iban: 'CH5604835012345678009',
        residenceCanton: 'VD',
        email: 'marie.martin@example.test',
        phone: '+41 78 000 00 02',
      },
    }),
  ]);

  const client = await prisma.client.upsert({
    where: { agencyId_ideNumber: { agencyId: agency.id, ideNumber: 'CHE-999.888.777' } },
    update: {},
    create: {
      agencyId: agency.id,
      legalName: 'MovePlanner SA (test)',
      ideNumber: 'CHE-999.888.777',
      billingEmail: 'billing@moveplanner.test',
      canton: 'GE',
      paymentTermsDays: 30,
      contracts: {
        create: {
          agencyId: agency.id,
          reference: 'MP-2026-001',
          branch: 'Transport / déménagement',
          startDate: new Date('2026-01-01'),
          agencyCoefficient: 165,
          billingFrequencyDays: 30,
          notes: 'Contrat cadre de test — tarifs indicatifs.',
        },
      },
    },
    include: { contracts: true },
  });

  const firstContract = client.contracts[0];
  if (firstContract) {
    const existingRateCard = await prisma.rateCard.findFirst({
      where: { agencyId: agency.id, clientId: client.id, role: 'Déménageur' },
    });
    if (!existingRateCard) {
      await prisma.rateCard.create({
        data: {
          agencyId: agency.id,
          clientId: client.id,
          clientContractId: firstContract.id,
          role: 'Déménageur',
          branch: 'Transport / déménagement',
          hourlyRateRappen: 2_800n,
          agencyCoefficient: 165,
          validFrom: new Date('2026-01-01'),
        },
      });
    }
  }

  console.log('[seed] agency:', agency.id);
  console.log('[seed] workers:', worker1.id, worker2.id);
  console.log('[seed] client:', client.id);

  await seedCantonHolidays(agency.id);
}

/**
 * DETTE-036 — Seed des fériés cantonaux 2026-2028 pour les 26 cantons
 * suisses. Idempotent : 2e exécution → upsert no-op.
 *
 * Audit log : 1 entrée AuditLogEntry CREATE par run de seed (traçabilité
 * réglementaire — l'introduction d'une nouvelle version des fériés peut
 * modifier les bulletins de paie générés ensuite).
 */
async function seedCantonHolidays(agencyId: string): Promise<void> {
  const { SWISS_CANTONS, HOLIDAY_DATA_VERSION_VALID_FROM, computeHolidaysForCantonYear } =
    await import('@interim/domain');

  const years = [2026, 2027, 2028] as const;
  const validFrom = new Date(HOLIDAY_DATA_VERSION_VALID_FROM);
  let totalUpserted = 0;

  for (const canton of SWISS_CANTONS) {
    for (const year of years) {
      const holidays = computeHolidaysForCantonYear(canton, year);
      for (const h of holidays) {
        await prisma.cantonHoliday.upsert({
          where: {
            canton_date_validFrom: {
              canton,
              date: new Date(h.date),
              validFrom,
            },
          },
          create: {
            canton,
            date: new Date(h.date),
            label: h.label,
            scope: h.scope,
            paid: h.paid,
            validFrom,
            validTo: null,
          },
          update: {
            label: h.label,
            scope: h.scope,
            paid: h.paid,
          },
        });
        totalUpserted++;
      }
    }
  }

  // Audit trail (CO art. 958f conservation 10 ans).
  await prisma.auditLogEntry.create({
    data: {
      agencyId,
      action: 'CREATE',
      actorId: 'system_seed',
      actorRole: 'system',
      entityType: 'canton_holidays',
      entityId: HOLIDAY_DATA_VERSION_VALID_FROM,
      diff: {
        cantonsCount: SWISS_CANTONS.length,
        yearsRange: [2026, 2028],
        totalUpserted,
        sourceVersion: HOLIDAY_DATA_VERSION_VALID_FROM,
        seedTimestamp: new Date().toISOString(),
      },
    },
  });

  console.log(
    `[seed] canton_holidays : ${String(totalUpserted)} rows upsert (26 cantons × 3 ans 2026-2028) + audit log`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('[seed] failed', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });

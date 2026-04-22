import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId } from '@interim/domain';
import { HandleOptOutUseCase } from './handle-opt-out.use-case.js';
import { InMemoryOptOutRepository } from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const AGENCY = asAgencyId('agency-a');
const clock = new FixedClock(NOW);

function setup() {
  const optOut = new InMemoryOptOutRepository();
  const useCase = new HandleOptOutUseCase(optOut, clock);
  return { optOut, useCase };
}

describe('HandleOptOutUseCase', () => {
  it('STOP → opted_out + persist', async () => {
    const { useCase, optOut } = setup();
    const result = await useCase.execute({
      agencyId: AGENCY,
      from: '+41791234567',
      body: 'STOP',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe('opted_out');
    expect(await optOut.isOptedOut(AGENCY, '+41791234567')).toBe(true);
  });

  it('respecte casse et trim', async () => {
    const { useCase, optOut } = setup();
    await useCase.execute({ agencyId: AGENCY, from: '+41791234567', body: '  stop  ' });
    expect(await optOut.isOptedOut(AGENCY, '+41791234567')).toBe(true);
  });

  it('accepte ARRET (FR)', async () => {
    const { useCase, optOut } = setup();
    await useCase.execute({ agencyId: AGENCY, from: '+41791234567', body: 'ARRET' });
    expect(await optOut.isOptedOut(AGENCY, '+41791234567')).toBe(true);
  });

  it("body non-keyword → not_a_keyword, pas d'opt-out", async () => {
    const { useCase, optOut } = setup();
    const result = await useCase.execute({
      agencyId: AGENCY,
      from: '+41791234567',
      body: 'merci pour la mission',
    });
    if (result.ok) expect(result.value.status).toBe('not_a_keyword');
    expect(optOut.size()).toBe(0);
  });

  it('numéro invalide → SmsError(invalid_phone)', async () => {
    const { useCase } = setup();
    const result = await useCase.execute({
      agencyId: AGENCY,
      from: 'not-a-phone',
      body: 'STOP',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_phone');
  });
});

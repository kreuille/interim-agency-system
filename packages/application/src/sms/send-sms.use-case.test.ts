import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId } from '@interim/domain';
import { SendSmsUseCase } from './send-sms.use-case.js';
import { InMemorySmsTemplateRegistry } from './template-renderer.js';
import { InMemorySmsRateLimiter } from './rate-limiter.js';
import {
  FailingSmsSender,
  InMemoryOptOutRepository,
  InMemorySmsLogRepository,
  NoopSmsSender,
} from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const AGENCY = asAgencyId('agency-a');
const clock = new FixedClock(NOW);

function setup(opts: { failing?: boolean; preOptOut?: boolean; preFillRate?: boolean } = {}) {
  const sender = opts.failing ? new FailingSmsSender('boom') : new NoopSmsSender();
  const templates = new InMemorySmsTemplateRegistry().register({
    code: 'hello',
    source: 'Hi {{firstName}}, agency {{agency}}.',
  });
  const logs = new InMemorySmsLogRepository();
  const optOut = new InMemoryOptOutRepository();
  const rateLimiter = new InMemorySmsRateLimiter();
  const useCase = new SendSmsUseCase(sender, templates, logs, optOut, rateLimiter, clock);
  return { sender, templates, logs, optOut, rateLimiter, useCase };
}

describe('SendSmsUseCase', () => {
  it('happy path → SMS envoyé + log status=sent + numéro masqué', async () => {
    const { useCase, sender, logs } = setup();
    const result = await useCase.execute({
      agencyId: AGENCY,
      to: '+41791234567',
      templateCode: 'hello',
      variables: { firstName: 'Jean', agency: 'Acme' },
    });
    expect(result.ok).toBe(true);
    expect((sender as NoopSmsSender).sent[0]?.body).toBe('Hi Jean, agency Acme.');
    const log = logs.snapshot()[0];
    expect(log?.status).toBe('sent');
    expect(log?.toMasked).toBe('+4179*****67');
    expect(log?.providerMessageId).toBe('noop-1');
  });

  it("opt-out → bloque l'envoi avec SmsError(opt_out)", async () => {
    const { useCase, optOut, sender } = setup();
    await optOut.optOut(AGENCY, '+41791234567', NOW);
    const result = await useCase.execute({
      agencyId: AGENCY,
      to: '+41791234567',
      templateCode: 'hello',
      variables: { firstName: 'A', agency: 'B' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('opt_out');
    expect((sender as NoopSmsSender).sent).toHaveLength(0);
  });

  it('rate limit → SmsError(rate_limited)', async () => {
    const { useCase } = setup();
    for (let i = 0; i < 10; i++) {
      await useCase.execute({
        agencyId: AGENCY,
        to: '+41791234567',
        templateCode: 'hello',
        variables: { firstName: 'A', agency: 'B' },
      });
    }
    const blocked = await useCase.execute({
      agencyId: AGENCY,
      to: '+41791234567',
      templateCode: 'hello',
      variables: { firstName: 'A', agency: 'B' },
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.kind).toBe('rate_limited');
  });

  it('template missing variable → SmsError(template_missing_variable), aucun envoi', async () => {
    const { useCase, sender } = setup();
    const result = await useCase.execute({
      agencyId: AGENCY,
      to: '+41791234567',
      templateCode: 'hello',
      variables: { firstName: 'A' }, // agency manquant
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('template_missing_variable');
    expect((sender as NoopSmsSender).sent).toHaveLength(0);
  });

  it('template inconnu → template_not_found', async () => {
    const { useCase } = setup();
    const result = await useCase.execute({
      agencyId: AGENCY,
      to: '+41791234567',
      templateCode: 'unknown',
      variables: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('template_not_found');
  });

  it('provider qui throw → log status=failed + SmsError(provider_transient)', async () => {
    const { useCase, logs } = setup({ failing: true });
    const result = await useCase.execute({
      agencyId: AGENCY,
      to: '+41791234567',
      templateCode: 'hello',
      variables: { firstName: 'A', agency: 'B' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('provider_transient');
    const log = logs.snapshot()[0];
    expect(log?.status).toBe('failed');
    expect(log?.failureReason).toBe('boom');
  });

  it('numéro invalide → SmsError(invalid_phone)', async () => {
    const { useCase } = setup();
    const result = await useCase.execute({
      agencyId: AGENCY,
      to: 'not-a-phone',
      templateCode: 'hello',
      variables: { firstName: 'A', agency: 'B' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_phone');
  });
});

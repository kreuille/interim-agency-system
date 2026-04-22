import { describe, expect, it, vi } from 'vitest';
import { ConsoleSentryReporter, buildCircuitBreakerSentryHook } from './sentry.js';

describe('ConsoleSentryReporter', () => {
  it('captureMessage écrit sur stderr/stdout avec préfixe', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    new ConsoleSentryReporter().captureMessage('hello', 'warning', { ctx: 'test' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[sentry:warning] hello'));
    spy.mockRestore();
  });

  it('captureException tagge les erreurs', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    new ConsoleSentryReporter().captureException(new Error('boom'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[sentry:exception] boom'));
    spy.mockRestore();
  });
});

describe('buildCircuitBreakerSentryHook', () => {
  it("notifie quand le breaker s'ouvre (level=error)", () => {
    const reporter = {
      captureMessage: vi.fn(),
      captureException: vi.fn(),
    };
    const hook = buildCircuitBreakerSentryHook(reporter);
    hook({ name: 'mp-x', from: 'closed', to: 'open' });
    expect(reporter.captureMessage).toHaveBeenCalledWith(
      "Circuit breaker 'mp-x' opened",
      'error',
      expect.objectContaining({ circuit: 'mp-x', to: 'open' }),
    );
  });

  it('notifie quand le breaker recovery (level=info)', () => {
    const reporter = {
      captureMessage: vi.fn(),
      captureException: vi.fn(),
    };
    const hook = buildCircuitBreakerSentryHook(reporter);
    hook({ name: 'mp-x', from: 'half-open', to: 'closed' });
    expect(reporter.captureMessage).toHaveBeenCalledWith(
      "Circuit breaker 'mp-x' recovered",
      'info',
      expect.any(Object),
    );
  });

  it('ne notifie pas pour les transitions silencieuses (closed → closed)', () => {
    const reporter = {
      captureMessage: vi.fn(),
      captureException: vi.fn(),
    };
    const hook = buildCircuitBreakerSentryHook(reporter);
    hook({ name: 'mp-x', from: 'closed', to: 'closed' });
    expect(reporter.captureMessage).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  ConsoleSentryReporter,
  SdkSentryReporter,
  buildCircuitBreakerSentryHook,
  createSentryReporter,
} from './sentry.js';

// Mock complet du SDK Sentry pour vérifier les appels sans toucher au
// vrai client (qui valide le DSN au runtime).
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  withScope: vi.fn((cb: (scope: { setTags: () => void; setLevel: () => void }) => void) => {
    cb({ setTags: () => undefined, setLevel: () => undefined });
  }),
}));

import * as Sentry from '@sentry/node';

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

describe('createSentryReporter', () => {
  it('renvoie ConsoleSentryReporter si SENTRY_DSN absent', () => {
    const reporter = createSentryReporter({ dsn: undefined });
    expect(reporter).toBeInstanceOf(ConsoleSentryReporter);
  });

  it('renvoie ConsoleSentryReporter si SENTRY_DSN vide', () => {
    const reporter = createSentryReporter({ dsn: '' });
    expect(reporter).toBeInstanceOf(ConsoleSentryReporter);
  });

  it('renvoie SdkSentryReporter et appelle Sentry.init si DSN valide', () => {
    vi.mocked(Sentry.init).mockClear();
    const reporter = createSentryReporter({
      dsn: 'https://abc@o123.ingest.sentry.io/456',
      environment: 'test',
      release: '1.0.0',
    });
    expect(reporter).toBeInstanceOf(SdkSentryReporter);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://abc@o123.ingest.sentry.io/456',
        environment: 'test',
        release: '1.0.0',
      }),
    );
  });
});

describe('SdkSentryReporter', () => {
  it('captureMessage appelle Sentry.captureMessage', () => {
    vi.mocked(Sentry.captureMessage).mockClear();
    new SdkSentryReporter().captureMessage('msg', 'warning', { ctx: 'x' });
    expect(Sentry.captureMessage).toHaveBeenCalledWith('msg', 'warning');
  });

  it('captureException appelle Sentry.captureException', () => {
    vi.mocked(Sentry.captureException).mockClear();
    new SdkSentryReporter().captureException(new Error('boom'));
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });
});

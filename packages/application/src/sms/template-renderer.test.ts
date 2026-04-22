import { describe, expect, it } from 'vitest';
import { InMemorySmsTemplateRegistry, renderTemplate } from './template-renderer.js';
import { SmsError } from './sms-sender.js';

function registry() {
  return new InMemorySmsTemplateRegistry()
    .register({ code: 'hello', source: 'Hi {{firstName}}, welcome to {{agency}}.' })
    .register({ code: 'nested', source: 'OTP: {{security.otp}}' })
    .register({ code: 'long', source: 'X'.repeat(2000), maxLength: 100 });
}

describe('renderTemplate', () => {
  it('remplace les variables simples', () => {
    const r = renderTemplate(registry(), 'hello', { firstName: 'Jean', agency: 'Acme' });
    expect(r.body).toBe('Hi Jean, welcome to Acme.');
    expect(r.templateCode).toBe('hello');
  });

  it('variable manquante → SmsError(template_missing_variable)', () => {
    expect(() => renderTemplate(registry(), 'hello', { firstName: 'Jean' })).toThrowError(
      /template_missing_variable|agency/,
    );
  });

  it('template inconnu → SmsError(template_not_found)', () => {
    expect(() => renderTemplate(registry(), 'unknown', {})).toThrowError(SmsError);
  });

  it('supporte les chemins imbriqués', () => {
    const r = renderTemplate(registry(), 'nested', { security: { otp: '123456' } });
    expect(r.body).toBe('OTP: 123456');
  });

  it('dépasse maxLength → throw', () => {
    expect(() => renderTemplate(registry(), 'long', {})).toThrow();
  });

  it('valeur 0 ou false rendue (pas considérée undefined)', () => {
    const r = renderTemplate(
      new InMemorySmsTemplateRegistry().register({
        code: 'count',
        source: 'You have {{count}} messages, active={{active}}',
      }),
      'count',
      { count: 0, active: false },
    );
    expect(r.body).toBe('You have 0 messages, active=false');
  });
});

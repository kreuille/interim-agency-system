import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SMS_LANG,
  InMemorySmsTemplateRegistry,
  renderTemplate,
} from './template-renderer.js';

describe('SmsTemplateRegistry i18n', () => {
  const registry = new InMemorySmsTemplateRegistry()
    .register({ code: 'greet', source: 'Bonjour {{name}}' }) // implicit fr
    .register({ code: 'greet', lang: 'de', source: 'Hallo {{name}}' })
    .register({ code: 'greet', lang: 'it', source: 'Ciao {{name}}' });

  it('renvoie le template fr par défaut quand lang absent', () => {
    const r = renderTemplate(registry, 'greet', { name: 'Jean' });
    expect(r.body).toBe('Bonjour Jean');
    expect(r.lang).toBe('fr');
  });

  it('renvoie le template de quand lang=de demandée', () => {
    const r = renderTemplate(registry, 'greet', { name: 'Hans' }, 'de');
    expect(r.body).toBe('Hallo Hans');
    expect(r.lang).toBe('de');
  });

  it("fallback fr quand la langue demandée n'a pas de template", () => {
    const r = renderTemplate(registry, 'greet', { name: 'John' }, 'en');
    expect(r.body).toBe('Bonjour John');
    expect(r.lang).toBe('fr');
  });

  it("DEFAULT_SMS_LANG = 'fr'", () => {
    expect(DEFAULT_SMS_LANG).toBe('fr');
  });

  it('template absent même en fr → SmsError(template_not_found)', () => {
    expect(() => renderTemplate(registry, 'unknown-code', {})).toThrow(/non trouvé/);
  });
});

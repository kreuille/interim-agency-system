import type { ApiKeyProvider } from './mp-client.js';

/**
 * Provider à 2 clés (current + previous) avec grace period 7 jours pour
 * la rotation. Le serveur MP accepte les deux ; côté client, on émet
 * uniquement `currentKey`. Quand la rotation arrive (ex. tous les 90j),
 * la nouvelle clé devient `current` et l'ancienne devient `previous`
 * pour 7 jours puis est purgée.
 *
 * Stockage : Secret Manager (Infomaniak / Swisscom KMS) — DETTE-014/015.
 * En attendant, ce provider lit `MP_API_KEY` et `MP_API_KEY_PREVIOUS`
 * depuis l'env. Reload à chaud reporté à `cert-rotation.service.ts` (DETTE-025).
 */
export class EnvApiKeyProvider implements ApiKeyProvider {
  constructor(
    private readonly currentEnvKey = 'MP_API_KEY',
    private readonly previousEnvKey = 'MP_API_KEY_PREVIOUS',
  ) {}

  currentKey(): string {
    const value = process.env[this.currentEnvKey];
    if (!value || value.length === 0) {
      throw new Error(`${this.currentEnvKey} env var is not set`);
    }
    return value;
  }

  previousKey(): string | undefined {
    return process.env[this.previousEnvKey];
  }
}

/**
 * Pour tests : provider statique.
 */
export class StaticApiKeyProvider implements ApiKeyProvider {
  constructor(
    private readonly current: string,
    private readonly previous?: string,
  ) {}
  currentKey(): string {
    return this.current;
  }
  previousKey(): string | undefined {
    return this.previous;
  }
}

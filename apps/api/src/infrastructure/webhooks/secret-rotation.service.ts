import type { WebhookSecretBundle } from './hmac-verifier.js';

/**
 * Provider de secrets HMAC pour les webhooks entrants MovePlanner.
 *
 * En prod (post-DETTE-014/015), les secrets sont stockés dans le Secret
 * Manager (Infomaniak / Swisscom KMS) et rotés tous les 90 jours.
 * Pendant la rotation, on accepte deux versions simultanément (grace 7j) :
 * `current` (nouvelle clé) et `previous` (ancienne, à expirer après 7j).
 *
 * Cette interface permet de wirer plus tard un loader qui rafraîchit à
 * chaud (polling 60s sur Secret Manager). En attendant, on lit l'env.
 */
export interface WebhookSecretProvider {
  getSecrets(): WebhookSecretBundle;
}

export class EnvWebhookSecretProvider implements WebhookSecretProvider {
  constructor(
    private readonly currentEnvKey = 'MP_WEBHOOK_SECRET',
    private readonly previousEnvKey = 'MP_WEBHOOK_SECRET_PREVIOUS',
  ) {}

  getSecrets(): WebhookSecretBundle {
    const current = process.env[this.currentEnvKey];
    if (!current || current.length === 0) {
      throw new Error(`${this.currentEnvKey} env var is not set`);
    }
    const previous = process.env[this.previousEnvKey];
    if (previous && previous.length > 0) {
      return { current, previous };
    }
    return { current };
  }
}

export class StaticWebhookSecretProvider implements WebhookSecretProvider {
  constructor(private readonly bundle: WebhookSecretBundle) {}
  getSecrets(): WebhookSecretBundle {
    return this.bundle;
  }
}

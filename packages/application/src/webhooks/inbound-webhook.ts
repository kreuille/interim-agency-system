import type { AgencyId } from '@interim/domain';

/**
 * Persistance idempotente des événements webhook MovePlanner entrants.
 *
 * Scénario : MP retry envoie 2× le même event (bug réseau ou notre 5xx).
 * Le `eventId` MP étant unique, l'INSERT échoue silencieusement la 2e
 * fois (ON CONFLICT DO NOTHING) et le worker ne traite qu'une seule
 * fois. C'est le pattern idempotency consumer-side.
 *
 * Statuts (alignés enum Prisma `InboundWebhookStatus`) :
 *  - PENDING            : reçu, en attente de dispatch
 *  - PROCESSING         : claim worker en cours
 *  - PROCESSED          : handler ok
 *  - FAILED             : handler a throw, retry programmé
 *  - SKIPPED_DUPLICATE  : INSERT skip car déjà persisté (debug)
 *
 * Le statut "dead" du prompt est implémenté côté drain :
 * `retryCount >= MAX_ATTEMPTS` + status `FAILED` → quasi-dead, alert.
 */

export type InboundWebhookStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'FAILED'
  | 'SKIPPED_DUPLICATE';

export interface InboundWebhookEventRecord {
  readonly id: string;
  readonly agencyId: AgencyId;
  readonly eventId: string; // ID externe MP, unique
  readonly eventType: string;
  readonly signature: string;
  readonly receivedAt: Date;
  readonly processedAt: Date | undefined;
  readonly status: InboundWebhookStatus;
  readonly payload: unknown;
  readonly headers: Record<string, string>;
  readonly errorMessage: string | undefined;
  readonly retryCount: number;
}

/**
 * Backoff par tentative (en secondes). Index = `retryCount` AVANT
 * l'échec courant. Au-delà → "dead" conceptuellement (alerte +
 * arrêt des retries).
 */
export const INBOUND_BACKOFF_SECONDS: readonly number[] = [10, 30, 120, 300, 900] as const;

export const INBOUND_DEAD_AFTER_ATTEMPTS = INBOUND_BACKOFF_SECONDS.length;

export function nextInboundDelaySeconds(retryCount: number): number | undefined {
  if (retryCount >= INBOUND_DEAD_AFTER_ATTEMPTS) return undefined;
  return INBOUND_BACKOFF_SECONDS[retryCount];
}

export interface InsertInboundWebhookInput {
  readonly id: string;
  readonly agencyId: AgencyId;
  readonly eventId: string;
  readonly eventType: string;
  readonly signature: string;
  readonly payload: unknown;
  readonly headers: Record<string, string>;
  readonly receivedAt: Date;
}

export type InsertInboundResult =
  | { readonly inserted: true; readonly id: string }
  | { readonly inserted: false; readonly reason: 'duplicate' };

export interface InboundWebhookRepository {
  /**
   * INSERT idempotent par `eventId`. Si déjà existant, renvoie
   * `{ inserted: false, reason: 'duplicate' }` sans créer de doublon.
   */
  insertIfNew(input: InsertInboundWebhookInput): Promise<InsertInboundResult>;

  /**
   * Récupère un event par ID interne. Renvoie `undefined` si absent.
   */
  findById(id: string): Promise<InboundWebhookEventRecord | undefined>;

  /**
   * Marque PROCESSING (pour le worker qui va traiter).
   */
  markProcessing(id: string, now: Date): Promise<void>;

  /**
   * Marque PROCESSED (handler ok).
   */
  markProcessed(id: string, now: Date): Promise<void>;

  /**
   * Marque FAILED + incrément retryCount + stocke errorMessage.
   * Le scheduler (BullMQ delay) replanifie le retry.
   */
  markFailed(input: { id: string; errorMessage: string }): Promise<void>;
}

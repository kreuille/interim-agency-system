/**
 * Circuit breaker hand-rolled, paramétré façon opossum.
 *
 * **Choix** : nous évitons d'ajouter `opossum` comme dépendance pour
 * garder le bundle léger et la sémantique parfaitement testable.
 * `opossum` reste recommandé en production si on veut son écosystème
 * (events, fallback, metrics, etc.). Migration triviale :
 *   - `circuitBreaker.execute(fn)` ↔ `breaker.fire(...)`
 *   - événements `open`/`close`/`halfOpen` exposés pareils.
 *
 * Algorithme :
 *   - Fenêtre glissante de `rollingCountTimeoutMs` (défaut 30s) découpée
 *     en `rollingCountBuckets` buckets (défaut 10 → 3s par bucket).
 *   - Pour chaque appel : compteur `success` ou `failure` dans le bucket
 *     correspondant.
 *   - À chaque appel post-volume minimal : compute err% sur la fenêtre.
 *     Si > `errorThresholdPercentage` → `open`.
 *   - `open` : tous les appels rejetés avec `CircuitOpenError` pendant
 *     `resetTimeoutMs` (défaut 30s).
 *   - `half-open` : autorise UN appel d'essai. Succès → `closed`. Échec
 *     → `open` reset le timer.
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Nom (utile pour métriques / logs). */
  readonly name: string;
  /** Fenêtre de calcul de l'err%. Default 30s. */
  readonly rollingCountTimeoutMs?: number;
  /** Nombre de buckets dans la fenêtre. Default 10. */
  readonly rollingCountBuckets?: number;
  /** Seuil err% pour ouvrir le circuit. Default 50. */
  readonly errorThresholdPercentage?: number;
  /** Volume minimum d'appels avant d'évaluer err%. Default 5. */
  readonly volumeThreshold?: number;
  /** Durée open avant half-open. Default 30s. */
  readonly resetTimeoutMs?: number;
  /** Override clock pour tests. */
  readonly now?: () => number;
  /** Hook état changé (notifier Sentry/Prometheus). */
  readonly onStateChange?: (event: { name: string; from: CircuitState; to: CircuitState }) => void;
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit ${name} is open`);
    this.name = 'CircuitOpenError';
  }
}

interface Bucket {
  start: number;
  success: number;
  failure: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private buckets: Bucket[] = [];
  private openedAt: number | undefined;
  private readonly opts: Required<Omit<CircuitBreakerOptions, 'onStateChange'>> & {
    readonly onStateChange?: CircuitBreakerOptions['onStateChange'];
  };

  constructor(options: CircuitBreakerOptions) {
    this.opts = {
      name: options.name,
      rollingCountTimeoutMs: options.rollingCountTimeoutMs ?? 30_000,
      rollingCountBuckets: options.rollingCountBuckets ?? 10,
      errorThresholdPercentage: options.errorThresholdPercentage ?? 50,
      volumeThreshold: options.volumeThreshold ?? 5,
      resetTimeoutMs: options.resetTimeoutMs ?? 30_000,
      now: options.now ?? Date.now,
      ...(options.onStateChange ? { onStateChange: options.onStateChange } : {}),
    };
  }

  getState(): CircuitState {
    this.transitionToHalfOpenIfDue();
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.transitionToHalfOpenIfDue();
    if (this.state === 'open') {
      throw new CircuitOpenError(this.opts.name);
    }
    try {
      const value = await fn();
      this.recordSuccess();
      return value;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  private recordSuccess(): void {
    this.appendToBucket('success');
    if (this.state === 'half-open') {
      this.transition('closed');
      this.buckets = [];
    }
  }

  private recordFailure(): void {
    this.appendToBucket('failure');
    if (this.state === 'half-open') {
      this.transition('open');
      this.openedAt = this.opts.now();
      return;
    }
    const window = this.windowStats();
    if (
      window.total >= this.opts.volumeThreshold &&
      (window.failure / window.total) * 100 >= this.opts.errorThresholdPercentage
    ) {
      this.transition('open');
      this.openedAt = this.opts.now();
    }
  }

  private appendToBucket(kind: 'success' | 'failure'): void {
    const bucketSize = this.opts.rollingCountTimeoutMs / this.opts.rollingCountBuckets;
    const now = this.opts.now();
    this.gcBuckets(now);
    const last = this.buckets[this.buckets.length - 1];
    if (!last || now - last.start >= bucketSize) {
      this.buckets.push({ start: now, success: 0, failure: 0 });
    }
    const target = this.buckets[this.buckets.length - 1];
    if (target) target[kind] += 1;
  }

  private windowStats(): { success: number; failure: number; total: number } {
    const now = this.opts.now();
    this.gcBuckets(now);
    let success = 0;
    let failure = 0;
    for (const b of this.buckets) {
      success += b.success;
      failure += b.failure;
    }
    return { success, failure, total: success + failure };
  }

  private gcBuckets(now: number): void {
    const cutoff = now - this.opts.rollingCountTimeoutMs;
    this.buckets = this.buckets.filter((b) => b.start >= cutoff);
  }

  private transitionToHalfOpenIfDue(): void {
    if (this.state !== 'open' || this.openedAt === undefined) return;
    if (this.opts.now() - this.openedAt >= this.opts.resetTimeoutMs) {
      this.transition('half-open');
    }
  }

  private transition(to: CircuitState): void {
    if (this.state === to) return;
    const from = this.state;
    this.state = to;
    this.opts.onStateChange?.({ name: this.opts.name, from, to });
  }
}

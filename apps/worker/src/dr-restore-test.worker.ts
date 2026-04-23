import { spawn } from 'node:child_process';
import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';

export const DR_RESTORE_TEST_QUEUE_NAME = 'dr-restore-test';

/**
 * Cron : 1er du mois à 03:00 Europe/Zurich. Hors heures ouvrées et hors
 * batch paie hebdo (vendredi soir).
 */
export const DR_RESTORE_TEST_REPEAT_CRON = '0 3 1 * *';

export interface DrRestoreTestJob {
  /**
   * Path absolu vers le script `test-roundtrip.sh`. En prod = baked
   * dans l'image worker à `/opt/interim/ops/backup/test-roundtrip.sh`.
   * En dev/test = chemin relatif au repo.
   */
  readonly scriptPath: string;

  /** Variables d'env transmises au script (PG_*_HOST, AGE_*, etc.). */
  readonly env: Readonly<Record<string, string>>;

  /**
   * RTO budget en secondes. Au-delà, le job échoue et déclenche
   * `DrRestoreRtoBreached` (alerte P2 Alertmanager).
   * Default : 14400 (4 heures, conforme DoD A6.5).
   */
  readonly rtoBudgetSeconds?: number;
}

export interface DrRestoreTestResult {
  /** Durée totale du roundtrip (dump + transfer + restore + verify). */
  readonly durationSeconds: number;
  /** Rowcounts par table critique (parsés depuis le log JSON du script). */
  readonly rowCounts: Readonly<Record<string, number>>;
  /** Stdout du script (capture pour audit). */
  readonly stdoutTail: string;
  /** Si true, RTO budget respecté ; sinon RtoBreached à émettre. */
  readonly rtoRespected: boolean;
}

export class DrRestoreScriptFailed extends Error {
  constructor(
    public readonly exitCode: number,
    public readonly stderr: string,
  ) {
    super(`DR restore script failed (exit ${String(exitCode)})`);
    this.name = 'DrRestoreScriptFailed';
  }
}

export interface DrRestoreTestWorkerDeps {
  readonly connection: Redis;
  /**
   * Callback invoqué après chaque exécution. Côté infra, branche les
   * compteurs Prometheus :
   *   - `dr_restore_duration_seconds` (gauge, en seconds)
   *   - `dr_restore_rto_breaches_total` (counter)
   *   - `dr_restore_failures_total` (counter)
   */
  readonly onResult?: (result: DrRestoreTestResult) => void;
  /**
   * Hook injection pour les tests (override de child_process.spawn).
   * Default : `runScriptViaSpawn` (appel `bash <scriptPath>` réel).
   */
  readonly runScript?: (
    scriptPath: string,
    env: Record<string, string>,
  ) => Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }>;
  readonly concurrency?: number;
}

/**
 * Worker BullMQ qui exécute mensuellement le test E2E DR
 * (`ops/backup/test-roundtrip.sh`).
 *
 * Pattern identique à `ged-purge.worker.ts` : un job repeatable avec
 * cron, callback `onResult` pour publier les métriques, idempotent
 * (le script lui-même est idempotent — base cible `_dr_test`).
 *
 * Politique d'échec :
 * - Script exit != 0 → throw `DrRestoreScriptFailed` → BullMQ retry
 *   avec backoff exponentiel (3 tentatives max). Échec final = job
 *   en DLQ + alerte P1 (`dr_restore_failures_total` > 0 sur 24h).
 * - Script OK mais RTO dépassé → résultat marqué `rtoRespected=false`
 *   et alerte P2 (incrément `dr_restore_rto_breaches_total`).
 */
export function createDrRestoreTestWorker(deps: DrRestoreTestWorkerDeps): Worker<DrRestoreTestJob> {
  const runScript = deps.runScript ?? runScriptViaSpawn;
  return new Worker<DrRestoreTestJob>(
    DR_RESTORE_TEST_QUEUE_NAME,
    async (job: Job<DrRestoreTestJob>) => {
      const rtoBudget = job.data.rtoBudgetSeconds ?? 14400;
      const startedAt = Date.now();

      const { exitCode, stdout, stderr } = await runScript(job.data.scriptPath, {
        ...job.data.env,
        RTO_BUDGET_SECONDS: String(rtoBudget),
      });

      if (exitCode !== 0) {
        throw new DrRestoreScriptFailed(exitCode, stderr.slice(-2000));
      }

      const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
      const rowCounts = parseRowCounts(stdout);
      const result: DrRestoreTestResult = {
        durationSeconds,
        rowCounts,
        stdoutTail: stdout.slice(-2000),
        rtoRespected: durationSeconds <= rtoBudget,
      };
      deps.onResult?.(result);
      return result;
    },
    {
      connection: deps.connection,
      concurrency: deps.concurrency ?? 1,
    },
  );
}

/**
 * Parse la dernière ligne JSON émise par le script (event=dr_roundtrip.completed)
 * pour extraire les rowcounts.
 *
 * Format attendu :
 *   {"event":"dr_roundtrip.completed","durationSeconds":847,"rtoBudgetSeconds":14400,"rowCounts":{"temp_workers":42,...}}
 *
 * Si parse fail (script silencieux, json mal formé), renvoie {} — pas
 * un crash. Les rowcounts servent au monitoring, pas au flux de contrôle.
 */
export function parseRowCounts(stdout: string): Readonly<Record<string, number>> {
  const lines = stdout.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim() ?? '';
    if (line.length === 0 || !line.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(line) as { event?: string; rowCounts?: Record<string, number> };
      if (parsed.event === 'dr_roundtrip.completed' && parsed.rowCounts) {
        return parsed.rowCounts;
      }
    } catch {
      // ligne JSON malformée — ignorer et continuer
    }
  }
  return {};
}

/**
 * Adapter par défaut : `bash <scriptPath>` via child_process.spawn.
 * Capture stdout + stderr en complet (timeout 5h pour ne pas tuer un
 * restore légitime un peu lent).
 */
function runScriptViaSpawn(
  scriptPath: string,
  env: Record<string, string>,
): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn('bash', [scriptPath], {
      env: { ...process.env, ...env },
      timeout: 5 * 60 * 60 * 1000, // 5h
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    proc.on('close', (code) => {
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });
  });
}

import { randomUUID } from 'node:crypto';
import { SystemClock } from '@interim/shared';
import {
  AddSlotUseCase,
  ArchiveDocumentUseCase,
  ArchiveWorkerUseCase,
  GetDownloadUrlUseCase,
  GetWeekAvailabilityUseCase,
  GetWorkerUseCase,
  InMemoryAvailabilityEventPublisher,
  InMemoryDocumentAuditLogger,
  InMemoryObjectStorage,
  ListDocumentsUseCase,
  ListWorkersUseCase,
  RecordingScanQueue,
  RegisterWorkerUseCase,
  RemoveSlotUseCase,
  UpdateWorkerUseCase,
  UploadDocumentUseCase,
  ValidateDocumentUseCase,
} from '@interim/application';

import { createApp, type AppDeps } from './app.js';
import { PrismaAuditLogger } from './infrastructure/audit/prisma-audit-logger.js';
import { DevTokenVerifier } from './infrastructure/auth/dev-token-verifier.js';
import { getFirebaseAuth } from './infrastructure/auth/firebase-admin.js';
import { FirebaseTokenVerifier } from './infrastructure/auth/firebase-verifier.js';
import { createPrismaClient } from './infrastructure/db/prisma.js';
import { NoOpOcrExtractor } from './infrastructure/ocr/noop-ocr.js';
import { getDefaultLogger } from './infrastructure/observability/logger.js';
import { createSentryReporter } from './infrastructure/observability/sentry.js';
import { PrismaIdempotencyStore } from './infrastructure/persistence/prisma/idempotency.store.js';
import { PrismaWorkerAvailabilityRepository } from './infrastructure/persistence/prisma/worker-availability.repository.js';
import { PrismaWorkerDocumentRepository } from './infrastructure/persistence/prisma/worker-document.repository.js';
import { PrismaWorkerRepository } from './infrastructure/persistence/prisma/worker.repository.js';
import type { TokenVerifier } from './shared/middleware/auth.middleware.js';

const logger = getDefaultLogger();
const port = Number(process.env.PORT ?? 3000);

// Sentry init (no-op si SENTRY_DSN absent — voir `sentry.ts`). Doit être
// appelé tôt pour intercepter les erreurs du bootstrap.
createSentryReporter({
  release: process.env.VERSION,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
});

/**
 * Composition DI — câblage minimal viable (DETTE-014).
 *
 * Scope actuel : workers + documents + availability (routes publiques
 * `/api/v1/*`). Les optionnels `proposals`, `timesheets`, `ged`, `webhooks`
 * seront câblés dans une PR suivante quand le wiring BullMQ / Redis sera
 * prêt (DETTE-015).
 *
 * Mode d'authentification contrôlé par `AUTH_MODE` :
 *  - `dev`     : `DevTokenVerifier` — accepte n'importe quel Bearer token,
 *                retourne agency_admin sur la 1ère agence. **Preview only.**
 *  - `firebase`: `FirebaseTokenVerifier` — vrai check Firebase Admin SDK.
 *                Exige `FIREBASE_PROJECT_ID` + service account via ADC.
 *
 * Impls in-memory pour preview (storage, scan queue, audit docs, publisher) :
 * les documents uploadés sont perdus au redeploy, les events availability
 * ne sont pas propagés à MovePlanner. **À remplacer** par GCS + BullMQ + MP
 * adapter quand on sort du mode preview.
 */
function buildTokenVerifier(prisma: ReturnType<typeof createPrismaClient>): TokenVerifier {
  const mode = process.env.AUTH_MODE ?? 'firebase';

  if (mode === 'dev') {
    logger.warn(
      { authMode: 'dev' },
      "AUTH_MODE=dev active — DevTokenVerifier accepte n'importe quel token. NE JAMAIS utiliser en prod.",
    );
    return new DevTokenVerifier(prisma, {
      ...(process.env.DEV_AGENCY_ID !== undefined ? { agencyId: process.env.DEV_AGENCY_ID } : {}),
    });
  }

  if (mode !== 'firebase') {
    throw new Error(`AUTH_MODE='${mode}' invalide — valeurs acceptées : 'dev' | 'firebase'.`);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      'AUTH_MODE=firebase mais FIREBASE_PROJECT_ID manquant. Définir la variable ou basculer AUTH_MODE=dev en preview.',
    );
  }

  return new FirebaseTokenVerifier(
    getFirebaseAuth({
      projectId,
      ...(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH !== undefined
        ? { serviceAccountJsonPath: process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH }
        : {}),
    }),
  );
}

function buildDeps(): AppDeps {
  const prisma = createPrismaClient();
  const clock = new SystemClock();
  const idFactory: () => string = () => randomUUID();

  // ---- Workers ----
  const workerRepo = new PrismaWorkerRepository(prisma);
  const workerAudit = new PrismaAuditLogger(prisma);

  // ---- Documents (in-memory pour preview — cf. commentaire en tête) ----
  const docRepo = new PrismaWorkerDocumentRepository(prisma);
  const docStorage = new InMemoryObjectStorage();
  const docScanQueue = new RecordingScanQueue();
  const docOcr = new NoOpOcrExtractor();
  const docAudit = new InMemoryDocumentAuditLogger();

  // ---- Availability (publisher in-memory — pas d'envoi MP) ----
  const availRepo = new PrismaWorkerAvailabilityRepository(prisma);
  const availPublisher = new InMemoryAvailabilityEventPublisher();

  // ---- Idempotency store (Prisma-backed, table idempotency_keys) ----
  const idempotencyStore = new PrismaIdempotencyStore(prisma);

  const tokenVerifier = buildTokenVerifier(prisma);

  return {
    tokenVerifier,
    idempotencyStore,
    workers: {
      register: new RegisterWorkerUseCase(workerRepo, workerAudit, clock, idFactory),
      update: new UpdateWorkerUseCase(workerRepo, workerAudit, clock),
      archive: new ArchiveWorkerUseCase(workerRepo, workerAudit, clock),
      get: new GetWorkerUseCase(workerRepo),
      list: new ListWorkersUseCase(workerRepo),
    },
    documents: {
      upload: new UploadDocumentUseCase(
        workerRepo,
        docRepo,
        docStorage,
        docScanQueue,
        docOcr,
        docAudit,
        clock,
        idFactory,
      ),
      validate: new ValidateDocumentUseCase(docRepo, docAudit, clock),
      archive: new ArchiveDocumentUseCase(docRepo, docStorage, docAudit, clock),
      list: new ListDocumentsUseCase(docRepo),
      getUrl: new GetDownloadUrlUseCase(docRepo, docStorage),
    },
    availability: {
      add: new AddSlotUseCase(availRepo, availPublisher, clock, idFactory),
      remove: new RemoveSlotUseCase(availRepo, availPublisher, clock),
      getWeek: new GetWeekAvailabilityUseCase(availRepo, clock),
    },
  };
}

const deps = buildDeps();
const app = createApp(deps);

app.listen(port, () => {
  logger.info(
    {
      port,
      version: process.env.VERSION ?? '0.0.0',
      authMode: process.env.AUTH_MODE ?? 'firebase',
      nodeEnv: process.env.NODE_ENV ?? 'development',
    },
    'api listening',
  );
});

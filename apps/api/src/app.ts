import express, { type Express, type Request, type Response } from 'express';
import { pinoHttp } from 'pino-http';
import type {
  AcceptOnBehalfUseCase,
  AddSlotUseCase,
  ArchiveDocumentUseCase,
  ArchiveWorkerUseCase,
  AssignRoutingModeUseCase,
  DisputeTimesheetUseCase,
  GetArchiveDownloadUrlUseCase,
  GetDownloadUrlUseCase,
  GetWeekAvailabilityUseCase,
  GetWorkerUseCase,
  ListDocumentsUseCase,
  ListWorkersUseCase,
  RefuseOnBehalfUseCase,
  RegisterWorkerUseCase,
  RemoveSlotUseCase,
  SignTimesheetUseCase,
  UpdateWorkerUseCase,
  UploadDocumentUseCase,
  ValidateDocumentUseCase,
} from '@interim/application';
import type {
  LegalArchiveRepository,
  MissionProposalRepository,
  TimesheetRepository,
} from '@interim/domain';
import { createAuthMiddleware, type TokenVerifier } from './shared/middleware/auth.middleware.js';
import { tenantMiddleware } from './shared/middleware/tenant.middleware.js';
import { requestIdMiddleware } from './shared/middleware/request-id.middleware.js';
import {
  createIdempotencyMiddleware,
  type IdempotencyStore,
} from './shared/middleware/idempotency.middleware.js';
import { getDefaultLogger } from './infrastructure/observability/logger.js';
import { createWorkersRouter } from './infrastructure/http/controllers/workers.controller.js';
import { createWorkerDocumentsRouter } from './infrastructure/http/controllers/worker-documents.controller.js';
import { createAvailabilityRouter } from './infrastructure/http/controllers/availability.controller.js';
import { createProposalsRouter } from './infrastructure/http/controllers/proposals.controller.js';
import { createTimesheetsRouter } from './infrastructure/http/controllers/timesheets.controller.js';
import { createGedRouter } from './infrastructure/http/controllers/ged.controller.js';
import { metricsRegistry } from './infrastructure/observability/metrics.js';
import {
  createMoveplannerWebhookRouter,
  type MoveplannerWebhookHandler,
} from './infrastructure/webhooks/moveplanner-webhook.controller.js';
import type { WebhookSecretProvider } from './infrastructure/webhooks/secret-rotation.service.js';

export interface AppDeps {
  readonly tokenVerifier: TokenVerifier;
  readonly idempotencyStore: IdempotencyStore;
  readonly workers: {
    readonly register: RegisterWorkerUseCase;
    readonly update: UpdateWorkerUseCase;
    readonly archive: ArchiveWorkerUseCase;
    readonly get: GetWorkerUseCase;
    readonly list: ListWorkersUseCase;
  };
  readonly documents: {
    readonly upload: UploadDocumentUseCase;
    readonly validate: ValidateDocumentUseCase;
    readonly archive: ArchiveDocumentUseCase;
    readonly list: ListDocumentsUseCase;
    readonly getUrl: GetDownloadUrlUseCase;
  };
  readonly availability: {
    readonly add: AddSlotUseCase;
    readonly remove: RemoveSlotUseCase;
    readonly getWeek: GetWeekAvailabilityUseCase;
  };
  readonly proposals?: {
    readonly repo: MissionProposalRepository;
    readonly assignRouting: AssignRoutingModeUseCase;
    readonly accept: AcceptOnBehalfUseCase;
    readonly refuse: RefuseOnBehalfUseCase;
  };
  readonly timesheets?: {
    readonly repo: TimesheetRepository;
    readonly sign: SignTimesheetUseCase;
    readonly dispute: DisputeTimesheetUseCase;
  };
  readonly ged?: {
    readonly repo: LegalArchiveRepository;
    readonly getDownloadUrl: GetArchiveDownloadUrlUseCase;
  };
  readonly webhooks?: {
    readonly secrets: WebhookSecretProvider;
    readonly handler: MoveplannerWebhookHandler;
  };
}

export function createApp(deps?: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  // Correlation-id sur TOUTES les requêtes (avant logger pour qu'il puisse
  // l'inclure dans chaque ligne).
  app.use(requestIdMiddleware);

  // Logger pino-http : 1 ligne par requête HTTP terminée, format JSON,
  // PII redactée par la config du logger (cf. `infrastructure/observability/logger.ts`).
  // Désactivé en test (NODE_ENV=test) pour ne pas polluer la sortie vitest.
  if (process.env.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger: getDefaultLogger(),
        // Propage le request-id (posé par requestIdMiddleware) au lieu de
        // laisser pino-http en générer un nouveau.
        genReqId: (req) => {
          const id = (req as { id?: string }).id;
          return id ?? 'unknown';
        },
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
        // Désactive la signature par défaut (trop verbeuse) — on garde le minimum utile.
        serializers: {
          req: (req: { method: string; url: string; id?: string }) => ({
            method: req.method,
            url: req.url,
            id: req.id,
          }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
      }),
    );
  }

  // IMPORTANT : monter le router webhook AVANT `express.json()` pour
  // préserver les bytes raw du body (HMAC computed over raw bytes).
  // Le router utilise son propre `express.raw({ type: 'application/json' })`
  // sur ses routes POST.
  if (deps?.webhooks) {
    app.use('/webhooks/moveplanner', createMoveplannerWebhookRouter(deps.webhooks));
  }

  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      version: process.env.VERSION ?? '0.0.0',
    });
  });

  // Prometheus scraping endpoint (pas sous /api/v1 — accessible sans auth
  // car scrapé par le side-car Prometheus du pod, via réseau privé).
  app.get('/metrics', (_req: Request, res: Response) => {
    res.set('content-type', metricsRegistry.contentType);
    metricsRegistry
      .metrics()
      .then((m) => res.status(200).send(m))
      .catch(() => res.status(500).send('metrics_error'));
  });

  if (deps) {
    app.use('/api/v1', (req, res, next) => {
      void createAuthMiddleware(deps.tokenVerifier)(req, res, next);
    });
    app.use('/api/v1', tenantMiddleware);
    app.use('/api/v1', (req, res, next) => {
      void createIdempotencyMiddleware({ store: deps.idempotencyStore })(req, res, next);
    });
    app.use('/api/v1/workers', createWorkersRouter(deps.workers));
    app.use('/api/v1/workers/:id/documents', createWorkerDocumentsRouter(deps.documents));
    app.use('/api/v1/workers/:id/availability', createAvailabilityRouter(deps.availability));
    if (deps.proposals) {
      app.use('/api/v1/proposals', createProposalsRouter(deps.proposals));
    }
    if (deps.timesheets) {
      app.use(
        '/api/v1/timesheets',
        createTimesheetsRouter({
          repo: deps.timesheets.repo,
          signUseCase: deps.timesheets.sign,
          disputeUseCase: deps.timesheets.dispute,
        }),
      );
    }
    if (deps.ged) {
      app.use(
        '/api/v1/ged',
        createGedRouter({
          repo: deps.ged.repo,
          getDownloadUrl: deps.ged.getDownloadUrl,
        }),
      );
    }
  }

  return app;
}

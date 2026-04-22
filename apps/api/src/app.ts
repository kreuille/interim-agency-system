import express, { type Express, type Request, type Response } from 'express';
import type {
  AcceptOnBehalfUseCase,
  AddSlotUseCase,
  ArchiveDocumentUseCase,
  ArchiveWorkerUseCase,
  AssignRoutingModeUseCase,
  GetDownloadUrlUseCase,
  GetWeekAvailabilityUseCase,
  GetWorkerUseCase,
  ListDocumentsUseCase,
  ListWorkersUseCase,
  RefuseOnBehalfUseCase,
  RegisterWorkerUseCase,
  RemoveSlotUseCase,
  UpdateWorkerUseCase,
  UploadDocumentUseCase,
  ValidateDocumentUseCase,
} from '@interim/application';
import type { MissionProposalRepository } from '@interim/domain';
import { createAuthMiddleware, type TokenVerifier } from './shared/middleware/auth.middleware.js';
import { tenantMiddleware } from './shared/middleware/tenant.middleware.js';
import {
  createIdempotencyMiddleware,
  type IdempotencyStore,
} from './shared/middleware/idempotency.middleware.js';
import { createWorkersRouter } from './infrastructure/http/controllers/workers.controller.js';
import { createWorkerDocumentsRouter } from './infrastructure/http/controllers/worker-documents.controller.js';
import { createAvailabilityRouter } from './infrastructure/http/controllers/availability.controller.js';
import { createProposalsRouter } from './infrastructure/http/controllers/proposals.controller.js';
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
  readonly webhooks?: {
    readonly secrets: WebhookSecretProvider;
    readonly handler: MoveplannerWebhookHandler;
  };
}

export function createApp(deps?: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');

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
  }

  return app;
}

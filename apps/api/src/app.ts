import express, { type Express, type Request, type Response } from 'express';
import type {
  ArchiveDocumentUseCase,
  ArchiveWorkerUseCase,
  GetDownloadUrlUseCase,
  GetWorkerUseCase,
  ListDocumentsUseCase,
  ListWorkersUseCase,
  RegisterWorkerUseCase,
  UpdateWorkerUseCase,
  UploadDocumentUseCase,
  ValidateDocumentUseCase,
} from '@interim/application';
import { createAuthMiddleware, type TokenVerifier } from './shared/middleware/auth.middleware.js';
import { tenantMiddleware } from './shared/middleware/tenant.middleware.js';
import {
  createIdempotencyMiddleware,
  type IdempotencyStore,
} from './shared/middleware/idempotency.middleware.js';
import { createWorkersRouter } from './infrastructure/http/controllers/workers.controller.js';
import { createWorkerDocumentsRouter } from './infrastructure/http/controllers/worker-documents.controller.js';

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
}

export function createApp(deps?: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
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
  }

  return app;
}

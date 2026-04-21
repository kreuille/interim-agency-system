import express, { type Express, type Request, type Response } from 'express';
import type {
  ArchiveWorkerUseCase,
  GetWorkerUseCase,
  ListWorkersUseCase,
  RegisterWorkerUseCase,
  UpdateWorkerUseCase,
} from '@interim/application';
import { createAuthMiddleware, type TokenVerifier } from './shared/middleware/auth.middleware.js';
import { tenantMiddleware } from './shared/middleware/tenant.middleware.js';
import { createWorkersRouter } from './infrastructure/http/controllers/workers.controller.js';

export interface AppDeps {
  readonly tokenVerifier: TokenVerifier;
  readonly workers: {
    readonly register: RegisterWorkerUseCase;
    readonly update: UpdateWorkerUseCase;
    readonly archive: ArchiveWorkerUseCase;
    readonly get: GetWorkerUseCase;
    readonly list: ListWorkersUseCase;
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
    app.use('/api/v1/workers', createWorkersRouter(deps.workers));
  }

  return app;
}

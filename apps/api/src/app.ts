import express, { type Express, type Request, type Response } from 'express';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      version: process.env.VERSION ?? '0.0.0',
    });
  });

  return app;
}

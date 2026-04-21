import express, { type Express, type Request, type Response } from 'express';
import { signWebhookPayload } from './hmac.js';

export interface MockConfig {
  hmacSecret: string;
  apiWebhookUrl: string;
}

export function createMockApp(config: MockConfig): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'mock-moveplanner' });
  });

  app.post('/api/v1/partners/:partnerId/workers', (req: Request, res: Response) => {
    const echo: unknown = req.body;
    res.status(200).json({ accepted: true, staffId: `mock-${String(Date.now())}`, echo });
  });

  app.post(
    '/api/v1/partners/:partnerId/workers/:staffId/availability',
    (req: Request, res: Response) => {
      const body: unknown = req.body;
      const slots =
        typeof body === 'object' && body !== null && 'slots' in body
          ? (body as { slots?: unknown }).slots
          : undefined;
      const count = Array.isArray(slots) ? slots.length : 0;
      res.status(200).json({ accepted: count, rejected: 0 });
    },
  );

  app.post('/api/v1/partners/:partnerId/assignments/:requestId/response', (_req, res: Response) => {
    res.status(200).json({ recorded: true });
  });

  app.post('/api/v1/partners/:partnerId/timesheets/:timesheetId/sign', (_req, res: Response) => {
    res.status(200).json({ signed: true, signedAt: new Date().toISOString() });
  });

  app.get('/api/v1/partners/:partnerId/timesheets', (_req, res: Response) => {
    res.status(200).json({
      data: [
        {
          id: 'ts-mock-1',
          staffId: 'mock-staff-1',
          weekIso: '2026-W19',
          hours: [
            { day: 'mon', start: '08:00', end: '17:00', breakMinutes: 30 },
            { day: 'tue', start: '08:00', end: '17:00', breakMinutes: 30 },
          ],
          status: 'ready_for_signature',
        },
      ],
    });
  });

  app.post('/_mock/emit-webhook', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { event?: string; payload?: unknown };
    const signed = signWebhookPayload(config.hmacSecret, body.payload ?? {});
    fetch(config.apiWebhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-moveplanner-event-id': signed.eventId,
        'x-moveplanner-timestamp': signed.timestamp,
        'x-moveplanner-signature': `sha256=${signed.signature}`,
        'x-moveplanner-event-type': body.event ?? 'unknown',
      },
      body: signed.body,
    })
      .then((response) => {
        res.status(200).json({ dispatched: true, apiStatus: response.status });
      })
      .catch((error: unknown) => {
        res.status(502).json({
          dispatched: false,
          error: error instanceof Error ? error.message : 'unknown',
        });
      });
  });

  return app;
}

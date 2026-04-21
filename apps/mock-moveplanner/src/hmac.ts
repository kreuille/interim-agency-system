import { createHmac, randomUUID } from 'node:crypto';

export interface SignedPayload {
  eventId: string;
  timestamp: string;
  signature: string;
  body: string;
}

export function signWebhookPayload(secret: string, body: unknown): SignedPayload {
  const eventId = randomUUID();
  const timestamp = new Date().toISOString();
  const serialized = JSON.stringify(body);
  const payload = `${eventId}.${timestamp}.${serialized}`;
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return { eventId, timestamp, signature, body: serialized };
}

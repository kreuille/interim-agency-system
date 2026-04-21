import { createMockApp } from './app.js';

const port = Number(process.env.PORT ?? 3030);
const app = createMockApp({
  hmacSecret: process.env.MOCK_HMAC_SECRET ?? 'dev-mock-secret',
  apiWebhookUrl:
    process.env.API_WEBHOOK_URL ?? 'http://host.docker.internal:3000/webhooks/moveplanner',
});

app.listen(port, () => {
  console.log(`[mock-moveplanner] listening on http://localhost:${String(port)}`);
});

import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, LegalArchiveEntry } from '@interim/domain';
import {
  GetArchiveDownloadUrlUseCase,
  InMemoryLegalArchiveAccessLogger,
  InMemoryLegalArchiveRepository,
  InMemoryLegalArchiveStorage,
} from '@interim/application';
import { tenantMiddleware } from '../../../shared/middleware/tenant.middleware.js';
import { createGedRouter } from './ged.controller.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);
const AGENCY = 'agency-a';

async function setup(opts: { user?: { agencyId: string; userId: string; role: string } } = {}) {
  const repo = new InMemoryLegalArchiveRepository();
  const storage = new InMemoryLegalArchiveStorage();
  const logger = new InMemoryLegalArchiveAccessLogger();
  const getDownloadUrl = new GetArchiveDownloadUrlUseCase(repo, storage, logger, clock);

  const put = await storage.putImmutable({
    agencyId: asAgencyId(AGENCY),
    category: 'mission_contract',
    referenceEntityType: 'MissionContract',
    referenceEntityId: 'mc-1',
    bytes: new TextEncoder().encode('pdf-bytes'),
    mimeType: 'application/pdf',
    retentionUntil: new Date('2036-04-22T08:00:00Z'),
  });
  const entry = LegalArchiveEntry.create({
    id: 'arc-1',
    agencyId: asAgencyId(AGENCY),
    category: 'mission_contract',
    referenceEntityType: 'MissionContract',
    referenceEntityId: 'mc-1',
    storageKey: put.storageKey,
    sha256Hex: put.sha256Hex,
    sizeBytes: put.sizeBytes,
    mimeType: 'application/pdf',
    archivedAt: NOW,
  });
  await repo.insert(entry);

  const app = express();
  app.use(express.json());
  const u = opts.user ?? { agencyId: AGENCY, userId: 'auditor-1', role: 'auditor' };
  app.use((req, _res, next) => {
    req.user = { agencyId: u.agencyId, userId: u.userId, role: u.role };
    next();
  });
  app.use(tenantMiddleware);
  app.use('/api/v1/ged', createGedRouter({ repo, getDownloadUrl }));
  return { app, repo, logger };
}

describe('ged.controller', () => {
  it('GET /archives/:id/download (auditor) → 200 + URL signée + log accès', async () => {
    const { app, logger } = await setup();
    const res = await request(app).get('/api/v1/ged/archives/arc-1/download?purpose=seco_audit');
    expect(res.status).toBe(200);
    expect((res.body as { url: string }).url).toMatch(/ged\.test\/signed/);
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]?.purpose).toBe('seco_audit');
    expect(logger.entries[0]?.actorUserId).toBe('auditor-1');
  });

  it('GET /archives/:id/download (dispatcher sans compliance:export) → 403', async () => {
    const { app } = await setup({
      user: { agencyId: AGENCY, userId: 'd', role: 'dispatcher' },
    });
    const res = await request(app).get('/api/v1/ged/archives/arc-1/download');
    expect(res.status).toBe(403);
  });

  it('GET /archives/inconnu/download → 404', async () => {
    const { app } = await setup();
    const res = await request(app).get('/api/v1/ged/archives/unknown/download');
    expect(res.status).toBe(404);
  });

  it('GET /archives?entityType=&entityId= → liste', async () => {
    const { app } = await setup();
    const res = await request(app).get(
      '/api/v1/ged/archives?entityType=MissionContract&entityId=mc-1',
    );
    expect(res.status).toBe(200);
    expect((res.body as { items: unknown[] }).items).toHaveLength(1);
  });

  it('GET /archives sans entityType → 400 (filtre obligatoire MVP)', async () => {
    const { app } = await setup();
    const res = await request(app).get('/api/v1/ged/archives');
    expect(res.status).toBe(400);
  });

  it('TTL custom respecté (15min default, 60s min, 3600s max)', async () => {
    const { app } = await setup();
    const res = await request(app).get('/api/v1/ged/archives/arc-1/download?ttlSeconds=120');
    expect(res.status).toBe(200);
    const body = res.body as { expiresAt: string };
    const expected = new Date(NOW.getTime() + 120 * 1000).toISOString();
    expect(body.expiresAt).toBe(expected);
  });

  it('multi-tenant : autre agencyId → 404', async () => {
    const { app } = await setup({
      user: { agencyId: 'agency-b', userId: 'a', role: 'auditor' },
    });
    const res = await request(app).get('/api/v1/ged/archives/arc-1/download');
    expect(res.status).toBe(404);
  });
});

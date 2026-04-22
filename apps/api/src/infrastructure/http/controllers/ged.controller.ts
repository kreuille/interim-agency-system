import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  canAccess,
  LEGAL_CATEGORIES,
  type LegalArchiveRepository,
  type Role,
} from '@interim/domain';
import { ACCESS_PURPOSES, type GetArchiveDownloadUrlUseCase } from '@interim/application';

/**
 * REST endpoints pour la GED légale (A4.4).
 *
 *   GET  /api/v1/ged/archives/:id/download  → URL signée 15min + log accès nLPD art. 12
 *   GET  /api/v1/ged/archives?category=&entityType=&entityId=  → liste pour audit/DPO
 *
 * RBAC : `compliance:export` requis (juriste/DPO/auditor uniquement).
 * Closes DETTE-050.
 */

export interface GedControllerDeps {
  readonly repo: LegalArchiveRepository;
  readonly getDownloadUrl: GetArchiveDownloadUrlUseCase;
}

const DownloadQuerySchema = z.object({
  purpose: z.enum(ACCESS_PURPOSES).default('internal_review'),
  ttlSeconds: z.coerce.number().int().min(60).max(3600).optional(),
});

const ListQuerySchema = z.object({
  category: z.enum(LEGAL_CATEGORIES).optional(),
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
});

export function createGedRouter(deps: GedControllerDeps): Router {
  const router = Router();
  router.get('/archives', (req, res) => {
    void handleList(req, res, deps);
  });
  router.get('/archives/:id/download', (req, res) => {
    void handleDownload(req, res, deps);
  });
  return router;
}

interface AuthContext {
  readonly agencyId: string;
  readonly actorId: string;
  readonly role: Role;
}

function requireRole(
  req: Request,
  res: Response,
  action: Parameters<typeof canAccess>[1],
): AuthContext | undefined {
  const user = req.user;
  if (!user?.agencyId || !user.userId || !user.role) {
    res.status(401).json({ error: 'unauthenticated' });
    return undefined;
  }
  if (!canAccess(user.role as Role, action)) {
    res.status(403).json({ error: 'forbidden' });
    return undefined;
  }
  return { agencyId: user.agencyId, actorId: user.userId, role: user.role as Role };
}

async function handleDownload(req: Request, res: Response, deps: GedControllerDeps): Promise<void> {
  const ctx = requireRole(req, res, 'compliance:export');
  if (!ctx) return;
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'missing_id' });
    return;
  }
  const parsed = DownloadQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', issues: parsed.error.issues });
    return;
  }
  const result = await deps.getDownloadUrl.execute({
    agencyId: ctx.agencyId as never,
    archiveEntryId: id,
    actorUserId: ctx.actorId,
    ...(req.ip ? { actorIp: req.ip } : {}),
    purpose: parsed.data.purpose,
    ...(parsed.data.ttlSeconds !== undefined ? { ttlSeconds: parsed.data.ttlSeconds } : {}),
  });
  if (!result.ok) {
    if (result.error.kind === 'archive_not_found') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.status(502).json({ error: 'storage_failed', message: result.error.message });
    return;
  }
  res.status(200).json({
    url: result.value.url,
    expiresAt: result.value.expiresAt.toISOString(),
    sha256Hex: result.value.sha256Hex,
  });
}

async function handleList(req: Request, res: Response, deps: GedControllerDeps): Promise<void> {
  const ctx = requireRole(req, res, 'compliance:export');
  if (!ctx) return;
  const parsed = ListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', issues: parsed.error.issues });
    return;
  }
  // Pour MVP : on n'expose que findByReference (besoin du couple
  // entityType+entityId pour scope). Pour audit DPO global, DETTE-060.
  if (!parsed.data.entityType || !parsed.data.entityId) {
    res
      .status(400)
      .json({ error: 'missing_filter', message: 'entityType + entityId required (DETTE-060)' });
    return;
  }
  const entries = await deps.repo.findByReference(
    ctx.agencyId as never,
    parsed.data.entityType,
    parsed.data.entityId,
  );
  const filtered =
    parsed.data.category !== undefined
      ? entries.filter((e) => e.category === parsed.data.category)
      : entries;
  res.status(200).json({
    items: filtered.map((e) => {
      const s = e.toSnapshot();
      return {
        id: s.id,
        category: s.category,
        referenceEntityType: s.referenceEntityType,
        referenceEntityId: s.referenceEntityId,
        sha256Hex: s.sha256Hex,
        sizeBytes: s.sizeBytes,
        mimeType: s.mimeType,
        archivedAt: s.archivedAt.toISOString(),
        retentionUntil: s.retentionUntil.toISOString(),
        metadata: s.metadata,
      };
    }),
  });
}

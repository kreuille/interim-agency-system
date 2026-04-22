import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  asMissionProposalId,
  canAccess,
  PROPOSAL_ROUTING_MODES,
  PROPOSAL_STATES,
  type MissionProposal,
  type MissionProposalRepository,
  type Role,
} from '@interim/domain';
import {
  ProposalNotFound,
  REFUSAL_REASONS,
  type AcceptOnBehalfUseCase,
  type AssignRoutingModeUseCase,
  type RefuseOnBehalfUseCase,
} from '@interim/application';

/**
 * REST endpoints pour le dashboard agence.
 *
 *   GET  /api/v1/proposals?state=...      → liste paginée
 *   GET  /api/v1/proposals/:id            → détail
 *   POST /api/v1/proposals/:id/routing    → assigne pass_through | agency_controlled
 *   POST /api/v1/proposals/:id/accept     → accept on behalf (action manuelle agence)
 *   POST /api/v1/proposals/:id/refuse     → refuse on behalf
 *
 * RBAC : `proposal:read` pour GET, `proposal:write` pour mutations.
 * (Actions ajoutées à `Role` côté domaine si pas encore définies — voir
 * `packages/domain/src/auth/role.ts`.)
 */

export interface ProposalsControllerDeps {
  readonly repo: MissionProposalRepository;
  readonly assignRouting: AssignRoutingModeUseCase;
  readonly accept: AcceptOnBehalfUseCase;
  readonly refuse: RefuseOnBehalfUseCase;
}

const ListQuerySchema = z.object({
  state: z.enum(PROPOSAL_STATES).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const RoutingBodySchema = z
  .object({
    mode: z.enum(PROPOSAL_ROUTING_MODES),
  })
  .strict();

const AcceptBodySchema = z
  .object({
    notes: z.string().min(1).max(500).optional(),
  })
  .strict();

const RefuseBodySchema = z
  .object({
    reason: z.object({
      kind: z.enum(REFUSAL_REASONS),
      freeform: z.string().min(1).max(500).optional(),
    }),
    counterproposal: z
      .object({
        dateFrom: z.string().datetime(),
        dateTo: z.string().datetime(),
      })
      .optional(),
  })
  .strict();

export function createProposalsRouter(deps: ProposalsControllerDeps): Router {
  const router = Router();
  router.get('/', (req, res) => {
    void handleList(req, res, deps);
  });
  router.get('/export.csv', (req, res) => {
    void handleCsv(req, res, deps);
  });
  router.get('/stream', (req, res) => {
    handleStream(req, res, deps);
  });
  router.get('/:id', (req, res) => {
    void handleGet(req, res, deps);
  });
  router.post('/:id/routing', (req, res) => {
    void handleRouting(req, res, deps);
  });
  router.post('/:id/accept', (req, res) => {
    void handleAccept(req, res, deps);
  });
  router.post('/:id/refuse', (req, res) => {
    void handleRefuse(req, res, deps);
  });
  return router;
}

interface AuthContext {
  readonly agencyId: string;
  readonly actorId: string;
  readonly role: Role;
}

function authContext(req: Request, res: Response): AuthContext | undefined {
  const user = req.user;
  if (!user?.agencyId || !user.userId || !user.role) {
    res.status(401).json({ error: 'unauthenticated' });
    return undefined;
  }
  return { agencyId: user.agencyId, actorId: user.userId, role: user.role as Role };
}

function requireRole(
  req: Request,
  res: Response,
  action: Parameters<typeof canAccess>[1],
): AuthContext | undefined {
  const ctx = authContext(req, res);
  if (!ctx) return undefined;
  if (!canAccess(ctx.role, action)) {
    res.status(403).json({ error: 'forbidden' });
    return undefined;
  }
  return ctx;
}

async function handleList(
  req: Request,
  res: Response,
  deps: ProposalsControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'proposal:read');
  if (!ctx) return;
  const parsed = ListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', issues: parsed.error.issues });
    return;
  }
  const page = await deps.repo.list({
    agencyId: ctx.agencyId as never,
    ...(parsed.data.state !== undefined ? { state: parsed.data.state } : {}),
    ...(parsed.data.cursor !== undefined ? { cursor: parsed.data.cursor } : {}),
    ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
  });
  res.status(200).json({
    items: page.items.map(toDto),
    nextCursor: page.nextCursor ?? null,
  });
}

async function handleGet(
  req: Request,
  res: Response,
  deps: ProposalsControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'proposal:read');
  if (!ctx) return;
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'missing_id' });
    return;
  }
  const proposal = await deps.repo.findById(ctx.agencyId as never, asMissionProposalId(id));
  if (!proposal) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(200).json(toDto(proposal));
}

async function handleCsv(
  req: Request,
  res: Response,
  deps: ProposalsControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'proposal:read');
  if (!ctx) return;
  const parsed = ListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', issues: parsed.error.issues });
    return;
  }
  const page = await deps.repo.list({
    agencyId: ctx.agencyId as never,
    ...(parsed.data.state !== undefined ? { state: parsed.data.state } : {}),
    limit: parsed.data.limit ?? 1000,
  });
  const rows = page.items.map((p) => {
    const dto = toDto(p);
    return [
      dto.id,
      dto.externalRequestId,
      dto.state,
      dto.routingMode ?? '',
      dto.proposedAt,
      dto.responseDeadline ?? '',
      dto.mission.clientName,
      dto.mission.canton,
      String(dto.mission.hourlyRateRappen),
      dto.mission.startsAt,
      dto.mission.endsAt,
      dto.responseReason ?? '',
    ];
  });
  const header = [
    'id',
    'externalRequestId',
    'state',
    'routingMode',
    'proposedAt',
    'responseDeadline',
    'clientName',
    'canton',
    'hourlyRateRappen',
    'startsAt',
    'endsAt',
    'responseReason',
  ];
  const csv = [header, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n');
  res.set('content-type', 'text/csv; charset=utf-8');
  res.set('content-disposition', 'attachment; filename="proposals.csv"');
  res.status(200).send(csv);
}

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

/**
 * Server-Sent Events (SSE) pour le dashboard temps quasi-réel.
 *
 * Implémentation MVP : poll repo toutes les 5s et émet l'état complet
 * de la liste si changement détecté (hash naïf). Le client écoute
 * simplement le canal `message`. Pour une vraie diff (delta events
 * `proposal.state.changed`), il faudra brancher l'EventBus interne sur
 * le SSE — DETTE-043 si on a besoin de < 1s de latence.
 *
 * Auth : header Authorization récupéré via `requireRole`. Pas de
 * heartbeat explicite (les browsers reconnectent auto).
 */
function handleStream(req: Request, res: Response, deps: ProposalsControllerDeps): void {
  const ctx = requireRole(req, res, 'proposal:read');
  if (!ctx) return;
  res.set('content-type', 'text/event-stream');
  res.set('cache-control', 'no-cache, no-transform');
  res.set('connection', 'keep-alive');
  res.flushHeaders();

  let lastSerialized = '';
  const tick = async (): Promise<void> => {
    try {
      const page = await deps.repo.list({ agencyId: ctx.agencyId as never, limit: 200 });
      const dto = page.items.map(toDto);
      const serialized = JSON.stringify(dto);
      if (serialized !== lastSerialized) {
        lastSerialized = serialized;
        res.write(`event: snapshot\ndata: ${serialized}\n\n`);
      }
    } catch {
      // ignore tick error — la boucle continue
    }
  };
  void tick();
  const interval = setInterval(() => {
    void tick();
  }, 5000);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
}

async function handleRouting(
  req: Request,
  res: Response,
  deps: ProposalsControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'proposal:write');
  if (!ctx) return;
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'missing_id' });
    return;
  }
  const parsed = RoutingBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', issues: parsed.error.issues });
    return;
  }
  try {
    const result = await deps.assignRouting.execute({
      agencyId: ctx.agencyId as never,
      proposalId: id,
      mode: parsed.data.mode,
    });
    if (!result.ok) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.status(200).json({ state: result.value.state });
  } catch (err) {
    if (err instanceof Error && err.name === 'DomainError') {
      res.status(409).json({ error: 'conflict', message: err.message });
      return;
    }
    throw err;
  }
}

async function handleAccept(
  req: Request,
  res: Response,
  deps: ProposalsControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'proposal:write');
  if (!ctx) return;
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'missing_id' });
    return;
  }
  const idempotencyKey = pickIdempotencyKey(req);
  const parsed = AcceptBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', issues: parsed.error.issues });
    return;
  }
  try {
    const result = await deps.accept.execute({
      agencyId: ctx.agencyId as never,
      proposalId: id,
      idempotencyKey,
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
    });
    if (!result.ok) {
      if (result.error instanceof ProposalNotFound) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(502).json({ error: 'mp_error', message: result.error.message });
      return;
    }
    res.status(200).json({ state: result.value.state });
  } catch (err) {
    if (err instanceof Error && err.name === 'DomainError') {
      res.status(409).json({ error: 'conflict', message: err.message });
      return;
    }
    throw err;
  }
}

async function handleRefuse(
  req: Request,
  res: Response,
  deps: ProposalsControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'proposal:write');
  if (!ctx) return;
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'missing_id' });
    return;
  }
  const idempotencyKey = pickIdempotencyKey(req);
  const parsed = RefuseBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', issues: parsed.error.issues });
    return;
  }
  try {
    const result = await deps.refuse.execute({
      agencyId: ctx.agencyId as never,
      proposalId: id,
      idempotencyKey,
      reason: parsed.data.reason as { kind: (typeof REFUSAL_REASONS)[number]; freeform?: string },
      ...(parsed.data.counterproposal !== undefined
        ? { counterproposal: parsed.data.counterproposal }
        : {}),
    });
    if (!result.ok) {
      if (result.error instanceof ProposalNotFound) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(502).json({ error: 'mp_error', message: result.error.message });
      return;
    }
    res.status(200).json({ state: result.value.state });
  } catch (err) {
    if (err instanceof Error && err.message === 'refusal_reason_freeform_required') {
      res.status(400).json({ error: 'refusal_reason_freeform_required' });
      return;
    }
    if (err instanceof Error && err.name === 'DomainError') {
      res.status(409).json({ error: 'conflict', message: err.message });
      return;
    }
    throw err;
  }
}

function pickIdempotencyKey(req: Request): string {
  const header = req.headers['idempotency-key'];
  if (typeof header === 'string' && header.length > 0) return header;
  if (Array.isArray(header) && header[0]) return header[0];
  // Fallback : on en génère un (le client devrait toujours en envoyer un en prod).
  return `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function toDto(proposal: MissionProposal) {
  const snap = proposal.toSnapshot();
  return {
    id: snap.id,
    externalRequestId: snap.externalRequestId,
    workerId: snap.workerId ?? null,
    clientId: snap.clientId ?? null,
    state: snap.state,
    routingMode: snap.routingMode ?? null,
    proposedAt: snap.proposedAt.toISOString(),
    responseDeadline: snap.responseDeadline?.toISOString() ?? null,
    stateChangedAt: snap.stateChangedAt.toISOString(),
    responseReason: snap.responseReason ?? null,
    acceptedAt: snap.acceptedAt?.toISOString() ?? null,
    refusedAt: snap.refusedAt?.toISOString() ?? null,
    mission: {
      title: snap.missionSnapshot.title,
      clientName: snap.missionSnapshot.clientName,
      siteAddress: snap.missionSnapshot.siteAddress,
      canton: snap.missionSnapshot.canton,
      cctReference: snap.missionSnapshot.cctReference ?? null,
      hourlyRateRappen: snap.missionSnapshot.hourlyRateRappen,
      startsAt: snap.missionSnapshot.startsAt.toISOString(),
      endsAt: snap.missionSnapshot.endsAt.toISOString(),
      skillsRequired: snap.missionSnapshot.skillsRequired,
    },
  };
}

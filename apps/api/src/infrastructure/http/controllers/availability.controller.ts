import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { canAccess, SLOT_SOURCES, SLOT_STATUSES, SlotNotFound, type Role } from '@interim/domain';
import {
  WorkerAvailabilityNotFound,
  type AddSlotUseCase,
  type GetWeekAvailabilityUseCase,
  type RemoveSlotUseCase,
} from '@interim/application';

export interface AvailabilityControllerDeps {
  readonly add: AddSlotUseCase;
  readonly remove: RemoveSlotUseCase;
  readonly getWeek: GetWeekAvailabilityUseCase;
}

const addSlotDtoSchema = z
  .object({
    dateFrom: z.string().datetime(),
    dateTo: z.string().datetime(),
    status: z.enum(SLOT_STATUSES),
    source: z.enum(SLOT_SOURCES).optional(),
    reason: z.string().min(1).max(200).optional(),
    rrule: z.string().min(1).max(200).optional(),
  })
  .strict();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function createAvailabilityRouter(deps: AvailabilityControllerDeps): Router {
  const router = Router({ mergeParams: true });

  router.post('/slots', (req, res) => {
    void handleAddSlot(req, res, deps);
  });
  router.delete('/slots/:slotId', (req, res) => {
    void handleRemoveSlot(req, res, deps);
  });
  router.get('/week', (req, res) => {
    void handleGetWeek(req, res, deps);
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

async function handleAddSlot(
  req: Request,
  res: Response,
  deps: AvailabilityControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'worker:write');
  if (!ctx) return;
  const workerId = req.params.id;
  if (!workerId) {
    res.status(400).json({ error: 'missing_worker_id' });
    return;
  }

  const parsed = addSlotDtoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', issues: parsed.error.issues });
    return;
  }

  const dateFrom = new Date(parsed.data.dateFrom);
  const dateTo = new Date(parsed.data.dateTo);
  if (dateTo.getTime() <= dateFrom.getTime()) {
    res.status(400).json({ error: 'invalid_slot_window' });
    return;
  }

  try {
    const result = await deps.add.execute({
      agencyId: ctx.agencyId as never,
      workerId: workerId as never,
      dateFrom,
      dateTo,
      status: parsed.data.status,
      source: parsed.data.source ?? 'internal',
      ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
      ...(parsed.data.rrule !== undefined ? { rrule: parsed.data.rrule } : {}),
    });
    if (!result.ok) {
      res.status(400).json({ error: 'add_slot_failed' });
      return;
    }
    res
      .status(201)
      .location(`/api/v1/workers/${workerId}/availability/slots/${result.value.slotId}`)
      .json(result.value);
  } catch (err) {
    if (err instanceof Error && err.name === 'DomainError') {
      res.status(400).json({ error: 'invalid_slot_window', message: err.message });
      return;
    }
    throw err;
  }
}

async function handleRemoveSlot(
  req: Request,
  res: Response,
  deps: AvailabilityControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'worker:write');
  if (!ctx) return;
  const workerId = req.params.id;
  const { slotId } = req.params;
  if (!workerId || !slotId) {
    res.status(400).json({ error: 'missing_path_param' });
    return;
  }

  const result = await deps.remove.execute({
    agencyId: ctx.agencyId as never,
    workerId: workerId as never,
    slotId,
  });
  if (!result.ok) {
    if (
      result.error instanceof WorkerAvailabilityNotFound ||
      result.error instanceof SlotNotFound
    ) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.status(500).json({ error: 'unknown' });
    return;
  }
  res.status(204).send();
}

async function handleGetWeek(
  req: Request,
  res: Response,
  deps: AvailabilityControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'worker:read');
  if (!ctx) return;
  const workerId = req.params.id;
  if (!workerId) {
    res.status(400).json({ error: 'missing_worker_id' });
    return;
  }
  const fromStr = req.query.from;
  if (typeof fromStr !== 'string' || !ISO_DATE.test(fromStr)) {
    res.status(400).json({ error: 'missing_or_invalid_from', expected: 'YYYY-MM-DD (lundi ISO)' });
    return;
  }
  const weekStart = new Date(`${fromStr}T00:00:00.000Z`);
  if (Number.isNaN(weekStart.getTime())) {
    res.status(400).json({ error: 'invalid_from' });
    return;
  }
  // Recale au lundi ISO si nécessaire (tolérant : si dimanche → lundi suivant pas auto, juste rejet).
  const dow = weekStart.getUTCDay(); // 0 = dim, 1 = lun
  if (dow !== 1) {
    res.status(400).json({ error: 'from_must_be_monday' });
    return;
  }

  const view = await deps.getWeek.execute({
    agencyId: ctx.agencyId as never,
    workerId: workerId as never,
    weekStart,
  });
  res.status(200).json({
    weekStart: view.weekStart.toISOString(),
    weekEnd: view.weekEnd.toISOString(),
    freshness: view.freshness,
    instances: view.instances.map((i) => ({
      slotId: i.slotId,
      dateFrom: i.dateFrom.toISOString(),
      dateTo: i.dateTo.toISOString(),
      status: i.status,
      source: i.source,
      reason: i.reason ?? null,
    })),
  });
}

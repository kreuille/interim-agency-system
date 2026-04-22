import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  asTimesheetId,
  canAccess,
  TIMESHEET_STATES,
  type Role,
  type Timesheet,
  type TimesheetRepository,
} from '@interim/domain';
import type { DisputeTimesheetUseCase, SignTimesheetUseCase } from '@interim/application';

/**
 * REST endpoints pour le dashboard timesheet dispatcher (A4.6 UI).
 *
 *   GET  /api/v1/timesheets?state=&limit=&cursor=  → liste paginée
 *   GET  /api/v1/timesheets/:id                    → détail
 *   POST /api/v1/timesheets/:id/sign               → signe + push MP
 *   POST /api/v1/timesheets/:id/dispute            → conteste + push MP
 *   GET  /api/v1/timesheets/export.csv             → export CSV hebdo
 *
 * RBAC : `timesheet:read` pour GET, `timesheet:write` pour mutations.
 *
 * Closes DETTE-057.
 */

export interface TimesheetsControllerDeps {
  readonly repo: TimesheetRepository;
  readonly signUseCase: SignTimesheetUseCase;
  readonly disputeUseCase: DisputeTimesheetUseCase;
}

const ListQuerySchema = z.object({
  state: z.enum(TIMESHEET_STATES).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const SignBodySchema = z
  .object({
    reviewerUserId: z.string().min(1),
    notes: z.string().min(1).max(500).optional(),
  })
  .strict();

const DisputeBodySchema = z
  .object({
    reviewerUserId: z.string().min(1),
    reason: z.string().min(10).max(500),
  })
  .strict();

export function createTimesheetsRouter(deps: TimesheetsControllerDeps): Router {
  const router = Router();
  router.get('/', (req, res) => {
    void handleList(req, res, deps);
  });
  router.get('/export.csv', (req, res) => {
    void handleCsv(req, res, deps);
  });
  router.get('/:id', (req, res) => {
    void handleGet(req, res, deps);
  });
  router.post('/:id/sign', (req, res) => {
    void handleSign(req, res, deps);
  });
  router.post('/:id/dispute', (req, res) => {
    void handleDispute(req, res, deps);
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

async function handleList(
  req: Request,
  res: Response,
  deps: TimesheetsControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'timesheet:read');
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
  deps: TimesheetsControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'timesheet:read');
  if (!ctx) return;
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'missing_id' });
    return;
  }
  const ts = await deps.repo.findById(ctx.agencyId as never, asTimesheetId(id));
  if (!ts) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(200).json(toDto(ts));
}

async function handleSign(
  req: Request,
  res: Response,
  deps: TimesheetsControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'timesheet:write');
  if (!ctx) return;
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'missing_id' });
    return;
  }
  const parsed = SignBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', issues: parsed.error.issues });
    return;
  }
  const result = await deps.signUseCase.execute({
    agencyId: ctx.agencyId as never,
    timesheetId: id,
    reviewerUserId: parsed.data.reviewerUserId,
    ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
  });
  if (!result.ok) {
    const status = mapSignError(result.error.kind);
    res.status(status).json({ error: result.error.kind, message: result.error.message });
    return;
  }
  res.status(200).json({
    state: result.value.state,
    signedAt: result.value.signedAt.toISOString(),
    alreadyExisted: result.value.alreadyExisted,
  });
}

async function handleDispute(
  req: Request,
  res: Response,
  deps: TimesheetsControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'timesheet:write');
  if (!ctx) return;
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'missing_id' });
    return;
  }
  const parsed = DisputeBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(422).json({ error: 'invalid_reason', issues: parsed.error.issues });
    return;
  }
  const result = await deps.disputeUseCase.execute({
    agencyId: ctx.agencyId as never,
    timesheetId: id,
    reviewerUserId: parsed.data.reviewerUserId,
    reason: parsed.data.reason,
  });
  if (!result.ok) {
    const status = mapDisputeError(result.error.kind);
    res.status(status).json({ error: result.error.kind, message: result.error.message });
    return;
  }
  res.status(200).json({
    state: result.value.state,
    disputedAt: result.value.disputedAt.toISOString(),
    alreadyExisted: result.value.alreadyExisted,
  });
}

async function handleCsv(
  req: Request,
  res: Response,
  deps: TimesheetsControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'timesheet:read');
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
  const header = [
    'id',
    'externalTimesheetId',
    'workerId',
    'clientId',
    'state',
    'totalMinutes',
    'hourlyRateRappen',
    'totalCostRappen',
    'anomaliesCount',
    'blockersCount',
    'receivedAt',
    'stateChangedAt',
  ];
  const rows = page.items.map((t) => {
    const s = t.toSnapshot();
    return [
      s.id,
      s.externalTimesheetId,
      s.workerId,
      s.clientId,
      s.state,
      String(s.totalMinutes),
      String(s.hourlyRateRappen),
      String(s.totalCostRappen),
      String(s.anomalies.length),
      String(s.anomalies.filter((a) => a.severity === 'blocker').length),
      s.receivedAt.toISOString(),
      s.stateChangedAt.toISOString(),
    ];
  });
  const csv = [header, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n');
  res.set('content-type', 'text/csv; charset=utf-8');
  res.set('content-disposition', 'attachment; filename="timesheets-hebdo.csv"');
  res.status(200).send(csv);
}

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function mapSignError(
  kind:
    | 'timesheet_not_found'
    | 'timesheet_wrong_state'
    | 'has_blocker_anomaly'
    | 'mp_transient'
    | 'mp_permanent',
): number {
  switch (kind) {
    case 'timesheet_not_found':
      return 404;
    case 'timesheet_wrong_state':
      return 409;
    case 'has_blocker_anomaly':
      return 409;
    case 'mp_transient':
      return 503;
    case 'mp_permanent':
      return 502;
  }
}

function mapDisputeError(
  kind:
    | 'timesheet_not_found'
    | 'timesheet_wrong_state'
    | 'invalid_reason'
    | 'mp_transient'
    | 'mp_permanent',
): number {
  switch (kind) {
    case 'timesheet_not_found':
      return 404;
    case 'timesheet_wrong_state':
      return 409;
    case 'invalid_reason':
      return 422;
    case 'mp_transient':
      return 503;
    case 'mp_permanent':
      return 502;
  }
}

function toDto(timesheet: Timesheet) {
  const s = timesheet.toSnapshot();
  return {
    id: s.id,
    externalTimesheetId: s.externalTimesheetId,
    workerId: s.workerId,
    clientId: s.clientId,
    missionContractId: s.missionContractId ?? null,
    state: s.state,
    totalMinutes: s.totalMinutes,
    hourlyRateRappen: s.hourlyRateRappen,
    totalCostRappen: s.totalCostRappen,
    entries: s.entries.map((e) => ({
      workDate: e.workDate.toISOString(),
      plannedStart: e.plannedStart.toISOString(),
      plannedEnd: e.plannedEnd.toISOString(),
      actualStart: e.actualStart.toISOString(),
      actualEnd: e.actualEnd.toISOString(),
      breakMinutes: e.breakMinutes,
    })),
    anomalies: s.anomalies,
    receivedAt: s.receivedAt.toISOString(),
    stateChangedAt: s.stateChangedAt.toISOString(),
    reviewedAt: s.reviewedAt?.toISOString() ?? null,
    reviewerUserId: s.reviewerUserId ?? null,
  };
}

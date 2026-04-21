import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { canAccess, type TempWorker, type WorkerListPage } from '@interim/domain';
import type {
  ArchiveWorkerUseCase,
  GetWorkerUseCase,
  ListWorkersUseCase,
  RegisterWorkerUseCase,
  UpdateWorkerUseCase,
} from '@interim/application';
import { InvalidAvs, InvalidIban } from '@interim/shared';
import { currentTenant } from '../../../shared/context/tenant-context.js';
import {
  listWorkersQueryDto,
  registerWorkerDto,
  updateWorkerDto,
} from '../validators/workers.dto.js';

export interface WorkerControllerDeps {
  readonly register: RegisterWorkerUseCase;
  readonly update: UpdateWorkerUseCase;
  readonly archive: ArchiveWorkerUseCase;
  readonly get: GetWorkerUseCase;
  readonly list: ListWorkersUseCase;
}

export function createWorkersRouter(deps: WorkerControllerDeps): Router {
  const router = Router();

  router.post('/', (req, res) => {
    void handlePost(req, res, deps);
  });
  router.get('/:id', (req, res) => {
    void handleGet(req, res, deps);
  });
  router.put('/:id', (req, res) => {
    void handlePut(req, res, deps);
  });
  router.delete('/:id', (req, res) => {
    void handleDelete(req, res, deps);
  });
  router.get('/', (req, res) => {
    void handleList(req, res, deps);
  });

  return router;
}

function requireRole(
  req: Request,
  res: Response,
  action: Parameters<typeof canAccess>[1],
): boolean {
  const ctx = currentTenant();
  const role = ctx.actorRole;
  if (!role) {
    res.status(403).json({ error: 'missing_role' });
    return false;
  }
  if (!canAccess(role as Parameters<typeof canAccess>[0], action)) {
    res.status(403).json({ error: 'forbidden' });
    return false;
  }
  return true;
}

async function handlePost(req: Request, res: Response, deps: WorkerControllerDeps): Promise<void> {
  if (!requireRole(req, res, 'worker:write')) return;
  const ctx = currentTenant();

  const parsed = registerWorkerDto.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', issues: parsed.error.issues });
    return;
  }

  try {
    const result = await deps.register.execute({
      agencyId: ctx.agencyId as never,
      ...(ctx.actorId !== undefined ? { actorUserId: ctx.actorId } : {}),
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      avs: parsed.data.avs,
      iban: parsed.data.iban,
      residenceCanton: parsed.data.residenceCanton,
      ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
    });
    if (!result.ok) {
      res.status(409).json({ error: result.error.code, message: result.error.message });
      return;
    }
    res.status(201).location(`/api/v1/workers/${result.value.workerId}`).json(result.value);
  } catch (error) {
    if (error instanceof InvalidAvs || error instanceof InvalidIban) {
      res.status(400).json({ error: error.name, message: error.message });
      return;
    }
    throw error;
  }
}

async function handleGet(req: Request, res: Response, deps: WorkerControllerDeps): Promise<void> {
  if (!requireRole(req, res, 'worker:read')) return;
  const ctx = currentTenant();
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'missing_id' });
    return;
  }
  const result = await deps.get.execute({ agencyId: ctx.agencyId as never, workerId: id });
  if (!result.ok) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(200).json(toDto(result.value));
}

async function handlePut(req: Request, res: Response, deps: WorkerControllerDeps): Promise<void> {
  if (!requireRole(req, res, 'worker:write')) return;
  const ctx = currentTenant();
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'missing_id' });
    return;
  }
  const parsed = updateWorkerDto.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', issues: parsed.error.issues });
    return;
  }

  try {
    const result = await deps.update.execute({
      agencyId: ctx.agencyId as never,
      workerId: id,
      ...(ctx.actorId !== undefined ? { actorUserId: ctx.actorId } : {}),
      ...(parsed.data.firstName !== undefined ? { firstName: parsed.data.firstName } : {}),
      ...(parsed.data.lastName !== undefined ? { lastName: parsed.data.lastName } : {}),
      ...(parsed.data.iban !== undefined ? { iban: parsed.data.iban } : {}),
      ...(parsed.data.residenceCanton !== undefined
        ? { residenceCanton: parsed.data.residenceCanton }
        : {}),
      ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
    });
    if (!result.ok) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const fresh = await deps.get.execute({ agencyId: ctx.agencyId as never, workerId: id });
    if (!fresh.ok) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.status(200).json(toDto(fresh.value));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'validation_error', issues: error.issues });
      return;
    }
    throw error;
  }
}

async function handleDelete(
  req: Request,
  res: Response,
  deps: WorkerControllerDeps,
): Promise<void> {
  if (!requireRole(req, res, 'worker:delete')) return;
  const ctx = currentTenant();
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'missing_id' });
    return;
  }
  const result = await deps.archive.execute({
    agencyId: ctx.agencyId as never,
    workerId: id,
    ...(ctx.actorId !== undefined ? { actorUserId: ctx.actorId } : {}),
  });
  if (!result.ok) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(204).send();
}

async function handleList(req: Request, res: Response, deps: WorkerControllerDeps): Promise<void> {
  if (!requireRole(req, res, 'worker:read')) return;
  const ctx = currentTenant();
  const parsed = listWorkersQueryDto.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', issues: parsed.error.issues });
    return;
  }
  const page: WorkerListPage = await deps.list.execute({
    agencyId: ctx.agencyId as never,
    includeArchived: parsed.data.includeArchived,
    ...(parsed.data.search !== undefined ? { search: parsed.data.search } : {}),
    ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
    ...(parsed.data.cursor !== undefined ? { cursor: parsed.data.cursor } : {}),
  });
  res.status(200).json({
    items: page.items.map(toDto),
    nextCursor: page.nextCursor ?? null,
  });
}

function toDto(worker: TempWorker) {
  const snap = worker.toSnapshot();
  return {
    id: snap.id,
    agencyId: snap.agencyId,
    firstName: snap.firstName.toString(),
    lastName: snap.lastName.toString(),
    avs: snap.avs.toString(),
    iban: snap.iban.toString(),
    residenceCanton: snap.residenceCanton,
    email: snap.email?.toString() ?? null,
    phone: snap.phone?.toString() ?? null,
    createdAt: snap.createdAt.toISOString(),
    updatedAt: snap.updatedAt.toISOString(),
    archivedAt: snap.archivedAt ? snap.archivedAt.toISOString() : null,
  };
}

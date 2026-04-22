import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { canAccess, CLIENT_STATUSES, type Client } from '@interim/domain';
import type {
  ArchiveClientUseCase,
  GetClientUseCase,
  ListClientsUseCase,
  RegisterClientUseCase,
  UpdateClientUseCase,
} from '@interim/application';
import { InvalidIde } from '@interim/shared';
import { currentTenant } from '../../../shared/context/tenant-context.js';

export interface ClientControllerDeps {
  readonly register: RegisterClientUseCase;
  readonly update: UpdateClientUseCase;
  readonly archive: ArchiveClientUseCase;
  readonly get: GetClientUseCase;
  readonly list: ListClientsUseCase;
}

const registerDto = z.object({
  legalName: z.string().min(1).max(160),
  ide: z.string().optional(),
  paymentTermDays: z.number().int().min(0).max(365).optional(),
  creditLimitRappen: z.string().optional(), // bigint sérialisé en string
  notes: z.string().optional(),
});

const updateDto = z.object({
  legalName: z.string().min(1).max(160).optional(),
  ide: z.union([z.string(), z.null()]).optional(),
  paymentTermDays: z.number().int().min(0).max(365).optional(),
  creditLimitRappen: z.union([z.string(), z.null()]).optional(),
  status: z.enum(CLIENT_STATUSES).optional(),
});

const listQueryDto = z.object({
  search: z.string().optional(),
  status: z.enum(CLIENT_STATUSES).optional(),
  includeArchived: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

export function createClientsRouter(deps: ClientControllerDeps): Router {
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
  _req: Request,
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

async function handlePost(req: Request, res: Response, deps: ClientControllerDeps): Promise<void> {
  if (!requireRole(req, res, 'client:write')) return;
  const ctx = currentTenant();

  const parsed = registerDto.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', issues: parsed.error.issues });
    return;
  }

  try {
    const result = await deps.register.execute({
      agencyId: ctx.agencyId as never,
      ...(ctx.actorId !== undefined ? { actorUserId: ctx.actorId } : {}),
      legalName: parsed.data.legalName,
      ...(parsed.data.ide !== undefined ? { ide: parsed.data.ide } : {}),
      ...(parsed.data.paymentTermDays !== undefined
        ? { paymentTermDays: parsed.data.paymentTermDays }
        : {}),
      ...(parsed.data.creditLimitRappen !== undefined
        ? { creditLimitRappen: BigInt(parsed.data.creditLimitRappen) }
        : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
    });
    if (!result.ok) {
      res.status(409).json({ error: result.error.code, message: result.error.message });
      return;
    }
    res.status(201).location(`/api/v1/clients/${result.value.clientId}`).json(result.value);
  } catch (error) {
    if (error instanceof InvalidIde) {
      res.status(400).json({ error: error.name, message: error.message });
      return;
    }
    throw error;
  }
}

async function handleGet(req: Request, res: Response, deps: ClientControllerDeps): Promise<void> {
  if (!requireRole(req, res, 'client:read')) return;
  const ctx = currentTenant();
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'missing_id' });
    return;
  }
  const result = await deps.get.execute({ agencyId: ctx.agencyId as never, clientId: id });
  if (!result.ok) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(200).json(toDto(result.value));
}

async function handlePut(req: Request, res: Response, deps: ClientControllerDeps): Promise<void> {
  if (!requireRole(req, res, 'client:write')) return;
  const ctx = currentTenant();
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'missing_id' });
    return;
  }
  const parsed = updateDto.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', issues: parsed.error.issues });
    return;
  }
  try {
    const result = await deps.update.execute({
      agencyId: ctx.agencyId as never,
      clientId: id,
      ...(ctx.actorId !== undefined ? { actorUserId: ctx.actorId } : {}),
      ...(parsed.data.legalName !== undefined ? { legalName: parsed.data.legalName } : {}),
      ...(parsed.data.ide !== undefined ? { ide: parsed.data.ide } : {}),
      ...(parsed.data.paymentTermDays !== undefined
        ? { paymentTermDays: parsed.data.paymentTermDays }
        : {}),
      ...(parsed.data.creditLimitRappen !== undefined
        ? {
            creditLimitRappen:
              parsed.data.creditLimitRappen === null ? null : BigInt(parsed.data.creditLimitRappen),
          }
        : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    });
    if (!result.ok) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const fresh = await deps.get.execute({ agencyId: ctx.agencyId as never, clientId: id });
    if (!fresh.ok) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.status(200).json(toDto(fresh.value));
  } catch (error) {
    if (error instanceof InvalidIde) {
      res.status(400).json({ error: error.name, message: error.message });
      return;
    }
    if (error instanceof Error && error.name === 'DomainError') {
      res.status(409).json({ error: 'invalid_transition', message: error.message });
      return;
    }
    throw error;
  }
}

async function handleDelete(
  req: Request,
  res: Response,
  deps: ClientControllerDeps,
): Promise<void> {
  if (!requireRole(req, res, 'client:write')) return;
  const ctx = currentTenant();
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'missing_id' });
    return;
  }
  const result = await deps.archive.execute({
    agencyId: ctx.agencyId as never,
    clientId: id,
    ...(ctx.actorId !== undefined ? { actorUserId: ctx.actorId } : {}),
  });
  if (!result.ok) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(204).send();
}

async function handleList(req: Request, res: Response, deps: ClientControllerDeps): Promise<void> {
  if (!requireRole(req, res, 'client:read')) return;
  const ctx = currentTenant();
  const parsed = listQueryDto.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', issues: parsed.error.issues });
    return;
  }
  const page = await deps.list.execute({
    agencyId: ctx.agencyId as never,
    includeArchived: parsed.data.includeArchived,
    ...(parsed.data.search !== undefined ? { search: parsed.data.search } : {}),
    ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
    ...(parsed.data.cursor !== undefined ? { cursor: parsed.data.cursor } : {}),
  });
  res.status(200).json({
    items: page.items.map(toDto),
    nextCursor: page.nextCursor ?? null,
  });
}

function toDto(client: Client) {
  const snap = client.toSnapshot();
  return {
    id: snap.id,
    agencyId: snap.agencyId,
    legalName: snap.legalName.toString(),
    ide: snap.ide?.toString() ?? null,
    status: snap.status,
    paymentTermDays: snap.paymentTermDays,
    creditLimitRappen: snap.creditLimit?.toCents().toString() ?? null,
    notes: snap.notes ?? null,
    contacts: snap.contacts.map((c) => ({
      id: c.id,
      role: c.role,
      firstName: c.firstName.toString(),
      lastName: c.lastName.toString(),
      email: c.email?.toString() ?? null,
      phone: c.phone?.toString() ?? null,
    })),
    createdAt: snap.createdAt.toISOString(),
    updatedAt: snap.updatedAt.toISOString(),
    archivedAt: snap.archivedAt?.toISOString() ?? null,
  };
}

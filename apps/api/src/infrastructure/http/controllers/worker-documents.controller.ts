import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { canAccess, DOCUMENT_TYPES, type WorkerDocument } from '@interim/domain';
import type {
  ArchiveDocumentUseCase,
  GetDownloadUrlUseCase,
  ListDocumentsUseCase,
  UploadDocumentUseCase,
  ValidateDocumentUseCase,
} from '@interim/application';
import { isMimeConsistent } from '@interim/shared';
import type { Role } from '@interim/domain';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/heic']);

export interface DocumentControllerDeps {
  readonly upload: UploadDocumentUseCase;
  readonly validate: ValidateDocumentUseCase;
  readonly archive: ArchiveDocumentUseCase;
  readonly list: ListDocumentsUseCase;
  readonly getUrl: GetDownloadUrlUseCase;
}

const uploadDtoSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  issuedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
});

const validateDtoSchema = z.object({}).strict();

export function createWorkerDocumentsRouter(deps: DocumentControllerDeps): Router {
  const router = Router({ mergeParams: true });
  const memoryStorage = multer.memoryStorage();
  const uploader = multer({
    storage: memoryStorage,
    limits: { fileSize: MAX_BYTES, files: 1 },
  });

  router.post('/', uploader.single('file'), (req, res) => {
    void handleUpload(req, res, deps);
  });
  router.get('/', (req, res) => {
    void handleList(req, res, deps);
  });
  router.get('/:docId/download', (req, res) => {
    void handleDownload(req, res, deps);
  });
  router.patch('/:docId/validate', (req, res) => {
    void handleValidate(req, res, deps);
  });
  router.delete('/:docId', (req, res) => {
    void handleArchive(req, res, deps);
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

async function handleUpload(
  req: Request,
  res: Response,
  deps: DocumentControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'worker:write');
  if (!ctx) return;
  const workerId = req.params.id;
  if (!workerId) {
    res.status(400).json({ error: 'missing_worker_id' });
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'missing_file' });
    return;
  }
  if (!ACCEPTED_MIME.has(file.mimetype)) {
    res.status(415).json({ error: 'unsupported_media_type', declared: file.mimetype });
    return;
  }
  if (!isMimeConsistent(file.mimetype, file.buffer)) {
    res.status(400).json({ error: 'mime_mismatch' });
    return;
  }

  const parsed = uploadDtoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', issues: parsed.error.issues });
    return;
  }

  const result = await deps.upload.execute({
    agencyId: ctx.agencyId as never,
    workerId,
    actorUserId: ctx.actorId,
    type: parsed.data.type,
    mimeType: file.mimetype,
    body: file.buffer,
    ...(parsed.data.issuedAt !== undefined ? { issuedAt: new Date(parsed.data.issuedAt) } : {}),
    ...(parsed.data.expiresAt !== undefined ? { expiresAt: new Date(parsed.data.expiresAt) } : {}),
  });
  if (!result.ok) {
    res.status(404).json({ error: 'worker_not_found' });
    return;
  }
  res
    .status(202)
    .location(`/api/v1/workers/${workerId}/documents/${result.value.documentId}`)
    .json(result.value);
}

async function handleList(
  req: Request,
  res: Response,
  deps: DocumentControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'worker:read');
  if (!ctx) return;
  const workerId = req.params.id;
  if (!workerId) {
    res.status(400).json({ error: 'missing_worker_id' });
    return;
  }
  const page = await deps.list.execute({
    agencyId: ctx.agencyId as never,
    workerId,
  });
  res.status(200).json({
    items: page.items.map(toDto),
    nextCursor: page.nextCursor ?? null,
  });
}

async function handleDownload(
  req: Request,
  res: Response,
  deps: DocumentControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'worker:read');
  if (!ctx) return;
  const { docId } = req.params;
  if (!docId) {
    res.status(400).json({ error: 'missing_doc_id' });
    return;
  }
  const result = await deps.getUrl.execute({
    agencyId: ctx.agencyId as never,
    documentId: docId,
  });
  if (!result.ok) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(200).json(result.value);
}

async function handleValidate(
  req: Request,
  res: Response,
  deps: DocumentControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'worker:write');
  if (!ctx) return;
  const { docId } = req.params;
  if (!docId) {
    res.status(400).json({ error: 'missing_doc_id' });
    return;
  }
  const parsed = validateDtoSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error' });
    return;
  }
  try {
    const result = await deps.validate.execute({
      agencyId: ctx.agencyId as never,
      documentId: docId,
      actorUserId: ctx.actorId,
    });
    if (!result.ok) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.status(200).json({ documentId: docId, status: 'VALID' });
  } catch (error) {
    if (error instanceof Error && error.name === 'DomainError') {
      res.status(409).json({ error: 'invalid_transition', message: error.message });
      return;
    }
    throw error;
  }
}

async function handleArchive(
  req: Request,
  res: Response,
  deps: DocumentControllerDeps,
): Promise<void> {
  const ctx = requireRole(req, res, 'worker:delete');
  if (!ctx) return;
  const { docId } = req.params;
  if (!docId) {
    res.status(400).json({ error: 'missing_doc_id' });
    return;
  }
  const result = await deps.archive.execute({
    agencyId: ctx.agencyId as never,
    documentId: docId,
    actorUserId: ctx.actorId,
  });
  if (!result.ok) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(204).send();
}

function toDto(doc: WorkerDocument) {
  const snap = doc.toSnapshot();
  return {
    id: snap.id,
    workerId: snap.workerId,
    type: snap.type,
    status: snap.status,
    mimeType: snap.mimeType,
    sizeBytes: snap.sizeBytes,
    issuedAt: snap.issuedAt?.toISOString() ?? null,
    expiresAt: snap.expiresAt?.toISOString() ?? null,
    validatedBy: snap.validatedBy ?? null,
    validatedAt: snap.validatedAt?.toISOString() ?? null,
    createdAt: snap.createdAt.toISOString(),
    updatedAt: snap.updatedAt.toISOString(),
    archivedAt: snap.archivedAt?.toISOString() ?? null,
  };
}

import type { Clock } from '@interim/shared';
import type { AgencyId, StaffId } from '../../shared/ids.js';
import { DomainError } from '../errors.js';

export const DOCUMENT_TYPES = [
  'permit_work',
  'permit_driving',
  'avs_card',
  'lamal_cert',
  'diploma',
  'suva_sst',
  'caces',
  'other',
] as const;

export type WorkerDocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = [
  'PENDING_SCAN',
  'PENDING_VALIDATION',
  'VALID',
  'EXPIRED',
  'REJECTED',
  'ARCHIVED',
] as const;

export type WorkerDocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export interface WorkerDocumentProps {
  readonly id: string;
  readonly agencyId: AgencyId;
  readonly workerId: StaffId;
  readonly type: WorkerDocumentType;
  readonly status: WorkerDocumentStatus;
  readonly fileKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly issuedAt?: Date;
  readonly expiresAt?: Date;
  readonly validatedBy?: string;
  readonly validatedAt?: Date;
  readonly rejectionReason?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt?: Date;
}

export interface CreateWorkerDocumentInput {
  readonly id: string;
  readonly agencyId: AgencyId;
  readonly workerId: StaffId;
  readonly type: WorkerDocumentType;
  readonly fileKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly issuedAt?: Date;
  readonly expiresAt?: Date;
}

export class InvalidDocumentTransition extends DomainError {
  constructor(from: WorkerDocumentStatus, to: WorkerDocumentStatus) {
    super('invalid_document_transition', `Transition invalide ${from} → ${to}`);
  }
}

export class DocumentNotFound extends DomainError {
  constructor(id: string) {
    super('document_not_found', `WorkerDocument ${id} introuvable dans le tenant courant`);
  }
}

export class WorkerDocument {
  private constructor(private props: WorkerDocumentProps) {}

  static create(input: CreateWorkerDocumentInput, clock: Clock): WorkerDocument {
    const now = clock.now();
    const props: WorkerDocumentProps = {
      id: input.id,
      agencyId: input.agencyId,
      workerId: input.workerId,
      type: input.type,
      status: 'PENDING_SCAN',
      fileKey: input.fileKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      createdAt: now,
      updatedAt: now,
      ...(input.issuedAt !== undefined ? { issuedAt: input.issuedAt } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    };
    return new WorkerDocument(props);
  }

  static rehydrate(props: WorkerDocumentProps): WorkerDocument {
    return new WorkerDocument(props);
  }

  get id(): string {
    return this.props.id;
  }

  get agencyId(): AgencyId {
    return this.props.agencyId;
  }

  get workerId(): StaffId {
    return this.props.workerId;
  }

  get status(): WorkerDocumentStatus {
    return this.props.status;
  }

  get isArchived(): boolean {
    return this.props.archivedAt !== undefined;
  }

  get fileKey(): string {
    return this.props.fileKey;
  }

  markScanned(clean: boolean, clock: Clock): void {
    this.assertFromStatus('PENDING_SCAN', clean ? 'PENDING_VALIDATION' : 'REJECTED');
    this.props = {
      ...this.props,
      status: clean ? 'PENDING_VALIDATION' : 'REJECTED',
      ...(clean ? {} : { rejectionReason: 'antivirus_detected_threat' }),
      updatedAt: clock.now(),
    };
  }

  validate(validatedBy: string, clock: Clock): void {
    this.assertFromStatus('PENDING_VALIDATION', 'VALID');
    this.props = {
      ...this.props,
      status: 'VALID',
      validatedBy,
      validatedAt: clock.now(),
      updatedAt: clock.now(),
    };
  }

  reject(reason: string, clock: Clock): void {
    if (this.props.status === 'VALID' || this.props.status === 'ARCHIVED') {
      throw new InvalidDocumentTransition(this.props.status, 'REJECTED');
    }
    this.props = {
      ...this.props,
      status: 'REJECTED',
      rejectionReason: reason,
      updatedAt: clock.now(),
    };
  }

  markExpired(clock: Clock): void {
    if (this.props.status !== 'VALID') return;
    this.props = {
      ...this.props,
      status: 'EXPIRED',
      updatedAt: clock.now(),
    };
  }

  archive(clock: Clock): void {
    if (this.props.archivedAt) return;
    const now = clock.now();
    this.props = {
      ...this.props,
      status: 'ARCHIVED',
      archivedAt: now,
      updatedAt: now,
    };
  }

  isExpiredAt(date: Date): boolean {
    return this.props.expiresAt !== undefined && this.props.expiresAt.getTime() < date.getTime();
  }

  toSnapshot(): Readonly<WorkerDocumentProps> {
    return Object.freeze({ ...this.props });
  }

  private assertFromStatus(expected: WorkerDocumentStatus, target: WorkerDocumentStatus): void {
    if (this.props.status !== expected) {
      throw new InvalidDocumentTransition(this.props.status, target);
    }
  }
}

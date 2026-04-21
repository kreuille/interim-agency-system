import type { Avs, Canton, Clock, Email, Iban, Name, Phone } from '@interim/shared';
import type { AgencyId, StaffId } from '../shared/ids.js';

export interface TempWorkerProps {
  readonly id: StaffId;
  readonly agencyId: AgencyId;
  readonly firstName: Name;
  readonly lastName: Name;
  readonly avs: Avs;
  readonly iban: Iban;
  readonly residenceCanton: Canton;
  readonly email?: Email;
  readonly phone?: Phone;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt?: Date;
}

export interface CreateTempWorkerInput {
  readonly id: StaffId;
  readonly agencyId: AgencyId;
  readonly firstName: Name;
  readonly lastName: Name;
  readonly avs: Avs;
  readonly iban: Iban;
  readonly residenceCanton: Canton;
  readonly email?: Email;
  readonly phone?: Phone;
}

export class TempWorker {
  private constructor(private props: TempWorkerProps) {}

  static create(input: CreateTempWorkerInput, clock: Clock): TempWorker {
    const now = clock.now();
    const props: TempWorkerProps = {
      id: input.id,
      agencyId: input.agencyId,
      firstName: input.firstName,
      lastName: input.lastName,
      avs: input.avs,
      iban: input.iban,
      residenceCanton: input.residenceCanton,
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      createdAt: now,
      updatedAt: now,
    };
    return new TempWorker(props);
  }

  static rehydrate(props: TempWorkerProps): TempWorker {
    return new TempWorker(props);
  }

  get id(): StaffId {
    return this.props.id;
  }

  get agencyId(): AgencyId {
    return this.props.agencyId;
  }

  get isArchived(): boolean {
    return this.props.archivedAt !== undefined;
  }

  rename(firstName: Name, lastName: Name, clock: Clock): void {
    this.props = {
      ...this.props,
      firstName,
      lastName,
      updatedAt: clock.now(),
    };
  }

  changeIban(iban: Iban, clock: Clock): void {
    this.props = {
      ...this.props,
      iban,
      updatedAt: clock.now(),
    };
  }

  changeResidenceCanton(canton: Canton, clock: Clock): void {
    this.props = {
      ...this.props,
      residenceCanton: canton,
      updatedAt: clock.now(),
    };
  }

  changeEmail(email: Email | undefined, clock: Clock): void {
    const next: TempWorkerProps = {
      ...this.props,
      updatedAt: clock.now(),
    };
    if (email === undefined) {
      delete (next as { email?: Email }).email;
    } else {
      (next as { email?: Email }).email = email;
    }
    this.props = next;
  }

  changePhone(phone: Phone | undefined, clock: Clock): void {
    const next: TempWorkerProps = {
      ...this.props,
      updatedAt: clock.now(),
    };
    if (phone === undefined) {
      delete (next as { phone?: Phone }).phone;
    } else {
      (next as { phone?: Phone }).phone = phone;
    }
    this.props = next;
  }

  archive(clock: Clock): void {
    if (this.props.archivedAt) {
      return;
    }
    const now = clock.now();
    this.props = {
      ...this.props,
      archivedAt: now,
      updatedAt: now,
    };
  }

  toSnapshot(): Readonly<TempWorkerProps> {
    return Object.freeze({ ...this.props });
  }
}

import type {
  AgencyId,
  ClientId,
  MissionContract,
  MissionContractId,
  MissionContractRepository,
  StaffId,
} from '@interim/domain';
import type {
  AgencyProfileLookup,
  AgencyProfileView,
  ClientProfileLookup,
  ClientProfileView,
  LseAuthorizationLookup,
  LseAuthorizationView,
  WeeklyHoursLookup,
  WorkPermitLookup,
  WorkPermitView,
} from './compliance-ports.js';

export class InMemoryMissionContractRepository implements MissionContractRepository {
  private readonly byId = new Map<string, MissionContract>();

  save(contract: MissionContract): Promise<void> {
    this.byId.set(contract.id, contract);
    return Promise.resolve();
  }

  findById(agencyId: AgencyId, id: MissionContractId): Promise<MissionContract | undefined> {
    const c = this.byId.get(id);
    if (c?.agencyId !== agencyId) return Promise.resolve(undefined);
    return Promise.resolve(c);
  }

  findByProposalId(agencyId: AgencyId, proposalId: string): Promise<MissionContract | undefined> {
    for (const c of this.byId.values()) {
      if (c.agencyId === agencyId && c.toSnapshot().proposalId === proposalId) {
        return Promise.resolve(c);
      }
    }
    return Promise.resolve(undefined);
  }

  findByReference(agencyId: AgencyId, reference: string): Promise<MissionContract | undefined> {
    for (const c of this.byId.values()) {
      if (c.agencyId === agencyId && c.reference === reference) return Promise.resolve(c);
    }
    return Promise.resolve(undefined);
  }

  size(): number {
    return this.byId.size;
  }
}

export class StubLseAuthorizationLookup implements LseAuthorizationLookup {
  constructor(private readonly view: LseAuthorizationView | undefined) {}
  findByAgency(_agencyId: AgencyId): Promise<LseAuthorizationView | undefined> {
    return Promise.resolve(this.view);
  }
}

export class StubWorkPermitLookup implements WorkPermitLookup {
  constructor(private readonly view: WorkPermitView | undefined) {}
  findByWorker(_a: AgencyId, _w: StaffId): Promise<WorkPermitView | undefined> {
    return Promise.resolve(this.view);
  }
}

export class StubWeeklyHoursLookup implements WeeklyHoursLookup {
  constructor(private readonly hours: number) {}
  cumulHours(): Promise<number> {
    return Promise.resolve(this.hours);
  }
}

export class StubAgencyProfileLookup implements AgencyProfileLookup {
  constructor(private readonly view: AgencyProfileView | undefined) {}
  findById(_a: AgencyId): Promise<AgencyProfileView | undefined> {
    return Promise.resolve(this.view);
  }
}

export class StubClientProfileLookup implements ClientProfileLookup {
  constructor(private readonly view: ClientProfileView | undefined) {}
  findById(_a: AgencyId, _c: ClientId): Promise<ClientProfileView | undefined> {
    return Promise.resolve(this.view);
  }
}

import type { AgencyId } from '../shared/ids.js';
import type { MissionContract, MissionContractId } from './mission-contract.js';

export interface MissionContractRepository {
  save(contract: MissionContract): Promise<void>;
  findById(agencyId: AgencyId, id: MissionContractId): Promise<MissionContract | undefined>;
  findByProposalId(agencyId: AgencyId, proposalId: string): Promise<MissionContract | undefined>;
  findByReference(agencyId: AgencyId, reference: string): Promise<MissionContract | undefined>;
}

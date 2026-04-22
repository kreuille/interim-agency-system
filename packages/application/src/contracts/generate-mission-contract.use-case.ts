import { randomUUID } from 'node:crypto';
import {
  asMissionContractId,
  asMissionProposalId,
  MissionContract,
  validateRateAboveMinimum,
  type AgencyId,
  type CctMinimumRate,
  type ContractLegalSnapshot,
  type MissionContractRepository,
  type MissionProposalRepository,
} from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import type {
  AgencyProfileLookup,
  ClientProfileLookup,
  LseAuthorizationLookup,
  WeeklyHoursLookup,
  WorkPermitLookup,
} from './compliance-ports.js';

/**
 * Use case appelé par le handler webhook `worker.assignment.accepted`
 * (mise à jour de A3.4) ou par `AcceptOnBehalfUseCase` après transition
 * réussie. Génère le `MissionContract` en `draft` ou refuse avec un
 * code d'erreur précis.
 *
 * Idempotent : si un contrat existe déjà pour ce `proposalId`, renvoie
 * `{ status: 'duplicate' }`. L'unicité est garantie côté Postgres par
 * la contrainte `proposalId` unique sur `mission_contracts`.
 */

export type GenerateContractErrorKind =
  | 'proposal_not_found'
  | 'proposal_not_accepted'
  | 'proposal_missing_worker'
  | 'lse_authorization_missing'
  | 'lse_authorization_inactive'
  | 'lse_authorization_expires_before_mission_end'
  | 'work_permit_missing'
  | 'work_permit_invalid'
  | 'work_permit_expires_before_mission_end'
  | 'rate_below_cct_minimum'
  | 'weekly_hours_exceed_limit'
  | 'agency_profile_missing'
  | 'invalid_input';

export class GenerateContractError extends Error {
  constructor(
    public readonly kind: GenerateContractErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'GenerateContractError';
  }
}

export interface GenerateMissionContractInput {
  readonly agencyId: AgencyId;
  readonly proposalId: string;
  /** Heures hebdo prévues sur la mission (utile pour cumul LTr). */
  readonly weeklyHours: number;
  /** Branche CCT applicable. */
  readonly branch: string;
  /** Qualification CCT du worker (ex. "ouvrier_qualifie"). */
  readonly cctQualification: string;
  /** Tranche d'âge CCT (optionnel, dépend du barème). */
  readonly cctAgeBracket?: 'under_20' | 'twenty_plus' | 'fifty_plus';
  /**
   * Référentiel CCT à comparer. Le caller charge les rates valides à la
   * date du jour (typiquement depuis `cct_minimum_rates` Prisma).
   */
  readonly cctRates: readonly CctMinimumRate[];
}

export type GenerateMissionContractResult =
  | { readonly status: 'created'; readonly contractId: string; readonly reference: string }
  | { readonly status: 'duplicate'; readonly contractId: string };

export class GenerateMissionContractUseCase {
  constructor(
    private readonly proposals: MissionProposalRepository,
    private readonly contracts: MissionContractRepository,
    private readonly lse: LseAuthorizationLookup,
    private readonly permits: WorkPermitLookup,
    private readonly weeklyHours: WeeklyHoursLookup,
    private readonly agencyProfile: AgencyProfileLookup,
    private readonly clientProfile: ClientProfileLookup,
    private readonly clock: Clock,
    private readonly idFactory: () => string = randomUUID,
    private readonly referenceFactory: (now: Date) => string = defaultReference,
  ) {}

  async execute(
    input: GenerateMissionContractInput,
  ): Promise<Result<GenerateMissionContractResult, GenerateContractError>> {
    if (input.weeklyHours <= 0 || input.weeklyHours > 50) {
      return failure('invalid_input', `weeklyHours doit être > 0 et ≤ 50`);
    }

    // 1. Idempotency check
    const existing = await this.contracts.findByProposalId(input.agencyId, input.proposalId);
    if (existing) {
      return { ok: true, value: { status: 'duplicate', contractId: existing.id } };
    }

    // 2. Charge la proposal
    const proposal = await this.proposals.findById(
      input.agencyId,
      asMissionProposalId(input.proposalId),
    );
    if (!proposal) return failure('proposal_not_found', `Proposal ${input.proposalId} introuvable`);

    const propSnap = proposal.toSnapshot();
    if (proposal.state !== 'accepted') {
      return failure(
        'proposal_not_accepted',
        `Proposal en état ${proposal.state}, accepted requis`,
      );
    }
    if (!propSnap.workerId) {
      return failure('proposal_missing_worker', `Proposal ${input.proposalId} sans workerId`);
    }
    const workerId = propSnap.workerId;

    // 3. LSE active + couvre la fin de mission
    const lse = await this.lse.findByAgency(input.agencyId);
    if (!lse) return failure('lse_authorization_missing', `Agence sans autorisation LSE`);
    if (lse.status !== 'active') {
      return failure('lse_authorization_inactive', `LSE en état ${lse.status}, active requis`);
    }
    if (lse.expiresAt.getTime() <= propSnap.missionSnapshot.endsAt.getTime()) {
      return failure(
        'lse_authorization_expires_before_mission_end',
        `LSE expire ${lse.expiresAt.toISOString()} avant fin mission ${propSnap.missionSnapshot.endsAt.toISOString()}`,
      );
    }

    // 4. Permis worker valide + couvre la fin de mission
    const permit = await this.permits.findByWorker(input.agencyId, workerId);
    if (!permit) return failure('work_permit_missing', `Worker sans permis enregistré`);
    if (!permit.valid) return failure('work_permit_invalid', `Permis ${permit.category} invalide`);
    if (permit.expiresAt.getTime() <= propSnap.missionSnapshot.endsAt.getTime()) {
      return failure(
        'work_permit_expires_before_mission_end',
        `Permis expire ${permit.expiresAt.toISOString()} avant fin mission`,
      );
    }

    // 5. Taux ≥ CCT minimum applicable
    try {
      validateRateAboveMinimum(input.cctRates, {
        branch: input.branch,
        qualification: input.cctQualification,
        canton: propSnap.missionSnapshot.canton,
        ...(input.cctAgeBracket !== undefined ? { ageBracket: input.cctAgeBracket } : {}),
        at: propSnap.missionSnapshot.startsAt,
        proposedRappen: BigInt(propSnap.missionSnapshot.hourlyRateRappen),
      });
    } catch (err) {
      return failure(
        'rate_below_cct_minimum',
        err instanceof Error ? err.message : 'Taux sous CCT minimum',
      );
    }

    // 6. Cumul heures semaine ISO ≤ 50h
    const isoWeek = formatIsoYearWeek(propSnap.missionSnapshot.startsAt);
    const cumul = await this.weeklyHours.cumulHours({
      agencyId: input.agencyId,
      workerId,
      isoYearWeek: isoWeek,
    });
    if (cumul + input.weeklyHours > 50) {
      return failure(
        'weekly_hours_exceed_limit',
        `Cumul ${String(cumul)}h + ${String(input.weeklyHours)}h dépasse 50h/sem (LTr) sur ${isoWeek}`,
      );
    }

    // 7. Charge les profils agency + client (pour le snapshot légal)
    const agency = await this.agencyProfile.findById(input.agencyId);
    if (!agency) return failure('agency_profile_missing', `Agency profile introuvable`);
    let clientName = propSnap.missionSnapshot.clientName;
    let clientIde = '';
    if (propSnap.clientId) {
      const client = await this.clientProfile.findById(input.agencyId, propSnap.clientId);
      if (client) {
        clientName = client.name;
        clientIde = client.ide;
      }
    }

    // 8. Construit le snapshot légal
    const now = this.clock.now();
    const legal: ContractLegalSnapshot = {
      agencyName: agency.name,
      agencyIde: agency.ide,
      agencyLseAuthorization: lse.authorizationNumber,
      agencyLseExpiresAt: lse.expiresAt,
      clientName,
      clientIde,
      workerFirstName: '',
      workerLastName: '',
      workerAvs: '',
      missionTitle: propSnap.missionSnapshot.title,
      siteAddress: propSnap.missionSnapshot.siteAddress,
      canton: propSnap.missionSnapshot.canton,
      cctReference: propSnap.missionSnapshot.cctReference ?? input.branch,
      hourlyRateRappen: propSnap.missionSnapshot.hourlyRateRappen,
      startsAt: propSnap.missionSnapshot.startsAt,
      endsAt: propSnap.missionSnapshot.endsAt,
      weeklyHours: input.weeklyHours,
    };

    const contract = MissionContract.create({
      id: asMissionContractId(this.idFactory()),
      agencyId: input.agencyId,
      workerId,
      ...(propSnap.clientId !== undefined ? { clientId: propSnap.clientId } : {}),
      proposalId: input.proposalId,
      reference: this.referenceFactory(now),
      branch: input.branch,
      legal,
      clock: this.clock,
    });

    await this.contracts.save(contract);

    return {
      ok: true,
      value: { status: 'created', contractId: contract.id, reference: contract.reference },
    };
  }
}

function failure(
  kind: GenerateContractErrorKind,
  message: string,
): { readonly ok: false; readonly error: GenerateContractError } {
  return { ok: false, error: new GenerateContractError(kind, message) };
}

function defaultReference(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `MC-${String(y)}-${m}-${random}`;
}

/**
 * Format ISO 8601 semaine : `YYYY-Www`. Algorithme standard (jeudi de
 * la semaine cible).
 */
function formatIsoYearWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${String(d.getUTCFullYear())}-W${String(weekNo).padStart(2, '0')}`;
}

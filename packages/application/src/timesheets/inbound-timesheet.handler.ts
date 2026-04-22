import {
  asAgencyId,
  asClientId,
  asMissionContractId,
  asStaffId,
  type TimesheetEntry,
} from '@interim/domain';
import type {
  InboundWebhookContext,
  InboundWebhookHandler,
} from '../webhooks/webhook-event-dispatcher.js';
import type {
  InboundTimesheetEventType,
  RecordInboundTimesheetInput,
  RecordInboundTimesheetUseCase,
} from './record-inbound-timesheet.use-case.js';

/**
 * Handler des webhooks `timesheet.draft`, `timesheet.ready_for_signature`
 * et `timesheet.tacitly_validated`. Wire dans le dispatcher MP :
 *
 *   dispatcher.register('timesheet.draft', new InboundTimesheetHandler(...))
 *   dispatcher.register('timesheet.ready_for_signature', new InboundTimesheetHandler(...))
 *   dispatcher.register('timesheet.tacitly_validated', new InboundTimesheetHandler(...))
 *
 * Parse le payload (forme MP cf. docs/02-partners-specification.md §6),
 * mappe vers `RecordInboundTimesheetInput`, délègue.
 *
 * Le caller (controller webhook) doit avoir déjà validé HMAC + extrait
 * agencyId (multi-tenant ou single-tenant).
 *
 * Si parsing/mapping échoue → throw : le dispatcher loggera et le
 * webhook MP retentera (idempotent côté record use case).
 */

export class InvalidTimesheetWebhookPayload extends Error {
  constructor(reason: string) {
    super(`Invalid timesheet webhook payload: ${reason}`);
    this.name = 'InvalidTimesheetWebhookPayload';
  }
}

export interface InboundTimesheetHandlerDeps {
  readonly recordUseCase: RecordInboundTimesheetUseCase;
  /** Si l'agencyId vient de l'URL multi-tenant, override le payload. */
  readonly agencyIdOverride?: string;
  /** Lookup taux CCT minimum (optionnel — sinon check skippé côté détecteur). */
  readonly cctMinimumLookup?: (input: {
    canton: string;
    branch?: string;
  }) => Promise<number | undefined>;
}

interface MpTimesheetWebhookPayload {
  readonly agencyId?: string;
  readonly timesheetId: string;
  readonly workerId: string;
  readonly clientId: string;
  readonly missionContractId?: string;
  readonly canton?: string;
  readonly branch?: string;
  readonly hourlyRateRappen: number;
  readonly entries: readonly {
    readonly workDate: string; // ISO date
    readonly plannedStart: string;
    readonly plannedEnd: string;
    readonly actualStart: string;
    readonly actualEnd: string;
    readonly breakMinutes: number;
  }[];
}

const VALID_EVENT_TYPES: ReadonlySet<InboundTimesheetEventType> = new Set([
  'timesheet.draft',
  'timesheet.ready_for_signature',
  'timesheet.tacitly_validated',
]);

export class InboundTimesheetHandler implements InboundWebhookHandler {
  constructor(private readonly deps: InboundTimesheetHandlerDeps) {}

  async handle(ctx: InboundWebhookContext): Promise<void> {
    if (!isValidEventType(ctx.eventType)) {
      throw new InvalidTimesheetWebhookPayload(`event-type non géré: ${ctx.eventType}`);
    }
    const payload = parsePayload(ctx.payload);
    const agencyIdRaw = this.deps.agencyIdOverride ?? payload.agencyId;
    if (!agencyIdRaw) {
      throw new InvalidTimesheetWebhookPayload(
        'agencyId requis (URL multi-tenant ou payload.agencyId)',
      );
    }
    const agencyId = asAgencyId(agencyIdRaw);

    const cctMinimumRateRappen = await this.resolveCctMinimum(payload);

    const entries: TimesheetEntry[] = payload.entries.map((e) => ({
      workDate: parseDate(e.workDate, 'workDate'),
      plannedStart: parseDate(e.plannedStart, 'plannedStart'),
      plannedEnd: parseDate(e.plannedEnd, 'plannedEnd'),
      actualStart: parseDate(e.actualStart, 'actualStart'),
      actualEnd: parseDate(e.actualEnd, 'actualEnd'),
      breakMinutes: e.breakMinutes,
    }));

    const input: RecordInboundTimesheetInput = {
      agencyId,
      externalTimesheetId: payload.timesheetId,
      workerId: asStaffId(payload.workerId),
      clientId: asClientId(payload.clientId),
      ...(payload.missionContractId
        ? { missionContractId: asMissionContractId(payload.missionContractId) }
        : {}),
      entries,
      hourlyRateRappen: payload.hourlyRateRappen,
      ...(cctMinimumRateRappen !== undefined ? { cctMinimumRateRappen } : {}),
      eventType: ctx.eventType,
    };
    const result = await this.deps.recordUseCase.execute(input);
    if (!result.ok) {
      throw new InvalidTimesheetWebhookPayload(
        `record failed: ${result.error.kind} ${result.error.message}`,
      );
    }
  }

  private async resolveCctMinimum(payload: MpTimesheetWebhookPayload): Promise<number | undefined> {
    if (!this.deps.cctMinimumLookup || !payload.canton) return undefined;
    return this.deps.cctMinimumLookup({
      canton: payload.canton,
      ...(payload.branch ? { branch: payload.branch } : {}),
    });
  }
}

function isValidEventType(eventType: string): eventType is InboundTimesheetEventType {
  return VALID_EVENT_TYPES.has(eventType as InboundTimesheetEventType);
}

function parsePayload(raw: unknown): MpTimesheetWebhookPayload {
  if (!raw || typeof raw !== 'object') {
    throw new InvalidTimesheetWebhookPayload('payload doit être un objet');
  }
  const p = raw as Record<string, unknown>;
  if (typeof p.timesheetId !== 'string') {
    throw new InvalidTimesheetWebhookPayload('timesheetId manquant ou invalide');
  }
  if (typeof p.workerId !== 'string') {
    throw new InvalidTimesheetWebhookPayload('workerId manquant');
  }
  if (typeof p.clientId !== 'string') {
    throw new InvalidTimesheetWebhookPayload('clientId manquant');
  }
  if (typeof p.hourlyRateRappen !== 'number' || p.hourlyRateRappen <= 0) {
    throw new InvalidTimesheetWebhookPayload('hourlyRateRappen invalide');
  }
  if (!Array.isArray(p.entries) || p.entries.length === 0) {
    throw new InvalidTimesheetWebhookPayload('entries vide');
  }
  return p as unknown as MpTimesheetWebhookPayload;
}

function parseDate(raw: string, field: string): Date {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new InvalidTimesheetWebhookPayload(`${field} : date invalide "${raw}"`);
  }
  return d;
}

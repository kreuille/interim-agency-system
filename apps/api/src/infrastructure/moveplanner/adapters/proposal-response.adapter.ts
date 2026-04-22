import { ProposalMpError, type ProposalMpResponsePort } from '@interim/application';
import type { Result } from '@interim/shared';
import type { AssignmentResponseAdapter } from './assignment-response.adapter.js';

/**
 * Bridge entre l'adapter HTTP générique `AssignmentResponseAdapter`
 * (créé en A2.4) et le port domaine `ProposalMpResponsePort`.
 *
 * Mappage `MpError` → `ProposalMpError` :
 *   - `client_error | cert_invalid | circuit_open` → permanent
 *   - `server_error | network | rate_limited`     → transient
 */
export class HttpProposalMpResponsePort implements ProposalMpResponsePort {
  constructor(private readonly adapter: AssignmentResponseAdapter) {}

  async notifyAccepted(input: {
    externalRequestId: string;
    idempotencyKey: string;
    notes?: string;
  }): Promise<Result<{ recorded: true }, ProposalMpError>> {
    const result = await this.adapter.respond(
      input.externalRequestId,
      {
        decision: 'accepted',
        ...(input.notes !== undefined ? { reason: input.notes } : {}),
      },
      input.idempotencyKey,
    );
    if (result.ok) return { ok: true, value: { recorded: true } };
    return { ok: false, error: mapMpError(result.error) };
  }

  async notifyRefused(input: {
    externalRequestId: string;
    idempotencyKey: string;
    reason: string;
    counterproposal?: { dateFrom: string; dateTo: string };
  }): Promise<Result<{ recorded: true }, ProposalMpError>> {
    const result = await this.adapter.respond(
      input.externalRequestId,
      {
        decision: 'refused',
        reason: input.reason,
        ...(input.counterproposal !== undefined ? { counterproposal: input.counterproposal } : {}),
      },
      input.idempotencyKey,
    );
    if (result.ok) return { ok: true, value: { recorded: true } };
    return { ok: false, error: mapMpError(result.error) };
  }
}

function mapMpError(err: { kind: string; message: string }): ProposalMpError {
  if (err.kind === 'client_error' || err.kind === 'cert_invalid' || err.kind === 'circuit_open') {
    return new ProposalMpError('permanent', err.message);
  }
  return new ProposalMpError('transient', err.message);
}

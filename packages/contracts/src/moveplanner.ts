/**
 * Contrats MovePlanner — DTOs typés du sous-ensemble d'API que l'agence consomme.
 *
 * Source de vérité : `docs/02-partners-specification.md §7` (intégration MP).
 * Les types miroirent l'OpenAPI MP. Quand MP publie un changement (ex. v2),
 * mettre à jour ces DTOs avant de coder côté agence.
 *
 * Note : pas de génération automatique pour l'instant (pas d'OpenAPI yaml
 * dans le repo) → DETTE-028 quand l'OpenAPI sera publié.
 */

// ============================================================
// Worker push
// ============================================================
export interface MpWorkerPushBody {
  readonly externalRef: string; // staffId côté agence
  readonly firstName: string;
  readonly lastName: string;
  readonly avs: string; // 756.XXXX.XXXX.XX
  readonly residenceCanton: string; // ZH, GE, ...
  readonly email?: string;
  readonly phone?: string;
}

export interface MpWorkerPushResponse {
  readonly accepted: boolean;
  readonly staffId: string;
  readonly echo?: unknown;
}

// ============================================================
// Availability push (slots batch)
// ============================================================
export interface MpAvailabilitySlot {
  readonly slotId: string;
  readonly dateFrom: string; // ISO 8601 UTC
  readonly dateTo: string;
  readonly status: 'available' | 'tentative' | 'unavailable';
  readonly source: 'internal' | 'worker_self' | 'api' | 'moveplanner_push';
  readonly reason?: string;
}

export interface MpAvailabilityPushBody {
  readonly slots: readonly MpAvailabilitySlot[];
}

export interface MpAvailabilityPushResponse {
  readonly accepted: number;
  readonly rejected: number;
  readonly errors?: readonly { readonly slotId: string; readonly reason: string }[];
}

// ============================================================
// Assignment response (accept / refuse)
// ============================================================
export interface MpAssignmentResponseBody {
  readonly decision: 'accepted' | 'refused';
  readonly reason?: string;
  readonly counterproposal?: {
    readonly dateFrom: string;
    readonly dateTo: string;
  };
}

export interface MpAssignmentResponseResult {
  readonly recorded: boolean;
}

// ============================================================
// Timesheet sign
// ============================================================
export interface MpTimesheetSignBody {
  readonly approvedBy: string; // userId agence
  readonly approvedAt: string; // ISO 8601 UTC
  readonly notes?: string;
}

export interface MpTimesheetSignResult {
  readonly signed: boolean;
  readonly signedAt: string;
}

// ============================================================
// Timesheets fetch
// ============================================================
export interface MpTimesheetItem {
  readonly id: string;
  readonly staffId: string;
  readonly weekIso: string; // ex. "2026-W19"
  readonly hours: readonly {
    readonly day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
    readonly start: string; // HH:MM
    readonly end: string;
    readonly breakMinutes: number;
  }[];
  readonly status: 'draft' | 'ready_for_signature' | 'signed' | 'disputed';
}

export interface MpTimesheetsListResponse {
  readonly data: readonly MpTimesheetItem[];
}

// ============================================================
// Erreurs MP (formes possibles)
// ============================================================
export interface MpErrorBody {
  readonly error: string;
  readonly message?: string;
  readonly retryable?: boolean;
}

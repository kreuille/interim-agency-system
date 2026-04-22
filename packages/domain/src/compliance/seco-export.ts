/**
 * Bundle de contrôle SECO (A6.2).
 *
 * Format demandé lors d'un contrôle d'inspectorat cantonal du marché
 * du travail (LSE art. 14 + OLEH) : registre des intérimaires placés,
 * missions actives, contrats, timesheets, copie autorisation LSE.
 *
 * Ce module produit la structure de données + 4 CSV (1 par catégorie)
 * UTF-8 BOM pour compatibilité Excel CH (séparateur point-virgule
 * recommandé). Le bundle ZIP + PDF de synthèse est construit côté
 * infra (DETTE-100 : `SecoExportBundleAssembler`).
 */

export interface SecoExportRange {
  readonly fromIso: string; // YYYY-MM-DD inclusive
  readonly toIso: string; // YYYY-MM-DD inclusive
}

export interface SecoWorkerRow {
  readonly workerId: string;
  readonly lastName: string;
  readonly firstName: string;
  readonly avs: string;
  readonly permit: string;
  readonly canton: string;
  readonly registeredAtIso: string;
  readonly activeMissionsCount: number;
}

export interface SecoMissionRow {
  readonly missionContractId: string;
  readonly reference: string;
  readonly workerId: string;
  readonly clientName: string;
  readonly canton: string;
  readonly cctReference: string;
  readonly hourlyRateRappen: number;
  readonly startsAtIso: string;
  readonly endsAtIso: string;
  readonly state: string;
}

export interface SecoContractRow {
  readonly missionContractId: string;
  readonly reference: string;
  readonly signedAtIso: string | null;
  readonly signedPdfKey: string | null;
  readonly zertesEnvelopeId: string | null;
}

export interface SecoTimesheetRow {
  readonly timesheetId: string;
  readonly externalTimesheetId: string;
  readonly workerId: string;
  readonly clientName: string;
  readonly weekIso: string;
  readonly totalMinutes: number;
  readonly state: string;
  readonly anomaliesCount: number;
  readonly receivedAtIso: string;
}

export interface SecoLseInfo {
  readonly authorization: 'cantonal' | 'federal' | 'both' | 'none';
  readonly authorizationNumber: string | null;
  readonly issuedByCanton: string | null;
  readonly validFromIso: string | null;
  readonly validUntilIso: string | null;
}

export interface SecoExportBundle {
  readonly agencyId: string;
  readonly agencyName: string;
  readonly range: SecoExportRange;
  readonly generatedAtIso: string;
  readonly lse: SecoLseInfo;
  readonly workers: readonly SecoWorkerRow[];
  readonly missions: readonly SecoMissionRow[];
  readonly contracts: readonly SecoContractRow[];
  readonly timesheets: readonly SecoTimesheetRow[];
  readonly stats: SecoExportStats;
}

export interface SecoExportStats {
  readonly workersCount: number;
  readonly activeMissionsCount: number;
  readonly signedContractsCount: number;
  readonly timesheetsCount: number;
  readonly timesheetsTotalHours: number;
  readonly anomaliesTotal: number;
}

export interface SecoCsvFile {
  readonly filename: string;
  /** Contenu UTF-8 avec BOM `\uFEFF` (Excel CH friendly). */
  readonly content: string;
}

export interface SecoCsvBundle {
  readonly summaryTxt: SecoCsvFile;
  readonly workers: SecoCsvFile;
  readonly missions: SecoCsvFile;
  readonly contracts: SecoCsvFile;
  readonly timesheets: SecoCsvFile;
}

const BOM = '\uFEFF';
const SEP = ';';

/**
 * Génère 4 CSV + 1 résumé text à partir du bundle.
 * Pure function : déterministe, lf, UTF-8 + BOM.
 */
export function buildSecoCsvBundle(bundle: SecoExportBundle): SecoCsvBundle {
  return {
    summaryTxt: {
      filename: 'SECO-resume.txt',
      content: buildSummaryTxt(bundle),
    },
    workers: {
      filename: 'workers.csv',
      content:
        BOM +
        toCsv(
          [
            'workerId',
            'lastName',
            'firstName',
            'avs',
            'permit',
            'canton',
            'registeredAt',
            'activeMissions',
          ],
          bundle.workers.map((w) => [
            w.workerId,
            w.lastName,
            w.firstName,
            w.avs,
            w.permit,
            w.canton,
            w.registeredAtIso,
            String(w.activeMissionsCount),
          ]),
        ),
    },
    missions: {
      filename: 'missions.csv',
      content:
        BOM +
        toCsv(
          [
            'missionContractId',
            'reference',
            'workerId',
            'clientName',
            'canton',
            'cctReference',
            'hourlyRateChf',
            'startsAt',
            'endsAt',
            'state',
          ],
          bundle.missions.map((m) => [
            m.missionContractId,
            m.reference,
            m.workerId,
            m.clientName,
            m.canton,
            m.cctReference,
            (m.hourlyRateRappen / 100).toFixed(2),
            m.startsAtIso,
            m.endsAtIso,
            m.state,
          ]),
        ),
    },
    contracts: {
      filename: 'contracts.csv',
      content:
        BOM +
        toCsv(
          ['missionContractId', 'reference', 'signedAt', 'signedPdfKey', 'zertesEnvelopeId'],
          bundle.contracts.map((c) => [
            c.missionContractId,
            c.reference,
            c.signedAtIso ?? '',
            c.signedPdfKey ?? '',
            c.zertesEnvelopeId ?? '',
          ]),
        ),
    },
    timesheets: {
      filename: 'timesheets.csv',
      content:
        BOM +
        toCsv(
          [
            'timesheetId',
            'externalId',
            'workerId',
            'clientName',
            'weekIso',
            'totalHours',
            'state',
            'anomaliesCount',
            'receivedAt',
          ],
          bundle.timesheets.map((t) => [
            t.timesheetId,
            t.externalTimesheetId,
            t.workerId,
            t.clientName,
            t.weekIso,
            (t.totalMinutes / 60).toFixed(2),
            t.state,
            String(t.anomaliesCount),
            t.receivedAtIso,
          ]),
        ),
    },
  };
}

function buildSummaryTxt(b: SecoExportBundle): string {
  const lines: string[] = [];
  lines.push('=================================================');
  lines.push("CONTRÔLE SECO — Bundle d'export");
  lines.push('=================================================');
  lines.push(`Agence : ${b.agencyName} (${b.agencyId})`);
  lines.push(`Période : ${b.range.fromIso} → ${b.range.toIso}`);
  lines.push(`Généré le : ${b.generatedAtIso}`);
  lines.push('');
  lines.push('--- Autorisation LSE ---');
  lines.push(`Type : ${b.lse.authorization}`);
  if (b.lse.authorizationNumber) lines.push(`Numéro : ${b.lse.authorizationNumber}`);
  if (b.lse.issuedByCanton) lines.push(`Émise par : ${b.lse.issuedByCanton}`);
  if (b.lse.validFromIso) lines.push(`Valide depuis : ${b.lse.validFromIso}`);
  if (b.lse.validUntilIso) lines.push(`Valide jusqu'au : ${b.lse.validUntilIso}`);
  lines.push('');
  lines.push('--- Statistiques ---');
  lines.push(`Workers placés : ${String(b.stats.workersCount)}`);
  lines.push(`Missions actives : ${String(b.stats.activeMissionsCount)}`);
  lines.push(`Contrats signés : ${String(b.stats.signedContractsCount)}`);
  lines.push(`Timesheets : ${String(b.stats.timesheetsCount)}`);
  lines.push(`Total heures : ${b.stats.timesheetsTotalHours.toFixed(2)} h`);
  lines.push(`Anomalies détectées : ${String(b.stats.anomaliesTotal)}`);
  lines.push('');
  lines.push('--- Fichiers joints ---');
  lines.push('workers.csv      : registre des intérimaires placés');
  lines.push('missions.csv     : missions actives sur la période');
  lines.push('contracts.csv    : contrats de mission (avec PDF signés)');
  lines.push('timesheets.csv   : feuilles de temps signées/tacit');
  lines.push('');
  lines.push('Format CSV : UTF-8 BOM, séparateur ; (compatible Excel CH).');
  lines.push('');
  return lines.join('\n');
}

function toCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const all = [headers, ...rows];
  return all.map((r) => r.map(escapeCsvSemi).join(SEP)).join('\n') + '\n';
}

function escapeCsvSemi(value: string): string {
  if (value.includes('"') || value.includes(';') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

/**
 * Calcule les stats à partir des rows fournies. Pure function.
 */
export function computeSecoStats(input: {
  readonly workers: readonly SecoWorkerRow[];
  readonly missions: readonly SecoMissionRow[];
  readonly contracts: readonly SecoContractRow[];
  readonly timesheets: readonly SecoTimesheetRow[];
}): SecoExportStats {
  return {
    workersCount: input.workers.length,
    activeMissionsCount: input.missions.filter(
      (m) => m.state === 'sent_for_signature' || m.state === 'signed',
    ).length,
    signedContractsCount: input.contracts.filter((c) => c.signedAtIso !== null).length,
    timesheetsCount: input.timesheets.length,
    timesheetsTotalHours: input.timesheets.reduce((sum, t) => sum + t.totalMinutes / 60, 0),
    anomaliesTotal: input.timesheets.reduce((sum, t) => sum + t.anomaliesCount, 0),
  };
}

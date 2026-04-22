import { Iban } from '@interim/shared';
import { DomainError } from '../workers/errors.js';
import type { BuildPain001Input, PaymentInstruction } from './pain001-types.js';

/**
 * Construit le XML pain.001.001.09 CH à partir d'un batch de virements.
 *
 * Pure function : déterministe, agnostique de l'OS (lf au lieu de crlf
 * pour reproductibilité), aucun appel I/O.
 *
 * Validations en amont :
 *   - Au moins 1 instruction.
 *   - Tous les IBAN (debtor + creditors) sont valides via mod-97.
 *   - Tous les montants sont > 0n.
 *   - messageId / paymentInfoId / instructionId / endToEndId ≤ 35 chars.
 *   - remittanceInfo ≤ 140 chars.
 *   - requestedExecutionDate au format YYYY-MM-DD.
 *
 * Calcule automatiquement :
 *   - GrpHdr/NbOfTxs : count
 *   - GrpHdr/CtrlSum et PmtInf/CtrlSum : somme avec format CHF 2 décimales
 *
 * Sortie : string XML UTF-8 sans BOM, indenté 2 espaces, lf.
 *
 * Closes A5.6 (DoD : génération + validation structurelle).
 */

export class Pain001ValidationError extends DomainError {
  constructor(reason: string) {
    super('pain001_validation_error', `pain.001 validation: ${reason}`);
  }
}

const PAIN001_NS = 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.09';

const MAX_ID_LENGTH = 35;
const MAX_REMITTANCE_LENGTH = 140;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface Pain001BuildResult {
  readonly xml: string;
  readonly numberOfTransactions: number;
  readonly controlSumChf: string;
  readonly messageId: string;
}

export function buildPain001Xml(input: BuildPain001Input): Pain001BuildResult {
  validate(input);

  const ctrlSumRappen = input.instructions.reduce((sum, i) => sum + i.amountRappen, 0n);
  const ctrlSumChf = formatChf(ctrlSumRappen);
  const nbOfTxs = input.instructions.length;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<Document xmlns="${PAIN001_NS}">`);
  lines.push('  <CstmrCdtTrfInitn>');

  // Group Header
  lines.push('    <GrpHdr>');
  lines.push(`      <MsgId>${escapeXml(input.messageId)}</MsgId>`);
  lines.push(`      <CreDtTm>${escapeXml(input.creationDateTime)}</CreDtTm>`);
  lines.push(`      <NbOfTxs>${String(nbOfTxs)}</NbOfTxs>`);
  lines.push(`      <CtrlSum>${ctrlSumChf}</CtrlSum>`);
  lines.push('      <InitgPty>');
  lines.push(`        <Nm>${escapeXml(input.debtor.name)}</Nm>`);
  lines.push('      </InitgPty>');
  lines.push('    </GrpHdr>');

  // Payment Information block
  lines.push('    <PmtInf>');
  lines.push(`      <PmtInfId>${escapeXml(input.paymentInfoId)}</PmtInfId>`);
  lines.push('      <PmtMtd>TRF</PmtMtd>');
  lines.push(`      <NbOfTxs>${String(nbOfTxs)}</NbOfTxs>`);
  lines.push(`      <CtrlSum>${ctrlSumChf}</CtrlSum>`);
  lines.push('      <PmtTpInf>');
  lines.push(`        <SvcLvl><Cd>${input.serviceLevel ?? 'SEPA'}</Cd></SvcLvl>`);
  lines.push(`        <CtgyPurp><Cd>${input.categoryPurpose ?? 'SALA'}</Cd></CtgyPurp>`);
  lines.push('      </PmtTpInf>');
  lines.push('      <ReqdExctnDt>');
  lines.push(`        <Dt>${escapeXml(input.requestedExecutionDate)}</Dt>`);
  lines.push('      </ReqdExctnDt>');
  lines.push('      <Dbtr>');
  lines.push(`        <Nm>${escapeXml(input.debtor.name)}</Nm>`);
  lines.push('      </Dbtr>');
  lines.push('      <DbtrAcct>');
  lines.push(`        <Id><IBAN>${stripIban(input.debtor.iban)}</IBAN></Id>`);
  lines.push('      </DbtrAcct>');
  if (input.debtor.bicfi) {
    lines.push('      <DbtrAgt>');
    lines.push(`        <FinInstnId><BICFI>${escapeXml(input.debtor.bicfi)}</BICFI></FinInstnId>`);
    lines.push('      </DbtrAgt>');
  } else {
    lines.push(
      '      <DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>',
    );
  }

  // One CdtTrfTxInf per instruction
  for (const instr of input.instructions) {
    lines.push('      <CdtTrfTxInf>');
    lines.push('        <PmtId>');
    lines.push(`          <InstrId>${escapeXml(instr.instructionId)}</InstrId>`);
    lines.push(`          <EndToEndId>${escapeXml(instr.endToEndId)}</EndToEndId>`);
    lines.push('        </PmtId>');
    lines.push('        <Amt>');
    lines.push(`          <InstdAmt Ccy="CHF">${formatChf(instr.amountRappen)}</InstdAmt>`);
    lines.push('        </Amt>');
    if (instr.creditor.bicfi) {
      lines.push('        <CdtrAgt>');
      lines.push(
        `          <FinInstnId><BICFI>${escapeXml(instr.creditor.bicfi)}</BICFI></FinInstnId>`,
      );
      lines.push('        </CdtrAgt>');
    }
    lines.push('        <Cdtr>');
    lines.push(`          <Nm>${escapeXml(instr.creditor.name)}</Nm>`);
    lines.push('        </Cdtr>');
    lines.push('        <CdtrAcct>');
    lines.push(`          <Id><IBAN>${stripIban(instr.creditor.iban)}</IBAN></Id>`);
    lines.push('        </CdtrAcct>');
    lines.push('        <RmtInf>');
    lines.push(`          <Ustrd>${escapeXml(instr.remittanceInfo)}</Ustrd>`);
    lines.push('        </RmtInf>');
    lines.push('      </CdtTrfTxInf>');
  }

  lines.push('    </PmtInf>');
  lines.push('  </CstmrCdtTrfInitn>');
  lines.push('</Document>');

  return {
    xml: lines.join('\n') + '\n',
    numberOfTransactions: nbOfTxs,
    controlSumChf: ctrlSumChf,
    messageId: input.messageId,
  };
}

function validate(input: BuildPain001Input): void {
  if (input.instructions.length === 0) {
    throw new Pain001ValidationError('au moins 1 instruction requise');
  }
  if (input.instructions.length > 99_999) {
    throw new Pain001ValidationError('max 99 999 instructions par batch');
  }
  if (!isStringLenWithin(input.messageId, 1, MAX_ID_LENGTH)) {
    throw new Pain001ValidationError(`messageId invalide (1-${String(MAX_ID_LENGTH)} chars)`);
  }
  if (!isStringLenWithin(input.paymentInfoId, 1, MAX_ID_LENGTH)) {
    throw new Pain001ValidationError(`paymentInfoId invalide (1-${String(MAX_ID_LENGTH)} chars)`);
  }
  if (!ISO_DATE_REGEX.test(input.requestedExecutionDate)) {
    throw new Pain001ValidationError(
      `requestedExecutionDate format YYYY-MM-DD requis, reçu "${input.requestedExecutionDate}"`,
    );
  }
  if (!Iban.isValid(stripIban(input.debtor.iban))) {
    throw new Pain001ValidationError(`IBAN debtor invalide: ${input.debtor.iban}`);
  }
  for (const i of input.instructions) {
    validateInstruction(i);
  }
}

function validateInstruction(i: PaymentInstruction): void {
  if (!isStringLenWithin(i.instructionId, 1, MAX_ID_LENGTH)) {
    throw new Pain001ValidationError(
      `instructionId invalide (1-${String(MAX_ID_LENGTH)} chars): ${i.instructionId}`,
    );
  }
  if (!isStringLenWithin(i.endToEndId, 1, MAX_ID_LENGTH)) {
    throw new Pain001ValidationError(
      `endToEndId invalide (1-${String(MAX_ID_LENGTH)} chars): ${i.endToEndId}`,
    );
  }
  if (i.amountRappen <= 0n) {
    throw new Pain001ValidationError(
      `amountRappen doit être > 0 pour ${i.instructionId} (reçu ${i.amountRappen.toString()})`,
    );
  }
  if (!Iban.isValid(stripIban(i.creditor.iban))) {
    throw new Pain001ValidationError(
      `IBAN creditor invalide pour ${i.instructionId}: ${i.creditor.iban}`,
    );
  }
  if (i.remittanceInfo.length > MAX_REMITTANCE_LENGTH) {
    throw new Pain001ValidationError(
      `remittanceInfo > ${String(MAX_REMITTANCE_LENGTH)} chars pour ${i.instructionId}`,
    );
  }
}

function isStringLenWithin(s: string, min: number, max: number): boolean {
  return typeof s === 'string' && s.length >= min && s.length <= max;
}

/** Convertit rappen → "1234.56" (2 décimales obligatoires, point décimal). */
export function formatChf(rappen: bigint): string {
  const sign = rappen < 0n ? '-' : '';
  const abs = rappen < 0n ? -rappen : rappen;
  const chf = abs / 100n;
  const cents = abs % 100n;
  return `${sign}${chf.toString()}.${cents.toString().padStart(2, '0')}`;
}

/** Strip whitespace de l'IBAN (XML pain attend IBAN compact sans espaces). */
export function stripIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase();
}

const XML_ESCAPE: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function escapeXml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => XML_ESCAPE[ch] ?? ch);
}

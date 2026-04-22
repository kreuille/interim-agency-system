import { DomainError } from '../workers/errors.js';

/**
 * QR Reference (QRR) = 27 chiffres avec check digit mod-10 récursif.
 *
 * Spec : SIX QR-bill Payment Reference Guide v2.3 §5.4.2
 *   - 26 chiffres de données + 1 chiffre de contrôle
 *   - Calcul via table "modulo 10 rekursiv" (table DIN EN ISO 3166)
 *   - Peut inclure QR-IBAN (CH + 5 chiffres spécifiques 30000-31999)
 *
 * Format structuré recommandé pour intérim :
 *   - 6 chiffres : agency code (padded)
 *   - 4 chiffres : year YYYY
 *   - 6 chiffres : invoice number padded
 *   - 10 chiffres : client ID padded
 *   - 1 chiffre : check digit
 *   = 27 chiffres total
 */

const QRR_LENGTH = 27;
const MOD10_TABLE: readonly number[] = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];

export class InvalidQrReference extends DomainError {
  constructor(reason: string) {
    super('invalid_qr_reference', reason);
  }
}

/**
 * Calcule le check digit mod-10 recursif pour les 26 premiers chiffres.
 * @param data26 string de 26 chiffres exactement
 * @returns chiffre 0-9
 */
export function computeMod10Recursive(data26: string): number {
  if (!/^\d{26}$/.test(data26)) {
    throw new InvalidQrReference(
      `data26 doit contenir exactement 26 chiffres, reçu "${data26}" (${String(data26.length)} chars)`,
    );
  }
  let remainder = 0;
  for (const char of data26) {
    const digit = Number.parseInt(char, 10);
    const tableIdx = (remainder + digit) % 10;
    remainder = MOD10_TABLE[tableIdx] ?? 0;
  }
  return (10 - remainder) % 10;
}

/**
 * Construit une QRR complète : data + check digit final.
 */
export function buildQrReference(data26: string): string {
  const check = computeMod10Recursive(data26);
  return `${data26}${String(check)}`;
}

/**
 * Valide une QRR 27 chiffres : vérifie longueur + check digit.
 */
export function isValidQrReference(qrr: string): boolean {
  if (!/^\d{27}$/.test(qrr)) return false;
  const data = qrr.slice(0, 26);
  const expected = computeMod10Recursive(data);
  return Number.parseInt(qrr.charAt(26), 10) === expected;
}

/**
 * Format structuré pour intérim :
 *   agencyCode(6) | year(4) | invoiceNo(6) | clientCode(10) | checkDigit(1)
 *
 * Entrées :
 *   - agencyCode : string jusqu'à 6 chiffres (padded left avec 0)
 *   - year : YYYY
 *   - invoiceNumber : entier, paddé à 6 chiffres
 *   - clientCode : string jusqu'à 10 chiffres (derive d'un hash/ID client si non numérique)
 */
export interface BuildInterimQrrInput {
  readonly agencyCode: string;
  readonly year: number;
  readonly invoiceNumber: number;
  readonly clientCode: string;
}

export function buildInterimQrReference(input: BuildInterimQrrInput): string {
  const agency = padLeft(onlyDigits(input.agencyCode), 6);
  const year = padLeft(String(input.year), 4);
  if (year.length !== 4 || !/^\d{4}$/.test(year)) {
    throw new InvalidQrReference(`year doit être YYYY, reçu ${String(input.year)}`);
  }
  if (
    !Number.isInteger(input.invoiceNumber) ||
    input.invoiceNumber < 0 ||
    input.invoiceNumber > 999_999
  ) {
    throw new InvalidQrReference(
      `invoiceNumber doit être entier dans [0, 999'999], reçu ${String(input.invoiceNumber)}`,
    );
  }
  const invoice = padLeft(String(input.invoiceNumber), 6);
  const client = padLeft(onlyDigits(input.clientCode), 10);
  const data26 = `${agency}${year}${invoice}${client}`;
  if (data26.length !== 26) {
    throw new InvalidQrReference(
      `data26 composé incorrect (${String(data26.length)} chars) : "${data26}"`,
    );
  }
  return buildQrReference(data26);
}

/**
 * Formate la QRR avec des espaces tous les 5 chiffres (format lisible
 * humain, utilisé sur le bulletin de versement QR-bill).
 * Exemple : `21000 00000 00003 13947 14300 09017`
 */
export function formatQrReference(qrr: string): string {
  if (!/^\d{27}$/.test(qrr)) return qrr;
  return `${qrr.slice(0, 2)} ${qrr.slice(2, 7)} ${qrr.slice(7, 12)} ${qrr.slice(
    12,
    17,
  )} ${qrr.slice(17, 22)} ${qrr.slice(22, 27)}`;
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, '');
}

function padLeft(s: string, length: number): string {
  if (s.length >= length) return s.slice(-length);
  return '0'.repeat(length - s.length) + s;
}

export const QRR_LENGTH_CONST = QRR_LENGTH;

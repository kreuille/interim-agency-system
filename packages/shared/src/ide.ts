const IDE_FORMAT = /^CHE-\d{3}\.\d{3}\.\d{3}$/;
const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4];

/**
 * Numéro IDE (Identifiant des Entreprises) suisse.
 * Format `CHE-XXX.XXX.XXX` avec checksum mod 11 sur les 8 premiers chiffres.
 *
 * Source : OFS (Office fédéral de la statistique).
 */
export class Ide {
  private constructor(public readonly normalized: string) {}

  static parse(input: string): Ide {
    const trimmed = input.trim().toUpperCase();
    if (!IDE_FORMAT.test(trimmed)) {
      throw new InvalidIde(`Format IDE invalide : attendu CHE-XXX.XXX.XXX, reçu "${input}"`);
    }
    const digits = trimmed.replace(/^CHE-/, '').replace(/\./g, '');
    if (!isValidMod11Checksum(digits)) {
      throw new InvalidIde(`Checksum mod 11 invalide pour "${trimmed}"`);
    }
    return new Ide(trimmed);
  }

  static isValid(input: string): boolean {
    const trimmed = input.trim().toUpperCase();
    if (!IDE_FORMAT.test(trimmed)) return false;
    const digits = trimmed.replace(/^CHE-/, '').replace(/\./g, '');
    return isValidMod11Checksum(digits);
  }

  toString(): string {
    return this.normalized;
  }

  equals(other: Ide): boolean {
    return this.normalized === other.normalized;
  }
}

export class InvalidIde extends Error {
  override readonly name = 'InvalidIde';
}

function isValidMod11Checksum(digits: string): boolean {
  if (digits.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const d = Number(digits[i]);
    const w = WEIGHTS[i];
    if (Number.isNaN(d) || w === undefined) return false;
    sum += d * w;
  }
  const remainder = sum % 11;
  const checksum = remainder === 0 ? 0 : 11 - remainder;
  if (checksum === 10) return false; // checksum impossible côté IDE valide
  const actual = Number(digits[8]);
  return checksum === actual;
}

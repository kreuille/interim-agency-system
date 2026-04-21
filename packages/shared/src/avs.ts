const AVS_FORMAT = /^756\.\d{4}\.\d{4}\.\d{2}$/;
const AVS_DIGITS_ONLY = /^756\d{10}$/;

export class Avs {
  private constructor(public readonly normalized: string) {}

  static parse(input: string): Avs {
    const trimmed = input.trim();
    if (!AVS_FORMAT.test(trimmed)) {
      throw new InvalidAvs(`AVS format invalide : attendu 756.XXXX.XXXX.XX, reçu "${trimmed}"`);
    }
    const digits = trimmed.replace(/\./g, '');
    if (!AVS_DIGITS_ONLY.test(digits)) {
      throw new InvalidAvs(`AVS doit commencer par 756 et faire 13 chiffres`);
    }
    if (!isValidEan13Checksum(digits)) {
      throw new InvalidAvs(`AVS checksum EAN-13 invalide pour "${trimmed}"`);
    }
    return new Avs(trimmed);
  }

  static isValid(input: string): boolean {
    const trimmed = input.trim();
    if (!AVS_FORMAT.test(trimmed)) return false;
    const digits = trimmed.replace(/\./g, '');
    return AVS_DIGITS_ONLY.test(digits) && isValidEan13Checksum(digits);
  }

  toString(): string {
    return this.normalized;
  }

  equals(other: Avs): boolean {
    return this.normalized === other.normalized;
  }
}

export class InvalidAvs extends Error {
  override readonly name = 'InvalidAvs';
}

function isValidEan13Checksum(digits: string): boolean {
  if (digits.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(digits[i]);
    if (Number.isNaN(d)) return false;
    sum += i % 2 === 0 ? d : d * 3;
  }
  const expected = (10 - (sum % 10)) % 10;
  const actual = Number(digits[12]);
  return expected === actual;
}

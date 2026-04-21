const IBAN_STRIP = /\s+/g;
const CH_IBAN_PATTERN = /^CH\d{19}$/;

export class Iban {
  private constructor(public readonly normalized: string) {}

  static parse(input: string): Iban {
    const compact = input.replace(IBAN_STRIP, '').toUpperCase();
    if (!CH_IBAN_PATTERN.test(compact)) {
      throw new InvalidIban(
        `IBAN suisse attendu (CH + 19 chiffres, 21 caractères au total), reçu "${input}"`,
      );
    }
    if (!mod97(compact)) {
      throw new InvalidIban(`IBAN checksum mod 97 invalide pour "${compact}"`);
    }
    return new Iban(compact);
  }

  static isValid(input: string): boolean {
    try {
      Iban.parse(input);
      return true;
    } catch {
      return false;
    }
  }

  toString(): string {
    return this.normalized;
  }

  toHumanFormat(): string {
    return this.normalized.replace(/(.{4})/g, '$1 ').trim();
  }

  equals(other: Iban): boolean {
    return this.normalized === other.normalized;
  }
}

export class InvalidIban extends Error {
  override readonly name = 'InvalidIban';
}

function mod97(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const expanded = rearranged
    .split('')
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code >= 65 && code <= 90) return String(code - 55);
      return ch;
    })
    .join('');
  let remainder = 0;
  for (const ch of expanded) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder === 1;
}

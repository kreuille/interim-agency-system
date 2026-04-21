const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const CH_LOCAL_PATTERN = /^0[1-9]\d{8}$/;

export class Phone {
  private constructor(public readonly e164: string) {}

  static parse(input: string): Phone {
    const compact = input.replace(/[\s().-]/g, '');

    if (E164_PATTERN.test(compact)) {
      return new Phone(compact);
    }
    if (CH_LOCAL_PATTERN.test(compact)) {
      return new Phone(`+41${compact.slice(1)}`);
    }
    throw new InvalidPhone(
      `Téléphone invalide : attendu format E.164 (+41...) ou suisse local (0...), reçu "${input}"`,
    );
  }

  toString(): string {
    return this.e164;
  }

  equals(other: Phone): boolean {
    return this.e164 === other.e164;
  }
}

export class InvalidPhone extends Error {
  override readonly name = 'InvalidPhone';
}

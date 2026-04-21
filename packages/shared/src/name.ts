const MIN_LENGTH = 1;
const MAX_LENGTH = 80;

export class Name {
  private constructor(public readonly value: string) {}

  static parse(input: string): Name {
    const trimmed = input.trim();
    if (trimmed.length < MIN_LENGTH) {
      throw new InvalidName(`Nom vide non autorisé.`);
    }
    if (trimmed.length > MAX_LENGTH) {
      throw new InvalidName(`Nom trop long (${String(trimmed.length)} > ${String(MAX_LENGTH)}).`);
    }
    return new Name(trimmed);
  }

  toString(): string {
    return this.value;
  }

  equals(other: Name): boolean {
    return this.value === other.value;
  }
}

export class InvalidName extends Error {
  override readonly name = 'InvalidName';
}

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export class Email {
  private constructor(public readonly value: string) {}

  static parse(input: string): Email {
    const trimmed = input.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(trimmed)) {
      throw new InvalidEmail(`Email invalide : "${input}"`);
    }
    return new Email(trimmed);
  }

  static isValid(input: string): boolean {
    return EMAIL_PATTERN.test(input.trim().toLowerCase());
  }

  toString(): string {
    return this.value;
  }
}

export class InvalidEmail extends Error {
  override readonly name = 'InvalidEmail';
}

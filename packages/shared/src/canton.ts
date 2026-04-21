export const CANTONS = [
  'AG',
  'AI',
  'AR',
  'BE',
  'BL',
  'BS',
  'FR',
  'GE',
  'GL',
  'GR',
  'JU',
  'LU',
  'NE',
  'NW',
  'OW',
  'SG',
  'SH',
  'SO',
  'SZ',
  'TG',
  'TI',
  'UR',
  'VD',
  'VS',
  'ZG',
  'ZH',
] as const;

export type Canton = (typeof CANTONS)[number];

export class InvalidCanton extends Error {
  override readonly name = 'InvalidCanton';
}

export function parseCanton(input: string): Canton {
  const normalized = input.trim().toUpperCase();
  if (!(CANTONS as readonly string[]).includes(normalized)) {
    throw new InvalidCanton(
      `Canton inconnu : "${input}". Attendu un code à 2 lettres parmi les 26.`,
    );
  }
  return normalized as Canton;
}

export function isCanton(value: string): value is Canton {
  return (CANTONS as readonly string[]).includes(value);
}

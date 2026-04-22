import { describe, expect, it } from 'vitest';
import {
  buildInterimQrReference,
  buildQrReference,
  computeMod10Recursive,
  formatQrReference,
  InvalidQrReference,
  isValidQrReference,
} from './qr-reference.js';

describe('computeMod10Recursive', () => {
  it('cas SIX officiel : data "21000000000313947143000901" → check 7', () => {
    // Exemple tiré du SIX QR-bill Implementation Guidelines §5.4
    expect(computeMod10Recursive('21000000000313947143000901')).toBe(7);
  });

  it('data "00000000000000000000000000" → check 0', () => {
    expect(computeMod10Recursive('00000000000000000000000000')).toBe(0);
  });

  it('rejette < 26 chiffres', () => {
    expect(() => computeMod10Recursive('123')).toThrow(InvalidQrReference);
  });

  it('rejette non-numeric', () => {
    expect(() => computeMod10Recursive('A'.repeat(26))).toThrow(InvalidQrReference);
  });
});

describe('buildQrReference', () => {
  it('append check digit', () => {
    const qrr = buildQrReference('21000000000313947143000901');
    expect(qrr).toBe('210000000003139471430009017');
    expect(qrr.length).toBe(27);
  });
});

describe('isValidQrReference', () => {
  it('QRR valide (check correct)', () => {
    expect(isValidQrReference('210000000003139471430009017')).toBe(true);
  });

  it('QRR avec check incorrect → false', () => {
    expect(isValidQrReference('210000000003139471430009018')).toBe(false);
  });

  it('longueur != 27 → false', () => {
    expect(isValidQrReference('12345')).toBe(false);
  });

  it('non-numeric → false', () => {
    expect(isValidQrReference('X'.repeat(27))).toBe(false);
  });
});

describe('buildInterimQrReference', () => {
  it('format agency(6) + year(4) + invoice(6) + client(10) + check(1) = 27', () => {
    const qrr = buildInterimQrReference({
      agencyCode: '12345',
      year: 2026,
      invoiceNumber: 1,
      clientCode: 'client-42',
    });
    expect(qrr.length).toBe(27);
    expect(isValidQrReference(qrr)).toBe(true);
  });

  it('padding agency à 6 chiffres', () => {
    const qrr = buildInterimQrReference({
      agencyCode: '5',
      year: 2026,
      invoiceNumber: 1,
      clientCode: '1',
    });
    // agency="000005", year="2026", invoice="000001", client="0000000001", check
    expect(qrr.slice(0, 6)).toBe('000005');
    expect(qrr.slice(6, 10)).toBe('2026');
  });

  it('clientCode avec lettres → extraction digits seulement, padded', () => {
    const qrr = buildInterimQrReference({
      agencyCode: '42',
      year: 2026,
      invoiceNumber: 100,
      clientCode: 'client-42-acme',
    });
    // clientCode digits only = "42", padded = "0000000042"
    expect(qrr.slice(16, 26)).toBe('0000000042');
  });

  it('invoiceNumber > 999999 → throw (overflow 6 chiffres)', () => {
    expect(() =>
      buildInterimQrReference({
        agencyCode: '1',
        year: 2026,
        invoiceNumber: 1_000_000,
        clientCode: '1',
      }),
    ).toThrow(InvalidQrReference);
  });

  it('year invalide → throw', () => {
    expect(() =>
      buildInterimQrReference({
        agencyCode: '1',
        year: -1,
        invoiceNumber: 1,
        clientCode: '1',
      }),
    ).toThrow(InvalidQrReference);
  });
});

describe('formatQrReference', () => {
  it('formate en groupes 2+5+5+5+5+5', () => {
    expect(formatQrReference('210000000003139471430009017')).toBe(
      '21 00000 00003 13947 14300 09017',
    );
  });

  it('QRR invalide retourné tel quel', () => {
    expect(formatQrReference('123')).toBe('123');
  });
});

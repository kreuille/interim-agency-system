import { describe, expect, it } from 'vitest';
import {
  buildPain001Xml,
  formatChf,
  Pain001ValidationError,
  stripIban,
} from './pain001-builder.js';
import type { BuildPain001Input, PaymentInstruction } from './pain001-types.js';

const VALID_IBAN_1 = 'CH9300762011623852957';
const VALID_IBAN_2 = 'CH4431999123000889012';

function instruction(overrides: Partial<PaymentInstruction> = {}): PaymentInstruction {
  return {
    instructionId: 'INSTR-001',
    endToEndId: 'E2E-001',
    amountRappen: 210_670n, // CHF 2106.70
    creditor: {
      name: 'Jean Dupont',
      iban: VALID_IBAN_2,
    },
    remittanceInfo: 'Salaire 2026-W17',
    ...overrides,
  };
}

function input(overrides: Partial<BuildPain001Input> = {}): BuildPain001Input {
  return {
    messageId: 'MSG-PAYROLL-2026-W17',
    paymentInfoId: 'PMT-2026-W17',
    requestedExecutionDate: '2026-04-25',
    creationDateTime: '2026-04-22T08:00:00',
    debtor: {
      name: 'Acme Intérim SA',
      iban: VALID_IBAN_1,
    },
    instructions: [instruction()],
    ...overrides,
  };
}

describe('formatChf', () => {
  it('rappen → CHF 2 décimales', () => {
    expect(formatChf(210_670n)).toBe('2106.70');
    expect(formatChf(0n)).toBe('0.00');
    expect(formatChf(5n)).toBe('0.05');
    expect(formatChf(99n)).toBe('0.99');
    expect(formatChf(100n)).toBe('1.00');
  });

  it('négatifs préfixés -', () => {
    expect(formatChf(-100n)).toBe('-1.00');
  });

  it('chaînes longues bigint exactes (cumul annuel)', () => {
    // 1 million CHF en rappen
    expect(formatChf(100_000_000n)).toBe('1000000.00');
  });
});

describe('stripIban', () => {
  it('retire espaces + uppercase', () => {
    expect(stripIban('ch93 0076 2011 6238 5295 7')).toBe('CH9300762011623852957');
  });
});

describe('buildPain001Xml — happy path', () => {
  it('1 instruction → XML conforme avec MsgId, NbOfTxs=1, CtrlSum cohérent', () => {
    const result = buildPain001Xml(input());
    expect(result.numberOfTransactions).toBe(1);
    expect(result.controlSumChf).toBe('2106.70');
    expect(result.messageId).toBe('MSG-PAYROLL-2026-W17');
    expect(result.xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(result.xml).toContain('xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09"');
    expect(result.xml).toContain('<MsgId>MSG-PAYROLL-2026-W17</MsgId>');
    expect(result.xml).toContain('<NbOfTxs>1</NbOfTxs>');
    expect(result.xml).toContain('<CtrlSum>2106.70</CtrlSum>');
    expect(result.xml).toContain('<IBAN>CH9300762011623852957</IBAN>');
    expect(result.xml).toContain('<IBAN>CH4431999123000889012</IBAN>');
    expect(result.xml).toContain('<InstdAmt Ccy="CHF">2106.70</InstdAmt>');
    expect(result.xml).toContain('<Ustrd>Salaire 2026-W17</Ustrd>');
  });

  it('10 instructions → CtrlSum = somme exacte', () => {
    const instructions: PaymentInstruction[] = [];
    for (let i = 0; i < 10; i++) {
      instructions.push(
        instruction({
          instructionId: `INSTR-${String(i)}`,
          endToEndId: `E2E-${String(i)}`,
          amountRappen: 100_000n + BigInt(i) * 1_000n, // 1000.00, 1010.00, ...
        }),
      );
    }
    const result = buildPain001Xml(input({ instructions }));
    expect(result.numberOfTransactions).toBe(10);
    // Somme = 10 × 1000 + (0+1+2+...+9) × 10 = 10_000 + 450 = 10_450 CHF
    expect(result.controlSumChf).toBe('10450.00');
  });

  it('SvcLvl SEPA + CtgyPurp SALA par défaut', () => {
    const result = buildPain001Xml(input());
    expect(result.xml).toContain('<SvcLvl><Cd>SEPA</Cd></SvcLvl>');
    expect(result.xml).toContain('<CtgyPurp><Cd>SALA</Cd></CtgyPurp>');
  });

  it('override serviceLevel et categoryPurpose', () => {
    const result = buildPain001Xml(input({ serviceLevel: 'NURG', categoryPurpose: 'BONU' }));
    expect(result.xml).toContain('<SvcLvl><Cd>NURG</Cd></SvcLvl>');
    expect(result.xml).toContain('<CtgyPurp><Cd>BONU</Cd></CtgyPurp>');
  });

  it('debtor sans BIC → balise NOTPROVIDED', () => {
    const result = buildPain001Xml(input());
    expect(result.xml).toContain(
      '<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>',
    );
  });

  it('debtor avec BIC → balise BICFI', () => {
    const result = buildPain001Xml(
      input({ debtor: { name: 'Acme', iban: VALID_IBAN_1, bicfi: 'POFICHBEXXX' } }),
    );
    expect(result.xml).toContain('<BICFI>POFICHBEXXX</BICFI>');
  });
});

describe('buildPain001Xml — validations', () => {
  it('liste vide → throw', () => {
    expect(() => buildPain001Xml(input({ instructions: [] }))).toThrow(Pain001ValidationError);
  });

  it('messageId > 35 chars → throw', () => {
    expect(() => buildPain001Xml(input({ messageId: 'X'.repeat(36) }))).toThrow(/messageId/);
  });

  it('IBAN debtor invalide → throw', () => {
    expect(() =>
      buildPain001Xml(input({ debtor: { name: 'X', iban: 'CH9300762011623852999' } })),
    ).toThrow(/IBAN debtor/);
  });

  it('IBAN creditor invalide → throw', () => {
    expect(() =>
      buildPain001Xml(
        input({ instructions: [instruction({ creditor: { name: 'X', iban: 'INVALID' } })] }),
      ),
    ).toThrow(/IBAN creditor/);
  });

  it('amount = 0 → throw', () => {
    expect(() =>
      buildPain001Xml(input({ instructions: [instruction({ amountRappen: 0n })] })),
    ).toThrow(/amountRappen/);
  });

  it('amount négatif → throw', () => {
    expect(() =>
      buildPain001Xml(input({ instructions: [instruction({ amountRappen: -100n })] })),
    ).toThrow(/amountRappen/);
  });

  it('remittance > 140 chars → throw', () => {
    expect(() =>
      buildPain001Xml(input({ instructions: [instruction({ remittanceInfo: 'X'.repeat(141) })] })),
    ).toThrow(/remittanceInfo/);
  });

  it('date format != YYYY-MM-DD → throw', () => {
    expect(() => buildPain001Xml(input({ requestedExecutionDate: '25/04/2026' }))).toThrow(
      /requestedExecutionDate/,
    );
  });

  it('IBAN avec espaces accepté (strip auto)', () => {
    const result = buildPain001Xml(
      input({
        debtor: { name: 'Acme', iban: 'CH93 0076 2011 6238 5295 7' },
      }),
    );
    // Strip + valid → XML produit avec IBAN compact
    expect(result.xml).toContain('<IBAN>CH9300762011623852957</IBAN>');
  });
});

describe('buildPain001Xml — XML escape', () => {
  it('&, <, > échappés dans Nm et Ustrd', () => {
    const result = buildPain001Xml(
      input({
        debtor: { name: 'Acme & Co <SA>', iban: VALID_IBAN_1 },
        instructions: [
          instruction({
            creditor: { name: "Marc D'Eau", iban: VALID_IBAN_2 },
            remittanceInfo: 'Salaire <test> & "ok"',
          }),
        ],
      }),
    );
    expect(result.xml).toContain('Acme &amp; Co &lt;SA&gt;');
    expect(result.xml).toContain('Marc D&apos;Eau');
    expect(result.xml).toContain('&lt;test&gt; &amp; &quot;ok&quot;');
  });
});

describe('buildPain001Xml — déterminisme & rejeu', () => {
  it('2 appels même input → même XML byte-pour-byte', () => {
    const r1 = buildPain001Xml(input());
    const r2 = buildPain001Xml(input());
    expect(r1.xml).toBe(r2.xml);
  });

  it('messageId différent → XML différent (anti-doublon banque)', () => {
    const r1 = buildPain001Xml(input({ messageId: 'MSG-A' }));
    const r2 = buildPain001Xml(input({ messageId: 'MSG-B' }));
    expect(r1.xml).not.toBe(r2.xml);
    expect(r1.messageId).not.toBe(r2.messageId);
  });
});

describe('buildPain001Xml — montants en rappen exacts (pas de drift float)', () => {
  it('arrondi 5cts respecté : NET 234.55 → CHF 234.55 dans XML', () => {
    const result = buildPain001Xml(
      input({ instructions: [instruction({ amountRappen: 23_455n })] }),
    );
    expect(result.xml).toContain('<InstdAmt Ccy="CHF">234.55</InstdAmt>');
  });

  it('grand cumul (10000 × 100.00) → CtrlSum 1_000_000.00 exact', () => {
    const instructions: PaymentInstruction[] = [];
    for (let i = 0; i < 10_000; i++) {
      instructions.push(
        instruction({
          instructionId: `I-${String(i)}`,
          endToEndId: `E-${String(i)}`,
          amountRappen: 10_000n, // 100.00 CHF chacun
        }),
      );
    }
    const result = buildPain001Xml(input({ instructions }));
    expect(result.controlSumChf).toBe('1000000.00');
    expect(result.numberOfTransactions).toBe(10_000);
  });
});

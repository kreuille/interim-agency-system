import { describe, expect, it } from 'vitest';
import {
  formatChfFromRappen,
  formatDateFr,
  formatDateTimeFr,
  InMemoryContractTemplateRegistry,
  TemplateNotFound,
} from './contract-template.js';
import type { ContractLegalSnapshot } from './mission-contract.js';
import {
  FR_BTP_GROS_OEUVRE_TEMPLATE,
  FR_BTP_SECOND_OEUVRE_TEMPLATE,
  FR_DEMENAGEMENT_TEMPLATE,
  FR_LOGISTIQUE_TEMPLATE,
  FR_TEMPLATES,
} from './templates-fr.js';

const legal: ContractLegalSnapshot = {
  agencyName: 'Acme Intérim SA',
  agencyIde: 'CHE-100.000.001',
  agencyLseAuthorization: 'GE-LSE-2024-001',
  agencyLseExpiresAt: new Date('2027-04-22T00:00:00Z'),
  clientName: 'Client SA',
  clientIde: 'CHE-200.000.001',
  workerFirstName: 'Jean',
  workerLastName: 'Dupont',
  workerAvs: '756.1234.5678.97',
  missionTitle: 'Cariste',
  siteAddress: 'Rue 1, 1204 Genève',
  canton: 'GE',
  cctReference: 'CCT Construction',
  hourlyRateRappen: 3200,
  startsAt: new Date('2026-04-25T07:00:00Z'),
  endsAt: new Date('2026-04-25T16:00:00Z'),
  weeklyHours: 9,
};

describe('helpers de format', () => {
  it('formatChfFromRappen', () => {
    expect(formatChfFromRappen(3200)).toBe('32,00 CHF');
    expect(formatChfFromRappen(0)).toBe('0,00 CHF');
    expect(formatChfFromRappen(99)).toBe('0,99 CHF');
  });

  it('formatDateFr', () => {
    expect(formatDateFr(new Date('2026-04-25T07:00:00Z'))).toBe('25.04.2026');
  });

  it('formatDateTimeFr', () => {
    expect(formatDateTimeFr(new Date('2026-04-25T07:30:00Z'))).toBe('25.04.2026 07:30');
  });
});

describe('InMemoryContractTemplateRegistry', () => {
  it('renvoie le template enregistré (fr par défaut)', () => {
    const registry = new InMemoryContractTemplateRegistry().register(FR_DEMENAGEMENT_TEMPLATE);
    const t = registry.get('demenagement');
    expect(t).toBe(FR_DEMENAGEMENT_TEMPLATE);
  });

  it("fallback fr si lang demandée n'existe pas", () => {
    const registry = new InMemoryContractTemplateRegistry().register(FR_DEMENAGEMENT_TEMPLATE);
    const t = registry.get('demenagement', 'de');
    expect(t).toBe(FR_DEMENAGEMENT_TEMPLATE);
  });

  it('throw TemplateNotFound si branche inconnue', () => {
    const registry = new InMemoryContractTemplateRegistry();
    expect(() => registry.get('demenagement')).toThrow(TemplateNotFound);
  });
});

describe('FR_TEMPLATES — rendu', () => {
  it('chaque template produit un ContractDocument complet', () => {
    for (const template of FR_TEMPLATES) {
      const doc = template.build({
        reference: 'MC-2026-04-001',
        branch: template.branch,
        legal,
      });
      expect(doc.title).toContain('Contrat');
      expect(doc.subtitle).toContain('MC-2026-04-001');
      expect(doc.headerLines.some((l) => l.includes('Acme Intérim'))).toBe(true);
      expect(doc.headerLines.some((l) => l.includes('GE-LSE-2024-001'))).toBe(true);
      expect(doc.partiesSection.body.some((l) => l.includes('756.12'))).toBe(true); // AVS masqué partial visible
      expect(doc.missionSection.body.some((l) => l.includes('25.04.2026'))).toBe(true);
      expect(doc.remunerationSection.body.some((l) => l.includes('32,00 CHF'))).toBe(true);
      expect(doc.cctMentionsSection.body.length).toBeGreaterThanOrEqual(7); // 6 communs + ≥1 spécifique
      expect(doc.signaturesSection.body.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('demenagement contient mention paniers repas', () => {
    const doc = FR_DEMENAGEMENT_TEMPLATE.build({
      reference: 'MC-X',
      branch: 'demenagement',
      legal,
    });
    expect(doc.cctMentionsSection.body.some((l) => l.toLowerCase().includes('panier'))).toBe(true);
  });

  it('btp_gros_oeuvre contient mention CN 2024-2028', () => {
    const doc = FR_BTP_GROS_OEUVRE_TEMPLATE.build({
      reference: 'MC-X',
      branch: 'btp_gros_oeuvre',
      legal,
    });
    expect(doc.cctMentionsSection.body.some((l) => l.includes('CN 2024-2028'))).toBe(true);
  });

  it('btp_second_oeuvre contient mention nuit majorée 50 %', () => {
    const doc = FR_BTP_SECOND_OEUVRE_TEMPLATE.build({
      reference: 'MC-X',
      branch: 'btp_second_oeuvre',
      legal,
    });
    expect(doc.cctMentionsSection.body.some((l) => l.includes('nuit'))).toBe(true);
  });

  it('logistique contient mention LTr art. 19', () => {
    const doc = FR_LOGISTIQUE_TEMPLATE.build({ reference: 'MC-X', branch: 'logistique', legal });
    expect(doc.cctMentionsSection.body.some((l) => l.includes('art. 19'))).toBe(true);
  });

  it('AVS est masqué dans la section parties', () => {
    const doc = FR_DEMENAGEMENT_TEMPLATE.build({
      reference: 'MC-X',
      branch: 'demenagement',
      legal,
    });
    const avsLine = doc.partiesSection.body.find((l) => l.includes('AVS'));
    expect(avsLine).toBeDefined();
    expect(avsLine).toContain('****'); // masque appliqué
    expect(avsLine).not.toContain('5678'); // chiffres milieu masqués
  });
});

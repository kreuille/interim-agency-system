import { describe, expect, it } from 'vitest';
import {
  buildActiveMissionsIndicator,
  buildCctIndicator,
  buildLseIndicator,
  buildNlpdIndicator,
  buildWorkerDocsIndicator,
} from './indicator-builders.js';
import { worstStatusOf, type ComplianceIndicator } from './compliance-indicator.js';

const NOW = new Date('2026-04-22T08:00:00Z');

// ===================== LSE ===================================================

describe('buildLseIndicator', () => {
  it('autorisation = none → critical avec CTA dépôt', () => {
    const ind = buildLseIndicator({
      snapshot: { authorization: 'none', expiresAt: null },
      now: NOW,
    });
    expect(ind.status).toBe('critical');
    expect(ind.cta?.targetPath).toContain('lse/request');
  });

  it('expiresAt null mais autorisation présente → warning', () => {
    const ind = buildLseIndicator({
      snapshot: { authorization: 'cantonal', expiresAt: null },
      now: NOW,
    });
    expect(ind.status).toBe('warning');
  });

  it('expirée → critical', () => {
    const ind = buildLseIndicator({
      snapshot: {
        authorization: 'cantonal',
        expiresAt: new Date('2026-04-01T00:00:00Z'), // < NOW
      },
      now: NOW,
    });
    expect(ind.status).toBe('critical');
    expect(ind.title).toContain('expirée');
  });

  it('expire dans < 30j → warning', () => {
    const ind = buildLseIndicator({
      snapshot: {
        authorization: 'cantonal',
        expiresAt: new Date('2026-05-15T00:00:00Z'), // ~23 jours
      },
      now: NOW,
    });
    expect(ind.status).toBe('warning');
    expect(ind.cta?.targetPath).toContain('renew');
  });

  it('expire dans > 30j → ok', () => {
    const ind = buildLseIndicator({
      snapshot: {
        authorization: 'both',
        expiresAt: new Date('2027-04-22T00:00:00Z'),
      },
      now: NOW,
    });
    expect(ind.status).toBe('ok');
    expect(ind.metric).toMatch(/36\d jours/);
  });
});

// ===================== CCT ===================================================

describe('buildCctIndicator', () => {
  it('aucun barème → critical', () => {
    const ind = buildCctIndicator({
      snapshot: { lastUpdatedAt: null, numberOfBranchesConfigured: 0 },
      now: NOW,
    });
    expect(ind.status).toBe('critical');
  });

  it('MAJ < 13 mois → ok', () => {
    const ind = buildCctIndicator({
      snapshot: {
        lastUpdatedAt: new Date('2026-01-01T00:00:00Z'), // ~3.7 mois
        numberOfBranchesConfigured: 4,
      },
      now: NOW,
    });
    expect(ind.status).toBe('ok');
  });

  it('MAJ > 13 mois → warning', () => {
    const ind = buildCctIndicator({
      snapshot: {
        lastUpdatedAt: new Date('2024-10-01T00:00:00Z'), // ~18 mois
        numberOfBranchesConfigured: 4,
      },
      now: NOW,
    });
    expect(ind.status).toBe('warning');
  });

  it('MAJ > 24 mois → critical', () => {
    const ind = buildCctIndicator({
      snapshot: {
        lastUpdatedAt: new Date('2023-01-01T00:00:00Z'), // ~39 mois
        numberOfBranchesConfigured: 4,
      },
      now: NOW,
    });
    expect(ind.status).toBe('critical');
  });
});

// ===================== Worker docs ===========================================

describe('buildWorkerDocsIndicator', () => {
  it('aucun worker → ok', () => {
    const ind = buildWorkerDocsIndicator({
      snapshot: { totalWorkers: 0, workersWithAllDocsValid: 0, upcomingExpirations60Days: 0 },
      now: NOW,
    });
    expect(ind.status).toBe('ok');
  });

  it('100% valides → ok', () => {
    const ind = buildWorkerDocsIndicator({
      snapshot: { totalWorkers: 80, workersWithAllDocsValid: 80, upcomingExpirations60Days: 0 },
      now: NOW,
    });
    expect(ind.status).toBe('ok');
    expect(ind.metric).toBe('100%');
  });

  it('90% valides → warning', () => {
    const ind = buildWorkerDocsIndicator({
      snapshot: { totalWorkers: 100, workersWithAllDocsValid: 90, upcomingExpirations60Days: 2 },
      now: NOW,
    });
    expect(ind.status).toBe('warning');
  });

  it('70% valides → critical', () => {
    const ind = buildWorkerDocsIndicator({
      snapshot: { totalWorkers: 100, workersWithAllDocsValid: 70, upcomingExpirations60Days: 5 },
      now: NOW,
    });
    expect(ind.status).toBe('critical');
  });

  it('100% mais > 5 expirations imminentes → warning', () => {
    const ind = buildWorkerDocsIndicator({
      snapshot: { totalWorkers: 100, workersWithAllDocsValid: 100, upcomingExpirations60Days: 10 },
      now: NOW,
    });
    expect(ind.status).toBe('warning');
  });
});

// ===================== Active missions =======================================

describe('buildActiveMissionsIndicator', () => {
  it('aucun dépassement → ok', () => {
    const ind = buildActiveMissionsIndicator({
      snapshot: { count: 25, workersOverWeeklyLimit: 0 },
      now: NOW,
    });
    expect(ind.status).toBe('ok');
    expect(ind.metric).toBe('25');
  });

  it('worker > 50h → critical', () => {
    const ind = buildActiveMissionsIndicator({
      snapshot: { count: 25, workersOverWeeklyLimit: 1 },
      now: NOW,
    });
    expect(ind.status).toBe('critical');
    expect(ind.title).toContain('LTr');
  });
});

// ===================== nLPD ==================================================

describe('buildNlpdIndicator', () => {
  it('registre + DPIA présents + 0 demande → ok', () => {
    const ind = buildNlpdIndicator({
      snapshot: { registryUpToDate: true, dpiaPresent: true, lastDataPersonRequestPending: 0 },
      now: NOW,
    });
    expect(ind.status).toBe('ok');
  });

  it('registre absent → critical', () => {
    const ind = buildNlpdIndicator({
      snapshot: { registryUpToDate: false, dpiaPresent: true, lastDataPersonRequestPending: 0 },
      now: NOW,
    });
    expect(ind.status).toBe('critical');
  });

  it('DPIA manquante mais registre OK → warning', () => {
    const ind = buildNlpdIndicator({
      snapshot: { registryUpToDate: true, dpiaPresent: false, lastDataPersonRequestPending: 0 },
      now: NOW,
    });
    expect(ind.status).toBe('warning');
  });

  it('demandes en attente → warning', () => {
    const ind = buildNlpdIndicator({
      snapshot: { registryUpToDate: true, dpiaPresent: true, lastDataPersonRequestPending: 3 },
      now: NOW,
    });
    expect(ind.status).toBe('warning');
    expect(ind.title).toContain('3');
  });
});

// ===================== worstStatusOf =========================================

describe('worstStatusOf', () => {
  function ind(status: 'ok' | 'warning' | 'critical'): ComplianceIndicator {
    return {
      domain: 'lse_authorization',
      status,
      title: 't',
      lastCheckedAt: NOW,
    };
  }

  it('all ok → ok', () => {
    expect(worstStatusOf([ind('ok'), ind('ok')])).toBe('ok');
  });

  it('warning présent → warning', () => {
    expect(worstStatusOf([ind('ok'), ind('warning')])).toBe('warning');
  });

  it('critical présent → critical (overrides warning)', () => {
    expect(worstStatusOf([ind('warning'), ind('critical'), ind('ok')])).toBe('critical');
  });

  it('vide → ok', () => {
    expect(worstStatusOf([])).toBe('ok');
  });
});

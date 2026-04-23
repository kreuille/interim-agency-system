import { describe, expect, it } from 'vitest';
import { Counter } from 'prom-client';
import {
  assertLabelHygiene,
  createPromRegistry,
  ForbiddenLabelError,
  FORBIDDEN_LABELS,
  hashAgencyId,
  validateLabelHygiene,
} from './prom-registry.js';

describe('hashAgencyId', () => {
  it('produit un hash hex de 12 chars déterministe', () => {
    const h1 = hashAgencyId('agency-pilote');
    const h2 = hashAgencyId('agency-pilote');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(12);
    expect(h1).toMatch(/^[0-9a-f]{12}$/u);
  });

  it('produit des hashs distincts pour des agencies distinctes', () => {
    expect(hashAgencyId('agency-a')).not.toBe(hashAgencyId('agency-b'));
  });

  it("ne retourne JAMAIS l'agencyId en clair (nLPD)", () => {
    const id = 'agency-secret-pilote-12345';
    expect(hashAgencyId(id)).not.toContain(id);
    expect(hashAgencyId(id)).not.toContain('agency');
    expect(hashAgencyId(id)).not.toContain('pilote');
  });

  it('UUID v4 fonctionne', () => {
    const h = hashAgencyId('00000000-0000-4000-a000-000000000001');
    expect(h).toMatch(/^[0-9a-f]{12}$/u);
  });
});

describe('FORBIDDEN_LABELS — couverture PII et high-cardinality', () => {
  it('inclut agency_id (doit être hashé)', () => {
    expect(FORBIDDEN_LABELS).toContain('agency_id');
  });

  it('inclut les identifiants worker (worker_id, staff_id)', () => {
    expect(FORBIDDEN_LABELS).toContain('worker_id');
    expect(FORBIDDEN_LABELS).toContain('staff_id');
  });

  it('inclut les PII suisses (iban, avs)', () => {
    expect(FORBIDDEN_LABELS).toContain('iban');
    expect(FORBIDDEN_LABELS).toContain('avs');
  });

  it('inclut les contacts (email, phone, names)', () => {
    expect(FORBIDDEN_LABELS).toContain('email');
    expect(FORBIDDEN_LABELS).toContain('phone');
    expect(FORBIDDEN_LABELS).toContain('first_name');
    expect(FORBIDDEN_LABELS).toContain('last_name');
  });

  it('inclut les high-cardinality (request_id, correlation_id, timestamp)', () => {
    expect(FORBIDDEN_LABELS).toContain('request_id');
    expect(FORBIDDEN_LABELS).toContain('correlation_id');
    expect(FORBIDDEN_LABELS).toContain('timestamp');
  });

  it('inclut les secrets (authorization, token)', () => {
    expect(FORBIDDEN_LABELS).toContain('authorization');
    expect(FORBIDDEN_LABELS).toContain('token');
  });
});

describe('validateLabelHygiene', () => {
  it('renvoie [] pour des labels safe', () => {
    expect(validateLabelHygiene(['queue', 'status', 'tenant'])).toEqual([]);
  });

  it('détecte agency_id (doit être hashé)', () => {
    expect(validateLabelHygiene(['agency_id', 'queue'])).toEqual(['agency_id']);
  });

  it('détecte case-insensitive (Worker_ID, IBAN)', () => {
    expect(validateLabelHygiene(['Worker_ID', 'IBAN'])).toEqual(
      expect.arrayContaining(['worker_id', 'iban']),
    );
  });

  it('détecte plusieurs interdits dans une même liste', () => {
    const result = validateLabelHygiene(['email', 'phone', 'queue']);
    expect(result).toContain('email');
    expect(result).toContain('phone');
    expect(result).not.toContain('queue');
  });
});

describe('assertLabelHygiene', () => {
  it('passe silencieusement pour des labels safe', () => {
    expect(() => {
      assertLabelHygiene('test_metric', ['queue', 'status']);
    }).not.toThrow();
  });

  it('jette ForbiddenLabelError si un label interdit', () => {
    expect(() => {
      assertLabelHygiene('test_metric', ['agency_id']);
    }).toThrow(ForbiddenLabelError);
  });

  it("le message d'erreur cite le métric + les labels interdits", () => {
    try {
      assertLabelHygiene('payroll_runs', ['agency_id', 'worker_id', 'queue']);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenLabelError);
      const err = e as ForbiddenLabelError;
      expect(err.metricName).toBe('payroll_runs');
      expect(err.forbiddenLabels).toContain('agency_id');
      expect(err.forbiddenLabels).toContain('worker_id');
      expect(err.message).toContain('payroll_runs');
      expect(err.message).toContain('agency_id');
    }
  });
});

describe('createPromRegistry', () => {
  it("crée un registre avec service label par défaut 'worker'", async () => {
    const reg = createPromRegistry({ service: 'worker', enableDefaultMetrics: false });
    // Counter test — vérifie que setDefaultLabels({service: 'worker'}) est appliqué
    const c = new Counter({
      name: 'test_total',
      help: 'test',
      registers: [reg],
    });
    c.inc();
    const metrics = await reg.metrics();
    expect(metrics).toContain('test_total');
    expect(metrics).toContain('service="worker"');
  });

  it('default metrics process Node activées par défaut, prefix interim_<service>_', async () => {
    const reg = createPromRegistry({ service: 'api' });
    const metrics = await reg.metrics();
    // collectDefaultMetrics ajoute des métriques cpu/memory/event_loop
    expect(metrics).toContain('interim_api_process_cpu_user_seconds_total');
  });

  it('enableDefaultMetrics=false : registre vide initialement', async () => {
    const reg = createPromRegistry({ service: 'api', enableDefaultMetrics: false });
    const metrics = await reg.metrics();
    expect(metrics.trim()).toBe('');
  });
});

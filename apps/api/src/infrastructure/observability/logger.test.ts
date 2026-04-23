import { describe, expect, it } from 'vitest';
import { Writable } from 'node:stream';
import pino from 'pino';
import { createLogger, hashWorkerId, resetDefaultLogger } from './logger.js';

/**
 * Capture toutes les lignes JSON émises par un logger pino dans un
 * tableau. Permet de vérifier le contenu exact (redaction, structure).
 */
function captureLogs(): { readonly lines: object[]; readonly stream: Writable } {
  const lines: object[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb): void {
      lines.push(JSON.parse(chunk.toString()) as object);
      cb();
    },
  });
  return { lines, stream };
}

describe('createLogger', () => {
  it('émet du JSON structuré avec service + level + time', () => {
    const { lines, stream } = captureLogs();
    const logger = pino(
      {
        level: 'info',
        base: { service: 'api' },
        formatters: { level: (label) => ({ level: label }) },
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      stream,
    );

    logger.info({ correlationId: 'req_abc' }, 'availability pushed');

    expect(lines).toHaveLength(1);
    const line = lines[0] as Record<string, unknown>;
    expect(line.service).toBe('api');
    expect(line.level).toBe('info');
    expect(line.msg).toBe('availability pushed');
    expect(line.correlationId).toBe('req_abc');
    expect(typeof line.time).toBe('string');
    // ISO time format YYYY-MM-DDTHH:mm:ss.sssZ
    expect(line.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/u);
  });

  it('redacte les champs PII (iban, avs, email, phone, password, token, firstName, lastName)', () => {
    const { lines, stream } = captureLogs();
    const logger = pino(
      {
        level: 'info',
        redact: {
          paths: [
            '*.iban',
            '*.avs',
            '*.email',
            '*.phone',
            '*.password',
            '*.token',
            '*.firstName',
            '*.lastName',
          ],
          censor: '[REDACTED]',
        },
      },
      stream,
    );

    logger.info(
      {
        worker: {
          firstName: 'Jean',
          lastName: 'Dupont',
          iban: 'CH9300762011623852957',
          avs: '756.1234.5678.97',
          email: 'jean@example.ch',
          phone: '+41791234567',
          password: 'should-never-log',
          token: 'eyJabc...',
        },
      },
      'worker registered',
    );

    expect(lines).toHaveLength(1);
    const worker = (lines[0] as { worker: Record<string, string> }).worker;
    expect(worker.firstName).toBe('[REDACTED]');
    expect(worker.lastName).toBe('[REDACTED]');
    expect(worker.iban).toBe('[REDACTED]');
    expect(worker.avs).toBe('[REDACTED]');
    expect(worker.email).toBe('[REDACTED]');
    expect(worker.phone).toBe('[REDACTED]');
    expect(worker.password).toBe('[REDACTED]');
    expect(worker.token).toBe('[REDACTED]');
  });

  it('redacte le header authorization', () => {
    const { lines, stream } = captureLogs();
    const logger = pino(
      {
        level: 'info',
        redact: { paths: ['req.headers.authorization'], censor: '[REDACTED]' },
      },
      stream,
    );

    logger.info(
      {
        req: {
          method: 'POST',
          url: '/api/v1/workers',
          headers: { authorization: 'Bearer eyJsuper-secret', 'content-type': 'application/json' },
        },
      },
      'request',
    );

    const headers = (lines[0] as { req: { headers: Record<string, string> } }).req.headers;
    expect(headers.authorization).toBe('[REDACTED]');
    expect(headers['content-type']).toBe('application/json');
  });

  it('utilise le LOG_LEVEL env var par défaut', () => {
    resetDefaultLogger();
    const original = process.env.LOG_LEVEL;
    try {
      process.env.LOG_LEVEL = 'warn';
      const logger = createLogger();
      expect(logger.level).toBe('warn');
    } finally {
      process.env.LOG_LEVEL = original;
      resetDefaultLogger();
    }
  });

  it('opts.level surcharge LOG_LEVEL', () => {
    const original = process.env.LOG_LEVEL;
    try {
      process.env.LOG_LEVEL = 'warn';
      const logger = createLogger({ level: 'debug' });
      expect(logger.level).toBe('debug');
    } finally {
      process.env.LOG_LEVEL = original;
    }
  });

  it('default level = info quand LOG_LEVEL absent', () => {
    const original = process.env.LOG_LEVEL;
    try {
      delete process.env.LOG_LEVEL;
      const logger = createLogger();
      expect(logger.level).toBe('info');
    } finally {
      if (original !== undefined) process.env.LOG_LEVEL = original;
    }
  });
});

describe('hashWorkerId', () => {
  it('produit un hash hex 16 chars déterministe', () => {
    const h1 = hashWorkerId('stf_001');
    const h2 = hashWorkerId('stf_001');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(16);
    expect(h1).toMatch(/^[0-9a-f]{16}$/u);
  });

  it('produit des hashs distincts pour des IDs distincts', () => {
    expect(hashWorkerId('stf_001')).not.toBe(hashWorkerId('stf_002'));
  });

  it("jamais ne retourne l'ID en clair", () => {
    const id = 'stf_supersecret';
    expect(hashWorkerId(id)).not.toContain(id);
  });
});

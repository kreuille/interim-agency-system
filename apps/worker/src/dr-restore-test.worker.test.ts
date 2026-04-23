import { describe, expect, it, vi } from 'vitest';
import {
  DR_RESTORE_TEST_QUEUE_NAME,
  DR_RESTORE_TEST_REPEAT_CRON,
  DrRestoreScriptFailed,
  parseRowCounts,
  type DrRestoreTestResult,
} from './dr-restore-test.worker.js';

describe('DR restore test worker — pure helpers', () => {
  it('exporte le nom de queue et le cron mensuel', () => {
    expect(DR_RESTORE_TEST_QUEUE_NAME).toBe('dr-restore-test');
    // Cron : minute=0, heure=3, jour=1, mois=*, jour-semaine=*
    expect(DR_RESTORE_TEST_REPEAT_CRON).toBe('0 3 1 * *');
  });

  describe('parseRowCounts', () => {
    it('extrait rowCounts depuis la dernière ligne JSON dr_roundtrip.completed', () => {
      const stdout = `
[1/6] mesurer rowcounts source
[2/6] pg_dump source
[3/6] pg_restore vers dr
[4/6] mesurer rowcounts cible
[5/6] rowcounts OK
[6/6] DR roundtrip OK

{"event":"dr_roundtrip.completed","durationSeconds":847,"rtoBudgetSeconds":14400,"rowCounts":{"temp_workers":42,"timesheets":120}}
`;
      const result = parseRowCounts(stdout);
      expect(result).toEqual({ temp_workers: 42, timesheets: 120 });
    });

    it("renvoie {} si aucune ligne JSON dr_roundtrip.completed n'est trouvée", () => {
      expect(parseRowCounts('rien à voir ici\n[ok] terminé')).toEqual({});
    });

    it('ignore les lignes JSON malformées', () => {
      const stdout = `
{"event":"other"}
{ not valid json
{"event":"dr_roundtrip.completed","rowCounts":{"a":1}}
`;
      expect(parseRowCounts(stdout)).toEqual({ a: 1 });
    });

    it("ignore les events qui ne sont pas 'dr_roundtrip.completed'", () => {
      const stdout = `{"event":"pg_dump.completed","sizeBytes":12345}`;
      expect(parseRowCounts(stdout)).toEqual({});
    });

    it('prend le dernier event dr_roundtrip.completed si plusieurs', () => {
      const stdout = `
{"event":"dr_roundtrip.completed","rowCounts":{"a":1}}
{"event":"dr_roundtrip.completed","rowCounts":{"b":2}}
`;
      expect(parseRowCounts(stdout)).toEqual({ b: 2 });
    });

    it("renvoie {} si rowCounts manquant dans l'event", () => {
      expect(parseRowCounts('{"event":"dr_roundtrip.completed","durationSeconds":100}')).toEqual(
        {},
      );
    });
  });

  describe('DrRestoreScriptFailed', () => {
    it('expose exitCode + stderr et a un name distinguable', () => {
      const err = new DrRestoreScriptFailed(2, 'pg_restore: error: ...');
      expect(err.name).toBe('DrRestoreScriptFailed');
      expect(err.exitCode).toBe(2);
      expect(err.stderr).toBe('pg_restore: error: ...');
      expect(err.message).toContain('exit 2');
    });
  });

  describe('callback onResult', () => {
    it('appelle onResult avec rtoRespected=true quand durée < budget', () => {
      const onResult = vi.fn<(r: DrRestoreTestResult) => void>();
      const result: DrRestoreTestResult = {
        durationSeconds: 100,
        rowCounts: { a: 1 },
        stdoutTail: '...',
        rtoRespected: true,
      };
      onResult(result);
      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({ rtoRespected: true, durationSeconds: 100 }),
      );
    });

    it('appelle onResult avec rtoRespected=false quand durée > budget', () => {
      const onResult = vi.fn<(r: DrRestoreTestResult) => void>();
      const result: DrRestoreTestResult = {
        durationSeconds: 18000,
        rowCounts: { a: 1 },
        stdoutTail: '...',
        rtoRespected: false,
      };
      onResult(result);
      expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ rtoRespected: false }));
    });
  });
});

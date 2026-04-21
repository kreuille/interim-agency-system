import { describe, it, expect } from 'vitest';
import { DomainError, DuplicateAvs, WorkerArchived, WorkerNotFound } from './errors.js';

describe('Domain errors', () => {
  it('DomainError sets code + message', () => {
    const err = new DomainError('boom_code', 'boom');
    expect(err.code).toBe('boom_code');
    expect(err.message).toBe('boom');
    expect(err.name).toBe('DomainError');
    expect(err).toBeInstanceOf(Error);
  });

  it('WorkerNotFound includes the id in the message', () => {
    const err = new WorkerNotFound('worker-42');
    expect(err.code).toBe('worker_not_found');
    expect(err.message).toContain('worker-42');
  });

  it('DuplicateAvs wraps the AVS value', () => {
    const err = new DuplicateAvs('756.1234.5678.97');
    expect(err.code).toBe('duplicate_avs');
    expect(err.message).toContain('756.1234.5678.97');
  });

  it('WorkerArchived includes id and refuses mutation', () => {
    const err = new WorkerArchived('worker-99');
    expect(err.code).toBe('worker_archived');
    expect(err.message).toContain('worker-99');
  });
});

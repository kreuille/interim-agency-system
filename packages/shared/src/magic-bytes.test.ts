import { describe, it, expect } from 'vitest';
import { isMimeConsistent, sniffMime } from './magic-bytes.js';

describe('sniffMime', () => {
  it('detects PDF by %PDF header', () => {
    const buf = Buffer.from('%PDF-1.7\n...');
    expect(sniffMime(buf)).toBe('application/pdf');
  });

  it('detects JPEG by FFD8FF', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(sniffMime(buf)).toBe('image/jpeg');
  });

  it('detects PNG by signature', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(sniffMime(buf)).toBe('image/png');
  });

  it('detects HEIC via ftypheic at offset 4', () => {
    const buf = Buffer.from([
      0x00, 0x00, 0x00, 0x00, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00,
    ]);
    expect(sniffMime(buf)).toBe('image/heic');
  });

  it('returns undefined for unknown bytes (EXE, script, noise)', () => {
    expect(sniffMime(Buffer.from('MZ\x90\x00'))).toBeUndefined();
    expect(sniffMime(Buffer.from('<script>alert(1)</script>'))).toBeUndefined();
  });

  it('returns undefined when buffer is too short', () => {
    expect(sniffMime(Buffer.alloc(1))).toBeUndefined();
  });
});

describe('isMimeConsistent', () => {
  it('returns true when declared matches sniffed', () => {
    expect(isMimeConsistent('application/pdf', Buffer.from('%PDF-1.4'))).toBe(true);
  });

  it('returns false when declared PDF but body is EXE', () => {
    expect(isMimeConsistent('application/pdf', Buffer.from('MZ\x90\x00'))).toBe(false);
  });

  it('is case insensitive on declared MIME', () => {
    expect(isMimeConsistent('APPLICATION/PDF', Buffer.from('%PDF'))).toBe(true);
  });
});

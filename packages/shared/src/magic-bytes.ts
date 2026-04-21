/**
 * Magic-bytes sniffing pour refuser un binaire déguisé en PDF/image avant
 * d'atteindre l'Object Storage. Complément (pas substitut) au scan antivirus.
 */

export type SupportedMime = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/heic';

interface Signature {
  readonly mime: SupportedMime;
  readonly bytes: readonly number[];
  readonly offset?: number;
}

const SIGNATURES: readonly Signature[] = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/heic', bytes: [0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], offset: 4 }, // ftypheic at offset 4
];

export function sniffMime(buffer: Buffer): SupportedMime | undefined {
  for (const sig of SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (buffer.byteLength < offset + sig.bytes.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buffer[offset + i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) return sig.mime;
  }
  return undefined;
}

export function isMimeConsistent(declared: string, buffer: Buffer): boolean {
  const sniffed = sniffMime(buffer);
  if (!sniffed) return false;
  return sniffed === declared.toLowerCase();
}

import { createHash } from 'node:crypto';
import type { PayslipDocument } from '@interim/domain';
import type {
  PayslipPdfRenderer,
  PayslipPdfStorage,
  RenderedPayslipPdf,
  StorePayslipPdfInput,
} from './payslip-pdf-ports.js';

/**
 * Renderer déterministe pour tests : sérialise le document JSON et
 * calcule un sha256 stable. Permet d'asserter sur la chaîne use case
 * → renderer → storage sans dépendre de pdf-lib.
 */
export class StubPayslipPdfRenderer implements PayslipPdfRenderer {
  render(doc: PayslipDocument): Promise<RenderedPayslipPdf> {
    const json = JSON.stringify(doc);
    const bytes = new TextEncoder().encode(json);
    const sha256Hex = createHash('sha256').update(bytes).digest('hex');
    return Promise.resolve({ bytes, sha256Hex });
  }
}

export class InMemoryPayslipPdfStorage implements PayslipPdfStorage {
  readonly stored = new Map<string, { bytes: Uint8Array; sha256Hex: string }>();

  store(input: StorePayslipPdfInput): Promise<{ key: string }> {
    const key = `mem-payslip://${input.agencyId}/${input.workerId}/${input.isoWeek}.pdf`;
    this.stored.set(key, { bytes: input.bytes, sha256Hex: input.sha256Hex });
    return Promise.resolve({ key });
  }

  getDownloadUrl(key: string, ttlSeconds = 900): Promise<string> {
    return Promise.resolve(
      `https://payslip.test/signed/${encodeURIComponent(key)}?ttl=${String(ttlSeconds)}`,
    );
  }
}

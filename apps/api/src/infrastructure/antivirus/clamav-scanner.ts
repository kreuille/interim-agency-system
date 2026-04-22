import { Readable } from 'node:stream';
import NodeClam from 'clamscan';
import type { AntivirusScanner, AntivirusVerdict } from '@interim/application';

export interface ClamavConfig {
  /** Hôte du daemon clamd (ex. `clamav` dans docker-compose). */
  readonly host: string;
  /** Port TCP clamd, par défaut 3310. */
  readonly port?: number;
  /** Timeout (ms) du scan. */
  readonly timeoutMs?: number;
}

/**
 * Adapter ClamAV qui scanne un buffer via TCP vers `clamd`.
 *
 * Le service `clamav` est ajouté à docker-compose pour le dev local
 * (image `clamav/clamav:stable`, port 3310). En prod GCP, on déploiera
 * un Cloud Run dédié `clamav-daemon` (long-lived) ou on utilisera le
 * scan via Google Cloud Security Command Center / VirusTotal API.
 */
export class ClamavAntivirusScanner implements AntivirusScanner {
  private clamPromise: Promise<NodeClam> | undefined;

  constructor(private readonly config: ClamavConfig) {}

  private getClam(): Promise<NodeClam> {
    this.clamPromise ??= new NodeClam().init({
      clamdscan: {
        host: this.config.host,
        port: this.config.port ?? 3310,
        timeout: this.config.timeoutMs ?? 60_000,
        localFallback: false,
      },
      preference: 'clamdscan',
    });
    return this.clamPromise;
  }

  async scan(body: Buffer): Promise<AntivirusVerdict> {
    const clam = await this.getClam();
    const stream = Readable.from(body);
    const result = (await clam.scanStream(stream)) as unknown as { isInfected: boolean };
    return result.isInfected ? 'infected' : 'clean';
  }
}

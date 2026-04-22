import type { OcrExtractor } from '@interim/application';

/**
 * Implémentation par défaut : ne fait rien. Permet de wirer le port `OcrExtractor`
 * sans dépendance lourde (tesseract.js ~200 MB) en dev/staging.
 *
 * Une vraie implémentation arrivera quand le besoin métier sera confirmé
 * par les retours utilisateurs (combien d'intérimaires laissent `expiresAt`
 * vide à l'upload ?). Voir DETTE-022 pour la roadmap.
 */
export class NoOpOcrExtractor implements OcrExtractor {
  extractDates(_input: { mimeType: string; body: Buffer }): Promise<{ expiresAt?: Date }> {
    return Promise.resolve({});
  }
}

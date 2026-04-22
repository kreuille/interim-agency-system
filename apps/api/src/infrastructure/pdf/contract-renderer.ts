import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { ContractPdfRenderer, RenderedContractPdf } from '@interim/application';
import type { ContractDocument, ContractSection } from '@interim/domain';

/**
 * Renderer PDF basé sur `pdf-lib` (pas de dépendance native, déterministe,
 * pure JS — compatible serverless / edge runtime).
 *
 * Mise en page :
 *   - A4 portrait (595 × 842 pt)
 *   - Marges 50 pt
 *   - Police Helvetica (StandardFont, embedded auto)
 *   - Titre 18 pt bold, sous-titre 11 pt, header 9 pt
 *   - Sections : titre 13 pt bold, body 10 pt, paragraphes wrap manuel
 *
 * Hash : SHA-256 hex sur les bytes finaux. Deterministic si on fixe
 * `creationDate` (sinon pdf-lib insère la date système). On force ici
 * `setCreationDate(new Date(0))` pour rendre les bytes idempotents
 * → 2 appels même input = même hash. Critique pour la déduplication.
 */
export class PdfLibContractRenderer implements ContractPdfRenderer {
  async render(doc: ContractDocument): Promise<RenderedContractPdf> {
    const pdf = await PDFDocument.create();
    pdf.setCreationDate(new Date(0));
    pdf.setModificationDate(new Date(0));
    pdf.setTitle(doc.title);

    const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    let page = pdf.addPage([595, 842]);
    const cursor = { y: 800 };

    // Header
    drawHeader(page, helveticaBold, helvetica, doc, cursor);

    // Title + subtitle
    cursor.y -= 12;
    page.drawText(sanitizeForWinAnsi(doc.title), {
      x: 50,
      y: cursor.y,
      size: 18,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    cursor.y -= 22;
    page.drawText(sanitizeForWinAnsi(doc.subtitle), {
      x: 50,
      y: cursor.y,
      size: 11,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });
    cursor.y -= 24;

    // Sections
    const sections: readonly ContractSection[] = [
      doc.partiesSection,
      doc.missionSection,
      doc.remunerationSection,
      doc.cctMentionsSection,
      doc.signaturesSection,
    ];

    for (const section of sections) {
      page = ensureRoom(pdf, page, cursor, 60);
      drawSectionTitle(page, helveticaBold, section.title, cursor);
      for (const paragraph of section.body) {
        page = drawParagraph(pdf, page, helvetica, paragraph, cursor);
      }
      cursor.y -= 8;
    }

    // Footer (multi-page : on n'écrit que sur la dernière page)
    page = ensureRoom(pdf, page, cursor, 30);
    cursor.y = Math.min(cursor.y, 60);
    for (const line of doc.footerLines) {
      page.drawText(sanitizeForWinAnsi(line), {
        x: 50,
        y: cursor.y,
        size: 8,
        font: helvetica,
        color: rgb(0.4, 0.4, 0.4),
      });
      cursor.y -= 11;
    }

    const bytes = await pdf.save({ updateFieldAppearances: false });
    const sha256Hex = createHash('sha256').update(bytes).digest('hex');
    return { bytes, sha256Hex };
  }
}

function drawHeader(
  page: PDFPage,
  bold: PDFFont,
  regular: PDFFont,
  doc: ContractDocument,
  cursor: { y: number },
): void {
  for (const line of doc.headerLines) {
    page.drawText(sanitizeForWinAnsi(line), {
      x: 50,
      y: cursor.y,
      size: 9,
      font: bold,
      color: rgb(0.1, 0.1, 0.1),
    });
    cursor.y -= 11;
  }
  // Trait de séparation
  page.drawLine({
    start: { x: 50, y: cursor.y - 4 },
    end: { x: 545, y: cursor.y - 4 },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  cursor.y -= 12;
  void regular;
}

function drawSectionTitle(
  page: PDFPage,
  bold: PDFFont,
  title: string,
  cursor: { y: number },
): void {
  page.drawText(sanitizeForWinAnsi(title), {
    x: 50,
    y: cursor.y,
    size: 13,
    font: bold,
    color: rgb(0, 0, 0),
  });
  cursor.y -= 16;
}

/**
 * Wrap manuel : casse les lignes à ~85 caractères, ajoute un nouveau
 * page si manque de place. Renvoie la page courante (peut avoir changé).
 */
function drawParagraph(
  pdf: PDFDocument,
  page: PDFPage,
  font: PDFFont,
  text: string,
  cursor: { y: number },
): PDFPage {
  const wrapped = wrapText(text, 85);
  for (const line of wrapped) {
    page = ensureRoom(pdf, page, cursor, 14);
    page.drawText(line, {
      x: 50,
      y: cursor.y,
      size: 10,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    cursor.y -= 13;
  }
  return page;
}

function ensureRoom(
  pdf: PDFDocument,
  page: PDFPage,
  cursor: { y: number },
  needed: number,
): PDFPage {
  if (cursor.y - needed >= 50) return page;
  const next = pdf.addPage([595, 842]);
  cursor.y = 800;
  return next;
}

function wrapText(text: string, maxChars: number): readonly string[] {
  const sanitized = sanitizeForWinAnsi(text);
  if (sanitized.length <= maxChars) return [sanitized];
  const words = sanitized.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length === 0) {
      current = word;
      continue;
    }
    if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/**
 * pdf-lib `StandardFonts.Helvetica` utilise l'encodage WinAnsi qui ne
 * supporte pas tous les Unicode. On remplace les caracteres courants
 * problematiques par leurs equivalents ASCII pour rester sur. Pour un
 * support Unicode complet (emoji, non-latin), embedder une police TTF
 * via fontkit (DETTE-045 si necessaire).
 */
const REPLACEMENTS: readonly (readonly [RegExp, string])[] = [
  [/\u2265/g, '>='], // >=
  [/\u2264/g, '<='], // <=
  [/\u2260/g, '!='], // !=
  [/\u00a0/g, ' '], // espace insecable
  [/\u1d49/g, 'e'], // exposant 'e'
  [/[\u2018\u2019]/g, "'"], // guillemets simples typo
  [/[\u201c\u201d]/g, '"'], // guillemets doubles typo
  [/\u2014/g, '--'], // em dash
  [/\u2013/g, '-'], // en dash
  [/\u2026/g, '...'], // ellipsis
];

function sanitizeForWinAnsi(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

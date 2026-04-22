import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { PayslipPdfRenderer, RenderedPayslipPdf } from '@interim/application';
import type { PayslipDocument, PayslipHoursSection, PayslipSection } from '@interim/domain';

/**
 * Renderer PDF du bulletin de salaire — pdf-lib pure JS, déterministe.
 * Pattern identique à `PdfLibContractRenderer` (A4.2) :
 *   - A4 portrait (595 × 842 pt), marges 50 pt
 *   - Helvetica StandardFont (WinAnsi)
 *   - `setCreationDate(new Date(0))` → bytes idempotents → hash stable
 *   - Multi-page auto via `ensureRoom`
 *   - Sanitize Unicode → WinAnsi (≥/≤/NBSP/quotes/em-dash/ellipsis)
 *
 * Layout :
 *   En-tête agence (3 lignes) + ligne sépa
 *   Titre 18 pt + sous-titre 11 pt
 *   Sections key-value à 2 colonnes (label gauche, value droite)
 *   Section hours : tableau 2 colonnes + totals row
 *   Footer 8 pt gris
 */
export class PdfLibPayslipRenderer implements PayslipPdfRenderer {
  async render(doc: PayslipDocument): Promise<RenderedPayslipPdf> {
    const pdf = await PDFDocument.create();
    pdf.setCreationDate(new Date(0));
    pdf.setModificationDate(new Date(0));
    pdf.setTitle(doc.title);

    const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    let page = pdf.addPage([595, 842]);
    const cursor = { y: 800 };

    // En-tête agence
    for (const line of doc.agencyHeader) {
      page.drawText(sanitizeForWinAnsi(line), {
        x: 50,
        y: cursor.y,
        size: 9,
        font: helveticaBold,
        color: rgb(0.1, 0.1, 0.1),
      });
      cursor.y -= 11;
    }
    page.drawLine({
      start: { x: 50, y: cursor.y - 4 },
      end: { x: 545, y: cursor.y - 4 },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
    cursor.y -= 16;

    // Titre + sous-titre
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
    cursor.y -= 22;

    // Sections key-value
    for (const section of [doc.workerSection, doc.periodSection]) {
      page = ensureRoom(pdf, page, cursor, 60);
      page = drawKeyValueSection(pdf, page, helvetica, helveticaBold, section, cursor);
    }

    // Section heures (tableau)
    page = ensureRoom(pdf, page, cursor, 80);
    page = drawHoursSection(pdf, page, helvetica, helveticaBold, doc.hoursSection, cursor);

    // Sections financières
    for (const section of [
      doc.grossSection,
      doc.deductionsSection,
      doc.netSection,
      doc.quittanceSection,
    ]) {
      page = ensureRoom(pdf, page, cursor, 60);
      page = drawKeyValueSection(pdf, page, helvetica, helveticaBold, section, cursor);
    }

    // Footer
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
      cursor.y -= 10;
    }

    const bytes = await pdf.save({ updateFieldAppearances: false });
    const sha256Hex = createHash('sha256').update(bytes).digest('hex');
    return { bytes, sha256Hex };
  }
}

function drawKeyValueSection(
  pdf: PDFDocument,
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  section: PayslipSection,
  cursor: { y: number },
): PDFPage {
  page.drawText(sanitizeForWinAnsi(section.heading), {
    x: 50,
    y: cursor.y,
    size: 13,
    font: bold,
    color: rgb(0, 0, 0),
  });
  cursor.y -= 16;
  for (const row of section.rows) {
    page = ensureRoom(pdf, page, cursor, 14);
    const labelFont = row.emphasize ? bold : font;
    page.drawText(sanitizeForWinAnsi(row.label), {
      x: 60,
      y: cursor.y,
      size: 10,
      font: labelFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    if (row.value.length > 0) {
      page.drawText(sanitizeForWinAnsi(row.value), {
        x: 350,
        y: cursor.y,
        size: 10,
        font: row.emphasize ? bold : font,
        color: rgb(0.05, 0.05, 0.05),
      });
    }
    cursor.y -= 13;
  }
  cursor.y -= 6;
  return page;
}

function drawHoursSection(
  pdf: PDFDocument,
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  section: PayslipHoursSection,
  cursor: { y: number },
): PDFPage {
  page.drawText(sanitizeForWinAnsi(section.heading), {
    x: 50,
    y: cursor.y,
    size: 13,
    font: bold,
    color: rgb(0, 0, 0),
  });
  cursor.y -= 16;
  // En-tête tableau
  let x = 60;
  for (const h of section.headers) {
    page.drawText(sanitizeForWinAnsi(h), {
      x,
      y: cursor.y,
      size: 10,
      font: bold,
      color: rgb(0.1, 0.1, 0.1),
    });
    x += 240;
  }
  cursor.y -= 13;
  page.drawLine({
    start: { x: 50, y: cursor.y + 4 },
    end: { x: 545, y: cursor.y + 4 },
    thickness: 0.3,
    color: rgb(0.7, 0.7, 0.7),
  });
  cursor.y -= 4;
  // Lignes
  for (const row of section.rows) {
    page = ensureRoom(pdf, page, cursor, 14);
    let cx = 60;
    for (const cell of row) {
      page.drawText(sanitizeForWinAnsi(cell), {
        x: cx,
        y: cursor.y,
        size: 10,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      cx += 240;
    }
    cursor.y -= 13;
  }
  // Ligne totaux
  page = ensureRoom(pdf, page, cursor, 16);
  page.drawLine({
    start: { x: 50, y: cursor.y + 4 },
    end: { x: 545, y: cursor.y + 4 },
    thickness: 0.5,
    color: rgb(0.5, 0.5, 0.5),
  });
  cursor.y -= 4;
  let tx = 60;
  for (const cell of section.totalsRow) {
    page.drawText(sanitizeForWinAnsi(cell), {
      x: tx,
      y: cursor.y,
      size: 10,
      font: bold,
      color: rgb(0, 0, 0),
    });
    tx += 240;
  }
  cursor.y -= 18;
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

const REPLACEMENTS: readonly (readonly [RegExp, string])[] = [
  [/≥/g, '>='],
  [/≤/g, '<='],
  [/≠/g, '!='],
  [/\u00a0/g, ' '],
  [/[\u2018\u2019]/g, "'"],
  [/[\u201c\u201d]/g, '"'],
  [/—/g, '--'],
  [/–/g, '-'],
  [/…/g, '...'],
  [/\u02b8/g, 'e'],
  [/ᵉ/g, 'e'],
];

function sanitizeForWinAnsi(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

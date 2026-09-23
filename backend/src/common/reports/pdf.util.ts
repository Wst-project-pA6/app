/**
 * Hand-rolled, dependency-free PDF writer for export documents (no pdf-lib/pdfkit/puppeteer in
 * package.json, and installing one for a single MVP feature was flagged as a blocker rather than
 * done silently — see the session report). Produces a minimal, spec-valid PDF 1.4 document
 * using only the standard (non-embedded) Helvetica font: a Catalog, a Pages tree, one content
 * stream per page of plain left-aligned text lines, and a correct cross-reference table.
 *
 * Text is restricted to the printable ASCII range (0x20-0x7E); any other character (including
 * Arabic locale content) is replaced with '?'. The standard Type1 Helvetica font has no glyphs
 * beyond WinAnsi/Latin text without embedding a font program, which this minimal writer does
 * not do — documented as an assumption in the session report, not a silent truncation.
 */

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const LINE_HEIGHT = 14;
const BODY_FONT_SIZE = 9;
const TITLE_FONT_SIZE = 14;

function toAsciiSafe(text: string): string {
  return Array.from(text)
    .map((ch) => (ch.codePointAt(0)! >= 0x20 && ch.codePointAt(0)! <= 0x7e ? ch : '?'))
    .join('');
}

function escapePdfText(text: string): string {
  return toAsciiSafe(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function textLineOp(x: number, y: number, fontSize: number, text: string): string {
  return `BT /F1 ${fontSize} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`;
}

interface PdfObj {
  id: number;
  body: string;
}

/** Builds a paginated, plain-text PDF report: a title on every page followed by one line of body text per row. */
export function buildTextPdf(title: string, lines: string[]): Buffer {
  const usableHeight = PAGE_HEIGHT - MARGIN * 2 - LINE_HEIGHT * 2;
  const linesPerPage = Math.max(1, Math.floor(usableHeight / LINE_HEIGHT));
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) pages.push(lines.slice(i, i + linesPerPage));
  if (pages.length === 0) pages.push([]);

  const CATALOG_ID = 1;
  const PAGES_ID = 2;
  const FONT_ID = 3;
  let nextId = 4;

  const objects: PdfObj[] = [];
  const pageIds: number[] = [];

  for (const pageLines of pages) {
    const contentId = nextId++;
    const pageId = nextId++;
    pageIds.push(pageId);

    const ops: string[] = [];
    let y = PAGE_HEIGHT - MARGIN;
    ops.push(textLineOp(MARGIN, y, TITLE_FONT_SIZE, title));
    y -= LINE_HEIGHT * 1.8;
    for (const line of pageLines) {
      ops.push(textLineOp(MARGIN, y, BODY_FONT_SIZE, line));
      y -= LINE_HEIGHT;
    }
    const stream = ops.join('\n');
    objects.push({ id: contentId, body: `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream` });
    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent ${PAGES_ID} 0 R /Resources << /Font << /F1 ${FONT_ID} 0 R >> >> /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentId} 0 R >>`,
    });
  }

  objects.unshift({ id: FONT_ID, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' });
  objects.unshift({
    id: PAGES_ID,
    body: `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
  });
  objects.unshift({ id: CATALOG_ID, body: `<< /Type /Catalog /Pages ${PAGES_ID} 0 R >>` });
  objects.sort((a, b) => a.id - b.id);

  const header = '%PDF-1.4\n';
  const parts: Buffer[] = [Buffer.from(header, 'latin1')];
  const offsetById = new Map<number, number>();
  let position = Buffer.byteLength(header, 'latin1');

  for (const obj of objects) {
    offsetById.set(obj.id, position);
    const chunk = Buffer.from(`${obj.id} 0 obj\n${obj.body}\nendobj\n`, 'latin1');
    parts.push(chunk);
    position += chunk.length;
  }

  const xrefStart = position;
  const totalEntries = objects.length + 1; // +1 for the always-free object 0
  let xref = `xref\n0 ${totalEntries}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objects.length; id++) {
    xref += `${String(offsetById.get(id)).padStart(10, '0')} 00000 n \n`;
  }
  parts.push(Buffer.from(xref, 'latin1'));
  parts.push(
    Buffer.from(`trailer\n<< /Size ${totalEntries} /Root ${CATALOG_ID} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`, 'latin1'),
  );

  return Buffer.concat(parts);
}

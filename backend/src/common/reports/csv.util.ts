/**
 * A leading =, +, - or @ makes some spreadsheet applications (Excel, Google Sheets, LibreOffice)
 * evaluate the cell as a formula when the CSV is opened — the classic "CSV/formula injection"
 * vector for exported user- or database-controlled text. Prefixing the cell with a single quote
 * forces it to be read back as literal text while remaining valid, unescaped CSV content.
 */
const FORMULA_TRIGGER = /^[=+\-@]/;

function neutralizeFormula(value: string): string {
  return FORMULA_TRIGGER.test(value) ? `'${value}` : value;
}

function escapeCsvCell(raw: string): string {
  const value = neutralizeFormula(raw);
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function cellToString(cell: string | number | boolean | null | undefined): string {
  if (cell === null || cell === undefined) return '';
  return String(cell);
}

/** Builds an RFC 4180 CSV document (CRLF line endings) with formula-injection neutralization on every cell. */
export function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const lines = [headers.map((header) => escapeCsvCell(header)).join(',')];
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvCell(cellToString(cell))).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

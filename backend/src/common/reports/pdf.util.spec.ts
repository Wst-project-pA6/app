import { buildTextPdf } from './pdf.util';

describe('buildTextPdf', () => {
  it('starts with the PDF header and ends with %%EOF', () => {
    const pdf = buildTextPdf('Report', ['line one']);
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('produces a single page for a short report and a Kids array of matching length', () => {
    const pdf = buildTextPdf('Report', ['line one', 'line two']);
    const text = pdf.toString('latin1');
    expect(text).toMatch(/\/Type \/Pages \/Kids \[\d+ 0 R\] \/Count 1/);
  });

  it('paginates when there are more lines than fit on one page', () => {
    const manyLines = Array.from({ length: 200 }, (_, i) => `row ${i}`);
    const pdf = buildTextPdf('Report', manyLines);
    const text = pdf.toString('latin1');
    const match = text.match(/\/Type \/Pages \/Kids \[([^\]]*)\] \/Count (\d+)/);
    expect(match).not.toBeNull();
    const [, kids, count] = match!;
    expect(Number(count)).toBeGreaterThan(1);
    expect(kids.split(' 0 R').filter(Boolean).length).toBe(Number(count));
  });

  it('every xref offset points at the exact byte position of "<id> 0 obj"', () => {
    const pdf = buildTextPdf('Report', ['a', 'b', 'c']);
    const text = pdf.toString('latin1');
    const xrefStart = Number(text.match(/startxref\n(\d+)\n/)![1]);
    expect(text.slice(xrefStart, xrefStart + 4)).toBe('xref');

    const xrefSection = text.slice(xrefStart);
    const sizeMatch = text.match(/\/Size (\d+)/);
    const size = Number(sizeMatch![1]);
    // Lines: [0]="xref", [1]="0 <size>", [2]=free-object-0 entry, [2+id]=entry for object <id>.
    const lines = xrefSection.split('\n');
    for (let id = 1; id < size; id++) {
      const entry = lines[2 + id];
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset, offset + `${id} 0 obj`.length)).toBe(`${id} 0 obj`);
    }
  });

  it('escapes parentheses and backslashes in text so the content stream stays well-formed', () => {
    const pdf = buildTextPdf('Report', ['a (nested) \\ value']);
    const text = pdf.toString('latin1');
    expect(text).toContain('a \\(nested\\) \\\\ value');
  });

  it('replaces non-ASCII characters with ? rather than corrupting the stream', () => {
    const pdf = buildTextPdf('Report', ['عربي']); // Arabic text
    const text = pdf.toString('latin1');
    expect(text).toContain('????');
  });

  it('renders an empty report as a single page with no crash', () => {
    const pdf = buildTextPdf('Empty Report', []);
    expect(pdf.toString('latin1')).toContain('/Count 1');
  });
});

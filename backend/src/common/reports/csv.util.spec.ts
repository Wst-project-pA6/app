import { toCsv } from './csv.util';

describe('toCsv', () => {
  it('renders a header row and data rows separated by CRLF', () => {
    const csv = toCsv(['a', 'b'], [['1', '2'], ['3', '4']]);
    expect(csv).toBe('a,b\r\n1,2\r\n3,4\r\n');
  });

  it.each(['=SUM(A1:A9)', '+1+1', '-1+1', '@SUM(A1)'])(
    'neutralizes a cell starting with a formula trigger character: %s',
    (dangerous) => {
      const csv = toCsv(['col'], [[dangerous]]);
      const [, dataLine] = csv.split('\r\n');
      expect(dataLine.startsWith("'")).toBe(true);
      expect(dataLine).toBe(`'${dangerous}`);
    },
  );

  it('does not alter a header row that happens to start with a trigger character', () => {
    // Regression guard: headers must go through the same neutralization as data cells.
    const csv = toCsv(['=header'], [['value']]);
    expect(csv.startsWith("'=header")).toBe(true);
  });

  it('leaves ordinary text and numbers untouched', () => {
    const csv = toCsv(['name', 'qty'], [['Brake Pad', 5]]);
    expect(csv).toBe('name,qty\r\nBrake Pad,5\r\n');
  });

  it('quotes and escapes cells containing commas, quotes or newlines', () => {
    const csv = toCsv(['note'], [['He said "hi", then left\nnext line']]);
    expect(csv).toBe('note\r\n"He said ""hi"", then left\nnext line"\r\n');
  });

  it('renders null and undefined cells as empty strings', () => {
    const csv = toCsv(['a', 'b'], [[null, undefined]]);
    expect(csv).toBe('a,b\r\n,\r\n');
  });

  it('neutralizes a formula trigger even when the cell also needs quoting', () => {
    const csv = toCsv(['note'], [['=A1,B1']]);
    const [, dataLine] = csv.split('\r\n');
    expect(dataLine).toBe('"\'=A1,B1"');
  });
});

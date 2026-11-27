/**
 * Client-side CSV formula-injection (CWE-1236) neutralization and RFC 4180 quoting.
 *
 * Spreadsheet applications (Excel, LibreOffice Calc, Google Sheets) evaluate
 * cell values beginning with `=`, `+`, `-`, `@`, `\t`, or `\r` — including
 * when preceded by leading whitespace or ASCII/Unicode control characters —
 * even when the cell is enclosed in CSV double quotes. Prefixing those cells
 * with a literal apostrophe (`'`) forces spreadsheets to treat the cell as
 * plain text.
 */

// Leading whitespace, C0/C1 control characters, or BOM that spreadsheets may strip before formula evaluation.
const LEADING_IGNORABLE_RE = /^[\s\u0000-\u001f\u007f-\u009f\ufeff]+/;
const FORMULA_TRIGGER_RE = /^[=+\-@\t\r]/;
const CONTROL_TRIGGER_RE = /[\t\r]/;
const CSV_NEEDS_QUOTING_RE = /[",\n\r]/;

/**
 * Neutralize spreadsheet formula triggers on a single CSV cell value.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const raw = String(value);
  if (raw.length === 0) {
    return '';
  }

  if (FORMULA_TRIGGER_RE.test(raw)) {
    return `'${raw}`;
  }

  const leadingMatch = LEADING_IGNORABLE_RE.exec(raw);
  if (leadingMatch) {
    const leading = leadingMatch[0];
    const rest = raw.slice(leading.length);
    if (CONTROL_TRIGGER_RE.test(leading) || FORMULA_TRIGGER_RE.test(rest)) {
      return `'${raw}`;
    }
  }

  return raw;
}

/**
 * Sanitize a cell value for spreadsheet safety and apply RFC 4180 CSV quoting.
 */
export function formatCsvCell(value: unknown): string {
  const safe = sanitizeCsvCell(value);
  if (CSV_NEEDS_QUOTING_RE.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/**
 * Serialize headers and row objects into a formula-safe CSV document.
 */
export function serializeCsv(
  headers: readonly string[],
  rows: ReadonlyArray<Record<string, unknown>>,
): string {
  const lines = [
    headers.map((h) => formatCsvCell(h)).join(','),
    ...rows.map((row) => headers.map((h) => formatCsvCell(row[h])).join(',')),
  ];
  return lines.join('\n');
}

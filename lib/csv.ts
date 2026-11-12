/**
 * Minimal CSV building and browser download.
 *
 * Every cell is quoted. Business names routinely contain commas ("Smith, LLC"),
 * and an unquoted comma silently shifts every later column one to the right —
 * the file still opens, it is just wrong.
 *
 * Cells that start with = + - @ are prefixed with a single quote so a
 * spreadsheet does not evaluate them as formulas (CSV injection): emails and
 * business names are typed by licensees, not by us.
 */

export type CsvCell = string | number | boolean | null | undefined;

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return '""';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

/** Trigger a download of `csv` in the browser. Client components only. */
export function downloadCsv(filename: string, csv: string): void {
  // The BOM makes Excel read the file as UTF-8 instead of mangling accents.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** `YYYY-MM-DD` for a filename, or '' for a missing/invalid date in a cell. */
export function isoDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
}

import * as XLSX from 'xlsx';
import type { BulkJob, BulkRow, ExtractionResult } from '../types';

/**
 * CSV and XLSX writers.
 *
 * Both formats are produced from one row model so a sheet exported as CSV and
 * the same sheet exported as XLSX always contain identical values. Phone
 * numbers, ZIP codes and similar digit strings are written as text so no
 * spreadsheet can reformat a leading zero or a "+1" out of existence.
 */

const TEXT_COLUMNS = /phone|zip|postal|fax|mobile|ssn/i;

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function timestampSuffix(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes(),
  )}`;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(headers: string[], rows: Array<Record<string, string | number>>): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(headers.map((header) => csvCell(row[header] ?? '')).join(','));
  // A BOM keeps accented characters intact when the file is opened in Excel.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Record<string, string | number>>): void {
  download(new Blob([rowsToCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }), filename);
}

export function downloadXlsx(
  filename: string,
  headers: string[],
  rows: Array<Record<string, string | number>>,
  sheetName = 'Extractor',
): void {
  const matrix: unknown[][] = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ''))];
  const sheet = XLSX.utils.aoa_to_sheet(matrix);

  headers.forEach((header, columnIndex) => {
    if (!TEXT_COLUMNS.test(header)) return;
    for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = sheet[address] as XLSX.CellObject | undefined;
      if (cell && cell.v !== '' && cell.v !== undefined) {
        cell.t = 's';
        cell.v = String(cell.v);
        cell.z = '@';
      }
    }
  });

  sheet['!cols'] = headers.map((header) => ({ wch: Math.min(46, Math.max(12, header.length + 4)) }));

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  const buffer = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  download(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename,
  );
}

/* ----------------------------- Single result ----------------------------- */

export const SINGLE_HEADERS = [
  'Query',
  'Query Type',
  'Status',
  'Confidence',
  'Entity Match',
  'Company',
  'Website',
  'Owner',
  'Phone',
  'Phone Type',
  'All Phones',
  'Email',
  'All Emails',
  'Address',
  'City',
  'State',
  'ZIP',
  'Socials',
  'Sources Consulted',
  'Transport Mode',
  'Duration (ms)',
  'Extracted At',
];

export function singleResultRow(result: ExtractionResult): Record<string, string | number> {
  const primaryPhone = result.phones[0];
  const primaryEmail = result.emails[0];
  const primaryAddress = result.addresses[0];
  return {
    Query: result.query,
    'Query Type': result.queryType,
    Status: result.status,
    Confidence: result.confidence,
    'Entity Match': result.entityMatchStatus,
    Company: result.companyName ?? '',
    Website: result.website,
    Owner: result.owner?.name ?? '',
    Phone: primaryPhone?.formatted ?? '',
    'Phone Type': primaryPhone?.type ?? '',
    'All Phones': result.phones.map((p) => p.formatted).join(' | '),
    Email: primaryEmail?.email ?? '',
    'All Emails': result.emails.map((e) => e.email).join(' | '),
    Address: primaryAddress?.full ?? '',
    City: primaryAddress?.city ?? '',
    State: primaryAddress?.state ?? '',
    ZIP: primaryAddress?.zip ?? '',
    Socials: result.socials.map((s) => s.url).join(' | '),
    'Sources Consulted': result.consultedSources.length,
    'Transport Mode': result.transportMode,
    'Duration (ms)': result.durationMs,
    'Extracted At': result.createdAt,
  };
}

export function exportSingleResult(result: ExtractionResult, format: 'csv' | 'xlsx'): void {
  const rows = [singleResultRow(result)];
  const name = `extractor-result-${timestampSuffix()}.${format}`;
  if (format === 'csv') downloadCsv(name, SINGLE_HEADERS, rows);
  else downloadXlsx(name, SINGLE_HEADERS, rows, 'Result');
}

/* -------------------------------- Bulk job ------------------------------- */

const ENRICHMENT_HEADERS = [
  'Extractor Status',
  'Extractor Detail',
  'Extractor Query Used',
  'Found Company',
  'Found Website',
  'Found Owner',
  'Found Phone',
  'Found Phone Type',
  'Found Additional Phones',
  'Found Email',
  'Found Additional Emails',
  'Found Address',
  'Found City',
  'Found State',
  'Found ZIP',
  'Found Socials',
  'Confidence',
  'Entity Match',
  'Sources Consulted',
  'Duration (ms)',
];

/**
 * Builds the export table for a bulk job.
 *
 * Original columns come first and are copied verbatim from the parsed sheet, so
 * a row's identity survives the round trip. Enrichment columns are appended
 * with an "Extractor"/"Found" prefix, which is what keeps them from colliding
 * with a customer's own headings. Excluded sensitive columns were dropped at
 * parse time and are absent from both the model and this table.
 */
export function bulkExportTable(job: BulkJob): {
  headers: string[];
  rows: Array<Record<string, string | number>>;
} {
  const originalHeaders = job.file.headers.filter((header) => !job.file.excludedColumns.includes(header));
  const headers = ['Row', ...originalHeaders, ...ENRICHMENT_HEADERS];

  const rows = job.rows.map((row) => {
    const record: Record<string, string | number> = { Row: row.rowNumber };
    for (const header of originalHeaders) record[header] = row.original[header] ?? '';
    Object.assign(record, enrichmentCells(row));
    return record;
  });

  return { headers, rows };
}

function enrichmentCells(row: BulkRow): Record<string, string | number> {
  const empty: Record<string, string | number> = {};
  for (const header of ENRICHMENT_HEADERS) empty[header] = '';

  empty['Extractor Status'] = row.status;
  empty['Extractor Query Used'] = row.query;

  if (row.status === 'skipped') {
    empty['Extractor Detail'] = row.skipReason ?? 'The row was skipped.';
    return empty;
  }
  if (!row.result) {
    empty['Extractor Detail'] = row.error ?? 'No result was produced for this row.';
    return empty;
  }

  const result = row.result;
  const phone = result.phones[0];
  const address = result.addresses[0];

  empty['Extractor Detail'] = result.failureReason ?? result.confidenceBasis[0] ?? '';
  empty['Found Company'] = result.companyName ?? '';
  empty['Found Website'] = result.website;
  empty['Found Owner'] = result.owner?.name ?? '';
  empty['Found Phone'] = phone?.formatted ?? '';
  empty['Found Phone Type'] = phone?.type ?? '';
  empty['Found Additional Phones'] = result.phones.slice(1).map((p) => p.formatted).join(' | ');
  empty['Found Email'] = result.emails[0]?.email ?? '';
  empty['Found Additional Emails'] = result.emails.slice(1).map((e) => e.email).join(' | ');
  empty['Found Address'] = address?.full ?? '';
  empty['Found City'] = address?.city ?? '';
  empty['Found State'] = address?.state ?? '';
  empty['Found ZIP'] = address?.zip ?? '';
  empty['Found Socials'] = result.socials.map((s) => s.url).join(' | ');
  empty.Confidence = result.confidence;
  empty['Entity Match'] = result.entityMatchStatus;
  empty['Sources Consulted'] = result.consultedSources.length;
  empty['Duration (ms)'] = result.durationMs;
  return empty;
}

export function exportBulkJob(job: BulkJob, format: 'csv' | 'xlsx'): void {
  const { headers, rows } = bulkExportTable(job);
  const base = job.file.filename.replace(/\.[^.]+$/, '') || 'bulk';
  const name = `${base}-enriched-${timestampSuffix()}.${format}`;
  if (format === 'csv') downloadCsv(name, headers, rows);
  else downloadXlsx(name, headers, rows, 'Enriched');
}

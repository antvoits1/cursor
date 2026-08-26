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

export interface SheetSpec {
  name: string;
  headers: string[];
  rows: Array<Record<string, string | number>>;
}

/**
 * Turns one table into a worksheet.
 *
 * Columns that hold phone numbers, ZIPs and IDs are forced to text, because
 * Excel will otherwise read "(305) 555-0147" as a formula and a leading-zero
 * ZIP as a number, and silently destroy both.
 */
function buildSheet(headers: string[], rows: Array<Record<string, string | number>>): XLSX.WorkSheet {
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

  // Widen each column to its content rather than its heading, capped so one
  // long URL cannot push the rest of the sheet off screen.
  sheet['!cols'] = headers.map((header) => {
    const widest = rows.reduce((max, row) => Math.max(max, String(row[header] ?? '').length), header.length);
    return { wch: Math.min(52, Math.max(10, widest + 2)) };
  });
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  if (rows.length > 0) {
    sheet['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } }),
    };
  }
  return sheet;
}

export function downloadXlsx(
  filename: string,
  headers: string[],
  rows: Array<Record<string, string | number>>,
  sheetName = 'Extractor',
): void {
  downloadWorkbook(filename, [{ name: sheetName, headers, rows }]);
}

/**
 * Writes several tables into one workbook.
 *
 * A run can produce far more per lead than fits on a row, so the operator's own
 * sheet keeps the best value per field and the remaining sheets carry every
 * value found, one per line, each with the page it came from. Empty tables are
 * still written, so the workbook always has the same tabs and an empty tab is
 * itself the answer to "did it find any?".
 */
export function downloadWorkbook(filename: string, sheets: SheetSpec[]): void {
  const book = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const spec of sheets) {
    // Excel rejects duplicate tab names and anything past 31 characters.
    let name = spec.name.slice(0, 31);
    let suffix = 2;
    while (used.has(name.toLowerCase())) name = `${spec.name.slice(0, 28)} ${suffix++}`;
    used.add(name.toLowerCase());
    XLSX.utils.book_append_sheet(book, buildSheet(spec.headers, spec.rows), name);
  }
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

/**
 * Columns appended to the operator's own sheet.
 *
 * A run can turn up a dozen numbers and half a dozen addresses for one lead.
 * Putting all of that on the original row would make the sheet unusable, so
 * this row carries only the best of each, plus a count saying how much more
 * there is. Everything else goes on the detail sheets, one line per value, so
 * nothing is lost and nothing is crammed.
 */
const ENRICHMENT_HEADERS = [
  'Extractor Status',
  'Extractor Detail',
  'Extractor Query Used',
  'Found Company',
  'Found Website',
  'Found Owner',
  'Best Phone',
  'Best Phone Type',
  'Best Phone Confidence',
  'Best Mobile',
  'Mobile Count',
  'Landline Count',
  'Phone Count',
  'Best Email',
  'Best Email Status',
  'Email Count',
  'Found Address',
  'Found City',
  'Found State',
  'Found ZIP',
  'Found Socials',
  'People Records',
  'Relatives Found',
  'Confidence',
  'Entity Match',
  'Sources Consulted',
  'Duration (ms)',
];

/** One line per phone number found, across every lead. */
const PHONE_DETAIL_HEADERS = [
  'Row',
  'Lead',
  'Number',
  'Line Type',
  'Line Type Confidence',
  'Line Type Basis',
  'Carrier',
  'Caller ID',
  'Reach Score',
  'Rank',
  'Sources Agreeing',
  'Recency',
  'Found On',
  'Source URL',
];

/** One line per email address found, across every lead. */
const EMAIL_DETAIL_HEADERS = [
  'Row',
  'Lead',
  'Email',
  'Kind',
  'Verdict',
  'Has MX',
  'SPF',
  'DMARC',
  'Disposable',
  'Role Account',
  'Catch-All',
  'Confidence',
  'Found On',
  'Source URL',
];

/** One line per person record returned by a people-search source. */
const PEOPLE_DETAIL_HEADERS = [
  'Row',
  'Lead',
  'Person',
  'Age',
  'Match Score',
  'Current Address',
  'Prior Addresses',
  'Mobile Numbers',
  'Landline Numbers',
  'Emails',
  'Relatives',
  'Source',
  'Source URL',
];

/** One line per source consulted, so every value can be traced to a page. */
const AUDIT_HEADERS = [
  'Row',
  'Lead',
  'Source',
  'Kind',
  'Read',
  'Blocked',
  'Reason',
  'Fields Found',
  'Elapsed (ms)',
  'URL',
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
  // Phones arrive ranked by how likely each is to reach a person, so the first
  // is the one worth putting on the row.
  const phone = result.phones[0];
  const bestMobile = result.phones.find((entry) => entry.type === 'MOBILE');
  const address = result.addresses[0];
  const email = result.emails[0];

  empty['Extractor Detail'] = result.failureReason ?? result.confidenceBasis[0] ?? '';
  empty['Found Company'] = result.companyName ?? '';
  empty['Found Website'] = result.website;
  empty['Found Owner'] = result.owner?.name ?? '';
  empty['Best Phone'] = phone?.formatted ?? '';
  empty['Best Phone Type'] = phone ? LINE_TYPE_LABEL[phone.type] : '';
  empty['Best Phone Confidence'] = phone?.reachabilityScore ?? '';
  empty['Best Mobile'] = bestMobile?.formatted ?? '';
  empty['Mobile Count'] = result.phones.filter((entry) => entry.type === 'MOBILE').length;
  empty['Landline Count'] = result.phones.filter((entry) => entry.type === 'LANDLINE').length;
  empty['Phone Count'] = result.phones.length;
  empty['Best Email'] = email?.email ?? '';
  empty['Best Email Status'] = email ? VERDICT_LABEL[email.verification.verdict] : '';
  empty['Email Count'] = result.emails.length;
  empty['Found Address'] = address?.full ?? '';
  empty['Found City'] = address?.city ?? '';
  empty['Found State'] = address?.state ?? '';
  empty['Found ZIP'] = address?.zip ?? '';
  empty['Found Socials'] = result.socials.map((s) => s.url).join(' | ');
  empty['People Records'] = result.people.length;
  empty['Relatives Found'] = result.people.reduce((sum, person) => sum + person.relatives.length, 0);
  empty.Confidence = result.confidence;
  empty['Entity Match'] = result.entityMatchStatus;
  empty['Sources Consulted'] = result.consultedSources.length;
  empty['Duration (ms)'] = result.durationMs;
  return empty;
}

export const LINE_TYPE_LABEL: Record<string, string> = {
  MOBILE: 'Mobile',
  LANDLINE: 'Landline',
  VOIP: 'VoIP',
  TOLL_FREE: 'Toll-free',
  UNKNOWN: 'Unknown',
};

export const VERDICT_LABEL: Record<string, string> = {
  deliverable: 'Deliverable',
  probably_deliverable: 'Probably deliverable',
  risky: 'Risky',
  undeliverable: 'Undeliverable',
  unverifiable: 'Not verifiable here',
};

function threeState(value: boolean | null): string {
  if (value === null) return 'Not checked';
  return value ? 'Yes' : 'No';
}

function leadLabel(row: BulkRow): string {
  return row.result?.companyName || row.query || `Row ${row.rowNumber}`;
}

/** Every phone number found, one per line, with the reasoning behind its type. */
export function phoneDetailTable(job: BulkJob): Array<Record<string, string | number>> {
  const rows: Array<Record<string, string | number>> = [];
  for (const row of job.rows) {
    for (const phone of row.result?.phones ?? []) {
      rows.push({
        Row: row.rowNumber,
        Lead: leadLabel(row),
        Number: phone.formatted,
        'Line Type': LINE_TYPE_LABEL[phone.type] ?? phone.type,
        'Line Type Confidence': phone.lineTypeConfidence,
        'Line Type Basis': phone.lineTypeBasis,
        Carrier: phone.carrier ?? '',
        'Caller ID': phone.callerIdName ?? '',
        'Reach Score': phone.reachabilityScore,
        Rank: phone.rank,
        'Sources Agreeing': phone.agreementCount,
        Recency: phone.recency ?? 'unknown',
        'Found On': phone.evidence.map((item) => item.sourceLabel).join(' | '),
        'Source URL': phone.evidence[0]?.url ?? '',
      });
    }
  }
  return rows;
}

/** Every email found, one per line, with each verification check spelled out. */
export function emailDetailTable(job: BulkJob): Array<Record<string, string | number>> {
  const rows: Array<Record<string, string | number>> = [];
  for (const row of job.rows) {
    for (const email of row.result?.emails ?? []) {
      const check = email.verification;
      rows.push({
        Row: row.rowNumber,
        Lead: leadLabel(row),
        Email: email.email,
        Kind: email.kind,
        Verdict: VERDICT_LABEL[check.verdict] ?? check.verdict,
        'Has MX': threeState(check.domainHasMx),
        SPF: threeState(check.hasSpf),
        DMARC: threeState(check.hasDmarc),
        Disposable: check.disposable ? 'Yes' : 'No',
        'Role Account': check.roleAccount ? 'Yes' : 'No',
        'Catch-All': threeState(check.catchAll),
        Confidence: email.confidence,
        'Found On': email.evidence.map((item) => item.sourceLabel).join(' | '),
        'Source URL': email.evidence[0]?.url ?? '',
      });
    }
  }
  return rows;
}

/** Whole person records, kept per source rather than merged together. */
export function peopleDetailTable(job: BulkJob): Array<Record<string, string | number>> {
  const rows: Array<Record<string, string | number>> = [];
  for (const row of job.rows) {
    for (const person of row.result?.people ?? []) {
      const mobiles = person.phones.filter((phone) => phone.type === 'MOBILE');
      const landlines = person.phones.filter((phone) => phone.type === 'LANDLINE');
      rows.push({
        Row: row.rowNumber,
        Lead: leadLabel(row),
        Person: person.name,
        Age: person.age ?? '',
        'Match Score': person.matchScore,
        'Current Address': person.currentAddress?.full ?? '',
        'Prior Addresses': person.priorAddresses.map((address) => address.full).join(' | '),
        'Mobile Numbers': mobiles.map((phone) => phone.formatted).join(' | '),
        'Landline Numbers': landlines.map((phone) => phone.formatted).join(' | '),
        Emails: person.emails.map((email) => email.email).join(' | '),
        Relatives: person.relatives.map((relative) => `${relative.name} (${relative.relation})`).join(' | '),
        Source: person.sourceLabel,
        'Source URL': person.sourceUrl,
      });
    }
  }
  return rows;
}

/**
 * Every source consulted for every lead, read or not.
 *
 * This is the audit trail: it answers "where did this come from" for any value
 * on the other sheets, and equally records the pages that refused to be read,
 * which is what tells the operator a gap is a blocked site rather than an
 * absent fact.
 */
export function auditTable(job: BulkJob): Array<Record<string, string | number>> {
  const rows: Array<Record<string, string | number>> = [];
  for (const row of job.rows) {
    for (const source of row.result?.consultedSources ?? []) {
      rows.push({
        Row: row.rowNumber,
        Lead: leadLabel(row),
        Source: source.label,
        Kind: source.kind,
        Read: source.ok ? 'Yes' : 'No',
        Blocked: source.blocked ? 'Yes' : 'No',
        Reason: source.reason ?? '',
        'Fields Found': source.fieldsFound.join(', '),
        'Elapsed (ms)': source.elapsedMs,
        URL: source.url,
      });
    }
  }
  return rows;
}

export function bulkWorkbookSheets(job: BulkJob): SheetSpec[] {
  const { headers, rows } = bulkExportTable(job);
  return [
    { name: 'Leads', headers, rows },
    { name: 'Phone Numbers', headers: PHONE_DETAIL_HEADERS, rows: phoneDetailTable(job) },
    { name: 'Email Addresses', headers: EMAIL_DETAIL_HEADERS, rows: emailDetailTable(job) },
    { name: 'People Records', headers: PEOPLE_DETAIL_HEADERS, rows: peopleDetailTable(job) },
    { name: 'Source Audit', headers: AUDIT_HEADERS, rows: auditTable(job) },
  ];
}

export function exportBulkJob(job: BulkJob, format: 'csv' | 'xlsx'): void {
  const base = job.file.filename.replace(/\.[^.]+$/, '') || 'bulk';
  const name = `${base}-enriched-${timestampSuffix()}.${format}`;
  if (format === 'csv') {
    // CSV holds one table, so it gets the enriched lead sheet. The detail
    // sheets need the workbook format.
    const { headers, rows } = bulkExportTable(job);
    downloadCsv(name, headers, rows);
    return;
  }
  downloadWorkbook(name, bulkWorkbookSheets(job));
}

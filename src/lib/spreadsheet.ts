import * as XLSX from 'xlsx';
import { scanSensitiveColumns } from './sensitive.js';
import type { BulkFileInfo, BulkRow, ColumnRole } from '../types.js';

/**
 * Spreadsheet import for bulk enrichment.
 *
 * The same module runs in the browser and on the server so a file parsed in
 * either place produces identical rows, identical column roles, and identical
 * exclusions. Original cells are preserved verbatim; enrichment never writes
 * back into them.
 */

export const SUPPORTED_EXTENSIONS = ['csv', 'xlsx', 'xls'] as const;
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

const ROLE_PATTERNS: Array<{ role: ColumnRole; patterns: RegExp[] }> = [
  { role: 'company', patterns: [/^company([\s._-]*name)?$/, /^business([\s._-]*name)?$/, /^organi[sz]ation$/, /^org$/, /^account([\s._-]*name)?$/, /^dba$/, /^legal[\s._-]*name$/, /^merchant([\s._-]*name)?$/, /^entity([\s._-]*name)?$/, /^lead([\s._-]*name)?$/, /^client$/, /^customer([\s._-]*name)?$/] },
  { role: 'owner', patterns: [/^owner([\s._-]*name)?$/, /^principal$/, /^contact([\s._-]*name)?$/, /^decision[\s._-]*maker$/, /^ceo$/, /^president$/, /^full[\s._-]*name$/, /^name$/] },
  { role: 'first_name', patterns: [/^first([\s._-]*name)?$/, /^fname$/, /^given([\s._-]*name)?$/] },
  { role: 'last_name', patterns: [/^last([\s._-]*name)?$/, /^lname$/, /^surname$/, /^family([\s._-]*name)?$/] },
  { role: 'phone', patterns: [/^phone([\s._-]*(number|no|#|1))?$/, /^tel(ephone)?$/, /^mobile$/, /^cell$/, /^contact[\s._-]*(phone|number)$/, /^business[\s._-]*phone$/] },
  { role: 'email', patterns: [/^e[\s._-]*mail([\s._-]*address)?$/, /^email$/, /^contact[\s._-]*email$/, /^business[\s._-]*email$/] },
  { role: 'website', patterns: [/^website$/, /^web[\s._-]*site$/, /^url$/, /^site$/, /^homepage$/, /^web$/] },
  { role: 'address', patterns: [/^address([\s._-]*(1|line[\s._-]*1))?$/, /^street([\s._-]*address)?$/, /^addr$/, /^mailing[\s._-]*address$/] },
  { role: 'city', patterns: [/^city$/, /^town$/, /^locality$/] },
  { role: 'state', patterns: [/^state$/, /^province$/, /^region$/, /^st$/] },
  { role: 'zip', patterns: [/^zip([\s._-]*code)?$/, /^postal([\s._-]*code)?$/, /^postcode$/] },
];

function normalise(header: string): string {
  return String(header ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Splits a trailing index off a heading.
 *
 * Real lead sheets number their repeated columns — "Phone 1" through "Phone 5",
 * "Email 1" through "Email 4". The index decides which one is treated as the
 * primary for its role; the rest are preserved untouched.
 */
function splitIndexedHeader(header: string): { base: string; index: number } {
  const cleaned = normalise(header);
  const match = cleaned.match(/^(.*?)[\s._-]*(\d{1,2})$/);
  if (!match || !match[1].trim()) return { base: cleaned, index: 0 };
  return { base: match[1].trim(), index: Number(match[2]) };
}

function matchRole(candidate: string): ColumnRole | null {
  const collapsed = candidate.replace(/[^a-z0-9]+/g, ' ').trim();
  for (const { role, patterns } of ROLE_PATTERNS) {
    if (patterns.some((p) => p.test(candidate) || p.test(collapsed) || p.test(collapsed.replace(/\s+/g, '')))) {
      return role;
    }
  }
  return null;
}

export function detectColumnRole(header: string): ColumnRole {
  const cleaned = normalise(header);
  const direct = matchRole(cleaned);
  if (direct) return direct;
  // "Phone 2" is a phone column; the number only says which one it is.
  const { base, index } = splitIndexedHeader(cleaned);
  if (index > 0) {
    const indexed = matchRole(base);
    if (indexed) return indexed;
  }
  return 'preserved';
}

/** Lower is more likely to be the primary column for its role. */
export function columnRoleRank(header: string): number {
  const { index } = splitIndexedHeader(normalise(header));
  return index;
}

export function extensionOf(filename: string): SupportedExtension | null {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = match?.[1];
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext ?? '') ? (ext as SupportedExtension) : null;
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/**
 * Locates the real header row.
 *
 * Exported lead sheets frequently open with a title banner — a single cell such
 * as "Lead Sheet" sitting above the actual column names. Taking row one on faith
 * would turn every real heading into data and lose the whole first record, so
 * the first row that is populated like a header wins instead.
 */
function findHeaderRow(matrix: unknown[][]): number {
  const scanDepth = Math.min(matrix.length, 10);
  const filled = (row: unknown[] | undefined): number =>
    (row ?? []).filter((cell) => cellToString(cell) !== '').length;

  let widest = 0;
  for (let index = 0; index < scanDepth; index += 1) widest = Math.max(widest, filled(matrix[index]));
  if (widest < 2) return 0;

  for (let index = 0; index < scanDepth; index += 1) {
    const count = filled(matrix[index]);
    // A banner row fills one or two cells; a header row fills most of them.
    if (count >= 2 && count >= widest * 0.6) return index;
  }
  return 0;
}

export interface ParsedSheet {
  file: BulkFileInfo;
  rows: BulkRow[];
}

export interface ParseOptions {
  filename: string;
  /** Overrides the automatically detected roles, keyed by header. */
  roleOverrides?: Partial<Record<string, ColumnRole>>;
  maxRows?: number;
}

/**
 * Builds the search query for one row from the safe columns available.
 *
 * The combination is chosen deliberately: a company plus a location resolves an
 * entity far more reliably than a bare name, and a website or domain is
 * stronger still because it removes the discovery step entirely.
 */
export function buildRowQuery(
  cells: Record<string, string>,
  roles: Record<string, ColumnRole>,
): { query: string; basis: string } {
  const pick = (role: ColumnRole): string => {
    for (const [header, assigned] of Object.entries(roles)) {
      if (assigned !== role) continue;
      const value = (cells[header] ?? '').trim();
      if (value) return value;
    }
    return '';
  };

  const company = pick('company');
  const website = pick('website');
  const owner = pick('owner');
  const first = pick('first_name');
  const last = pick('last_name');
  const person = owner || [first, last].filter(Boolean).join(' ').trim();
  const city = pick('city');
  const state = pick('state');
  const zip = pick('zip');
  const address = pick('address');
  const email = pick('email');
  const phone = pick('phone');
  const place = [city, state].filter(Boolean).join(', ') || zip;

  if (company && website) return { query: `${company} ${website}`, basis: 'Company name plus the website already on the row.' };
  if (company && place) return { query: `${company}, ${place}`, basis: 'Company name plus the location on the row.' };
  if (company && address) return { query: `${company}, ${address}`, basis: 'Company name plus the street address on the row.' };
  if (company && person) return { query: `${person}, ${company}`, basis: 'Contact name plus the company on the row.' };
  if (company) return { query: company, basis: 'Company name only; the row carried no location or website.' };
  if (website) return { query: website, basis: 'Website only; the row carried no company name.' };
  if (person && place) return { query: `${person}, ${place}`, basis: 'Contact name plus the location on the row.' };
  if (email) return { query: email, basis: 'Email address only; the row carried no company name.' };
  if (person) return { query: person, basis: 'Contact name only.' };
  if (phone) return { query: phone, basis: 'Phone number only; the row carried no company name.' };
  return { query: '', basis: 'The row carried no field that can identify a business.' };
}

export function parseWorkbook(data: ArrayBuffer | Uint8Array, options: ParseOptions): ParsedSheet {
  const extension = extensionOf(options.filename);
  if (!extension) {
    throw new Error('Only .csv, .xlsx and .xls files can be imported.');
  }

  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength === 0) throw new Error('The uploaded file is empty.');

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: 'array', cellDates: true, raw: false });
  } catch (error) {
    throw new Error(`The file could not be read as a spreadsheet: ${(error as Error).message}`);
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The workbook contains no sheets.');
  const sheet = workbook.Sheets[sheetName];

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false });
  if (matrix.length < 2) throw new Error('The sheet has a header row but no data rows.');

  const warnings: string[] = [];
  const headerIndex = findHeaderRow(matrix);
  if (headerIndex > 0) {
    warnings.push(
      `The column headings start on sheet row ${headerIndex + 1}. The ${headerIndex} row${headerIndex === 1 ? '' : 's'} above ${headerIndex === 1 ? 'is a title banner and was' : 'are title banners and were'} ignored.`,
    );
  }
  if (matrix.length - headerIndex < 2) throw new Error('The sheet has a header row but no data rows.');

  const rawHeaders = (matrix[headerIndex] ?? []).map((cell) => cellToString(cell));
  const headers: string[] = [];
  const seen = new Map<string, number>();
  rawHeaders.forEach((header, index) => {
    let name = header.trim();
    if (!name) name = `Column ${index + 1}`;
    const count = seen.get(name.toLowerCase()) ?? 0;
    seen.set(name.toLowerCase(), count + 1);
    // Duplicate headings would otherwise silently overwrite each other.
    headers.push(count === 0 ? name : `${name} (${count + 1})`);
  });
  if (headers.length !== new Set(headers.map((h) => h.toLowerCase())).size) {
    warnings.push('Duplicate column headings were made unique so no column is lost.');
  }

  const dataRows = matrix.slice(headerIndex + 1);
  const objectRows = dataRows.map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = cellToString(cells[index]);
    });
    return record;
  });

  const sensitive = scanSensitiveColumns(headers, objectRows);
  if (sensitive.byHeader.length > 0) {
    warnings.push(
      `Excluded by name: ${sensitive.byHeader.join(', ')}. These columns never enter search, matching, evidence, scoring, logs, or exports.`,
    );
  }
  if (sensitive.byValue.length > 0) {
    warnings.push(
      `Excluded by content: ${sensitive.byValue.join(', ')}. The values look like protected identifiers even though the heading does not say so.`,
    );
  }

  const excluded = new Set(sensitive.excluded);
  const roles: Record<string, ColumnRole> = {};
  for (const header of headers) {
    roles[header] = excluded.has(header)
      ? 'sensitive_excluded'
      : (options.roleOverrides?.[header] ?? detectColumnRole(header));
  }

  // Exactly one column may hold each identity role. Where a sheet numbers its
  // repeated columns, the lowest number wins and the rest stay preserved, so
  // "Phone 1" drives the query and "Phone 2" through "Phone 5" are carried
  // through the export untouched.
  const singletonRoles: ColumnRole[] = ['company', 'owner', 'website', 'email', 'phone', 'address', 'city', 'state', 'zip', 'first_name', 'last_name'];
  for (const role of singletonRoles) {
    const matches = headers
      .filter((h) => roles[h] === role)
      .sort((a, b) => columnRoleRank(a) - columnRoleRank(b) || headers.indexOf(a) - headers.indexOf(b));
    for (const extra of matches.slice(1)) roles[extra] = 'preserved';
  }

  if (!headers.some((h) => roles[h] === 'company')) {
    warnings.push('No company column was detected. Choose one in the mapping panel if the automatic guess is wrong.');
  }

  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY;
  const rows: BulkRow[] = [];
  let skipped = 0;

  objectRows.forEach((cells, index) => {
    if (rows.length >= maxRows) return;
    const original: Record<string, string | number> = {};
    for (const header of headers) {
      if (excluded.has(header)) continue;
      original[header] = cells[header];
    }

    const isBlank = Object.values(original).every((value) => String(value).trim() === '');
    const { query, basis } = buildRowQuery(cells, roles);

    if (isBlank || !query) {
      skipped += 1;
      rows.push({
        rowId: `row_${index + 1}`,
        rowNumber: index + 1,
        original,
        excludedColumns: [...excluded],
        query: '',
        queryBasis: basis,
        status: 'skipped',
        skipReason: isBlank ? 'The row is empty.' : basis,
      });
      return;
    }

    rows.push({
      rowId: `row_${index + 1}`,
      rowNumber: index + 1,
      original,
      excludedColumns: [...excluded],
      query,
      queryBasis: basis,
      status: 'pending',
    });
  });

  const file: BulkFileInfo = {
    filename: options.filename,
    extension,
    sheetName,
    totalSheetRows: dataRows.length,
    usableRows: rows.filter((r) => r.status === 'pending').length,
    skippedRows: skipped,
    headers,
    detectedRoles: roles,
    excludedColumns: [...excluded],
    excludedByName: [...sensitive.byHeader],
    excludedByContent: [...sensitive.byValue],
    warnings,
  };

  return { file, rows };
}

/** Recomputes every row's query after the operator changes a column mapping. */
export function remapRows(rows: BulkRow[], headers: string[], roles: Record<string, ColumnRole>): BulkRow[] {
  return rows.map((row) => {
    const cells: Record<string, string> = {};
    for (const header of headers) cells[header] = String(row.original[header] ?? '');
    const { query, basis } = buildRowQuery(cells, roles);
    const wasProcessed = row.status === 'success' || row.status === 'partial' || row.status === 'failed';
    if (wasProcessed) return row;
    return {
      ...row,
      query,
      queryBasis: basis,
      status: query ? 'pending' : 'skipped',
      skipReason: query ? undefined : basis,
    };
  });
}

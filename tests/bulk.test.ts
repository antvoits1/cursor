import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import {
  bulkExportTable,
  rowsToCsv,
  singleResultRow,
  SINGLE_HEADERS,
  timestampSuffix,
} from '../src/lib/exporters.js';
import { columnRoleRank, detectColumnRole, extensionOf, parseWorkbook, remapRows } from '../src/lib/spreadsheet.js';
import type { BulkJob, ExtractionResult } from '../src/types.js';

/**
 * Bulk import and export.
 *
 * The fixture mirrors the layout of a real lead sheet exactly — a title banner
 * above the headings, numbered phone and email columns, and an SSN column — but
 * every value is fabricated, so no personal data lives in this repository.
 */

const LEAD_SHEET_HEADERS = [
  '#', 'Company', 'Revenue', 'Name', 'Phone 1', 'Phone 2', 'Phone 3', 'Phone 4', 'Phone 5',
  'Email 1', 'DOB', 'Email 2', 'Address', 'City', 'State', 'ZIP', 'Email 3', 'Email 4',
  'Credit Rating', 'Years in Business', 'SSN', 'EIN', 'Full Address',
];

const LEAD_SHEET_ROWS: unknown[][] = [
  [0, 'Northwind Traders LLC', 2109758, 'Ada Lovelace', '585-555-0193', '585-555-0122', '', '', '',
    'ada@northwindtraders.example', '74/01/12', '', '4105 Irons Rd', 'Scio', 'NY', '14880', '', '',
    '', '2020-03-09', '078-64-1091', '30-0279531', '4105 Irons Rd, Scio, NY 14880'],
  [1, 'Jarboe Motors LLC', 1516331, 'Grace Hopper', '443-555-0146', '410-555-0134', '410-555-0199', '', '',
    'grace@jarboemotors.example', '67/10/07', 'g.hopper@example.com', '445 Baltimore Blvd', 'Westminster', 'MD', '21157', '', '',
    '', '2006-01-06', '443-31-0746', '56-2564494', '445 Baltimore Blvd, Westminster, MD 21157'],
  [2, 'Upper Shelf Farms LLC', 1490141, 'Alan Turing', '920-555-0103', '', '', '', '',
    'alan@uppershelffarms.example', '94/27/05', '', '1012 20th Ave', 'Menominee', 'MI', '49858', '', '',
    '', '2021-06-23', '391-13-3468', '87-3419780', '1012 20th Ave, Menominee, MI 49858'],
];

function leadSheetBytes(rows: unknown[][] = LEAD_SHEET_ROWS, banner = true): Uint8Array {
  const matrix: unknown[][] = [];
  if (banner) matrix.push(['Lead Sheet']);
  matrix.push(LEAD_SHEET_HEADERS);
  matrix.push(...rows);
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Leads');
  return new Uint8Array(XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
}

test('only the three supported extensions are accepted', () => {
  assert.equal(extensionOf('leads.xlsx'), 'xlsx');
  assert.equal(extensionOf('leads.XLS'), 'xls');
  assert.equal(extensionOf('leads.csv'), 'csv');
  assert.equal(extensionOf('leads.numbers'), null);
  assert.equal(extensionOf('leads.pdf'), null);
  assert.equal(extensionOf('leads'), null);
  assert.throws(() => parseWorkbook(leadSheetBytes(), { filename: 'leads.pdf' }), /Only \.csv, \.xlsx and \.xls/);
});

test('an empty file is refused with an explanation rather than an empty job', () => {
  assert.throws(() => parseWorkbook(new Uint8Array(0), { filename: 'leads.xlsx' }), /empty/i);
});

test('a sheet with headings but no data rows is refused', () => {
  assert.throws(() => parseWorkbook(leadSheetBytes([]), { filename: 'leads.xlsx' }), /no data rows/i);
});

test('a title banner above the headings is detected and skipped', () => {
  const { file, rows } = parseWorkbook(leadSheetBytes(), { filename: 'leads.xlsx' });

  assert.equal(file.headers[1], 'Company', 'the real headings must be used, not the banner row');
  assert.equal(file.totalSheetRows, LEAD_SHEET_ROWS.length, 'the banner must not be counted as a record');
  assert.equal(rows.length, LEAD_SHEET_ROWS.length, 'no lead may be lost to the banner');
  assert.ok(file.warnings.some((w) => /title banner/i.test(w)));
  assert.equal(rows[0].original.Company, 'Northwind Traders LLC');
});

test('a sheet whose first row is already the heading row is unaffected', () => {
  const { file, rows } = parseWorkbook(leadSheetBytes(LEAD_SHEET_ROWS, false), { filename: 'leads.xlsx' });
  assert.equal(file.headers[1], 'Company');
  assert.equal(rows.length, LEAD_SHEET_ROWS.length);
  assert.equal(file.warnings.some((w) => /title banner/i.test(w)), false);
});

test('numbered columns resolve to one primary per role and the rest are preserved', () => {
  const { file } = parseWorkbook(leadSheetBytes(), { filename: 'leads.xlsx' });
  const roles = file.detectedRoles;

  assert.equal(roles['Company'], 'company');
  assert.equal(roles['Name'], 'owner');
  assert.equal(roles['Phone 1'], 'phone');
  assert.equal(roles['Email 1'], 'email');
  assert.equal(roles['Address'], 'address');
  assert.equal(roles['City'], 'city');
  assert.equal(roles['State'], 'state');
  assert.equal(roles['ZIP'], 'zip');

  for (const header of ['Phone 2', 'Phone 3', 'Phone 4', 'Phone 5', 'Email 2', 'Email 3', 'Email 4']) {
    assert.equal(roles[header], 'preserved', `${header} must be carried through, not used as the primary`);
  }
  for (const header of ['#', 'Revenue', 'Credit Rating', 'Years in Business', 'EIN', 'Full Address']) {
    assert.equal(roles[header], 'preserved');
  }
});

test('indexed headings are ranked so the lowest number is the primary', () => {
  assert.equal(detectColumnRole('Phone 3'), 'phone');
  assert.equal(detectColumnRole('Email 4'), 'email');
  assert.equal(columnRoleRank('Phone 1'), 1);
  assert.equal(columnRoleRank('Phone 5'), 5);
  assert.equal(columnRoleRank('Company'), 0);
});

test('both protected columns in a real lead sheet layout are excluded', () => {
  const { file, rows } = parseWorkbook(leadSheetBytes(), { filename: 'leads.xlsx' });

  assert.deepEqual(file.excludedColumns, ['DOB', 'SSN']);
  assert.deepEqual(file.excludedByName, ['DOB', 'SSN']);
  assert.deepEqual(file.excludedByContent, [], 'both headings name the identifier outright');
  assert.equal(file.detectedRoles['SSN'], 'sensitive_excluded');
  assert.equal(file.detectedRoles['DOB'], 'sensitive_excluded');

  const serialised = JSON.stringify(rows);
  assert.equal(/\d{3}-\d{2}-\d{4}/.test(serialised), false, 'no SSN-shaped value may survive parsing');
  assert.equal(serialised.includes('74/01/12'), false, 'no date of birth may survive parsing');
  for (const row of rows) {
    assert.equal('SSN' in row.original, false);
    assert.equal('DOB' in row.original, false);
    assert.equal('EIN' in row.original, true, 'a business tax ID is public and stays with the row');
  }
});

test('a column whose heading hides what it holds is still excluded on its values', () => {
  // The heading says "Reference", but the column holds SSNs. Trusting the
  // heading would let every one of them into the pipeline.
  const headers = ['Company', 'City', 'State', 'Reference'];
  const sheet = XLSX.utils.aoa_to_sheet([
    headers,
    ['Northwind Traders LLC', 'Scio', 'NY', '078-64-1091'],
    ['Jarboe Motors LLC', 'Westminster', 'MD', '443-31-0746'],
    ['Upper Shelf Farms LLC', 'Menominee', 'MI', '391-13-3468'],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Leads');
  const bytes = new Uint8Array(XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);

  const { file, rows } = parseWorkbook(bytes, { filename: 'leads.xlsx' });
  assert.deepEqual(file.excludedByContent, ['Reference']);
  assert.deepEqual(file.excludedByName, []);
  assert.equal(file.detectedRoles['Reference'], 'sensitive_excluded');
  assert.equal(/\d{3}-\d{2}-\d{4}/.test(JSON.stringify(rows)), false);
});

test('each row builds the strongest query its safe columns allow', () => {
  const { rows } = parseWorkbook(leadSheetBytes(), { filename: 'leads.xlsx' });
  assert.equal(rows[0].query, 'Northwind Traders LLC, Scio, NY');
  assert.equal(rows[1].query, 'Jarboe Motors LLC, Westminster, MD');
  assert.match(rows[0].queryBasis, /Company name plus the location/);
  assert.equal(rows.every((row) => row.status === 'pending'), true);
});

test('blank and unusable rows are skipped with a stated reason, not silently dropped', () => {
  const withBlanks = [
    LEAD_SHEET_ROWS[0],
    new Array(LEAD_SHEET_HEADERS.length).fill(''),
    [4, '', 900, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ];
  const { file, rows } = parseWorkbook(leadSheetBytes(withBlanks), { filename: 'leads.xlsx' });

  assert.equal(rows.length, 3, 'every sheet row keeps a slot so row identity survives');
  assert.equal(rows[0].status, 'pending');
  assert.equal(rows[1].status, 'skipped');
  assert.ok(rows[1].skipReason);
  assert.equal(rows[2].status, 'skipped');
  assert.equal(file.usableRows, 1);
  assert.equal(file.skippedRows, 2);
});

test('duplicate headings are made unique so no column overwrites another', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Company', 'Phone', 'Phone'],
    ['Northwind', '585-555-0193', '585-555-0122'],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Leads');
  const bytes = new Uint8Array(XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);

  const { file, rows } = parseWorkbook(bytes, { filename: 'leads.xlsx' });
  assert.deepEqual(file.headers, ['Company', 'Phone', 'Phone (2)']);
  assert.equal(rows[0].original['Phone'], '585-555-0193');
  assert.equal(rows[0].original['Phone (2)'], '585-555-0122');
});

test('remapping a column rebuilds pending queries and leaves finished rows alone', () => {
  const { file, rows } = parseWorkbook(leadSheetBytes(), { filename: 'leads.xlsx' });
  const finished = rows.map((row, index) => (index === 0 ? { ...row, status: 'success' as const } : row));

  const roles = { ...file.detectedRoles, Company: 'preserved' as const, Name: 'company' as const };
  const remapped = remapRows(finished, file.headers, roles);

  assert.equal(remapped[0].query, 'Northwind Traders LLC, Scio, NY', 'a completed row keeps its original query');
  assert.equal(remapped[1].query, 'Grace Hopper, Westminster, MD', 'a pending row picks up the new mapping');
});

test('one row can never contaminate another', () => {
  const { rows } = parseWorkbook(leadSheetBytes(), { filename: 'leads.xlsx' });
  const identifiers = new Set(rows.map((row) => row.rowId));
  assert.equal(identifiers.size, rows.length, 'row identifiers must be unique');
  assert.equal(rows[0].original.Company, 'Northwind Traders LLC');
  assert.equal(rows[1].original.Company, 'Jarboe Motors LLC');
  assert.notEqual(rows[0].original['Phone 1'], rows[1].original['Phone 1']);
});

/* --------------------------------- Export -------------------------------- */

function resultFor(rowId: string, phone: string): ExtractionResult {
  return {
    id: `ext_${rowId}`,
    query: 'Northwind Traders LLC, Scio, NY',
    queryType: 'location_constrained',
    plan: {
      originalInput: 'Northwind Traders LLC, Scio, NY',
      normalizedInput: 'northwind traders llc, scio, ny',
      queryType: 'location_constrained',
      inferredContext: {},
      routes: [],
      notes: [],
    },
    companyName: 'Northwind Traders LLC',
    website: 'https://northwindtraders.example/',
    phones: [
      {
        number: `+1${phone.replace(/\D/g, '')}`,
        formatted: phone,
        type: 'LANDLINE',
        lineTypeConfidence: 70,
        lineTypeBasis: 'area code lookup',
        lineTypeSignals: [],
        reachabilityScore: 45,
        reachabilityBasis: ['Identified as a landline (+5).'],
        rank: 1,
        country: 'US',
        agreementCount: 2,
        confidence: 82,
        evidence: [],
      },
    ],
    emails: [
      {
        email: 'ada@northwindtraders.example',
        kind: 'personal',
        domain: 'northwindtraders.example',
        domainMatchesWebsite: true,
        deliverability: 'high',
        deliverabilityBasis: 'MX, SPF and DMARC present',
        verification: {
          syntaxValid: true,
          domainHasMx: true,
          hasSpf: true,
          hasDmarc: true,
          disposable: false,
          roleAccount: false,
          catchAll: false,
          smtpAccepted: null,
          verdict: 'probably_deliverable',
          basis: ['The address is well-formed.'],
        },
        agreementCount: 1,
        confidence: 78,
        evidence: [],
      },
    ],
    addresses: [],
    socials: [],
    people: [],
    route: [],
    consultedSources: [],
    blocks: [],
    rejected: [],
    confidence: 80,
    confidenceBasis: ['Two sources agreed on the phone number.'],
    entityMatchStatus: 'PROBABLE_MATCH',
    status: 'success',
    transportMode: 'node_http_only',
    availableTiers: ['cache', 'node_http'],
    durationMs: 4210,
    createdAt: new Date().toISOString(),
    rowId,
  };
}

function jobFixture(): BulkJob {
  const { file, rows } = parseWorkbook(leadSheetBytes(), { filename: 'Lead-Sheet.xlsx' });
  const enriched = rows.map((row, index) =>
    index === 0
      ? { ...row, status: 'success' as const, result: resultFor(row.rowId, '(585) 555-0193'), durationMs: 4210 }
      : index === 1
        ? { ...row, status: 'failed' as const, error: 'Every source for this row was blocked.' }
        : row,
  );
  return {
    id: 'bulk_test',
    name: 'Lead-Sheet.xlsx',
    file,
    rows: enriched,
    status: 'completed',
    processed: 2,
    succeeded: 1,
    partial: 0,
    failed: 1,
    skipped: 0,
    deepScan: true,
  };
}

test('the export keeps every original row and appends enrichment in prefixed columns', () => {
  const job = jobFixture();
  const { headers, rows } = bulkExportTable(job);

  assert.equal(rows.length, job.rows.length, 'the export must contain one line per sheet row');
  assert.equal(headers[0], 'Row');
  assert.ok(headers.includes('Company'), 'original headings are carried through');
  assert.ok(headers.includes('Best Phone'), 'enrichment is appended under its own heading');
  assert.equal(headers.includes('SSN'), false, 'an excluded column must be absent from the export');
  assert.equal(headers.includes('DOB'), false);

  assert.equal(rows[0]['Company'], 'Northwind Traders LLC');
  assert.equal(rows[0]['Best Phone'], '(585) 555-0193');
  assert.equal(rows[0]['Best Phone Type'], 'Landline', 'the row states whether the number is a mobile or a landline');
  assert.equal(rows[0]['Extractor Status'], 'success');
  assert.equal(rows[1]['Extractor Status'], 'failed');
  assert.equal(rows[1]['Extractor Detail'], 'Every source for this row was blocked.');
  assert.equal(rows[1]['Best Phone'], '', 'a failed row must not be filled in with a guess');
  assert.equal(rows[2]['Extractor Status'], 'pending');
});

test('no protected value can reach the exported table', () => {
  const { rows } = bulkExportTable(jobFixture());
  const serialised = JSON.stringify(rows);
  assert.equal(/\d{3}-\d{2}-\d{4}/.test(serialised), false);
  assert.equal(serialised.includes('74/01/12'), false);
});

test('CSV output quotes correctly and keeps phone and email strings intact', () => {
  const job = jobFixture();
  const { headers, rows } = bulkExportTable(job);
  const csv = rowsToCsv(headers, rows);
  const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');

  assert.equal(lines.length, rows.length + 1, 'one heading line plus one line per row');
  assert.ok(lines[0].startsWith('Row,'));
  assert.ok(csv.includes('(585) 555-0193'), 'a formatted phone number must survive the export');
  assert.ok(csv.includes('ada@northwindtraders.example'), 'an email address must survive the export');
  // A value containing a comma has to come back as one field, not two.
  assert.ok(csv.includes('"4105 Irons Rd, Scio, NY 14880"'));
});

test('CSV escaping handles quotes, commas and newlines', () => {
  const csv = rowsToCsv(['A', 'B'], [{ A: 'say "hi"', B: 'one,two' }, { A: 'line\nbreak', B: '' }]);
  assert.ok(csv.includes('"say ""hi""","one,two"'));
  assert.ok(csv.includes('"line\nbreak"'));
});

test('the single-result export row matches its headers exactly', () => {
  const row = singleResultRow(resultFor('row_1', '(585) 555-0193'));
  assert.deepEqual(Object.keys(row).sort(), [...SINGLE_HEADERS].sort());
  assert.equal(row['Phone'], '(585) 555-0193');
  assert.equal(row['Company'], 'Northwind Traders LLC');
});

test('export filenames carry a timestamp so one download never overwrites another', () => {
  assert.match(timestampSuffix(new Date('2026-08-26T09:05:00')), /^20260826-\d{4}$/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import {
  containsSensitiveValue,
  isSensitiveHeader,
  looksLikeSsnValue,
  normaliseHeader,
  redactSensitiveText,
  scanSensitiveColumns,
} from '../src/lib/sensitive.js';
import { buildRowQuery, parseWorkbook } from '../src/lib/spreadsheet.js';

/**
 * Protected identifiers must not be able to enter the extraction pipeline by any
 * route: not by column heading, not by column content, not through a hand-typed
 * query, and not through the query a bulk row assembles for itself.
 */

test('SSN headings are recognised in every spelling that appears in real sheets', () => {
  const headings = [
    'SSN',
    'ssn',
    'S.S.N.',
    'SSN #',
    'SSN Number',
    'Social Security Number',
    'social security',
    'Soc Sec',
    'Soc. Sec.',
    'Social',
    'Social No',
    'TIN',
    'ITIN',
    'Taxpayer ID Number',
  ];
  for (const heading of headings) {
    assert.equal(isSensitiveHeader(heading), true, `"${heading}" must be treated as sensitive`);
  }
});

test('ordinary business headings are not mistaken for sensitive ones', () => {
  const headings = ['Company', 'Company Name', 'Owner', 'Phone', 'Email', 'Website', 'City', 'State', 'Zip', 'Notes', 'Social Media', 'Facebook'];
  for (const heading of headings) {
    assert.equal(isSensitiveHeader(heading), false, `"${heading}" must not be treated as sensitive`);
  }
});

test('header normalisation folds case, spacing and smart quotes', () => {
  assert.equal(normaliseHeader('  Social   Security  '), 'social security');
  assert.equal(normaliseHeader('Driver\u2019s License'), "driver's license");
});

test('SSN-shaped values are detected while phones and ZIPs are not', () => {
  assert.equal(looksLikeSsnValue('123-45-6789'), true);
  assert.equal(looksLikeSsnValue('123 45 6789'), true);
  assert.equal(looksLikeSsnValue('123456789'), true);
  assert.equal(looksLikeSsnValue('(510) 653-3394'), false);
  assert.equal(looksLikeSsnValue('5106533394'), false);
  assert.equal(looksLikeSsnValue('94607'), false);
  assert.equal(looksLikeSsnValue('94607-1234'), false);
  assert.equal(looksLikeSsnValue(''), false);
  assert.equal(looksLikeSsnValue(null), false);
  assert.equal(containsSensitiveValue('987-65-4321'), true);
});

test('a mislabelled column is still excluded when its contents are SSN-shaped', () => {
  const headers = ['Company', 'Reference'];
  const rows = [
    { Company: 'Northwind Traders', Reference: '123-45-6789' },
    { Company: 'Contoso', Reference: '987-65-4320' },
    { Company: 'Fabrikam', Reference: '111-22-3333' },
  ];
  const scan = scanSensitiveColumns(headers, rows);
  assert.deepEqual(scan.byHeader, []);
  assert.deepEqual(scan.byValue, ['Reference']);
  assert.deepEqual(scan.excluded, ['Reference']);
});

test('free text is redacted before the engine sees it, without damaging phone numbers', () => {
  assert.equal(redactSensitiveText('lookup 123-45-6789 please'), 'lookup [redacted-identifier] please');
  assert.equal(redactSensitiveText('Blue Bottle Coffee (510) 653-3394'), 'Blue Bottle Coffee (510) 653-3394');
  assert.equal(redactSensitiveText('call 5106533394'), 'call 5106533394');
});

/** Builds a sheet in memory so the test exercises the real XLSX reader. */
function workbookBytes(rows: unknown[][]): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Leads');
  return new Uint8Array(XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
}

test('an SSN column is stripped from every row a spreadsheet produces', () => {
  const bytes = workbookBytes([
    ['Company Name', 'Owner', 'SSN', 'City', 'State'],
    ['Northwind Traders', 'Ada Lovelace', '123-45-6789', 'Oakland', 'CA'],
    ['Contoso Ltd', 'Grace Hopper', '987-65-4320', 'Austin', 'TX'],
  ]);

  const { file, rows } = parseWorkbook(bytes, { filename: 'leads.xlsx' });

  assert.deepEqual(file.excludedColumns, ['SSN']);
  assert.equal(file.detectedRoles.SSN, 'sensitive_excluded');
  assert.ok(file.warnings.some((warning) => warning.includes('SSN')));

  for (const row of rows) {
    assert.equal('SSN' in row.original, false, 'the excluded column must be absent from the preserved row');
    assert.equal(JSON.stringify(row).includes('123-45-6789'), false);
    assert.equal(JSON.stringify(row).includes('987-65-4320'), false);
    assert.equal(row.query.includes('123'), false);
  }
});

test('the query a row builds never contains the excluded value even when the heading is innocent', () => {
  const bytes = workbookBytes([
    ['Company Name', 'Member ID', 'City', 'State'],
    ['Northwind Traders', '123-45-6789', 'Oakland', 'CA'],
    ['Contoso Ltd', '987-65-4320', 'Austin', 'TX'],
    ['Fabrikam', '111-22-3333', 'Reno', 'NV'],
  ]);

  const { file, rows } = parseWorkbook(bytes, { filename: 'leads.csv' });

  assert.deepEqual(file.excludedColumns, ['Member ID']);
  for (const row of rows) {
    assert.equal('Member ID' in row.original, false);
    assert.equal(/\d{3}-\d{2}-\d{4}/.test(row.query), false);
  }
});

test('a row query is assembled from safe columns only', () => {
  const roles = {
    Company: 'company',
    SSN: 'sensitive_excluded',
    City: 'city',
    State: 'state',
  } as const;
  const { query } = buildRowQuery(
    { Company: 'Northwind Traders', SSN: '123-45-6789', City: 'Oakland', State: 'CA' },
    { ...roles },
  );
  assert.equal(query, 'Northwind Traders, Oakland, CA');
  assert.equal(query.includes('123'), false);
});

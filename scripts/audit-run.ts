/**
 * Runs a sample of leads through the real engine and writes an audit workbook.
 *
 * This is the evidence that the build works against live sources rather than
 * fixtures: every lead is run for real, and every source consulted is recorded
 * whether it answered, refused, or was never reached. A blocked source is as
 * much part of the audit as a productive one, because the difference between
 * "not found" and "could not look" is the difference between a gap in the data
 * and a gap in the run.
 *
 *   npx tsx scripts/audit-run.ts <sheet.xlsx> [limit] [outdir]
 */

import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { parseWorkbook } from '../src/lib/spreadsheet.js';
import { extract } from '../server/engine.js';
import type { ExtractionResult } from '../src/types.js';

const LINE_TYPE_LABEL: Record<string, string> = {
  MOBILE: 'Mobile',
  LANDLINE: 'Landline',
  VOIP: 'VoIP',
  TOLL_FREE: 'Toll-free',
  UNKNOWN: 'Unknown',
};

const VERDICT_LABEL: Record<string, string> = {
  deliverable: 'Deliverable',
  probably_deliverable: 'Likely deliverable',
  risky: 'Risky',
  undeliverable: 'Undeliverable',
  unverifiable: 'Not verifiable here',
};

function sheetFrom(headers: string[], rows: Array<Record<string, string | number>>): XLSX.WorkSheet {
  const matrix: unknown[][] = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ''))];
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  sheet['!cols'] = headers.map((header) => ({
    wch: Math.min(60, Math.max(10, rows.reduce((max, row) => Math.max(max, String(row[header] ?? '').length), header.length) + 2)),
  }));
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  return sheet;
}

async function main(): Promise<void> {
  const [sheetPath, limitArg, outDirArg] = process.argv.slice(2);
  if (!sheetPath) {
    console.error('usage: npx tsx scripts/audit-run.ts <sheet.xlsx> [limit] [outdir]');
    process.exit(1);
  }
  const limit = Number(limitArg ?? 10);
  const outDir = outDirArg ?? '/opt/cursor/artifacts';
  fs.mkdirSync(outDir, { recursive: true });

  const buffer = fs.readFileSync(path.resolve(sheetPath));
  const { file, rows } = parseWorkbook(new Uint8Array(buffer), { filename: path.basename(sheetPath) });

  console.log(`Sheet: ${file.filename}`);
  console.log(`Rows: ${rows.length}, columns kept: ${file.headers.length}`);
  console.log(`Excluded as sensitive: ${file.excludedColumns.join(', ') || 'none'}`);
  console.log(`Running the first ${limit} lead${limit === 1 ? '' : 's'}.\n`);

  const selected = rows.slice(0, limit);
  const results: Array<{ rowNumber: number; query: string; result: ExtractionResult | null; error?: string; ms: number }> = [];

  for (const row of selected) {
    const query = row.query.trim();
    const started = Date.now();
    process.stdout.write(`[${row.rowNumber}] ${query.slice(0, 62).padEnd(62)} `);
    if (!query) {
      console.log('skipped (no usable query)');
      continue;
    }
    try {
      const result = await extract(query, {
        deepScan: true,
        budgetMs: 30_000,
        peopleSearch: process.env.EXTRACTOR_ENABLE_PEOPLE_SEARCH === '1',
        preservedFields: row.original,
      });
      const ms = Date.now() - started;
      results.push({ rowNumber: row.rowNumber, query, result, ms });
      const mobiles = result.phones.filter((phone) => phone.type === 'MOBILE').length;
      console.log(
        `${result.status.padEnd(7)} ${String(result.confidence).padStart(3)}%  ` +
          `${result.phones.length}ph(${mobiles}m) ${result.emails.length}em ${result.addresses.length}ad  ` +
          `${result.consultedSources.length} src  ${(ms / 1000).toFixed(1)}s`,
      );
    } catch (error) {
      const ms = Date.now() - started;
      results.push({ rowNumber: row.rowNumber, query, result: null, error: (error as Error).message, ms });
      console.log(`ERROR ${(error as Error).message}`);
    }
  }

  /* ------------------------------ the workbook ---------------------------- */

  const summary = results.map((entry) => {
    const result = entry.result;
    const phones = result?.phones ?? [];
    const best = phones[0];
    return {
      Row: entry.rowNumber,
      Query: entry.query,
      Status: result?.status ?? 'error',
      Confidence: result?.confidence ?? 0,
      'Entity Match': result?.entityMatchStatus ?? '',
      'Company Found': result?.companyName ?? '',
      'Website Found': result?.website ?? '',
      'Best Phone': best?.formatted ?? '',
      'Best Phone Type': best ? LINE_TYPE_LABEL[best.type] : '',
      Mobiles: phones.filter((phone) => phone.type === 'MOBILE').length,
      Landlines: phones.filter((phone) => phone.type === 'LANDLINE').length,
      'Phones Total': phones.length,
      Emails: result?.emails.length ?? 0,
      Addresses: result?.addresses.length ?? 0,
      'Person Records': result?.people.length ?? 0,
      'Sources Consulted': result?.consultedSources.length ?? 0,
      'Sources Read': result?.consultedSources.filter((source) => source.ok).length ?? 0,
      'Sources Blocked': result?.consultedSources.filter((source) => source.blocked).length ?? 0,
      'Values Refused': result?.rejected.length ?? 0,
      'Seconds': Number((entry.ms / 1000).toFixed(2)),
      Detail: entry.error ?? result?.failureReason ?? result?.confidenceBasis[0] ?? '',
    };
  });

  const findings: Array<Record<string, string | number>> = [];
  for (const entry of results) {
    if (!entry.result) continue;
    for (const phone of entry.result.phones) {
      findings.push({
        Row: entry.rowNumber,
        Lead: entry.result.companyName || entry.query,
        Field: 'Phone',
        Value: phone.formatted,
        'Line Type': LINE_TYPE_LABEL[phone.type],
        'Type Confidence': phone.lineTypeConfidence,
        'Reach Score': phone.reachabilityScore,
        Confidence: phone.confidence,
        'Found On': phone.evidence.map((item) => item.sourceLabel).join(' | '),
        'Source URL': phone.evidence[0]?.url ?? '',
        How: phone.evidence[0]?.method ?? '',
        Reasoning: phone.lineTypeBasis,
      });
    }
    for (const email of entry.result.emails) {
      findings.push({
        Row: entry.rowNumber,
        Lead: entry.result.companyName || entry.query,
        Field: 'Email',
        Value: email.email,
        'Line Type': '',
        'Type Confidence': '',
        'Reach Score': '',
        Confidence: email.confidence,
        'Found On': email.evidence.map((item) => item.sourceLabel).join(' | '),
        'Source URL': email.evidence[0]?.url ?? '',
        How: email.evidence[0]?.method ?? '',
        Reasoning: `${VERDICT_LABEL[email.verification.verdict]}: ${email.verification.basis.join(' ')}`,
      });
    }
    for (const address of entry.result.addresses) {
      findings.push({
        Row: entry.rowNumber,
        Lead: entry.result.companyName || entry.query,
        Field: 'Address',
        Value: address.full,
        'Line Type': '',
        'Type Confidence': '',
        'Reach Score': '',
        Confidence: address.confidence,
        'Found On': address.evidence.map((item) => item.sourceLabel).join(' | '),
        'Source URL': address.evidence[0]?.url ?? '',
        How: address.evidence[0]?.method ?? '',
        Reasoning: '',
      });
    }
    for (const social of entry.result.socials) {
      findings.push({
        Row: entry.rowNumber,
        Lead: entry.result.companyName || entry.query,
        Field: 'Social',
        Value: social.url,
        'Line Type': '',
        'Type Confidence': '',
        'Reach Score': '',
        Confidence: '',
        'Found On': social.evidence.map((item) => item.sourceLabel).join(' | '),
        'Source URL': social.evidence[0]?.url ?? '',
        How: social.evidence[0]?.method ?? '',
        Reasoning: social.platform,
      });
    }
  }

  const sources: Array<Record<string, string | number>> = [];
  for (const entry of results) {
    for (const source of entry.result?.consultedSources ?? []) {
      sources.push({
        Row: entry.rowNumber,
        Lead: entry.result?.companyName || entry.query,
        Source: source.label,
        Kind: source.kind,
        Read: source.ok ? 'Yes' : 'No',
        Blocked: source.blocked ? 'Yes' : 'No',
        Status: source.status ?? '',
        Tier: source.tier ?? '',
        'Fields Found': source.fieldsFound.join(', '),
        Reason: source.reason ?? '',
        'Elapsed (ms)': source.elapsedMs,
        URL: source.url,
      });
    }
  }

  // Values the engine saw and refused. This sheet is the honest counterpart to
  // the findings: it shows what was thrown away and why.
  const refused: Array<Record<string, string | number>> = [];
  for (const entry of results) {
    for (const item of entry.result?.rejected ?? []) {
      refused.push({
        Row: entry.rowNumber,
        Lead: entry.result?.companyName || entry.query,
        Field: item.field,
        Value: item.value,
        'Refused Because': item.reason,
        'Source URL': item.sourceUrl ?? '',
      });
    }
  }

  const totalRead = sources.filter((source) => source.Read === 'Yes').length;
  const totalBlocked = sources.filter((source) => source.Blocked === 'Yes').length;
  const method = [
    { Item: 'Sheet', Value: file.filename },
    { Item: 'Rows in sheet', Value: rows.length },
    { Item: 'Leads run', Value: results.length },
    { Item: 'Run at', Value: new Date().toISOString() },
    { Item: 'Deep scan', Value: 'on' },
    { Item: 'Budget per lead', Value: '30 s' },
    { Item: 'People-search sources', Value: process.env.EXTRACTOR_ENABLE_PEOPLE_SEARCH === '1' ? 'on' : 'off' },
    { Item: 'Assistant layer', Value: process.env.GEMINI_API_KEY || process.env.XAI_API_KEY ? 'configured' : 'no key configured' },
    { Item: 'Columns excluded as sensitive', Value: file.excludedColumns.join(', ') || 'none' },
    { Item: 'Sources consulted', Value: sources.length },
    { Item: 'Sources read', Value: totalRead },
    { Item: 'Sources blocked', Value: totalBlocked },
    { Item: 'Values accepted', Value: findings.length },
    { Item: 'Values refused', Value: refused.length },
    {
      Item: 'Note',
      Value:
        'Every lead below was run against live sources. A blocked source is recorded as blocked, never as an absent value, so a gap in the findings can be told apart from a gap in the run.',
    },
  ];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheetFrom(['Item', 'Value'], method as never), 'How This Was Run');
  XLSX.utils.book_append_sheet(book, sheetFrom(Object.keys(summary[0] ?? { Row: '' }), summary as never), 'Lead Summary');
  XLSX.utils.book_append_sheet(
    book,
    sheetFrom(
      ['Row', 'Lead', 'Field', 'Value', 'Line Type', 'Type Confidence', 'Reach Score', 'Confidence', 'Found On', 'Source URL', 'How', 'Reasoning'],
      findings,
    ),
    'What Was Found',
  );
  XLSX.utils.book_append_sheet(
    book,
    sheetFrom(['Row', 'Lead', 'Source', 'Kind', 'Read', 'Blocked', 'Status', 'Tier', 'Fields Found', 'Reason', 'Elapsed (ms)', 'URL'], sources),
    'Every Source Consulted',
  );
  XLSX.utils.book_append_sheet(
    book,
    sheetFrom(['Row', 'Lead', 'Field', 'Value', 'Refused Because', 'Source URL'], refused),
    'Values Refused',
  );

  const outPath = path.join(outDir, 'Extraction-Audit-10-Leads.xlsx');
  XLSX.writeFile(book, outPath);

  console.log(`\nAudit written to ${outPath}`);
  console.log(`  ${results.length} leads, ${sources.length} sources consulted (${totalRead} read, ${totalBlocked} blocked)`);
  console.log(`  ${findings.length} values accepted, ${refused.length} refused`);

  fs.writeFileSync(path.join(outDir, 'audit-summary.json'), JSON.stringify({ method, summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

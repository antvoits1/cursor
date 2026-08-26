/**
 * Sensitive-data exclusion.
 *
 * Social Security Numbers (and equivalents) must never reach the extraction
 * pipeline: not search, matching, enrichment, evidence, scoring, confidence,
 * route planning, cache keys, logs, diagnostics, route history, local learning,
 * outbound requests, or any derived output.
 *
 * This module is the single authoritative gate. Both the browser and the server
 * import it, so there is exactly one definition of "sensitive" in the product.
 */

const SENSITIVE_HEADER_PATTERNS: RegExp[] = [
  /^ssn$/,
  /^ssn[\s._-]*(no|num|number|#)$/,
  /\bsocial\s*security\b/,
  /\bsoc\.?\s*sec\.?\b/,
  /^social$/,
  /^social[\s._-]*(no|num|number|#)$/,
  /^s\.?s\.?n\.?$/,
  /\bsin\s*(number|no|#)\b/,
  /\btax\s*(payer)?\s*id(entification)?\s*(number|no|#)?\b/,
  /^tin$/,
  /^itin$/,
  /\bnational\s*id(entity)?\s*(number|no|#)?\b/,
  /\bdate\s*of\s*birth\b/,
  /^dob$/,
  /\bbirth\s*date\b/,
  /\bdriver'?s?\s*licen[sc]e\b/,
  /^dl\s*(number|no|#)$/,
  /\bpassport\s*(number|no|#)?\b/,
  /\b(bank|routing|account)\s*(number|no|#)\b/,
  /^routing$/,
  /\bcredit\s*card\b/,
  /^cc\s*(number|no|#)$/,
  /\bcard\s*number\b/,
  /^cvv$/,
  /^pin$/,
  /\bmother'?s\s*maiden\b/,
];

/**
 * SSN-shaped value: 123-45-6789, 123 45 6789, or a bare 123456789.
 *
 * Deliberately liberal about the leading group. Numbers beginning with 9 are not
 * valid Social Security Numbers but are valid ITINs, and both must be withheld.
 */
const SSN_GROUPED_PATTERN = /^\d{3}[-\s]\d{2}[-\s]\d{4}$/;
const SSN_BARE_PATTERN = /^\d{9}$/;

export function normaliseHeader(header: string): string {
  return String(header ?? '')
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** True when a column heading names a sensitive identifier. */
export function isSensitiveHeader(header: string): boolean {
  const cleaned = normaliseHeader(header);
  if (!cleaned) return false;
  const collapsed = cleaned.replace(/[^a-z0-9]+/g, ' ').trim();
  return SENSITIVE_HEADER_PATTERNS.some((pattern) => pattern.test(cleaned) || pattern.test(collapsed));
}

/**
 * True when a value looks like an SSN. Used as a second gate so a
 * mislabelled or unlabelled column still cannot leak an SSN.
 */
export function looksLikeSsnValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  if (!text) return false;
  // Only whole-cell matches count, so ZIP+4, order numbers and ten-digit phone
  // numbers are not caught by accident.
  return SSN_GROUPED_PATTERN.test(text) || SSN_BARE_PATTERN.test(text);
}

export interface SensitiveScan {
  /** Headers excluded because of their name. */
  byHeader: string[];
  /** Headers excluded because their values look like SSNs. */
  byValue: string[];
  /** Union of both, in original header order. */
  excluded: string[];
}

/**
 * Scans a parsed sheet and returns every column that must be withheld from the
 * pipeline. Value-based detection samples the column so a single stray digit
 * string does not disqualify an otherwise useful column, while a column that is
 * predominantly SSN-shaped is always excluded.
 */
export function scanSensitiveColumns(
  headers: string[],
  rows: Array<Record<string, unknown>>,
  sampleSize = 40,
): SensitiveScan {
  const byHeader: string[] = [];
  const byValue: string[] = [];
  const sample = rows.slice(0, sampleSize);

  for (const header of headers) {
    if (isSensitiveHeader(header)) {
      byHeader.push(header);
      continue;
    }
    const values = sample.map((row) => row[header]).filter((v) => v !== undefined && v !== null && String(v).trim() !== '');
    if (values.length === 0) continue;
    const matches = values.filter(looksLikeSsnValue).length;
    if (matches / values.length >= 0.5) {
      byValue.push(header);
    }
  }

  const excludedSet = new Set([...byHeader, ...byValue]);
  return { byHeader, byValue, excluded: headers.filter((h) => excludedSet.has(h)) };
}

/**
 * Last-line redaction for any free text that is about to be logged, cached,
 * traced, or sent outbound. Applied even though columns are excluded upstream,
 * because defence in depth is cheap here and a leak is not recoverable.
 */
export function redactSensitiveText(text: string): string {
  if (!text) return text;
  // Only the hyphen/space grouped form is redacted from free text. A bare run of
  // nine digits is far more likely to be an order or account reference than an
  // identifier, and redacting it would corrupt legitimate queries.
  return text.replace(/(?<!\d)\d{3}[-\s]\d{2}[-\s]\d{4}(?!\d)/g, '[redacted-identifier]');
}

/** True when a value contains anything that must never leave the machine. */
export function containsSensitiveValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return looksLikeSsnValue(value);
}

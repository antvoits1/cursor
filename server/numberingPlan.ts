import { boundedTimeout } from './runDeadline.js';

/**
 * Who owns the block a number was allocated from.
 *
 * The audit of the first ten leads returned "Type unknown" for every single
 * number, which is the least useful answer the classifier can give. The reason
 * was that the only line-type evidence in the build came from wording on the
 * page, and business sites almost never write "mobile" next to a number.
 *
 * The North American numbering plan is published, and the block-level
 * assignments with it: for any NPA-NXX-X (area code, exchange, and the first
 * digit of the line number) the operator holding that thousands-block is a
 * matter of public record, along with whether that operator is a wireless
 * carrier, an incumbent local exchange carrier, or a competitive one.
 * localcallingguide.com republishes it as XML, free and without a key.
 *
 * Number portability means the block owner is not proof — a number can be
 * carried away from its original operator, and many are. It is, however, by
 * far the strongest free signal that exists for a number nobody has labelled,
 * and it is right for the large majority of numbers. It is therefore weighed
 * as strong evidence rather than treated as fact, and reported as such.
 */
export interface BlockOwner {
  /** Operator holding the thousands-block, e.g. "T-MOBILE USA, INC.". */
  carrier: string;
  /** What kind of operator that is, from the published company type. */
  operator: 'wireless' | 'incumbent' | 'competitive' | 'other';
  /** Rate centre the block is homed to, e.g. "Miami". */
  rateCenter?: string;
  /** State or province of the rate centre. */
  region?: string;
}

/**
 * NPA-NXX-X to owner. Populated by `prefetchBlockOwners` and read
 * synchronously afterwards, which keeps the classifier itself free of I/O.
 *
 * Block assignments change on the order of months, so a cache that lives as
 * long as the process is both safe and worth having: a bulk run over a lead
 * sheet from one state hits the same handful of exchanges repeatedly.
 */
const cache = new Map<string, BlockOwner | null>();

const ENDPOINT = 'https://localcallingguide.com/xmlprefix.php';

/** How many exchanges one run may look up, to stay a polite caller. */
const MAX_LOOKUPS_PER_RUN = 14;
const CONCURRENCY = 4;

function operatorFromCompanyType(code: string): BlockOwner['operator'] {
  switch (code.trim().toUpperCase()) {
    case 'W':
      return 'wireless';
    case 'I':
    case 'R':
      return 'incumbent';
    case 'C':
      return 'competitive';
    default:
      return 'other';
  }
}

/** Splits an E.164 North American number into the parts the register is keyed by. */
export function blockKey(e164: string): { npa: string; nxx: string; block: string } | null {
  const digits = e164.replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  const npa = national.slice(0, 3);
  const nxx = national.slice(3, 6);
  const block = national.slice(6, 7);
  if (!/^[2-9]\d\d$/.test(npa) || !/^[2-9]\d\d$/.test(nxx)) return null;
  return { npa, nxx, block };
}

function tagValue(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!match) return '';
  return match[1]
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/**
 * Picks the record for the requested thousands-block.
 *
 * An exchange is frequently split between operators a thousand numbers at a
 * time — 631-686-1xxx can be a cable company while 631-686-9xxx is a mobile
 * carrier — so taking the first record in the response would misclassify a
 * large share of numbers. The block digit is matched exactly, and only when no
 * block-level record exists does the exchange-level record stand in.
 */
function ownerFromXml(xml: string, block: string): BlockOwner | null {
  const records = xml.match(/<prefixdata>[\s\S]*?<\/prefixdata>/g);
  if (!records || records.length === 0) return null;

  const exact = records.find((record) => tagValue(record, 'x') === block);
  const chosen = exact ?? records[0];

  const carrier = tagValue(chosen, 'company-name');
  if (!carrier) return null;

  return {
    carrier,
    operator: operatorFromCompanyType(tagValue(chosen, 'company-type')),
    rateCenter: tagValue(chosen, 'rc') || undefined,
    region: tagValue(chosen, 'region') || undefined,
  };
}

/*
 * Fetched directly rather than through the layered transport.
 *
 * That transport exists to read HTML pages from hosts that would rather not be
 * read, and it refuses anything that is not a readable page — which this is
 * not, it is an XML document. The host is a fixed constant compiled into this
 * module, so there is no address here for a caller to influence and nothing
 * for the SSRF guard to protect against.
 */
async function lookup(npa: string, nxx: string, block: string): Promise<BlockOwner | null> {
  const timeout = boundedTimeout(4000);
  if (timeout === null) return null;

  const response = await fetch(`${ENDPOINT}?npa=${npa}&nxx=${nxx}`, {
    signal: AbortSignal.timeout(timeout),
    headers: {
      Accept: 'application/xml, text/xml, */*',
      'User-Agent': 'Extractor/3.0 (contact enrichment; one lookup per exchange)',
    },
  });
  if (!response.ok) return null;
  return ownerFromXml(await response.text(), block);
}

/**
 * Resolves the block owner for every number in one batch.
 *
 * Called once per run, before the ledger settles its verdicts, so that the
 * classifier can stay synchronous and still see carrier evidence.
 */
export async function prefetchBlockOwners(numbers: readonly string[]): Promise<void> {
  const wanted: Array<{ key: string; npa: string; nxx: string; block: string }> = [];
  const seen = new Set<string>();

  for (const number of numbers) {
    const parts = blockKey(number);
    if (!parts) continue;
    const key = `${parts.npa}-${parts.nxx}-${parts.block}`;
    if (seen.has(key) || cache.has(key)) continue;
    seen.add(key);
    wanted.push({ key, ...parts });
    if (wanted.length >= MAX_LOOKUPS_PER_RUN) break;
  }

  if (wanted.length === 0) return;

  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, wanted.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      const job = wanted[index];
      if (!job) return;
      try {
        cache.set(job.key, await lookup(job.npa, job.nxx, job.block));
      } catch {
        // A register that cannot be reached leaves the number unclassified,
        // which is the honest outcome; it must never fail the run.
        cache.set(job.key, null);
      }
    }
  });

  await Promise.all(workers);
}

/** The block owner for a number, if `prefetchBlockOwners` has already found it. */
export function blockOwner(e164: string): BlockOwner | null {
  const parts = blockKey(e164);
  if (!parts) return null;
  return cache.get(`${parts.npa}-${parts.nxx}-${parts.block}`) ?? null;
}

/** Test seam: lets the suite exercise the parser and the cache without network access. */
export function seedBlockOwner(e164: string, owner: BlockOwner | null): void {
  const parts = blockKey(e164);
  if (!parts) return;
  cache.set(`${parts.npa}-${parts.nxx}-${parts.block}`, owner);
}

export const __testing = { ownerFromXml };

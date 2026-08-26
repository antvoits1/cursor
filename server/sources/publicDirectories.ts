import { ADDRESS_PATTERN, PHONE_PATTERN, deobfuscate, excerptAround, extractEmails } from '../deobfuscator.js';
import { fetchPage } from '../transport.js';
import { searchWeb, type SearchHit } from './webSearch.js';
import type { EvidenceLedger } from '../evidence.js';
import type { RouteTrace } from '../trace.js';
import type { ConsultedSource, Evidence } from '../../src/types.js';

/**
 * Public business and people directories.
 *
 * These are reached through public search, so this route depends on search
 * being usable from the current network. When search is challenge-walled the
 * route reports that plainly instead of returning an empty success.
 */

const BUSINESS_DIRECTORY_HOSTS = [
  'bbb.org', 'yellowpages.com', 'manta.com', 'opencorporates.com', 'chamberofcommerce.com',
  'yelp.com', 'mapquest.com', 'superpages.com', 'bizapedia.com', 'dnb.com', 'buzzfile.com',
];

const PEOPLE_DIRECTORY_HOSTS = [
  'fastpeoplesearch.com', 'truepeoplesearch.com', 'thatsthem.com', 'radaris.com', 'spokeo.com',
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function matchesHosts(url: string, hosts: string[]): boolean {
  const host = hostOf(url);
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

function evidenceFor(url: string, label: string, method: Evidence['method'], excerpt?: string): Evidence {
  return { url, sourceLabel: label, method, excerpt, observedAt: new Date().toISOString() };
}

/**
 * Harvests a directory result: the search snippet first (which is cheap and
 * often carries the phone), then the listing page itself when it will open.
 */
async function harvestDirectoryHit(
  hit: SearchHit,
  ledger: EvidenceLedger,
  trace: RouteTrace,
  openPage: boolean,
): Promise<ConsultedSource> {
  const label = hostOf(hit.url) || 'public directory';
  const found = new Set<string>();
  const started = Date.now();

  const snippet = deobfuscate(`${hit.title} ${hit.snippet}`);
  for (const match of snippet.matchAll(PHONE_PATTERN)) {
    if (ledger.addPhone(match[0], evidenceFor(hit.url, label, 'search_snippet', snippet.slice(0, 160)), snippet) !== 'rejected') {
      found.add('phone');
    }
  }
  for (const match of snippet.matchAll(ADDRESS_PATTERN)) {
    if (ledger.addAddress(match[0], evidenceFor(hit.url, label, 'search_snippet', snippet.slice(0, 160))) !== 'rejected') {
      found.add('address');
    }
  }

  const record: ConsultedSource = {
    url: hit.url,
    label,
    kind: matchesHosts(hit.url, PEOPLE_DIRECTORY_HOSTS) ? 'people_directory' : 'directory',
    ok: true,
    blocked: false,
    fieldsFound: [...found],
    elapsedMs: Date.now() - started,
  };

  if (!openPage) return record;

  const outcome = await fetchPage(hit.url, { label: `the ${label} listing`, trace, timeoutMs: 8000 });
  record.tier = outcome.tier;
  record.ok = outcome.ok;
  record.status = outcome.status;
  record.blocked = outcome.blocked;
  record.reason = outcome.reason;
  record.elapsedMs = Date.now() - started;

  if (!outcome.ok || !outcome.html || !outcome.url) {
    trace.warn(
      'parse',
      `The ${label} listing could not be opened (${outcome.reason ?? 'no readable response'}), so only its search snippet was used.`,
      { url: hit.url, sourceLabel: label },
    );
    record.fieldsFound = [...found];
    return record;
  }

  const text = deobfuscate(outcome.html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  for (const match of text.matchAll(PHONE_PATTERN)) {
    if (ledger.addPhone(match[0], evidenceFor(outcome.url, label, 'text_pattern', excerptAround(text, match.index ?? 0)), excerptAround(text, match.index ?? 0)) === 'accepted') {
      found.add('phone');
    }
  }
  for (const email of extractEmails(text)) {
    if (ledger.addEmail(email.email, evidenceFor(outcome.url, label, 'text_pattern', excerptAround(text, email.index))) === 'accepted') {
      found.add('email');
    }
  }
  for (const match of text.matchAll(ADDRESS_PATTERN)) {
    if (ledger.addAddress(match[0], evidenceFor(outcome.url, label, 'text_pattern', excerptAround(text, match.index ?? 0))) === 'accepted') {
      found.add('address');
    }
  }

  const principal = text.match(/\b(?:Principal|Owner|President|CEO|Managing Member|Contact)\s*[:\-]\s*((?:[A-Z][A-Za-z'’.-]+\s+){1,2}[A-Z][A-Za-z'’.-]+)/);
  if (principal && ledger.addOwner(principal[1], 'Principal listed in a public directory', evidenceFor(outcome.url, label, 'text_pattern', principal[0])) === 'accepted') {
    found.add('owner');
  }

  record.fieldsFound = [...found];
  if (found.size > 0) {
    trace.success('parse', `The ${label} listing added: ${[...found].join(', ')}.`, { url: outcome.url, sourceLabel: label });
  }
  return record;
}

export interface DirectoryOutcome {
  consulted: ConsultedSource[];
  searchUsable: boolean;
  note?: string;
}

export async function searchBusinessDirectories(
  companyName: string,
  location: string | undefined,
  ledger: EvidenceLedger,
  trace: RouteTrace,
  maxListings = 3,
): Promise<DirectoryOutcome> {
  const query = `${companyName}${location ? ` ${location}` : ''} phone address contact`;
  const search = await searchWeb(query, trace, 10);
  if (!search.ok) {
    return { consulted: [], searchUsable: false, note: search.reason };
  }

  const listings = search.hits.filter((hit) => matchesHosts(hit.url, BUSINESS_DIRECTORY_HOSTS)).slice(0, maxListings);
  if (listings.length === 0) {
    trace.info('discovery', 'No public business-directory listing appeared in the search results.', {});
    return { consulted: [], searchUsable: true };
  }

  trace.info('discovery', `Found ${listings.length} public directory listing${listings.length === 1 ? '' : 's'} to cross-check.`, {});
  const consulted: ConsultedSource[] = [];
  for (const hit of listings) {
    consulted.push(await harvestDirectoryHit(hit, ledger, trace, true));
  }
  return { consulted, searchUsable: true };
}

export async function searchPeopleDirectories(
  personName: string,
  location: string | undefined,
  ledger: EvidenceLedger,
  trace: RouteTrace,
  maxListings = 2,
): Promise<DirectoryOutcome> {
  const query = `"${personName}"${location ? ` ${location}` : ''} owner contact`;
  const search = await searchWeb(query, trace, 10);
  if (!search.ok) {
    return { consulted: [], searchUsable: false, note: search.reason };
  }

  const listings = search.hits.filter((hit) => matchesHosts(hit.url, PEOPLE_DIRECTORY_HOSTS)).slice(0, maxListings);
  if (listings.length === 0) {
    trace.info('discovery', `No public people-directory record appeared for "${personName}".`, {});
    return { consulted: [], searchUsable: true };
  }

  const consulted: ConsultedSource[] = [];
  for (const hit of listings) {
    consulted.push(await harvestDirectoryHit(hit, ledger, trace, false));
  }
  return { consulted, searchUsable: true };
}

/** Picks the most likely official website from a set of search results. */
export function pickOfficialSiteFromSearch(hits: SearchHit[], companyName: string): SearchHit | null {
  const excluded = [...BUSINESS_DIRECTORY_HOSTS, ...PEOPLE_DIRECTORY_HOSTS,
    'facebook.com', 'linkedin.com', 'instagram.com', 'twitter.com', 'x.com', 'youtube.com', 'tiktok.com',
    'wikipedia.org', 'wikidata.org', 'crunchbase.com', 'zoominfo.com', 'indeed.com', 'glassdoor.com',
    'amazon.com', 'ebay.com', 'pinterest.com', 'reddit.com', 'tripadvisor.com', 'google.com', 'apple.com'];

  const tokens = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  for (const hit of hits) {
    if (matchesHosts(hit.url, excluded)) continue;
    const host = hostOf(hit.url).replace(/[^a-z0-9]+/g, '');
    // Prefer a domain that actually contains the business name.
    if (tokens.length >= 4 && host.includes(tokens.slice(0, Math.min(tokens.length, 12)))) return hit;
  }
  return hits.find((hit) => !matchesHosts(hit.url, excluded)) ?? null;
}

export { BUSINESS_DIRECTORY_HOSTS, PEOPLE_DIRECTORY_HOSTS };

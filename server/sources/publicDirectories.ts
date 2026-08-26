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

/**
 * Country-code top-level domains that a business in the United States would not
 * normally publish on. Used only to disqualify a weak search match, never to
 * reject a site the input itself pointed at.
 */
const FOREIGN_CCTLD =
  /\.(?:hr|ru|cn|jp|kr|in|br|pl|cz|sk|hu|ro|bg|gr|tr|ua|by|kz|rs|si|lt|lv|ee|vn|th|id|my|ph|pk|bd|ir|eg|za|ng|ke|ma|il|sa|ae)$/i;

const OFFICIAL_SITE_NOISE = new Set([
  'the', 'and', 'of', 'for', 'inc', 'llc', 'ltd', 'corp', 'co', 'company', 'group', 'services', 'service',
]);

function significantTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !OFFICIAL_SITE_NOISE.has(token));
}

export interface OfficialSitePickOptions {
  /** Two-letter state from the query, if any. Its presence implies a US business. */
  stateCode?: string;
}

/**
 * Picks the most likely official website from a set of search results.
 *
 * A search for a short or ambiguous business name will happily return something
 * unrelated — "Premier Hr, Commerce CA" returns the Croatian government, because
 * "hr" is a country domain. Taking the first non-directory result on trust turns
 * that into a confidently wrong answer, so a candidate has to earn its place:
 * either its domain carries the business name, or its title does.
 */
export function pickOfficialSiteFromSearch(
  hits: SearchHit[],
  companyName: string,
  options: OfficialSitePickOptions = {},
): SearchHit | null {
  const excluded = [...BUSINESS_DIRECTORY_HOSTS, ...PEOPLE_DIRECTORY_HOSTS,
    'facebook.com', 'linkedin.com', 'instagram.com', 'twitter.com', 'x.com', 'youtube.com', 'tiktok.com',
    'wikipedia.org', 'wikidata.org', 'crunchbase.com', 'zoominfo.com', 'indeed.com', 'glassdoor.com',
    'amazon.com', 'ebay.com', 'pinterest.com', 'reddit.com', 'tripadvisor.com', 'google.com', 'apple.com'];

  const expectsUnitedStates = Boolean(options.stateCode);
  const eligible = hits.filter((hit) => {
    if (matchesHosts(hit.url, excluded)) return false;
    const host = hostOf(hit.url);
    if (expectsUnitedStates && FOREIGN_CCTLD.test(host)) return false;
    return true;
  });

  /*
   * Strongest signal: the domain itself carries the business name.
   *
   * The name is collapsed to its significant words rather than truncated to a
   * fixed prefix. Matching on a prefix meant "Chautauqua County Stockyards"
   * matched chautauquacountyny.gov on its first twelve characters and returned
   * a county government site for a stockyard, because the words the prefix
   * happened to cover were the ones the two names share.
   */
  const collapsed = significantTokens(companyName).join('');
  if (collapsed.length >= 6) {
    for (const hit of eligible) {
      const host = hostOf(hit.url).replace(/[^a-z0-9]+/g, '');
      if (host.includes(collapsed)) return hit;
    }
  }

  // Otherwise the result has to at least be about the business that was asked
  // for. Without that, no site is better than the wrong site.
  const wanted = significantTokens(companyName);
  if (wanted.length === 0) return eligible[0] ?? null;

  /*
   * Counting matched tokens alone is not enough, because the tokens a name
   * shares with unrelated organisations are exactly the generic ones.
   * "Chautauqua County Stockyards" matches two of its three tokens against the
   * Chautauqua County government site, clears a simple majority, and yields a
   * confident page of county switchboard numbers.
   *
   * The last significant token is what actually names the business -- Stockyards,
   * Motors, Academy, Entertainment -- so it has to be there. A candidate that
   * matches every word except the one saying what the business is has matched
   * its surroundings, not the business.
   */
  const head = wanted[wanted.length - 1];

  for (const hit of eligible) {
    const haystack = `${hit.title ?? ''} ${hostOf(hit.url)}`.toLowerCase();
    if (!haystack.includes(head)) continue;
    const matched = wanted.filter((token) => haystack.includes(token)).length;
    if (matched / wanted.length >= 0.5) return hit;
  }

  return null;
}

export { BUSINESS_DIRECTORY_HOSTS, PEOPLE_DIRECTORY_HOSTS };

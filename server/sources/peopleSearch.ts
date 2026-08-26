import * as cheerio from 'cheerio';
import type { CheerioAPI, Cheerio } from 'cheerio';
import type { Element } from 'domhandler';
import { PHONE_PATTERN, deobfuscate, extractEmails } from '../deobfuscator.js';
import { resolveLineType, scoreReachability } from '../lineType.js';
import { classifyPhoneNumber } from '../phoneClassifier.js';
import { looksLikeSsnValue } from '../../src/lib/sensitive.js';
import { fetchPage } from '../transport.js';
import type { RouteTrace } from '../trace.js';
import type {
  AddressInfo,
  ConsultedSource,
  EmailInfo,
  Evidence,
  PersonRecord,
  PhoneInfo,
  RelatedPerson,
} from '../../src/types.js';

/**
 * People-search adapters.
 *
 * These sites hold what nothing else free does: every number ever associated
 * with a person, each labelled wireless or landline, alongside their current
 * address, previous addresses, email addresses and relatives. That labelling is
 * bought from carrier data, which makes it the single best free source for the
 * mobile-or-landline question.
 *
 * Two things are true about scraping them and both are reported honestly rather
 * than worked around:
 *
 *  - They sit behind aggressive bot protection and will refuse a datacenter IP
 *    almost every time. From a cloud host these adapters will usually report
 *    "blocked". With a residential proxy configured they work. The adapter
 *    distinguishes "blocked" from "no record found", because those mean
 *    completely different things to the operator.
 *  - Their terms prohibit automated access. This adapter is off unless it is
 *    explicitly switched on, so running it is a deliberate choice.
 *
 * Nothing here is invented. If a page cannot be read, the run says so.
 */

/**
 * Whether these sources may be consulted.
 *
 * The operator's per-run choice decides it. The environment variable only sets
 * the default for callers that do not express a preference, so a deployment can
 * keep them off entirely.
 */
export function peopleSearchEnabled(requested?: boolean): boolean {
  if (typeof requested === 'boolean') return requested;
  return process.env.EXTRACTOR_ENABLE_PEOPLE_SEARCH === '1';
}

interface Adapter {
  id: string;
  label: string;
  host: string;
  /** Result-list URL for a name, optionally narrowed by location. */
  searchUrl: (name: string, location?: string) => string;
  /** Profile links on a result page. */
  profileLinks: ($: CheerioAPI, baseUrl: string) => string[];
  parseProfile: (html: string, url: string, label: string) => ParsedProfile;
}

export interface ParsedProfile {
  name?: string;
  age?: number;
  currentAddress?: string;
  priorAddresses: string[];
  /** Numbers with whatever type label the page attached to them. */
  phones: Array<{ number: string; label?: string; carrier?: string; listedFirst: boolean }>;
  emails: string[];
  relatives: RelatedPerson[];
}

function absolute(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function cleanText(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Pulls numbers out of a block, keeping the label that sits beside each one.
 *
 * The label is the whole point: these pages render "(555) 123-4567 - Wireless",
 * and that word is worth more than every other line-type signal combined.
 */
function phonesFromBlock($: CheerioAPI, block: Cheerio<Element>): ParsedProfile['phones'] {
  const found: ParsedProfile['phones'] = [];
  const seen = new Set<string>();

  block.find('a[href^="tel:"], .phone, [itemprop="telephone"], .link-to-more').each((_, element) => {
    const node = $(element);
    const raw = node.attr('href')?.replace(/^tel:/i, '') ?? node.text();
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 10 || seen.has(digits)) return;

    // The type label is usually a sibling or the parent's remaining text.
    const surrounding = cleanText(node.parent().text());
    const labelMatch = surrounding.match(
      /\b(wireless|mobile|cell(?:ular)?|landline|land line|home phone|residential|fixed line|wireline|voip|non-fixed voip|toll[\s-]?free)\b/i,
    );
    const carrierMatch = surrounding.match(/(?:carrier|provider)\s*[:-]?\s*([A-Za-z0-9 .&'-]{3,40})/i);

    seen.add(digits);
    found.push({
      number: raw.trim(),
      label: labelMatch?.[1],
      carrier: carrierMatch?.[1]?.trim(),
      listedFirst: found.length === 0,
    });
  });

  // Fall back to a text sweep when the markup carries no telephone anchors.
  if (found.length === 0) {
    const text = cleanText(block.text());
    const pattern = new RegExp(PHONE_PATTERN.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const digits = match[0].replace(/\D/g, '');
      if (digits.length < 10 || seen.has(digits)) continue;
      const window = text.slice(match.index, match.index + match[0].length + 40);
      const labelMatch = window.match(
        /\b(wireless|mobile|cell(?:ular)?|landline|land line|home phone|residential|voip|toll[\s-]?free)\b/i,
      );
      seen.add(digits);
      found.push({ number: match[0], label: labelMatch?.[1], listedFirst: found.length === 0 });
    }
  }

  return found;
}

function relativesFromBlock($: CheerioAPI, block: Cheerio<Element>, baseUrl: string): RelatedPerson[] {
  const relatives: RelatedPerson[] = [];
  const seen = new Set<string>();

  block.find('a').each((_, element) => {
    const node = $(element);
    const name = cleanText(node.text());
    if (!name || name.length < 4 || name.length > 60) return;
    if (!/^[A-Z][a-zA-Z'’.-]+(?:\s+[A-Z][a-zA-Z'’.-]+){1,3}$/.test(name)) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const ageMatch = cleanText(node.parent().text()).match(/\b(?:age\s*)?(\d{2})\b/);
    const href = node.attr('href');
    relatives.push({
      name,
      relation: 'relative',
      age: ageMatch ? Number(ageMatch[1]) : undefined,
      profileUrl: href ? (absolute(href, baseUrl) ?? undefined) : undefined,
    });
  });

  return relatives.slice(0, 20);
}

/**
 * Marks the spouse where the page says so.
 *
 * These sites do not have a spouse field; a spouse appears as a relative who
 * shares the surname and the current address. That inference is stated as
 * "household" rather than "spouse" unless the page uses the word itself,
 * because guessing at a marriage from an address is not a fact.
 */
function markHousehold(relatives: RelatedPerson[], subjectName: string, pageText: string): RelatedPerson[] {
  const surname = subjectName.trim().split(/\s+/).pop()?.toLowerCase();
  return relatives.map((person) => {
    const lowered = person.name.toLowerCase();
    if (new RegExp(`\\b(?:spouse|husband|wife|married to)\\b[^.]{0,60}${lowered.split(' ')[0]}`, 'i').test(pageText)) {
      return { ...person, relation: 'spouse' as const };
    }
    if (surname && lowered.endsWith(surname)) {
      return { ...person, relation: 'household' as const };
    }
    return person;
  });
}

/**
 * Section-based profile parser.
 *
 * Every one of these sites lays a profile out as headed sections — phone
 * numbers, email addresses, current address, previous addresses, relatives —
 * so one parser driven by heading text handles all of them, and keeps working
 * when one of them reshuffles its markup.
 */
function parseSectionedProfile(html: string, url: string): ParsedProfile {
  const $ = cheerio.load(deobfuscate(html));
  const pageText = cleanText($('body').text());

  const name =
    cleanText($('h1').first().text()).replace(/\s*-\s*(?:public records|background report|phone|address).*$/i, '') ||
    undefined;
  const ageMatch = pageText.match(/Age\s+(\d{1,3})\b/i);

  const headingSelector = 'h1, h2, h3, h4, h5, .row-title, .section-title, dt';

  /**
   * Collects the content that belongs to a heading.
   *
   * These pages are flat: a heading, then its values as following siblings,
   * with the next heading ending the run. Taking the heading's parent instead
   * would swallow the whole document, so the siblings are walked until the next
   * heading is reached.
   */
  const sectionFor = (pattern: RegExp): Cheerio<Element> => {
    let collected: Element[] = [];
    $(headingSelector).each((_, element) => {
      if (collected.length > 0) return;
      if (!pattern.test(cleanText($(element).text()))) return;

      const nodes: Element[] = [];
      let cursor = $(element).next();
      while (cursor.length > 0 && !cursor.is(headingSelector)) {
        const node = cursor.get(0);
        if (!node) break;
        nodes.push(node);
        cursor = cursor.next();
      }
      // Some layouts nest the values inside the heading's own block rather than
      // after it. Fall back to that block, but never to the whole page.
      if (nodes.length === 0) {
        const parent = $(element).parent();
        const parentNode = parent.get(0);
        if (parentNode && !parent.is('body, html')) nodes.push(parentNode);
      }
      collected = nodes;
    });
    return $(collected);
  };

  const phoneSection = sectionFor(/phone\s*number|phone/i);
  const phones = phonesFromBlock($, phoneSection.length > 0 ? phoneSection : $('body'));

  const emailSection = sectionFor(/email/i);
  const emails = extractEmails(cleanText((emailSection.length > 0 ? emailSection : $('body')).text())).map(
    (item) => item.email,
  );

  const currentSection = sectionFor(/current\s+address|lives\s+in|current\s+home/i);
  const currentAddress = cleanText(currentSection.text())
    .replace(/^(?:current\s+address|lives\s+in|current\s+home)\s*:?\s*/i, '')
    .slice(0, 160)
    .trim();

  const priorSection = sectionFor(/previous\s+address|past\s+address|address\s+history|previously\s+lived/i);
  const priorAddresses = cleanText(priorSection.text())
    .split(/\s{2,}|(?<=\d{5})\s+(?=\d)/)
    .map((entry) => entry.trim())
    .filter((entry) => /\d/.test(entry) && entry.length > 12 && entry.length < 160)
    .slice(0, 12);

  const relativeSection = sectionFor(/relative|associate|possible\s+relative|family/i);
  const relatives = markHousehold(
    relativesFromBlock($, relativeSection.length > 0 ? relativeSection : $(), url),
    name ?? '',
    pageText,
  );

  return {
    name,
    age: ageMatch ? Number(ageMatch[1]) : undefined,
    currentAddress: currentAddress && /\d/.test(currentAddress) ? currentAddress : undefined,
    priorAddresses,
    phones,
    emails,
    relatives,
  };
}

function genericProfileLinks($: CheerioAPI, baseUrl: string, pathPattern: RegExp): string[] {
  const links: string[] = [];
  const seen = new Set<string>();
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    const resolved = absolute(href, baseUrl);
    if (!resolved || seen.has(resolved)) return;
    try {
      if (!pathPattern.test(new URL(resolved).pathname)) return;
    } catch {
      return;
    }
    seen.add(resolved);
    links.push(resolved);
  });
  return links;
}

const ADAPTERS: Adapter[] = [
  {
    id: 'truepeoplesearch',
    label: 'TruePeopleSearch',
    host: 'www.truepeoplesearch.com',
    searchUrl: (name, location) =>
      `https://www.truepeoplesearch.com/results?name=${encodeURIComponent(name)}${
        location ? `&citystatezip=${encodeURIComponent(location)}` : ''
      }`,
    profileLinks: ($, base) => genericProfileLinks($, base, /^\/find\/person\//i),
    parseProfile: parseSectionedProfile,
  },
  {
    id: 'fastpeoplesearch',
    label: 'FastPeopleSearch',
    host: 'www.fastpeoplesearch.com',
    searchUrl: (name, location) =>
      `https://www.fastpeoplesearch.com/name/${encodeURIComponent(name.replace(/\s+/g, '-').toLowerCase())}${
        location ? `_${encodeURIComponent(location.replace(/[\s,]+/g, '-').toLowerCase())}` : ''
      }`,
    profileLinks: ($, base) => genericProfileLinks($, base, /^\/(?:\d|name\/)/i),
    parseProfile: parseSectionedProfile,
  },
  {
    id: 'thatsthem',
    label: 'ThatsThem',
    host: 'thatsthem.com',
    searchUrl: (name, location) =>
      `https://thatsthem.com/name/${encodeURIComponent(name.replace(/\s+/g, '-'))}${
        location ? `/${encodeURIComponent(location.replace(/[\s,]+/g, '-'))}` : ''
      }`,
    profileLinks: ($, base) => genericProfileLinks($, base, /^\/p\//i),
    parseProfile: parseSectionedProfile,
  },
];

export interface PeopleSearchOutcome {
  people: PersonRecord[];
  consulted: ConsultedSource[];
  /** True when at least one site answered with a readable page. */
  anyReadable: boolean;
  /** True when at least one site refused with a bot challenge. */
  anyBlocked: boolean;
}

function evidenceFor(url: string, label: string, excerpt?: string): Evidence {
  return { url, sourceLabel: label, method: 'text_pattern', excerpt, observedAt: new Date().toISOString() };
}

function toAddressInfo(raw: string, evidence: Evidence): AddressInfo {
  return { full: raw, agreementCount: 1, confidence: 55, evidence: [evidence] };
}

/**
 * Scores how well a record matches the person that was asked for.
 *
 * A name search returns everyone with that name in the country. Returning all
 * of them as though they were the same person would be worse than returning
 * nothing, so each record is scored on the evidence that ties it to the query.
 */
function scoreMatch(
  profile: ParsedProfile,
  wantedName: string,
  wantedLocation: string | undefined,
  knownPhones: string[],
): { score: number; basis: string[] } {
  const basis: string[] = [];
  let score = 0;

  const wantedTokens = wantedName.toLowerCase().split(/\s+/).filter(Boolean);
  const gotTokens = (profile.name ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const shared = wantedTokens.filter((token) => gotTokens.includes(token)).length;
  if (wantedTokens.length > 0) {
    const nameScore = Math.round(45 * (shared / wantedTokens.length));
    score += nameScore;
    basis.push(`${shared} of ${wantedTokens.length} name parts match (+${nameScore}).`);
  }

  if (wantedLocation) {
    const haystack = `${profile.currentAddress ?? ''} ${profile.priorAddresses.join(' ')}`.toLowerCase();
    const parts = wantedLocation.toLowerCase().split(/[,\s]+/).filter((part) => part.length > 1);
    const hits = parts.filter((part) => haystack.includes(part)).length;
    if (hits > 0) {
      const locationScore = Math.round(30 * (hits / parts.length));
      score += locationScore;
      basis.push(`The record's addresses match ${hits} part${hits === 1 ? '' : 's'} of the requested location (+${locationScore}).`);
    } else {
      basis.push('No address on the record matches the requested location.');
    }
  }

  // A phone number already known for this lead is the strongest possible tie.
  const recordDigits = profile.phones.map((phone) => phone.number.replace(/\D/g, '').slice(-10));
  const overlap = knownPhones.map((phone) => phone.replace(/\D/g, '').slice(-10)).filter((phone) => recordDigits.includes(phone));
  if (overlap.length > 0) {
    score += 40;
    basis.push(`A phone number already on the lead appears on this record (+40), which ties it to the right person.`);
  }

  return { score: Math.max(0, Math.min(100, score)), basis };
}

export interface PeopleSearchRequest {
  personName: string;
  location?: string;
  /** Numbers already known for this lead, used to confirm the right person. */
  knownPhones?: string[];
  maxProfilesPerSite?: number;
  /** The operator's choice for this run. Falls back to the deployment default. */
  enabled?: boolean;
  trace: RouteTrace;
}

/**
 * Looks a person up across the people-search sites and returns whole records.
 *
 * Records are kept per source rather than merged. Two sites disagreeing about
 * someone's current address is something the operator needs to see.
 */
export async function lookupPeople(request: PeopleSearchRequest): Promise<PeopleSearchOutcome> {
  const { personName, location, trace } = request;
  const consulted: ConsultedSource[] = [];
  const people: PersonRecord[] = [];
  let anyReadable = false;
  let anyBlocked = false;

  if (!peopleSearchEnabled(request.enabled)) {
    trace.skip(
      'discovery',
      'People-search sources are switched off. Turn them on in Settings to look up every number, email and address on record for a person.',
      {},
    );
    return { people, consulted, anyReadable, anyBlocked };
  }
  if (!personName || personName.trim().split(/\s+/).length < 2) {
    trace.skip('discovery', 'People-search needs a full name; the lead did not carry one.', {});
    return { people, consulted, anyReadable, anyBlocked };
  }

  const maxProfiles = request.maxProfilesPerSite ?? 2;

  for (const adapter of ADAPTERS) {
    const searchUrl = adapter.searchUrl(personName, location);
    trace.info('discovery', `Searching ${adapter.label} for ${personName}${location ? ` in ${location}` : ''}...`, {
      url: searchUrl,
    });

    const listing = await fetchPage(searchUrl, { label: `${adapter.label} results`, trace });
    if (!listing.ok || !listing.html) {
      anyBlocked = anyBlocked || listing.blocked;
      consulted.push({
        url: searchUrl,
        label: `${adapter.label} results`,
        kind: 'people_directory',
        ok: false,
        blocked: listing.blocked,
        reason: listing.reason,
        fieldsFound: [],
        elapsedMs: listing.totalMs,
      });
      trace.warn(
        'failure',
        listing.blocked
          ? `${adapter.label} answered with a bot challenge. This site refuses datacenter addresses; a residential proxy is what makes it readable.`
          : `${adapter.label} could not be read: ${listing.reason ?? 'no response'}.`,
        { url: searchUrl },
      );
      continue;
    }

    anyReadable = true;
    const $ = cheerio.load(listing.html);
    const profileUrls = adapter.profileLinks($, listing.url ?? searchUrl).slice(0, maxProfiles);

    consulted.push({
      url: searchUrl,
      label: `${adapter.label} results`,
      kind: 'people_directory',
      ok: true,
      blocked: false,
      fieldsFound: profileUrls.length > 0 ? ['profiles'] : [],
      elapsedMs: listing.totalMs,
    });

    if (profileUrls.length === 0) {
      trace.info('discovery', `${adapter.label} returned no matching profile for ${personName}.`, { url: searchUrl });
      continue;
    }

    trace.success('discovery', `${adapter.label} returned ${profileUrls.length} profile${profileUrls.length === 1 ? '' : 's'} to read.`, {
      url: searchUrl,
    });

    for (const profileUrl of profileUrls) {
      const page = await fetchPage(profileUrl, { label: `${adapter.label} profile`, trace });
      if (!page.ok || !page.html) {
        anyBlocked = anyBlocked || page.blocked;
        consulted.push({
          url: profileUrl,
          label: `${adapter.label} profile`,
          kind: 'people_directory',
          ok: false,
          blocked: page.blocked,
          reason: page.reason,
          fieldsFound: [],
          elapsedMs: page.totalMs,
        });
        continue;
      }

      const profile = adapter.parseProfile(page.html, profileUrl, adapter.label);
      const record = buildRecord(profile, adapter.label, profileUrl, personName, location, request.knownPhones ?? []);
      if (!record) continue;

      people.push(record);
      consulted.push({
        url: profileUrl,
        label: `${adapter.label}: ${record.name}`,
        kind: 'people_directory',
        ok: true,
        blocked: false,
        fieldsFound: [
          record.phones.length > 0 ? `${record.phones.length} phone` : '',
          record.emails.length > 0 ? `${record.emails.length} email` : '',
          record.currentAddress ? 'current address' : '',
          record.relatives.length > 0 ? `${record.relatives.length} relative` : '',
        ].filter(Boolean),
        elapsedMs: page.totalMs,
      });

      const mobiles = record.phones.filter((phone) => phone.type === 'MOBILE').length;
      trace.success(
        'accepted',
        `${adapter.label} record for ${record.name}: ${record.phones.length} number${record.phones.length === 1 ? '' : 's'} (${mobiles} mobile), ${record.emails.length} email address${record.emails.length === 1 ? '' : 'es'}, ${record.relatives.length} relative${record.relatives.length === 1 ? '' : 's'}. Match score ${record.matchScore}%.`,
        { url: profileUrl, detail: { matchScore: record.matchScore } },
      );
    }
  }

  people.sort((a, b) => b.matchScore - a.matchScore);
  return { people, consulted, anyReadable, anyBlocked };
}

function buildRecord(
  profile: ParsedProfile,
  sourceLabel: string,
  sourceUrl: string,
  wantedName: string,
  wantedLocation: string | undefined,
  knownPhones: string[],
): PersonRecord | null {
  const name = profile.name ?? wantedName;
  if (!name) return null;

  const evidence = evidenceFor(sourceUrl, sourceLabel);
  const { score, basis } = scoreMatch(profile, wantedName, wantedLocation, knownPhones);

  const phones: PhoneInfo[] = [];
  for (const entry of profile.phones) {
    // A protected identifier must never be promoted into a phone number, even
    // when a page presents it in a phone-shaped field.
    if (looksLikeSsnValue(entry.number)) continue;

    const classified = classifyPhoneNumber(entry.number);
    if (!classified) continue;

    const verdict = resolveLineType({
      number: classified.number,
      publishedLabel: entry.label,
      publishedLabelSourceUrl: sourceUrl,
      carrier: entry.carrier,
      carrierSourceUrl: entry.carrier ? sourceUrl : undefined,
    });
    const reach = scoreReachability({
      lineType: verdict.type,
      lineTypeConfidence: verdict.confidence,
      agreementCount: 1,
      recency: 'current',
      listedFirst: entry.listedFirst,
      isFax: classified.isFax,
    });

    phones.push({
      number: classified.number,
      formatted: classified.formatted,
      type: verdict.type,
      lineTypeConfidence: verdict.confidence,
      lineTypeBasis: verdict.basis,
      lineTypeSignals: verdict.signals,
      carrier: verdict.carrier ?? classified.carrier,
      location: classified.location,
      timezone: classified.timezone,
      country: classified.country,
      agreementCount: 1,
      confidence: 60,
      reachabilityScore: reach.score,
      reachabilityBasis: reach.basis,
      rank: 0,
      recency: 'current',
      evidence: [evidence],
    });
  }

  phones.sort((a, b) => b.reachabilityScore - a.reachabilityScore);
  phones.forEach((phone, index) => {
    phone.rank = index + 1;
  });

  const emails: EmailInfo[] = profile.emails.map((address) => ({
    email: address.toLowerCase(),
    kind: 'personal',
    domain: address.split('@')[1]?.toLowerCase() ?? '',
    domainMatchesWebsite: false,
    deliverability: 'unknown',
    deliverabilityBasis: 'Published on a public-records page; not yet verified against the mail server.',
    verification: {
      syntaxValid: true,
      domainHasMx: null,
      hasSpf: null,
      hasDmarc: null,
      disposable: false,
      roleAccount: false,
      catchAll: null,
      smtpAccepted: null,
      verdict: 'unverifiable',
      basis: ['Not yet checked.'],
    },
    agreementCount: 1,
    confidence: 50,
    evidence: [evidence],
  }));

  return {
    name,
    age: profile.age,
    currentAddress: profile.currentAddress ? toAddressInfo(profile.currentAddress, evidence) : undefined,
    priorAddresses: profile.priorAddresses.map((address) => toAddressInfo(address, evidence)),
    phones,
    emails,
    relatives: profile.relatives,
    sourceLabel,
    sourceUrl,
    matchScore: score,
    matchBasis: basis,
    observedAt: new Date().toISOString(),
  };
}

export { ADAPTERS as PEOPLE_SEARCH_ADAPTERS, parseSectionedProfile };

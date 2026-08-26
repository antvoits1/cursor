import { EvidenceLedger } from './evidence.js';
import { inspectDomainDns, normaliseDomain } from './dnsInspector.js';
import { isReservedHost } from './ssrfGuard.js';
import { withRunDeadline } from './runDeadline.js';
import { blockOwner, prefetchBlockOwners } from './numberingPlan.js';
import { lookupPeople } from './sources/peopleSearch.js';
import { verifyEmails } from './emailVerifier.js';
import { assistantAvailable, beginUsage, interpretQuery } from './assistant.js';
import {
  domainPrior,
  noteRun,
  recordDomainOutcome,
  recordRouteOutcome,
} from './learning.js';
import { QUERY_TYPE_LABELS, planQuery } from './queryPlanner.js';
import { RouteTrace } from './trace.js';
import { availableTiers, proxyLabel, tierAvailability, tierLabel, transportMode } from './transport.js';
import { readFacebookPage } from './sources/facebookPage.js';
import { crawlOfficialSite } from './sources/officialSite.js';
import { lookupPlaces } from './sources/openStreetMap.js';
import { probeForOfficialSite } from './sources/domainProbe.js';
import {
  pickOfficialSiteFromSearch,
  searchBusinessDirectories,
  searchPeopleDirectories,
} from './sources/publicDirectories.js';
import { searchWeb } from './sources/webSearch.js';
import type { SearchOutcome } from './sources/webSearch.js';
import { lookupEntityFacts } from './sources/wikidata.js';
import { redactSensitiveText } from '../src/lib/sensitive.js';
import type {
  ConsultedSource,
  DiagnosticRunSummary,
  DnsIntelligence,
  EngineDiagnostics,
  EntityMatchStatus,
  Evidence,
  ExtractionResult,
  QueryType,
  PersonRecord,
  RouteStep,
  TransportTier,
} from '../src/types.js';
import { pageCache } from './cache.js';
import { snapshot as learningSnapshot, isPersistent as learningPersistent } from './learning.js';

export const BUILD_NAME = 'Extractor-React-Layered-20260825-03';
export const BUILD_VERSION = '3.0.0';

interface EngineStats {
  startedAt: number;
  total: number;
  succeeded: number;
  failed: number;
  /** Diagnostics only report "online" once a real run has completed here. */
  provenOnline: boolean;
  lastError?: string;
  recent: DiagnosticRunSummary[];
}

const stats: EngineStats = {
  startedAt: Date.now(),
  total: 0,
  succeeded: 0,
  failed: 0,
  provenOnline: false,
  recent: [],
};

export interface ExtractionOptions {
  deepScan?: boolean;
  /** Hard wall-clock budget. The run returns what it has when this is reached. */
  budgetMs?: number;
  /** Consult people-search sources for full person records. */
  peopleSearch?: boolean;
  /** Allow the assistant layer on this run. */
  useAssistant?: boolean;
  rowId?: string;
  preservedFields?: Record<string, string | number>;
  /** Receives each route step as it happens so the API can stream the live route. */
  onStep?: (step: RouteStep) => void;
}

function newId(): string {
  return `ext_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}


/**
 * Country-code domains a business located in the United States would not
 * normally publish on. Used only to reject a site that a *search or register
 * lookup* proposed; a site the operator supplied in the input is always honoured.
 */
const FOREIGN_CCTLD =
  /\.(?:hr|ru|cn|jp|kr|in|br|pl|cz|sk|hu|ro|bg|gr|tr|ua|by|kz|rs|si|lt|lv|ee|vn|th|id|my|ph|pk|bd|ir|eg|za|ng|ke|ma|il|sa|ae)$/i;

function hostOfUrl(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return '';
  }
}

const NAME_NOISE = new Set([
  'inc', 'incorporated', 'llc', 'l.l.c', 'llp', 'ltd', 'limited', 'co', 'company', 'corp', 'corporation',
  'group', 'holdings', 'enterprises', 'enterprise', 'services', 'service', 'the', 'and', 'of', 'dba',
  // Domain furniture, so that "stripe.com" and "Stripe" are not read as a mismatch.
  'www', 'com', 'net', 'org', 'io', 'gov', 'edu', 'biz', 'info',
]);

function nameTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1 && !NAME_NOISE.has(token)),
  );
}

/**
 * How much two business names overlap, ignoring legal suffixes and punctuation.
 *
 * Returns null when there is nothing meaningful to compare — no requested name,
 * or no resolved name — because an absent comparison must not be scored as a
 * disagreement.
 */
function compareBusinessNames(requested: string | undefined, resolved: string | undefined): number | null {
  if (!requested || !resolved) return null;
  const left = nameTokens(requested);
  const right = nameTokens(resolved);
  if (left.size === 0 || right.size === 0) return null;

  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  // Measured against the requested name: the resolved name is allowed to carry
  // extra words, but it must contain most of what was asked for.
  return shared / left.size;
}

function locationString(city?: string, state?: string, zip?: string): string | undefined {
  const parts = [city, state, zip].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function normaliseWebsite(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withScheme);
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname === '/' ? '/' : parsed.pathname}`;
  } catch {
    return '';
  }
}

function evidenceFor(url: string, label: string, method: Evidence['method'], excerpt?: string): Evidence {
  return { url, sourceLabel: label, method, excerpt, observedAt: new Date().toISOString() };
}

/**
 * Runs one extraction end to end.
 *
 * Every run gets its own trace and its own evidence ledger. Nothing is shared
 * between runs, so a bulk batch cannot contaminate one row with another row's
 * findings.
 */
export async function extract(rawQuery: string, options: ExtractionOptions = {}): Promise<ExtractionResult> {
  const deepScan = options.deepScan ?? true;
  const budget = options.budgetMs ?? Number(process.env.EXTRACTOR_RUN_BUDGET_MS ?? (deepScan ? 45_000 : 12_000));
  // Publishing the deadline in async context is what lets the budget reach the
  // individual fetches rather than only the gaps between routes.
  return withRunDeadline(Date.now() + budget, () => runExtraction(rawQuery, options));
}

async function runExtraction(rawQuery: string, options: ExtractionOptions = {}): Promise<ExtractionResult> {
  const startedAt = Date.now();
  const deepScan = options.deepScan ?? true;
  /*
   * A standard run targets a few seconds, which is what makes the search feel
   * immediate. That is affordable now that discovery and the site crawl run
   * their fetches concurrently rather than in sequence; the budget bounds the
   * slowest source rather than the sum of all of them.
   *
   * Deep scan trades that for reach and is given far longer.
   */
  const budgetMs = options.budgetMs ?? Number(process.env.EXTRACTOR_RUN_BUDGET_MS ?? (deepScan ? 45_000 : 12_000));
  const deadline = startedAt + budgetMs;
  const outOfTime = () => Date.now() >= deadline;

  const trace = new RouteTrace(options.onStep);
  const ledger = new EvidenceLedger();
  const consulted: ConsultedSource[] = [];
  const id = newId();

  // Sensitive values must never enter the pipeline, even by way of a hand-typed
  // query. This is the single entry point, so it is gated here.
  const query = redactSensitiveText(String(rawQuery ?? '').trim().replace(/\s+/g, ' '));

  trace.info('input', `Received the request: "${query}".`, { detail: { characters: query.length } });

  const plan = planQuery(query);
  const queryType: QueryType = plan.queryType;
  trace.info('classification', `Read this as a ${QUERY_TYPE_LABELS[queryType].toLowerCase()} lookup.`, {
    detail: { queryType },
  });

  const context = plan.inferredContext;
  const contextParts: string[] = [];
  if (context.companyName) contextParts.push(`business "${context.companyName}"`);
  if (context.personName) contextParts.push(`person "${context.personName}"`);
  const location = locationString(context.city, context.state, context.zip);
  if (location) contextParts.push(`location "${location}"`);
  if (context.domain) contextParts.push(`domain "${context.domain}"`);
  if (context.phone) contextParts.push('a phone number');
  if (context.email) contextParts.push(`email "${context.email}"`);
  trace.info(
    'context',
    contextParts.length > 0
      ? `Pulled out of the input: ${contextParts.join(', ')}.`
      : 'The input carried no extra context beyond the search text itself.',
  );

  trace.info(
    'plan',
    `Planned ${plan.routes.length} route${plan.routes.length === 1 ? '' : 's'}, in this order: ${plan.routes.map((r) => r.label.toLowerCase()).join('; ')}.`,
    { detail: { routes: plan.routes.map((r) => r.id).join(', ') } },
  );
  for (const route of plan.routes) {
    if (route.learnedSuccessRate !== undefined && (route.learnedSampleSize ?? 0) >= 3) {
      trace.info(
        'learning',
        `From ${route.learnedSampleSize} earlier ${QUERY_TYPE_LABELS[queryType].toLowerCase()} runs, "${route.label.toLowerCase()}" has produced usable data ${route.learnedSuccessRate}% of the time.`,
        { detail: { routeId: route.id, successRate: route.learnedSuccessRate } },
      );
    }
  }

  const mode = await transportMode();
  const tiers = await availableTiers();
  trace.info(
    'transport',
    mode === 'layered_python'
      ? `Transport ready: ${tiers.map(tierLabel).join(' then ')}. Requests go out over ${proxyLabel()}.`
      : `Transport ready with the built-in HTTP client only; browser rendering tiers are not installed on this host. Requests go out over ${proxyLabel()}.`,
    { detail: { mode, tiers: tiers.join(', ') } },
  );

  const routeTiming = new Map<string, number>();
  const routeYield = new Map<string, number>();
  const markRoute = (routeId: string, elapsedMs: number, gained: number, blocked: boolean, success: boolean) => {
    routeTiming.set(routeId, elapsedMs);
    routeYield.set(routeId, gained);
    recordRouteOutcome({ queryType, routeId, success, blocked, latencyMs: elapsedMs, fieldYield: gained });
    trace.info('timing', `"${routeId.replace(/_/g, ' ')}" finished in ${(elapsedMs / 1000).toFixed(1)} s and contributed ${gained} value${gained === 1 ? '' : 's'}.`, {
      detail: { routeId, elapsedMs, gained },
    });
  };

  const totalAccepted = () => {
    const c = ledger.counts();
    return c.phones + c.emails + c.addresses + c.socials + c.owners;
  };

  let website = context.url ? normaliseWebsite(context.url) : context.domain ? normaliseWebsite(context.domain) : '';
  // A target on the loopback, link-local or private ranges is not a business
  // website. Dropping it here keeps every later route — the crawl, the DNS
  // check and the result itself — from ever pointing at internal infrastructure.
  if (website && isReservedHost(website)) {
    trace.error('failure', `Ignored the supplied address: ${website} is on a reserved or private network and is never a business website.`, {
      url: website,
    });
    website = '';
  }
  // When the input is a bare URL or domain there is no business name in it yet.
  // Carrying the URL forward as the company name would present the address bar
  // as a finding, so the name stays empty until a source supplies a real one.
  const queryIsAddressOnly = queryType === 'url_direct' || queryType === 'domain_direct';
  let companyName = context.companyName ?? (queryIsAddressOnly ? '' : query);
  /** True once a source, rather than the input, has supplied the business name. */
  let companyNameFromSource = false;
  const people: PersonRecord[] = [];
  const assistant = beginUsage();

  /**
   * Adopts a website proposed by a source, or refuses it and says why.
   *
   * A short or ambiguous business name makes registers and search engines
   * confident about the wrong entity — "Premier Hr, Commerce CA" resolves to the
   * Croatian government, because "hr" is a country domain. When the input placed
   * the business in a US state, a foreign country domain is not that business.
   */
  const adoptWebsite = (candidate: string, sourceLabel: string): boolean => {
    const normalised = normaliseWebsite(candidate);
    if (!normalised) return false;
    if (isReservedHost(normalised)) {
      trace.warn('validation', `Ignored ${normalised} from ${sourceLabel}: it is on a reserved or private network.`, {
        url: normalised,
      });
      return false;
    }
    if (context.state && FOREIGN_CCTLD.test(hostOfUrl(normalised))) {
      trace.warn(
        'validation',
        `Ignored ${normalised} from ${sourceLabel}: the request placed this business in ${context.state}, and that is a foreign country domain.`,
        { url: normalised, detail: { state: context.state } },
      );
      return false;
    }
    website = normalised;
    return true;
  };
  let description: string | undefined;
  let industry: string | undefined;
  let blockedAnywhere = false;
  let searchUsable: boolean | null = null;
  const sitePatternsProductive = new Set<string>();
  const sitePatternsUnproductive = new Set<string>();

  /**
   * When the input does not name a specific business, the assistant works out
   * what it is actually asking for and turns it into searches worth running.
   *
   * Typing "milk" should not dead-end. It should be read as an intent to find
   * dairy businesses and dispatched as real searches. The assistant is only
   * interpreting the request here; it is never asked for a contact detail.
   */
  let interpretation: Awaited<ReturnType<typeof interpretQuery>> = null;
  const inputNamesNothingSpecific =
    !queryIsAddressOnly && queryType !== 'phone_first' && queryType !== 'email_first' && queryType !== 'facebook_page';
  if (inputNamesNothingSpecific && options.useAssistant !== false && assistantAvailable()) {
    trace.info('classification', 'Asking the assistant what this request is actually looking for...', {});
    interpretation = await interpretQuery(query, assistant);
    if (interpretation) {
      trace.success(
        'classification',
        `Read as ${interpretation.shape === 'category' ? 'a category of business' : interpretation.shape === 'specific_entity' ? 'one specific business' : 'an ambiguous request'}: ${interpretation.intent}`,
        { detail: { shape: interpretation.shape, searches: interpretation.searchQueries.length } },
      );
      if (interpretation.companyName && !context.companyName) context.companyName = interpretation.companyName;
      if (interpretation.personName && !context.personName) context.personName = interpretation.personName;
      if (interpretation.industry && !industry) industry = interpretation.industry;
    } else {
      trace.info('classification', 'The assistant could not be reached, so the request is handled by pattern rules alone.', {});
    }
  }

  for (const route of plan.routes) {
    if (outOfTime()) {
      trace.warn('timeout', `The time budget of ${Math.round(budgetMs / 1000)} s ran out, so "${route.label.toLowerCase()}" was not attempted.`, {
        detail: { routeId: route.id },
      });
      continue;
    }

    const before = totalAccepted();
    const routeStart = Date.now();

    switch (route.id) {
      case 'direct_site': {
        if (!website) break;
        trace.info('plan', `A website was supplied, so discovery is skipped and ${website} is opened directly.`, { url: website });
        markRoute(route.id, Date.now() - routeStart, 0, false, true);
        break;
      }

      case 'search_discovery': {
        const nameForLookup = context.companyName ?? query;

        /*
         * The three discovery lookups are independent of one another, so they
         * run at the same time rather than one after the next. Chaining them
         * meant a run waited out three round trips in sequence, which was most
         * of the latency on a simple search.
         *
         * They are still *applied* in priority order below -- OpenStreetMap,
         * then Wikidata, then public search -- so racing them changes the
         * timing without changing which source wins.
         */
        const searchStrings = [
          ...(interpretation?.searchQueries ?? []),
          `${nameForLookup}${location ? ` ${location}` : ''} official website contact`,
        ];
        const [places, wikidataFacts, search] = await Promise.all([
          lookupPlaces(nameForLookup, location, trace),
          lookupEntityFacts(nameForLookup, trace).catch(() => null),
          searchWeb(searchStrings[0], trace, 10).catch(
            (error: unknown): SearchOutcome => ({
              hits: [],
              ok: false,
              reason: error instanceof Error ? error.message : 'the search engines could not be reached',
              challenged: false,
              enginesTried: [],
            }),
          ),
        ]);

        // 1. OpenStreetMap: operator-maintained records with structured contacts.
        for (const place of places.slice(0, 3)) {
          const sourceEvidence = evidenceFor(place.sourceUrl, 'OpenStreetMap register', 'microdata', place.displayName.slice(0, 160));
          const fields: string[] = [];
          if (place.phone && ledger.addPhone(place.phone, sourceEvidence, `${place.category ?? ''} ${place.type ?? ''}`) !== 'rejected') fields.push('phone');
          if (place.email && ledger.addEmail(place.email, sourceEvidence) !== 'rejected') fields.push('email');
          if (place.formattedAddress && ledger.addAddress(place.formattedAddress, sourceEvidence) !== 'rejected') fields.push('address');
          if (!website && place.website && adoptWebsite(place.website, 'the OpenStreetMap register')) {
            fields.push('website');
            trace.success('accepted', `OpenStreetMap lists ${website} as this business's website.`, { url: place.sourceUrl });
          }
          if (!industry && place.type) industry = place.type.replace(/_/g, ' ');
          consulted.push({
            url: place.sourceUrl,
            label: `OpenStreetMap: ${place.name || nameForLookup}`,
            kind: 'registry',
            ok: true,
            blocked: false,
            fieldsFound: fields,
            elapsedMs: Date.now() - routeStart,
          });
        }

        // 2. Wikidata: the entity's own declared official website.
        {
          const facts = wikidataFacts;
          if (!website && facts?.officialWebsite && adoptWebsite(facts.officialWebsite, 'Wikidata')) {
            if (facts.description && !description) description = facts.description;
            consulted.push({
              url: facts.sourceUrl,
              label: `Wikidata: ${facts.label ?? nameForLookup}`,
              kind: 'registry',
              ok: true,
              blocked: false,
              fieldsFound: ['website'],
              elapsedMs: Date.now() - routeStart,
            });
          }
        }

        // 3. Public search, when this network can use it. Where the assistant
        //    interpreted the request, its searches are tried first, because a
        //    category word like "milk" needs a real search string behind it.
        {
          searchUsable = search.ok;
          if (search.ok) {
            const pick = pickOfficialSiteFromSearch(search.hits, nameForLookup, { stateCode: context.state });
            if (pick && adoptWebsite(pick.url, 'public search')) {
              trace.success('accepted', `Public search points at ${website} as the official website.`, { url: pick.url });
              consulted.push({
                url: pick.url,
                label: `Search result: ${pick.title || pick.url}`,
                kind: 'search',
                ok: true,
                blocked: false,
                fieldsFound: ['website'],
                elapsedMs: Date.now() - routeStart,
              });
            }
          } else {
            blockedAnywhere = blockedAnywhere || search.challenged;
            trace.warn('failure', `Public search could not be used: ${search.reason}`, {});
          }
        }

        // 4. Direct domain probing, which needs no search engine at all.
        if (!website && context.companyName && !outOfTime()) {
          const probed = await probeForOfficialSite(context.companyName, trace);
          if (probed) adoptWebsite(probed.url, 'a direct domain probe');
        }

        if (!website) {
          trace.warn('failure', 'No official website could be confirmed for this business from any available source.', {});
        }
        markRoute(route.id, Date.now() - routeStart, totalAccepted() - before, false, Boolean(website));
        break;
      }

      case 'official_site': {
        if (!website) {
          trace.skip('parse', 'The official website crawl was skipped because no website was confirmed.', {});
          break;
        }
        const prior = domainPrior(normaliseDomain(website) ?? '');
        if (prior && prior.attempts >= 3) {
          trace.info(
            'learning',
            prior.stale
              ? `This domain was seen before, but the learned notes are past their revalidation date, so they are being re-proven rather than trusted.`
              : `This domain has been read ${prior.attempts} time${prior.attempts === 1 ? '' : 's'} before with a ${(prior.successRate * 100).toFixed(0)}% success rate.`,
            { detail: { attempts: prior.attempts, stale: prior.stale } },
          );
        }

        const maxPages = deepScan ? Number(process.env.EXTRACTOR_DEEP_PAGES ?? 7) : Number(process.env.EXTRACTOR_QUICK_PAGES ?? 3);
        const facts = await crawlOfficialSite(website, ledger, trace, maxPages);
        consulted.push(...facts.consulted);
        if (facts.companyName && (!context.companyName || facts.companyName.length > 2)) {
          companyName = facts.companyName;
          companyNameFromSource = true;
        }
        if (facts.description && !description) description = facts.description;
        if (facts.industry && !industry) industry = facts.industry;
        for (const p of facts.productivePatterns) sitePatternsProductive.add(p);
        for (const p of facts.unproductivePatterns) sitePatternsUnproductive.add(p);
        blockedAnywhere = blockedAnywhere || facts.consulted.some((c) => c.blocked);

        const gained = totalAccepted() - before;
        markRoute(route.id, Date.now() - routeStart, gained, facts.consulted.some((c) => c.blocked), facts.pagesRead > 0);

        const domain = normaliseDomain(website);
        if (domain) {
          const counts = ledger.counts();
          recordDomainOutcome({
            domain,
            success: facts.pagesRead > 0,
            blocked: facts.consulted.some((c) => c.blocked),
            latencyMs: Date.now() - routeStart,
            phones: counts.phones,
            emails: counts.emails,
            addresses: counts.addresses,
            owners: counts.owners,
            productivePatterns: [...sitePatternsProductive],
            unproductivePatterns: [...sitePatternsUnproductive],
          });
        }
        break;
      }

      case 'facebook_page': {
        const known = context.url && /facebook\.com/i.test(context.url) ? context.url : undefined;
        if (!known) {
          trace.skip('parse', 'No Facebook business page was supplied or discovered, so that route was skipped.', {});
          markRoute(route.id, Date.now() - routeStart, 0, false, false);
          break;
        }
        const fb = await readFacebookPage(known, ledger, trace);
        consulted.push(fb.consulted);
        if (!website && fb.website) adoptWebsite(fb.website, 'the Facebook page');
        if (!industry && fb.category) industry = fb.category;
        blockedAnywhere = blockedAnywhere || fb.consulted.blocked;
        markRoute(route.id, Date.now() - routeStart, totalAccepted() - before, fb.consulted.blocked, fb.readable);
        break;
      }

      case 'business_registry': {
        // A registry cross-check is only worth the time when something is still
        // missing, or when there is only one source behind what we have.
        if (ledger.hasPhones() && ledger.hasAddress() && !deepScan) {
          trace.skip('plan', 'Public directories were skipped: the official website already supplied a phone number and an address.', {});
          break;
        }
        const outcome = await searchBusinessDirectories(companyName, location, ledger, trace);
        consulted.push(...outcome.consulted);
        if (searchUsable === null) searchUsable = outcome.searchUsable;
        if (!outcome.searchUsable && outcome.note) {
          trace.warn('failure', `Public directories could not be reached: ${outcome.note}`, {});
        }
        blockedAnywhere = blockedAnywhere || outcome.consulted.some((c) => c.blocked) || !outcome.searchUsable;
        markRoute(route.id, Date.now() - routeStart, totalAccepted() - before, !outcome.searchUsable, outcome.consulted.length > 0);
        break;
      }

      case 'people_directory': {
        const person = context.personName;
        if (!person) {
          trace.skip('parse', 'No named owner or principal was present, so the people-directory route was skipped.', {});
          break;
        }
        const outcome = await searchPeopleDirectories(person, location, ledger, trace);
        consulted.push(...outcome.consulted);
        if (outcome.consulted.length > 0) {
          ledger.addOwner(
            person,
            'Named in the request',
            evidenceFor(outcome.consulted[0].url, 'Public people directory', 'search_snippet'),
          );
        }
        if (!outcome.searchUsable && outcome.note) {
          trace.warn('failure', `People directories could not be reached: ${outcome.note}`, {});
        }

        // The people-search sources proper: whole records with every number a
        // person has, each labelled wireless or landline by the source itself.
        const lookup = await lookupPeople({
          personName: person,
          location,
          enabled: options.peopleSearch,
          knownPhones: Object.values(options.preservedFields ?? {})
            .map(String)
            .filter((value) => value.replace(/\D/g, '').length >= 10),
          trace,
        });
        consulted.push(...lookup.consulted);
        people.push(...lookup.people);
        blockedAnywhere = blockedAnywhere || lookup.anyBlocked;

        // Everything a record holds also feeds the merged view, carrying the
        // source's own line-type label with it.
        for (const record of lookup.people) {
          const recordEvidence = evidenceFor(record.sourceUrl, record.sourceLabel, 'text_pattern');
          for (const phone of record.phones) {
            ledger.addPhone(phone.number, recordEvidence, '', {
              publishedLabel: phone.type === 'UNKNOWN' ? undefined : phone.type,
              carrier: phone.carrier,
              recency: phone.recency,
              listedFirst: phone.rank === 1,
            });
          }
          for (const email of record.emails) ledger.addEmail(email.email, recordEvidence);
          if (record.currentAddress) ledger.addAddress(record.currentAddress.full, recordEvidence);
        }

        markRoute(
          route.id,
          Date.now() - routeStart,
          totalAccepted() - before,
          !outcome.searchUsable || lookup.anyBlocked,
          outcome.consulted.length > 0 || lookup.people.length > 0,
        );
        break;
      }

      case 'dns_inspection': {
        // Handled after the loop so it can run against the final website.
        break;
      }

      default:
        break;
    }
  }

  // Mail infrastructure check for the resolved domain.
  let dns: DnsIntelligence | null = null;
  const domain = website ? normaliseDomain(website) : null;
  if (domain) {
    const dnsStart = Date.now();
    trace.info('validation', `Checking whether ${domain} can actually receive mail...`, {});
    dns = await inspectDomainDns(domain);
    if (dns) {
      consulted.push({
        url: `dns://${domain}`,
        label: `DNS records for ${domain}`,
        kind: 'dns',
        ok: true,
        blocked: false,
        fieldsFound: [dns.hasValidMx ? 'mx' : '', dns.hasSpf ? 'spf' : '', dns.hasDmarc ? 'dmarc' : ''].filter(Boolean),
        elapsedMs: Date.now() - dnsStart,
      });
      trace.success(
        'validation',
        dns.hasValidMx
          ? `${domain} publishes working mail records${dns.mailProvider ? ` through ${dns.mailProvider}` : ''}, so email on this domain is plausible.`
          : `${domain} publishes no mail records, so any email on this domain is unlikely to be deliverable.`,
        { detail: { mx: dns.hasValidMx, spf: dns.hasSpf, dmarc: dns.hasDmarc, score: dns.deliverabilityScore } },
      );
      recordRouteOutcome({
        queryType,
        routeId: 'dns_inspection',
        success: dns.hasValidMx,
        blocked: false,
        latencyMs: Date.now() - dnsStart,
        fieldYield: dns.hasValidMx ? 1 : 0,
      });
    }
  }

  /*
   * Carrier data is fetched for the whole set of numbers before the ledger
   * settles, so that "mobile or landline" is answered from the published
   * block allocations rather than left unknown whenever a page happened not to
   * label its numbers — which is nearly always.
   */
  const collectedNumbers = ledger.phoneNumbers();
  if (collectedNumbers.length > 0) {
    const carrierStart = Date.now();
    trace.info('validation', `Looking up who was allocated ${collectedNumbers.length === 1 ? 'this number' : 'these numbers'} to tell mobile from landline...`);
    await prefetchBlockOwners(collectedNumbers);
    const identified = collectedNumbers.filter((number) => blockOwner(number)).length;
    trace.success(
      'validation',
      identified > 0
        ? `The public numbering register named the carrier for ${identified} of ${collectedNumbers.length}.`
        : 'The public numbering register had nothing on these numbers, so line type rests on how the pages presented them.',
      { durationMs: Date.now() - carrierStart },
    );
  }

  const resolved = ledger.resolve(website, dns);

  // Mail checks run once, on the final set, so each domain is looked up a
  // single time however many addresses share it.
  if (resolved.emails.length > 0) {
    const domainFacts = new Map<string, { hasMx?: boolean; hasSpf?: boolean; hasDmarc?: boolean; mxHosts?: string[] }>();
    if (dns) {
      domainFacts.set(dns.domain, {
        hasMx: dns.hasValidMx,
        hasSpf: dns.hasSpf,
        hasDmarc: dns.hasDmarc,
        mxHosts: dns.mxRecords,
      });
    }
    trace.info('validation', `Checking whether ${resolved.emails.length} email address${resolved.emails.length === 1 ? '' : 'es'} can actually receive mail...`, {});
    const verified = await verifyEmails(resolved.emails.map((email) => email.email), domainFacts);
    for (const email of resolved.emails) {
      const verification = verified.get(email.email);
      if (!verification) continue;
      email.verification = verification;
      if (verification.verdict === 'deliverable') email.deliverability = 'high';
      else if (verification.verdict === 'undeliverable') email.deliverability = 'low';
      else if (verification.verdict === 'probably_deliverable') email.deliverability = 'medium';
      email.deliverabilityBasis = verification.basis[verification.basis.length - 1] ?? email.deliverabilityBasis;
    }
    const deliverable = resolved.emails.filter((email) => email.verification.verdict === 'deliverable').length;
    const risky = resolved.emails.filter((email) => ['risky', 'undeliverable'].includes(email.verification.verdict)).length;
    trace.success(
      'validation',
      `Mail checks finished: ${deliverable} confirmed deliverable, ${risky} risky or undeliverable, ${resolved.emails.length - deliverable - risky} could not be proven either way.`,
      { detail: { deliverable, risky } },
    );
  }

  // Narrate the merge, validation, agreement, and selection stages.
  const merged = resolved.phones.filter((p) => p.agreementCount > 1).length + resolved.emails.filter((e) => e.agreementCount > 1).length;
  if (merged > 0) {
    trace.success('merge', `${merged} value${merged === 1 ? ' was' : 's were'} reported by more than one source and merged into a single entry.`, {});
  }
  for (const phone of resolved.phones.slice(0, 3)) {
    if (phone.agreementCount > 1) {
      trace.success('agreement', `The phone number ${phone.formatted} appeared on ${phone.agreementCount} independent sources, so it is ranked first.`, {});
    }
  }
  for (const rejection of resolved.rejected.slice(0, 8)) {
    trace.warn('rejected', `Rejected ${rejection.field} "${rejection.value}": ${rejection.reason}`, {
      url: rejection.sourceUrl,
      detail: { field: rejection.field },
    });
  }

  if (resolved.phones.length > 0) {
    const best = resolved.phones[0];
    trace.success(
      'selection',
      `Selected ${best.formatted} as the primary number. ${best.lineTypeBasis} It was seen on ${best.agreementCount} source${best.agreementCount === 1 ? '' : 's'}.`,
      { detail: { number: best.formatted, type: best.type } },
    );
  }
  if (resolved.emails.length > 0) {
    const best = resolved.emails[0];
    trace.success('selection', `Selected ${best.email} as the primary email. ${best.deliverabilityBasis}`, {
      detail: { email: best.email, deliverability: best.deliverability },
    });
  }
  if (resolved.addresses.length > 0) {
    const best = resolved.addresses[0];
    trace.success(
      'selection',
      best.agreementCount > 1
        ? `Selected "${best.full}" as the address because ${best.agreementCount} sources agreed on it.`
        : `Selected "${best.full}" as the address; only one source reported it.`,
      {},
    );
  }

  // Confidence is assembled from named, checkable contributions.
  const basis: string[] = [];
  let confidence = 0;
  if (website) {
    confidence += 18;
    basis.push('An official website was confirmed (+18).');
  }
  if (resolved.phones.length > 0) {
    const points = Math.min(14 + (resolved.phones[0].agreementCount - 1) * 6, 26);
    confidence += points;
    basis.push(`A valid phone number was found on ${resolved.phones[0].agreementCount} source${resolved.phones[0].agreementCount === 1 ? '' : 's'} (+${points}).`);
  }
  if (resolved.emails.length > 0) {
    const email = resolved.emails[0];
    const points = email.deliverability === 'high' ? 22 : email.deliverability === 'medium' ? 16 : 8;
    confidence += points;
    basis.push(`An email address was found with ${email.deliverability} deliverability (+${points}).`);
  }
  if (resolved.addresses.length > 0) {
    const points = Math.min(8 + (resolved.addresses[0].agreementCount - 1) * 4, 14);
    confidence += points;
    basis.push(`A postal address was found (+${points}).`);
  }
  if (resolved.owner) {
    confidence += 8;
    basis.push('A named owner or principal was found (+8).');
  }
  if (resolved.socials.length > 0) {
    confidence += 4;
    basis.push(`${resolved.socials.length} social profile${resolved.socials.length === 1 ? '' : 's'} were linked from the site (+4).`);
  }
  if (dns?.hasValidMx) {
    confidence += 6;
    basis.push('The domain publishes working mail records (+6).');
  }
  if (blockedAnywhere) {
    confidence = Math.max(0, confidence - 6);
    basis.push('At least one source was blocked or challenged, so the picture may be incomplete (-6).');
  }

  // The most damaging failure is not finding nothing — it is confidently
  // returning the wrong business. When the input named a company and the
  // resolved site belongs to something else, that gap is stated and paid for.
  // Comparing the input against itself proves nothing, so the check only runs
  // once a source has named the business independently.
  // A bare URL or domain requests no particular name, so there is nothing to
  // disagree with and the check is skipped rather than scored.
  const nameAgreement =
    companyNameFromSource && !queryIsAddressOnly ? compareBusinessNames(context.companyName, companyName) : null;
  if (nameAgreement !== null && nameAgreement < 0.5) {
    confidence = Math.max(0, confidence - 25);
    basis.push(
      `The resolved business is named "${companyName}", which does not match the requested "${context.companyName}". This is probably a different entity (-25).`,
    );
    trace.warn(
      'validation',
      `Name check: the request asked for "${context.companyName}" but the resolved source belongs to "${companyName}". Treat this result as unconfirmed.`,
      { detail: { requested: context.companyName ?? '', resolved: companyName, agreement: Number(nameAgreement.toFixed(2)) } },
    );
  } else if (nameAgreement !== null && nameAgreement < 0.8) {
    confidence = Math.max(0, confidence - 15);
    basis.push(
      `The resolved business is named "${companyName}", which only partly matches the requested "${context.companyName}" (-15).`,
    );
    trace.warn(
      'validation',
      `Name check: "${companyName}" only partly matches the requested "${context.companyName}". The contact details below may belong to a related but different organisation.`,
      { detail: { requested: context.companyName ?? '', resolved: companyName, agreement: Number(nameAgreement.toFixed(2)) } },
    );
  } else if (nameAgreement !== null) {
    confidence += 6;
    basis.push('The resolved business name matches the one that was requested (+6).');
  }

  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  // Conflicting evidence is a real state, not a rounding of low confidence.
  const conflictingAddresses = resolved.addresses.length > 1 && resolved.addresses.every((a) => a.agreementCount === 1);
  const conflictingOwner = resolved.rejected.some((r) => r.field === 'owner' && r.reason.includes('already supported'));

  let entityMatchStatus: EntityMatchStatus;
  if (nameAgreement !== null && nameAgreement < 0.5) {
    entityMatchStatus = 'CONFLICTING_EVIDENCE';
  } else if (conflictingOwner || (conflictingAddresses && resolved.addresses.length > 2)) {
    entityMatchStatus = 'CONFLICTING_EVIDENCE';
  } else if (confidence >= 70 && website && (resolved.phones.length > 0 || resolved.emails.length > 0) && (nameAgreement === null || nameAgreement >= 0.8)) {
    entityMatchStatus = 'VERIFIED_MATCH';
  } else if (confidence >= 40) {
    entityMatchStatus = 'PROBABLE_MATCH';
  } else {
    entityMatchStatus = 'INSUFFICIENT_EVIDENCE';
  }

  const hasContact = resolved.phones.length > 0 || resolved.emails.length > 0;
  // A run only counts as partial when it actually obtained something. A website
  // taken from the input but never successfully opened is not a partial result,
  // and reporting it as one would overstate what the run achieved.
  // A DNS lookup answering is not the same as a page having been read, so it
  // does not on its own make a run partially successful.
  const anySourceRead = consulted.some((source) => source.ok && source.kind !== 'dns');
  const status: ExtractionResult['status'] =
    hasContact && confidence >= 50 ? 'success' : totalAccepted() > 0 || (website && anySourceRead) ? 'partial' : 'failed';

  let failureReason: string | undefined;
  if (status === 'failed') {
    if (blockedAnywhere && searchUsable === false) {
      failureReason =
        'No contact details were found. Public search engines answered this network with a bot challenge, and no structured public record matched the business, so there was nothing left to read.';
    } else if (!website) {
      failureReason = 'No official website could be confirmed for this business, and no public register carried a matching record.';
    } else {
      failureReason = 'The official website was read, but it publishes no phone number, email address, or postal address in a machine-readable form.';
    }
    trace.error('failure', failureReason, {});
  }

  const durationMs = Date.now() - startedAt;
  trace.info('timing', `The whole extraction took ${(durationMs / 1000).toFixed(1)} seconds across ${consulted.length} source${consulted.length === 1 ? '' : 's'}.`, {
    detail: { durationMs, sources: consulted.length },
  });
  trace.add(
    'summary',
    status === 'success' ? 'success' : status === 'partial' ? 'warning' : 'error',
    `Finished with ${confidence}% confidence: ${resolved.phones.length} phone${resolved.phones.length === 1 ? '' : 's'}, ${resolved.emails.length} email${resolved.emails.length === 1 ? '' : 's'}, ${resolved.addresses.length} address${resolved.addresses.length === 1 ? '' : 'es'}.`,
    { detail: { status, confidence } },
  );

  stats.total += 1;
  // Diagnostics may only claim end-to-end connectivity once a source has really
  // been read. A run in which every fetch failed proves the opposite.
  if (anySourceRead) stats.provenOnline = true;
  if (status === 'failed') stats.failed += 1;
  else stats.succeeded += 1;
  noteRun();

  const tiersUsed = [...new Set(consulted.map((c) => c.tier).filter((t): t is TransportTier => Boolean(t)))];
  stats.recent.unshift({
    id,
    query,
    queryType,
    status,
    confidence,
    durationMs,
    tiersUsed,
    blocked: blockedAnywhere,
    at: new Date().toISOString(),
  });
  stats.recent = stats.recent.slice(0, 25);

  return {
    id,
    query,
    queryType,
    plan,
    companyName: companyName || (queryIsAddressOnly ? undefined : query),
    website,
    industry,
    description,
    phones: resolved.phones,
    emails: resolved.emails,
    addresses: resolved.addresses,
    socials: resolved.socials,
    owner: resolved.owner,
    people,
    assistant,
    dnsIntelligence: dns ?? undefined,
    route: trace.snapshot(),
    consultedSources: consulted,
    rejected: resolved.rejected,
    confidence,
    confidenceBasis: basis,
    entityMatchStatus,
    status,
    failureReason,
    transportMode: mode,
    availableTiers: tiers,
    durationMs,
    createdAt: new Date().toISOString(),
    preservedFields: options.preservedFields,
    rowId: options.rowId,
  };
}

export async function getDiagnostics(host: EngineDiagnostics['host']): Promise<EngineDiagnostics> {
  const tiers = await tierAvailability();
  const mode = await transportMode();
  const cacheStats = pageCache.stats();
  const browserTiers = tiers.filter((t) => t.tier === 'patchright' || t.tier === 'camoufox');
  const anyBrowser = browserTiers.some((t) => t.available);

  // "online" is only claimed once a real extraction has completed in this
  // process. Before that the honest answer is "starting".
  let status: EngineDiagnostics['status'];
  let statusDetail: string;
  if (!stats.provenOnline) {
    status = 'starting';
    statusDetail = 'The API is reachable, but no extraction has completed on this instance yet, so end-to-end connectivity is not proven.';
  } else if (mode === 'layered_python' && anyBrowser) {
    status = 'online';
    statusDetail = 'Extractions have completed successfully with the full layered transport available.';
  } else {
    status = 'degraded';
    statusDetail =
      'Extractions are completing, but browser escalation tiers are unavailable on this host, so pages that require JavaScript rendering cannot be read.';
  }

  return {
    status,
    statusDetail,
    build: BUILD_NAME,
    version: BUILD_VERSION,
    host,
    transportMode: mode,
    tiers,
    cache: {
      kind: tiers.find((t) => t.tier === 'cache')?.detail.includes('SQLite') ? 'sqlite_transport' : 'in_process',
      available: true,
      detail: tiers.find((t) => t.tier === 'cache')?.detail ?? '',
      entries: cacheStats.entries,
      hits: cacheStats.hits,
      misses: cacheStats.misses,
    },
    totalExtractions: stats.total,
    successfulExtractions: stats.succeeded,
    failedExtractions: stats.failed,
    uptimeSeconds: Math.floor((Date.now() - stats.startedAt) / 1000),
    learning: { ...learningSnapshot(), enabled: learningSnapshot().enabled },
    recentRuns: stats.recent,
  };
}

export function learningIsPersistent(): boolean {
  return learningPersistent();
}

export function resetEngineStats(): void {
  stats.total = 0;
  stats.succeeded = 0;
  stats.failed = 0;
  stats.recent = [];
}

export { planQuery };

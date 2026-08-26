import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { ADDRESS_PATTERN, PHONE_PATTERN, deobfuscate, excerptAround, extractEmails } from '../deobfuscator.js';
import { fetchPage } from '../transport.js';
import type { EvidenceLedger } from '../evidence.js';
import type { RouteTrace } from '../trace.js';
import type { ConsultedSource, Evidence, TransportTier } from '../../src/types.js';

const SUBPAGE_HINTS: Array<{ hint: RegExp; label: string; weight: number }> = [
  { hint: /\bcontact(-?us)?\b/i, label: 'Contact', weight: 10 },
  { hint: /\babout(-?us)?\b/i, label: 'About', weight: 8 },
  { hint: /\b(team|staff|people|leadership|management|our-?team)\b/i, label: 'Team', weight: 7 },
  { hint: /\b(location|locations|stores|branches|find-?us|visit)\b/i, label: 'Locations', weight: 6 },
  { hint: /\b(support|help|customer-?service)\b/i, label: 'Support', weight: 5 },
  { hint: /\b(company|who-?we-?are)\b/i, label: 'Company', weight: 4 },
];

const SKIP_LINK_PATTERN = /\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|css|js|ico|xml|rss)(\?|$)/i;

interface CrawlTarget {
  url: string;
  label: string;
  weight: number;
}

export interface SiteFacts {
  companyName?: string;
  description?: string;
  industry?: string;
  pagesRead: number;
  pagesAttempted: number;
  consulted: ConsultedSource[];
  /** Patterns that produced accepted values, fed back to local learning. */
  productivePatterns: string[];
  unproductivePatterns: string[];
}

function makeEvidence(
  url: string,
  sourceLabel: string,
  method: Evidence['method'],
  tier: TransportTier | undefined,
  excerpt?: string,
): Evidence {
  return { url, sourceLabel, method, tier, excerpt, observedAt: new Date().toISOString() };
}

function readJsonLdBlocks($: CheerioAPI): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).contents().text();
    if (!raw.trim()) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length > 0 && blocks.length < 40) {
        const item = queue.shift();
        if (!item || typeof item !== 'object') continue;
        const record = item as Record<string, unknown>;
        if (Array.isArray(record['@graph'])) queue.push(...(record['@graph'] as unknown[]));
        blocks.push(record);
      }
    } catch {
      /* malformed structured data on a page is common and non-fatal */
    }
  });
  return blocks;
}

function schemaAddressToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  return [record.streetAddress, record.addressLocality, record.addressRegion, record.postalCode]
    .filter((part) => typeof part === 'string' && part.trim())
    .join(', ');
}

function asStringArray(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

/**
 * Reads one page and pushes everything it finds into the shared ledger.
 * Returns the labels of the extraction patterns that actually produced a value,
 * which is what the local learning store records per domain.
 */
function harvestPage(
  html: string,
  pageUrl: string,
  pageLabel: string,
  tier: TransportTier | undefined,
  ledger: EvidenceLedger,
  trace: RouteTrace,
): { fieldsFound: string[]; productive: string[]; unproductive: string[]; title?: string; description?: string; industry?: string; companyName?: string } {
  const $ = cheerio.load(html);
  const fieldsFound = new Set<string>();
  const productive: string[] = [];
  const unproductive: string[] = [];

  const title = $('title').first().text().trim();
  const metaDescription =
    $('meta[name="description"]').attr('content')?.trim() ??
    $('meta[property="og:description"]').attr('content')?.trim();
  const siteName = $('meta[property="og:site_name"]').attr('content')?.trim();

  let companyName = siteName;
  let industry: string | undefined;

  // 1. Structured data is the highest-quality signal on any page.
  const blocks = readJsonLdBlocks($);
  let jsonLdHits = 0;
  for (const block of blocks) {
    const types = asStringArray(block['@type']).join(' ');
    const isOrganisation = /Organization|LocalBusiness|Corporation|Store|Restaurant|ProfessionalService|Dentist|Physician|HomeAndConstructionBusiness/i.test(types);

    if (isOrganisation && typeof block.name === 'string' && !companyName) companyName = block.name.trim();
    if (isOrganisation && typeof block.description === 'string' && !metaDescription) {
      // Preferred over the meta tag only when the meta tag is absent.
    }

    for (const phone of asStringArray(block.telephone)) {
      const verdict = ledger.addPhone(phone, makeEvidence(pageUrl, pageLabel, 'json_ld', tier, `schema.org telephone on ${pageLabel}`), pageLabel);
      if (verdict !== 'rejected') {
        fieldsFound.add('phone');
        jsonLdHits += 1;
      }
    }
    for (const email of asStringArray(block.email)) {
      const verdict = ledger.addEmail(email.replace(/^mailto:/i, ''), makeEvidence(pageUrl, pageLabel, 'json_ld', tier, `schema.org email on ${pageLabel}`));
      if (verdict !== 'rejected') {
        fieldsFound.add('email');
        jsonLdHits += 1;
      }
    }
    const addressText = schemaAddressToString(block.address);
    if (addressText) {
      const verdict = ledger.addAddress(addressText, makeEvidence(pageUrl, pageLabel, 'json_ld', tier, `schema.org address on ${pageLabel}`));
      if (verdict !== 'rejected') {
        fieldsFound.add('address');
        jsonLdHits += 1;
      }
    }
    for (const sameAs of asStringArray(block.sameAs)) {
      if (ledger.addSocial(sameAs, makeEvidence(pageUrl, pageLabel, 'json_ld', tier)) === 'accepted') fieldsFound.add('social');
    }
    const founder = block.founder ?? block.owner;
    if (founder && typeof founder === 'object') {
      const name = (founder as Record<string, unknown>).name;
      if (typeof name === 'string') {
        if (ledger.addOwner(name, 'Founder or owner (from structured data)', makeEvidence(pageUrl, pageLabel, 'json_ld', tier)) === 'accepted') {
          fieldsFound.add('owner');
        }
      }
    }
    if (isOrganisation) {
      const category = block.knowsAbout ?? block.category ?? block.industry;
      const categoryText = asStringArray(category)[0];
      if (categoryText && !industry) industry = categoryText;
    }
  }
  if (jsonLdHits > 0) productive.push('json_ld');
  else if (blocks.length > 0) unproductive.push('json_ld');

  // 2. Explicit tel: and mailto: anchors are unambiguous author intent.
  let anchorHits = 0;
  $('a[href^="tel:"]').each((_, element) => {
    const raw = ($(element).attr('href') ?? '').replace(/^tel:/i, '').trim();
    const context = `${$(element).text()} ${$(element).parent().text()}`.slice(0, 300);
    if (ledger.addPhone(raw, makeEvidence(pageUrl, pageLabel, 'anchor_href', tier, context.replace(/\s+/g, ' ').trim().slice(0, 160)), context) !== 'rejected') {
      fieldsFound.add('phone');
      anchorHits += 1;
    }
  });
  $('a[href^="mailto:"]').each((_, element) => {
    const raw = ($(element).attr('href') ?? '').replace(/^mailto:/i, '').split('?')[0].trim();
    if (ledger.addEmail(raw, makeEvidence(pageUrl, pageLabel, 'anchor_href', tier, `mailto link on ${pageLabel}`)) !== 'rejected') {
      fieldsFound.add('email');
      anchorHits += 1;
    }
  });
  if (anchorHits > 0) productive.push('contact_anchors');

  // 3. Social profile links.
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href')?.trim();
    if (!href || href.startsWith('#')) return;
    let absolute: string;
    try {
      absolute = new URL(href, pageUrl).toString();
    } catch {
      return;
    }
    if (ledger.addSocial(absolute, makeEvidence(pageUrl, pageLabel, 'anchor_href', tier)) === 'accepted') {
      fieldsFound.add('social');
    }
  });

  // 4. Free text, after reversing common contact obfuscation.
  $('script, style, noscript, svg').remove();
  const bodyText = deobfuscate($('body').text().replace(/\s+/g, ' '));
  let textHits = 0;

  for (const match of bodyText.matchAll(PHONE_PATTERN)) {
    const excerpt = excerptAround(bodyText, match.index ?? 0);
    if (ledger.addPhone(match[0], makeEvidence(pageUrl, pageLabel, 'text_pattern', tier, excerpt), excerpt) === 'accepted') {
      fieldsFound.add('phone');
      textHits += 1;
    }
  }
  for (const found of extractEmails(bodyText)) {
    if (ledger.addEmail(found.email, makeEvidence(pageUrl, pageLabel, 'text_pattern', tier, excerptAround(bodyText, found.index))) === 'accepted') {
      fieldsFound.add('email');
      textHits += 1;
    }
  }
  for (const match of bodyText.matchAll(ADDRESS_PATTERN)) {
    if (ledger.addAddress(match[0], makeEvidence(pageUrl, pageLabel, 'text_pattern', tier, excerptAround(bodyText, match.index ?? 0))) === 'accepted') {
      fieldsFound.add('address');
      textHits += 1;
    }
  }
  if (textHits > 0) productive.push('page_text');
  else unproductive.push('page_text');

  if (fieldsFound.size > 0) {
    trace.success(
      'parse',
      `Read ${pageLabel}: found ${[...fieldsFound].join(', ')}.`,
      { url: pageUrl, tier, sourceLabel: pageLabel, detail: { fields: [...fieldsFound].join(', ') } },
    );
  } else {
    trace.info('parse', `Read ${pageLabel}, but it carried no contact details.`, { url: pageUrl, tier, sourceLabel: pageLabel });
  }

  return {
    fieldsFound: [...fieldsFound],
    productive,
    unproductive,
    title,
    description: metaDescription,
    industry,
    companyName: usableSiteName(companyName) ?? usableSiteName(title ? title.split(/[|\u2013\u2014-]/)[0] : undefined),
  };
}


/**
 * Titles that a site builder leaves behind when nobody sets one. Reading these
 * as the business name presents the template's placeholder as a finding.
 */
const PLACEHOLDER_SITE_NAMES =
  /^(?:mysite(?:[\s-]*\d+)?|my[\s-]*site|home|homepage|index|untitled|welcome|new[\s-]*page|website|site|page|default|test|coming[\s-]*soon|under[\s-]*construction|wix[\s-]*site|squarespace|wordpress[\s-]*site|blog)$/i;

function usableSiteName(candidate: string | undefined): string | undefined {
  const cleaned = candidate?.replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length < 2 || cleaned.length > 90) return undefined;
  if (PLACEHOLDER_SITE_NAMES.test(cleaned)) return undefined;
  return cleaned;
}

function discoverSubpages($: CheerioAPI, baseUrl: string, maxPages: number): CrawlTarget[] {
  const baseHost = (() => {
    try {
      return new URL(baseUrl).hostname;
    } catch {
      return '';
    }
  })();
  const seen = new Set<string>([baseUrl.replace(/#.*$/, '')]);
  const targets: CrawlTarget[] = [];

  $('a[href]').each((_, element) => {
    const raw = $(element).attr('href')?.trim();
    if (!raw || raw.startsWith('#') || /^(mailto|tel|javascript|data):/i.test(raw)) return;
    let absolute: string;
    try {
      absolute = new URL(raw, baseUrl).toString().replace(/#.*$/, '');
    } catch {
      return;
    }
    if (SKIP_LINK_PATTERN.test(absolute)) return;
    let host: string;
    try {
      host = new URL(absolute).hostname;
    } catch {
      return;
    }
    if (host !== baseHost || seen.has(absolute)) return;

    const haystack = `${raw} ${$(element).text()}`.toLowerCase();
    const hint = SUBPAGE_HINTS.find((h) => h.hint.test(haystack));
    if (!hint) return;

    seen.add(absolute);
    targets.push({ url: absolute, label: `the ${hint.label} page`, weight: hint.weight });
  });

  return targets.sort((a, b) => b.weight - a.weight).slice(0, Math.max(0, maxPages - 1));
}

/**
 * Keeps the best target per URL and per label.
 *
 * A navigation bar repeats the same link in a header, a footer and a mobile
 * menu under slightly different paths, which produced runs that spent both of
 * their subpage fetches on two versions of the about page while never opening
 * the contact page.
 */
function dedupeTargets(targets: CrawlTarget[]): CrawlTarget[] {
  const byUrl = new Set<string>();
  const byLabel = new Set<string>();
  const kept: CrawlTarget[] = [];

  for (const target of [...targets].sort((a, b) => b.weight - a.weight)) {
    const url = target.url.replace(/\/+$/, '');
    if (byUrl.has(url) || byLabel.has(target.label)) continue;
    byUrl.add(url);
    byLabel.add(target.label);
    kept.push(target);
  }
  return kept;
}

/**
 * Crawls the official website: the homepage first, then the highest-value
 * contact-bearing subpages it links to.
 */
export async function crawlOfficialSite(
  rootUrl: string,
  ledger: EvidenceLedger,
  trace: RouteTrace,
  maxPages: number,
  /**
   * Pages the caller already knows are worth reading, such as the contact page
   * a search engine returned instead of the homepage. Read before anything
   * discovered by following links.
   */
  seedPages: readonly string[] = [],
): Promise<SiteFacts> {
  const consulted: ConsultedSource[] = [];
  const productive = new Set<string>();
  const unproductive = new Set<string>();
  const facts: SiteFacts = {
    pagesRead: 0,
    pagesAttempted: 0,
    consulted,
    productivePatterns: [],
    unproductivePatterns: [],
  };

  trace.info('parse', 'Opening the official website homepage...', { url: rootUrl });
  facts.pagesAttempted += 1;
  const home = await fetchPage(rootUrl, { label: 'the official website homepage', trace, timeoutMs: 10000 });

  consulted.push({
    url: rootUrl,
    label: 'Official website homepage',
    kind: 'official_site',
    tier: home.tier,
    ok: home.ok,
    status: home.status,
    blocked: home.blocked,
    reason: home.reason,
    fieldsFound: [],
    elapsedMs: home.totalMs,
  });

  if (!home.ok || !home.html || !home.url) {
    trace.warn('failure', `The official website could not be read: ${home.reason ?? 'no readable response'}.`, { url: rootUrl });
    facts.productivePatterns = [...productive];
    facts.unproductivePatterns = [...unproductive];
    return facts;
  }

  facts.pagesRead += 1;
  const homeHarvest = harvestPage(home.html, home.url, 'the homepage', home.tier, ledger, trace);
  consulted[0].fieldsFound = homeHarvest.fieldsFound;
  facts.companyName = homeHarvest.companyName;
  facts.description = homeHarvest.description;
  facts.industry = homeHarvest.industry;
  for (const p of homeHarvest.productive) productive.add(p);
  for (const p of homeHarvest.unproductive) unproductive.add(p);

  if (maxPages <= 1) {
    facts.productivePatterns = [...productive];
    facts.unproductivePatterns = [...unproductive];
    return facts;
  }

  const $home = cheerio.load(home.html);
  const seeded: CrawlTarget[] = seedPages
    .map((url) => {
      const hint = SUBPAGE_HINTS.find((h) => h.hint.test(url));
      return { url, label: `the ${hint?.label ?? 'linked contact'} page`, weight: (hint?.weight ?? 9) + 20 };
    })
    .filter((target) => target.url !== home.url);

  const subpages = dedupeTargets([...seeded, ...discoverSubpages($home, home.url, maxPages)]).slice(
    0,
    Math.max(0, maxPages - 1),
  );
  if (subpages.length === 0) {
    trace.info('parse', 'The homepage does not link to a separate contact, about, or team page.', { url: home.url });
  } else {
    trace.info(
      'plan',
      `Queueing ${subpages.length} linked page${subpages.length === 1 ? '' : 's'} that usually carry contact details: ${subpages.map((s) => s.label.replace('the ', '')).join(', ')}.`,
      { url: home.url },
    );
  }

  /*
   * Subpages are fetched together rather than one after another.
   *
   * They are all on the same host and none depends on another's content, so
   * fetching them in sequence only added their latencies together. They are
   * still *harvested* in their original priority order below, so the contact
   * page keeps precedence over the about page regardless of which replies
   * first, and per-domain rate limiting still applies inside fetchPage.
   */
  facts.pagesAttempted += subpages.length;
  const fetched = await Promise.all(
    subpages.map(async (target) => ({ target, page: await fetchPage(target.url, { label: target.label, trace, timeoutMs: 8000 }) })),
  );

  for (const { target, page } of fetched) {
    const record: ConsultedSource = {
      url: target.url,
      label: `Official website ${target.label.replace('the ', '')}`,
      kind: 'official_site',
      tier: page.tier,
      ok: page.ok,
      status: page.status,
      blocked: page.blocked,
      reason: page.reason,
      fieldsFound: [],
      elapsedMs: page.totalMs,
    };
    consulted.push(record);

    if (!page.ok || !page.html || !page.url) {
      trace.warn('parse', `${target.label} could not be read: ${page.reason ?? 'no readable response'}.`, { url: target.url });
      continue;
    }
    facts.pagesRead += 1;
    const harvest = harvestPage(page.html, page.url, target.label, page.tier, ledger, trace);
    record.fieldsFound = harvest.fieldsFound;
    if (!facts.description && harvest.description) facts.description = harvest.description;
    if (!facts.industry && harvest.industry) facts.industry = harvest.industry;
    for (const p of harvest.productive) productive.add(p);
    for (const p of harvest.unproductive) unproductive.add(p);
  }

  facts.productivePatterns = [...productive];
  facts.unproductivePatterns = [...unproductive];
  return facts;
}

export { harvestPage };

export const __testing = { dedupeTargets };

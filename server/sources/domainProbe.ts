import * as cheerio from 'cheerio';
import { fetchPage } from '../transport.js';
import type { RouteTrace } from '../trace.js';

/**
 * Candidate-domain discovery.
 *
 * When public search is unavailable (or challenge-walled), the most reliable
 * way to find a company's own site is to construct the domains a business of
 * that name would plausibly own, open them, and keep only the one whose page
 * actually identifies the business. The verification step is what makes this
 * evidence rather than a guess: a domain is only accepted when the name is
 * present in the page's own title, site name, or structured data.
 */

const LEGAL_SUFFIXES = /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|ltd|limited|plc|llp|lp|pllc|pc)\b\.?/gi;
const STOP_WORDS = new Set(['the', 'and', 'of', 'a', 'an', 'for', 'at', 'in', 'on', '&']);
const TLDS = ['com', 'net', 'co', 'us', 'org', 'biz'];

export interface DomainCandidate {
  domain: string;
  url: string;
}

function slugTokens(companyName: string): string[] {
  return companyName
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .toLowerCase()
    .split(/[\s-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
}

/** Builds the ordered list of domains worth probing for a given business name. */
export function candidateDomains(companyName: string, limit = 8): DomainCandidate[] {
  const tokens = slugTokens(companyName);
  if (tokens.length === 0) return [];

  const bases = new Set<string>();
  bases.add(tokens.join(''));
  if (tokens.length > 1) {
    bases.add(tokens.join('-'));
    bases.add(tokens.slice(0, 2).join(''));
  }
  if (tokens.length === 1) {
    bases.add(`${tokens[0]}inc`);
  }

  const candidates: DomainCandidate[] = [];
  for (const tld of TLDS) {
    for (const base of bases) {
      if (base.length < 3 || base.length > 63) continue;
      const domain = `${base}.${tld}`;
      candidates.push({ domain, url: `https://${domain}/` });
      if (candidates.length >= limit) return candidates;
    }
  }
  return candidates;
}

function pageIdentifiesBusiness(html: string, companyName: string): { matched: boolean; where?: string; title?: string } {
  const $ = cheerio.load(html);
  const title = $('title').first().text().trim();
  const siteName = $('meta[property="og:site_name"]').attr('content')?.trim() ?? '';
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim() ?? '';

  let schemaName = '';
  $('script[type="application/ld+json"]').each((_, element) => {
    if (schemaName) return;
    try {
      const raw = $(element).contents().text();
      const parsed: unknown = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        const record = item as Record<string, unknown>;
        const type = String(record['@type'] ?? '');
        if (/Organization|LocalBusiness|Corporation|Store|Restaurant/i.test(type) && typeof record.name === 'string') {
          schemaName = record.name;
          return;
        }
      }
    } catch {
      /* malformed structured data is ignored */
    }
  });

  const target = slugTokens(companyName).join('');
  if (target.length < 3) return { matched: false, title };

  const checks: Array<[string, string]> = [
    ['structured data', schemaName],
    ['site name', siteName],
    ['page title', title],
    ['social title', ogTitle],
  ];
  for (const [where, value] of checks) {
    if (!value) continue;
    if (slugTokens(value).join('').includes(target) || target.includes(slugTokens(value).join(''))) {
      return { matched: true, where, title: title || value };
    }
  }
  return { matched: false, title };
}

/**
 * Probes candidate domains and returns the first one whose own page identifies
 * the business. Every probe, hit or miss, is written to the route.
 */
export async function probeForOfficialSite(
  companyName: string,
  trace: RouteTrace,
  maxProbes = 5,
): Promise<{ url: string; verifiedBy: string; title?: string } | null> {
  const candidates = candidateDomains(companyName, maxProbes);
  if (candidates.length === 0) return null;

  trace.info(
    'discovery',
    `No website was supplied, so the engine is testing ${candidates.length} likely domain${candidates.length === 1 ? '' : 's'} for "${companyName}".`,
    { detail: { candidates: candidates.map((c) => c.domain).join(', ') } },
  );

  for (const candidate of candidates) {
    const outcome = await fetchPage(candidate.url, {
      label: `the candidate domain ${candidate.domain}`,
      trace,
      timeoutMs: 7000,
    });
    if (!outcome.ok || !outcome.html || !outcome.url) {
      trace.info('discovery', `${candidate.domain} did not serve a readable page, so it was ruled out.`, {
        url: candidate.url,
      });
      continue;
    }

    const verdict = pageIdentifiesBusiness(outcome.html, companyName);
    if (!verdict.matched) {
      trace.warn(
        'rejected',
        `${candidate.domain} loaded but its ${verdict.title ? `title ("${verdict.title.slice(0, 60)}")` : 'content'} does not name "${companyName}", so it was rejected as a different business.`,
        { url: outcome.url },
      );
      continue;
    }

    trace.success(
      'discovery',
      `${candidate.domain} identifies itself as "${companyName}" in its ${verdict.where}, so it is treated as the official website.`,
      { url: outcome.url, detail: { verifiedBy: verdict.where ?? 'page content' } },
    );
    return { url: outcome.url, verifiedBy: verdict.where ?? 'page content', title: verdict.title };
  }

  trace.warn('discovery', `None of the tested domains identified themselves as "${companyName}".`);
  return null;
}

import type { QueryContext } from '../src/types.js';

/**
 * Reading a search box that people type real things into.
 *
 * "Advanced search" here does not mean a form with twelve fields. It means the
 * one box understands what was put in it. People paste a list of links. They
 * write "truepeoplesearch.com John Whitfield 33134" and expect that site to be
 * searched for that person. They mix the two. None of that is exotic, and all
 * of it used to be treated as one undifferentiated string of search terms.
 *
 * So the input is taken apart first:
 *
 *   - anything that is a link becomes a page to open
 *   - anything that names a site, with terms next to it, becomes a search on
 *     that site, built the way that site builds its own search URLs
 *   - whatever is left is the search terms
 *
 * The site-specific builders matter more than they look. Pointing a crawler at
 * a people-search homepage finds nothing; the results live behind a query
 * string with particular parameter names, and getting them right is the
 * difference between a page of results and a page of marketing.
 */

export interface ParsedAdvancedQuery {
  /** Pages to open directly, in the order they were written. */
  urls: string[];
  /** Searches to run on a named site, already built into full URLs. */
  siteSearches: Array<{ site: string; url: string; describes: string }>;
  /** Sites named without enough terms to search them, kept for the audit. */
  unusedSites: string[];
  /** What is left once links and site names are removed. */
  terms: string;
  /** True when the box held more than plain search terms. */
  isAdvanced: boolean;
}

const URL_PATTERN = /\bhttps?:\/\/[^\s,;]+/gi;

/*
 * A bare host typed without a scheme. Deliberately narrow: it requires a known
 * or plausible suffix so that "3.5 acres" and version numbers are not read as
 * web addresses.
 */
const BARE_HOST_PATTERN =
  /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|co|us|gov|edu|info|biz|app|dev|me|ca|uk|au))\b(\/[^\s,;]*)?/gi;

interface SiteBuilder {
  /** Host fragment that selects this builder. */
  host: RegExp;
  label: string;
  /** Builds the search URL, or returns null when the terms are not enough. */
  build: (terms: Terms) => { url: string; describes: string } | null;
}

export interface Terms {
  raw: string;
  name?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
}

const STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN',
  'MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA',
  'WA','WV','WI','WY','DC',
]);

/** Pulls the recognisable pieces out of whatever terms are left over. */
export function readTerms(raw: string): Terms {
  const terms: Terms = { raw: raw.trim() };
  let rest = terms.raw;

  const email = rest.match(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/);
  if (email) {
    terms.email = email[0];
    rest = rest.replace(email[0], ' ');
  }

  const phone = rest.match(/\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/);
  if (phone) {
    terms.phone = phone[0];
    rest = rest.replace(phone[0], ' ');
  }

  const zip = rest.match(/\b\d{5}(?:-\d{4})?\b/);
  if (zip) {
    terms.zip = zip[0].slice(0, 5);
    rest = rest.replace(zip[0], ' ');
  }

  const state = rest.match(/\b([A-Za-z]{2})\b\s*$/) ?? rest.match(/,\s*([A-Za-z]{2})\b/);
  if (state && STATE_CODES.has(state[1].toUpperCase())) {
    terms.state = state[1].toUpperCase();
    rest = rest.replace(state[0], ' ');
  }

  const parts = rest.split(',').map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (parts.length > 1) {
    terms.name = parts[0];
    terms.city = parts[1];
  } else if (parts.length === 1) {
    terms.name = parts[0];
  }

  return terms;
}

function cityStateZip(terms: Terms): string {
  return [terms.city, terms.state].filter(Boolean).join(' ') || terms.zip || '';
}

const SITE_BUILDERS: SiteBuilder[] = [
  {
    host: /truepeoplesearch\.com/i,
    label: 'TruePeopleSearch',
    build: (terms) => {
      if (terms.phone) {
        return {
          url: `https://www.truepeoplesearch.com/resultphone?phoneno=${encodeURIComponent(terms.phone.replace(/\D/g, ''))}`,
          describes: 'a reverse phone lookup',
        };
      }
      if (!terms.name) return null;
      const where = cityStateZip(terms);
      const query = `name=${encodeURIComponent(terms.name)}${where ? `&citystatezip=${encodeURIComponent(where)}` : ''}`;
      return { url: `https://www.truepeoplesearch.com/results?${query}`, describes: 'a people search by name' };
    },
  },
  {
    host: /fastpeoplesearch\.com/i,
    label: 'FastPeopleSearch',
    build: (terms) => {
      if (terms.phone) {
        return {
          url: `https://www.fastpeoplesearch.com/${terms.phone.replace(/\D/g, '')}`,
          describes: 'a reverse phone lookup',
        };
      }
      if (!terms.name) return null;
      const slug = terms.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const where = cityStateZip(terms).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return {
        url: `https://www.fastpeoplesearch.com/name/${slug}${where ? `_${where}` : ''}`,
        describes: 'a people search by name',
      };
    },
  },
  {
    host: /thatsthem\.com/i,
    label: 'ThatsThem',
    build: (terms) => {
      if (terms.phone) {
        return { url: `https://thatsthem.com/phone/${terms.phone.replace(/\D/g, '')}`, describes: 'a reverse phone lookup' };
      }
      if (terms.email) return { url: `https://thatsthem.com/email/${encodeURIComponent(terms.email)}`, describes: 'a reverse email lookup' };
      if (!terms.name) return null;
      const where = cityStateZip(terms);
      return {
        url: `https://thatsthem.com/name/${encodeURIComponent(terms.name.replace(/\s+/g, '-'))}${where ? `/${encodeURIComponent(where.replace(/\s+/g, '-'))}` : ''}`,
        describes: 'a people search by name',
      };
    },
  },
  {
    host: /yellowpages\.com/i,
    label: 'YellowPages',
    build: (terms) => {
      if (!terms.name) return null;
      const where = cityStateZip(terms);
      return {
        url: `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(terms.name)}&geo_location_terms=${encodeURIComponent(where)}`,
        describes: 'a business directory search',
      };
    },
  },
  {
    host: /bizapedia\.com/i,
    label: 'Bizapedia',
    build: (terms) =>
      terms.name
        ? { url: `https://www.bizapedia.com/search.aspx?q=${encodeURIComponent(terms.name)}`, describes: 'a company register search' }
        : null,
  },
  {
    host: /linkedin\.com/i,
    label: 'LinkedIn',
    build: (terms) =>
      terms.name
        ? {
            url: `https://duckduckgo.com/html/?q=${encodeURIComponent(`site:linkedin.com ${terms.name} ${cityStateZip(terms)}`.trim())}`,
            describes: 'a search of LinkedIn through a search engine, because LinkedIn itself refuses direct reads',
          }
        : null,
  },
  {
    host: /facebook\.com/i,
    label: 'Facebook',
    build: (terms) =>
      terms.name
        ? {
            url: `https://duckduckgo.com/html/?q=${encodeURIComponent(`site:facebook.com ${terms.name} ${cityStateZip(terms)}`.trim())}`,
            describes: 'a search of Facebook pages through a search engine',
          }
        : null,
  },
];

/**
 * Any other site named in the box.
 *
 * Without a builder of its own the safest route is a site-scoped search
 * engine query: it works on every site, it finds the right page far more often
 * than guessing a URL pattern would, and it cannot accidentally request
 * something the site did not intend to serve.
 */
function genericSiteSearch(host: string, terms: Terms): { url: string; describes: string } | null {
  const query = terms.name ?? terms.raw;
  if (!query.trim()) return null;
  return {
    url: `https://duckduckgo.com/html/?q=${encodeURIComponent(`site:${host} ${query} ${cityStateZip(terms)}`.trim())}`,
    describes: `a search limited to ${host}`,
  };
}

export function parseAdvancedQuery(input: string): ParsedAdvancedQuery {
  const urls: string[] = [];
  const namedHosts: string[] = [];
  let rest = input;

  for (const match of input.matchAll(URL_PATTERN)) {
    urls.push(match[0].replace(/[),.]+$/, ''));
    rest = rest.replace(match[0], ' ');
  }

  for (const match of rest.matchAll(BARE_HOST_PATTERN)) {
    const [whole, host, pathPart] = match;
    if (pathPart && pathPart.length > 1) {
      // A host with a path is a link somebody left the scheme off.
      urls.push(`https://${host}${pathPart}`);
    } else {
      namedHosts.push(host.toLowerCase());
    }
    rest = rest.replace(whole, ' ');
  }

  const terms = readTerms(rest.replace(/\s+/g, ' ').trim());
  const siteSearches: ParsedAdvancedQuery['siteSearches'] = [];
  const unusedSites: string[] = [];

  for (const host of namedHosts) {
    const builder = SITE_BUILDERS.find((candidate) => candidate.host.test(host));
    const built = builder ? builder.build(terms) : genericSiteSearch(host, terms);
    if (built) siteSearches.push({ site: builder?.label ?? host, ...built });
    else unusedSites.push(host);
  }

  return {
    urls,
    siteSearches,
    unusedSites,
    terms: terms.raw,
    isAdvanced: urls.length + siteSearches.length + unusedSites.length > 0,
  };
}

/** Fills a run's context from the terms, so saved sources can use them too. */
export function contextFromTerms(query: string, terms: Terms, domain?: string): QueryContext {
  return {
    query,
    companyName: terms.name,
    personName: terms.name,
    city: terms.city,
    state: terms.state,
    zip: terms.zip,
    domain,
    phone: terms.phone,
    email: terms.email,
  };
}

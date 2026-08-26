import { routePrior } from './learning.js';
import { redactSensitiveText } from '../src/lib/sensitive.js';
import type { PlannedRoute, QueryPlan, QueryType } from '../src/types.js';

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

const STATE_NAME_TO_CODE = new Map(
  Object.entries(US_STATES).map(([code, name]) => [name.toLowerCase(), code]),
);

const ROLE_WORDS = /\b(owner|proprietor|ceo|c\.e\.o|president|founder|co-founder|principal|partner|director|manager|managing member)\b/i;

const COMPANY_SUFFIX =
  /\b(llc|l\.l\.c|inc|inc\.|incorporated|corp|corp\.|corporation|co\.|company|ltd|limited|plc|llp|lp|pllc|pc|group|holdings|enterprises|services|solutions|associates|partners|industries|systems|technologies)\b/i;

const NATURAL_LANGUAGE_START = /^(find|search|look ?up|who is|who owns|get|show|tell me|extract|research|locate|identify)\b/i;

const EMAIL_ONLY = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_ONLY = /^\+?1?[\s.()-]*\(?\d{3}\)?[\s.()-]*\d{3}[\s.()-]*\d{4}$/;
const BARE_DOMAIN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/i;
const STREET_SUFFIX =
  /\b(street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|court|ct|circle|cir|parkway|pkwy|highway|hwy|route|rte|way|terrace|ter|place|pl|suite|ste|unit|apt)\b\.?/i;

export interface InferredContext {
  companyName?: string;
  personName?: string;
  city?: string;
  state?: string;
  zip?: string;
  domain?: string;
  phone?: string;
  email?: string;
  url?: string;
}

function titleCaseLooking(token: string): boolean {
  return /^[A-Z][a-z'’-]{1,}$/.test(token);
}

/** Extracts a person name only when the input actually signals one. */
function findPersonName(input: string): string | undefined {
  const roleMatch = input.match(
    /(?:owner|proprietor|ceo|president|founder|principal|partner|director|manager|contact)\s*(?:is|:|-|–)?\s+((?:[A-Z][a-zA-Z'’-]+\s+){1,2}[A-Z][a-zA-Z'’-]+)/,
  );
  if (roleMatch) return roleMatch[1].trim();

  const reverseMatch = input.match(
    /((?:[A-Z][a-zA-Z'’-]+\s+){1,2}[A-Z][a-zA-Z'’-]+)[,\s]+(?:is\s+the\s+)?(?:owner|proprietor|ceo|president|founder|principal|partner|director|manager)\b/,
  );
  if (reverseMatch) return reverseMatch[1].trim();

  const whoIs = input.match(/^who\s+(?:is|owns)\s+((?:[A-Z][a-zA-Z'’-]+\s+){1,2}[A-Z][a-zA-Z'’-]+)/i);
  if (whoIs) return whoIs[1].trim();

  return undefined;
}

function findLocation(input: string): { city?: string; state?: string; zip?: string } {
  const out: { city?: string; state?: string; zip?: string } = {};

  const zip = input.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zip) out.zip = zip[1];

  // "City, ST" is the strongest signal and also gives us the city.
  const cityState = input.match(/([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){0,2})\s*,\s*([A-Z]{2})\b/);
  if (cityState && US_STATES[cityState[2].toUpperCase()]) {
    out.city = cityState[1].trim();
    out.state = cityState[2].toUpperCase();
    return out;
  }

  const spelledState = [...STATE_NAME_TO_CODE.keys()].find((name) =>
    new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(input),
  );
  if (spelledState) {
    out.state = STATE_NAME_TO_CODE.get(spelledState);
    const before = input.match(new RegExp(`([A-Z][A-Za-z.'’-]+)\\s*,?\\s*${spelledState}`, 'i'));
    if (before && !STATE_NAME_TO_CODE.has(before[1].toLowerCase())) out.city = before[1];
    return out;
  }

  // "Company, City ST" is extremely common in lead sheets and typed queries. The
  // comma is what separates the city from the trading name, so the city is only
  // taken when one is present.
  const commaCityState = input.match(/,\s*([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){0,2})\s+([A-Z]{2})(?:[\s,.]|$)/);
  if (commaCityState && US_STATES[commaCityState[2].toUpperCase()]) {
    out.city = commaCityState[1].trim();
    out.state = commaCityState[2].toUpperCase();
    return out;
  }

  const bareState = input.match(/(?:^|[\s,])([A-Z]{2})(?:[\s,.]|$)/);
  if (bareState && US_STATES[bareState[1].toUpperCase()]) {
    out.state = bareState[1].toUpperCase();
  }
  return out;
}

/** Strips location, role words, and contact tokens to leave the entity name. */
function findCompanyName(input: string, context: InferredContext): string | undefined {
  let text = input;
  if (context.email) text = text.replace(context.email, ' ');
  if (context.phone) text = text.replace(context.phone, ' ');
  if (context.url) text = text.replace(context.url, ' ');
  if (context.personName) text = text.replace(context.personName, ' ');
  if (context.zip) text = text.replace(new RegExp(`\\b${context.zip}(?:-\\d{4})?\\b`), ' ');
  if (context.city) text = text.replace(new RegExp(`\\b${context.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), ' ');
  if (context.state) {
    text = text.replace(new RegExp(`\\b${context.state}\\b`), ' ');
    const spelled = US_STATES[context.state];
    if (spelled) text = text.replace(new RegExp(`\\b${spelled}\\b`, 'i'), ' ');
  }

  text = text
    .replace(NATURAL_LANGUAGE_START, ' ')
    .replace(ROLE_WORDS, ' ')
    .replace(/\b(?:at|for|in|of|the|a|an|and|please|info|information|contact|details|phone|number|email|address|website)\b/gi, ' ')
    .replace(/[,;:|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length < 2) return undefined;
  // Prefer the capitalised run, which is almost always the trading name.
  const tokens = text.split(' ');
  const capitalRun: string[] = [];
  for (const token of tokens) {
    if (titleCaseLooking(token) || /^[A-Z0-9&.'-]{2,}$/.test(token) || COMPANY_SUFFIX.test(token)) {
      capitalRun.push(token);
    } else if (capitalRun.length > 0) {
      break;
    }
  }
  const candidate = (capitalRun.length >= 1 ? capitalRun.join(' ') : text).trim();
  return candidate.length >= 2 ? candidate : undefined;
}

export function inferContext(rawInput: string): InferredContext {
  const input = rawInput.trim().replace(/\s+/g, ' ');
  const context: InferredContext = {};

  const urlMatch = input.match(/https?:\/\/[^\s"'<>]+/i);
  if (urlMatch) {
    context.url = urlMatch[0];
    try {
      context.domain = new URL(urlMatch[0]).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      /* an unparseable URL simply yields no domain */
    }
  }

  const emailMatch = input.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    context.email = emailMatch[0].toLowerCase();
    if (!context.domain) context.domain = context.email.split('@')[1];
  }

  const phoneMatch = input.match(/\+?1?[\s.()-]*\(?\d{3}\)?[\s.()-]*\d{3}[\s.()-]*\d{4}/);
  if (phoneMatch && !context.email) context.phone = phoneMatch[0].trim();

  if (!context.domain && !context.url) {
    const bare = input.split(/\s+/).find((token) => BARE_DOMAIN.test(token) && !token.includes('@'));
    if (bare) context.domain = bare.toLowerCase().replace(/^www\./, '');
  }

  const location = findLocation(input);
  Object.assign(context, location);

  context.personName = findPersonName(input);
  context.companyName = findCompanyName(input, context);

  return context;
}

export function detectQueryType(rawInput: string, context: InferredContext): QueryType {
  const input = rawInput.trim();

  if (context.url && /facebook\.com\//i.test(context.url)) return 'facebook_page';
  if (context.url) return 'url_direct';
  if (BARE_DOMAIN.test(input) && !input.includes(' ')) return 'domain_direct';
  if (EMAIL_ONLY.test(input)) return 'email_first';
  if (PHONE_ONLY.test(input)) return 'phone_first';
  if (context.personName && context.companyName) return 'person_and_company';
  if (ROLE_WORDS.test(input)) return 'owner_first';
  if (/^\d{1,6}\s/.test(input) && STREET_SUFFIX.test(input)) return 'address_first';
  if (NATURAL_LANGUAGE_START.test(input) || input.split(/\s+/).length > 12) return 'natural_language_prompt';
  if (context.city || context.state || context.zip) return 'location_constrained';
  return 'company_search';
}

export const ROUTE_CATALOGUE: Array<{
  id: string;
  label: string;
  purpose: string;
  /** Base order before learned performance is applied. */
  baseOrder: number;
  appliesTo: (type: QueryType, context: InferredContext) => boolean;
}> = [
  {
    id: 'direct_site',
    label: 'Open the supplied website directly',
    purpose: 'Read the page the operator supplied instead of guessing at one.',
    baseOrder: 1,
    appliesTo: (_type, context) => Boolean(context.url ?? context.domain),
  },
  {
    id: 'search_discovery',
    label: 'Find the official website through public search',
    purpose: 'Locate the business homepage when no website was supplied.',
    baseOrder: 2,
    appliesTo: (_type, context) => !context.url && !context.domain,
  },
  {
    id: 'official_site',
    label: 'Crawl the official website and its contact pages',
    purpose: 'Read Contact, About, Team, and Locations pages for first-party contact details.',
    baseOrder: 3,
    appliesTo: () => true,
  },
  {
    id: 'facebook_page',
    label: 'Read the public Facebook business page',
    purpose: 'Collect the publicly listed phone, email, website, and address from the page header.',
    baseOrder: 4,
    appliesTo: (type) => type !== 'phone_first',
  },
  {
    id: 'business_registry',
    label: 'Check public business directories',
    purpose: 'Cross-check the listing against public directory records.',
    baseOrder: 5,
    appliesTo: (_type, context) => Boolean(context.companyName ?? context.domain),
  },
  {
    id: 'people_directory',
    label: 'Look for the named owner or principal',
    purpose: 'Attach a decision-maker name when the input or the site names one.',
    baseOrder: 6,
    appliesTo: (type, context) =>
      Boolean(context.personName) || type === 'owner_first' || type === 'person_and_company',
  },
  {
    id: 'dns_inspection',
    label: 'Inspect the mail infrastructure of the resolved domain',
    purpose: 'Confirm the domain can actually receive mail before scoring an email as deliverable.',
    baseOrder: 7,
    appliesTo: () => true,
  },
];

/**
 * Builds the ordered plan. Routes keep their functional order (you cannot crawl
 * a site before discovering it), but within the same stage the locally learned
 * success rate promotes reliable routes and demotes ones that have repeatedly
 * produced nothing for this query type.
 */
export function planQuery(rawInput: string): QueryPlan {
  // Planning is also reachable directly from the API, so the redaction gate is
  // applied here rather than only on the extraction path. A protected
  // identifier must not survive into a plan, a note, or a log line.
  const normalizedInput = redactSensitiveText(rawInput.trim().replace(/\s+/g, ' '));
  const inferredContext = inferContext(normalizedInput);
  const queryType = detectQueryType(normalizedInput, inferredContext);
  const notes: string[] = [];

  const applicable = ROUTE_CATALOGUE.filter((route) => route.appliesTo(queryType, inferredContext));

  const scored = applicable.map((route) => {
    const prior = routePrior(queryType, route.id);
    // Learned adjustment is deliberately small and bounded: it reorders peers,
    // it never removes a route or fabricates a result.
    let adjustment = 0;
    if (prior && prior.sampleSize >= 3) {
      adjustment = -(prior.successRate - 0.5) * 0.8;
      if (prior.repeatedlyUseless) adjustment += 1.5;
    }
    return { route, prior, effectiveOrder: route.baseOrder + adjustment };
  });

  scored.sort((a, b) => a.effectiveOrder - b.effectiveOrder || a.route.baseOrder - b.route.baseOrder);

  const routes: PlannedRoute[] = scored.map((entry, index) => {
    const deprioritised = entry.prior?.repeatedlyUseless ?? false;
    return {
      id: entry.route.id,
      label: entry.route.label,
      purpose: entry.route.purpose,
      order: index + 1,
      learnedSuccessRate: entry.prior ? Number((entry.prior.successRate * 100).toFixed(1)) : undefined,
      learnedSampleSize: entry.prior?.sampleSize,
      enabled: true,
      skipReason: deprioritised
        ? 'Kept last: this route has produced nothing on the previous attempts for this query type.'
        : undefined,
    };
  });

  if (inferredContext.companyName) notes.push(`Business name read from the input: ${inferredContext.companyName}.`);
  if (inferredContext.personName) notes.push(`Person name read from the input: ${inferredContext.personName}.`);
  if (inferredContext.city || inferredContext.state) {
    notes.push(`Location read from the input: ${[inferredContext.city, inferredContext.state].filter(Boolean).join(', ')}.`);
  }
  if (inferredContext.domain) notes.push(`Domain read from the input: ${inferredContext.domain}.`);
  if (notes.length === 0) notes.push('No extra context was present in the input, so the plan relies on public search.');

  return {
    originalInput: normalizedInput,
    normalizedInput,
    queryType,
    inferredContext,
    routes,
    notes,
  };
}

export const QUERY_TYPE_LABELS: Record<QueryType, string> = {
  domain_direct: 'Domain',
  url_direct: 'Web address',
  facebook_page: 'Facebook business page',
  phone_first: 'Phone number',
  email_first: 'Email address',
  person_and_company: 'Person and company',
  owner_first: 'Owner or principal',
  location_constrained: 'Company with location',
  address_first: 'Street address',
  natural_language_prompt: 'Research prompt',
  company_search: 'Company name',
};

export { US_STATES };

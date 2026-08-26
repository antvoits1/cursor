import { fetchPage } from '../transport.js';
import type { RouteTrace } from '../trace.js';

/**
 * Wikidata / DuckDuckGo Instant Answer lookup.
 *
 * Both are documented public APIs rather than scraped result pages, so they
 * keep working when a SERP serves a bot challenge. Wikidata's P856 property is
 * the entity's declared official website, which is a far stronger signal than
 * picking the first search result.
 */

export interface EntityFacts {
  entityId?: string;
  label?: string;
  description?: string;
  officialWebsite?: string;
  industry?: string;
  sourceUrl: string;
}

interface WbSearchResponse {
  search?: Array<{ id: string; label?: string; description?: string }>;
}

interface WbEntitiesResponse {
  entities?: Record<
    string,
    {
      labels?: Record<string, { value: string }>;
      descriptions?: Record<string, { value: string }>;
      claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>;
    }
  >;
}

function firstStringClaim(
  claims: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>> | undefined,
  property: string,
): string | undefined {
  const entries = claims?.[property];
  if (!entries) return undefined;
  for (const entry of entries) {
    const value = entry.mainsnak?.datavalue?.value;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

async function fetchJson<T>(url: string, label: string, trace: RouteTrace): Promise<T | null> {
  const outcome = await fetchPage(url, { label, trace, timeoutMs: 10000 });
  if (!outcome.ok || !outcome.html) return null;
  try {
    return JSON.parse(outcome.html) as T;
  } catch {
    return null;
  }
}

/** Resolves a company name to its Wikidata entity and declared official website. */
export async function lookupEntityFacts(name: string, trace: RouteTrace): Promise<EntityFacts | null> {
  const cleaned = name.trim();
  if (cleaned.length < 3) return null;

  trace.info('discovery', `Checking the Wikidata public knowledge base for "${cleaned}"...`, { sourceLabel: 'Wikidata' });

  const searchUrl =
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&type=item&limit=3&language=en&format=json&origin=*` +
    `&search=${encodeURIComponent(cleaned)}`;
  const search = await fetchJson<WbSearchResponse>(searchUrl, 'the Wikidata search endpoint', trace);
  const candidate = search?.search?.[0];
  if (!candidate) {
    trace.info('discovery', `Wikidata has no entry for "${cleaned}".`, { sourceLabel: 'Wikidata' });
    return null;
  }

  const entityUrl =
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=labels|descriptions|claims` +
    `&languages=en&ids=${encodeURIComponent(candidate.id)}`;
  const entities = await fetchJson<WbEntitiesResponse>(entityUrl, 'the Wikidata entity record', trace);
  const entity = entities?.entities?.[candidate.id];
  if (!entity) return null;

  const officialWebsite = firstStringClaim(entity.claims, 'P856');
  const facts: EntityFacts = {
    entityId: candidate.id,
    label: entity.labels?.en?.value ?? candidate.label,
    description: entity.descriptions?.en?.value ?? candidate.description,
    officialWebsite,
    sourceUrl: `https://www.wikidata.org/wiki/${candidate.id}`,
  };

  if (officialWebsite) {
    trace.success('discovery', `Wikidata lists ${officialWebsite} as the declared official website for ${facts.label}.`, {
      sourceLabel: 'Wikidata',
      url: facts.sourceUrl,
    });
  } else {
    trace.info('discovery', `Wikidata has an entry for ${facts.label} but does not declare an official website.`, {
      sourceLabel: 'Wikidata',
      url: facts.sourceUrl,
    });
  }
  return facts;
}

interface InstantAnswer {
  AbstractURL?: string;
  AbstractText?: string;
  Heading?: string;
}

/** DuckDuckGo's documented Instant Answer API, used when Wikidata search misses. */
export async function lookupInstantAnswer(query: string, trace: RouteTrace): Promise<{ heading?: string; abstract?: string; url?: string } | null> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const data = await fetchJson<InstantAnswer>(url, 'the DuckDuckGo Instant Answer service', trace);
  if (!data?.Heading) return null;
  trace.success('discovery', `The DuckDuckGo knowledge service recognises "${data.Heading}".`, {
    sourceLabel: 'DuckDuckGo Instant Answer',
  });
  return { heading: data.Heading, abstract: data.AbstractText, url: data.AbstractURL };
}

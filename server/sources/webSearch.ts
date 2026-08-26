import * as cheerio from 'cheerio';
import { fetchPage } from '../transport.js';
import type { RouteTrace } from '../trace.js';

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  engine: string;
}

export interface SearchOutcome {
  hits: SearchHit[];
  /** True when at least one engine returned parseable results. */
  ok: boolean;
  /** Plain-language explanation when nothing usable came back. */
  reason?: string;
  challenged: boolean;
  enginesTried: string[];
}

interface Engine {
  name: string;
  url: (query: string) => string;
  parse: (body: string) => SearchHit[];
  /** Environment variable that must be set for this engine to be usable. */
  requiresKey?: string;
  headers?: () => Record<string, string>;
}

function unwrapDuckDuckGoLink(href: string): string {
  if (!href) return '';
  try {
    const absolute = href.startsWith('//') ? `https:${href}` : href;
    const parsed = new URL(absolute, 'https://duckduckgo.com');
    const target = parsed.searchParams.get('uddg');
    if (target) return decodeURIComponent(target);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

const ENGINES: Engine[] = [
  {
    name: 'DuckDuckGo',
    url: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
    parse: (html) => {
      const $ = cheerio.load(html);
      const hits: SearchHit[] = [];
      $('.result, .web-result').each((_, element) => {
        const anchor = $(element).find('a.result__a, .result__title a').first();
        const url = unwrapDuckDuckGoLink(anchor.attr('href') ?? '');
        if (!url || !/^https?:\/\//i.test(url)) return;
        hits.push({
          title: anchor.text().trim(),
          url,
          snippet: $(element).find('.result__snippet').text().trim(),
          engine: 'DuckDuckGo',
        });
      });
      return hits;
    },
  },
  {
    name: 'DuckDuckGo Lite',
    url: (q) => `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`,
    parse: (html) => {
      const $ = cheerio.load(html);
      const hits: SearchHit[] = [];
      $('a.result-link').each((_, element) => {
        const url = unwrapDuckDuckGoLink($(element).attr('href') ?? '');
        if (!url || !/^https?:\/\//i.test(url)) return;
        hits.push({ title: $(element).text().trim(), url, snippet: '', engine: 'DuckDuckGo Lite' });
      });
      return hits;
    },
  },
  {
    name: 'Mojeek',
    url: (q) => `https://www.mojeek.com/search?q=${encodeURIComponent(q)}`,
    parse: (html) => {
      const $ = cheerio.load(html);
      const hits: SearchHit[] = [];
      $('ul.results-standard li, .results li').each((_, element) => {
        const anchor = $(element).find('a.title, h2 a').first();
        const href = anchor.attr('href') ?? '';
        if (!/^https?:\/\//i.test(href)) return;
        hits.push({
          title: anchor.text().trim(),
          url: href,
          snippet: $(element).find('p.s, .s').text().trim(),
          engine: 'Mojeek',
        });
      });
      return hits;
    },
  },
  {
    // Brave runs its own index and its free tier is generous, but it needs a
    // key. Where one exists it is by far the most reliable of these, because it
    // is an API rather than a page being scraped, so datacenter addresses are
    // expected rather than challenged.
    name: 'Brave Search',
    url: (q) => `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10`,
    requiresKey: 'BRAVE_SEARCH_API_KEY',
    headers: () => ({
      'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY ?? '',
      Accept: 'application/json',
    }),
    parse: (body) => {
      try {
        const parsed = JSON.parse(body) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
        return (parsed.web?.results ?? [])
          .filter((hit) => hit.url && /^https?:\/\//i.test(hit.url))
          .map((hit) => ({
            title: hit.title ?? '',
            url: hit.url as string,
            snippet: hit.description ?? '',
            engine: 'Brave Search',
          }));
      } catch {
        return [];
      }
    },
  },
  {
    // Public SearXNG instances aggregate several engines and generally do not
    // challenge datacenter addresses, which makes them the most useful
    // no-key fallback when the scraped engines all refuse.
    name: 'SearXNG (searx.be)',
    url: (q) => `https://searx.be/search?q=${encodeURIComponent(q)}&format=json`,
    parse: parseSearxng('SearXNG (searx.be)'),
  },
  {
    name: 'SearXNG (priv.au)',
    url: (q) => `https://priv.au/search?q=${encodeURIComponent(q)}&format=json`,
    parse: parseSearxng('SearXNG (priv.au)'),
  },
  {
    name: 'Startpage',
    url: (q) => `https://www.startpage.com/sp/search?query=${encodeURIComponent(q)}`,
    parse: (html) => {
      const $ = cheerio.load(html);
      const hits: SearchHit[] = [];
      $('.w-gl__result, .result').each((_, element) => {
        const anchor = $(element).find('a.w-gl__result-title, a.result-link, h3 a').first();
        const href = anchor.attr('href') ?? '';
        if (!/^https?:\/\//i.test(href)) return;
        hits.push({
          title: anchor.text().trim(),
          url: href,
          snippet: $(element).find('.w-gl__description, .description').text().trim(),
          engine: 'Startpage',
        });
      });
      return hits;
    },
  },
];

/** SearXNG instances all answer with the same JSON shape. */
function parseSearxng(engineName: string) {
  return (body: string): SearchHit[] => {
    try {
      const parsed = JSON.parse(body) as { results?: Array<{ title?: string; url?: string; content?: string }> };
      return (parsed.results ?? [])
        .filter((hit) => hit.url && /^https?:\/\//i.test(hit.url))
        .map((hit) => ({
          title: hit.title ?? '',
          url: hit.url as string,
          snippet: hit.content ?? '',
          engine: engineName,
        }));
    } catch {
      return [];
    }
  };
}

/**
 * Queries public search engines in order and stops at the first one that
 * returns parseable results.
 *
 * Search engines routinely serve an anti-bot challenge instead of results when
 * the request comes from a datacenter address. When that happens the engine
 * records it truthfully and moves on — it never pretends a challenge page was a
 * result set, and it never invents hits.
 */
export async function searchWeb(query: string, trace: RouteTrace, limit = 8): Promise<SearchOutcome> {
  const enginesTried: string[] = [];
  let challenged = false;
  let lastReason: string | undefined;

  for (const engine of ENGINES) {
    if (engine.requiresKey && !process.env[engine.requiresKey]?.trim()) continue;
    enginesTried.push(engine.name);
    trace.info('discovery', `Searching ${engine.name} for "${query}"...`, { sourceLabel: engine.name });

    const outcome = await fetchPage(engine.url(query), {
      label: `the ${engine.name} results page`,
      trace,
      headers: engine.headers?.(),
      timeoutMs: 9000,
    });

    if (!outcome.ok || !outcome.html) {
      if (outcome.blocked) {
        challenged = true;
        trace.warn('challenge', `${engine.name} answered with a bot challenge instead of results, so no hits were taken from it.`, {
          sourceLabel: engine.name,
        });
      } else {
        trace.warn('discovery', `${engine.name} did not return results: ${outcome.reason ?? 'unknown reason'}.`, {
          sourceLabel: engine.name,
        });
      }
      lastReason = outcome.reason;
      continue;
    }

    const hits = engine.parse(outcome.html).slice(0, limit);
    if (hits.length === 0) {
      // A 200 response with no parseable results is almost always a challenge
      // or an interstitial; say so rather than reporting an empty search.
      challenged = true;
      trace.warn('challenge', `${engine.name} returned a page with no readable results, which usually means a bot check. Moving to the next source.`, {
        sourceLabel: engine.name,
      });
      lastReason = `${engine.name} returned no readable results.`;
      continue;
    }

    trace.success('discovery', `${engine.name} returned ${hits.length} result${hits.length === 1 ? '' : 's'}.`, {
      sourceLabel: engine.name,
      detail: { hits: hits.length },
    });
    return { hits, ok: true, challenged, enginesTried };
  }

  return {
    hits: [],
    ok: false,
    challenged,
    enginesTried,
    reason: challenged
      ? 'Every public search engine answered with a bot challenge from this network, so web search could not be used.'
      : (lastReason ?? 'No public search engine returned results.'),
  };
}

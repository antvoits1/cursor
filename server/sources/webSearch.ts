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
  parse: (html: string) => SearchHit[];
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
];

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
    enginesTried.push(engine.name);
    trace.info('discovery', `Searching ${engine.name} for "${query}"...`, { sourceLabel: engine.name });

    const outcome = await fetchPage(engine.url(query), {
      label: `the ${engine.name} results page`,
      trace,
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

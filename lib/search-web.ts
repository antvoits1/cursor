import * as cheerio from "cheerio";
import { extractLabeledAndContacts } from "./fields";
import type { ScrapedPage, SearchHit } from "./types";
import { fetchHtml, isPublicHttpUrl, unwrapSearchUrl } from "./web";

export type { ScrapedPage, SearchHit } from "./types";

function tidy(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function decodeHits(hits: SearchHit[]) {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const hit of hits) {
    const url = unwrapSearchUrl(hit.url);
    if (!url.startsWith("http") || !isPublicHttpUrl(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ ...hit, url, title: tidy(hit.title), snippet: tidy(hit.snippet) });
  }
  return out;
}

export async function searchDuckDuckGo(query: string): Promise<SearchHit[]> {
  const html = await fetchHtml(
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
    10000,
  );
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];
  $("a.result-link").each((_, el) => {
    const a = $(el);
    const href = a.attr("href") || "";
    const snippet = a.closest("tr").nextAll("tr").find("td.result-snippet").first().text();
    hits.push({
      title: a.text(),
      url: href,
      snippet,
      source: "duckduckgo",
    });
  });
  return decodeHits(hits);
}

export async function searchBing(query: string): Promise<SearchHit[]> {
  const html = await fetchHtml(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en-US`,
    10000,
  );
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];
  $("li.b_algo").each((_, el) => {
    const a = $(el).find("h2 a").first();
    hits.push({
      title: a.text(),
      url: a.attr("href") || "",
      snippet: $(el).find("p").first().text(),
      source: "bing",
    });
  });
  return decodeHits(hits);
}

export async function searchWikipedia(query: string) {
  const api = new URL("https://en.wikipedia.org/w/api.php");
  api.searchParams.set("action", "query");
  api.searchParams.set("list", "search");
  api.searchParams.set("srsearch", query);
  api.searchParams.set("utf8", "1");
  api.searchParams.set("format", "json");
  const json = JSON.parse(await fetchHtml(api.toString(), 8000));
  const first = json?.query?.search?.[0];
  if (!first?.title) return null;
  const title = String(first.title);
  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const summary = JSON.parse(await fetchHtml(summaryUrl, 8000));
    return {
      title: summary.title || title,
      url: summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      extract: String(summary.extract || first.snippet || "").replace(/<[^>]+>/g, ""),
      description: String(summary.description || ""),
    };
  } catch {
    return {
      title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      extract: String(first.snippet || "").replace(/<[^>]+>/g, ""),
      description: "",
    };
  }
}

export async function searchInstant(query: string) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const data = JSON.parse(await fetchHtml(url, 8000));
  const related = Array.isArray(data.RelatedTopics)
    ? data.RelatedTopics.flatMap((item: { Text?: string; FirstURL?: string; Topics?: { Text?: string; FirstURL?: string }[] }) =>
        item.Topics || [item],
      )
        .filter((item: { Text?: string; FirstURL?: string }) => item.Text && item.FirstURL)
        .slice(0, 8)
        .map((item: { Text: string; FirstURL: string }) => ({
          text: item.Text,
          url: item.FirstURL,
        }))
    : [];
  return {
    heading: String(data.Heading || ""),
    abstract: String(data.Abstract || ""),
    abstractUrl: String(data.AbstractURL || ""),
    answer: String(data.Answer || ""),
    related,
  };
}

export async function scrapePage(hit: SearchHit): Promise<ScrapedPage> {
  try {
    const html = await fetchHtml(hit.url, 8000);
    const $ = cheerio.load(html);
    $("script, style, noscript, svg, iframe, nav, footer, form").remove();
    const title =
      tidy($("meta[property='og:title']").attr("content") || $("title").first().text() || hit.title);
    const description = tidy(
      $("meta[name='description']").attr("content") ||
        $("meta[property='og:description']").attr("content") ||
        hit.snippet,
    );
    const headings = $("h1, h2, h3")
      .map((_, el) => tidy($(el).text()))
      .get()
      .filter(Boolean)
      .slice(0, 12);
    const text = tidy($("p, article, li").text()).slice(0, 6000);
    const fields = extractLabeledAndContacts(`${title}\n${description}\n${headings.join("\n")}\n${text}`);
    return {
      ...hit,
      title: title || hit.title,
      description,
      headings,
      text,
      fields,
    };
  } catch (error) {
    return {
      ...hit,
      description: hit.snippet,
      headings: [],
      text: "",
      fields: [],
      error: error instanceof Error ? error.message : "Could not open this page",
    };
  }
}

export async function searchTheWeb(query: string) {
  const [ddg, bing, wiki, instant] = await Promise.allSettled([
    searchDuckDuckGo(query),
    searchBing(query),
    searchWikipedia(query),
    searchInstant(query),
  ]);

  const ddgHits = ddg.status === "fulfilled" ? ddg.value : [];
  const bingHits = bing.status === "fulfilled" ? bing.value : [];
  const hits = decodeHits([...ddgHits, ...bingHits]).slice(0, 10);

  return {
    hits,
    wiki: wiki.status === "fulfilled" ? wiki.value : null,
    instant: instant.status === "fulfilled" ? instant.value : null,
    errors: {
      duckduckgo: ddg.status === "rejected" ? String(ddg.reason) : null,
      bing: bing.status === "rejected" ? String(bing.reason) : null,
    },
  };
}

import { extractContacts, extractFields } from "./fields";
import { searchBing, searchDuckDuckGo, scrapePage, searchWikipedia } from "./search-web";
import type { ScrapedPage, SearchHit } from "./types";
import { emptyDossier, parseQuery, sseEvent, type Dossier } from "./dossier";
import { isPublicHttpUrl } from "./web";

const ROLE_RE =
  /\b(ceo|cfo|coo|cto|owner|founder|co-founder|president|director|partner|principal|manager|officer)\b/i;
const NAME_RE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){1,3})\b/g;
const ADDRESS_RE =
  /\b\d{1,6}\s+[A-Za-z0-9.'\- ]{3,40}\s(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Highway|Hwy)\.?(?:\s*,?\s*[A-Za-z .]+,?\s*[A-Z]{2}\s*\d{5})?/gi;
const SOCIAL_HOSTS = ["linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com"];

function sourceRef(label: string, url: string) {
  let domain = "";
  try {
    domain = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    domain = "";
  }
  return { label, url, domain };
}

function mergeUnique(
  target: Record<string, unknown>[],
  incoming: Record<string, unknown>[],
  key: string,
) {
  const seen = new Set(target.map((row) => String(row[key] || "").toLowerCase()));
  for (const row of incoming) {
    const value = String(row[key] || "").toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    target.push(row);
  }
}

function peopleFromText(text: string, label: string, url: string) {
  const people: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const lines = text.split(/[.|\n]/).slice(0, 80);
  for (const line of lines) {
    if (!ROLE_RE.test(line)) continue;
    const names = [...line.matchAll(NAME_RE)].map((m) => m[1]);
    for (const name of names) {
      const key = name.toLowerCase();
      if (seen.has(key) || name.split(" ").length < 2) continue;
      if (/Street|Avenue|Company|Inc|Llc|Ltd|Search|Google|Privacy/i.test(name)) continue;
      seen.add(key);
      const role = line.match(ROLE_RE)?.[0] || "Contact";
      people.push({
        name,
        role,
        roles: [role],
        corporate_relationship: role,
        direct_phones: [],
        direct_emails: [],
        associated_addresses: [],
        relatives_and_associates: [],
        evidence_sources: [sourceRef(label, url)],
      });
      if (people.length >= 8) return people;
    }
  }
  return people;
}

function applyPage(dossier: Dossier, page: ScrapedPage) {
  const req = dossier.audit.requests;
  req.attempted += 1;
  req.completed += 1;
  if (page.error) {
    req.failed += 1;
    return;
  }
  req.successful += 1;
  const src = sourceRef(page.title || page.source, page.url);
  if (!dossier.sources.some((s) => s.url === page.url)) dossier.sources.push(src);

  const { emails, phones } = extractContacts(`${page.description}\n${page.text}`);
  mergeUnique(
    dossier.entity.emails,
    emails.map((email) => ({
      email,
      domain_match: dossier.entity.official_domain
        ? email.toLowerCase().endsWith(`@${dossier.entity.official_domain}`)
        : false,
      mx_status: "unknown",
      smtp_status: "unverified",
      sources: [src],
    })),
    "email",
  );
  mergeUnique(
    dossier.entity.phones,
    phones.map((number) => ({
      number,
      digits: number.replace(/\D/g, ""),
      line_type: "unknown",
      carrier: "",
      sources: [src],
    })),
    "number",
  );
  const addresses = page.text.match(ADDRESS_RE) || [];
  mergeUnique(
    dossier.entity.addresses,
    addresses.slice(0, 6).map((address) => ({ address, sources: [src] })),
    "address",
  );

  try {
    const host = new URL(page.url).hostname.replace(/^www\./, "");
    if (SOCIAL_HOSTS.some((s) => host.includes(s))) {
      if (!dossier.entity.socials.some((s) => s.url === page.url)) {
        dossier.entity.socials.push({ label: host, url: page.url });
      }
    }
  } catch {
    /* ignore */
  }

  for (const person of peopleFromText(`${page.headings.join(". ")}\n${page.text}`, src.label, page.url)) {
    const name = String(person.name || "").toLowerCase();
    if (!dossier.people.some((p) => String(p.name || "").toLowerCase() === name)) {
      dossier.people.push(person);
    }
  }

  const fields = extractFields(page.text, 12);
  for (const field of fields) {
    const key = field.key.toLowerCase().replace(/\s+/g, "_");
    if (!dossier.entity.metadata[key]) dossier.entity.metadata[key] = field.value;
  }
}

export async function* runResearch(rawQuery: string): AsyncGenerator<string> {
  const started = Date.now();
  const parsed = parseQuery(rawQuery);
  const dossier = emptyDossier(parsed.raw, parsed.company_name, parsed.domain);
  if (parsed.email) {
    dossier.entity.emails.push({
      email: parsed.email,
      domain_match: true,
      mx_status: "unknown",
      smtp_status: "unverified",
      sources: [sourceRef("User Query", "")],
    });
  }
  if (parsed.phone) {
    dossier.entity.phones.push({
      number: parsed.phone,
      digits: parsed.phone.replace(/\D/g, ""),
      line_type: "unknown",
      carrier: "",
      sources: [sourceRef("User Query", "")],
    });
  }

  yield sseEvent("START", `Research started for ${parsed.company_name}.`, { cache_key: dossier.cache_key });

  const hits: SearchHit[] = [];
  try {
    yield sseEvent("ROUTE", "Searching the public web…");
    const [ddg, bing, wiki] = await Promise.allSettled([
      searchDuckDuckGo(parsed.raw),
      searchBing(parsed.raw),
      searchWikipedia(parsed.raw),
    ]);
    if (ddg.status === "fulfilled") hits.push(...ddg.value);
    if (bing.status === "fulfilled") hits.push(...bing.value);
    if (wiki.status === "fulfilled" && wiki.value) {
      dossier.entity.metadata.wikipedia = wiki.value.extract;
      dossier.sources.push(sourceRef("Wikipedia", wiki.value.url));
    }
  } catch (error) {
    yield sseEvent("SOURCE_FAILED", error instanceof Error ? error.message : "Search failed");
  }

  const uniqueHits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (!isPublicHttpUrl(hit.url) || seen.has(hit.url)) continue;
    seen.add(hit.url);
    uniqueHits.push(hit);
  }

  if (parsed.domain) {
    uniqueHits.unshift({
      title: parsed.company_name,
      url: `https://${parsed.domain}`,
      snippet: "Official website",
      source: "wikipedia",
    });
  }

  const targets = uniqueHits.slice(0, 8);
  yield sseEvent("ROUTE", `Scraping ${targets.length} public pages…`);

  const pages = await Promise.all(targets.map((hit) => scrapePage(hit)));
  for (const page of pages) {
    applyPage(dossier, page);
    if (page.error) {
      yield sseEvent("SOURCE_FAILED", `${page.title || page.url}: ${page.error}`, { url: page.url });
    } else {
      yield sseEvent("SOURCE_COMPLETED", `${page.title || page.url} responded.`, {
        source: page.title,
        url: page.url,
      });
    }
  }

  if (!dossier.entity.official_website && uniqueHits[0]) {
    dossier.entity.official_website = uniqueHits[0].url;
    try {
      dossier.entity.official_domain = new URL(uniqueHits[0].url).hostname.replace(/^www\./, "");
    } catch {
      /* ignore */
    }
  }

  dossier.audit.completed_at = new Date().toISOString();
  dossier.audit.elapsed_seconds = Number(((Date.now() - started) / 1000).toFixed(2));
  yield sseEvent("COMPLETE", "Research completed.", dossier);
}

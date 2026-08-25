export type Dossier = {
  schema_version: number;
  engine_version: string;
  cache_key: string;
  query: string;
  entity: {
    name: string;
    state: string;
    official_domain: string;
    official_website: string;
    phones: Record<string, unknown>[];
    emails: Record<string, unknown>[];
    addresses: Record<string, unknown>[];
    socials: Record<string, unknown>[];
    metadata: Record<string, unknown>;
  };
  people: Record<string, unknown>[];
  relationships: unknown[];
  sources: { label: string; url: string; domain?: string }[];
  snapshots: unknown[];
  audit: {
    started_at: string;
    completed_at: string;
    elapsed_seconds: number;
    snapshot_requests: { attempted: number; captured: number; failed: number };
    requests: {
      attempted: number;
      completed: number;
      successful: number;
      failed: number;
      blocked: number;
      challenged: number;
      rate_limited: number;
    };
  };
  ui_state?: { lastQuery: string };
};

export const ENGINE_VERSION = "2026.08.21-phase2-windows";

export function isoNow() {
  return new Date().toISOString();
}

export function sseEvent(type: string, message: string, data: unknown = {}) {
  return `data: ${JSON.stringify({ timestamp: isoNow(), type, message, data })}\n\n`;
}

export function parseQuery(raw: string) {
  const query = raw.trim();
  if (!query) throw new Error("Query cannot be empty");
  const email = query.match(/[A-Za-z0-9_.+\-]+@(?:[A-Za-z0-9\-]+\.)+[A-Za-z]{2,63}/i)?.[0]?.toLowerCase() || "";
  const urlMatch = query.match(/https?:\/\/[^\s]+/i)?.[0] || "";
  const domainFromEmail = email ? email.split("@")[1] : "";
  const domainFromUrl = urlMatch ? new URL(urlMatch).hostname.replace(/^www\./, "") : "";
  const domainMatch = query.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i);
  const domain = domainFromEmail || domainFromUrl || (domainMatch && !email.includes(domainMatch[0]) ? domainMatch[0].toLowerCase() : "");
  const phone = (query.match(/\+?\d[\d\s().-]{8,}\d/) || [])[0] || "";
  const company = query
    .replace(email, " ")
    .replace(urlMatch, " ")
    .replace(phone, " ")
    .replace(/\s+/g, " ")
    .trim() || domain || query;
  return { raw: query, company_name: company, domain, email, phone, url: urlMatch };
}

export function emptyDossier(query: string, company: string, domain: string): Dossier {
  return {
    schema_version: 2,
    engine_version: ENGINE_VERSION,
    cache_key: Buffer.from(`${query}:${Date.now()}`).toString("base64url").slice(0, 32),
    query,
    entity: {
      name: company,
      state: "",
      official_domain: domain,
      official_website: domain ? `https://${domain}` : "",
      phones: [],
      emails: [],
      addresses: [],
      socials: [],
      metadata: {},
    },
    people: [],
    relationships: [],
    sources: [],
    snapshots: [],
    audit: {
      started_at: isoNow(),
      completed_at: "",
      elapsed_seconds: 0,
      snapshot_requests: { attempted: 0, captured: 0, failed: 0 },
      requests: {
        attempted: 0,
        completed: 0,
        successful: 0,
        failed: 0,
        blocked: 0,
        challenged: 0,
        rate_limited: 0,
      },
    },
    ui_state: { lastQuery: query },
  };
}

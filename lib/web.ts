const PRIVATE_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

export function unwrapSearchUrl(href: string): string {
  try {
    const url = new URL(href, "https://duckduckgo.com");
    const duck = url.searchParams.get("uddg");
    if (duck) return duck;

    const bing = url.searchParams.get("u");
    if (bing?.startsWith("a1")) {
      return Buffer.from(bing.slice(2), "base64").toString("utf8");
    }
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    /* ignore */
  }
  return href;
}

export function isPublicHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (PRIVATE_HOSTS.has(host)) return false;
    if (host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (host === "metadata.google.internal") return false;

    if (/^127\./.test(host) || host === "::1") return false;
    if (/^10\./.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    if (/^169\.254\./.test(host)) return false;
    const parts = host.split(".").map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isInteger(n))) {
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
    }
    return Boolean(host);
  } catch {
    return false;
  }
}

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export async function fetchHtml(url: string, timeoutMs = 8000, maxBytes = 900_000) {
  if (!isPublicHttpUrl(url)) {
    throw new Error("Blocked URL");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": BROWSER_UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const type = response.headers.get("content-type") || "";
    if (type && !/html|xml|text|json/i.test(type)) {
      throw new Error("Not a text page");
    }
    const buffer = await response.arrayBuffer();
    const slice = buffer.byteLength > maxBytes ? buffer.slice(0, maxBytes) : buffer;
    return new TextDecoder("utf-8", { fatal: false }).decode(slice);
  } finally {
    clearTimeout(timer);
  }
}

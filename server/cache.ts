import crypto from 'node:crypto';

export interface CachedPage {
  finalUrl: string;
  html: string;
  tier: string;
  status?: number;
  storedAt: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  evictions: number;
}

/**
 * In-process page cache used by the Node HTTP transport tier.
 *
 * The layered Python transport keeps its own durable SQLite cache; this cache
 * exists so the Node-only deployment (for example a serverless function, where
 * no Python worker or browser runtime exists) still gets cache hits within a
 * warm instance. It is deliberately advertised as `in_process` in diagnostics
 * so nobody mistakes it for durable storage.
 */
export class PageCache {
  private readonly store = new Map<string, CachedPage>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(
    private readonly ttlMs: number = Number(process.env.EXTRACTOR_CACHE_TTL_SECONDS ?? 900) * 1000,
    private readonly maxEntries: number = Number(process.env.EXTRACTOR_CACHE_MAX_ENTRIES ?? 300),
  ) {}

  /**
   * Cache keys are isolated per URL and per proxy route. The proxy string is
   * hashed so credentials can never appear in a key, a log, or diagnostics.
   */
  static key(url: string, proxy: string): string {
    const proxyToken = proxy ? crypto.createHash('sha256').update(proxy).digest('hex').slice(0, 16) : 'direct';
    return crypto.createHash('sha256').update(`${url}\n${proxyToken}`).digest('hex');
  }

  get(url: string, proxy: string): CachedPage | null {
    const key = PageCache.key(url, proxy);
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (Date.now() - entry.storedAt > this.ttlMs) {
      this.store.delete(key);
      this.misses += 1;
      return null;
    }
    // Refresh recency for LRU ordering.
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits += 1;
    return entry;
  }

  set(url: string, proxy: string, page: Omit<CachedPage, 'storedAt'>): void {
    const key = PageCache.key(url, proxy);
    this.store.set(key, { ...page, storedAt: Date.now() });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
      this.evictions += 1;
    }
  }

  clear(): void {
    this.store.clear();
  }

  stats(): CacheStats {
    return { hits: this.hits, misses: this.misses, entries: this.store.size, evictions: this.evictions };
  }
}

export const pageCache = new PageCache();

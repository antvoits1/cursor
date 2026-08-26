import { pageCache } from './cache.js';
import { nodeFetchPage } from './nodeTransport.js';
import { boundedTimeout } from './runDeadline.js';
import { assessUrl } from './ssrfGuard.js';
import { ensureWorker, fetchViaWorker, workerState } from './transportClient.js';
import type { RouteTrace } from './trace.js';
import type {
  TierAvailability,
  TransportAttempt,
  TransportMode,
  TransportOutcome,
  TransportTier,
} from '../src/types.js';

function proxyUrl(): string {
  return process.env.EXTRACTOR_PROXY_URL?.trim() ?? '';
}

/** A proxy label safe to show in diagnostics: never includes credentials. */
export function proxyLabel(): string {
  const raw = proxyUrl();
  if (!raw) return 'direct (no proxy configured)';
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || '(default port)'}`;
  } catch {
    return 'configured (unparseable value withheld)';
  }
}

const humanTier: Record<TransportTier, string> = {
  cache: 'local cache',
  curl_cffi: 'fast static fetch',
  patchright: 'browser rendering',
  camoufox: 'hardened browser rendering',
  node_http: 'built-in HTTP fetch',
};

export function tierLabel(tier: TransportTier): string {
  return humanTier[tier] ?? tier;
}

export async function transportMode(): Promise<TransportMode> {
  const ready = await ensureWorker();
  return ready ? 'layered_python' : 'node_http_only';
}

export async function tierAvailability(): Promise<TierAvailability[]> {
  await ensureWorker();
  const state = workerState();
  const workerDetail =
    state.kind === 'ready'
      ? null
      : state.kind === 'disabled' || state.kind === 'unavailable'
        ? state.detail
        : 'The Python transport worker has not reported readiness.';

  const caps = state.kind === 'ready' ? state.capabilities : null;
  const cacheKind = caps?.sqlite_cache
    ? 'Durable SQLite page cache inside the Python worker.'
    : 'In-process page cache only; entries are lost when this process restarts.';

  return [
    { tier: 'cache', available: true, detail: cacheKind },
    {
      tier: 'curl_cffi',
      available: Boolean(caps?.curl_cffi),
      detail: caps?.curl_cffi ? 'curl_cffi is installed and impersonating a real browser TLS profile.' : (workerDetail ?? 'curl_cffi is not installed.'),
    },
    {
      tier: 'patchright',
      available: Boolean(caps?.patchright),
      detail: caps?.patchright ? 'Patchright browser runtime is installed.' : (workerDetail ?? 'Patchright is not installed.'),
    },
    {
      tier: 'camoufox',
      available: Boolean(caps?.camoufox),
      detail: caps?.camoufox ? 'Camoufox browser runtime is installed.' : (workerDetail ?? 'Camoufox is not installed.'),
    },
    {
      tier: 'node_http',
      available: true,
      detail: 'Built-in Node HTTP client. Always available; reads server-rendered pages only.',
    },
  ];
}

export async function availableTiers(): Promise<TransportTier[]> {
  return (await tierAvailability()).filter((t) => t.available).map((t) => t.tier);
}

function describeAttempt(attempt: TransportAttempt): string {
  const label = tierLabel(attempt.tier);
  if (attempt.ok) return `The ${label} tier returned a readable page.`;
  if (attempt.challenge) return `The ${label} tier hit a ${attempt.challenge}; this source is protected and was not solved.`;
  if (attempt.blocked) return `The ${label} tier was blocked${attempt.status ? ` with HTTP ${attempt.status}` : ''}.`;
  if (attempt.timedOut) return `The ${label} tier timed out.`;
  if (attempt.dynamicShell) return `The ${label} tier only received a JavaScript shell with no readable content.`;
  return `The ${label} tier did not return usable content${attempt.reason ? `: ${attempt.reason}` : '.'}`;
}

/** Turns one transport attempt into the matching plain-language route line. */
function traceAttempt(trace: RouteTrace, attempt: TransportAttempt, url: string): void {
  const detail: Record<string, string | number | boolean> = { tier: attempt.tier };
  if (attempt.status !== undefined) detail.httpStatus = attempt.status;
  if (attempt.redirects) detail.redirects = attempt.redirects;
  if (attempt.elapsedMs !== undefined) detail.elapsedMs = attempt.elapsedMs;
  if (attempt.reason) detail.reason = attempt.reason;

  const options = { tier: attempt.tier, url, durationMs: attempt.elapsedMs, detail };

  if (attempt.ok) {
    trace.success('transport', describeAttempt(attempt), options);
    return;
  }
  if (attempt.challenge) {
    trace.warn('challenge', describeAttempt(attempt), options);
    return;
  }
  if (attempt.blocked) {
    trace.warn('http_block', describeAttempt(attempt), options);
    return;
  }
  if (attempt.timedOut) {
    trace.warn('timeout', describeAttempt(attempt), options);
    return;
  }
  if (attempt.dynamicShell) {
    trace.warn('js_shell', describeAttempt(attempt), options);
    return;
  }
  if (attempt.redirects && attempt.redirects > 0) {
    trace.warn('redirect', describeAttempt(attempt), options);
    return;
  }
  trace.warn('network_error', describeAttempt(attempt), options);
}

export interface FetchOptions {
  timeoutMs?: number;
  /** Short label used in the route, e.g. "official website homepage". */
  label: string;
  trace: RouteTrace;
  /** Extra request headers, for endpoints that need a key or a JSON Accept. */
  headers?: Record<string, string>;
}

/**
 * Layered page fetch: cache, then the Python tiers (curl_cffi to Patchright to
 * Camoufox), then the built-in Node HTTP client.
 *
 * Every transition is written to the run trace in plain language, so the
 * operator can see exactly which tier produced the page and why the earlier
 * tiers were abandoned.
 */
export async function fetchPage(targetUrl: string, options: FetchOptions): Promise<TransportOutcome> {
  const { trace, label } = options;
  const requestedTimeout = options.timeoutMs ?? Number(process.env.EXTRACTOR_FETCH_TIMEOUT_MS ?? 9000);
  const started = Date.now();
  const attempts: TransportAttempt[] = [];
  const proxy = proxyUrl();

  const safety = await assessUrl(targetUrl);
  if (!safety.safe) {
    trace.error('failure', `Refused to open ${label}: ${safety.reason}`, { url: targetUrl });
    return {
      ok: false,
      fromCache: false,
      blocked: false,
      reason: safety.reason,
      attempts,
      totalMs: Date.now() - started,
    };
  }

  // A hard offline switch, applied after the safety assessment so that a
  // refused target is still reported as refused. The test suite uses it to keep
  // runs hermetic rather than dependent on any third party being reachable.
  if (process.env.EXTRACTOR_OFFLINE === '1') {
    trace.error('failure', `Skipped ${label}: outbound requests are switched off for this run.`, { url: targetUrl });
    return {
      ok: false,
      fromCache: false,
      blocked: false,
      reason: 'Outbound requests are switched off for this run.',
      attempts,
      totalMs: Date.now() - started,
    };
  }

  trace.info('cache', `Checking the local cache for ${label}...`, { url: targetUrl, tier: 'cache' });
  const cached = pageCache.get(targetUrl, proxy);
  if (cached) {
    trace.success('cache', `Cache hit — reusing the copy of ${label} fetched by the ${tierLabel(cached.tier as TransportTier)} tier.`, {
      url: targetUrl,
      tier: 'cache',
      detail: { originalTier: cached.tier, ageSeconds: Math.round((Date.now() - cached.storedAt) / 1000) },
    });
    return {
      ok: true,
      url: cached.finalUrl,
      html: cached.html,
      tier: 'cache',
      status: cached.status,
      fromCache: true,
      blocked: false,
      attempts: [{ tier: 'cache', ok: true }],
      totalMs: Date.now() - started,
    };
  }
  trace.info('cache', `Cache miss for ${label}; a live fetch is required.`, { url: targetUrl, tier: 'cache' });

  /*
   * The run's remaining time caps this request.
   *
   * The check sits below the cache lookup on purpose: a cached page costs
   * nothing and is worth serving even when the budget is spent. A live request
   * is not, so once there is no time left the fetch is declined rather than
   * started, and the reason says so instead of appearing as a timeout.
   */
  const timeoutMs = boundedTimeout(requestedTimeout);
  if (timeoutMs === null) {
    trace.warn('timeout', `Skipped ${label}: the run's time budget was spent before this request could start.`, {
      url: targetUrl,
    });
    return {
      ok: false,
      fromCache: false,
      blocked: false,
      reason: "The run's time budget was spent before this request could start.",
      attempts,
      totalMs: Date.now() - started,
    };
  }

  const worker = await fetchViaWorker(targetUrl, timeoutMs, proxy);
  if (worker.workerAvailable) {
    for (const attempt of worker.attempts) {
      attempts.push(attempt);
      traceAttempt(trace, attempt, targetUrl);
    }
    if (worker.ok && worker.html && worker.url) {
      if (!worker.fromCache) {
        pageCache.set(targetUrl, proxy, {
          finalUrl: worker.url,
          html: worker.html,
          tier: worker.tier ?? 'curl_cffi',
          status: worker.status,
        });
      }
      return {
        ok: true,
        url: worker.url,
        html: worker.html,
        tier: worker.tier ?? 'curl_cffi',
        status: worker.status,
        fromCache: worker.fromCache,
        blocked: false,
        attempts,
        totalMs: Date.now() - started,
      };
    }
    trace.info('escalation', `The layered browser tiers could not read ${label}; trying the built-in HTTP fetch as a last step.`, {
      url: targetUrl,
    });
  } else {
    trace.skip('escalation', `Browser escalation tiers are not available on this host, so ${label} is read with the built-in HTTP fetch. ${worker.reason ?? ''}`.trim(), {
      url: targetUrl,
      detail: { reason: worker.reason ?? 'unavailable' },
    });
  }

  /*
   * Re-bound before the fallback rather than reusing the budget computed at the
   * top of this function.
   *
   * The worker tiers may have just spent the rest of the run. Reusing the
   * original figure meant a request that had already exhausted a thirty-second
   * budget started a fresh fifteen-second attempt on top of it, so the run
   * finished at fifty-five seconds having reported the budget as spent
   * twenty-five seconds earlier.
   */
  const fallbackTimeout = boundedTimeout(requestedTimeout);
  if (fallbackTimeout === null) {
    trace.warn('timeout', `Gave up on ${label}: the run's time budget was spent by the earlier tiers.`, { url: targetUrl });
    return {
      ok: false,
      fromCache: false,
      blocked: attempts.some((attempt) => attempt.blocked),
      reason: "The run's time budget was spent before this page could be read.",
      attempts,
      totalMs: Date.now() - started,
    };
  }

  const native = await nodeFetchPage(targetUrl, fallbackTimeout, options.headers);
  attempts.push(native.attempt);
  traceAttempt(trace, native.attempt, targetUrl);

  if (native.ok && native.html && native.finalUrl) {
    pageCache.set(targetUrl, proxy, {
      finalUrl: native.finalUrl,
      html: native.html,
      tier: 'node_http',
      status: native.status,
    });
    return {
      ok: true,
      url: native.finalUrl,
      html: native.html,
      tier: 'node_http',
      status: native.status,
      fromCache: false,
      blocked: false,
      attempts,
      totalMs: Date.now() - started,
    };
  }

  const blocked = attempts.some((a) => a.blocked);
  const reason =
    [...attempts].reverse().find((a) => a.reason)?.reason ?? 'No transport tier could read this page.';
  return {
    ok: false,
    fromCache: false,
    blocked,
    reason,
    attempts,
    totalMs: Date.now() - started,
  };
}

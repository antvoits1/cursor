import { classifyContent } from './blockClassifier.js';
import { assessUrl } from './ssrfGuard.js';
import type { TransportAttempt } from '../src/types.js';

const USER_AGENT =
  process.env.EXTRACTOR_USER_AGENT ??
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = Number(process.env.EXTRACTOR_MAX_BODY_BYTES ?? 4_000_000);

export interface NodeFetchResult {
  ok: boolean;
  finalUrl?: string;
  html?: string;
  status?: number;
  blocked: boolean;
  attempt: TransportAttempt;
}

const lastRequestByHost = new Map<string, number>();
const hostQueue = new Map<string, Promise<void>>();

function domainDelayMs(): number {
  return Math.max(0, Number(process.env.EXTRACTOR_DOMAIN_DELAY_SECONDS ?? 0.4) * 1000);
}

/**
 * Serialises requests per host and enforces a minimum gap between them so the
 * engine stays a polite client rather than a burst source.
 */
async function throttleHost(host: string): Promise<void> {
  const previous = hostQueue.get(host) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  hostQueue.set(host, previous.then(() => current));

  await previous;
  const gap = domainDelayMs();
  const since = Date.now() - (lastRequestByHost.get(host) ?? 0);
  if (since < gap) {
    await new Promise((r) => setTimeout(r, gap - since));
  }
  lastRequestByHost.set(host, Date.now());
  // The lock is released on the next macrotask so the caller's request starts first.
  setTimeout(release, 0);
}

async function readCappedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared && declared > MAX_BODY_BYTES) {
    return (await response.text()).slice(0, MAX_BODY_BYTES);
  }
  const text = await response.text();
  return text.length > MAX_BODY_BYTES ? text.slice(0, MAX_BODY_BYTES) : text;
}

async function singleAttempt(
  targetUrl: string,
  timeoutMs: number,
  extraHeaders?: Record<string, string>,
): Promise<NodeFetchResult & { redirects: number }> {
  const started = Date.now();
  let current = targetUrl;
  let redirects = 0;

  for (; redirects <= MAX_REDIRECTS; redirects += 1) {
    // Every hop is re-validated: a safe first URL can still redirect inward.
    const verdict = await assessUrl(current);
    if (!verdict.safe) {
      return {
        ok: false,
        blocked: false,
        redirects,
        attempt: {
          tier: 'node_http',
          ok: false,
          redirects,
          reason: verdict.reason ?? 'Blocked by network safety policy.',
          elapsedMs: Date.now() - started,
        },
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(current, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          // Caller-supplied headers last, so an API key or a JSON Accept can
          // override the browser-shaped defaults.
          ...extraHeaders,
        },
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut = controller.signal.aborted;
      return {
        ok: false,
        blocked: false,
        redirects,
        attempt: {
          tier: 'node_http',
          ok: false,
          redirects,
          timedOut,
          reason: timedOut
            ? `The request timed out after ${timeoutMs} ms.`
            : `Network error: ${(error as Error).name}.`,
          elapsedMs: Date.now() - started,
        },
      };
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return {
          ok: false,
          blocked: false,
          redirects,
          attempt: {
            tier: 'node_http',
            ok: false,
            status: response.status,
            redirects,
            reason: `Received HTTP ${response.status} without a redirect target.`,
            elapsedMs: Date.now() - started,
          },
        };
      }
      try {
        current = new URL(location, current).toString();
      } catch {
        return {
          ok: false,
          blocked: false,
          redirects,
          attempt: {
            tier: 'node_http',
            ok: false,
            status: response.status,
            redirects,
            reason: 'The redirect target was not a valid URL.',
            elapsedMs: Date.now() - started,
          },
        };
      }
      continue;
    }

    const contentType = response.headers.get('content-type') ?? '';
    const isHtml = /text\/html|application\/xhtml\+xml|text\/plain|application\/json/i.test(contentType);
    const html = isHtml ? await readCappedText(response) : '';
    const verdictContent = classifyContent(html, response.status);

    if (!isHtml) {
      return {
        ok: false,
        blocked: false,
        redirects,
        status: response.status,
        attempt: {
          tier: 'node_http',
          ok: false,
          status: response.status,
          redirects,
          reason: `The response was ${contentType || 'an unknown type'}, not a readable page.`,
          elapsedMs: Date.now() - started,
        },
      };
    }

    if (verdictContent.blocked) {
      return {
        ok: false,
        blocked: true,
        redirects,
        status: response.status,
        attempt: {
          tier: 'node_http',
          ok: false,
          status: response.status,
          blocked: true,
          challenge: verdictContent.challenge,
          redirects,
          reason: verdictContent.reason,
          elapsedMs: Date.now() - started,
        },
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        blocked: false,
        redirects,
        status: response.status,
        attempt: {
          tier: 'node_http',
          ok: false,
          status: response.status,
          redirects,
          reason: `The server answered HTTP ${response.status}.`,
          elapsedMs: Date.now() - started,
        },
      };
    }

    if (verdictContent.dynamicShell) {
      return {
        ok: false,
        blocked: false,
        redirects,
        status: response.status,
        html,
        attempt: {
          tier: 'node_http',
          ok: false,
          status: response.status,
          dynamicShell: true,
          redirects,
          reason: 'The page returned a JavaScript shell with no readable server-rendered content.',
          elapsedMs: Date.now() - started,
        },
      };
    }

    return {
      ok: true,
      finalUrl: current,
      html,
      status: response.status,
      blocked: false,
      redirects,
      attempt: {
        tier: 'node_http',
        ok: true,
        status: response.status,
        redirects,
        elapsedMs: Date.now() - started,
      },
    };
  }

  return {
    ok: false,
    blocked: false,
    redirects,
    attempt: {
      tier: 'node_http',
      ok: false,
      redirects,
      reason: `The page redirected more than ${MAX_REDIRECTS} times.`,
      elapsedMs: Date.now() - started,
    },
  };
}

/**
 * Native Node HTTP tier. Used as the last escalation step of the layered
 * transport, and as the only tier when the Python worker is unavailable.
 * Retries once on a transient network error or timeout.
 */
export async function nodeFetchPage(
  targetUrl: string,
  timeoutMs: number,
  extraHeaders?: Record<string, string>,
): Promise<NodeFetchResult> {
  let host = '';
  try {
    host = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return {
      ok: false,
      blocked: false,
      attempt: { tier: 'node_http', ok: false, reason: 'Not a valid absolute URL.' },
    };
  }

  await throttleHost(host);
  const first = await singleAttempt(targetUrl, timeoutMs, extraHeaders);
  if (first.ok) return first;

  const retryable = Boolean(first.attempt.timedOut) || /Network error/.test(first.attempt.reason ?? '');
  if (!retryable) return first;

  await throttleHost(host);
  const second = await singleAttempt(targetUrl, Math.round(timeoutMs * 1.5), extraHeaders);
  return {
    ...second,
    attempt: {
      ...second.attempt,
      reason: second.ok
        ? undefined
        : `${second.attempt.reason} (retried once after: ${first.attempt.reason})`,
    },
  };
}

export function resetHostThrottleState(): void {
  lastRequestByHost.clear();
  hostQueue.clear();
}

import { classifyContent } from './blockClassifier.js';
import type { TransportAttempt } from '../src/types.js';

interface BrowserPayload {
  ok?: boolean;
  url?: string;
  html?: string;
  status?: number;
  error?: string;
}

export interface CloudflareBrowserResult {
  ok: boolean;
  finalUrl?: string;
  html?: string;
  status?: number;
  blocked: boolean;
  attempt: TransportAttempt;
}

function endpoint(): string {
  return process.env.CLOUDFLARE_BROWSER_URL?.trim().replace(/\/+$/, '') ?? '';
}

function token(): string {
  return process.env.CLOUDFLARE_BROWSER_TOKEN?.trim() ?? '';
}

export function cloudflareBrowserAvailable(): boolean {
  return Boolean(endpoint() && token());
}

/**
 * Reads one page through Cloudflare Browser Run.
 *
 * The Render Free container cannot hold Chromium in 512 MB, so its last
 * escalation step is a remote browser. The Worker is authenticated with a
 * shared secret and is only called after the backend's SSRF guard has approved
 * the target.
 */
export async function fetchViaCloudflareBrowser(
  targetUrl: string,
  timeoutMs: number,
): Promise<CloudflareBrowserResult> {
  const started = Date.now();
  const attempt: TransportAttempt = {
    tier: 'cloudflare_browser',
    ok: false,
  };

  if (!cloudflareBrowserAvailable()) {
    attempt.reason = 'Cloudflare Browser Run is not configured.';
    return { ok: false, blocked: false, attempt };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${endpoint()}/render`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: targetUrl, timeoutMs }),
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = controller.signal.aborted;
    attempt.timedOut = timedOut;
    attempt.reason = timedOut
      ? `Cloudflare Browser Run timed out after ${timeoutMs} ms.`
      : `Cloudflare Browser Run could not be reached (${(error as Error).name}).`;
    attempt.elapsedMs = Date.now() - started;
    return { ok: false, blocked: false, attempt };
  } finally {
    clearTimeout(timer);
  }

  attempt.status = response.status;
  let payload: BrowserPayload;
  try {
    payload = (await response.json()) as BrowserPayload;
  } catch {
    attempt.reason = `Cloudflare Browser Run returned HTTP ${response.status} without a readable response.`;
    attempt.elapsedMs = Date.now() - started;
    return { ok: false, status: response.status, blocked: false, attempt };
  }

  if (!response.ok || !payload.ok || !payload.html || !payload.url) {
    attempt.reason = payload.error ?? `Cloudflare Browser Run returned HTTP ${response.status}.`;
    attempt.elapsedMs = Date.now() - started;
    return { ok: false, status: payload.status ?? response.status, blocked: false, attempt };
  }

  const verdict = classifyContent(payload.html, payload.status ?? 200);
  attempt.status = payload.status ?? 200;
  attempt.blocked = verdict.blocked;
  attempt.challenge = verdict.challenge;
  attempt.dynamicShell = verdict.dynamicShell;
  attempt.reason = verdict.blocked || verdict.dynamicShell ? verdict.reason : undefined;
  attempt.ok = !verdict.blocked && !verdict.dynamicShell;
  attempt.elapsedMs = Date.now() - started;

  return {
    ok: attempt.ok,
    finalUrl: payload.url,
    html: payload.html,
    status: attempt.status,
    blocked: verdict.blocked,
    attempt,
  };
}

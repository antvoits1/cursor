import { launch } from '@cloudflare/playwright';

interface Env {
  BROWSER: Fetcher;
  BROWSER_SERVICE_TOKEN: string;
}

interface RenderRequest {
  url?: unknown;
  timeoutMs?: unknown;
}

const MAX_HTML_CHARS = 4_000_000;

function json(body: object, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  });
}

function privateIpv4(host: string): boolean {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function safePublicUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length > 2_000) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    const literal = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
    if (
      !host ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      literal === '::1' ||
      literal.startsWith('fc') ||
      literal.startsWith('fd') ||
      literal.startsWith('fe80:') ||
      privateIpv4(literal)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/health') {
      return json({ ok: true, service: 'extractor-browser-renderer' });
    }
    if (path !== '/render' || request.method !== 'POST') {
      return json({ error: 'Not found.' }, 404);
    }

    if (!env.BROWSER_SERVICE_TOKEN || request.headers.get('authorization') !== `Bearer ${env.BROWSER_SERVICE_TOKEN}`) {
      return json({ error: 'Unauthorized.' }, 401);
    }

    let body: RenderRequest;
    try {
      body = (await request.json()) as RenderRequest;
    } catch {
      return json({ error: 'The request body was not valid JSON.' }, 400);
    }

    const target = safePublicUrl(body.url);
    if (!target) return json({ error: 'Only public HTTP and HTTPS addresses can be rendered.' }, 400);
    const requestedTimeout = typeof body.timeoutMs === 'number' ? body.timeoutMs : 10_000;
    const timeout = Math.max(1_500, Math.min(15_000, requestedTimeout));

    const browser = await launch(env.BROWSER);
    try {
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();
      const response = await page.goto(target.toString(), {
        waitUntil: 'domcontentloaded',
        timeout,
      });
      await page.waitForTimeout(350);
      const html = (await page.content()).slice(0, MAX_HTML_CHARS);
      const finalUrl = page.url();
      await context.close();
      return json({
        ok: true,
        url: finalUrl,
        status: response?.status() ?? 200,
        html,
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error: `The remote browser could not render this page (${error instanceof Error ? error.name : 'unknown error'}).`,
        },
        502,
      );
    } finally {
      await browser.close();
    }
  },
};

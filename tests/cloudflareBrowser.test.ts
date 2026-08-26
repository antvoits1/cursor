import assert from 'node:assert/strict';
import http, { type Server } from 'node:http';
import test from 'node:test';
import { fetchViaCloudflareBrowser } from '../server/cloudflareBrowser.js';

async function withBrowserStub(
  payload: object,
  status: number,
  run: (endpoint: string) => Promise<void>,
): Promise<void> {
  const server = await new Promise<Server>((resolve) => {
    const listener = http.createServer((req, res) => {
      assert.equal(req.headers.authorization, 'Bearer test-browser-secret');
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
    listener.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('the remote browser returns rendered HTML as an auditable tier', async () => {
  await withBrowserStub(
    {
      ok: true,
      url: 'https://example.com/contact',
      status: 200,
      html: '<html><body><main>Call 212-555-0199 for assistance from our team.</main></body></html>',
    },
    200,
    async (endpoint) => {
      process.env.CLOUDFLARE_BROWSER_URL = endpoint;
      process.env.CLOUDFLARE_BROWSER_TOKEN = 'test-browser-secret';
      const result = await fetchViaCloudflareBrowser('https://example.com/contact', 2_000);
      assert.equal(result.ok, true);
      assert.equal(result.attempt.tier, 'cloudflare_browser');
      assert.equal(result.finalUrl, 'https://example.com/contact');
      assert.match(result.html ?? '', /212-555-0199/);
    },
  );
});

test('a challenge rendered by the remote browser is still reported as blocked', async () => {
  await withBrowserStub(
    {
      ok: true,
      url: 'https://example.com/',
      status: 403,
      html: '<html><body><div class="cf-turnstile">Verify you are human</div></body></html>',
    },
    200,
    async (endpoint) => {
      process.env.CLOUDFLARE_BROWSER_URL = endpoint;
      process.env.CLOUDFLARE_BROWSER_TOKEN = 'test-browser-secret';
      const result = await fetchViaCloudflareBrowser('https://example.com/', 2_000);
      assert.equal(result.ok, false);
      assert.equal(result.blocked, true);
      assert.match(result.attempt.challenge ?? '', /Cloudflare/i);
    },
  );
});

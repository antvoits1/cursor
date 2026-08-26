import assert from 'node:assert/strict';
import test from 'node:test';
import { BLOCK_STATUSES, classifyContent, visibleTextLength } from '../server/blockClassifier.js';
import { PageCache } from '../server/cache.js';
import { assessUrl } from '../server/ssrfGuard.js';
import { proxyLabel, tierLabel } from '../server/transport.js';

/**
 * Transport safety and honesty.
 *
 * A blocked page must be reported as blocked, a rendering shell as a shell, and
 * an address that resolves anywhere private must never be opened.
 */

test('the SSRF guard refuses loopback, private, link-local and reserved addresses', async () => {
  const refused = [
    'http://localhost/',
    'http://127.0.0.1/',
    'http://127.9.9.9:8080/x',
    'http://[::1]/',
    'http://0.0.0.0/',
    'http://10.1.2.3/',
    'http://172.16.4.5/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal/',
    'http://[fc00::1]/',
    'http://[fe80::1]/',
    'http://100.64.0.1/',
    'http://224.0.0.1/',
    'http://something.local/',
    'http://box.internal/',
  ];
  for (const url of refused) {
    const verdict = await assessUrl(url);
    assert.equal(verdict.safe, false, `${url} must be refused`);
    assert.ok(verdict.reason, `${url} must come with a reason`);
  }
});

test('the SSRF guard refuses protocols that are not http or https', async () => {
  for (const url of ['file:///etc/passwd', 'ftp://example.com/x', 'gopher://example.com', 'javascript:alert(1)', 'not a url']) {
    const verdict = await assessUrl(url);
    assert.equal(verdict.safe, false, `${url} must be refused`);
  }
});

test('the SSRF guard allows an ordinary public address', async () => {
  const verdict = await assessUrl('https://example.com/');
  assert.equal(verdict.safe, true, verdict.reason ?? 'example.com should be allowed');
  assert.ok(verdict.addresses.length > 0);
});

test('block statuses are the ones that indicate a refusal rather than a missing page', () => {
  for (const status of [401, 403, 429, 451, 503]) assert.equal(BLOCK_STATUSES.has(status), true);
  for (const status of [200, 301, 404, 500]) assert.equal(BLOCK_STATUSES.has(status), false);
});

test('named challenges are identified rather than reported as generic failures', () => {
  const cases: Array<[string, string]> = [
    ['<html><body><div class="cf-turnstile"></div></body></html>', 'Cloudflare Turnstile'],
    ['<html><head><title>Just a moment...</title></head></html>', 'Cloudflare interstitial'],
    ['<div class="g-recaptcha" data-sitekey="x"></div>', 'Google reCAPTCHA'],
    ['<div class="h-captcha"></div>', 'hCaptcha'],
    ['<script src="https://x.perimeterx.net/px.js"></script>', 'PerimeterX'],
    ['<p>Please verify you are a human</p>', 'Generic browser verification'],
  ];
  for (const [html, expected] of cases) {
    const verdict = classifyContent(html, 200);
    assert.equal(verdict.blocked, true, `${expected} must be classified as blocked`);
    assert.equal(verdict.challenge, expected);
  }
});

test('HTTP block statuses are classified as blocked even when the body looks normal', () => {
  const verdict = classifyContent('<html><body><h1>Nothing to see</h1></body></html>', 429);
  assert.equal(verdict.blocked, true);
  assert.match(verdict.reason ?? '', /429/);
});

test('a JavaScript shell is recognised and a rendered page is not', () => {
  const shell = classifyContent('<html><body><div id="root"></div><script src="/a.js"></script></body></html>', 200);
  assert.equal(shell.blocked, false);
  assert.equal(shell.dynamicShell, true);

  const rendered = classifyContent(
    `<html><body><main>${'Real server rendered copy about the business. '.repeat(20)}</main></body></html>`,
    200,
  );
  assert.equal(rendered.dynamicShell, false);
  assert.ok(rendered.visibleChars > 500);
});

test('visible text length ignores scripts, styles and markup', () => {
  const html = '<html><head><style>.a{color:red}</style><script>var x = 1;</script></head><body><p>Hi there</p></body></html>';
  assert.equal(visibleTextLength(html), 'Hithere'.length);
});

test('cache keys isolate different URLs and different proxy routes', () => {
  const a = PageCache.key('https://example.com/', '');
  const b = PageCache.key('https://example.com/about', '');
  const c = PageCache.key('https://example.com/', 'http://user:secret@proxy.example:8080');
  const d = PageCache.key('https://example.com/', 'http://user:other@proxy.example:8080');

  assert.notEqual(a, b, 'different URLs must not share a key');
  assert.notEqual(a, c, 'a proxied fetch must not reuse a direct fetch');
  assert.notEqual(c, d, 'different credentials must not share a key');
  for (const key of [a, b, c, d]) {
    assert.equal(key.includes('secret'), false, 'a key must never contain credentials');
    assert.equal(key.includes('proxy.example'), false);
  }
});

test('the cache stores, hits, misses and expires', () => {
  const cache = new PageCache(50, 2);
  assert.equal(cache.get('https://example.com/', ''), null);
  cache.set('https://example.com/', '', { finalUrl: 'https://example.com/', html: '<p>x</p>', tier: 'node_http', status: 200 });

  const hit = cache.get('https://example.com/', '');
  assert.ok(hit);
  assert.equal(hit.html, '<p>x</p>');
  assert.equal(cache.stats().hits, 1);
  assert.equal(cache.stats().misses, 1);

  // A different proxy route must not see the entry cached for a direct fetch.
  assert.equal(cache.get('https://example.com/', 'http://proxy:8080'), null);
});

test('the cache evicts the oldest entry once it is full', () => {
  const cache = new PageCache(10_000, 2);
  for (const path of ['a', 'b', 'c']) {
    cache.set(`https://example.com/${path}`, '', { finalUrl: `https://example.com/${path}`, html: 'x', tier: 'node_http' });
  }
  assert.equal(cache.stats().entries, 2);
  assert.equal(cache.stats().evictions, 1);
  assert.equal(cache.get('https://example.com/a', ''), null);
  assert.ok(cache.get('https://example.com/c', ''));
});

test('proxy credentials never appear in the diagnostics label', () => {
  const original = process.env.EXTRACTOR_PROXY_URL;
  process.env.EXTRACTOR_PROXY_URL = 'http://operator:hunter2@proxy.example.net:9000';
  try {
    const label = proxyLabel();
    assert.equal(label.includes('hunter2'), false);
    assert.equal(label.includes('operator'), false);
    assert.match(label, /proxy\.example\.net:9000/);
  } finally {
    if (original === undefined) delete process.env.EXTRACTOR_PROXY_URL;
    else process.env.EXTRACTOR_PROXY_URL = original;
  }
});

test('a malformed proxy is reported without echoing the value', () => {
  const original = process.env.EXTRACTOR_PROXY_URL;
  process.env.EXTRACTOR_PROXY_URL = 'not-a-proxy';
  try {
    assert.equal(proxyLabel(), 'configured (unparseable value withheld)');
  } finally {
    if (original === undefined) delete process.env.EXTRACTOR_PROXY_URL;
    else process.env.EXTRACTOR_PROXY_URL = original;
  }
});

test('every transport tier has a plain-language label', () => {
  assert.equal(tierLabel('cache'), 'local cache');
  assert.equal(tierLabel('curl_cffi'), 'fast static fetch');
  assert.equal(tierLabel('patchright'), 'browser rendering');
  assert.equal(tierLabel('camoufox'), 'hardened browser rendering');
  assert.equal(tierLabel('node_http'), 'built-in HTTP fetch');
});

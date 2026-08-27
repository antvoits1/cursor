import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { after, before } from 'node:test';
import type { Server } from 'node:http';

/**
 * HTTP contract.
 *
 * The real Express application is booted on an ephemeral port. Network egress
 * is disabled for the run, so extraction reaches its "everything was blocked"
 * path deterministically — which is exactly the path that must still return a
 * well-formed, honest result rather than an invented one.
 */

process.env.EXTRACTOR_DISABLE_PYTHON_TRANSPORT = '1';
process.env.EXTRACTOR_DISABLE_LEARNING = '1';
process.env.EXTRACTOR_OFFLINE = '1';
process.env.EXTRACTOR_ALLOWED_ORIGINS = 'https://workspace-six-pink-20.vercel.app';

const { createApp } = await import('../server/app.js');

let server: Server;
let base = '';

before(async () => {
  const app = createApp('node_server');
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('health identifies the build that is actually serving', async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.build, 'Extractor-React-Layered-20260825-03');
  assert.equal(body.host, 'node_server');
  assert.ok(typeof body.version === 'string' && body.version.length > 0);
});

test('the configured Vercel frontend can call a separately hosted backend', async () => {
  const origin = 'https://workspace-six-pink-20.vercel.app';
  const preflight = await fetch(`${base}/api/health`, {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'GET',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);

  const response = await fetch(`${base}/api/health`, { headers: { origin } });
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.match(response.headers.get('vary') ?? '', /Origin/);
});

test('an unconfigured browser origin is refused at preflight', async () => {
  const response = await fetch(`${base}/api/health`, {
    method: 'OPTIONS',
    headers: {
      origin: 'https://untrusted.example',
      'access-control-request-method': 'GET',
    },
  });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('diagnostics report only the capabilities actually present', async () => {
  const response = await fetch(`${base}/api/diagnostics`);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.ok(Array.isArray(body.tiers));
  const byTier = Object.fromEntries(body.tiers.map((tier: { tier: string }) => [tier.tier, tier]));

  assert.equal(byTier.node_http.available, true);
  for (const tier of ['curl_cffi', 'patchright', 'camoufox']) {
    assert.equal(byTier[tier].available, false, `${tier} cannot run here and must not be advertised`);
    assert.ok(byTier[tier].detail.length > 0, `${tier} must say why it is unavailable`);
  }
  assert.equal(body.transportMode, 'node_http_only');
  assert.ok(body.cache && typeof body.cache.kind === 'string');
});

test('diagnostics do not claim connectivity that has not been proven', async () => {
  const body = await (await fetch(`${base}/api/diagnostics`)).json();
  // Every outbound request is switched off for this run, so the engine must not
  // report itself as online however many runs have been attempted.
  assert.notEqual(body.status, 'online');
  assert.ok(body.statusDetail.length > 0);
});

test('the planner endpoint returns an ordered plan', async () => {
  const response = await postJson('/api/plan', { query: 'Blue Bottle Coffee, Oakland CA' });
  assert.equal(response.status, 200);
  const plan = await response.json();
  assert.equal(plan.queryType, 'location_constrained');
  assert.ok(plan.routes.length > 0);
  assert.deepEqual(plan.routes.map((route: { order: number }) => route.order), plan.routes.map((_: unknown, index: number) => index + 1));
});

test('an empty query is refused with a clear message and no crash', async () => {
  for (const body of [{}, { query: '' }, { query: '   ' }, { query: 42 }]) {
    const response = await postJson('/api/extract', body);
    assert.equal(response.status, 400, `${JSON.stringify(body)} must be refused`);
    const payload = await response.json();
    assert.ok(typeof payload.error === 'string' && payload.error.length > 0);
  }
});

test('an over-long query is refused rather than truncated silently', async () => {
  const response = await postJson('/api/extract', { query: 'a'.repeat(5000) });
  assert.equal(response.status, 400);
});

test('a protected identifier in the query never reaches the plan', async () => {
  const response = await postJson('/api/plan', { query: 'Northwind Traders 078-64-1091' });
  const text = await response.text();
  assert.equal(text.includes('078-64-1091'), false);
});

test('extraction streams its route and finishes with one result', async () => {
  const response = await postJson('/api/extract', { query: 'Northwind Traders, Scio NY', deepScan: false });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /ndjson/);

  const events = (await response.text())
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));

  const steps = events.filter((event) => event.type === 'step');
  const results = events.filter((event) => event.type === 'result');

  assert.ok(steps.length > 0, 'the route must be reported as it happens');
  assert.equal(results.length, 1, 'exactly one final result');
  assert.equal(events.at(-1).type, 'result', 'the result is the last event');

  for (const event of steps) {
    assert.ok(typeof event.step.message === 'string' && event.step.message.length > 0, 'every step must explain itself');
    assert.ok(typeof event.step.status === 'string');
    assert.ok(typeof event.step.seq === 'number');
  }
  const sequence = steps.map((event) => event.step.seq);
  assert.deepEqual(sequence, [...sequence].sort((a, b) => a - b), 'steps must arrive in order');
});

test('a run where every source is unreachable reports failure instead of inventing data', async () => {
  const response = await postJson('/api/extract', { query: 'Northwind Traders, Scio NY', deepScan: false });
  const events = (await response.text()).split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const result = events.find((event) => event.type === 'result').result;

  assert.ok(['failed', 'partial', 'blocked'].includes(result.status), `unexpected status ${result.status}`);
  assert.deepEqual(result.phones, [], 'no phone may be produced when nothing was reachable');
  assert.deepEqual(result.emails, [], 'no email may be produced when nothing was reachable');
  assert.equal(result.confidence, 0);
  assert.ok(result.route.length > 0, 'the attempted route must still be shown');
  assert.ok(Array.isArray(result.confidenceBasis));
});

test('the result always carries the fields the interface depends on', async () => {
  const response = await postJson('/api/extract', { query: 'stripe.com', deepScan: false });
  const events = (await response.text()).split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const result = events.find((event) => event.type === 'result').result;

  for (const field of ['id', 'query', 'queryType', 'plan', 'phones', 'emails', 'addresses', 'socials', 'route', 'consultedSources', 'rejected', 'confidence', 'confidenceBasis', 'entityMatchStatus', 'status', 'transportMode', 'availableTiers', 'durationMs', 'createdAt']) {
    assert.ok(field in result, `the result is missing ${field}`);
  }
  assert.equal(typeof result.durationMs, 'number');
  assert.ok(Date.parse(result.createdAt) > 0);
});

test('a private or loopback target is refused before any request is made', async () => {
  for (const query of ['http://127.0.0.1:8080/admin', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.5/']) {
    const response = await postJson('/api/extract', { query, deepScan: false });
    const events = (await response.text()).split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const result = events.find((event) => event.type === 'result')?.result;
    assert.ok(result, `${query} should still return a result envelope`);
    assert.equal(result.status, 'failed', `${query} must never be reported as any kind of success`);
    const blockedStep = result.route.find((step: { message?: string }) =>
      /reserved or private|refused to open|not permitted/i.test(step.message ?? ''),
    );
    assert.ok(blockedStep, `${query} must be refused with a stated reason`);
  }
});

test('the learning endpoints are readable and resettable', async () => {
  const snapshot = await fetch(`${base}/api/learning`);
  assert.equal(snapshot.status, 200);
  const body = await snapshot.json();
  assert.ok(Array.isArray(body.routes));
  assert.ok(Array.isArray(body.domains));

  const reset = await fetch(`${base}/api/learning/reset`, { method: 'POST' });
  assert.equal(reset.status, 200);
  const afterReset = await reset.json();
  assert.equal(afterReset.ok, true);
  assert.deepEqual(afterReset.learning.routes, []);
});

test('an unknown API route returns a JSON 404 rather than HTML', async () => {
  const response = await fetch(`${base}/api/does-not-exist`);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') ?? '', /json/);
});

test('malformed JSON is rejected without taking the server down', async () => {
  const response = await fetch(`${base}/api/extract`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{ this is not json',
  });
  assert.ok(response.status >= 400 && response.status < 500);

  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200, 'the server must still be serving after a bad request');
});

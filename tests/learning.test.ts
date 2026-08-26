import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

/**
 * Local route intelligence.
 *
 * Learning may reorder routes and nothing else. It must never invent a value,
 * carry data between leads, keep trusting a stale entry, or refuse to be reset.
 * The store is pointed at a temporary file so a test run never touches the
 * store a real installation is using.
 */

const storeFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'extractor-learning-')), 'route-learning.json');
process.env.EXTRACTOR_LEARNING_FILE = storeFile;

const learning = await import('../server/learning.js');
const { planQuery } = await import('../server/queryPlanner.js');

test.afterEach(() => learning.resetLearning());

test('an unproven route has no learned prior', () => {
  assert.equal(learning.routePrior('company_search', 'official_site'), null);
});

test('outcomes accumulate into a success rate and a latency average', () => {
  for (let index = 0; index < 3; index += 1) {
    learning.recordRouteOutcome({
      queryType: 'company_search',
      routeId: 'official_site',
      success: true,
      blocked: false,
      latencyMs: 1000,
      fieldYield: 3,
    });
  }
  learning.recordRouteOutcome({
    queryType: 'company_search',
    routeId: 'official_site',
    success: false,
    blocked: false,
    latencyMs: 2000,
    fieldYield: 0,
  });

  const prior = learning.routePrior('company_search', 'official_site');
  assert.ok(prior);
  assert.equal(prior.sampleSize, 4);
  assert.equal(prior.successRate, 0.75);
  assert.equal(prior.repeatedlyUseless, false);
});

test('a route that never produces anything is marked as repeatedly useless', () => {
  for (let index = 0; index < 6; index += 1) {
    learning.recordRouteOutcome({
      queryType: 'company_search',
      routeId: 'people_directories',
      success: false,
      blocked: false,
      latencyMs: 3000,
      fieldYield: 0,
    });
  }
  const prior = learning.routePrior('company_search', 'people_directories');
  assert.ok(prior);
  assert.equal(prior.successRate, 0);
  assert.equal(prior.repeatedlyUseless, true);
});

test('learning reorders the plan without removing any route', () => {
  const before = planQuery('Northwind Traders');
  const beforeIds = before.routes.map((route) => route.id);

  const worst = beforeIds[0];
  for (let index = 0; index < 8; index += 1) {
    learning.recordRouteOutcome({ queryType: 'company_search', routeId: worst, success: false, blocked: false, latencyMs: 4000, fieldYield: 0 });
  }

  const after = planQuery('Northwind Traders');
  const afterIds = after.routes.map((route) => route.id);

  assert.deepEqual([...afterIds].sort(), [...beforeIds].sort(), 'no route may be dropped by learning');
  assert.notEqual(afterIds[0], worst, 'a route that never produces anything must not stay first');
  assert.equal(after.routes.every((route) => route.enabled), true, 'every route stays runnable');
  const demoted = after.routes.find((route) => route.id === worst);
  assert.ok(demoted?.skipReason, 'the demotion must be explained to the operator');
});

test('the plan exposes the learned figures it used', () => {
  for (let index = 0; index < 4; index += 1) {
    learning.recordRouteOutcome({ queryType: 'company_search', routeId: 'official_site', success: true, blocked: false, latencyMs: 900, fieldYield: 4 });
  }
  const plan = planQuery('Northwind Traders');
  const route = plan.routes.find((candidate) => candidate.id === 'official_site');
  assert.ok(route);
  assert.equal(route.learnedSampleSize, 4);
  assert.equal(route.learnedSuccessRate, 100);
});

test('domain outcomes record yield and keep a revalidation deadline', () => {
  learning.recordDomainOutcome({
    domain: 'northwind.example',
    success: true,
    blocked: false,
    latencyMs: 800,
    phones: 1,
    emails: 1,
    addresses: 0,
    owners: 0,
    productivePatterns: ['json_ld:telephone'],
    unproductivePatterns: ['text:footer-phone'],
  });

  const prior = learning.domainPrior('northwind.example');
  assert.ok(prior);
  assert.equal(prior.successRate, 1);

  const record = learning.snapshot().domains.find((entry) => entry.domain === 'northwind.example');
  assert.ok(record);
  assert.ok(record.productivePatterns.includes('json_ld:telephone'));
  assert.ok(Date.parse(record.staleAfter) > Date.now(), 'a learned entry must carry a revalidation deadline');
});

test('the snapshot is inspectable and the reset clears everything', () => {
  learning.recordRouteOutcome({ queryType: 'company_search', routeId: 'official_site', success: true, blocked: false, latencyMs: 500, fieldYield: 2 });
  learning.recordDomainOutcome({
    domain: 'northwind.example', success: true, blocked: false, latencyMs: 500,
    phones: 1, emails: 0, addresses: 0, owners: 0, productivePatterns: [], unproductivePatterns: [],
  });
  learning.noteRun();

  const before = learning.snapshot();
  assert.ok(before.routes.length > 0);
  assert.ok(before.domains.length > 0);
  assert.equal(before.totalRuns, 1);

  learning.resetLearning();

  const after = learning.snapshot();
  assert.deepEqual(after.routes, []);
  assert.deepEqual(after.domains, []);
  assert.equal(after.totalRuns, 0);
  assert.equal(learning.routePrior('company_search', 'official_site'), null);
});

test('the store survives a flush to disk and holds no lead data', () => {
  learning.recordRouteOutcome({ queryType: 'company_search', routeId: 'official_site', success: true, blocked: false, latencyMs: 500, fieldYield: 2 });
  learning.recordDomainOutcome({
    domain: 'northwind.example', success: true, blocked: false, latencyMs: 500,
    phones: 1, emails: 1, addresses: 1, owners: 0, productivePatterns: ['json_ld:telephone'], unproductivePatterns: [],
  });
  learning.flushNow();

  const written = fs.readFileSync(storeFile, 'utf8');
  assert.ok(written.includes('official_site'));
  // Only counts, timings and pattern names may be persisted — never a value
  // that was extracted, and never anything derived from a protected column.
  assert.equal(/\d{3}-\d{2}-\d{4}/.test(written), false);
  assert.equal(written.includes('@'), false, 'no email address may be persisted into the learning store');
  assert.equal(/\(\d{3}\)\s*\d{3}-\d{4}/.test(written), false, 'no phone number may be persisted');
});

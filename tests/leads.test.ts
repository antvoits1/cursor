import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOT_LEAD_IDS, leads } from '../src/data/leads';
import { filterLeads } from '../src/lib/leads';

test('filterLeads all returns every lead', () => {
  assert.equal(filterLeads(leads, 'all').length, leads.length);
});

test('filterLeads starred returns only favorites', () => {
  const out = filterLeads(leads, 'starred');
  assert.ok(out.length > 0);
  assert.ok(out.every((l) => l.fav));
});

test('filterLeads hot returns only hot ids', () => {
  const out = filterLeads(leads, 'hot');
  assert.ok(out.length > 0);
  assert.ok(out.every((l) => HOT_LEAD_IDS.has(l.id)));
});

test('filterLeads search matches company or contact, case-insensitive', () => {
  assert.deepEqual(filterLeads(leads, 'all', 'harborline').map((l) => l.id), ['hl']);
  assert.deepEqual(filterLeads(leads, 'all', 'ELIJAH').map((l) => l.id), ['ns']);
  assert.equal(filterLeads(leads, 'all', 'zzz-nothing').length, 0);
});

test('filterLeads combines filter and search', () => {
  const out = filterLeads(leads, 'starred', 'marlowe');
  assert.deepEqual(out.map((l) => l.id), ['mw']);
});

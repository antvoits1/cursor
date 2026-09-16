import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leads } from '../src/data/leads';
import { applicationFields } from '../src/lib/application';
import { salesPitch } from '../src/lib/pitch';

test('applicationFields skips empty values and keeps fixed order', () => {
  const ns = leads.find((l) => l.id === 'ns')!;
  const fields = applicationFields(ns);
  const keys = fields.map((f) => f.key);
  // ns has no DBA/Request/Offer/Position/Rep/Employees/Time in Biz/Entity/Source/Website
  assert.ok(!keys.includes('DBA'));
  assert.ok(!keys.includes('Request'));
  assert.ok(keys.includes('Industry'));
  assert.ok(keys.includes('State'));
  assert.ok(keys.includes('EIN'));
  assert.ok(keys.includes('Revenue'));
  assert.ok(keys.includes('Address'));
  assert.ok(fields.every((f) => f.value !== ''));
});

test('applicationFields hides statement address when it matches the address', () => {
  const hl = leads.find((l) => l.id === 'hl')!;
  const keys = applicationFields(hl).map((f) => f.key);
  assert.ok(!keys.includes('Statement Address'));
  assert.ok(keys.includes('Website'));
  assert.ok(keys.includes('Request'));
});

test('every lead renders exactly 3 mobiles, 2 landlines, 3 emails', () => {
  for (const l of leads) {
    assert.equal(l.mobiles.length, 3, `${l.id} mobiles`);
    assert.equal(l.landlines.length, 2, `${l.id} landlines`);
    assert.equal(l.emails.length, 3, `${l.id} emails`);
    assert.equal(l.stmts.length, 3, `${l.id} statements`);
  }
});

test('salesPitch mentions company, average, and latest deposits', () => {
  const ns = leads.find((l) => l.id === 'ns')!;
  const pitch = salesPitch(ns);
  assert.ok(pitch.includes('Lance Truck & Auto Sales INC'));
  assert.ok(pitch.includes('$354,579'));
  assert.ok(pitch.includes('$362,400'));
  // ns has an MCA position, so the refinance branch is used
  assert.ok(pitch.includes('RapidCap'));
});

test('salesPitch uses the no-MCA branch when no position exists', () => {
  const hl = leads.find((l) => l.id === 'hl')!;
  const pitch = salesPitch(hl);
  assert.ok(pitch.includes('no listed MCA position'));
  assert.ok(pitch.includes('Four additional daycabs'));
});

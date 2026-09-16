import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leads } from '../src/data/leads';
import {
  dialDigits,
  formatDialInput,
  matchLeadByNameOrNumber,
  matchLeadByNumber,
} from '../src/lib/dialer';

test('dialDigits strips everything but digits', () => {
  assert.equal(dialDigits('(720) 737-8464'), '7207378464');
  assert.equal(dialDigits('+1 (720) 737-8464'), '17207378464');
  assert.equal(dialDigits(''), '');
});

test('formatDialInput formats progressively as digits are typed', () => {
  assert.equal(formatDialInput(''), '');
  assert.equal(formatDialInput('7'), '7');
  assert.equal(formatDialInput('720'), '720');
  assert.equal(formatDialInput('7207'), '(720) 7');
  assert.equal(formatDialInput('720737'), '(720) 737');
  assert.equal(formatDialInput('7207378'), '(720) 737-8');
  assert.equal(formatDialInput('7207378464'), '(720) 737-8464');
  assert.equal(formatDialInput('17207378464'), '+1 (720) 737-8464');
});

test('formatDialInput accepts already-formatted input', () => {
  assert.equal(formatDialInput('(720) 737-8464'), '(720) 737-8464');
});

test('matchLeadByNumber finds a lead by mobile or landline', () => {
  assert.equal(matchLeadByNumber(leads, '(720) 737-8464')?.id, 'ns');
  assert.equal(matchLeadByNumber(leads, '7207378464')?.id, 'ns');
  assert.equal(matchLeadByNumber(leads, '(914) 555-0190')?.id, 'ap');
  assert.equal(matchLeadByNumber(leads, '(000) 000-0000'), undefined);
});

test('matchLeadByNameOrNumber matches contact, company, or number', () => {
  assert.equal(matchLeadByNameOrNumber(leads, 'elijah')?.id, 'ns');
  assert.equal(matchLeadByNameOrNumber(leads, 'Harborline')?.id, 'hl');
  assert.equal(matchLeadByNameOrNumber(leads, '(718) 555-0133')?.id, 'ro');
  assert.equal(matchLeadByNameOrNumber(leads, 'nobody'), undefined);
  assert.equal(matchLeadByNameOrNumber(leads, ''), undefined);
});

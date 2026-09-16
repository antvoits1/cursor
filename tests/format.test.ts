import assert from 'node:assert/strict';
import { test } from 'node:test';
import { approval, formatClock, money, phoneHref, whatsappHref } from '../src/lib/format';

test('money formats with thousands separators', () => {
  assert.equal(money(354579.12), '$354,579');
  assert.equal(money(0), '$0');
  assert.equal(money(null), '$0');
  assert.equal(money(125000), '$125,000');
});

test('approval is average monthly revenue plus 150k', () => {
  assert.equal(approval({ avg: 350000 }), 500000);
  assert.equal(approval({ avg: 0 }), 150000);
});

test('phoneHref builds a +1 tel URI from a formatted number', () => {
  assert.equal(phoneHref('(720) 737-8464'), '+17207378464');
  assert.equal(phoneHref(''), '+1');
});

test('whatsappHref builds a wa.me link without the plus', () => {
  assert.equal(whatsappHref('(720) 737-8464'), 'https://wa.me/17207378464');
});

test('formatClock renders mm:ss', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(65), '01:05');
  assert.equal(formatClock(724), '12:04');
});

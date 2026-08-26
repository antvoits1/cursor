import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeEntities, deobfuscate, extractEmails, PHONE_PATTERN } from '../server/deobfuscator.js';
import { EvidenceLedger } from '../server/evidence.js';
import { areaCodeCoverage, classifyPhoneNumber } from '../server/phoneClassifier.js';
import { detectQueryType, inferContext, planQuery, QUERY_TYPE_LABELS } from '../server/queryPlanner.js';
import { pickOfficialSiteFromSearch } from '../server/sources/publicDirectories.js';
import { __testing as __officialSite } from '../server/sources/officialSite.js';
import { parseAddressParts } from '../server/evidence.js';
import type { Evidence } from '../src/types.js';
import type { SearchHit } from '../server/sources/webSearch.js';

/** Extraction quality: classification, deobfuscation, evidence and planning. */

function evidenceAt(url: string, method: Evidence['method'] = 'text_pattern'): Evidence {
  return { url, sourceLabel: new URL(url).hostname, method, observedAt: new Date().toISOString() };
}

/* ----------------------------- Phone numbers ----------------------------- */

test('valid numbers are normalised to E.164 and formatted for display', () => {
  const phone = classifyPhoneNumber('(510) 653-3394');
  assert.ok(phone);
  assert.equal(phone.number, '+15106533394');
  assert.equal(phone.formatted, '(510) 653-3394');
  assert.equal(phone.country, 'US');
});

test('the same number in different notations resolves to one identity', () => {
  const forms = ['(510) 653-3394', '510-653-3394', '510.653.3394', '+1 510 653 3394', '15106533394'];
  const numbers = new Set(forms.map((form) => classifyPhoneNumber(form)?.number));
  assert.equal(numbers.size, 1, 'every notation must collapse to a single E.164 value');
  assert.equal([...numbers][0], '+15106533394');
});

test('digit runs that are not phone numbers are refused', () => {
  for (const value of ['123', '20260826', '1234', '', '000-00-0000', '99']) {
    assert.equal(classifyPhoneNumber(value), null, `${value} must not be read as a phone number`);
  }
});

test('a toll-free number is identified from its area code', () => {
  const phone = classifyPhoneNumber('1-800-555-0199');
  assert.ok(phone);
  assert.equal(phone.type, 'TOLL_FREE');
  assert.ok(phone.lineTypeBasis.length > 0, 'the basis for the classification must be stated');
});

test('page context refines the line type and marks fax lines', () => {
  const mobile = classifyPhoneNumber('(510) 653-3394', 'Mobile: (510) 653-3394');
  assert.ok(mobile);
  assert.equal(mobile.type, 'MOBILE');

  const fax = classifyPhoneNumber('(510) 653-3395', 'Fax: (510) 653-3395');
  assert.ok(fax);
  assert.equal(fax.isFax, true);
});

test('the area code table covers the North American plan broadly', () => {
  assert.ok(areaCodeCoverage() > 250, `expected wide area-code coverage, saw ${areaCodeCoverage()}`);
});

test('a geographic number reports where it is registered', () => {
  const phone = classifyPhoneNumber('(212) 555-0143');
  assert.ok(phone);
  assert.match(phone.location ?? '', /New York/i);
});

/* ----------------------------- Deobfuscation ----------------------------- */

test('HTML entities are decoded before values are read', () => {
  assert.equal(decodeEntities('info&#64;example&#46;com'), 'info@example.com');
  assert.equal(decodeEntities('Tom &amp; Jerry'), 'Tom & Jerry');
  assert.equal(decodeEntities('a&nbsp;b'), 'a b');
});

test('spelled-out and spaced obfuscation is undone', () => {
  assert.match(deobfuscate('info (at) example (dot) com'), /info@example\.com/);
  assert.match(deobfuscate('info [at] example [dot] com'), /info@example\.com/);
  assert.match(deobfuscate('info {at} example {dot} com'), /info@example\.com/);
  assert.match(deobfuscate('info AT example DOT com'), /info@example\.com/);
});

test('ordinary prose is not turned into an email address', () => {
  // "meet us at example.com" must stay prose; inventing us@example.com from it
  // would be fabricating a contact nobody published.
  assert.equal(deobfuscate('meet us at example.com').includes('@'), false);
  assert.deepEqual(extractEmails('meet us at northwind.co for coffee'), []);
});

test('obfuscated addresses are recovered and asset filenames are not', () => {
  const found = extractEmails('Contact info (at) northwind (dot) com or sales&#64;northwind.com');
  const addresses = found.map((item) => item.email).sort();
  assert.deepEqual(addresses, ['info@northwind.com', 'sales@northwind.com']);

  const noise = extractEmails('background: url(logo@2x.png); sprite@3x.jpg; hero.image@example.png');
  assert.deepEqual(noise, [], 'image filenames must not be read as email addresses');
});

test('placeholder addresses are not treated as contacts', () => {
  const found = extractEmails('email@example.com, you@yourdomain.com, name@domain.com, real@northwind.co');
  assert.deepEqual(found.map((item) => item.email), ['real@northwind.co']);
});

test('the phone pattern finds numbers in running text', () => {
  const text = 'Reach the shop at (510) 653-3394 or on 415.555.0128 during the week.';
  const matches = text.match(new RegExp(PHONE_PATTERN.source, 'g')) ?? [];
  assert.equal(matches.length, 2);
});

/* ------------------------------- Evidence -------------------------------- */

test('the same value from two sources merges and counts as agreement', () => {
  const ledger = new EvidenceLedger();
  assert.equal(ledger.addPhone('(510) 653-3394', evidenceAt('https://northwind.example/contact')), 'accepted');
  assert.equal(ledger.addPhone('510-653-3394', evidenceAt('https://directory.example/northwind')), 'merged');

  const resolved = ledger.resolve('https://northwind.example/', null);
  assert.equal(resolved.phones.length, 1, 'one number, not two');
  assert.equal(resolved.phones[0].agreementCount, 2);
  assert.equal(resolved.phones[0].evidence.length, 2);
});

test('agreement across sources raises confidence above a single sighting', () => {
  const single = new EvidenceLedger();
  single.addPhone('(510) 653-3394', evidenceAt('https://northwind.example/contact'));

  const agreed = new EvidenceLedger();
  agreed.addPhone('(510) 653-3394', evidenceAt('https://northwind.example/contact'));
  agreed.addPhone('(510) 653-3394', evidenceAt('https://directory.example/northwind'));
  agreed.addPhone('(510) 653-3394', evidenceAt('https://maps.example/northwind'));

  const one = single.resolve('https://northwind.example/', null).phones[0];
  const many = agreed.resolve('https://northwind.example/', null).phones[0];
  assert.ok(many.confidence > one.confidence, 'more independent sources must mean more confidence');
});

test('structured data is weighted above a loose text match', () => {
  const structured = new EvidenceLedger();
  structured.addPhone('(510) 653-3394', evidenceAt('https://northwind.example/', 'json_ld'));

  const loose = new EvidenceLedger();
  loose.addPhone('(510) 653-3394', evidenceAt('https://northwind.example/', 'search_snippet'));

  assert.ok(
    structured.resolve('https://northwind.example/', null).phones[0].confidence >
      loose.resolve('https://northwind.example/', null).phones[0].confidence,
  );
});

test('an email on an unrelated corporate domain is refused with a stated reason', () => {
  const ledger = new EvidenceLedger();
  ledger.addEmail('hello@northwind.example', evidenceAt('https://northwind.example/contact'));
  ledger.addEmail('studio@someagency.example', evidenceAt('https://northwind.example/contact'));

  const resolved = ledger.resolve('https://northwind.example/', null);
  assert.deepEqual(resolved.emails.map((item) => item.email), ['hello@northwind.example']);
  const refusal = resolved.rejected.find((item) => item.value === 'studio@someagency.example');
  assert.ok(refusal, 'the refusal must be recorded, not silent');
  assert.match(refusal.reason, /does not match the resolved website/);
});

test('a consumer mailbox is kept because small businesses genuinely use one', () => {
  const ledger = new EvidenceLedger();
  ledger.addEmail('northwindtraders@gmail.com', evidenceAt('https://northwind.example/contact'));
  const resolved = ledger.resolve('https://northwind.example/', null);
  assert.deepEqual(resolved.emails.map((item) => item.email), ['northwindtraders@gmail.com']);
});

test('automated mailboxes and malformed addresses are refused', () => {
  const ledger = new EvidenceLedger();
  assert.equal(ledger.addEmail('no-reply@northwind.example', evidenceAt('https://northwind.example/')), 'rejected');
  assert.equal(ledger.addEmail('bad..address@northwind.example', evidenceAt('https://northwind.example/')), 'rejected');
  const resolved = ledger.resolve('https://northwind.example/', null);
  assert.equal(resolved.emails.length, 0);
  assert.ok(resolved.rejected.length >= 2);
});

test('a protected identifier offered as a phone number is discarded, not stored', () => {
  const ledger = new EvidenceLedger();
  assert.equal(ledger.addPhone('078-64-1091', evidenceAt('https://northwind.example/')), 'rejected');
  const resolved = ledger.resolve('https://northwind.example/', null);
  assert.equal(resolved.phones.length, 0);
  assert.equal(JSON.stringify(resolved).includes('078-64-1091'), false, 'the value must not survive anywhere');
});

test("the site builder's own social accounts are not attributed to the business", () => {
  const ledger = new EvidenceLedger();
  // Every Wix-built site links to Wix's accounts in its footer.
  assert.equal(ledger.addSocial('http://facebook.com/wix', evidenceAt('https://northwind.example/')), 'rejected');
  assert.equal(ledger.addSocial('https://twitter.com/squarespace', evidenceAt('https://northwind.example/')), 'rejected');
  assert.equal(
    ledger.addSocial('https://facebook.com/northwindtraders', evidenceAt('https://northwind.example/')),
    'accepted',
    "the business's own page must still be kept",
  );

  const resolved = ledger.resolve('https://northwind.example/', null);
  assert.deepEqual(resolved.socials.map((item) => item.url), ['https://facebook.com/northwindtraders']);
});

test('a share widget or network homepage is not a profile', () => {
  const ledger = new EvidenceLedger();
  assert.equal(ledger.addSocial('https://facebook.com/sharer/sharer.php?u=x', evidenceAt('https://northwind.example/')), 'rejected');
  assert.equal(ledger.addSocial('https://facebook.com/', evidenceAt('https://northwind.example/')), 'rejected');
});

test('addresses deduplicate across abbreviation and punctuation differences', () => {
  const ledger = new EvidenceLedger();
  ledger.addAddress('4105 Irons Road, Scio, NY 14880', evidenceAt('https://northwind.example/contact'));
  ledger.addAddress('4105 Irons Rd, Scio, NY 14880', evidenceAt('https://directory.example/northwind'));

  const resolved = ledger.resolve('https://northwind.example/', null);
  assert.equal(resolved.addresses.length, 1);
  assert.equal(resolved.addresses[0].agreementCount, 2);
});

test('a candidate with no street number is refused as an address', () => {
  const ledger = new EvidenceLedger();
  assert.equal(ledger.addAddress('Somewhere in California', evidenceAt('https://northwind.example/')), 'rejected');
});

test('prose that merely looks address-shaped is refused', () => {
  // Every one of these was produced by running the extractor against a real
  // page. Publishing them as addresses is worse than publishing nothing.
  const prose = [
    '000 More than RD',
    '000 to RD',
    '259 W Santa Clara St in',
    '3 N Erie Street Ma',
    '100 and more for the Way',
    '2250 S Atlantic Blvd Suite M Co',
    '90040 323-488-0160 990 North Tustin St #B Or',
  ];
  for (const candidate of prose) {
    const ledger = new EvidenceLedger();
    assert.equal(
      ledger.addAddress(candidate, evidenceAt('https://northwind.example/')),
      'rejected',
      `"${candidate}" must not be accepted as an address`,
    );
    const resolved = ledger.resolve('https://northwind.example/', null);
    assert.equal(resolved.addresses.length, 0);
    assert.ok(resolved.rejected[0].reason.length > 0, 'the refusal must carry a reason');
  }
});

test('genuine addresses in their usual renderings are still accepted', () => {
  const genuine = [
    '4105 Irons Rd, Scio, NY 14880',
    '1012 20th Ave',
    '2250 S Atlantic Blvd Ste M',
    '445 Baltimore Blvd',
    '4001 Piedmont Avenue, Oakland, CA 94609',
    '480 9th Street, Oakland, CA 94607',
    '3180 18th St #100, San Francisco, CA 94110',
    '1 Infinite Loop, Cupertino, CA 95014',
  ];
  for (const candidate of genuine) {
    const ledger = new EvidenceLedger();
    assert.equal(
      ledger.addAddress(candidate, evidenceAt('https://northwind.example/')),
      'accepted',
      `"${candidate}" is a real address and must be kept`,
    );
  }
});

test('address components are split without inventing missing ones', () => {
  const parts = parseAddressParts('4105 Irons Rd, Scio, NY 14880');
  assert.equal(parts.street, '4105 Irons Rd');
  assert.equal(parts.city, 'Scio');
  assert.equal(parts.state, 'NY');
  assert.equal(parts.zip, '14880');

  const sparse = parseAddressParts('1012 20th Ave');
  assert.equal(sparse.street, '1012 20th Ave');
  assert.equal(sparse.city, undefined, 'a city must not be guessed when the input has none');
});

/* -------------------------- Official site choice -------------------------- */

function hit(url: string, title: string): SearchHit {
  return { url, title, snippet: '', engine: 'duckduckgo' };
}

test('an organisation that shares only the generic words is refused', () => {
  // "Chautauqua County Stockyards" matches two of its three words against the
  // Chautauqua County government site. Accepting that on a simple majority
  // yielded a confident page of county switchboard numbers for a stockyard.
  const hits = [
    hit('https://chautauquacountyny.gov/carts/Contact-Us', 'Contact Us | Chautauqua County, NY'),
    hit('https://chautauquacountyny.gov/contact', 'Chautauqua County Government'),
  ];

  assert.equal(
    pickOfficialSiteFromSearch(hits, 'Chautauqua County Stockyards Ll', { stateCode: 'NY' }),
    null,
    'the word that says what the business is must be present, not just its surroundings',
  );
});

test('the word naming the business has to appear, but the rest need not', () => {
  const hits = [hit('https://knoxgolfusa.com/', 'Knox Golf Academy - Saint James NY')];
  const pick = pickOfficialSiteFromSearch(hits, 'Knox Golf Academy', { stateCode: 'NY' });

  assert.equal(pick?.url, 'https://knoxgolfusa.com/', 'a title naming the business is enough when the domain differs');
});

test('the domain that carries the business name wins', () => {
  const hits = [
    hit('https://www.yelp.com/biz/jarboe-motors', 'Jarboe Motors - Westminster, MD - Yelp'),
    hit('https://www.jarboemotors.com/', 'Jarboe Motors LLC'),
  ];
  const pick = pickOfficialSiteFromSearch(hits, 'Jarboe Motors LLC', { stateCode: 'MD' });
  assert.equal(pick?.url, 'https://www.jarboemotors.com/');
});

test('a foreign country domain is not adopted for a business given a US location', () => {
  // "Premier Hr, Commerce CA" really does return the Croatian government,
  // because "hr" is a country domain. Answering with it would be confidently
  // wrong, which is worse than answering with nothing.
  const hits = [
    hit('http://www.vlada.hr/', 'Naslovna'),
    hit('https://premierhr.example/', 'Premier HR — Commerce, California'),
  ];
  const pick = pickOfficialSiteFromSearch(hits, 'Premier Hr', { stateCode: 'CA' });
  assert.notEqual(pick?.url, 'http://www.vlada.hr/');
  assert.equal(pick?.url, 'https://premierhr.example/');
});

test('an unrelated result is refused rather than returned as the official site', () => {
  const hits = [
    hit('https://www.somethingelse.example/news/2026', 'Local news roundup'),
    hit('https://www.anotherthing.example/', 'Gardening supplies'),
  ];
  assert.equal(pickOfficialSiteFromSearch(hits, 'Northwind Traders', { stateCode: 'NY' }), null);
});

test('a title that names the business is enough when the domain does not', () => {
  const hits = [hit('https://www.ntl-group.example/', 'Northwind Traders — wholesale supply')];
  const pick = pickOfficialSiteFromSearch(hits, 'Northwind Traders', { stateCode: 'NY' });
  assert.equal(pick?.url, 'https://www.ntl-group.example/');
});

test('directories and social networks are never taken as the official site', () => {
  const hits = [
    hit('https://www.facebook.com/northwindtraders', 'Northwind Traders | Facebook'),
    hit('https://www.yelp.com/biz/northwind-traders', 'Northwind Traders - Yelp'),
    hit('https://www.linkedin.com/company/northwind-traders', 'Northwind Traders | LinkedIn'),
  ];
  assert.equal(pickOfficialSiteFromSearch(hits, 'Northwind Traders', { stateCode: 'NY' }), null);
});

/* ------------------------------- Planning -------------------------------- */

test('each kind of input is read as the right kind of lookup', () => {
  const cases: Array<[string, string]> = [
    ['stripe.com', 'domain_direct'],
    ['https://www.basecamp.com/about', 'url_direct'],
    ['https://www.facebook.com/bluebottle', 'facebook_page'],
    ['(510) 653-3394', 'phone_first'],
    ['hello@northwind.example', 'email_first'],
    ['Blue Bottle Coffee, Oakland CA', 'location_constrained'],
    ['4105 Irons Rd, Scio, NY 14880', 'address_first'],
    ['Northwind Traders', 'company_search'],
  ];
  for (const [input, expected] of cases) {
    const context = inferContext(input);
    assert.equal(detectQueryType(input, context), expected, `"${input}" should be ${expected}`);
  }
});

test('context is read from the input and never invented', () => {
  const context = inferContext('Blue Bottle Coffee, Oakland CA');
  assert.equal(context.city, 'Oakland');
  assert.equal(context.state, 'CA');
  assert.equal(context.companyName, 'Blue Bottle Coffee');

  const bare = inferContext('Northwind Traders');
  assert.equal(bare.city, undefined);
  assert.equal(bare.state, undefined);
  assert.equal(bare.domain, undefined);
});

test('a plan is ordered, non-empty and explains itself', () => {
  const plan = planQuery('Blue Bottle Coffee, Oakland CA');
  assert.ok(plan.routes.length > 0);
  assert.deepEqual(plan.routes.map((route) => route.order), plan.routes.map((_, index) => index + 1));
  assert.ok(plan.notes.length > 0);
  assert.equal(plan.queryType, 'location_constrained');
});

test('a domain input plans fewer discovery routes than a bare name', () => {
  const direct = planQuery('stripe.com');
  const search = planQuery('Some Company Nobody Has Heard Of');
  assert.ok(
    direct.routes.length <= search.routes.length,
    'knowing the domain should not require more discovery work',
  );
});

test('every query type has a label for the interface', () => {
  for (const [type, label] of Object.entries(QUERY_TYPE_LABELS)) {
    assert.ok(label.length > 0, `${type} needs a label`);
  }
});

test('a protected identifier in a typed query is redacted before planning', () => {
  const plan = planQuery('Northwind Traders 078-64-1091');
  assert.equal(JSON.stringify(plan).includes('078-64-1091'), false);
});

/*
 * A search engine returns the page that matched, which is rarely the front
 * door. The crawler has to treat the origin as the site and the matched page
 * as the first thing worth reading, or a run resolves the business name to
 * "Contact" and never opens the real contact page.
 */
test('the same page reached by two links is only fetched once', () => {
  const targets = [
    { url: 'https://example.com/about', label: 'the About page', weight: 8 },
    { url: 'https://example.com/about/', label: 'the About page', weight: 8 },
    { url: 'https://example.com/contact', label: 'the Contact page', weight: 10 },
  ];

  const kept = __officialSite.dedupeTargets(targets);
  assert.equal(kept.length, 2, 'a duplicate link must not consume a second fetch');
  assert.equal(kept[0].label, 'the Contact page', 'the contact page keeps precedence');
});

test('a header and footer copy of the about page cannot crowd out the contact page', () => {
  const targets = [
    { url: 'https://example.com/about-us', label: 'the About page', weight: 8 },
    { url: 'https://example.com/company/about', label: 'the About page', weight: 8 },
    { url: 'https://example.com/contact-us', label: 'the Contact page', weight: 10 },
  ];

  const kept = __officialSite.dedupeTargets(targets).slice(0, 2);
  assert.ok(
    kept.some((target) => target.label === 'the Contact page'),
    'two renderings of one page must not take both crawl slots',
  );
});

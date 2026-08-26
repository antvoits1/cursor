import test from 'node:test';
import assert from 'node:assert/strict';
import { labelToLineType, resolveLineType, scoreReachability } from '../server/lineType.js';
import { parseSectionedProfile } from '../server/sources/peopleSearch.js';
import { __testing as __numberingPlan, seedBlockOwner } from '../server/numberingPlan.js';

/*
 * Whether a number is a mobile or a landline is the question these tests exist
 * to protect. The engine is allowed to be unsure; it is not allowed to be
 * confidently wrong, and it is not allowed to answer without saying why.
 */

test('a label published by a records source outweighs the numbering plan', () => {
  // A number in a range the plan calls fixed line, that a records source says
  // is wireless. Portability means the records source is right far more often.
  const verdict = resolveLineType({
    number: '+12125550123',
    publishedLabel: 'Wireless',
    publishedLabelSourceUrl: 'https://www.truepeoplesearch.com/find/person/x',
  });

  assert.equal(verdict.type, 'MOBILE');
  assert.ok(verdict.confidence > 40, 'a published carrier label should carry real confidence');
  assert.match(verdict.basis, /labels this number/i);
  assert.equal(verdict.signals[0].source, 'people_search_label');
  assert.equal(
    verdict.signals[0].sourceUrl,
    'https://www.truepeoplesearch.com/find/person/x',
    'the verdict must stay traceable to the page that made the claim',
  );
});

test('a mobile-only carrier settles the line type', () => {
  const verdict = resolveLineType({ number: '+13055550147', carrier: 'Verizon Wireless' });
  assert.equal(verdict.type, 'MOBILE');
  assert.match(verdict.basis, /mobile network/i);
});

test('a VoIP reseller is reported as VoIP rather than as a mobile', () => {
  const verdict = resolveLineType({ number: '+14155550188', carrier: 'Bandwidth.com CLEC' });
  assert.equal(verdict.type, 'VOIP');
});

test('a toll-free number is recognised without consulting anything else', () => {
  const verdict = resolveLineType({ number: '+18005550100', publishedLabel: 'Wireless' });
  assert.equal(verdict.type, 'TOLL_FREE', 'an 800 number is never an individual mobile, whatever a page claims');
  assert.equal(verdict.signals.length, 1);
});

test('a number with nothing to go on is left unknown instead of guessed', () => {
  const verdict = resolveLineType({ number: '+15075550123' });
  if (verdict.type !== 'UNKNOWN') {
    // The plan may know something in some locales; if it spoke, it must have
    // said so quietly rather than claiming certainty.
    assert.ok(verdict.confidence < 40, 'numbering-plan metadata alone must not produce a confident verdict');
    return;
  }
  assert.equal(verdict.confidence, 0);
  assert.match(verdict.basis, /left unstated rather than guessed/i);
});

test('signals that disagree lower the confidence and are both reported', () => {
  const agreed = resolveLineType({
    number: '+13055550147',
    publishedLabel: 'Wireless',
    carrier: 'T-Mobile USA',
  });
  const disputed = resolveLineType({
    number: '+13055550147',
    publishedLabel: 'Wireless',
    carrier: 'CenturyLink',
  });

  assert.equal(agreed.type, 'MOBILE');
  assert.ok(
    disputed.confidence < agreed.confidence,
    'a contradicted verdict must be less confident than a corroborated one',
  );
  assert.match(disputed.basis, /disagreed/i, 'the disagreement must be surfaced, not hidden');
});

test('page wording is read but weighed below a carrier record', () => {
  assert.equal(resolveLineType({ number: '+13055550147', context: 'Cell: (305) 555-0147' }).type, 'MOBILE');
  assert.equal(resolveLineType({ number: '+13055550147', context: 'Main line (305) 555-0147' }).type, 'LANDLINE');

  const contextOnly = resolveLineType({ number: '+13055550147', context: 'Mobile' });
  const withCarrier = resolveLineType({ number: '+13055550147', context: 'Mobile', carrier: 'AT&T Mobility' });
  assert.ok(withCarrier.confidence > contextOnly.confidence, 'a carrier record should strengthen a context reading');
});

test('published labels are read in the wordings these sites actually use', () => {
  assert.equal(labelToLineType('Wireless'), 'MOBILE');
  assert.equal(labelToLineType('Cell Phone'), 'MOBILE');
  assert.equal(labelToLineType('Landline'), 'LANDLINE');
  assert.equal(labelToLineType('Home Phone'), 'LANDLINE');
  assert.equal(labelToLineType('Non-Fixed VOIP'), 'VOIP');
  assert.equal(labelToLineType('Sales department'), null, 'an unrelated phrase must not be read as a line type');
});

test('reachability ranks a current mobile above a corroborated landline', () => {
  const mobile = scoreReachability({ lineType: 'MOBILE', lineTypeConfidence: 90, agreementCount: 1, recency: 'current' });
  const landline = scoreReachability({ lineType: 'LANDLINE', lineTypeConfidence: 90, agreementCount: 3 });

  assert.ok(mobile.score > landline.score, 'a mobile that reaches a person beats a landline that reaches a desk');
  assert.ok(mobile.basis.some((line) => /mobile line/i.test(line)));
});

test('a number a source calls previous is pushed down the ranking', () => {
  const current = scoreReachability({ lineType: 'MOBILE', lineTypeConfidence: 80, agreementCount: 1, recency: 'current' });
  const prior = scoreReachability({ lineType: 'MOBILE', lineTypeConfidence: 80, agreementCount: 1, recency: 'prior' });
  assert.ok(prior.score < current.score - 30, 'an old number must not outrank a current one');
});

test('a fax line scores as unreachable however well corroborated it is', () => {
  const fax = scoreReachability({ lineType: 'LANDLINE', lineTypeConfidence: 99, agreementCount: 5, isFax: true });
  assert.ok(fax.score < 10);
  assert.match(fax.basis[0], /fax/i);
});

test('every verdict carries the reasoning that produced it', () => {
  const verdict = resolveLineType({ number: '+13055550147', publishedLabel: 'Wireless', carrier: 'T-Mobile' });
  assert.ok(verdict.basis.length > 20, 'the basis must be a sentence an operator can read, not a code');
  for (const signal of verdict.signals) {
    assert.ok(signal.detail.length > 10, 'every signal explains itself');
    assert.ok(signal.weight > 0);
  }
});

/* --------------------------- profile parsing ------------------------------ */

const PROFILE_HTML = `
<html><body>
  <h1>Dana R Whitfield</h1>
  <p>Age 47</p>
  <h2>Phone Numbers</h2>
  <div><a href="tel:3055550147">(305) 555-0147</a> - Wireless</div>
  <div><a href="tel:3055550188">(305) 555-0188</a> - Landline</div>
  <h2>Email Addresses</h2>
  <div>dana.whitfield@whitfieldlaw.net</div>
  <h2>Current Address</h2>
  <div>1200 Brickell Ave, Miami, FL 33131</div>
  <h2>Previous Addresses</h2>
  <div>44 Palm Ct, Hialeah, FL 33010</div>
  <h2>Possible Relatives</h2>
  <div><a href="/find/person/y">Marcus Whitfield</a> 49</div>
</body></html>`;

test('a people-search profile yields every number with the type the page stated', () => {
  const profile = parseSectionedProfile(PROFILE_HTML, 'https://www.truepeoplesearch.com/find/person/x');

  assert.equal(profile.name, 'Dana R Whitfield');
  assert.equal(profile.age, 47);
  assert.equal(profile.phones.length, 2, 'both numbers must be kept, not just the first');
  assert.equal(profile.phones[0].label?.toLowerCase(), 'wireless');
  assert.equal(profile.phones[1].label?.toLowerCase(), 'landline');
  assert.equal(profile.phones[0].listedFirst, true);
  assert.ok(profile.emails.includes('dana.whitfield@whitfieldlaw.net'));
  assert.match(profile.currentAddress ?? '', /Brickell/);
});

test('a relative sharing the surname is called household, not asserted as a spouse', () => {
  const profile = parseSectionedProfile(PROFILE_HTML, 'https://www.truepeoplesearch.com/find/person/x');
  const marcus = profile.relatives.find((person) => person.name === 'Marcus Whitfield');

  assert.ok(marcus, 'relatives listed on the page must be captured');
  assert.equal(marcus?.relation, 'household', 'a shared surname is not proof of a marriage');
  assert.match(marcus?.profileUrl ?? '', /truepeoplesearch\.com/);
});

test('a page that says spouse is taken at its word', () => {
  const html = PROFILE_HTML.replace(
    '<h2>Possible Relatives</h2>',
    '<p>Dana is married to Marcus Whitfield.</p><h2>Possible Relatives</h2>',
  );
  const profile = parseSectionedProfile(html, 'https://www.truepeoplesearch.com/find/person/x');
  assert.equal(profile.relatives.find((person) => person.name === 'Marcus Whitfield')?.relation, 'spouse');
});

/*
 * The published block allocations are what turned "Type unknown" into a real
 * answer for ordinary business numbers, which no page ever labels. These tests
 * hold the two things that matter about that: the right thousands-block is
 * read out of the register, and portability keeps the verdict short of
 * certainty.
 */

test('the register record for the right thousands-block is the one used', () => {
  // One exchange split between a cable operator and a mobile carrier, which is
  // ordinary. Taking the first record rather than matching the block digit
  // would misclassify half the numbers in the exchange.
  const xml = `<root>
    <prefixdata><npa>631</npa><nxx>686</nxx><x>1</x><rc>St James</rc><region>NY</region>
      <company-name>CABLEVISION LIGHTPATH, INC. - NY</company-name><company-type>C</company-type></prefixdata>
    <prefixdata><npa>631</npa><nxx>686</nxx><x>9</x><rc>St James</rc><region>NY</region>
      <company-name>T-MOBILE USA, INC.</company-name><company-type>W</company-type></prefixdata>
  </root>`;

  assert.equal(__numberingPlan.ownerFromXml(xml, '9')?.carrier, 'T-MOBILE USA, INC.');
  assert.equal(__numberingPlan.ownerFromXml(xml, '9')?.operator, 'wireless');
  assert.equal(__numberingPlan.ownerFromXml(xml, '1')?.operator, 'competitive');
});

test('a number allocated to a wireless carrier is reported as mobile, but not as certain', () => {
  seedBlockOwner('+16316869123', {
    carrier: 'T-MOBILE USA, INC.',
    operator: 'wireless',
    rateCenter: 'St James',
    region: 'NY',
  });

  const verdict = resolveLineType({ number: '+16316869123' });
  assert.equal(verdict.type, 'MOBILE');
  assert.ok(verdict.confidence > 20, 'the block allocation is real evidence and should register as such');
  assert.ok(verdict.confidence < 90, 'portability means an allocation is never proof');
  assert.match(verdict.basis, /ported away/i, 'the caveat belongs in the answer, not only in the code');
  assert.equal(verdict.carrier, 'T-MOBILE USA, INC.');
});

test('an incumbent local carrier means landline', () => {
  seedBlockOwner('+16032230003', { carrier: 'CONSOLIDATED COMM OF NO. NEW ENGLAND-NH', operator: 'incumbent' });
  assert.equal(resolveLineType({ number: '+16032230003' }).type, 'LANDLINE');
});

test('a page that calls the number a mobile outweighs a landline allocation', () => {
  seedBlockOwner('+14105550111', { carrier: 'VERIZON MARYLAND, INC.', operator: 'incumbent' });
  const verdict = resolveLineType({
    number: '+14105550111',
    publishedLabel: 'Wireless',
    context: 'Cell: (410) 555-0111',
  });

  assert.equal(verdict.type, 'MOBILE', 'a carrier-data label plus page wording beats the original allocation');
  assert.match(verdict.basis, /a weaker signal disagreed/i, 'the disagreement has to be visible');
});

test('a number the register knows nothing about stays unknown rather than guessed', () => {
  seedBlockOwner('+12065550100', null);
  const verdict = resolveLineType({ number: '+12065550100' });
  assert.equal(verdict.type, 'UNKNOWN');
  assert.equal(verdict.confidence, 0);
});

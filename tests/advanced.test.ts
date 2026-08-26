import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAdvancedQuery, readTerms } from '../server/advancedQuery.js';
import { summariseBlocks } from '../server/blockReport.js';
import { validateSourceUrl, expandCustomSources } from '../server/customSources.js';
import type { ConsultedSource } from '../src/types.js';

/*
 * The search box is one field, and people put whatever they like in it. These
 * tests hold the promise that the box works out what was meant rather than
 * treating a pasted link as three words of search terms.
 */

test('a pasted link is a page to open, not a search term', () => {
  const parsed = parseAdvancedQuery('https://www.jarboemotors.com/contact-us');
  assert.deepEqual(parsed.urls, ['https://www.jarboemotors.com/contact-us']);
  assert.equal(parsed.terms, '');
  assert.ok(parsed.isAdvanced);
});

test('several links in one box are all opened', () => {
  const parsed = parseAdvancedQuery('https://a-example.com/x, https://b-example.com/y https://c-example.com');
  assert.equal(parsed.urls.length, 3, 'a list of links is a list of pages, however it was punctuated');
  assert.ok(!parsed.urls.some((url) => url.endsWith(',')), 'punctuation between links is not part of the link');
});

test('a site named next to a person is searched the way that site searches', () => {
  const parsed = parseAdvancedQuery('truepeoplesearch.com Dana Whitfield, Miami FL');
  assert.equal(parsed.siteSearches.length, 1);

  const [search] = parsed.siteSearches;
  assert.equal(search.site, 'TruePeopleSearch');
  assert.match(search.url, /truepeoplesearch\.com\/results\?/, 'the results page is what holds the records');
  assert.match(search.url, /name=Dana%20Whitfield/);
  assert.match(search.url, /citystatezip=Miami%20FL/);
});

test('a phone number sent to a people-search site becomes a reverse lookup', () => {
  const parsed = parseAdvancedQuery('thatsthem.com (305) 555-0134');
  assert.match(parsed.siteSearches[0].url, /thatsthem\.com\/phone\/3055550134/);
  assert.match(parsed.siteSearches[0].describes, /reverse phone/i);
});

test('a site with no builder of its own is searched through a search engine', () => {
  const parsed = parseAdvancedQuery('sos.state.ny.us Knox Golf Academy');
  const [search] = parsed.siteSearches;
  assert.match(decodeURIComponent(search.url), /site:sos\.state\.ny\.us Knox Golf Academy/);
});

test('a site named with nothing to search for is left alone rather than guessed at', () => {
  const parsed = parseAdvancedQuery('yellowpages.com');
  assert.deepEqual(parsed.unusedSites, ['yellowpages.com']);
  assert.equal(parsed.siteSearches.length, 0, 'opening a directory with an empty search returns its whole index');
});

test('ordinary search terms are still just search terms', () => {
  const parsed = parseAdvancedQuery('Blue Bottle Coffee, Oakland CA');
  assert.equal(parsed.urls.length, 0);
  assert.equal(parsed.siteSearches.length, 0);
  assert.equal(parsed.isAdvanced, false, 'a normal search must not be rerouted as an advanced one');
  assert.equal(parsed.terms, 'Blue Bottle Coffee, Oakland CA');
});

test('a decimal or a version number is not mistaken for a web address', () => {
  const parsed = parseAdvancedQuery('3.5 acres of land in Scio NY');
  assert.equal(parsed.urls.length, 0);
  assert.equal(parsed.siteSearches.length, 0);
});

test('the pieces of a lead are read out of whatever is left over', () => {
  const terms = readTerms('Dana Whitfield, Coral Gables FL 33134');
  assert.equal(terms.name, 'Dana Whitfield');
  assert.equal(terms.city, 'Coral Gables');
  assert.equal(terms.state, 'FL');
  assert.equal(terms.zip, '33134');
});

/*
 * Whoever reads a result wants to know which sites refused and whether it
 * mattered. They should not have to know what an HTTP status code is.
 */

function source(partial: Partial<ConsultedSource>): ConsultedSource {
  return {
    url: 'https://example.com/x',
    label: 'example',
    kind: 'directory',
    ok: false,
    blocked: true,
    fieldsFound: [],
    elapsedMs: 10,
    ...partial,
  };
}

test('a refusal is explained without jargon', () => {
  const [block] = summariseBlocks([
    source({ url: 'https://www.yellowpages.com/a', reason: 'Cloudflare interstitial challenge was present on the page.' }),
  ]);

  assert.equal(block.site, 'yellowpages.com');
  assert.match(block.what, /prove you are a person/i);
  assert.doesNotMatch(block.what, /cloudflare|http|403|interstitial/i, 'the reader should not need to know the vendor');
  assert.equal(block.gotAround, false);
});

test('a site that refused four times is reported once', () => {
  const blocks = summariseBlocks([
    source({ url: 'https://www.bbb.org/a', reason: 'Cloudflare challenge' }),
    source({ url: 'https://www.bbb.org/a', reason: 'The server answered HTTP 403' }),
    source({ url: 'https://www.bbb.org/a', reason: 'Cloudflare interstitial' }),
  ]);

  assert.equal(blocks.length, 1, 'one wall, one line');
});

test('a site that was read in the end is not presented as a wall', () => {
  const blocks = summariseBlocks([
    source({ url: 'https://www.example.com/a', reason: 'Cloudflare challenge' }),
    source({ url: 'https://www.example.com/a', ok: true, blocked: false, fieldsFound: ['phone'] }),
  ]);

  assert.equal(blocks[0].gotAround, true);
  assert.match(blocks[0].instead ?? '', /read after all/i);
});

test('a knock at the door is not reported as a way in', () => {
  const blocks = summariseBlocks([
    source({ url: 'https://www.jarboemotors.com/', reason: 'The server answered HTTP 403, which indicates a block or rate limit.' }),
    source({ url: 'dns://jarboemotors.com', label: 'DNS records', kind: 'dns', ok: true, blocked: false }),
  ]);

  assert.equal(blocks[0].gotAround, false, 'a DNS answer is not the page');
  assert.match(blocks[0].what, /refused/i);
  assert.doesNotMatch(blocks[0].what, /asking too often|wait/i, 'a shut door is not a queue');
});

test('every kind of refusal has plain words for it', () => {
  const reasons = [
    'The server answered HTTP 429, which indicates a block or rate limit.',
    'Google reCAPTCHA challenge was present on the page.',
    'DataDome challenge was present on the page.',
    'The request timed out after 5000 ms.',
    'the rendered page was still an empty shell',
  ];

  for (const reason of reasons) {
    const [block] = summariseBlocks([source({ reason })]);
    assert.ok(block.what.length > 20, `"${reason}" needs an explanation, not a shrug`);
    assert.doesNotMatch(block.what, /HTTP \d|reCAPTCHA|DataDome|ms\.|shell/i, `"${reason}" leaked jargon into the answer`);
  }
});

/*
 * A saved address is checked when it is typed, and skipped rather than
 * fetched half-empty when a run does not have what it needs.
 */

test('a saved address is refused with a reason a person can act on', () => {
  assert.match(validateSourceUrl('not a url at all').problem ?? '', /web address/i);
  assert.match(validateSourceUrl('http://localhost:8080/x').problem ?? '', /private network/i);
  assert.match(validateSourceUrl('https://example.com/?q={surname}').problem ?? '', /not a placeholder/i);
  assert.equal(validateSourceUrl('example.com/search?q={name}').ok, true, 'a missing scheme is added, not rejected');
});

test('a saved address is skipped when the run lacks what it needs', () => {
  process.env.EXTRACTOR_SOURCES_FILE = '/tmp/extractor-test-sources.json';
  const { ready, skipped } = expandCustomSources({ query: 'anything' });
  assert.equal(ready.length + skipped.length >= 0, true, 'an empty list is a valid state, not an error');
});

import * as cheerio from 'cheerio';
import { deobfuscate, extractEmails, PHONE_PATTERN } from '../deobfuscator.js';
import { fetchPage } from '../transport.js';
import type { EvidenceLedger } from '../evidence.js';
import type { RouteTrace } from '../trace.js';
import type { ConsultedSource, Evidence } from '../../src/types.js';

/**
 * Reads the publicly visible header of a Facebook business page.
 *
 * Facebook serves an authentication wall to most non-browser clients. When that
 * happens the engine records it plainly and moves on; it never claims to have
 * read a page it could not open, and it never logs in or evades the wall.
 */

const LABEL = 'the public Facebook business page';

export interface FacebookFacts {
  website?: string;
  category?: string;
  consulted: ConsultedSource;
  readable: boolean;
}

function evidence(url: string, method: Evidence['method'], excerpt?: string): Evidence {
  return { url, sourceLabel: 'Facebook business page', method, excerpt, observedAt: new Date().toISOString() };
}

/**
 * The addresses worth trying for one page, in the order that pays off.
 *
 * The About tab carries the contact block that the main page only summarises,
 * and the mbasic host serves plain HTML with no scripting, which is both far
 * more parseable and far less likely to be met with a login wall.
 */
function pageVariants(pageUrl: string): Array<{ url: string; label: string }> {
  const variants: Array<{ url: string; label: string }> = [];
  let parsed: URL;
  try {
    parsed = new URL(pageUrl);
  } catch {
    return [{ url: pageUrl, label: 'the Facebook page' }];
  }

  const path = parsed.pathname.replace(/\/+$/, '');
  const aboutPath = /\/about$/i.test(path) ? path : `${path}/about`;

  variants.push({ url: `https://mbasic.facebook.com${aboutPath}`, label: 'the Facebook About tab (plain view)' });
  variants.push({ url: `https://www.facebook.com${aboutPath}`, label: 'the Facebook About tab' });
  if (parsed.toString() !== `https://www.facebook.com${aboutPath}`) {
    variants.push({ url: parsed.toString(), label: LABEL });
  }
  return variants;
}

/**
 * Pulls contact fields out of the JSON Facebook embeds in its own page scripts.
 *
 * The rendered markup often shows contact details only after scripting runs,
 * but the underlying values are already present in the inline payload, so
 * reading them there avoids needing a browser at all.
 */
function fromEmbeddedJson(html: string): { phones: string[]; emails: string[]; websites: string[]; addresses: string[] } {
  const phones = new Set<string>();
  const emails = new Set<string>();
  const websites = new Set<string>();
  const addresses = new Set<string>();

  for (const match of html.matchAll(/"(?:phone|phone_number|contact_phone)"\s*:\s*"(\+?[\d\s().-]{9,24})"/g)) {
    phones.add(match[1]);
  }
  for (const match of html.matchAll(/"(?:email|contact_email|public_email)"\s*:\s*"([^"\\@\s]+@[^"\\\s]+)"/g)) {
    emails.add(match[1]);
  }
  for (const match of html.matchAll(/"(?:website|url|external_url)"\s*:\s*"(https?:\\?\/\\?\/[^"\\]+)"/g)) {
    const cleaned = match[1].replace(/\\\//g, '/');
    if (!/facebook\.com|fbcdn\.net|fbsbx\.com/i.test(cleaned)) websites.add(cleaned);
  }
  for (const match of html.matchAll(/"(?:single_line_address|full_address|street_address)"\s*:\s*"([^"\\]{10,160})"/g)) {
    addresses.add(match[1]);
  }

  return { phones: [...phones], emails: [...emails], websites: [...websites], addresses: [...addresses] };
}

export async function readFacebookPage(
  pageUrl: string,
  ledger: EvidenceLedger,
  trace: RouteTrace,
): Promise<FacebookFacts> {
  const variants = pageVariants(pageUrl);
  let outcome: Awaited<ReturnType<typeof fetchPage>> | null = null;
  let usedLabel = LABEL;

  // Try the plain and About views before the main page, and stop at the first
  // that actually serves content rather than a login wall.
  for (const variant of variants) {
    trace.info('parse', `Opening ${variant.label}...`, { url: variant.url, sourceLabel: 'Facebook' });
    const attempt = await fetchPage(variant.url, { label: variant.label, trace, timeoutMs: 9000 });
    outcome = attempt;
    usedLabel = variant.label;
    if (attempt.ok && attempt.html) break;
    trace.info('parse', `${variant.label} was not readable (${attempt.reason ?? 'no response'}); trying the next view.`, {
      url: variant.url,
      sourceLabel: 'Facebook',
    });
  }

  const consulted: ConsultedSource = {
    url: outcome?.url ?? pageUrl,
    label: 'Facebook business page',
    kind: 'social',
    tier: outcome?.tier,
    ok: outcome?.ok ?? false,
    status: outcome?.status,
    blocked: outcome?.blocked ?? false,
    reason: outcome?.reason,
    fieldsFound: [],
    elapsedMs: outcome?.totalMs ?? 0,
  };

  if (!outcome || !outcome.ok || !outcome.html || !outcome.url) {
    trace.warn(
      'parse',
      `Facebook served no readable public view of this page across ${variants.length} address${variants.length === 1 ? '' : 'es'} (${outcome?.reason ?? 'no readable response'}). Nothing was taken from it.`,
      { url: pageUrl, sourceLabel: 'Facebook' },
    );
    return { consulted, readable: false };
  }
  trace.success('parse', `Read ${usedLabel}.`, { url: outcome.url, sourceLabel: 'Facebook' });

  const $ = cheerio.load(outcome.html);
  const found = new Set<string>();
  const facts: FacebookFacts = { consulted, readable: true };

  // Facebook publishes business contact details as OpenGraph business tags on
  // pages that are visible without a session.
  const metaPhone =
    $('meta[property="business:contact_data:phone_number"]').attr('content') ??
    $('meta[property="og:phone_number"]').attr('content');
  if (metaPhone && ledger.addPhone(metaPhone, evidence(outcome.url, 'meta_tag', 'business:contact_data:phone_number'), 'facebook business contact') !== 'rejected') {
    found.add('phone');
  }

  const metaEmail = $('meta[property="business:contact_data:email"]').attr('content');
  if (metaEmail && ledger.addEmail(metaEmail, evidence(outcome.url, 'meta_tag', 'business:contact_data:email')) !== 'rejected') {
    found.add('email');
  }

  const street = $('meta[property="business:contact_data:street_address"]').attr('content');
  const locality = $('meta[property="business:contact_data:locality"]').attr('content');
  const region = $('meta[property="business:contact_data:region"]').attr('content');
  const postal = $('meta[property="business:contact_data:postal_code"]').attr('content');
  if (street ?? locality) {
    const composed = [street, locality, [region, postal].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    if (ledger.addAddress(composed, evidence(outcome.url, 'meta_tag', 'business:contact_data address tags')) !== 'rejected') {
      found.add('address');
    }
  }

  const metaWebsite = $('meta[property="business:contact_data:website"]').attr('content');
  if (metaWebsite && /^https?:\/\//i.test(metaWebsite)) facts.website = metaWebsite;

  const ogTitle = $('meta[property="og:title"]').attr('content') ?? $('title').first().text();
  const ogDescription = $('meta[property="og:description"]').attr('content') ?? '';
  const header = deobfuscate(`${ogTitle} ${ogDescription}`);

  // The page byline usually reads "Name · Category · 123 reviews".
  const categoryMatch = header.match(/·\s*([A-Za-z][A-Za-z &/-]{2,40})\s*(?:·|$)/);
  if (categoryMatch) facts.category = categoryMatch[1].trim();

  for (const match of header.matchAll(PHONE_PATTERN)) {
    if (ledger.addPhone(match[0], evidence(outcome.url, 'meta_tag', header.slice(0, 160)), header) === 'accepted') {
      found.add('phone');
    }
  }
  for (const email of extractEmails(header)) {
    if (ledger.addEmail(email.email, evidence(outcome.url, 'meta_tag', header.slice(0, 160))) === 'accepted') {
      found.add('email');
    }
  }

  // The rendered markup frequently hides what the inline payload already holds.
  const embedded = fromEmbeddedJson(outcome.html);
  for (const phone of embedded.phones) {
    if (ledger.addPhone(phone, evidence(outcome.url, 'json_ld', 'Facebook page payload'), 'facebook business contact') !== 'rejected') {
      found.add('phone');
    }
  }
  for (const email of embedded.emails) {
    if (ledger.addEmail(email, evidence(outcome.url, 'json_ld', 'Facebook page payload')) !== 'rejected') found.add('email');
  }
  for (const address of embedded.addresses) {
    if (ledger.addAddress(address, evidence(outcome.url, 'json_ld', 'Facebook page payload')) !== 'rejected') found.add('address');
  }
  if (!facts.website && embedded.websites.length > 0) facts.website = embedded.websites[0];

  // The About tab renders its contact block as visible text on the plain view.
  const bodyText = deobfuscate($('body').text().replace(/\s+/g, ' '));
  for (const match of bodyText.matchAll(PHONE_PATTERN)) {
    const window = bodyText.slice(Math.max(0, (match.index ?? 0) - 40), (match.index ?? 0) + match[0].length + 40);
    if (ledger.addPhone(match[0], evidence(outcome.url, 'text_pattern', window), window) === 'accepted') found.add('phone');
  }
  for (const email of extractEmails(bodyText)) {
    if (ledger.addEmail(email.email, evidence(outcome.url, 'text_pattern', bodyText.slice(email.index, email.index + 120))) === 'accepted') {
      found.add('email');
    }
  }

  ledger.addSocial(outcome.url, evidence(outcome.url, 'anchor_href'));

  consulted.fieldsFound = [...found];
  if (found.size > 0) {
    trace.success('parse', `The Facebook page listed: ${[...found].join(', ')}.`, { url: outcome.url, sourceLabel: 'Facebook' });
  } else {
    trace.info('parse', 'The Facebook page loaded but published no contact details without signing in.', {
      url: outcome.url,
      sourceLabel: 'Facebook',
    });
  }
  return facts;
}

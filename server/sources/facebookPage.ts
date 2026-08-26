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

export async function readFacebookPage(
  pageUrl: string,
  ledger: EvidenceLedger,
  trace: RouteTrace,
): Promise<FacebookFacts> {
  trace.info('parse', `Opening ${LABEL}...`, { url: pageUrl, sourceLabel: 'Facebook' });
  const outcome = await fetchPage(pageUrl, { label: LABEL, trace, timeoutMs: 9000 });

  const consulted: ConsultedSource = {
    url: pageUrl,
    label: 'Facebook business page',
    kind: 'social',
    tier: outcome.tier,
    ok: outcome.ok,
    status: outcome.status,
    blocked: outcome.blocked,
    reason: outcome.reason,
    fieldsFound: [],
    elapsedMs: outcome.totalMs,
  };

  if (!outcome.ok || !outcome.html || !outcome.url) {
    trace.warn(
      'parse',
      `Facebook did not serve a readable public page (${outcome.reason ?? 'no readable response'}). Nothing was taken from it.`,
      { url: pageUrl, sourceLabel: 'Facebook' },
    );
    return { consulted, readable: false };
  }

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

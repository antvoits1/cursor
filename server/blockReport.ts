import type { BlockReport, ConsultedSource } from '../src/types.js';

/**
 * What to tell someone about a site that would not let us in.
 *
 * The route already records this, but it records it in the vocabulary of the
 * thing that did the blocking: "Cloudflare interstitial", "HTTP 403",
 * "dynamic shell". That is exactly right for a log and exactly wrong for the
 * person reading the result, who wants to know three things and no more:
 * which site, what happened in plain words, and whether we got the
 * information anyway.
 *
 * So the raw reason is translated once, here, and the result carries a short
 * list rather than the whole route. One line per site, not one per attempt —
 * a site that refused four tiers refused once, as far as the reader is
 * concerned.
 */

interface Translation {
  match: RegExp;
  what: string;
}

const TRANSLATIONS: Translation[] = [
  {
    match: /turnstile|cloudflare|just a moment|checking your browser/i,
    what: 'The site put up a "prove you are a person" check before it would show the page.',
  },
  {
    match: /recaptcha|hcaptcha|captcha/i,
    what: 'The site asked for a picture puzzle to prove a person was asking.',
  },
  {
    match: /perimeterx|datadome|akamai|imperva|incapsula/i,
    what: 'The site uses a bot-blocking service, and it turned the request away.',
  },
  {
    match: /verify you are human|verification required|enable javascript and cookies/i,
    what: 'The site demanded proof that a person was asking before showing anything.',
  },
  // A status code is checked before the words around it, because the
  // classifier writes "403, which indicates a block or rate limit" and reading
  // that as a rate limit would tell someone to wait for a door that is shut.
  { match: /\b(401|403)\b/, what: 'The site refused to let us in at all.' },
  { match: /\b429\b|rate limit|too many requests/i, what: 'The site said we were asking too often and told us to wait.' },
  { match: /\b404\b/, what: 'The page is not there any more.' },
  { match: /\b(500|502|503|504)\b/, what: 'The site itself was broken or overloaded at the time.' },
  { match: /timed out|time budget|did not answer|deadline/i, what: 'The site was too slow to answer in the time allowed.' },
  { match: /javascript shell|empty shell|dynamic shell/i, what: 'The page builds itself in the browser, so there was nothing to read in what it sent.' },
  { match: /ssrf|reserved|private network/i, what: 'The address pointed somewhere private, so it was refused on purpose.' },
  { match: /certificate|tls|ssl/i, what: 'The site\u2019s security certificate could not be trusted.' },
  { match: /dns|could not be resolved|enotfound/i, what: 'That web address does not exist any more.' },
];

function plainWhat(reason: string | undefined, status: number | undefined): string {
  const haystack = `${reason ?? ''} ${status ?? ''}`;
  const found = TRANSLATIONS.find((t) => t.match.test(haystack));
  if (found) return found.what;
  if (reason) return 'The site did not return a readable page.';
  return 'The site could not be read.';
}

function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Turns the consulted-source record into one line per site that refused.
 *
 * `gotAround` is the part that matters most and the part it would be easiest
 * to fudge. It is true only when the same site was read by some other attempt,
 * or when a value from that site's search snippet was used instead. A blocked
 * site that contributed nothing says so.
 */
export function summariseBlocks(consulted: readonly ConsultedSource[]): BlockReport[] {
  const bySite = new Map<string, BlockReport>();

  for (const source of consulted) {
    if (!source.blocked && source.ok) continue;
    if (source.ok) continue;

    const site = siteName(source.url);
    const existing = bySite.get(site);
    const what = plainWhat(source.reason, source.status);

    if (existing) {
      if (source.fieldsFound.length > 0) {
        existing.gotAround = true;
        existing.instead = 'Some details were still read from the search result for that page.';
      }
      continue;
    }

    bySite.set(site, {
      site,
      what,
      gotAround: source.fieldsFound.length > 0,
      instead: source.fieldsFound.length > 0 ? 'Some details were still read from the search result for that page.' : undefined,
    });
  }

  // A site that was blocked on one attempt and read on another was not,
  // finally, a block: it is reported as worked around rather than as a wall.
  //
  // A DNS answer for the same hostname does not count. Knowing a domain has
  // mail records is not the same as having read the page, and saying we got in
  // when the door never opened is the one thing this report cannot do.
  for (const source of consulted) {
    if (!source.ok || source.kind === 'dns') continue;
    const entry = bySite.get(siteName(source.url));
    if (entry) {
      entry.gotAround = true;
      entry.instead = 'Another way in worked, so the page was read after all.';
    }
  }

  return [...bySite.values()].sort((a, b) => Number(a.gotAround) - Number(b.gotAround) || a.site.localeCompare(b.site));
}

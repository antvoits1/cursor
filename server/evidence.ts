import { classifyPhoneNumber } from './phoneClassifier.js';
import { resolveLineType, scoreReachability } from './lineType.js';
import { containsSensitiveValue } from '../src/lib/sensitive.js';
import type {
  AddressInfo,
  DnsIntelligence,
  EmailInfo,
  EmailKind,
  Evidence,
  OwnerInfo,
  PhoneInfo,
  RejectedValue,
  SocialLink,
} from '../src/types.js';

const ROLE_LOCALPARTS = new Set([
  'info', 'contact', 'hello', 'hi', 'sales', 'support', 'help', 'admin', 'office', 'team',
  'service', 'customerservice', 'enquiries', 'inquiries', 'mail', 'email', 'general', 'reception',
  'billing', 'accounts', 'accounting', 'orders', 'booking', 'bookings', 'reservations', 'careers',
  'jobs', 'hr', 'press', 'media', 'marketing', 'webmaster', 'postmaster', 'privacy', 'legal',
]);

const NON_CONTACT_LOCALPARTS = new Set([
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'bounce', 'bounces', 'mailer-daemon',
  'abuse', 'unsubscribe', 'notifications', 'notification', 'automated', 'robot',
]);

const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'live.com',
  'msn.com', 'comcast.net', 'me.com', 'mac.com', 'protonmail.com', 'proton.me', 'gmx.com',
  'ymail.com', 'att.net', 'verizon.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net', 'charter.net',
]);

const SOCIAL_HOSTS: Array<{ host: RegExp; platform: SocialLink['platform'] }> = [
  { host: /(^|\.)facebook\.com$|(^|\.)fb\.com$/i, platform: 'Facebook' },
  { host: /(^|\.)linkedin\.com$/i, platform: 'LinkedIn' },
  { host: /(^|\.)instagram\.com$/i, platform: 'Instagram' },
  { host: /(^|\.)(twitter|x)\.com$/i, platform: 'X' },
  { host: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i, platform: 'YouTube' },
  { host: /(^|\.)tiktok\.com$/i, platform: 'TikTok' },
];

const SOCIAL_NOISE_PATHS = [
  '/sharer', '/share', '/intent/', '/dialog/', '/plugins/', '/login', '/signup', '/tr?',
  '/help', '/policies', '/legal', '/privacy', '/terms', '/about/', '/settings',
];

/**
 * Handles belonging to the platform a site was built on. Every Wix site links
 * to Wix's own social accounts in its footer; reporting those as the business's
 * accounts attributes the vendor's presence to the customer.
 */
const VENDOR_SOCIAL_HANDLES = new Set([
  'wix', 'wixcom', 'squarespace', 'wordpress', 'wordpressdotcom', 'godaddy', 'shopify', 'weebly',
  'bigcommerce', 'webflow', 'duda', 'hubspot', 'mailchimp', 'yelp', 'google', 'facebook', 'instagram',
]);

const STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME',
  'MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI',
  'SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
]);

interface Candidate<T> {
  value: T;
  evidence: Evidence[];
  /** Distinct source URLs that reported this value. */
  sources: Set<string>;
}

function pushEvidence<T>(candidate: Candidate<T>, evidence: Evidence): void {
  candidate.sources.add(evidence.url);
  if (candidate.evidence.length < 8 && !candidate.evidence.some((e) => e.url === evidence.url && e.method === evidence.method)) {
    candidate.evidence.push(evidence);
  }
}

function rootDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  // Handles the common two-part public suffixes without a full PSL dependency.
  const twoPart = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'co.nz', 'com.br', 'co.za', 'com.mx']);
  const lastTwo = parts.slice(-2).join('.');
  return twoPart.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
}

function classifyEmailKind(email: string): EmailKind {
  const local = email.split('@')[0];
  if (local === 'sales' || local.startsWith('sales')) return 'sales';
  if (local === 'support' || local.startsWith('support') || local.startsWith('help')) return 'support';
  if (local === 'info' || local === 'contact' || local === 'hello') return 'info';
  if (ROLE_LOCALPARTS.has(local)) return 'role';
  if (/^[a-z]+[._-][a-z]+$/.test(local) || /^[a-z]\.[a-z]+$/.test(local)) return 'personal';
  return 'unknown';
}

/**
 * Collects every candidate value with its provenance, then resolves the final
 * output: duplicates merge, agreement across independent sources raises
 * confidence, and anything that fails validation is recorded with the reason it
 * was refused rather than silently dropped.
 */
const STREET_SUFFIXES =
  'st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|ter|terrace|cir|circle|pkwy|parkway|hwy|highway|sq|square|trl|trail|loop|row|walk|alley|plaza';

/**
 * A street-address regex run over page text will happily match prose that
 * merely contains a number and a word that looks like a street suffix — "000
 * More than RD", "259 W Santa Clara St in". Publishing those as addresses is
 * worse than publishing nothing, so a candidate has to look like an address all
 * the way through, not just at the start.
 *
 * Returns the reason the candidate is not an address, or null when it is fine.
 */
function addressShapeProblem(cleaned: string): string | null {
  const leadingNumber = cleaned.match(/^(\d+)/);
  if (leadingNumber && /^0+$/.test(leadingNumber[1])) {
    return 'The street number is all zeroes, so this is text that happens to start with digits rather than an address.';
  }

  const suffix = new RegExp(`\\b(?:${STREET_SUFFIXES})\\b\\.?`, 'i');
  const suffixMatch = cleaned.match(suffix);
  const hasZip = /\b\d{5}(?:-\d{4})?\b/.test(cleaned);
  if (!suffixMatch && !hasZip) {
    return 'The candidate carries neither a street type nor a postal code, so it cannot be confirmed as an address.';
  }

  // A phone number inside the candidate means two separate fields were captured
  // as one run of text, not that the address contains a phone number.
  if (/(?:\(\d{3}\)\s*|\b\d{3}[.\s-])\d{3}[.\s-]\d{4}\b/.test(cleaned)) {
    return 'The candidate runs a phone number together with an address, so the boundary between two fields was lost.';
  }

  // Anything after the street suffix has to be address material: an optional
  // unit, then either nothing or a comma-separated locality. Without that, the
  // trailing words are prose that ran on ("Santa Clara St in") or a truncated
  // capture ("Erie Street Ma", "Atlantic Blvd Suite M Co").
  if (suffixMatch?.index !== undefined) {
    const rawTail = cleaned.slice(suffixMatch.index + suffixMatch[0].length);
    let tail = rawTail.replace(/^[\s.,]+/, '');
    if (tail && !/^,/.test(rawTail.trimStart())) {
      // Consume one unit clause, e.g. "Ste M", "#100", "Apt 4B".
      tail = tail.replace(/^(?:#|ste|suite|apt|apartment|unit|bldg|building|floor|fl|rm|room)\.?\s*#?[\w-]+/i, '').replace(/^[\s.]+/, '');
      const remainderIsLocality = /^,/.test(tail) || /^[A-Z][A-Za-z.'’-]+,/.test(tail);
      const remainderIsStateAndZip = /^[A-Z]{2}\s+\d{5}(?:-\d{4})?$/.test(tail);
      if (tail && !remainderIsLocality && !remainderIsStateAndZip) {
        return `The text after the street type ("${tail.slice(0, 24)}") is neither a unit nor a comma-separated locality, so this is a fragment rather than an address.`;
      }
    }
  }

  // A real address is mostly proper nouns and numbers. A run of lowercase
  // function words means a sentence was captured.
  const functionWords = (cleaned.match(/\b(?:more|than|the|and|for|with|from|that|this|these|those|about|please|click|here|our|your)\b/gi) ?? []).length;
  if (functionWords >= 2) {
    return 'The candidate reads as a sentence rather than a postal address.';
  }

  return null;
}

/** What one source said about a number, beyond the digits themselves. */
export interface PhoneObservation {
  /** A word the page attached to the number, e.g. "Wireless", "Office". */
  publishedLabel?: string;
  carrier?: string;
  callerIdName?: string;
  recency?: 'current' | 'prior' | 'unknown';
  /** The source listed this first among a person's numbers. */
  listedFirst?: boolean;
}

interface PhoneHints {
  contexts: string[];
  publishedLabels: Array<{ label: string; sourceUrl: string }>;
  carriers: Array<{ carrier: string; sourceUrl: string }>;
  callerIdName?: string;
  recency?: 'current' | 'prior' | 'unknown';
  listedFirst: boolean;
}

export class EvidenceLedger {
  private readonly phones = new Map<string, Candidate<ReturnType<typeof classifyPhoneNumber>>>();
  private readonly emails = new Map<string, Candidate<string>>();
  private readonly addresses = new Map<string, Candidate<string>>();
  private readonly socials = new Map<string, Candidate<SocialLink>>();
  private owner: (Candidate<OwnerInfo> & { role?: string }) | null = null;
  private readonly rejections: RejectedValue[] = [];
  private readonly rejectedKeys = new Set<string>();

  /** Records a refusal once per distinct value/reason pair. */
  reject(field: RejectedValue['field'], value: string, reason: string, sourceUrl?: string): void {
    const key = `${field}|${value}|${reason}`;
    if (this.rejectedKeys.has(key)) return;
    this.rejectedKeys.add(key);
    if (this.rejections.length < 60) {
      this.rejections.push({ field, value, reason, sourceUrl });
    }
  }

  /**
   * Everything learned about a number's line type, accumulated across sources.
   *
   * The verdict is deliberately not decided here. A directory may label a number
   * "wireless" while the business's own site calls it an office line; both are
   * kept and weighed together once every source has been consulted.
   */
  private readonly lineTypeHints = new Map<string, PhoneHints>();

  addPhone(raw: string, evidence: Evidence, contextText = '', hints: PhoneObservation = {}): 'accepted' | 'rejected' | 'merged' {
    if (containsSensitiveValue(raw)) {
      this.reject('phone', '[withheld]', 'The value matched a protected identifier pattern and was discarded before use.', evidence.url);
      return 'rejected';
    }
    const classified = classifyPhoneNumber(raw, contextText);
    if (!classified) {
      this.reject('phone', String(raw).slice(0, 40), 'The digits do not form a valid North American or international number.', evidence.url);
      return 'rejected';
    }
    if (classified.isFax) {
      this.reject('phone', classified.formatted, 'The page labels this number as a fax line.', evidence.url);
      return 'rejected';
    }

    const collected = this.lineTypeHints.get(classified.number) ?? {
      contexts: [],
      publishedLabels: [],
      carriers: [],
      recency: undefined,
      listedFirst: false,
    };
    if (contextText.trim()) collected.contexts.push(contextText.slice(0, 240));
    if (hints.publishedLabel) collected.publishedLabels.push({ label: hints.publishedLabel, sourceUrl: evidence.url });
    if (hints.carrier) collected.carriers.push({ carrier: hints.carrier, sourceUrl: evidence.url });
    if (hints.callerIdName && !collected.callerIdName) collected.callerIdName = hints.callerIdName;
    // "Current" from any source outranks silence; "prior" only stands if nothing
    // ever called it current.
    if (hints.recency === 'current' || (hints.recency && !collected.recency)) collected.recency = hints.recency;
    collected.listedFirst = collected.listedFirst || Boolean(hints.listedFirst);
    this.lineTypeHints.set(classified.number, collected);

    const existing = this.phones.get(classified.number);
    if (existing) {
      pushEvidence(existing, evidence);
      if (existing.value && classified.lineTypeConfidence > existing.value.lineTypeConfidence) {
        existing.value = classified;
      }
      return 'merged';
    }
    this.phones.set(classified.number, { value: classified, evidence: [evidence], sources: new Set([evidence.url]) });
    return 'accepted';
  }

  addEmail(raw: string, evidence: Evidence): 'accepted' | 'rejected' | 'merged' {
    const email = String(raw ?? '').trim().toLowerCase();
    if (!email || !email.includes('@')) return 'rejected';
    const [local, domain] = email.split('@');
    if (!local || !domain) return 'rejected';

    if (NON_CONTACT_LOCALPARTS.has(local)) {
      this.reject('email', email, 'This is an automated mailbox that does not accept replies.', evidence.url);
      return 'rejected';
    }
    if (local.length > 64 || email.length > 254) {
      this.reject('email', email.slice(0, 40), 'The address is longer than the maximum permitted length.', evidence.url);
      return 'rejected';
    }
    if (/\.\./.test(email) || email.startsWith('.') || local.endsWith('.')) {
      this.reject('email', email, 'The address is not syntactically valid.', evidence.url);
      return 'rejected';
    }

    const existing = this.emails.get(email);
    if (existing) {
      pushEvidence(existing, evidence);
      return 'merged';
    }
    this.emails.set(email, { value: email, evidence: [evidence], sources: new Set([evidence.url]) });
    return 'accepted';
  }

  addAddress(raw: string, evidence: Evidence): 'accepted' | 'rejected' | 'merged' {
    const cleaned = String(raw ?? '')
      .replace(/\s+/g, ' ')
      .replace(/^[,\s]+|[,\s]+$/g, '')
      .trim();
    if (cleaned.length < 8 || cleaned.length > 160) {
      this.reject('address', cleaned.slice(0, 60), 'The candidate is too short or too long to be a postal address.', evidence.url);
      return 'rejected';
    }
    if (!/\d/.test(cleaned)) {
      this.reject('address', cleaned.slice(0, 60), 'The candidate has no street number or postal code.', evidence.url);
      return 'rejected';
    }
    const shapeProblem = addressShapeProblem(cleaned);
    if (shapeProblem) {
      this.reject('address', cleaned.slice(0, 60), shapeProblem, evidence.url);
      return 'rejected';
    }
    // Normalise for dedupe: case, punctuation and common abbreviations.
    const key = cleaned
      .toLowerCase()
      .replace(/[.,#]/g, '')
      .replace(/\b(street)\b/g, 'st')
      .replace(/\b(avenue)\b/g, 'ave')
      .replace(/\b(road)\b/g, 'rd')
      .replace(/\b(boulevard)\b/g, 'blvd')
      .replace(/\b(drive)\b/g, 'dr')
      .replace(/\b(suite)\b/g, 'ste')
      .replace(/\s+/g, ' ')
      .trim();

    const existing = this.addresses.get(key);
    if (existing) {
      pushEvidence(existing, evidence);
      // Prefer the longer rendering, which usually carries city/state/ZIP.
      if (cleaned.length > existing.value.length) existing.value = cleaned;
      return 'merged';
    }
    this.addresses.set(key, { value: cleaned, evidence: [evidence], sources: new Set([evidence.url]) });
    return 'accepted';
  }

  addSocial(rawUrl: string, evidence: Evidence): 'accepted' | 'rejected' | 'merged' {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl);
    } catch {
      return 'rejected';
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return 'rejected';

    const host = parsed.hostname.toLowerCase();
    const match = SOCIAL_HOSTS.find((s) => s.host.test(host));
    if (!match) return 'rejected';

    const pathAndQuery = `${parsed.pathname}${parsed.search}`.toLowerCase();
    if (SOCIAL_NOISE_PATHS.some((p) => pathAndQuery.includes(p))) {
      this.reject('social', parsed.toString().slice(0, 90), 'The link points at a share or login widget, not a profile.', evidence.url);
      return 'rejected';
    }
    if (parsed.pathname === '/' || parsed.pathname === '') {
      this.reject('social', parsed.toString(), 'The link points at the network homepage rather than a specific profile.', evidence.url);
      return 'rejected';
    }

    const canonical = `${parsed.protocol}//${host.replace(/^www\./, '')}${parsed.pathname.replace(/\/$/, '')}`;
    const handle = parsed.pathname.split('/').filter(Boolean).pop();

    if (handle && VENDOR_SOCIAL_HANDLES.has(handle.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
      this.reject(
        'social',
        canonical,
        'The account belongs to the platform the site was built on, not to the business.',
        evidence.url,
      );
      return 'rejected';
    }
    const existing = this.socials.get(canonical);
    if (existing) {
      pushEvidence(existing, evidence);
      return 'merged';
    }
    this.socials.set(canonical, {
      value: { platform: match.platform, url: canonical, handle, evidence: [] },
      evidence: [evidence],
      sources: new Set([evidence.url]),
    });
    return 'accepted';
  }

  addOwner(name: string, role: string | undefined, evidence: Evidence): 'accepted' | 'rejected' | 'merged' {
    const cleaned = String(name ?? '').replace(/\s+/g, ' ').trim();
    if (cleaned.length < 4 || cleaned.length > 60) {
      this.reject('owner', cleaned.slice(0, 40), 'The candidate name is an implausible length for a person.', evidence.url);
      return 'rejected';
    }
    if (!/^[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){1,3}$/.test(cleaned)) {
      this.reject('owner', cleaned.slice(0, 40), 'The candidate does not read as a personal name.', evidence.url);
      return 'rejected';
    }
    if (/\b(customer service|sales team|support team|the owner|our team|contact us)\b/i.test(cleaned)) {
      this.reject('owner', cleaned, 'The candidate is a department label, not a person.', evidence.url);
      return 'rejected';
    }

    if (this.owner && this.owner.value.name.toLowerCase() === cleaned.toLowerCase()) {
      pushEvidence(this.owner, evidence);
      if (role && !this.owner.value.role) this.owner.value.role = role;
      return 'merged';
    }
    if (this.owner) {
      this.reject('owner', cleaned, `A different principal (${this.owner.value.name}) was already supported by earlier evidence.`, evidence.url);
      return 'rejected';
    }
    this.owner = {
      value: { name: cleaned, role, confidence: 0, evidence: [] },
      evidence: [evidence],
      sources: new Set([evidence.url]),
    };
    return 'accepted';
  }

  hasPhones(): boolean {
    return this.phones.size > 0;
  }

  hasEmails(): boolean {
    return this.emails.size > 0;
  }

  hasAddress(): boolean {
    return this.addresses.size > 0;
  }

  hasOwner(): boolean {
    return this.owner !== null;
  }

  counts(): { phones: number; emails: number; addresses: number; socials: number; owners: number } {
    return {
      phones: this.phones.size,
      emails: this.emails.size,
      addresses: this.addresses.size,
      socials: this.socials.size,
      owners: this.owner ? 1 : 0,
    };
  }

  /**
   * Every number collected so far, in E.164.
   *
   * Exposed so a caller can resolve carrier data for the whole set in one
   * batch before `resolve` settles the verdicts, which keeps `resolve` itself
   * synchronous and free of network access.
   */
  phoneNumbers(): string[] {
    return [...this.phones.values()].map((c) => c.value?.number).filter((n): n is string => Boolean(n));
  }

  /**
   * Produces the final, ranked values. Confidence is derived from how many
   * independent sources agreed and how the value was located — never from a
   * fixed optimistic baseline.
   */
  resolve(officialWebsite: string, dns: DnsIntelligence | null): {
    phones: PhoneInfo[];
    emails: EmailInfo[];
    addresses: AddressInfo[];
    socials: SocialLink[];
    owner?: OwnerInfo;
    rejected: RejectedValue[];
  } {
    const siteDomain = officialWebsite ? rootDomain(safeHost(officialWebsite)) : '';

    const methodWeight: Record<Evidence['method'], number> = {
      json_ld: 30,
      microdata: 26,
      meta_tag: 24,
      anchor_href: 28,
      text_pattern: 16,
      search_snippet: 10,
      dns_record: 20,
    };

    const scoreFor = (evidence: Evidence[], sources: number): number => {
      const best = Math.max(...evidence.map((e) => methodWeight[e.method] ?? 10));
      const agreement = Math.min((sources - 1) * 18, 40);
      return Math.min(30 + best + agreement, 99);
    };

    const phones: PhoneInfo[] = [...this.phones.values()]
      .filter((c): c is Candidate<NonNullable<ReturnType<typeof classifyPhoneNumber>>> => c.value !== null)
      .map((c) => {
        const hints = this.lineTypeHints.get(c.value.number);
        // The line type is decided here, once, from everything every source
        // said about the number — not from whichever source happened to be read
        // last.
        const verdict = resolveLineType({
          number: c.value.number,
          context: hints?.contexts.join(' ') || undefined,
          publishedLabel: hints?.publishedLabels[0]?.label,
          publishedLabelSourceUrl: hints?.publishedLabels[0]?.sourceUrl,
          carrier: hints?.carriers[0]?.carrier ?? c.value.carrier,
          carrierSourceUrl: hints?.carriers[0]?.sourceUrl,
        });
        const reach = scoreReachability({
          lineType: verdict.type,
          lineTypeConfidence: verdict.confidence,
          agreementCount: c.sources.size,
          recency: hints?.recency,
          listedFirst: hints?.listedFirst,
          isFax: c.value.isFax,
        });

        return {
          number: c.value.number,
          formatted: c.value.formatted,
          type: verdict.type,
          lineTypeConfidence: verdict.confidence,
          lineTypeBasis: verdict.basis,
          lineTypeSignals: verdict.signals,
          carrier: verdict.carrier ?? c.value.carrier,
          callerIdName: hints?.callerIdName,
          location: c.value.location,
          timezone: c.value.timezone,
          country: c.value.country,
          agreementCount: c.sources.size,
          confidence: scoreFor(c.evidence, c.sources.size),
          reachabilityScore: reach.score,
          reachabilityBasis: reach.basis,
          rank: 0,
          recency: hints?.recency,
          evidence: c.evidence,
        };
      })
      // Ranked by how likely each number is to reach the person, which is the
      // question the operator is actually asking.
      .sort((a, b) => b.reachabilityScore - a.reachabilityScore || b.confidence - a.confidence);
    phones.forEach((phone, index) => {
      phone.rank = index + 1;
    });

    const emails: EmailInfo[] = [];
    for (const candidate of this.emails.values()) {
      const email = candidate.value;
      const domain = email.split('@')[1];
      const emailRoot = rootDomain(domain);
      const domainMatchesWebsite = Boolean(siteDomain) && emailRoot === siteDomain;
      const isFreeMail = FREE_MAIL_DOMAINS.has(domain);

      // An address on an unrelated corporate domain is almost always another
      // company's contact (an agency, a vendor, a CMS). Free mailboxes are kept
      // because small businesses genuinely use them.
      if (siteDomain && !domainMatchesWebsite && !isFreeMail) {
        this.reject(
          'email',
          email,
          `The domain ${domain} does not match the resolved website ${siteDomain}, so it likely belongs to a different organisation.`,
          candidate.evidence[0]?.url,
        );
        continue;
      }

      let deliverability: EmailInfo['deliverability'] = 'unknown';
      let deliverabilityBasis = 'No mail records were inspected for this domain.';
      if (dns && dns.domain === emailRoot) {
        if (dns.hasValidMx && dns.hasSpf && dns.hasDmarc) {
          deliverability = 'high';
          deliverabilityBasis = `${dns.domain} publishes MX, SPF and DMARC records${dns.mailProvider ? ` (${dns.mailProvider})` : ''}.`;
        } else if (dns.hasValidMx) {
          deliverability = 'medium';
          deliverabilityBasis = `${dns.domain} publishes MX records${dns.mailProvider ? ` (${dns.mailProvider})` : ''} but not a complete SPF and DMARC pair.`;
        } else {
          deliverability = 'low';
          deliverabilityBasis = `${dns.domain} publishes no MX record, so mail to it is unlikely to be delivered.`;
        }
      } else if (isFreeMail) {
        deliverability = 'medium';
        deliverabilityBasis = `${domain} is a consumer mail provider with working mail servers, but the mailbox itself was not verified.`;
      }

      const base = scoreFor(candidate.evidence, candidate.sources.size);
      const adjusted = Math.max(
        10,
        Math.min(99, base + (domainMatchesWebsite ? 8 : 0) + (deliverability === 'high' ? 4 : deliverability === 'low' ? -20 : 0)),
      );

      emails.push({
        email,
        kind: classifyEmailKind(email),
        domain,
        domainMatchesWebsite,
        deliverability,
        deliverabilityBasis,
        // Filled in by the verifier once the mail checks have run. Until then
        // it reports honestly that nothing has been checked.
        verification: {
          syntaxValid: true,
          domainHasMx: dns && dns.domain === domain ? dns.hasValidMx : null,
          hasSpf: dns && dns.domain === domain ? dns.hasSpf : null,
          hasDmarc: dns && dns.domain === domain ? dns.hasDmarc : null,
          disposable: false,
          roleAccount: classifyEmailKind(email) === 'role',
          catchAll: null,
          smtpAccepted: null,
          verdict: 'unverifiable',
          basis: ['The mail checks have not been run for this address yet.'],
        },
        agreementCount: candidate.sources.size,
        confidence: adjusted,
        evidence: candidate.evidence,
      });
    }
    emails.sort((a, b) => b.confidence - a.confidence || a.email.localeCompare(b.email));

    const addresses: AddressInfo[] = mergeSubsumedAddresses(
      [...this.addresses.values()]
        .map((c) => {
          const parts = parseAddressParts(c.value);
          return {
            full: c.value,
            ...parts,
            agreementCount: c.sources.size,
            confidence: scoreFor(c.evidence, c.sources.size),
            evidence: c.evidence,
          };
        })
        .sort((a, b) => b.confidence - a.confidence || b.full.length - a.full.length),
    );

    const socials: SocialLink[] = [...this.socials.values()]
      .map((c) => ({ ...c.value, evidence: c.evidence }))
      .sort((a, b) => a.platform.localeCompare(b.platform));

    let owner: OwnerInfo | undefined;
    if (this.owner) {
      owner = {
        name: this.owner.value.name,
        role: this.owner.value.role,
        confidence: scoreFor(this.owner.evidence, this.owner.sources.size),
        evidence: this.owner.evidence,
      };
    }

    return { phones, emails, addresses, socials, owner, rejected: this.rejections };
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * The house number and street, with everything else stripped away.
 *
 * Two renderings of one address only agree on this much: a directory writes
 * "72 N Main St, Concord, NH 03301", a map listing writes "72 N Main St", and
 * a snippet cut off mid-line writes "72 N Main St, Ste". They are one place.
 */
function streetKey(full: string): string {
  const cleaned = full
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const match = cleaned.match(/^(\d+[a-z]?)\s+(.+)$/);
  if (!match) return cleaned;

  const [, number, rest] = match;
  // The street name ends at the street type; anything after it is a unit, a
  // locality, or the tail of a truncated snippet.
  const street = rest.split(
    /\b(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|ter|terrace|cir|circle|pkwy|parkway|hwy|highway|sq|square|trl|trail|loop)\b/,
  )[0];
  return `${number} ${street.trim()}`;
}

/**
 * Folds partial renderings of one address into the fullest of them.
 *
 * Listing "2250 S Atlantic Blvd", "2250 S Atlantic Blvd, Commerce, CA 90040"
 * and "2250 S Atlantic Blvd, Ste" as three findings is not three findings; it
 * is one address reported three ways, and it makes a clean result look like a
 * noisy one. The fullest rendering is kept and the others are folded into it,
 * carrying their evidence with them so the agreement count reflects every
 * source that reported the place.
 */
export function mergeSubsumedAddresses(addresses: AddressInfo[]): AddressInfo[] {
  const groups = new Map<string, AddressInfo[]>();
  for (const address of addresses) {
    const key = streetKey(address.full);
    const group = groups.get(key);
    if (group) group.push(address);
    else groups.set(key, [address]);
  }

  const merged: AddressInfo[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }

    // "Fullest" means the most components resolved, not the longest string: a
    // truncated snippet can be longer than a clean, complete address.
    const best = [...group].sort((a, b) => {
      const score = (item: AddressInfo) => Number(Boolean(item.city)) + Number(Boolean(item.state)) + Number(Boolean(item.zip));
      return score(b) - score(a) || b.confidence - a.confidence || b.full.length - a.full.length;
    })[0];

    const sources = new Set<string>();
    const evidence = [];
    for (const item of group) {
      for (const record of item.evidence) {
        sources.add(record.url);
        evidence.push(record);
      }
    }

    merged.push({
      ...best,
      agreementCount: sources.size,
      confidence: Math.max(...group.map((item) => item.confidence)),
      evidence,
    });
  }

  return merged.sort((a, b) => b.confidence - a.confidence || b.full.length - a.full.length);
}

/** Splits a formatted US address into components without guessing missing ones. */
export function parseAddressParts(full: string): {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
} {
  const out: { street?: string; city?: string; state?: string; zip?: string; country?: string } = {};
  const zipMatch = full.match(/\b(\d{5})(?:-\d{4})?\b\s*$/) ?? full.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipMatch) out.zip = zipMatch[1];

  const stateMatch = full.match(/,\s*([A-Z]{2})\b/) ?? full.match(/\b([A-Z]{2})\s+\d{5}\b/);
  if (stateMatch && STATE_CODES.has(stateMatch[1])) out.state = stateMatch[1];

  const segments = full.split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length >= 2) {
    out.street = segments[0];
    const cityCandidate = segments[1].replace(/\b[A-Z]{2}\b\s*\d{5}(-\d{4})?\s*$/, '').trim();
    if (cityCandidate && !/^\d/.test(cityCandidate) && cityCandidate.length <= 40) out.city = cityCandidate;
  } else {
    out.street = full;
  }
  if (out.zip || out.state) out.country = 'US';
  return out;
}

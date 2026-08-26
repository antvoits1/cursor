import { classifyPhoneNumber } from './phoneClassifier.js';
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

  // Anything after the street suffix has to be address material. A city or
  // region following a street type is separated by a comma in every real
  // rendering; without one, the trailing words are either prose that ran on
  // ("Santa Clara St in") or a truncated capture ("Erie Street Ma").
  if (suffixMatch?.index !== undefined) {
    const rawTail = cleaned.slice(suffixMatch.index + suffixMatch[0].length);
    const tail = rawTail.replace(/^[\s.,]+/, '');
    if (tail) {
      const separatedByComma = /^\s*,/.test(rawTail);
      const isUnit = /^(?:#|ste|suite|apt|unit|bldg|building|floor|fl|rm|room)\b/i.test(tail);
      const endsWithStateAndZip = /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?$/.test(tail);
      if (!separatedByComma && !isUnit && !endsWithStateAndZip) {
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

  addPhone(raw: string, evidence: Evidence, contextText = ''): 'accepted' | 'rejected' | 'merged' {
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
    const existing = this.phones.get(classified.number);
    if (existing) {
      pushEvidence(existing, evidence);
      // A more certain line-type reading wins the merge.
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
      .map((c) => ({
        number: c.value.number,
        formatted: c.value.formatted,
        type: c.value.type,
        lineTypeConfidence: c.value.lineTypeConfidence,
        lineTypeBasis: c.value.lineTypeBasis,
        carrier: c.value.carrier,
        location: c.value.location,
        timezone: c.value.timezone,
        country: c.value.country,
        agreementCount: c.sources.size,
        confidence: scoreFor(c.evidence, c.sources.size),
        evidence: c.evidence,
      }))
      .sort((a, b) => b.confidence - a.confidence || b.agreementCount - a.agreementCount);

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
        agreementCount: candidate.sources.size,
        confidence: adjusted,
        evidence: candidate.evidence,
      });
    }
    emails.sort((a, b) => b.confidence - a.confidence || a.email.localeCompare(b.email));

    const addresses: AddressInfo[] = [...this.addresses.values()]
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
      .sort((a, b) => b.confidence - a.confidence || b.full.length - a.full.length);

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

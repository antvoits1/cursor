/**
 * Reverses the common, legitimate ways sites obscure contact details from
 * naive scrapers (HTML entities, "name [at] domain [dot] com", RTL tricks,
 * percent-encoding). This reads what a human visitor would read; it does not
 * defeat access controls or anti-bot challenges.
 */

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
  '&commat;': '@',
  '&period;': '.',
};

export function decodeEntities(input: string): string {
  let text = input;
  text = text.replace(/&#(\d{2,7});/g, (_, dec: string) => {
    const code = Number.parseInt(dec, 10);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : _;
  });
  text = text.replace(/&#x([0-9a-fA-F]{2,6});/g, (_, hex: string) => {
    const code = Number.parseInt(hex, 16);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : _;
  });
  for (const [entity, value] of Object.entries(NAMED_ENTITIES)) {
    text = text.split(entity).join(value);
  }
  return text;
}

export function deobfuscate(input: string): string {
  if (!input) return '';
  let text = decodeEntities(input);

  // Reverse right-to-left display tricks before anything else.
  text = text.replace(/<span[^>]*(?:dir=["']rtl["']|unicode-bidi)[^>]*>([^<]{4,120})<\/span>/gi, (_, content: string) =>
    [...String(content)].reverse().join(''),
  );

  text = text
    .replace(/%40/gi, '@')
    .replace(/%2e/gi, '.')
    .replace(/%20/gi, ' ');

  // "at" / "dot" spellings, including bracketed, parenthesised and braced forms.
  //
  // The bare spelled-out "at" is only honoured when the address also spells out
  // its dot. Converting every "at" that happens to sit in front of a domain
  // would turn ordinary prose such as "meet us at example.com" into a contact
  // address that nobody published.
  text = text
    .replace(/\s*[[({<]\s*(?:at|@)\s*[\])}>]\s*/gi, '@')
    .replace(/\s*[[({<]\s*dot\s*[\])}>]\s*/gi, '.')
    .replace(/\s+at\s+(?=[a-zA-Z0-9-]+\s+dot\s+[a-zA-Z]{2,24}\b)/gi, '@')
    .replace(/\s+dot\s+(?=[a-zA-Z]{2,24}\b)/gi, '.');

  // Zero-width and soft-hyphen padding inserted between characters.
  text = text.replace(/[\u200b-\u200f\u2060\u00ad\ufeff]/g, '');

  return text;
}

const EMAIL_PATTERN = /(?<![\w.+-])([a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+)(?![\w.-])/g;

const NON_CONTACT_TLDS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'css', 'js', 'json', 'woff', 'woff2', 'ttf', 'ico', 'mp4', 'webm', 'pdf', 'zip']);

const PLACEHOLDER_DOMAINS = [
  'example.com', 'example.org', 'example.net', 'domain.com', 'yourdomain.com', 'mydomain.com',
  'email.com', 'youremail.com', 'test.com', 'sentry.io', 'sentry-cdn.com', 'wixpress.com',
  'schema.org', 'w3.org', 'googleapis.com', 'gstatic.com', 'cloudflare.com', 'jquery.com',
  'squarespace.com', 'godaddy.com', 'wordpress.org', 'shopify.com', 'gravatar.com',
];

const PLACEHOLDER_LOCALS = ['example', 'youremail', 'your.email', 'email@example', 'name@', 'user@', 'someone', 'firstname', 'lastname', 'noreply@sentry'];

export interface FoundEmail {
  email: string;
  /** Character offset in the scanned text, used to pull a context excerpt. */
  index: number;
}

/**
 * Extracts plausible contact emails from already-deobfuscated text, discarding
 * asset filenames, tracking placeholders, and template examples.
 */
export function extractEmails(text: string): FoundEmail[] {
  const deobfuscated = deobfuscate(text);
  const found: FoundEmail[] = [];
  const seen = new Set<string>();

  for (const match of deobfuscated.matchAll(EMAIL_PATTERN)) {
    const email = match[1].toLowerCase();
    if (seen.has(email)) continue;

    const tld = email.split('.').pop() ?? '';
    if (NON_CONTACT_TLDS.has(tld)) continue;
    if (tld.length < 2 || /\d/.test(tld)) continue;

    const domain = email.split('@')[1];
    if (PLACEHOLDER_DOMAINS.some((p) => domain === p || domain.endsWith(`.${p}`))) continue;
    if (PLACEHOLDER_LOCALS.some((p) => email.startsWith(p))) continue;
    // Hashed asset names such as u003e1a2b3c@2x.png slip past the TLD check.
    if (/^[0-9a-f]{16,}@/.test(email)) continue;

    seen.add(email);
    found.push({ email, index: match.index ?? 0 });
  }

  return found;
}

export const PHONE_PATTERN =
  /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;

export const ADDRESS_PATTERN =
  /\b\d{1,6}\s+(?:[NSEW]\.?\s+|(?:North|South|East|West|NE|NW|SE|SW)\s+)?[A-Za-z0-9.'#-]+(?:\s+[A-Za-z0-9.'#-]+){0,4}\s+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Circle|Cir|Parkway|Pkwy|Highway|Hwy|Route|Rte|Terrace|Ter|Place|Pl|Way|Trail|Trl)\b\.?(?:\s+(?:Suite|Ste|Unit|Apt|#)\s*[A-Za-z0-9-]+)?(?:\s*,\s*[A-Za-z .'-]{2,40})?(?:\s*,?\s*(?:A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY]))?(?:\s+\d{5}(?:-\d{4})?)?/gi;

export function excerptAround(text: string, index: number, radius = 90): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text
    .slice(start, end)
    .replace(/\s+/g, ' ')
    .trim();
}

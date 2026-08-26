import dns from 'node:dns/promises';
import net from 'node:net';
import type { EmailVerification } from '../src/types.js';

/**
 * Email verification, tier by tier, with an honest account of what could not be
 * checked.
 *
 * Four things can be established for free and anywhere: the address is
 * well-formed, its domain publishes mail exchangers, the domain is not a
 * throwaway-mail provider, and the local part is a person rather than a shared
 * function mailbox. Those four settle most addresses.
 *
 * Proving a specific mailbox exists requires an SMTP conversation on port 25,
 * which almost every cloud provider blocks outbound — Vercel included. Where
 * that is the case the check reports `null`, meaning "not run", and the verdict
 * says so. A check that could not run is never reported as a pass, because an
 * address wrongly marked deliverable is worse than one marked unverifiable.
 */

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', '10minutemail.com', 'tempmail.com',
  'temp-mail.org', 'throwawaymail.com', 'yopmail.com', 'trashmail.com', 'sharklasers.com',
  'getnada.com', 'maildrop.cc', 'dispostable.com', 'fakeinbox.com', 'mailnesia.com', 'mintemail.com',
  'spamgourmet.com', 'tempinbox.com', 'emailondeck.com', 'burnermail.io', 'mohmal.com', 'moakt.com',
  'temp-mail.io', 'tempail.com', 'inboxbear.com', 'harakirimail.com', 'anonaddy.me', 'mailcatch.com',
]);

const ROLE_LOCAL_PARTS = new Set([
  'info', 'contact', 'sales', 'support', 'admin', 'office', 'hello', 'help', 'billing', 'accounts',
  'accounting', 'enquiries', 'inquiries', 'service', 'customerservice', 'team', 'mail', 'email',
  'marketing', 'press', 'media', 'careers', 'jobs', 'hr', 'legal', 'privacy', 'security', 'abuse',
  'postmaster', 'webmaster', 'noreply', 'no-reply', 'donotreply', 'notifications', 'orders', 'general',
]);

/** Providers whose mail servers accept every address, making a probe meaningless. */
const KNOWN_CATCH_ALL_HINTS = ['secureserver.net', 'privateemail.com', 'improvmx.com'];

const SYNTAX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]{0,62}[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function smtpProbeEnabled(): boolean {
  // Off by default: it is slow, it needs port 25, and on a host where port 25
  // is blocked every probe would time out and slow every run down.
  return process.env.EXTRACTOR_ENABLE_SMTP_PROBE === '1';
}

interface MxLookup {
  hasMx: boolean;
  hosts: string[];
}

async function lookupMx(domain: string): Promise<MxLookup | null> {
  try {
    const records = await dns.resolveMx(domain);
    const hosts = records.sort((a, b) => a.priority - b.priority).map((record) => record.exchange);
    return { hasMx: hosts.length > 0, hosts };
  } catch {
    // No MX is not necessarily fatal: a domain with an A record can still take
    // mail. Distinguish "no MX" from "domain does not resolve at all".
    try {
      await dns.resolve4(domain);
      return { hasMx: false, hosts: [domain] };
    } catch {
      return null;
    }
  }
}

async function lookupTxt(domain: string, predicate: (value: string) => boolean): Promise<boolean | null> {
  try {
    const records = await dns.resolveTxt(domain);
    return records.some((chunks) => predicate(chunks.join('').toLowerCase()));
  } catch {
    return null;
  }
}

interface SmtpResult {
  accepted: boolean | null;
  detail: string;
  catchAll: boolean | null;
}

/**
 * Asks the receiving mail server whether it would accept the address.
 *
 * A random address on the same domain is asked about first. If that is accepted
 * too then the server accepts everything, and its answer about the real address
 * proves nothing — so the result is reported as catch-all rather than as a pass.
 */
async function smtpProbe(address: string, mxHost: string, timeoutMs: number): Promise<SmtpResult> {
  const domain = address.split('@')[1];
  const decoy = `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@${domain}`;

  return new Promise<SmtpResult>((resolve) => {
    const socket = net.createConnection({ host: mxHost, port: 25 });
    let stage = 0;
    let realAccepted: boolean | null = null;
    let decoyAccepted: boolean | null = null;
    let settled = false;

    const finish = (result: SmtpResult): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const timer = setTimeout(
      () => finish({ accepted: null, detail: 'The mail server did not answer in time.', catchAll: null }),
      timeoutMs,
    );
    timer.unref?.();

    socket.setEncoding('utf8');
    socket.on('error', (error) =>
      finish({
        accepted: null,
        detail: `The mail server could not be reached (${(error as NodeJS.ErrnoException).code ?? 'error'}). Outbound port 25 is blocked on most cloud hosts.`,
        catchAll: null,
      }),
    );

    socket.on('data', (chunk: string) => {
      const code = Number(chunk.slice(0, 3));
      switch (stage) {
        case 0:
          if (code !== 220) return finish({ accepted: null, detail: `The server refused the connection (${code}).`, catchAll: null });
          socket.write(`EHLO extractor.local\r\n`);
          stage = 1;
          return;
        case 1:
          socket.write(`MAIL FROM:<verify@extractor.local>\r\n`);
          stage = 2;
          return;
        case 2:
          socket.write(`RCPT TO:<${address}>\r\n`);
          stage = 3;
          return;
        case 3:
          realAccepted = code >= 200 && code < 300;
          socket.write(`RCPT TO:<${decoy}>\r\n`);
          stage = 4;
          return;
        default:
          decoyAccepted = code >= 200 && code < 300;
          socket.write('QUIT\r\n');
          if (decoyAccepted) {
            return finish({
              accepted: null,
              detail: 'The server accepts every address on this domain, so it cannot confirm this particular mailbox.',
              catchAll: true,
            });
          }
          return finish({
            accepted: realAccepted,
            detail: realAccepted
              ? 'The receiving mail server accepted this address.'
              : 'The receiving mail server rejected this address.',
            catchAll: false,
          });
      }
    });
  });
}

export interface VerifyOptions {
  /** DNS facts already gathered for this domain, to avoid looking them up twice. */
  known?: { hasMx?: boolean; hasSpf?: boolean; hasDmarc?: boolean; mxHosts?: string[] };
  timeoutMs?: number;
}

export async function verifyEmail(address: string, options: VerifyOptions = {}): Promise<EmailVerification> {
  const basis: string[] = [];
  const cleaned = String(address ?? '').trim().toLowerCase();

  const syntaxValid = SYNTAX.test(cleaned) && !cleaned.includes('..');
  if (!syntaxValid) {
    return {
      syntaxValid: false,
      domainHasMx: null,
      hasSpf: null,
      hasDmarc: null,
      disposable: false,
      roleAccount: false,
      catchAll: null,
      smtpAccepted: null,
      verdict: 'undeliverable',
      basis: ['The address is not well-formed, so no mail server would accept it.'],
    };
  }
  basis.push('The address is well-formed.');

  const [localPart, domain] = cleaned.split('@');
  const disposable = DISPOSABLE_DOMAINS.has(domain);
  const roleAccount = ROLE_LOCAL_PARTS.has(localPart.replace(/[._-]/g, ''));

  if (disposable) basis.push(`${domain} is a throwaway-mail provider, so the address is unlikely to be read.`);
  if (roleAccount) basis.push(`"${localPart}" is a shared function mailbox rather than an individual.`);

  const mx = options.known?.hasMx !== undefined
    ? { hasMx: options.known.hasMx, hosts: options.known.mxHosts ?? [] }
    : await lookupMx(domain);

  if (mx === null) {
    return {
      syntaxValid: true,
      domainHasMx: false,
      hasSpf: null,
      hasDmarc: null,
      disposable,
      roleAccount,
      catchAll: null,
      smtpAccepted: null,
      verdict: 'undeliverable',
      basis: [...basis, `${domain} does not resolve, so it cannot receive mail.`],
    };
  }

  if (mx.hasMx) basis.push(`${domain} publishes mail exchangers, so it is set up to receive mail.`);
  else basis.push(`${domain} publishes no mail exchanger; mail would fall back to its web address, which often fails.`);

  const hasSpf = options.known?.hasSpf ?? (await lookupTxt(domain, (value) => value.startsWith('v=spf1')));
  const hasDmarc = options.known?.hasDmarc ?? (await lookupTxt(`_dmarc.${domain}`, (value) => value.startsWith('v=dmarc1')));
  if (hasSpf) basis.push('The domain publishes an SPF policy.');
  if (hasDmarc) basis.push('The domain publishes a DMARC policy.');

  let smtpAccepted: boolean | null = null;
  let smtpDetail: string | undefined;
  let catchAll: boolean | null = null;

  if (KNOWN_CATCH_ALL_HINTS.some((hint) => mx.hosts.some((host) => host.includes(hint)))) {
    catchAll = true;
    basis.push('This mail provider accepts every address on the domain, so an individual mailbox cannot be confirmed.');
  } else if (smtpProbeEnabled() && mx.hosts.length > 0) {
    const probe = await smtpProbe(cleaned, mx.hosts[0], options.timeoutMs ?? 6000);
    smtpAccepted = probe.accepted;
    smtpDetail = probe.detail;
    catchAll = probe.catchAll;
    basis.push(probe.detail);
  } else {
    smtpDetail = smtpProbeEnabled()
      ? 'No mail exchanger was available to ask.'
      : 'Mailbox-level checking is switched off. It needs outbound port 25, which cloud hosts block.';
    basis.push(smtpDetail);
  }

  let verdict: EmailVerification['verdict'];
  if (disposable) verdict = 'risky';
  else if (smtpAccepted === false) verdict = 'undeliverable';
  else if (smtpAccepted === true) verdict = 'deliverable';
  else if (!mx.hasMx) verdict = 'risky';
  else if (catchAll === true) verdict = 'probably_deliverable';
  else if (hasSpf && hasDmarc) verdict = 'probably_deliverable';
  else verdict = 'unverifiable';

  return {
    syntaxValid: true,
    domainHasMx: mx.hasMx,
    hasSpf,
    hasDmarc,
    disposable,
    roleAccount,
    catchAll,
    smtpAccepted,
    smtpDetail,
    verdict,
    basis,
  };
}

/** Verifies a batch, sharing one DNS lookup per domain across its addresses. */
export async function verifyEmails(
  addresses: string[],
  domainFacts?: Map<string, VerifyOptions['known']>,
): Promise<Map<string, EmailVerification>> {
  const out = new Map<string, EmailVerification>();
  const byDomain = new Map<string, string[]>();

  for (const address of addresses) {
    const domain = address.split('@')[1]?.toLowerCase();
    if (!domain) continue;
    byDomain.set(domain, [...(byDomain.get(domain) ?? []), address]);
  }

  await Promise.all(
    [...byDomain.entries()].map(async ([domain, group]) => {
      const known = domainFacts?.get(domain);
      for (const address of group) {
        out.set(address, await verifyEmail(address, { known }));
      }
    }),
  );

  return out;
}

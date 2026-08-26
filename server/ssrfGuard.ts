import dns from 'node:dns/promises';
import net from 'node:net';

export interface UrlSafetyVerdict {
  safe: boolean;
  reason?: string;
  /** Addresses the hostname resolved to, used to pin the connection. */
  addresses: string[];
}

const BLOCKED_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.home.arpa'];
const BLOCKED_HOST_EXACT = new Set(['localhost', 'ip6-localhost', 'ip6-loopback', 'metadata.google.internal']);

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function inV4Cidr(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

/**
 * Reserved IPv4 space that must never be reachable from the extraction engine.
 * Covers loopback, private, link-local (including cloud metadata), CGNAT,
 * benchmarking, documentation, multicast, and the reserved 240/4 block.
 */
const RESERVED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function isReservedV4(ip: string): boolean {
  return RESERVED_V4.some(([base, bits]) => inV4Cidr(ip, base, bits));
}

function expandV6(ip: string): string {
  // Normalises to a lowercase, fully expanded hex string without colons.
  const zoneless = ip.split('%')[0];
  const [head, tail = ''] = zoneless.split('::');
  const headParts = head ? head.split(':').filter(Boolean) : [];
  const tailParts = tail ? tail.split(':').filter(Boolean) : [];
  const fill = 8 - headParts.length - tailParts.length;
  const all = [...headParts, ...Array(Math.max(fill, 0)).fill('0'), ...tailParts];
  return all.map((p) => p.padStart(4, '0')).join('').toLowerCase();
}

function isReservedV6(ip: string): boolean {
  const zoneless = ip.split('%')[0].toLowerCase();

  // IPv4-mapped and IPv4-translated addresses inherit IPv4 restrictions.
  const mapped = zoneless.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isReservedV4(mapped[1]);

  const hex = expandV6(zoneless);
  if (hex === '0'.repeat(32)) return true; // unspecified ::
  if (hex === '0'.repeat(31) + '1') return true; // loopback ::1
  const first = parseInt(hex.slice(0, 4), 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (hex.startsWith('0064ff9b')) return true; // 64:ff9b::/96 NAT64
  if (hex.startsWith('20010db8')) return true; // 2001:db8::/32 documentation
  if (hex.startsWith('20010000')) return true; // 2001::/32 Teredo
  return false;
}

export function isReservedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isReservedV4(ip);
  if (net.isIPv6(ip)) return isReservedV6(ip);
  return true;
}

/**
 * Synchronous check for a host that is disqualified on its face — a local-only
 * name or a literal address in reserved space. No DNS lookup is performed, so
 * this is only a fast pre-filter; `assessUrl` remains the authority before any
 * request is actually made.
 */
export function isReservedHost(rawUrl: string): boolean {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return true;
  }
  if (!host) return true;
  if (BLOCKED_HOST_EXACT.has(host)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  const literal = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (net.isIP(literal)) return isReservedAddress(literal);
  return false;
}

/**
 * Resolves a URL and verifies every address it maps to is publicly routable.
 * Returns the resolved addresses so callers can pin the connection and avoid
 * a DNS-rebinding window between validation and request.
 */
export async function assessUrl(rawUrl: string): Promise<UrlSafetyVerdict> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: 'Not a valid absolute URL.', addresses: [] };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Unsupported protocol "${parsed.protocol}".`, addresses: [] };
  }
  if (parsed.username || parsed.password) {
    return { safe: false, reason: 'URLs with embedded credentials are rejected.', addresses: [] };
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return { safe: false, reason: 'URL has no hostname.', addresses: [] };
  if (BLOCKED_HOST_EXACT.has(host)) {
    return { safe: false, reason: `Host "${host}" is a local-only name.`, addresses: [] };
  }
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return { safe: false, reason: `Host "${host}" is a local-only name.`, addresses: [] };
  }

  // Bracketed IPv6 literals arrive without brackets from URL.hostname.
  const literal = host.startsWith('[') ? host.slice(1, -1) : host;
  if (net.isIP(literal)) {
    if (isReservedAddress(literal)) {
      return { safe: false, reason: `Address ${literal} is in reserved or private space.`, addresses: [literal] };
    }
    return { safe: true, addresses: [literal] };
  }

  let addresses: string[];
  try {
    const looked = await dns.lookup(host, { all: true, verbatim: true });
    addresses = looked.map((a) => a.address);
  } catch {
    return { safe: false, reason: `Host "${host}" could not be resolved.`, addresses: [] };
  }

  if (addresses.length === 0) {
    return { safe: false, reason: `Host "${host}" resolved to no addresses.`, addresses: [] };
  }
  for (const address of addresses) {
    if (isReservedAddress(address)) {
      return { safe: false, reason: `Host "${host}" resolves to reserved address ${address}.`, addresses };
    }
  }
  return { safe: true, addresses };
}

export async function isPublicUrl(rawUrl: string): Promise<boolean> {
  return (await assessUrl(rawUrl)).safe;
}

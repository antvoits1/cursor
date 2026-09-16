import type { Lead } from '../data/types';

export function dialDigits(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

/** Format a US dial string as the user types: (XXX) XXX-XXXX, with +1 support. */
export function formatDialInput(raw: string): string {
  const digits = dialDigits(raw);
  if (!digits) return '';
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  const prefix = digits.length === 11 && digits.startsWith('1') ? '+1 ' : '';
  if (national.length <= 3) return `${prefix}${national}`;
  if (national.length <= 6) return `${prefix}(${national.slice(0, 3)}) ${national.slice(3)}`;
  if (national.length <= 10) {
    return `${prefix}(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  }
  return `${prefix}(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6, 10)}`;
}

function numbersMatch(a: string, b: string): boolean {
  const da = dialDigits(a);
  const db = dialDigits(b);
  if (!da || !db) return false;
  return da === db || da.endsWith(db) || db.endsWith(da);
}

export function matchLeadByNumber(leads: Lead[], number: string): Lead | undefined {
  return leads.find((l) =>
    [...l.mobiles, ...l.landlines].some((p) => numbersMatch(p.number, number)),
  );
}

export function matchLeadByNameOrNumber(leads: Lead[], query: string): Lead | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  const byNumber = matchLeadByNumber(leads, query);
  if (byNumber) return byNumber;
  return leads.find((l) => l.contact.toLowerCase().includes(q) || l.company.toLowerCase().includes(q));
}

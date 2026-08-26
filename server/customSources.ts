import fs from 'node:fs';
import path from 'node:path';
import { isReservedHost } from './ssrfGuard.js';
import type { CustomSource, QueryContext } from '../src/types.js';

/**
 * Extra places to look, saved on the server.
 *
 * The built-in route list covers the sources that are worth trying for most
 * leads, but no fixed list is right for everyone: a recruiter wants a licence
 * register, a broker wants a county assessor, and neither belongs in a default
 * that everybody else pays for. So the list is editable and it lives on the
 * server, not in one browser's storage, because it is a property of the
 * installation rather than of whoever happens to be looking at it.
 *
 * A saved entry is a URL with placeholders in it. When a run has the values a
 * placeholder needs, the URL is filled in and read like any other source, with
 * the same evidence rules and the same audit trail. When it does not, the
 * entry is skipped and the route says why rather than fetching a URL with the
 * word "undefined" in it.
 */

/** Placeholders a saved URL may use, and where each value comes from. */
export const PLACEHOLDERS: Array<{ token: string; describes: string }> = [
  { token: '{query}', describes: 'everything that was typed into the search box' },
  { token: '{name}', describes: 'the business or person name' },
  { token: '{city}', describes: 'the city' },
  { token: '{state}', describes: 'the two-letter state code' },
  { token: '{zip}', describes: 'the postcode' },
  { token: '{domain}', describes: 'the website domain, once one is known' },
  { token: '{phone}', describes: 'the phone number, digits only' },
  { token: '{email}', describes: 'the email address' },
];

interface PersistShape {
  version: 1;
  sources: CustomSource[];
  updatedAt?: string;
}

function storePath(): string | null {
  if (process.env.EXTRACTOR_SOURCES_FILE) return process.env.EXTRACTOR_SOURCES_FILE;
  const runtimeDir = process.env.EXTRACTOR_RUNTIME_DIR ?? path.join(process.cwd(), 'backend', '.runtime');
  try {
    fs.mkdirSync(runtimeDir, { recursive: true });
    return path.join(runtimeDir, 'custom-sources.json');
  } catch {
    return null;
  }
}

let state: PersistShape = { version: 1, sources: [] };
let loaded = false;
let persistable = true;

function load(): void {
  if (loaded) return;
  loaded = true;
  const file = storePath();
  if (!file) {
    persistable = false;
    return;
  }
  try {
    if (!fs.existsSync(file)) return;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as PersistShape;
    if (parsed && Array.isArray(parsed.sources)) state = { version: 1, sources: parsed.sources };
  } catch {
    // A corrupt file must not stop the engine starting; it is replaced on the
    // next save rather than read again.
  }
}

function save(): void {
  const file = storePath();
  if (!file) {
    persistable = false;
    return;
  }
  try {
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(state, null, 2));
  } catch {
    persistable = false;
  }
}

/** False on hosts with no writable disk, where the list lasts only as long as the process. */
export function sourcesArePersistent(): boolean {
  load();
  return persistable;
}

export function listCustomSources(): CustomSource[] {
  load();
  return state.sources.map((source) => ({ ...source }));
}

export interface SaveResult {
  ok: boolean;
  /** Why it was refused, in words worth showing to whoever typed it. */
  problem?: string;
  source?: CustomSource;
}

/**
 * Checks a URL before it is saved, so a mistake is caught while the person who
 * made it is still looking at it rather than mid-run three days later.
 */
export function validateSourceUrl(raw: string): { ok: boolean; problem?: string; url?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, problem: 'Enter a web address.' };

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  // The placeholders are not valid URL characters everywhere, so the address is
  // checked with stand-in text and stored with the placeholders intact.
  const probe = withScheme.replace(/\{[a-z]+\}/gi, 'x');
  let parsed: URL;
  try {
    parsed = new URL(probe);
  } catch {
    return { ok: false, problem: 'That does not look like a web address.' };
  }

  if (!/^https?:$/.test(parsed.protocol)) return { ok: false, problem: 'Only http and https addresses can be used.' };
  // The private-network check comes first because names like "localhost" have
  // no dot in them, and calling that a missing domain would send someone off
  // adding ".com" to an address that would be refused either way.
  if (isReservedHost(probe)) {
    return { ok: false, problem: 'That address is on a private network, so it will not be opened.' };
  }
  if (!parsed.hostname.includes('.')) return { ok: false, problem: 'That address is missing a domain, such as ".com".' };

  const unknown = withScheme.match(/\{[a-z]+\}/gi)?.filter((token) => !PLACEHOLDERS.some((p) => p.token === token.toLowerCase()));
  if (unknown && unknown.length > 0) {
    return { ok: false, problem: `${unknown[0]} is not a placeholder this can fill in.` };
  }

  return { ok: true, url: withScheme };
}

export function addCustomSource(rawUrl: string, label?: string): SaveResult {
  load();
  const checked = validateSourceUrl(rawUrl);
  if (!checked.ok || !checked.url) return { ok: false, problem: checked.problem };

  if (state.sources.some((source) => source.url === checked.url)) {
    return { ok: false, problem: 'That address is already saved.' };
  }

  let host = '';
  try {
    host = new URL(checked.url.replace(/\{[a-z]+\}/gi, 'x')).hostname.replace(/^www\./, '');
  } catch {
    host = 'saved source';
  }

  const source: CustomSource = {
    id: `src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    label: label?.trim() || host,
    url: checked.url,
    enabled: true,
    addedAt: new Date().toISOString(),
  };

  state.sources.push(source);
  save();
  return { ok: true, source };
}

export function removeCustomSource(id: string): boolean {
  load();
  const before = state.sources.length;
  state.sources = state.sources.filter((source) => source.id !== id);
  if (state.sources.length === before) return false;
  save();
  return true;
}

export function setCustomSourceEnabled(id: string, enabled: boolean): boolean {
  load();
  const source = state.sources.find((entry) => entry.id === id);
  if (!source) return false;
  source.enabled = enabled;
  save();
  return true;
}

export interface ExpandedSource {
  source: CustomSource;
  url: string;
}

export interface SkippedSource {
  source: CustomSource;
  /** Which placeholder had nothing to fill it, in plain words. */
  missing: string;
}

/**
 * Fills the placeholders in every enabled entry from what this run knows.
 *
 * An entry needing a value the run does not have is skipped rather than
 * fetched with a blank in it, because a search URL with an empty field returns
 * a directory's whole index, and harvesting contact details off that would
 * attach a stranger's phone number to the lead.
 */
export function expandCustomSources(context: QueryContext): { ready: ExpandedSource[]; skipped: SkippedSource[] } {
  load();

  const values: Record<string, string | undefined> = {
    '{query}': context.query,
    '{name}': context.companyName ?? context.personName,
    '{city}': context.city,
    '{state}': context.state,
    '{zip}': context.zip,
    '{domain}': context.domain,
    '{phone}': context.phone?.replace(/\D/g, ''),
    '{email}': context.email,
  };

  const ready: ExpandedSource[] = [];
  const skipped: SkippedSource[] = [];

  for (const source of state.sources) {
    if (!source.enabled) continue;

    const tokens = source.url.match(/\{[a-z]+\}/gi) ?? [];
    const empty = tokens.find((token) => !values[token.toLowerCase()]);
    if (empty) {
      skipped.push({
        source,
        missing: PLACEHOLDERS.find((p) => p.token === empty.toLowerCase())?.describes ?? empty,
      });
      continue;
    }

    let url = source.url;
    for (const token of tokens) {
      url = url.replace(token, encodeURIComponent(values[token.toLowerCase()] ?? ''));
    }
    ready.push({ source, url });
  }

  return { ready, skipped };
}

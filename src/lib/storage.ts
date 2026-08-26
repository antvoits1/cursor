import type { ExtractionResult } from '../types';

/**
 * Browser-local persistence for history and settings.
 *
 * Everything here is defensive: a corrupted or hand-edited localStorage entry
 * must never take the application down, so every read falls back to a known
 * good default and repairs the stored value.
 */

const HISTORY_KEY = 'extractor.history.v3';
const SETTINGS_KEY = 'extractor.settings.v3';
const HISTORY_LIMIT = 200;

export interface HistoryEntry {
  id: string;
  query: string;
  queryType: ExtractionResult['queryType'];
  status: ExtractionResult['status'];
  confidence: number;
  durationMs: number;
  companyName: string;
  website: string;
  phoneCount: number;
  emailCount: number;
  addressCount: number;
  createdAt: string;
  result: ExtractionResult;
}

export interface Settings {
  /** Runs the full route ladder rather than stopping at the first good source. */
  deepScan: boolean;
  /** Wall-clock budget handed to the engine for a single run. */
  runBudgetMs: number;
  /** Rows processed at once during a bulk run. */
  bulkConcurrency: number;
  /** Keep completed runs in this browser. */
  saveHistory: boolean;
  /** Show the technical detail rows inside the live route. */
  verboseRoute: boolean;
  /**
   * Consult people-search sources for every number, email and address on
   * record for a person. Off by default: these sites prohibit automated access
   * in their terms, so turning it on is a deliberate choice, and they refuse
   * datacenter addresses, so most runs from a cloud host will report a block.
   */
  peopleSearch: boolean;
  /** Let the assistant interpret open-ended input and read awkward pages. */
  useAssistant: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  deepScan: true,
  runBudgetMs: 45_000,
  bulkConcurrency: 2,
  saveHistory: true,
  verboseRoute: false,
  peopleSearch: false,
  useAssistant: true,
};

export const BUDGET_CHOICES = [8_000, 12_000, 20_000, 30_000, 45_000, 60_000, 90_000] as const;
export const CONCURRENCY_CHOICES = [1, 2, 3, 4, 6] as const;

function storageAvailable(): boolean {
  try {
    const probe = '__extractor_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export const persistenceAvailable = typeof window !== 'undefined' && storageAvailable();

function readJson<T>(key: string): unknown {
  if (!persistenceAvailable) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // A malformed entry is discarded rather than repeatedly failing to parse.
    window.localStorage.removeItem(key);
    return null;
  }
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<HistoryEntry>;
  return typeof entry.id === 'string' && typeof entry.query === 'string' && !!entry.result;
}

export function loadHistory(): HistoryEntry[] {
  const parsed = readJson<HistoryEntry[]>(HISTORY_KEY);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isHistoryEntry).slice(0, HISTORY_LIMIT);
}

export function saveHistory(entries: HistoryEntry[]): void {
  if (!persistenceAvailable) return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_LIMIT)));
  } catch {
    // Quota exhaustion drops the oldest half rather than losing everything.
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, Math.floor(HISTORY_LIMIT / 4))));
    } catch {
      /* History simply will not persist in this browser. */
    }
  }
}

export function toHistoryEntry(result: ExtractionResult): HistoryEntry {
  return {
    id: result.id,
    query: result.query,
    queryType: result.queryType,
    status: result.status,
    confidence: result.confidence,
    durationMs: result.durationMs,
    companyName: result.companyName ?? result.query,
    website: result.website,
    phoneCount: result.phones.length,
    emailCount: result.emails.length,
    addressCount: result.addresses.length,
    createdAt: result.createdAt,
    result,
  };
}

export function loadSettings(): Settings {
  const parsed = readJson<Partial<Settings>>(SETTINGS_KEY);
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS };
  const candidate = parsed as Partial<Settings>;
  return {
    deepScan: typeof candidate.deepScan === 'boolean' ? candidate.deepScan : DEFAULT_SETTINGS.deepScan,
    runBudgetMs: (BUDGET_CHOICES as readonly number[]).includes(candidate.runBudgetMs ?? -1)
      ? (candidate.runBudgetMs as number)
      : DEFAULT_SETTINGS.runBudgetMs,
    bulkConcurrency: (CONCURRENCY_CHOICES as readonly number[]).includes(candidate.bulkConcurrency ?? -1)
      ? (candidate.bulkConcurrency as number)
      : DEFAULT_SETTINGS.bulkConcurrency,
    saveHistory: typeof candidate.saveHistory === 'boolean' ? candidate.saveHistory : DEFAULT_SETTINGS.saveHistory,
    verboseRoute: typeof candidate.verboseRoute === 'boolean' ? candidate.verboseRoute : DEFAULT_SETTINGS.verboseRoute,
    peopleSearch: typeof candidate.peopleSearch === 'boolean' ? candidate.peopleSearch : DEFAULT_SETTINGS.peopleSearch,
    useAssistant: typeof candidate.useAssistant === 'boolean' ? candidate.useAssistant : DEFAULT_SETTINGS.useAssistant,
  };
}

export function saveSettings(settings: Settings): void {
  if (!persistenceAvailable) return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* Settings simply will not persist in this browser. */
  }
}

export function clearStoredHistory(): void {
  if (!persistenceAvailable) return;
  window.localStorage.removeItem(HISTORY_KEY);
}

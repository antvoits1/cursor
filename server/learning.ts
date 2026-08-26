import fs from 'node:fs';
import path from 'node:path';
import type {
  DomainLearningRecord,
  LearningSnapshot,
  QueryType,
  RouteLearningRecord,
} from '../src/types.js';

/**
 * Local, inspectable, reversible route intelligence.
 *
 * What this is: a tally of what actually happened on previous runs — which
 * routes produced accepted values, how fast they were, how often a domain
 * blocked us, and which extraction patterns paid off per domain.
 *
 * What this is never allowed to do: invent a value, promote a guess to a fact,
 * carry data between leads, touch excluded columns, or silently keep trusting a
 * stale pattern. Learned domain entries carry an explicit revalidation deadline
 * and are re-proven after it passes.
 */

const STALE_AFTER_MS = Number(process.env.EXTRACTOR_LEARNING_STALE_HOURS ?? 72) * 3600 * 1000;

interface PersistShape {
  version: 2;
  totalRuns: number;
  routes: Record<string, RouteLearningRecord>;
  domains: Record<string, DomainLearningRecord>;
  updatedAt?: string;
}

function learningEnabled(): boolean {
  return process.env.EXTRACTOR_DISABLE_LEARNING !== '1';
}

function storePath(): string | null {
  if (process.env.EXTRACTOR_LEARNING_FILE) return process.env.EXTRACTOR_LEARNING_FILE;
  const runtimeDir = process.env.EXTRACTOR_RUNTIME_DIR ?? path.join(process.cwd(), 'backend', '.runtime');
  try {
    fs.mkdirSync(runtimeDir, { recursive: true });
    return path.join(runtimeDir, 'route-learning.json');
  } catch {
    // Read-only filesystems (serverless) keep learning in memory for the life
    // of the instance, and diagnostics say so.
    return null;
  }
}

function emptyState(): PersistShape {
  return { version: 2, totalRuns: 0, routes: {}, domains: {} };
}

let state: PersistShape = emptyState();
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
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as PersistShape;
    if (parsed && parsed.version === 2 && parsed.routes && parsed.domains) {
      state = parsed;
    }
  } catch {
    // A missing or malformed store simply starts empty; learning is an
    // optimisation and must never block an extraction.
    state = emptyState();
  }
}

let flushTimer: NodeJS.Timeout | null = null;

function scheduleFlush(): void {
  if (!persistable || flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushNow();
  }, 1000);
  flushTimer.unref?.();
}

export function flushNow(): void {
  if (!persistable) return;
  const file = storePath();
  if (!file) return;
  try {
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    persistable = false;
  }
}

function routeKey(queryType: QueryType, routeId: string): string {
  return `${queryType}::${routeId}`;
}

function rollingAverage(previous: number, sampleCount: number, next: number): number {
  if (sampleCount <= 0) return next;
  return (previous * sampleCount + next) / (sampleCount + 1);
}

export interface RouteOutcome {
  queryType: QueryType;
  routeId: string;
  success: boolean;
  blocked: boolean;
  latencyMs: number;
  /** Number of accepted field values this route contributed. */
  fieldYield: number;
}

export function recordRouteOutcome(outcome: RouteOutcome): void {
  if (!learningEnabled()) return;
  load();
  const key = routeKey(outcome.queryType, outcome.routeId);
  const existing: RouteLearningRecord = state.routes[key] ?? {
    key,
    queryType: outcome.queryType,
    routeId: outcome.routeId,
    attempts: 0,
    successes: 0,
    failures: 0,
    blocks: 0,
    successRate: 0,
    avgLatencyMs: 0,
    avgFieldYield: 0,
    lastOutcome: 'none',
  };

  const priorAttempts = existing.attempts;
  existing.avgLatencyMs = Math.round(rollingAverage(existing.avgLatencyMs, priorAttempts, outcome.latencyMs));
  existing.avgFieldYield = Number(rollingAverage(existing.avgFieldYield, priorAttempts, outcome.fieldYield).toFixed(2));
  existing.attempts = priorAttempts + 1;
  if (outcome.success) existing.successes += 1;
  else existing.failures += 1;
  if (outcome.blocked) existing.blocks += 1;
  existing.successRate = Number((existing.successes / existing.attempts).toFixed(4));
  existing.lastOutcome = outcome.blocked ? 'blocked' : outcome.success ? 'success' : 'failure';
  existing.lastSeenAt = new Date().toISOString();

  state.routes[key] = existing;
  scheduleFlush();
}

export interface DomainOutcome {
  domain: string;
  success: boolean;
  blocked: boolean;
  latencyMs: number;
  phones: number;
  emails: number;
  addresses: number;
  owners: number;
  productivePatterns: string[];
  unproductivePatterns: string[];
}

export function recordDomainOutcome(outcome: DomainOutcome): void {
  if (!learningEnabled()) return;
  const domain = outcome.domain.toLowerCase().replace(/^www\./, '');
  if (!domain) return;
  load();

  const existing: DomainLearningRecord = state.domains[domain] ?? {
    domain,
    attempts: 0,
    successes: 0,
    blocks: 0,
    successRate: 0,
    avgLatencyMs: 0,
    phoneYield: 0,
    emailYield: 0,
    addressYield: 0,
    ownerYield: 0,
    productivePatterns: [],
    unproductivePatterns: [],
    staleAfter: new Date(Date.now() + STALE_AFTER_MS).toISOString(),
  };

  const prior = existing.attempts;
  existing.avgLatencyMs = Math.round(rollingAverage(existing.avgLatencyMs, prior, outcome.latencyMs));
  existing.phoneYield = Number(rollingAverage(existing.phoneYield, prior, outcome.phones).toFixed(2));
  existing.emailYield = Number(rollingAverage(existing.emailYield, prior, outcome.emails).toFixed(2));
  existing.addressYield = Number(rollingAverage(existing.addressYield, prior, outcome.addresses).toFixed(2));
  existing.ownerYield = Number(rollingAverage(existing.ownerYield, prior, outcome.owners).toFixed(2));
  existing.attempts = prior + 1;
  if (outcome.success) existing.successes += 1;
  if (outcome.blocked) existing.blocks += 1;
  existing.successRate = Number((existing.successes / existing.attempts).toFixed(4));

  const productive = new Set(existing.productivePatterns);
  for (const pattern of outcome.productivePatterns) productive.add(pattern);
  const unproductive = new Set(existing.unproductivePatterns);
  for (const pattern of outcome.unproductivePatterns) {
    if (!productive.has(pattern)) unproductive.add(pattern);
  }
  existing.productivePatterns = [...productive].slice(0, 12);
  existing.unproductivePatterns = [...unproductive].slice(0, 12);
  existing.lastSeenAt = new Date().toISOString();
  existing.staleAfter = new Date(Date.now() + STALE_AFTER_MS).toISOString();

  state.domains[domain] = existing;
  scheduleFlush();
}

export function noteRun(): void {
  if (!learningEnabled()) return;
  load();
  state.totalRuns += 1;
  scheduleFlush();
}

export interface RoutePrior {
  successRate: number;
  sampleSize: number;
  avgLatencyMs: number;
  avgFieldYield: number;
  /** True when the route has repeatedly produced nothing and should be deprioritised. */
  repeatedlyUseless: boolean;
}

export function routePrior(queryType: QueryType, routeId: string): RoutePrior | null {
  if (!learningEnabled()) return null;
  load();
  const record = state.routes[routeKey(queryType, routeId)];
  if (!record || record.attempts === 0) return null;
  return {
    successRate: record.successRate,
    sampleSize: record.attempts,
    avgLatencyMs: record.avgLatencyMs,
    avgFieldYield: record.avgFieldYield,
    repeatedlyUseless: record.attempts >= 5 && record.successes === 0,
  };
}

export interface DomainPrior {
  successRate: number;
  attempts: number;
  blocks: number;
  /** True when the learned entry is past its revalidation deadline. */
  stale: boolean;
  productivePatterns: string[];
  unproductivePatterns: string[];
}

export function domainPrior(domain: string): DomainPrior | null {
  if (!learningEnabled()) return null;
  load();
  const record = state.domains[domain.toLowerCase().replace(/^www\./, '')];
  if (!record) return null;
  const stale = Date.parse(record.staleAfter) < Date.now();
  return {
    successRate: record.successRate,
    attempts: record.attempts,
    blocks: record.blocks,
    stale,
    // A stale entry stops steering decisions until it is re-proven.
    productivePatterns: stale ? [] : record.productivePatterns,
    unproductivePatterns: stale ? [] : record.unproductivePatterns,
  };
}

export function snapshot(): LearningSnapshot {
  load();
  return {
    enabled: learningEnabled(),
    totalRuns: state.totalRuns,
    routes: Object.values(state.routes).sort((a, b) => b.attempts - a.attempts),
    domains: Object.values(state.domains)
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 100),
    updatedAt: state.updatedAt,
  };
}

/** Reversibility requirement: a single call clears everything the engine learned. */
export function resetLearning(): void {
  loaded = true;
  state = emptyState();
  const file = storePath();
  if (file) {
    try {
      fs.rmSync(file, { force: true });
      persistable = true;
    } catch {
      persistable = false;
    }
  }
}

export function isPersistent(): boolean {
  load();
  return persistable && storePath() !== null;
}

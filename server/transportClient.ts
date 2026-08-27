import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { remainingMs, shareOfRemaining } from './runDeadline.js';
import type { TransportAttempt, TransportTier } from '../src/types.js';

export interface WorkerCapabilities {
  curl_cffi: boolean;
  patchright: boolean;
  camoufox: boolean;
  sqlite_cache: boolean;
}

export interface WorkerFetchResult {
  /** False when no Python worker could be started at all. */
  workerAvailable: boolean;
  ok: boolean;
  url?: string;
  html?: string;
  tier?: TransportTier;
  status?: number;
  fromCache: boolean;
  blocked: boolean;
  reason?: string;
  attempts: TransportAttempt[];
}

export type WorkerState =
  | { kind: 'not_started' }
  | { kind: 'disabled'; detail: string }
  | { kind: 'starting' }
  | { kind: 'ready'; capabilities: WorkerCapabilities }
  | { kind: 'unavailable'; detail: string };

interface Pending {
  resolve: (value: WorkerFetchResult) => void;
  timer: NodeJS.Timeout;
}

let child: ChildProcessWithoutNullStreams | null = null;
let startAttempt: Promise<boolean> | null = null;
let state: WorkerState = { kind: 'not_started' };

/**
 * Reads the current state through a call so callers see whatever a spawn
 * attempt last recorded, rather than the value the compiler can prove was
 * assigned before the attempt started.
 */
function currentState(): WorkerState {
  return state;
}
let sequence = 0;
const pending = new Map<string, Pending>();

const UNAVAILABLE_ATTEMPTS: TransportAttempt[] = [];

function pythonDisabledReason(): string | null {
  if (process.env.EXTRACTOR_DISABLE_PYTHON_TRANSPORT === '1') {
    return 'The Python transport worker is disabled by configuration (EXTRACTOR_DISABLE_PYTHON_TRANSPORT=1).';
  }
  if (process.env.VERCEL === '1' || process.env.VERCEL === 'true') {
    return 'This host is a Vercel serverless function, which cannot run the persistent Python worker or browser runtimes.';
  }
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return 'This host is a short-lived serverless container, which cannot run the persistent Python worker.';
  }
  return null;
}

function pythonCandidates(): Array<{ command: string; args: string[] }> {
  const configured = process.env.EXTRACTOR_PYTHON?.trim();
  if (configured) return [{ command: configured, args: [] }];
  if (process.platform === 'win32') {
    // Prefer `python` first so an activated/.venv PATH wins over the Windows
    // `py -3` launcher, which often points at a system interpreter without
    // curl_cffi / Patchright / Camoufox installed.
    return [
      { command: 'python', args: [] },
      { command: 'py', args: ['-3'] },
      { command: 'python3', args: [] },
    ];
  }
  return [
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
  ];
}

/** Resolved from this module rather than the working directory, so the worker is
 *  found no matter where the server was launched from. */
function workerScriptPath(): string {
  const configured = process.env.EXTRACTOR_TRANSPORT_WORKER?.trim();
  if (configured) return configured;
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(serverDir, '..', 'backend', 'transport_worker.py');
}

function settleAllPending(reason: string): void {
  for (const [id, item] of pending.entries()) {
    clearTimeout(item.timer);
    item.resolve({
      workerAvailable: false,
      ok: false,
      fromCache: false,
      blocked: false,
      reason,
      attempts: UNAVAILABLE_ATTEMPTS,
    });
    pending.delete(id);
  }
}

function normaliseAttempts(raw: unknown): TransportAttempt[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const a = item as Record<string, unknown>;
    return {
      tier: String(a.tier ?? 'curl_cffi') as TransportTier,
      ok: Boolean(a.ok),
      status: typeof a.status === 'number' ? a.status : undefined,
      blocked: Boolean(a.blocked),
      challenge: typeof a.challenge === 'string' && a.challenge ? a.challenge : undefined,
      dynamicShell: Boolean(a.dynamic_shell),
      redirects: typeof a.redirects === 'number' ? a.redirects : undefined,
      timedOut: Boolean(a.timed_out),
      reason: typeof a.reason === 'string' && a.reason ? a.reason : undefined,
      elapsedMs: typeof a.elapsed_ms === 'number' ? a.elapsed_ms : undefined,
    };
  });
}

function attachChild(proc: ChildProcessWithoutNullStreams, onReady: (ok: boolean) => void): void {
  child = proc;
  const reader = readline.createInterface({ input: proc.stdout });
  const readyTimer = setTimeout(() => onReady(false), Number(process.env.EXTRACTOR_WORKER_READY_MS ?? 12000));

  reader.on('line', (line) => {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }

    if (message.event === 'ready') {
      const caps = (message.capabilities ?? {}) as Partial<WorkerCapabilities>;
      const capabilities: WorkerCapabilities = {
        curl_cffi: Boolean(caps.curl_cffi),
        patchright: Boolean(caps.patchright),
        camoufox: Boolean(caps.camoufox),
        sqlite_cache: Boolean(caps.sqlite_cache),
      };
      clearTimeout(readyTimer);
      const usable = capabilities.curl_cffi || capabilities.patchright || capabilities.camoufox;
      state = usable
        ? { kind: 'ready', capabilities }
        : { kind: 'unavailable', detail: 'The Python worker started but no transport library (curl_cffi, Patchright, Camoufox) is installed.' };
      onReady(usable);
      return;
    }

    const id = typeof message.id === 'string' ? message.id : '';
    if (!id) return;
    const item = pending.get(id);
    if (!item) return;
    pending.delete(id);
    clearTimeout(item.timer);
    item.resolve({
      workerAvailable: true,
      ok: Boolean(message.ok),
      url: typeof message.url === 'string' ? message.url : undefined,
      html: typeof message.html === 'string' ? message.html : undefined,
      tier: typeof message.tier === 'string' ? (message.tier as TransportTier) : undefined,
      status: typeof message.status === 'number' ? message.status : undefined,
      fromCache: Boolean(message.from_cache),
      blocked: Boolean(message.blocked),
      reason: typeof message.reason === 'string' ? message.reason : undefined,
      attempts: normaliseAttempts(message.attempts),
    });
  });

  proc.stderr.on('data', (buffer: Buffer) => {
    if (process.env.EXTRACTOR_TRANSPORT_DEBUG === '1') {
      process.stderr.write(`[transport] ${buffer.toString()}`);
    }
  });

  proc.once('exit', (code) => {
    clearTimeout(readyTimer);
    if (child === proc) child = null;
    if (state.kind === 'ready') {
      state = { kind: 'unavailable', detail: `The Python transport worker exited (code ${code ?? 'unknown'}).` };
    }
    settleAllPending('The Python transport worker exited before answering.');
  });

  proc.once('error', (error) => {
    clearTimeout(readyTimer);
    if (child === proc) child = null;
    state = { kind: 'unavailable', detail: `The Python transport worker could not start: ${error.message}` };
    onReady(false);
  });
}

async function tryCandidate(candidate: { command: string; args: string[] }): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawn(candidate.command, [...candidate.args, workerScriptPath()], {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch {
      done(false);
      return;
    }
    /*
     * The worker is a long-lived helper, not a reason for the host process to
     * stay alive. Left referenced, its pipes hold the event loop open and a
     * command-line run that has finished its work simply hangs. Unreferencing
     * lets the process exit when nothing else is pending, while the worker
     * keeps serving normally for as long as the process does live.
     */
    proc.unref();
    // Unreferencing the child is not enough on its own: its three stdio pipes
    // are themselves referenced handles and will hold the loop open. Node types
    // these as plain streams, but the pipe-backed instances do expose unref.
    for (const pipe of [proc.stdin, proc.stdout, proc.stderr]) {
      (pipe as unknown as { unref?: () => void }).unref?.();
    }
    attachChild(proc, done);
  });
}

export async function ensureWorker(): Promise<boolean> {
  const disabled = pythonDisabledReason();
  if (disabled) {
    state = { kind: 'disabled', detail: disabled };
    return false;
  }
  if (child && !child.killed && state.kind === 'ready') return true;
  if (startAttempt) return startAttempt;

  state = { kind: 'starting' };
  startAttempt = (async () => {
    for (const candidate of pythonCandidates()) {
      const ok = await tryCandidate(candidate);
      if (ok) return true;
      if (child && !child.killed) {
        child.kill();
        child = null;
      }
    }
    if (currentState().kind !== 'unavailable') {
      state = {
        kind: 'unavailable',
        detail: 'No Python interpreter with the layered transport dependencies could be started.',
      };
    }
    return false;
  })();

  try {
    return await startAttempt;
  } finally {
    startAttempt = null;
  }
}

export function workerState(): WorkerState {
  const disabled = pythonDisabledReason();
  if (disabled && state.kind === 'not_started') return { kind: 'disabled', detail: disabled };
  return state;
}

export async function fetchViaWorker(
  targetUrl: string,
  timeoutMs: number,
  proxy: string,
): Promise<WorkerFetchResult> {
  const ready = await ensureWorker();
  const currentState = workerState();
  if (!ready || !child || child.killed) {
    return {
      workerAvailable: false,
      ok: false,
      fromCache: false,
      blocked: false,
      reason:
        currentState.kind === 'disabled' || currentState.kind === 'unavailable'
          ? currentState.detail
          : 'The Python transport worker is not available.',
      attempts: UNAVAILABLE_ATTEMPTS,
    };
  }

  const id = `t_${Date.now()}_${(sequence += 1)}`;
  /*
   * The worker escalates through three tiers, so it needs more than a single
   * request's timeout -- but not more than the run has left.
   *
   * Allowing eight times the per-request timeout unconditionally meant one
   * browser escalation could run for over a minute inside a run budgeted for
   * thirty seconds, and the operator waited twice as long as the number they
   * chose. The run's remaining time is the ceiling; within it, the worker gets
   * as much room to escalate as it can use.
   */
  const left = remainingMs();
  const wanted = Math.min(45_000, Math.max(15_000, timeoutMs * 3));
  /*
   * The fallback needs somewhere to stand.
   *
   * Handing the worker every millisecond the run had left meant that when the
   * worker used all of it, the built-in HTTP fetch — which is often the tier
   * that succeeds on an ordinary server-rendered page — was declined for want
   * of time, and the page went unread. A few seconds are held back for it.
   */
  const reserve = 3_500;
  const budgetMs =
    left === null ? wanted : Math.max(1_500, Math.min(wanted, shareOfRemaining(left), left - reserve));

  return new Promise<WorkerFetchResult>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({
        workerAvailable: true,
        ok: false,
        fromCache: false,
        blocked: false,
        reason: `The layered transport did not answer within ${Math.round(budgetMs / 1000)} seconds.`,
        attempts: [{ tier: 'curl_cffi', ok: false, timedOut: true, reason: 'Worker response budget exhausted.' }],
      });
    }, budgetMs);

    pending.set(id, { resolve, timer });
    const payload = {
      id,
      op: 'fetch',
      url: targetUrl,
      timeout_ms: timeoutMs,
      // The worker stops a little before the timer above fires, so a run that
      // escalated too far still reports which tiers it tried.
      budget_ms: Math.max(1_200, budgetMs - 600),
      proxy,
      block_media: process.env.EXTRACTOR_BLOCK_MEDIA !== '0',
    };

    try {
      child!.stdin.write(`${JSON.stringify(payload)}\n`);
    } catch {
      pending.delete(id);
      clearTimeout(timer);
      resolve({
        workerAvailable: false,
        ok: false,
        fromCache: false,
        blocked: false,
        reason: 'The request could not be sent to the Python transport worker.',
        attempts: UNAVAILABLE_ATTEMPTS,
      });
    }
  });
}

export function shutdownWorker(): void {
  if (!child || child.killed) return;
  const proc = child;
  child = null;
  state = { kind: 'not_started' };
  try {
    proc.stdin.write(`${JSON.stringify({ op: 'shutdown' })}\n`);
    proc.stdin.end();
  } catch {
    /* the worker is already gone */
  }
  const killTimer = setTimeout(() => {
    if (!proc.killed) proc.kill('SIGKILL');
  }, 2000);
  killTimer.unref();
  proc.once('exit', () => clearTimeout(killTimer));
}

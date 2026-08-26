import type {
  ApiError,
  EngineDiagnostics,
  ExtractionResult,
  LearningSnapshot,
  QueryPlan,
  RouteStep,
} from '../types';

/**
 * Single place that knows how to reach the backend.
 *
 * VITE_API_BASE_URL lets the Vercel frontend talk to a separately hosted
 * persistent extraction service. When it is unset the app calls its own origin,
 * which is what happens both locally and on a Vercel deployment running the
 * bundled Node-only API.
 */

const CONFIGURED_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');

export function apiBaseUrl(): string {
  return CONFIGURED_BASE;
}

export function apiBaseLabel(): string {
  return CONFIGURED_BASE || 'this application origin';
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly detail?: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${CONFIGURED_BASE}/api${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch (error) {
    // A network-level failure is reported as exactly that, never as an empty result.
    throw new ApiRequestError(
      `Could not reach the extraction service at ${apiBaseLabel()}.`,
      0,
      (error as Error).message,
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiRequestError(
        'The extraction service returned a response that was not JSON.',
        response.status,
        text.slice(0, 200),
      );
    }
  }

  if (!response.ok) {
    const body = (payload ?? {}) as ApiError;
    throw new ApiRequestError(body.error ?? `Request failed with status ${response.status}.`, response.status, body.detail);
  }

  return payload as T;
}

export interface ExtractRequest {
  query: string;
  deepScan?: boolean;
  budgetMs?: number;
  peopleSearch?: boolean;
  useAssistant?: boolean;
  rowId?: string;
  preservedFields?: Record<string, string | number>;
  signal?: AbortSignal;
  /** Called for every route step as the run happens. */
  onStep?: (step: RouteStep) => void;
}

type StreamEvent =
  | { type: 'step'; step: RouteStep }
  | { type: 'result'; result: ExtractionResult }
  | { type: 'error'; error: string; detail?: string };

/**
 * Runs one extraction and forwards the live route as it arrives.
 *
 * The endpoint answers with newline-delimited JSON. Reading it incrementally is
 * what makes the route in the UI genuinely live rather than a replay printed
 * after the fact.
 */
export async function extract({ signal, onStep, ...body }: ExtractRequest): Promise<ExtractionResult> {
  let response: Response;
  try {
    response = await fetch(`${CONFIGURED_BASE}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiRequestError(
      `Could not reach the extraction service at ${apiBaseLabel()}.`,
      0,
      (error as Error).message,
    );
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    let detail = text.slice(0, 300);
    let message = `The extraction service returned status ${response.status}.`;
    try {
      const parsed = JSON.parse(text) as ApiError;
      if (parsed.error) message = parsed.error;
      if (parsed.detail) detail = parsed.detail;
    } catch {
      /* keep the raw text as the detail */
    }
    throw new ApiRequestError(message, response.status, detail);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: ExtractionResult | null = null;
  let failure: ApiRequestError | null = null;

  const consume = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: StreamEvent;
    try {
      event = JSON.parse(trimmed) as StreamEvent;
    } catch {
      return;
    }
    if (event.type === 'step') onStep?.(event.step);
    else if (event.type === 'result') result = event.result;
    else if (event.type === 'error') failure = new ApiRequestError(event.error, 500, event.detail);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      consume(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  consume(buffer);

  if (failure) throw failure;
  if (!result) {
    throw new ApiRequestError('The extraction service closed the connection before returning a result.', 0);
  }
  return result;
}

export function planQuery(query: string, signal?: AbortSignal): Promise<QueryPlan> {
  return request<QueryPlan>('/plan', { method: 'POST', body: JSON.stringify({ query }), signal });
}

export function diagnostics(signal?: AbortSignal): Promise<EngineDiagnostics> {
  return request<EngineDiagnostics>('/diagnostics', { signal });
}

export function learning(signal?: AbortSignal): Promise<LearningSnapshot> {
  return request<LearningSnapshot>('/learning', { signal });
}

export function resetLearning(): Promise<{ ok: boolean; learning: LearningSnapshot }> {
  return request<{ ok: boolean; learning: LearningSnapshot }>('/learning/reset', { method: 'POST' });
}

export function resetCounters(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/diagnostics/reset', { method: 'POST' });
}

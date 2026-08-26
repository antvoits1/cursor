import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The wall-clock deadline for the run currently executing.
 *
 * A time budget checked only between routes is not a budget: one route that
 * issues a dozen fetches can overrun it many times over, and the operator waits
 * far longer than the number they chose. The deadline therefore has to reach
 * the individual requests.
 *
 * Threading it through every source module's signature would touch every call
 * site and be easy to forget at a new one. Carrying it in async context instead
 * means a fetch started anywhere inside a run sees it automatically, and code
 * running outside a run simply sees no deadline and behaves as before.
 */
const store = new AsyncLocalStorage<{ deadline: number }>();

export function withRunDeadline<T>(deadline: number, run: () => Promise<T>): Promise<T> {
  return store.run({ deadline }, run);
}

/** Milliseconds left in the current run, or null when there is no deadline. */
export function remainingMs(): number | null {
  const context = store.getStore();
  if (!context) return null;
  return Math.max(0, context.deadline - Date.now());
}

export function pastDeadline(): boolean {
  const left = remainingMs();
  return left !== null && left <= 0;
}

/**
 * Caps a timeout at the time actually left in the run.
 *
 * Returns null when there is no time left, which callers treat as "do not start
 * this request at all" rather than as a zero-length timeout.
 */
export function boundedTimeout(requested: number): number | null {
  const left = remainingMs();
  if (left === null) return requested;
  // Below a second there is no point starting a network request; it would only
  // add latency to a run that is already over budget.
  if (left < 750) return null;
  return Math.min(requested, left);
}

import type { RouteStep, RouteStepKind, RouteStepStatus, TransportTier } from '../src/types.js';

export interface StepOptions {
  durationMs?: number;
  tier?: TransportTier;
  url?: string;
  sourceLabel?: string;
  detail?: Record<string, string | number | boolean>;
}

/**
 * Per-run route recorder.
 *
 * A trace belongs to exactly one extraction. Nothing is shared across runs,
 * which is what keeps concurrent single and bulk extractions from mixing their
 * evidence into each other.
 */
export class RouteTrace {
  private readonly steps: RouteStep[] = [];
  private readonly startedAt = Date.now();
  private seq = 0;

  /**
   * @param listener Called as each step is recorded so the API can stream the
   * route to the browser while the run is still in progress.
   */
  constructor(private readonly listener?: (step: RouteStep) => void) {}

  add(kind: RouteStepKind, status: RouteStepStatus, message: string, options: StepOptions = {}): RouteStep {
    const step: RouteStep = {
      seq: (this.seq += 1),
      kind,
      status,
      message,
      atMs: Date.now() - this.startedAt,
      ...options,
    };
    this.steps.push(step);
    // A misbehaving listener must not abort an extraction that is otherwise fine.
    if (this.listener) {
      try {
        this.listener(step);
      } catch {
        /* ignored on purpose */
      }
    }
    return step;
  }

  info(kind: RouteStepKind, message: string, options?: StepOptions): RouteStep {
    return this.add(kind, 'info', message, options);
  }

  success(kind: RouteStepKind, message: string, options?: StepOptions): RouteStep {
    return this.add(kind, 'success', message, options);
  }

  warn(kind: RouteStepKind, message: string, options?: StepOptions): RouteStep {
    return this.add(kind, 'warning', message, options);
  }

  error(kind: RouteStepKind, message: string, options?: StepOptions): RouteStep {
    return this.add(kind, 'error', message, options);
  }

  skip(kind: RouteStepKind, message: string, options?: StepOptions): RouteStep {
    return this.add(kind, 'skipped', message, options);
  }

  elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  snapshot(): RouteStep[] {
    return this.steps.map((s) => ({ ...s }));
  }

  count(): number {
    return this.steps.length;
  }
}

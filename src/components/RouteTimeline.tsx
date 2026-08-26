import { useEffect, useRef } from 'react';
import type { RouteStep, RouteStepKind, RouteStepStatus } from '../types';
import { EmptyState, Spinner } from './ui';

/**
 * The live extraction route.
 *
 * Steps stream in while the run is happening. Each line is written in plain
 * language by the engine; the technical detail sits behind the verbose toggle so
 * the default view stays readable.
 */

const STATUS_STYLE: Record<RouteStepStatus, { dot: string; text: string }> = {
  info: { dot: 'bg-line-strong', text: 'text-ink-soft' },
  success: { dot: 'bg-good', text: 'text-ink' },
  warning: { dot: 'bg-warn', text: 'text-ink' },
  error: { dot: 'bg-bad', text: 'text-ink' },
  skipped: { dot: 'bg-line', text: 'text-ink-faint' },
};

const KIND_LABEL: Record<RouteStepKind, string> = {
  input: 'Input',
  classification: 'Type',
  context: 'Context',
  plan: 'Plan',
  discovery: 'Discovery',
  cache: 'Cache',
  transport: 'Transport',
  retry: 'Retry',
  redirect: 'Redirect',
  timeout: 'Timeout',
  network_error: 'Network',
  http_block: 'Blocked',
  challenge: 'Challenge',
  js_shell: 'JS shell',
  escalation: 'Escalation',
  parse: 'Parse',
  accepted: 'Accepted',
  rejected: 'Rejected',
  merge: 'Merge',
  validation: 'Validation',
  agreement: 'Agreement',
  selection: 'Selected',
  learning: 'Learning',
  failure: 'Failure',
  timing: 'Timing',
  summary: 'Summary',
};

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

export function RouteTimeline({
  steps,
  running,
  verbose,
  compact = false,
}: {
  steps: RouteStep[];
  running: boolean;
  verbose: boolean;
  compact?: boolean;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const stepCount = steps.length;

  useEffect(() => {
    if (running && stepCount > 0) endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [running, stepCount]);

  if (steps.length === 0) {
    return (
      <EmptyState
        title={running ? 'Starting the run' : 'No route yet'}
        body={
          running
            ? 'The engine is planning the route. Steps appear here as they happen.'
            : 'Run an extraction and every step the engine takes will be narrated here, including the sources it could not read.'
        }
      />
    );
  }

  return (
    <div className={`${compact ? 'max-h-[340px] px-5 py-4' : 'max-h-[520px] px-7 py-5'} overflow-y-auto`}>
      <ol className="relative space-y-3 border-l border-line pl-6">
        {steps.map((step) => {
          const style = STATUS_STYLE[step.status];
          const details = verbose && step.detail ? Object.entries(step.detail) : [];
          return (
            <li key={step.seq} className="relative">
              <span
                className={`absolute top-2 -left-[26px] size-2.5 rounded-full ring-4 ring-panel ${style.dot}`}
                aria-hidden="true"
              />
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[11px] font-bold tracking-wider text-ink-faint uppercase">
                  {KIND_LABEL[step.kind]}
                </span>
                <span className="font-mono text-[11px] text-ink-faint tabular-nums">+{formatMs(step.atMs)}</span>
                {step.durationMs !== undefined && (
                  <span className="font-mono text-[11px] text-ink-faint tabular-nums">
                    took {formatMs(step.durationMs)}
                  </span>
                )}
                {step.tier && (
                  <span className="rounded border border-line bg-panel-sunken px-1.5 text-[11px] font-semibold text-ink-soft">
                    {step.tier}
                  </span>
                )}
              </div>
              <p className={`text-sm leading-relaxed ${style.text}`}>{step.message}</p>
              {step.url && (
                <a
                  href={step.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block truncate font-mono text-[11px] text-accent hover:underline"
                >
                  {step.url}
                </a>
              )}
              {details.length > 0 && (
                <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 rounded-md bg-panel-sunken px-2.5 py-1.5">
                  {details.map(([key, value]) => (
                    <div key={key} className="flex gap-1.5 font-mono text-[11px]">
                      <dt className="text-ink-faint">{key}</dt>
                      <dd className="text-ink-soft">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
      </ol>
      {running && (
        <p className="mt-4 flex items-center gap-2 pl-6 text-sm text-ink-faint">
          <Spinner className="size-3.5" />
          Working…
        </p>
      )}
      <div ref={endRef} />
    </div>
  );
}

import { RefreshCw } from 'lucide-react';
import { apiBaseLabel } from '../lib/api';
import type { EngineDiagnostics } from '../types';
import type { Tone } from './ui';

/**
 * Compact connection indicator in the header.
 *
 * It reports exactly what the API reported. "Online" appears only after the
 * backend has actually completed an extraction, so a reachable-but-unproven
 * service reads as "Starting", not as a green light.
 */

const DOT: Record<Tone, string> = {
  good: 'bg-good',
  warn: 'bg-warn',
  bad: 'bg-bad',
  accent: 'bg-accent',
  neutral: 'bg-ink-faint',
};

export function StatusRail({
  tone,
  diagnostics,
  error,
  onRefresh,
}: {
  tone: Tone;
  diagnostics: EngineDiagnostics | null;
  error: string | null;
  onRefresh: () => void;
}) {
  const label = error
    ? 'Unreachable'
    : diagnostics
      ? diagnostics.status.charAt(0).toUpperCase() + diagnostics.status.slice(1)
      : 'Checking';

  const detail = error
    ? `Could not reach ${apiBaseLabel()}.`
    : diagnostics
      ? diagnostics.statusDetail
      : 'Contacting the extraction service.';

  return (
    <div
      className="flex items-center gap-3 rounded-xl bg-canvas-deep/50 px-3 py-2"
      title={detail}
    >
      <span className="flex items-center gap-2">
        <span className={`size-2 rounded-full ${DOT[tone]}`} aria-hidden="true" />
        <span className="text-sm font-semibold text-ink-invert">{label}</span>
      </span>
      {diagnostics && (
        <span className="hidden text-xs text-panel/75 sm:inline">
          {diagnostics.transportMode === 'layered_python' ? 'Layered transport' : 'Node transport'}
        </span>
      )}
      <button
        type="button"
        onClick={onRefresh}
        aria-label="Refresh service status"
        className="rounded-md p-1 text-panel/80 transition-colors hover:bg-canvas/40 hover:text-ink-invert"
      >
        <RefreshCw className="size-3.5" strokeWidth={2.4} />
      </button>
    </div>
  );
}

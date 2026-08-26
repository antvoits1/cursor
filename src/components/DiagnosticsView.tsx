import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { Badge, Button, EmptyState, Panel, PanelHeader, StatTile, type Tone } from './ui';
import { apiBaseLabel } from '../lib/api';
import type { EngineDiagnostics } from '../types';

/**
 * Service diagnostics.
 *
 * Every value here comes from the API. Nothing is assumed: a tier that is not
 * installed says so, and the overall status stays "starting" until an
 * extraction has actually completed on the instance being talked to.
 */

const STATUS_TONE: Record<EngineDiagnostics['status'], Tone> = {
  online: 'good',
  degraded: 'warn',
  starting: 'neutral',
  offline: 'bad',
};

const TIER_PURPOSE: Record<string, string> = {
  cache: 'Serves a page that was already fetched instead of hitting the network again.',
  curl_cffi: 'Fast static fetch with a real browser TLS fingerprint.',
  patchright: 'Headless Chromium for pages that only assemble their content in JavaScript.',
  camoufox: 'Hardened Firefox for sources that reject ordinary headless browsers.',
  node_http: 'Node’s own HTTP client. Always present, and the only tier available on serverless hosts.',
};

export function DiagnosticsView({
  diagnostics,
  error,
  onRefresh,
}: {
  diagnostics: EngineDiagnostics | null;
  error: string | null;
  onRefresh: () => void;
}) {
  if (error || !diagnostics) {
    return (
      <Panel>
        <PanelHeader
          title="Diagnostics"
          description={`Reading from ${apiBaseLabel()}.`}
          actions={
            <Button size="sm" onClick={onRefresh}>
              <RefreshCw className="size-3.5" strokeWidth={2.4} />
              Refresh
            </Button>
          }
        />
        <EmptyState
          title={error ? 'The extraction service could not be reached' : 'Contacting the extraction service'}
          body={
            error ??
            'Waiting for the first response. Nothing is reported as working until the service actually answers.'
          }
          icon={error ? <XCircle className="size-7 text-bad" strokeWidth={1.8} /> : undefined}
        />
      </Panel>
    );
  }

  const successRate =
    diagnostics.totalExtractions > 0
      ? Math.round((diagnostics.successfulExtractions / diagnostics.totalExtractions) * 100)
      : 0;

  return (
    <div className="space-y-7">
      <Panel>
        <PanelHeader
          title="Service"
          description={diagnostics.statusDetail}
          actions={
            <>
              <Badge tone={STATUS_TONE[diagnostics.status]}>{diagnostics.status}</Badge>
              <Button size="sm" onClick={onRefresh}>
                <RefreshCw className="size-3.5" strokeWidth={2.4} />
                Refresh
              </Button>
            </>
          }
        />
        <div className="grid gap-3 px-7 py-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Extractions" value={diagnostics.totalExtractions} />
          <StatTile
            label="Success rate"
            value={`${successRate}%`}
            tone={successRate >= 60 ? 'good' : successRate > 0 ? 'warn' : 'neutral'}
          />
          <StatTile label="Failed" value={diagnostics.failedExtractions} tone={diagnostics.failedExtractions ? 'warn' : 'neutral'} />
          <StatTile label="Uptime" value={`${Math.floor(diagnostics.uptimeSeconds / 60)} min`} />
        </div>
        <dl className="grid gap-x-8 gap-y-2 border-t border-line px-7 py-5 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-faint">Build</dt>
            <dd className="font-medium text-ink">
              {diagnostics.build} v{diagnostics.version}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-faint">Host</dt>
            <dd className="font-medium text-ink">
              {diagnostics.host === 'vercel_function' ? 'Vercel serverless function' : 'Persistent Node server'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-faint">Transport mode</dt>
            <dd className="font-medium text-ink">
              {diagnostics.transportMode === 'layered_python' ? 'Layered Python transport' : 'Node HTTP only'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-faint">API endpoint</dt>
            <dd className="truncate font-medium text-ink">{apiBaseLabel()}</dd>
          </div>
        </dl>
      </Panel>

      <Panel>
        <PanelHeader
          title="Transport tiers"
          description="The escalation ladder, in order. A tier that is not installed on this host is reported as unavailable rather than silently skipped."
        />
        <ul className="divide-y divide-line">
          {diagnostics.tiers.map((tier) => (
            <li key={tier.tier} className="flex items-start gap-4 px-7 py-4">
              {tier.available ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-good" strokeWidth={2.1} />
              ) : (
                <XCircle className="mt-0.5 size-5 shrink-0 text-ink-faint" strokeWidth={2.1} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-mono text-sm font-semibold text-ink">{tier.tier}</span>
                  <Badge tone={tier.available ? 'good' : 'neutral'}>
                    {tier.available ? 'available' : 'unavailable'}
                  </Badge>
                </div>
                <p className="text-sm text-ink-soft">{tier.detail}</p>
                <p className="text-xs text-ink-faint">{TIER_PURPOSE[tier.tier]}</p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <PanelHeader title="Page cache" description={diagnostics.cache.detail} />
        <div className="grid gap-3 px-7 py-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Kind" value={diagnostics.cache.kind === 'sqlite_transport' ? 'SQLite' : 'In process'} />
          <StatTile label="Entries" value={diagnostics.cache.entries ?? 0} />
          <StatTile label="Hits" value={diagnostics.cache.hits} tone={diagnostics.cache.hits ? 'good' : 'neutral'} />
          <StatTile label="Misses" value={diagnostics.cache.misses} />
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Recent runs"
          description="The last runs handled by this instance, with the tiers each one actually used."
        />
        {diagnostics.recentRuns.length === 0 ? (
          <EmptyState title="No runs on this instance yet" body="Run an extraction and it will be listed here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-panel-sunken">
                <tr className="text-xs tracking-wide text-ink-faint uppercase">
                  <th className="px-7 py-2.5 font-semibold">Query</th>
                  <th className="px-3 py-2.5 font-semibold">Type</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Tiers used</th>
                  <th className="px-7 py-2.5 text-right font-semibold">Time</th>
                </tr>
              </thead>
              <tbody>
                {diagnostics.recentRuns.map((run) => (
                  <tr key={run.id} className="border-t border-line">
                    <td className="max-w-[22rem] truncate px-7 py-2.5 text-ink">{run.query}</td>
                    <td className="px-3 py-2.5 text-ink-soft">{run.queryType.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={run.status === 'success' ? 'good' : run.status === 'partial' ? 'warn' : 'bad'}>
                        {run.status} · {run.confidence}%
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-ink-soft">
                      {run.tiersUsed.join(', ') || '—'}
                      {run.blocked && <span className="ml-2 text-warn">blocked</span>}
                    </td>
                    <td className="px-7 py-2.5 text-right font-mono text-xs text-ink-soft tabular-nums">
                      {(run.durationMs / 1000).toFixed(1)}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

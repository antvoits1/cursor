import { useState } from 'react';
import { RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge, Button, EmptyState, Field, Panel, PanelHeader, Select, Toggle } from './ui';
import * as api from '../lib/api';
import { SavedSources } from './SavedSources';
import {
  BUDGET_CHOICES,
  CONCURRENCY_CHOICES,
  persistenceAvailable,
  type Settings,
} from '../lib/storage';
import type { EngineDiagnostics } from '../types';

/**
 * Settings.
 *
 * Everything on this screen changes real behaviour on the next run: the first
 * group is sent to the engine with every request, and the second group manages
 * the locally learned route intelligence held by the service.
 */

export function SettingsView({
  settings,
  onChange,
  onReset,
  diagnostics,
  onRefreshDiagnostics,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  onReset: () => void;
  diagnostics: EngineDiagnostics | null;
  onRefreshDiagnostics: () => void;
}) {
  const [busy, setBusy] = useState<'learning' | 'counters' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const learning = diagnostics?.learning;

  const runAction = async (kind: 'learning' | 'counters') => {
    setBusy(kind);
    setNotice(null);
    try {
      if (kind === 'learning') {
        await api.resetLearning();
        setNotice('Learned route intelligence was cleared. Route order returns to the built-in defaults.');
      } else {
        await api.resetCounters();
        setNotice('Run counters were reset.');
      }
      onRefreshDiagnostics();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-7">
      <Panel>
        <PanelHeader
          title="Extraction"
          description="Applied to every single run and to every row of a bulk run."
          actions={
            <Button size="sm" onClick={onReset}>
              <RotateCcw className="size-3.5" strokeWidth={2.4} />
              Restore defaults
            </Button>
          }
        />
        <div className="grid gap-7 px-7 py-6 md:grid-cols-2">
          <Toggle
            checked={settings.deepScan}
            onChange={(deepScan) => onChange({ ...settings, deepScan })}
            label="Deep scan"
            help="Works through the whole route plan and cross-checks sources against each other. Turning it off stops at the first source that answers, which is faster and finds less."
          />
          <Toggle
            checked={settings.verboseRoute}
            onChange={(verboseRoute) => onChange({ ...settings, verboseRoute })}
            label="Show technical detail in the route"
            help="Expands each route step with the underlying status codes, tiers and counts."
          />
          <Toggle
            checked={settings.peopleSearch}
            onChange={(peopleSearch) => onChange({ ...settings, peopleSearch })}
            label="Consult people-search sources"
            help="Pulls every number a person has with the source's own wireless or landline label, plus their emails, current and previous addresses, and relatives. These sites prohibit automated access in their terms and refuse datacenter addresses, so from a cloud host most runs will report a block rather than a record."
          />
          <Toggle
            checked={settings.useAssistant}
            onChange={(useAssistant) => onChange({ ...settings, useAssistant })}
            label="Use the assistant for open-ended input"
            help="Lets a language model work out what a bare query like “milk” is asking for and read contacts off pages the pattern rules struggle with. It is never asked for a fact: every value it returns is checked back against the fetched page and dropped if it is not there. Needs a Google AI Studio or Grok key on the server; without one this has no effect."
          />
          <Field
            label="Time budget per run"
            htmlFor="setting-budget"
            help="A hard wall-clock limit. The run returns whatever it has proven when the budget is reached rather than hanging."
          >
            <Select
              id="setting-budget"
              value={settings.runBudgetMs}
              onChange={(event) => onChange({ ...settings, runBudgetMs: Number(event.target.value) })}
            >
              {BUDGET_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {choice / 1000} seconds
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Bulk rows in parallel"
            htmlFor="setting-concurrency"
            help="Higher values finish a sheet sooner but make blocks from rate-limited sources more likely."
          >
            <Select
              id="setting-concurrency"
              value={settings.bulkConcurrency}
              onChange={(event) => onChange({ ...settings, bulkConcurrency: Number(event.target.value) })}
            >
              {CONCURRENCY_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {choice} {choice === 1 ? 'row' : 'rows'} at a time
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Panel>

      <SavedSources />

      <Panel>
        <PanelHeader title="This browser" description="Nothing here is sent to the service." />
        <div className="px-7 py-6">
          <Toggle
            checked={settings.saveHistory}
            onChange={(saveHistory) => onChange({ ...settings, saveHistory })}
            disabled={!persistenceAvailable}
            label="Keep a history of completed runs"
            help={
              persistenceAvailable
                ? 'Stores the full result of each run in this browser so it can be reopened or rerun later.'
                : 'This browser blocks local storage, so history cannot be kept between reloads.'
            }
          />
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Learned route intelligence"
          description="The service records which routes and domains actually produce data and reorders future runs accordingly. It is local, inspectable and reversible."
          actions={
            <>
              <Button size="sm" onClick={() => void runAction('counters')} disabled={busy !== null}>
                Reset counters
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => void runAction('learning')}
                disabled={busy !== null}
              >
                <Trash2 className="size-3.5" strokeWidth={2.4} />
                Clear learning
              </Button>
            </>
          }
        />
        {notice && <p className="border-b border-line bg-accent-soft px-7 py-3 text-sm text-accent-strong">{notice}</p>}
        {!learning || learning.routes.length === 0 ? (
          <EmptyState
            title="Nothing learned yet"
            body="After a few runs the service starts recording which routes produce data for which kinds of query, and puts the productive ones first."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-panel-sunken">
                <tr className="text-xs tracking-wide text-ink-faint uppercase">
                  <th className="px-7 py-2.5 font-semibold">Query type</th>
                  <th className="px-3 py-2.5 font-semibold">Route</th>
                  <th className="px-3 py-2.5 font-semibold">Attempts</th>
                  <th className="px-3 py-2.5 font-semibold">Success rate</th>
                  <th className="px-3 py-2.5 font-semibold">Avg fields</th>
                  <th className="px-7 py-2.5 text-right font-semibold">Avg time</th>
                </tr>
              </thead>
              <tbody>
                {learning.routes.map((route) => (
                  <tr key={route.key} className="border-t border-line">
                    <td className="px-7 py-2.5 text-ink-soft">{route.queryType.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2.5 font-medium text-ink">{route.routeId}</td>
                    <td className="px-3 py-2.5 text-ink-soft tabular-nums">{route.attempts}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={route.successRate >= 0.5 ? 'good' : route.successRate > 0 ? 'warn' : 'neutral'}>
                        {Math.round(route.successRate * 100)}%
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft tabular-nums">{route.avgFieldYield.toFixed(1)}</td>
                    <td className="px-7 py-2.5 text-right font-mono text-xs text-ink-soft tabular-nums">
                      {(route.avgLatencyMs / 1000).toFixed(1)}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {learning && (
          <p className="border-t border-line px-7 py-4 text-sm text-ink-faint">
            {learning.enabled
              ? `${learning.totalRuns} runs recorded across ${learning.routes.length} route entries and ${learning.domains.length} domain entries.`
              : 'Learning is disabled on this host, so route order uses the built-in defaults only.'}
          </p>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Protected data" description="Not configurable, and stated here so the behaviour is visible." />
        <p className="flex items-start gap-3 px-7 py-6 text-sm text-ink-soft">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-good" strokeWidth={2.1} />
          <span>
            Columns holding a Social Security number — recognised by heading or by content — are dropped when a
            spreadsheet is parsed, in this browser, before any request is made. They cannot reach search,
            matching, evidence, scoring, confidence, route planning, cache keys, logs, diagnostics, learning or
            export. Free-text queries are scanned for the same patterns and redacted before the engine sees them.
          </span>
        </p>
      </Panel>
    </div>
  );
}

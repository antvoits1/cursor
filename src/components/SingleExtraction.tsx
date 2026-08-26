import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, RotateCcw, Search, Square } from 'lucide-react';
import { EvidencePanel } from './EvidencePanel';
import { ResultPanel } from './ResultPanel';
import { RouteTimeline } from './RouteTimeline';
import { Badge, Button, EmptyState, Field, Panel, PanelHeader, Spinner, StatTile, TextInput } from './ui';
import * as api from '../lib/api';
import { exportSingleResult } from '../lib/exporters';
import type { Settings } from '../lib/storage';
import type { ExtractionResult, QueryPlan, RouteStep } from '../types';

/**
 * Single extraction workspace.
 *
 * The screen is ordered the way the work actually happens: what you are asking
 * for, the context you can add, the action, the route as it runs, the result,
 * the evidence behind it, and finally the technical detail.
 */

const SAMPLES = [
  'Blue Bottle Coffee, Oakland CA',
  'stripe.com',
  'Patagonia Ventura California',
  'https://www.basecamp.com',
];

const QUERY_TYPE_LABEL: Record<QueryPlan['queryType'], string> = {
  domain_direct: 'Domain lookup',
  url_direct: 'Direct URL',
  facebook_page: 'Facebook page',
  phone_first: 'Reverse phone',
  email_first: 'Reverse email',
  person_and_company: 'Person at a company',
  owner_first: 'Person lookup',
  location_constrained: 'Business in a location',
  address_first: 'Address lookup',
  natural_language_prompt: 'Described request',
  company_search: 'Company search',
};

interface Advanced {
  location: string;
  website: string;
  contact: string;
}

const EMPTY_ADVANCED: Advanced = { location: '', website: '', contact: '' };

/** Advanced fields are appended to the query only when they add something new. */
function composeQuery(query: string, advanced: Advanced): string {
  const base = query.trim();
  const extras: string[] = [];
  const lowered = base.toLowerCase();
  for (const value of [advanced.contact, advanced.website, advanced.location]) {
    const trimmed = value.trim();
    if (trimmed && !lowered.includes(trimmed.toLowerCase())) extras.push(trimmed);
  }
  return extras.length > 0 ? `${base}, ${extras.join(', ')}` : base;
}

export function SingleExtraction({
  settings,
  pendingQuery,
  onPendingQueryConsumed,
  onResult,
}: {
  settings: Settings;
  pendingQuery: string | null;
  onPendingQueryConsumed: () => void;
  onResult: (result: ExtractionResult) => void;
}) {
  const [query, setQuery] = useState('');
  const [advanced, setAdvanced] = useState<Advanced>(EMPTY_ADVANCED);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [plan, setPlan] = useState<QueryPlan | null>(null);
  const [steps, setSteps] = useState<RouteStep[]>([]);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [verbose, setVerbose] = useState(settings.verboseRoute);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setVerbose(settings.verboseRoute), [settings.verboseRoute]);

  const composed = useMemo(() => composeQuery(query, advanced), [query, advanced]);

  // Shows how the engine reads the query before a run is spent on it.
  useEffect(() => {
    const text = composed.trim();
    if (text.length < 3) {
      setPlan(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api
        .planQuery(text, controller.signal)
        .then(setPlan)
        .catch(() => setPlan(null));
    }, 450);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [composed]);

  const run = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || running) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setRunning(true);
      setSteps([]);
      setResult(null);
      setError(null);

      try {
        const extraction = await api.extract({
          query: trimmed,
          deepScan: settings.deepScan,
          budgetMs: settings.runBudgetMs,
          peopleSearch: settings.peopleSearch,
          useAssistant: settings.useAssistant,
          signal: controller.signal,
          onStep: (step) => setSteps((current) => [...current, step]),
        });
        setResult(extraction);
        setSteps(extraction.route);
        onResult(extraction);
      } catch (caught) {
        if ((caught as Error).name === 'AbortError') {
          setError({ message: 'The run was stopped before it finished.' });
        } else {
          const apiError = caught as api.ApiRequestError;
          setError({ message: apiError.message, detail: apiError.detail });
        }
      } finally {
        setRunning(false);
        abortRef.current = null;
      }
    },
    [onResult, running, settings.deepScan, settings.runBudgetMs],
  );

  // A query handed over from History lands in the field and runs immediately.
  // The latest `run` is read from a ref so the handoff fires once, not again
  // every time an unrelated setting changes the callback identity.
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (!pendingQuery) return;
    setQuery(pendingQuery);
    setAdvanced(EMPTY_ADVANCED);
    onPendingQueryConsumed();
    inputRef.current?.focus();
    void runRef.current(pendingQuery);
  }, [pendingQuery, onPendingQueryConsumed]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const stop = () => abortRef.current?.abort();

  const reset = () => {
    abortRef.current?.abort();
    setQuery('');
    setAdvanced(EMPTY_ADVANCED);
    setSteps([]);
    setResult(null);
    setError(null);
    setPlan(null);
    inputRef.current?.focus();
  };

  const advancedCount = Object.values(advanced).filter((value) => value.trim()).length;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(390px,0.9fr)_minmax(0,1.45fr)]">
      <div className="space-y-4 xl:sticky xl:top-[76px] xl:max-h-[calc(100vh-92px)] xl:overflow-y-auto xl:pr-1">
      <Panel>
        <PanelHeader
          step={1}
          title="What do you want to find?"
          description="A business name, a person, a phone number, an email address, a domain, a full URL, or a plain-language request."
        />
        <div className="space-y-4 px-5 py-4">
          <Field
            label="Search"
            htmlFor="extractor-query"
            help="Press Enter to run. Adding a city or state to a business name resolves the right entity far more often."
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <TextInput
                id="extractor-query"
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void run(composed);
                  }
                }}
                placeholder="Blue Bottle Coffee, Oakland CA"
                autoComplete="off"
                spellCheck={false}
                disabled={running}
                aria-describedby="extractor-query-plan"
              />
              <div className="flex shrink-0 gap-2">
                {running ? (
                  <Button variant="danger" onClick={stop}>
                    <Square className="size-4" strokeWidth={2.4} />
                    Stop
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => void run(composed)} disabled={!composed.trim()}>
                    <Search className="size-4" strokeWidth={2.4} />
                    Extract
                  </Button>
                )}
                <Button variant="ghost" onClick={reset} aria-label="Clear the form">
                  <RotateCcw className="size-4" strokeWidth={2.2} />
                </Button>
              </div>
            </div>
          </Field>

          <p id="extractor-query-plan" className="min-h-5 text-sm text-ink-faint">
            {plan ? (
              <>
                Read as a <strong className="font-semibold text-ink-soft">{QUERY_TYPE_LABEL[plan.queryType].toLowerCase()}</strong>
                {' · '}
                {plan.routes.filter((route) => route.enabled).length} routes planned
                {plan.notes.length > 0 && ` · ${plan.notes[0]}`}
              </>
            ) : (
              'The route plan appears here as you type.'
            )}
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-ink-faint">Try:</span>
            {SAMPLES.map((sample) => (
              <button
                key={sample}
                type="button"
                disabled={running}
                onClick={() => {
                  setQuery(sample);
                  setAdvanced(EMPTY_ADVANCED);
                }}
                className="rounded-full border border-line bg-panel-raised px-3 py-1 text-[13px] text-ink-soft transition-colors hover:border-line-strong hover:bg-panel-sunken disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sample}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-line">
          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
            className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left transition-colors hover:bg-panel-sunken"
          >
            <span className="flex items-center gap-2.5">
              <span className="grid size-6 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-strong">
                2
              </span>
              <span className="text-[15px] font-semibold text-ink">Optional context</span>
              {advancedCount > 0 && <Badge tone="accent">{advancedCount} added</Badge>}
            </span>
            <ChevronDown
              className={`size-4 text-ink-faint transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
              strokeWidth={2.2}
            />
          </button>
          {advancedOpen && (
            <div className="grid gap-4 border-t border-line px-5 py-4">
              <Field label="Location" htmlFor="advanced-location" help="City, state or ZIP.">
                <TextInput
                  id="advanced-location"
                  value={advanced.location}
                  onChange={(event) => setAdvanced({ ...advanced, location: event.target.value })}
                  placeholder="Oakland, CA"
                  disabled={running}
                />
              </Field>
              <Field label="Known website" htmlFor="advanced-website" help="Skips the discovery step entirely.">
                <TextInput
                  id="advanced-website"
                  value={advanced.website}
                  onChange={(event) => setAdvanced({ ...advanced, website: event.target.value })}
                  placeholder="bluebottlecoffee.com"
                  disabled={running}
                />
              </Field>
              <Field label="Contact name" htmlFor="advanced-contact" help="Narrows the match to one person.">
                <TextInput
                  id="advanced-contact"
                  value={advanced.contact}
                  onChange={(event) => setAdvanced({ ...advanced, contact: event.target.value })}
                  placeholder="Jane Doe"
                  disabled={running}
                />
              </Field>
              {composed !== query.trim() && (
                <p className="field-help">
                  The engine will search for: <span className="font-mono text-ink-soft">{composed}</span>
                </p>
              )}
            </div>
          )}
        </div>
      </Panel>

      {error && (
        <Panel className="border-bad/30">
            <div className="px-5 py-4">
            <p className="font-semibold text-bad">{error.message}</p>
            {error.detail && <p className="mt-1 font-mono text-sm text-ink-soft">{error.detail}</p>}
          </div>
        </Panel>
      )}

      <Panel>
        <PanelHeader
          step={3}
          title="Live route"
          description="Every step the engine takes, including the sources that refused it."
          actions={
            <>
              {running && (
                <span className="flex items-center gap-2 text-sm text-ink-faint">
                  <Spinner className="size-3.5" />
                  {steps.length} steps
                </span>
              )}
              <Button size="sm" variant="ghost" onClick={() => setVerbose((value) => !value)}>
                {verbose ? 'Hide technical detail' : 'Show technical detail'}
              </Button>
            </>
          }
        />
        <RouteTimeline steps={steps} running={running} verbose={verbose} compact />
      </Panel>
      </div>

      <div className="space-y-4 xl:max-h-[calc(100vh-92px)] xl:overflow-y-auto xl:pr-1">
      {result ? (
        <>
          <Panel>
            <PanelHeader
              step={4}
              title="Result"
              description={`${result.consultedSources.length} sources consulted in ${(result.durationMs / 1000).toFixed(1)} seconds.`}
              actions={
                <>
                  <Button size="sm" onClick={() => exportSingleResult(result, 'csv')}>
                    <Download className="size-3.5" strokeWidth={2.4} />
                    CSV
                  </Button>
                  <Button size="sm" onClick={() => exportSingleResult(result, 'xlsx')}>
                    <Download className="size-3.5" strokeWidth={2.4} />
                    XLSX
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void run(result.query)}>
                    <RotateCcw className="size-3.5" strokeWidth={2.4} />
                    Run again
                  </Button>
                </>
              }
            />
            <ResultPanel result={result} />
          </Panel>

          <Panel>
            <PanelHeader step={5} title="Evidence" description="Where every accepted value came from, and what was refused." />
            <EvidencePanel result={result} />
          </Panel>

          <Panel>
            <PanelHeader step={6} title="Run diagnostics" description="Timing, transport and the route plan the engine chose." />
            <div className="space-y-6 px-7 py-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Total time" value={`${(result.durationMs / 1000).toFixed(2)} s`} />
                <StatTile label="Route steps" value={result.route.length} />
                <StatTile
                  label="Sources blocked"
                  value={result.consultedSources.filter((source) => source.blocked).length}
                  tone={result.consultedSources.some((source) => source.blocked) ? 'warn' : 'neutral'}
                />
                <StatTile label="Values refused" value={result.rejected.length} />
              </div>

              <div>
                <h3 className="section-title mb-2.5">Transport</h3>
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel-raised px-4 py-3 text-sm">
                  <Badge tone={result.transportMode === 'layered_python' ? 'good' : 'neutral'}>
                    {result.transportMode === 'layered_python' ? 'Layered Python transport' : 'Node HTTP only'}
                  </Badge>
                  {result.availableTiers.map((tier) => (
                    <Badge key={tier} tone="neutral">
                      {tier}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="section-title mb-2.5">Route plan ({result.plan.routes.length})</h3>
                <ol className="space-y-2">
                  {result.plan.routes.map((route) => (
                    <li
                      key={route.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-line bg-panel-raised px-4 py-2.5 text-sm"
                    >
                      <span className="flex items-baseline gap-2.5">
                        <span className="font-mono text-xs text-ink-faint tabular-nums">{route.order}</span>
                        <span className="font-medium text-ink">{route.label}</span>
                        <span className="text-ink-faint">{route.purpose}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {route.learnedSuccessRate !== undefined && (
                          <Badge tone="neutral">
                            learned {Math.round(route.learnedSuccessRate * 100)}% over {route.learnedSampleSize} runs
                          </Badge>
                        )}
                        <Badge tone={route.enabled ? 'accent' : 'neutral'}>
                          {route.enabled ? 'planned' : (route.skipReason ?? 'skipped')}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </Panel>
        </>
      ) : (
        !running && (
          <Panel>
            <EmptyState
              title="No result yet"
              body="Run an extraction and the structured result, the evidence behind every value, and the full run diagnostics appear here."
              icon={<Search className="size-7" strokeWidth={1.8} />}
            />
          </Panel>
        )
      )}
      </div>
    </div>
  );
}
